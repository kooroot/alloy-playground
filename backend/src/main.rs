//! alloy-prototype-backend
//!
//! Phase 1: read-only queries against a single HTTP provider. Subsequent
//! phases add a WS provider, signers, tx build/send, ERC-20, and a
//! /ws/erc20/transfers stream.

use std::net::SocketAddr;

use alloy_prototype_backend::{routes, state::AppState};
use eyre::{Result, WrapErr};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let state = AppState::from_env().await?;

    let bind_addr: SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "0.0.0.0:8080".to_string())
        .parse()
        .wrap_err("BIND_ADDR is not a valid SocketAddr")?;

    let app = routes::router()
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::very_permissive());

    tracing::info!(%bind_addr, "listening");
    let listener = tokio::net::TcpListener::bind(bind_addr)
        .await
        .wrap_err_with(|| format!("failed to bind {bind_addr}"))?;
    axum::serve(listener, app).await.wrap_err("axum::serve failed")?;
    Ok(())
}
