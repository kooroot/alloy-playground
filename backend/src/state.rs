//! Application state shared across axum handlers.
//!
//! Phase 1: HTTP provider + read-only queries.
//! Phase 2: wrapped in `RwLock` so `POST /api/network` can swap live.
//! Phase 3: optional `PrivateKeySigner` + pre-built `signing_provider`.
//! Phase 4: sticky `erc20_addr` so deploy → transfer/balance flows without
//!          having to copy-paste the contract address each call.
//! Phase 5: optional `ws_provider` (alloy pubsub) for the Transfer event
//!          stream. Best-effort — missing WS URL just disables /ws/*.

use std::sync::Arc;

use alloy::{
    network::EthereumWallet,
    primitives::Address,
    providers::{DynProvider, Provider, ProviderBuilder, WsConnect},
    signers::local::PrivateKeySigner,
};
use eyre::{Result, WrapErr};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum Network {
    Anvil,
    Sepolia,
}

impl Network {
    pub fn from_str_lossy(s: &str) -> Result<Self> {
        match s.to_ascii_lowercase().as_str() {
            "anvil" => Ok(Self::Anvil),
            "sepolia" => Ok(Self::Sepolia),
            other => Err(eyre::eyre!("unknown network={other} (expected anvil|sepolia)")),
        }
    }
}

pub struct AppStateInner {
    pub http_provider: DynProvider,
    /// WebSocket provider used only for pubsub (Phase 5 event stream).
    /// `None` when the network's WS URL isn't configured — the `/ws/*`
    /// routes return 503 in that case so the REST surface stays usable.
    pub ws_provider: Option<DynProvider>,
    pub signing_provider: Option<DynProvider>,
    pub signer_address: Option<Address>,
    pub chain_id: u64,
    pub network: Network,
    /// Last-deployed ERC-20 address, per network. Cleared on `switch_network`
    /// because a contract address is network-specific. A UI "Deploy" button
    /// refills this; subsequent transfer/balance calls use it by default.
    pub erc20_addr: Option<Address>,
}

#[derive(Clone)]
pub struct AppState {
    inner: Arc<RwLock<AppStateInner>>,
}

pub struct StateSnapshot {
    pub http_provider: DynProvider,
    pub ws_provider: Option<DynProvider>,
    pub signing_provider: Option<DynProvider>,
    pub signer_address: Option<Address>,
    pub chain_id: u64,
    pub network: Network,
    pub erc20_addr: Option<Address>,
}

impl AppState {
    pub async fn from_env() -> Result<Self> {
        let network_raw = std::env::var("NETWORK").unwrap_or_else(|_| "anvil".to_string());
        let network = Network::from_str_lossy(&network_raw)?;
        let inner = build_inner(network).await?;
        Ok(Self {
            inner: Arc::new(RwLock::new(inner)),
        })
    }

    pub async fn snapshot(&self) -> StateSnapshot {
        let g = self.inner.read().await;
        snapshot_inner(&g)
    }

    pub async fn switch_network(&self, target: Network) -> Result<StateSnapshot> {
        let fresh = build_inner(target).await?;
        let mut g = self.inner.write().await;
        *g = fresh;
        Ok(snapshot_inner(&g))
    }

    pub async fn remember_erc20(&self, addr: Address) {
        let mut g = self.inner.write().await;
        g.erc20_addr = Some(addr);
    }

