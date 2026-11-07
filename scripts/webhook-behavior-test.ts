process.env.DATABASE_URL ??= "postgres://hire:hire@127.0.0.1:5432/hire";
process.env.PAYPAL_MAYA_EMAIL ??= "maya@sandbox.example";

import pg from "pg";
import { storeVerifiedEvent, type StoreVerifiedEventOptions } from "../lib/events";
import { jobStatus, serializeJob, type JobPayload } from "../lib/job";

const DATABASE_URL = process.env.DATABASE_URL;

type PaypalMock = {
  calls: number;
  failNext: boolean;
  batchId: string;
};

function makeCaptureEvent(
  eventId: string,
  captureId: string,
  orderId: string,
  amount: string,
  currency = "USD",
): string {
  return JSON.stringify({
    id: eventId,
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    resource: {
      id: captureId,
      amount: { value: amount, currency_code: currency },
      supplementary_data: { related_ids: { order_id: orderId } },
    },
  });
}

function makePayoutEvent(
  eventId: string,
  itemId: string,
  batchId: string,
  jobId: string,
  amount: string,
  currency = "USD",
): string {
  return JSON.stringify({
    id: eventId,
    event_type: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
    resource: {
      payout_item_id: itemId,
      payout_batch_id: batchId,
      payout_item: {
        sender_item_id: `${jobId}-maya`,
        amount: { value: amount, currency_code: currency },
      },
    },
  });
}

function makePayoutFailedEvent(eventId: string, jobId: string): string {
  return JSON.stringify({
    id: eventId,
    event_type: "PAYMENT.PAYOUTS-ITEM.FAILED",
    resource: {
      payout_item: { sender_item_id: `${jobId}-maya` },
    },
  });
}

async function seedJob(
  client: pg.Client,
  id: string,
  orderId: string,
  amounts = { client: "1200.00", maya: "800.00", studio: "400.00" },
): Promise<void> {
  await client.query(
    `insert into jobs (id, client_amount, maya_amount, studio_amount, paypal_order_id)
     values ($1, $2, $3, $4, $5)
     on conflict (id) do update set
       client_amount = excluded.client_amount,
       maya_amount = excluded.maya_amount,
       studio_amount = excluded.studio_amount,
       paypal_order_id = excluded.paypal_order_id,
       paypal_capture_id = null,
       paypal_payout_batch_id = null,
       paypal_payout_item_id = null`,
    [id, amounts.client, amounts.maya, amounts.studio, orderId],
  );
}

async function jobRow(client: pg.Client, id: string) {
  const r = await client.query("select * from jobs where id = $1", [id]);
  return r.rows[0] as Record<string, string | null>;
}

async function eventCount(client: pg.Client, prefix: string) {
  const r = await client.query(
    "select count(*)::int as c from paypal_events where id like $1",
    [`${prefix}%`],
  );
  return r.rows[0].c as number;
}

function payoutOptions(mock: PaypalMock): StoreVerifiedEventOptions {
  return {
    payoutMaya: async (jobId, mayaAmount, clientAmount, email) => {
      mock.calls += 1;
      if (mock.failNext) {
        mock.failNext = false;
        return {
          ok: false,
          status: 500,
          json: { name: "INTERNAL_ERROR", message: "simulated" },
          debugId: "DEBUG",
          raw: '{"error":"simulated"}',
        };
      }
      void email;
      void mayaAmount;
      void clientAmount;
      return {
        ok: true,
        status: 201,
        json: {
          batch_header: { payout_batch_id: `${mock.batchId}-${jobId}` },
        },
        debugId: null,
        raw: "{}",
      };
    },
  };
}

async function withBatchUpdateFailureOnce<T>(fn: () => Promise<T>): Promise<T> {
  const Client = pg.Client as typeof pg.Client & {
    prototype: { query: pg.Client["query"] };
  };
  const original = Client.prototype.query;
  let failed = false;
  Client.prototype.query = function (text, ...params) {
    if (
      !failed &&
      typeof text === "string" &&
      text.includes("paypal_payout_batch_id") &&
      text.includes("update jobs")
    ) {
      failed = true;
      throw new Error("simulated db failure after payout");
    }
    return original.apply(this, [text, ...params] as never);
  };
  try {
    return await fn();
  } finally {
    Client.prototype.query = original;
  }
}

