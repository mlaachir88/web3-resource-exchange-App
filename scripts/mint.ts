import { network } from "hardhat";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const CID_META = "bafybeidxmkohxp4mdrcg7iv6z37fxxp75zl5fg6zuqgutv6jjmozd2lztq";

type AnimalKey =
  | "Singe"
  | "Lapin"
  | "Perroquet"
  | "Crocodile"
  | "Cerf"
  | "Hibou"
  | "Suricate"
  | "Mouton";

const ANIMALS: Record<AnimalKey, { name: string; tier: number; value: number; uri: string }> = {
  Singe: { name: "Singe", tier: 1, value: 900, uri: `ipfs://${CID_META}/Singe.json` },
  Lapin: { name: "Lapin", tier: 2, value: 700, uri: `ipfs://${CID_META}/Lapin.json` },
  Perroquet: { name: "Perroquet", tier: 2, value: 650, uri: `ipfs://${CID_META}/Perroquet.json` },
  Crocodile: { name: "Crocodile", tier: 3, value: 500, uri: `ipfs://${CID_META}/Crocodile.json` },
  Cerf: { name: "Cerf", tier: 3, value: 450, uri: `ipfs://${CID_META}/Cerf.json` },
  Hibou: { name: "Hibou", tier: 3, value: 420, uri: `ipfs://${CID_META}/Hibou.json` },
  Suricate: { name: "Suricate", tier: 4, value: 300, uri: `ipfs://${CID_META}/Suricate.json` },
  Mouton: { name: "Mouton", tier: 4, value: 250, uri: `ipfs://${CID_META}/Mouton.json` },
};

function fmtSecs(s: number) {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

async function main() {
  const { ethers } = await network.connect();

  const accIndex = parseInt(process.env.ACC ?? "0", 10);
  const animalKey = (process.env.ANIMAL ?? "Singe") as AnimalKey;

  const signers = await ethers.getSigners();
  const signer = signers[accIndex];
  if (!signer) throw new Error(`ACC invalide: ${accIndex}`);

  const animal = ANIMALS[animalKey];
  if (!animal) throw new Error(`ANIMAL invalide: ${animalKey}`);

  const addr = await signer.getAddress();
  console.log("Using account:", accIndex, addr);
  console.log("Minting:", animalKey, "URI:", animal.uri);

  const c = await ethers.getContractAt("ResourceSwap", CONTRACT, signer);

  const nowBlock = await ethers.provider.getBlock("latest");
  const now = Number(nowBlock!.timestamp);

  const lockedUntil = Number(await c.lockedUntil(addr));
  const lastActionAt = Number(await c.lastActionAt(addr));
  const cooldown = Number(await c.COOLDOWN());
  const lockDuration = Number(await c.LOCK_DURATION());

  const lockLeft = lockedUntil - now;
  const cooldownLeft = lastActionAt + cooldown - now;

  if (lockLeft > 0) {
    console.log(` Compte LOCK encore ${fmtSecs(lockLeft)} (LOCK_DURATION=${fmtSecs(lockDuration)})`);
    return;
  }
  if (cooldownLeft > 0) {
    console.log(` Cooldown encore ${fmtSecs(cooldownLeft)} (COOLDOWN=${fmtSecs(cooldown)})`);
    return;
  }

  const tx = await c.mintResource(animal.name, "animal", animal.tier, animal.value, animal.uri);
  console.log("tx hash:", tx.hash);

  const receipt = await tx.wait();
  console.log("Mint OK - block:", receipt?.blockNumber);

  let mintedId: bigint | null = null;
  for (const log of receipt!.logs) {
    try {
      const parsed = c.interface.parseLog(log);
      if (parsed?.name === "Transfer") mintedId = parsed.args[2] as bigint;
    } catch {}
  }
  if (mintedId === null) throw new Error("Impossible de trouver le tokenId (event Transfer)");

  console.log("Minted tokenId:", mintedId.toString());
  console.log("ownerOf(token):", await c.ownerOf(mintedId));
  console.log("tokenURI(token):", await c.tokenURI(mintedId));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});