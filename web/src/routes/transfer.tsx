import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { ethToWei, isHexAddress } from "@/lib/eth";
import {
  connect as connectWallet,
  ensureChain,
  getInjectedProvider,
  getWalletChainId,
  CHAIN_ID_BY_NETWORK,
} from "@/lib/metamask";
import { WalletBadge } from "@/components/WalletBadge";
import type { Hex } from "viem";

const ANVIL_RECIPIENT = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export function TransferPage() {
  const walletMode = useAppStore((s) => s.walletMode);
  const network = useAppStore((s) => s.network);
  const connectedAddress = useAppStore((s) => s.connectedAddress);
  const setConnectedAddress = useAppStore((s) => s.setConnectedAddress);
  const queryClient = useQueryClient();

  const [to, setTo] = useState(ANVIL_RECIPIENT);
  const [amountEth, setAmountEth] = useState("1");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const canonicalValidation = (): string | null => {
    if (!isHexAddress(to)) return "recipient is not a valid 0x-prefixed address";
    try {
      const wei = ethToWei(amountEth);
      if (wei <= 0n) return "amount must be > 0";
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  };

  const connect = useMutation({
    mutationFn: async () => connectWallet(network),
    onSuccess: (addr) => setConnectedAddress(addr),
  });

  const localSend = useMutation({
    mutationFn: async () => {
      const valueWei = ethToWei(amountEth).toString();
      return unwrap(
        await api.POST("/api/tx/eth/send-local", {
          body: { to: to as Hex, value_wei: valueWei },
        }),
      );
    },
    onSuccess: (r) => {
      setLastTxHash(r.tx_hash);
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const metamaskSend = useMutation({
    mutationFn: async () => {
      if (!connectedAddress) throw new Error("wallet not connected — click Connect first");

      // Make sure the wallet is on the chain the backend expects.
      const walletChain = await getWalletChainId();
      const expected = CHAIN_ID_BY_NETWORK[network];
      if (walletChain !== expected) {
        await ensureChain(network);
      }

      const valueWei = ethToWei(amountEth).toString();
      // 1. Ask backend for an unsigned EIP-1559 tx with nonce/gas/fees filled.
      const unsigned = unwrap(
        await api.POST("/api/tx/eth/build", {
          body: {
            from: connectedAddress as Hex,
            to: to as Hex,
            value_wei: valueWei,
          },
        }),
      );

      // 2. Hand the fully-populated tx to MetaMask via raw EIP-1193. MetaMask
      //    pops up, user approves, MetaMask broadcasts via its own RPC. We
      //    get the hash back. We use the raw provider (not viem's typed
      //    walletClient) because our fields are already hex strings from
      //    the backend — viem's strict Hex types would require casts on
      //    every field with no real safety gain.
      const eth = getInjectedProvider();
      const hash = await eth.request<string>({
        method: "eth_sendTransaction",
        params: [
          {
            from: unsigned.from,
            to: unsigned.to,
            value: unsigned.value,
            gas: unsigned.gas,
            maxFeePerGas: unsigned.max_fee_per_gas,
            maxPriorityFeePerGas: unsigned.max_priority_fee_per_gas,
            nonce: unsigned.nonce,
            type: unsigned.type,
          },
        ],
      });
      return { tx_hash: hash };
    },
    onSuccess: (r) => {
      setLastTxHash(r.tx_hash);
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  const sending = walletMode === "local" ? localSend : metamaskSend;
  const valErr = canonicalValidation();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (valErr) return;
    sending.mutate();
  };

  return (
    <div className="landing">
      <section className="card">
        <h2>transfer eth</h2>
        <div className="mode-row">
          <span className="mode-pill">mode: {walletMode}</span>
          <span className="mode-pill">network: {network}</span>
          {walletMode === "metamask" && (
            <div className="connect-row">
              {connectedAddress ? (
                <WalletBadge address={connectedAddress} />
              ) : (
                <button
                  className="btn"
                  type="button"
                  onClick={() => connect.mutate()}
                  disabled={connect.isPending}
                >
                  {connect.isPending ? "connecting…" : "Connect wallet"}
                </button>
              )}
              {connect.error ? (
                <span className="err small">{String(connect.error)}</span>
              ) : null}
            </div>
          )}
        </div>

        <form className="form" onSubmit={onSubmit}>
          <label className="addr-input">
            <span>recipient</span>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="addr-input">
            <span>amount (ETH)</span>
            <input
              type="text"
              value={amountEth}
              onChange={(e) => setAmountEth(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
            />
          </label>
          {valErr ? <p className="err small">{valErr}</p> : null}
          <button
            type="submit"
            className="btn primary"
            disabled={!!valErr || sending.isPending || (walletMode === "metamask" && !connectedAddress)}
          >
            {sending.isPending
              ? "sending…"
              : walletMode === "local"
                ? "Send (local signer)"
                : "Send (MetaMask)"}
          </button>
          {sending.error ? (
            <p className="err small">{String(sending.error)}</p>
          ) : null}
          {lastTxHash ? (
            <p className="ok small">
              tx: <span className="mono">{lastTxHash}</span>
            </p>
          ) : null}
        </form>
      </section>
    </div>
  );
}
