import { join } from "path";
import { JsonRpcProvider, Interface, type Filter } from "ethers";
import { env } from "../config/env.js";
import { makeJsonl } from "../infra/files.js";
import { logger } from "../infra/logger.js";
import { REGISTRY_ABI, NFT_ABI, MARKET_ABI } from "../contracts/abi.js";

const http = new JsonRpcProvider(env.RPC_HTTP_URL, env.CHAIN_ID);

const appendRegistry = makeJsonl(join(env.LOG_DIR, "registry_log.jsonl"));
const appendNft = makeJsonl(join(env.LOG_DIR, "nft_log.jsonl"));
const appendMarket = makeJsonl(join(env.LOG_DIR, "market_log.jsonl"));
const appendCombined = makeJsonl(join(env.LOG_DIR, "collectible_log.jsonl"));

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

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

type Target = {
    name: "registry" | "nft" | "market";
    address: string;
    iface: Interface;
    append: (obj: unknown) => void;
};

const targets: Target[] = [
    { name: "registry", address: env.REGISTRY_ADDRESS, iface: new Interface(REGISTRY_ABI as any), append: appendRegistry },
    { name: "nft", address: env.NFT_ADDRESS, iface: new Interface(NFT_ABI as any), append: appendNft },
    { name: "market", address: env.MARKET_ADDRESS, iface: new Interface(MARKET_ABI as any), append: appendMarket },
];

/** eth_getLogs with retries, backoff, and polite pacing */
async function getLogsWithRetry(filter: Filter, attempt = 1): Promise<readonly any[]> {
    // polite global pacing (helps avoid -32005)
    await sleep(250);

    try {
        return await http.getLogs(filter);
    } catch (err: any) {
        const msg = String(err?.message ?? "");
        const code = String(err?.code ?? "");

        // Infura rate limit or transient provider errors
        const isRateLimited = code === "BAD_DATA" && msg.includes("Too Many Requests");
        const isServerBusy = code === "SERVER_ERROR" || msg.includes("timeout") || msg.includes("ECONNRESET");

        if ((isRateLimited || isServerBusy) && attempt <= 6) {
            // exponential backoff + jitter
            const base = 600 * Math.pow(2, attempt - 1); // 0.6s, 1.2s, 2.4s, 4.8s, 9.6s, 19.2s
            const jitter = Math.floor(Math.random() * 300);
            const wait = base + jitter;
            logger.warn({ attempt, wait, fromBlock: (filter as any).fromBlock, toBlock: (filter as any).toBlock }, "rate-limited or busy, backing off");
            await sleep(wait);
            return getLogsWithRetry(filter, attempt + 1);
        }

        // If we ever hit Infura’s “your range returned too many logs” (also -32005 in other contexts),
        // reduce the caller's chunk size (handled by the caller by catching and splitting the range).

        throw err;
    }
}

/** Backfill a single address over [fromBlock, toBlock], auto-splitting the range if needed */
async function backfillRange(t: Target, fromBlock: number, toBlock: number): Promise<void> {
    // defensive: never invert
    if (toBlock < fromBlock) return;

    const filter: Filter = { address: t.address, fromBlock, toBlock };

    try {
        const logs = await getLogsWithRetry(filter);
        logger.info({ name: t.name, fromBlock, toBlock, count: logs.length }, "backfill-chunk");

        for (const log of logs) {
            let parsed: any | null = null;
            try { parsed = t.iface.parseLog(log); } catch { parsed = null; }
            if (parsed !== null) {
                const record = {
                    t: Date.now(),
                    contract: t.name,
                    event: parsed.name,
                    args: jsonSafe(parsed.args),
                    tx: log.transactionHash,
                    block: log.blockNumber,
                    logIndex: log.index,
                };
                t.append(record);
                appendCombined(record);
            }
        }
    } catch (err: any) {
        const msg = String(err?.message ?? "");
        const code = String(err?.code ?? "");
        // Split range on “Too Many Requests” or “too much data” style failures
        if ((code === "BAD_DATA" && msg.includes("Too Many Requests")) || msg.includes("response for request")) {
            const mid = Math.floor((fromBlock + toBlock) / 2);
            if (mid === fromBlock || mid === toBlock) {
                // cannot split further; give up on this tiny range
                logger.error({ name: t.name, fromBlock, toBlock, msg }, "unsplittable range failed");
                return;
            }
            // recurse on halves
            await backfillRange(t, fromBlock, mid);
            await backfillRange(t, mid + 1, toBlock);
            return;
        }

        logger.error({ name: t.name, fromBlock, toBlock, err }, "backfill-range error");
    }
}

(async () => {
    const latest = await http.getBlockNumber();

    // Tune these for your true deployment height for best performance.
    // Start with a modest lookback to avoid hammering the provider.
    const lookback = 120_000;
    const start = Math.max(0, latest - lookback);

    // Start with a smaller chunk; the splitter above will subdivide on demand.
    const step = 1_500;

    for (let from = start; from <= latest; from += step) {
        const to = Math.min(from + step - 1, latest);
        for (const t of targets) {
            await backfillRange(t, from, to);
        }
    }

    logger.info({ start, latest }, "backfill-complete");
})().catch((e) => {
    logger.error(e, "backfill fatal");
    process.exit(1);
});
