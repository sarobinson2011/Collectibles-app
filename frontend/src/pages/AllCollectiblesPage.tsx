// src/pages/AllCollectiblesPage.tsx

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    fetchCollectibles,
    fetchListings,
    type Collectible,
} from "../api";
import { NFT_ADDRESS } from "../eth/config";

type Status = "idle" | "loading" | "success" | "error";

type CollectiblesState = {
    status: Status;
    data: Collectible[];
    error: string | null;
};

type ViewMode = "grid" | "list";
type SortKey = "tokenId" | "owner" | "rfid";
type SortDir = "asc" | "desc";

// Show ~9 items as a clean 3x3 grid on desktop
const PAGE_SIZE = 9;

function truncateHash(value?: string, shown = 10): string {
    if (!value) return "—";
    if (value.length <= shown + 4) return value;
    const prefix = value.slice(0, shown);
    const suffix = value.slice(-4);
    return `${prefix}…${suffix}`;
}

function shortenAddress(addr?: string, chars = 4): string {
    if (!addr) return "—";
    const prefix = addr.slice(0, 2 + chars);
    const suffix = addr.slice(-chars);
    return `${prefix}…${suffix}`;
}

type PillTone = "danger" | "warning" | "info" | "muted";

function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
    let bg = "rgba(148, 163, 184, 0.1)";
    let border = "rgba(148, 163, 184, 0.4)";
    let color = "#cbd5f5";

    if (tone === "danger") {
        bg = "rgba(248, 113, 113, 0.12)";
        border = "rgba(248, 113, 113, 0.5)";
        color = "#fecaca";
    } else if (tone === "warning") {
        bg = "rgba(234, 179, 8, 0.12)";
        border = "rgba(234, 179, 8, 0.5)";
        color = "#fef9c3";
    } else if (tone === "info") {
        bg = "rgba(56, 189, 248, 0.12)";
        border = "rgba(56, 189, 248, 0.5)";
        color = "#e0f2fe";
    }

    return (
        <span
            style={{
                padding: "0.2rem 0.5rem",
                borderRadius: "999px",
                border: `1px solid ${border}`,
                backgroundColor: bg,
                color,
            }}
        >
            {label}
        </span>
    );
}

