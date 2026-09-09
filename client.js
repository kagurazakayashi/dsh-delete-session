window.__ModuleLoader__.load({
  id: "@kagurazakayashi/dsh-delete-session",
  factory: (require) => {
    "use strict";

    // shell 以凍結的 seed 模組表提供 React；設定卡片（React 元件）用它渲染。
    const React = require("react");

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
    //   3. 依 DOM 結構（button → Menu 根 span → span(rowActions)）讀取該行
    //      實際渲染出來的標題與相對時間文字；標題優先由按鈕的
    //      aria-label 解析，失敗時才退回 DOM 結構推導。
    //   4. 注入前先確認前端資料已載入完成：sessions 與 workspaces 清單的
    //      phase 皆為 "ready"；資料未就緒時不干涉（資料到達會觸發側邊欄
    //      重繪，選單仍開啟時 MutationObserver 會再次進入並補注入）。
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
    //   8. 使用者設定：在設定頁「外掛 → 外掛設定」註冊一張本外掛的卡片
    //      （settings.plugin.item，鍵為設定命名空間 "delete-session"），
    //      讓使用者選擇刪除確認方式（再次點擊／彈出對話框／直接刪除）。
    //      卡片以 settingsScope 讀寫 host 端已註冊的命名空間，值持久化到
    //      $DSH_HOME/settings.yaml。目前版本的刪除流程仍固定使用
    //      「再次點擊刪除」，卡片只負責顯示與記憶選擇。
    // =====================================================================

    const DELETE_ITEM_ATTR = "data-dsh-delete-session-item";
    const ROUTE = "/delete-session/delete";
    const ANCHOR_FRESH_MS = 2000;
    // 注入前的額外延時（毫秒）。設為 0 時「完全關閉延時」，直接同步注入，
    // 不使用 setTimeout（亦即不讓計時器計 0 秒）；設為正數才啟用延時。
    const INJECT_DELAY_MS = 0;

    // ---------- 使用者設定（刪除確認方式） ----------
    // 設定命名空間與欄位名稱必須與 host 端 index.js 保持一致。
    const SETTINGS_NAMESPACE = "delete-session";
    const CONFIRM_MODE_FIELD = "confirmMode";
    // 三種確認方式；順序即設定頁下拉選單的顯示順序。
    const CONFIRM_MODES = ["click-again", "dialog", "instant"];
    // 預設值：主機端設定的組合層基準值，也是卡片在值缺失時的回退。
    const DEFAULT_CONFIRM_MODE = "click-again";
    // 設定頁卡片的外掛名稱與說明所用的字典鍵前綴（見 STRINGS）。
    const CONFIRM_MODE_LABEL_KEYS = {
      "click-again": "modeClickAgain",
      dialog: "modeDialog",
      instant: "modeInstant"
    };
    const CONFIRM_MODE_HINT_KEYS = {
      "click-again": "modeClickAgainHint",
      dialog: "modeDialogHint",
      instant: "modeInstantHint"
    };

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
        networkError: "网络请求失败，请稍后重试",
        settingsCardTitle: "删除会话",
        settingsCardDescription: "选择在会话菜单中删除会话时的确认方式。",
        settingsFieldLabel: "删除确认方式",
        settingsOverridden: "已自定义",
        settingsReset: "恢复默认",
        settingsUnsaved: "未保存",
        settingsSave: "保存",
        settingsSaving: "保存中…",
        settingsDiscard: "放弃",
        settingsSaveFailed: "保存失败，请重试",
        settingsReadOnly: "当前部署不允许写入设置，此处仅供查看。",
        settingsExpand: "展开",
        settingsCollapse: "收起",
        modeClickAgain: "再次点击删除",
        modeClickAgainHint: "第一次点击进入警示状态，第二次点击才真正删除（默认，最安全）",
        modeDialog: "弹出对话框删除",
        modeDialogHint: "点击后在对话框里确认，确认后才会删除",
        modeInstant: "直接删除（危险）",
        modeInstantHint: "点击后立即删除，没有任何二次确认，可能误删会话",
        settingsPendingNote: "当前版本的删除流程仍使用「再次点击删除」，所选方式将在后续版本生效。"
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
        networkError: "Network request failed, please try again later",
        settingsCardTitle: "Delete session",
        settingsCardDescription: "Choose how deleting a session from its row menu is confirmed.",
        settingsFieldLabel: "Delete confirmation",
        settingsOverridden: "Customized",
        settingsReset: "Reset to default",
        settingsUnsaved: "Unsaved",
        settingsSave: "Save",
        settingsSaving: "Saving…",
        settingsDiscard: "Discard",
        settingsSaveFailed: "Save failed, please try again",
        settingsReadOnly: "This deployment does not allow writing settings; shown read-only.",
        settingsExpand: "Expand",
        settingsCollapse: "Collapse",
        modeClickAgain: "Click again to delete",
        modeClickAgainHint: "The first click turns the item into a warning state; the second click deletes (default, safest)",
        modeDialog: "Confirm in a dialog",
        modeDialogHint: "A dialog appears after clicking; the session is deleted only after you confirm",
        modeInstant: "Delete immediately (dangerous)",
        modeInstantHint: "Deletes immediately with no second confirmation; a mis-click removes the session",
        settingsPendingNote: "The current version still uses \"click again to delete\"; the selected mode takes effect in a later version."
      }
    };

    // ---------- 相對時間演算法（與核心 dsh-client-ui-workspace 的 relativeTime 完全一致） ----------
    const MIN = 60000;
    const HOUR = 3600000;
    const DAY = 86400000;

    /**
     * 將「最後更新距今」的毫秒差映射為與核心一致的時間分桶。
     *
     * 分桶順序：剛剛 → 分鐘 → 小時 → 天 → 月 → 年；閾值遞增，
     * 首個小於閾值的分桶即回傳。
     *
     * @param {number} updatedAt 會話最後更新時間（Unix 毫秒）。
     * @param {number} now 當前時間（Unix 毫秒）。
     * @returns {{unit: string, n: number}} 分桶單位與數量。
     */
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

    /**
     * 依語系將時間分桶格式化為顯示文字。
     *
     * 語系不在支援範圍內、或模板不存在時回傳 null，交由呼叫端處理。
     *
     * @param {{unit: string, n: number}} bucket 時間分桶（單位與數量）。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @returns {string|null} 格式化後的時間標籤，或 null。
     */
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
    // zh 模板的收尾字串；en 模板沒有收尾字串。
    const SESSION_ARIA_ZH_SUFFIX = "”的操作";

    /**
     * 判斷節點是否為 DOM 元素節點（nodeType === 1）。
     *
     * @param {*} node 欲判斷的節點（可能為 null、文字節點或元素）。
     * @returns {boolean} 是元素節點時回傳 true。
     */
    function isElement(node) {
      return node !== null && typeof node === "object" && node.nodeType === 1;
    }

    /**
     * 判斷節點是否為「會話行 … 按鈕」。
     *
     * 以 aria-label 是否以任一語系前綴開頭為準（zh/en 兩語系）。
     *
     * @param {*} node 欲判斷的節點。
     * @returns {boolean} 是會話行操作按鈕時回傳 true。
     */
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
    /**
     * 由錨點按鈕的 aria-label 解析會話的顯示標題。
     *
     * aria-label 由核心以 `t("actions.session.aria", { name: title })` 產生，
     * 其中的 title 即為該行實際渲染的 displayTitle，因此比讀取 DOM 文字
     * 更可靠（不受同行其它指示元素影響）。
     *
     * @param {HTMLButtonElement} button 會話行「…」按鈕。
     * @returns {string|null} 解析出的標題；語系模板不符時回傳 null。
     */
    function titleFromAriaLabel(button) {
      const label = button.getAttribute("aria-label") || "";
      const zhPrefix = SESSION_ARIA_PREFIXES[0];
      if (label.startsWith(zhPrefix) && label.endsWith(SESSION_ARIA_ZH_SUFFIX)) {
        return label.slice(zhPrefix.length, label.length - SESSION_ARIA_ZH_SUFFIX.length);
      }
      const enPrefix = SESSION_ARIA_PREFIXES[1];
      if (label.startsWith(enPrefix)) return label.slice(enPrefix.length);
      return null;
    }

    // 現行 core 的會話行結構（Rows 模組）：
    //   div.sessionRow(role=treeitem) > [span(slot)] span(title)
    //   [ActiveScheduleIndicator] span(time) span(rowActions)
    //   > Menu 根 span > button(aria-label)
    // 其中 ActiveScheduleIndicator 只在「有活動定時任務」時插在標題與時間
    // 之間，因此時間取 rowActions 緊鄰的前一兄弟；標題優先以 aria-label
    // 解析，失敗時才往前掃描所有兄弟、取最靠左且帶有非空文字者。
    /**
     * 從會話行 DOM 讀取實際渲染出的標題與相對時間文字。
     *
     * @param {HTMLButtonElement} button 會話行「…」按鈕。
     * @returns {{title: string, time: string}|null} 標題與去頭尾空白後的
     *   時間文字；DOM 結構不符預期時回傳 null。
     */
    function readRowTexts(button) {
      const rowActions = button.parentElement ? button.parentElement.parentElement : null;
      if (!rowActions) return null;
      const timeSpan = rowActions.previousElementSibling;
      if (!timeSpan) return null;
      const time = (timeSpan.textContent || "").trim();
      let title = titleFromAriaLabel(button);
      if (title === null) {
        let cursor = timeSpan.previousElementSibling;
        while (cursor) {
          const text = (cursor.textContent || "").trim();
          if (text.length > 0) title = text;
          cursor = cursor.previousElementSibling;
        }
      }
      if (title === null || title.length === 0) return null;
      return { title, time };
    }

    // ---------- 雙條件唯一匹配 ----------
    /**
     * 以「displayTitle + 相對時間」雙條件在會話清單中做唯一匹配。
     *
     * 僅當命中數量恰為 1 時回傳該會話，否則回傳 null（避免誤刪）。
     * blank 會話、subagent 會話與已歸檔會話一律排除。
     *
     * @param {object} list 會話清單快照（含 ids 陣列與 byId 對照表）。
     * @param {string} title 目標顯示標題。
     * @param {string} timeText 目標相對時間文字。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @param {string[]|null} archivedIds 已歸檔會話 id 陣列，或 null。
     * @returns {object|null} 唯一命中的會話摘要，或 null。
     */
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
    /**
     * 定位開啟此選單的會話行「…」按鈕。
     *
     * 優先使用最近一次點開且仍在時效（ANCHOR_FRESH_MS）內的按鈕；否則
     * 以選單彈層的幾何位置（左下角）在所有會話按鈕中找距離最近者。
     *
     * @param {HTMLElement} menuEl 選單彈層元素。
     * @returns {HTMLButtonElement|null} 錨點按鈕，或 null（無法定位）。
     */
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
      // 距離分數小於 200 像素才視為合理錨點，避免誤配到距離遙遠的按鈕。
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

    /**
     * 解除指定會話的警示（兩段式確認）狀態，並清除其倒數計時器。
     *
     * @param {string} sessionId 會話唯一識別碼。
     * @returns {void}
     */
    function disarmSession(sessionId) {
      const timer = armedSessions.get(sessionId);
      if (timer !== undefined) clearTimeout(timer);
      armedSessions.delete(sessionId);
    }

    /**
     * 將指定會話切換為「已點擊一次」的警示狀態。
     *
     * 啟動 ARM_HOLD_MS 倒數；期間重複呼叫會重置倒數（見 disarmSession）。
     *
     * @param {string} sessionId 會話唯一識別碼。
     * @returns {void}
     */
    function armSession(sessionId) {
      disarmSession(sessionId); // 重複點擊時重置倒數。
      const timer = setTimeout(() => {
        armedSessions.delete(sessionId);
      }, ARM_HOLD_MS);
      armedSessions.set(sessionId, timer);
    }

    /**
     * 查詢指定會話目前是否處於警示（已點擊一次）狀態。
     *
     * @param {string} sessionId 會話唯一識別碼。
     * @returns {boolean} 處於警示狀態時回傳 true。
     */
    function isSessionArmed(sessionId) {
      return armedSessions.has(sessionId);
    }

    /**
     * 解除所有會話的警示狀態並清除全部倒數計時器。
     *
     * 用於外掛卸載（apply 清理）時，避免殘留計時器。
     *
     * @returns {void}
     */
    function disarmAllSessions() {
      for (const timer of armedSessions.values()) clearTimeout(timer);
      armedSessions.clear();
    }

    // 將選單項切換為警示外觀：紅底、白字、警告圖標與「再次點擊刪除」文案。
    /**
     * 將「刪除會話」選單項就地切換為警示外觀（無需重新注入）。
     *
     * @param {HTMLButtonElement} button 已注入的刪除選單項。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @returns {void}
     */
    function renderArmed(button, locale) {
      button.setAttribute("data-dsh-delete-session-armed", "1");
      const iconSpan = button.firstElementChild;
      if (iconSpan) iconSpan.innerHTML = WARNING_SVG;
      const labelSpan = button.lastElementChild;
      if (labelSpan) labelSpan.textContent = STRINGS[locale].menuDeleteConfirm;
    }

    /**
     * 將「刪除會話」項目注入到「歸檔會話」項目的正下方。
     *
     * 透過複製歸檔項目以繼承樣式（含類別雜湊），並綁定兩段式確認點擊。
     * 同一個選單內已注入過（或帶有標記）時不重複注入。
     *
     * @param {HTMLElement} menuEl 會話行選單彈層。
     * @param {HTMLButtonElement} archiveButton 「歸檔會話」選單項。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @param {object} session 目標會話摘要（含 id）。
     * @param {HTMLButtonElement} anchor 會話行「…」錨點按鈕。
     * @returns {void}
     */
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
    /**
     * 嘗試關閉目前開啟的會話行選單。
     *
     * 優先點擊錨點按鈕觸發 React 的 toggle；失敗則派發 pointerdown 事件
     * 讓 Menu 的 outside-close 邏輯接管。關閉失敗不拋出例外。
     *
     * @param {HTMLButtonElement} anchor 會話行「…」錨點按鈕。
     * @returns {void}
     */
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

    /**
     * 取得（必要時建立）錯誤彈窗的根容器元素。
     *
     * @returns {HTMLElement} 彈窗根容器。
     */
    function ensureModalRoot() {
      if (!modalRoot || !modalRoot.isConnected) {
        modalRoot = document.createElement("div");
        modalRoot.className = "dshds-modal-root";
        document.body.appendChild(modalRoot);
      }
      return modalRoot;
    }

    /**
     * 關閉並移除錯誤彈窗，同時釋放其事件監聽器。
     *
     * @returns {void}
     */
    function closeModal() {
      if (modalState) {
        modalState.dispose();
        modalState = null;
      }
      if (modalRoot && modalRoot.isConnected) modalRoot.remove();
      modalRoot = null;
    }

    /**
     * 顯示純 DOM 建構的錯誤彈窗（不依賴 React）。
     *
     * 僅用於刪除失敗時提示原因，不含任何確認按鈕，支援 Escape 鍵與
     * 點擊遮罩關閉。
     *
     * @param {string} message 錯誤描述文字。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @returns {void}
     */
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

      // 清理函式：卸載彈窗時移除事件監聽器。
      const dispose = () => {
        document.removeEventListener("keydown", onKeyDown, true);
        overlay.removeEventListener("click", onOverlayClick);
      };
      // Escape 鍵關閉彈窗（捕獲階段，避免與其它快捷鍵衝突）。
      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          closeModal();
        }
      };
      // 點擊遮罩（非卡片本身）時關閉彈窗。
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

    /**
     * 呼叫 host 端刪除路由，並處理成功／失敗後的介面更新。
     *
     * 失敗時依錯誤碼顯示對應文案；成功時刷新 sessions 與 workspaces
     * 清單（刷新失敗僅忽略，不影響已完成的刪除）。
     *
     * @param {object} session 目標會話摘要（含 id）。
     * @param {string} locale 語系代碼（"zh" 或 "en"）。
     * @returns {Promise<void>}
     */
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
      // workspaces 服務（IWorkspaces）已無 refresh()：歸檔
      // 集合改由 host 的 archiveSession 結果與 follow 串流自動更新，因此
      // 這裡只需刷新會話清單。
      if (activeCtx) {
        try {
          await activeCtx.sessions.refresh();
        } catch {
          // 忽略刷新失敗：清單會在下次刷新或重新載入後消失。
        }
      }
    }

    // ---------- 選單偵測與注入 ----------
    // ---------- 前端資料就緒判斷 ----------
    // sessions 清單 phase 為 "ready" 代表基準清單已從 host 拉取完成；
    // workspaces 的 phase 為 "ready" 代表工作區與歸檔集合基準已就緒。
    /**
     * 判斷前端會話／工作區資料是否已就緒。
     *
     * sessions 與 workspaces 清單的 phase 皆須為 "ready"。
     * WorkspaceSnapshot 已移除 baselinesReady 欄位（僅保留 items、
     * archivedSessionIds、state、phase、error），故不再檢查該欄位。
     *
     * @returns {boolean} 資料已就緒時回傳 true。
     */
    function frontendDataReady() {
      try {
        const sessions = activeCtx.sessions.list.getSnapshot();
        if (sessions.phase !== "ready") return false;
        const workspaces = activeCtx.workspaces.list.getSnapshot();
        if (workspaces.phase !== "ready") return false;
        return true;
      } catch {
        return false;
      }
    }

    // 以「歸檔會話」項目判定是否為會話行選單並回傳語系；否則回傳 null。
    /**
     * 偵測選單是否為會話行選單，並回傳其語系。
     *
     * 以是否存在「歸檔會話 / Archive session」文字項目為判定依據。
     *
     * @param {HTMLElement} menuEl 選單彈層元素。
     * @returns {string|null} 語系代碼（"zh" 或 "en"），非會話選單時回傳 null。
     */
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
    /**
     * 完整解析注入所需的全部資訊（語系、歸檔項、錨點、會話）。
     *
     * 任一步驟失敗（非會話選單、行定位失敗或雙條件命中數量不為 1）即
     * 回傳 null，表示此刻不應注入。
     *
     * @param {HTMLElement} menuEl 會話行選單彈層。
     * @returns {{locale: string, archiveButton: HTMLButtonElement,
     *   anchor: HTMLButtonElement, session: object}|null} 注入目標，或 null。
     */
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

    /**
     * 執行一次完整注入（重新解析並介入 DOM）。
     *
     * 在排程觸發時（或延時關閉的同步路徑）呼叫；會再次確認選單仍在 DOM、
     * 資料仍就緒且唯一命中仍成立，然後才實際注入。
     *
     * @param {HTMLElement} menuEl 會話行選單彈層。
     * @returns {void}
     */
    function performInjection(menuEl) {
      if (!menuEl.isConnected) return;
      if (menuEl.querySelector("[" + DELETE_ITEM_ATTR + "]") !== null) return;
      if (!frontendDataReady()) return;
      const target = resolveInjectionTarget(menuEl);
      if (!target) return;
      injectItem(menuEl, target.archiveButton, target.locale, target.session, target.anchor);
    }

    /**
     * 依 INJECT_DELAY_MS 排程注入（延時關閉時直接同步注入）。
     *
     * 對同一選單僅排程一次，避免重複建立計時器。
     *
     * @param {HTMLElement} menuEl 會話行選單彈層。
     * @returns {void}
     */
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

    /**
     * 判斷選單是否符合注入條件並進入排程。
     *
     * 符合條件：外掛已套用（activeCtx 非空）、選單為元素、尚未注入、
     * 前端資料已就緒且確認為會話行選單。
     *
     * @param {HTMLElement} menuEl 候選選單元素。
     * @returns {void}
     */
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
    /**
     * 掃描頁面上所有開啟的 role="menu"，逐一嘗試注入。
     *
     * 供 React 重繪移除注入項後的重注入使用。
     *
     * @returns {void}
     */
    function injectIntoOpenMenus() {
      for (const menuEl of document.querySelectorAll('[role="menu"]')) {
        maybeInject(menuEl);
      }
    }

    // ---------- 設定頁卡片（設定 → 外掛 → 外掛設定） ----------
    // 官方為站外外掛預留的設定位置：settings.plugin.item 是一個以「設定
    // 命名空間」為鍵的 keyed slot，外掛在 host 端註冊命名空間、在瀏覽器端
    // 註冊同鍵的卡片，外掛設定頁的分頁就會把兩者配對起來渲染。
    // 卡片只負責顯示與記憶選擇；實際刪除流程目前仍固定使用「再次點擊刪除」。

    /** 下拉選單與 label 關聯用的固定 element id。 */
    const SETTINGS_FIELD_ID = "dsh-delete-session-confirm-mode";

    /**
     * 判斷設定卡片要使用的語系（"zh" 或 "en"）。
     *
     * 以核心 locale 服務寫入 <html lang> 的值為準（它跟隨使用者偏好設定），
     * 取不到時退回瀏覽器語言。每次呼叫都重新求值，因此語言切換後重新渲染
     * 就會得到新文案。
     *
     * @returns {string} 語系代碼（"zh" 或 "en"）。
     */
    function settingsLocale() {
      const declared = typeof document !== "undefined" && document.documentElement
        ? document.documentElement.getAttribute("lang")
        : null;
      const tag = String(declared || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase();
      return tag.startsWith("zh") ? "zh" : "en";
    }

    /**
     * 建立「刪除確認方式」卡片的狀態控制器。
     *
     * 控制器把 host 端 settings scope 的快照與尚未儲存的草稿合併成一份
     * 穩定引用的快照物件，供 React 元件以 useSyncExternalStore 訂閱；所有
     * 寫入都經由 scope.set / scope.unset，各自帶修訂柵欄，寫入被 host 拒絕
     * 時保留草稿並標記失敗（與官方卡片的「草稿－儲存」模型一致）。
     *
     * @param {object} scope settingsScope.bind() 回傳的命名空間 scope。
     * @returns {{getSnapshot: Function, subscribe: Function, select: Function,
     *   save: Function, discard: Function, reset: Function, refresh: Function,
     *   dispose: Function}} 卡片控制器。
     */
    function createSettingsCardController(scope) {
      const listeners = new Set();
      let draft;          // 草稿值；undefined 代表「跟隨 host 值」
      let saving = false; // 是否正在寫入 host
      let failed = false; // 最近一次寫入是否失敗
      let snapshot = null;

      // 讀取 host 端的有效值：值缺失或不在允許清單內時回退為預設值。
      const storedMode = () => {
        const section = scope.getSnapshot().value;
        const mode = section !== null && typeof section === "object" ? section[CONFIRM_MODE_FIELD] : undefined;
        return CONFIRM_MODES.indexOf(mode) >= 0 ? mode : DEFAULT_CONFIRM_MODE;
      };
      // 使用者層是否帶有此欄位：存在即代表使用者覆寫過（即使值等於預設值）。
      const isOverridden = () => {
        const user = scope.getSnapshot().user;
        return user !== null && typeof user === "object" && user[CONFIRM_MODE_FIELD] !== undefined;
      };
      // 由 scope 快照與本機草稿組出元件要渲染的狀態。
      const build = () => {
        const state = scope.getSnapshot();
        const stored = storedMode();
        const current = draft === undefined ? stored : draft;
        return {
          status: state.status,
          writable: state.writable,
          stored,
          draft: current,
          dirty: draft !== undefined && draft !== stored,
          overridden: isOverridden(),
          saving,
          failed
        };
      };
      // 發布新快照（引用每次更新，讓 React 得以比對）。
      const publish = () => {
        snapshot = build();
        for (const listener of Array.from(listeners)) {
          try {
            listener();
          } catch {
            // 單一訂閱者失敗不影響其他訂閱者。
          }
        }
      };
      const unsubscribeScope = scope.subscribe(publish);
      publish();

      // 共用寫入流程：標記 saving、執行操作、成功清除草稿、失敗標記錯誤。
      const write = (operation) => {
        if (saving) return;
        saving = true;
        failed = false;
        publish();
        Promise.resolve().then(operation).then(
          () => {
            saving = false;
            draft = undefined;
            publish();
          },
          () => {
            saving = false;
            failed = true;
            publish();
          }
        );
      };

      return {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        // 暫存使用者在選單裡的選擇；真正的寫入發生在 save()。
        select: (mode) => {
          if (CONFIRM_MODES.indexOf(mode) < 0) return;
          draft = mode;
          failed = false;
          publish();
        },
        save: () => {
          const next = draft;
          if (next === undefined) return;
          write(() => scope.set(CONFIRM_MODE_FIELD, next));
        },
        // 丟棄草稿：畫面回到 host 端的目前值。
        discard: () => {
          draft = undefined;
          failed = false;
          publish();
        },
        // 清除使用者層的覆寫，讓欄位重新繼承組合層基準值。
        reset: () => {
          draft = undefined;
          write(() => scope.unset(CONFIRM_MODE_FIELD));
        },
        refresh: publish,
        dispose: () => {
          unsubscribeScope();
          listeners.clear();
        }
      };
    }

    // 下拉選單右側的展開箭頭；與核心 PluginCard 相同語彙（向下箭頭）。
    const CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /**
     * 渲染本外掛在設定頁「外掛設定」裡的卡片。
     *
     * 命名空間尚未就緒（status 非 "ready"）時不渲染任何內容，避免在
     * host 尚未回應前顯示一張不能用的卡片。
     *
     * @param {object} props slot 注入的卡片狀態讀取器、動作與文案函式。
     * @returns {object|null} 卡片元素，或 null（命名空間不可用時）。
     */
    function DeleteConfirmCard(props) {
      const state = React.useSyncExternalStore(props.subscribeSettingsCard, props.getSettingsCard);
      const [open, setOpen] = React.useState(false);
      if (state.status !== "ready") return null;

      const t = props.t;
      const title = t("settingsCardTitle");
      const locked = !state.writable || state.saving;
      const selected = state.draft;

      // 三個選項：文案與說明都取自字典，順序與 CONFIRM_MODES 相同。
      const options = CONFIRM_MODES.map((mode) => React.createElement(
        "option",
        { key: mode, value: mode },
        t(CONFIRM_MODE_LABEL_KEYS[mode])
      ));

      const header = React.createElement(
        "button",
        {
          type: "button",
          className: "dshds-setcard-header",
          "aria-expanded": open,
          "aria-label": t(open ? "settingsCollapse" : "settingsExpand") + ": " + title,
          onClick: () => setOpen(!open)
        },
        React.createElement(
          "span",
          { className: "dshds-setcard-headText" },
          React.createElement("span", { className: "dshds-setcard-name" }, title),
          React.createElement("span", { className: "dshds-setcard-description" }, t("settingsCardDescription"))
        ),
        state.dirty ? React.createElement("span", { className: "dshds-setcard-pending" }, t("settingsUnsaved")) : null,
        React.createElement("span", {
          className: "dshds-setcard-chevron" + (open ? " dshds-setcard-chevronOpen" : ""),
          dangerouslySetInnerHTML: { __html: CHEVRON_SVG }
        })
      );

      const field = React.createElement(
        "div",
        { className: "dshds-setfield" },
        React.createElement(
          "div",
          { className: "dshds-setfield-head" },
          React.createElement("label", { className: "dshds-setfield-label", htmlFor: SETTINGS_FIELD_ID }, t("settingsFieldLabel")),
          state.overridden
            ? React.createElement(
                "span",
                { className: "dshds-setfield-badges" },
                React.createElement("span", { className: "dshds-setfield-tag" }, t("settingsOverridden")),
                React.createElement(
                  "button",
                  {
                    type: "button",
                    className: "dshds-setfield-reset",
                    disabled: locked,
                    onClick: props.resetSettingsCard
                  },
                  t("settingsReset")
                )
              )
            : null
        ),
        React.createElement(
          "select",
          {
            id: SETTINGS_FIELD_ID,
            className: "dshds-setfield-select",
            value: selected,
            disabled: locked,
            onChange: (event) => props.selectSettingsCard(event.target.value)
          },
          options
        ),
        React.createElement(
          "p",
          { className: "dshds-setfield-hint" },
          t(CONFIRM_MODE_HINT_KEYS[selected]) + " " + t("settingsPendingNote")
        )
      );

      const footer = React.createElement(
        "div",
        { className: "dshds-setcard-footer" },
        state.failed ? React.createElement("p", { className: "dshds-setcard-failed", role: "status" }, t("settingsSaveFailed")) : null,
        React.createElement(
          "button",
          {
            type: "button",
            className: "dshds-setcard-discard",
            disabled: !state.dirty || state.saving,
            onClick: props.discardSettingsCard
          },
          t("settingsDiscard")
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "dshds-setcard-save",
            disabled: !state.dirty || state.saving,
            onClick: props.saveSettingsCard
          },
          t(state.saving ? "settingsSaving" : "settingsSave")
        )
      );

      return React.createElement(
        "li",
        { className: "dshds-setcard" + (open ? " dshds-setcardOpen" : "") },
        header,
        open
          ? React.createElement(
              "div",
              { className: "dshds-setcard-body" },
              state.writable ? null : React.createElement("p", { className: "dshds-setcard-readOnly", role: "status" }, t("settingsReadOnly")),
              field,
              footer
            )
          : null
      );
    }

    /**
     * 註冊設定頁卡片：等待 slots 與 settingsScope 兩個瀏覽器服務就緒後，
     * 把卡片註冊進 settings.plugin.item（鍵為本外掛的設定命名空間）。
     *
     * 以 ctx.inject 等待服務，而不是放進外掛層級的 inject：服務缺席的部署
     * （非 web 或舊版）照常使用刪除功能，只是設定頁不會出現本卡片。
     *
     * @param {object} ctx 客戶端外掛上下文。
     * @returns {void}
     */
    function mountSettingsCard(ctx) {
      // 卡片以 useSyncExternalStore 訂閱狀態，需要 React 18 以上。
      if (typeof React.useSyncExternalStore !== "function") return;
      ctx.inject(["slots", "settingsScope"], (uiCtx) => {
        // 設定卡片的任何註冊失敗都只影響設定頁；刪除功能必須照常運作，
        // 因此整段包在 try/catch 內，失敗時僅在主控台留下診斷訊息。
        try {
          const scope = uiCtx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
          const controller = createSettingsCardController(scope);
          // 卡片狀態（scope 訂閱與本機監聽器）隨外掛卸載一併釋放。
          uiCtx.effect(() => () => controller.dispose(), "delete-session: settings card state");
          // 語言切換時重新發布快照，讓卡片文案跟著更新。
          uiCtx.effect(() => uiCtx.on("locale/change", () => controller.refresh()), "delete-session: settings card locale");
          // 固定的注入面：函式引用穩定，元件可安全地以它們訂閱／觸發動作。
          const face = {
            getSettingsCard: () => controller.getSnapshot(),
            subscribeSettingsCard: (listener) => controller.subscribe(listener),
            selectSettingsCard: (mode) => controller.select(mode),
            saveSettingsCard: () => controller.save(),
            discardSettingsCard: () => controller.discard(),
            resetSettingsCard: () => controller.reset(),
            t: (key) => (STRINGS[settingsLocale()] ?? STRINGS.en)[key] ?? key
          };
          uiCtx.slots.inject("settings.plugin.item", () => uiCtx.slots.register({
            name: "settings.plugin.item",
            key: SETTINGS_NAMESPACE,
            inject: () => face
          }, DeleteConfirmCard));
        } catch (error) {
          console.warn("[delete-session] failed to register the settings card:", error);
        }
      });
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
      ".dshds-btn-ok:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      // 設定頁卡片（設定 → 外掛 → 外掛設定）：外觀對齊核心 PluginCard 的語彙。
      ".dshds-setcard{box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);border-radius:16px;list-style:none;transition:border-color .16s,background .16s;}",
      ".dshds-setcard:hover{border-color:var(--dsw-alias-label-dimmed);}",
      ".dshds-setcardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed);}",
      ".dshds-setcard-header{appearance:none;box-sizing:border-box;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex;}",
      ".dshds-setcard-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}",
      ".dshds-setcard-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex;}",
      ".dshds-setcard-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4;}",
      ".dshds-setcard-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5;}",
      ".dshds-setcard-pending{border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-secondary);flex:none;padding:1px 6px;font-size:11px;line-height:1.5;}",
      ".dshds-setcard-chevron{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex;transition:transform .16s;}",
      ".dshds-setcard-chevronOpen{transform:rotate(180deg);}",
      ".dshds-setcard-body{border-top:.5px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px;}",
      ".dshds-setcard-readOnly{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5;}",
      ".dshds-setcard-footer{border-top:.5px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex;}",
      ".dshds-setcard-failed{min-width:0;color:var(--dsw-alias-label-error);flex:1;margin:0;font-size:12px;line-height:1.5;}",
      ".dshds-setcard-discard,.dshds-setcard-save{appearance:none;box-sizing:border-box;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;}",
      ".dshds-setcard-discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0;}",
      ".dshds-setcard-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed);}",
      ".dshds-setcard-save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base);}",
      ".dshds-setcard-save:hover:not(:disabled){filter:brightness(1.08);}",
      ".dshds-setcard-save:disabled,.dshds-setcard-discard:disabled{opacity:.5;cursor:default;}",
      ".dshds-setfield{flex-direction:column;gap:6px;padding:12px 0;display:flex;}",
      ".dshds-setfield-head{align-items:center;gap:8px;display:flex;}",
      ".dshds-setfield-label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5;}",
      ".dshds-setfield-badges{align-items:center;gap:8px;display:inline-flex;}",
      ".dshds-setfield-tag{border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;color:var(--dsw-alias-label-secondary);padding:1px 6px;font-size:11px;line-height:1.5;}",
      ".dshds-setfield-reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5;}",
      ".dshds-setfield-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary);}",
      ".dshds-setfield-reset:disabled{cursor:default;opacity:.5;}",
      ".dshds-setfield-select{border:.5px solid var(--dsw-alias-border-l4);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5;}",
      ".dshds-setfield-select:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none;}",
      ".dshds-setfield-select:disabled{color:var(--dsw-alias-label-tertiary);cursor:default;}",
      ".dshds-setfield-select option{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);}",
      ".dshds-setfield-hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5;}"
    ].join("\n");

    /**
     * 注入外掛樣式表（冪等，已存在時不重複注入）。
     *
     * @returns {void}
     */
    function mountStyle() {
      if (typeof document === "undefined") return;
      if (document.querySelector(STYLE_SELECTOR) !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-delete-session";
      tag.dataset.pluginCss = CSS_TAG_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    /**
     * 移除外掛樣式表（外掛卸載時呼叫）。
     *
     * @returns {void}
     */
    function unmountStyle() {
      if (typeof document === "undefined") return;
      const tag = document.querySelector(STYLE_SELECTOR);
      if (tag !== null) tag.remove();
    }

    // ---------- MutationObserver ----------
    /**
     * 收集指定根元素（含其本身與後代）中的所有選單元素。
     *
     * @param {HTMLElement} rootEl 欲掃描的根元素。
     * @returns {HTMLElement[]} 找到的 role="menu" 元素陣列。
     */
    function collectMenus(rootEl) {
      const menus = [];
      if (rootEl.matches('[role="menu"]')) menus.push(rootEl);
      for (const child of rootEl.querySelectorAll('[role="menu"]')) menus.push(child);
      return menus;
    }

    /**
     * MutationObserver 回呼：處理新增／移除節點。
     *
     * 新增節點內若含有選單即嘗試注入；若偵測到我們注入的項目被移除
     * （React 重繪），於微任務內重新掃描並注入。
     *
     * @param {MutationRecord[]} mutations 本批變動紀錄。
     * @returns {void}
     */
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

    /**
     * 瀏覽器端外掛入口：掛載樣式、點擊捕捉、MutationObserver 與設定頁卡片。
     *
     * 回傳的 cleanup 會移除全部監聽器、計時器、彈窗與樣式，確保卸載乾淨。
     *
     * @param {object} ctx 客戶端執行期上下文（提供 sessions、workspaces）。
     * @returns {void}
     */
    function apply(ctx) {
      activeCtx = ctx;
      mountStyle();
      // 設定頁卡片：等待 slots 與 settingsScope 服務就緒後自行註冊。
      mountSettingsCard(ctx);

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
