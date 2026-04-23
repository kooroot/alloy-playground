use alloy::{primitives::Address, providers::Provider};
use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde::Serialize;
use utoipa::ToSchema;

use crate::{error::ApiError, state::AppState};

#[derive(Serialize, ToSchema)]
pub struct AccountInfo {
    /// Checksummed 20-byte address, `0x`-prefixed hex.
    #[schema(value_type = String, example = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")]
    pub address: Address,
    /// Balance in wei. Serialized as a decimal string to avoid JS number precision loss.
    #[schema(value_type = String, example = "10000000000000000000000")]
    #[serde(with = "crate::serde_helpers::u256_as_string")]
    pub balance_wei: alloy::primitives::U256,
    pub nonce: u64,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/account/{addr}", get(get_account))
}

#[utoipa::path(
    get,
    path = "/api/account/{addr}",
    params(("addr" = String, Path, description = "Ethereum address (0x-prefixed hex)")),
    responses((status = 200, body = AccountInfo)),
    tag = "account",
)]
pub async fn get_account(
    State(state): State<AppState>,
    Path(addr): Path<Address>,
) -> Result<Json<AccountInfo>, ApiError> {
    let snap = state.snapshot().await;
    let provider = snap.http_provider;
    let (balance_wei, nonce) = tokio::try_join!(
        async { provider.get_balance(addr).await.map_err(ApiError::from) },
        async { provider.get_transaction_count(addr).await.map_err(ApiError::from) },
    )?;

    Ok(Json(AccountInfo {
        address: addr,
        balance_wei,
        nonce,
    }))
}
