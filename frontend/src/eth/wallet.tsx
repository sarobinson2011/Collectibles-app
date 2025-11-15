// src/eth/wallet.tsx

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { BrowserProvider } from "ethers";
import { CHAIN_ID } from "./config";

type WalletContextValue = {
    address: string | null;
    chainId: number | null;
    provider: BrowserProvider | null;
    connecting: boolean;
    hasProvider: boolean;
    wrongNetwork: boolean;
    connect: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
    const [address, setAddress] = useState<string | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [hasProvider, setHasProvider] = useState(false);

    // Detect provider + existing connection on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        const eth = (window as any).ethereum;
        if (!eth) {
            setHasProvider(false);
            return;
        }

        setHasProvider(true);
        const prov = new BrowserProvider(eth);
        setProvider(prov);

        async function init() {
            try {
                const accounts: string[] = await eth.request({
                    method: "eth_accounts",
                });
                setAddress(accounts[0] ?? null);

                const chainIdHex: string = await eth.request({
                    method: "eth_chainId",
                });
                setChainId(parseInt(chainIdHex, 16));
            } catch (e) {
                console.error("wallet init error", e);
            }
        }

        void init();

        const handleAccountsChanged = (accounts: string[]) => {
            setAddress(accounts[0] ?? null);
        };

        const handleChainChanged = (_chainIdHex: string) => {
            // simplest: reload to keep things consistent
            window.location.reload();
        };

        eth.on?.("accountsChanged", handleAccountsChanged);
        eth.on?.("chainChanged", handleChainChanged);

        return () => {
            eth.removeListener?.("accountsChanged", handleAccountsChanged);
            eth.removeListener?.("chainChanged", handleChainChanged);
        };
    }, []);

    async function connect() {
        if (typeof window === "undefined") return;
        const eth = (window as any).ethereum;
        if (!eth) {
            alert("No injected wallet found (e.g. MetaMask).");
            return;
        }

        setConnecting(true);
        try {
            const prov = new BrowserProvider(eth);
            setProvider(prov);

            const accounts: string[] = await prov.send("eth_requestAccounts", []);
            setAddress(accounts[0] ?? null);

            const chainIdHex: string = await eth.request({
                method: "eth_chainId",
            });
            setChainId(parseInt(chainIdHex, 16));
        } catch (e) {
            console.error("wallet connect error", e);
        } finally {
            setConnecting(false);
        }
    }

    const wrongNetwork = chainId !== null && chainId !== CHAIN_ID;

    const value: WalletContextValue = {
        address,
        chainId,
        provider,
        connecting,
        hasProvider,
        wrongNetwork,
        connect,
    };

    return (
        <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
    );
}

export function useWallet(): WalletContextValue {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error("useWallet must be used within WalletProvider");
    }
    return ctx;
}
