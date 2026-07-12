#!/usr/bin/env node
/**
 * Seeds the LIVE Arc testnet deployment (contracts/deployments/arc.json) with
 * realistic demo activity from 8 distinct persona wallets, paced with random
 * human-like delays. Exercises every contract feature end-to-end:
 *
 *   A. "Dhanmondi Sunday Savings"  — FIXED_ORDER, 4 members, 2% giving cut,
 *                                    ALL rounds completed, collateral withdrawn
 *   P1. "Rafi & Nusrat Wedding Gift" — goal pot: deposits, one early exit
 *                                    (haircut), target reached, all withdraw
 *   B. "Karwan Bazar Traders"      — RANDOM_ORDER, 4 members, one member on
 *                                    AutoPay (pulled by the organizer),
 *                                    completed + collateral withdrawn
 *   C. "Motijheel Merchants Chit"  — BID mode, 3 members, real bid windows
 *                                    (4-minute rounds), completed, dividends
 *                                    withdrawn
 *   D. "Mohakhali Colleagues Fund" — FIXED_ORDER, 3 members, one member MISSES
 *                                    a round (slashed → default), cures the
 *                                    default, circle still completes
 *   E. "Uttara Neighbours Fund"    — left OPEN at 3/5 members (joinable in UI)
 *   F. "Banani Book Club Pool"     — left ACTIVE mid-round (2/3 contributed)
 *   P2. "Cox's Bazar Reunion Trip" — goal pot left in progress at ~60%
 *
 * Funding: the master wallet (PRIVATE_KEY in .env.local, topped up at
 * https://faucet.circle.com) sends native USDC to each persona wallet. On Arc
 * the native token IS USDC, so one transfer covers both gas and ERC-20 balance.
 *
 * Persona keys are generated once and persisted (gitignored) in
 * scripts/.seed-wallets.arc.json so re-runs reuse the same identities.
 *
 * Usage:  node scripts/seed-arc.mjs          (~20-25 min, budget ≈ 31 USDC,
 *                                             most of it circulates back)
 *         FAST=1 node scripts/seed-arc.mjs   (short delays; contract-enforced
 *                                             bid/deadline waits remain)
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  parseEther,
  parseUnits,
  formatUnits,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ------------------------------------------------------------------ env/config

for (const f of [".env", ".env.local"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
if (!process.env.PRIVATE_KEY) {
  console.error("PRIVATE_KEY missing (set it in .env.local)");
  process.exit(1);
}

// Two seeder processes sharing the persona wallets race each other's balances
// and nonces — refuse to start while another run holds the lock (stale after 1h).
const LOCK_FILE = join(root, "scripts", ".seed-arc.lock");
if (existsSync(LOCK_FILE) && Date.now() - statSync(LOCK_FILE).mtimeMs < 3600_000) {
  console.error(`Another seed run appears to be active (${LOCK_FILE} exists). If you are sure it is not, delete the lock file and retry.`);
  process.exit(1);
}
writeFileSync(LOCK_FILE, String(process.pid));
process.on("exit", () => { try { unlinkSync(LOCK_FILE); } catch {} });
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));

const deployments = JSON.parse(
  readFileSync(join(root, "contracts", "deployments", "arc.json"), "utf8")
);
const artifact = (name) =>
  JSON.parse(
    readFileSync(join(root, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8")
  ).abi;

const factoryAbi = artifact("RotaFactory");
const circleAbi = artifact("RotaCircle");
const potAbi = artifact("GoalPot");
// minimal ERC-20 surface of Arc's native-USDC interface
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];

const arcTestnet = defineChain({
  id: deployments.chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
});

const USDC = deployments.usdc;
const FACTORY = deployments.factory;
const ZERO = "0x0000000000000000000000000000000000000000";
const EXPLORER = "https://testnet.arcscan.app/tx/";
const usd = (n) => parseUnits(String(n), 6);
const fmt = (v) => formatUnits(v, 6);
const DAY = 24n * 3600n;

const transport = http("https://rpc.testnet.arc.network");
const pub = createPublicClient({ chain: arcTestnet, transport });
// docs/ARC_NOTES.md: target ≥20 gwei so txs never stall; base fee is tiny
const FEES = { maxFeePerGas: 50_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };

// ------------------------------------------------------------------- personas

const WALLET_FILE = join(root, "scripts", ".seed-wallets.arc.json");
const PERSONAS = [
  { name: "Ayesha", fund: "3.5" }, // 0
  { name: "Rafiq", fund: "4.5" }, // 1
  { name: "Tania", fund: "4.0" }, // 2
  { name: "Imran", fund: "5.0" }, // 3
  { name: "Shorna", fund: "3.5" }, // 4
  { name: "Kamal", fund: "3.5" }, // 5
  { name: "Mitu", fund: "3.0" }, // 6  (also the giving recipient)
  { name: "Jahid", fund: "3.0" }, // 7
];

let keys;
if (existsSync(WALLET_FILE)) {
  keys = JSON.parse(readFileSync(WALLET_FILE, "utf8"));
  console.log(`Reusing ${keys.length} persona wallets from ${WALLET_FILE}`);
} else {
  keys = PERSONAS.map(() => generatePrivateKey());
  writeFileSync(WALLET_FILE, JSON.stringify(keys, null, 2));
  console.log(`Generated ${keys.length} persona wallets → ${WALLET_FILE} (testnet-only, gitignored)`);
}

const master = createWalletClient({
  account: privateKeyToAccount(process.env.PRIVATE_KEY),
  chain: arcTestnet,
  transport,
});
const W = keys.map((k, i) => {
  const w = createWalletClient({ account: privateKeyToAccount(k), chain: arcTestnet, transport });
  w.persona = PERSONAS[i].name;
  return w;
});

// -------------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = !!process.env.FAST;
const rand = (min, max) => min + Math.random() * (max - min);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffled = (arr) => [...arr].sort(() => Math.random() - 0.5);

/** Human-ish pause between actions; occasionally a longer break. */
async function pause() {
  let s = Math.random() < 0.12 ? rand(25, 70) : rand(4, 14);
  if (FAST) s *= 0.05;
  await sleep(s * 1000);
}
/** Short pause for deadline-pressured sequences. */
async function quickPause() {
  await sleep(rand(1, 3) * 1000);
}

