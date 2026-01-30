import { network } from "hardhat";

const CONTRACT = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

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
    try {
      const parsed = c.interface.parseError(data);
      return `Revert: ${parsed.name}(${parsed.args?.map((x: any) => x.toString()).join(", ") ?? ""})`;
    } catch {}

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

  const acc = parseInt(process.env.ACC ?? "0", 10);
  const tokenId = BigInt(process.env.TOKEN ?? "0");

  const signers = await ethers.getSigners();
  const signer = signers[acc];
  if (!signer) throw new Error(`Invalid ACC: ${acc}`);

  const me = await signer.getAddress();
  const c = await ethers.getContractAt("ResourceSwap", CONTRACT, signer);

  console.log("Using account:", acc, me);
  console.log("Token:", tokenId.toString());

  let owner: string;
  try {
    owner = await c.ownerOf(tokenId);
  } catch {
    console.log("Token not found:", tokenId.toString());
    return;
  }

  console.log("Owner:", owner);

  if (owner.toLowerCase() !== me.toLowerCase()) {
    console.log("Not owner of this token.");
    return;
  }

  const approved = await c.getApproved(tokenId);
  const approvedAll = await c.isApprovedForAll(me, CONTRACT);

  if ((approved && approved.toLowerCase() === CONTRACT.toLowerCase()) || approvedAll) {
    console.log("Already approved for contract.");
    return;
  }

  try {
    const tx = await c.approve(CONTRACT, tokenId);
    console.log("Approve tx:", tx.hash);
    await tx.wait();
    console.log("Approved contract for token:", tokenId.toString());
  } catch (err) {
    console.log("Approve failed:", await decodeError(c, err));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});