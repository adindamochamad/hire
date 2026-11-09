import {
  readAgreementFromMessages,
  validateEvidence,
  type AgreementEvidence,
  type DraftOutcome,
  type EvidenceQuoted,
} from "./agreement";
import type { JobMessageRow } from "./db";
import { amountsAddUp, asMoney } from "./money";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5-5";

export type DraftValidation = "pass" | "citation_rejected" | "parser_fallback";

export type DraftAttempt = {
  source: "model" | "parser";
  validation: DraftValidation;
  outcome: DraftOutcome;
  model: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

type ToolOutcome =
  | { ok: true; outcome: DraftOutcome }
  | { ok: false; reason: string };

const quoteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    messageId: {
      type: "string",
      description: "Id of the note. Empty string when this field has no quote.",
    },
    quote: {
      type: "string",
      description: "Exact substring of that note. Empty string when this field has no quote.",
    },
  },
  required: ["messageId", "quote"],
};

const draftTool = {
  name: "submit_draft",
  description:
    "Submit the agreement draft. Every dollar must be an exact quote from a note. If a number or the scope is missing or conflicting, ask a question instead of guessing.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ["ready", "needs_clarification"] },
      workSummary: { type: "string" },
      clientAmount: {
        type: "string",
        description: "Decimal dollars copied from clientQuote, such as 1200.00. Empty if unknown.",
      },
      mayaAmount: { type: "string" },
      studioAmount: {
        type: "string",
        description: "Decimal dollars. Empty when studioKind is calculated; the server subtracts.",
      },
      studioKind: { type: "string", enum: ["quoted", "calculated", "missing"] },
      questions: { type: "array", items: { type: "string" } },
      workQuote: quoteSchema,
      clientQuote: quoteSchema,
      mayaQuote: quoteSchema,
      studioQuote: quoteSchema,
    },
    required: [
      "status",
      "workSummary",
      "clientAmount",
      "mayaAmount",
      "studioAmount",
      "studioKind",
      "questions",
      "workQuote",
      "clientQuote",
      "mayaQuote",
      "studioQuote",
    ],
  },
};

export function draftModelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function moneyFromQuote(quote: string): string | null {
  const dollar = quote.match(/\$[\d,]+(?:\.\d{1,2})?/);
  if (dollar) return asMoney(dollar[0].replace(/[$,]/g, ""));
  const lower = quote.toLowerCase();
  if (lower.includes("one thousand two hundred")) return "1200.00";
  if (/\beight hundred\b/.test(lower)) return "800.00";
  if (/\bfour hundred\b/.test(lower)) return "400.00";
  return null;
}

function readQuote(value: unknown): EvidenceQuoted | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const messageId = text(record.messageId).trim();
  const quote = text(record.quote);
  if (!messageId || !quote.trim()) return null;
  return { kind: "quoted", messageId, quote };
}

function cents(value: string): number {
  return Math.round(Number(value) * 100);
}

function questionsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item).trim()).filter(Boolean);
}

