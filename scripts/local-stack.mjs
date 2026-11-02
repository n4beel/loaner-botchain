/**
 * Local stack runner and seeder for Loaner (Archetype AN · Library shelf).
 *
 * Spawns anvil on port 8735 with chain id 968, deploys Loaner and MockNFT,
 * and seeds scenarios per spec §5:
 * - Listing 1: Available
 * - Listing 2: Rented (due in 3 days)
 * - Listing 3: Rented and in grace period
 * - Listing 4: Rented and forfeitable (past grace)
 * - Listing 5: Returned (back to Available)
 * - Listing 6: Delisted
 * - Listing 7: Forfeited (claimed by lender)
 *
 * Role table: Lenders (Alice, Dave), Renters (Bob, Charlie, Eve).
 *
 * Usage:
 *   node scripts/local-stack.mjs
 */

import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8735;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Lender 1)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Renter A)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Renter B)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Lender 2)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4: Eve (Renter C)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

try {
  execSync(`fuser -k ${PORT}/tcp 2>/dev/null || true`);
} catch {}

console.log(`Starting anvil on port ${PORT}...`);
const anvil = spawn(
  "anvil",
  [
    "--port", String(PORT),
    "--chain-id", String(CHAIN_ID),
    "--accounts", "10",
    "--balance", "10000",
    "--silent",
  ],
  { stdio: "ignore" }
);

const publicClient = createPublicClient({
  chain: local,
  transport: http(RPC),
});

const [alice, bob, charlie, dave, eve] = accounts.map((acc) =>
  createWalletClient({ account: acc, chain: local, transport: http(RPC) })
);

async function waitTx(hash) {
  return publicClient.waitForTransactionReceipt({ hash });
}

async function warp(seconds) {
  await publicClient.request({
    method: "evm_increaseTime",
    params: [seconds],
  });
  await publicClient.request({ method: "evm_mine", params: [] });
}

