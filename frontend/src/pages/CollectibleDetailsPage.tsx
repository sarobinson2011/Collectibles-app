// src/pages/CollectibleDetailsPage.tsx

import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatUnits } from "ethers";
import {
    fetchCollectibleByTokenId,
    type CollectibleDetails,
    type ActivityEvent,
} from "../api";
import { useSignerContracts } from "../eth/contracts";
import { useWallet } from "../eth/wallet";

type LoadStatus = "idle" | "loading" | "success" | "error";

type NftMetadata = {
    name?: string;
    description?: string;
    image?: string;
    attributes?: Array<{ trait_type?: string; value?: string }>;
};

function shortenAddress(addr: string | undefined | null, chars = 4): string {
    if (!addr) return "";
    const prefix = addr.slice(0, 2 + chars);
    const suffix = addr.slice(-chars);
    return `${prefix}…${suffix}`;
}

function shortenTx(tx: string | undefined | null, chars = 8): string {
    if (!tx) return "";
    const prefix = tx.slice(0, 2 + chars);
    const suffix = tx.slice(-chars);
    return `${prefix}…${suffix}`;
}

function formatUsdc(raw: string | undefined | null): string {
    if (!raw) return "—";
    try {
        return `${formatUnits(raw, 6)} USDC`;
    } catch {
        return raw;
    }
}

