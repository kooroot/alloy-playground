//! axum route modules. Keep each scenario in its own file so the
//! main.rs Router stays scannable as phases land.

pub mod account;
pub mod erc20;
pub mod events_ws;
pub mod health;
pub mod network;
pub mod tx;
pub mod wallet;

use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(network::router())
        .merge(account::router())
        .merge(tx::router())
        .merge(erc20::router())
        .merge(events_ws::router())
        .merge(wallet::router())
        .merge(crate::openapi::router())
}