async function tx(wallet, params, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      // NOTE: never pass fee params into simulateContract — on Arc, gas is prepaid
      // from the same native-USDC balance, and eth_call with explicit fees reserves
      // maxFeePerGas × default gas limit (~1.5 USDC), making the ERC-20 balance
      // look short during simulation. Fees go on the actual write only.
      const { request } = await pub.simulateContract({ account: wallet.account, ...params });
      request.maxFeePerGas = FEES.maxFeePerGas;
      request.maxPriorityFeePerGas = FEES.maxPriorityFeePerGas;
      const hash = await wallet.writeContract(request);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
      console.log(`   ${wallet.persona ?? "master"} · ${label}\n      ${EXPLORER}${hash}`);
      return receipt;
    } catch (e) {
      if (attempt >= 4) throw e;
      console.log(`   retry ${attempt}/3 (${wallet.persona} · ${label}): ${e.shortMessage ?? e.message}`);
      await sleep(6000);
    }
  }
}

const approve = (wallet, spender, amount) =>
  tx(wallet, { address: USDC, abi: erc20Abi, functionName: "approve", args: [spender, amount] },
    `approve ${fmt(amount)} USDC`);

/** Race-safe: read the clone address from the factory event in this receipt. */
function createdAddress(receipt, eventName) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== FACTORY.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === eventName) return ev.args.circle ?? ev.args.pot;
    } catch { /* not this event */ }
  }
  throw new Error(`${eventName} event not found in receipt`);
}

async function chainNow() {
  return (await pub.getBlock()).timestamp;
}

/** Wait (wall-clock) until on-chain time reaches `target`. */
async function waitChainTime(target, label) {
  for (;;) {
    const now = await chainNow();
    if (now >= target) return;
    const remain = Number(target - now);
    console.log(`   ⏳ ${remain}s until ${label}`);
    await sleep(Math.min(remain, 25) * 1000 + 1500);
  }
}

const readCircle = (circle, fn, args = []) =>
  pub.readContract({ address: circle, abi: circleAbi, functionName: fn, args });

