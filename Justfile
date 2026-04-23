# alloy-prototype — dev orchestration.
# Requires: foundry (anvil), rust toolchain, bun, mprocs.
#
#   brew install just mprocs
#   curl -L https://foundry.paradigm.xyz | bash && foundryup
#   curl -fsSL https://bun.sh/install | bash

default: dev

# Start anvil + backend + web concurrently in one terminal (split panes).
dev:
    mprocs --names anvil,backend,web \
        "just anvil" \
        "just backend" \
        "just web"

# Local devnet. `--block-time 2` so we can actually watch blocks advance.
anvil:
    anvil --block-time 2

# Rust backend. Reads ./backend/.env if present.
backend:
    cd backend && cargo run

# Vite dev server for the web app.
web:
    cd web && bun run dev

# Regenerate ./web/src/types/api.d.ts from the RUNNING backend's OpenAPI spec.
codegen:
    cd web && bun run codegen

# First-time setup.
install:
    cd web && bun install
    cd backend && cargo fetch

# Verify: typecheck the web app + compile-check the backend.
check:
    cd backend && cargo check
    cd web && bun run typecheck

# Kitchen-sink CI-style verification — useful before committing.
ci: check
    cd backend && cargo test
    cd web && bun run build
