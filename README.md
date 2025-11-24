📘 GMC Land Token Demo — Developer Guide

How to Compile, Deploy, and Test the Smart Contract (Step-by-Step)
This guide explains every step you must follow after writing the contract, so anyone on your team can reproduce the entire process.

✅ 1. Install Dependencies

Run inside the /web3 folder:

npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox ethers


Reinstall fresh if needed:

rm -rf node_modules package-lock.json
npm install

✅ 2. Initialize Hardhat

If not already initialized:

npx hardhat init


Choose Create an empty config.

✅ 3. Hardhat Configuration

Your final hardhat.config.cjs should contain:

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true
    }
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};

✅ 4. Start Local Blockchain

Keep this running in a separate terminal:

npx hardhat node


This gives you:

20 funded local accounts

Private keys

Local chain @ http://127.0.0.1:8545

✅ 5. Compile the Contract
npx hardhat compile


If you see:

Compiled X Solidity files successfully


You are good to go.

✅ 6. Deploy the Contract

Use the included deploy script:

/scripts/deploy.cjs

Run it:

npx hardhat run scripts/deploy.cjs --network localhost


This will output something like:

GMCLandCompensation deployed to: 0xABC123...


Copy this address — you will need it for testing and UI integration.

✅ 7. Update Test Script With Contract Address

Open:

/scripts/testAll.cjs


Edit this line:

const CONTRACT_ADDRESS = "PASTE_YOUR_DEPLOYED_ADDRESS_HERE";

✅ 8. Run Full Automated Test Suite

This tests EVERYTHING:

Land registration

Token minting

Sell orders

Buying tokens

Tracking ETH proceeds

Cancelling orders

getMyInfo() dashboard data

Run:

npx hardhat run scripts/testAll.cjs --network localhost


If everything is correct you will see:

Successfully registered land

Order creation OK

Token trading OK

Earnings tracked

All balances correct

getMyInfo returns plots + tokens + earnings

✅ 9. (Optional) Interact With Contract Manually

In the Hardhat console:

npx hardhat console --network localhost


Example commands:

const c = await ethers.getContractAt("GMCLandCompensation", "DEPLOYED_ADDRESS");

// check balance
(await c.balanceOf("0xUserAddress")).toString()

// check earnings
(await c.totalProceeds("0xUserAddress")).toString()

// check orders
await c.sellOrders(1);

✅ 10. Integrate With Frontend

Your React app needs:

RPC URL → "http://127.0.0.1:8545"

ABI → import from artifacts/contracts/.../GMCLandCompensation.json

Contract address → from deploy script

Expose these methods in frontend:

getMyInfo()

createSellOrder()

buyFromOrder()

cancelSellOrder()

sellOrders(orderId)

balanceOf(address)

totalProceeds(address)

This gives you a functional GMC demo portal.

🎉 DONE — Your Contract Is Fully Working

Once your tests pass:

✔ ERC20 land token works
✔ Land registration works
✔ Tokens minted correctly
✔ Marketplace buy/sell works
✔ Earnings tracked
✔ Dashboard data available
✔ Hardhat automation fully integrated

You can confidently demo this to mentors and judges.