#!/usr/bin/env bash
set -euo pipefail

# ===== Config from your env/direnv =====
RPC="${ARBITRUM_SEPOLIA_RPC_URL}"
CHAIN_ID=421614

# Seller keystore (DEV_WALLET1)
SELLER="${DEV_WALLET1}"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/dev-deployer}"
PASSFILE="${PASSFILE:-$HOME/.secrets/foundry-dev.pass}"

# Buyer keystore
BUYER="${BUYER_WALLET:-${BUYER:-}}"
BUYER_KEYSTORE="${BUYER_KEYSTORE:-$HOME/.foundry/keystores/your-buyer-keystore}"
BUYER_PASSFILE="${BUYER_PASSFILE:-$HOME/.secrets/your-buyer.pass}"

# Contracts
NFT="${NFT}"          # CollectibleNFT proxy
MKT="${MKT}"          # Market proxy
USDC="${USDC:-$COLLECTIBLE_USDC6MOCK_ADDRESS}"  # Mock USDC (6dp)

# Flow params
RFID="${RFID:-rfid-2party-$(date +%s)}"
TOKEN_URI="${TOKEN_URI:-ipfs://demo-metadata-$RFID}"
PRICE_USDC_6="${PRICE_USDC_6:-1000000}" # 1.000000 USDC

# ===== Preflight =====
if [[ -z "${BUYER}" ]]; then
  echo "ERROR: BUYER_WALLET / BUYER not set." >&2
  exit 1
fi
if [[ "$BUYER" == "$SELLER" ]]; then
  echo "ERROR: BUYER and SELLER are the same. Use a distinct BUYER wallet." >&2
  exit 1
fi

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

# Fee config
FEEPCT=$(cast call "$MKT" "feeBps()(uint256)" --rpc-url "$RPC")
FEETO=$(cast call "$MKT" "feeRecipient()(address)" --rpc-url "$RPC")
echo "Market feeBps  : $FEEPCT"
echo "Fee recipient  : $FEETO"

# Compute fee/seller amount (small ints => safe in bash)
FEE_AMT=$(( PRICE_USDC_6 * FEEPCT / 10000 ))
SELLER_AMT=$(( PRICE_USDC_6 - FEE_AMT ))
echo "Fee amount     : $FEE_AMT"
echo "Seller amount  : $SELLER_AMT"

# Ensure BUYER has USDC funds (top up 10 USDC if < PRICE)
BUYER_BAL_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$BUYER" --rpc-url "$RPC")
if (( BUYER_BAL_BEFORE < PRICE_USDC_6 )); then
  echo "[0] Funding BUYER with 10 USDC from SELLER…"
  cast send "$USDC" "transfer(address,uint256)" "$BUYER" 10000000 \
    --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
    --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null
fi

# Ensure BUYER has a bit of gas
BUYER_ETH=$(cast balance "$BUYER" --rpc-url "$RPC" || echo 0)
if [[ "$BUYER_ETH" == "0" || "$BUYER_ETH" == "0x0" ]]; then
  echo "[0] Funding BUYER with 0.003 ETH for gas…"
  cast send "$BUYER" --value 0.003ether \
    --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
    --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null
fi

# Snapshot balances (for deltas)
SELLER_USDC_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$SELLER" --rpc-url "$RPC")
BUYER_USDC_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$BUYER" --rpc-url "$RPC")
FEETO_USDC_BEFORE=$(cast call "$USDC" "balanceOf(address)(uint256)" "$FEETO" --rpc-url "$RPC")

# 1) Mint to SELLER (authorized)
echo "[1] Minting NFT to SELLER…"
cast send "$NFT" "mintNFT(address,string,string)" "$SELLER" "$TOKEN_URI" "$RFID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

TOKEN_ID=$(cast call "$NFT" "getTokenIdByRFID(string)(uint256)" "$RFID" --rpc-url "$RPC")
echo "     → tokenId = $TOKEN_ID"

# 2) Approve marketplace
echo "[2] Approving marketplace for tokenId $TOKEN_ID…"
cast send "$NFT" "approve(address,uint256)" "$MKT" "$TOKEN_ID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# 3) List NFT
echo "[3] Listing tokenId $TOKEN_ID at price $PRICE_USDC_6…"
cast send "$MKT" "listCollectible(address,uint256,uint256)" "$NFT" "$TOKEN_ID" "$PRICE_USDC_6" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

LISTED=$(cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC")
if [[ "$LISTED" != "true" ]]; then
  echo "ERROR: Listing did not stick." >&2
  exit 1
fi

# 4) Buyer approve & purchase
echo "[4] BUYER approving USDC allowance…"
cast send "$USDC" "approve(address,uint256)" "$MKT" "$PRICE_USDC_6" \
  --rpc-url "$RPC" \
  --keystore "$BUYER_KEYSTORE" --password-file "$BUYER_PASSFILE" \
  --from "$BUYER" --chain-id "$CHAIN_ID" >/dev/null

echo "[5] BUYER purchasing tokenId $TOKEN_ID…"
cast send "$MKT" "purchaseCollectible(address,uint256)" "$NFT" "$TOKEN_ID" \
  --rpc-url "$RPC" \
  --keystore "$BUYER_KEYSTORE" --password-file "$BUYER_PASSFILE" \
  --from "$BUYER" --chain-id "$CHAIN_ID" >/dev/null

# 6) Post checks
echo "[6] Post-purchase checks…"
NEW_OWNER=$(cast call "$NFT" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$RPC")
echo "Owner after purchase: $NEW_OWNER"
if [[ "${NEW_OWNER,,}" != "${BUYER,,}" ]]; then
  echo "ERROR: ownerOf != BUYER" >&2
  exit 1
fi

LISTED_AFTER=$(cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC")
echo "Listing status after: $LISTED_AFTER"
if [[ "$LISTED_AFTER" != "false" ]]; then
  echo "ERROR: listing still true after purchase" >&2
  exit 1
fi

# Balance deltas
SELLER_USDC_AFTER=$(cast call "$USDC" "balanceOf(address)(uint256)" "$SELLER" --rpc-url "$RPC")
BUYER_USDC_AFTER=$(cast call "$USDC" "balanceOf(address)(uint256)" "$BUYER" --rpc-url "$RPC")
FEETO_USDC_AFTER=$(cast call "$USDC" "balanceOf(address)(uint256)" "$FEETO" --rpc-url "$RPC")

DELTA_SELLER=$(( SELLER_USDC_AFTER - SELLER_USDC_BEFORE ))
DELTA_BUYER=$(( BUYER_USDC_AFTER - BUYER_USDC_BEFORE ))
DELTA_FEE=$(( FEETO_USDC_AFTER - FEETO_USDC_BEFORE ))

echo "USDC deltas:"
echo "  Seller +$DELTA_SELLER (expected +$SELLER_AMT)"
echo "  FeeTo  +$DELTA_FEE    (expected +$FEE_AMT)"
echo "  Buyer  $DELTA_BUYER   (expected -$PRICE_USDC_6)"

# Assertions
[[ "$DELTA_SELLER" -eq "$SELLER_AMT" ]] || { echo "ERROR: seller delta mismatch"; exit 1; }
[[ "$DELTA_FEE" -eq "$FEE_AMT" ]] || { echo "ERROR: fee delta mismatch"; exit 1; }
[[ "$DELTA_BUYER" -eq "-$PRICE_USDC_6" ]] || { echo "ERROR: buyer delta mismatch"; exit 1; }

echo "✅ Two-party flow succeeded."
