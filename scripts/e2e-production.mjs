#!/usr/bin/env node
/**
 * Production E2E: job → agree → order → (browser approve) → capture → poll job.
 * Usage: node scripts/e2e-production.mjs prepare|capture|poll|report
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.env.E2E_BASE ?? "https://hire-brjt.onrender.com";
const outPath = join(root, "sandbox-e2e-production.json");

for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
}

const DEBUG_LOG =
  "http://127.0.0.1:7368/ingest/1eaf1fe0-b927-4062-b9fd-245434f02076";
const SESSION = "2da10e";

function agentLog(hypothesisId, location, message, data, runId = "e2e-prod") {
  fetch(DEBUG_LOG, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION,
    },
    body: JSON.stringify({
      sessionId: SESSION,
      runId,
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}

function load() {
  try {
    return JSON.parse(readFileSync(outPath, "utf8"));
  } catch {
    return { base, steps: [] };
  }
}

function save(state) {
  writeFileSync(outPath, `${JSON.stringify(state, null, 2)}\n`);
}

function pushStep(state, name, res, body) {
  state.steps.push({
    at: new Date().toISOString(),
    name,
    status: res.status,
    body,
  });
  save(state);
}

async function api(path, options = {}) {
  const res = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { res, body };
}

const step = process.argv[2] ?? "prepare";

if (step === "prepare") {
  const state = { base, jobId: null, orderId: null, approveUrl: null, steps: [] };

  const created = await api("/api/jobs", { method: "POST" });
  pushStep(state, "create_job", created.res, created.body);
  if (!created.res.ok || !created.body?.job?.id) {
    console.error("create job failed");
    process.exit(1);
  }
  state.jobId = created.body.job.id;

  const patched = await api(`/api/jobs/${state.jobId}`, {
    method: "PATCH",
    body: JSON.stringify({
      workSummary: "E2E production landing page, two revision rounds.",
      clientAmount: "1200.00",
      mayaAmount: "800.00",
      studioAmount: "400.00",
    }),
  });
  pushStep(state, "patch_agreement", patched.res, patched.body);

  const maya = await api(`/api/jobs/${state.jobId}/agree`, {
    method: "POST",
    body: JSON.stringify({ party: "maya" }),
  });
  pushStep(state, "agree_maya", maya.res, maya.body);

  const client = await api(`/api/jobs/${state.jobId}/agree`, {
    method: "POST",
    body: JSON.stringify({ party: "client" }),
  });
  pushStep(state, "agree_client", client.res, maya.body);

  const order = await api(`/api/jobs/${state.jobId}/order`, { method: "POST", body: "{}" });
  pushStep(state, "create_order", order.res, order.body);
  agentLog("A", "e2e-production.mjs:prepare", "order_created", {
    jobId: state.jobId,
    orderId: order.body?.orderId,
    status: order.body?.status,
  });
  if (!order.res.ok) {
    console.error("order failed", order.body);
    process.exit(1);
  }
  state.orderId = order.body.orderId;
  state.approveUrl = order.body.approveUrl;
  state.jobUrl = `${base}/jobs/${state.jobId}`;
  save(state);
  console.log(
    JSON.stringify(
      {
        jobId: state.jobId,
        orderId: state.orderId,
        approveUrl: state.approveUrl,
        jobUrl: state.jobUrl,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (step === "capture") {
  const state = load();
  if (!state.jobId) {
    console.error("run prepare first");
    process.exit(1);
  }
  const captured = await api(`/api/jobs/${state.jobId}/capture`, {
    method: "POST",
    body: "{}",
  });
  pushStep(state, "capture", captured.res, captured.body);
  agentLog("B", "e2e-production.mjs:capture", "capture_response", captured.body);
  console.log(JSON.stringify({ status: captured.res.status, body: captured.body }, null, 2));
  process.exit(captured.res.ok ? 0 : 1);
}

if (step === "poll") {
  const state = load();
  const jobId = state.jobId ?? process.argv[3];
  if (!jobId) {
    console.error("no job id");
    process.exit(1);
  }
  const max = Number(process.env.E2E_POLL_MAX ?? 24);
  for (let i = 0; i < max; i++) {
    const got = await api(`/api/jobs/${jobId}`);
    const job = got.body?.job;
    const events = got.body?.events ?? [];
    const snap = {
      poll: i + 1,
      capture_id: job?.paypal_capture_id,
      payout_batch: job?.paypal_payout_batch_id,
      payout_item: job?.paypal_payout_item_id,
      eventTypes: events.map((e) => e.event_type),
    };
    agentLog("C", "e2e-production.mjs:poll", "job_snapshot", snap);
    console.log(JSON.stringify(snap, null, 2));
    if (job?.paypal_capture_id && job?.paypal_payout_item_id) {
      state.final = snap;
      state.finalJob = job;
      state.finalEvents = events;
      save(state);
      process.exit(0);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  pushStep(state, "poll_timeout", { status: 408 }, { jobId });
  save(state);
  process.exit(1);
}

if (step === "report") {
  const state = load();
  console.log(JSON.stringify(state, null, 2));
  process.exit(0);
}

console.error("unknown step", step);
process.exit(1);
