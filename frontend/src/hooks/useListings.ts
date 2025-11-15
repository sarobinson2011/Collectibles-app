// src/hooks/useListings.ts

import { useEffect, useState } from "react";
import { fetchListings, type Listing } from "../api";

type UseListingsState =
    | { status: "idle" | "loading"; data: Listing[]; error: null }
    | { status: "success"; data: Listing[]; error: null }
    | { status: "error"; data: Listing[]; error: string };

export function useListings() {
    const [state, setState] = useState<UseListingsState>({
        status: "idle",
        data: [],
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setState((prev) => ({ ...prev, status: "loading", error: null }));
            try {
                const listings = await fetchListings();
                if (cancelled) return;
                setState({ status: "success", data: listings, error: null });
            } catch (err: any) {
                if (cancelled) return;
                setState({
                    status: "error",
                    data: [],
                    error: err?.message ?? "Failed to load listings",
                });
            }
        }

        load();

        // optional: refetch every 10s
        const interval = setInterval(load, 10_000);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, []);

    return state;
}
