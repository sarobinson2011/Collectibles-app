// src/hooks/useCollectibles.ts

import { useEffect, useState } from "react";
import {
    fetchCollectibles,
    fetchCollectiblesByOwner,
    type Collectible,
} from "../api";

type Status = "idle" | "loading" | "success" | "error";

type BaseState = {
    status: Status;
    data: Collectible[];
    error: string | null;
};

/**
 * Load all collectibles from /collectibles
 */
export function useAllCollectibles() {
    const [state, setState] = useState<BaseState>({
        status: "idle",
        data: [],
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setState((prev) => ({ ...prev, status: "loading", error: null }));
            try {
                const items = await fetchCollectibles();
                if (cancelled) return;
                setState({ status: "success", data: items, error: null });
            } catch (err: any) {
                if (cancelled) return;
                setState({
                    status: "error",
                    data: [],
                    error: err?.message ?? "Failed to load collectibles",
                });
            }
        }

        load();
        const interval = setInterval(load, 15_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return state;
}

/**
 * Load collectibles for a specific owner from /owner/:address
 */
export function useOwnerCollectibles(owner: string | null | undefined) {
    const [state, setState] = useState<BaseState>({
        status: "idle",
        data: [],
        error: null,
    });

    useEffect(() => {
        // Guard: if owner is missing or not a string, reset state and exit
        if (!owner || typeof owner !== "string") {
            setState({ status: "idle", data: [], error: null });
            return;
        }

        const safeOwner: string = owner;
        let cancelled = false;

        async function load() {
            setState({ status: "loading", data: [], error: null });

            try {
                const resp = await fetchCollectiblesByOwner(safeOwner);
                if (cancelled) return;

                setState({
                    status: "success",
                    data: resp.collectibles,
                    error: null,
                });
            } catch (err: any) {
                if (cancelled) return;
                setState({
                    status: "error",
                    data: [],
                    error: err?.message ?? "Failed to load owner collectibles",
                });
            }
        }

        load();
        const interval = setInterval(load, 15_000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [owner]);

    return state;
}
