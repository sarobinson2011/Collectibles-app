// src/eth/contracts.ts

import { Contract } from "ethers";
import { NFT_ABI, MARKET_ABI, REGISTRY_ABI } from "./abis";
import { NFT_ADDRESS, MARKET_ADDRESS, REGISTRY_ADDRESS } from "./config";
import { useWallet } from "./wallet";

export function useSignerContracts() {
    const { provider, hasProvider, wrongNetwork, address } = useWallet();

    async function getSigner() {
        if (!hasProvider) {
            throw new Error("No injected wallet found.");
        }
        if (!provider) {
            throw new Error("Wallet provider not ready yet.");
        }
        if (!address) {
            throw new Error("No wallet connected.");
        }
        if (wrongNetwork) {
            throw new Error("Wrong network selected in wallet.");
        }
        return provider.getSigner();
    }

    async function getNft() {
        const signer = await getSigner();
        return new Contract(NFT_ADDRESS, NFT_ABI, signer);
    }

    async function getMarket() {
        const signer = await getSigner();
        return new Contract(MARKET_ADDRESS, MARKET_ABI, signer);
    }

    async function getRegistry() {
        const signer = await getSigner();
        return new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
    }

    return {
        getSigner,
        getNft,
        getMarket,
        getRegistry,
    };
}
