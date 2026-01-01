// src/pages/AccountPage.tsx

import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { parseUnits, BrowserProvider, Contract } from "ethers";
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
import { NFT_ADDRESS, ADMIN_ADDRESS } from "../eth/config";
import { NFT_ABI } from "../eth/abis";

type Status = "idle" | "loading" | "success" | "error";
type LoyaltyStatus = "idle" | "loading" | "success" | "error";

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

type TierTone = "bronze" | "silver" | "gold";

function tierTone(tier: string): TierTone {
    const t = (tier || "").toLowerCase();
    if (t === "gold") return "gold";
    if (t === "silver") return "silver";
    return "bronze";
}

function tierTheme(tier: string) {
    const tone = tierTone(tier);

    // bronze defaults
    let badgeBg = "rgba(251, 146, 60, 0.14)";
    let badgeBorder = "rgba(251, 146, 60, 0.55)";
    let badgeColor = "#fed7aa";

    // progress colors (same family)
    let barTrack = "rgba(148, 163, 184, 0.10)";
    let barFill = "rgba(251, 146, 60, 0.70)";

    if (tone === "silver") {
        badgeBg = "rgba(148, 163, 184, 0.14)";
        badgeBorder = "rgba(148, 163, 184, 0.55)";
        badgeColor = "#e5e7eb";
        barFill = "rgba(148, 163, 184, 0.80)";
    } else if (tone === "gold") {
        badgeBg = "rgba(234, 179, 8, 0.14)";
        badgeBorder = "rgba(234, 179, 8, 0.55)";
        badgeColor = "#fde68a";
        barFill = "rgba(234, 179, 8, 0.85)";
    }

    return { badgeBg, badgeBorder, badgeColor, barTrack, barFill };
}

function TierBadge({ tier }: { tier: string }) {
    const { badgeBg, badgeBorder, badgeColor } = tierTheme(tier);
    const label =
        tierTone(tier) === "gold"
            ? "Gold"
            : tierTone(tier) === "silver"
                ? "Silver"
                : "Bronze";

    return (
        <span
            style={{
                padding: "0.25rem 0.6rem",
                borderRadius: "999px",
                border: `1px solid ${badgeBorder}`,
                backgroundColor: badgeBg,
                color: badgeColor,
                fontSize: "0.8rem",
                fontWeight: 700,
                letterSpacing: "0.01em",
                whiteSpace: "nowrap",
            }}
            title="Current loyalty tier"
        >
            {label}
        </span>
    );
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function StatusTag({
    label,
    tone,
}: {
    label: string;
    tone: "danger" | "warning" | "info" | "muted";
}) {
    let bg = "rgba(148, 163, 184, 0.10)";
    let border = "rgba(148, 163, 184, 0.45)";
    let color = "#e5e7eb";

    if (tone === "danger") {
        bg = "rgba(248, 113, 113, 0.12)";
        border = "rgba(248, 113, 113, 0.55)";
        color = "#fecaca";
    } else if (tone === "warning") {
        bg = "rgba(234, 179, 8, 0.12)";
        border = "rgba(234, 179, 8, 0.55)";
        color = "#fde68a";
    } else if (tone === "info") {
        bg = "rgba(56, 189, 248, 0.12)";
        border = "rgba(56, 189, 248, 0.55)";
        color = "#bae6fd";
    }

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.2rem 0.5rem",
                borderRadius: "999px",
                border: `1px solid ${border}`,
                backgroundColor: bg,
                color,
                fontSize: "0.75rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                marginLeft: "0.5rem",
                verticalAlign: "middle",
                whiteSpace: "nowrap",
            }}
            title="Status"
        >
            {label}
        </span>
    );
}

