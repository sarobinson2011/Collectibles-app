#!/usr/bin/env bash
set -euo pipefail

# ===== Config from your env/direnv =====
RPC="${ARBITRUM_SEPOLIA_RPC_URL}"
CHAIN_ID=421614

# Contracts (proxies)
REG="${REG}"          # CollectibleRegistry proxy
NFT="${NFT}"          # CollectibleNFT proxy
MKT="${MKT}"          # CollectibleMarket proxy
USDC="${USDC:-$COLLECTIBLE_USDC6MOCK_ADDRESS}"

# Seller (admin / registry owner)
SELLER="${DEV_WALLET1}"
KEYSTORE="${KEYSTORE:-$HOME/.foundry/keystores/dev-deployer}"
PASSFILE="${PASSFILE:-$HOME/.secrets/foundry-dev.pass}"

# Buyer
BUYER="${BUYER_WALLET:-${BUYER:-}}"
BUYER_KEYSTORE="${BUYER_KEYSTORE:-$HOME/.foundry/keystores/your-buyer-keystore}"
BUYER_PASSFILE="${BUYER_PASSFILE:-$HOME/.secrets/your-buyer.pass}"

# Flow params
RFID="${RFID:-rfid-register-$(date +%s)}"
TOKEN_URI="${TOKEN_URI:-ipfs://demo-metadata-$RFID}"
PRICE_USDC_6="${PRICE_USDC_6:-1000000}" # 1.000000 USDC (6dp)

# Authenticity: deterministic demo value (keccak of RFID)
AUTH_HASH=$(cast keccak "$RFID" | awk '{print $1}')

# ---------- helpers ----------
strip_pretty() { awk '{print $1}'; }
bal() { cast call "$USDC" "balanceOf(address)(uint256)" "$1" --rpc-url "$RPC" | strip_pretty; }
eq_ci() { [[ "${1,,}" == "${2,,}" ]]; }

# ===== Preflight =====
if [[ -z "${REG}" || -z "${NFT}" || -z "${MKT}" || -z "${USDC}" ]]; then
  echo "ERROR: REG/NFT/MKT/USDC must be set in the environment." >&2; exit 1
fi
if [[ -z "${BUYER}" ]]; then
  echo "ERROR: BUYER_WALLET / BUYER not set." >&2; exit 1
fi
if eq_ci "$BUYER" "$SELLER"; then
  echo "ERROR: BUYER and SELLER are the same. Provide a distinct BUYER wallet." >&2; exit 1
fi

echo "=== Config (Registry → NFT → Market) ==="
echo "REG     : $REG"
echo "NFT     : $NFT"
echo "MKT     : $MKT"
echo "USDC    : $USDC"
echo "SELLER  : $SELLER"
echo "BUYER   : $BUYER"
echo "RFID    : $RFID"
echo "URI     : $TOKEN_URI"
echo "AUTH    : $AUTH_HASH"
echo "PRICE   : $PRICE_USDC_6 (6dp)"
echo "========================================"

# Fee config
FEEPCT=$(cast call "$MKT" "feeBps()(uint256)" --rpc-url "$RPC" | strip_pretty)
FEETO=$(cast call "$MKT" "feeRecipient()(address)" --rpc-url "$RPC" | strip_pretty)
echo "Market feeBps  : $FEEPCT"
echo "Fee recipient  : $FEETO"

FEE_AMT=$(( PRICE_USDC_6 * FEEPCT / 10000 ))
SELLER_AMT=$(( PRICE_USDC_6 - FEE_AMT ))
echo "Fee amount     : $FEE_AMT"
echo "Seller amount  : $SELLER_AMT"

# Whether fee recipient is the same as seller
COLLAPSE_FEE_TO_SELLER=0
if eq_ci "$FEETO" "$SELLER"; then
  COLLAPSE_FEE_TO_SELLER=1
  echo "(feeRecipient == SELLER) → will measure a single delta on SELLER for full price"
fi

# Ensure BUYER has USDC funds (top up 10 USDC if needed)
BUYER_BAL_BEFORE=$(bal "$BUYER")
if (( BUYER_BAL_BEFORE < PRICE_USDC_6 )); then
  echo "[0] Funding BUYER with 10 USDC from SELLER…"
  cast send "$USDC" "transfer(address,uint256)" "$BUYER" 10000000 \
    --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
    --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null
fi

# Ensure BUYER has some gas
BUYER_ETH=$(cast balance "$BUYER" --rpc-url "$RPC" || echo 0)
if [[ "$BUYER_ETH" == "0" || "$BUYER_ETH" == "0x0" ]]; then
  echo "[0] Funding BUYER with 0.003 ETH for gas…"
  cast send "$BUYER" --value 0.003ether \
    --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
    --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null
fi

