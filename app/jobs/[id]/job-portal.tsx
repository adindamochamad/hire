"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agreementLocked,
  jobStatus,
  moneyVisible,
  statusLabel,
  type AiRunPayload,
  type JobMessagePayload,
  type JobPayload,
  type PaypalEventPayload,
} from "@/lib/job";
import { amountsAddUp, formatUsd, splitCopy, usdLabel } from "@/lib/money";
import { BACKUP_THREAD, DEMO_THREAD, type ThreadMessage } from "@/lib/thread";
import { AgreementEvidencePanel } from "./agreement-evidence";

type ScriptId = "main" | "backup" | "blank";

type Props = {
  initialJob: JobPayload;
  initialEvents: PaypalEventPayload[];
  initialMessages: JobMessagePayload[];
  initialClarificationQuestions: string[];
  initialAiRun: AiRunPayload | null;
};

function toThread(messages: JobMessagePayload[]): ThreadMessage[] {
  return messages.map((message) => ({
    id: message.id,
    party: message.party,
    name: message.author_name,
    body: message.body,
  }));
}

type Busy =
  | "idle"
  | "draft"
  | "save"
  | "maya"
  | "client"
  | "order"
  | "capture"
  | "refresh"
  | "create"
  | "note";

function errorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string") return value;
  }
  return fallback;
}

