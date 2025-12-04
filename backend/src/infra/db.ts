// src/infra/db.ts

import Database from "better-sqlite3";
import { join } from "path";
import { env } from "../config/env.js";

// Where to store the SQLite DB file (alongside your JSONL logs)
const DB_PATH = join(env.LOG_DIR, "state.db");

// Open connection
const db = new Database(DB_PATH);

// Pragmas: safe defaults for your use case
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");

// ----------------------
// Schema setup
// ----------------------

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

// ----------------------
// TS-facing types
// ----------------------

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

// Row types as stored in SQLite

type ListingRow = {
    nft: string;
    token_id: string;
    seller: string;
    price: string;
    buyer: string | null;
    active: number;
    last_event: string;
    last_update_block: number;
    last_update_tx: string;
};

type CollectibleRow = {
    rfid_hash: string;
    rfid: string | null;
    token_id: string | null;
    owner: string | null;
    authenticity_hash: string | null;
    burned: number;
    redeemed: number;
    last_event: string;
    last_update_block: number;
    last_update_tx: string;
};

// ----------------------
// Write helpers (upserts)
// ----------------------

const upsertListingStmt = db.prepare(`
INSERT INTO listings (
    nft, token_id, seller, price, buyer, active, last_event, last_update_block, last_update_tx
) VALUES (
    @nft, @token_id, @seller, @price, @buyer, @active, @last_event, @last_update_block, @last_update_tx
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
        nft: l.nft.toLowerCase(),
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

// ----------------------
// Read helpers (API use)
// ----------------------

// Active listings (for /listings)
const selectActiveListingsStmt = db.prepare(`
SELECT *
FROM listings
WHERE active = 1
ORDER BY last_update_block DESC, last_update_tx DESC;
`);

export function getActiveListingsDb(): ListingLike[] {
    const rows = selectActiveListingsStmt.all() as ListingRow[];

    return rows.map((r) => ({
        nft: r.nft,
        tokenId: r.token_id,
        seller: r.seller,
        price: r.price,
        buyer: r.buyer,
        active: r.active === 1,
        lastEvent: r.last_event,
        lastUpdateBlock: r.last_update_block,
        lastUpdateTx: r.last_update_tx,
    }));
}

// All collectibles (for /collectibles)
const selectAllCollectiblesStmt = db.prepare(`
SELECT *
FROM collectibles
ORDER BY last_update_block DESC, last_update_tx DESC;
`);

export function getAllCollectiblesDb(): CollectibleLike[] {
    const rows = selectAllCollectiblesStmt.all() as CollectibleRow[];

    return rows.map((r) => {
        const c: CollectibleLike = {
            rfidHash: r.rfid_hash,
            burned: r.burned === 1,
            redeemed: r.redeemed === 1,
            lastEvent: r.last_event,
            lastUpdateBlock: r.last_update_block,
            lastUpdateTx: r.last_update_tx,
        };

        if (r.rfid !== null) {
            c.rfid = r.rfid;
        }
        if (r.token_id !== null) {
            c.tokenId = r.token_id;
        }
        if (r.owner !== null) {
            c.owner = r.owner;
        }
        if (r.authenticity_hash !== null) {
            c.authenticityHash = r.authenticity_hash;
        }

        return c;
    });
}

// Collectibles by owner (for /owner/:address)
const selectCollectiblesByOwnerStmt = db.prepare(`
SELECT *
FROM collectibles
WHERE LOWER(owner) = LOWER(@owner)
ORDER BY last_update_block DESC, last_update_tx DESC;
`);

export function getCollectiblesByOwnerDb(owner: string): CollectibleLike[] {
    const rows = selectCollectiblesByOwnerStmt.all({ owner }) as CollectibleRow[];

    return rows.map((r) => {
        const c: CollectibleLike = {
            rfidHash: r.rfid_hash,
            burned: r.burned === 1,
            redeemed: r.redeemed === 1,
            lastEvent: r.last_event,
            lastUpdateBlock: r.last_update_block,
            lastUpdateTx: r.last_update_tx,
        };

        if (r.rfid !== null) {
            c.rfid = r.rfid;
        }
        if (r.token_id !== null) {
            c.tokenId = r.token_id;
        }
        if (r.owner !== null) {
            c.owner = r.owner;
        }
        if (r.authenticity_hash !== null) {
            c.authenticityHash = r.authenticity_hash;
        }

        return c;
    });
}