export function CollectibleDetailsPage() {
    const { tokenId } = useParams<{ tokenId: string }>();
    const navigate = useNavigate();
    const { hasProvider } = useWallet();
    const { getNft } = useSignerContracts();

    const [details, setDetails] = useState<CollectibleDetails | null>(null);
    const [status, setStatus] = useState<LoadStatus>("idle");
    const [error, setError] = useState<string | null>(null);

    const [metadata, setMetadata] = useState<NftMetadata | null>(null);
    const [metaStatus, setMetaStatus] = useState<LoadStatus>("idle");

    // Load collectible details from backend
    useEffect(() => {
        if (!tokenId) return;

        // after guard, this is guaranteed string
        const tid = tokenId;

        let cancelled = false;

        async function load() {
            setStatus("loading");
            setError(null);
            try {
                const data = await fetchCollectibleByTokenId(tid);
                if (cancelled) return;
                setDetails(data);
                setStatus("success");
            } catch (err: any) {
                if (cancelled) return;
                console.error("Failed to load collectible details", err);
                setStatus("error");
                setError(err?.message ?? "Failed to load collectible details");
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [tokenId]);

    // Load tokenURI + metadata from NFT contract
    useEffect(() => {
        if (!tokenId) return;
        if (!hasProvider) {
            setMetaStatus("idle");
            setMetadata(null);
            return;
        }

        // after guard, this is guaranteed string
        const tidStr = tokenId;

        let cancelled = false;

        async function loadMeta() {
            try {
                setMetaStatus("loading");

                const nft = await getNft();
                const tid = BigInt(tidStr);
                const uri: string = await nft.tokenURI(tid);

                // Naive fetch; if you later use ipfs:// URIs you can map to a gateway here
                const resp = await fetch(uri);
                if (!resp.ok) {
                    throw new Error(`tokenURI fetch failed: ${resp.status}`);
                }
                const json = (await resp.json()) as NftMetadata;
                if (cancelled) return;
                setMetadata(json);
                setMetaStatus("success");
            } catch (err) {
                if (cancelled) return;
                console.error("Failed to load metadata", err);
                setMetaStatus("error");
            }
        }

        void loadMeta();
        return () => {
            cancelled = true;
        };
        // NOTE: intentionally NOT depending on getNft to avoid effect re-firing
        // if the hook returns a new function each render.
    }, [tokenId, hasProvider]);

    const events: ActivityEvent[] = details?.events ?? [];
    const collectible = details?.collectible ?? null;

    return (
        <div>
            {/* Back bar */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                    fontSize: "0.9rem",
                }}
            >
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    style={{
                        padding: "0.25rem 0.6rem",
                        borderRadius: "999px",
                        border: "1px solid #4b5563",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "0.85rem",
                    }}
                >
                    ← Back
                </button>
                <span style={{ color: "#9ca3af" }}>or</span>
                <Link to="/account">Back to Account</Link>
            </div>

            <h2>Collectible Details</h2>

            {!tokenId && <p>No tokenId provided in URL.</p>}

            {tokenId && (
                <p>
                    Viewing details for token <strong>#{tokenId}</strong>
                </p>
            )}

            {status === "loading" && <p>Loading collectible details…</p>}

            {status === "error" && (
                <p style={{ color: "red" }}>
                    Failed to load details: {error}
                </p>
            )}

            {status === "success" && !collectible && (
                <p>No collectible found for this tokenId in the indexer.</p>
            )}

            {status === "success" && collectible && (
                <>
                    {/* Top card: image + core metadata */}
                    <section
                        style={{
                            marginTop: "1rem",
                            marginBottom: "1.5rem",
                            padding: "1rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #2d3748",
                            display: "flex",
                            gap: "1rem",
                            alignItems: "flex-start",
                        }}
                    >
                        <div style={{ minWidth: "200px", minHeight: "200px" }}>
                            {metaStatus === "loading" && <p>Loading image…</p>}
                            {metaStatus === "error" && (
                                <div
                                    style={{
                                        width: "200px",
                                        height: "200px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        border: "1px dashed #4b5563",
                                        fontSize: "0.85rem",
                                        color: "#9ca3af",
                                    }}
                                >
                                    No image available
                                </div>
                            )}
                            {metaStatus === "success" && metadata?.image && (
                                <img
                                    src={metadata.image}
                                    alt={metadata.name ?? `Token ${tokenId}`}
                                    style={{
                                        width: "200px",
                                        height: "200px",
                                        objectFit: "cover",
                                        borderRadius: "0.5rem",
                                    }}
                                />
                            )}
                        </div>

                        <div>
                            <h3>{metadata?.name ?? `Token #${tokenId}`}</h3>
                            {metadata?.description && (
                                <p style={{ maxWidth: "32rem" }}>
                                    {metadata.description}
                                </p>
                            )}

                            <dl
                                style={{
                                    marginTop: "0.75rem",
                                    display: "grid",
                                    gridTemplateColumns: "auto 1fr",
                                    rowGap: "0.25rem",
                                    columnGap: "0.75rem",
                                    fontSize: "0.9rem",
                                }}
                            >
                                <dt style={{ fontWeight: 600 }}>Token ID</dt>
                                <dd>{collectible.tokenId ?? tokenId}</dd>

                                <dt style={{ fontWeight: 600 }}>RFID</dt>
                                <dd>{collectible.rfid ?? "—"}</dd>

                                <dt style={{ fontWeight: 600 }}>RFID Hash</dt>
                                <dd>{collectible.rfidHash}</dd>

                                <dt style={{ fontWeight: 600 }}>Authenticity hash</dt>
                                <dd>{collectible.authenticityHash ?? "—"}</dd>

                                <dt style={{ fontWeight: 600 }}>Current owner</dt>
                                <dd>
                                    {collectible.owner ? (
                                        <span title={collectible.owner}>
                                            {shortenAddress(collectible.owner, 6)}
                                        </span>
                                    ) : (
                                        "—"
                                    )}
                                </dd>

                                <dt style={{ fontWeight: 600 }}>Burned</dt>
                                <dd>{collectible.burned ? "Yes" : "No"}</dd>

                                <dt style={{ fontWeight: 600 }}>Redeemed</dt>
                                <dd>{collectible.redeemed ? "Yes" : "No"}</dd>
                            </dl>

                            {metadata?.attributes && metadata.attributes.length > 0 && (
                                <div
                                    style={{
                                        marginTop: "0.75rem",
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: "0.5rem",
                                    }}
                                >
                                    {metadata.attributes.map((attr, idx) => (
                                        <span
                                            key={idx}
                                            style={{
                                                borderRadius: "999px",
                                                border: "1px solid #4b5563",
                                                padding: "0.15rem 0.5rem",
                                                fontSize: "0.8rem",
                                            }}
                                        >
                                            {attr.trait_type
                                                ? `${attr.trait_type}: ${attr.value}`
                                                : attr.value}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Event timeline */}
                    <section style={{ marginTop: "1rem" }}>
                        <h3>Event Timeline</h3>

                        {events.length === 0 && (
                            <p>No events recorded for this collectible.</p>
                        )}

                        {events.length > 0 && (
                            <div className="table-wrapper">
                                <table className="listing-table">
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Block</th>
                                            <th>Event</th>
                                            <th>Price</th>
                                            <th>From</th>
                                            <th>To / Owner</th>
                                            <th>Tx</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {events.map((ev) => {
                                            const when = new Date(
                                                ev.createdAt,
                                            ).toLocaleString();
                                            const from = ev.seller ?? null;
                                            const to = ev.buyer ?? ev.owner ?? null;

                                            return (
                                                <tr key={`${ev.tx}-${ev.logIndex}`}>
                                                    <td>{when}</td>
                                                    <td>{ev.block}</td>
                                                    <td>{ev.eventName}</td>
                                                    <td>{formatUsdc(ev.price ?? null)}</td>
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
                </>
            )}
        </div>
    );
}
