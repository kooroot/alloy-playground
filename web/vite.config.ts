import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Dev server uses a proxy so the frontend only talks to its own origin.
 * - /api/*  → Rust backend (REST)
 * - /ws/*   → Rust backend (WebSocket, used from Phase 5)
 *
 * This means:
 *   • Frontend code uses RELATIVE paths (e.g. `fetch("/api/network")`).
 *     No CORS, no origin hardcoding.
 *   • If port 3000 is busy, Vite auto-falls back to 3001/3002/… and
 *     the app still works — the relative URLs follow the moved origin.
 *   • The backend port (VITE_BACKEND_URL, default :8080) is the only
 *     port that must stay stable.
 */
const BACKEND = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Bind IPv4 explicitly. Default "localhost" resolves to both IPv4 and
    // IPv6 on macOS and vite can silently bind to `[::1]:3000` when
    // `0.0.0.0:3000` is taken by another process, which looks like "it
    // worked" but breaks curl/tools that hit 127.0.0.1. Forcing IPv4 makes
    // `strictPort: false` actually trigger the fallback to 3001/3002/…
    host: "127.0.0.1",
    port: 3000,
    strictPort: false,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true },
      "/ws": { target: BACKEND, changeOrigin: true, ws: true },
    },
  },
});
