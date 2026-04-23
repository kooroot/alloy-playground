import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap } from "@/lib/api";
import { useAppStore, type Network, type WalletMode } from "@/lib/store";

/**
 * Top-of-page toggle bar. Network changes POST to `/api/network` and
 * invalidate any query that depends on chain state. Wallet mode is
 * UI-only in Phase 2 — Phase 3 wires it to the real viem walletClient.
 */
export function NetworkWalletToggles() {
  const network = useAppStore((s) => s.network);
  const setNetwork = useAppStore((s) => s.setNetwork);
  const walletMode = useAppStore((s) => s.walletMode);
  const setWalletMode = useAppStore((s) => s.setWalletMode);

  const queryClient = useQueryClient();

  const switchNetwork = useMutation({
    mutationFn: async (target: Network) => unwrap(
      await api.POST("/api/network", { body: { network: target } }),
    ),
    onSuccess: (_, target) => {
      setNetwork(target);
      queryClient.invalidateQueries({ queryKey: ["network"] });
      queryClient.invalidateQueries({ queryKey: ["account"] });
    },
  });

  return (
    <div className="toggles">
      <SegToggle<Network>
        label="network"
        value={network}
        options={[
          { value: "anvil", label: "Anvil" },
          { value: "sepolia", label: "Sepolia" },
        ]}
        onChange={(v) => switchNetwork.mutate(v)}
        disabled={switchNetwork.isPending}
      />
      <SegToggle<WalletMode>
        label="wallet"
        value={walletMode}
        options={[
          { value: "local", label: "Local" },
          { value: "metamask", label: "MetaMask" },
        ]}
        onChange={setWalletMode}
      />
      {switchNetwork.error ? (
        <span className="err small">
          switch failed: {String(switchNetwork.error)}
        </span>
      ) : null}
    </div>
  );
}

interface SegToggleProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}

function SegToggle<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: SegToggleProps<T>) {
  return (
    <div className="seg">
      <span className="seg-label">{label}</span>
      <div className="seg-btns" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "seg-btn on" : "seg-btn"}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
