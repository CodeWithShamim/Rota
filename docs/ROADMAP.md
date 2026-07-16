# Rota ◎ — Product & Engineering Roadmap

> Status: living document. Last updated **2026-07-17**.
> Companion docs: [README](../README.md) · [SECURITY.md](../SECURITY.md) ·
> [DECISIONS.md](DECISIONS.md) · [ARC_NOTES.md](ARC_NOTES.md)

## Vision

Put the world's informal savings circles — somiti, chit fund, tanda, susu, esusu,
hui, paluwagan, gam'eya — on one set of smart-contract rails: escrowed, deterministic,
non-custodial USDC circles on Arc, with an on-chain Credit Passport that turns
faithful participation into portable reputation for thin-file users.

**Beachhead:** Bangladesh (complete `bn` UI, taka display, diaspora corridors).
**Expansion model:** new markets are configuration (locale + currency + copy), not
refactoring.

## Guiding principles

1. **Non-custodial always.** No pooled keys, no admin access to escrowed funds,
   AutoPay bounded to exact amounts.
2. **Testnet until cleared.** No mainnet deployment before an external audit *and*
   a per-market regulatory review (see [SECURITY.md](../SECURITY.md) §Regulatory).
3. **Honesty over polish.** Known limitations stay documented; nothing ships that
   contradicts SECURITY.md without fixing it there too.
4. **Markets are config.** Anything market-specific belongs in locale files and
   `currencies.ts`, never in contracts.

---

## Where we are — Phase 0: MVP (✅ complete)

Shipped and live on **Arc testnet** (chain id 5042002, redeployed 2026-07-12 with
audit fixes):

- **Contracts** (Foundry, Sol 0.8.24, OZ 5): `RotaFactory` (clone factory),
  `RotaCircle` (ROSCA fixed/random/bid modes), `GoalPot`, `ReputationRegistry`;
  74-test suite incl. fuzz, invariants, reentrancy; blacklist-hardened settlement
  (`PayoutDeferred`), collateral + default curing, giving cut, non-custodial AutoPay.
- **App** (Vite/React 18/wagmi v2): dashboard, create/detail flows for all three
  products, Credit Passport page with QR + client-side signature verification,
  deadline reminders (in-app + browser), `en` + `bn` complete, 7 display currencies,
  local anvil + Arc testnet targets, seeded demo environment.
- **AI news desk**: GenLayer Intelligent Contract (`news_curator.py`) live on
  studionet, read via `genlayer-js` with no backend.

---

## Phase 1 — Hardening & trust (target: Q3 2026)

Goal: remove the sharpest edges documented in SECURITY.md so a real pilot is
defensible. Each item below closes a numbered SECURITY.md limitation.

### Contracts

| Item | Closes | Notes |
|---|---|---|
| Verifiable randomness for `RANDOM_ORDER` | §1 | Chainlink VRF where available; fall back to commit-reveal among members on Arc (prevrandao is 0 there). Keep blockhash as documented default until then. |
| Multi-round collateral option | §2 | `collateralBps` today covers one contribution; add an organizer-selectable multiplier so repeat defaults can't produce shortfalls. |
| Keeper incentive for `settleRound()` | §3 | Small caller bounty from slashed collateral/dust so third-party keepers settle late rounds; evaluate Gelato/Chainlink Automation on Arc. |
| Reputation sybil resistance | §8 | Token allowlist for score-eligible circles, minimum round duration, and stake/time-weighted scoring; keep raw history queryable regardless. |
| Permit-based AutoPay approvals | §4 | EIP-2612 exact-amount permits where USDC supports them; surface allowance revocation in the UI on opt-out. |

### App & UX

- Allowance manager: show live AutoPay allowances per circle, one-click revoke (§4).
- "Verify before you join" panel: surface `givingRecipient`, organizer history,
  collateral coverage ratio, and token address on the join screen (§5, §8).
- Settle-bot reference implementation in `scripts/` so any organizer can run a
  keeper for their circles (§3).
- Error-state and empty-state pass across all pages; Lighthouse/perf budget.

### Process

- **External security audit** of `contracts/src` — the gate for everything in
  Phase 3. Scope, fund, and schedule during this phase.
- Static analysis in CI (Slither + `forge` invariant runs on every PR).
- Testnet bug bounty (reputation-denominated to start).

**Exit criteria:** SECURITY.md items 1–4 and 8 have shipped mitigations or explicit
organizer-facing controls; audit engagement signed.

---

## Phase 2 — Reach & pilot readiness (target: Q4 2026)

Goal: everything a supervised Bangladesh pilot needs except mainnet money.

### Localization & markets

- Complete `ur` (Pakistan — kameti) and `hi` (India — chit fund) translations from
  the existing scaffolds; then `es` (Mexico — tanda) and `tl` (Philippines —
  paluwagan). Partial translations ship safely (English fallback).
- Market playbook doc per locale: product naming, giving-label conventions,
  typical circle sizes/durations, local FX display defaults.

### Notifications & agents

- **Telegram bot** (first, dominant in BD diaspora): deadline reminders, settle
  alerts, pot-won notifications via a stateless bot reading chain events — no
  user-fund custody, opt-in per address.
