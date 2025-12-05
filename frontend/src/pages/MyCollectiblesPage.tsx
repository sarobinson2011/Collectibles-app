// src/pages/MyCollectiblesPage.tsx

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOwnerCollectibles } from "../hooks/useCollectibles";
import { fetchListings } from "../api";
import type { Collectible, Listing } from "../api";
import { useWallet } from "../eth/wallet";
import { NFT_ADDRESS } from "../eth/config";

function shortenAddress(addr?: string, chars = 4) {
    if (!addr) return "";
    const prefix = addr.slice(0, 2 + chars);
    const suffix = addr.slice(-chars);
    return `${prefix}…${suffix}`;
}

export function MyCollectiblesPage() {
    const { address, hasProvider } = useWallet();
    const owner = address ?? null;
    const { status, data, error } = useOwnerCollectibles(owner);

    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});

    function keyForCollectible(c: Collectible): string {
        const tokenPart = c.tokenId ?? "";
        return `${NFT_ADDRESS.toLowerCase()}:${tokenPart}`;
    }

    useEffect(() => {
        let cancelled = false;

        async function loadListings() {
            try {
                const listings: Listing[] = await fetchListings();
                if (cancelled) return;

                const map: Record<string, boolean> = {};
                for (const l of listings) {
                    if (!l.active) continue;
                    const k = `${l.nft.toLowerCase()}:${l.tokenId}`;
                    map[k] = true;
                }
                setListedMap(map);
            } catch (err) {
                // just log for now; UI still works without "listed" info
                console.error("failed to load listings", err);
            }
        }

        void loadListings();
        const interval = setInterval(loadListings, 20_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return (
        <div>
            <h2>My Collectibles</h2>
            <p>Shows collectibles indexed for your connected wallet.</p>

            {!hasProvider && (
                <p style={{ color: "#f97373" }}>
                    No wallet detected. Install MetaMask or another injected wallet.
                </p>
            )}

            {hasProvider && !address && (
                <p>Connect your wallet to see your collectibles.</p>
            )}

            {address && (
                <p>
                    Connected as <strong>{shortenAddress(address, 6)}</strong>
                </p>
            )}

            {address && status === "loading" && data.length === 0 && (
                <p>Loading collectibles…</p>
            )}

            {status === "error" && (
                <p style={{ color: "red" }}>
                    Failed to load collectibles: {error}
                </p>
            )}

            {address && data.length === 0 && status === "success" && (
                <p>No collectibles found for this address.</p>
            )}

            {data.length > 0 && (
                <div className="table-wrapper">
                    <table className="listing-table">
                        <thead>
                            <tr>
                                <th>Token ID</th>
                                <th>RFID</th>
                                <th>RFID Hash</th>
                                <th>Authenticity Hash</th>
                                <th>Burned</th>
                                <th>Redeemed</th>
                                <th>Listed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((c) => {
                                const key = keyForCollectible(c);
                                const isListed = listedMap[key] === true;

                                return (
                                    <tr key={`${c.rfidHash}-${c.tokenId ?? "na"}`}>
                                        <td>
                                            {c.tokenId ? (
                                                <Link to={`/collectible/${c.tokenId}`}>
                                                    {c.tokenId}
                                                </Link>
                                            ) : (
                                                "?"
                                            )}
                                        </td>
                                        <td>{c.rfid ?? "—"}</td>
                                        <td title={c.rfidHash}>{c.rfidHash}</td>
                                        <td title={c.authenticityHash}>
                                            {c.authenticityHash}
                                        </td>
                                        <td>{c.burned ? "Yes" : "No"}</td>
                                        <td>{c.redeemed ? "Yes" : "No"}</td>
                                        <td>{isListed ? "Yes" : "No"}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
