//! ETH transfer (EIP-1559).
//!
//! Three endpoints cover both signing modes:
//!
//! 1. `POST /api/tx/eth/build`       — unsigned tx for MetaMask / any EIP-1193
//!                                     wallet. Returns hex-encoded fields the
//!                                     browser passes straight to
//!                                     `window.ethereum.request({ method:
//!                                     "eth_sendTransaction", params: [tx] })`.
//! 2. `POST /api/tx/eth/send`        — accepts a signed raw tx from the
//!                                     browser (e.g. signed by viem with a
//!                                     local walletClient) and broadcasts.
//! 3. `POST /api/tx/eth/send-local`  — server-signed path using the
//!                                     PrivateKeySigner loaded from `.env`.
//!
//! Fee estimation floors `maxPriorityFeePerGas` at **1 gwei** because some
//! Sepolia RPCs return absurdly low values that cause MetaMask to stall.

use alloy::{
    eips::eip2718::Decodable2718,
    network::TransactionBuilder,
    primitives::{Address, Bytes, TxHash, U256},
    providers::Provider,
    rpc::types::TransactionRequest,
};
use axum::{extract::State, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{error::ApiError, serde_helpers::u256_as_string, state::AppState};

// Floor for maxPriorityFeePerGas — see module docs.
const PRIORITY_FEE_FLOOR_WEI: u128 = 1_000_000_000; // 1 gwei

// ─── Request bodies ──────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct BuildEthTxRequest {
    /// Sender address. For MetaMask flow this is `window.ethereum.selectedAddress`.
    #[schema(value_type = String, example = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")]
    pub from: Address,

    #[schema(value_type = String, example = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")]
    pub to: Address,

    /// Value in wei, decimal-string to survive JS number precision.
    #[schema(value_type = String, example = "1000000000000000000")]
    #[serde(with = "u256_as_string")]
    pub value_wei: U256,
}

#[derive(Deserialize, ToSchema)]
pub struct SendRawTxRequest {
    /// Hex-encoded signed RLP (0x-prefixed), as produced by e.g.
    /// `walletClient.signTransaction(...)` in viem.
    #[schema(value_type = String, example = "0x02f8...")]
    pub raw_tx: Bytes,
}

#[derive(Deserialize, ToSchema)]
pub struct SendLocalTxRequest {
    #[schema(value_type = String, example = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")]
    pub to: Address,

    #[schema(value_type = String, example = "1000000000000000000")]
    #[serde(with = "u256_as_string")]
    pub value_wei: U256,
}

// ─── Responses ───────────────────────────────────────────────────────────────

/// Shape matches MetaMask's `eth_sendTransaction` param format — hex-prefixed
/// strings across the board so the browser can pass it through unchanged.
#[derive(Serialize, ToSchema)]
pub struct UnsignedEip1559Tx {
    #[schema(value_type = String)] pub from: Address,
    #[schema(value_type = String)] pub to: Address,
    /// Hex-encoded wei. E.g. `"0xde0b6b3a7640000"` for 1 ETH.
    pub value: String,
    pub nonce: String,
    pub gas: String,
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
    /// Always `"0x2"` (EIP-1559).
    #[serde(rename = "type")] pub tx_type: String,
    pub chain_id: String,
}

#[derive(Serialize, ToSchema)]
pub struct TxHashResponse {
    #[schema(value_type = String, example = "0xabc…")]
    pub tx_hash: TxHash,
}

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/tx/eth/build", post(build_eth_tx))
        .route("/api/tx/eth/send", post(send_raw_tx))
        .route("/api/tx/eth/send-local", post(send_local_tx))
}

// ─── Handlers ────────────────────────────────────────────────────────────────

