// src/http/server.ts

import express, { type Request, type Response } from "express";
import cors from "cors";
import { join } from "path";
import fs from "fs/promises";
import fsSync from "fs";
import multer from "multer";
import sharp from "sharp";
import { env } from "../config/env.js";
import { logger } from "../infra/logger.js";
import {
    getActiveListingsDb,
    getAllCollectiblesDb,
    getCollectiblesByOwnerDb,
    getActivityByAddressDb,
    getCollectibleDetailsByTokenIdDb,
    getCollectibleDetailsByRfidHashDb,
    getCollectibleImageByRfidHashDb,
    upsertCollectibleImageDb,
    collectibleExistsByRfidHashDb,
} from "../infra/db.js";

type ContractName = "registry" | "nft" | "market" | "all";

const LOG_FILES: Record<Exclude<ContractName, "all">, string> = {
    registry: "registry_log.jsonl",
    nft: "nft_log.jsonl",
    market: "market_log.jsonl",
};

// ---- Image storage setup ----

const IMAGES_DIR = join(env.LOG_DIR, "images");

if (!fsSync.existsSync(IMAGES_DIR)) {
    fsSync.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Derive base URL from the backend port
const PUBLIC_BASE_URL = `http://localhost:${env.PORT ?? 8080}`;

const upload = multer({ dest: IMAGES_DIR });

// Local type so TS knows about req.file in our upload handler
type MulterRequest = Request & { file?: any };

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

    // Serve images: http://localhost:8080/images/<filename>
    app.use("/images", express.static(IMAGES_DIR));

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
     * Returns all currently-active marketplace listings from SQLite.
     */
    app.get("/listings", (_req: Request, res: Response) => {
        try {
            const listings = getActiveListingsDb();
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
     * Returns all collectibles, enriched with image URLs (if present).
     */
    app.get("/collectibles", (_req: Request, res: Response) => {
        try {
            const base = getAllCollectiblesDb();

            const collectibles = base.map((c) => {
                const img = getCollectibleImageByRfidHashDb(c.rfidHash);
                return {
                    ...c,
                    imageThumbUrl: img?.thumbUrl ?? null,
                    imageCardUrl: img?.cardUrl ?? null,
                    imageDetailUrl: img?.detailUrl ?? null,
                };
            });

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
     */
    app.get("/owner/:address", (req: Request, res: Response) => {
        try {
            const addr = (req.params.address || "").trim();
            if (!addr) {
                res.status(400).json({ error: "address param is required" });
                return;
            }

            const base = getCollectiblesByOwnerDb(addr);

            const collectibles = base.map((c) => {
                const img = getCollectibleImageByRfidHashDb(c.rfidHash);
                return {
                    ...c,
                    imageThumbUrl: img?.thumbUrl ?? null,
                    imageCardUrl: img?.cardUrl ?? null,
                    imageDetailUrl: img?.detailUrl ?? null,
                };
            });

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

    /**
     * GET /activity/:address
     */
    app.get("/activity/:address", (req: Request, res: Response) => {
        try {
            const addr = (req.params.address || "").trim();
            if (!addr) {
                res.status(400).json({ error: "address param is required" });
                return;
            }

            const events = getActivityByAddressDb(addr);
            res.json({
                owner: addr,
                count: events.length,
                events,
            });
        } catch (err) {
            logger.error(err, "GET /activity/:address failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * GET /collectible/by-token/:tokenId
     */
    app.get("/collectible/by-token/:tokenId", (req: Request, res: Response) => {
        try {
            const tokenId = (req.params.tokenId || "").trim();
            if (!tokenId) {
                res.status(400).json({ error: "tokenId param is required" });
                return;
            }

            const { collectible, events } = getCollectibleDetailsByTokenIdDb(tokenId);
            res.json({
                tokenId,
                collectible,
                events,
            });
        } catch (err) {
            logger.error(err, "GET /collectible/by-token/:tokenId failed");
            res.status(500).json({ error: "Internal server error" });
        }
    });

    /**
     * GET /collectible/by-rfid-hash/:rfidHash
     */
    app.get(
        "/collectible/by-rfid-hash/:rfidHash",
        (req: Request, res: Response) => {
            try {
                const rfidHash = (req.params.rfidHash || "").trim();
                if (!rfidHash) {
                    res.status(400).json({ error: "rfidHash param is required" });
                    return;
                }

                const { collectible, events } =
                    getCollectibleDetailsByRfidHashDb(rfidHash);
                res.json({
                    rfidHash,
                    collectible,
                    events,
                });
            } catch (err) {
                logger.error(err, "GET /collectible/by-rfid-hash/:rfidHash failed");
                res.status(500).json({ error: "Internal server error" });
            }
        },
    );

    /**
     * GET /admin/rfid-hash-exists/:rfidHash
     * Returns whether a collectible with this rfidHash already exists.
     */
    app.get("/admin/rfid-hash-exists/:rfidHash", (req: Request, res: Response) => {
        try {
            const rfidHash = (req.params.rfidHash || "").trim();
            if (!rfidHash) {
                res.status(400).json({ error: "rfidHash param is required" });
                return;
            }

            const exists = collectibleExistsByRfidHashDb(rfidHash);

            res.json({
                rfidHash: rfidHash.toLowerCase(),
                exists,
            });
        } catch (err) {
            logger.error(
                err,
                "GET /admin/rfid-hash-exists/:rfidHash failed",
            );
            res.status(500).json({ error: "Internal server error" });
        }
    });


    /**
     * POST /admin/collectibles/:rfidHash/image
     * Accepts a single image file (field name "file"), resizes to 1024x1024, and links it to the collectible.
     */
    app.post(
        "/admin/collectibles/:rfidHash/image",
        upload.single("file"),
        async (req: MulterRequest, res: Response) => {
            try {
                const rfidHash = (req.params.rfidHash || "").trim();
                if (!rfidHash) {
                    res.status(400).json({ error: "rfidHash param is required" });
                    return;
                }

                if (!req.file) {
                    res.status(400).json({ error: "file field is required" });
                    return;
                }

                // Original uploaded file path (from multer)
                const originalPath = req.file.path;

                // New filename for resized image
                const resizedFilename = `${req.file.filename}-1024.jpg`;
                const resizedPath = join(IMAGES_DIR, resizedFilename);

                // Resize image to 1024x1024 using sharp
                // - Resizes and crops to fill the square (cover mode)
                // - Converts to JPEG with 90% quality
                // - Strips metadata
                await sharp(originalPath)
                    .resize(1024, 1024, {
                        fit: 'cover',      // Crop to fill the square
                        position: 'centre' // Center the crop
                    })
                    .jpeg({ quality: 90 })
                    .toFile(resizedPath);

                // Delete the original uploaded file (we only keep the resized version)
                await fs.unlink(originalPath);

                // Generate URL for resized image
                const relPath = `/images/${resizedFilename}`;
                const fullUrl = `${PUBLIC_BASE_URL}${relPath}`;

                // Store image info in database
                upsertCollectibleImageDb({
                    rfidHash: rfidHash.toLowerCase(),
                    originalUrl: fullUrl,
                    detailUrl: fullUrl,
                    cardUrl: fullUrl,
                    thumbUrl: fullUrl,
                    width: 1024,
                    height: 1024,
                    createdAt: Date.now(),
                });

                logger.info({ rfidHash, resizedFilename }, "Image uploaded and resized to 1024x1024");

                res.json({
                    rfidHash,
                    url: fullUrl,
                    dimensions: { width: 1024, height: 1024 }
                });
            } catch (err) {
                logger.error(err, "POST /admin/collectibles/:rfidHash/image failed");
                res.status(500).json({ error: "Internal server error" });
            }
        },
    );

    const port = env.PORT ?? 8080;
    app.listen(port, () => {
        logger.info({ port }, "HTTP server listening");
    });
}