# Snapshot balances before
SELLER_USDC_BEFORE=$(bal "$SELLER")
if (( COLLAPSE_FEE_TO_SELLER == 0 )); then
  FEETO_USDC_BEFORE=$(bal "$FEETO")
fi
BUYER_USDC_BEFORE=$(bal "$BUYER")

# 1) Register via Registry (this mints in NFT)
echo "[1] Registry.registerCollectible(rfid,auth,owner,uri)…"
cast send "$REG" "registerCollectible(string,bytes32,address,string)" "$RFID" "$AUTH_HASH" "$SELLER" "$TOKEN_URI" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# Resolve tokenId
TOKEN_ID=$(cast call "$NFT" "getTokenIdByRFID(string)(uint256)" "$RFID" --rpc-url "$RPC" | strip_pretty)
if [[ "$TOKEN_ID" == "0x0" || "$TOKEN_ID" == "0" ]]; then
  echo "ERROR: tokenId not found after registry registration/mint" >&2; exit 1
fi
echo "     → tokenId = $TOKEN_ID"

# 2) Approve marketplace for this token
echo "[2] Approving marketplace for tokenId $TOKEN_ID…"
cast send "$NFT" "approve(address,uint256)" "$MKT" "$TOKEN_ID" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

# 3) List on market
echo "[3] Listing tokenId $TOKEN_ID at price $PRICE_USDC_6…"
cast send "$MKT" "listCollectible(address,uint256,uint256)" "$NFT" "$TOKEN_ID" "$PRICE_USDC_6" \
  --rpc-url "$RPC" --keystore "$KEYSTORE" --password-file "$PASSFILE" \
  --from "$SELLER" --chain-id "$CHAIN_ID" >/dev/null

LISTED=$(cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC" | strip_pretty)
if [[ "$LISTED" != "true" ]]; then
  echo "ERROR: listing did not stick" >&2; exit 1
fi

# 4) Buyer USDC approve + purchase
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

# 5) Post checks
echo "[6] Post-purchase checks…"
NEW_OWNER=$(cast call "$NFT" "ownerOf(uint256)(address)" "$TOKEN_ID" --rpc-url "$RPC" | strip_pretty)
echo "Owner after purchase: $NEW_OWNER"
if ! eq_ci "$NEW_OWNER" "$BUYER"; then
  echo "ERROR: ownerOf != BUYER" >&2; exit 1
fi

LISTED_AFTER=$(cast call "$MKT" "isListed(address,uint256)(bool)" "$NFT" "$TOKEN_ID" --rpc-url "$RPC" | strip_pretty)
echo "Listing status after: $LISTED_AFTER"
if [[ "$LISTED_AFTER" != "false" ]]; then
  echo "ERROR: listing still true after purchase" >&2; exit 1
fi

# Balance deltas
SELLER_USDC_AFTER=$(bal "$SELLER")
BUYER_USDC_AFTER=$(bal "$BUYER")

DELTA_SELLER=$(( SELLER_USDC_AFTER - SELLER_USDC_BEFORE ))
DELTA_BUYER=$(( BUYER_USDC_AFTER - BUYER_USDC_BEFORE ))

if (( COLLAPSE_FEE_TO_SELLER == 0 )); then
  FEETO_USDC_AFTER=$(bal "$FEETO")
  DELTA_FEE=$(( FEETO_USDC_AFTER - FEETO_USDC_BEFORE ))
else
  DELTA_FEE=0
fi

echo "USDC deltas:"
echo "  Seller +$DELTA_SELLER"
echo "  FeeTo  +$DELTA_FEE"
echo "  Buyer  $DELTA_BUYER"

# Expected values
if (( COLLAPSE_FEE_TO_SELLER == 1 )); then
  # All funds go to the same address; expect full price on seller, zero separate fee
  EXP_SELLER=$PRICE_USDC_6
  EXP_FEE=0
  EXP_BUYER="-$PRICE_USDC_6"
  echo "(feeRecipient == SELLER) → collapsing expected deltas: seller +$EXP_SELLER, fee +$EXP_FEE"
else
  EXP_SELLER=$SELLER_AMT
  EXP_FEE=$FEE_AMT
  EXP_BUYER="-$PRICE_USDC_6"
fi

[[ "$DELTA_SELLER" -eq "$EXP_SELLER" ]] || { echo "ERROR: seller delta mismatch (got $DELTA_SELLER, expected $EXP_SELLER)"; exit 1; }
[[ "$DELTA_FEE" -eq "$EXP_FEE" ]]       || { echo "ERROR: fee delta mismatch (got $DELTA_FEE, expected $EXP_FEE)"; exit 1; }
[[ "$DELTA_BUYER" -eq "$EXP_BUYER" ]]   || { echo "ERROR: buyer delta mismatch (got $DELTA_BUYER, expected $EXP_BUYER)"; exit 1; }

echo "✅ Full chain succeeded (Registry → NFT → Market)."


