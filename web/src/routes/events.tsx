/**
 * Live Transfer event stream for the last-deployed DemoToken.
 *
 * Uses a raw WebSocket (no react-query — the data is push-only, and trying
 * to shoehorn it into a query key causes stale-data flickers). The server
 * emits JSON frames tagged with `kind`:
 *
 *   - "hello"    { token, chain_id }              once at connect
 *   - "transfer" { from, to, value, block_number, tx_hash, log_index }
 *   - "warn"     { message }                      non-fatal (decode errors)
 *   - "error"    { message }                      fatal — server closes after
 *
 * Reconnect policy: exponential backoff, 1s → 10s cap, resets on successful
 * hello. A ring buffer keeps the last 50 transfers so the tab is cheap to
 * leave open.
 */
import { useEffect, useReducer, useState } from "react";
import { wsUrl } from "@/lib/api";

// ─── Frame types (must match backend `OutFrame` in events_ws.rs) ───────────
type HelloFrame = { kind: "hello"; token: string; chain_id: number };
type TransferFrame = {
  kind: "transfer";
  from: string;
  to: string;
  value: string;
  block_number: number | null;
  tx_hash: string | null;
  log_index: number | null;
};
type WarnFrame = { kind: "warn"; message: string };
type ErrorFrame = { kind: "error"; message: string };
type Frame = HelloFrame | TransferFrame | WarnFrame | ErrorFrame;

// ─── Ring buffer reducer ───────────────────────────────────────────────────
const BUFFER_CAP = 50;
type Action =
  | { type: "push"; event: TransferFrame }
  | { type: "clear" };

function reduce(state: TransferFrame[], action: Action): TransferFrame[] {
  switch (action.type) {
    case "push": {
      // Newest first; drop the tail when we hit the cap.
      const next = [action.event, ...state];
      return next.length > BUFFER_CAP ? next.slice(0, BUFFER_CAP) : next;
    }
    case "clear":
      return [];
  }
}

type Status =
  | { kind: "connecting" }
  | { kind: "connected"; token: string; chainId: number }
  | { kind: "disconnected"; reason: string }
  | { kind: "fatal"; message: string };

export function EventsPage() {
  const [events, dispatch] = useReducer(reduce, []);
  const [status, setStatus] = useState<Status>({ kind: "connecting" });
  // Bumping `generation` re-runs the effect, which tears down the old socket
  // and opens a fresh one. `reconnect()` forces a new generation; a fatal
  // frame does NOT trigger one (the server told us to stop).
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByCleanup = false;
    let sawFatal = false;

    const open = () => {
      setStatus({ kind: "connecting" });
      ws = new WebSocket(wsUrl("/ws/erc20/transfers"));

      ws.onmessage = (e) => {
        let frame: Frame;
        try {
          frame = JSON.parse(e.data) as Frame;
        } catch {
          console.warn("non-JSON ws frame", e.data);
          return;
        }
        switch (frame.kind) {
          case "hello":
            retry = 0; // successful handshake → reset backoff
            setStatus({ kind: "connected", token: frame.token, chainId: frame.chain_id });
            break;
          case "transfer":
            dispatch({ type: "push", event: frame });
            break;
          case "warn":
            console.warn("[ws warn]", frame.message);
            break;
          case "error":
            // The server will close right after. Record the reason so the
            // onclose handler can skip the reconnect loop.
            sawFatal = true;
            setStatus({ kind: "fatal", message: frame.message });
            break;
        }
      };

      ws.onclose = (e) => {
        if (closedByCleanup) return;
        if (sawFatal) return; // keep the fatal message visible, don't retry
        const delay = Math.min(10_000, 1_000 * 2 ** retry);
        retry += 1;
        setStatus({
          kind: "disconnected",
          reason: `code=${e.code}${e.reason ? ` ${e.reason}` : ""}`,
        });
        retryTimer = setTimeout(open, delay);
      };
    };

    open();
    return () => {
      closedByCleanup = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close(1000, "component unmount");
    };
  }, [generation]);

  const reconnect = () => setGeneration((g) => g + 1);

  return (
    <div className="landing">
      <section className="card">
        <h2>event stream</h2>
        <div className="mode-row">
          <StatusPill status={status} />
          <button type="button" className="btn" onClick={reconnect} disabled={status.kind === "connected"}>
            reconnect
          </button>
          <button type="button" className="btn" onClick={() => dispatch({ type: "clear" })} disabled={events.length === 0}>
            clear ({events.length})
          </button>
        </div>
        <p className="dim small">
          subscribes to <span className="mono">Transfer(address,address,uint256)</span> on the last-deployed DemoToken.
          deploy one from the <span className="mono">/erc20</span> page if you see
          <span className="err"> no token</span> below.
        </p>
      </section>

      <section className="card">
        <h2>recent transfers</h2>
        {events.length === 0 ? (
          <p className="dim small">no events yet — send a transfer to see it land here.</p>
        ) : (
          <ul className="event-list">
            {events.map((ev, i) => (
              <li key={`${ev.tx_hash ?? "nohash"}-${ev.log_index ?? i}`}>
                <div className="event-top">
                  <span className="mode-pill small">block {ev.block_number ?? "?"}</span>
                  <span className="mono small dim">{short(ev.tx_hash)}</span>
                </div>
                <div className="event-row">
                  <span className="mono small">{short(ev.from)}</span>
                  <span className="dim"> → </span>
                  <span className="mono small">{short(ev.to)}</span>
                  <span className="event-amount">{displayAmount(ev.value)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  switch (status.kind) {
    case "connecting":
      return <span className="mode-pill">connecting…</span>;
    case "connected":
      return (
        <span className="mode-pill ok">
          live · <span className="mono">{short(status.token)}</span> · chain {status.chainId}
        </span>
      );
    case "disconnected":
      return <span className="mode-pill">offline · {status.reason} · reconnecting…</span>;
    case "fatal":
      return <span className="mode-pill err">error: {status.message}</span>;
  }
}

function short(addr: string | null | undefined): string {
  if (!addr) return "—";
  return addr.length <= 14 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function displayAmount(raw: string): string {
  try {
    const n = BigInt(raw);
    const ONE = 10n ** 18n;
    const whole = n / ONE;
    const frac = n % ONE;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4).replace(/0+$/, "");
    return fracStr ? `${whole}.${fracStr}` : `${whole}`;
  } catch {
    return raw;
  }
}
