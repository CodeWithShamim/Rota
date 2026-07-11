/**
 * Maps on-chain failures to i18n keys. Users never see raw revert data: every
 * custom error in RotaCircle/GoalPot/ReputationRegistry has a translation under
 * `errors.*`, with sane fallbacks for wallet-level failures.
 */
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

/** All contract custom error names → i18n keys under `errors.`. */
const KNOWN_ERRORS = new Set([
  // RotaCircle
  "AlreadyInitialized",
  "InvalidParams",
  "WrongPhase",
  "NotMember",
  "AlreadyMember",
  "NotInvited",
  "CircleFull",
  "CircleNotFull",
  "AlreadyContributed",
  "RoundClosed",
  "NotOptedIn",
  "NotInBidWindow",
  "BidTooLow",
  "BidTooHigh",
  "NotEligibleToBid",
  "TooEarlyToSettle",
  "NothingToWithdraw",
  "NotInDefault",
  "NotOrganizer",
  "OpenDeadlineNotReached",
  // GoalPot
  "PotLocked",
  "PotUnlocked",
  "PotFull",
  "BelowMinContribution",
  "CannotUnlockYet",
  // ERC20 (OpenZeppelin v5)
  "ERC20InsufficientBalance",
  "ERC20InsufficientAllowance",
]);

/** Returns an i18n key describing the failure. */
export function errorToI18nKey(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return "errors.UserRejected";
    }
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && KNOWN_ERRORS.has(name)) return `errors.${name}`;
      return "errors.ContractReverted";
    }
    if (error.shortMessage?.toLowerCase().includes("insufficient funds")) {
      return "errors.InsufficientGas";
    }
  }
  return "errors.Unknown";
}
