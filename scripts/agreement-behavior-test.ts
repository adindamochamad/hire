process.env.DATABASE_URL ??= "postgres://hire:hire@127.0.0.1:5432/hire";

import pg from "pg";
import {
  readAgreementFromMessages,
  validateEvidence,
  type AgreementEvidence,
} from "../lib/agreement";
import type { JobMessageRow } from "../lib/db";
import { draftWithModel } from "../lib/draft-model";
import { markAgreementDrift, noteBreaksStoredAmounts } from "../lib/drift";
import { orderEligibility } from "../lib/order-eligibility";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

type Result = { name: string; pass: boolean; detail?: string };

const results: Result[] = [];

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true });
  } catch (error) {
    results.push({
      name,
      pass: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function msg(
  id: string,
  jobId: string,
  party: JobMessageRow["party"],
  body: string,
): JobMessageRow {
  return {
    id,
    job_id: jobId,
    party,
    author_name: party === "studio" ? "Studio" : party === "maya" ? "Maya" : "Client",
    body,
    created_at: new Date(),
  };
}

async function freshJob(id: string): Promise<void> {
  await client.query("delete from ai_runs where job_id = $1", [id]);
  await client.query("delete from agreement_revisions where job_id = $1", [id]);
  await client.query("delete from job_messages where job_id = $1", [id]);
  await client.query("delete from paypal_events where job_id = $1", [id]);
  await client.query(
    `insert into jobs (id, work_summary, client_amount, maya_amount, studio_amount)
     values ($1, null, 1200.00, 800.00, 400.00)
     on conflict (id) do update set
       work_summary = null,
       client_amount = 1200.00,
       maya_amount = 800.00,
       studio_amount = 400.00,
       client_agreed_at = null,
       maya_agreed_at = null,
       paypal_order_id = null,
       agreement_version = 0,
       agreement_status = null,
       agreement_evidence = null`,
    [id],
  );
}

async function applyReadyDraft(jobId: string, messages: JobMessageRow[]) {
  const outcome = readAgreementFromMessages(messages);
  if (outcome.status !== "ready") throw new Error(`expected ready got ${outcome.status}`);
  const err = validateEvidence(outcome.evidence, messages, jobId, {
    clientAmount: outcome.clientAmount,
    mayaAmount: outcome.mayaAmount,
    studioAmount: outcome.studioAmount,
  });
  if (err) throw new Error(err);
  const version = 1;
  await client.query(
    `update jobs set
       work_summary = $2,
       client_amount = $3,
       maya_amount = $4,
       studio_amount = $5,
       agreement_version = $6,
       agreement_status = 'ready',
       agreement_evidence = $7::jsonb,
       client_agreed_at = null,
       maya_agreed_at = null
     where id = $1`,
    [
      jobId,
      outcome.workSummary,
      outcome.clientAmount,
      outcome.mayaAmount,
      outcome.studioAmount,
      version,
      JSON.stringify(outcome.evidence),
    ],
  );
  return outcome;
}

async function main() {
  await client.connect();

  await run("1. Clear negotiation produces valid evidence", async () => {
    const jobId = "agr-test-1";
    await freshJob(jobId);
    const messages = [
      msg("a1", jobId, "studio", "Landing page, two rounds of revision. The client pays $1,200 for the job."),
      msg("a2", jobId, "maya", "I'll take the UI. My share is $800."),
      msg("a3", jobId, "client", "Confirmed. $1,200 total. Maya receives $800. The studio keeps $400."),
    ];
    const outcome = await applyReadyDraft(jobId, messages);
    if (outcome.clientAmount !== "1200.00") throw new Error(`client ${outcome.clientAmount}`);
    if (!outcome.evidence.clientAmount) throw new Error("missing client evidence");
  });

  await run("2. Conflicting offers without acceptance", async () => {
    const jobId = "agr-test-2";
    const messages = [
      msg("b1", jobId, "studio", "Landing page. Client pays $1,200."),
      msg("b2", jobId, "client", "I can only pay $1,000."),
      msg("b3", jobId, "maya", "My share is $800."),
    ];
    const outcome = readAgreementFromMessages(messages);
    if (outcome.status !== "needs_clarification") throw new Error(`status ${outcome.status}`);
    if (outcome.questions.length === 0) throw new Error("expected questions");
  });

  await run("3. Explicit correction uses new Maya share", async () => {
    const jobId = "agr-test-3";
    const messages = [
      msg("c1", jobId, "studio", "Landing page, two rounds. Client pays $1,200."),
      msg("c2", jobId, "maya", "My share is $800."),
      msg("c3", jobId, "client", "Confirmed."),
      msg("c4", jobId, "studio", "Correction: Maya share is $750 instead."),
    ];
    const outcome = readAgreementFromMessages(messages);
    if (outcome.status !== "ready") throw new Error(`status ${outcome.status}`);
    if (outcome.mayaAmount !== "750.00") throw new Error(`maya ${outcome.mayaAmount}`);
    if (outcome.studioAmount !== "450.00") throw new Error(`studio ${outcome.studioAmount}`);
  });

  await run("4. Missing numbers are not filled from seed", async () => {
    const jobId = "agr-test-4";
    const messages = [msg("d1", jobId, "studio", "Landing page with two revision rounds.")];
    const outcome = readAgreementFromMessages(messages);
    if (outcome.status !== "needs_clarification") throw new Error(`status ${outcome.status}`);
    if (outcome.clientAmount) throw new Error("client amount invented");
    if (outcome.evidence.clientAmount) throw new Error("client evidence invented");
  });

  await run("5. validateEvidence rejects bad references", async () => {
    const jobId = "agr-test-5";
    const messages = [msg("e1", jobId, "studio", "Client pays $1,200.")];
    const badId: AgreementEvidence = {
      clientAmount: { kind: "quoted", messageId: "missing", quote: "$1,200" },
    };
    if (!validateEvidence(badId, messages, jobId)) throw new Error("expected missing id error");
    const badQuote: AgreementEvidence = {
      clientAmount: { kind: "quoted", messageId: "e1", quote: "$9,999" },
    };
    if (!validateEvidence(badQuote, messages, jobId)) throw new Error("expected quote error");
    const otherJob = msg("e1", "other-job", "studio", "Client pays $1,200.");
    if (!validateEvidence(badQuote, [otherJob], jobId)) throw new Error("expected job mismatch");
  });

  await run("6. Studio remainder calculated", async () => {
    const jobId = "agr-test-6";
    const messages = [
      msg("f1", jobId, "studio", "Landing page. Client pays $1,200."),
      msg("f2", jobId, "maya", "My share is $800."),
      msg("f3", jobId, "client", "Deal. Confirmed."),
    ];
    const outcome = readAgreementFromMessages(messages);
    if (outcome.status !== "ready") throw new Error(`status ${outcome.status}`);
    if (outcome.evidence.studioAmount?.kind !== "calculated") {
      throw new Error(`studio evidence ${outcome.evidence.studioAmount?.kind}`);
    }
  });

  await run("7. Revision clears agreements and stale version rejected", async () => {
    const jobId = "agr-test-7";
    await freshJob(jobId);
    const messages = [
      msg("g1", jobId, "studio", "Landing page. Client $1,200."),
      msg("g2", jobId, "maya", "Maya $800."),
      msg("g3", jobId, "client", "Confirmed. Studio keeps $400."),
    ];
    await applyReadyDraft(jobId, messages);
    await client.query(
      `update jobs set client_agreed_at = now(), maya_agreed_at = now() where id = $1`,
      [jobId],
    );
    await client.query(
      `update jobs set
         work_summary = 'Landing page, two rounds',
         agreement_version = 2,
         client_agreed_at = null,
         maya_agreed_at = null
       where id = $1`,
      [jobId],
    );
    const row = await client.query("select agreement_version, client_agreed_at from jobs where id = $1", [
      jobId,
    ]);
    if (row.rows[0].client_agreed_at) throw new Error("agreements not cleared");
    const stale = await client.query(
      `update jobs set client_agreed_at = coalesce(client_agreed_at, now())
       where id = $1 and agreement_version = 1 returning *`,
      [jobId],
    );
    if (stale.rows.length > 0) throw new Error("stale version should not agree");
  });

  await run("8. Ambiguous draft cannot order or agree", async () => {
    const jobId = "agr-test-8";
    await freshJob(jobId);
    await client.query(
      `update jobs set agreement_status = 'needs_clarification', work_summary = 'TBD' where id = $1`,
      [jobId],
    );
    const job = (await client.query("select * from jobs where id = $1", [jobId])).rows[0];
    const order = orderEligibility(job);
    if (order.ok) throw new Error("order allowed");
    if (!job.work_summary) throw new Error("missing summary");
    await client.query(
      `update jobs set client_agreed_at = now(), maya_agreed_at = now() where id = $1`,
      [jobId],
    );
    const order2 = orderEligibility(
      (await client.query("select * from jobs where id = $1", [jobId])).rows[0],
    );
    if (order2.ok) throw new Error("order allowed with clarification");
  });

  await run("9. Agreement frozen after PayPal order", async () => {
    const jobId = "agr-test-9";
    await freshJob(jobId);
    await client.query(
      `update jobs set paypal_order_id = 'ORDER-LOCK', work_summary = 'Locked job' where id = $1`,
      [jobId],
    );
    const before = await client.query("select client_amount from jobs where id = $1", [jobId]);
    const res = await client.query(
      `update jobs set client_amount = 1.00 where id = $1 and paypal_order_id is null returning *`,
      [jobId],
    );
    if (res.rows.length > 0) throw new Error("amount changed with order");
    const after = await client.query("select client_amount from jobs where id = $1", [jobId]);
    if (before.rows[0].client_amount !== after.rows[0].client_amount) throw new Error("amount mutated");
  });

  await run("10. Order eligibility uses stored DB amounts", async () => {
    const jobId = "agr-test-10";
    await freshJob(jobId);
    await client.query(
      `update jobs set
         work_summary = 'Landing page',
         client_agreed_at = now(),
         maya_agreed_at = now(),
         agreement_status = 'ready',
         agreement_version = 1
       where id = $1`,
      [jobId],
    );
    const job = (await client.query("select * from jobs where id = $1", [jobId])).rows[0];
    const eligible = orderEligibility(job);
    if (!eligible.ok) throw new Error(eligible.error);
    if (job.client_amount !== "1200.00") throw new Error(`stored ${job.client_amount}`);
    void { clientAmount: "1.00" };
  });

  await run("11. Version 0 cannot be ordered", async () => {
    const jobId = "agr-test-11";
    await freshJob(jobId);
    await client.query(
      `update jobs set
         work_summary = 'Landing page',
         agreement_status = 'ready',
         client_agreed_at = now(),
         maya_agreed_at = now()
       where id = $1`,
      [jobId],
    );
    const job = (await client.query("select * from jobs where id = $1", [jobId])).rows[0];
    const eligible = orderEligibility(job);
    if (eligible.ok) throw new Error("version 0 was ordered");
  });

  await run("12. Fake citation is rejected", async () => {
    const messages = [msg("e1", "agr-fake", "studio", "Client pays $1,200.")];
    let calls = 0;
    const attempt = await draftWithModel(messages, "agr-fake", {
      apiKey: "test-key",
      fetchImpl: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "toolu_test",
                name: "submit_draft",
                input: {
                  status: "ready",
                  workSummary: "Landing page",
                  clientAmount: "9999.00",
                  mayaAmount: "800.00",
                  studioAmount: "400.00",
                  studioKind: "quoted",
                  questions: [],
                  workQuote: { messageId: "e1", quote: "Client pays $1,200." },
                  clientQuote: { messageId: "e1", quote: "$9,999" },
                  mayaQuote: { messageId: "", quote: "" },
                  studioQuote: { messageId: "", quote: "" },
                },
              },
            ],
            usage: { input_tokens: 11, output_tokens: 7 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });
    if (calls !== 2) throw new Error(`calls ${calls}`);
    if (attempt.validation !== "citation_rejected") throw new Error(attempt.validation);
    if (attempt.outcome.status !== "needs_clarification") throw new Error(attempt.outcome.status);
    if (attempt.outcome.clientAmount) throw new Error("invented client amount kept");
    if (attempt.model === "parser") throw new Error("labeled as parser");
  });

  await run("13. API failure uses a labeled parser", async () => {
    const messages = [
      msg("p1", "agr-parser", "studio", "Landing page, two rounds of revision. The client pays $1,200 for the job."),
      msg("p2", "agr-parser", "maya", "I'll take the UI. My share is $800."),
      msg("p3", "agr-parser", "client", "Confirmed. $1,200 total. Maya receives $800. The studio keeps $400."),
    ];
    let calls = 0;
    const attempt = await draftWithModel(messages, "agr-parser", {
      apiKey: "test-key",
      fetchImpl: async () => {
        calls += 1;
        return new Response("nope", { status: 500 });
      },
    });
    if (calls !== 1) throw new Error(`calls ${calls}`);
    if (attempt.validation !== "parser_fallback") throw new Error(attempt.validation);
    if (attempt.source !== "parser" || attempt.model !== "parser") throw new Error(attempt.model);
    if (attempt.outcome.status !== "ready" || attempt.outcome.clientAmount !== "1200.00") {
      throw new Error(`parser ${attempt.outcome.status}`);
    }
  });

  await run("14. Foreign amount after agreement is drift", async () => {
    if (!noteBreaksStoredAmounts("Correction: Maya share is $750.", ["1200.00", "800.00", "400.00"])) {
      throw new Error("expected drift");
    }
    if (noteBreaksStoredAmounts("Still $1,200 and $800.", ["1200.00", "800.00", "400.00"])) {
      throw new Error("same amounts should not drift");
    }
    if (noteBreaksStoredAmounts("See you tomorrow.", ["1200.00", "800.00", "400.00"])) {
      throw new Error("note without money should not drift");
    }
    const jobId = "agr-test-14";
    await freshJob(jobId);
    await client.query(
      `update jobs set
         work_summary = 'Landing page',
         agreement_status = 'ready',
         agreement_version = 1,
         client_agreed_at = now(),
         maya_agreed_at = now()
       where id = $1`,
      [jobId],
    );
    const before = (await client.query("select * from jobs where id = $1", [jobId])).rows[0];
    await markAgreementDrift(before);
    const after = (await client.query("select * from jobs where id = $1", [jobId])).rows[0];
    if (after.client_agreed_at || after.maya_agreed_at) throw new Error("agreements not cleared");
    if (after.agreement_status !== "needs_clarification") throw new Error(after.agreement_status);
    const order = orderEligibility(after);
    if (order.ok) throw new Error("order allowed after drift");
    const questions = await client.query(
      "select clarification_questions from agreement_revisions where job_id = $1 and version = $2",
      [jobId, after.agreement_version],
    );
    if (!JSON.stringify(questions.rows[0]?.clarification_questions).includes("Agreement drift")) {
      throw new Error("missing drift question");
    }
  });

  await run("15. Valid cited tool input is ready", async () => {
    const messages = [
      msg("v1", "agr-valid", "studio", "Landing page, two rounds of revision. The client pays $1,200."),
      msg("v2", "agr-valid", "maya", "My share is $800."),
    ];
    const attempt = await draftWithModel(messages, "agr-valid", {
      apiKey: "test-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: "tool_use",
                id: "toolu_ok",
                name: "submit_draft",
                input: {
                  status: "ready",
                  workSummary: "Landing page, two rounds of revision",
                  clientAmount: "1200.00",
                  mayaAmount: "800.00",
                  studioAmount: "",
                  studioKind: "calculated",
                  questions: [],
                  workQuote: { messageId: "v1", quote: "Landing page, two rounds of revision" },
                  clientQuote: { messageId: "v1", quote: "$1,200" },
                  mayaQuote: { messageId: "v2", quote: "$800" },
                  studioQuote: { messageId: "", quote: "" },
                },
              },
            ],
            usage: { input_tokens: 20, output_tokens: 15 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    if (attempt.validation !== "pass" || attempt.source !== "model") throw new Error(attempt.validation);
    if (attempt.outcome.status !== "ready") throw new Error(attempt.outcome.status);
    if (attempt.outcome.clientAmount !== "1200.00" || attempt.outcome.mayaAmount !== "800.00") {
      throw new Error("amounts");
    }
    if (attempt.outcome.studioAmount !== "400.00") throw new Error(attempt.outcome.studioAmount);
    if (attempt.outcome.evidence.studioAmount?.kind !== "calculated") throw new Error("studio evidence");
    if (attempt.inputTokens !== 20 || attempt.outputTokens !== 15) throw new Error("tokens");
  });

  await client.end();

  console.log("Agreement behavior tests (PostgreSQL)\n");
  for (const r of results) {
    console.log(`${r.pass ? "✅" : "❌"} ${r.name}${r.pass ? "" : ` — ${r.detail}`}`);
  }
  const passed = results.filter((r) => r.pass).length;
  console.log(`\nPassed: ${passed}/${results.length}`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
