#!/usr/bin/env node
/**
 * Seeds a running anvil chain (after `pnpm deploy:local`) with demo data:
 *   1. "Dhaka Family Circle"    — FIXED_ORDER ROSCA, 4 members, 2 rounds already played
 *   2. "Gulshan Traders Circle" — BID mode, mid-auction (all contributed, 1 live bid)
 *   3. "Eid Family Fund"        — Goal pot at 60% of target
 * Uses the default anvil accounts; account #0 is the organizer everywhere.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const deployments = JSON.parse(
  readFileSync(join(root, "contracts", "deployments", "local.json"), "utf8")
);
const artifact = (name) =>
  JSON.parse(readFileSync(join(root, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8")).abi;

const factoryAbi = artifact("RotaFactory");
const circleAbi = artifact("RotaCircle");
const potAbi = artifact("GoalPot");
const usdcAbi = artifact("MockUSDC");

// default anvil private keys (publicly known, local only)
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
];
const accounts = KEYS.map((k) => privateKeyToAccount(k));
const rpc = http("http://127.0.0.1:8545");
const pub = createPublicClient({ chain: foundry, transport: rpc });
const wallets = accounts.map((account) =>
  createWalletClient({ account, chain: foundry, transport: rpc })
);

const USDC = deployments.usdc;
const FACTORY = deployments.factory;
const usd = (n) => parseUnits(String(n), 6);
const WEEK = 7n * 24n * 3600n;

async function tx(wallet, params) {
  const { request } = await pub.simulateContract({ account: wallet.account, ...params });
  const hash = await wallet.writeContract(request);
  await pub.waitForTransactionReceipt({ hash });
}

async function approve(wallet, spender, amount) {
  await tx(wallet, { address: USDC, abi: usdcAbi, functionName: "approve", args: [spender, amount] });
}

async function lastCircle() {
  const list = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getCircles" });
  return list[list.length - 1];
}
async function lastPot() {
  const list = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getGoalPots" });
  return list[list.length - 1];
}

const now = BigInt(Math.floor(Date.now() / 1000));

function circleParams(overrides) {
  return {
    token: USDC,
    contributionAmount: usd(100),
    memberCap: 4n,
    roundDuration: WEEK,
    mode: 0,
    collateralBps: 10_000n,
    givingBps: 0n,
    givingRecipient: "0x0000000000000000000000000000000000000000",
    bidWindowBps: 0n,
    maxDiscountBps: 0n,
    openDeadline: now + 30n * 24n * 3600n,
    inviteOnly: false,
    name: "Circle",
    ...overrides,
  };
}

async function createCircle(params) {
  await approve(wallets[0], FACTORY, (params.contributionAmount * params.collateralBps) / 10_000n);
  await tx(wallets[0], { address: FACTORY, abi: factoryAbi, functionName: "createCircle", args: [params] });
  const circle = await lastCircle();
  const collateral = (params.contributionAmount * params.collateralBps) / 10_000n;
  for (let i = 1; i < Number(params.memberCap); i++) {
    await approve(wallets[i], circle, collateral);
    await tx(wallets[i], { address: circle, abi: circleAbi, functionName: "join" });
  }
  await tx(wallets[0], { address: circle, abi: circleAbi, functionName: "activate" });
  return circle;
}

async function contributeAll(circle, amount, n) {
  for (let i = 0; i < n; i++) {
    await approve(wallets[i], circle, amount);
    await tx(wallets[i], { address: circle, abi: circleAbi, functionName: "contribute" });
  }
}

// ---------------------------------------------------------------- 1. ROSCA, 2 rounds played
console.log("Seeding: Dhaka Family Circle (ROSCA, 2 rounds played)…");
const rosca = await createCircle(circleParams({ name: "Dhaka Family Circle" }));
for (let round = 0; round < 2; round++) {
  await contributeAll(rosca, usd(100), 4);
  await tx(wallets[0], { address: rosca, abi: circleAbi, functionName: "settleRound" });
}
console.log(`  → ${rosca} (round 3 of 4 in progress)`);

// ---------------------------------------------------------------- 2. Bid circle mid-auction
console.log("Seeding: Gulshan Traders Circle (BID, mid-auction)…");
const bid = await createCircle(
  circleParams({
    name: "Gulshan Traders Circle",
    contributionAmount: usd(250),
    mode: 2,
    bidWindowBps: 3_000n,
    maxDiscountBps: 3_000n,
  })
);
await contributeAll(bid, usd(250), 4);
await tx(wallets[2], { address: bid, abi: circleAbi, functionName: "placeBid", args: [800n] });
console.log(`  → ${bid} (live bid: 8% discount by member #3)`);

// ---------------------------------------------------------------- 3. Goal pot at 60%
console.log("Seeding: Eid Family Fund (goal pot at 60%)…");
await tx(wallets[0], {
  address: FACTORY,
  abi: factoryAbi,
  functionName: "createGoalPot",
  args: [
    {
      token: USDC,
      targetAmount: usd(1000),
      deadline: now + 60n * 24n * 3600n,
      memberCap: 0n,
      minContribution: 0n,
      earlyExitHaircutBps: 200n,
      givingBps: 0n,
      givingRecipient: "0x0000000000000000000000000000000000000000",
      inviteOnly: false,
      name: "Eid Family Fund",
    },
  ],
});
const pot = await lastPot();
const potDeposits = [300, 200, 100];
for (let i = 0; i < potDeposits.length; i++) {
  await approve(wallets[i], pot, usd(potDeposits[i]));
  await tx(wallets[i], { address: pot, abi: potAbi, functionName: "deposit", args: [usd(potDeposits[i])] });
}
console.log(`  → ${pot} (600 / 1000 USDC)`);

console.log("\nSeed complete. Open the app with account #0–#3 imported into your wallet.");
