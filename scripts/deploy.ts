import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

async function main() {
  const { ethers } = await network.connect();
  const [deployer] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);

  const Factory = await ethers.getContractFactory("ResourceSwap", deployer);
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("ResourceSwap deployed at:", address);

  const deploymentsDir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);

  const chainId = (await ethers.provider.getNetwork()).chainId.toString();

  fs.writeFileSync(
    path.join(deploymentsDir, "localhost.json"),
    JSON.stringify({ address, chainId, deployedAt: new Date().toISOString() }, null, 2)
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});