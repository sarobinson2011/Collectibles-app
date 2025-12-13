// src/infra/db.ts

import Database from "better-sqlite3";
import fs from "fs";
import { dirname, join } from "path";
import { env } from "../config/env.js";

// Ensure the log dir exists (same dir we use for JSONL)
const dbDir = dirname(join(env.LOG_DIR, "dummy"));
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const DB_PATH = join(env.LOG_DIR, "collectibles.db");
export const db: any = new Database(DB_PATH);

// Basic pragmas for durability + concurrency
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// -----------------
// Types (API shapes)
// -----------------

export type ListingLike = {
    nft: string;
    tokenId: string;
    seller: string;
    price: string;
    buyer: string | null;
    active: boolean;
    lastEvent: string;
    lastUpdateBlock: number;
    lastUpdateTx: string;
};

export type CollectibleLike = {
    rfidHash: string;
    rfid?: string;
    tokenId?: string;
    owner?: string;
    authenticityHash?: string;
    burned: boolean;
    redeemed: boolean;
    lastEvent: string;
    lastUpdateBlock: number;
    lastUpdateTx: string;
};

export type ActivityEvent = {
    contract: "registry" | "nft" | "market";
    eventName: string;
    rfidHash?: string;
    nft?: string;
    tokenId?: string;
    seller?: string;
    buyer?: string;
    owner?: string;
    price?: string;
    block: number;
    tx: string;
    logIndex: number;
    createdAt: number;
};

// New: image type for primary collectible image
export type CollectibleImageLike = {
    rfidHash: string;
    originalUrl: string;
    detailUrl: string;
    cardUrl: string;
    thumbUrl: string;
    width: number;      // width of the processed "original" variant
    height: number;     // height of the processed "original" variant
    createdAt: number;  // unix ms timestamp
};

// -----------------
// Schema
// -----------------

db.exec(`
CREATE TABLE IF NOT EXISTS listings (
    nft TEXT NOT NULL,
    token_id TEXT NOT NULL,
    seller TEXT NOT NULL,
    price TEXT NOT NULL,
    buyer TEXT,
    active INTEGER NOT NULL,
    last_event TEXT NOT NULL,
    last_update_block INTEGER NOT NULL,
    last_update_tx TEXT NOT NULL,
    PRIMARY KEY (nft, token_id)
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS collectibles (
    rfid_hash TEXT PRIMARY KEY,
    rfid TEXT,
    token_id TEXT,
    owner TEXT,
    authenticity_hash TEXT,
    burned INTEGER NOT NULL,
    redeemed INTEGER NOT NULL,
    last_event TEXT NOT NULL,
    last_update_block INTEGER NOT NULL,
    last_update_tx TEXT NOT NULL
);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract TEXT NOT NULL,
    event_name TEXT NOT NULL,
    rfid_hash TEXT,
    nft TEXT,
    token_id TEXT,
    seller TEXT,
    buyer TEXT,
    owner TEXT,
    price TEXT,
    block INTEGER NOT NULL,
    tx TEXT NOT NULL,
    log_index INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
`);

// New: one primary image per collectible (rfid_hash)
db.exec(`
CREATE TABLE IF NOT EXISTS collectible_images (
    rfid_hash TEXT PRIMARY KEY,
    original_url TEXT NOT NULL,
    detail_url TEXT NOT NULL,
    card_url TEXT NOT NULL,
    thumb_url TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (rfid_hash) REFERENCES collectibles(rfid_hash)
);
`);

// -----------------
// Mapping helpers
// -----------------

function rowToListing(row: any): ListingLike {
    return {
        nft: row.nft,
        tokenId: row.token_id,
        seller: row.seller,
        price: row.price,
        buyer: row.buyer ?? null,
        active: !!row.active,
        lastEvent: row.last_event,
        lastUpdateBlock: row.last_update_block,
        lastUpdateTx: row.last_update_tx,
    };
}

function rowToCollectible(row: any): CollectibleLike {
    return {
        rfidHash: row.rfid_hash,
        rfid: row.rfid ?? undefined,
        tokenId: row.token_id ?? undefined,
        owner: row.owner ?? undefined,
        authenticityHash: row.authenticity_hash ?? undefined,
        burned: !!row.burned,
        redeemed: !!row.redeemed,
        lastEvent: row.last_event,
        lastUpdateBlock: row.last_update_block,
        lastUpdateTx: row.last_update_tx,
    };
}

