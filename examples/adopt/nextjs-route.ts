/**
 * Minimal Next.js Route Handler example (server-side).
 * This file is intentionally dependency-free; copy/paste into `app/api/chat/route.ts`.
 */
import { ReasonState } from "reason-state";
import { injectMemoryContext, type ChatMessage } from "reason-state/integrations/openai";

export async function POST(req: Request) {
  const body = (await req.json()) as { goal: string };
  const goal = body.goal ?? "Help the user";

  const rs = new ReasonState({ maxTokens: 1200 });
  await rs.add("User hates meetings on Friday", { key: "pref:no_friday_meetings" });

  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: goal },
  ];

  const { messages: withMemory, stats } = await injectMemoryContext(rs, messages, { goal });

  // Call your model here using `withMemory` and return response.
  return new Response(JSON.stringify({ messages: withMemory, stats }), {
    headers: { "content-type": "application/json" },
  });
}
