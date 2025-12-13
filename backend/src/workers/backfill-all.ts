// src/workers/backfill-all.ts

import { join } from "path";
import { JsonRpcProvider, Interface, type Filter, type Log } from "ethers";
import { env } from "../config/env.js";
import { makeJsonl } from "../infra/files.js";
import { logger } from "../infra/logger.js";
import { REGISTRY_ABI, NFT_ABI, MARKET_ABI } from "../contracts/abi.js";
import { applyEventToState, type IndexedEvent } from "../domain/state.js";

const http = new JsonRpcProvider(env.RPC_HTTP_URL, env.CHAIN_ID);

const appendRegistry = makeJsonl(join(env.LOG_DIR, "registry_log.jsonl"));
const appendNft = makeJsonl(join(env.LOG_DIR, "nft_log.jsonl"));
const appendMarket = makeJsonl(join(env.LOG_DIR, "market_log.jsonl"));
const appendCombined = makeJsonl(join(env.LOG_DIR, "collectible_log.jsonl"));

function sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
}

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

type TargetName = "registry" | "nft" | "market";

type Target = {
    name: TargetName;
    address: string; // checksummed or not, we normalize to lowercase for lookup
    iface: Interface;
    append: (obj: unknown) => void;
};

const targets: Target[] = [
    {
        name: "registry",
        address: env.REGISTRY_ADDRESS,
        iface: new Interface(REGISTRY_ABI as any),
        append: appendRegistry,
    },
    {
        name: "nft",
        address: env.NFT_ADDRESS,
        iface: new Interface(NFT_ABI as any),
        append: appendNft,
    },
    {
        name: "market",
        address: env.MARKET_ADDRESS,
        iface: new Interface(MARKET_ABI as any),
        append: appendMarket,
    },
];

const targetByAddress = new Map<string, Target>(
    targets.map((t) => [t.address.toLowerCase(), t]),
);
const addressList = targets.map((t) => t.address);

// Tuneables (safe defaults)
const STEP = 2_000; // block chunk size
const AUTO_FIND_MAX_LOOKBACK = 200_000; // how far back we try to find first logs
const AUTO_FIND_STRIDE = 10_000; // backward jump size while searching
const PACE_MS = 200; // polite pacing between provider calls

async function getLogsWithRetry(filter: Filter, attempt = 1): Promise<readonly Log[]> {
    await sleep(PACE_MS);

    try {
        return await http.getLogs(filter);
    } catch (err: any) {
        const msg = String(err?.message ?? "").toLowerCase();
        const code = String(err?.code ?? "");

        const isRateLimited =
            msg.includes("too many requests") ||
            (code === "BAD_DATA" && msg.includes("too many requests"));

        const isBusy =
            code === "SERVER_ERROR" ||
            msg.includes("timeout") ||
            msg.includes("econnreset") ||
            msg.includes("etimedout");

        if ((isRateLimited || isBusy) && attempt <= 6) {
            const base = 600 * Math.pow(2, attempt - 1);
            const jitter = Math.floor(Math.random() * 300);
            const wait = base + jitter;
            logger.warn(
                {
                    attempt,
                    wait,
                    fromBlock: (filter as any).fromBlock,
                    toBlock: (filter as any).toBlock,
                },
                "rate-limited or busy, backing off",
            );
            await sleep(wait);
            return getLogsWithRetry(filter, attempt + 1);
        }

        // If a provider complains about range size / response size, the caller can split ranges.
        throw err;
    }
}

function buildIndexedEvent(t: Target, log: Log): IndexedEvent | null {
    const parsed = t.iface.parseLog(log);
    if (!parsed) return null;

    return {
        t: Date.now(),
        contract: t.name,
        event: parsed.name,
        args: jsonSafe(parsed.args),
        tx: log.transactionHash,
        block: log.blockNumber,
        logIndex: (log as any).index ?? (log as any).logIndex ?? 0,
    };
}

/**
 * Find a reasonable start block automatically:
 * - scan backwards in strides until we find ANY logs for our addresses
 * - then do a small linear refine to the earliest block in that window with logs
 *
 * This avoids guessing deployment blocks manually.
 */
