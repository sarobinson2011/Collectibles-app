// src/domain/state.ts

// ------------------------
// Common indexed event type
// ------------------------

export type IndexedEvent = {
    t: number;
    contract: "registry" | "nft" | "market";
    event: string;
    args: any;          // parsed args from ethers (already jsonSafe'd)
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

/** Get all currently active listings as a plain array */
export function getActiveListings(): Listing[] {
    return Array.from(listings.values()).filter((l) => l.active);
}

// ------------------------
// Collectible state (registry + NFT)
// ------------------------

export type Collectible = {
    rfidHash: string;          // bytes32 as 0x...
    rfid?: string;             // human readable RFID string
    tokenId?: string;          // ERC721 tokenId (stringified)
    owner?: string;            // last known owner (from registry/NFT events)
    authenticityHash?: string; // bytes32 authenticity hash
    burned: boolean;           // from CollectibleBurned
    redeemed: boolean;         // from CollectibleRedeemed
    lastEvent: string;
    lastUpdateBlock: number;
    lastUpdateTx: string;
};

const collectiblesByRfidHash = new Map<string, Collectible>(); // key: rfidHash.toLowerCase()
const tokenIdToRfidHash = new Map<string, string>();           // tokenId -> rfidHash.toLowerCase()

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

/** Return all collectibles (including burned / redeemed; flags are in the object). */
export function getAllCollectibles(): Collectible[] {
    return Array.from(collectiblesByRfidHash.values());
}

/** Return collectibles where owner matches (case-insensitive). */
export function getCollectiblesByOwner(owner: string): Collectible[] {
    const needle = owner.toLowerCase();
    return getAllCollectibles().filter(
        (c) => c.owner && c.owner.toLowerCase() === needle
    );
}

// ------------------------
// Main reducer: apply event to in-memory state
// ------------------------

export function applyEventToState(ev: IndexedEvent): void {
    const e = ev.event;
    const a: any = ev.args; // ethers LogDescription args: array-like + named props

    // -------- MARKET: listings --------
    if (ev.contract === "market") {
        if (e === "CollectibleListed") {
            // event CollectibleListed(address indexed nft, uint256 indexed tokenId, address indexed seller, uint256 price);
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
            return;
        }

        if (e === "CollectiblePriceUpdated") {
            // event CollectiblePriceUpdated(address indexed nft, uint256 indexed tokenId, uint256 newPrice);
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
            return;
        }

        if (e === "CollectibleCanceled") {
            // event CollectibleCanceled(address indexed nft, uint256 indexed tokenId);
            const nft = String(a[0]);
            const tokenId = a[1].toString();

            const key = listingKey(nft, tokenId);
            const existing = listings.get(key);
            if (!existing) return;

            existing.active = false;
            existing.lastEvent = e;
            existing.lastUpdateBlock = ev.block;
            existing.lastUpdateTx = ev.tx;
            return;
        }

        if (e === "CollectiblePurchased") {
            // event CollectiblePurchased(address indexed nft, uint256 indexed tokenId, address indexed seller, address buyer, uint256 price);
            const nft = String(a[0]);
            const tokenId = a[1].toString();
            const seller = String(a[2]);
            const buyer = String(a[3]);
            const price = a[4].toString();

            const key = listingKey(nft, tokenId);
            const existing = listings.get(key) ?? {
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
            existing.active = false; // listing is done
            existing.lastEvent = e;
            existing.lastUpdateBlock = ev.block;
            existing.lastUpdateTx = ev.tx;
            listings.set(key, existing);
            return;
        }

        // ignore other market events for now
        return;
    }

    // -------- REGISTRY: authenticity + high-level ownership --------
    if (ev.contract === "registry") {
        if (e === "CollectibleRegistered") {
            // event CollectibleRegistered(bytes32 indexed rfidHash, address indexed initialOwner, bytes32 authenticityHash, string rfid);
            const rfidHash = String(a[0]);
            const initialOwner = String(a[1]);
            const authenticityHash = String(a[2]);
            const rfid = String(a[3]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfidHash = rfidHash;
            c.rfid = rfid;
            c.authenticityHash = authenticityHash;
            c.owner = initialOwner;
            c.redeemed = false;
            c.burned = false;
            return;
        }

        if (e === "CollectibleOwnershipTransferred") {
            // event CollectibleOwnershipTransferred(bytes32 indexed rfidHash, address indexed oldOwner, address indexed newOwner, string rfid);
            const rfidHash = String(a[0]);
            const /* oldOwner */ _oldOwner = String(a[1]); // unused for now
            const newOwner = String(a[2]);
            const rfid = String(a[3]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.owner = newOwner;
            return;
        }

        if (e === "CollectibleRedeemed") {
            // event CollectibleRedeemed(bytes32 indexed rfidHash, string rfid);
            const rfidHash = String(a[0]);
            const rfid = String(a[1]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfid = rfid;
            c.redeemed = true;
            return;
        }

        // ignore other registry events for now
        return;
    }

    // -------- NFT: RFID linkage + burn, owner hints --------
    if (ev.contract === "nft") {
        if (e === "MintedNFT") {
            // event MintedNFT(uint256 indexed tokenId, address indexed owner);
            const tokenId = a[0].toString();
            const owner = String(a[1]);

            const rfidHashKey = tokenIdToRfidHash.get(tokenId);
            if (!rfidHashKey) {
                // We'll get RFIDLinked later which has both rfidHash + tokenId + owner
                return;
            }

            const c = getOrInitCollectible(rfidHashKey, ev);
            c.tokenId = tokenId;
            c.owner = owner;
            return;
        }

        if (e === "RFIDLinked") {
            // event RFIDLinked(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner, string rfid);
            const rfidHash = String(a[0]);
            const tokenId = a[1].toString();
            const owner = String(a[2]);
            const rfid = String(a[3]);

            const key = normalizeHash(rfidHash);
            tokenIdToRfidHash.set(tokenId, key);

            const c = getOrInitCollectible(rfidHash, ev);
            c.rfidHash = rfidHash;
            c.tokenId = tokenId;
            c.owner = owner;
            c.rfid = rfid;
            return;
        }

        if (e === "CollectibleBurned") {
            // event CollectibleBurned(bytes32 indexed rfidHash, uint256 indexed tokenId, address indexed owner);
            const rfidHash = String(a[0]);
            const tokenId = a[1].toString();
            const owner = String(a[2]);

            const c = getOrInitCollectible(rfidHash, ev);
            c.tokenId = tokenId;
            c.owner = owner;
            c.burned = true;
            return;
        }

        // ignore loyalty + config events for now
        return;
    }

    // Anything else: ignore
}