- WhatsApp Business API evaluation (cost/approval timeline) — decision, not
  necessarily delivery, in this phase.
- Organizer digest: weekly circle-health summary (contributions, defaults, cures).

### Funding UX

- **Arc App Kit Unified Balance / Bridge deposits**: chain-abstracted funding so
  members can fund from USDC on other chains without manual bridging.
- Fiat on-ramp research spike per corridor (bKash/Nagad for BD, UPI for IN,
  GCash for PH): integration cost, licensing exposure, custody model. Output is a
  written go/no-go per corridor, not code.

### Reputation

- **Soul-bound Credit Passport token** (non-transferable ERC-721 mirror of the
  registry score) so third parties can gate on it without reading Rota contracts.
- Passport API-less embed: signed, self-verifying passport snapshot for sharing
  outside the app.

**Exit criteria:** 4+ complete locales, Telegram reminders live, unified-balance
deposits working on testnet, on-ramp go/no-go memo per beachhead corridor.

---

## Phase 3 — Mainnet & regulated pilot (target: H1 2027, gated)

This phase is **gated, not scheduled**: it starts only when both gates pass.

- **Gate A — Audit:** external audit complete, all criticals/highs remediated and
  re-reviewed; SECURITY.md updated to reflect the audited commit.
- **Gate B — Legal:** per-market regulatory review (Bangladesh first: deposit-taking
  and cooperative-society rules; money-transmission analysis for diaspora
  corridors). Written opinion on the operating model — protocol-only vs. licensed
  operator vs. partner-fronted.

Then:

1. **Arc mainnet deployment** behind a feature flag; testnet remains the default
   environment until the pilot cohort is onboarded.
2. **Closed pilot**: 5–10 invite-only circles with a partner organizer
   (diaspora community org or MFI), small amounts, weekly review of defaults,
   settlement latency, and support load.
3. **Incident playbook**: pause-equivalent procedures (Rota has no admin pause by
   design — document what "response" means: comms, UI kill-switch, keeper halt),
   USDC-blacklist handling drill, key-management policy for the deployer.
4. Pilot report → go/no-go for open mainnet access per market.

**Exit criteria:** pilot cohort completes ≥ 2 full circle cycles with zero
escrow-loss incidents; support and settlement metrics within targets.

---

## Phase 4 — Scale (2027+, exploratory)

Sequenced by pilot learnings; nothing here is committed.

- **Fiat ramps in-product** for corridors that passed the Phase 2 go/no-go
  (bKash/Nagad, UPI, M-Pesa, GCash) via licensed partners.
- **Protocol keeper network** replacing the reference settle-bot.
- **Emergency micro-advances** against Credit Passport score (research: this is
  lending — heavier regulatory surface, likely partner-underwritten).
- **Mobile app** (React Native reusing hooks/i18n layers) once web PWA limits bite
  in low-end-device markets.
- **AI organizer agent**: circle-setup copilot and multilingual support agent;
  extend the GenLayer curation pattern to organizer tooling.
- **Interop**: passport score as a portable credential (on-chain attestations /
  EAS) consumable by third-party lenders.

---

## Cross-cutting workstreams (continuous)

| Workstream | Owner focus | Cadence |
|---|---|---|
| Contract test suite | keep fuzz/invariant coverage ≥ current 74-test bar; add tests with every mitigation | every PR |
| i18n completeness | no hardcoded strings; locale-file lint in CI | every PR |
| Docs honesty | SECURITY.md and README feature matrix updated in the same PR as the change | every PR |
| ABI/app sync | `abi-sync.mjs` stays the only path from contracts to app | every deploy |
| Community | testnet demo circles, organizer feedback loop, issue triage | weekly |

## Success metrics

| Phase | Metric | Target |
|---|---|---|
| 1 | SECURITY.md high-severity items with shipped mitigation | 5 of 5 (§1–4, §8) |
| 1 | Audit engagement | signed |
| 2 | Complete locales | ≥ 4 |
| 2 | Reminder opt-in among active testnet members | ≥ 50% |
| 3 | Pilot circles completing all rounds without shortfall | 100% |
| 3 | Median time from round deadline to settlement | < 1 hour |
| 4 | Markets live | per legal clearance |

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Regulatory block in beachhead market | Medium | High | Gate B before mainnet; partner-fronted operating model as fallback; multiple candidate markets |
| Audit surfaces structural issues | Medium | High | Audit early (Phase 1), before pilot commitments |
| No VRF/keeper infra on Arc | Medium | Medium | Commit-reveal fallback; reference settle-bot + caller bounty |
| Reputation farming undermines passport credibility | High | Medium | Phase 1 sybil work; always expose underlying history for verification |
| USDC blacklisting of a member | Low | Low | Already hardened (`PayoutDeferred`, `flushGiving`) — drill in Phase 3 |
| GenLayer studionet resets | High | Low | News page degrades gracefully; redeploy script documented |
| Fiat-ramp partners require custody | Medium | Medium | Non-custodial principle is non-negotiable; drop corridor rather than custody funds |

## How to change this document

Roadmap changes go through PR review like code. When a phase item ships, move it
to Phase 0's shipped list (or strike it with a link to the PR), and update the
README feature matrix and SECURITY.md in the same PR if the change affects them.
