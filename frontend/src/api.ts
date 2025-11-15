// frontend/src/api.ts

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
};

/**
 * Basic helper to GET JSON from the backend.
 */
async function getJSON<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (!res.ok) {
        // You can make this nicer (logging, custom errors, etc.)
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
    const data = await getJSON<OwnerCollectiblesResponse>(
        `/owner/${owner}`,
    );
    return data;
}