// --------------------------------------------------------- building blocks

function circleParams(overrides) {
  return {
    token: USDC,
    contributionAmount: usd(1),
    memberCap: 4n,
    roundDuration: 7n * DAY,
    mode: 0,
    collateralBps: 5_000n,
    givingBps: 0n,
    givingRecipient: ZERO,
    bidWindowBps: 0n,
    maxDiscountBps: 0n,
    openDeadline: 0n, // filled at creation time
    inviteOnly: false,
    name: "Circle",
    ...overrides,
  };
}

/** Organizer creates the circle; the rest join with jittered delays; activate. */
async function createAndFillCircle(organizer, joiners, params) {
  params.openDeadline = (await chainNow()) + 30n * DAY;
  const collateral = (params.contributionAmount * params.collateralBps) / 10_000n;
  if (collateral > 0n) {
    await approve(organizer, FACTORY, collateral);
    await quickPause();
  }
  const receipt = await tx(
    organizer,
    { address: FACTORY, abi: factoryAbi, functionName: "createCircle", args: [params] },
    `create circle "${params.name}"`
  );
  const circle = createdAddress(receipt, "CircleCreated");
  for (const w of joiners) {
    await pause();
    if (collateral > 0n) {
      await approve(w, circle, collateral);
      await quickPause();
    }
    await tx(w, { address: circle, abi: circleAbi, functionName: "join" }, `join "${params.name}"`);
  }
  await pause();
  await tx(organizer, { address: circle, abi: circleAbi, functionName: "activate" }, `activate "${params.name}"`);
  return circle;
}

async function contribute(w, circle, amount, quick = false) {
  await approve(w, circle, amount);
  await quickPause();
  await tx(w, { address: circle, abi: circleAbi, functionName: "contribute" }, "contribute");
  await (quick ? quickPause() : pause());
}

// ================================================================= scenarios

async function scenarioA_fixedFullLifecycle() {
  console.log('\n━━ A. "Dhanmondi Sunday Savings" — FIXED_ORDER, 4 members, 2% giving, full lifecycle');
  const members = [W[0], W[1], W[2], W[3]];
  const amount = usd(1);
  const circle = await createAndFillCircle(
    W[0],
    members.slice(1),
    circleParams({
      name: "Dhanmondi Sunday Savings",
      contributionAmount: amount,
      memberCap: 4n,
      givingBps: 200n,
      givingRecipient: W[6].account.address, // Mitu's community fund
    })
  );
  for (let round = 0; round < 4; round++) {
    console.log(`   — round ${round + 1}/4`);
    for (const w of shuffled(members)) await contribute(w, circle, amount);
    await tx(pick(members), { address: circle, abi: circleAbi, functionName: "settleRound" }, `settle round ${round + 1}`);
    await pause();
  }
  for (const w of shuffled(members)) {
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawCollateral" }, "withdraw collateral");
    await pause();
  }
  console.log(`   ✓ completed: ${circle}`);
  return circle;
}

async function scenarioP1_goalPotFullLifecycle() {
  console.log('\n━━ P1. "Rafi & Nusrat Wedding Gift" — goal pot: early exit + target reached + withdrawals');
  const receipt = await tx(
    W[0],
    {
      address: FACTORY, abi: factoryAbi, functionName: "createGoalPot",
      args: [{
        token: USDC,
        targetAmount: usd(5.5),
        deadline: (await chainNow()) + 45n * DAY,
        memberCap: 0n,
        minContribution: 0n,
        earlyExitHaircutBps: 300n,
        givingBps: 0n,
        givingRecipient: ZERO,
        inviteOnly: false,
        name: "Rafi & Nusrat Wedding Gift",
      }],
    },
    "create goal pot"
  );
  const pot = createdAddress(receipt, "GoalPotCreated");

  const deposit = async (w, n) => {
    await approve(w, pot, usd(n));
    await quickPause();
    await tx(w, { address: pot, abi: potAbi, functionName: "deposit", args: [usd(n)] }, `deposit ${n} USDC`);
    await pause();
  };
  await deposit(W[0], 1.8);
  await deposit(W[5], 0.9);
  await deposit(W[2], 1.3);
  await deposit(W[4], 1.1);
  // Kamal changes his mind before the goal is met → 3% haircut to the stayers
  await tx(W[5], { address: pot, abi: potAbi, functionName: "emergencyWithdraw" }, "early exit (3% haircut)");
  await pause();
  await deposit(W[1], 1.5); // crosses the 5.5 target → unlockable
  for (const w of shuffled([W[0], W[2], W[4], W[1]])) {
    await tx(w, { address: pot, abi: potAbi, functionName: "withdraw" }, "withdraw principal + bonus");
    await pause();
  }
  console.log(`   ✓ completed: ${pot}`);
  return pot;
}

