// src/http/server.ts

import express, { type Request, type Response } from "express";
import cors from "cors";
import { join } from "path";
import fs from "fs/promises";
import { env } from "../config/env.js";
import { logger } from "../infra/logger.js";
import {
    getActiveListings,
    getAllCollectibles,
    getCollectiblesByOwner,
} from "../domain/state.js";

type ContractName = "registry" | "nft" | "market" | "all";

const LOG_FILES: Record<Exclude<ContractName, "all">, string> = {
    registry: "registry_log.jsonl",
    nft: "nft_log.jsonl",
    market: "market_log.jsonl",
};

async function readRecentLines(filePath: string, limit: number): Promise<unknown[]> {
    try {
        const data = await fs.readFile(filePath, "utf8");
        if (!data) return [];
        const lines = data
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        const slice = lines.slice(-limit);
        const results: unknown[] = [];
        for (const line of slice) {
            try {
                results.push(JSON.parse(line));
            } catch {
                // ignore bad line
            }
        }
        return results;
    } catch (err: any) {
        // file might not exist yet, etc.
        if (err && err.code === "ENOENT") {
            return [];
        }
        throw err;
    }
}

export function startHttpServer(): void {
    const app = express();

    app.use(cors());
    app.use(express.json());

    // Simple health check
    app.get("/health", (_req: Request, res: Response) => {
        res.json({
            status: "ok",
            chainId: env.CHAIN_ID,
            registry: env.REGISTRY_ADDRESS,
            nft: env.NFT_ADDRESS,
            market: env.MARKET_ADDRESS,
        });
    });

    /**
     * GET /events/recent
     * Query params:
     *   - contract: registry | nft | market | all (default: all)
     *   - limit: number (default: 50, max: 500)
     */
    app.get("/events/recent", async (req: Request, res: Response) => {
        try {
            // --- Parse query params ---
            const contractParam = (req.query.contract as string | undefined)?.toLowerCase();
            const validContracts: ContractName[] = ["registry", "nft", "market", "all"];

            const contract: ContractName =
                contractParam && validContracts.includes(contractParam as ContractName)
                    ? (contractParam as ContractName)
                    : "all";

            const limitRaw = req.query.limit as string | undefined;
            const limitNum = limitRaw ? parseInt(limitRaw, 10) : 50;
            const limit = Number.isFinite(limitNum)
                ? Math.min(Math.max(limitNum, 1), 500)
                : 50;

            const baseDir = env.LOG_DIR;

            // --- Determine path to file(s) ---
            if (contract === "all") {
                const combinedPath = join(baseDir, "collectible_log.jsonl");
                const events = await readRecentLines(combinedPath, limit);
                res.json({ contract: "all", count: events.length, events });
                return;
            }

            const fileName = LOG_FILES[contract];
            const filePath = join(baseDir, fileName);

            const events = await readRecentLines(filePath, limit);
            res.json({ contract, count: events.length, events });
        } catch (err) {
            logger.error(err, "GET /events/recent failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * GET /listings
     * Returns all currently-active marketplace listings from in-memory state.
     */
    app.get("/listings", (_req: Request, res: Response) => {
        try {
            const listings = getActiveListings();
            res.json({
                count: listings.length,
                listings,
            });
        } catch (err) {
            logger.error(err, "GET /listings failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * GET /collectibles
     * Returns all collectibles (burned / redeemed included; flags in each object).
     */
    app.get("/collectibles", (_req: Request, res: Response) => {
        try {
            const collectibles = getAllCollectibles();
            res.json({
                count: collectibles.length,
                collectibles,
            });
        } catch (err) {
            logger.error(err, "GET /collectibles failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * GET /owner/:address
     * Returns all collectibles where last known owner matches :address (case-insensitive).
     */
    app.get("/owner/:address", (req: Request, res: Response) => {
        try {
            const addr = (req.params.address || "").trim();
            if (!addr) {
                res.status(400).json({ error: "address param is required" });
                return;
            }
            const collectibles = getCollectiblesByOwner(addr);
            res.json({
                owner: addr,
                count: collectibles.length,
                collectibles,
            });
        } catch (err) {
            logger.error(err, "GET /owner/:address failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    const port = env.PORT ?? 8080;
    app.listen(port, () => {
        logger.info({ port }, "HTTP server listening");
    });
}