function rowToActivity(row: any): ActivityEvent {
    const ev: ActivityEvent = {
        contract: row.contract,
        eventName: row.event_name,
        block: row.block,
        tx: row.tx,
        logIndex: row.log_index,
        createdAt: row.created_at,
    };

    if (row.rfid_hash != null) ev.rfidHash = row.rfid_hash;
    if (row.nft != null) ev.nft = row.nft;
    if (row.token_id != null) ev.tokenId = row.token_id;
    if (row.seller != null) ev.seller = row.seller;
    if (row.buyer != null) ev.buyer = row.buyer;
    if (row.owner != null) ev.owner = row.owner;
    if (row.price != null) ev.price = row.price;

    return ev;
}

// New: image row mapping
function rowToCollectibleImage(row: any): CollectibleImageLike {
    return {
        rfidHash: row.rfid_hash,
        originalUrl: row.original_url,
        detailUrl: row.detail_url,
        cardUrl: row.card_url,
        thumbUrl: row.thumb_url,
        width: row.width,
        height: row.height,
        createdAt: row.created_at,
    };
}

// -----------------
// Listings helpers
// -----------------

const upsertListingStmt = db.prepare(`
INSERT INTO listings (
    nft, token_id, seller, price, buyer, active,
    last_event, last_update_block, last_update_tx
) VALUES (
    @nft, @token_id, @seller, @price, @buyer, @active,
    @last_event, @last_update_block, @last_update_tx
)
ON CONFLICT (nft, token_id) DO UPDATE SET
    seller = excluded.seller,
    price = excluded.price,
    buyer = excluded.buyer,
    active = excluded.active,
    last_event = excluded.last_event,
    last_update_block = excluded.last_update_block,
    last_update_tx = excluded.last_update_tx;
`);

export function upsertListingDb(l: ListingLike): void {
    upsertListingStmt.run({
        nft: l.nft,
        token_id: l.tokenId,
        seller: l.seller,
        price: l.price,
        buyer: l.buyer ?? null,
        active: l.active ? 1 : 0,
        last_event: l.lastEvent,
        last_update_block: l.lastUpdateBlock,
        last_update_tx: l.lastUpdateTx,
    });
}

const selectActiveListingsStmt = db.prepare(`
SELECT
    nft,
    token_id,
    seller,
    price,
    buyer,
    active,
    last_event,
    last_update_block,
    last_update_tx
FROM listings
WHERE active = 1
ORDER BY last_update_block DESC, last_update_tx DESC;
`);

export function getActiveListingsDb(): ListingLike[] {
    const rows = selectActiveListingsStmt.all() as any[];
    return rows.map(rowToListing);
}

// -----------------
// Collectibles helpers
// -----------------

const upsertCollectibleStmt = db.prepare(`
INSERT INTO collectibles (
    rfid_hash, rfid, token_id, owner, authenticity_hash,
    burned, redeemed, last_event, last_update_block, last_update_tx
) VALUES (
    @rfid_hash, @rfid, @token_id, @owner, @authenticity_hash,
    @burned, @redeemed, @last_event, @last_update_block, @last_update_tx
)
ON CONFLICT (rfid_hash) DO UPDATE SET
    rfid = excluded.rfid,
    token_id = excluded.token_id,
    owner = excluded.owner,
    authenticity_hash = excluded.authenticity_hash,
    burned = excluded.burned,
    redeemed = excluded.redeemed,
    last_event = excluded.last_event,
    last_update_block = excluded.last_update_block,
    last_update_tx = excluded.last_update_tx;
`);

export function upsertCollectibleDb(c: CollectibleLike): void {
    upsertCollectibleStmt.run({
        rfid_hash: c.rfidHash.toLowerCase(),
        rfid: c.rfid ?? null,
        token_id: c.tokenId ?? null,
        owner: c.owner ?? null,
        authenticity_hash: c.authenticityHash ?? null,
        burned: c.burned ? 1 : 0,
        redeemed: c.redeemed ? 1 : 0,
        last_event: c.lastEvent,
        last_update_block: c.lastUpdateBlock,
        last_update_tx: c.lastUpdateTx,
    });
}

