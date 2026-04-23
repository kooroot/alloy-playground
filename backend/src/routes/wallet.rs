//! Wallet generation + hot-swap, demonstrating that alloy can mint and
//! manage keys server-side without a browser extension.
//!
//! Endpoints:
//!   POST /api/wallet/new            - random PrivateKeySigner
//!   POST /api/wallet/new-mnemonic   - random BIP-39 phrase + derived key
//!   POST /api/wallet/from-mnemonic  - restore key from existing phrase
//!   POST /api/wallet/use            - hot-swap the active server signer
//!   GET  /api/wallet/current        - inspect what the server is signing with
//!
//! WARNING — this returns raw private keys and 12-word mnemonics in plain
//! HTTP responses. That is a deliberate trade-off for an alloy *learning*
//! prototype. NEVER copy this surface into a real product.

use alloy::{
    primitives::Address,
    signers::local::{
        coins_bip39::{English, Mnemonic},
        MnemonicBuilder, PrivateKeySigner,
    },
};
use axum::{extract::State, routing::{get, post}, Json, Router};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{error::ApiError, state::AppState};

// ─── Requests ────────────────────────────────────────────────────────────────

#[derive(Deserialize, ToSchema)]
pub struct UseKeyRequest {
    /// 0x-prefixed 32-byte hex private key.
    #[schema(example = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")]
    pub private_key: String,
}

#[derive(Deserialize, ToSchema)]
pub struct FromMnemonicRequest {
    #[schema(example = "test test test test test test test test test test test junk")]
    pub phrase: String,
    /// BIP-44 child index (defaults to 0 = first account).
    #[serde(default)]
    pub index: u32,
}

// ─── Responses ───────────────────────────────────────────────────────────────

#[derive(Serialize, ToSchema)]
pub struct GeneratedWallet {
    #[schema(value_type = String)]
    pub address: Address,
    /// 0x-prefixed 32-byte hex.
    pub private_key: String,
    /// `Some(...)` only on the mnemonic endpoints. Space-separated 12 words.
    pub mnemonic: Option<String>,
}

#[derive(Serialize, ToSchema)]
pub struct UseKeyResponse {
    #[schema(value_type = String)]
    pub address: Address,
}

#[derive(Serialize, ToSchema)]
pub struct CurrentSignerResponse {
    /// `None` when the server is running without a signer (e.g. PRIVATE_KEY
    /// missing from .env and no hot-swap has happened yet).
    #[schema(value_type = Option<String>)]
    pub address: Option<Address>,
}

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/wallet/new", post(new_random))
        .route("/api/wallet/new-mnemonic", post(new_mnemonic))
        .route("/api/wallet/from-mnemonic", post(from_mnemonic))
        .route("/api/wallet/use", post(use_key))
        .route("/api/wallet/current", get(current))
}

// ─── Handlers ────────────────────────────────────────────────────────────────

#[utoipa::path(post, path = "/api/wallet/new",
    responses((status = 200, body = GeneratedWallet)),
    tag = "wallet",
)]
pub async fn new_random() -> Result<Json<GeneratedWallet>, ApiError> {
    let signer = PrivateKeySigner::random();
    Ok(Json(serialize_signer(signer, None)))
}

#[utoipa::path(post, path = "/api/wallet/new-mnemonic",
    responses((status = 200, body = GeneratedWallet)),
    tag = "wallet",
)]
pub async fn new_mnemonic() -> Result<Json<GeneratedWallet>, ApiError> {
    // 12-word English BIP-39 phrase; 128 bits of entropy.
    let mut rng = OsRng;
    let mnemonic = Mnemonic::<English>::new_with_count(&mut rng, 12)
        .map_err(|e| ApiError::from(eyre::eyre!("mnemonic gen failed: {e}")))?;
    let phrase = mnemonic.to_phrase();
    let signer = MnemonicBuilder::<English>::default()
        .phrase(phrase.clone())
        .build()
        .map_err(|e| ApiError::from(eyre::eyre!("derive from mnemonic failed: {e}")))?;
    Ok(Json(serialize_signer(signer, Some(phrase))))
}

#[utoipa::path(post, path = "/api/wallet/from-mnemonic",
    request_body = FromMnemonicRequest,
    responses((status = 200, body = GeneratedWallet)),
    tag = "wallet",
)]
pub async fn from_mnemonic(
    Json(req): Json<FromMnemonicRequest>,
) -> Result<Json<GeneratedWallet>, ApiError> {
    let signer = MnemonicBuilder::<English>::default()
        .phrase(req.phrase.trim().to_string())
        .index(req.index)
        .map_err(|e| ApiError::bad_request(eyre::eyre!("bad index: {e}")))?
        .build()
        .map_err(|e| ApiError::bad_request(eyre::eyre!("invalid mnemonic: {e}")))?;
    // Don't echo the user-supplied phrase back; we only return the derived
    // key + address.
    Ok(Json(serialize_signer(signer, None)))
}

#[utoipa::path(post, path = "/api/wallet/use",
    request_body = UseKeyRequest,
    responses((status = 200, body = UseKeyResponse)),
    tag = "wallet",
)]
pub async fn use_key(
    State(state): State<AppState>,
    Json(req): Json<UseKeyRequest>,
) -> Result<Json<UseKeyResponse>, ApiError> {
    let signer: PrivateKeySigner = req
        .private_key
        .trim()
        .parse()
        .map_err(|e| ApiError::bad_request(eyre::eyre!("bad private_key: {e}")))?;
    let address = state.swap_signer(signer).await?;
    Ok(Json(UseKeyResponse { address }))
}

#[utoipa::path(get, path = "/api/wallet/current",
    responses((status = 200, body = CurrentSignerResponse)),
    tag = "wallet",
)]
pub async fn current(
    State(state): State<AppState>,
) -> Result<Json<CurrentSignerResponse>, ApiError> {
    let snap = state.snapshot().await;
    Ok(Json(CurrentSignerResponse {
        address: snap.signer_address,
    }))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

fn serialize_signer(signer: PrivateKeySigner, mnemonic: Option<String>) -> GeneratedWallet {
    let address = signer.address();
    // PrivateKeySigner.credential() exposes the underlying SigningKey;
    // .to_bytes() returns its scalar as 32-byte FieldBytes.
    let pk_bytes = signer.credential().to_bytes();
    let private_key = format!("0x{}", alloy::hex::encode(pk_bytes));
    GeneratedWallet { address, private_key, mnemonic }
}
