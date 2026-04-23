/**
 * Global UI state: network + wallet mode + the address the landing page
 * is currently inspecting. Persisted to `localStorage` so a page reload
 * keeps the toggles — matches Phase 2 exit criteria.
 *
 * Note: `network` here is the UI's intent. The authoritative network lives
 * on the backend; the toggle handler must POST /api/network to swap server
 * state and invalidate any TanStack queries that depend on chain state.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Network = "anvil" | "sepolia";
export type WalletMode = "local" | "metamask";

interface AppState {
  network: Network;
  walletMode: WalletMode;
  inspectedAddress: string;
  connectedAddress: string | null; // set after MetaMask connect (Phase 3)
  setNetwork: (n: Network) => void;
  setWalletMode: (m: WalletMode) => void;
  setInspectedAddress: (a: string) => void;
  setConnectedAddress: (a: string | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      network: "anvil",
      walletMode: "local",
      inspectedAddress: "",
      connectedAddress: null,
      setNetwork: (network) => set({ network }),
      setWalletMode: (walletMode) => set({ walletMode }),
      setInspectedAddress: (inspectedAddress) => set({ inspectedAddress }),
      setConnectedAddress: (connectedAddress) => set({ connectedAddress }),
    }),
    {
      name: "alloy-prototype-ui",
      // Don't persist the live MetaMask connection — always reconnect on reload.
      partialize: (s) => ({
        network: s.network,
        walletMode: s.walletMode,
        inspectedAddress: s.inspectedAddress,
      }),
    },
  ),
);
