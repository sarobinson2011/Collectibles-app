// src/App.tsx

import { Routes, Route, NavLink } from "react-router-dom";
import { AllCollectiblesPage } from "./pages/AllCollectiblesPage";
import { MyCollectiblesPage } from "./pages/MyCollectiblesPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { useWallet } from "./eth/wallet";

function Layout() {
  const { address, hasProvider, wrongNetwork } = useWallet();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title">Collectibles Platform</div>

          <nav className="app-nav">
            <NavLink to="/" end>
              All
            </NavLink>
            <NavLink to="/mine">My Collectibles</NavLink>
            <NavLink to="/market">Marketplace</NavLink>
            <NavLink to="/account">Account</NavLink>
            <NavLink to="/admin">Admin</NavLink>
          </nav>

          <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
            {!hasProvider && "No wallet detected"}
            {hasProvider && !address && "Wallet not connected"}
            {hasProvider && address && (
              <>
                {wrongNetwork && (
                  <span style={{ color: "#f97373", marginRight: "0.5rem" }}>
                    Wrong network
                  </span>
                )}
                <span>
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<AllCollectiblesPage />} />
          <Route path="/mine" element={<MyCollectiblesPage />} />
          <Route path="/market" element={<MarketplacePage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>

      <footer className="app-footer">
        Indexed from Arbitrum Sepolia · Local backend at http://localhost:8080
      </footer>
    </div>
  );
}

export default function App() {
  // Router + WalletProvider are already wrapped in main.tsx
  return <Layout />;
}
