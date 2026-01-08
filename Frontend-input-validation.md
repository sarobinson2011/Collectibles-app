# Frontend Input Validation - Baseline Specification

## Registration Form Fields

1. RFID

Format: RFID-[SEGMENT]-[SEGMENT]... (minimum 2 segments after "RFID-")
Pattern: /^RFID-[A-Z0-9]+-[A-Z0-9]+$/i
Alphanumeric only, case insensitive, no length limit on segments
Examples: RFID-TEST-0069, RFID-PROD-12345, RFID-2025-BATCH1-00001

2. Authenticity Hash

Format: 32-byte hex string with 0x prefix
Pattern: /^0x[a-fA-F0-9]{64}$/
Exactly 66 characters total (0x + 64 hex chars)
Example: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef

3. Initial Owner

Format: Ethereum address with 0x prefix
Pattern: /^0x[a-fA-F0-9]{40}$/
Exactly 42 characters total (0x + 40 hex chars)
Example: 0xF8f8269488f73fab3935555FCDdD6035699deE25

4. Token URI

Format: URL (http/https/ipfs/ar) OR empty for auto-generation
Pattern: /^(https?:\/\/|ipfs:\/\/|ar:\/\/).+/ OR empty string
Optional field - leave blank to auto-generate
Example: https://example.com/metadata/123.json or ipfs://Qm... or ``

5. Image File

Format: JPEG only
Max size: 5MB
Auto-resize: Backend automatically resizes to 1024x1024
Required field (cannot be empty)
MIME type: image/jpeg

## Validation Strategy

Real-time validation on blur/change
Visual feedback (red border + error message)
Disable submit button until all fields valid
Backend auto-resizes images (no dimension validation needed)