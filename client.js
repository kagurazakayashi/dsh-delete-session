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
    //   4. 注入前先確認前端資料已載入完成：sessions 清單 phase 為
    //      "ready"，workspaces 清單 phase 為 "ready" 且 baselinesReady
    //      為 true；資料未就緒時不干涉（資料到達會觸發側邊欄重繪，
    //      選單仍開啟時 MutationObserver 會再次進入並補注入）。
    //   5. 注入前的額外延時由 INJECT_DELAY_MS 控制：為 0 時「完全關閉
    //      延時」直接同步注入（不建立計時器）；設為正數才啟用延時。
    //   6. 以 displayTitle + 相對時間（與核心相同的分桶演算法）做雙
    //      條件匹配；命中數量「恰為 1」才注入，否則不注入。
    //   7. 點擊「刪除會話」：第一次點擊就地切換為警示狀態（紅底、警告
    //      圖標與「再次點擊刪除」文案），不關閉選單也不彈窗；第二次點擊
    //      才真正呼叫 host 端刪除路由。警示狀態按會話 id 記憶
    //      （ARM_HOLD_MS 視窗），期間選單關閉重開仍會以警示狀態注入。
    //      刪除失敗時以純 DOM 錯誤彈窗提示；成功後刷新 sessions 與
    //      workspaces 清單。
    // =====================================================================

    const DELETE_ITEM_ATTR = "data-dsh-delete-session-item";
    const ROUTE = "/delete-session/delete";
    const ANCHOR_FRESH_MS = 2000;
    // 注入前的額外延時（毫秒）。設為 0 時「完全關閉延時」，直接同步注入，
    // 不使用 setTimeout（亦即不讓計時器計 0 秒）；設為正數才啟用延時。
    const INJECT_DELAY_MS = 0;

    // ---------- 多語文案 ----------
    const STRINGS = {
      zh: {
        menuArchiveSession: "归档会话",
        menuDeleteSession: "删除会话",
        menuDeleteConfirm: "再次点击删除",
        errorTitle: "删除失败",
        ok: "确定",
        liveSession: "无法删除正在运行任务的会话，请等待任务结束后重试",
        notFound: "会话不存在或已被删除",
        genericError: "删除失败，请稍后重试",
        networkError: "网络请求失败，请稍后重试"
      },
      en: {
        menuArchiveSession: "Archive session",
        menuDeleteSession: "Delete session",
        menuDeleteConfirm: "Click again to delete",
        errorTitle: "Delete failed",
        ok: "OK",
        liveSession: "Cannot delete a session that is running a task; please wait for it to finish",
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
    // 警示圖標：與核心原語 IconWarningOutline16 相同的路徑（警示三角 + 驚嘆號）。
    const WARNING_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z" fill="currentColor"/><path d="M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z" fill="currentColor"/><path d="M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z" fill="currentColor"/></svg>';

    // ---------- 兩段式確認狀態 ----------
    // 以 sessionId 記憶「已點擊一次」的警示狀態；ARM_HOLD_MS 視窗內選單
    // 關閉重開仍會以警示樣式注入，第二次點擊即直接刪除。狀態僅存於記憶體。
    const ARM_HOLD_MS = 8000;
    const armedSessions = new Map(); // sessionId → 解除警示的計時器 id

    function disarmSession(sessionId) {
      const timer = armedSessions.get(sessionId);
      if (timer !== undefined) clearTimeout(timer);
      armedSessions.delete(sessionId);
    }

    function armSession(sessionId) {
      disarmSession(sessionId); // 重複點擊時重置倒數。
      const timer = setTimeout(() => {
        armedSessions.delete(sessionId);
      }, ARM_HOLD_MS);
      armedSessions.set(sessionId, timer);
    }

    function isSessionArmed(sessionId) {
      return armedSessions.has(sessionId);
    }

    function disarmAllSessions() {
      for (const timer of armedSessions.values()) clearTimeout(timer);
      armedSessions.clear();
    }

    // 將選單項切換為警示外觀：紅底、白字、警告圖標與「再次點擊刪除」文案。
    function renderArmed(button, locale) {
      button.setAttribute("data-dsh-delete-session-armed", "1");
      const iconSpan = button.firstElementChild;
      if (iconSpan) iconSpan.innerHTML = WARNING_SVG;
      const labelSpan = button.lastElementChild;
      if (labelSpan) labelSpan.textContent = STRINGS[locale].menuDeleteConfirm;
    }

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
      // 記憶中的警示狀態（例如選單曾關閉又重開）：直接以警示樣式注入。
      if (isSessionArmed(session.id)) renderArmed(button, locale);
      // 防止同一個項目在刪除請求進行中重複觸發。
      let busy = false;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isSessionArmed(session.id)) {
          // 第一次點擊：就地進入警示狀態，不關閉選單、不彈窗。
          armSession(session.id);
          renderArmed(button, locale);
          return;
        }
        // 第二次點擊：直接刪除（無確認彈窗）。
        if (busy) return;
        busy = true;
        closeOpenMenu(anchor);
        deleteSession(session, locale);
      });
      // 插到「歸檔會話」項目的正下方。
      wrap.insertAdjacentElement("afterend", clone);
    }

    // ---------- 刪除流程 ----------
    // 第二次點擊後直接呼叫刪除路由；成功路徑沒有任何彈窗。

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

    // ---------- 錯誤彈窗（純 DOM，不使用 React） ----------
    // 僅在刪除失敗時顯示，用來提示失敗原因；不含確認按鈕。
    let modalRoot = null;
    let modalState = null;

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

    function showErrorModal(message, locale) {
      closeModal();
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
      titleEl.textContent = strings.errorTitle;

      const descEl = document.createElement("p");
      descEl.className = "dshds-desc";
      descEl.textContent = message;

      const actions = document.createElement("div");
      actions.className = "dshds-actions";

      const okButton = document.createElement("button");
      okButton.type = "button";
      okButton.className = "dshds-btn dshds-btn-ok";
      okButton.textContent = strings.ok;

      actions.appendChild(okButton);
      card.appendChild(titleEl);
      card.appendChild(descEl);
      card.appendChild(actions);
      overlay.appendChild(card);
      root.appendChild(overlay);

      const dispose = () => {
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

      okButton.addEventListener("click", () => closeModal());
      document.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("click", onOverlayClick);

      modalState = { dispose };
      // 開啟後將焦點交給「確定」，方便鍵盤操作。
      okButton.focus();
    }

    async function deleteSession(session, locale) {
      const strings = STRINGS[locale];
      let response;
      try {
        response = await fetch(ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id })
        });
      } catch {
        disarmSession(session.id);
        showErrorModal(strings.networkError, locale);
        return;
      }
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) {
        // 失敗即解除警示：兩段式確認週期已消耗，避免下次單擊誤刪。
        disarmSession(session.id);
        const code = payload !== null && typeof payload.code === "string" ? payload.code : null;
        if (code === "LIVE_SESSION") showErrorModal(strings.liveSession, locale);
        else if (code === "NOT_FOUND") showErrorModal(strings.notFound, locale);
        else showErrorModal(strings.genericError, locale);
        return;
      }
      disarmSession(session.id);
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
    // ---------- 前端資料就緒判斷 ----------
    // sessions 清單 phase 為 "ready" 代表基準清單已從 host 拉取完成；
    // workspaces 的 baselinesReady 同時要求兩者皆 ready（見核心 WorkspaceRuntime.project）。
    function frontendDataReady() {
      try {
        const sessions = activeCtx.sessions.list.getSnapshot();
        if (sessions.phase !== "ready") return false;
        const workspaces = activeCtx.workspaces.list.getSnapshot();
        if (workspaces.phase !== "ready" || workspaces.baselinesReady !== true) return false;
        return true;
      } catch {
        return false;
      }
    }

    // 以「歸檔會話」項目判定是否為會話行選單並回傳語系；否則回傳 null。
    function detectSessionMenuLocale(menuEl) {
      for (const button of menuEl.querySelectorAll('[role="menuitem"]')) {
        const text = (button.textContent || "").trim();
        if (text === STRINGS.zh.menuArchiveSession) return "zh";
        if (text === STRINGS.en.menuArchiveSession) return "en";
      }
      return null;
    }

    // 完整解析注入目標：語系 + 歸檔項 + 該行 + 雙條件唯一匹配。
    // 回傳 null 代表此刻不應注入（非會話選單、行定位失敗或命中數量不為 1）。
    function resolveInjectionTarget(menuEl) {
      const locale = detectSessionMenuLocale(menuEl);
      if (locale === null) return null;

      // 1) 定位該行。
      const anchor = resolveAnchorButton(menuEl);
      if (!anchor) return null;
      const texts = readRowTexts(anchor);
      if (!texts) return null;

      // 2) 取歸檔集合（取不到時不排除，保守規則仍要求唯一命中）。
      let archivedIds = null;
      try {
        const workspaces = activeCtx.workspaces.list.getSnapshot();
        if (Array.isArray(workspaces.archivedSessionIds)) archivedIds = workspaces.archivedSessionIds;
      } catch {
        // 忽略：見上。
      }

      // 3) 雙條件唯一匹配（displayTitle + 相對時間）。
      const list = activeCtx.sessions.list.getSnapshot();
      const session = findUniqueSession(list, texts.title, texts.time, locale, archivedIds);
      if (!session) return null;

      // 4) 以觸發時的最新 DOM 重新定位「歸檔會話」項目。
      let archiveButton = null;
      for (const button of menuEl.querySelectorAll('[role="menuitem"]')) {
        const text = (button.textContent || "").trim();
        if (text === STRINGS[locale].menuArchiveSession) {
          archiveButton = button;
          break;
        }
      }
      if (!archiveButton) return null;

      return { locale, archiveButton, anchor, session };
    }

    // 執行注入：於排程觸發時（或延時關閉時的同步路徑）重新完整解析，
    // 確保資料仍就緒、選單仍在 DOM、唯一命中仍成立，然後才介入 DOM。
    const pendingInjections = new Map(); // 選單元素 → setTimeout id（僅延時開啟時使用）

    function performInjection(menuEl) {
      if (!menuEl.isConnected) return;
      if (menuEl.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) return;
      if (!frontendDataReady()) return;
      const target = resolveInjectionTarget(menuEl);
      if (!target) return;
      injectItem(menuEl, target.archiveButton, target.locale, target.session, target.anchor);
    }

    function scheduleInjection(menuEl) {
      if (pendingInjections.has(menuEl)) return;
      // 延時關閉（INJECT_DELAY_MS 為 0）：不建立計時器，直接同步注入。
      if (INJECT_DELAY_MS <= 0) {
        performInjection(menuEl);
        return;
      }
      const timer = setTimeout(() => {
        pendingInjections.delete(menuEl);
        performInjection(menuEl);
      }, INJECT_DELAY_MS);
      pendingInjections.set(menuEl, timer);
    }

    function maybeInject(menuEl) {
      if (!activeCtx) return;
      if (!isElement(menuEl)) return;
      if (menuEl.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) return;
      // 資料尚未載入完成前不干涉前端；資料到達會觸發側邊欄重繪，
      // MutationObserver 會再次進入本函式，選單仍開啟時即可補注入。
      if (!frontendDataReady()) return;
      if (detectSessionMenuLocale(menuEl) === null) return; // 非會話行選單。
      scheduleInjection(menuEl);
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
      "[data-dsh-delete-session-item]{color:var(--dsw-alias-label-primary);}",
      "[data-dsh-delete-session-item]:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      "[data-dsh-delete-session-item][data-dsh-delete-session-armed]{background:var(--dsw-alias-state-error-primary);color:#fff;}",
      "[data-dsh-delete-session-item][data-dsh-delete-session-armed]:hover{background:var(--dsw-alias-state-error-primary);filter:brightness(1.08);}",
      ".dshds-modal-root{position:relative;z-index:1000;}",
      ".dshds-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;}",
      ".dshds-card{box-sizing:border-box;width:min(420px,calc(100vw - 48px));background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:20px;color:var(--dsw-alias-label-primary);}",
      ".dshds-title{margin:0 0 8px;font-size:16px;font-weight:600;line-height:24px;}",
      ".dshds-desc{margin:0 0 16px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word;}",
      ".dshds-actions{display:flex;justify-content:flex-end;gap:8px;}",
      ".dshds-btn{box-sizing:border-box;height:32px;padding:0 14px;border-radius:8px;font-family:inherit;font-size:13px;line-height:18px;cursor:pointer;}",
      ".dshds-btn-ok{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}",
      ".dshds-btn-ok:hover{background:var(--dsw-alias-interactive-bg-hover);}"
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
        for (const timer of pendingInjections.values()) clearTimeout(timer);
        pendingInjections.clear();
        disarmAllSessions();
        closeModal();
        unmountStyle();
        lastAnchorButton = null;
        if (activeCtx === ctx) activeCtx = null;
      }, "delete-session: dom hooks");
    }

    return { apply, inject };
  }
});
