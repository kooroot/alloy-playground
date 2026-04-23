//! ERC-20 deploy / transfer / balanceOf for the `DemoToken` contract.
//!
//! `deploy` and `transfer/send-local` go through the server's PrivateKeySigner.
//! `transfer/build` returns an unsigned tx for the MetaMask browser path.
//! All endpoints default the token address to whatever was deployed last
//! (remembered in AppState) so the frontend doesn't have to round-trip it.

use alloy::{
    network::TransactionBuilder,
    primitives::{Address, TxHash, U256},
    providers::Provider,
    rpc::types::TransactionRequest,
    sol_types::SolCall,
};
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    contracts::DemoToken,
    error::ApiError,
    routes::tx::hex_helpers,
    serde_helpers::u256_as_string,
    state::AppState,
};

// ─── Requests ────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct DeployRequest {
    #[schema(example = "DemoToken")]
    pub name: String,
    #[schema(example = "DEMO")]
    pub symbol: String,
    /// Initial supply in smallest units (wei-scale for 18-decimal tokens).
    /// Decimal-string to survive JS number precision.
    #[schema(value_type = String, example = "1000000000000000000000000")]
    #[serde(with = "u256_as_string")]
    pub initial_supply: U256,
}

#[derive(Deserialize, ToSchema)]
pub struct TransferLocalRequest {
    /// Defaults to last-deployed address if omitted.
    #[schema(value_type = Option<String>, example = "0x…")]
    pub token: Option<Address>,
    #[schema(value_type = String, example = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8")]
    pub to: Address,
    #[schema(value_type = String, example = "100000000000000000000")]
    #[serde(with = "u256_as_string")]
    pub amount: U256,
}

#[derive(Deserialize, ToSchema)]
pub struct TransferBuildRequest {
    #[schema(value_type = Option<String>, example = "0x…")]
    pub token: Option<Address>,
    #[schema(value_type = String)]
    pub from: Address,
    #[schema(value_type = String)]
    pub to: Address,
    #[schema(value_type = String)]
    #[serde(with = "u256_as_string")]
    pub amount: U256,
}

// ─── Responses ───────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct DeployResponse {
    #[schema(value_type = String)]
    pub address: Address,
    #[schema(value_type = String)]
    pub tx_hash: TxHash,
}

#[derive(Serialize, ToSchema)]
pub struct Erc20TxHashResponse {
    #[schema(value_type = String)]
    pub tx_hash: TxHash,
}

#[derive(Serialize, ToSchema)]
pub struct UnsignedTransferTx {
    #[schema(value_type = String)] pub from: Address,
    /// Destination is the token contract — the `to` recipient is encoded in
    /// the calldata.
    #[schema(value_type = String)] pub to: Address,
    pub data: String,
    pub value: String,
    pub nonce: String,
    pub gas: String,
    pub max_fee_per_gas: String,
    pub max_priority_fee_per_gas: String,
    #[serde(rename = "type")] pub tx_type: String,
    pub chain_id: String,
}

#[derive(Serialize, ToSchema)]
pub struct BalanceResponse {
    #[schema(value_type = String)] pub token: Address,
    #[schema(value_type = String)] pub holder: Address,
    #[schema(value_type = String, example = "100000000000000000000")]
    #[serde(with = "u256_as_string")]
    pub balance: U256,
}

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/erc20/deploy", post(deploy))
        .route("/api/erc20/transfer/send-local", post(transfer_send_local))
        .route("/api/erc20/transfer/build", post(transfer_build))
        .route("/api/erc20/balance/{holder}", get(balance_of))
}

// ─── Handlers ────────────────────────────────────────────────────────────────

#[utoipa::path(
    post, path = "/api/erc20/deploy",
    request_body = DeployRequest,
    responses((status = 200, body = DeployResponse)),
    tag = "erc20",
)]
pub async fn deploy(
    State(state): State<AppState>,
    Json(req): Json<DeployRequest>,
) -> Result<Json<DeployResponse>, ApiError> {
    let snap = state.snapshot().await;
    let signing = snap.signing_provider.ok_or_else(|| {
        ApiError::bad_request(eyre::eyre!(
            "deploy requires a local signer — set PRIVATE_KEY in .env and restart"
        ))
    })?;

    // sol! generates DemoToken::deploy_builder with one arg per constructor
    // param. The returned builder is a TransactionRequest; we send it via
    // the wallet-filled provider so nonce/gas/fees/signing all happen for us.
    let builder = DemoToken::deploy_builder(&signing, req.name, req.symbol, req.initial_supply);
    let pending = builder.send().await?;
    let tx_hash = *pending.tx_hash();
    let receipt = pending.get_receipt().await?;
    let address = receipt.contract_address.ok_or_else(|| {
        ApiError::from(eyre::eyre!("deploy receipt missing contract_address"))
    })?;

    state.remember_erc20(address).await;
    tracing::info!(%address, %tx_hash, "erc20 deployed");
    Ok(Json(DeployResponse { address, tx_hash }))
}

