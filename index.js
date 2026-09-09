// dsh-delete-session（host 端）
//
// 提供 POST /delete-session/delete：永久刪除一個「非執行中」會話的
// 磁碟目錄（含其 JSONL 日誌與目錄內檔案）。只有「正在執行任務」的
// 會話（agent 狀態非 idle）會被拒絕，避免刪除正在寫入的日誌；僅被打開
// 過、之後切換走而仍駐留記憶體的空閒（idle）會話可以刪除。
//
// 破壞性刪除前會先呼叫 workspaceRegistry.archiveSession，讓側欄經由
// host/archived-sessions-changed 廣播即時隱藏該會話（同時優雅處理
// 「當前會話」：客戶端會自動清空選擇），避免刪除後仍殘留於清單。
//
// 持久化 API 說明：
//   - sessionPersistence.list() 現在回傳 SessionPersistenceSnapshot，
//     會話 id 位於 snapshot.header.id（舊版的頂層 id 已移除）。
//   - 舊版的 supportsRawArtifacts 旗標已被移除；公開的替代品是 JSONL 後端
//     的非同步 resolveCurrentLog(id)，但它只對「檔名已帶當前格式版本標記」
//     的日誌回報路徑（本機實測 89 個既有會話中僅 4 個如此），因此另以
//     後端執行期仍提供的 locate(header) 作為舊格式會話的回退。
//
// 使用者設定：本外掛向 settings 服務註冊命名空間 "delete-session"（欄位
// confirmMode），持久化到 $DSH_HOME/settings.yaml。設定頁「外掛 → 外掛設定」
// 的卡片即以此命名空間為鍵（卡片由 client.js 註冊）；主機端只負責註冊與
// 保存，不讀取該值，刪除確認完全在瀏覽器端執行。

import { rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import Schema from "@deepseek-ai/schemastery";

// 穩定的 Cordis 外掛名稱與所需的 host 服務。
export const name = "delete-session";
export const inject = ["sessions", "sessionPersistence", "workspaceRegistry", "agents", "webServer"];

const ROUTE = "/delete-session/delete";
const MAX_BODY_BYTES = 16 * 1024;

// ---------- 使用者設定（刪除確認方式） ----------

/** 本外掛的使用者設定命名空間（設定頁卡片即以此為鍵）。 */
export const SETTINGS_NAMESPACE = "delete-session";
/** 設定中承載「刪除確認方式」的欄位名稱。 */
export const CONFIRM_MODE_FIELD = "confirmMode";
/**
 * 支援的刪除確認方式：
 *   - click-again：第一次點擊進入警示狀態，第二次點擊才刪除（預設）。
 *   - dialog：點擊後彈出確認對話框，按下確認才刪除。
 *   - instant：點擊後立即刪除（危險，沒有任何二次確認）。
 */
export const CONFIRM_MODES = ["click-again", "dialog", "instant"];
/** 預設刪除確認方式（與外掛既有行為一致）。 */
export const DEFAULT_CONFIRM_MODE = "click-again";
/**
 * 設定命名空間的 schema：設定頁表單的欄位與值驗證都由它決定。
 * 使用 union 列舉可選值，讓序列化後的 schema 能直接驅動瀏覽器端表單。
 */
export const SETTINGS_SCHEMA = Schema.object({
  [CONFIRM_MODE_FIELD]: Schema.union([...CONFIRM_MODES]).default(DEFAULT_CONFIRM_MODE)
});
/** 組合層的設定基準值（settings 服務缺席時即為權威值）。 */
const SETTINGS_ENTRY = { [CONFIRM_MODE_FIELD]: DEFAULT_CONFIRM_MODE };
/**
 * 目前權威的設定來源。settings 服務存在時由 installSection 換成其 scope
 * 讀取器；服務卸載後回退為組合層基準值。主機端目前不使用此值，保留它是
 * 為了讓 installSection 的 setSource 契約完整（未來若主機端需要依設定
 * 改變行為，可直接讀 currentSettings()）。
 */
let settingsSource = () => SETTINGS_ENTRY;

/**
 * 回傳一份 JSON 回應，並設定內容型別與內容長度標頭。
 *
 * 回應本文僅序列化 `body` 物件，不會洩漏任何絕對路徑。
 *
 * @param {object} res Node.js 的 HTTP 回應物件（ServerResponse）。
 * @param {number} status 欲回傳的 HTTP 狀態碼。
 * @param {object} body 欲序列化為 JSON 的回應內容。
 * @param {object} [extraHeaders] 額外的回應標頭（例如 allow）。
 * @returns {void}
 */
function sendJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    ...extraHeaders
  });
  res.end(json);
}

