// src/index.ts

import { join } from "path";
import fs from "fs/promises";
import {
    JsonRpcProvider,
    WebSocketProvider,
    Interface,
    type Log,
    type Filter,
} from "ethers";
import { env } from "./config/env.js";
import { logger } from "./infra/logger.js";
import { makeJsonl } from "./infra/files.js";
import { REGISTRY_ABI, NFT_ABI, MARKET_ABI } from "./contracts/abi.js";
import { startHttpServer } from "./http/server.js";
import { applyEventToState, type IndexedEvent } from "./domain/state.js";

// ---------- Providers ----------
const ws = env.RPC_WS_URL ? new WebSocketProvider(env.RPC_WS_URL, env.CHAIN_ID) : null;
const http = new JsonRpcProvider(env.RPC_HTTP_URL, env.CHAIN_ID);

// ---------- JSONL sinks (per-contract + raw + combined) ----------
const appendRaw = makeJsonl(join(env.LOG_DIR, "raw_logs.jsonl"));
const appendRegistry = makeJsonl(join(env.LOG_DIR, "registry_log.jsonl"));
const appendNft = makeJsonl(join(env.LOG_DIR, "nft_log.jsonl"));
const appendMarket = makeJsonl(join(env.LOG_DIR, "market_log.jsonl"));
const appendCombined = makeJsonl(join(env.LOG_DIR, "collectible_log.jsonl"));

// ---------- Helpers ----------
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/** Recursively convert BigInt to string so JSON.stringify doesn't throw. */
function jsonSafe(value: any): any {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(jsonSafe);
    if (value && typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
        return out;
    }
    return value;
}

type Ctx = {
    name: "registry" | "nft" | "market";
    address: string;
    iface: Interface | null;
    append: (obj: unknown) => void;
};

// Build interfaces if ABIs exist
const REG_IFACE =
    REGISTRY_ABI.length > 0 ? new Interface(REGISTRY_ABI as any) : null;
const NFT_IFACE = NFT_ABI.length > 0 ? new Interface(NFT_ABI as any) : null;
const MKT_IFACE =
    MARKET_ABI.length > 0 ? new Interface(MARKET_ABI as any) : null;

const contracts: Record<string, Ctx> = {
    [env.REGISTRY_ADDRESS.toLowerCase()]: {
        name: "registry",
        address: env.REGISTRY_ADDRESS,
        iface: REG_IFACE,
        append: appendRegistry,
    },
    [env.NFT_ADDRESS.toLowerCase()]: {
        name: "nft",
        address: env.NFT_ADDRESS,
        iface: NFT_IFACE,
        append: appendNft,
    },
    [env.MARKET_ADDRESS.toLowerCase()]: {
        name: "market",
        address: env.MARKET_ADDRESS,
        iface: MKT_IFACE,
        append: appendMarket,
    },
};

async function waitForConfirmations(blockNumber: number) {
    const target = blockNumber + env.CONFIRMATIONS;
    while ((await http.getBlockNumber()) < target) {
        await sleep(1200);
    }
}

async function handleLog(log: Log) {
    try {
        // Always write a compact raw record
        appendRaw({
            t: Date.now(),
            tx: log.transactionHash,
            block: log.blockNumber,
            address: log.address,
            logIndex: log.index,
            topic0: log.topics?.[0],
            data: log.data,
        });

        // Confirmations gate
        await waitForConfirmations(log.blockNumber);

        const ctx = contracts[log.address.toLowerCase()];
        if (!ctx) return;

        // Nullable parse pattern
        let parsed: any | null = null;
        if (ctx.iface) {
            try {
                parsed = ctx.iface.parseLog(log);
            } catch {
                parsed = null;
            }
        }

        if (parsed !== null) {
            const record = {
                t: Date.now(),
                contract: ctx.name,
                event: parsed.name,
                args: jsonSafe(parsed.args),
                tx: log.transactionHash,
                block: log.blockNumber,
                logIndex: log.index,
            };

            // Update in-memory state (and via that, SQLite)
            applyEventToState(record as IndexedEvent);

            ctx.append(record);
            appendCombined(record);
            logger.info(
                { contract: ctx.name, event: parsed.name, block: log.blockNumber },
                "event",
            );
            return;
        }

        // Fallback unparsed
        const unparsed = {
            t: Date.now(),
            contract: ctx.name,
            event: "Unparsed",
            args: { topics: log.topics, data: log.data },
            tx: log.transactionHash,
            block: log.blockNumber,
            logIndex: log.index,
        };
        ctx.append(unparsed);
        appendCombined(unparsed);
        logger.info(
            { contract: ctx.name, event: "Unparsed", block: log.blockNumber },
            "event",
        );
    } catch (err) {
        logger.error(err, "handleLog error");
    }
}