const selectAllCollectiblesStmt = db.prepare(`
SELECT
    rfid_hash,
    rfid,
    token_id,
    owner,
    authenticity_hash,
    burned,
    redeemed,
    last_event,
    last_update_block,
    last_update_tx
FROM collectibles;
`);

export function getAllCollectiblesDb(): CollectibleLike[] {
    const rows = selectAllCollectiblesStmt.all() as any[];
    return rows.map(rowToCollectible);
}

const selectCollectiblesByOwnerStmt = db.prepare(`
SELECT
    rfid_hash,
    rfid,
    token_id,
    owner,
    authenticity_hash,
    burned,
    redeemed,
    last_event,
    last_update_block,
    last_update_tx
FROM collectibles
WHERE LOWER(owner) = LOWER(?);
`);

export function getCollectiblesByOwnerDb(owner: string): CollectibleLike[] {
    const rows = selectCollectiblesByOwnerStmt.all(owner) as any[];
    return rows.map(rowToCollectible);
}

export function collectibleExistsByRfidHashDb(rfidHash: string): boolean {
    const norm = rfidHash.toLowerCase();
    const stmt = db.prepare(`
        SELECT 1
        FROM collectibles
        WHERE LOWER(rfid_hash) = ?
        LIMIT 1;
    `);
    const row = stmt.get(norm) as any | undefined;
    return !!row;
}

// -----------------
// Activity helpers
// -----------------

const insertEventStmt = db.prepare(`
INSERT INTO activity_events (
    contract,
    event_name,
    rfid_hash,
    nft,
    token_id,
    seller,
    buyer,
    owner,
    price,
    block,
    tx,
    log_index,
    created_at
) VALUES (
    @contract,
    @event_name,
    @rfid_hash,
    @nft,
    @token_id,
    @seller,
    @buyer,
    @owner,
    @price,
    @block,
    @tx,
    @log_index,
    @created_at
);
`);

export function insertEventDb(ev: ActivityEvent): void {
    insertEventStmt.run({
        contract: ev.contract,
        event_name: ev.eventName,
        rfid_hash: ev.rfidHash ?? null,
        nft: ev.nft ?? null,
        token_id: ev.tokenId ?? null,
        seller: ev.seller ?? null,
        buyer: ev.buyer ?? null,
        owner: ev.owner ?? null,
        price: ev.price ?? null,
        block: ev.block,
        tx: ev.tx,
        log_index: ev.logIndex,
        created_at: ev.createdAt,
    });
}

const selectActivityByAddressStmt = db.prepare(`
SELECT
    contract,
    event_name,
    rfid_hash,
    nft,
    token_id,
    seller,
    buyer,
    owner,
    price,
    block,
    tx,
    log_index,
    created_at
FROM activity_events
WHERE LOWER(seller) = LOWER(?)
   OR LOWER(buyer) = LOWER(?)
   OR LOWER(owner) = LOWER(?)
ORDER BY block DESC, log_index DESC;
`);

export function getActivityByAddressDb(address: string): ActivityEvent[] {
    const rows = selectActivityByAddressStmt.all(address, address, address) as any[];
    return rows.map(rowToActivity);
}

// -----------------------------
// Collectible details helpers
// -----------------------------

// For the details endpoints we just reuse the same API-facing types
export type CollectibleDetailsResult = {
    collectible: CollectibleLike | null;
    events: ActivityEvent[];
};

