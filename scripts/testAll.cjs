// scripts/testAll.cjs
// Auto-test core flows of GMCLandCompensation on local Hardhat node

const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

async function main() {
    // 0. Contract address from fresh deploy
    const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "PASTE_DEPLOYED_CONTRACT_ADDRESS_HERE") {
        throw new Error("Set CONTRACT_ADDRESS in scripts/testAll.cjs");
    }

    // 1. Provider
    const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    // Use same Hardhat accounts as deploy
    const owner = await provider.getSigner(0);
    const user1 = await provider.getSigner(1);
    const user2 = await provider.getSigner(2);

    console.log("Owner: ", await owner.getAddress());
    console.log("User1: ", await user1.getAddress());
    console.log("User2: ", await user2.getAddress());

    // 2. Load ABI
    const artifactPath = path.join(
        __dirname,
        "..",
        "artifacts",
        "contracts",
        "GMCLandCompensation.sol",
        "GMCLandCompensation.json"
    );
    const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

    // 3. Attach contract with different signers
    const tokenAsOwner = new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, owner);
    const tokenAsUser1 = tokenAsOwner.connect(user1);
    const tokenAsUser2 = tokenAsOwner.connect(user2);

    console.log("\n=== 1) Registering dummy land plots ===");

    // GT1-4845 for user1
    let tx = await tokenAsOwner.registerLandPlot(
        "GT1-4845",
        "Gelephu",
        "Gelephu Throm",
        "2583",
        "Sonia Ghalay",
        "12008000663",
        "Family Ownership",
        "Private",
        "Urban Core",
        "Urban Core",
        510, // 0.051 ac * 1e4
        await user1.getAddress(),
        ethers.parseUnits("10000", 18) // 10,000 GMCLT
    );
    await tx.wait();
    console.log("Registered GT1-4845 → user1 + minted 10,000 GMCLT");

    // BHU-4357 for user2
    tx = await tokenAsOwner.registerLandPlot(
        "BHU-4357",
        "Sarpang",
        "Samtenling",
        "2441",
        "Dorji Wangchuk",
        "11101003272",
        "Individual Ownership",
        "Private",
        "Kamzhing",
        "CLASS B",
        1200, // 0.12 ac * 1e4
        await user2.getAddress(),
        ethers.parseUnits("5000", 18) // 5,000 GMCLT
    );
    await tx.wait();
    console.log("Registered BHU-4357 → user2 + minted 5,000 GMCLT");

    console.log("\nBalances after registration:");
    console.log(
        "User1 GMCLT:",
        (await tokenAsOwner.balanceOf(await user1.getAddress())).toString()
    );
    console.log(
        "User2 GMCLT:",
        (await tokenAsOwner.balanceOf(await user2.getAddress())).toString()
    );

    console.log("\n=== 2) User1 creates a sell order ===");

    const sellAmount = ethers.parseUnits("1000", 18);
    const pricePerTokenWei = ethers.parseUnits("0.01", "ether");

    tx = await tokenAsUser1.createSellOrder(sellAmount, pricePerTokenWei);
    await tx.wait();
    console.log("User1 created sell order for 1000 GMCLT at 0.01 ETH each");

    const orderId = 1;
    let order = await tokenAsOwner.sellOrders(orderId);
    console.log("Order #1:", order);

    console.log("\n=== 3) User2 buys 100 tokens from order #1 ===");

    const buyAmount = ethers.parseUnits("100", 18);
    const totalCost = ethers.parseUnits("1", "ether"); // 100 * 0.01

    tx = await tokenAsUser2.buyFromOrder(orderId, buyAmount, { value: totalCost });
    await tx.wait();
    console.log("User2 bought 100 GMCLT from order #1 for 1 ETH");

    order = await tokenAsOwner.sellOrders(orderId);
    console.log("Order #1 after partial fill:", order);

    console.log("\nBalances after trade:");
    console.log(
        "User1 GMCLT:",
        (await tokenAsOwner.balanceOf(await user1.getAddress())).toString()
    );
    console.log(
        "User2 GMCLT:",
        (await tokenAsOwner.balanceOf(await user2.getAddress())).toString()
    );
    console.log(
        "Contract GMCLT:",
        (await tokenAsOwner.balanceOf(CONTRACT_ADDRESS)).toString()
    );

    console.log("\nTotal proceeds (ETH) from sales:");
    console.log(
        "User1 totalProceeds:",
        (await tokenAsOwner.totalProceeds(await user1.getAddress())).toString()
    );

    console.log("\n=== 4) User1 cancels remaining order ===");

    tx = await tokenAsUser1.cancelSellOrder(orderId);
    await tx.wait();
    console.log("User1 cancelled order #1");

    order = await tokenAsOwner.sellOrders(orderId);
    console.log("Order #1 after cancel:", order);

    console.log("Balances after cancel:");
    console.log(
        "User1 GMCLT:",
        (await tokenAsOwner.balanceOf(await user1.getAddress())).toString()
    );
    console.log(
        "Contract GMCLT:",
        (await tokenAsOwner.balanceOf(CONTRACT_ADDRESS)).toString()
    );

    console.log("\n=== 5) getMyInfo() for User1 and User2 ===");

    const info1 = await tokenAsUser1.getMyInfo();
    const info2 = await tokenAsUser2.getMyInfo();

    console.log("\nUser1 getMyInfo():");
    console.log("tokenBalance:", info1[0].toString());
    console.log("totalEarned:", info1[1].toString());
    console.log("plots:", info1[2]);
    console.log("firstPlot:", info1[3].length > 0 ? info1[3][0] : "none");

    console.log("\nUser2 getMyInfo():");
    console.log("tokenBalance:", info2[0].toString());
    console.log("totalEarned:", info2[1].toString());
    console.log("plots:", info2[2]);
    console.log("firstPlot:", info2[3].length > 0 ? info2[3][0] : "none");

    console.log("\n=== Auto-test complete ===");
}

main().catch((err) => {
    console.error("Test script error:", err);
    process.exit(1);
});
