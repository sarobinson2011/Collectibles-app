#!/usr/bin/env bash
set -euo pipefail

# ===== Config from your direnv/.env =====
RPC="${ARBITRUM_SEPOLIA_RPC_URL}"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/dev-deployer}"
PASSFILE="${PASSFILE:-$HOME/.secrets/foundry-dev.pass}"
CHAIN_ID=421614

NFT="${NFT}"        # proxy: CollectibleNFTV1
MKT="${MKT}"        # proxy: CollectibleMarketV1
USDC="${COLLECTIBLE_USDC6MOCK_ADDRESS}"   # Mock USDC (6dp)

SELLER="${DEV_WALLET1}"
BUYER="${BUYER:-$DEV_WALLET1}"            # set BUYER in env to a second wallet if you want

# ===== Scenario params =====
RFID="${RFID:-rfid-demo-$(date +%s)}"
TOKEN_URI="${TOKEN_URI:-ipfs://demo-metadata-$RFID}"
PRICE_USDC_6="${PRICE_USDC_6:-1000000}"   # 1.000000 USDC

echo "=== Config ==="
echo "NFT     : $NFT"
echo "MKT     : $MKT"
echo "USDC    : $USDC"
echo "SELLER  : $SELLER"
echo "BUYER   : $BUYER"
echo "RFID    : $RFID"
echo "URI     : $TOKEN_URI"
echo "PRICE   : $PRICE_USDC_6 (6dp)"
echo "================"

# ===== 0) Optional: if using a distinct BUYER, fund them with mock USDC =====
if [ "$BUYER" != "$SELLER" ]; then
  echo "[0] Funding BUYER with 10 USDC from SELLER (if needed)…"
  cast send "$USDC" "transfer(address,uint256)" "$BUYER" 10000000 \
    --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
    --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null
fi

# ===== 1) Mint NFT as SELLER (onlyAuthorised: owner or registry) =====
echo "[1] Minting NFT to SELLER…"
cast send "$NFT" "mintNFT(address,string,string)" "$SELLER" "$TOKEN_URI" "$RFID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# Resolve tokenId from RFID
TOKEN_ID=$(cast call "$NFT" "getTokenIdByRFID(string)(uint256)" "$RFID" --rpc-url "$RPC")
echo "     → tokenId = $TOKEN_ID"

# ===== 2) Approve Marketplace for this token =====
echo "[2] Approving marketplace for tokenId $TOKEN_ID…"
cast send "$NFT" "approve(address,uint256)" "$MKT" "$TOKEN_ID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# ===== 3) List NFT on marketplace =====
echo "[3] Listing tokenId $TOKEN_ID at price $PRICE_USDC_6…"
cast send "$MKT" "listCollectible(address,uint256,uint256)" "$NFT" "$TOKEN_ID" "$PRICE_USDC_6" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# Verify listing
echo "     Checking listing…"
cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC"
cast call "$MKT" "getListing(address,uint256)(address,uint256,bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC"

# ===== 4) BUYER approves USDC to marketplace and purchases =====
echo "[4] Approving USDC allowance for BUYER…"
cast send "$USDC" "approve(address,uint256)" "$MKT" "$PRICE_USDC_6" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$BUYER" --chain-id "$CHAIN_ID" >/dev/null

echo "[5] BUYER purchasing tokenId $TOKEN_ID…"
cast send "$MKT" "purchaseCollectible(address,uint256)" "$NFT" "$TOKEN_ID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$BUYER" --chain-id "$CHAIN_ID" >/dev/null

# ===== 5) Post-checks =====
echo "[6] Post-purchase checks…"
echo "Owner after purchase:"
cast call "$NFT" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$RPC"

echo "Listing status after purchase:"
cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC"

echo "Done."
