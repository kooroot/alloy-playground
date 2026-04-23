#!/usr/bin/env bun
/**
 * Fetches the backend's OpenAPI spec and regenerates `src/types/api.d.ts`.
 * Run `bun run codegen` after any backend schema change.
 *
 * Assumes the backend is running locally on BACKEND_URL (default :8080).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:8080";
const SPEC_URL = `${BACKEND_URL}/api/openapi.json`;
const OUT_DIR = path.resolve(SCRIPT_DIR, "..", "src", "types");
const OUT_FILE = path.join(OUT_DIR, "api.d.ts");

console.log(`fetching spec from ${SPEC_URL}`);
let spec: unknown;
try {
  const res = await fetch(SPEC_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  spec = await res.json();
} catch (err) {
  console.error(
    `\n✗ failed to reach ${SPEC_URL}: ${(err as Error).message}\n` +
      `  is the backend running?  (cd backend && cargo run)\n`,
  );
  process.exit(1);
}

const ast = await openapiTS(spec as Parameters<typeof openapiTS>[0]);
const contents = astToString(ast);

if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, contents);
console.log(`✓ wrote ${OUT_FILE} (${contents.length} bytes)`);
