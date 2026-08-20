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

import { rm } from "node:fs/promises";
import { dirname } from "node:path";

// 穩定的 Cordis 外掛名稱與所需的 host 服務。
export const name = "delete-session";
export const inject = ["sessions", "sessionPersistence", "workspaceRegistry", "agents", "webServer"];

const ROUTE = "/delete-session/delete";
const MAX_BODY_BYTES = 16 * 1024;

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
 * 執行中會話守衛（前後各一次）→ 查詢持久化中繼資料 → 定位原始 JSONL
 * 工件目錄 → 歸檔（盡力而為）→ 遞迴刪除磁碟目錄。每一步失敗都會回傳
 * 對應的錯誤碼與 HTTP 狀態碼。
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

  let meta;
  try {
    const listed = await ctx.sessionPersistence.list();
    meta = listed.find((candidate) => candidate.id === sessionId);
  } catch {
    return sendJson(res, 500, { ok: false, code: "LIST_FAILED", error: "failed to list persisted sessions" });
  }
  if (meta === undefined) {
    return sendJson(res, 404, { ok: false, code: "NOT_FOUND", error: "no persisted session with that id" });
  }

  // 後端必須能指向原始 JSONL 工件目錄。
  if (ctx.sessionPersistence.supportsRawArtifacts !== true || typeof ctx.sessionPersistence.locate !== "function") {
    return sendJson(res, 501, { ok: false, code: "NO_RAW_ARTIFACTS", error: "session persistence backend does not expose raw artifact locations" });
  }
  let location;
  try {
    location = ctx.sessionPersistence.locate(meta);
  } catch {
    return sendJson(res, 501, { ok: false, code: "LOCATE_FAILED", error: "session persistence backend could not locate the artifact" });
  }
  if (location === null || typeof location !== "object" || location.kind !== "jsonl" || typeof location.path !== "string" || location.path.length === 0) {
    return sendJson(res, 501, { ok: false, code: "NO_JSONL_LOCATION", error: "session persistence backend has no jsonl artifact location" });
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
    await rm(dirname(location.path), { recursive: true, force: false });
  } catch {
    return sendJson(res, 500, { ok: false, code: "DELETE_FAILED", error: "failed to delete the session directory" });
  }

  return sendJson(res, 200, { ok: true });
}

/**
 * Cordis 外掛入口：向 webServer 註冊精確匹配的刪除路由。
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
}
