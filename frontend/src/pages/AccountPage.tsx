// src/pages/AccountPage.tsx

import { useState, useEffect } from "react";
import { parseUnits, formatUnits } from "ethers";
import { useOwnerCollectibles } from "../hooks/useCollectibles";
import { fetchListings, fetchActivity } from "../api";
import type { Collectible, Listing, ActivityEvent } from "../api";
import { useWallet } from "../eth/wallet";
import { useSignerContracts } from "../eth/contracts";
import { NFT_ADDRESS, REGISTRY_ADDRESS } from "../eth/config";

type LoadStatus = "idle" | "loading" | "success" | "error";

function shortenAddress(addr?: string, chars = 4) {
    if (!addr) return "";
    const prefix = addr.slice(0, 2 + chars);
    const suffix = addr.slice(-chars);
    return `${prefix}…${suffix}`;
}

function shortenTx(tx?: string, chars = 6) {
    if (!tx) return "";
    const prefix = tx.slice(0, 2 + chars);
    const suffix = tx.slice(-chars);
    return `${prefix}…${suffix}`;
}

function formatUsdc(raw?: string): string {
    if (!raw) return "—";
    try {
        return `${formatUnits(raw, 6)} USDC`;
    } catch {
        return raw;
    }
}

export function AccountPage() {
    const { address, hasProvider, wrongNetwork } = useWallet();

    // This is for the collectibles hook, which expects string | null
    const owner = address ?? null;
    const { status, data, error } = useOwnerCollectibles(owner);

    const { getRegistry, getNft, getMarket } = useSignerContracts();

    // Per-collectible listing prices (keyed by nft+tokenId)
    const [priceByKey, setPriceByKey] = useState<Record<string, string>>({});
    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});

    // Activity state
    const [activity, setActivity] = useState<ActivityEvent[]>([]);
    const [activityStatus, setActivityStatus] = useState<LoadStatus>("idle");
    const [activityError, setActivityError] = useState<string | null>(null);

    function rowKey(c: Collectible): string {
        const tokenPart = c.tokenId ?? "";
        return `${NFT_ADDRESS.toLowerCase()}:${tokenPart}`;
    }

    function setRowPrice(c: Collectible, value: string) {
        const key = rowKey(c);
        setPriceByKey((prev) => ({ ...prev, [key]: value }));
    }

    // Load "is listed" info from backend
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

    // Load "My Activity" from backend (uses address)
    useEffect(() => {
        if (!address) {
            setActivity([]);
            setActivityStatus("idle");
            setActivityError(null);
            return;
        }

        // After the guard, this is definitely a string
        const addr = address;

        let cancelled = false;

        async function loadActivity() {
            setActivityStatus("loading");
            setActivityError(null);
            try {
                const res = await fetchActivity(addr);
                if (cancelled) return;
                setActivity(res.events);
                setActivityStatus("success");
            } catch (err: any) {
                if (cancelled) return;
                console.error("failed to load activity", err);
                setActivityStatus("error");
                setActivityError(err?.message ?? "Failed to load activity");
            }
        }

        void loadActivity();
        const interval = setInterval(loadActivity, 20_000);
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
            if (!hasProvider) {
                throw new Error("No injected wallet found.");
            }
            if (!address) {
                throw new Error("No wallet connected.");
            }
            if (wrongNetwork) {
                throw new Error("Wrong network selected in wallet.");
            }

            if (!c.rfid) {
                alert("Missing RFID for this collectible; cannot transfer.");
                return;
            }
            if (!c.tokenId) {
                alert("Missing tokenId for this collectible; cannot transfer.");
                return;
            }

            const newOwner = window.prompt("Enter the new owner address (0x...):");
            if (!newOwner) return;

            const nft = await getNft();
            const registry = await getRegistryWithSigner();
            const tokenId = BigInt(c.tokenId);

            // approve registry to move NFT for off-market transfer
            const approveTx = await nft.approve(REGISTRY_ADDRESS, tokenId);
            alert(`Approve tx sent: ${approveTx.hash}`);
            await approveTx.wait();
            alert("Approve confirmed.");

            const tx = await registry.transferCollectibleOwnership(c.rfid, newOwner);
            alert(`Transfer tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Transfer confirmed on-chain.");
        } catch (err: any) {
            console.error(err);
            alert(`Transfer failed: ${err?.reason ?? err?.message ?? String(err)}`);
        }
    }

    async function handleRedeem(c: Collectible) {
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
            alert(`Redeem failed: ${err?.reason ?? err?.message ?? String(err)}`);
        }
    }

    async function handleList(c: Collectible) {
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
                priceRaw = parseUnits(priceStr, 6);
            } catch {
                alert("Invalid price format. Example: 1.0 or 0.5");
                return;
            }

            const nft = await getNft();
            const market = await getMarket();

            const approveTx = await nft.approve(market.target, tokenId);
            alert(`Approve tx sent: ${approveTx.hash}`);
            await approveTx.wait();
            alert("Approve confirmed.");

            const listTx = await market.listCollectible(NFT_ADDRESS, tokenId, priceRaw);
            alert(`List tx sent: ${listTx.hash}`);
            await listTx.wait();
            alert("Listing confirmed. The backend will pick up the event shortly.");

            setPriceByKey((prev) => {
                const copy = { ...prev };
                delete copy[key];
                return copy;
            });
        } catch (err: any) {
            console.error(err);
            alert(`Listing failed: ${err?.reason ?? err?.message ?? String(err)}`);
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
                                        <td>{c.tokenId ?? "?"}</td>
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
                    marketplace contract will be approved to transfer it. For off-market
                    transfers, the registry will be approved to transfer the NFT. Price is
                    interpreted with 6 decimals (USDC-style). Once listed, the row will
                    show &quot;Listed: Yes&quot;.
                </p>
            )}

            {/* My Activity */}
            {address && (
                <section style={{ marginTop: "2rem" }}>
                    <h3>My Activity</h3>

                    {activityStatus === "loading" && <p>Loading activity…</p>}

                    {activityStatus === "error" && (
                        <p style={{ color: "red" }}>
                            Failed to load activity: {activityError}
                        </p>
                    )}

                    {activityStatus === "success" && activity.length === 0 && (
                        <p>No recent activity found for this address.</p>
                    )}

                    {activityStatus === "success" && activity.length > 0 && (
                        <div className="table-wrapper">
                            <table className="listing-table">
                                <thead>
                                    <tr>
                                        <th>When</th>
                                        <th>Block</th>
                                        <th>Event</th>
                                        <th>NFT</th>
                                        <th>Token</th>
                                        <th>Price</th>
                                        <th>From</th>
                                        <th>To / Owner</th>
                                        <th>Tx</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.map((ev) => {
                                        const when = new Date(ev.createdAt).toLocaleString();
                                        const from = ev.seller ?? undefined;
                                        const to = ev.buyer ?? ev.owner ?? undefined;

                                        return (
                                            <tr key={`${ev.tx}-${ev.logIndex}`}>
                                                <td>{when}</td>
                                                <td>{ev.block}</td>
                                                <td>{ev.eventName}</td>
                                                <td>
                                                    {ev.nft ? (
                                                        <span title={ev.nft}>
                                                            {shortenAddress(ev.nft)}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td>{ev.tokenId ?? "—"}</td>
                                                <td>{formatUsdc(ev.price)}</td>
                                                <td>
                                                    {from ? (
                                                        <span title={from}>
                                                            {shortenAddress(from, 6)}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td>
                                                    {to ? (
                                                        <span title={to}>
                                                            {shortenAddress(to, 6)}
                                                        </span>
                                                    ) : (
                                                        "—"
                                                    )}
                                                </td>
                                                <td>
                                                    <span title={ev.tx}>
                                                        {shortenTx(ev.tx, 8)}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
