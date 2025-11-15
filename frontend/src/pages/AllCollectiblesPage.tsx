// src/pages/AllCollectiblesPage.tsx

import { useEffect, useState } from "react";
import { fetchCollectibles, fetchListings, type Collectible, type Listing } from "../api";
import { NFT_ADDRESS } from "../eth/config";

type Status = "idle" | "loading" | "success" | "error";

type CollectiblesState = {
    status: Status;
    data: Collectible[];
    error: string | null;
};

export function AllCollectiblesPage() {
    const [state, setState] = useState<CollectiblesState>({
        status: "idle",
        data: [],
        error: null,
    });

    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});

    function keyForCollectible(c: Collectible): string {
        const tokenPart = c.tokenId ?? "";
        return `${NFT_ADDRESS.toLowerCase()}:${tokenPart}`;
    }

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setState((prev) => ({ ...prev, status: "loading", error: null }));
            try {
                const [collectibles, listings] = await Promise.all([
                    fetchCollectibles(),
                    fetchListings(),
                ]);

                if (cancelled) return;

                // Build listed map from active listings
                const map: Record<string, boolean> = {};
                for (const l of listings) {
                    if (!l.active) continue;
                    const k = `${l.nft.toLowerCase()}:${l.tokenId}`;
                    map[k] = true;
                }

                setState({ status: "success", data: collectibles, error: null });
                setListedMap(map);
            } catch (err: any) {
                if (cancelled) return;
                setState({
                    status: "error",
                    data: [],
                    error: err?.message ?? "Failed to load collectibles",
                });
            }
        }

        void load();
        const interval = setInterval(load, 20_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return (
        <div>
            <h2>All Collectibles</h2>
            <p>All collectibles indexed from the registry + NFT events.</p>

            {state.status === "loading" && state.data.length === 0 && (
                <p>Loading collectibles…</p>
            )}

            {state.status === "error" && (
                <p style={{ color: "red" }}>
                    Failed to load collectibles: {state.error}
                </p>
            )}

            {state.data.length === 0 && state.status === "success" && (
                <p>No collectibles indexed yet.</p>
            )}

            {state.data.length > 0 && (
                <div className="table-wrapper">
                    <table className="listing-table">
                        <thead>
                            <tr>
                                <th className="cell-short">Token ID</th>
                                <th className="cell-short">RFID</th>
                                <th>RFID Hash</th>
                                <th>Authenticity Hash</th>
                                <th>Owner</th>
                                <th className="cell-short">Burned</th>
                                <th className="cell-short">Redeemed</th>
                                <th className="cell-short">Listed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.data.map((c) => {
                                const key = `${c.rfidHash}-${c.tokenId ?? "na"}`;
                                const listingKey = `${NFT_ADDRESS.toLowerCase()}:${c.tokenId ?? ""}`;
                                const isListed = listedMap[listingKey] === true;

                                return (
                                    <tr key={key}>
                                        <td className="cell-short">{c.tokenId ?? "?"}</td>
                                        <td className="cell-short">{c.rfid ?? "—"}</td>
                                        <td className="cell-hash" title={c.rfidHash}>
                                            {c.rfidHash}
                                        </td>
                                        <td className="cell-hash" title={c.authenticityHash}>
                                            {c.authenticityHash}
                                        </td>
                                        <td title={c.owner}>{c.owner}</td>
                                        <td className="cell-short">{c.burned ? "Yes" : "No"}</td>
                                        <td className="cell-short">{c.redeemed ? "Yes" : "No"}</td>
                                        <td className="cell-short">{isListed ? "Yes" : "No"}</td>
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
