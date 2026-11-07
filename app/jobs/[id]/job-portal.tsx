"use client";

import { useEffect, useMemo, useState } from "react";
import {
  agreementLocked,
  hasCaptureEvent,
  hasPayoutEvent,
  jobStatus,
  statusLabel,
  type JobPayload,
  type PaypalEventPayload,
} from "@/lib/job";
import { amountsAddUp, formatUsd, splitCopy } from "@/lib/money";
import { BACKUP_THREAD, DEMO_THREAD, draftMessages, type ThreadMessage } from "@/lib/thread";

type ScriptId = "main" | "backup" | "blank";

type Props = {
  initialJob: JobPayload;
  initialEvents: PaypalEventPayload[];
};

type Busy =
  | "idle"
  | "draft"
  | "save"
  | "maya"
  | "client"
  | "order"
  | "capture"
  | "refresh"
  | "create";

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

export function JobPortal({ initialJob, initialEvents }: Props) {
  const [job, setJob] = useState(initialJob);
  const [events, setEvents] = useState(initialEvents);
  const [script, setScript] = useState<ScriptId>(initialJob.work_summary ? "main" : "blank");
  const [thread, setThread] = useState<ThreadMessage[]>(
    initialJob.work_summary ? DEMO_THREAD : [],
  );
  const [summary, setSummary] = useState(initialJob.work_summary ?? "");
  const [clientAmount, setClientAmount] = useState(initialJob.client_amount);
  const [mayaAmount, setMayaAmount] = useState(initialJob.maya_amount);
  const [studioAmount, setStudioAmount] = useState(initialJob.studio_amount);
  const [busy, setBusy] = useState<Busy>("idle");
  const [error, setError] = useState<string | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteParty, setNoteParty] = useState<ThreadMessage["party"]>("studio");

  const status = jobStatus(job, events);
  const locked = agreementLocked(job);
  const amountsOk = amountsAddUp(job.client_amount, job.maya_amount, job.studio_amount);
  const captureDone = hasCaptureEvent(events);
  const payoutDone = hasPayoutEvent(events) && Boolean(job.paypal_payout_item_id);
  const bothAgreed = Boolean(job.client_agreed_at && job.maya_agreed_at);

  function syncForm(next: JobPayload) {
    setSummary(next.work_summary ?? "");
    setClientAmount(next.client_amount);
    setMayaAmount(next.maya_amount);
    setStudioAmount(next.studio_amount);
  }

  async function refresh(): Promise<{ job: JobPayload; events: PaypalEventPayload[] }> {
    const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
    const payload = (await res.json()) as { job?: JobPayload; events?: PaypalEventPayload[]; error?: string };
    if (!res.ok || !payload.job) {
      throw new Error(payload.error ?? "could not refresh job");
    }
    setJob(payload.job);
    setEvents(payload.events ?? []);
    syncForm(payload.job);
    return { job: payload.job, events: payload.events ?? [] };
  }

  async function createJob() {
    await run("create", async () => {
      const res = await fetch("/api/jobs", { method: "POST" });
      const payload = await res.json();
      if (!res.ok || !payload.job?.id) throw new Error(errorMessage(payload, "could not create job"));
      window.location.href = `/jobs/${payload.job.id as string}`;
    });
  }

  function addNote() {
    const body = note.trim();
    if (!body) return;
    const names: Record<ThreadMessage["party"], string> = {
      studio: "Studio",
      maya: "Maya",
      client: "Client",
      system: "Hire",
    };
    setThread((current) => [
      ...current,
      {
        id: `n-${Date.now()}`,
        party: noteParty,
        name: names[noteParty],
        body,
      },
    ]);
    setNote("");
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
        body: JSON.stringify({ messages: draftMessages(thread) }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(errorMessage(payload, "draft failed"));
      const next = payload.job as JobPayload;
      setJob(next);
      syncForm(next);
      setThread((current) =>
        current.some((item) => item.id === "system-draft")
          ? current
          : [
              ...current,
              {
                id: "system-draft",
                party: "system",
                name: "Hire",
                body: "Agreement updated from conversation.",
              },
            ],
      );
    });
  }

  async function saveAgreement() {
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
    });
  }

  async function agree(party: "maya" | "client") {
    await run(party, async () => {
      const res = await fetch(`/api/jobs/${job.id}/agree`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ party }),
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

  const steps = useMemo(
    () => [
      {
        key: "draft",
        title: "Agreement drafted",
        copy: job.work_summary ?? "Waiting for a draft from the activity thread.",
        state: job.work_summary && amountsOk ? "done" : "pending",
      },
      {
        key: "maya",
        title: "Maya agreed",
        copy: job.maya_agreed_at
          ? formatWhen(job.maya_agreed_at)
          : "Maya has not agreed yet.",
        state: job.maya_agreed_at ? "done" : "pending",
      },
      {
        key: "client",
        title: "Client agreed",
        copy: job.client_agreed_at
          ? formatWhen(job.client_agreed_at)
          : "Client has not agreed yet.",
        state: job.client_agreed_at ? "done" : "pending",
      },
      {
        key: "capture",
        title: `Client paid ${formatUsd(job.client_amount)}`,
        copy: captureDone
          ? `PAYMENT.CAPTURE.COMPLETED · ${job.paypal_capture_id ?? "stored"}`
          : "Payout starts after client payment is confirmed.",
        state: captureDone ? "done" : bothAgreed ? "waiting" : "pending",
      },
      {
        key: "payout",
        title: `Maya paid ${formatUsd(job.maya_amount)}`,
        copy: payoutDone
          ? `PAYMENT.PAYOUTS-ITEM.SUCCEEDED · ${job.paypal_payout_item_id ?? "stored"}. Studio keeps ${formatUsd(job.studio_amount)}.`
          : "Maya is paid only after the capture webhook.",
        state: payoutDone ? "done" : captureDone ? "waiting" : "pending",
      },
    ],
    [amountsOk, bothAgreed, captureDone, job, payoutDone],
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
          {locked ? (
            <h1>{summary || "Job brief"}</h1>
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
          <p className="lede">{splitCopy(job.client_amount, job.maya_amount, job.studio_amount)}</p>
          {error ? <p className="banner">{error}</p> : null}
          {locked ? (
            <dl className="sheet-money">
              <div>
                <dt>Client pays</dt>
                <dd>{formatUsd(clientAmount)}</dd>
              </div>
              <div>
                <dt>Maya receives</dt>
                <dd>{formatUsd(mayaAmount)}</dd>
              </div>
              <div>
                <dt>Studio keeps</dt>
                <dd>{formatUsd(studioAmount)}</dd>
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
                    value={clientAmount}
                  />
                </label>
                <label className="field">
                  Maya receives
                  <input
                    inputMode="decimal"
                    disabled={busy !== "idle"}
                    onChange={(event) => setMayaAmount(event.target.value)}
                    value={mayaAmount}
                  />
                </label>
                <label className="field">
                  Studio keeps
                  <input
                    inputMode="decimal"
                    disabled={busy !== "idle"}
                    onChange={(event) => setStudioAmount(event.target.value)}
                    value={studioAmount}
                  />
                </label>
              </div>
              {!amountsAddUp(clientAmount, mayaAmount, studioAmount) ? (
                <p className="banner">
                  Client, Maya, and studio amounts must each be greater than zero, and the client
                  amount must equal Maya plus studio.
                </p>
              ) : null}
              <div className="actions">
                <button
                  className="secondary"
                  disabled={busy !== "idle"}
                  onClick={() => void saveAgreement()}
                  type="button"
                >
                  {busy === "save" ? "Saving…" : "Save agreement"}
                </button>
              </div>
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
            {job.maya_agreed_at ? null : (
              <button
                className="primary"
                disabled={busy !== "idle" || !amountsOk}
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
            {job.client_agreed_at ? null : (
              <button
                className="primary"
                disabled={busy !== "idle" || !amountsOk}
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
                  onClick={() => {
                    setScript("main");
                    setThread(DEMO_THREAD);
                  }}
                  type="button"
                >
                  Example
                </button>
                <button
                  className={script === "backup" ? "active" : undefined}
                  onClick={() => {
                    setScript("backup");
                    setThread(BACKUP_THREAD);
                  }}
                  type="button"
                >
                  Ambiguous example
                </button>
              </div>
            </div>
            <div className="thread">
              {thread.length === 0 ? (
                <p className="empty">No notes yet. Add a free-form note, or load an example.</p>
              ) : (
                thread.map((message) => (
                  <article className="message" key={message.id}>
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
                <span className="amount">{formatUsd(job.client_amount)}</span>
              </div>
              <div className="split-row">
                <span className="label">Maya receives</span>
                <span className="amount">{formatUsd(job.maya_amount)}</span>
              </div>
              <div className="split-row studio">
                <span className="label">Studio keeps</span>
                <span className="amount">{formatUsd(job.studio_amount)}</span>
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
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card">
            <h2>PayPal</h2>
            <p className="lede">
              The order is created with PayPal Agent Toolkit{" "}
              <code>create_order</code> from the stored {formatUsd(job.client_amount)}. Capture uses{" "}
              <code>pay_order</code>. Maya is paid {formatUsd(job.maya_amount)} on Payouts v1 only after
              the capture webhook. The model does not pick the PayPal amount.
            </p>
            {captureDone ? (
              <p className="settled">
                Client paid {formatUsd(job.client_amount)}.
                {payoutDone
                  ? ` Maya received ${formatUsd(job.maya_amount)}. Studio keeps ${formatUsd(job.studio_amount)}.`
                  : ` Waiting on Maya's ${formatUsd(job.maya_amount)}.`}
              </p>
            ) : (
              <div className="actions pay-actions">
                <button
                  className="primary"
                  disabled={busy !== "idle" || !bothAgreed}
                  onClick={() => void createOrder()}
                  type="button"
                >
                  {busy === "order" ? "Opening PayPal…" : `Pay ${formatUsd(job.client_amount)} on PayPal`}
                </button>
                {approveUrl ? (
                  <a className="paypal-link" href={approveUrl} rel="noreferrer" target="_blank">
                    Open PayPal to approve {formatUsd(job.client_amount)}
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
