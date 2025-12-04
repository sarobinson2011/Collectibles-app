// src/pages/MarketplacePage.tsx

import { useEffect, useState, useCallback } from "react";
import type React from "react";
import { parseUnits, formatUnits } from "ethers";
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

function friendlyErrorMessage(err: any): string {
    const raw = (
        err?.reason ??
        err?.shortMessage ??
        err?.message ??
        String(err)
    ).toLowerCase();

    if (raw.includes("user rejected") || raw.includes("user denied")) {
        return "You rejected the transaction in your wallet.";
    }

    if (raw.includes("not listed")) {
        return "This listing is no longer active – it was probably cancelled or already sold.";
    }

    if (raw.includes("owner changed")) {
        return "The NFT owner changed, so this listing is no longer valid.";
    }

    if (raw.includes("insufficient balance")) {
        return "You don’t have enough USDC to complete this purchase.";
    }

    if (raw.includes("insufficient allowance")) {
        return "You need to approve more USDC before buying this listing.";
    }

    return "Transaction failed. Please check your wallet or try again.";
}

export function MarketplacePage() {
    const [state, setState] = useState<ListingsState>({
        status: "idle",
        data: [],
        error: null,
    });

    const { address, hasProvider, wrongNetwork } = useWallet();
    const { getNft, getMarket, getUsdc } = useSignerContracts();

    // Simple listing form
    const [tokenIdInput, setTokenIdInput] = useState("");
    const [priceInput, setPriceInput] = useState(""); // human-readable, e.g. "1.0"
    const [submitting, setSubmitting] = useState(false);

    // Track which listing is currently being bought (to disable its button)
    const [buyingKey, setBuyingKey] = useState<string | null>(null);

    // Track which listing is being cancelled / amended
    const [cancelingKey, setCancelingKey] = useState<string | null>(null);
    const [amendingKey, setAmendingKey] = useState<string | null>(null);

    // Centralized reload for listings (used by both polling + post-tx refresh)
    const reloadListings = useCallback(async () => {
        setState((prev) => ({ ...prev, status: "loading", error: null }));
        try {
            const listings = await fetchListings();
            setState({ status: "success", data: listings, error: null });
        } catch (err: any) {
            setState({
                status: "error",
                data: [],
                error: err?.message ?? "Failed to load listings",
            });
        }
    }, []);

    // Load listings from backend + poll
    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (cancelled) return;
            await reloadListings();
        }

        void load();
        const interval = setInterval(load, 15_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [reloadListings]);

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

            // Clear form
            setTokenIdInput("");
            setPriceInput("");

            // Refresh listings immediately
            await reloadListings();
        } catch (err: any) {
            console.error(err);
            alert(friendlyErrorMessage(err));
        } finally {
            setSubmitting(false);
        }
    }

    async function handleBuy(l: Listing) {
        const key = `${l.nft.toLowerCase()}:${l.tokenId}`;
        setBuyingKey(key);

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

            const market = await getMarket();
            const usdc = await getUsdc();

            const tokenId = BigInt(l.tokenId);
            const priceRaw = BigInt(l.price); // already stored as 6-decimals raw integer

            // 1) Approve USDC spending for this price
            const approveTx = await usdc.approve(market.target, priceRaw);
            alert(`USDC approve tx sent: ${approveTx.hash}`);
            await approveTx.wait();
            alert("USDC approve confirmed.");

            // 2) Purchase the collectible
            const buyTx = await market.purchaseCollectible(NFT_ADDRESS, tokenId);
            alert(`Purchase tx sent: ${buyTx.hash}`);
            await buyTx.wait();
            alert("Purchase confirmed.");

            // Refresh listings immediately
            await reloadListings();
        } catch (err: any) {
            console.error(err);
            alert(friendlyErrorMessage(err));
        } finally {
            setBuyingKey((prev) => (prev === key ? null : prev));
        }
    }

    async function handleCancel(l: Listing) {
        const key = `${l.nft.toLowerCase()}:${l.tokenId}:${l.lastUpdateTx}`;
        setCancelingKey(key);

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

            const market = await getMarket();
            const tokenId = BigInt(l.tokenId);

            const tx = await market.cancelListing(NFT_ADDRESS, tokenId);
            alert(`Cancel tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Listing cancelled.");

            // Refresh listings immediately
            await reloadListings();
        } catch (err: any) {
            console.error(err);
            alert(friendlyErrorMessage(err));
        } finally {
            setCancelingKey((prev) => (prev === key ? null : prev));
        }
    }

    async function handleAmend(l: Listing) {
        // Ask for new price *before* we mark anything as "amending"
        const newPriceStr = window.prompt(
            "Enter new price in USDC (e.g. 10.5):",
            ""
        );

        if (newPriceStr === null || newPriceStr.trim() === "") {
            // user cancelled or left empty – do nothing
            return;
        }

        let newPriceRaw: bigint;
        try {
            newPriceRaw = parseUnits(newPriceStr.trim(), 6); // USDC 6 decimals
        } catch {
            alert("Invalid price format.");
            return;
        }

        const key = `${l.nft.toLowerCase()}:${l.tokenId}:${l.lastUpdateTx}`;
        setAmendingKey(key);

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

            const market = await getMarket();
            const tokenId = BigInt(l.tokenId);

            const tx = await market.amendListing(NFT_ADDRESS, tokenId, newPriceRaw);
            alert(`Amend tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Listing price updated.");

            // Refresh listings immediately
            await reloadListings();
        } catch (err: any) {
            console.error(err);
            alert(friendlyErrorMessage(err));
        } finally {
            setAmendingKey((prev) => (prev === key ? null : prev));
        }
    }

    return (
        <div>
            <h2>Marketplace</h2>
            <p>
                Shows active listings indexed by the backend. You can also list one of
                your NFTs for sale by tokenId, or buy listed collectibles with mock USDC.
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
                        Wrong network selected in wallet. Please switch to Arbitrum Sepolia.
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
                            submitting ||
                            !address ||
                            wrongNetwork ||
                            !tokenIdInput ||
                            !priceInput
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
                                    <th>Price (USDC)</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.data.map((l) => {
                                    const key = `${l.nft.toLowerCase()}:${l.tokenId}:${l.lastUpdateTx}`;
                                    const isMine =
                                        address &&
                                        l.seller.toLowerCase() === address.toLowerCase();

                                    const displayPrice = Number(
                                        formatUnits(l.price, 6) // USDC 6 decimals
                                    ).toFixed(2);

                                    return (
                                        <tr key={key}>
                                            <td title={l.nft}>{shortenAddress(l.nft)}</td>
                                            <td>{l.tokenId}</td>
                                            <td title={l.seller}>
                                                {shortenAddress(l.seller, 6)}
                                            </td>
                                            <td>{displayPrice} USDC</td>
                                            <td>
                                                {!isMine && (
                                                    <button
                                                        onClick={() => handleBuy(l)}
                                                        disabled={
                                                            !address ||
                                                            wrongNetwork ||
                                                            buyingKey === key
                                                        }
                                                    >
                                                        {buyingKey === key ? "Buying…" : "Buy"}
                                                    </button>
                                                )}
                                                {isMine && (
                                                    <>
                                                        <button
                                                            onClick={() => handleCancel(l)}
                                                            disabled={
                                                                !address ||
                                                                wrongNetwork ||
                                                                cancelingKey === key
                                                            }
                                                            style={{ marginRight: "0.5rem" }}
                                                        >
                                                            {cancelingKey === key
                                                                ? "Canceling…"
                                                                : "Cancel listing"}
                                                        </button>
                                                        <button
                                                            onClick={() => handleAmend(l)}
                                                            disabled={
                                                                !address ||
                                                                wrongNetwork ||
                                                                amendingKey === key
                                                            }
                                                        >
                                                            {amendingKey === key
                                                                ? "Amending…"
                                                                : "Amend listing"}
                                                        </button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
