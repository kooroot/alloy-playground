//! End-to-end integration test for the alloy-prototype backend.
//!
//! Spawns a fresh anvil, builds the real `AppState` + axum `Router` against
//! it, binds to an ephemeral port, then drives the full read-only + ERC-20
//! flow over HTTP via reqwest. Intended as the executable answer to "did
//! anything regress?" — `cargo test` is the only signal needed.
//!
//! Covers:
//!   - GET /api/health
//!   - GET /api/network            (chain_id, latest block sanity)
//!   - GET /api/account/{addr}     (anvil seed balance)
//!   - POST /api/erc20/deploy      (server-signed deploy)
//!   - GET /api/erc20/balance/...  (deployer holds initial supply)
//!   - POST /api/erc20/transfer/send-local  (server-signed transfer)
//!   - GET /api/erc20/balance/...  (recipient up, deployer down)
//!
//! Single test (no #[serial]) because env vars (PRIVATE_KEY, ANVIL_*_URL,
//! NETWORK) are process-global and AppState::from_env reads them at build
//! time. Adding more integration tests will require either serial_test or
//! threading config through a non-env constructor.

use std::time::Duration;

use alloy::{
    hex,
    node_bindings::Anvil,
    primitives::{Address, U256},
};
use alloy_prototype_backend::{routes, state::AppState};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn erc20_full_flow_against_spawned_anvil() {
    // ── 1. Spawn anvil ──────────────────────────────────────────────────────
    // `Anvil::new().spawn()` shells out to the `anvil` binary (foundry) and
    // gives us deterministic seed addresses + private keys. The instance is
    // killed on drop, which happens at end-of-test.
    let anvil = Anvil::new()
        .args(["--chain-id", "31337"])
        .try_spawn()
        .expect("spawn anvil — install foundry (`foundryup`) if this fails");
    let http_url = anvil.endpoint();
    let ws_url = anvil.ws_endpoint();
    let deployer: Address = anvil.addresses()[0];
    let recipient: Address = anvil.addresses()[1];
    let deployer_pk_hex = format!("0x{}", hex::encode(anvil.keys()[0].to_bytes()));

    // ── 2. Configure the backend to point at this anvil ─────────────────────
    // SAFETY: tests in this binary share a process — only one test sets env
    // vars in this file, so no race. Adding more tests = need serial_test.
    unsafe {
        std::env::set_var("NETWORK", "anvil");
        std::env::set_var("ANVIL_HTTP_URL", &http_url);
        std::env::set_var("ANVIL_WS_URL", &ws_url);
        std::env::set_var("PRIVATE_KEY", &deployer_pk_hex);
    }

    let state = AppState::from_env()
        .await
        .expect("AppState::from_env failed — check env vars + anvil reachable");

    // ── 3. Serve the real router on an ephemeral port ───────────────────────
    let app = routes::router()
        .with_state(state)
        .layer(CorsLayer::very_permissive());
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Give axum a beat to start accepting; reqwest's connect retry is per-
    // request, so a small sleep here keeps logs clean.
    tokio::time::sleep(Duration::from_millis(50)).await;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .unwrap();

    // ── 4. /api/health ──────────────────────────────────────────────────────
    let health: Value = client
        .get(format!("{base}/api/health"))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(health["ok"], true, "/api/health should report ok=true");
    assert_eq!(health["service"], "alloy-prototype-backend");

    // ── 5. /api/network ─────────────────────────────────────────────────────
    let network: Value = client
        .get(format!("{base}/api/network"))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(network["network"], "anvil");
    assert_eq!(network["chain_id"], 31337);
    assert!(
        network["latest_block"].as_u64().is_some(),
        "latest_block should be a number, got {network:?}"
    );

    // ── 6. /api/account/{deployer} — seeded with 10000 ETH ─────────────────
    let account: Value = client
        .get(format!("{base}/api/account/{deployer:#x}"))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let balance_wei: U256 = account["balance_wei"].as_str().unwrap().parse().unwrap();
    assert!(
        balance_wei > U256::from(0u64),
        "deployer should have nonzero seed balance, got {balance_wei}"
    );

    // ── 7. POST /api/erc20/deploy ───────────────────────────────────────────
    let initial_supply = U256::from(1_000_000u64) * U256::from(10u64).pow(U256::from(18u64));
    let deploy: Value = client
        .post(format!("{base}/api/erc20/deploy"))
        .json(&json!({
            "name": "DemoToken",
            "symbol": "DEMO",
            "initial_supply": initial_supply.to_string(),
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    let token_addr_str = deploy["address"].as_str().expect("deploy.address missing");
    let _: Address = token_addr_str
        .parse()
        .expect("deploy.address not a valid 0x-address");
    assert!(
        deploy["tx_hash"]
            .as_str()
            .map(|s| s.starts_with("0x") && s.len() == 66)
            .unwrap_or(false),
        "deploy.tx_hash should be 0x + 64 hex chars, got {:?}",
        deploy["tx_hash"]
    );

    // ── 8. balanceOf(deployer) == initial_supply ────────────────────────────
    let bal_deployer_pre: U256 = fetch_balance(&client, &base, deployer).await;
    assert_eq!(
        bal_deployer_pre, initial_supply,
        "deployer should hold full initial supply right after deploy"
    );
    let bal_recipient_pre: U256 = fetch_balance(&client, &base, recipient).await;
    assert_eq!(
        bal_recipient_pre,
        U256::ZERO,
        "recipient should hold zero before transfer"
    );

    // ── 9. transfer 100 tokens to recipient ────────────────────────────────
    let amount = U256::from(100u64) * U256::from(10u64).pow(U256::from(18u64));
    let transfer: Value = client
        .post(format!("{base}/api/erc20/transfer/send-local"))
        .json(&json!({
            "to": format!("{recipient:#x}"),
            "amount": amount.to_string(),
            // omit `token` — backend defaults to last-deployed
        }))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    assert!(
        transfer["tx_hash"].as_str().is_some(),
        "transfer should return a tx_hash, got {transfer:?}"
    );

    // anvil's default block time is instant (auto-mine on tx); the tx is
    // mined by the time send_local returns its receipt. balanceOf(...)
    // queries the latest block via eth_call, so no sleep needed here.
    let bal_deployer_post = fetch_balance(&client, &base, deployer).await;
    let bal_recipient_post = fetch_balance(&client, &base, recipient).await;

    assert_eq!(
        bal_recipient_post, amount,
        "recipient should hold exactly the transferred amount"
    );
    assert_eq!(
        bal_deployer_post,
        initial_supply - amount,
        "deployer should be down by exactly the transferred amount"
    );

    // ── Done. Drop the anvil + abort the server task. ──────────────────────
    server.abort();
    drop(anvil);
}

async fn fetch_balance(client: &reqwest::Client, base: &str, holder: Address) -> U256 {
    let v: Value = client
        .get(format!("{base}/api/erc20/balance/{holder:#x}"))
        .send()
        .await
        .unwrap()
        .error_for_status()
        .unwrap()
        .json()
        .await
        .unwrap();
    v["balance"]
        .as_str()
        .expect("balance field missing")
        .parse()
        .expect("balance not a U256 decimal string")
}
