export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type InjectOptions = {
  goal: string;
  /**
   * Where to inject memory context.
   * - system: prepend to the first system message (or insert one if none exists)
   * - prepend-user: prefix the latest user message (falls back to system if no user message exists)
   */
  strategy?: "system" | "prepend-user";
  /**
   * Optional heading for the injected section.
   */
  heading?: string;
};

export type InjectResult = {
  messages: ChatMessage[];
  stats: {
    contextChars: number;
    estTokens: number;
    rawNodeCount: number;
    summaryNodeCount: number;
    unknownCount: number;
    dirtyCount: number;
    blockedCount: number;
  };
};

function formatInjectedMemory(opts: { heading: string; context: string }): string {
  const trimmed = (opts.context ?? "").trim();
  return `${opts.heading}\n${trimmed.length ? trimmed : "(empty)"}`;
}

/**
 * Inject governed memory context into an OpenAI-style `messages[]` array.
 *
 * Designed for adoption: copy/paste into existing agent loops without changing how they call the model.
 */
export async function injectMemoryContext(
  rs: { retrieve: (goal: string) => Promise<{ context: string; stats: InjectResult["stats"] }> },
  messages: ChatMessage[],
  opts: InjectOptions
): Promise<InjectResult> {
  const { context, stats } = await rs.retrieve(opts.goal);
  const heading = opts.heading ?? "GOVERNED_MEMORY_CONTEXT:";
  const injected = formatInjectedMemory({ heading, context });
  const strategy: NonNullable<InjectOptions["strategy"]> = opts.strategy ?? "system";

  // Avoid mutating caller input.
  const out: ChatMessage[] = messages.map((m) => ({ ...m }));

  if (strategy === "prepend-user") {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].role === "user") {
        out[i] = { ...out[i], content: `${injected}\n\n${out[i].content}` };
        return { messages: out, stats };
      }
    }
    // No user message: fall back to system insertion behavior.
  }

  // system strategy (default): keep a single system message by prepending content if present.
  const firstSystemIdx = out.findIndex((m) => m.role === "system");
  if (firstSystemIdx === -1) {
    return { messages: [{ role: "system", content: injected }, ...out], stats };
  }

  const existing = out[firstSystemIdx].content?.trim();
  const merged = existing ? `${injected}\n\n---\n\n${existing}` : injected;
  out[firstSystemIdx] = { role: "system", content: merged };
  return { messages: out, stats };
}