    /// Replace the in-memory signer with a freshly-generated (or supplied)
    /// `PrivateKeySigner`. Used by the Phase 6 wallet demo so a key minted
    /// by alloy in the browser flow can be activated for server-side signing
    /// without restarting the process.
    ///
    /// We rebuild the `signing_provider` against the same network's HTTP URL
    /// — chain_id / network / erc20_addr stay put.
    pub async fn swap_signer(&self, signer: PrivateKeySigner) -> Result<Address> {
        // Resolve the same URL that build_inner used for this network.
        let g = self.inner.read().await;
        let network = g.network;
        drop(g); // don't hold the read lock across the await on the new connect
        let http_url = match network {
            Network::Anvil => std::env::var("ANVIL_HTTP_URL")
                .unwrap_or_else(|_| "http://127.0.0.1:8545".to_string()),
            Network::Sepolia => std::env::var("SEPOLIA_HTTP_URL")
                .wrap_err("SEPOLIA_HTTP_URL is required when NETWORK=sepolia")?,
        };

        let address = signer.address();
        let wallet = EthereumWallet::from(signer);
        let sp = ProviderBuilder::new()
            .wallet(wallet)
            .connect(&http_url)
            .await
            .wrap_err_with(|| format!("failed to build signing provider at {http_url}"))?
            .erased();

        let mut g = self.inner.write().await;
        g.signing_provider = Some(sp);
        g.signer_address = Some(address);
        tracing::info!(%address, "signer hot-swapped");
        Ok(address)
    }
}

fn snapshot_inner(g: &AppStateInner) -> StateSnapshot {
    StateSnapshot {
        http_provider: g.http_provider.clone(),
        ws_provider: g.ws_provider.clone(),
        signing_provider: g.signing_provider.clone(),
        signer_address: g.signer_address,
        chain_id: g.chain_id,
        network: g.network,
        erc20_addr: g.erc20_addr,
    }
}

async fn build_inner(network: Network) -> Result<AppStateInner> {
    let http_url = match network {
        Network::Anvil => std::env::var("ANVIL_HTTP_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8545".to_string()),
        Network::Sepolia => std::env::var("SEPOLIA_HTTP_URL")
            .wrap_err("SEPOLIA_HTTP_URL is required when NETWORK=sepolia")?,
    };
    let ws_url = match network {
        Network::Anvil => std::env::var("ANVIL_WS_URL").ok(),
        Network::Sepolia => std::env::var("SEPOLIA_WS_URL").ok(),
    };

    tracing::info!(?network, %http_url, ?ws_url, "building providers");

    let http_provider = ProviderBuilder::new()
        .connect(&http_url)
        .await
        .wrap_err_with(|| format!("failed to connect http provider at {http_url}"))?
        .erased();

    // WS is best-effort: the event-stream route falls back to 503 if this is
    // None. Don't fail startup just because pubsub is unavailable.
    let ws_provider = match &ws_url {
        Some(url) => match ProviderBuilder::new().connect_ws(WsConnect::new(url.clone())).await {
            Ok(p) => {
                tracing::info!(%url, "ws provider ready");
                Some(p.erased())
            }
            Err(e) => {
                tracing::warn!(%url, error = %e, "ws provider failed; /ws/* will return 503");
                None
            }
        },
        None => {
            tracing::info!("no *_WS_URL set — /ws/* will return 503");
            None
        }
    };

    let chain_id = http_provider
        .get_chain_id()
        .await
        .wrap_err("eth_chainId failed — is the RPC reachable?")?;

    let (signing_provider, signer_address) = match load_signer()? {
        Some(signer) => {
            let addr = signer.address();
            let wallet = EthereumWallet::from(signer);
            let sp = ProviderBuilder::new()
                .wallet(wallet)
                .connect(&http_url)
                .await
                .wrap_err_with(|| format!("failed to build signing provider at {http_url}"))?
                .erased();
            tracing::info!(address = %addr, "signing provider ready");
            (Some(sp), Some(addr))
        }
        None => {
            tracing::info!("no PRIVATE_KEY set — local-signing routes will 400");
            (None, None)
        }
    };

    tracing::info!(chain_id, "state built");

    Ok(AppStateInner {
        http_provider,
        ws_provider,
        signing_provider,
        signer_address,
        chain_id,
        network,
        erc20_addr: None,
    })
}

fn load_signer() -> Result<Option<PrivateKeySigner>> {
    match std::env::var("PRIVATE_KEY") {
        Ok(raw) if !raw.trim().is_empty() => {
            let s: PrivateKeySigner = raw
                .trim()
                .parse()
                .wrap_err("PRIVATE_KEY is set but could not be parsed as a hex secp256k1 key")?;
            Ok(Some(s))
        }
        _ => Ok(None),
    }
}
