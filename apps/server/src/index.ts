import http from "http";
import { ReasonStateSimple } from "../../../src/api/simple.js";

const PORT = Number(process.env.PORT ?? 3000);
const model =
  process.env.MODEL ?? process.env.OPENAI_MODEL ?? process.env.VITE_OPENAI_MODEL ?? "gpt-4o-mini";
const apiKey =
  process.env.OPENAI_API_KEY ??
  process.env.VITE_OPENAI_API_KEY ??
  process.env.GROK_API_KEY ??
  process.env.VITE_GROK_API_KEY;
const baseUrl =
  process.env.BASE_URL ??
  process.env.OPENAI_BASE_URL ??
  process.env.VITE_OPENAI_BASE_URL ??
  process.env.GROK_BASE_URL ??
  process.env.VITE_GROK_BASE_URL;

const rs = new ReasonStateSimple({
  apiKey,
  model,
  baseUrl,
  maxTokens: 1000,
});

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    throw new Error("Body must be JSON object");
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
}

function send(res: http.ServerResponse, status: number, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (!req.url) return send(res, 404, { error: "not found" });
    if (req.method === "GET" && req.url === "/health") {
      return send(res, 200, { status: "ok" });
    }

    if (req.method === "POST" && req.url === "/add") {
      const body = await readJson(req);
      const { text, type, summary, id, confidence, node } = body as any;
      const payload = node ?? text ?? summary ?? body;
      const result = await rs.add(payload, { type, summary, id, confidence });
      return send(res, 200, { state: result });
    }

    if (req.method === "POST" && req.url === "/update") {
      const body = await readJson(req);
      const { id, summary, retracted, reason } = body as any;
      if (!id) return send(res, 400, { error: "id is required" });
      const result = await rs.update(id, { summary, retracted, reason });
      return send(res, 200, { state: result });
    }

    if (req.method === "POST" && req.url === "/query") {
      const body = await readJson(req);
      const { goal, mode } = body as any;
      if (!goal) return send(res, 400, { error: "goal is required" });
      const resQuery = await rs.query(goal, { mode });
      return send(res, 200, {
        patches: resQuery.patches,
        state: resQuery.state,
        context: resQuery.context ?? null,
      });
    }

    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `reason-state HTTP server listening on ${PORT} (${apiKey ? "planner enabled" : "keyless mode"})`
  );
});

