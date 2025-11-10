1) Discover implementation & admin addresses from each proxy - proxy is returned by deploy script


## Run bash script in the terminal --> returns the logic & admin addresses for each proxy

<run code below>        <-- LOOK !!

# Helpers
to_addr () {
  local v=${1#0x}                 # strip 0x
  echo 0x${v: -40}                # last 40 hex chars = address
}

export IMPL_SLOT=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
export ADMIN_SLOT=0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103

# Your proxy addresses (update as per .env)  <-- fill these in per your deployment
export REG=0x75D34c21Ac5BFf805E68DC73a5dc534B355358C7
export NFT=0x9f427eF7D04B6D3acF7C5518bd798f06fF10d61C
export MKT=0x7713F95e92B0820782b42aD2Fd5B1a5034c2D8AD

# Read raw slot values
raw_impl_reg=$(cast storage $REG $IMPL_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
raw_impl_nft=$(cast storage $NFT $IMPL_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
raw_impl_mkt=$(cast storage $MKT $IMPL_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")

raw_admin_reg=$(cast storage $REG $ADMIN_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
raw_admin_nft=$(cast storage $NFT $ADMIN_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")
raw_admin_mkt=$(cast storage $MKT $ADMIN_SLOT --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL")

# Convert to addresses
export IMPL_REG=$(to_addr "$raw_impl_reg")
export IMPL_NFT=$(to_addr "$raw_impl_nft")
export IMPL_MKT=$(to_addr "$raw_impl_mkt")

export ADMIN_REG=$(to_addr "$raw_admin_reg")
export ADMIN_NFT=$(to_addr "$raw_admin_nft")
export ADMIN_MKT=$(to_addr "$raw_admin_mkt")

echo IMPL_REG=$IMPL_REG
echo IMPL_NFT=$IMPL_NFT
echo IMPL_MKT=$IMPL_MKT
echo ADMIN_REG=$ADMIN_REG
echo ADMIN_NFT=$ADMIN_NFT
echo ADMIN_MKT=$ADMIN_MKT
