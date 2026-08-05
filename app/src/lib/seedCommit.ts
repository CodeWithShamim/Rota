/**
 * RANDOM_ORDER commit–reveal secrets.
 *
 * The organizer commits `keccak256(secret)` when the circle is created — before
 * anyone has joined, so the permutation cannot be aimed — and reveals `secret`
 * to activate. That means the secret has to survive between two transactions
 * that can be days apart, so it is kept in localStorage keyed by the deployed
 * circle address (resolved from the creation receipt, not from a factory read).
 *
 * Losing it is not fatal: RotaCircle.activate() falls back to join order once
 * REVEAL_WINDOW has elapsed, so a circle can never be stuck. It does mean the
 * shuffle is skipped, which is why Create.tsx also shows the secret for the
 * organizer to save if they plan to activate from another device.
 */
import { keccak256, type Address, type Hex } from "viem";
import { deployments } from "../config/chain";

const PREFIX = `rota.seedSecret.${deployments.chainId}.`;

/** A fresh 32-byte secret from the platform CSPRNG. */
export function generateSeedSecret(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The on-chain commitment for `secret`.
 *
 * The contract checks `keccak256(abi.encode(secret)) == seedCommit`. For a lone
 * bytes32, abi.encode is the identity (32 bytes, already word-aligned), so
 * hashing the value directly matches it exactly.
 */
export function seedCommitment(secret: Hex): Hex {
  return keccak256(secret);
}

export function storeSeedSecret(circle: Address, secret: Hex): void {
  try {
    localStorage.setItem(PREFIX + circle.toLowerCase(), secret);
  } catch {
    // storage unavailable — the organizer can still use the saved copy shown
    // at creation, or let the circle fall back to join order
  }
}

export function readSeedSecret(circle: Address): Hex | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + circle.toLowerCase());
    return raw && /^0x[0-9a-fA-F]{64}$/.test(raw) ? (raw as Hex) : undefined;
  } catch {
    return undefined;
  }
}
