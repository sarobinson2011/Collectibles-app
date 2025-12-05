// src/pages/AccountPage.tsx

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { parseUnits } from "ethers";
import { useOwnerCollectibles } from "../hooks/useCollectibles";
import {
    fetchListings,
    fetchActivity,
    type Collectible,
    type Listing,
    type ActivityEvent,
} from "../api";
import { useWallet } from "../eth/wallet";
import { useSignerContracts } from "../eth/contracts";
import { NFT_ADDRESS } from "../eth/config";

type Status = "idle" | "loading" | "success" | "error";

function formatUsdc(raw: string | null | undefined): string {
    if (!raw) return "—";
    try {
        const value = Number(raw) / 1_000_000; // 6 decimals
        return `${value.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6,
        })} USDC`;
    } catch {
        return raw;
    }
}

export function AccountPage() {
    const { address, hasProvider, wrongNetwork } = useWallet();
    const owner = address ?? null;
    const { status, data, error } = useOwnerCollectibles(owner);

    const { getRegistry, getNft, getMarket } = useSignerContracts();

    // Per-collectible listing prices (keyed by nft+tokenId)
    const [priceByKey, setPriceByKey] = useState<Record<string, string>>({});
    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});

    // Activity state
    const [activity, setActivity] = useState<ActivityEvent[]>([]);
    const [activityStatus, setActivityStatus] = useState<Status>("idle");
    const [activityError, setActivityError] = useState<string | null>(null);
    const [showActivity, setShowActivity] = useState<boolean>(false);

    function rowKey(c: Collectible): string {
        const tokenPart = c.tokenId ?? "";
        return `${NFT_ADDRESS.toLowerCase()}:${tokenPart}`;
    }

    function setRowPrice(c: Collectible, value: string) {
        const key = rowKey(c);
        setPriceByKey((prev) => ({ ...prev, [key]: value }));
    }

    // Load marketplace listings
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

    // Load activity for current address
    useEffect(() => {
        if (!address) {
            setActivity([]);
            setActivityStatus("idle");
            setActivityError(null);
            return;
        }

        const addr = address;
        let cancelled = false;

        async function loadActivity() {
            setActivityStatus("loading");
            setActivityError(null);
            try {
                const res = await fetchActivity(addr); // { events: ActivityEvent[] }
                if (cancelled) return;
                setActivity(res.events);
                setActivityStatus("success");
            } catch (err: any) {
                if (cancelled) return;
                console.error("failed to load activity", err);
                setActivity([]);
                setActivityStatus("error");
                setActivityError(err?.message ?? "Failed to load activity");
            }
        }

        void loadActivity();

        const interval = setInterval(loadActivity, 30_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [address]);

    async function getRegistryWithSigner() {
        return getRegistry();
    }

    async function handleTransfer(c: Collectible) {
        try {
            if (!c.rfid) {
                alert("Missing RFID for this collectible; cannot transfer.");
                return;
            }

            const newOwner = window.prompt("Enter the new owner address (0x...):");
            if (!newOwner) return;

            const registry = await getRegistryWithSigner();

            const tx = await registry.transferCollectibleOwnership(c.rfid, newOwner);
            alert(`Transfer tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Transfer confirmed on-chain.");
        } catch (err: any) {
            console.error(err);
            alert(`Transfer failed: ${err?.message ?? String(err)}`);
        }
    }

    async function handleRedeem(c: Collectible) {
        try {
            if (!c.rfid) {
                alert("Missing RFID for this collectible; cannot redeem.");
                return;
            }

            const confirm = window.confirm(
                `Redeem/burn collectible with RFID "${c.rfid}"? This is irreversible.`,
            );
            if (!confirm) return;

            const registry = await getRegistryWithSigner();

            const tx = await registry.redeemCollectible(c.rfid);
            alert(`Redeem tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Redeem confirmed on-chain.");
        } catch (err: any) {
            console.error(err);
            alert(`Redeem failed: ${err?.message ?? String(err)}`);
        }
    }

    async function handleList(c: Collectible) {
        try {
            if (!c.tokenId) {
                alert("Missing tokenId for this collectible; cannot list.");
                return;
            }

            const key = rowKey(c);
            const priceStr = priceByKey[key];
            if (!priceStr) {
                alert("Enter a price (USDC) in the field before listing.");
                return;
            }

            const tokenId = BigInt(c.tokenId);

            let priceRaw: bigint;
            try {
                // Assuming USDC 6 decimals in your market
                priceRaw = parseUnits(priceStr, 6);
            } catch {
                alert("Invalid price format. Example: 1.0 or 0.5");
                return;
            }

            const nft = await getNft();
            const market = await getMarket();

            // 1) Approve marketplace for this tokenId
            const approveTx = await nft.approve(market.target, tokenId);
            alert(`Approve tx sent: ${approveTx.hash}`);
            await approveTx.wait();
            alert("Approve confirmed.");

            // 2) List on marketplace
            const listTx = await market.listCollectible(NFT_ADDRESS, tokenId, priceRaw);
            alert(`List tx sent: ${listTx.hash}`);
            await listTx.wait();
            alert("Listing confirmed. The backend will pick up the event shortly.");

            // Optional: clear the price field for this row
            setPriceByKey((prev) => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
        } catch (err: any) {
            console.error(err);
            alert(`Listing failed: ${err?.message ?? String(err)}`);
        }
    }

    return (
        <div>
            <h2>Account</h2>
            <p>
                Manage your collectibles (transfer, redeem, list for sale) using your
                connected wallet.
            </p>

            {!hasProvider && (
                <p style={{ color: "#f97373" }}>
                    No wallet detected. Install MetaMask or another injected wallet.
                </p>
            )}

            {hasProvider && !address && (
                <p>Connect your wallet to manage your collectibles.</p>
            )}

            {hasProvider && address && wrongNetwork && (
                <p style={{ color: "#f97373" }}>
                    Wrong network selected in wallet. Please switch to Arbitrum Sepolia.
                </p>
            )}

            {address && !wrongNetwork && (
                <p>
                    Connected as <strong>{address}</strong>
                </p>
            )}

            {address && status === "loading" && data.length === 0 && (
                <p>Loading collectibles…</p>
            )}

            {status === "error" && (
                <p style={{ color: "red" }}>Failed to load collectibles: {error}</p>
            )}

            {address && data.length === 0 && status === "success" && (
                <p>No collectibles found for this address.</p>
            )}

            {/* Collectibles management table */}
            {data.length > 0 && (
                <div className="table-wrapper">
                    <table className="listing-table">
                        <thead>
                            <tr>
                                <th>Token ID</th>
                                <th>RFID</th>
                                <th>Burned</th>
                                <th>Redeemed</th>
                                <th>Listed</th>
                                <th>List price (USDC)</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((c) => {
                                const key = rowKey(c);
                                const disabledBase =
                                    c.burned || c.redeemed || !address || wrongNetwork;
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
                                        <td>{c.burned ? "Yes" : "No"}</td>
                                        <td>{c.redeemed ? "Yes" : "No"}</td>
                                        <td>{isListed ? "Yes" : "No"}</td>
                                        <td>
                                            <input
                                                type="text"
                                                placeholder="1.0"
                                                value={priceByKey[key] ?? ""}
                                                onChange={(e) => setRowPrice(c, e.target.value)}
                                                style={{ width: "90px" }}
                                                disabled={disabledBase || isListed}
                                            />
                                        </td>
                                        <td>
                                            <button
                                                disabled={disabledBase}
                                                onClick={() => void handleTransfer(c)}
                                                style={{ marginRight: "0.4rem" }}
                                            >
                                                Transfer
                                            </button>
                                            <button
                                                disabled={disabledBase}
                                                onClick={() => void handleRedeem(c)}
                                                style={{ marginRight: "0.4rem" }}
                                            >
                                                Redeem
                                            </button>
                                            <button
                                                disabled={
                                                    disabledBase ||
                                                    isListed ||
                                                    !c.tokenId ||
                                                    !priceByKey[key] ||
                                                    priceByKey[key].trim() === ""
                                                }
                                                onClick={() => void handleList(c)}
                                            >
                                                List
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {data.length > 0 && (
                <p
                    style={{
                        marginTop: "0.75rem",
                        fontSize: "0.9rem",
                        color: "#a0a4aa",
                    }}
                >
                    Note: For listing to succeed, you must own the token and the
                    marketplace contract will be approved to transfer it. Price is
                    interpreted with 6 decimals (USDC-style). Once listed, the row will
                    show &quot;Listed: Yes&quot;.
                </p>
            )}

            {/* My Activity - collapsible */}
            <section style={{ marginTop: "2rem" }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: showActivity ? "0.75rem" : 0,
                    }}
                >
                    <h3 style={{ margin: 0 }}>My Activity</h3>
                    <button
                        type="button"
                        onClick={() => setShowActivity((prev) => !prev)}
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            padding: "0.25rem 0.6rem",
                            borderRadius: "999px",
                            border: "1px solid #4b5563",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: "0.85rem",
                        }}
                    >
                        {showActivity ? "Hide activity" : "Show activity"}
                        <span>{showActivity ? "▲" : "▼"}</span>
                    </button>
                </div>

                {showActivity && (
                    <>
                        {activityStatus === "loading" && (
                            <p style={{ marginTop: "0.5rem" }}>Loading activity…</p>
                        )}

                        {activityStatus === "error" && (
                            <p style={{ color: "red", marginTop: "0.5rem" }}>
                                Failed to load activity: {activityError}
                            </p>
                        )}

                        {activityStatus === "success" && activity.length === 0 && (
                            <p style={{ marginTop: "0.5rem" }}>
                                No recent activity found for this address.
                            </p>
                        )}

                        {activityStatus === "success" && activity.length > 0 && (
                            <div
                                className="table-wrapper"
                                style={{ marginTop: "0.75rem" }}
                            >
                                <table className="listing-table">
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Contract</th>
                                            <th>Event</th>
                                            <th>RFID Hash</th>
                                            <th>Token ID</th>
                                            <th>Price</th>
                                            <th>From</th>
                                            <th>To / Owner</th>
                                            <th>Tx</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activity.map((ev) => {
                                            const when = new Date(
                                                ev.createdAt,
                                            ).toLocaleString();
                                            const from = ev.seller ?? null;
                                            const to = ev.buyer ?? ev.owner ?? null;

                                            return (
                                                <tr key={`${ev.tx}-${ev.logIndex}`}>
                                                    <td>{when}</td>
                                                    <td>{ev.contract}</td>
                                                    <td>{ev.eventName}</td>
                                                    <td>{ev.rfidHash ?? "—"}</td>
                                                    <td>{ev.tokenId ?? "—"}</td>
                                                    <td>{formatUsdc(ev.price)}</td>
                                                    <td>{from ?? "—"}</td>
                                                    <td>{to ?? "—"}</td>
                                                    <td title={ev.tx}>
                                                        {ev.tx.slice(0, 10)}…
                                                        {ev.tx.slice(-6)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
}
