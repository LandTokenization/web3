// scripts/deploy.cjs
// Deploy GMCLandCompensation using ethers + artifacts + Hardhat node signer(0)

const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

async function main() {
  // 1. Connect to local Hardhat node
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // 2. Use Hardhat's first account as deployer/owner
  const ownerSigner = await provider.getSigner(0);
  const ownerAddress = await ownerSigner.getAddress();
  console.log("Deploying with account:", ownerAddress);

  // 3. Load compiled artifact
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "GMCLandCompensation.sol",
    "GMCLandCompensation.json"
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  // 4. Create ContractFactory with signer(0)
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    ownerSigner
  );

  // 5. Deploy – pass ownerAddress as initialOwner
  const contract = await factory.deploy(ownerAddress);

  console.log("Deployment tx:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log("GMCLandCompensation deployed to:", deployedAddress);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