async function scenarioB_randomWithAutopay() {
  console.log('\n━━ B. "Karwan Bazar Traders" — RANDOM_ORDER, 4 members, AutoPay, full lifecycle');
  const members = [W[4], W[2], W[5], W[7]];
  const amount = usd(0.5);
  const circle = await createAndFillCircle(
    W[4],
    members.slice(1),
    circleParams({
      name: "Karwan Bazar Traders",
      contributionAmount: amount,
      memberCap: 4n,
      mode: 1, // RANDOM_ORDER
      collateralBps: 10_000n,
      roundDuration: 5n * DAY,
    })
  );
  // Jahid sets up AutoPay: allowance for all four rounds, organizer pulls for him
  await tx(W[7], { address: circle, abi: circleAbi, functionName: "optInAutoPay" }, "opt into AutoPay");
  await quickPause();
  await approve(W[7], circle, amount * 4n);
  await pause();
  for (let round = 0; round < 4; round++) {
    console.log(`   — round ${round + 1}/4`);
    for (const w of shuffled([W[4], W[2], W[5]])) await contribute(w, circle, amount);
    await tx(W[4], { address: circle, abi: circleAbi, functionName: "pullContribution", args: [W[7].account.address] }, "AutoPay pull for Jahid");
    await pause();
    await tx(pick(members), { address: circle, abi: circleAbi, functionName: "settleRound" }, `settle round ${round + 1}`);
    await pause();
  }
  for (const w of shuffled(members)) {
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawCollateral" }, "withdraw collateral");
    await pause();
  }
  console.log(`   ✓ completed: ${circle}`);
  return circle;
}

async function scenarioC_bidAuction() {
  console.log('\n━━ C. "Motijheel Merchants Chit" — BID mode, 3 members, 4-min rounds, full lifecycle');
  const members = [W[1], W[3], W[5]];
  const amount = usd(0.8);
  const duration = 240n; // bid window = 20% = 48s per round
  const circle = await createAndFillCircle(
    W[1],
    members.slice(1),
    circleParams({
      name: "Motijheel Merchants Chit",
      contributionAmount: amount,
      memberCap: 3n,
      mode: 2, // BID
      collateralBps: 5_000n,
      roundDuration: duration,
      bidWindowBps: 2_000n,
      maxDiscountBps: 1_500n,
    })
  );
  const startTime = await readCircle(circle, "startTime");
  const bidWindowEnd = (r) => startTime + BigInt(r) * duration + (duration * 2_000n) / 10_000n;
  const roundStart = (r) => startTime + BigInt(r) * duration;
  const bids = [
    [{ w: W[3], bps: 500n }, { w: W[5], bps: 900n }], // round 1: Kamal outbids Imran
    [{ w: W[3], bps: 400n }], // round 2: Imran takes it cheap
    [], // round 3: Rafiq is the only one left — no auction needed
  ];
  for (let round = 0; round < 3; round++) {
    console.log(`   — round ${round + 1}/3`);
    await waitChainTime(roundStart(round), `round ${round + 1} opens`);
    // bids first — the window is only the opening 20% (48s) of the round
    for (const { w, bps } of bids[round]) {
      await tx(w, { address: circle, abi: circleAbi, functionName: "placeBid", args: [bps] }, `bid ${Number(bps) / 100}% discount`);
      await quickPause();
    }
    for (const w of shuffled(members)) await contribute(w, circle, amount, true);
    await waitChainTime(bidWindowEnd(round), "bid window closes");
    await tx(pick(members), { address: circle, abi: circleAbi, functionName: "settleRound" }, `settle round ${round + 1}`);
  }
  for (const w of shuffled(members)) {
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawDividends" }, "withdraw bid dividends");
    await quickPause();
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawCollateral" }, "withdraw collateral");
    await quickPause();
  }
  console.log(`   ✓ completed: ${circle}`);
  return circle;
}

