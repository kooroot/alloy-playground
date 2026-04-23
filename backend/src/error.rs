//! Unified axum error type. Anything implementing `Into<eyre::Report>` converts
//! into `ApiError` and serializes as `{ "error": "..." }` with an HTTP 500 by
//! default. Known-categorizable errors (bad address, rpc unreachable) can
//! grow their own variants as later phases need them.

use axum::{http::StatusCode, response::IntoResponse, Json};
use serde_json::json;

pub struct ApiError {
    status: StatusCode,
    inner: eyre::Report,
}

impl ApiError {
    pub fn bad_request(inner: impl Into<eyre::Report>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            inner: inner.into(),
        }
    }
}

impl<E: Into<eyre::Report>> From<E> for ApiError {
    fn from(e: E) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            inner: e.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        tracing::error!(error = %self.inner, "request failed");
        (
            self.status,
            Json(json!({ "error": format!("{:#}", self.inner) })),
        )
            .into_response()
    }
}