export function AllCollectiblesPage() {
    const [state, setState] = useState<CollectiblesState>({
        status: "idle",
        data: [],
        error: null,
    });

    const [listedMap, setListedMap] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState<string>("");

    const [viewMode, setViewMode] = useState<ViewMode>("grid");
    const [sortKey, setSortKey] = useState<SortKey>("tokenId");
    const [sortDir, setSortDir] = useState<SortDir>("asc");
    const [currentPage, setCurrentPage] = useState<number>(1);

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

    const normalizedSearch = searchTerm.trim().toLowerCase();

    // 1) Filter
    const filteredData =
        normalizedSearch.length === 0
            ? state.data
            : state.data.filter((c) => {
                const tokenId = (c.tokenId ?? "").toString();
                const tokenIdDisplay = tokenId ? `#${tokenId}` : "";
                const rfid = c.rfid ?? "";
                const rfidHash = c.rfidHash ?? "";
                const authenticityHash = c.authenticityHash ?? "";
                const ownerAddr = c.owner ?? "";

                const haystack = [
                    tokenId,
                    tokenIdDisplay,
                    rfid,
                    rfidHash,
                    authenticityHash,
                    ownerAddr,
                ]
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(normalizedSearch);
            });

    // 2) Sort
    const sortedData = [...filteredData].sort((a, b) => {
        const dirFactor = sortDir === "asc" ? 1 : -1;

        if (sortKey === "tokenId") {
            const aNum = Number(a.tokenId ?? "0");
            const bNum = Number(b.tokenId ?? "0");
            if (Number.isNaN(aNum) && Number.isNaN(bNum)) return 0;
            if (Number.isNaN(aNum)) return 1 * dirFactor;
            if (Number.isNaN(bNum)) return -1 * dirFactor;
            if (aNum === bNum) return 0;
            return aNum < bNum ? -1 * dirFactor : 1 * dirFactor;
        }

        if (sortKey === "owner") {
            const aOwner = (a.owner ?? "").toLowerCase();
            const bOwner = (b.owner ?? "").toLowerCase();
            if (!aOwner && !bOwner) return 0;
            if (!aOwner) return 1 * dirFactor;
            if (!bOwner) return -1 * dirFactor;
            return aOwner.localeCompare(bOwner) * dirFactor;
        }

        // sortKey === "rfid"
        const aRfid = (a.rfid ?? "").toLowerCase();
        const bRfid = (b.rfid ?? "").toLowerCase();
        if (!aRfid && !bRfid) return 0;
        if (!aRfid) return 1 * dirFactor;
        if (!bRfid) return -1 * dirFactor;
        return aRfid.localeCompare(bRfid) * dirFactor;
    });

    // 3) Pagination
    const totalPages =
        sortedData.length === 0 ? 1 : Math.ceil(sortedData.length / PAGE_SIZE);
    const safePage =
        currentPage > totalPages ? totalPages : currentPage < 1 ? 1 : currentPage;
    const startIndex = (safePage - 1) * PAGE_SIZE;
    const pageItems = sortedData.slice(startIndex, startIndex + PAGE_SIZE);

    function handleSearchChange(value: string) {
        setSearchTerm(value);
        setCurrentPage(1);
    }

    function handleSortKeyChange(value: SortKey) {
        setSortKey(value);
        setCurrentPage(1);
    }

    function handleSortDirChange(value: SortDir) {
        setSortDir(value);
        setCurrentPage(1);
    }

    function handleViewModeChange(mode: ViewMode) {
        setViewMode(mode);
    }

    return (
        <div
            style={{
                // prevent “giant cards” on wide screens
                maxWidth: "1200px",
                margin: "0 auto",
                padding: "0 1rem",
            }}
        >
            {/* Grid styling with breakpoints */}
            <style>{`
                .collectibles-grid {
                    margin-top: 0.75rem;
                    display: grid;
                    grid-template-columns: repeat(1, minmax(0, 1fr));
                    gap: 1rem;
                    align-items: start;
                }
                @media (min-width: 680px) {
                    .collectibles-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (min-width: 1024px) {
                    .collectibles-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                .collectible-card {
                    border-radius: 0.75rem;
                    border: 1px solid #1f2937;
                    background: #020617;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    min-width: 0; /* helps prevent overflow in grid cells */
                }
            `}</style>

            <h2>All Collectibles</h2>
            <p>All collectibles indexed from the registry and NFT events.</p>

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
                <>
                    {/* Controls row */}
                    <div
                        style={{
                            marginTop: "1rem",
                            marginBottom: "0.75rem",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "0.75rem",
                            alignItems: "center",
                        }}
                    >
                        {/* Search */}
                        <input
                            type="text"
                            placeholder="Search by token ID (e.g. 9 or #9), RFID, hash, or owner…"
                            value={searchTerm}
                            onChange={(e) => handleSearchChange(e.target.value)}
                            style={{
                                minWidth: "260px",
                            }}
                        />

                        {/* Sort controls */}
                        <div
                            style={{
                                display: "flex",
                                gap: "0.4rem",
                                alignItems: "center",
                                fontSize: "0.8rem",
                            }}
                        >
                            <span style={{ opacity: 0.7 }}>Sort by</span>
                            <select
                                value={sortKey}
                                onChange={(e) =>
                                    handleSortKeyChange(e.target.value as SortKey)
                                }
                            >
                                <option value="tokenId">Token ID</option>
                                <option value="owner">Owner</option>
                                <option value="rfid">RFID</option>
                            </select>

                            <select
                                value={sortDir}
                                onChange={(e) =>
                                    handleSortDirChange(e.target.value as SortDir)
                                }
                            >
                                <option value="asc">Ascending</option>
                                <option value="desc">Descending</option>
                            </select>
                        </div>

                        {/* View toggle */}
                        <div
                            style={{
                                marginLeft: "auto",
                                display: "flex",
                                borderRadius: "999px",
                                border: "1px solid #1f2937",
                                overflow: "hidden",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => handleViewModeChange("grid")}
                                style={{
                                    padding: "0.25rem 0.7rem",
                                    fontSize: "0.8rem",
                                    border: "none",
                                    borderRight: "1px solid #1f2937",
                                    backgroundColor:
                                        viewMode === "grid" ? "#1d4ed8" : "transparent",
                                    color: viewMode === "grid" ? "#e5e7eb" : "#9ca3af",
                                }}
                            >
                                Grid
                            </button>
                            <button
                                type="button"
                                onClick={() => handleViewModeChange("list")}
                                style={{
                                    padding: "0.25rem 0.7rem",
                                    fontSize: "0.8rem",
                                    border: "none",
                                    backgroundColor:
                                        viewMode === "list" ? "#1d4ed8" : "transparent",
                                    color: viewMode === "list" ? "#e5e7eb" : "#9ca3af",
                                }}
                            >
                                List
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div
                        style={{
                            fontSize: "0.8rem",
                            opacity: 0.7,
                            marginBottom: "0.5rem",
                        }}
                    >
                        Showing {pageItems.length} of {sortedData.length} filtered
                        collectibles (total indexed: {state.data.length})
                    </div>

                    {sortedData.length === 0 ? (
                        <p>No collectibles match your search.</p>
                    ) : viewMode === "grid" ? (
                        // GRID VIEW
                        <div className="collectibles-grid">
                            {pageItems.map((c) => {
                                const cardKey = `${c.rfidHash}-${c.tokenId ?? "na"}`;
                                const listingKey = keyForCollectible(c);
                                const isListed = listedMap[listingKey] === true;
                                const tokenLabel = c.tokenId ? `#${c.tokenId}` : "Unassigned";

                                const imageUrl = c.imageCardUrl ?? c.imageThumbUrl ?? null;

                                return (
                                    <div key={cardKey} className="collectible-card">
                                        {/* Thumbnail header with fixed aspect ratio */}
                                        <div
                                            style={{
                                                aspectRatio: "3 / 4",
                                                overflow: "hidden",
                                                borderBottom: "1px solid #1f2937",
                                                background: imageUrl
                                                    ? "#020617"
                                                    : "radial-gradient(circle at 0% 0%, #1e293b, transparent 55%), radial-gradient(circle at 100% 100%, #0f172a, transparent 55%)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                            }}
                                        >
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={tokenLabel}
                                                    loading="lazy"
                                                    style={{
                                                        width: "100%",
                                                        height: "100%",
                                                        objectFit: "cover",
                                                        display: "block",
                                                    }}
                                                />
                                            ) : (
                                                <div
                                                    style={{
                                                        fontSize: "1.4rem",
                                                        fontWeight: 600,
                                                        color: "#e5e7eb",
                                                    }}
                                                >
                                                    {c.tokenId ? (
                                                        <Link
                                                            to={`/collectible/${c.tokenId}`}
                                                            style={{
                                                                color: "inherit",
                                                                textDecoration: "none",
                                                            }}
                                                        >
                                                            {tokenLabel}
                                                        </Link>
                                                    ) : (
                                                        tokenLabel
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Card body */}
                                        <div
                                            style={{
                                                padding: "0.9rem 1rem 0.8rem",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "0.4rem",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                    fontSize: "0.85rem",
                                                    marginBottom: "0.2rem",
                                                }}
                                            >
                                                <span style={{ opacity: 0.8 }}>Token ID</span>
                                                <span>
                                                    {c.tokenId ? (
                                                        <Link
                                                            to={`/collectible/${c.tokenId}`}
                                                            style={{
                                                                color: "#60a5fa",
                                                                textDecoration: "none",
                                                            }}
                                                        >
                                                            {tokenLabel}
                                                        </Link>
                                                    ) : (
                                                        tokenLabel
                                                    )}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                <span style={{ opacity: 0.8 }}>RFID</span>
                                                <span>{c.rfid ?? "—"}</span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                <span style={{ opacity: 0.8 }}>RFID Hash</span>
                                                <span
                                                    title={c.rfidHash}
                                                    style={{
                                                        fontFamily:
                                                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                                    }}
                                                >
                                                    {truncateHash(c.rfidHash)}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                <span style={{ opacity: 0.8 }}>Authenticity</span>
                                                <span
                                                    title={c.authenticityHash}
                                                    style={{
                                                        fontFamily:
                                                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                                    }}
                                                >
                                                    {truncateHash(c.authenticityHash)}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    gap: "0.5rem",
                                                    fontSize: "0.85rem",
                                                }}
                                            >
                                                <span style={{ opacity: 0.8 }}>Owner</span>
                                                <span
                                                    title={c.owner}
                                                    style={{
                                                        fontFamily:
                                                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                                    }}
                                                >
                                                    {shortenAddress(c.owner ?? undefined, 4)}
                                                </span>
                                            </div>

                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexWrap: "wrap",
                                                    gap: "0.35rem",
                                                    marginTop: "0.6rem",
                                                    fontSize: "0.75rem",
                                                }}
                                            >
                                                <StatusPill
                                                    label={c.burned ? "Burned" : "Not burned"}
                                                    tone={c.burned ? "danger" : "muted"}
                                                />
                                                <StatusPill
                                                    label={c.redeemed ? "Redeemed" : "Not redeemed"}
                                                    tone={c.redeemed ? "warning" : "muted"}
                                                />
                                                <StatusPill
                                                    label={isListed ? "Listed for sale" : "Not listed"}
                                                    tone={isListed ? "info" : "muted"}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        // LIST VIEW
                        <div className="table-wrapper" style={{ marginTop: "0.75rem" }}>
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
                                    {pageItems.map((c) => {
                                        const rowKey = `${c.rfidHash}-${c.tokenId ?? "na"}`;
                                        const listingKey = keyForCollectible(c);
                                        const isListed = listedMap[listingKey] === true;

                                        return (
                                            <tr key={rowKey}>
                                                <td className="cell-short">
                                                    {c.tokenId ? (
                                                        <Link to={`/collectible/${c.tokenId}`}>
                                                            {c.tokenId}
                                                        </Link>
                                                    ) : (
                                                        "?"
                                                    )}
                                                </td>
                                                <td className="cell-short">{c.rfid ?? "—"}</td>
                                                <td className="cell-hash" title={c.rfidHash}>
                                                    {c.rfidHash}
                                                </td>
                                                <td className="cell-hash" title={c.authenticityHash}>
                                                    {c.authenticityHash}
                                                </td>
                                                <td title={c.owner}>{c.owner ?? "—"}</td>
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

                    {/* Pagination controls */}
                    {sortedData.length > 0 && (
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "0.75rem",
                                marginTop: "1rem",
                                fontSize: "0.85rem",
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => (p > 1 ? p - 1 : p))}
                                disabled={safePage <= 1}
                            >
                                Previous
                            </button>
                            <span>
                                Page {safePage} of {totalPages}
                            </span>
                            <button
                                type="button"
                                onClick={() => setCurrentPage((p) => (p < totalPages ? p + 1 : p))}
                                disabled={safePage >= totalPages}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
