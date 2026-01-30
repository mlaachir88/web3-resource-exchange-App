import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

function fmtSecs(s: number) {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

function getRevertData(err: any): string | undefined {
  return (
    err?.data ??
    err?.error?.data ??
    err?.info?.error?.data ??
    err?.info?.data ??
    err?.cause?.data
  );
}

async function decodeError(c: any, err: any): Promise<string> {
  const data = getRevertData(err);
  if (data && typeof data === "string" && data.startsWith("0x")) {
    if (data.startsWith("0x08c379a0")) {
      try {
        const { ethers } = await network.connect();
        const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + data.slice(10))[0];
        return `Revert: ${reason}`;
      } catch {}
    }
  }
  return err?.shortMessage ?? err?.reason ?? err?.message ?? "Unknown error";
}

async function main() {
  const { ethers } = await network.connect();

  const file = path.join(process.cwd(), "deployments", "localhost.json");
  if (!fs.existsSync(file)) {
    throw new Error('deployments/localhost.json not found. Run "deploy.ts" first.');
  }
  const { address: CONTRACT } = JSON.parse(fs.readFileSync(file, "utf-8"));

  const acc = parseInt(process.env.ACC ?? "0", 10);
  const offerId = BigInt(process.env.OFFER_ID ?? "0");

  const signers = await ethers.getSigners();
  const signer = signers[acc];
  if (!signer) throw new Error(`Invalid ACC: ${acc}`);

  const me = await signer.getAddress();
  const c = await ethers.getContractAt("ResourceSwap", CONTRACT, signer);

  console.log("Contract:", CONTRACT);
  console.log("Using account:", acc, me);
  console.log("Cancel offer:", offerId.toString());

  const now = Number((await c.runner.provider.getBlock("latest")).timestamp);
  const cooldown = Number(await c.COOLDOWN());
  const lastActionAt = Number(await c.lastActionAt(me));
  const lockedUntil = Number(await c.lockedUntil(me));

  const cooldownLeft = lastActionAt === 0 ? 0 : lastActionAt + cooldown - now;
  const lockLeft = lockedUntil === 0 ? 0 : lockedUntil - now;

  console.log("cooldown left:", fmtSecs(Math.max(0, cooldownLeft)));
  console.log("lock left:", fmtSecs(Math.max(0, lockLeft)));

  let o: any;
  try {
    o = await c.offers(offerId);
  } catch (err) {
    console.log("Invalid offerId / offers() read error:", await decodeError(c, err));
    return;
  }

  if (!o.active) {
    console.log("Offer inactive (already cancelled or accepted).");
    return;
  }

  if ((o.offerer as string).toLowerCase() !== me.toLowerCase()) {
    console.log("Not the offerer of this offer.");
    console.log("Expected offerer:", o.offerer);
    return;
  }

  try {
    const tx = await c.cancelOffer(offerId);
    console.log("cancelOffer tx:", tx.hash);
    const receipt = await tx.wait();
    console.log("Offer cancelled - block:", receipt?.blockNumber?.toString());

    const o2 = await c.offers(offerId);
    console.log("Offer active now:", o2.active);
  } catch (err) {
    console.log("cancelOffer failed:", await decodeError(c, err));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});