async function scenarioD_defaultAndCure() {
  console.log('\n━━ D. "Mohakhali Colleagues Fund" — FIXED_ORDER, missed round → slash → cure, completes');
  const members = [W[6], W[0], W[4]];
  const amount = usd(0.6);
  const duration = 150n;
  const circle = await createAndFillCircle(
    W[6],
    members.slice(1),
    circleParams({
      name: "Mohakhali Colleagues Fund",
      contributionAmount: amount,
      memberCap: 3n,
      collateralBps: 10_000n,
      roundDuration: duration,
    })
  );
  const startTime = await readCircle(circle, "startTime");

  console.log("   — round 1/3 (everyone pays)");
  for (const w of shuffled(members)) await contribute(w, circle, amount, true);
  await tx(W[6], { address: circle, abi: circleAbi, functionName: "settleRound" }, "settle round 1");

  console.log("   — round 2/3 (Shorna misses the deadline)");
  await contribute(W[6], circle, amount, true);
  await contribute(W[0], circle, amount, true);
  await waitChainTime(startTime + 2n * duration, "round 2 deadline (Shorna defaults)");
  await tx(W[0], { address: circle, abi: circleAbi, functionName: "settleRound" }, "settle round 2 — Shorna slashed");

  console.log("   — round 3/3 (Shorna cures, everyone pays; deadline-pressured, short delays)");
  const cureCost = await readCircle(circle, "cureCost", [W[4].account.address]);
  await approve(W[4], circle, cureCost);
  await tx(W[4], { address: circle, abi: circleAbi, functionName: "cureDefault" }, `cure default (${fmt(cureCost)} USDC incl. 5% penalty)`);
  for (const w of shuffled(members)) await contribute(w, circle, amount, true);
  await tx(W[6], { address: circle, abi: circleAbi, functionName: "settleRound" }, "settle round 3");
  for (const w of shuffled(members)) {
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawCollateral" }, "withdraw collateral");
    await quickPause();
  }
  console.log(`   ✓ completed: ${circle}`);
  return circle;
}

async function scenarioE_openCircle() {
  console.log('\n━━ E. "Uttara Neighbours Fund" — left OPEN at 3/5 (joinable in the UI)');
  const params = circleParams({
    name: "Uttara Neighbours Fund",
    contributionAmount: usd(0.8),
    memberCap: 5n,
    collateralBps: 5_000n,
  });
  params.openDeadline = (await chainNow()) + 21n * DAY;
  const collateral = (params.contributionAmount * params.collateralBps) / 10_000n;
  await approve(W[2], FACTORY, collateral);
  await quickPause();
  const receipt = await tx(W[2], { address: FACTORY, abi: factoryAbi, functionName: "createCircle", args: [params] }, 'create circle "Uttara Neighbours Fund"');
  const circle = createdAddress(receipt, "CircleCreated");
  for (const w of [W[5], W[6]]) {
    await pause();
    await approve(w, circle, collateral);
    await quickPause();
    await tx(w, { address: circle, abi: circleAbi, functionName: "join" }, "join");
  }
  console.log(`   ✓ open at 3/5: ${circle}`);
  return circle;
}

async function scenarioF_midRoundCircle() {
  console.log('\n━━ F. "Banani Book Club Pool" — left ACTIVE mid-round (2/3 contributed)');
  const amount = usd(0.5);
  const circle = await createAndFillCircle(
    W[3],
    [W[6], W[7]],
    circleParams({
      name: "Banani Book Club Pool",
      contributionAmount: amount,
      memberCap: 3n,
      collateralBps: 10_000n,
    })
  );
  await contribute(W[3], circle, amount);
  await contribute(W[7], circle, amount);
  console.log(`   ✓ live, waiting on Mitu: ${circle}`);
  return circle;
}

