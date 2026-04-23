/**
 * MetaMask / EIP-1193 integration via viem.
 *
 * viem lives ONLY in the browser and ONLY as a wallet adapter. All chain
 * reads (balance, nonce, block number, events) and all broadcasts still go
 * through the Rust `alloy` backend. The signing is the single thing that
 * genuinely has to happen in the user's wallet, and viem makes that
 * type-safe.
 */
import {
  createWalletClient,
  custom,
  defineChain,
  type Hex,
  type WalletClient,
} from "viem";
import { anvil, sepolia } from "viem/chains";
import type { Network } from "./store";

export const CHAINS = {
  anvil: anvil,
  sepolia: sepolia,
} as const;

export const CHAIN_ID_BY_NETWORK: Record<Network, number> = {
  anvil: anvil.id,      // 31337
  sepolia: sepolia.id,  // 11155111
};

// In case viem's preset drifts, define anvil explicitly as a fallback.
export const anvilFallback = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

export interface Ethereum extends EventEmitterLike {
  request<T = unknown>(args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<T>;
  isMetaMask?: boolean;
  selectedAddress?: string | null;
}

interface EventEmitterLike {
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Ethereum;
  }
}

export function getInjectedProvider(): Ethereum {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  if (!eth) {
    throw new Error(
      "No EIP-1193 provider found. Install MetaMask and reload the page.",
    );
  }
  return eth;
}

/**
 * Build a viem walletClient bound to the injected provider, typed to the
 * chain currently selected in the UI toggle. The backend is still the
 * source of truth for chain state — this client only signs.
 */
export function buildWalletClient(network: Network): WalletClient {
  const eth = getInjectedProvider();
  return createWalletClient({
    chain: CHAINS[network],
    transport: custom(eth),
  });
}

/**
 * Prompt the user to connect (if not already) and return their address.
 */
export async function connect(network: Network): Promise<Hex> {
  const client = buildWalletClient(network);
  const [addr] = await client.requestAddresses();
  if (!addr) throw new Error("user dismissed the MetaMask connect prompt");
  return addr;
}

/**
 * Best-effort dApp-side disconnect.
 *
 * EIP-1193 has no "logout" — the wallet owns the session. We do two things:
 *   1. Ask MetaMask to revoke the `eth_accounts` permission via EIP-2255
 *      (`wallet_revokePermissions`). This makes the NEXT `connect()` call
 *      actually re-prompt the user, which is what most people expect.
 *   2. Swallow the error if the provider doesn't implement revocation —
 *      some injected wallets + older MetaMask builds don't. The caller is
 *      still responsible for clearing local state (`setConnectedAddress(null)`).
 */
export async function disconnect(): Promise<void> {
  try {
    const eth = getInjectedProvider();
    await eth.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
  } catch {
    // Revocation isn't universally supported; local-state clear is the
    // primary effect and happens in the UI layer regardless.
  }
}

/**
 * Compare the wallet's current chainId against the UI toggle. MetaMask
 * won't auto-switch — the caller shows a warning and offers a "switch
 * chain" button that calls `wallet_switchEthereumChain`.
 */
export async function getWalletChainId(): Promise<number> {
  const eth = getInjectedProvider();
  const raw = await eth.request<string>({ method: "eth_chainId" });
  return parseInt(raw, 16);
}

/**
 * Ask MetaMask to switch to the target chain. If the chain isn't known
 * to MetaMask (typically anvil on first use) the error code 4902 fires;
 * we catch it and call `wallet_addEthereumChain` with local anvil params.
 */
export async function ensureChain(network: Network): Promise<void> {
  const eth = getInjectedProvider();
  const target = CHAIN_ID_BY_NETWORK[network];
  const hex = `0x${target.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902 && network === "anvil") {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: "Anvil (local)",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: ["http://127.0.0.1:8545"],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}
