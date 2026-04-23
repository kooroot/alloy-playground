/**
 * "alloy can do wallets too" demo.
 *
 * The browser asks the Rust backend to generate keys / phrases via alloy's
 * `PrivateKeySigner::random()` and `MnemonicBuilder::<English>`, displays
 * the results, and (optionally) hot-swaps the live server-side signer to
 * the freshly minted key — letting subsequent /transfer + /erc20 calls
 * sign with the new identity without restarting the backend.
 *
 * **Demo-only.** Returning private keys and mnemonic phrases over HTTP is
 * a textbook security anti-pattern; that's documented in the backend
 * route module too.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";

type GeneratedWallet = {
  address: string;
  private_key: string;
  mnemonic: string | null;
};

export function WalletPage() {
  const queryClient = useQueryClient();
  const [generated, setGenerated] = useState<GeneratedWallet | null>(null);
  const [restorePhrase, setRestorePhrase] = useState("");
  const [restoreIndex, setRestoreIndex] = useState("0");

  const currentSigner = useQuery({
    queryKey: ["wallet-current"],
    queryFn: async () => unwrap(await api.GET("/api/wallet/current")),
    refetchInterval: 5_000,
  });

  const newRandom = useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/wallet/new")),
    onSuccess: (w) => setGenerated(w as GeneratedWallet),
  });

  const newMnemonic = useMutation({
    mutationFn: async () => unwrap(await api.POST("/api/wallet/new-mnemonic")),
    onSuccess: (w) => setGenerated(w as GeneratedWallet),
  });

  const fromMnemonic = useMutation({
    mutationFn: async () => {
      const idx = Number(restoreIndex);
      return unwrap(
        await api.POST("/api/wallet/from-mnemonic", {
          body: { phrase: restorePhrase.trim(), index: Number.isFinite(idx) ? idx : 0 },
        }),
      );
    },
    onSuccess: (w) => setGenerated(w as GeneratedWallet),
  });

  const activate = useMutation({
    mutationFn: async (private_key: string) =>
      unwrap(await api.POST("/api/wallet/use", { body: { private_key } })),
    onSuccess: () => {
      // Anything depending on signer identity needs to refetch.
      queryClient.invalidateQueries({ queryKey: ["wallet-current"] });
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  return (
    <div className="landing">
      <section className="card">
        <h2>active server signer</h2>
        {currentSigner.isLoading ? (
          <p className="dim small">loading…</p>
        ) : currentSigner.data?.address ? (
          <dl className="kv">
            <dt>address</dt>
            <dd className="mono">{currentSigner.data.address}</dd>
          </dl>
        ) : (
          <p className="dim small">
            no signer loaded. set <span className="mono">PRIVATE_KEY</span> in
            <span className="mono"> backend/.env</span>, or generate one below
            and click <em>Activate on server</em>.
          </p>
        )}
      </section>

      <section className="card">
        <h2>generate</h2>
        <p className="dim small">
          alloy mints these server-side via{" "}
          <span className="mono">PrivateKeySigner::random()</span> and{" "}
          <span className="mono">MnemonicBuilder::&lt;English&gt;</span>.
          MetaMask is <em>not</em> involved — this is the alloy-only path.
        </p>
        <div className="row">
          <button
            className="btn primary"
            type="button"
            onClick={() => newRandom.mutate()}
            disabled={newRandom.isPending}
          >
            {newRandom.isPending ? "generating…" : "Generate random key"}
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={() => newMnemonic.mutate()}
            disabled={newMnemonic.isPending}
          >
            {newMnemonic.isPending ? "generating…" : "Generate 12-word mnemonic"}
          </button>
        </div>
        {(newRandom.error || newMnemonic.error) && (
          <p className="err small">
            {String(newRandom.error ?? newMnemonic.error)}
          </p>
        )}
      </section>

      <section className="card">
        <h2>restore from mnemonic</h2>
        <label className="addr-input">
          <span>BIP-39 phrase (12 or 24 words)</span>
          <input
            value={restorePhrase}
            onChange={(e) => setRestorePhrase(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="test test test test test test test test test test test junk"
          />
        </label>
        <label className="addr-input">
          <span>account index (BIP-44, default 0)</span>
          <input
            value={restoreIndex}
            onChange={(e) => setRestoreIndex(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
          />
        </label>
        <button
          className="btn primary"
          type="button"
          onClick={() => fromMnemonic.mutate()}
          disabled={fromMnemonic.isPending || restorePhrase.trim().split(/\s+/).length < 12}
        >
          {fromMnemonic.isPending ? "deriving…" : "Restore"}
        </button>
        {fromMnemonic.error ? (
          <p className="err small">{String(fromMnemonic.error)}</p>
        ) : null}
      </section>

      {generated ? (
        <section className="card">
          <h2>generated wallet</h2>
          <dl className="kv">
            <dt>address</dt>
            <dd className="mono">{generated.address}</dd>
            <dt>private key</dt>
            <dd className="mono small">{generated.private_key}</dd>
            {generated.mnemonic ? (
              <>
                <dt>mnemonic</dt>
                <dd className="mono small">{generated.mnemonic}</dd>
              </>
            ) : null}
          </dl>
          <div className="row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn"
              onClick={() => navigator.clipboard.writeText(generated.private_key)}
            >
              Copy private key
            </button>
            {generated.mnemonic ? (
              <button
                type="button"
                className="btn"
                onClick={() => navigator.clipboard.writeText(generated.mnemonic!)}
              >
                Copy mnemonic
              </button>
            ) : null}
            <button
              type="button"
              className="btn primary"
              onClick={() => activate.mutate(generated.private_key)}
              disabled={activate.isPending}
              title="Replace the in-memory PrivateKeySigner used by /transfer (Local) and /erc20 (Local)."
            >
              {activate.isPending ? "activating…" : "Activate on server"}
            </button>
          </div>
          {activate.error ? (
            <p className="err small">{String(activate.error)}</p>
          ) : activate.data ? (
            <p className="ok small">
              server now signing as <span className="mono">{activate.data.address}</span>
            </p>
          ) : null}
          <p className="err small" style={{ marginTop: 12 }}>
            ⚠ demo-only. real apps must NEVER expose private keys or mnemonics
            over HTTP. this surface exists purely so you can see alloy mint a
            wallet end-to-end.
          </p>
        </section>
      ) : null}
    </div>
  );
}
