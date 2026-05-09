import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyBriefFollowUp,
  buildInitialAudit,
  buildRewritePack,
  buildSubjectiveAudit,
  createAuditId,
  createShareId,
  extractPageFromHtml,
  mergeAuditItems,
  normalizeManualInput,
  publicReportPayload,
  validateBrief,
} from "./audit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 5173);

const audits = new Map();
const shares = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname.startsWith("/r/")) {
      return renderPublicReport(req, res, url.pathname.split("/").pop());
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(req, res, url);
    }

    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Internal server error" });
  }
});

server.listen(port, () => {
  console.log(`ShipReady audit MVP running at http://localhost:${port}`);
});

async function handleApi(req, res, url) {
  if (req.method === "POST" && url.pathname === "/api/audit") {
    const body = await readJson(req);
    const record = await createAudit(body);
    audits.set(record.id, record);
    return sendJson(res, 200, serializeRecord(record));
  }

  if (req.method === "POST" && url.pathname === "/api/brief") {
    const body = await readJson(req);
    const record = requireAudit(body.audit_id);
    record.brief = validateBrief(body.brief || {});
    if (briefReady(record.brief)) {
      const subjective = buildSubjectiveAudit(record.page, record.brief);
      record.items = mergeAuditItems(record.items, subjective);
    }
    record.updatedAt = new Date().toISOString();
    return sendJson(res, 200, serializeRecord(record));
  }

  if (req.method === "POST" && url.pathname === "/api/brief/follow-up") {
    const body = await readJson(req);
    const record = requireAudit(body.audit_id);
    record.brief = applyBriefFollowUp(record.brief, body.field, body.answer || "");
    if (briefReady(record.brief)) {
      const subjective = buildSubjectiveAudit(record.page, record.brief);
      record.items = mergeAuditItems(record.items, subjective);
    }
    record.updatedAt = new Date().toISOString();
    return sendJson(res, 200, serializeRecord(record));
  }

  if (req.method === "POST" && url.pathname === "/api/rewrite") {
    const body = await readJson(req);
    const record = requireAudit(body.audit_id);
    if (!record.brief) return sendJson(res, 400, { error: "Complete the 3-question brief before unlocking rewrites." });
    record.paid = true;
    record.rewrite = buildRewritePack(record.page, record.brief);
    record.updatedAt = new Date().toISOString();
    return sendJson(res, 200, serializeRecord(record));
  }

  if (req.method === "POST" && url.pathname === "/api/share") {
    const body = await readJson(req);
    const record = requireAudit(body.audit_id);
    if (!record.paid) return sendJson(res, 402, { error: "Public reports are available after unlocking the rewrite pack." });
    const existing = [...shares.values()].find((share) => share.auditId === record.id);
    const share =
      existing ||
      {
        id: createShareId(),
        auditId: record.id,
        sourceLabel: body.source_label === "third_party" ? "Third-party audit" : "Self-submitted",
        createdAt: new Date().toISOString(),
      };
    shares.set(share.id, share);
    record.shareId = share.id;
    return sendJson(res, 200, {
      public_url: `/r/${share.id}`,
      report: publicReportPayload(record, share),
    });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/report/")) {
    const id = url.pathname.split("/").pop();
    const record = requireAudit(id);
    return sendJson(res, 200, serializeRecord(record));
  }

  return sendJson(res, 404, { error: "Not found" });
}

async function createAudit(body) {
  let page;
  let source = "url_scrape";
  let scrape = { ok: true, message: "" };

  if (body.mode === "manual") {
    page = normalizeManualInput(body.manual || {});
    source = "manual_paste";
  } else {
    try {
      const requestedUrl = normalizeUrl(body.url || "");
      const response = await fetch(requestedUrl, {
        redirect: "follow",
        headers: {
          "user-agent": "Mozilla/5.0 ShipReadyAudit/0.1 (+https://example.com/audit)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      page = extractPageFromHtml(html, requestedUrl);
    } catch (error) {
      page = normalizeManualInput(body.manual || { url: body.url || "" });
      source = "manual_paste";
      scrape = {
        ok: false,
        message: `Could not fetch the page automatically (${error.message}). Paste the page content to continue.`,
      };
    }
  }

  return {
    id: createAuditId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source,
    scrape,
    page,
    items: buildInitialAudit(page),
    brief: null,
    paid: false,
    rewrite: null,
    shareId: null,
  };
}

function requireAudit(id) {
  const record = audits.get(id);
  if (!record) {
    const error = new Error("Audit not found");
    error.status = 404;
    throw error;
  }
  return record;
}

function serializeRecord(record) {
  return {
    id: record.id,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    source: record.source,
    scrape: record.scrape,
    page: {
      url: record.page.url,
      title: record.page.title,
      meta_description: record.page.metaDescription,
      hero: record.page.hero,
      ctas: record.page.ctas,
    },
    items: record.items,
    brief: record.brief,
    paid: record.paid,
    rewrite: record.rewrite,
    share_id: record.shareId,
  };
}

function briefReady(brief) {
  return Boolean(
    brief &&
      Object.values(brief).every((value) => value.quality === "good" || value.quality === "weak_after_followup"),
  );
}

async function serveStatic(req, res, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) return sendText(res, 403, "Forbidden");

  try {
    const body = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function renderPublicReport(req, res, shareId) {
  const share = shares.get(shareId);
  if (!share) return sendText(res, 404, "Report not found");
  const record = audits.get(share.auditId);
  if (!record) return sendText(res, 404, "Report not found");
  const payload = publicReportPayload(record, share);
  const rows = payload.items
    .map(
      (item) => `<tr><td>${escapeHtml(labelFor(item.id))}</td><td><span class="status ${item.status}">${item.status}</span></td><td>${escapeHtml(item.evidence || "")}</td><td>${escapeHtml(item.recommendation || "")}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Landing Page Audit Report</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="public-report">
    <div class="report-kicker">Audited by ShipReady · ${escapeHtml(payload.source_label)}</div>
    <h1>${escapeHtml(payload.title || payload.url || "Landing Page Audit")}</h1>
    <p>${escapeHtml(payload.hero || "No hero detected.")}</p>
    <table class="report-table">
      <thead><tr><th>Check</th><th>Status</th><th>Evidence</th><th>Recommendation</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
  sendHtml(res, 200, html);
}

function normalizeUrl(value) {
  const input = String(value || "").trim();
  if (!input) throw new Error("URL is required");
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function sendText(res, status, value) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(value);
}

function sendHtml(res, status, value) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(value);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function labelFor(id) {
  return id.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