type CaseResult = { name: string; pass: boolean; detail: string };

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  await client.query("truncate paypal_events");
  await client.query("delete from jobs where id like 'wh-test-%'");

  const results: CaseResult[] = [];

  const run = async (name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ name, pass: true, detail: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ name, pass: false, detail: msg });
    }
  };

  // 1. Duplicate success
  await run("1. Duplicate success", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH-T1" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-1";
    const orderId = "ORDER-T1";
    await seedJob(client, jobId, orderId);
    const body = makeCaptureEvent("EVT-T1", "CAP-T1", orderId, "1200.00");
    await storeVerifiedEvent(body, opts);
    await storeVerifiedEvent(body, opts);
    const j = await jobRow(client, jobId);
    if (mock.calls !== 1) throw new Error(`payouts=${mock.calls}`);
    if (!j.paypal_capture_id || !j.paypal_payout_batch_id) throw new Error("incomplete job");
    const ev = await eventCount(client, "EVT-T1");
    if (ev !== 1) throw new Error(`events=${ev}`);
  });

  // 2. Transient failure retry
  await run("2. Transient failure retry", async () => {
    const mock = { calls: 0, failNext: true, batchId: "BATCH-T2" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-2";
    const orderId = "ORDER-T2";
    await seedJob(client, jobId, orderId);
    const body = makeCaptureEvent("EVT-T2", "CAP-T2", orderId, "1200.00");
    let threw = false;
    try {
      await storeVerifiedEvent(body, opts);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected first attempt to fail");
    const mid = await jobRow(client, jobId);
    if (!mid.paypal_capture_id || mid.paypal_payout_batch_id) {
      throw new Error("expected capture only after failure");
    }
    if (mock.calls !== 1) throw new Error(`payouts after fail=${mock.calls}`);
    await storeVerifiedEvent(body, opts);
    const j = await jobRow(client, jobId);
    if (mock.calls !== 2) throw new Error(`retry payouts=${mock.calls}`);
    if (!j.paypal_payout_batch_id) throw new Error("batch still missing after retry");
  });

  // 3. Concurrent duplicates
  await run("3. Concurrent duplicates", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH-T3" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-3";
    const orderId = "ORDER-T3";
    await seedJob(client, jobId, orderId);
    const body = makeCaptureEvent("EVT-T3", "CAP-T3", orderId, "1200.00");
    await Promise.all([storeVerifiedEvent(body, opts), storeVerifiedEvent(body, opts)]);
    if (mock.calls !== 1) throw new Error(`payouts=${mock.calls}`);
    const ev = await eventCount(client, "EVT-T3");
    if (ev !== 1) throw new Error(`events=${ev}`);
  });

  // 4–6 mismatch
  for (const [num, amount, orderId, cap] of [
    [4, "999.00", "ORDER-T4", "CAP-T4"],
    [5, "1200.00", "ORDER-T5", "CAP-T5"],
  ] as const) {
    const currency = num === 5 ? "EUR" : "USD";
    await run(`${num}. ${num === 4 ? "Amount" : "Currency"} mismatch`, async () => {
      const mock = { calls: 0, failNext: false, batchId: "BATCH" };
      const opts = payoutOptions(mock);
      const jobId = `wh-test-${num}`;
      await seedJob(client, jobId, orderId);
      const body = makeCaptureEvent(`EVT-T${num}`, cap, orderId, amount, currency);
      await storeVerifiedEvent(body, opts);
      const j = await jobRow(client, jobId);
      if (j.paypal_capture_id || mock.calls > 0) throw new Error("should not capture or payout");
    });
  }

  await run("6. Order ID mismatch", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-6";
    await seedJob(client, jobId, "ORDER-T6-REAL");
    const body = makeCaptureEvent("EVT-T6", "CAP-T6", "ORDER-T6-WRONG", "1200.00");
    await storeVerifiedEvent(body, opts);
    const j = await jobRow(client, jobId);
    if (j.paypal_capture_id || mock.calls > 0) throw new Error("rejected");
  });

  // 7. Payout without capture
  await run("7. Payout without capture", async () => {
    const jobId = "wh-test-7";
    await seedJob(client, jobId, "ORDER-T7");
    const body = makePayoutEvent("EVT-T7", "ITEM-T7", "BATCH-T7", jobId, "800.00");
    await storeVerifiedEvent(body);
    const j = await jobRow(client, jobId);
    if (j.paypal_payout_item_id) throw new Error("payout_set");
  });

  // 8. Full flow
  await run("8. Valid full flow", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH-T8" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-8";
    const orderId = "ORDER-T8";
    await seedJob(client, jobId, orderId);
    await storeVerifiedEvent(makeCaptureEvent("EVT-T8A", "CAP-T8", orderId, "1200.00"), opts);
    await storeVerifiedEvent(
      makePayoutEvent("EVT-T8B", "PAYOUT-TEST8", "BATCH-T8", jobId, "800.00"),
    );
    const j = await jobRow(client, jobId);
    const payload = serializeJob(j as never) as JobPayload;
    if (jobStatus(payload) !== "complete") throw new Error("not complete");
  });

  // 9. Payout amount mismatch
  await run("9. Payout amount mismatch", async () => {
    const jobId = "wh-test-9";
    const orderId = "ORDER-T9";
    await seedJob(client, jobId, orderId);
    await client.query(
      "update jobs set paypal_capture_id = $2 where id = $1",
      [jobId, "CAP-T9"],
    );
    await storeVerifiedEvent(
      makePayoutEvent("EVT-T9", "ITEM-T9", "BATCH-T9", jobId, "799.00"),
    );
    const j = await jobRow(client, jobId);
    if (j.paypal_payout_item_id) throw new Error("payout_set");
  });

  // 10. Two capture events, one payout
  await run("10. Different events same capture", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH-T10" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-10";
    const orderId = "ORDER-T10";
    await seedJob(client, jobId, orderId);
    await storeVerifiedEvent(makeCaptureEvent("EVT-T10A", "CAPTURE-TEST10", orderId, "1200.00"), opts);
    await storeVerifiedEvent(makeCaptureEvent("EVT-T10B", "CAPTURE-TEST10", orderId, "1200.00"), opts);
    if (mock.calls !== 1) throw new Error(`payouts=${mock.calls}`);
    const ev = await client.query(
      "select count(*)::int as c from paypal_events where id like 'EVT-T10%'",
    );
    if (ev.rows[0].c !== 2) throw new Error(`events=${ev.rows[0].c}`);
  });

  // 11. PayPal accepted payout, DB save failed once
  await run("11. Payout OK then DB save failed", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH-T11" };
    const opts = payoutOptions(mock);
    const jobId = "wh-test-11";
    const orderId = "ORDER-T11";
    await seedJob(client, jobId, orderId);
    const body = makeCaptureEvent("EVT-T11", "CAP-T11", orderId, "1200.00");
    let threw = false;
    try {
      await withBatchUpdateFailureOnce(() => storeVerifiedEvent(body, opts));
    } catch {
      threw = true;
    }
    if (!threw) throw new Error("expected db failure");
    const mid = await jobRow(client, jobId);
    if (mid.paypal_payout_batch_id) throw new Error("batch should not be saved");
    await storeVerifiedEvent(body, opts);
    const j = await jobRow(client, jobId);
    if (mock.calls !== 2) throw new Error(`payouts=${mock.calls}`);
    if (!j.paypal_payout_batch_id) throw new Error("batch missing after retry");
  });

  // 12. Payout failed webhook does not mark paid
  await run("12. Payout FAILED event", async () => {
    const jobId = "wh-test-12";
    const orderId = "ORDER-T12";
    await seedJob(client, jobId, orderId);
    await client.query(
      "update jobs set paypal_capture_id = $2, paypal_payout_batch_id = $3 where id = $1",
      [jobId, "CAP-T12", "BATCH-T12"],
    );
    await storeVerifiedEvent(makePayoutFailedEvent("EVT-T12", jobId));
    const j = await jobRow(client, jobId);
    if (j.paypal_payout_item_id) throw new Error("paid");
  });

  // 13. Capture for another job's order
  await run("13. Capture for foreign order", async () => {
    const mock = { calls: 0, failNext: false, batchId: "BATCH" };
    const opts = payoutOptions(mock);
    await seedJob(client, "wh-test-13a", "ORDER-T13A");
    await seedJob(client, "wh-test-13b", "ORDER-T13B");
    await storeVerifiedEvent(makeCaptureEvent("EVT-T13", "CAP-T13", "ORDER-T13B", "1200.00"), opts);
    const a = await jobRow(client, "wh-test-13a");
    const b = await jobRow(client, "wh-test-13b");
    if (a.paypal_capture_id || a.paypal_payout_item_id) throw new Error("wrong job updated");
    if (!b.paypal_capture_id) throw new Error("target job not captured");
    if (mock.calls !== 1) throw new Error(`payouts=${mock.calls}`);
  });

  await client.end();

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);

  console.log("Webhook behavior tests (PostgreSQL)\n");

  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.pass ? "" : ` — ${r.detail}`}`);
  }

  console.log(`\nPassed: ${passed}/${results.length}`);
  if (failed.length > 0) {
    console.log("Failed:");
    for (const r of failed) console.log(`  - ${r.name}: ${r.detail}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
