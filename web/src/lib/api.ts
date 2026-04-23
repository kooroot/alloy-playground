/// <reference types="vite/client" />
/**
 * Typed HTTP client built over the OpenAPI spec exported by the Rust backend.
 * Types live at `src/types/api.d.ts` — regenerate with `bun run codegen`.
 *
 * Use:
 *   const { data, error } = await api.GET("/api/network");
 *   const info = unwrap(await api.GET("/api/network"));
 */
import createClient from "openapi-fetch";
import type { paths } from "@/types/api";

/**
 * Default: empty string → relative URLs → requests go to the page's own
 * origin and Vite's dev proxy forwards `/api/*` and `/ws/*` to the Rust
 * backend. This is robust to Vite port auto-fallback (3000 → 3001 → …).
 *
 * Override VITE_BACKEND_URL only if you deploy the web bundle to a
 * different origin from the backend (production).
 */
export const BACKEND_URL =
  (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";

export const api = createClient<paths>({ baseUrl: BACKEND_URL });

/**
 * Build an absolute `ws://` or `wss://` URL for a backend path.
 *
 * Dev:  BACKEND_URL=""  →  derive from `window.location` so the request
 *       goes to Vite, which `ws: true`-proxies to the Rust backend.
 * Prod: BACKEND_URL="https://api.example" → swap http(s) → ws(s).
 */
export function wsUrl(path: string): string {
  if (BACKEND_URL) {
    const u = new URL(path, BACKEND_URL);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }
  const u = new URL(path, window.location.href);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.toString();
}

/**
 * TanStack Query expects a thrown error on failure. `openapi-fetch` returns
 * `{ data?, error? }` — `unwrap` collapses the shape and throws on `error`.
 */
export function unwrap<D, E>(result: { data?: D; error?: E }): D {
  if (result.error) {
    throw new Error(typeof result.error === "string" ? result.error : JSON.stringify(result.error));
  }
  if (result.data === undefined) {
    throw new Error("empty response");
  }
  return result.data;
}
