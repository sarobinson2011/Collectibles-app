// src/App.tsx

import { Routes, Route, NavLink, Link } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AllCollectiblesPage } from "./pages/AllCollectiblesPage";
import { MyCollectiblesPage } from "./pages/MyCollectiblesPage";
import { MarketplacePage } from "./pages/MarketplacePage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { CollectibleDetailsPage } from "./pages/CollectibleDetailsPage";
import { useWallet } from "./eth/wallet";
import { ADMIN_ADDRESS } from "./eth/config";

function Layout() {
  const { address, hasProvider, wrongNetwork } = useWallet();

  const isAdmin =
    !!address &&
    !!ADMIN_ADDRESS &&
    address.toLowerCase() === ADMIN_ADDRESS.toLowerCase();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link
            to="/"
            className="app-title"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            Collectibles Platform
          </Link>

          <nav className="app-nav">
            <NavLink to="/all" end>
              All
            </NavLink>
            <NavLink to="/mine">My Collectibles</NavLink>
            <NavLink to="/market">Marketplace</NavLink>
            <NavLink to="/account">Account</NavLink>
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
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
                <span className="wallet-address-strong">
                  {address.slice(0, 6)}…{address.slice(-4)}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          {/* New home / landing page */}
          <Route path="/" element={<HomePage />} />

          {/* Existing views */}
          <Route path="/all" element={<AllCollectiblesPage />} />
          <Route path="/mine" element={<MyCollectiblesPage />} />
          <Route path="/market" element={<MarketplacePage />} />
          <Route path="/account" element={<AccountPage />} />

          {/* Protected admin route */}
          <Route
            path="/admin"
            element={
              isAdmin ? (
                <AdminPage />
              ) : (
                <div
                  style={{
                    padding: "1rem",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "60vh",
                    textAlign: "center",
                  }}
                >
                  <h2 style={{ fontSize: "2rem", marginBottom: "1.5rem" }}>
                    Not authorised
                  </h2>
                  <p style={{ fontSize: "1.5rem", opacity: 0.7 }}>
                    Nothing to see here...
                  </p>
                </div>
              )
            }
          />

          {/* Collectible details by tokenId */}
          <Route path="/collectible/:tokenId" element={<CollectibleDetailsPage />} />
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