/**
 * 判斷指定會話是否正在執行任務。
 *
 * 以對應 agent 的狀態為準：agent 不存在（未載入）或狀態為 idle 皆視為
 * 非執行中；只有狀態非 idle（例如 busy、thinking 等）才視為執行中。
 *
 * @param {object} ctx 外掛執行期上下文（提供 agents 服務）。
 * @param {string} sessionId 會話唯一識別碼。
 * @returns {boolean} 會話正在執行任務時回傳 true，否則回傳 false。
 */
function isSessionRunning(ctx, sessionId) {
  const agent = ctx.agents?.get(sessionId);
  return agent !== undefined && agent.status !== "idle";
}

/**
 * 解析某個會話在磁碟上的日誌檔絕對路徑。
 *
 * 依序嘗試兩個來源；兩者回報的檔案都位於同一個「會話目錄」內，因此呼叫端
 * 只需取其 dirname：
 *
 *   1. `sessionPersistence.resolveCurrentLog(id)`：JSONL
 *      後端（`@deepseek-ai/dsh-session-persistence-jsonl`）的公開 API，
 *      非同步回報「當前格式世代」日誌檔的絕對路徑。對尚未遷移的舊格式
 *      會話（檔名不帶 `vN` 標記）會回傳 undefined，對更新的未知格式則
 *      拋出帶有 `kind` / `path` 診斷資訊的錯誤。
 *   2. `sessionPersistence.locate(header)`：後端內部（TypeScript 標記為
 *      private）但執行期存在的方法，回傳 `{ kind, path }`；其 path 是
 *      「當前世代的目標檔名」，不檢查檔案是否存在，因此對舊格式會話也
 *      能給出正確的會話目錄。舊版外掛即以此定位（當時旗標為
 *      supportsRawArtifacts + locate）。
 *
 * 只有兩個來源都無法給出可用路徑時才回報失敗，藉此同時涵蓋新舊格式會話，
 * 且不因任一私有成員被移除而完全失效。
 *
 * @param {object} ctx 外掛執行期上下文（提供 sessionPersistence 服務）。
 * @param {string} sessionId 會話唯一識別碼。
 * @param {object} snapshot sessionPersistence.list() 回傳的持久化快照。
 * @returns {Promise<{path: string}|{path: null, code: string, message: string}>}
 *   解析結果；失敗時 path 為 null，並附上錯誤碼與訊息。
 */
async function locateLogPath(ctx, sessionId, snapshot) {
  const backend = ctx.sessionPersistence;
  const canResolve = typeof backend.resolveCurrentLog === "function";
  const canLocate = typeof backend.locate === "function";
  if (!canResolve && !canLocate) {
    return { path: null, code: "NO_RAW_ARTIFACTS", message: "session persistence backend does not expose raw artifact locations" };
  }
  if (canResolve) {
    try {
      const resolved = await backend.resolveCurrentLog(sessionId);
      if (typeof resolved === "string" && resolved.length > 0) return { path: resolved };
    } catch (error) {
      // 失敗仍可能附帶 kind/path 診斷（例如日誌屬於更新的未知格式）；
      // 該路徑本身依然可安全刪除，故直接沿用。
      if (error !== null && typeof error === "object" && error.kind === "jsonl" && typeof error.path === "string" && error.path.length > 0) {
        return { path: error.path };
      }
    }
  }
  if (canLocate) {
    try {
      const location = backend.locate(snapshot.header);
      if (location !== null && typeof location === "object" && typeof location.path === "string" && location.path.length > 0) {
        return { path: location.path };
      }
    } catch {
      // 落到下方的統一失敗回應。
    }
  }
  return { path: null, code: "NO_JSONL_LOCATION", message: "session persistence backend has no jsonl artifact location" };
}

