// src/pages/AdminPage.tsx

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from "ethers";
import { REGISTRY_ADDRESS } from "../eth/config";
import { REGISTRY_ABI } from "../eth/abis";
import { useWallet } from "../eth/wallet";
import { uploadCollectibleImage } from "../api";
import {
    validateRFID,
    validateAddress,
    validateAuthenticityHash,
    validateTokenURI,
    validateImageFile,
} from "../utils/validation";

type FormState = {
    rfid: string;
    authenticityHash: string;
    initialOwner: string;
    tokenURI: string;
};

type FormErrors = {
    rfid: string | null;
    authenticityHash: string | null;
    initialOwner: string | null;
    tokenURI: string | null;
    imageFile: string | null;
};

type TouchedFields = {
    rfid: boolean;
    authenticityHash: boolean;
    initialOwner: boolean;
    tokenURI: boolean;
    imageFile: boolean;
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

    // Image upload state
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imageUploadError, setImageUploadError] = useState<string | null>(null);

    // Validation state
    const [errors, setErrors] = useState<FormErrors>({
        rfid: null,
        authenticityHash: null,
        initialOwner: null,
        tokenURI: null,
        imageFile: null,
    });

    // Track which fields have been touched (for showing errors only after user interaction)
    const [touched, setTouched] = useState<TouchedFields>({
        rfid: false,
        authenticityHash: false,
        initialOwner: false,
        tokenURI: false,
        imageFile: false,
    });

    // Prefill initialOwner from connected wallet if empty
    useEffect(() => {
        if (address && !form.initialOwner) {
            setForm((prev) => ({ ...prev, initialOwner: address }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address]);

    // Real-time validation
    useEffect(() => {
        const newErrors: FormErrors = {
            rfid: null,
            authenticityHash: null,
            initialOwner: null,
            tokenURI: null,
            imageFile: null,
        };

        const rfidResult = validateRFID(form.rfid);
        if (!rfidResult.valid) newErrors.rfid = rfidResult.error || null;

        const hashResult = validateAuthenticityHash(form.authenticityHash);
        if (!hashResult.valid) newErrors.authenticityHash = hashResult.error || null;

        const ownerResult = validateAddress(form.initialOwner);
        if (!ownerResult.valid) newErrors.initialOwner = ownerResult.error || null;

        const uriResult = validateTokenURI(form.tokenURI);
        if (!uriResult.valid) newErrors.tokenURI = uriResult.error || null;

        const imageResult = validateImageFile(imageFile);
        if (!imageResult.valid) newErrors.imageFile = imageResult.error || null;

        setErrors(newErrors);
    }, [form, imageFile]);

    // Check if form is valid
    const isFormValid = !errors.rfid && !errors.authenticityHash && !errors.initialOwner && !errors.tokenURI && !errors.imageFile;

    function handleChange<K extends keyof FormState>(
        key: K,
        value: FormState[K],
    ) {
        setForm((prev) => ({ ...prev, [key]: value }));
    }

    function handleBlur(field: keyof TouchedFields) {
        setTouched((prev) => ({ ...prev, [field]: true }));
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();

        // Mark all fields as touched
        setTouched({
            rfid: true,
            authenticityHash: true,
            initialOwner: true,
            tokenURI: true,
            imageFile: true,
        });

        // Don't submit if form is invalid
        if (!isFormValid) {
            alert("Please fix validation errors before submitting");
            return;
        }

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

            // 3) Upload image
            if (imageFile) {
                try {
                    await uploadCollectibleImage(rfidHash, imageFile);
                    alert("Image uploaded successfully!");
                } catch (err: any) {
                    console.error("Image upload failed", err);
                    setImageUploadError(
                        err?.message ?? "Failed to upload image for this collectible",
                    );
                }
            }

            // 4) Reset form (keep initialOwner prefilled)
            setForm({
                rfid: "",
                authenticityHash: "",
                initialOwner: address,
                tokenURI: "",
            });
            setImageFile(null);
            setTouched({
                rfid: false,
                authenticityHash: false,
                initialOwner: false,
                tokenURI: false,
                imageFile: false,
            });
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
                    Wrong network selected in wallet. Please switch to the correct network.
                </p>
            )}

            <form onSubmit={handleSubmit} className="admin-form">
                <div className="form-row">
                    <label>
                        RFID *
                        <input
                            type="text"
                            value={form.rfid}
                            onChange={(e) => handleChange("rfid", e.target.value)}
                            onBlur={() => handleBlur("rfid")}
                            placeholder="RFID-TEST-0069"
                            required
                            style={{
                                borderColor: touched.rfid && errors.rfid ? "#f97373" : undefined,
                            }}
                        />
                        {touched.rfid && errors.rfid && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {errors.rfid}
                            </span>
                        )}
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Authenticity Hash (32 bytes) *
                        <input
                            type="text"
                            value={form.authenticityHash}
                            onChange={(e) =>
                                handleChange("authenticityHash", e.target.value)
                            }
                            onBlur={() => handleBlur("authenticityHash")}
                            placeholder="0x1234567890abcdef..."
                            required
                            style={{
                                borderColor: touched.authenticityHash && errors.authenticityHash ? "#f97373" : undefined,
                            }}
                        />
                        {touched.authenticityHash && errors.authenticityHash && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {errors.authenticityHash}
                            </span>
                        )}
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Initial Owner (Ethereum Address) *
                        <input
                            type="text"
                            value={form.initialOwner}
                            onChange={(e) => handleChange("initialOwner", e.target.value)}
                            onBlur={() => handleBlur("initialOwner")}
                            placeholder="0xF8f8269488f73fab3935555FCDdD6035699deE25"
                            required
                            style={{
                                borderColor: touched.initialOwner && errors.initialOwner ? "#f97373" : undefined,
                            }}
                        />
                        {touched.initialOwner && errors.initialOwner && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {errors.initialOwner}
                            </span>
                        )}
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Token URI (leave empty to auto-generate)
                        <input
                            type="text"
                            value={form.tokenURI}
                            onChange={(e) => handleChange("tokenURI", e.target.value)}
                            onBlur={() => handleBlur("tokenURI")}
                            placeholder="https://... or ipfs://... or leave empty"
                            style={{
                                borderColor: touched.tokenURI && errors.tokenURI ? "#f97373" : undefined,
                            }}
                        />
                        {touched.tokenURI && errors.tokenURI && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {errors.tokenURI}
                            </span>
                        )}
                    </label>
                </div>

                <div className="form-row">
                    <label>
                        Collectible Image (JPEG only, max 5MB) *
                        <input
                            type="file"
                            accept="image/jpeg,.jpg,.jpeg"
                            onChange={(e) => {
                                const file = e.target.files?.[0] ?? null;
                                setImageFile(file);
                                setImageUploadError(null);
                                setTouched((prev) => ({ ...prev, imageFile: true }));
                            }}
                        />
                        {touched.imageFile && errors.imageFile && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {errors.imageFile}
                            </span>
                        )}
                        {imageUploadError && (
                            <span style={{ color: "#f97373", fontSize: "0.85rem" }}>
                                {imageUploadError}
                            </span>
                        )}
                        <span style={{ fontSize: "0.8rem", opacity: 0.7, display: "block", marginTop: "0.25rem" }}>
                            Image will be automatically resized to 1024x1024
                        </span>
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={submitting || !address || wrongNetwork || !isFormValid}
                    style={{
                        opacity: (!isFormValid || submitting || !address || wrongNetwork) ? 0.5 : 1,
                        cursor: (!isFormValid || submitting || !address || wrongNetwork) ? "not-allowed" : "pointer"
                    }}
                >
                    {submitting ? "Submitting…" : "Register collectible"}
                </button>

                {!isFormValid && Object.values(touched).some(t => t) && (
                    <p style={{ color: "#f97373", fontSize: "0.9rem", marginTop: "1rem" }}>
                        Please fix all validation errors before submitting
                    </p>
                )}
            </form>
        </div>
    );
}