// backend/src/config/env.ts

import { config } from "dotenv";

config();

// Network type
export type NetworkName = 'arbitrum-sepolia' | 'aurora-testnet' | 'aurora-mainnet';

// Network-specific configuration
interface NetworkConfig {
    rpcHttpUrl: string;
    rpcWsUrl: string; // Empty string means no WebSocket
    chainId: number;
    contracts: {
        registry: string;
        nft: string;
        market: string;
    };
    blockTime: number; // Average block time in seconds (for polling)
    confirmations: number; // Blocks to wait for confirmation
}

const NETWORKS: Record<NetworkName, NetworkConfig> = {
    'arbitrum-sepolia': {
        rpcHttpUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        rpcWsUrl: 'wss://sepolia-rollup.arbitrum.io/rpc',
        chainId: 421614,
        contracts: {
            registry: process.env.ARBITRUM_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            nft: process.env.ARBITRUM_NFT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            market: process.env.ARBITRUM_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        },
        blockTime: 0.25, // ~250ms on Arbitrum
        confirmations: 3,
    },
    'aurora-testnet': {
        rpcHttpUrl: 'https://testnet.aurora.dev',
        rpcWsUrl: '', // Aurora may not support WebSocket (empty string means no WebSocket)
        chainId: 1313161555,
        contracts: {
            registry: process.env.AURORA_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            nft: process.env.AURORA_NFT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            market: process.env.AURORA_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        },
        blockTime: 1.0, // ~1 second on Aurora
        confirmations: 5,
    },
    'aurora-mainnet': {
        rpcHttpUrl: 'https://mainnet.aurora.dev',
        rpcWsUrl: '', // Aurora may not support WebSocket (empty string means no WebSocket)
        chainId: 1313161554,
        contracts: {
            registry: process.env.AURORA_MAINNET_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            nft: process.env.AURORA_MAINNET_NFT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            market: process.env.AURORA_MAINNET_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        },
        blockTime: 1.0,
        confirmations: 10,
    },
};

// Determine active network
const ACTIVE_NETWORK_NAME = (process.env.NETWORK_NAME ?? 'arbitrum-sepolia') as NetworkName;
const ACTIVE_NETWORK_CONFIG = NETWORKS[ACTIVE_NETWORK_NAME];

// Validate that network configuration exists
if (!ACTIVE_NETWORK_CONFIG) {
    throw new Error(`Unknown network: ${ACTIVE_NETWORK_NAME}. Valid networks: ${Object.keys(NETWORKS).join(', ')}`);
}

// Environment configuration with multi-network support
export const env = {
    // Network selection
    NETWORK_NAME: ACTIVE_NETWORK_NAME,

    // RPC endpoints (can be overridden by env vars)
    RPC_HTTP_URL: process.env.RPC_HTTP_URL ?? ACTIVE_NETWORK_CONFIG.rpcHttpUrl,
    RPC_WS_URL: process.env.RPC_WS_URL ?? ACTIVE_NETWORK_CONFIG.rpcWsUrl,

    // Chain configuration
    CHAIN_ID: process.env.CHAIN_ID
        ? parseInt(process.env.CHAIN_ID)
        : ACTIVE_NETWORK_CONFIG.chainId,

    // Contract addresses (prefer env vars, fallback to network config)
    REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS ?? ACTIVE_NETWORK_CONFIG.contracts.registry,
    NFT_ADDRESS: process.env.NFT_ADDRESS ?? ACTIVE_NETWORK_CONFIG.contracts.nft,
    MARKET_ADDRESS: process.env.MARKET_ADDRESS ?? ACTIVE_NETWORK_CONFIG.contracts.market,

    // Indexer configuration
    BLOCK_TIME: ACTIVE_NETWORK_CONFIG.blockTime,
    CONFIRMATIONS: process.env.CONFIRMATIONS
        ? parseInt(process.env.CONFIRMATIONS)
        : ACTIVE_NETWORK_CONFIG.confirmations,
    POLL_INTERVAL: process.env.POLL_INTERVAL
        ? parseInt(process.env.POLL_INTERVAL)
        : ACTIVE_NETWORK_CONFIG.blockTime * 1000, // Convert to ms

    // Server configuration
    PORT: process.env.PORT ?? "8080",
    LOG_DIR: process.env.LOG_DIR ?? `./data/${ACTIVE_NETWORK_NAME}`,

    // Logging
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
};

// Helper functions
export function isWebSocketAvailable(): boolean {
    return !!env.RPC_WS_URL && env.RPC_WS_URL !== '';
}

export function shouldUsePolling(): boolean {
    return !isWebSocketAvailable();
}

// Validation
function validateConfig() {
    const required = [
        'RPC_HTTP_URL',
        'REGISTRY_ADDRESS',
        'NFT_ADDRESS',
        'MARKET_ADDRESS',
    ];

    const missing = required.filter(key => {
        const value = env[key as keyof typeof env];
        return !value || value === '0x0000000000000000000000000000000000000000';
    });

    if (missing.length > 0) {
        console.warn(`⚠️  Missing or invalid configuration for ${env.NETWORK_NAME}:`);
        console.warn(`   ${missing.join(', ')}`);
        console.warn(`   Please update your .env file or deploy contracts to this network.`);
    }
}

validateConfig();

// Log active configuration
console.log(`📡 Network: ${env.NETWORK_NAME} (Chain ID: ${env.CHAIN_ID})`);
console.log(`🔗 RPC: ${env.RPC_HTTP_URL}`);
console.log(`📦 Registry: ${env.REGISTRY_ADDRESS}`);
console.log(`🎨 NFT: ${env.NFT_ADDRESS}`);
console.log(`🛒 Market: ${env.MARKET_ADDRESS}`);
console.log(`⏱️  ${isWebSocketAvailable() ? 'Using WebSocket' : `Using HTTP polling (${env.POLL_INTERVAL}ms)`}`);