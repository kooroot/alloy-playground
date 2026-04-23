use alloy::providers::Provider;
use axum::{extract::State, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::{
    error::ApiError,
    state::{AppState, Network},
};

#[derive(Serialize, ToSchema)]
pub struct NetworkInfo {
    pub network: Network,
    pub chain_id: u64,
    pub latest_block: u64,
}

#[derive(Deserialize, ToSchema)]
pub struct SwitchNetworkRequest {
    pub network: Network,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/network", get(get_network).post(post_network))
}

#[utoipa::path(
    get,
    path = "/api/network",
    responses((status = 200, body = NetworkInfo)),
    tag = "network",
)]
pub async fn get_network(State(state): State<AppState>) -> Result<Json<NetworkInfo>, ApiError> {
    let snap = state.snapshot().await;
    let latest_block = snap.http_provider.get_block_number().await?;
    Ok(Json(NetworkInfo {
        network: snap.network,
        chain_id: snap.chain_id,
        latest_block,
    }))
}

#[utoipa::path(
    post,
    path = "/api/network",
    request_body = SwitchNetworkRequest,
    responses((status = 200, body = NetworkInfo)),
    tag = "network",
)]
pub async fn post_network(
    State(state): State<AppState>,
    Json(req): Json<SwitchNetworkRequest>,
) -> Result<Json<NetworkInfo>, ApiError> {
    let snap = state
        .switch_network(req.network)
        .await
        .map_err(ApiError::bad_request)?;
    let latest_block = snap.http_provider.get_block_number().await?;
    Ok(Json(NetworkInfo {
        network: snap.network,
        chain_id: snap.chain_id,
        latest_block,
    }))
}