async function scenarioP2_potInProgress() {
  console.log('\n━━ P2. "Cox\'s Bazar Reunion Trip" — goal pot left at ~60%');
  const receipt = await tx(
    W[1],
    {
      address: FACTORY, abi: factoryAbi, functionName: "createGoalPot",
      args: [{
        token: USDC,
        targetAmount: usd(8),
        deadline: (await chainNow()) + 60n * DAY,
        memberCap: 0n,
        minContribution: usd(0.2),
        earlyExitHaircutBps: 500n,
        givingBps: 0n,
        givingRecipient: ZERO,
        inviteOnly: false,
        name: "Cox's Bazar Reunion Trip",
      }],
    },
    "create goal pot"
  );
  const pot = createdAddress(receipt, "GoalPotCreated");
  for (const [w, n] of [[W[1], 1.6], [W[5], 1.2], [W[7], 0.9], [W[0], 1.1]]) {
    await approve(w, pot, usd(n));
    await quickPause();
    await tx(w, { address: pot, abi: potAbi, functionName: "deposit", args: [usd(n)] }, `deposit ${n} USDC`);
    await pause();
  }
  console.log(`   ✓ in progress (4.8 / 8 USDC): ${pot}`);
  return pot;
}

// ==================================================================== main

console.log(`\nRota Arc-testnet seeder — factory ${FACTORY}`);
console.log(`Master: ${master.account.address}`);

// 1. fund personas (top-up model: only send what's missing)
const target = PERSONAS.map((p) => parseEther(p.fund));
const balances = await Promise.all(W.map((w) => pub.getBalance({ address: w.account.address })));
let needed = 0n;
for (let i = 0; i < W.length; i++) {
  const short = target[i] > balances[i] ? target[i] - balances[i] : 0n;
  needed += short;
}
const masterBal = await pub.getBalance({ address: master.account.address });
console.log(`Master balance: ${formatUnits(masterBal, 18)} USDC · funding needed: ${formatUnits(needed, 18)} USDC`);
if (masterBal < needed + parseEther("2")) {
  console.error(`Insufficient master balance (need ~${formatUnits(needed + parseEther("2"), 18)} incl. gas buffer). Top up at https://faucet.circle.com (Arc Testnet).`);
  process.exit(1);
}

console.log("\n━━ Funding persona wallets (native USDC = gas + ERC-20 balance)");
for (let i = 0; i < W.length; i++) {
  if (target[i] <= balances[i]) {
    console.log(`   ${W[i].persona} already funded (${formatUnits(balances[i], 18)} USDC)`);
    continue;
  }
  // small random extra so funding amounts don't look machine-uniform
  const value = target[i] - balances[i] + parseEther(rand(0.01, 0.09).toFixed(3));
  const hash = await master.sendTransaction({ to: W[i].account.address, value, ...FEES });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`   funded ${W[i].persona} with ${formatUnits(value, 18)} USDC\n      ${EXPLORER}${hash}`);
  await pause();
}

// SCENARIOS=P1,B,C,... reruns a subset (e.g. resuming after a mid-run failure)
const only = process.env.SCENARIOS ? process.env.SCENARIOS.split(",").map((s) => s.trim().toUpperCase()) : null;
const enabled = (key) => !only || only.includes(key);

const summary = {};
if (enabled("A")) summary.circleA = await scenarioA_fixedFullLifecycle();
if (enabled("P1")) summary.goalPot1 = await scenarioP1_goalPotFullLifecycle();
if (enabled("B")) summary.circleB = await scenarioB_randomWithAutopay();
// C and D both wait on real chain time — run them concurrently (disjoint wallets)
const [c, d] = await Promise.all([
  enabled("C") ? scenarioC_bidAuction() : null,
  enabled("D") ? scenarioD_defaultAndCure() : null,
]);
if (c) summary.circleC_bid = c;
if (d) summary.circleD_defaultCured = d;
if (enabled("E")) summary.circleE_open = await scenarioE_openCircle();
if (enabled("F")) summary.circleF_midRound = await scenarioF_midRoundCircle();
if (enabled("P2")) summary.goalPot2_inProgress = await scenarioP2_potInProgress();

const SUMMARY_FILE = join(root, "scripts", ".seed-arc-summary.json");
writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
console.log(`\nSeed complete. Contract addresses written to ${SUMMARY_FILE}`);
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(24)} ${v}`);
