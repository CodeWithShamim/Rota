#!/usr/bin/env node
// One-off: finish the two circles stranded by the concurrent seeder runs —
// top up short wallets from master, fill in missing contributions (via AutoPay
// pull where the member opted in), settle to completion, withdraw collateral.
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, defineChain, http, formatUnits, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = "/Users/shamimislam/buildingApps/rota";
const CIRCLES = [
  "0xA9c639F6C0C571B06eE4A17FAFFD38B2A849b712", // Dhanmondi Sunday Savings #2
  "0xC9a597F8642e40E7B77bB757bA3634cd247d0957", // Karwan Bazar Traders
];
const USDC = "0x3600000000000000000000000000000000000000";

const circleAbi = JSON.parse(readFileSync(`${ROOT}/contracts/out/RotaCircle.sol/RotaCircle.json`, "utf8")).abi;
const erc20Abi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
];

const arc = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.network"] } },
  testnet: true,
});
const transport = http("https://rpc.testnet.arc.network");
const pub = createPublicClient({ chain: arc, transport });
const FEES = { maxFeePerGas: 50_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n };

// load PRIVATE_KEY from .env/.env.local
for (const f of [".env", ".env.local"]) {
  try {
    for (const line of readFileSync(`${ROOT}/${f}`, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
    }
  } catch {}
}
const master = createWalletClient({ account: privateKeyToAccount(process.env.PRIVATE_KEY), chain: arc, transport });

const keys = JSON.parse(readFileSync(`${ROOT}/scripts/.seed-wallets.arc.json`, "utf8"));
const names = ["Ayesha", "Rafiq", "Tania", "Imran", "Shorna", "Kamal", "Mitu", "Jahid"];
const W = keys.map((k, i) => {
  const w = createWalletClient({ account: privateKeyToAccount(k), chain: arc, transport });
  w.persona = names[i];
  return w;
});
const byAddr = Object.fromEntries(W.map((w) => [w.account.address.toLowerCase(), w]));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep((3 + Math.random() * 8) * 1000);
const shuffled = (a) => [...a].sort(() => Math.random() - 0.5);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function tx(wallet, params, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const { request } = await pub.simulateContract({ account: wallet.account, ...params });
      request.maxFeePerGas = FEES.maxFeePerGas;
      request.maxPriorityFeePerGas = FEES.maxPriorityFeePerGas;
      const hash = await wallet.writeContract(request);
      const receipt = await pub.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
      console.log(`   ${wallet.persona} · ${label}\n      https://testnet.arcscan.app/tx/${hash}`);
      return receipt;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.log(`   retry (${wallet.persona} · ${label}): ${e.shortMessage ?? e.message}`);
      await sleep(6000);
    }
  }
}

async function ensureBalance(w, needUnits6) {
  const bal = await pub.getBalance({ address: w.account.address });
  const need = needUnits6 * 10n ** 12n + parseEther("0.05"); // 6-dec → 18-dec + gas headroom
  if (bal >= need) return;
  const value = need - bal + parseEther("0.1");
  const hash = await master.sendTransaction({ to: w.account.address, value, ...FEES });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`   master topped up ${w.persona} with ${formatUnits(value, 18)} USDC`);
}

async function finishCircle(circle) {
  const read = (fn, args = []) => pub.readContract({ address: circle, abi: circleAbi, functionName: fn, args });
  const name = await read("name");
  const memberAddrs = await read("getMembers");
  const members = memberAddrs.map((a) => byAddr[a.toLowerCase()]);
  const organizer = byAddr[(await read("organizer")).toLowerCase()];
  const amount = await read("contributionAmount");
  const cap = Number(await read("memberCap"));
  console.log(`\nFinishing "${name}" (${circle}) — round ${Number(await read("currentRound")) + 1}/${cap}`);

  for (let r = Number(await read("currentRound")); r < cap; r = Number(await read("currentRound"))) {
    console.log(`   — round ${r + 1}/${cap}`);
    for (const w of shuffled(members)) {
      if (await read("hasContributed", [BigInt(r), w.account.address])) continue;
      await ensureBalance(w, amount);
      const optedIn = await read("autoPayOptIn", [w.account.address]);
      const allowance = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [w.account.address, circle] });
      if (optedIn && allowance >= amount) {
        await tx(organizer, { address: circle, abi: circleAbi, functionName: "pullContribution", args: [w.account.address] }, `AutoPay pull for ${w.persona}`);
      } else {
        await tx(w, { address: USDC, abi: erc20Abi, functionName: "approve", args: [circle, amount] }, "approve");
        await tx(w, { address: circle, abi: circleAbi, functionName: "contribute" }, "contribute");
      }
      await pause();
    }
    await tx(pick(members), { address: circle, abi: circleAbi, functionName: "settleRound" }, `settle round ${r + 1}`);
    await pause();
  }
  for (const w of shuffled(members)) {
    await tx(w, { address: circle, abi: circleAbi, functionName: "withdrawCollateral" }, "withdraw collateral");
    await pause();
  }
  console.log(`✓ "${name}" completed: ${circle}`);
}

for (const c of CIRCLES) await finishCircle(c);