#[utoipa::path(
    post, path = "/api/erc20/transfer/send-local",
    request_body = TransferLocalRequest,
    responses((status = 200, body = Erc20TxHashResponse)),
    tag = "erc20",
)]
pub async fn transfer_send_local(
    State(state): State<AppState>,
    Json(req): Json<TransferLocalRequest>,
) -> Result<Json<Erc20TxHashResponse>, ApiError> {
    let snap = state.snapshot().await;
    // resolve_token borrows snap; extract signing_provider AFTER so the
    // `ok_or_else` move doesn't invalidate the borrow.
    let token_addr = resolve_token(&snap, req.token)?;
    let signing = snap.signing_provider.ok_or_else(|| {
        ApiError::bad_request(eyre::eyre!(
            "transfer/send-local requires a local signer — set PRIVATE_KEY"
        ))
    })?;

    let token = DemoToken::new(token_addr, &signing);
    let pending = token.transfer(req.to, req.amount).send().await?;
    let tx_hash = *pending.tx_hash();
    tracing::info!(%token_addr, %tx_hash, "erc20 transfer broadcast (local)");
    Ok(Json(Erc20TxHashResponse { tx_hash }))
}

#[utoipa::path(
    post, path = "/api/erc20/transfer/build",
    request_body = TransferBuildRequest,
    responses((status = 200, body = UnsignedTransferTx)),
    tag = "erc20",
)]
pub async fn transfer_build(
    State(state): State<AppState>,
    Json(req): Json<TransferBuildRequest>,
) -> Result<Json<UnsignedTransferTx>, ApiError> {
    let snap = state.snapshot().await;
    let token_addr = resolve_token(&snap, req.token)?;

    // Encode `transfer(address,uint256)` calldata via the sol!-generated type.
    let calldata = DemoToken::transferCall {
        to: req.to,
        amount: req.amount,
    }
    .abi_encode();

    let provider = snap.http_provider;
    let nonce = provider.get_transaction_count(req.from).pending().await?;
    let fees = provider.estimate_eip1559_fees().await?;
    let max_priority = fees
        .max_priority_fee_per_gas
        .max(hex_helpers::PRIORITY_FEE_FLOOR_WEI);
    let max_fee = fees.max_fee_per_gas.max(max_priority);

    let tx = TransactionRequest::default()
        .with_from(req.from)
        .with_to(token_addr)
        .with_input(calldata.clone());
    let gas = provider.estimate_gas(tx).await?;

    Ok(Json(UnsignedTransferTx {
        from: req.from,
        to: token_addr,
        data: format!("0x{}", alloy::hex::encode(&calldata)),
        value: "0x0".to_string(),
        nonce: hex_helpers::hex_u64(nonce),
        gas: hex_helpers::hex_u64(gas),
        max_fee_per_gas: hex_helpers::hex_u128(max_fee),
        max_priority_fee_per_gas: hex_helpers::hex_u128(max_priority),
        tx_type: "0x2".to_string(),
        chain_id: hex_helpers::hex_u64(snap.chain_id),
    }))
}

#[utoipa::path(
    get, path = "/api/erc20/balance/{holder}",
    params(
        ("holder" = String, Path, description = "0x-address to query"),
        ("token" = Option<String>, Query, description = "Token address; defaults to last-deployed"),
    ),
    responses((status = 200, body = BalanceResponse)),
    tag = "erc20",
)]
pub async fn balance_of(
    State(state): State<AppState>,
    Path(holder): Path<Address>,
    axum::extract::Query(q): axum::extract::Query<BalanceQuery>,
) -> Result<Json<BalanceResponse>, ApiError> {
    let snap = state.snapshot().await;
    let token_addr = resolve_token(&snap, q.token)?;
    let token = DemoToken::new(token_addr, &snap.http_provider);
    let balance = token.balanceOf(holder).call().await?;
    Ok(Json(BalanceResponse {
        token: token_addr,
        holder,
        balance,
    }))
}

#[derive(Deserialize)]
pub struct BalanceQuery {
    pub token: Option<Address>,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn resolve_token(
    snap: &crate::state::StateSnapshot,
    explicit: Option<Address>,
) -> Result<Address, ApiError> {
    match explicit.or(snap.erc20_addr) {
        Some(a) => Ok(a),
        None => Err(ApiError::bad_request(eyre::eyre!(
            "no token address: pass `token` in the request or deploy one first"
        ))),
    }
}
