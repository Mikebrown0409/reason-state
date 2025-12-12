import type { EchoState, Patch } from "../../engine/types.js";
import { ReasonState } from "../../index.js";

export type StudioStep = {
  label: string;
  state: EchoState;
  patches: Patch[];
  adapted?: boolean;
};

export type Message = {
  role: string;
  content?: unknown;
  tool_calls?: Array<{
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function asText(x: unknown): string {
  if (x === null || x === undefined) return "";
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

export function estimateTokensByChars(text: string): number {
  return Math.max(1, Math.ceil((text ?? "").length / 4));
}

export function rawDumpFromState(state: EchoState): string {
  return JSON.stringify(state.raw ?? {}, null, 2);
}

export function parseTrace(
  input: unknown
): { kind: "studioSteps"; steps: StudioStep[] } | { kind: "messages"; messages: Message[] } {
  if (Array.isArray(input)) {
    const first = input[0] as any;
    if (first && typeof first === "object" && "label" in first && "state" in first) {
      return { kind: "studioSteps", steps: input as StudioStep[] };
    }
    if (first && typeof first === "object" && "role" in first) {
      return { kind: "messages", messages: input as Message[] };
    }
    throw new Error("Unrecognized array format. Expected StudioStep[] or Message[].");
  }

  if (input && typeof input === "object") {
    const obj = input as any;
    if (Array.isArray(obj.messages)) {
      return { kind: "messages", messages: obj.messages as Message[] };
    }
  }

  throw new Error("Unrecognized trace format. Expected an array or { messages: [...] }.");
}

export async function messagesToStudioSteps(messages: Message[]): Promise<StudioStep[]> {
  const rs = new ReasonState({ maxTokens: 1200 });
  const steps: StudioStep[] = [];

  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];
    const role = (m?.role ?? "unknown") as string;
    const label = `Turn ${idx + 1} — ${role}`;

    // Content
    const contentText = asText(m?.content);
    if (contentText) {
      await rs.add(contentText, {
        key: `trace:${idx}:message`,
        type: role === "assistant" ? "action" : role === "user" ? "fact" : "fact",
        summary: contentText.slice(0, 280),
        sourceType: "import/message",
        sourceId: `turn-${idx}`,
      });
    }

    // Tool calls
    if (Array.isArray(m?.tool_calls)) {
      for (let tIdx = 0; tIdx < m.tool_calls.length; tIdx++) {
        const t = m.tool_calls[tIdx];
        const name = t.function?.name ?? t.type ?? "tool";
        const args = t.function?.arguments ?? "";
        const summary = `${name}: ${args}`.slice(0, 280);
        await rs.add(
          {
            name,
            arguments: args,
          },
          {
            key: `trace:${idx}:tool:${tIdx}`,
            type: "action",
            summary,
            sourceType: "import/tool_call",
            sourceId: t.id ?? `${idx}-${tIdx}`,
          }
        );
      }
    }

    steps.push({
      label,
      state: clone(rs.state),
      patches: [],
      adapted: true,
    });
  }

  return steps;
}

export async function computeRoiForGoal(
  rs: ReasonState,
  goal: string
): Promise<{
  rawChars: number;
  rawTokens: number;
  contextChars: number;
  contextTokens: number;
  savedPct: number;
  unknown: number;
  dirty: number;
  blocked: number;
}> {
  const raw = rawDumpFromState(rs.state);
  const rawChars = raw.length;
  const rawTokens = estimateTokensByChars(raw);

  const { stats } = await rs.retrieve(goal);
  const contextChars = stats.contextChars;
  const contextTokens = stats.estTokens;
  const savedPct = rawTokens > 0 ? Math.round((1 - contextTokens / rawTokens) * 100) : 0;

  return {
    rawChars,
    rawTokens,
    contextChars,
    contextTokens,
    savedPct,
    unknown: stats.unknownCount,
    dirty: stats.dirtyCount,
    blocked: stats.blockedCount,
  };
}

export function formatRoiLine(roi: Awaited<ReturnType<typeof computeRoiForGoal>>): string {
  return `ROI: context=${roi.contextChars} chars (~${roi.contextTokens} tok) | raw=${roi.rawChars} chars (~${roi.rawTokens} tok) | saved≈${roi.savedPct}% | unknown=${roi.unknown} dirty=${roi.dirty} blocked=${roi.blocked}`;
}
