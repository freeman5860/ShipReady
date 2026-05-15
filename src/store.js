const memory = {
  audits: new Map(),
  shares: new Map(),
  shareByAudit: new Map(),
};

const kvUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const hasKv = Boolean(kvUrl && kvToken);

export function storageMode() {
  return hasKv ? "kv" : "memory";
}

export async function saveAudit(record) {
  if (hasKv) return kvSet(auditKey(record.id), record);
  memory.audits.set(record.id, record);
}

export async function getAudit(id) {
  if (hasKv) return kvGet(auditKey(id));
  return memory.audits.get(id) || null;
}

export async function saveShare(share) {
  if (hasKv) {
    await kvSet(shareKey(share.id), share);
    await kvSet(shareByAuditKey(share.auditId), share.id);
    return;
  }
  memory.shares.set(share.id, share);
  memory.shareByAudit.set(share.auditId, share.id);
}

export async function getShare(id) {
  if (hasKv) return kvGet(shareKey(id));
  return memory.shares.get(id) || null;
}

export async function getShareByAudit(auditId) {
  if (hasKv) {
    const shareId = await kvGet(shareByAuditKey(auditId));
    return shareId ? getShare(shareId) : null;
  }
  const shareId = memory.shareByAudit.get(auditId);
  return shareId ? memory.shares.get(shareId) || null : null;
}

async function kvSet(key, value) {
  const result = await kvCommand(["SET", key, JSON.stringify(value)]);
  return result;
}

async function kvGet(key) {
  const result = await kvCommand(["GET", key]);
  if (!result) return null;
  return JSON.parse(result);
}

async function kvCommand(command) {
  const response = await fetch(kvUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${kvToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(command),
  });
  if (!response.ok) {
    throw new Error(`KV command failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error);
  }
  return payload.result;
}

function auditKey(id) {
  return `audit:${id}`;
}

function shareKey(id) {
  return `share:${id}`;
}

function shareByAuditKey(auditId) {
  return `share_by_audit:${auditId}`;
}
