// dsh-delete-session（host 端）
//
// 提供 POST /delete-session/delete：永久刪除一個「非執行中」會話的
// 磁碟目錄（含其 JSONL 日誌與目錄內檔案）。執行中（live）的會話一律
// 拒絕，避免刪除正在寫入的日誌；其餘安全邊界（原始工件定位、刪除前
// 二次 live 檢查）與 dsh-archive-manager 保持一致。

import { rm } from "node:fs/promises";
import { dirname } from "node:path";

// 穩定的 Cordis 外掛名稱與所需的 host 服務。
export const name = "delete-session";
export const inject = ["sessions", "sessionPersistence", "webServer"];

const ROUTE = "/delete-session/delete";
const MAX_BODY_BYTES = 16 * 1024;

/** 回傳一份 JSON 回應；回應本文從不序列化絕對路徑。 */
function sendJson(res, status, body, extraHeaders = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json),
    ...extraHeaders
  });
  res.end(json);
}

/** 以 UTF-8 讀取請求本文，超過 `cap` 位元組即拒絕。 */
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

  // 執行中會話守衛：在持久化查詢之前先做一次。
  if (ctx.sessions.get(sessionId) !== undefined) {
    return sendJson(res, 409, { ok: false, code: "LIVE_SESSION", error: "cannot delete a live session" });
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

  // 破壞性刪除前的最後一次執行中檢查。
  if (ctx.sessions.get(sessionId) !== undefined) {
    return sendJson(res, 409, { ok: false, code: "LIVE_SESSION", error: "cannot delete a live session" });
  }

  try {
    await rm(dirname(location.path), { recursive: true, force: false });
  } catch {
    return sendJson(res, 500, { ok: false, code: "DELETE_FAILED", error: "failed to delete the session directory" });
  }

  return sendJson(res, 200, { ok: true });
}

export function apply(ctx) {
  const handler = (req, res) => handleDelete(ctx, req, res);
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: ROUTE,
    handler
  }), "delete-session: delete route");
}
