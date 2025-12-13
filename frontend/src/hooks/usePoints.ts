// src/hooks/usePoints.ts
import { useEffect, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import { useWallet } from "../eth/wallet";
import { NFT_ADDRESS } from "../eth/config";
import { NFT_ABI } from "../eth/abis";

type Status = "idle" | "loading" | "success" | "error";

export function usePoints() {
    const { address, provider, hasProvider, wrongNetwork } = useWallet();

    const [status, setStatus] = useState<Status>("idle");
    const [points, setPoints] = useState<string>("0");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setError(null);

            if (!hasProvider || !provider || !address || wrongNetwork) {
                setStatus("idle");
                setPoints("0");
                return;
            }

            setStatus("loading");

            try {
                const p = provider as BrowserProvider;
                const nft = new Contract(NFT_ADDRESS, NFT_ABI, p);

                // Your contract exposes getPoints(address)
                const v = await nft.getPoints(address);
                if (cancelled) return;

                setPoints(typeof v === "bigint" ? v.toString() : String(v));
                setStatus("success");
            } catch (e: any) {
                if (cancelled) return;
                setStatus("error");
                setError(e?.shortMessage ?? e?.message ?? String(e));
            }
        }

        void load();
        const t = setInterval(load, 15_000);

        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [address, provider, hasProvider, wrongNetwork]);

    return { status, points, error };
}