export function AccountPage() {
    const { address, hasProvider, wrongNetwork, provider } = useWallet();
    const owner = address ?? null;
    const { status, data, error } = useOwnerCollectibles(owner);

    const { getRegistry, getNft, getMarket } = useSignerContracts();

    const isAdmin = useMemo(() => {
        const a = (address ?? "").trim().toLowerCase();
        const admin = (ADMIN_ADDRESS ?? "").trim().toLowerCase();
        return !!a && !!admin && a === admin;
    }, [address]);

    // Per-collectible listing prices (keyed by nft+tokenId)
    const [priceByKey, setPriceByKey] = useState<Record<string, string>>({});
    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});

    // Activity state
    const [activity, setActivity] = useState<ActivityEvent[]>([]);
    const [activityStatus, setActivityStatus] = useState<Status>("idle");
    const [activityError, setActivityError] = useState<string | null>(null);
    const [showActivity, setShowActivity] = useState<boolean>(false);

    // Loyalty state (points + tier + thresholds)
    const [loyaltyStatus, setLoyaltyStatus] = useState<LoyaltyStatus>("idle");
    const [points, setPoints] = useState<string>("0");
    const [tier, setTier] = useState<string>("Bronze");
    const [silverThreshold, setSilverThreshold] = useState<string>("1000");
    const [goldThreshold, setGoldThreshold] = useState<string>("5000");
    const [loyaltyError, setLoyaltyError] = useState<string | null>(null);

    const canLoadLoyalty = useMemo(() => {
        return !!(hasProvider && provider && address && !wrongNetwork);
    }, [hasProvider, provider, address, wrongNetwork]);

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
                const res = await fetchActivity(addr);
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

    // ---- Loyalty: fetch + live updates ----
    async function refreshLoyalty(nft: Contract, user: string) {
        const [pts, tr, s, g] = await Promise.all([
            nft.getPoints(user),
            nft.getTier(user),
            nft.silverThreshold(),
            nft.goldThreshold(),
        ]);

        setPoints(typeof pts === "bigint" ? pts.toString() : String(pts));
        setTier(String(tr));
        setSilverThreshold(typeof s === "bigint" ? s.toString() : String(s));
        setGoldThreshold(typeof g === "bigint" ? g.toString() : String(g));
    }

    useEffect(() => {
        let cancelled = false;
        setLoyaltyError(null);

        if (!canLoadLoyalty) {
            setLoyaltyStatus("idle");
            setPoints("0");
            setTier("Bronze");
            setSilverThreshold("1000");
            setGoldThreshold("5000");
            return;
        }

        const p = provider as BrowserProvider;
        const nft = new Contract(NFT_ADDRESS, NFT_ABI, p);
        const user = address as string;

        async function initialLoad() {
            setLoyaltyStatus("loading");
            try {
                await refreshLoyalty(nft, user);
                if (cancelled) return;
                setLoyaltyStatus("success");
            } catch (err: any) {
                if (cancelled) return;
                console.error("failed to load loyalty", err);
                setLoyaltyStatus("error");
                setLoyaltyError(
                    err?.shortMessage ?? err?.message ?? "Failed to load loyalty",
                );
            }
        }

        void initialLoad();

        // Live updates: listen for points changes affecting THIS user
        const onPointsAdded = (evUser: string) => {
            if (!evUser) return;
            if (evUser.toLowerCase() !== user.toLowerCase()) return;
            void refreshLoyalty(nft, user);
        };

        const onAdminSetPoints = (evUser: string) => {
            if (!evUser) return;
            if (evUser.toLowerCase() !== user.toLowerCase()) return;
            void refreshLoyalty(nft, user);
        };

        const onThresholdsUpdated = () => {
            void refreshLoyalty(nft, user);
        };

        nft.on("PointsAdded", onPointsAdded);
        nft.on("AdminSetPoints", onAdminSetPoints);
        nft.on("TierThresholdsUpdated", onThresholdsUpdated);

        // Optional safety poll (slow) in case the provider misses events
        const safety = setInterval(() => {
            void refreshLoyalty(nft, user);
        }, 120_000);

        return () => {
            cancelled = true;
            clearInterval(safety);
            try {
                nft.off("PointsAdded", onPointsAdded);
                nft.off("AdminSetPoints", onAdminSetPoints);
                nft.off("TierThresholdsUpdated", onThresholdsUpdated);
            } catch {
                // ignore
            }
        };
    }, [canLoadLoyalty, provider, address]);

    // ---- Tier progress bar numbers ----
    const pointsNum = Number(points || "0");
    const silverNum = Number(silverThreshold || "1000");
    const goldNum = Number(goldThreshold || "5000");

    const nextTarget =
        tierTone(tier) === "gold"
            ? null
            : tierTone(tier) === "silver"
                ? goldNum
                : silverNum;

    const prevTarget =
        tierTone(tier) === "gold"
            ? goldNum
            : tierTone(tier) === "silver"
                ? silverNum
                : 0;

    const progressPct = (() => {
        if (nextTarget == null) return 100;
        const denom = Math.max(1, nextTarget - prevTarget);
        const num = pointsNum - prevTarget;
        return clamp((num / denom) * 100, 0, 100);
    })();

    const progressLabel =
        nextTarget == null
            ? "Max tier"
            : `${pointsNum.toLocaleString()} / ${nextTarget.toLocaleString()} → ${tierTone(tier) === "silver" ? "Gold" : "Silver"
            }`;

    const { barTrack, barFill } = tierTheme(tier);

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
                <div
                    style={{
                        marginTop: "0.75rem",
                        borderRadius: "0.9rem",
                        border: "1px solid #1f2937",
                        background: "#020617",
                        padding: "1rem",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "1rem",
                            flexWrap: "wrap",
                        }}
                    >
                        <div>
                            <div style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                                Connected as
                            </div>
                            <div style={{ fontWeight: 700 }}>{address}</div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: "0.75rem",
                                alignItems: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            <TierBadge tier={tier} />
                            <div style={{ textAlign: "right" }}>
                                <div style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                                    Loyalty points
                                </div>
                                <div
                                    style={{
                                        fontSize: "1.8rem",
                                        fontWeight: 800,
                                        letterSpacing: "-0.02em",
                                        lineHeight: 1.1,
                                    }}
                                >
                                    {points}
                                </div>
                                {loyaltyStatus === "loading" && (
                                    <div
                                        style={{
                                            marginTop: "0.2rem",
                                            fontSize: "0.8rem",
                                            opacity: 0.6,
                                        }}
                                    >
                                        Updating…
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tier progress */}
                    <div style={{ marginTop: "0.85rem" }}>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: "1rem",
                                fontSize: "0.85rem",
                                opacity: 0.8,
                                marginBottom: "0.35rem",
                            }}
                        >
                            <span>Progress</span>
                            <span style={{ opacity: 0.9 }}>{progressLabel}</span>
                        </div>

                        <div
                            style={{
                                height: "10px",
                                borderRadius: "999px",
                                background: barTrack,
                                border: "1px solid #1f2937",
                                overflow: "hidden",
                            }}
                            title={progressLabel}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${progressPct}%`,
                                    background: barFill,
                                }}
                            />
                        </div>
                    </div>

                    {loyaltyStatus === "error" && (
                        <div style={{ marginTop: "0.75rem", color: "#f97373" }}>
                            Failed to load loyalty info: {loyaltyError}
                        </div>
                    )}
                </div>
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
                                {isAdmin && <th>Burned</th>}
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

                                        {isAdmin && <td>{c.burned ? "Yes" : "No"}</td>}

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

                                            {/* Helpful status labels next to disabled actions */}
                                            {c.redeemed && (
                                                <StatusTag label="REDEEMED" tone="warning" />
                                            )}
                                            {!c.redeemed && c.burned && (
                                                <StatusTag label="BURNED" tone="danger" />
                                            )}
                                            {!c.redeemed && !c.burned && isListed && (
                                                <StatusTag label="LISTED" tone="info" />
                                            )}
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
                            <div className="table-wrapper" style={{ marginTop: "0.75rem" }}>
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
                                            const when = new Date(ev.createdAt).toLocaleString();
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
                                                        {ev.tx.slice(0, 10)}…{ev.tx.slice(-6)}
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
