# Design Decisions

One-line rationale for each open call made during the build.

| # | Decision | Rationale |
|---|---|---|
| 1 | Organizer collateral is pulled by the **factory** (approve factory, not clone) | The clone address doesn't exist before creation, so the organizer can't pre-approve it; the factory is trusted first-party code. |
| 2 | Rounds are **schedule-anchored** (`deadline(r) = startTime + (r+1)·duration`), with early settle allowed when everyone has paid | Predictable calendar ("every Friday") matches how real somitis operate; early settle keeps demos and eager circles fast. |
| 3 | Bid windows are also schedule-anchored; a late-settled round can lose its bid window (falls back to join order) | One consistent time model; keepers/members are incented to settle on time anyway. |
| 4 | Defaulters are **skipped, not ejected**: barred from payouts until `cureDefault()` | Ejecting members mid-cycle breaks pot math; skipping preserves N rounds while still punishing default. |
| 5 | Slash shortfall (collateral < missed amount) reduces the recipient's pot rather than socializing debt | Keeps accounting exact and transparent; documented in SECURITY.md as under-collateralization risk. |
| 6 | Cure = slashed + shortfall + 5% penalty; slashed part restores collateral, rest carries into next pot | Members who repay get their safety net back; the circle (not the org) earns the penalty. |
| 7 | Bid ties broken by **earliest bid** via strict `>` comparison | No timestamp bookkeeping needed; equal bid simply reverts. |
| 8 | Bid discount dust (indivisible remainder) goes to the **recipient** | Recipient already takes the discount haircut; avoids stuck wei. |
| 9 | If no eligible recipient exists (everyone remaining defaulted), the pot is distributed as dividends to non-defaulted members, else carried forward | The pot must go somewhere; rewarding the compliant members is the least-bad option. |
| 10 | GoalPot members join implicitly on first deposit | One less transaction; membership without money is meaningless in a savings pot. |
| 11 | GoalPot haircut shares use the **unlock-time snapshot** (`unlockTotal`) as denominator | Fixed denominator makes shares independent of withdrawal order; dust (≤ a few micro-USDC) stays in the contract. |
| 12 | Reputation formula lives in `getScore()` (computed on read) | Transparent + upgrades to weighting possible by deploying a new registry without migrating counters. |
| 13 | Frontend reads via TanStack Query + `publicClient.readContract` loops rather than nested wagmi hooks | Hooks can't run in loops; query-based fetchers keep dashboards/notifications derived from one code path. |
| 14 | Event history via `getContractEvents(fromBlock: 0)` | Fine for testnet volumes; an indexer is future work if event counts grow. |
| 15 | Wallet connection is plain wagmi `injected()` (no RainbowKit/WalletConnect) | Avoids a WalletConnect project-id dependency; MetaMask covers the local + Arc testnet demo path. |
| 16 | FX rates from open.er-api.com, cached 12 h, clearly marked indicative | Free, keyless, swappable via `RATE_PROVIDER` in one file; display-only by design. |
| 17 | `MockUSDC` only on anvil; on Arc the app binds to the native USDC ERC-20 interface (`0x36…00`) | Arc's USDC *is* the gas token with an ERC-20 facade — no reason to wrap or mock on testnet. |
| 18 | Seed script uses early-settle instead of time travel | Keeps seeding one plain viem script; no `evm_increaseTime` fragility. |