function formatWhen(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function blankUnlessVisible(job: JobPayload, amount: string | null): string {
  return moneyVisible(job) && amount ? amount : "";
}

export function JobPortal({
  initialJob,
  initialEvents,
  initialMessages,
  initialClarificationQuestions,
  initialAiRun,
}: Props) {
  const [job, setJob] = useState(initialJob);
  const [events, setEvents] = useState(initialEvents);
  const [script, setScript] = useState<ScriptId>(initialMessages.length > 0 ? "main" : "blank");
  const [thread, setThread] = useState<ThreadMessage[]>(
    initialMessages.length > 0 ? toThread(initialMessages) : [],
  );
  const [summary, setSummary] = useState(initialJob.work_summary ?? "");
  const [clientAmount, setClientAmount] = useState(blankUnlessVisible(initialJob, initialJob.client_amount));
  const [mayaAmount, setMayaAmount] = useState(blankUnlessVisible(initialJob, initialJob.maya_amount));
  const [studioAmount, setStudioAmount] = useState(blankUnlessVisible(initialJob, initialJob.studio_amount));
  const [aiRun, setAiRun] = useState<AiRunPayload | null>(initialAiRun);
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteParty, setNoteParty] = useState<"studio" | "maya" | "client">("studio");
  const [clarificationQuestions, setClarificationQuestions] = useState(
    initialClarificationQuestions,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});

  const status = jobStatus(job, events);
  const locked = agreementLocked(job);
  const amountsOk = amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
  const captureDone = Boolean(job.paypal_capture_id);
  const payoutDone = Boolean(job.paypal_payout_item_id);
  const bothAgreed = Boolean(job.client_agreed_at && job.maya_agreed_at);
  const needsClarification = job.agreement_status === "needs_clarification";
  const showMoney = moneyVisible(job);
  const canAgree =
    showMoney &&
    job.agreement_status === "ready" &&
    job.agreement_version > 0 &&
    amountsOk &&
    Boolean(job.work_summary) &&
    !locked;
  const storedClient = showMoney ? job.client_amount : "";
  const storedMaya = showMoney ? job.maya_amount : "";
  const storedStudio = showMoney ? job.studio_amount : "";
  const formDirty =
    summary !== (job.work_summary ?? "") ||
    clientAmount !== storedClient ||
    mayaAmount !== storedMaya ||
    studioAmount !== storedStudio;

  function syncForm(next: JobPayload) {
    setSummary(next.work_summary ?? "");
    setClientAmount(blankUnlessVisible(next, next.client_amount));
    setMayaAmount(blankUnlessVisible(next, next.maya_amount));
    setStudioAmount(blankUnlessVisible(next, next.studio_amount));
  }

  async function refresh(): Promise<{ job: JobPayload; events: PaypalEventPayload[] }> {
    const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    const payload = (await res.json()) as {
      job?: JobPayload;
      events?: PaypalEventPayload[];
      messages?: JobMessagePayload[];
      clarificationQuestions?: string[];
      aiRun?: AiRunPayload | null;
      error?: string;
    };
    if (!res.ok || !payload.job) {
      throw new Error(payload.error ?? "could not refresh job");
    }
    setJob(payload.job);
    setEvents(payload.events ?? []);
    if (payload.messages) setThread(toThread(payload.messages));
    setClarificationQuestions(payload.clarificationQuestions ?? []);
    setAiRun(payload.aiRun ?? null);
    syncForm(payload.job);
    return { job: payload.job, events: payload.events ?? [] };
  }

  function viewSource(messageId: string) {
    setHighlightedMessageId(messageId);
    const node = messageRefs.current[messageId];
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => setHighlightedMessageId(null), 2400);
  }

  async function seedStarterMessages(starter: ThreadMessage[]) {
    for (const message of starter) {
      const res = await fetch(`/api/jobs/${job.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party: message.party,
          authorName: message.name,
          body: message.body,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "could not save note"));
    }
    await refresh();
  }

  async function createJob() {
    await run("create", async () => {
      const res = await fetch("/api/jobs", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.job?.id) throw new Error(errorMessage(payload, "could not create job"));
      window.location.href = `/jobs/${payload.job.id as string}`;
    });
  }

  async function addNote() {
    const body = note.trim();
    if (!body) return;
    const names: Record<Exclude<ThreadMessage["party"], "system">, string> = {
      studio: "Studio",
      maya: "Maya",
      client: "Client",
    };
    await run("note", async () => {
      const res = await fetch(`/api/jobs/${job.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party: noteParty,
          authorName: names[noteParty],
          body,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "could not save note"));
      setNote("");
      await refresh();
    });
  }

  async function run(kind: Busy, work: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request failed");
    } finally {
      setBusy("idle");
    }
  }

  async function draftFromActivity() {
    await run("draft", async () => {
      const res = await fetch(`/api/jobs/${job.id}/draft`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "draft failed"));
      const next = payload.job as JobPayload;
      setJob(next);
      syncForm(next);
      if (payload.draft?.questions) {
        setClarificationQuestions(payload.draft.questions as string[]);
      } else {
        setClarificationQuestions([]);
      }
      if (payload.aiRun) setAiRun(payload.aiRun as AiRunPayload);
    });
  }

  async function saveAgreement() {
    if (!pendingSave && formDirty) {
      setPendingSave(true);
      return;
    }
    await run("save", async () => {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workSummary: summary,
          clientAmount,
          mayaAmount,
          studioAmount,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "could not save agreement"));
      const next = payload.job as JobPayload;
      setJob(next);
      syncForm(next);
      setPendingSave(false);
    });
  }

  async function agree(party: "maya" | "client") {
    await run(party, async () => {
      const res = await fetch(`/api/jobs/${job.id}/agree`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          party,
          agreementVersion: job.agreement_version > 0 ? job.agreement_version : undefined,
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "could not record agreement"));
      const next = payload.job as JobPayload;
      setJob(next);
    });
  }

  async function createOrder() {
    await run("order", async () => {
      const res = await fetch(`/api/jobs/${job.id}/order`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "could not create PayPal order"));
      await refresh();
      const nextApproveUrl = typeof payload.approveUrl === "string" ? payload.approveUrl : null;
      setApproveUrl(nextApproveUrl);
      if (nextApproveUrl) window.open(nextApproveUrl, "_blank", "noopener,noreferrer");
    });
  }

  async function capture() {
    await run("capture", async () => {
      const res = await fetch(`/api/jobs/${job.id}/capture`, { method: "POST" });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "capture failed"));
      await refresh();
    });
  }

  useEffect(() => {
    if (status !== "awaiting_payment" && status !== "paying_maya") return;
    const timer = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [status, job.id]);

  const orderUrl = job.paypal_order_id
    ? `https://www.sandbox.paypal.com/checkoutnow?token=${encodeURIComponent(job.paypal_order_id)}`
    : null;
  const steps = useMemo(
    () => [
      {
        key: "agreed",
        title: "Agreed",
        copy: bothAgreed
          ? `Maya ${formatWhen(job.maya_agreed_at)}. Client ${formatWhen(job.client_agreed_at)}.`
          : "Maya and the client both agree before PayPal opens.",
        state: bothAgreed ? "done" : job.maya_agreed_at || job.client_agreed_at ? "waiting" : "pending",
      },
      {
        key: "order",
        title: "Order",
        copy: job.paypal_order_id
          ? `Order ${job.paypal_order_id}`
          : "No PayPal order yet.",
        href: orderUrl,
        state: job.paypal_order_id ? "done" : bothAgreed ? "waiting" : "pending",
      },
      {
        key: "captured",
        title: "Captured",
        copy: job.paypal_capture_id
          ? `PAYMENT.CAPTURE.COMPLETED · ${job.paypal_capture_id}`
          : "Capture is recorded only with a PayPal capture id.",
        state: captureDone ? "done" : job.paypal_order_id ? "waiting" : "pending",
      },
      {
        key: "payout",
        title: "Payout sent",
        copy: job.paypal_payout_item_id
          ? `PAYMENT.PAYOUTS-ITEM.SUCCEEDED · ${job.paypal_payout_item_id}`
          : "Maya's payout is recorded only with a payout item id.",
        state: payoutDone ? "done" : captureDone ? "waiting" : "pending",
      },
    ],
    [bothAgreed, captureDone, job, orderUrl, payoutDone],
  );

  return (
    <div className="page">
      <header className="topbar">
        <a className="wordmark" href="/">
          Hire
        </a>
        <div className="topbar-actions">
          <button
            className="ghost"
            disabled={busy !== "idle"}
            onClick={() => void createJob()}
            type="button"
          >
            {busy === "create" ? "Opening…" : "New Job"}
          </button>
          <span className={`pill ${status}`}>{statusLabel(status)}</span>
        </div>
      </header>

      <main className="shell">
        <article className="brief">
          <p className="eyebrow">{job.id}</p>
          <h1 className="headline">AI cannot move money it can't cite.</h1>
          <p className="impact">
            Remote&apos;s 2025 survey of 3,300 freelancers found that 85% are paid late at least some of
            the time.{" "}
            <a
              href="https://remote.com/blog/contractor-management/reversing-late-payment-culture"
              rel="noreferrer"
              target="_blank"
            >
              Source
            </a>
            . Hire is the page for a small studio that subcontracts the work to Maya.
          </p>
          {locked ? (
            <h2 className="job-title">{summary || "Job brief"}</h2>
          ) : (
            <label className="title-field">
              <span>Work summary</span>
              <textarea
                disabled={busy !== "idle"}
                onChange={(event) => setSummary(event.target.value)}
                value={summary}
              />
            </label>
          )}
          <p className="lede">
            {showMoney && job.client_amount && job.maya_amount && job.studio_amount
              ? splitCopy(job.client_amount, job.maya_amount, job.studio_amount)
              : "Client, Maya, and studio amounts appear after a draft the server can cite."}
          </p>
          {error ? <p className="banner">{error}</p> : null}
          {needsClarification && clarificationQuestions.length > 0 ? (
            <div className="clarify-card" role="status">
              <h2>Needs clarification</h2>
              <ul>
                {clarificationQuestions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <AgreementEvidencePanel job={job} onViewSource={viewSource} />
          {locked ? (
            <p className="banner">
              This job already has a PayPal order. Start a new job to negotiate a different agreement.
            </p>
          ) : null}
          {locked ? (
            <dl className="sheet-money">
              <div>
                <dt>Client pays</dt>
                <dd>{usdLabel(clientAmount)}</dd>
              </div>
              <div>
                <dt>Maya receives</dt>
                <dd>{usdLabel(mayaAmount)}</dd>
              </div>
              <div>
                <dt>Studio keeps</dt>
                <dd>{usdLabel(studioAmount)}</dd>
              </div>
            </dl>
          ) : (
            <>
              <div className="money-grid">
                <label className="field">
                  Client pays
                  <input
                    inputMode="decimal"
                    disabled={busy !== "idle"}
                    onChange={(event) => setClientAmount(event.target.value)}
                    placeholder="After a cited draft"
                    value={clientAmount}
                  />
                </label>
                <label className="field">
                  Maya receives
                  <input
                    inputMode="decimal"
                    disabled={busy !== "idle"}
                    onChange={(event) => setMayaAmount(event.target.value)}
                    placeholder="After a cited draft"
                    value={mayaAmount}
                  />
                </label>
                <label className="field">
                  Studio keeps
                  <input
                    inputMode="decimal"
                    disabled={busy !== "idle"}
                    onChange={(event) => setStudioAmount(event.target.value)}
                    placeholder="After a cited draft"
                    value={studioAmount}
                  />
                </label>
              </div>
              {(clientAmount || mayaAmount || studioAmount) &&
              !amountsAddUp(clientAmount, mayaAmount, studioAmount) ? (
                <p className="banner">
                  Client, Maya, and studio amounts must each be greater than zero, and the client
                  amount must equal Maya plus studio.
                </p>
              ) : null}
              {pendingSave && formDirty ? (
                <div className="revision-diff">
                  <h2>Review changes</h2>
                  <p className="lede">Saving resets Maya and client agreement on this version.</p>
                  <dl>
                    {summary !== (job.work_summary ?? "") ? (
                      <div>
                        <dt>Work summary</dt>
                        <dd>
                          <span className="diff-old">{job.work_summary ?? "—"}</span>
                          <span className="diff-arrow">→</span>
                          <span className="diff-new">{summary}</span>
                        </dd>
                      </div>
                    ) : null}
                    {clientAmount !== storedClient ? (
                      <div>
                        <dt>Client pays</dt>
                        <dd>
                          <span className="diff-old">{usdLabel(showMoney ? job.client_amount : null)}</span>
                          <span className="diff-arrow">→</span>
                          <span className="diff-new">{formatUsd(clientAmount)}</span>
                        </dd>
                      </div>
                    ) : null}
                    {mayaAmount !== storedMaya ? (
                      <div>
                        <dt>Maya receives</dt>
                        <dd>
                          <span className="diff-old">{usdLabel(showMoney ? job.maya_amount : null)}</span>
                          <span className="diff-arrow">→</span>
                          <span className="diff-new">{formatUsd(mayaAmount)}</span>
                        </dd>
                      </div>
                    ) : null}
                    {studioAmount !== storedStudio ? (
                      <div>
                        <dt>Studio keeps</dt>
                        <dd>
                          <span className="diff-old">{usdLabel(showMoney ? job.studio_amount : null)}</span>
                          <span className="diff-arrow">→</span>
                          <span className="diff-new">{formatUsd(studioAmount)}</span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="actions">
                    <button
                      className="secondary"
                      disabled={busy !== "idle"}
                      onClick={() => setPendingSave(false)}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="primary"
                      disabled={busy !== "idle" || !amountsAddUp(clientAmount, mayaAmount, studioAmount)}
                      onClick={() => void saveAgreement()}
                      type="button"
                    >
                      {busy === "save" ? "Saving…" : "Confirm save"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy !== "idle" || !formDirty}
                    onClick={() => void saveAgreement()}
                    type="button"
                  >
                    {busy === "save" ? "Saving…" : "Save agreement"}
                  </button>
                </div>
              )}
            </>
          )}
          <p className="lede">
            This studio view can record both agreements. The home page opens a fresh PayPal request
            id.
          </p>
          <div className="party-row">
            <div>
              <strong>Maya</strong>
              <div className={job.maya_agreed_at ? "ok" : "empty"}>
                {job.maya_agreed_at ? `Agreed ${formatWhen(job.maya_agreed_at)}` : "Not agreed"}
              </div>
            </div>
            {job.maya_agreed_at || locked ? null : (
              <button
                className="primary"
                disabled={busy !== "idle" || !canAgree}
                onClick={() => void agree("maya")}
                type="button"
              >
                {busy === "maya" ? "Saving…" : "Agree"}
              </button>
            )}
          </div>
          <div className="party-row">
            <div>
              <strong>Client</strong>
              <div className={job.client_agreed_at ? "ok" : "empty"}>
                {job.client_agreed_at ? `Agreed ${formatWhen(job.client_agreed_at)}` : "Not agreed"}
              </div>
            </div>
            {job.client_agreed_at || locked ? null : (
              <button
                className="primary"
                disabled={busy !== "idle" || !canAgree}
                onClick={() => void agree("client")}
                type="button"
              >
                {busy === "client" ? "Saving…" : "Agree"}
              </button>
            )}
          </div>

          <section className="notes">
            <div className="notes-head">
              <h2>Notes</h2>
              <div className="script-switch" role="group" aria-label="Starter notes">
                <button
                  className={script === "main" ? "active" : undefined}
                  disabled={locked || busy !== "idle"}
                  onClick={() => {
                    void run("note", async () => {
                      if (thread.length > 0) {
                        throw new Error("Start a new job before loading another example.");
                      }
                      setScript("main");
                      await seedStarterMessages(DEMO_THREAD);
                    });
                  }}
                  type="button"
                >
                  Example
                </button>
                <button
                  className={script === "backup" ? "active" : undefined}
                  disabled={locked || busy !== "idle"}
                  onClick={() => {
                    void run("note", async () => {
                      if (thread.length > 0) {
                        throw new Error("Start a new job before loading another example.");
                      }
                      setScript("backup");
                      await seedStarterMessages(BACKUP_THREAD);
                    });
                  }}
                  type="button"
                >
                  Ambiguous example
                </button>
              </div>
            </div>
            <p className="lede">
              Example cites $1,200 / $800 / $400. Ambiguous example leaves a $1,200 studio quote
              and a $1,000 client budget unresolved. After both parties agree, a note with a new
              dollar amount is agreement drift and PayPal stays locked.
            </p>
            <div className="thread">
              {thread.length === 0 ? (
                <div className="empty-state">
                  <p>No notes yet.</p>
                  <p>
                    Add what the client pays, what Maya receives, and what the studio keeps. The split
                    stays blank until a draft can cite those notes.
                  </p>
                </div>
              ) : (
                thread.map((message) => (
                  <article
                    className={`message${highlightedMessageId === message.id ? " message-highlight" : ""}`}
                    key={message.id}
                    ref={(node) => {
                      messageRefs.current[message.id] = node;
                    }}
                  >
                    <div className={`avatar ${message.party}`} aria-hidden>
                      {message.name.slice(0, 1)}
                    </div>
                    <div>
                      <header>
                        <strong>{message.name}</strong>
                      </header>
                      <p className={message.party === "system" ? "system-line" : undefined}>
                        {message.body}
                      </p>
                    </div>
                  </article>
                ))
              )}
            </div>
            {locked ? null : (
              <>
                <form
                  className="composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addNote();
                  }}
                >
                  <div className="party-switch" role="group" aria-label="Who is writing">
                    {(["studio", "maya", "client"] as const).map((party) => (
                      <button
                        key={party}
                        className={noteParty === party ? "active" : undefined}
                        onClick={() => setNoteParty(party)}
                        type="button"
                      >
                        {party === "studio" ? "Studio" : party === "maya" ? "Maya" : "Client"}
                      </button>
                    ))}
                  </div>
                  <div className="composer-row">
                    <input
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add a free-form note, including messy numbers"
                    />
                    <button className="secondary" type="submit">
                      Add
                    </button>
                  </div>
                </form>
                <div className="actions">
                  <button
                    className="secondary"
                    disabled={busy !== "idle"}
                    onClick={() => void draftFromActivity()}
                    type="button"
                  >
                    {busy === "draft" ? "Drafting…" : "Draft agreement from notes"}
                  </button>
                </div>
              </>
            )}
          </section>
        </article>

        <aside className="rail">
          <section className="card">
            <h2>Split</h2>
              <div className="split">
              <div className="split-row">
                <span className="label">Client pays</span>
                <span className="amount">{usdLabel(showMoney ? job.client_amount : null)}</span>
              </div>
              <div className="split-row">
                <span className="label">Maya receives</span>
                <span className="amount">{usdLabel(showMoney ? job.maya_amount : null)}</span>
              </div>
              <div className="split-row studio">
                <span className="label">Studio keeps</span>
                <span className="amount">{usdLabel(showMoney ? job.studio_amount : null)}</span>
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Timeline</h2>
            <ol className="timeline">
              {steps.map((step) => (
                <li key={step.key}>
                  <span className="mark">
                    <span className={`dot ${step.state}`} />
                  </span>
                  <div>
                    <div className="step-title">{step.title}</div>
                    <div className="step-copy">{step.copy}</div>
                    {"href" in step && step.href ? (
                      <a className="paypal-link" href={step.href} rel="noreferrer" target="_blank">
                        Open sandbox order
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>PayPal</h2>
            <p className="lede">
              The order is created with PayPal Agent Toolkit <code>create_order</code> from the stored
              client amount. Capture uses <code>pay_order</code>. Maya is paid the stored share on
              Payouts v1 only after the capture webhook. The model does not pick the PayPal amount.
            </p>
            {captureDone ? (
              <p className="settled">
                Client paid {usdLabel(job.client_amount)}. Capture {job.paypal_capture_id}.
                {payoutDone
                  ? ` Maya received ${usdLabel(job.maya_amount)}. Payout item ${job.paypal_payout_item_id}. Studio keeps ${usdLabel(job.studio_amount)}.`
                  : " Waiting on Maya's payout item id."}
              </p>
            ) : (
              <div className="actions pay-actions">
                <button
                  className="primary"
                  disabled={busy !== "idle" || !bothAgreed || needsClarification}
                  onClick={() => void createOrder()}
                  type="button"
                >
                  {busy === "order"
                    ? "Opening PayPal…"
                    : showMoney && job.client_amount
                      ? `Pay ${formatUsd(job.client_amount)} on PayPal`
                      : "Pay on PayPal"}
                </button>
                {approveUrl ? (
                  <a className="paypal-link" href={approveUrl} rel="noreferrer" target="_blank">
                    Open PayPal to approve {usdLabel(showMoney ? job.client_amount : null)}
                  </a>
                ) : null}
                {job.paypal_order_id ? (
                  <button
                    className="secondary"
                    disabled={busy !== "idle"}
                    onClick={() => void capture()}
                    type="button"
                  >
                    {busy === "capture" ? "Capturing…" : "Capture order"}
                  </button>
                ) : null}
              </div>
            )}
            <div className="actions">
              <button
                className="ghost"
                disabled={busy !== "idle"}
                onClick={() =>
                  void run("refresh", async () => {
                    await refresh();
                  })
                }
                type="button"
              >
                Refresh
              </button>
            </div>
          </section>

          <section className="card">
            <h2>Draft run</h2>
            {aiRun ? (
              <>
                <p className="lede">
                  {aiRun.validation === "parser_fallback"
                    ? "Parsed from notes, not a model."
                    : aiRun.validation === "citation_rejected"
                      ? `Rejected by the server. ${aiRun.model} cited something that is not in the notes.`
                      : `Drafted by ${aiRun.model}.`}
                </p>
                <dl className="records">
                  <div>
                    <dt>Model</dt>
                    <dd>{aiRun.model}</dd>
                  </div>
                  <div>
                    <dt>Latency</dt>
                    <dd>{aiRun.latency_ms} ms</dd>
                  </div>
                  <div>
                    <dt>Tokens</dt>
                    <dd>
                      {aiRun.input_tokens ?? "—"} in / {aiRun.output_tokens ?? "—"} out
                    </dd>
                  </div>
                  <div>
                    <dt>Validation</dt>
                    <dd>{aiRun.validation}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="lede">No draft run yet.</p>
            )}
          </section>

          <section className="card">
            <h2>Payment records</h2>
            <dl className="records">
              <div>
                <dt>Order</dt>
                <dd>{job.paypal_order_id ?? "—"}</dd>
              </div>
              <div>
                <dt>Capture</dt>
                <dd>{job.paypal_capture_id ?? "—"}</dd>
              </div>
              <div>
                <dt>Payout item</dt>
                <dd>{job.paypal_payout_item_id ?? "—"}</dd>
              </div>
            </dl>
            <ul className="records events">
              {events.length === 0 ? (
                <li>No verified PayPal events yet.</li>
              ) : (
                events.map((event) => (
                  <li key={event.id}>
                    {event.event_type} · {event.resource_id ?? event.id}
                  </li>
                ))
              )}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}
