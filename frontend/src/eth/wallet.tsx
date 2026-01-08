// src/eth/wallet.tsx

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { BrowserProvider } from "ethers";
import { ACTIVE_NETWORK, getNetworkByChainId, isCorrectNetwork } from "./config";

type WalletContextValue = {
    address: string | null;
    chainId: number | null;
    provider: BrowserProvider | null;
    connecting: boolean;
    hasProvider: boolean;
    wrongNetwork: boolean;
    currentNetworkName: string | null;
    expectedNetworkName: string;
    connect: () => Promise<void>;
    switchToCorrectNetwork: () => Promise<void>;
};

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

declare global {
    interface Window {
        ethereum?: any;
    }
}

export function WalletProvider({ children }: { children: ReactNode }) {
    const [address, setAddress] = useState<string | null>(null);
    const [chainId, setChainId] = useState<number | null>(null);
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [connecting, setConnecting] = useState(false);
    const [hasProvider, setHasProvider] = useState(false);

    useEffect(() => {
        const eth = window.ethereum;
        if (!eth) {
            setHasProvider(false);
            return;
        }

        setHasProvider(true);

        // Single BrowserProvider instance for the current ethereum object
        const prov = new BrowserProvider(eth);
        setProvider(prov);

        let cancelled = false;

        // SOFT CONNECT:
        // - uses eth_accounts (no popup)
        // - restores account + chain on page load if already authorized
        async function init() {
            try {
                const accounts: string[] = await eth.request({
                    method: "eth_accounts",
                });
                if (!cancelled) {
                    setAddress(accounts[0] ?? null);
                }

                const chainIdHex: string = await eth.request({
                    method: "eth_chainId",
                });
                const parsed = parseInt(chainIdHex, 16);
                if (!cancelled) {
                    setChainId(Number.isFinite(parsed) ? parsed : null);
                }
            } catch (e) {
                console.error("wallet init error", e);
            }
        }

        void init();

        // React to account changes (MetaMask account switch)
        function handleAccountsChanged(accounts: string[]) {
            setAddress(accounts[0] ?? null);
        }

        // React to network changes (chain switch) without reload
        function handleChainChanged(chainIdHex: string) {
            const parsed = parseInt(chainIdHex, 16);
            setChainId(Number.isFinite(parsed) ? parsed : null);
        }

        eth.on?.("accountsChanged", handleAccountsChanged);
        eth.on?.("chainChanged", handleChainChanged);

        return () => {
            cancelled = true;
            eth.removeListener?.("accountsChanged", handleAccountsChanged);
            eth.removeListener?.("chainChanged", handleChainChanged);
        };
    }, []);

    // EXPLICIT CONNECT:
    // - uses eth_requestAccounts (MetaMask popup)
    // - lets the user connect when they click your "Connect" button
    async function connect() {
        const eth = window.ethereum;
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
            const parsed = parseInt(chainIdHex, 16);
            setChainId(Number.isFinite(parsed) ? parsed : null);
        } catch (e) {
            console.error("wallet connect error", e);
        } finally {
            setConnecting(false);
        }
    }

    // NEW: Switch to the correct network automatically
    async function switchToCorrectNetwork() {
        const eth = window.ethereum;
        if (!eth) {
            alert("No wallet found");
            return;
        }

        try {
            // Try to switch to the correct network
            await eth.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: `0x${ACTIVE_NETWORK.chainId.toString(16)}` }],
            });
        } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
                try {
                    await eth.request({
                        method: "wallet_addEthereumChain",
                        params: [
                            {
                                chainId: `0x${ACTIVE_NETWORK.chainId.toString(16)}`,
                                chainName: ACTIVE_NETWORK.name,
                                rpcUrls: [ACTIVE_NETWORK.rpcUrl],
                                nativeCurrency: ACTIVE_NETWORK.nativeCurrency,
                                blockExplorerUrls: [ACTIVE_NETWORK.blockExplorer],
                            },
                        ],
                    });
                } catch (addError) {
                    console.error("Failed to add network", addError);
                    alert("Failed to add network to wallet");
                }
            } else {
                console.error("Failed to switch network", switchError);
            }
        }
    }

    const wrongNetwork = chainId !== null && !isCorrectNetwork(chainId);

    // Get human-readable network names
    const currentNetworkName = chainId ? getNetworkByChainId(chainId)?.name ?? "Unknown Network" : null;
    const expectedNetworkName = ACTIVE_NETWORK.name;

    const value: WalletContextValue = {
        address,
        chainId,
        provider,
        connecting,
        hasProvider,
        wrongNetwork,
        currentNetworkName,
        expectedNetworkName,
        connect,
        switchToCorrectNetwork,
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