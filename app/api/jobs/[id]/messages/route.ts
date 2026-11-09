import { getJob, insertJobMessage } from "@/lib/db";
import { markAgreementDrift, noteBreaksStoredAmounts } from "@/lib/drift";
import { serializeJob, serializeMessage } from "@/lib/job";
import { asString } from "@/lib/paypal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  if (job.paypal_order_id) {
    return Response.json(
      { error: "notes are locked after a PayPal order exists; create a new job" },
      { status: 409 },
    );
  }

  const body = (await request.json()) as Record<string, unknown>;
  const party = asString(body.party);
  const authorName = asString(body.authorName) ?? asString(body.author_name);
  const text = asString(body.body)?.trim();
  if (!text) {
    return Response.json({ error: "body is required" }, { status: 400 });
  }
  if (party !== "studio" && party !== "maya" && party !== "client") {
    return Response.json({ error: "party must be studio, maya, or client" }, { status: 400 });
  }
  const defaultNames = { studio: "Studio", maya: "Maya", client: "Client" } as const;
  const saved = await insertJobMessage(id, party, authorName ?? defaultNames[party], text);
  const agreed = Boolean(job.client_agreed_at || job.maya_agreed_at);
  if (
    agreed &&
    noteBreaksStoredAmounts(
      text,
      [job.client_amount, job.maya_amount, job.studio_amount].filter(
        (value): value is string => Boolean(value),
      ),
    )
  ) {
    await markAgreementDrift(job);
    const drifted = await getJob(id);
    return Response.json(
      {
        message: serializeMessage(saved),
        job: drifted ? serializeJob(drifted) : null,
        drifted: true,
      },
      { status: 201 },
    );
  }
  return Response.json({ message: serializeMessage(saved), drifted: false }, { status: 201 });
}
