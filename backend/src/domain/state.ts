// src/domain/state.ts

import {
    upsertListingDb,
    upsertCollectibleDb,
    insertEventDb,
    type ActivityEvent,
    getCollectibleImageByRfidHashDb,
} from "../infra/db.js";

// ------------------------
// Common indexed event type
// ------------------------

export type IndexedEvent = {
    t: number;
    contract: "registry" | "nft" | "market";
    event: string;
    args: any;
    tx: string;
    block: number;
    logIndex: number;
};

// ------------------------
// Marketplace listing state
// ------------------------

export type Listing = {
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

const listings = new Map<string, Listing>(); // key: `${nft.toLowerCase()}:${tokenId}`

function listingKey(nft: string, tokenId: string | number | bigint): string {
    return `${nft.toLowerCase()}:${tokenId.toString()}`;
}

export function getActiveListings(): Listing[] {
    return Array.from(listings.values()).filter((l) => l.active);
}

// ------------------------
// Collectible state (registry + NFT)
// ------------------------

export type Collectible = {
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

// NEW: Collectible shape including image URLs for UI
export type CollectibleWithImage = Collectible & {
    imageThumbUrl: string | null;
    imageCardUrl: string | null;
    imageDetailUrl: string | null;
};

const collectiblesByRfidHash = new Map<string, Collectible>();
const tokenIdToRfidHash = new Map<string, string>();

function normalizeHash(hash: string): string {
    return hash.toLowerCase();
}

function getOrInitCollectible(rfidHash: string, ev: IndexedEvent): Collectible {
    const key = normalizeHash(rfidHash);
    let c = collectiblesByRfidHash.get(key);
    if (!c) {
        c = {
            rfidHash,
            burned: false,
            redeemed: false,
            lastEvent: "",
            lastUpdateBlock: 0,
            lastUpdateTx: "",
        };
        collectiblesByRfidHash.set(key, c);
    }
    c.lastEvent = ev.event;
    c.lastUpdateBlock = ev.block;
    c.lastUpdateTx = ev.tx;
    return c;
}

export function getAllCollectibles(): Collectible[] {
    return Array.from(collectiblesByRfidHash.values());
}

export function getCollectiblesByOwner(owner: string): Collectible[] {
    const needle = owner.toLowerCase();
    return getAllCollectibles().filter(
        (c) => c.owner && c.owner.toLowerCase() === needle,
    );
}

// NEW: helpers that include image URLs from collectible_images table

export function getAllCollectiblesWithImages(): CollectibleWithImage[] {
    return getAllCollectibles().map((c) => {
        const img = getCollectibleImageByRfidHashDb(c.rfidHash);
        return {
            ...c,
            imageThumbUrl: img?.thumbUrl ?? null,
            imageCardUrl: img?.cardUrl ?? null,
            imageDetailUrl: img?.detailUrl ?? null,
        };
    });
}

export function getCollectiblesByOwnerWithImages(
    owner: string,
): CollectibleWithImage[] {
    const base = getCollectiblesByOwner(owner);
    return base.map((c) => {
        const img = getCollectibleImageByRfidHashDb(c.rfidHash);
        return {
            ...c,
            imageThumbUrl: img?.thumbUrl ?? null,
            imageCardUrl: img?.cardUrl ?? null,
            imageDetailUrl: img?.detailUrl ?? null,
        };
    });
}

// ------------------------
// applyEventToState()
// ------------------------

export function applyEventToState(ev: IndexedEvent): void {
    const e = ev.event;
    const a: any = ev.args;

    // -------- MARKET EVENTS --------
    if (ev.contract === "market") {
        if (e === "CollectibleListed") {
            const nft = String(a[0]);
            const tokenId = a[1].toString();
            const seller = String(a[2]);
            const price = a[3].toString();

            const key = listingKey(nft, tokenId);
            const listing: Listing = {
                nft,
                tokenId,
                seller,
                price,
                buyer: null,
                active: true,
                lastEvent: e,
                lastUpdateBlock: ev.block,
                lastUpdateTx: ev.tx,
            };

            listings.set(key, listing);
            upsertListingDb(listing);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                nft,
                tokenId,
                seller,
                price,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectiblePriceUpdated") {
            const nft = String(a[0]);
            const tokenId = a[1].toString();
            const newPrice = a[2].toString();

            const key = listingKey(nft, tokenId);
            const existing = listings.get(key);
            if (!existing) return;

            existing.price = newPrice;
            existing.lastEvent = e;
            existing.lastUpdateBlock = ev.block;
            existing.lastUpdateTx = ev.tx;

            upsertListingDb(existing);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                nft,
                tokenId,
                seller: existing.seller,
                price: newPrice,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectibleCanceled") {
            const nft = String(a[0]);
            const tokenId = a[1].toString();

            const key = listingKey(nft, tokenId);
            const existing = listings.get(key);
            if (!existing) return;

            existing.active = false;
            existing.lastEvent = e;
            existing.lastUpdateBlock = ev.block;
            existing.lastUpdateTx = ev.tx;

            upsertListingDb(existing);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                nft,
                tokenId,
                seller: existing.seller,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectiblePurchased") {
            const nft = String(a[0]);
            const tokenId = a[1].toString();
            const seller = String(a[2]);
            const buyer = String(a[3]);
            const price = a[4].toString();

            const key = listingKey(nft, tokenId);
            const existing =
                listings.get(key) ??
                {
                    nft,
                    tokenId,
                    seller,
                    price,
                    buyer: null,
                    active: true,
                    lastEvent: "",
                    lastUpdateBlock: 0,
                    lastUpdateTx: "",
                };

            existing.price = price;
            existing.buyer = buyer;
            existing.active = false;
            existing.lastEvent = e;
            existing.lastUpdateBlock = ev.block;
            existing.lastUpdateTx = ev.tx;

            listings.set(key, existing);
            upsertListingDb(existing);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                nft,
                tokenId,
                seller,
                buyer,
                price,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        return;
    }

    // -------- REGISTRY EVENTS --------
    if (ev.contract === "registry") {
        if (e === "CollectibleRegistered") {
            const rfidHash = String(a[0]);
            const initialOwner = String(a[1]);
            const authenticityHash = String(a[2]);
            const rfid = String(a[3]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.authenticityHash = authenticityHash;
            c.owner = initialOwner;
            c.redeemed = false;
            c.burned = false;

            upsertCollectibleDb(c);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash,
                owner: initialOwner,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectibleOwnershipTransferred") {
            const rfidHash = String(a[0]);
            const _oldOwner = String(a[1]);
            const newOwner = String(a[2]);
            const rfid = String(a[3]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.owner = newOwner;

            upsertCollectibleDb(c);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash,
                owner: newOwner,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectibleRedeemed") {
            const rfidHash = String(a[0]);
            const rfid = String(a[1]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.redeemed = true;

            upsertCollectibleDb(c);

            // Build activity without owner first, then conditionally add owner
            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            if (c.owner) {
                activity.owner = c.owner;
            }
            insertEventDb(activity);
            return;
        }

        return;
    }

    // -------- NFT EVENTS --------
    if (ev.contract === "nft") {
        if (e === "RFIDLinked") {
            const rfidHash = String(a[0]);
            const tokenId = a[1].toString();
            const owner = String(a[2]);
            const rfid = String(a[3]);

            const key = normalizeHash(rfidHash);
            tokenIdToRfidHash.set(tokenId, key);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.tokenId = tokenId;
            c.owner = owner;

            upsertCollectibleDb(c);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash,
                tokenId,
                owner,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "MintedNFT") {
            const tokenId = a[0].toString();
            const owner = String(a[1]);

            const rfidHashKey = tokenIdToRfidHash.get(tokenId);
            if (!rfidHashKey) {
                const activity: ActivityEvent = {
                    contract: ev.contract,
                    eventName: e,
                    tokenId,
                    owner,
                    block: ev.block,
                    tx: ev.tx,
                    logIndex: ev.logIndex,
                    createdAt: ev.t,
                };
                insertEventDb(activity);
                return;
            }

            const c = getOrInitCollectible(rfidHashKey, ev);
            c.tokenId = tokenId;
            c.owner = owner;

            upsertCollectibleDb(c);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash: rfidHashKey,
                tokenId,
                owner,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        if (e === "CollectibleBurned") {
            const rfidHash = String(a[0]);
            const tokenId = a[1].toString();
            const owner = String(a[2]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.tokenId = tokenId;
            c.owner = owner;
            c.burned = true;

            upsertCollectibleDb(c);

            const activity: ActivityEvent = {
                contract: ev.contract,
                eventName: e,
                rfidHash,
                tokenId,
                owner,
                block: ev.block,
                tx: ev.tx,
                logIndex: ev.logIndex,
                createdAt: ev.t,
            };
            insertEventDb(activity);
            return;
        }

        return;
    }

    // ignore anything else
}
