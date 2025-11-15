// src/pages/MarketplacePage.tsx

import { useEffect, useState } from "react";
import type React from "react";
import { parseUnits } from "ethers";
import { fetchListings } from "../api";
import type { Listing } from "../api";
import { useWallet } from "../eth/wallet";
import { useSignerContracts } from "../eth/contracts";
import { NFT_ADDRESS } from "../eth/config";

type Status = "idle" | "loading" | "success" | "error";

type ListingsState = {
    status: Status;
    data: Listing[];
    error: string | null;
};

function shortenAddress(addr?: string, chars = 4) {
    if (!addr) return "";
    const prefix = addr.slice(0, 2 + chars);
    const suffix = addr.slice(-chars);
    return `${prefix}…${suffix}`;
}

export function MarketplacePage() {
    const [state, setState] = useState<ListingsState>({
        status: "idle",
        data: [],
        error: null,
    });

    const { address, hasProvider, wrongNetwork } = useWallet();
    const { getNft, getMarket } = useSignerContracts();

    // Simple listing form
    const [tokenIdInput, setTokenIdInput] = useState("");
    const [priceInput, setPriceInput] = useState(""); // human-readable, e.g. "1.0"
    const [submitting, setSubmitting] = useState(false);

    // Load listings from backend
    useEffect(() => {
        let cancelled = false;

        async function load() {
            setState((prev) => ({ ...prev, status: "loading", error: null }));
            try {
                const listings = await fetchListings();
                if (cancelled) return;
                setState({ status: "success", data: listings, error: null });
            } catch (err: any) {
                if (cancelled) return;
                setState({
                    status: "error",
                    data: [],
                    error: err?.message ?? "Failed to load listings",
                });
            }
        }

        void load();
        const interval = setInterval(load, 15_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    async function handleListSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!tokenIdInput || !priceInput) {
            alert("Token ID and price are required.");
            return;
        }

        const tokenId = BigInt(tokenIdInput);
        let priceRaw: bigint;
        try {
            // assuming USDC 6 decimals for now
            priceRaw = parseUnits(priceInput, 6);
        } catch {
            alert("Invalid price format.");
            return;
        }

        setSubmitting(true);
        try {
            if (!hasProvider) {
                throw new Error("No injected wallet found.");
            }
            if (!address) {
                throw new Error("No wallet connected.");
            }
            if (wrongNetwork) {
                throw new Error("Wrong network selected in wallet.");
            }

            const nft = await getNft();
            const market = await getMarket();

            // 1) Approve marketplace for this token
            const approveTx = await nft.approve(market.target, tokenId);
            alert(`Approve tx sent: ${approveTx.hash}`);
            await approveTx.wait();
            alert("Approve confirmed.");

            // 2) List on marketplace
            const listTx = await market.listCollectible(NFT_ADDRESS, tokenId, priceRaw);
            alert(`List tx sent: ${listTx.hash}`);
            await listTx.wait();
            alert("Listing confirmed.");

            // Optional: clear form
            setTokenIdInput("");
            setPriceInput("");
        } catch (err: any) {
            console.error(err);
            alert(`Listing failed: ${err?.message ?? String(err)}`);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            <h2>Marketplace</h2>
            <p>
                Shows active listings indexed by the backend. You can also list one of
                your NFTs for sale by tokenId.
            </p>

            {/* Listing form */}
            <section
                style={{
                    marginBottom: "1.5rem",
                    padding: "1rem",
                    borderRadius: "0.5rem",
                    border: "1px solid #2d3748",
                }}
            >
                <h3>List a collectible (by tokenId)</h3>
                {!hasProvider && (
                    <p style={{ color: "#f97373" }}>
                        No wallet detected. Install MetaMask or another injected wallet.
                    </p>
                )}
                {hasProvider && !address && (
                    <p>Connect your wallet to list a collectible.</p>
                )}
                {hasProvider && address && wrongNetwork && (
                    <p style={{ color: "#f97373" }}>
                        Wrong network selected in wallet. Please switch to Arbitrum
                        Sepolia.
                    </p>
                )}

                <form
                    onSubmit={handleListSubmit}
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                        alignItems: "center",
                        marginTop: "0.5rem",
                    }}
                >
                    <label>
                        Token ID{" "}
                        <input
                            type="number"
                            min={0}
                            value={tokenIdInput}
                            onChange={(e) => setTokenIdInput(e.target.value)}
                            style={{ width: "100px" }}
                            disabled={submitting}
                        />
                    </label>

                    <label>
                        Price (USDC)
                        <input
                            type="text"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            style={{ width: "120px" }}
                            placeholder="1.0"
                            disabled={submitting}
                        />
                    </label>

                    <button
                        type="submit"
                        disabled={
                            submitting || !address || wrongNetwork || !tokenIdInput || !priceInput
                        }
                    >
                        {submitting ? "Listing…" : "List"}
                    </button>
                </form>

                <p
                    style={{
                        marginTop: "0.5rem",
                        fontSize: "0.8rem",
                        color: "#a0a4aa",
                    }}
                >
                    For listing to succeed, you must own the tokenId and the marketplace
                    will be approved to transfer it.
                </p>
            </section>

            {/* Existing listings */}
            <section>
                <h3>Active listings</h3>

                {state.status === "loading" && state.data.length === 0 && (
                    <p>Loading listings…</p>
                )}

                {state.status === "error" && (
                    <p style={{ color: "red" }}>
                        Failed to load listings: {state.error}
                    </p>
                )}

                {state.data.length === 0 && state.status === "success" && (
                    <p>No active listings found.</p>
                )}

                {state.data.length > 0 && (
                    <div className="table-wrapper">
                        <table className="listing-table">
                            <thead>
                                <tr>
                                    <th>NFT</th>
                                    <th>Token ID</th>
                                    <th>Seller</th>
                                    <th>Price (raw)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.data.map((l) => (
                                    <tr
                                        key={`${l.nft.toLowerCase()}:${l.tokenId}:${l.lastUpdateTx}`}
                                    >
                                        <td title={l.nft}>{shortenAddress(l.nft)}</td>
                                        <td>{l.tokenId}</td>
                                        <td title={l.seller}>{shortenAddress(l.seller, 6)}</td>
                                        <td>{l.price}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