async function autoFindStartBlock(latest: number): Promise<number> {
    const minBlock = Math.max(0, latest - AUTO_FIND_MAX_LOOKBACK);

    let high = latest;
    let low = Math.max(minBlock, latest - AUTO_FIND_STRIDE);

    logger.info(
        { latest, minBlock, stride: AUTO_FIND_STRIDE, maxLookback: AUTO_FIND_MAX_LOOKBACK },
        "auto-find start block: searching backwards for first logs",
    );

    // 1) stride backwards until we find any logs or hit minBlock
    while (true) {
        const filter: Filter = {
            address: addressList,
            fromBlock: low,
            toBlock: high,
        };

        const logs = await getLogsWithRetry(filter);
        if (logs.length > 0) {
            logger.info({ foundIn: { low, high }, count: logs.length }, "auto-find: found logs window");
            break;
        }

        if (low <= minBlock) {
            logger.warn(
                { minBlock, latest },
                "auto-find: found no logs within max lookback; starting at minBlock",
            );
            return minBlock;
        }

        high = low - 1;
        low = Math.max(minBlock, high - AUTO_FIND_STRIDE + 1);
    }

    // 2) refine: walk forward in smaller chunks to find earliest block with logs
    // (We keep this simple and provider-friendly.)
    let candidate = low;
    const refineStep = 1_000;

    while (candidate <= high) {
        const to = Math.min(candidate + refineStep - 1, high);
        const filter: Filter = { address: addressList, fromBlock: candidate, toBlock: to };
        const logs = await getLogsWithRetry(filter);

        if (logs.length > 0) {
            const earliest = Math.min(...logs.map((l) => l.blockNumber));
            logger.info({ startBlock: earliest }, "auto-find: earliest log block found");
            return earliest;
        }

        candidate = to + 1;
    }

    // Fallback (shouldn’t happen if we found logs in the window)
    return low;
}

/** Backfill logs over [fromBlock, toBlock] for ALL targets in one getLogs call */
async function backfillChunk(fromBlock: number, toBlock: number): Promise<void> {
    const filter: Filter = { address: addressList, fromBlock, toBlock };

    let logs: readonly Log[] = [];
    try {
        logs = await getLogsWithRetry(filter);
    } catch (err: any) {
        const msg = String(err?.message ?? "").toLowerCase();

        // Split range if provider complains about response size / range too wide
        const shouldSplit =
            msg.includes("query returned more than") ||
            msg.includes("too many results") ||
            msg.includes("log response size") ||
            msg.includes("block range is too wide") ||
            msg.includes("response for request");

        if (shouldSplit && toBlock > fromBlock) {
            const mid = Math.floor((fromBlock + toBlock) / 2);
            await backfillChunk(fromBlock, mid);
            await backfillChunk(mid + 1, toBlock);
            return;
        }

        logger.error({ fromBlock, toBlock, err }, "backfill-chunk failed");
        return;
    }

    logger.info({ fromBlock, toBlock, count: logs.length }, "backfill-chunk");

    if (logs.length === 0) return;

    // Parse to IndexedEvents, dispatch by log.address -> correct iface
    const events: IndexedEvent[] = [];
    for (const log of logs) {
        const addr = (log.address ?? "").toLowerCase();
        const t = targetByAddress.get(addr);
        if (!t) continue;

        const ev = buildIndexedEvent(t, log);
        if (!ev) continue;

        // JSONL append (optional but kept)
        t.append(ev);
        appendCombined(ev);

        events.push(ev);
    }

    // Apply in strict order
    events.sort((a, b) => (a.block !== b.block ? a.block - b.block : a.logIndex - b.logIndex));
    for (const ev of events) {
        applyEventToState(ev);
    }
}

(async () => {
    const latest = await http.getBlockNumber();

    // Auto-pick start block based on where your contracts actually have logs
    const start = await autoFindStartBlock(latest);

    logger.info({ start, latest, step: STEP }, "backfill starting");

    for (let from = start; from <= latest; from += STEP) {
        const to = Math.min(from + STEP - 1, latest);
        await backfillChunk(from, to);
    }

    logger.info({ start, latest }, "backfill-complete");
})().catch((e) => {
    logger.error(e, "backfill fatal");
    process.exit(1);
});
