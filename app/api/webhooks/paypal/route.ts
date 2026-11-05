import { storeVerifiedEvent } from "@/lib/events";
import { verifyWebhookSignature } from "@/lib/paypal";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const verified = await verifyWebhookSignature(rawBody, {
    authAlgo: request.headers.get("paypal-auth-algo"),
    certUrl: request.headers.get("paypal-cert-url"),
    transmissionId: request.headers.get("paypal-transmission-id"),
    transmissionSig: request.headers.get("paypal-transmission-sig"),
    transmissionTime: request.headers.get("paypal-transmission-time"),
  });

  if (!verified) {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  try {
    const stored = await storeVerifiedEvent(rawBody);
    return Response.json(stored);
  } catch (error) {
    console.error(error);
    return Response.json({ error: "handler failed" }, { status: 500 });
  }
}