/**
 * 以 UTF-8 編碼讀取 HTTP 請求本文。
 *
 * 讀取過程中若累計位元組數超過 `cap` 上限，即拋出帶有
 * `code === "BODY_TOO_LARGE"` 的錯誤，避免超大請求拖垮主機。
 *
 * @param {object} req Node.js 的 HTTP 請求物件（可疊代的讀取串流）。
 * @param {number} cap 允許的最大請求本文位元組數。
 * @returns {Promise<string>} 解析完成的 UTF-8 字串。
 */
async function readBody(req, cap) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > cap) {
      const error = new Error("request body too large");
      error.code = "BODY_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * 處理 POST /delete-session/delete 的刪除請求。
 *
 * 完整流程：校驗方法與請求本文 → 解析 JSON → 校驗 sessionId →
 * 執行中會話守衛（前後各一次）→ 查詢持久化中繼資料 → 以
 * resolveCurrentLog 定位會話目錄 → 歸檔（盡力而為）→ 遞迴刪除磁碟
 * 目錄。每一步失敗都會回傳對應的錯誤碼與 HTTP 狀態碼。
 *
 * @param {object} ctx 外掛執行期上下文（提供 sessions、agents、
 *   sessionPersistence、workspaceRegistry 等服務）。
 * @param {object} req Node.js 的 HTTP 請求物件。
 * @param {object} res Node.js 的 HTTP 回應物件。
 * @returns {Promise<void>}
 */
async function handleDelete(ctx, req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "method not allowed" }, { allow: "POST" });
  }

  let text;
  try {
    text = await readBody(req, MAX_BODY_BYTES);
  } catch (error) {
    if (error?.code === "BODY_TOO_LARGE") {
      return sendJson(res, 413, { ok: false, code: "BODY_TOO_LARGE", error: "request body too large" });
    }
    return sendJson(res, 400, { ok: false, code: "BAD_BODY", error: "failed to read request body" });
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return sendJson(res, 400, { ok: false, code: "BAD_JSON", error: "invalid JSON body" });
  }

  const sessionId = payload !== null && typeof payload === "object" ? payload.sessionId : undefined;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    return sendJson(res, 400, { ok: false, code: "BAD_SESSION_ID", error: "sessionId must be a non-empty string" });
  }

  // 執行中會話守衛：只拒絕「正在執行任務」的會話（在持久化查詢前先做一次）。
  // 先前「ctx.sessions.get(id) !== undefined」會把所有曾被 resume（打開）過、
  // 之後切換走仍駐留記憶體的空閒會話一併拒絕，導致切換會話後無法刪除。
  if (isSessionRunning(ctx, sessionId)) {
    return sendJson(res, 409, { ok: false, code: "LIVE_SESSION", error: "cannot delete a running session" });
  }

  // 查詢持久化中繼資料，確認該會話確實存在於磁碟上。
  // 現行 core 的 list() 回傳 SessionPersistenceSnapshot，會話 id 位於
  // snapshot.header.id（舊版的頂層 id 欄位已移除）。
  let snapshot;
  try {
    const listed = await ctx.sessionPersistence.list();
    snapshot = listed.find((candidate) => candidate?.header?.id === sessionId);
  } catch {
    return sendJson(res, 500, { ok: false, code: "LIST_FAILED", error: "failed to list persisted sessions" });
  }
  if (snapshot === undefined) {
    return sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "no persisted session with that id" });
  }

  // 定位該會話在磁碟上的日誌檔路徑，再取其父目錄作為「會話目錄」。
  const located = await locateLogPath(ctx, sessionId, snapshot);
  if (located.path === null) {
    return sendJson(res, 501, { ok: false, code: located.code, error: located.message });
  }

  // 縱深防禦：會話目錄名稱必須正好等於會話 id。後端以 encodeSegment(id) 為
  // 目錄命名，而會話 id 僅含 [A-Za-z0-9._-]（UUID 或 session-<UUID>），
  // 故兩者相同；不符時拒絕刪除，避免任何情況下遞迴刪除到整個 project
  // 目錄（災難性誤刪）。
  const sessionDir = dirname(located.path);
  if (basename(sessionDir) !== sessionId) {
    return sendJson(res, 501, { ok: false, code: "UNEXPECTED_LAYOUT", error: "resolved artifact is not inside a session directory" });
  }

  // 破壞性刪除前的最後一次執行中檢查（與上方守衛之間的短暫窗口內，
  // 會話若開始執行任務則拒絕）。
  if (isSessionRunning(ctx, sessionId)) {
    return sendJson(res, 409, { ok: false, code: "LIVE_SESSION", error: "cannot delete a running session" });
  }

  // 先歸檔：讓側欄經由 host/archived-sessions-changed 廣播即時隱藏該會話，
  // 避免 rm 後仍殘留於清單（也會讓「當前會話」被客戶端自動清空選擇）。
  // 歸檔是冪等操作；此處視為盡力而為——失敗不阻斷刪除主流程。
  try {
    await ctx.workspaceRegistry.archiveSession(sessionId);
  } catch {
    // 歸檔失敗僅代表側欄可能延遲隱藏（至下次重新整理或重啟後消失），
    // 磁碟刪除仍繼續。
  }

  try {
    await rm(sessionDir, { recursive: true, force: false });
  } catch {
    return sendJson(res, 500, { ok: false, code: "DELETE_FAILED", error: "failed to delete the session directory" });
  }

  return sendJson(res, 200, { ok: true });
}

