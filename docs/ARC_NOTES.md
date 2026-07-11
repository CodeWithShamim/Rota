# Arc Chain Notes (researched 2026-07-11 from docs.arc.io)

Source of truth for all chain-specific values used in `app/src/config/chain.ts` and
`contracts/script/config/`. Do not hardcode these values anywhere else.

## Network — Arc Testnet

| Item | Value |
|---|---|
| Chain ID | `5042002` |
| Network name | Arc Testnet |
| RPC (primary) | `https://rpc.testnet.arc.network` |
| RPC (alternates) | `https://rpc.blockdaemon.testnet.arc.network`, `https://rpc.drpc.testnet.arc.network`, `https://rpc.quicknode.testnet.arc.network` |
| WebSocket | `wss://rpc.testnet.arc.network` |
| Block explorer | `https://testnet.arcscan.app` |
| Native currency | USDC (symbol `USDC`, **18 decimals** at the native layer) |
| Faucet | `https://faucet.circle.com` (select Arc Testnet) |
| Finality | Deterministic and instant — a tx is final on inclusion |
| Block time | ~0.5s, 30M gas/block |

Mainnet addresses/config are **not yet published** by Circle.

## Key contract addresses (Arc Testnet)

| Contract | Address | Notes |
|---|---|---|
| **USDC (ERC-20 interface)** | `0x3600000000000000000000000000000000000000` | ERC-20 view over the *native* USDC balance. **6 decimals.** This is the `token` Rota contracts use. |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 decimals |
| Multicall3 | `0xcA11bde05977b3631167028862bE2a173976CA11` | standard address — wagmi/viem batching works |
| CREATE2 Factory | `0x4e59b44847b379578588920cA78FbF26c0B4956C` | standard deterministic deployer — `forge script` works normally |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | future: gasless approvals |
| TokenMessengerV2 (CCTP) | `0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA` | future: cross-chain deposits |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` | future: App Kit Unified Balance |

## Gas & fees

- **Gas is paid in USDC** (the native token). Internally 18 decimals; the ERC-20
  interface truncates to 6. Same underlying balance — a wallet funded from the faucet
  can both pay gas and hold ERC-20 USDC.
- EIP-1559 with EWMA smoothing. Testnet floor **20 gwei**, ceiling 20,000 gwei; a normal
  tx targets ~$0.01. Set `maxFeePerGas ≥ 20 gwei`; a 0–1 gwei priority tip is enough.
- Base fee goes to the block beneficiary, **not burned**.
- Standard EIP-1559 tooling (Foundry, viem) works unmodified. UX guidance from Circle:
  show fees in dollar terms, not gwei.

## EVM differences that matter to Rota

- **`block.prevrandao` always returns `0`** — never use it for randomness. Rota's
  `RANDOM_ORDER` mode uses `blockhash(block.number - 1)` mixed with the circle address
  and member set; documented as manipulable-in-theory, VRF is future work.
- Block timestamps are **non-decreasing** (not strictly increasing). Rota only compares
  `>=` / `>` against stored deadlines, which is safe.
- No blob txs (EIP-4844). CREATE2, EIP-7702 work as on Ethereum.
- Native USDC transfers can revert for blocklisted/zero addresses; Rota only moves the
  **ERC-20** interface via `SafeERC20`, so standard ERC-20 semantics apply.
- ERC-20 `balanceOf` truncates the 18-dec native balance to 6 decimals.

## App Kit (future integration points — out of MVP scope)

- Package: `@circle-fin/app-kit` + `@circle-fin/adapter-viem-v2`.
- **Unified Balance**: chain-abstracted USDC balance — would let a member in Dubai fund
  a Dhaka circle from any chain without manual bridging (docs: `/app-kit/unified-balance`).
- **Bridge** (CCTP v2): programmatic USDC movement across chains (docs: `/app-kit/bridge`).
- Swap / Send also available. All are one-method calls against an adapter.

## Placeholders

None required — every value above was found in the official docs. If mainnet ships,
add its values here first, then to `app/src/config/chain.ts`.