async function main() {
  console.log("Waiting for RPC...");
  for (let i = 0; i < 50; i++) {
    try {
      await publicClient.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log("Compiling contracts...");
  execSync("forge build", { cwd: join(process.cwd(), "contracts") });

  const loanerArtifact = JSON.parse(
    readFileSync(join(process.cwd(), "contracts/out/Loaner.sol/Loaner.json"), "utf8")
  );
  const nftArtifact = JSON.parse(
    readFileSync(join(process.cwd(), "contracts/out/MockNFT.sol/MockNFT.json"), "utf8")
  );

  console.log("Deploying Loaner...");
  const lHash = await alice.deployContract({
    abi: loanerArtifact.abi,
    bytecode: loanerArtifact.bytecode.object,
    args: [],
  });
  const lReceipt = await waitTx(lHash);
  const contractAddress = lReceipt.contractAddress;
  console.log(`Loaner deployed to: ${contractAddress}`);

  console.log("Deploying MockNFT...");
  const nftHash = await alice.deployContract({
    abi: nftArtifact.abi,
    bytecode: nftArtifact.bytecode.object,
    args: [],
  });
  const nftReceipt = await waitTx(nftHash);
  const nftAddress = nftReceipt.contractAddress;
  console.log(`MockNFT deployed to: ${nftAddress}`);

  // Write .env.local
  const envContent = [
    `NEXT_PUBLIC_BOTCHAIN_CHAIN_ID=968`,
    `NEXT_PUBLIC_BOHR_RPC=http://127.0.0.1:${PORT}`,
    `NEXT_PUBLIC_RPC_URL_968=http://127.0.0.1:${PORT}`,
    `NEXT_PUBLIC_CONTRACT_968=${contractAddress}`,
    `NEXT_PUBLIC_NFT_968=${nftAddress}`,
    `NEXT_PUBLIC_DEPLOY_BLOCK_968=1`,
  ].join("\n");
  writeFileSync(join(process.cwd(), ".env.local"), envContent);
  console.log("Updated .env.local with deployed contract addresses");

  console.log("\nMinting tokens 1–7...");
  // Mint tokens 1..6 to Alice
  for (let i = 1n; i <= 6n; i++) {
    const tx = await alice.writeContract({
      address: nftAddress,
      abi: nftArtifact.abi,
      functionName: "mint",
      args: [alice.account.address, i],
    });
    await waitTx(tx);
  }

  // Mint token 7 to Dave
  const txMint7 = await dave.writeContract({
    address: nftAddress,
    abi: nftArtifact.abi,
    functionName: "mint",
    args: [dave.account.address, 7n],
  });
  await waitTx(txMint7);

  // Approve all
  let tx = await alice.writeContract({
    address: nftAddress,
    abi: nftArtifact.abi,
    functionName: "setApprovalForAll",
    args: [contractAddress, true],
  });
  await waitTx(tx);

  tx = await dave.writeContract({
    address: nftAddress,
    abi: nftArtifact.abi,
    functionName: "setApprovalForAll",
    args: [contractAddress, true],
  });
  await waitTx(tx);

  console.log("\nSeeding listings per spec §5...");

  // Phase A: Listing 4 (Alice) and Listing 7 (Dave) created early so they can expire past grace
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 4n, parseEther("0.2"), parseEther("1.0"), 5],
  });
  await waitTx(tx); // ID 1 = Token 4

  tx = await dave.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 7n, parseEther("0.3"), parseEther("1.5"), 5],
  });
  await waitTx(tx); // ID 2 = Token 7

  // Bob rents ID 1 for 1 day
  tx = await bob.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "rent",
    args: [1n, 1],
    value: parseEther("1.2"),
  });
  await waitTx(tx);

  // Charlie rents ID 2 for 1 day
  tx = await charlie.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "rent",
    args: [2n, 1],
    value: parseEther("1.8"),
  });
  await waitTx(tx);

  // Warp 1 day
  await warp(86400);

  // Phase B: Listing 3 (Alice) rented for 1 day
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 3n, parseEther("0.1"), parseEther("1.0"), 7],
  });
  await waitTx(tx); // ID 3 = Token 3

  tx = await charlie.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "rent",
    args: [3n, 1],
    value: parseEther("1.1"),
  });
  await waitTx(tx);

  // Warp 1 day + 6 hours (108,000s)
  await warp(108000);

  // Dave claims deposit on ID 2 (Token 7) -> moves to Settled / Forfeited
  tx = await dave.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "claimDeposit",
    args: [2n],
  });
  await waitTx(tx);

  // Phase C: Current listings 1, 2, 5, 6
  // Listing 4: Token 1 (Available)
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 1n, parseEther("0.2"), parseEther("1.5"), 14],
  });
  await waitTx(tx); // ID 4 = Token 1 (Available)

  // Listing 5: Token 2 (Rented for 3 days)
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 2n, parseEther("0.25"), parseEther("2.0"), 10],
  });
  await waitTx(tx); // ID 5 = Token 2

  tx = await bob.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "rent",
    args: [5n, 3],
    value: parseEther("2.75"),
  });
  await waitTx(tx);

  // Listing 6: Token 5 (Returned)
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 5n, parseEther("0.15"), parseEther("1.0"), 10],
  });
  await waitTx(tx); // ID 6 = Token 5

  tx = await eve.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "rent",
    args: [6n, 1],
    value: parseEther("1.15"),
  });
  await waitTx(tx);

  tx = await eve.writeContract({
    address: nftAddress,
    abi: nftArtifact.abi,
    functionName: "approve",
    args: [contractAddress, 5n],
  });
  await waitTx(tx);

  tx = await eve.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "giveBack",
    args: [6n],
  });
  await waitTx(tx);

  // Listing 7: Token 6 (Delisted)
  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "list",
    args: [nftAddress, 6n, parseEther("0.5"), parseEther("2.0"), 14],
  });
  await waitTx(tx); // ID 7 = Token 6

  tx = await alice.writeContract({
    address: contractAddress,
    abi: loanerArtifact.abi,
    functionName: "delist",
    args: [7n],
  });
  await waitTx(tx);

  console.log("\n=========================================");
  console.log("Loaner local stack ready on port " + PORT);
  console.log("Loaner Contract: ", contractAddress);
  console.log("MockNFT Contract: ", nftAddress);
  console.log("\nListings & Scenarios (§5):");
  console.log("  Listing 4 (Token 1): Available (0.2 BOT/day, 1.5 BOT deposit, max 14d)");
  console.log("  Listing 5 (Token 2): Rented by Bob (due in 3 days)");
  console.log("  Listing 3 (Token 3): Rented by Charlie, in grace period");
  console.log("  Listing 1 (Token 4): Rented by Bob, forfeitable (grace period expired)");
  console.log("  Listing 6 (Token 5): Returned by Eve, back to Available");
  console.log("  Listing 7 (Token 6): Delisted by Alice");
  console.log("  Listing 2 (Token 7): Forfeited by Charlie, claimed by Dave");
  console.log("\nRole Table:");
  console.log("  Lender 1 (Alice):   ", alice.account.address);
  console.log("  Renter A (Bob):     ", bob.account.address);
  console.log("  Renter B (Charlie): ", charlie.account.address);
  console.log("  Lender 2 (Dave):    ", dave.account.address);
  console.log("  Renter C (Eve):     ", eve.account.address);
  console.log("=========================================\n");
}

main().catch((err) => {
  console.error("Local stack error:", err);
  if (anvil) anvil.kill();
  process.exit(1);
});

process.on("SIGINT", () => {
  if (anvil) anvil.kill();
  process.exit(0);
});
