import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const PORT = 8635;
const RPC = `http://127.0.0.1:${PORT}`;
const CHAIN_ID = 968;

const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0: Alice (Lender)
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1: Bob (Renter A)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2: Charlie (Renter B)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3: Dave (Lender B)
];

const accounts = KEYS.map((k) => privateKeyToAccount(k as `0x${string}`));

const local = defineChain({
  id: CHAIN_ID,
  name: "anvil",
  nativeCurrency: { name: "Test BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

describe("Loaner on-chain integration tests", () => {
  let anvil: ChildProcess;
  let contractAddress: Address;
  let nftAddress: Address;
  let loanerAbi: any;
  let mockNftAbi: any;

  const publicClient = createPublicClient({
    chain: local,
    transport: http(RPC),
  });

  const [alice, bob, charlie, dave] = accounts.map((acc) =>
    createWalletClient({ account: acc, chain: local, transport: http(RPC) })
  );

  async function waitTx(hash: `0x${string}`) {
    return publicClient.waitForTransactionReceipt({ hash });
  }

  async function warp(seconds: number) {
    await publicClient.request({
      method: "evm_increaseTime" as any,
      params: [seconds] as any,
    });
    await publicClient.request({ method: "evm_mine" as any, params: [] as any });
  }

  beforeAll(async () => {
    anvil = spawn("anvil", [
      "--port",
      String(PORT),
      "--chain-id",
      String(CHAIN_ID),
      "--silent",
    ]);

    // Poll until ready
    for (let i = 0; i < 40; i++) {
      try {
        await publicClient.getBlockNumber();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    const loanerArtifact = JSON.parse(
      readFileSync(
        join(process.cwd(), "contracts", "out", "Loaner.sol", "Loaner.json"),
        "utf8"
      )
    );
    const nftArtifact = JSON.parse(
      readFileSync(
        join(process.cwd(), "contracts", "out", "MockNFT.sol", "MockNFT.json"),
        "utf8"
      )
    );

    loanerAbi = loanerArtifact.abi;
    mockNftAbi = nftArtifact.abi;

    // Deploy Loaner
    const lHash = await alice.deployContract({
      abi: loanerAbi,
      bytecode: loanerArtifact.bytecode.object,
      args: [],
    });
    const lReceipt = await waitTx(lHash);
    contractAddress = lReceipt.contractAddress!;

    // Deploy MockNFT
    const nHash = await alice.deployContract({
      abi: mockNftAbi,
      bytecode: nftArtifact.bytecode.object,
      args: [],
    });
    const nReceipt = await waitTx(nHash);
    nftAddress = nReceipt.contractAddress!;
  });

  afterAll(() => {
    if (anvil) anvil.kill();
  });

  it("handles complete rental and return lifecycle with withdrawals", async () => {
    // 1. Alice mints Token 1
    let tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "mint",
      args: [alice.account.address, 1n],
    });
    await waitTx(tx);

    // 2. Alice approves Loaner and lists Token 1
    tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "approve",
      args: [contractAddress, 1n],
    });
    await waitTx(tx);

    tx = await alice.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "list",
      args: [nftAddress, 1n, parseEther("0.2"), parseEther("1.0"), 10],
    });
    await waitTx(tx);

    // 3. Bob rents Token 1 for 3 days (0.6 fee + 1.0 deposit = 1.6 BOT)
    const quoteAmt = (await publicClient.readContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "quote",
      args: [1n, 3],
    })) as bigint;

    expect(quoteAmt).toBe(parseEther("1.6"));

    tx = await bob.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "rent",
      args: [1n, 3],
      value: quoteAmt,
    });
    await waitTx(tx);

    // Token transferred to Bob
    const owner1 = (await publicClient.readContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "ownerOf",
      args: [1n],
    })) as Address;
    expect(owner1.toLowerCase()).toBe(bob.account.address.toLowerCase());

    // 4. Bob returns token with approval
    tx = await bob.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "approve",
      args: [contractAddress, 1n],
    });
    await waitTx(tx);

    tx = await bob.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "giveBack",
      args: [1n],
    });
    await waitTx(tx);

    // Token back in contract escrow
    const ownerBack = (await publicClient.readContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "ownerOf",
      args: [1n],
    })) as Address;
    expect(ownerBack.toLowerCase()).toBe(contractAddress.toLowerCase());

    // Alice pending = 0.6 BOT fee, Bob pending = 1.0 BOT deposit
    const alicePending = (await publicClient.readContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "pending",
      args: [alice.account.address],
    })) as bigint;
    expect(alicePending).toBe(parseEther("0.6"));

    const bobPending = (await publicClient.readContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "pending",
      args: [bob.account.address],
    })) as bigint;
    expect(bobPending).toBe(parseEther("1.0"));

    // 5. Alice and Bob withdraw
    tx = await alice.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "withdraw",
    });
    await waitTx(tx);

    tx = await bob.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "withdraw",
    });
    await waitTx(tx);
  });

  it("handles rental forfeiture after grace period has lapsed", async () => {
    // 1. Alice mints Token 2
    let tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "mint",
      args: [alice.account.address, 2n],
    });
    await waitTx(tx);

    tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "approve",
      args: [contractAddress, 2n],
    });
    await waitTx(tx);

    tx = await alice.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "list",
      args: [nftAddress, 2n, parseEther("0.5"), parseEther("2.0"), 5],
    });
    await waitTx(tx);

    // 2. Charlie rents Token 2 for 1 day (0.5 + 2.0 = 2.5 BOT)
    tx = await charlie.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "rent",
      args: [2n, 1],
      value: parseEther("2.5"),
    });
    await waitTx(tx);

    // 3. Warp past 1 day + 1 day grace = 2 days + 1 hour
    await warp(2 * 86400 + 3600);

    // 4. Alice claims deposit and fee
    tx = await alice.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "claimDeposit",
      args: [2n],
    });
    await waitTx(tx);

    // Alice pending += 2.5 BOT
    const alicePending = (await publicClient.readContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "pending",
      args: [alice.account.address],
    })) as bigint;
    expect(alicePending).toBe(parseEther("2.5"));

    // Token remains permanently with Charlie
    const tokenOwner = (await publicClient.readContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "ownerOf",
      args: [2n],
    })) as Address;
    expect(tokenOwner.toLowerCase()).toBe(charlie.account.address.toLowerCase());
  });

  it("rejects unauthorized actions and wrong payments cleanly", async () => {
    // 1. Alice mints Token 3
    let tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "mint",
      args: [alice.account.address, 3n],
    });
    await waitTx(tx);

    tx = await alice.writeContract({
      address: nftAddress,
      abi: mockNftAbi,
      functionName: "approve",
      args: [contractAddress, 3n],
    });
    await waitTx(tx);

    tx = await alice.writeContract({
      address: contractAddress,
      abi: loanerAbi,
      functionName: "list",
      args: [nftAddress, 3n, parseEther("0.1"), parseEther("1.0"), 7],
    });
    await waitTx(tx);

    // Wrong payment
    await expect(
      bob.writeContract({
        address: contractAddress,
        abi: loanerAbi,
        functionName: "rent",
        args: [3n, 2],
        value: parseEther("1.0"), // Needs 1.2 BOT
      })
    ).rejects.toThrow();

    // Lender cannot rent
    await expect(
      alice.writeContract({
        address: contractAddress,
        abi: loanerAbi,
        functionName: "rent",
        args: [3n, 2],
        value: parseEther("1.2"),
      })
    ).rejects.toThrow();
  });
});
