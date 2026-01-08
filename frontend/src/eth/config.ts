// src/eth/config.ts

export type NetworkName = 'arbitrum-sepolia' | 'aurora-testnet' | 'aurora-mainnet';

export interface NetworkConfig {
    chainId: number;
    name: string;
    rpcUrl: string;
    blockExplorer: string;
    nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
    };
    contracts: {
        registry: string;
        nft: string;
        market: string;
        usdc: string;  // ADDED
    };
    admin: string;
    // Optional: for Aurora networks
    nearNetwork?: 'testnet' | 'mainnet';
}

// Network configurations
export const NETWORKS: Record<NetworkName, NetworkConfig> = {
    'arbitrum-sepolia': {
        chainId: 421614,
        name: 'Arbitrum Sepolia',
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
        blockExplorer: 'https://sepolia.arbiscan.io',
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
        },
        contracts: {
            registry: '0x75D34c21Ac5BFf805E68DC73a5dc534B355358C7',
            nft: '0x6cecc2187EE1218988DaC70582ECe615987ce768',
            market: '0xEce42dA8437980cB22AA09C9676e698AC054c95e',
            usdc: '0xAa1D42a9c87690789964AD6B6ec0e42FfeBda66F',  // ADDED
        },
        admin: '0xF8f8269488f73fab3935555FCDdD6035699deE25',
    },
    'aurora-testnet': {
        chainId: 1313161555,
        name: 'Aurora Testnet',
        rpcUrl: 'https://testnet.aurora.dev',
        blockExplorer: 'https://testnet.aurorascan.dev',
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
        },
        contracts: {
            registry: import.meta.env.VITE_AURORA_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            nft: import.meta.env.VITE_AURORA_NFT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            market: import.meta.env.VITE_AURORA_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            usdc: '0x8BC104732AF20584058D8eF68a4C448698fFB282',  // ADDED
        },
        admin: import.meta.env.VITE_AURORA_ADMIN_ADDRESS ?? '0xF8f8269488f73fab3935555FCDdD6035699deE25',
        nearNetwork: 'testnet',
    },
    'aurora-mainnet': {
        chainId: 1313161554,
        name: 'Aurora Mainnet',
        rpcUrl: 'https://mainnet.aurora.dev',
        blockExplorer: 'https://aurorascan.dev',
        nativeCurrency: {
            name: 'Ethereum',
            symbol: 'ETH',
            decimals: 18,
        },
        contracts: {
            registry: import.meta.env.VITE_AURORA_MAINNET_REGISTRY_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            nft: import.meta.env.VITE_AURORA_MAINNET_NFT_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            market: import.meta.env.VITE_AURORA_MAINNET_MARKET_ADDRESS ?? '0x0000000000000000000000000000000000000000',
            usdc: '0x0000000000000000000000000000000000000000',  // ADDED (update when deployed to mainnet)
        },
        admin: import.meta.env.VITE_AURORA_MAINNET_ADMIN_ADDRESS ?? '0x0000000000000000000000000000000000000000',
        nearNetwork: 'mainnet',
    },
};

// Determine active network from environment variable
const ACTIVE_NETWORK_NAME = (import.meta.env.VITE_NETWORK ?? 'arbitrum-sepolia') as NetworkName;

// Export the active network configuration
export const ACTIVE_NETWORK = NETWORKS[ACTIVE_NETWORK_NAME];

// Backward compatibility exports (so existing code doesn't break)
export const CHAIN_ID = ACTIVE_NETWORK.chainId;
export const REGISTRY_ADDRESS = ACTIVE_NETWORK.contracts.registry;
export const NFT_ADDRESS = ACTIVE_NETWORK.contracts.nft;
export const MARKET_ADDRESS = ACTIVE_NETWORK.contracts.market;
export const USDC_ADDRESS = ACTIVE_NETWORK.contracts.usdc;  // ADDED
export const ADMIN_ADDRESS = ACTIVE_NETWORK.admin;

// Helper functions
export function isAuroraNetwork(network?: NetworkConfig): boolean {
    const net = network ?? ACTIVE_NETWORK;
    return net.nearNetwork !== undefined;
}

export function getNetworkByChainId(chainId: number): NetworkConfig | undefined {
    return Object.values(NETWORKS).find(net => net.chainId === chainId);
}

export function isCorrectNetwork(chainId: number): boolean {
    return chainId === ACTIVE_NETWORK.chainId;
}

// Helper to get block explorer URL for a transaction or address
export function getExplorerUrl(hashOrAddress: string, type: 'tx' | 'address' = 'tx'): string {
    const base = ACTIVE_NETWORK.blockExplorer;
    return type === 'tx' ? `${base}/tx/${hashOrAddress}` : `${base}/address/${hashOrAddress}`;
}