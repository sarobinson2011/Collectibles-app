// frontend/src/utils/validation.ts

export interface ValidationResult {
    valid: boolean;
    error?: string;
}

/**
 * Validate RFID format: RFID-[SEGMENT]-[SEGMENT]...
 * At least 2 segments after "RFID-", alphanumeric only
 */
export function validateRFID(rfid: string): ValidationResult {
    if (!rfid) {
        return { valid: false, error: "RFID is required" };
    }

    const pattern = /^RFID-[A-Z0-9]+-[A-Z0-9]+$/i;

    if (!pattern.test(rfid)) {
        return {
            valid: false,
            error: "RFID must be in format: RFID-SEGMENT-SEGMENT (e.g., RFID-TEST-0069)"
        };
    }

    return { valid: true };
}

/**
 * Validate Ethereum address: 0x + 40 hex characters
 */
export function validateAddress(address: string): ValidationResult {
    if (!address) {
        return { valid: false, error: "Address is required" };
    }

    const pattern = /^0x[a-fA-F0-9]{40}$/;

    if (!pattern.test(address)) {
        return {
            valid: false,
            error: "Must be a valid Ethereum address (0x + 40 hex characters)"
        };
    }

    return { valid: true };
}

/**
 * Validate authenticity hash: 0x + 64 hex characters (32 bytes)
 */
export function validateAuthenticityHash(hash: string): ValidationResult {
    if (!hash) {
        return { valid: false, error: "Authenticity hash is required" };
    }

    const pattern = /^0x[a-fA-F0-9]{64}$/;

    if (!pattern.test(hash)) {
        return {
            valid: false,
            error: "Must be a 32-byte hex string (0x + 64 hex characters)"
        };
    }

    return { valid: true };
}

/**
 * Validate Token URI: URL format or empty (for auto-generation)
 */
export function validateTokenURI(uri: string): ValidationResult {
    // Empty is allowed (auto-generate)
    if (!uri || uri.trim() === "") {
        return { valid: true };
    }

    const pattern = /^(https?:\/\/|ipfs:\/\/|ar:\/\/).+/;

    if (uri.length < 10) {
        return {
            valid: false,
            error: "Token URI must be at least 10 characters if provided"
        };
    }

    if (!pattern.test(uri)) {
        return {
            valid: false,
            error: "Must be a valid URL (http://, https://, ipfs://, or ar://)"
        };
    }

    return { valid: true };
}

/**
 * Validate image file: JPEG only, max 5MB
 */
export function validateImageFile(file: File | null): ValidationResult {
    if (!file) {
        return { valid: false, error: "Image file is required" };
    }

    // Check file type
    if (file.type !== "image/jpeg" && !file.name.toLowerCase().endsWith(".jpg") && !file.name.toLowerCase().endsWith(".jpeg")) {
        return {
            valid: false,
            error: "Only JPEG images are allowed (.jpg or .jpeg)"
        };
    }

    // Check file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        return {
            valid: false,
            error: `Image must be smaller than 5MB (current: ${(file.size / 1024 / 1024).toFixed(2)}MB)`
        };
    }

    return { valid: true };
}

/**
 * Validate entire registration form
 */
export interface RegistrationForm {
    rfid: string;
    authenticityHash: string;
    initialOwner: string;
    tokenURI: string;
}

export interface FormValidation {
    rfid: ValidationResult;
    authenticityHash: ValidationResult;
    initialOwner: ValidationResult;
    tokenURI: ValidationResult;
    imageFile: ValidationResult;
    isValid: boolean;
}

export function validateRegistrationForm(
    form: RegistrationForm,
    imageFile: File | null
): FormValidation {
    const rfid = validateRFID(form.rfid);
    const authenticityHash = validateAuthenticityHash(form.authenticityHash);
    const initialOwner = validateAddress(form.initialOwner);
    const tokenURI = validateTokenURI(form.tokenURI);
    const image = validateImageFile(imageFile);

    return {
        rfid,
        authenticityHash,
        initialOwner,
        tokenURI,
        imageFile: image,
        isValid: rfid.valid && authenticityHash.valid && initialOwner.valid && tokenURI.valid && image.valid
    };
}
