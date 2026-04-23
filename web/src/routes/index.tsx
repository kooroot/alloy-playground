import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api, unwrap } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { formatWeiAsEth } from "@/lib/format";
import { AddressInput } from "@/components/AddressInput";
import { WalletBadge } from "@/components/WalletBadge";
import { connect as connectWallet } from "@/lib/metamask";

const ANVIL_DEFAULT_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

export function LandingPage() {
  const inspectedAddress = useAppStore((s) => s.inspectedAddress);
  const setInspectedAddress = useAppStore((s) => s.setInspectedAddress);
  const walletMode = useAppStore((s) => s.walletMode);
  const network = useAppStore((s) => s.network);
  const connectedAddress = useAppStore((s) => s.connectedAddress);
  const setConnectedAddress = useAppStore((s) => s.setConnectedAddress);
  const address = inspectedAddress || ANVIL_DEFAULT_ADDR;

  const connect = useMutation({
    mutationFn: async () => connectWallet(network),
    onSuccess: (addr) => setConnectedAddress(addr),
  });

  const networkQuery = useQuery({
    queryKey: ["network"],
    queryFn: async () => unwrap(await api.GET("/api/network")),
    refetchInterval: 5_000, // keep `latest_block` updating
  });

  const accountQuery = useQuery({
    queryKey: ["account", address, networkQuery.data?.chain_id],
    queryFn: async () =>
      unwrap(
        await api.GET("/api/account/{addr}", { params: { path: { addr: address } } }),
      ),
    enabled: !!address,
  });

  return (
    <div className="landing">
      {walletMode === "metamask" && (
        <section className="card">
          <h2>wallet</h2>
          {connectedAddress ? (
            <div className="mode-row">
              <span className="mode-pill ok">connected</span>
              <WalletBadge address={connectedAddress} />
              <span className="dim small">
                send transactions from{" "}
                <Link to="/transfer" className="navlink">/transfer</Link> or{" "}
                <Link to="/erc20" className="navlink">/erc20</Link>.
              </span>
            </div>
          ) : (
            <div className="mode-row">
              <span className="mode-pill">not connected</span>
              <button
                type="button"
                className="btn primary"
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
              >
                {connect.isPending ? "waiting for MetaMask…" : "Connect MetaMask"}
              </button>
              {connect.error ? (
                <span className="err small">{String(connect.error)}</span>
              ) : null}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2>network</h2>
        {networkQuery.isLoading ? (
          <p>loading…</p>
        ) : networkQuery.error ? (
          <p className="err">{String(networkQuery.error)}</p>
        ) : networkQuery.data ? (
          <dl className="kv">
            <dt>network</dt><dd>{networkQuery.data.network}</dd>
            <dt>chainId</dt><dd>{networkQuery.data.chain_id}</dd>
            <dt>latest block</dt><dd>{networkQuery.data.latest_block}</dd>
          </dl>
        ) : null}
      </section>

      <section className="card">
        <h2>account</h2>
        <AddressInput
          value={inspectedAddress}
          onChange={setInspectedAddress}
          placeholder={ANVIL_DEFAULT_ADDR}
        />
        {accountQuery.isLoading ? (
          <p>loading…</p>
        ) : accountQuery.error ? (
          <p className="err">{String(accountQuery.error)}</p>
        ) : accountQuery.data ? (
          <dl className="kv">
            <dt>address</dt><dd className="mono">{accountQuery.data.address}</dd>
            <dt>balance</dt>
            <dd>
              {formatWeiAsEth(accountQuery.data.balance_wei)} ETH{" "}
              <span className="dim">({accountQuery.data.balance_wei} wei)</span>
            </dd>
            <dt>nonce</dt><dd>{accountQuery.data.nonce}</dd>
          </dl>
        ) : null}
      </section>
    </div>
  );
}
