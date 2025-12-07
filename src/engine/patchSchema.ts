import { z } from "zod";
import type { Patch } from "./types.js";

// Allowed ops per pivot DSL (no deletes).
const opSchema = z.enum(["add", "replace"]);

export const patchSchema = z.object({
  op: opSchema,
  path: z.string().regex(/^\/(raw|summary)\/.+/, "path must start with /raw or /summary"),
  value: z.unknown(),
  reason: z.string().optional()
});

export function validatePatch(patch: Patch): Patch {
  return patchSchema.parse(patch) as Patch;
}

export function validatePatches(patches: Patch[]): Patch[] {
  return patches.map(validatePatch);
}

