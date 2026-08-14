window.__ModuleLoader__.load({
  id: "dsh-delete-session",
  factory: () => {
    "use strict";

    // =====================================================================
    // dsh-delete-session（瀏覽器端）
    //
    // 在「會話行 … 選單」的「歸檔會話」下方注入「刪除會話」項目。
    //
    // 背景：核心 UI 的會話行選單內容是硬編碼陣列，且原語模組命名空間
    // （@deepseek-ai/dsh-client-ui-primitives）是 shell 提供的凍結 seed
    // 模組，外掛無法在執行期替換 Menu 元件，也沒有對應的 slot 可注入。
    // 因此本外掛改採 DOM 層注入：
    //
    //   1. 在 document 捕獲階段監聽 click，記錄使用者最近一次點開的
    //      會話行「…」按鈕（以 aria-label 前綴辨識，zh/en 兩語系）。
    //   2. 以 MutationObserver 監聽 document.body 新增的 role="menu"
    //      彈層；若其含有「歸檔會話 / Archive session」項目，即判定為
    //      會話行選單。
    //   3. 依 DOM 結構（button → span(root) → span(rowActions) →
    //      前一兄弟為時間 span → 再前一兄弟為標題 span）讀取該行實際
    //      渲染出來的標題與相對時間文字。
    //   4. 以 displayTitle + 相對時間（與核心相同的分桶演算法）做雙
    //      條件匹配；命中數量「恰為 1」才注入，否則不注入。
    //   5. 點擊「刪除會話」→ 關閉選單 → 二次確認彈窗 → POST 給 host
    //      端的刪除路由；成功後刷新 sessions 與 workspaces 清單。
    // =====================================================================

    const DELETE_ITEM_ATTR = "data-dsh-delete-session-item";
    const ROUTE = "/delete-session/delete";
    const ANCHOR_FRESH_MS = 2000;

    // ---------- 多語文案 ----------
    const STRINGS = {
      zh: {
        menuArchiveSession: "归档会话",
        menuDeleteSession: "删除会话",
        modalTitle: "删除会话",
        modalDescription: (title) => "确定要删除会话「" + title + "」吗？其会话记录（含对话日志）将被永久删除，且无法恢复。共享附件不会被删除。",
        cancel: "取消",
        confirm: "删除",
        deleting: "正在删除…",
        liveSession: "无法删除正在使用中的会话（例如当前会话或正在运行任务的会话）",
        notFound: "会话不存在或已被删除",
        genericError: "删除失败，请稍后重试",
        networkError: "网络请求失败，请稍后重试"
      },
      en: {
        menuArchiveSession: "Archive session",
        menuDeleteSession: "Delete session",
        modalTitle: "Delete session",
        modalDescription: (title) => 'Delete session "' + title + '"? Its session record (including the conversation log) will be permanently deleted and cannot be restored. Shared attachments are not deleted.',
        cancel: "Cancel",
        confirm: "Delete",
        deleting: "Deleting…",
        liveSession: "Cannot delete a session that is currently in use (for example the current session or one that is running tasks)",
        notFound: "The session does not exist or has already been deleted",
        genericError: "Deletion failed, please try again later",
        networkError: "Network request failed, please try again later"
      }
    };

    // ---------- 相對時間演算法（與核心 dsh-client-ui-workspace 的 relativeTime 完全一致） ----------
    const MIN = 60000;
    const HOUR = 3600000;
    const DAY = 86400000;

    function relativeTimeBucket(updatedAt, now) {
      const diff = Math.max(0, now - updatedAt);
      if (diff < MIN) return { unit: "now", n: 0 };
      if (diff < HOUR) return { unit: "minutes", n: Math.floor(diff / MIN) };
      if (diff < DAY) return { unit: "hours", n: Math.floor(diff / HOUR) };
      if (diff < 30 * DAY) return { unit: "days", n: Math.floor(diff / DAY) };
      if (diff < 365 * DAY) return { unit: "months", n: Math.floor(diff / (30 * DAY)) };
      return { unit: "years", n: Math.floor(diff / (365 * DAY)) };
    }

    // 依語系格式化時間標籤；模板與核心詞典（zh/en）一致。
    const TIME_TEMPLATES = {
      zh: { now: "刚刚", minutes: "{n}分钟", hours: "{n}小时", days: "{n}天", months: "{n}个月", years: "{n}年" },
      en: { now: "now", minutes: "{n}min", hours: "{n}h", days: "{n}d", months: "{n}mo", years: "{n}y" }
    };

    function formatTimeLabel(bucket, locale) {
      const templates = TIME_TEMPLATES[locale];
      if (!templates) return null;
      const template = templates[bucket.unit];
      if (template === undefined) return null;
      return template.replace("{n}", String(bucket.n));
    }

    // ---------- 會話行「…」按鈕辨識 ----------
    // 核心的 aria-label 模板：zh「会话“{name}”的操作」、en「Session actions for {name}」。
    const SESSION_ARIA_PREFIXES = ["会话“", "Session actions for "];

    function isElement(node) {
      return node !== null && typeof node === "object" && node.nodeType === 1;
    }

    function isSessionAnchorButton(node) {
      if (!isElement(node) || node.tagName !== "BUTTON") return false;
      const label = node.getAttribute("aria-label") || "";
      for (const prefix of SESSION_ARIA_PREFIXES) {
        if (label.startsWith(prefix)) return true;
      }
      return false;
    }

    // ---------- 執行期狀態 ----------
    let activeCtx = null;        // apply() 時設定的 client 根 context
    let lastAnchorButton = null; // 最近一次點開的會話行「…」按鈕
    let lastAnchorAt = 0;

    // ---------- 行 DOM 讀取 ----------
    // 結構：button → span(root，Menu 根) → span(rowActions) → 前一兄弟為時間 span → 再前一兄弟為標題 span。
    function readRowTexts(button) {
      const rowActions = button.parentElement ? button.parentElement.parentElement : null;
      if (!rowActions) return null;
      const timeSpan = rowActions.previousElementSibling;
      const titleSpan = timeSpan ? timeSpan.previousElementSibling : null;
      if (!timeSpan || !titleSpan) return null;
      return {
        title: titleSpan.textContent || "",
        time: (timeSpan.textContent || "").trim()
      };
    }

    // ---------- 雙條件唯一匹配 ----------
    function findUniqueSession(list, title, timeText, locale, archivedIds) {
      if (!list || !Array.isArray(list.ids) || !list.byId) return null;
      const archived = archivedIds ? new Set(archivedIds) : null;
      const now = Date.now();
      const matches = [];
      for (const id of list.ids) {
        const summary = list.byId[id];
        if (!summary) continue;
        if (summary.blank === true || summary.origin === "subagent") continue;
        if (archived !== null && archived.has(id)) continue;
        if (!Number.isFinite(summary.updatedAt)) continue;
        if (summary.displayTitle !== title) continue;
        const label = formatTimeLabel(relativeTimeBucket(summary.updatedAt, now), locale);
        if (label === null || label !== timeText) continue;
        matches.push(summary);
      }
      return matches.length === 1 ? matches[0] : null;
    }

    // ---------- 錨點按鈕定位 ----------
    // 優先使用最近一次點開的按鈕；若不可用，則以彈層幾何位置回退。
    function resolveAnchorButton(menuEl) {
      if (lastAnchorButton && lastAnchorButton.isConnected && Date.now() - lastAnchorAt < ANCHOR_FRESH_MS && isSessionAnchorButton(lastAnchorButton)) {
        return lastAnchorButton;
      }
      // 隱藏量測框（visibility:hidden）不做幾何比對。
      if (menuEl.style && menuEl.style.visibility === "hidden") return null;
      const popRect = menuEl.getBoundingClientRect();
      let best = null;
      let bestScore = Infinity;
      for (const button of document.querySelectorAll("button")) {
        if (!isSessionAnchorButton(button)) continue;
        const rect = button.getBoundingClientRect();
        const score = Math.abs(rect.left - popRect.left) + Math.abs(rect.bottom - popRect.top);
        if (score < bestScore) {
          bestScore = score;
          best = button;
        }
      }
      return bestScore < 200 ? best : null;
    }

    // ---------- 選單項目注入 ----------
    const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6.5 4V2.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75V4m-6.5 0 .6 8.2a1.25 1.25 0 0 0 1.25 1.16h4.8a1.25 1.25 0 0 0 1.25-1.16l.6-8.2M6.5 7v3.5M9.5 7v3.5"/></svg>';

    function injectItem(menuEl, archiveButton, locale, session, anchor) {
      if (menuEl.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) return;
      const wrap = archiveButton.parentElement;
      if (!wrap) return;
      // 克隆「歸檔會話」項目：類別名稱（含雜湊）自動繼承，樣式一致。
      const clone = wrap.cloneNode(true);
      const button = clone.querySelector('[role="menuitem"]');
      if (!button) return;
      button.setAttribute(DELETE_ITEM_ATTR, "1");
      button.removeAttribute("aria-haspopup");
      button.removeAttribute("aria-expanded");
      const iconSpan = button.firstElementChild;
      if (iconSpan) iconSpan.innerHTML = TRASH_SVG;
      const labelSpan = button.lastElementChild;
      if (labelSpan) labelSpan.textContent = STRINGS[locale].menuDeleteSession;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        requestDeleteFlow(session, locale, anchor);
      });
      // 插到「歸檔會話」項目的正下方。
      wrap.insertAdjacentElement("afterend", clone);
    }

    // ---------- 刪除流程 ----------
    function requestDeleteFlow(session, locale, anchor) {
      closeOpenMenu(anchor);
      showConfirmModal(session, locale);
    }

    // 關閉選單：優先點擊錨點按鈕觸發 React 的 toggle；失敗則派發
    // pointerdown 讓 Menu 的 outside-close 邏輯接管。
    function closeOpenMenu(anchor) {
      if (anchor && anchor.isConnected) {
        try {
          anchor.click();
          return;
        } catch {
          // 落入下方回退路徑。
        }
      }
      try {
        document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      } catch {
        // 關閉失敗不阻斷刪除流程。
      }
    }

    // ---------- 二次確認彈窗（純 DOM，不使用 React） ----------
    let modalRoot = null;
    let modalState = null;
    let modalToken = 0;

    function ensureModalRoot() {
      if (!modalRoot || !modalRoot.isConnected) {
        modalRoot = document.createElement("div");
        modalRoot.className = "dshds-modal-root";
        document.body.appendChild(modalRoot);
      }
      return modalRoot;
    }

    function closeModal() {
      if (modalState) {
        modalState.dispose();
        modalState = null;
      }
      if (modalRoot && modalRoot.isConnected) modalRoot.remove();
      modalRoot = null;
    }

    function showConfirmModal(session, locale) {
      closeModal();
      const token = ++modalToken;
      const strings = STRINGS[locale];
      const root = ensureModalRoot();

      const overlay = document.createElement("div");
      overlay.className = "dshds-overlay";

      const card = document.createElement("div");
      card.className = "dshds-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const titleEl = document.createElement("div");
      titleEl.className = "dshds-title";
      titleEl.textContent = strings.modalTitle;

      const descEl = document.createElement("p");
      descEl.className = "dshds-desc";
      descEl.textContent = strings.modalDescription(session.displayTitle);

      const errorEl = document.createElement("p");
      errorEl.className = "dshds-error";
      errorEl.setAttribute("role", "alert");

      const actions = document.createElement("div");
      actions.className = "dshds-actions";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "dshds-btn dshds-btn-cancel";
      cancelButton.textContent = strings.cancel;

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "dshds-btn dshds-btn-danger";
      confirmButton.textContent = strings.confirm;

      actions.appendChild(cancelButton);
      actions.appendChild(confirmButton);
      card.appendChild(titleEl);
      card.appendChild(descEl);
      card.appendChild(errorEl);
      card.appendChild(actions);
      overlay.appendChild(card);
      root.appendChild(overlay);

      let settled = false;
      const dispose = () => {
        settled = true;
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.removeEventListener("click", onOverlayClick);
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeModal();
        }
      };
      const onOverlayClick = (event) => {
        if (event.target === overlay) closeModal();
      };

      const setPending = (pending) => {
        cancelButton.disabled = pending;
        confirmButton.disabled = pending;
        confirmButton.textContent = pending ? strings.deleting : strings.confirm;
        errorEl.style.display = "none";
      };
      const setError = (message) => {
        errorEl.textContent = message;
        errorEl.style.display = "block";
      };

      cancelButton.addEventListener("click", () => closeModal());
      confirmButton.addEventListener("click", () => {
        if (settled) return;
        setPending(true);
        deleteSession(session, locale, setPending, setError, token);
      });
      document.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("click", onOverlayClick);

      modalState = { dispose };
      // 開啟後將焦點交給「取消」，方便鍵盤操作。
      cancelButton.focus();
    }

    async function deleteSession(session, locale, setPending, setError, token) {
      const strings = STRINGS[locale];
      const current = () => token === modalToken;
      let response;
      try {
        response = await fetch(ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id })
        });
      } catch {
        if (current()) {
          setPending(false);
          setError(strings.networkError);
        }
        return;
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        if (!current()) return;
        setPending(false);
        const code = payload !== null && typeof payload.code === "string" ? payload.code : null;
        if (code === "LIVE_SESSION") setError(strings.liveSession);
        else if (code === "NOT_FOUND") setError(strings.notFound);
        else setError(strings.genericError);
        return;
      }
      // 只有仍是最新彈窗時才關閉；過期請求只做刷新。
      if (current()) closeModal();
      // 刪除已成功；刷新為盡力而為（與 dsh-archive-manager 相同）。
      if (activeCtx) {
        try {
          await Promise.all([activeCtx.sessions.refresh(), activeCtx.workspaces.refresh()]);
        } catch {
          // 忽略刷新失敗：清單會在下次刷新或重新載入後消失。
        }
      }
    }

    // ---------- 選單偵測與注入 ----------
    function maybeInject(menuEl) {
      if (!activeCtx) return;
      if (!isElement(menuEl)) return;
      if (menuEl.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) return;

      // 1) 以「歸檔會話」項目判定語系與選單類型。
      let locale = null;
      let archiveButton = null;
      for (const button of menuEl.querySelectorAll('[role="menuitem"]')) {
        const text = (button.textContent || "").trim();
        if (text === STRINGS.zh.menuArchiveSession) {
          locale = "zh";
          archiveButton = button;
          break;
        }
        if (text === STRINGS.en.menuArchiveSession) {
          locale = "en";
          archiveButton = button;
          break;
        }
      }
      if (locale === null || !archiveButton) return; // 非會話行選單。

      // 2) 定位該行。
      const anchor = resolveAnchorButton(menuEl);
      if (!anchor) return;
      const texts = readRowTexts(anchor);
      if (!texts) return;

      // 3) 雙條件唯一匹配（displayTitle + 相對時間）。
      let archivedIds = null;
      try {
        const workspaces = activeCtx.workspaces.list.getSnapshot();
        if (Array.isArray(workspaces.archivedSessionIds)) archivedIds = workspaces.archivedSessionIds;
      } catch {
        // 取不到歸檔集合時不排除（保守規則仍要求唯一命中）。
      }
      const list = activeCtx.sessions.list.getSnapshot();
      const session = findUniqueSession(list, texts.title, texts.time, locale, archivedIds);
      if (!session) return; // 命中數量不為 1 → 不注入。

      // 4) 注入。
      injectItem(menuEl, archiveButton, locale, session, anchor);
    }

    // 掃描目前所有開啟的選單（供重注入使用）。
    function injectIntoOpenMenus() {
      for (const menuEl of document.querySelectorAll('[role="menu"]')) {
        maybeInject(menuEl);
      }
    }

    // ---------- 樣式 ----------
    const CSS_TAG_ID = "dsh-delete-session/delete-session.css";
    const STYLE_SELECTOR = "style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]";
    const css = [
      "[data-dsh-delete-session-item]{color:var(--dsw-alias-state-error-primary);}",
      "[data-dsh-delete-session-item]:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dshds-modal-root{position:relative;z-index:1000;}",
      ".dshds-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;}",
      ".dshds-card{box-sizing:border-box;width:min(420px,calc(100vw - 48px));background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:20px;color:var(--dsw-alias-label-primary);}",
      ".dshds-title{margin:0 0 8px;font-size:16px;font-weight:600;line-height:24px;}",
      ".dshds-desc{margin:0 0 16px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word;}",
      ".dshds-error{display:none;margin:0 0 12px;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;}",
      ".dshds-actions{display:flex;justify-content:flex-end;gap:8px;}",
      ".dshds-btn{box-sizing:border-box;height:32px;padding:0 14px;border-radius:8px;font-family:inherit;font-size:13px;line-height:18px;cursor:pointer;}",
      ".dshds-btn:disabled{opacity:.6;cursor:default;}",
      ".dshds-btn-cancel{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}",
      ".dshds-btn-cancel:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);}",
      ".dshds-btn-danger{background:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);color:#fff;}",
      ".dshds-btn-danger:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(1.05);}"
    ].join("\n");

    function mountStyle() {
      if (typeof document === "undefined") return;
      if (document.querySelector(STYLE_SELECTOR) !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-delete-session";
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function unmountStyle() {
      if (typeof document === "undefined") return;
      const tag = document.querySelector(STYLE_SELECTOR);
      if (tag !== null) tag.remove();
    }

    // ---------- MutationObserver ----------
    function collectMenus(rootEl) {
      const menus = [];
      if (rootEl.matches('[role="menu"]')) menus.push(rootEl);
      for (const child of rootEl.querySelectorAll('[role="menu"]')) menus.push(child);
      return menus;
    }

    function onBodyMutations(mutations) {
      let removedOurs = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!isElement(node)) continue;
          for (const menuEl of collectMenus(node)) maybeInject(menuEl);
        }
        if (!removedOurs) {
          for (const node of mutation.removedNodes) {
            if (!isElement(node)) continue;
            if (node.matches("[" + DELETE_ITEM_ATTR + "]") || node.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) {
              removedOurs = true;
              break;
            }
          }
        }
      }
      // React 若重繪移除了注入項，於微任務內重新注入（選單仍開啟時）。
      if (removedOurs) {
        queueMicrotask(() => {
          injectIntoOpenMenus();
        });
      }
    }

    // ---------- Cordis apply ----------
    const inject = ["sessions", "workspaces"];

    function apply(ctx) {
      activeCtx = ctx;
      mountStyle();

      const onClickCapture = (event) => {
        // 點擊目標可能是按鈕內部的 SVG 圖示，故向上找最近的 button。
        const button = isElement(event.target) ? event.target.closest("button") : null;
        if (isSessionAnchorButton(button)) {
          lastAnchorButton = button;
          lastAnchorAt = Date.now();
        }
      };
      document.addEventListener("click", onClickCapture, true);

      const observer = new MutationObserver(onBodyMutations);
      observer.observe(document.body, { childList: true, subtree: true });

      ctx.effect(() => () => {
        document.removeEventListener("click", onClickCapture, true);
        observer.disconnect();
        closeModal();
        unmountStyle();
        lastAnchorButton = null;
        if (activeCtx === ctx) activeCtx = null;
      }, "delete-session: dom hooks");
    }

    return { apply, inject };
  }
});
