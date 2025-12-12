import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distRoot = path.resolve(__dirname, "..", "dist", "src");
const distIndex = path.resolve(distRoot, "index.js");

describe("package build artifacts", () => {
  it("emits dist outputs", () => {
    expect(existsSync(distIndex)).toBe(true);
  });

  it("imports the ESM entrypoint", async () => {
    const mod = await import(pathToFileURL(distIndex).href);
    expect(mod).toBeTruthy();
    expect(typeof mod.applyPatches).toBe("function");
  });

  it("imports a subpath export", async () => {
    const enginePath = path.resolve(distRoot, "engine", "ReasonState.js");
    const engine = await import(pathToFileURL(enginePath).href);
    expect(engine.ReasonState).toBeDefined();
  });

  it("imports the OpenAI messages integration subpath", async () => {
    const integPath = path.resolve(distRoot, "integrations", "openaiMessages.js");
    const integ = await import(pathToFileURL(integPath).href);
    expect(typeof integ.injectMemoryContext).toBe("function");
  });

  it("emits the audit CLI entrypoint", () => {
    const cliPath = path.resolve(distRoot, "cli", "reason-state.js");
    expect(existsSync(cliPath)).toBe(true);
  });
});