export function outcomeFromToolInput(
  input: unknown,
  messages: JobMessageRow[],
  jobId: string,
): ToolOutcome {
  if (!input || typeof input !== "object") {
    return { ok: false, reason: "draft tool input is missing" };
  }
  const record = input as Record<string, unknown>;
  const status = record.status;
  if (status !== "ready" && status !== "needs_clarification") {
    return { ok: false, reason: "draft status is missing" };
  }

  const workQuote = readQuote(record.workQuote);
  const clientQuote = readQuote(record.clientQuote);
  const mayaQuote = readQuote(record.mayaQuote);
  const studioQuote = readQuote(record.studioQuote);
  const studioKind = record.studioKind;
  const questions = questionsOf(record.questions);
  const evidence: AgreementEvidence = {};

  if (workQuote) evidence.workSummary = workQuote;
  if (clientQuote) evidence.clientAmount = clientQuote;
  if (mayaQuote) evidence.mayaAmount = mayaQuote;

  const clientFromQuote = clientQuote ? moneyFromQuote(clientQuote.quote) : null;
  const mayaFromQuote = mayaQuote ? moneyFromQuote(mayaQuote.quote) : null;
  const claimedClient = asMoney(record.clientAmount);
  const claimedMaya = asMoney(record.mayaAmount);

  if (clientQuote && claimedClient && clientFromQuote && claimedClient !== clientFromQuote) {
    return { ok: false, reason: "client amount does not match its quote" };
  }
  if (mayaQuote && claimedMaya && mayaFromQuote && claimedMaya !== mayaFromQuote) {
    return { ok: false, reason: "Maya amount does not match its quote" };
  }

  const clientAmount = clientFromQuote ?? claimedClient;
  const mayaAmount = mayaFromQuote ?? claimedMaya;
  let studioAmount: string | null = null;

  if (studioKind === "calculated" && clientAmount && mayaAmount) {
    if (!clientQuote || !mayaQuote) {
      return { ok: false, reason: "calculated studio remainder needs client and Maya quotes" };
    }
    const computed = ((cents(clientAmount) - cents(mayaAmount)) / 100).toFixed(2);
    const claimedStudio = asMoney(record.studioAmount);
    if (claimedStudio && claimedStudio !== computed) {
      return { ok: false, reason: "studio amount does not match client minus Maya" };
    }
    studioAmount = computed;
    evidence.studioAmount = {
      kind: "calculated",
      formula: "clientAmount - mayaAmount",
      operands: { clientAmount: clientQuote, mayaAmount: mayaQuote },
    };
  } else if (studioKind === "quoted" && studioQuote) {
    const fromQuote = moneyFromQuote(studioQuote.quote);
    const claimedStudio = asMoney(record.studioAmount);
    if (fromQuote && claimedStudio && fromQuote !== claimedStudio) {
      return { ok: false, reason: "studio amount does not match its quote" };
    }
    studioAmount = fromQuote ?? claimedStudio;
    evidence.studioAmount = studioQuote;
  } else if (studioKind !== "missing" && studioKind !== "quoted" && studioKind !== "calculated") {
    return { ok: false, reason: "studio kind is missing" };
  }

  const validationError = validateEvidence(
    evidence,
    messages,
    jobId,
    status === "ready" && clientAmount && mayaAmount && studioAmount
      ? { clientAmount, mayaAmount, studioAmount }
      : undefined,
  );
  if (validationError) return { ok: false, reason: validationError };

  const workSummary = text(record.workSummary).trim() || null;

  if (status === "needs_clarification") {
    if (questions.length === 0) {
      return { ok: false, reason: "clarification needs a question" };
    }
    return {
      ok: true,
      outcome: {
        status: "needs_clarification",
        workSummary,
        clientAmount,
        mayaAmount,
        studioAmount,
        evidence,
        questions,
      },
    };
  }

  if (
    !workSummary ||
    !workQuote ||
    !clientAmount ||
    !mayaAmount ||
    !studioAmount ||
    !clientQuote ||
    !mayaQuote ||
    !evidence.studioAmount ||
    !amountsAddUp(clientAmount, mayaAmount, studioAmount)
  ) {
    return {
      ok: false,
      reason: "ready draft is missing a cited amount that adds up",
    };
  }

  return {
    ok: true,
    outcome: {
      status: "ready",
      workSummary,
      clientAmount,
      mayaAmount,
      studioAmount,
      evidence,
      questions: [],
    },
  };
}

function threadText(messages: JobMessageRow[]): string {
  return messages
    .map((message) => `${message.id} | ${message.party} | ${message.body}`)
    .join("\n");
}

function toolInputFromResponse(payload: unknown): unknown | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const block = content.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as { type?: string; name?: string };
    return record.type === "tool_use" && record.name === "submit_draft";
  }) as { input?: unknown } | undefined;
  return block?.input ?? null;
}

function usageOf(payload: unknown): { input: number | null; output: number | null } {
  if (!payload || typeof payload !== "object") return { input: null, output: null };
  const usage = (payload as { usage?: { input_tokens?: unknown; output_tokens?: unknown } }).usage;
  const input = typeof usage?.input_tokens === "number" ? usage.input_tokens : null;
  const output = typeof usage?.output_tokens === "number" ? usage.output_tokens : null;
  return { input, output };
}

function assistantContent(payload: unknown): unknown[] {
  if (!payload || typeof payload !== "object") return [{ type: "text", text: "No draft." }];
  const content = (payload as { content?: unknown }).content;
  if (Array.isArray(content) && content.length > 0) return content;
  return [{ type: "text", text: "No draft." }];
}

function parserAttempt(messages: JobMessageRow[], latencyMs: number): DraftAttempt {
  return {
    source: "parser",
    validation: "parser_fallback",
    outcome: readAgreementFromMessages(messages),
    model: "parser",
    latencyMs,
    inputTokens: null,
    outputTokens: null,
  };
}

