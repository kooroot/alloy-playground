import { Link, Outlet } from "@tanstack/react-router";
import { NetworkWalletToggles } from "@/components/NetworkWalletToggles";

export function RootLayout() {
  return (
    <div className="app-shell">
      <header>
        <h1>alloy-prototype</h1>
        <nav className="navlinks">
          <Link to="/" className="navlink" activeProps={{ className: "navlink on" }} activeOptions={{ exact: true }}>
            Overview
          </Link>
          <Link to="/transfer" className="navlink" activeProps={{ className: "navlink on" }}>
            Transfer
          </Link>
          <Link to="/erc20" className="navlink" activeProps={{ className: "navlink on" }}>
            ERC-20
          </Link>
          <Link to="/events" className="navlink" activeProps={{ className: "navlink on" }}>
            Events
          </Link>
          <Link to="/wallet" className="navlink" activeProps={{ className: "navlink on" }}>
            Wallet
          </Link>
        </nav>
        <NetworkWalletToggles />
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
