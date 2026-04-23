//! serde adapters. Ethereum values are 256-bit and don't fit in JS numbers —
//! always serialize as decimal strings so the browser can hand them straight
//! to viem / BigInt without precision loss.

pub mod u256_as_string {
    use alloy::primitives::U256;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S: Serializer>(value: &U256, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&value.to_string())
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<U256, D::Error> {
        let s = <String as serde::Deserialize>::deserialize(d)?;
        s.parse::<U256>().map_err(serde::de::Error::custom)
    }
}