#[utoipa::path(
    post,
    path = "/api/tx/eth/build",
    request_body = BuildEthTxRequest,
    responses((status = 200, body = UnsignedEip1559Tx)),
    tag = "tx",
)]
pub async fn build_eth_tx(
    State(state): State<AppState>,
    Json(req): Json<BuildEthTxRequest>,
) -> Result<Json<UnsignedEip1559Tx>, ApiError> {
    let snap = state.snapshot().await;
    let p = snap.http_provider;

    // Fetch pending nonce (so back-to-back sends in one block don't collide).
    let nonce = p.get_transaction_count(req.from).pending().await?;

    // EIP-1559 fee estimate with a priority-fee floor for Sepolia sanity.
    let fees = p.estimate_eip1559_fees().await?;
    let max_priority = fees.max_priority_fee_per_gas.max(PRIORITY_FEE_FLOOR_WEI);
    // If priority was bumped, make sure max_fee is at least priority + base_fee.
    let max_fee = fees.max_fee_per_gas.max(max_priority);

    // Gas estimate for a simple value-transfer (~21_000 but ask the node).
    let tx = TransactionRequest::default()
        .with_from(req.from)
        .with_to(req.to)
        .with_value(req.value_wei);
    let gas = p.estimate_gas(tx).await?;

    Ok(Json(UnsignedEip1559Tx {
        from: req.from,
        to: req.to,
        value: hex_u256(req.value_wei),
        nonce: hex_u64(nonce),
        gas: hex_u64(gas),
        max_fee_per_gas: hex_u128(max_fee),
        max_priority_fee_per_gas: hex_u128(max_priority),
        tx_type: "0x2".to_string(),
        chain_id: hex_u64(snap.chain_id),
    }))
}

#[utoipa::path(
    post,
    path = "/api/tx/eth/send",
    request_body = SendRawTxRequest,
    responses((status = 200, body = TxHashResponse)),
    tag = "tx",
)]
pub async fn send_raw_tx(
    State(state): State<AppState>,
    Json(req): Json<SendRawTxRequest>,
) -> Result<Json<TxHashResponse>, ApiError> {
    let snap = state.snapshot().await;

    // Sanity-decode so a malformed raw_tx gives a 400 instead of an
    // opaque RPC error. We don't reconstruct — just validate the envelope.
    let _envelope = alloy::consensus::TxEnvelope::decode_2718(&mut req.raw_tx.as_ref())
        .map_err(|e| ApiError::bad_request(eyre::eyre!("raw_tx is not a valid EIP-2718 envelope: {e}")))?;

    let pending = snap
        .http_provider
        .send_raw_transaction(req.raw_tx.as_ref())
        .await?;
    let tx_hash = *pending.tx_hash();
    tracing::info!(%tx_hash, "broadcasted raw tx");
    Ok(Json(TxHashResponse { tx_hash }))
}

#[utoipa::path(
    post,
    path = "/api/tx/eth/send-local",
    request_body = SendLocalTxRequest,
    responses((status = 200, body = TxHashResponse)),
    tag = "tx",
)]
pub async fn send_local_tx(
    State(state): State<AppState>,
    Json(req): Json<SendLocalTxRequest>,
) -> Result<Json<TxHashResponse>, ApiError> {
    let snap = state.snapshot().await;
    let signing = snap.signing_provider.ok_or_else(|| {
        ApiError::bad_request(eyre::eyre!(
            "local signer is not configured — set PRIVATE_KEY in .env and restart"
        ))
    })?;
    let from = snap.signer_address.expect("signing provider implies address");

    let tx = TransactionRequest::default()
        .with_from(from)
        .with_to(req.to)
        .with_value(req.value_wei);

    // WalletFiller + GasFiller + NonceFiller handle signing, gas, nonce, fees.
    let pending = signing.send_transaction(tx).await?;
    let tx_hash = *pending.tx_hash();
    tracing::info!(%tx_hash, "broadcasted server-signed tx");
    Ok(Json(TxHashResponse { tx_hash }))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn hex_u64(n: u64) -> String {
    hex_helpers::hex_u64(n)
}

fn hex_u128(n: u128) -> String {
    hex_helpers::hex_u128(n)
}

fn hex_u256(n: U256) -> String {
    hex_helpers::hex_u256(n)
}

/// Reusable hex formatting + shared constants. Kept `pub(crate)` so Phase 4's
/// ERC-20 module can reuse the same priority-fee floor and hex formatting
/// without duplicating it.
pub(crate) mod hex_helpers {
    use alloy::primitives::U256;

    pub const PRIORITY_FEE_FLOOR_WEI: u128 = super::PRIORITY_FEE_FLOOR_WEI;

    pub fn hex_u64(n: u64) -> String {
        format!("0x{n:x}")
    }
    pub fn hex_u128(n: u128) -> String {
        format!("0x{n:x}")
    }
    pub fn hex_u256(n: U256) -> String {
        format!("0x{n:x}")
    }
}
