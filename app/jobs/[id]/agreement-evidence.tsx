import type { AgreementEvidence, FieldEvidence } from "@/lib/agreement";
import { moneyVisible, type JobPayload } from "@/lib/job";
import { usdLabel } from "@/lib/money";

type Props = {
  job: JobPayload;
  drifted: boolean;
  onViewSource: (messageId: string) => void;
};

// A money quote that no longer backs a stored amount: replaced by a later note
// (drift) or cited by a draft that still needs an answer.
type Stale = "superseded" | "unresolved" | null;

function sourceLabel(field: FieldEvidence | undefined, needsClarify: boolean, stale: Stale): string {
  if (!field) return needsClarify ? "Needs clarification" : "—";
  if (stale === "superseded") return "Superseded";
  if (stale === "unresolved") return "Unresolved";
  if (field.kind === "quoted") return "Quoted";
  return "Calculated";
}

function FieldRow({
  label,
  value,
  field,
  needsClarify,
  stale = null,
  onViewSource,
}: {
  label: string;
  value: string;
  field: FieldEvidence | undefined;
  needsClarify: boolean;
  stale?: Stale;
  onViewSource: (messageId: string) => void;
}) {
  const badge = sourceLabel(field, needsClarify, stale);
  return (
    <div className={`evidence-row${field && stale ? ` ${stale}` : ""}`}>
      <div className="evidence-head">
        <span className="evidence-label">{label}</span>
        <span className={`evidence-badge ${badge.replace(/\s+/g, "-").toLowerCase()}`}>{badge}</span>
      </div>
      <p className="evidence-value">{value}</p>
      {field?.kind === "quoted" ? (
        <div className="evidence-meta">
          <p className="evidence-quote">&ldquo;{field.quote}&rdquo;</p>
          <button className="ghost evidence-link" onClick={() => onViewSource(field.messageId)} type="button">
            View source
          </button>
        </div>
      ) : null}
      {field?.kind === "calculated" ? (
        <div className="evidence-meta">
          <p className="evidence-formula">clientAmount − mayaAmount</p>
          <button
            className="ghost evidence-link"
            onClick={() => onViewSource(field.operands.clientAmount.messageId)}
            type="button"
          >
            View client source
          </button>
          <button
            className="ghost evidence-link"
            onClick={() => onViewSource(field.operands.mayaAmount.messageId)}
            type="button"
          >
            View Maya source
          </button>
        </div>
      ) : null}
      {field && stale === "superseded" ? (
        <p className="evidence-hint">A later note changed this amount. Draft again before anyone agrees.</p>
      ) : null}
      {field && stale === "unresolved" ? (
        <p className="evidence-hint">Cited, but not stored until the question above is answered.</p>
      ) : null}
      {!field && needsClarify ? (
        <p className="evidence-hint">Answer in the thread, then draft again.</p>
      ) : null}
    </div>
  );
}

export function AgreementEvidencePanel({ job, drifted, onViewSource }: Props) {
  const evidence: AgreementEvidence = job.agreement_evidence ?? {};
  const needsClarify = job.agreement_status === "needs_clarification";
  const showMoney = moneyVisible(job);
  const moneyStale: Stale = showMoney ? null : drifted ? "superseded" : "unresolved";
  if (!job.work_summary && !needsClarify && !job.agreement_evidence) return null;

  return (
    <section className="evidence-card" aria-label="Agreement sources">
      <h2>Why these numbers?</h2>
      <p className="lede">
        {drifted
          ? "A note changed an amount after this draft. The old quotes below no longer count."
          : "Sources explain the draft. They do not mean both parties have agreed yet."}
      </p>
      <FieldRow
        label="Work"
        value={job.work_summary ?? "—"}
        field={evidence.workSummary}
        needsClarify={needsClarify && !evidence.workSummary}
        onViewSource={onViewSource}
      />
      <FieldRow
        label="Client pays"
        value={usdLabel(showMoney ? job.client_amount : null)}
        field={evidence.clientAmount}
        needsClarify={needsClarify && !evidence.clientAmount}
        stale={moneyStale}
        onViewSource={onViewSource}
      />
      <FieldRow
        label="Maya receives"
        value={usdLabel(showMoney ? job.maya_amount : null)}
        field={evidence.mayaAmount}
        needsClarify={needsClarify && !evidence.mayaAmount}
        stale={moneyStale}
        onViewSource={onViewSource}
      />
      <FieldRow
        label="Studio keeps"
        value={usdLabel(showMoney ? job.studio_amount : null)}
        field={evidence.studioAmount}
        needsClarify={needsClarify && !evidence.studioAmount}
        stale={moneyStale}
        onViewSource={onViewSource}
      />
    </section>
  );
}
