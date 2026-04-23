/**
 * ETH ↔ wei conversion using BigInt. Keeps precision on 256-bit values.
 */
const WEI_PER_ETH = 10n ** 18n;

export function ethToWei(ethStr: string): bigint {
  const s = ethStr.trim();
  if (!s) throw new Error("amount is empty");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal number: ${s}`);
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = wholeRaw === "" ? "0" : wholeRaw;
  if (fracRaw.length > 18) throw new Error("too many decimals (max 18)");
  const frac = fracRaw.padEnd(18, "0");
  return BigInt(whole) * WEI_PER_ETH + BigInt(frac);
}

export function isHexAddress(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}
