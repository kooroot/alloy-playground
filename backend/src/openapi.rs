//! OpenAPI spec assembly + the `/api/openapi.json` handler.

use axum::{extract::State, routing::get, Json, Router};
use utoipa::OpenApi;

use crate::{
    routes::{account, erc20, health, network, tx, wallet},
    state::{AppState, Network},
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "alloy-prototype-backend",
        description = "HTTP surface for the alloy-prototype. All schemas here must stay in lockstep with frontend codegen (`bun run codegen`).",
        version = "0.1.0"
    ),
    paths(
        health::health,
        network::get_network,
        network::post_network,
        account::get_account,
        tx::build_eth_tx,
        tx::send_raw_tx,
        tx::send_local_tx,
        erc20::deploy,
        erc20::transfer_send_local,
        erc20::transfer_build,
        erc20::balance_of,
        wallet::new_random,
        wallet::new_mnemonic,
        wallet::from_mnemonic,
        wallet::use_key,
        wallet::current,
    ),
    components(schemas(
        health::HealthResponse,
        network::NetworkInfo,
        network::SwitchNetworkRequest,
        account::AccountInfo,
        tx::BuildEthTxRequest,
        tx::SendRawTxRequest,
        tx::SendLocalTxRequest,
        tx::UnsignedEip1559Tx,
        tx::TxHashResponse,
        erc20::DeployRequest,
        erc20::DeployResponse,
        erc20::TransferLocalRequest,
        erc20::TransferBuildRequest,
        erc20::UnsignedTransferTx,
        erc20::Erc20TxHashResponse,
        erc20::BalanceResponse,
        wallet::GeneratedWallet,
        wallet::UseKeyRequest,
        wallet::UseKeyResponse,
        wallet::FromMnemonicRequest,
        wallet::CurrentSignerResponse,
        Network,
    )),
    tags(
        (name = "health", description = "liveness probe"),
        (name = "network", description = "network info + runtime switch"),
        (name = "account", description = "account balance + nonce"),
        (name = "tx", description = "ETH transfer — build/send/send-local"),
        (name = "erc20", description = "ERC-20 deploy / transfer / balanceOf"),
        (name = "wallet", description = "alloy wallet generation + hot-swap"),
    )
)]
struct ApiDoc;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/openapi.json", get(openapi_json))
}

async fn openapi_json(State(_): State<AppState>) -> Json<utoipa::openapi::OpenApi> {
    Json(ApiDoc::openapi())
}
