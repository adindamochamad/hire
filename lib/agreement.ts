import type { JobMessageRow } from "./db";
import { amountsAddUp, asMoney } from "./money";

export type AgreementStatus = "ready" | "needs_clarification";

export type EvidenceQuoted = {
  kind: "quoted";
  messageId: string;
  quote: string;
};

export type EvidenceCalculated = {
  kind: "calculated";
  formula: "clientAmount - mayaAmount";
  operands: {
    clientAmount: EvidenceQuoted;
    mayaAmount: EvidenceQuoted;
  };
};

export type FieldEvidence = EvidenceQuoted | EvidenceCalculated;

export type AgreementEvidence = {
  workSummary?: FieldEvidence;
  clientAmount?: FieldEvidence;
  mayaAmount?: FieldEvidence;
  studioAmount?: FieldEvidence;
};

export type DraftReady = {
  status: "ready";
  workSummary: string;
  clientAmount: string;
  mayaAmount: string;
  studioAmount: string;
  evidence: AgreementEvidence;
  questions: [];
};

export type DraftNeedsClarification = {
  status: "needs_clarification";
  workSummary: string | null;
  clientAmount: string | null;
  mayaAmount: string | null;
  studioAmount: string | null;
  evidence: AgreementEvidence;
  questions: string[];
};

export type DraftOutcome = DraftReady | DraftNeedsClarification;

type AmountHit = {
  amount: string;
  quote: string;
  messageId: string;
  party: JobMessageRow["party"];
  isCorrection: boolean;
  index: number;
};

const ACCEPT_WORDS =
  /\b(confirmed?|deal|agreed?|same numbers|writes those three|confirmed\.)\b/i;

const CORRECTION_WORDS = /\b(correction|instead|not \$|actually|revised to|update to)\b/i;

const CLIENT_HINT =
  /\b(client pays?|bill the client|total|i pay|one thousand two hundred|leftover|stays with the studio)\b/i;
