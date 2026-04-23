use axum::{routing::get, Json, Router};
use serde::Serialize;
use utoipa::ToSchema;

use crate::state::AppState;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    pub ok: bool,
    pub service: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/health", get(health))
}

#[utoipa::path(
    get,
    path = "/api/health",
    responses((status = 200, body = HealthResponse)),
    tag = "health",
)]
pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "alloy-prototype-backend".to_string(),
    })
}
