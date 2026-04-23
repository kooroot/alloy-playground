/**
 * Connected-state badge: "0x1234…abcd" pill + Disconnect button.
 *
 * Only relevant when `walletMode === "metamask"` AND we actually have a
 * `connectedAddress` — callers gate on that. Clicking Disconnect clears
 * our local connection state and also asks MetaMask to revoke the
 * `eth_accounts` permission so the next Connect genuinely re-prompts.
 */
import { useMutation } from "@tanstack/react-query";
import { disconnect as disconnectWallet } from "@/lib/metamask";
import { useAppStore } from "@/lib/store";

interface Props {
  address: string;
  /** Extra classes for the address pill — `small` on pages with tight headers. */
  pillClassName?: string;
}

export function WalletBadge({ address, pillClassName }: Props) {
  const setConnectedAddress = useAppStore((s) => s.setConnectedAddress);

  const disconnect = useMutation({
    mutationFn: async () => {
      // Revoke first so any error is attributable; then clear local state
      // regardless — the UI shouldn't get stuck "connected" if revocation
      // fails on exotic providers.
      await disconnectWallet();
    },
    onSettled: () => setConnectedAddress(null),
  });

  return (
    <>
      <span className={pillClassName ?? "mode-pill mono small"}>{address}</span>
      <button
        type="button"
        className="btn"
        onClick={() => disconnect.mutate()}
        disabled={disconnect.isPending}
        title="Clear local session and revoke MetaMask site permission"
      >
        {disconnect.isPending ? "disconnecting…" : "Disconnect"}
      </button>
    </>
  );
}
