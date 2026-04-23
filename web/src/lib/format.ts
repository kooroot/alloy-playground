/**
 * wei string → human-readable ETH string. Uses `BigInt` so 256-bit
 * values from the backend (serialized as decimal strings) never lose
 * precision.
 */
export function formatWeiAsEth(weiStr: string, fractionDigits = 4): string {
  let wei: bigint;
  try {
    wei = BigInt(weiStr);
  } catch {
    return weiStr;
  }
  const ONE_ETH = 10n ** 18n;
  const whole = wei / ONE_ETH;
  const remainder = wei % ONE_ETH;
  if (remainder === 0n) return whole.toString();
  const remainderStr = remainder.toString().padStart(18, "0").slice(0, fractionDigits);
  return `${whole}.${remainderStr}`.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
}