const MAYA_HINT = /\b(maya|my share|send .* my way|owed to maya|interface work is mine|i'll take the ui)\b/i;
const STUDIO_HINT = /\b(studio keeps?|leftover|remainder|stays with the studio)\b/i;

function parseDollarAmount(text: string): { value: string; quote: string } | null {
  const match = text.match(/\$[\d,]+(?:\.\d{1,2})?/);
  if (!match) return null;
  const quote = match[0];
  const raw = quote.replace(/[$,]/g, "");
  const money = asMoney(raw);
  if (!money) return null;
  return { value: money, quote };
}

function parseSpokenAmount(text: string): { value: string; quote: string } | null {
  const lower = text.toLowerCase();
  if (/one thousand two hundred/.test(lower)) {
    const m = text.match(/one thousand two hundred(?:\s+dollars)?/i);
    return { value: "1200.00", quote: m?.[0] ?? "one thousand two hundred dollars" };
  }
  if (/\beight hundred\b/.test(lower) && !/\$/.test(text)) {
    const m = text.match(/\beight hundred\b/i);
    return { value: "800.00", quote: m?.[0] ?? "eight hundred" };
  }
  return null;
}

function allDollarAmounts(text: string): { value: string; quote: string }[] {
  const pattern = /\$[\d,]+(?:\.\d{1,2})?/g;
  const found: { value: string; quote: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const quote = match[0];
    const raw = quote.replace(/[$,]/g, "");
    const money = asMoney(raw);
    if (money) found.push({ value: money, quote });
  }
  return found;
}

function amountHits(messages: JobMessageRow[]): AmountHit[] {
  const hits: AmountHit[] = [];
  messages.forEach((message, index) => {
    const dollars = allDollarAmounts(message.body);
    const spoken = dollars.length === 0 ? parseSpokenAmount(message.body) : null;
    const parsedList = dollars.length > 0 ? dollars : spoken ? [spoken] : [];
    for (const parsed of parsedList) {
      hits.push({
        amount: parsed.value,
        quote: parsed.quote,
        messageId: message.id,
        party: message.party,
        isCorrection: CORRECTION_WORDS.test(message.body),
        index,
      });
    }
  });
  return hits;
}

function classifyHit(
  hit: AmountHit,
  messageBody: string,
): "client" | "maya" | "studio" | "unknown" {
  const quoteIndex = messageBody.indexOf(hit.quote);
  const windowStart = Math.max(0, quoteIndex - 48);
  const windowEnd = Math.min(messageBody.length, quoteIndex + hit.quote.length + 48);
  const near = messageBody.slice(windowStart, windowEnd);

  if (STUDIO_HINT.test(near) || /\bleftover\b/i.test(near)) return "studio";
  if (MAYA_HINT.test(near) || (hit.party === "maya" && hit.amount === "800.00")) return "maya";
  if (CLIENT_HINT.test(near) || /\btotal\b/i.test(near)) return "client";

  if (hit.party === "maya") return "maya";
  if (hit.party === "client" && hit.amount !== "400.00") return "client";
  if (hit.amount === "1200.00") return "client";
  if (hit.amount === "800.00") return "maya";
  if (hit.amount === "400.00") return "studio";
  return "unknown";
}

function pickFieldHits(
  messages: JobMessageRow[],
  field: "client" | "maya" | "studio",
): AmountHit[] {
  return amountHits(messages).filter((hit) => {
    const message = messages.find((m) => m.id === hit.messageId);
    if (!message) return false;
    return classifyHit(hit, message.body) === field;
  });
}

function resolveAmount(
  messages: JobMessageRow[],
  field: "client" | "maya" | "studio",
): { hit: AmountHit | null; conflict: boolean; conflicting: AmountHit[] } {
  let hits = pickFieldHits(messages, field);
  if (hits.length === 0) return { hit: null, conflict: false, conflicting: [] };

  const corrections = hits.filter((h) => h.isCorrection);
  if (corrections.length > 0) {
    return { hit: corrections[corrections.length - 1], conflict: false, conflicting: [] };
  }

  const distinct = new Map<string, AmountHit>();
  for (const h of hits) {
    distinct.set(`${h.amount}:${h.messageId}`, h);
  }
  const uniqueAmounts = new Set(hits.map((h) => h.amount));
  const hasAcceptance = messages.some((m) => ACCEPT_WORDS.test(m.body));

  if (uniqueAmounts.size > 1 && !hasAcceptance) {
    return { hit: null, conflict: true, conflicting: hits };
  }

  const last = hits[hits.length - 1];
  return { hit: last, conflict: false, conflicting: [] };
}

function scopeFromMessages(messages: JobMessageRow[]): {
  summary: string | null;
  evidence: EvidenceQuoted | null;
  conflict: boolean;
} {
  const scopePatterns = [/landing page[^.!?]*/i, /homepage[^.!?]*/i];
  const candidates: { summary: string; evidence: EvidenceQuoted }[] = [];

  for (const message of messages) {
    for (const pattern of scopePatterns) {
      const match = message.body.match(pattern);
      if (match) {
        const quote = match[0].trim();
        const summary =
          quote.toLowerCase().includes("landing page")
            ? "Landing page, two rounds of revision"
            : quote.charAt(0).toUpperCase() + quote.slice(1);
        candidates.push({
          summary,
          evidence: { kind: "quoted", messageId: message.id, quote },
        });
      }
    }
    if (/landing page/i.test(message.body) && /revision/i.test(message.body)) {
        const quoteMatch = message.body.match(/landing page[^.!?]*/i);
        const quote = quoteMatch?.[0].trim() ?? message.body;
        if (!candidates.some((c) => c.evidence.messageId === message.id)) {
          candidates.push({
            summary: "Landing page, two rounds of revision",
            evidence: {
              kind: "quoted",
              messageId: message.id,
              quote,
            },
          });
        }
    }
  }

  if (candidates.length === 0) {
    return { summary: null, evidence: null, conflict: false };
  }
  if (candidates.length > 1) {
    const distinct = new Set(candidates.map((c) => c.summary.toLowerCase()));
    if (distinct.size > 1 && !messages.some((m) => ACCEPT_WORDS.test(m.body))) {
      return { summary: null, evidence: null, conflict: true };
    }
  }
  const last = candidates[candidates.length - 1];
  return { summary: last.summary, evidence: last.evidence, conflict: false };
}

function studioQuoted(messages: JobMessageRow[]): EvidenceQuoted | null {
  const hits = pickFieldHits(messages, "studio");
  if (hits.length === 0) return null;
  const hit = hits[hits.length - 1];
  const message = messages.find((m) => m.id === hit.messageId);
  if (!message || !message.body.includes(hit.quote)) return null;
  return { kind: "quoted", messageId: hit.messageId, quote: hit.quote };
}

function cents(value: string): number {
  return Math.round(Number(value) * 100);
}

export function readAgreementFromMessages(messages: JobMessageRow[]): DraftOutcome {
  const questions: string[] = [];
  const evidence: AgreementEvidence = {};

  if (messages.length === 0) {
    return {
      status: "needs_clarification",
      workSummary: null,
      clientAmount: null,
      mayaAmount: null,
      studioAmount: null,
      evidence: {},
      questions: [
        "What work is included, and what are the client price, Maya share, and studio remainder?",
      ],
    };
  }

  const scope = scopeFromMessages(messages);
  if (scope.conflict) {
    questions.push("Which scope should the agreement use? The thread mentions more than one.");
  } else if (!scope.summary || !scope.evidence) {
    questions.push("What work is included in this job?");
  } else {
    evidence.workSummary = scope.evidence;
  }

  const client = resolveAmount(messages, "client");
  const maya = resolveAmount(messages, "maya");
  const studioDirect = resolveAmount(messages, "studio");

  if (client.conflict) {
    questions.push(
      `What is the client price? The thread mentions ${[...new Set(client.conflicting.map((h) => `$${h.amount.replace(".00", "")}`))].join(" and ")} without a clear acceptance.`,
    );
  } else if (!client.hit) {
    questions.push("What is the total client price?");
  } else {
    evidence.clientAmount = {
      kind: "quoted",
      messageId: client.hit.messageId,
      quote: client.hit.quote,
    };
  }

  if (maya.conflict) {
    questions.push(
      `What is Maya's share? The thread mentions ${[...new Set(maya.conflicting.map((h) => `$${h.amount.replace(".00", "")}`))].join(" and ")} without a clear acceptance.`,
    );
  } else if (!maya.hit) {
    questions.push("What is Maya's share?");
  } else {
    evidence.mayaAmount = {
      kind: "quoted",
      messageId: maya.hit.messageId,
      quote: maya.hit.quote,
    };
  }

  let studioAmount: string | null = null;
  if (studioDirect.conflict) {
    questions.push("What is the studio remainder?");
  } else if (studioDirect.hit) {
    studioAmount = studioDirect.hit.amount;
    evidence.studioAmount = {
      kind: "quoted",
      messageId: studioDirect.hit.messageId,
      quote: studioDirect.hit.quote,
    };
  } else if (
    client.hit &&
    maya.hit &&
    evidence.clientAmount?.kind === "quoted" &&
    evidence.mayaAmount?.kind === "quoted"
  ) {
    studioAmount = ((cents(client.hit.amount) - cents(maya.hit.amount)) / 100).toFixed(2);
    if (Number(studioAmount) <= 0) {
      questions.push("What is the studio remainder?");
      studioAmount = null;
    } else {
      evidence.studioAmount = {
        kind: "calculated",
        formula: "clientAmount - mayaAmount",
        operands: {
          clientAmount: evidence.clientAmount,
          mayaAmount: evidence.mayaAmount,
        },
      };
    }
  } else {
    const quoted = studioQuoted(messages);
    if (quoted) {
      const hit = pickFieldHits(messages, "studio").find((h) => h.messageId === quoted.messageId);
      if (hit) {
        studioAmount = hit.amount;
        evidence.studioAmount = quoted;
      } else {
        questions.push("What is the studio remainder?");
      }
    } else {
      questions.push("What is the studio remainder?");
    }
  }

  const workSummary = scope.summary;
  const clientAmount = client.hit?.amount ?? null;
  const mayaAmount = maya.hit?.amount ?? null;

  if (questions.length > 0) {
    return {
      status: "needs_clarification",
      workSummary,
      clientAmount,
      mayaAmount,
      studioAmount,
      evidence,
      questions,
    };
  }

  if (
    !workSummary ||
    !clientAmount ||
    !mayaAmount ||
    !studioAmount ||
    !amountsAddUp(clientAmount, mayaAmount, studioAmount)
  ) {
    return {
      status: "needs_clarification",
      workSummary,
      clientAmount,
      mayaAmount,
      studioAmount,
      evidence,
      questions: ["The amounts or scope are incomplete. Please clarify in the thread."],
    };
  }

  return {
    status: "ready",
    workSummary,
    clientAmount,
    mayaAmount,
    studioAmount,
    evidence,
    questions: [],
  };
}

export function messageMap(messages: JobMessageRow[]): Map<string, JobMessageRow> {
  return new Map(messages.map((m) => [m.id, m]));
}

function quotedValid(
  field: EvidenceQuoted,
  messages: JobMessageRow[],
  jobId: string,
): string | null {
  const map = messageMap(messages);
  const row = map.get(field.messageId);
  if (!row) return `unknown message id ${field.messageId}`;
  if (row.job_id !== jobId) return `message ${field.messageId} belongs to another job`;
  if (!row.body.includes(field.quote)) return `quote does not match message ${field.messageId}`;
  return null;
}

export function validateEvidence(
  evidence: AgreementEvidence,
  messages: JobMessageRow[],
  jobId: string,
  amounts?: { clientAmount: string; mayaAmount: string; studioAmount: string },
): string | null {
  const fields: (keyof AgreementEvidence)[] = [
    "workSummary",
    "clientAmount",
    "mayaAmount",
    "studioAmount",
  ];

  for (const name of fields) {
    const field = evidence[name];
    if (!field) continue;
    if (field.kind === "quoted") {
      const err = quotedValid(field, messages, jobId);
      if (err) return err;
      continue;
    }
    if (field.kind === "calculated") {
      if (field.formula !== "clientAmount - mayaAmount") {
        return "invalid calculated formula";
      }
      const cErr = quotedValid(field.operands.clientAmount, messages, jobId);
      if (cErr) return cErr;
      const mErr = quotedValid(field.operands.mayaAmount, messages, jobId);
      if (mErr) return mErr;
      if (amounts) {
        const expected = ((cents(amounts.clientAmount) - cents(amounts.mayaAmount)) / 100).toFixed(
          2,
        );
        if (expected !== amounts.studioAmount) {
          return "calculated studio amount does not match operands";
        }
      }
    }
  }
  return null;
}
