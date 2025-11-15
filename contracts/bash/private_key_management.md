## Create a password file for the buyer keystore

mkdir -p ~/.secrets
printf '%s' '' > ~/.secrets/buyer.pass


## Import the buyer private key into Foundry

Note: this creates ~/.foundry/keystores/buyer and encrypts it with the password you choose.

cast wallet import buyer --interactive

--> # paste the BUYER's 0x... private key when prompted
--> # choose the SAME password you put in ~/.secrets/buyer.pass

ls -l ~/.foundry/keystores
    --> should show:
        --> dev-deployer
        --> your-buyer-keystore

cast wallet list
    --> Optional, will show both entries

    