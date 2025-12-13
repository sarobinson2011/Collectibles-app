// src/pages/AdminPage.tsx

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { REGISTRY_ADDRESS } from "../eth/config";
import { REGISTRY_ABI } from "../eth/abis";
import { useWallet } from "../eth/wallet";
import { uploadCollectibleImage } from "../api";

type FormState = {
    rfid: string;
    authenticityHash: string;
    initialOwner: string;
    tokenURI: string;
};

async function getRegistryWithSignerFromProvider(
    provider: BrowserProvider | null,
) {
    if (!provider) {
        throw new Error("Wallet provider not ready yet.");
    }
    const signer = await provider.getSigner();
    return new Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signer);
}

export function AdminPage() {
    const { address, provider, hasProvider, wrongNetwork } = useWallet();

    const [form, setForm] = useState<FormState>({
        rfid: "",
        authenticityHash: "",
        initialOwner: "",
        tokenURI: "",
    });
    const [submitting, setSubmitting] = useState(false);

    // image upload state
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUploadError, setImageUploadError] = useState<string | null>(null);

    // Prefill initialOwner from connected wallet if empty
    useEffect(() => {
        if (address && !form.initialOwner) {
            setForm((prev) => ({ ...prev, initialOwner: address }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    function handleChange<K extends keyof FormState>(
        key: K,
        value: FormState[K],
    ) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setSubmitting(true);
        setImageUploadError(null);

        try {
            if (!hasProvider) {
                throw new Error("No injected wallet found.");
            }
            if (!address) {
                throw new Error("No wallet connected.");
            }
            if (wrongNetwork) {
                throw new Error("Wrong network selected in wallet.");
            }

            const registry = await getRegistryWithSignerFromProvider(provider);

            // Basic sanity checks; the contract will also validate
            if (!form.rfid) throw new Error("RFID is required");
            if (!form.authenticityHash.startsWith("0x")) {
                throw new Error("Authenticity hash must be a 0x-prefixed bytes32");
            }
            if (!form.initialOwner.startsWith("0x")) {
                throw new Error("Initial owner must be an 0x-prefixed address");
            }
            if (!form.tokenURI) throw new Error("tokenURI is required");

            // 1) On-chain registration
            const tx = await registry.registerCollectible(
                form.rfid,
                form.authenticityHash,
                form.initialOwner,
                form.tokenURI,
            );

            alert(`Register tx sent: ${tx.hash}`);
            await tx.wait();
            alert("Collectible registered and NFT minted.");

            // 2) Compute rfidHash exactly as the contract does (keccak256 of RFID string)
            const rfidHash = keccak256(toUtf8Bytes(form.rfid));

            // 3) Upload image if one was selected
            if (imageFile) {
                try {
                    await uploadCollectibleImage(rfidHash, imageFile);
                } catch (err: any) {
                    console.error("Image upload failed", err);
                    setImageUploadError(
                        err?.message ?? "Failed to upload image for this collectible",
                    );
                }
            }

            // 4) Optional: reset form (keep initialOwner prefilled)
            setForm({
                rfid: "",
                authenticityHash: "",
                initialOwner: address,
                tokenURI: "",
            });
            setImageFile(null);
        } catch (err: any) {
            console.error(err);
            alert(`Register failed: ${err?.message ?? String(err)}`);
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div>
            <h2>Admin</h2>
            <p>
                Register new collectibles via the Registry contract. You must be the
                Registry owner (admin) for this to succeed.
            </p>

            {!hasProvider && (
                <p style={{ color: "#f97373" }}>
                    No wallet detected. Install MetaMask or another injected wallet.
                </p>
            )}

            {hasProvider && !address && (
                <p>Connect your wallet to register collectibles.</p>
            )}

            {hasProvider && address && wrongNetwork && (
                <p style={{ color: "#f97373" }}>
                    Wrong network selected in wallet. Please switch to Arbitrum Sepolia.
                </p>
            )}

            <form onSubmit={handleSubmit} className="admin-form">
                <div className="form-row">
                    <label>
                        RFID
                        <input
                            type="text"
                            value={form.rfid}
                            onChange={(e) => handleChange("rfid", e.target.value)}
                            placeholder="RFID-TEST-0002"
                            required
                        />
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Authenticity hash (bytes32)
                        <input
                            type="text"
                            value={form.authenticityHash}
                            onChange={(e) =>
                                handleChange("authenticityHash", e.target.value)
                            }
                            placeholder="0x..."
                            required
                        />
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Initial owner
                        <input
                            type="text"
                            value={form.initialOwner}
                            onChange={(e) => handleChange("initialOwner", e.target.value)}
                            placeholder="0xF8f8..."
                            required
                        />
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        tokenURI
                        <input
                            type="text"
                            value={form.tokenURI}
                            onChange={(e) => handleChange("tokenURI", e.target.value)}
                            placeholder="ipfs://..."
                            required
                        />
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Collectible image (optional)
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                setImageFile(file);
                                setImageUploadError(null);
                            }}
                        />
                    </label>
                    {imageUploadError && (
                        <p style={{ color: "#f97373", fontSize: "0.8rem" }}>
                            {imageUploadError}
                        </p>
                    )}
                </div>

                <button type="submit" disabled={submitting || !address || wrongNetwork}>
                    {submitting ? "Submitting…" : "Register collectible"}
                </button>
            </form>
        </div>
    );
}
