// src/eth/config.ts

export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 421614);

export const REGISTRY_ADDRESS =
    import.meta.env.VITE_REGISTRY_ADDRESS ??
    "0x75D34c21Ac5BFf805E68DC73a5dc534B355358C7";

export const NFT_ADDRESS =
    import.meta.env.VITE_NFT_ADDRESS ??
    "0x6cecc2187EE1218988DaC70582ECe615987ce768";

export const MARKET_ADDRESS =
    import.meta.env.VITE_MARKET_ADDRESS ??
    "0xEce42dA8437980cB22AA09C9676e698AC054c95e";
