// src/api.ts

const API_BASE_URL =
    import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8080";

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

    // image URLs from backend (can be null if no image yet)
    imageThumbUrl?: string | null;
    imageCardUrl?: string | null;
    imageDetailUrl?: string | null;
};

export type ActivityEvent = {
    contract: "registry" | "nft" | "market";
    eventName: string;
    nft?: string;
    tokenId?: string;
    rfidHash?: string;
    seller?: string;
    buyer?: string;
    owner?: string;
    price?: string;
    block: number;
    tx: string;
    logIndex: number;
    createdAt: number;
};

/**
 * Details shape returned by the backend for a single collectible.
 * (We extend this with tokenUri / metadata / imageUrl for the detail
 *  page and image thumbnails.)
 */
export type CollectibleDetails = {
    tokenId?: string;
    rfidHash?: string;
    collectible: Collectible | null;
    events: ActivityEvent[];

    // enriched fields from backend
    tokenUri: string | null;
    metadata: any | null;
    imageUrl: string | null;
};

/**
 * Basic helper to GET JSON from the backend.
 */
async function getJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) {
        throw new Error(`API ${path} failed with ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// ---------- Endpoints ----------

type ListingsResponse = {
    count: number;
    listings: Listing[];
};

export async function fetchListings(): Promise<Listing[]> {
    const data = await getJSON<ListingsResponse>("/listings");
    return data.listings;
}

type CollectiblesResponse = {
    count: number;
    collectibles: Collectible[];
};

export async function fetchCollectibles(): Promise<Collectible[]> {
    const data = await getJSON<CollectiblesResponse>("/collectibles");
    return data.collectibles;
}

type OwnerCollectiblesResponse = {
    owner: string;
    count: number;
    collectibles: Collectible[];
};

export async function fetchCollectiblesByOwner(
    owner: string,
): Promise<OwnerCollectiblesResponse> {
    const data = await getJSON<OwnerCollectiblesResponse>(`/owner/${owner}`);
    return data;
}

type ActivityResponse = {
    owner: string;
    count: number;
    events: ActivityEvent[];
};

export async function fetchActivity(owner: string): Promise<ActivityResponse> {
    const data = await getJSON<ActivityResponse>(`/activity/${owner}`);
    return data;
}

/**
 * Backend detail responses:
 *  - /collectible/by-token/:tokenId      -> includes tokenId
 *  - /collectible/by-rfid-hash/:rfidHash -> includes rfidHash
 */

type CollectibleByTokenResponse = CollectibleDetails & {
    tokenId: string;
};

type CollectibleByRfidResponse = CollectibleDetails & {
    rfidHash: string;
};

export async function fetchCollectibleByTokenId(
    tokenId: string,
): Promise<CollectibleDetails> {
    const data = await getJSON<CollectibleByTokenResponse>(
        `/collectible/by-token/${tokenId}`,
    );
    return data;
}

export async function fetchCollectibleByRfidHash(
    rfidHash: string,
): Promise<CollectibleDetails> {
    const data = await getJSON<CollectibleByRfidResponse>(
        `/collectible/by-rfid-hash/${rfidHash}`,
    );
    return data;
}

/**
 * Convenience helper used by AllCollectiblesPage for thumbnails.
 * Just an alias around fetchCollectibleByTokenId.
 */
export async function fetchCollectibleDetails(
    tokenId: string,
): Promise<CollectibleDetails> {
    return fetchCollectibleByTokenId(tokenId);
}

/**
 * Upload an image for a given collectible RFID hash.
 * Uses the backend endpoint: POST /admin/collectibles/:rfidHash/image
 */
export async function uploadCollectibleImage(
    rfidHash: string,
    file: File,
): Promise<{ rfidHash: string; url: string }> {
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(
        `${API_BASE_URL}/admin/collectibles/${rfidHash}/image`,
        {
            method: "POST",
            body: formData,
        },
    );

    if (!res.ok) {
        throw new Error(
            `Image upload failed with status ${res.status}: ${await res.text()}`,
        );
    }

    return res.json() as Promise<{ rfidHash: string; url: string }>;
}