/**
 * On startup, rebuild in-memory state by replaying historical events
 * from collectible_log.jsonl.
 */
async function bootstrapStateFromLogs(): Promise<void> {
    const path = join(env.LOG_DIR, "collectible_log.jsonl");
    try {
        const data = await fs.readFile(path, "utf8");
        if (!data) {
            logger.info(
                "No collectible_log.jsonl found or file empty; skipping bootstrap",
            );
            return;
        }

        const lines = data
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0);

        let applied = 0;
        for (const line of lines) {
            try {
                const obj = JSON.parse(line) as IndexedEvent;
                if (
                    obj &&
                    (obj.contract === "registry" ||
                        obj.contract === "nft" ||
                        obj.contract === "market")
                ) {
                    applyEventToState(obj);
                    applied++;
                }
            } catch {
                // ignore malformed JSON lines
            }
        }

        logger.info({ applied }, "Bootstrap from collectible_log.jsonl completed");
    } catch (err: any) {
        if (err && err.code === "ENOENT") {
            logger.info("collectible_log.jsonl not found; skipping bootstrap");
            return;
        }
        logger.error(err, "Failed to bootstrap state from logs");
    }
}

/**
 * Robustly fetch the latest block number with exponential backoff.
 * Never throws; returns null if it can't succeed after retries.
 */
async function getLatestBlockWithBackoff(
    provider: JsonRpcProvider,
    opts?: { maxAttempts?: number; initialDelayMs?: number; maxDelayMs?: number },
): Promise<number | null> {
    const maxAttempts = opts?.maxAttempts ?? 8;
    let delay = opts?.initialDelayMs ?? 1_000;
    const maxDelay = opts?.maxDelayMs ?? 30_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await provider.getBlockNumber();
        } catch (err: any) {
            const msg = String(err?.message ?? "");
            const code = String(err?.code ?? "");
            logger.warn(
                { attempt, delay, code, msg },
                "eth_blockNumber failed; backing off",
            );
            await new Promise((r) => setTimeout(r, delay));
            delay = Math.min(Math.floor(delay * 1.8), maxDelay);
        }
    }

    return null;
}

async function main() {
    logger.info({ env }, "Backend starting");

    // 1) Rebuild in-memory + SQLite state from historical logs
    await bootstrapStateFromLogs();

    // 2) Start HTTP API (should keep running even if RPC is flaky)
    startHttpServer();

    // 3) Attach WS listener for live events (only if WebSocket available)
    if (ws) {
        const filter: Filter = {
            address: [env.REGISTRY_ADDRESS, env.NFT_ADDRESS, env.MARKET_ADDRESS],
        };

        ws.on(filter, (log: Log) => {
            void handleLog(log);
        });

        // WS resilience: log on close instead of killing the process
        // @ts-expect-error _ws is not typed by ethers; present in Node runtime
        ws._ws?.addEventListener?.("close", () => {
            logger.warn(
                "WS closed. Live event listening stopped, HTTP server still running.",
            );
        });
        logger.info("WebSocket listener attached for live events");
    } else {
        logger.info("No WebSocket - using HTTP polling only");
    }

    // 4) Try to log the latest block, but DO NOT crash if RPC is down / rate-limited
    const latest = await getLatestBlockWithBackoff(http);
    if (latest !== null) {
        logger.info({ latest }, "Listeners attached (HTTP RPC OK)");
    } else {
        logger.warn(
            "Could not fetch latest block after retries; continuing without HTTP chain height. WS events and HTTP API will still run.",
        );
    }

    // 5) If no WebSocket, start polling for new blocks
    if (!ws) {
        let lastProcessedBlock = latest || 0;

        setInterval(async () => {
            try {
                const currentBlock = await http.getBlockNumber();

                if (currentBlock > lastProcessedBlock) {
                    const fromBlock = lastProcessedBlock + 1;
                    const toBlock = currentBlock;

                    logger.info(`Polling: Fetching logs from block ${fromBlock} to ${toBlock}`);

                    const logs = await http.getLogs({
                        address: [env.REGISTRY_ADDRESS, env.NFT_ADDRESS, env.MARKET_ADDRESS],
                        fromBlock,
                        toBlock,
                    });

                    for (const log of logs) {
                        await handleLog(log);
                    }

                    lastProcessedBlock = currentBlock;
                }
            } catch (error) {
                logger.error({ error }, "Polling error");
            }
        }, env.POLL_INTERVAL);

        logger.info(`HTTP polling started (interval: ${env.POLL_INTERVAL}ms)`);
    }
}

main().catch((e) => {
    logger.error(e, "Fatal startup error");
    process.exit(1);
});
