## Create a password file for the buyer keystore

mkdir -p ~/.secrets
printf '%s' '' > ~/.secrets/buyer.pass


## Import the buyer private key into Foundry

Note: this creates ~/.foundry/keystores/buyer and encrypts it with the password you choose.

cast wallet import buyer --interactive

--> # paste the BUYER's 0x... private key when prompted
--> # choose the SAME password you put in ~/.secrets/buyer.pass

ls -l ~/.foundry/keystores/buyer




# DEV key
b4a2e3f0d67722c2ef7e95e688e360708fb74e65c5932828e6e499b4adcfc525

# BUYER key
732005eb6e8e3e3f76524d0e7010c01b41c84cda0239bfcf24cf548d0ddab260