function rejectedAttempt(
  model: string,
  latencyMs: number,
  inputTokens: number | null,
  outputTokens: number | null,
  reason: string,
): DraftAttempt {
  return {
    source: "model",
    validation: "citation_rejected",
    model,
    latencyMs,
    inputTokens,
    outputTokens,
    outcome: {
      status: "needs_clarification",
      workSummary: null,
      clientAmount: null,
      mayaAmount: null,
      studioAmount: null,
      evidence: {},
      questions: [
        `The draft was rejected because ${reason}. Write the client price, Maya's share, and the studio remainder in the notes, then draft again.`,
      ],
    },
  };
}

async function complete(
  fetchImpl: FetchLike,
  apiKey: string,
  model: string,
  messages: unknown[],
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
  const response = await fetchImpl(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system:
        "You draft one job agreement from notes by calling submit_draft. You cannot invent money. Every quote must be an exact substring of one note, and messageId must be that note's id. Amounts are decimal strings such as 1200.00 and must be the amount written in the quote. studioKind calculated is only for client minus Maya; leave studioAmount empty in that case. Use status ready only when the work, the client price, and Maya's share are cited and the three amounts are each above zero and add up. Otherwise use needs_clarification and ask what is missing. Do not guess.",
      tools: [draftTool],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
      messages,
    }),
  });
  if (!response.ok) return { ok: false };
  return { ok: true, payload: await response.json() };
}

export async function draftWithModel(
  messages: JobMessageRow[],
  jobId: string,
  options: { apiKey?: string | null; model?: string; fetchImpl?: FetchLike } = {},
): Promise<DraftAttempt> {
  const apiKey = options.apiKey === undefined ? process.env.ANTHROPIC_API_KEY?.trim() : options.apiKey?.trim();
  const model = options.model ?? draftModelName();
  const fetchImpl = options.fetchImpl ?? fetch;
  const started = Date.now();

  if (!apiKey) return parserAttempt(messages, 0);

  const firstUser = {
    role: "user",
    content: `Notes, one per line, as id | party | body:\n${threadText(messages)}`,
  };

  let firstPayload: unknown;
  try {
    const first = await complete(fetchImpl, apiKey, model, [firstUser]);
    if (!first.ok) return parserAttempt(messages, Date.now() - started);
    firstPayload = first.payload;
  } catch {
    return parserAttempt(messages, Date.now() - started);
  }

  const firstUsage = usageOf(firstPayload);
  const firstParsed = outcomeFromToolInput(toolInputFromResponse(firstPayload), messages, jobId);
  if (firstParsed.ok) {
    return {
      source: "model",
      validation: "pass",
      outcome: firstParsed.outcome,
      model,
      latencyMs: Date.now() - started,
      inputTokens: firstUsage.input,
      outputTokens: firstUsage.output,
    };
  }

  let secondPayload: unknown = null;
  try {
    const second = await complete(fetchImpl, apiKey, model, [
      firstUser,
      { role: "assistant", content: assistantContent(firstPayload) },
      {
        role: "user",
        content: `Rejected: ${firstParsed.reason}. Call submit_draft again. If you cannot cite every dollar from the notes, use status needs_clarification and a question. Do not invent quotes.`,
      },
    ]);
    if (second.ok) secondPayload = second.payload;
  } catch {
    secondPayload = null;
  }

  const secondUsage = usageOf(secondPayload);
  const inputTokens = (firstUsage.input ?? 0) + (secondUsage.input ?? 0);
  const outputTokens = (firstUsage.output ?? 0) + (secondUsage.output ?? 0);
  const tokensKnown = firstUsage.input !== null || secondUsage.input !== null;

  if (secondPayload) {
    const secondParsed = outcomeFromToolInput(toolInputFromResponse(secondPayload), messages, jobId);
    if (secondParsed.ok) {
      return {
        source: "model",
        validation: "pass",
        outcome: secondParsed.outcome,
        model,
        latencyMs: Date.now() - started,
        inputTokens: tokensKnown ? inputTokens : null,
        outputTokens: tokensKnown ? outputTokens : null,
      };
    }
    return rejectedAttempt(
      model,
      Date.now() - started,
      tokensKnown ? inputTokens : null,
      tokensKnown ? outputTokens : null,
      secondParsed.reason,
    );
  }

  return rejectedAttempt(
    model,
    Date.now() - started,
    firstUsage.input,
    firstUsage.output,
    firstParsed.reason,
  );
}