export function getCollectibleDetailsByTokenIdDb(
    tokenId: string,
): CollectibleDetailsResult {
    const collectibleRowStmt = db.prepare(`
        SELECT
            rfid_hash,
            rfid,
            token_id,
            owner,
            authenticity_hash,
            burned,
            redeemed,
            last_event,
            last_update_block,
            last_update_tx
        FROM collectibles
        WHERE token_id = ?
        LIMIT 1;
    `);

    const row = collectibleRowStmt.get(tokenId) as any | undefined;
    const collectible = row ? rowToCollectible(row) : null;

    const rfidHashNorm = collectible?.rfidHash
        ? collectible.rfidHash.toLowerCase()
        : "";

    const eventsStmt: any = db.prepare(`
        SELECT
            contract,
            event_name,
            rfid_hash,
            nft,
            token_id,
            seller,
            buyer,
            owner,
            price,
            block,
            tx,
            log_index,
            created_at
        FROM activity_events
        WHERE token_id = ?
           OR (rfid_hash IS NOT NULL AND LOWER(rfid_hash) = ?)
        ORDER BY block ASC, log_index ASC;
    `);

    const eventsRows = eventsStmt.all(tokenId, rfidHashNorm) as any[];
    const events = eventsRows.map(rowToActivity);

    return { collectible, events };
}

export function getCollectibleDetailsByRfidHashDb(
    rfidHash: string,
): CollectibleDetailsResult {
    const norm = rfidHash.toLowerCase();

    const collectibleRowStmt = db.prepare(`
        SELECT
            rfid_hash,
            rfid,
            token_id,
            owner,
            authenticity_hash,
            burned,
            redeemed,
            last_event,
            last_update_block,
            last_update_tx
        FROM collectibles
        WHERE LOWER(rfid_hash) = ?
        LIMIT 1;
    `);

    const row = collectibleRowStmt.get(norm) as any | undefined;
    const collectible = row ? rowToCollectible(row) : null;
    const tokenIdFilter = collectible?.tokenId ?? "";

    const eventsStmt: any = db.prepare(`
        SELECT
            contract,
            event_name,
            rfid_hash,
            nft,
            token_id,
            seller,
            buyer,
            owner,
            price,
            block,
            tx,
            log_index,
            created_at
        FROM activity_events
        WHERE (rfid_hash IS NOT NULL AND LOWER(rfid_hash) = ?)
           OR (token_id IS NOT NULL AND token_id = ?)
        ORDER BY block ASC, log_index ASC;
    `);

    const eventsRows = eventsStmt.all(norm, tokenIdFilter) as any[];
    const events = eventsRows.map(rowToActivity);

    return { collectible, events };
}

// -----------------------------
// Collectible image helpers
// -----------------------------

const upsertCollectibleImageStmt = db.prepare(`
INSERT INTO collectible_images (
    rfid_hash,
    original_url,
    detail_url,
    card_url,
    thumb_url,
    width,
    height,
    created_at
) VALUES (
    @rfid_hash,
    @original_url,
    @detail_url,
    @card_url,
    @thumb_url,
    @width,
    @height,
    @created_at
)
ON CONFLICT (rfid_hash) DO UPDATE SET
    original_url = excluded.original_url,
    detail_url   = excluded.detail_url,
    card_url     = excluded.card_url,
    thumb_url    = excluded.thumb_url,
    width        = excluded.width,
    height       = excluded.height,
    created_at   = excluded.created_at;
`);

/**
 * Upsert the primary image for a collectible (by rfid_hash).
 * Call this from your image upload endpoint after you have generated
 * all variants and know the final URLs + dimensions.
 */
export function upsertCollectibleImageDb(img: CollectibleImageLike): void {
    upsertCollectibleImageStmt.run({
        rfid_hash: img.rfidHash.toLowerCase(),
        original_url: img.originalUrl,
        detail_url: img.detailUrl,
        card_url: img.cardUrl,
        thumb_url: img.thumbUrl,
        width: img.width,
        height: img.height,
        created_at: img.createdAt,
    });
}

const selectCollectibleImageByRfidHashStmt = db.prepare(`
SELECT
    rfid_hash,
    original_url,
    detail_url,
    card_url,
    thumb_url,
    width,
    height,
    created_at
FROM collectible_images
WHERE LOWER(rfid_hash) = ?
LIMIT 1;
`);

/**
 * Fetch the primary image for a collectible by RFID hash.
 * You can call this in your details / listing services to attach
 * image URLs to the payload you send to the frontend.
 */
export function getCollectibleImageByRfidHashDb(
    rfidHash: string,
): CollectibleImageLike | null {
    const norm = rfidHash.toLowerCase();
    const row = selectCollectibleImageByRfidHashStmt.get(norm) as any | undefined;
    return row ? rowToCollectibleImage(row) : null;
}
