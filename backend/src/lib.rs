//! Library facade for the alloy-prototype backend.
//!
//! `main.rs` is the production entry point. This `lib.rs` re-exports the
//! same modules so integration tests under `tests/` can build the axum
//! `Router` against an in-process `AppState` without going through a
//! child-process binary.

pub mod contracts;
pub mod error;
pub mod openapi;
pub mod routes;
pub mod serde_helpers;
pub mod state;
