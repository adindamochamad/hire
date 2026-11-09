export type ThreadParty = "studio" | "maya" | "client" | "system";

export type ThreadMessage = {
  id: string;
  party: ThreadParty;
  name: string;
  body: string;
};

export const DEMO_THREAD: ThreadMessage[] = [
  {
    id: "m1",
    party: "studio",
    name: "Studio",
    body: "Landing page, two rounds of revision. The client pays $1,200 for the job.",
  },
  {
    id: "m2",
    party: "maya",
    name: "Maya",
    body: "I'll take the UI. My share is $800.",
  },
  {
    id: "m3",
    party: "client",
    name: "Client",
    body: "Confirmed. $1,200 total. Maya receives $800. The studio keeps $400.",
  },
  {
    id: "m4",
    party: "studio",
    name: "Studio",
    body: "Same numbers on the agreement before anyone opens PayPal.",
  },
];

export const BACKUP_THREAD: ThreadMessage[] = [
  {
    id: "b1",
    party: "studio",
    name: "Studio",
    body: "Landing page, two rounds of revision. Bill the client $1,200.",
  },
  {
    id: "b2",
    party: "maya",
    name: "Maya",
    body: "I'll take the UI. My share is $800.",
  },
  {
    id: "b3",
    party: "client",
    name: "Client",
    body: "My budget is $1,000.",
  },
];

export function draftMessages(messages: ThreadMessage[]) {
  return messages
    .filter((message) => message.party !== "system")
    .map((message) => ({
      role: "user" as const,
      content: `${message.name}: ${message.body}`,
    }));
}
