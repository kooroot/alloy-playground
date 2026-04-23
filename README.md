# alloy-prototype

End-to-end prototype exercising the Rust [`alloy`](https://alloy.rs/) crate
through a TanStack-based web UI on Bun. The plan lives at
`~/.claude/plans/rust-alloy-https-alloy-rs-splendid-globe.md`.

## Architecture

```
┌──────────────────────────┐   REST + WS    ┌──────────────────────────┐
│  web/ (Vite + React)     │ ─────────────▶ │  backend/ (axum + alloy) │
│  TanStack Router + Query │                │  PrivateKeySigner         │
│  zustand, viem (EIP-1193)│                │  http / ws providers      │
└──────────────────────────┘                └──────────┬───────────────┘
                                                       │ JSON-RPC
                                                       ▼
                                              ┌────────────────┐
                                              │ anvil / Sepolia│
                                              └────────────────┘
```

- Backend is pure `alloy`. Web uses `viem` **only** as a browser wallet
  adapter (EIP-1193 / MetaMask signing) — all chain reads and broadcasts
  go through the Rust backend.
- Frontend types are generated from the backend's OpenAPI spec
  (`GET /api/openapi.json`, via `utoipa`) by `bun run codegen`.

## Prereqs

```bash
curl -fsSL https://bun.sh/install | bash
curl -L https://foundry.paradigm.xyz | bash && foundryup
# Rust: https://rustup.rs
# Optional: brew install just mprocs  (only if you want the Justfile path)
```

## First-time setup

```bash
bun run install:all                       # root + web deps
cp backend/env.example backend/.env       # edit for Sepolia if needed
(cd backend/contracts && forge build)     # generates contracts/out/DemoToken.sol/DemoToken.json
                                          # that `alloy::sol!` reads at compile time
```

## Run everything (bun-native, primary path)

```bash
bun run dev
```

This spawns `anvil + backend + web` under `concurrently` in a single terminal
with labeled streams. All three come up in ~3s.

- http://localhost:3000 — web app
- http://localhost:8080/api/openapi.json — OpenAPI spec
- http://127.0.0.1:8545 — anvil JSON-RPC

Need just one? `bun run dev:anvil`, `bun run dev:backend`, `bun run dev:web`.

## Alternative: just + mprocs

If you prefer 3-pane `mprocs` (split panes instead of merged stream):
```bash
brew install just mprocs
just dev
```

Both paths are kept in sync.

## Regenerating typed API client

After any change to backend routes/schemas (backend must be running):
```bash
bun run codegen
```

## Verify

```bash
bun run check   # cargo check + tsc --noEmit
bun run build   # cargo build + vite build
```

## Phase status

- [x] Phase 1 — backend skeleton + `/api/health`, `/api/network`, `/api/account`
- [x] Phase 2 — web scaffold + OpenAPI codegen + network/wallet toggles + landing page
- [x] Phase 3 — ETH transfer (Local verified end-to-end; **MetaMask path ships but
      awaiting manual user verification — open `/transfer` and click "Connect wallet"**)
- [x] Phase 4 — ERC-20 deploy + transfer + balanceOf (Local verified end-to-end;
      MetaMask `transfer/build` path same caveat as Phase 3)
- [x] Phase 5 — WebSocket Transfer event stream (`/ws/erc20/transfers`)
- [x] Phase 6 — alloy wallet demo: random key + BIP-39 mnemonic generation +
      hot-swap of the active server signer (`/wallet`).
      ⚠ Returns raw private keys / mnemonics over HTTP — for learning the
      alloy surface only. Never copy this shape into a real product.

> **MetaMask 주의.** 팝업 트리거는 `/transfer`와 `/erc20` 페이지의 **Connect
> wallet** 버튼에만 걸려 있습니다. Overview(`/`)에는 읽기 조회만 있고 연결
> 버튼이 없으므로, MetaMask 모드로 토글해도 Overview에서는 아무 팝업이 뜨지
> 않는 것이 의도된 동작입니다.
>
> Sepolia로 전환하려면 `backend/.env`에 `SEPOLIA_HTTP_URL` (그리고 Phase 5의
> 이벤트 스트림을 쓰려면 `SEPOLIA_WS_URL`)을 채워 넣어야 합니다. 비어 있으면
> 네트워크 토글이 `switch failed: SEPOLIA_HTTP_URL is required...`로 실패합니다.

### Manual e2e smoke

After `bun run dev`:

1. Visit `/erc20`, click **Deploy DemoToken**. The backend remembers the
   address, so the other pages pick it up automatically.
2. Open `/events` in a second tab. The status pill should flip to
   `LIVE · 0x… · chain 31337` within a second.
3. Back on `/erc20`, send a transfer (any amount, mode = Local). The event
   appears on `/events` within a block (~2 s on anvil).
4. For MetaMask: flip the wallet pill to `MetaMask`, `Connect wallet`,
   and send from `/transfer` or `/erc20`. MetaMask pops up, you approve,
   and the event stream picks up the Transfer as before.

## Sharp edges

- `SEPOLIA_WS_URL` is required for Phase 5. Most free RPCs are HTTP-only;
  Alchemy / Infura / QuickNode free tiers give WS.
- MetaMask on Sepolia occasionally returns very low `maxPriorityFeePerGas`
  and stalls — the backend floors it at 1 gwei in `/api/tx/eth/build`
  (Phase 3+).
- OpenAPI codegen must run after backend changes or the frontend types go
  stale silently.
