import type { AgreementEvidence, FieldEvidence } from "@/lib/agreement";
import type { JobPayload } from "@/lib/job";
import { formatUsd } from "@/lib/money";

type Props = {
  job: JobPayload;
  onViewSource: (messageId: string) => void;
};

function sourceLabel(field: FieldEvidence | undefined, needsClarify: boolean): string {
  if (!field) return needsClarify ? "Needs clarification" : "—";
  if (field.kind === "quoted") return "Quoted";
  return "Calculated";
}

function FieldRow({
  label,
  value,
  field,
  needsClarify,
  onViewSource,
}: {
  label: string;
  value: string;
  field: FieldEvidence | undefined;
  needsClarify: boolean;
  onViewSource: (messageId: string) => void;
}) {
  const badge = sourceLabel(field, needsClarify);
  return (
    <div className="evidence-row">
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
      {!field && needsClarify ? (
        <p className="evidence-hint">Answer in the thread, then draft again.</p>
      ) : null}
    </div>
  );
}

export function AgreementEvidencePanel({ job, onViewSource }: Props) {
  const evidence: AgreementEvidence = job.agreement_evidence ?? {};
  const needsClarify = job.agreement_status === "needs_clarification";
  if (!job.work_summary && !needsClarify && !job.agreement_evidence) return null;

  return (
    <section className="evidence-card" aria-label="Agreement sources">
      <h2>Why these numbers?</h2>
      <p className="lede">
        Sources explain the draft. They do not mean both parties have agreed yet.
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
        value={formatUsd(job.client_amount)}
        field={evidence.clientAmount}
        needsClarify={needsClarify && !evidence.clientAmount}
        onViewSource={onViewSource}
      />
      <FieldRow
        label="Maya receives"
        value={formatUsd(job.maya_amount)}
        field={evidence.mayaAmount}
        needsClarify={needsClarify && !evidence.mayaAmount}
        onViewSource={onViewSource}
      />
      <FieldRow
        label="Studio keeps"
        value={formatUsd(job.studio_amount)}
        field={evidence.studioAmount}
        needsClarify={needsClarify && !evidence.studioAmount}
        onViewSource={onViewSource}
      />
    </section>
  );
}