/**
 * 讀取目前權威的使用者設定（settings 服務存在時為其解析值，否則為組合層
 * 基準值）。
 *
 * 主機端目前不使用這個值：刪除確認方式完全由瀏覽器端在觸發刪除時決定。
 * 保留此讀取點是為了讓設定來源有單一權威出口，未來若主機端需要依設定
 * 改變行為（例如拒絕 instant 模式），可直接呼叫本函式。
 *
 * @returns {{confirmMode: string}} 目前的設定值（深凍結快照）。
 */
export function currentSettings() {
  return settingsSource();
}

/**
 * Cordis 外掛入口：向 webServer 註冊精確匹配的刪除路由，並在 settings
 * 服務存在時註冊本外掛的使用者設定命名空間。
 *
 * @param {object} ctx Cordis 外掛執行期上下文（提供 webServer 服務）。
 * @returns {void}
 */
export function apply(ctx) {
  // 路由處理函式：直接委派給 handleDelete，並夾帶執行期上下文。
  const handler = (req, res) => handleDelete(ctx, req, res);
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: ROUTE,
    handler
  }), "delete-session: delete route");

  // 使用者設定：把本外掛的命名空間接到 settings 服務上。
  //
  // 以 ctx.inject（而非外掛層級的 inject）等待服務：未掛載 settings provider
  // 的部署照常使用刪除功能，只是設定頁不會出現本卡片。installSection 會把
  // 組合層基準值註冊為 base 層，使用者選擇則落在 user 層並持久化；服務卸載
  // 後自動回退為基準值。
  ctx.inject(["settings"], (settingsCtx) => {
    try {
      settingsCtx.settings.installSection(ctx, SETTINGS_NAMESPACE, SETTINGS_SCHEMA, SETTINGS_ENTRY, {
        // 接收目前權威的設定來源（服務在線時為 scope 讀取器，離線時為基準值）。
        setSource: (current) => {
          settingsSource = current;
        },
        // 設定變更後不需重算任何主機端狀態：刪除流程每次都由瀏覽器端即時決定。
        onChange: () => {}
      });
    } catch (error) {
      // 設定註冊失敗（例如命名空間已被其他外掛佔用）只影響設定卡片；
      // 刪除路由必須照常運作，因此記錄後繼續，不讓例外往上冒。
      console.warn("[delete-session] failed to register the settings namespace:", error);
    }
  });
}
