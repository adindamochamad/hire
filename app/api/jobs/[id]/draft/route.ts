import { getJob, moneyAddsUp, pool } from "@/lib/db";
import { agreementLocked, serializeJob } from "@/lib/job";
import { asMoney } from "@/lib/money";
import { asRecord, asString } from "@/lib/paypal";

type Draft = {
  workSummary: string;
  clientAmount: string;
  mayaAmount: string;
  studioAmount: string;
};

function parseDraft(value: unknown): Draft | null {
  const record = asRecord(value);
  if (!record) return null;
  const workSummary = asString(record.workSummary) ?? asString(record.work_summary);
  const clientAmount = asMoney(record.clientAmount ?? record.client_amount);
  const mayaAmount = asMoney(record.mayaAmount ?? record.maya_amount);
  const studioAmount = asMoney(record.studioAmount ?? record.studio_amount);
  if (!workSummary || !clientAmount || !mayaAmount || !studioAmount) return null;
  return { workSummary, clientAmount, mayaAmount, studioAmount };
}

async function draftFromModel(messages: unknown): Promise<Draft> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  const prompt =
    "Read the studio chat, including free-form notes, negotiation, and ambiguous or conflicting figures. Return JSON only with workSummary, clientAmount, mayaAmount, studioAmount. Amounts are USD strings with two decimals. The client price must equal Maya's share plus the studio remainder. Do not invent a PayPal payment. The server will reject the draft unless those three amounts add up.";

  if (anthropicKey) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 400,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nChat:\n${JSON.stringify(messages)}`,
          },
        ],
      }),
    });
    const json = (await res.json()) as { content?: { text?: string }[] };
    const text = json.content?.[0]?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const draft = parseDraft(JSON.parse(text.slice(start, end + 1)));
    if (!draft) throw new Error("model draft unreadable");
    return draft;
  }

  if (geminiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: `${prompt}\n\nChat:\n${JSON.stringify(messages)}` }],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const draft = parseDraft(JSON.parse(text));
    if (!draft) throw new Error("model draft unreadable");
    return draft;
  }

  throw new Error("no model key");
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (agreementLocked(serializeJob(job))) {
    return Response.json(
      { error: "agreement is locked after a party agrees" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as { messages?: unknown };
  let draft: Draft;
  try {
    draft = await draftFromModel(body.messages);
  } catch (error) {
    const message = error instanceof Error ? error.message : "draft failed";
    return Response.json({ error: message }, { status: 503 });
  }

  const candidate = {
    ...job,
    work_summary: draft.workSummary,
    client_amount: draft.clientAmount,
    maya_amount: draft.mayaAmount,
    studio_amount: draft.studioAmount,
  };
  if (!moneyAddsUp(candidate)) {
    return Response.json(
      { error: "draft rejected: client amount must equal Maya share plus studio remainder", draft },
      { status: 422 },
    );
  }

  const saved = await pool.query(
    `update jobs
     set work_summary = $2,
         client_amount = $3,
         maya_amount = $4,
         studio_amount = $5
     where id = $1
     returning *`,
    [id, draft.workSummary, draft.clientAmount, draft.mayaAmount, draft.studioAmount],
  );
  return Response.json({ job: serializeJob(saved.rows[0]), draft });
}
