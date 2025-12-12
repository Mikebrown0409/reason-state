#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { ReasonState } from "../index.js";
import {
  computeRoiForGoal,
  formatRoiLine,
  messagesToStudioSteps,
  parseTrace,
  type Message,
  type StudioStep,
} from "./audit/adapt.js";

function usage(): string {
  return [
    "reason-state",
    "",
    "Usage:",
    "  reason-state audit <trace.json> [--out <output.json>]",
    "",
    "Notes:",
    "  - Emits StudioStep[] JSON (importable in Studio).",
    "  - Keyless by default; prints ROI lines for user turns.",
  ].join("\n");
}

function readJson(filePath: string): unknown {
  const text = fs.readFileSync(filePath, "utf8");
  return JSON.parse(text);
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function getArg(flag: string, argv: string[]): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  return argv[idx + 1];
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

async function audit(inputPath: string, outPath?: string): Promise<number> {
  const absIn = path.resolve(process.cwd(), inputPath);
  const parsed = parseTrace(readJson(absIn));

  const absOut = (() => {
    if (outPath) return path.resolve(process.cwd(), outPath);
    // Prefer `foo.reason-state.json` over `foo.json.reason-state.json`.
    const dir = path.dirname(absIn);
    const base = path.basename(absIn);
    if (base.toLowerCase().endsWith(".json")) {
      const stem = base.slice(0, -".json".length);
      return path.join(dir, `${stem}.reason-state.json`);
    }
    return path.join(dir, `${base}.reason-state.json`);
  })();

  let steps: StudioStep[] = [];

  if (parsed.kind === "studioSteps") {
    steps = parsed.steps;
    console.log(`Imported Studio steps: ${steps.length}`);
    writeJson(absOut, steps);
    console.log(`Wrote: ${absOut}`);
    return 0;
  }

  const messages = parsed.messages as Message[];
  console.log(`Imported messages: ${messages.length}`);

  // Build a keyless memory timeline with meaningful provenance.
  const rs = new ReasonState({ maxTokens: 1200 });
  steps = [];
  let lastRoi: Awaited<ReturnType<typeof computeRoiForGoal>> | undefined;

  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];
    const role = (m?.role ?? "unknown") as string;

    // Mirror Studio’s adapter approach: create nodes for message + tool calls.
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
    if (Array.isArray(m?.tool_calls)) {
      for (let tIdx = 0; tIdx < m.tool_calls.length; tIdx++) {
        const t = m.tool_calls[tIdx];
        const name = t.function?.name ?? t.type ?? "tool";
        const args = t.function?.arguments ?? "";
        await rs.add(
          { name, arguments: args },
          {
            key: `trace:${idx}:tool:${tIdx}`,
            type: "action",
            summary: `${name}: ${args}`.slice(0, 280),
            sourceType: "import/tool_call",
            sourceId: t.id ?? `${idx}-${tIdx}`,
          }
        );
      }
    }

    steps.push({
      label: `Turn ${idx + 1} — ${role}`,
      state: JSON.parse(JSON.stringify(rs.state)),
      patches: [],
      adapted: true,
    });

    if (role === "user") {
      const goal = contentText || `User turn ${idx + 1}`;
      lastRoi = await computeRoiForGoal(rs, goal);
      console.log(formatRoiLine(lastRoi));
    }
  }

  // Also emit an explicit summary at the end.
  if (lastRoi) {
    console.log(`Total: ${formatRoiLine(lastRoi)}`);
  }

  writeJson(absOut, steps);
  console.log(`Wrote: ${absOut}`);
  console.log("Tip: paste the file contents into Studio → Import pasted JSON.");
  return 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(usage());
    return 0;
  }

  if (cmd !== "audit") {
    console.error(`Unknown command: ${cmd}\n`);
    console.error(usage());
    return 1;
  }

  const inputPath = argv[1];
  if (!inputPath) {
    console.error("Missing input file.\n");
    console.error(usage());
    return 1;
  }

  const out = getArg("--out", argv);
  return audit(inputPath, out);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });


