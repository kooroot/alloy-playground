//! On-chain contract bindings.
//!
//! `sol!` with `#[sol(rpc)]` + a Foundry artifact path generates:
//!   - Strongly-typed call builders (`DemoToken::transferCall`, etc.)
//!   - The `Transfer(address, address, uint256)` event type + filter
//!   - `DemoToken::deploy(provider, name, symbol, initialSupply)` helper
//!     that submits a contract-creation tx and returns a bound instance
//!
//! The JSON path is tracked by cargo — re-run `cd backend/contracts &&
//! forge build` whenever `DemoToken.sol` changes, then `cargo build`
//! picks up the new bytecode automatically.

alloy::sol! {
    #[sol(rpc)]
    DemoToken,
    "contracts/out/DemoToken.sol/DemoToken.json"
}
