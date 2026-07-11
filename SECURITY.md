# Security Notes — read before trusting Rota with anything

Rota is an MVP running on **Arc testnet only**. It has not been audited. This file
honestly lists the known limitations and design trade-offs.

## Smart-contract limitations

### 1. Pseudo-randomness is validator-manipulable
`RANDOM_ORDER` derives the payout permutation from
`keccak256(blockhash(block.number-1), address(this), members)` at activation.
A block producer could grind blockhashes to bias the order. Note that on Arc,
`block.prevrandao` **always returns 0** (see docs/ARC_NOTES.md), so blockhash is the
only in-protocol entropy available. Impact is bounded — the order only changes *when*
a member is paid, never *whether* — but for adversarial settings this needs Chainlink
VRF or similar (future work).

### 2. Collateral can under-cover defaults
Collateral is `collateralBps` of **one** contribution. A member who defaults in more
rounds than their collateral covers produces a *shortfall*: that round's recipient
receives a smaller pot. The shortfall is only made whole if the defaulter later calls
`cureDefault()`. Organizers should choose `collateralBps` (up to 100%) with this in
mind; multi-round collateral is future work.

### 3. Late settlement can eat into the next round
Rounds are schedule-anchored. If nobody calls `settleRound()` long after a deadline,
the next round's contribution (and bid) window may be partially or fully elapsed when
it opens, potentially causing cascading defaults. Any member, keeper, or bot can
settle — the UI surfaces "settle available" prominently — but there is no protocol-run
keeper yet.

### 4. AutoPay allowance UX risks
AutoPay is non-custodial and bounded: the contract can pull only the exact
`contributionAmount`, once per round, only while the member is opted in and the round
is open. However the *ERC-20 allowance* backing it is a standard approval: if the user
approves "unlimited" and the circle contract were somehow compromised, the allowance
is exposed. Rota defaults to exact-amount approvals and treats unlimited approval as
an advanced option. Opting out does not revoke the ERC-20 allowance — revoke it in
your wallet if desired.

### 5. Organizer powers
The organizer controls the allowlist of invite-only circles/pots and may cancel an
unfilled circle early. They have **no** access to escrowed funds. `givingRecipient`
is fixed at creation — verify it before joining a circle with a giving cut.

### 6. Dust
Bid-discount division dust goes to the round's recipient; fallback-distribution and
final-round dust (micro-USDC scale) can remain in the contract permanently. GoalPot
haircut shares round down against the unlock snapshot, so a few micro-USDC may remain
there too.

### 7. Token assumptions
Contracts assume a standard, non-fee-on-transfer, non-rebasing 6-decimal ERC-20
(USDC). Arc's USDC ERC-20 interface satisfies this. Do not deploy circles over exotic
tokens.

## Frontend limitations

- **FX rates are indicative.** Local-currency figures come from a free client-side
  API, cached up to 12 h, and are never used in on-chain math. The exact USDC amount
  is always shown before signing.
- **Invite links are not access control.** Anyone with the link can join a
  non-invite-only circle; use invite-only + allowlist for closed groups.
- The "verify ownership" badge on the Credit Passport is a client-side signature
  check for in-person/screen-share verification, not a server-attested claim.

## Regulatory

Rota has **no KYC/AML layer and no licensing**. Pooled-savings and rotating-credit
products are regulated financial activity in many jurisdictions (e.g. chit funds are
licensed in India; deposit-taking rules may apply in Bangladesh, the UK, and the US;
money-transmission rules may apply to cross-border circles). **This project must stay
on testnet until reviewed per target market.** Nothing here is an offer of financial
services.

## Reporting

This is a demo codebase; open an issue in the repository for any vulnerability found.
