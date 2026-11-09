#!/usr/bin/env node
/**
 * Production E2E: notes → Claude draft → agree → order → (browser approve) → capture → poll.
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
  process.env[trimmed.slice(0, eq)] ??= trimmed.slice(eq + 1);
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

const NOTES = [
  {
    party: "studio",
    body: "Landing page, two rounds of revision. The client pays $1,200 for the job.",
  },
  { party: "maya", body: "I'll take the UI. My share is $800." },
  {
    party: "client",
    body: "Confirmed. $1,200 total. Maya receives $800. The studio keeps $400.",
  },
];

const step = process.argv[2] ?? "prepare";

if (step === "prepare") {
  const state = { base, jobId: null, orderId: null, approveUrl: null, steps: [] };

  const created = await api("/api/jobs", { method: "POST" });
  pushStep(state, "create_job", created.res, created.body);
  if (!created.res.ok || !created.body?.job?.id) {
    console.error("create job failed", created.body);
    process.exit(1);
  }
  state.jobId = created.body.job.id;
  if (created.body.job.client_amount) {
    console.error("new job still has a seed amount", created.body.job.client_amount);
    process.exit(1);
  }

  for (const note of NOTES) {
    const saved = await api(`/api/jobs/${state.jobId}/messages`, {
      method: "POST",
      body: JSON.stringify(note),
    });
    pushStep(state, `note_${note.party}`, saved.res, saved.body);
    if (!saved.res.ok) {
      console.error("note failed", saved.body);
      process.exit(1);
    }
  }

  const drafted = await api(`/api/jobs/${state.jobId}/draft`, { method: "POST", body: "{}" });
  pushStep(state, "draft", drafted.res, drafted.body);
  const job = drafted.body?.job;
  const aiRun = drafted.body?.aiRun;
  if (!drafted.res.ok || job?.agreement_status !== "ready") {
    console.error("draft failed", drafted.body);
    process.exit(1);
  }
  if (job.client_amount !== "1200.00" || job.maya_amount !== "800.00") {
    console.error("draft amounts", job.client_amount, job.maya_amount);
    process.exit(1);
  }
  state.aiRun = aiRun;
  const version = job.agreement_version;

  const maya = await api(`/api/jobs/${state.jobId}/agree`, {
    method: "POST",
    body: JSON.stringify({ party: "maya", agreementVersion: version }),
  });
  pushStep(state, "agree_maya", maya.res, maya.body);
  const client = await api(`/api/jobs/${state.jobId}/agree`, {
    method: "POST",
    body: JSON.stringify({ party: "client", agreementVersion: version }),
  });
  pushStep(state, "agree_client", client.res, client.body);
  if (!maya.res.ok || !client.res.ok) {
    console.error("agree failed", maya.body, client.body);
    process.exit(1);
  }

  const order = await api(`/api/jobs/${state.jobId}/order`, { method: "POST", body: "{}" });
  pushStep(state, "create_order", order.res, order.body);
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
        model: aiRun?.model,
        validation: aiRun?.validation,
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
      eventTypes: events.map((event) => event.event_type),
    };
    console.log(JSON.stringify(snap, null, 2));
    if (job?.paypal_capture_id && job?.paypal_payout_item_id) {
      state.final = snap;
      state.finalJob = job;
      state.finalEvents = events;
      save(state);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
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
