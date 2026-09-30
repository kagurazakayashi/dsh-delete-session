window.__ModuleLoader__.load({
  id: "@kagurazakayashi/dsh-delete-session",
  factory: (require) => {
    "use strict";

    // shell 以高順位的 seed 模組表提供 React；選單項與設定卡片都用它渲染。
    const React = require("react");

    // =====================================================================
    // dsh-delete-session（瀏覽器端）
    //
    // 以官方槽位註冊「刪除會話」選單項：
    //   sidebar.workspaces.session.menu.item（由 dsh-client-ui-workspace 宣告）
    // 槽位直接提供 owner props { sessionId, displayTitle } 與 useMenuOpenState
    // 鉤子，因此不再需要監聽 DOM（點擊捕捉、MutationObserver、解析 aria-label、
    // 克隆「歸檔會話」項目、以相對時間比對會話）。
    //
    // 設定頁卡片註冊進 plugins.bundle.config（以 npm 包名為鍵），透過
    // ctx.configForms.get(SETTINGS_NAMESPACE) 讀寫 host 端 Config 的 volatile
    // 欄位。0.2.0 起設定命名空間就是 profile 入口 id（本外掛 cordis.patch.yml
    // 宣告的 id：delete-session），舊版的 settingsScope 服務與
    // settings.plugin.item 槽位都已移除。
    //
    // 三種確認方式（再次點擊／彈出對話框／直接刪除）最終都只有一條真正刪除
    // 的路徑：POST /delete-session/delete。刪除失敗時以純 DOM 對話框提示原因。
    // =====================================================================

    const ROUTE = "/delete-session/delete";
    /** 本外掛的設定命名空間＝profile 入口 id。 */
    const SETTINGS_NAMESPACE = "delete-session";
    /** host 端 Config 中承載「刪除確認方式」的欄位名稱。 */
    const CONFIRM_MODE_FIELD = "confirmMode";
    /** 三種確認方式；順序即設定卡片下拉選單的顯示順序。 */
    const CONFIRM_MODES = ["click-again", "dialog", "instant"];
    /** 預設值：與 host 端 Config schema 的預設一致。 */
    const DEFAULT_CONFIRM_MODE = "click-again";
    /** 設定卡片文案的字典命名空間。 */
    const LOCALE_NS = "delete-session";
    /** 本外掛的 npm 包名：plugins.bundle.config 以它為鍵。 */
    const PACKAGE_NAME = "@kagurazakayashi/dsh-delete-session";
    /** 選單項在會話「…」選單中的識別碼與位置（內建 archive 為 400）。 */
    const MENU_ITEM_ID = "delete-session";
    const MENU_ITEM_ORDER = 450;
    /** 設定卡片下拉選單與 label 關聯用的固定 element id。 */
    const SETTINGS_FIELD_ID = "dsh-delete-session-confirm-mode";

    /** 設定卡片中每個確認方式對應的文案鍵。 */
    const CONFIRM_MODE_LABEL_KEYS = {
      "click-again": "modeClickAgain",
      dialog: "modeDialog",
      instant: "modeInstant"
    };
    /** 設定卡片中每個確認方式對應的說明文案鍵。 */
    const CONFIRM_MODE_HINT_KEYS = {
      "click-again": "modeClickAgainHint",
      dialog: "modeDialogHint",
      instant: "modeInstantHint"
    };

    // ---------- 多語文案 ----------
    const STRINGS = {
      zh: {
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
        dialogTitle: "删除会话",
        dialogMessage: "确定要永久删除会话「{name}」吗？此操作无法撤销。",
        dialogConfirm: "删除",
        dialogCancel: "取消"
      },
      en: {
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
        dialogTitle: "Delete session",
        dialogMessage: "Permanently delete the session \"{name}\"? This cannot be undone.",
        dialogConfirm: "Delete",
        dialogCancel: "Cancel"
      },
      "zh-TW": {
        menuDeleteSession: "刪除工作階段",
        menuDeleteConfirm: "再次點擊即可刪除",
        errorTitle: "刪除失敗",
        ok: "確定",
        liveSession: "無法刪除正在執行任務的工作階段，請等待任務結束後再試一次",
        notFound: "工作階段不存在或已被刪除",
        genericError: "刪除失敗，請稍後再試",
        networkError: "網路請求失敗，請稍後再試",
        settingsCardTitle: "刪除工作階段",
        settingsCardDescription: "選擇從工作階段選單刪除工作階段時的確認方式。",
        settingsFieldLabel: "刪除確認方式",
        settingsOverridden: "已覆寫",
        settingsReset: "重設為預設值",
        settingsUnsaved: "尚未儲存",
        settingsSave: "儲存",
        settingsSaving: "儲存中…",
        settingsDiscard: "捨棄",
        settingsSaveFailed: "儲存失敗，請再試一次",
        settingsReadOnly: "目前部署不允許寫入設定，此處僅供檢視。",
        settingsExpand: "展開",
        settingsCollapse: "收合",
        modeClickAgain: "再次點擊即可刪除",
        modeClickAgainHint: "第一次點擊會進入警示狀態，第二次點擊才會真正刪除（預設，最安全）",
        modeDialog: "顯示對話框後刪除",
        modeDialogHint: "點擊後會在對話框中確認，確認後才會刪除",
        modeInstant: "直接刪除（危險）",
        modeInstantHint: "點擊後立即刪除，沒有任何二次確認，可能誤刪工作階段",
        dialogTitle: "刪除工作階段",
        dialogMessage: "確定要永久刪除工作階段「{name}」嗎？此操作無法復原。",
        dialogConfirm: "刪除",
        dialogCancel: "取消"
      },
      ja: {
        menuDeleteSession: "セッションを削除",
        menuDeleteConfirm: "もう一度クリックで削除",
        errorTitle: "削除に失敗しました",
        ok: "OK",
        liveSession: "タスクを実行中のセッションは削除できません。タスクの終了後にもう一度お試しください",
        notFound: "セッションが存在しないか、すでに削除されています",
        genericError: "削除に失敗しました。しばらくしてからもう一度お試しください",
        networkError: "ネットワーク要求に失敗しました。しばらくしてからもう一度お試しください",
        settingsCardTitle: "セッションを削除",
        settingsCardDescription: "セッション一覧のメニューから削除するときの確認方法を選択します。",
        settingsFieldLabel: "削除の確認方法",
        settingsOverridden: "カスタマイズ済み",
        settingsReset: "既定値に戻す",
        settingsUnsaved: "未保存",
        settingsSave: "保存",
        settingsSaving: "保存中…",
        settingsDiscard: "破棄",
        settingsSaveFailed: "保存に失敗しました。もう一度お試しください",
        settingsReadOnly: "このデプロイでは設定を書き込めません。ここでは閲覧のみ可能です。",
        settingsExpand: "展開",
        settingsCollapse: "折りたたむ",
        modeClickAgain: "もう一度クリックで削除",
        modeClickAgainHint: "1 回目のクリックで警告状態になり、2 回目のクリックで実際に削除します（既定値、最も安全）",
        modeDialog: "ダイアログで確認して削除",
        modeDialogHint: "クリックするとダイアログが表示され、確認したときだけ削除します",
        modeInstant: "すぐに削除（危険）",
        modeInstantHint: "クリックすると確認なしで即座に削除します。誤ってセッションを削除するおそれがあります",
        dialogTitle: "セッションを削除",
        dialogMessage: "セッション「{name}」を完全に削除しますか？この操作は元に戻せません。",
        dialogConfirm: "削除",
        dialogCancel: "キャンセル"
      }
    };

    // 繁體變體共用同一份台灣繁體字典：產品政策要求 zh-HK、zh-MO、zh-Hant
    // 一律顯示台灣繁體，因此直接指向同一個物件，而不是各自複製一份文案
    // （避免日後改字時各變體不同步）。
    STRINGS["zh-HK"] = STRINGS["zh-TW"];
    STRINGS["zh-MO"] = STRINGS["zh-TW"];
    STRINGS["zh-Hant"] = STRINGS["zh-TW"];

    // ---------- 圖示 ----------
    /** 垃圾桶圖標：與核心原語 IconDeleteOutline 相同語彙。 */
    const TRASH_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4h11M6.5 4V2.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75V4m-6.5 0 .6 8.2a1.25 1.25 0 0 0 1.25 1.16h4.8a1.25 1.25 0 0 0 1.25-1.16l.6-8.2M6.5 7v3.5M9.5 7v3.5"/></svg>';
    /** 警示圖標：與核心原語 IconWarningOutline16 相同的路徑（警示三角 + 驚嘆號）。 */
    const WARNING_SVG = '<svg width="16" height="16" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6.3002 3.32843L7.69986 3.32843L7.69986 7.79657H6.3002L6.3002 3.32843Z" fill="currentColor"/><path d="M6.3002 9.01935H7.69986V10.6711H6.3002V9.01935Z" fill="currentColor"/><path d="M12.6328 6.99976C12.6328 3.88874 10.111 1.36694 7 1.36694C3.88899 1.36695 1.3672 3.88875 1.36719 6.99976C1.36719 10.1108 3.88899 12.6326 7 12.6326C10.111 12.6326 12.6328 10.1108 12.6328 6.99976ZM13.8582 6.99976C13.8582 10.7873 10.7876 13.8579 7 13.8579C3.21244 13.8579 0.141846 10.7873 0.141846 6.99976C0.141857 3.2122 3.21245 0.141612 7 0.141602C10.7876 0.141602 13.8581 3.21219 13.8582 6.99976Z" fill="currentColor"/></svg>';
    // 下拉選單右側的展開箭頭；與核心 PluginCard 相同語彙（向下箭頭）。
    const CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M3.5 5.25 7 8.75l3.5-3.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    /** apply() 時設定的 client 根 context（供刪除後刷新清單與讀取語系）。 */
    let activeCtx = null;

    /**
     * 解析目前生效的語系標籤（原始標籤，例如 "zh-tw"、"zh-hant"、"ja"、"en"）。
     *
     * 僅作為 fallback：對話框優先使用槽位提供的 t（與選單項同一套字典解析，
     * 因此必定與畫面語言一致）；只有在 t 缺席（例如直接呼叫內部函式）時才
     * 退回此處。以核心 locale 服務快照的 active 欄位為準（getSnapshot() 回傳
     * 的是 LocaleSnapshot 物件，不是字串），再退回 <html lang> 與瀏覽器語言。
     *
     * 此處刻意只回傳已轉小寫的標籤，不做簡繁二分：標籤要交給 stringsFor
     * 逐層回退，zh-Hant／zh-HK／zh-MO 才不會被硬併成簡體 zh。
     *
     * @returns {string} 已轉小寫的語系標籤（例如 "zh-tw"、"zh-hant"、"ja"、"en"）。
     */
    function modalLocale() {
      let active = null;
      try {
        const snapshot = activeCtx && activeCtx.locale && typeof activeCtx.locale.getSnapshot === "function"
          ? activeCtx.locale.getSnapshot()
          : null;
        if (snapshot !== null && typeof snapshot === "object" && typeof snapshot.active === "string") active = snapshot.active;
      } catch {
        // 落到下方的回退路徑。
      }
      const declared = typeof document !== "undefined" && document.documentElement
        ? document.documentElement.getAttribute("lang")
        : null;
      const tag = String(active || declared || (typeof navigator !== "undefined" ? navigator.language : "") || "en").toLowerCase();
      return tag;
    }

    /**
     * 繁體變體的語系回退鏈：任一繁體變體最終都指向台灣繁體，再逐層退回。
     */
    const LOCALE_FALLBACKS = {
      "zh-hk": "zh-tw",
      "zh-mo": "zh-tw",
      "zh-hant": "zh-tw",
      "zh-tw": "zh"
    };

    /**
     * 以小寫標籤索引字典。
     *
     * STRINGS 的鍵保留標準大小寫（"zh-TW"、"zh-Hant"），而語系標籤在比對前
     * 一律轉小寫，因此另建這張大小寫不拘的索引表。
     */
    const STRINGS_BY_TAG = (() => {
      const table = Object.create(null);
      for (const tag of Object.keys(STRINGS)) table[tag.toLowerCase()] = STRINGS[tag];
      return table;
    })();

    /**
     * 依回退鏈取得字典：zh-Hant / zh-HK / zh-MO → zh-TW → zh → en；ja → en。
     * 找不到任何一層時退回英文，確保永遠有可用文案。
     *
     * 逐層嘗試的順序為：完整標籤 → 逐段截短的標籤（BCP-47 前綴鏈，例如
     * "zh-Hant-HK" 先試 "zh-hant"、"ja-JP" 先試 "ja"）→ 明確宣告的
     * LOCALE_FALLBACKS → STRINGS.en。先走前綴鏈是為了守住產品政策：任何
     * 帶繁體子標籤的標籤都不會在截短的過程中掉進簡體字典。
     *
     * @param {string} tag 語系代碼（大小寫不拘）。
     * @returns {Object} 對應的字典物件。
     */
    function stringsFor(tag) {
      const seen = new Set();
      let current = typeof tag === "string" ? tag.trim().toLowerCase() : "";
      while (current.length > 0 && !seen.has(current)) {
        seen.add(current);
        const direct = STRINGS_BY_TAG[current];
        if (direct !== undefined) return direct;
        // 先截掉最後一段子標籤（zh-hant-hk → zh-hant），再走宣告的回退鏈。
        const cut = current.lastIndexOf("-");
        const truncated = cut > 0 ? current.slice(0, cut) : "";
        // 以 hasOwnProperty 查表：避免 "constructor" 之類的標籤命中 Object.prototype。
        const fallback = Object.prototype.hasOwnProperty.call(LOCALE_FALLBACKS, current)
          ? LOCALE_FALLBACKS[current]
          : undefined;
        if (truncated.length > 0 && !seen.has(truncated)) current = truncated;
        else if (fallback !== undefined && !seen.has(fallback)) current = fallback;
        else break; // seen 已擋住環路，直接結束。
      }
      return STRINGS.en;
    }

    /**
     * 取得對話框要用的文案函式。
     *
     * 優先用槽位注入的 t（框架以本外掛註冊的字典與目前生效語系解析，與選單項
     * 完全同一條路徑）；沒有 t 時才退回自建的字典查表。
     *
     * @param {Function} [t] 槽位注入的文案函式。
     * @returns {Function} 接受文案鍵並回傳字串的函式。
     */
    function dialogText(t) {
      if (typeof t === "function") return t;
      const strings = stringsFor(modalLocale());
      return (key) => (strings[key] !== undefined ? strings[key] : key);
    }

    // ---------- 目前生效的刪除確認方式 ----------
    // 預設值與 host 端 Config schema 的預設一致；設定卡片就緒後改由
    // configForms 表單接管（快照隨 host 提交即時更新），表單缺席時維持預設值。
    let confirmModeSource = () => DEFAULT_CONFIRM_MODE;

    /**
     * 讀取目前生效的刪除確認方式。
     *
     * 值不在允許清單內（設定尚未載入、host 回傳非預期值、來源拋錯）時一律
     * 回退為預設值，確保刪除流程永遠有一條明確且安全的確認路徑。
     *
     * @returns {string} "click-again"、"dialog" 或 "instant"。
     */
    function currentConfirmMode() {
      let mode;
      try {
        mode = confirmModeSource();
      } catch {
        return DEFAULT_CONFIRM_MODE;
      }
      return CONFIRM_MODES.indexOf(mode) >= 0 ? mode : DEFAULT_CONFIRM_MODE;
    }

    // ---------- 兩段式確認狀態 ----------
    // 以 sessionId 記憶「已點擊一次」的警示狀態；ARM_HOLD_MS 視窗內選單
    // 關閉重開仍會以警示樣式呈現，第二次點擊即直接刪除。狀態僅存於記憶體，
    // 且只在「再次點擊刪除」模式下有意義。
    const ARM_HOLD_MS = 8000;
    const armedSessions = new Map(); // sessionId → 解除警示的計時器 id
    /** 警示狀態的訂閱者：選單項以 useSyncExternalStore 訂閱它。 */
    const armedListeners = new Set();

    /** 通知所有訂閱者警示狀態已變更。 */
    function notifyArmedChanged() {
      for (const listener of Array.from(armedListeners)) {
        try {
          listener();
        } catch {
          // 單一訂閱者失敗不影響其他訂閱者。
        }
      }
    }

    /**
     * 解除指定會話的警示（兩段式確認）狀態，並清除其倒數計時器。
     *
     * @param {string} sessionId 會話唯一識別碼。
     * @returns {void}
     */
    function disarmSession(sessionId) {
      const timer = armedSessions.get(sessionId);
      if (timer !== undefined) clearTimeout(timer);
      const had = armedSessions.delete(sessionId);
      if (had) notifyArmedChanged();
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
        notifyArmedChanged();
      }, ARM_HOLD_MS);
      armedSessions.set(sessionId, timer);
      notifyArmedChanged();
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
      notifyArmedChanged();
    }

    // ---------- 對話框（純 DOM，不使用 React） ----------
    // 兩種用途共用同一套骨架：刪除失敗的錯誤提示，以及「彈出對話框刪除」
    // 模式的確認對話框。同一時間只會有一個對話框存在。
    let modalRoot = null;
    let modalState = null;

    /**
     * 取得（必要時建立）彈窗的根容器元素。
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
     * 關閉並移除彈窗，同時釋放其事件監聽器。
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
     * 顯示一個純 DOM 對話框（不依賴 React）。
     *
     * 共用骨架為遮罩 + 卡片 + 標題 + 說明 + 按鈕列，支援 Escape 鍵與點擊
     * 遮罩關閉；呼叫端只提供文案與按鈕行為。同一時間只保留一個對話框，
     * 因此每次開啟都先關閉上一個。
     *
     * @param {object} spec 對話框內容。
     * @param {string} spec.title 標題文字。
     * @param {string} spec.message 說明文字。
     * @param {Array<{label: string, className: string, onClick: Function}>} spec.buttons
     *   按鈕定義，依序渲染；第一個按鈕取得初始焦點（呼叫端把安全選項排在最前）。
     * @returns {void}
     */
    function presentModal(spec) {
      closeModal();
      const root = ensureModalRoot();

      const overlay = document.createElement("div");
      overlay.className = "dshds-overlay";

      const card = document.createElement("div");
      card.className = "dshds-card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-modal", "true");

      const titleEl = document.createElement("div");
      titleEl.className = "dshds-title";
      titleEl.textContent = spec.title;

      const descEl = document.createElement("p");
      descEl.className = "dshds-desc";
      descEl.textContent = spec.message;

      const actions = document.createElement("div");
      actions.className = "dshds-actions";

      const buttonEls = spec.buttons.map((definition) => {
        const element = document.createElement("button");
        element.type = "button";
        element.className = definition.className;
        element.textContent = definition.label;
        element.addEventListener("click", () => definition.onClick());
        actions.appendChild(element);
        return element;
      });

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

      document.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("click", onOverlayClick);

      modalState = { dispose };
      if (buttonEls.length > 0) buttonEls[0].focus();
    }

    /**
     * 顯示純 DOM 建構的錯誤彈窗（不依賴 React）。
     *
     * 僅用於刪除失敗時提示原因，不含任何確認按鈕，支援 Escape 鍵與
     * 點擊遮罩關閉。
     *
     * @param {string} message 錯誤描述文字（已在地化）。
     * @param {Function} t 文案函式（接受文案鍵，回傳已本地化字串）。
     * @returns {void}
     */
    function showErrorModal(message, t) {
      presentModal({
        title: t("errorTitle"),
        message,
        buttons: [{
          label: t("ok"),
          className: "dshds-btn dshds-btn-ok",
          onClick: () => closeModal()
        }]
      });
    }

    /**
     * 顯示刪除確認對話框（「彈出對話框刪除」模式）。
     *
     * 只有按下確認鈕才會執行 onConfirm；取消、Escape 或點擊遮罩都只是關閉
     * 對話框。為降低誤刪風險，初始焦點放在「取消」上，且確認鈕為唯一的
     * 危險色按鈕。
     *
     * @param {{id: string, displayTitle?: string}} session 目標會話摘要。
     * @param {Function} t 文案函式（接受文案鍵，回傳已本地化字串）。
     * @param {Function} onConfirm 使用者確認後要執行的動作。
     * @returns {void}
     */
    function showConfirmModal(session, t, onConfirm) {
      const title = typeof session.displayTitle === "string" && session.displayTitle.length > 0
        ? session.displayTitle
        : session.id;
      presentModal({
        title: t("dialogTitle"),
        // 以函式形式代入，避免會話標題中的 $ 等字元被當成替換樣式。
        message: t("dialogMessage").replace("{name}", () => title),
        buttons: [
          {
            label: t("dialogCancel"),
            className: "dshds-btn dshds-btn-ok",
            onClick: () => closeModal()
          },
          {
            label: t("dialogConfirm"),
            className: "dshds-btn dshds-btn-danger",
            onClick: () => {
              closeModal();
              onConfirm();
            }
          }
        ]
      });
    }

    /**
     * 呼叫 host 端刪除路由，並處理成功／失敗後的介面更新。
     *
     * 失敗時依錯誤碼顯示對應文案；成功時刷新 sessions 清單（刷新失敗僅忽略，
     * 不影響已完成的刪除）。
     *
     * @param {{id: string, displayTitle?: string}} session 目標會話摘要（含 id）。
     * @param {Function} t 文案函式（接受文案鍵，回傳已本地化字串）。
     * @returns {Promise<void>}
     */
    async function deleteSession(session, t) {
      let response;
      try {
        response = await fetch(ROUTE, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId: session.id })
        });
      } catch {
        disarmSession(session.id);
        showErrorModal(t("networkError"), t);
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
        if (code === "LIVE_SESSION") showErrorModal(t("liveSession"), t);
        else if (code === "NOT_FOUND") showErrorModal(t("notFound"), t);
        else showErrorModal(t("genericError"), t);
        return;
      }
      disarmSession(session.id);
      // 刪除已成功；刷新為盡力而為。host 端的 archiveSession 會經
      // host/archived-sessions-changed 廣播讓側欄即時隱藏該會話，
      // 這裡只需刷新會話清單。
      if (activeCtx && activeCtx.sessions && typeof activeCtx.sessions.refresh === "function") {
        try {
          await activeCtx.sessions.refresh();
        } catch {
          // 忽略刷新失敗：清單會在下次刷新或重新載入後消失。
        }
      }
    }

    // ---------- 會話「…」選單項（官方槽位） ----------

    /**
     * 訂閱警示狀態：useSyncExternalStore 的 subscribe 參數。
     *
     * @param {Function} listener 狀態變更回呼。
     * @returns {Function} 取消訂閱函式。
     */
    function subscribeArmed(listener) {
      armedListeners.add(listener);
      return () => {
        armedListeners.delete(listener);
      };
    }

    /**
     * 渲染會話「…」選單中的「刪除會話」項目。
     *
     * 由 sidebar.workspaces.session.menu.item 槽位渲染，owner props 提供
     * sessionId 與 displayTitle；選單開關狀態由槽位宣告的 useMenuOpenState
     * 鉤子提供。三種確認方式的行為：
     *   - instant：關閉選單後立即刪除。
     *   - dialog：關閉選單後彈出確認對話框，確認才刪除。
     *   - click-again（預設）：第一次點擊進入警示狀態且不關閉選單，
     *     第二次點擊才關閉選單並刪除。
     *
     * @param {object} props 槽位注入的 owner props、t 與鉤子。
     * @returns {object} 選單項元素。
     */
    function DeleteSessionMenuItem(props) {
      const sessionId = props.sessionId;
      const displayTitle = props.displayTitle;
      const t = props.t;
      const [, setMenuOpen] = props.useMenuOpenState();
      // 警示狀態存於模組層（選單關閉重開仍保有 ARM_HOLD_MS 視窗），
      // 因此以外部 store 訂閱，而非元件內 state。
      const armed = React.useSyncExternalStore(subscribeArmed, () => isSessionArmed(sessionId));
      // 請求進行中的重入防護：以 ref 判斷，避免同一輪事件中重複觸發。
      const busyRef = React.useRef(false);

      const perform = () => {
        if (busyRef.current) return;
        busyRef.current = true;
        setMenuOpen(false);
        void deleteSession({ id: sessionId, displayTitle }, dialogText(t));
      };

      const onClick = () => {
        const mode = currentConfirmMode();
        if (mode === "instant") {
          perform();
          return;
        }
        if (mode === "dialog") {
          if (busyRef.current) return;
          setMenuOpen(false);
          showConfirmModal({ id: sessionId, displayTitle }, dialogText(t), perform);
          return;
        }
        // 再次點擊刪除（預設）：第一次點擊只進入警示狀態。
        if (!isSessionArmed(sessionId)) {
          armSession(sessionId);
          return;
        }
        perform();
      };

      return React.createElement(
        "div",
        { className: "dshds-menuWrap" },
        React.createElement(
          "button",
          {
            type: "button",
            role: "menuitem",
            className: "dshds-menuItem" + (armed ? " dshds-menuItemArmed" : ""),
            onClick
          },
          React.createElement("span", {
            className: "dshds-menuIcon",
            dangerouslySetInnerHTML: { __html: armed ? WARNING_SVG : TRASH_SVG }
          }),
          React.createElement(
            "span",
            { className: "dshds-menuLabel" },
            t(armed ? "menuDeleteConfirm" : "menuDeleteSession")
          )
        )
      );
    }

    /**
     * 把「刪除會話」選單項註冊進官方會話列選單槽位。
     *
     * slots.inject 會等到該槽位被宣告（dsh-client-ui-workspace 宣告）才註冊；
     * 未組合該外掛的部署不會留下任何痕跡。
     *
     * @param {object} ctx 客戶端外掛上下文（提供 slots）。
     * @returns {void}
     */
    function mountSessionMenuItem(ctx) {
      ctx.slots.inject("sidebar.workspaces.session.menu.item", () => ctx.slots.register({
        name: "sidebar.workspaces.session.menu.item",
        id: MENU_ITEM_ID,
        order: MENU_ITEM_ORDER,
        locale: LOCALE_NS
      }, DeleteSessionMenuItem));
    }

    // ---------- 設定頁卡片（設定 → 外掛 → 該外掛的設定頁） ----------

    /**
     * 建立「刪除確認方式」卡片的狀態控制器。
     *
     * 控制器把 host 端設定表單的快照與尚未儲存的草稿合併成一份穩定引用的
     * 快照物件，供 React 元件以 useSyncExternalStore 訂閱；所有寫入都經由
     * form.set / form.unset，各自帶修訂柵欄，寫入被 host 拒絕時保留草稿並
     * 標記失敗。
     *
     * @param {object} form ctx.configForms.get() 回傳的設定表單。
     * @returns {{getSnapshot: Function, subscribe: Function, select: Function,
     *   save: Function, discard: Function, reset: Function, refresh: Function,
     *   dispose: Function}} 卡片控制器。
     */
    function createSettingsCardController(form) {
      const listeners = new Set();
      let draft;          // 草稿值；undefined 代表「跟隨 host 值」
      let saving = false; // 是否正在寫入 host
      let failed = false; // 最近一次寫入是否失敗
      let snapshot = null;

      // 讀取 host 端的有效值：值缺失或不在允許清單內時回退為預設值。
      const storedMode = () => {
        const section = form.getSnapshot().value;
        const mode = section !== null && typeof section === "object" ? section[CONFIRM_MODE_FIELD] : undefined;
        return CONFIRM_MODES.indexOf(mode) >= 0 ? mode : DEFAULT_CONFIRM_MODE;
      };
      // 使用者層是否帶有此欄位：存在即代表使用者覆寫過（即使值等於預設值）。
      const isOverridden = () => {
        const user = form.getSnapshot().user;
        return user !== null && typeof user === "object" && user[CONFIRM_MODE_FIELD] !== undefined;
      };
      // 由表單快照與本機草稿組出元件要渲染的狀態。
      const build = () => {
        const state = form.getSnapshot();
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
      const unsubscribeForm = form.subscribe(publish);
      publish();

      // 共用寫入流程：標記 saving、執行操作、成功清除草稿、失敗標記錯誤。
      const write = (operation) => {
        if (saving) return;
        saving = true;
        failed = false;
        publish();
        Promise.resolve().then(operation).then(
          (accepted) => {
            saving = false;
            // false 代表 host 拒絕或寫入被略過；此時保留草稿讓使用者重試。
            if (accepted === false) failed = true;
            else draft = undefined;
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
        // 目前 host 端的已保存值（不含草稿）：刪除流程以此為準。
        currentMode: storedMode,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        // 暫存使用者在卡片裡的選擇；真正的寫入發生在 save()。
        select: (mode) => {
          if (CONFIRM_MODES.indexOf(mode) < 0) return;
          draft = mode;
          failed = false;
          publish();
        },
        save: () => {
          const next = draft;
          if (next === undefined) return;
          write(() => form.set(CONFIRM_MODE_FIELD, next));
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
          write(() => form.unset(CONFIRM_MODE_FIELD));
        },
        refresh: publish,
        dispose: () => {
          unsubscribeForm();
          listeners.clear();
        }
      };
    }

    /**
     * 渲染本外掛在設定頁裡的卡片。
     *
     * 只在 view 為 "page" 且設定表單已就緒（status 為 "ready"）時渲染，
     * 避免在 host 尚未回應前顯示一張不能用的卡片。
     *
     * @param {object} props 槽位注入的 view 與本外掛的卡片動作面。
     * @returns {object|null} 卡片元素，或 null（不適用時）。
     */
    function DeleteConfirmCard(props) {
      const state = React.useSyncExternalStore(props.subscribeSettingsCard, props.getSettingsCard);
      const [open, setOpen] = React.useState(false);
      if (props.view !== "page") return null;
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
          t(CONFIRM_MODE_HINT_KEYS[selected])
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
          t("settingsSave")
        )
      );

      return React.createElement(
        "div",
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
     * 註冊設定頁卡片：等 configForms 服務就緒、且 host 正在服務本外掛的
     * 設定命名空間時，把卡片註冊進 plugins.bundle.config（以 npm 包名為鍵）。
     *
     * 以 ctx.inject 等待服務，而不是放進外掛層級的 inject：服務缺席的部署
     * 照常使用刪除功能，只是設定頁不會出現本卡片。
     *
     * @param {object} ctx 客戶端外掛上下文。
     * @returns {void}
     */
    function mountSettingsCard(ctx) {
      ctx.inject(["configForms"], (uiCtx) => {
        // configForms.whileServed 需要瀏覽器端 settings 服務提供；
        // 缺少它的舊部署就沒有可編輯的欄位，直接不註冊即可。
        if (typeof uiCtx.configForms.whileServed !== "function") return;
        uiCtx.effect(() => uiCtx.configForms.whileServed([SETTINGS_NAMESPACE], () => {
          const form = uiCtx.configForms.get(SETTINGS_NAMESPACE);
          const controller = createSettingsCardController(form);
          // 刪除流程改讀 host 端的已保存值（卡片上的草稿不影響行為）。
          const boundSource = () => controller.currentMode();
          confirmModeSource = boundSource;
          // 固定的注入面：函式引用穩定，元件可安全地以它們訂閱／觸發動作。
          const face = {
            getSettingsCard: () => controller.getSnapshot(),
            subscribeSettingsCard: (listener) => controller.subscribe(listener),
            selectSettingsCard: (mode) => controller.select(mode),
            saveSettingsCard: () => controller.save(),
            discardSettingsCard: () => controller.discard(),
            resetSettingsCard: () => controller.reset()
          };
          const disposeSlots = uiCtx.slots.inject("plugins.bundle.config", () => uiCtx.slots.register({
            name: "plugins.bundle.config",
            key: PACKAGE_NAME,
            locale: LOCALE_NS,
            inject: () => face
          }, DeleteConfirmCard));
          // 命名空間不再被服務（或外掛卸載）時釋放卡片狀態。
          return () => {
            disposeSlots();
            controller.dispose();
            // 只有仍是本實例綁定的來源時才還原預設，避免卸載舊實例時
            // 蓋掉較新實例的綁定。
            if (confirmModeSource === boundSource) confirmModeSource = () => DEFAULT_CONFIRM_MODE;
          };
        }), "delete-session: settings card");
      });
    }

    // ---------- 樣式 ----------
    const CSS_TAG_ID = "dsh-kagurazakayashi-delete-session/delete-session.css";
    const STYLE_SELECTOR = "style[data-plugin-css=" + JSON.stringify(CSS_TAG_ID) + "]";
    const css = [
      // 會話「…」選單項：以設計權杖自行著色（不再複製核心項目的雜湊類別）。
      ".dshds-menuWrap{display:block;}",
      ".dshds-menuItem{appearance:none;box-sizing:border-box;width:100%;display:flex;align-items:center;gap:8px;padding:6px 10px;border:0;border-radius:6px;background:0 0;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;}",
      ".dshds-menuItem:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dshds-menuItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px;}",
      ".dshds-menuItemArmed{background:var(--dsw-alias-state-error-primary);color:#fff;}",
      ".dshds-menuItemArmed:hover{background:var(--dsw-alias-state-error-primary);filter:brightness(1.08);}",
      ".dshds-menuIcon{display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary);}",
      ".dshds-menuItemArmed .dshds-menuIcon{color:#fff;}",
      ".dshds-menuLabel{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
      // 純 DOM 對話框。
      ".dshds-modal-root{position:relative;z-index:1000;}",
      ".dshds-overlay{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;}",
      ".dshds-card{box-sizing:border-box;width:min(420px,calc(100vw - 48px));background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;box-shadow:var(--dsw-shadow-lv2);padding:20px;color:var(--dsw-alias-label-primary);}",
      ".dshds-title{margin:0 0 8px;font-size:16px;font-weight:600;line-height:24px;}",
      ".dshds-desc{margin:0 0 16px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;word-break:break-word;}",
      ".dshds-actions{display:flex;justify-content:flex-end;gap:8px;}",
      ".dshds-btn{box-sizing:border-box;height:32px;padding:0 14px;border-radius:8px;font-family:inherit;font-size:13px;line-height:18px;cursor:pointer;}",
      ".dshds-btn-ok{background:transparent;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);}",
      ".dshds-btn-ok:hover{background:var(--dsw-alias-interactive-bg-hover);}",
      ".dshds-btn-danger{background:var(--dsw-alias-state-error-primary);border:1px solid var(--dsw-alias-state-error-primary);color:#fff;}",
      ".dshds-btn-danger:hover{filter:brightness(1.08);}",
      // 設定頁卡片：外觀對齊核心 PluginCard 的語彙。
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

    // ---------- Cordis apply ----------
    /** 本外掛需要的瀏覽器服務（sessions：刪除後刷新清單；slots：註冊槽位；locale：文案）。 */
    const inject = ["sessions", "slots", "locale"];

    /**
     * 瀏覽器端外掛入口：註冊字典、會話「…」選單項與設定頁卡片。
     *
     * 回傳的 cleanup 會移除全部計時器、彈窗與樣式，確保卸載乾淨。
     *
     * @param {object} ctx 客戶端執行期上下文（提供 sessions、slots、locale）。
     * @returns {void}
     */
    function apply(ctx) {
      activeCtx = ctx;
      mountStyle();
      // 字典：槽位註冊帶 locale 時，框架會據此合成 t 注入元件。
      // 整份 STRINGS 一併註冊，繁體變體（zh-TW／zh-HK／zh-MO／zh-Hant）與
      // ja 都是同一個物件或各自的字典，等對應語系套用後即生效。
      ctx.effect(() => ctx.locale.register(LOCALE_NS, STRINGS), "delete-session: dictionaries");
      // 會話「…」選單項：等官方槽位被宣告後註冊。
      mountSessionMenuItem(ctx);
      // 設定頁卡片：等 configForms 服務與本外掛的設定命名空間就緒後註冊。
      mountSettingsCard(ctx);

      ctx.effect(() => () => {
        disarmAllSessions();
        closeModal();
        unmountStyle();
        if (activeCtx === ctx) activeCtx = null;
      }, "delete-session: cleanup");
    }

    return { apply, inject };
  }
});
