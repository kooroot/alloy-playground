//! WebSocket Transfer event stream for the current DemoToken.
//!
//! Flow:
//!   1. Client opens `/ws/erc20/transfers?token=0x…` (token optional — falls
//!      back to last-deployed from AppState).
//!   2. Backend builds an alloy `Filter` keyed on the token address + the
//!      `Transfer(address,address,uint256)` signature and calls
//!      `subscribe_logs` on the WS provider.
//!   3. Each incoming log is ABI-decoded, projected onto a small JSON shape,
//!      and forwarded to the client as a `Text` frame.
//!   4. On client close / network error we drop the subscription (alloy
//!      tears down the upstream `eth_subscribe` automatically via `Drop`).
//!
//! If the WS provider is missing (no `*_WS_URL`), we upgrade the socket
//! just long enough to send one error frame and close — easier for the
//! frontend to surface than a 503 HTTP, since the upgrade already succeeded.

use alloy::{
    primitives::Address,
    providers::Provider,
    rpc::types::{BlockNumberOrTag, Filter},
    sol_types::SolEvent,
};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Query, State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};

use crate::{contracts::DemoToken, state::AppState};

pub fn router() -> Router<AppState> {
    Router::new().route("/ws/erc20/transfers", get(ws_transfers))
}

#[derive(Deserialize)]
pub struct TokenQuery {
    pub token: Option<Address>,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum OutFrame {
    /// Sent once at connection start with the resolved subscription parameters.
    Hello {
        token: String,
        chain_id: u64,
    },
    /// One Transfer event.
    Transfer {
        from: String,
        to: String,
        /// Decimal string — JS `number` can't hold a full uint256.
        value: String,
        block_number: Option<u64>,
        tx_hash: Option<String>,
        log_index: Option<u64>,
    },
    /// Non-fatal notice (e.g. decode error on an unrelated log).
    Warn { message: String },
    /// Fatal — the server will close the socket immediately after sending this.
    Error { message: String },
}

pub async fn ws_transfers(
    State(state): State<AppState>,
    Query(q): Query<TokenQuery>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state, q.token))
}

async fn handle_socket(socket: WebSocket, state: AppState, token_q: Option<Address>) {
    let (mut sink, mut client_rx) = socket.split();
    let snap = state.snapshot().await;

    // Resolve token: explicit query beats sticky state.
    let token = match token_q.or(snap.erc20_addr) {
        Some(a) => a,
        None => {
            let _ = send(
                &mut sink,
                &OutFrame::Error {
                    message: "no token: pass ?token=0x… or deploy one first".into(),
                },
            )
            .await;
            return;
        }
    };

    // Bail if ws provider isn't available.
    let ws_provider = match snap.ws_provider {
        Some(p) => p,
        None => {
            let _ = send(
                &mut sink,
                &OutFrame::Error {
                    message: "ws provider unavailable (set ANVIL_WS_URL / SEPOLIA_WS_URL)".into(),
                },
            )
            .await;
            return;
        }
    };

    // Greet the client so it can confirm the server picked the right token.
    if send(
        &mut sink,
        &OutFrame::Hello {
            token: format!("{:#x}", token),
            chain_id: snap.chain_id,
        },
    )
    .await
    .is_err()
    {
        return;
    }

    let filter = Filter::new()
        .address(token)
        .event_signature(DemoToken::Transfer::SIGNATURE_HASH)
        .from_block(BlockNumberOrTag::Latest);

    let sub = match ws_provider.subscribe_logs(&filter).await {
        Ok(s) => s,
        Err(e) => {
            let _ = send(
                &mut sink,
                &OutFrame::Error {
                    message: format!("subscribe_logs failed: {e}"),
                },
            )
            .await;
            return;
        }
    };
    let mut log_stream = sub.into_stream();

    tracing::info!(%token, "ws transfer stream opened");

    loop {
        tokio::select! {
            // Upstream: new event log.
            maybe_log = log_stream.next() => {
                let Some(log) = maybe_log else {
                    // Upstream closed; nothing more to send.
                    break;
                };
                match DemoToken::Transfer::decode_log_data(log.data()) {
                    Ok(ev) => {
                        let frame = OutFrame::Transfer {
                            from: format!("{:#x}", ev.from),
                            to: format!("{:#x}", ev.to),
                            value: ev.value.to_string(),
                            block_number: log.block_number,
                            tx_hash: log.transaction_hash.map(|h| format!("{:#x}", h)),
                            log_index: log.log_index,
                        };
                        if send(&mut sink, &frame).await.is_err() { break; }
                    }
                    Err(e) => {
                        let warn = OutFrame::Warn { message: format!("decode failed: {e}") };
                        if send(&mut sink, &warn).await.is_err() { break; }
                    }
                }
            }
            // Downstream: client message (we only care about close).
            maybe_msg = client_rx.next() => {
                match maybe_msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        tracing::debug!(error=%e, "ws client recv error");
                        break;
                    }
                    // Pongs, text pings etc. — ignore.
                    _ => {}
                }
            }
        }
    }

    tracing::info!(%token, "ws transfer stream closed");
}

async fn send<S>(sink: &mut S, frame: &OutFrame) -> Result<(), axum::Error>
where
    S: SinkExt<Message, Error = axum::Error> + Unpin,
{
    let payload = serde_json::to_string(frame)
        .unwrap_or_else(|e| format!("{{\"kind\":\"error\",\"message\":\"serialize: {e}\"}}"));
    sink.send(Message::Text(payload.into())).await
}
