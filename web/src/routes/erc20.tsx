/**
 * ERC-20 demo page.
 *
 * Covers:
 *   - Deploy (server-signed only — the MetaMask UX for deploy is clumsy and
 *     out-of-scope for a prototype)
 *   - Transfer  (both signing modes, same branching as /transfer for ETH)
 *   - balanceOf query for arbitrary (token, holder) pairs
 *
 * The backend remembers the last-deployed address in AppState so you don't
 * have to round-trip the address through the UI — leave the `token` field
 * empty and it uses the last deploy.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function Erc20Page() {
  const walletMode = useAppStore((s) => s.walletMode);
  const network = useAppStore((s) => s.network);
  const connectedAddress = useAppStore((s) => s.connectedAddress);
  const setConnectedAddress = useAppStore((s) => s.setConnectedAddress);
  const queryClient = useQueryClient();

  const [tokenName, setTokenName] = useState("DemoToken");
  const [tokenSymbol, setTokenSymbol] = useState("DEMO");
  const [initialSupplyTokens, setInitialSupplyTokens] = useState("1000000");

  const [tokenAddr, setTokenAddr] = useState("");
  const [recipient, setRecipient] = useState(ANVIL_RECIPIENT);
  const [amountTokens, setAmountTokens] = useState("100");

  const [holder, setHolder] = useState("");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const connect = useMutation({
    mutationFn: async () => connectWallet(network),
    onSuccess: (addr) => setConnectedAddress(addr),
  });

  const deploy = useMutation({
    mutationFn: async () => {
      const initial_supply = ethToWei(initialSupplyTokens).toString(); // 18-decimal
      return unwrap(
        await api.POST("/api/erc20/deploy", {
          body: { name: tokenName, symbol: tokenSymbol, initial_supply },
        }),
      );
    },
    onSuccess: (r) => {
      setTokenAddr(r.address);
      setLastTxHash(r.tx_hash);
    },
  });

  const transferLocal = useMutation({
    mutationFn: async () => {
      const amount = ethToWei(amountTokens).toString();
      return unwrap(
        await api.POST("/api/erc20/transfer/send-local", {
          body: {
            // Empty string → omit → backend falls back to last-deployed.
            token: tokenAddr ? (tokenAddr as Hex) : undefined,
            to: recipient as Hex,
            amount,
          },
        }),
      );
    },
    onSuccess: (r) => setLastTxHash(r.tx_hash),
  });

  const transferMetaMask = useMutation({
    mutationFn: async () => {
      if (!connectedAddress) throw new Error("Connect MetaMask first");
      const walletChain = await getWalletChainId();
      if (walletChain !== CHAIN_ID_BY_NETWORK[network]) await ensureChain(network);

      const amount = ethToWei(amountTokens).toString();
      const unsigned = unwrap(
        await api.POST("/api/erc20/transfer/build", {
          body: {
            token: tokenAddr ? (tokenAddr as Hex) : undefined,
            from: connectedAddress as Hex,
            to: recipient as Hex,
            amount,
          },
        }),
      );
      // Raw EIP-1193 — all fields are already hex strings from the backend,
      // so viem's strict Hex types would just add casts with no safety gain.
      const eth = getInjectedProvider();
      const hash = await eth.request<string>({
        method: "eth_sendTransaction",
        params: [{
          from: unsigned.from,
          to: unsigned.to,
          data: unsigned.data,
          value: unsigned.value,
          gas: unsigned.gas,
          maxFeePerGas: unsigned.max_fee_per_gas,
          maxPriorityFeePerGas: unsigned.max_priority_fee_per_gas,
          nonce: unsigned.nonce,
          type: unsigned.type,
        }],
      });
      return { tx_hash: hash };
    },
    onSuccess: (r) => setLastTxHash(r.tx_hash),
  });

  const transfer = walletMode === "local" ? transferLocal : transferMetaMask;

  const balanceQuery = useQuery({
    queryKey: ["erc20-balance", tokenAddr, holder, lastTxHash],
    enabled: isHexAddress(holder) && (tokenAddr === "" || isHexAddress(tokenAddr)),
    queryFn: async () =>
      unwrap(
        await api.GET("/api/erc20/balance/{holder}", {
          params: {
            path: { holder },
            query: tokenAddr ? { token: tokenAddr } : {},
          },
        }),
      ),
  });

  const onDeploy = (e: React.FormEvent) => { e.preventDefault(); deploy.mutate(); };
  const onTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHexAddress(recipient)) return;
    transfer.mutate();
    queryClient.invalidateQueries({ queryKey: ["erc20-balance"] });
  };

  const needMmConnect = walletMode === "metamask" && !connectedAddress;

  return (
    <div className="landing">
      <section className="card">
        <h2>deploy</h2>
        <p className="dim small">
          deploy is server-signed only. switch wallet to “Local” for this flow.
        </p>
        <form className="form" onSubmit={onDeploy}>
          <div className="row">
            <label className="addr-input"><span>name</span>
              <input value={tokenName} onChange={(e) => setTokenName(e.target.value)} />
            </label>
            <label className="addr-input"><span>symbol</span>
              <input value={tokenSymbol} onChange={(e) => setTokenSymbol(e.target.value)} />
            </label>
            <label className="addr-input"><span>initial supply (tokens)</span>
              <input value={initialSupplyTokens} onChange={(e) => setInitialSupplyTokens(e.target.value)} inputMode="decimal" />
            </label>
          </div>
          <button className="btn primary" type="submit" disabled={deploy.isPending || walletMode !== "local"}>
            {deploy.isPending ? "deploying…" : "Deploy DemoToken"}
          </button>
          {deploy.error ? <p className="err small">{String(deploy.error)}</p> : null}
          {deploy.data ? (
            <p className="ok small">
              deployed @ <span className="mono">{deploy.data.address}</span>
            </p>
          ) : null}
        </form>
      </section>

      <section className="card">
        <h2>transfer</h2>
        <div className="mode-row">
          <span className="mode-pill">mode: {walletMode}</span>
          {walletMode === "metamask" && (
            <div className="connect-row">
              {connectedAddress ? (
                <WalletBadge address={connectedAddress} />
              ) : (
                <button className="btn" type="button" onClick={() => connect.mutate()} disabled={connect.isPending}>
                  {connect.isPending ? "connecting…" : "Connect wallet"}
                </button>
              )}
            </div>
          )}
        </div>
        <form className="form" onSubmit={onTransfer}>
          <label className="addr-input">
            <span>token (leave blank to use last-deployed)</span>
            <input value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value.trim())} spellCheck={false} />
          </label>
          <label className="addr-input">
            <span>recipient</span>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} spellCheck={false} />
          </label>
          <label className="addr-input">
            <span>amount (tokens, 18-decimal scaled)</span>
            <input value={amountTokens} onChange={(e) => setAmountTokens(e.target.value)} inputMode="decimal" />
          </label>
          <button
            className="btn primary"
            type="submit"
            disabled={transfer.isPending || needMmConnect || !isHexAddress(recipient)}
          >
            {transfer.isPending ? "sending…" : walletMode === "local" ? "Transfer (local signer)" : "Transfer (MetaMask)"}
          </button>
          {transfer.error ? <p className="err small">{String(transfer.error)}</p> : null}
          {lastTxHash ? <p className="ok small">tx: <span className="mono">{lastTxHash}</span></p> : null}
        </form>
      </section>

      <section className="card">
        <h2>balanceOf</h2>
        <label className="addr-input">
          <span>holder address</span>
          <input value={holder} onChange={(e) => setHolder(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
        </label>
        {balanceQuery.isError ? (
          <p className="err small">{String(balanceQuery.error)}</p>
        ) : balanceQuery.data ? (
          <dl className="kv">
            <dt>token</dt>
            <dd className="mono">{balanceQuery.data.token}</dd>
            <dt>holder</dt>
            <dd className="mono">{balanceQuery.data.holder}</dd>
            <dt>balance</dt>
            <dd>
              {displayTokenBalance(balanceQuery.data.balance)} DEMO{" "}
              <span className="dim">({balanceQuery.data.balance} raw)</span>
            </dd>
          </dl>
        ) : isHexAddress(holder) ? (
          <p className="dim small">loading…</p>
        ) : (
          <p className="dim small">enter a 0x-address above to query.</p>
        )}
      </section>
    </div>
  );
}

function displayTokenBalance(raw: string): string {
  try {
    const n = BigInt(raw);
    const ONE = 10n ** 18n;
    const whole = n / ONE;
    const frac = n % ONE;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").slice(0, 4);
    const trimmed = fracStr.replace(/0+$/, "");
    return trimmed ? `${whole}.${trimmed}` : whole.toString();
  } catch {
    return raw;
  }
}
