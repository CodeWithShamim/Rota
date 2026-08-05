// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title GoalPot — non-rotating group savings toward a shared target
/// @notice Friends/family deposit USDC toward a common goal (festival, wedding,
///         tuition, land). Funds lock until the target amount is reached or the
///         deadline passes; then every member withdraws exactly what they deposited
///         (no pooling of principal), plus a pro-rata share of any early-exit
///         haircuts. An optional giving cut is taken from each final withdrawal.
/// @dev    Deployed as an EIP-1167 clone by RotaFactory. Members join implicitly on
///         first deposit. All amounts in token units (USDC, 6 decimals).
/// @author Rota (https://github.com/codewithshamim/rota)
contract GoalPot is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    enum Phase {
        LOCKED,
        UNLOCKED
    }

    /// @notice Creation-time configuration, passed by the factory.
    struct PotParams {
        address token; // USDC
        uint256 targetAmount; // shared savings goal (6 decimals)
        uint256 deadline; // unlock timestamp if target not reached first
        uint256 memberCap; // max distinct depositors (0 = unlimited)
        uint256 minContribution; // optional per-deposit minimum (0 = none)
        uint256 earlyExitHaircutBps; // % kept from an early exit, shared with stayers
        uint256 givingBps; // 0–500; % of each final withdrawal to givingRecipient
        address givingRecipient;
        bool inviteOnly;
        string name;
    }

    // ------------------------------------------------------------ constants

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_GIVING_BPS = 500; // 5%
    uint256 public constant MAX_HAIRCUT_BPS = 1_000; // 10%
    /// @notice Gas forwarded to a best-effort giving-cut transfer — see {_tryTransfer}.
    uint256 public constant PAYOUT_GAS = 250_000;
    /// @notice Upper bound on how far ahead the unlock deadline may sit, so deposits
    ///         can never be locked past a bounded horizon if the target is not met.
    uint256 public constant MAX_DURATION = 365 days;
    /// @notice Max addresses per {setAllowlist} call, so a caller-supplied array can
    ///         never push the transaction past the block gas limit.
    uint256 public constant MAX_ALLOWLIST_BATCH = 100;

    // ---------------------------------------------------------------- state

    /// @notice The RotaFactory that deployed this clone.
    address public factory;
    /// @notice The ERC-20 all deposits and withdrawals are denominated in (USDC).
    IERC20 public token;
    /// @notice Registry this pot reports deposits, completions and exits to.
    IReputationRegistry public reputationRegistry;
    /// @notice Pot creator; auto-allowlisted and controls the allowlist.
    address public organizer;
    /// @notice Human-readable pot name chosen at creation.
    string public name;

    /// @notice Lifecycle stage: LOCKED or UNLOCKED.
    Phase public phase;
    /// @notice Shared savings goal; reaching it unlocks the pot.
    uint256 public targetAmount;
    /// @notice Timestamp that unlocks the pot if the target was never reached.
    uint256 public deadline;
    /// @notice Maximum distinct depositors; 0 means unlimited.
    uint256 public memberCap;
    /// @notice Smallest accepted single deposit; 0 means no minimum.
    uint256 public minContribution;
    /// @notice Share of principal forfeited on an early exit, in bps (max 1000).
    uint256 public earlyExitHaircutBps;
    /// @notice Share of each final withdrawal routed to `givingRecipient`, in bps (max 500).
    uint256 public givingBps;
    /// @notice Address receiving the giving cut; zero when giving is disabled.
    address public givingRecipient;
    /// @notice Whether depositing requires being on the organizer's allowlist.
    bool public inviteOnly;

    /// @notice Distinct depositors in the order they first deposited.
    address[] public members;
    /// @notice Whether an address has deposited into this pot.
    mapping(address account => bool joined) public isMember;
    /// @notice Whether an address may deposit into an invite-only pot.
    mapping(address account => bool allowed) public allowlist;
    /// @notice Principal currently held for a member.
    mapping(address member => uint256 principal) public deposited;

    /// @notice Total principal currently held for members (excludes haircut pool).
    uint256 public totalDeposited;
    /// @notice Haircuts collected from early exits, shared pro-rata at unlock.
    uint256 public totalHaircut;
    /// @notice totalDeposited snapshot at unlock — denominator for haircut shares.
    uint256 public unlockTotal;
    /// @notice True if the target was reached (drives completion reputation).
    bool public targetReached;
    /// @notice Giving cuts that could not be transferred (e.g. recipient blocked by
    ///         the token); anyone may retry the payout via {flushGiving}.
    uint256 public pendingGiving;

    // --------------------------------------------------------------- errors

    error InvalidParams();
    error PotLocked();
    error PotUnlocked();
    error NotInvited();
    error PotFull();
    error BelowMinContribution();
    error NothingToWithdraw();
    error NotOrganizer();
    error CannotUnlockYet();

    // --------------------------------------------------------------- events

    event Deposited(address indexed member, uint256 amount, uint256 totalDeposited);
    event Unlocked(uint256 indexed totalDeposited, bool targetReached);
    event Withdrawn(address indexed member, uint256 principal, uint256 bonus, uint256 givingCut);
    event EarlyExit(address indexed member, uint256 returned, uint256 haircut);
    event GivingPaid(address indexed recipient, uint256 amount);
    event GivingDeferred(uint256 indexed amount);
    event AllowlistUpdated(address indexed account, bool allowed);

    // ---------------------------------------------------------- initializer

    /// @notice Deploy the GoalPot logic contract.
    /// @dev Lock the implementation contract so it can never be initialized
    ///      directly. Clones get fresh storage and are initialized by the factory
    ///      in the same transaction that deploys them.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize a freshly deployed clone. Called once by the factory.
    /// @param p Pot configuration.
    /// @param organizer_ The pot creator (auto-allowlisted).
    /// @param registry_ ReputationRegistry address.
    /// @dev The `initializer` modifier is the access control here — see
    ///      RotaCircle.initialize for the full rationale.
    function initialize(PotParams calldata p, address organizer_, address registry_)
        external
        initializer
    {
        if (
            p.token == address(0) || organizer_ == address(0) || registry_ == address(0) || p.targetAmount == 0
                || p.deadline <= block.timestamp || p.deadline > block.timestamp + MAX_DURATION
                || p.givingBps > MAX_GIVING_BPS
                || (p.givingBps > 0 && p.givingRecipient == address(0)) || p.earlyExitHaircutBps > MAX_HAIRCUT_BPS
        ) revert InvalidParams();

        factory = msg.sender;
        token = IERC20(p.token);
        reputationRegistry = IReputationRegistry(registry_);
        organizer = organizer_;
        name = p.name;
        targetAmount = p.targetAmount;
        deadline = p.deadline;
        memberCap = p.memberCap;
        minContribution = p.minContribution;
        earlyExitHaircutBps = p.earlyExitHaircutBps;
        givingBps = p.givingBps;
        givingRecipient = p.givingRecipient;
        inviteOnly = p.inviteOnly;
        allowlist[organizer_] = true;
    }

    // -------------------------------------------------------------- actions

    /// @notice Deposit toward the goal. First deposit joins you as a member.
    ///         Requires prior ERC-20 approval. Rejected once the pot is unlocked.
    /// @param amount USDC amount (6 decimals), ≥ minContribution if set.
    /// @dev Requires prior ERC-20 approval for `amount`.
    function deposit(uint256 amount) external nonReentrant {
        if (phase != Phase.LOCKED || _unlockable()) revert PotUnlocked();
        if (amount == 0 || amount < minContribution) revert BelowMinContribution();

        bool joining = !isMember[msg.sender];
        if (joining) {
            if (inviteOnly && !allowlist[msg.sender]) revert NotInvited();
            if (memberCap != 0 && members.length >= memberCap) revert PotFull();
            members.push(msg.sender);
            isMember[msg.sender] = true;
        }

        deposited[msg.sender] += amount;
        totalDeposited += amount;
        emit Deposited(msg.sender, amount, totalDeposited);

        // Interactions last (checks-effects-interactions). Reputation is credited
        // once per member per pot: per-deposit credit would let anyone farm the
        // score with unlimited dust deposits.
        if (joining) reputationRegistry.recordContribution(msg.sender);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Flip the pot to UNLOCKED once the target is reached or the deadline
    ///         has passed. Callable by anyone; {withdraw} also triggers it lazily.
    /// @dev Idempotent by revert: a second call fails with PotUnlocked.
    function unlock() public {
        if (phase != Phase.LOCKED) revert PotUnlocked();
        if (!_unlockable()) revert CannotUnlockYet();
        phase = Phase.UNLOCKED;
        unlockTotal = totalDeposited;
        targetReached = totalDeposited >= targetAmount;
        emit Unlocked(totalDeposited, targetReached);
    }

    /// @notice After unlock: withdraw your full principal plus your pro-rata share of
    ///         early-exit haircuts, minus the optional giving cut.
    /// @dev Unlocks lazily, so members never need a separate unlock() call.
    function withdraw() external nonReentrant {
        if (phase == Phase.LOCKED) {
            if (!_unlockable()) revert PotLocked();
            unlock();
        }
        uint256 principal = deposited[msg.sender];
        if (principal == 0) revert NothingToWithdraw();

        // pro-rata share of the haircut pool, snapshot denominator (dust stays)
        uint256 bonus = unlockTotal == 0 ? 0 : (totalHaircut * principal) / unlockTotal;
        uint256 gross = principal + bonus;
        uint256 givingCut = (gross * givingBps) / BPS;

        deposited[msg.sender] = 0;
        totalDeposited -= principal;
        emit Withdrawn(msg.sender, principal, bonus, givingCut);

        // Interactions last (checks-effects-interactions).
        if (targetReached) reputationRegistry.recordCompletion(msg.sender);
        if (givingCut > 0) {
            // never let an unpayable giving recipient (e.g. USDC-blacklisted) block
            // every member's withdrawal: defer the cut and let anyone retry later
            if (_tryTransfer(givingRecipient, givingCut)) {
                emit GivingPaid(givingRecipient, givingCut);
            } else {
                pendingGiving += givingCut;
                emit GivingDeferred(givingCut);
            }
        }
        token.safeTransfer(msg.sender, gross - givingCut);
    }

    /// @notice Retry paying out deferred giving cuts. Callable by anyone.
    /// @dev Permissionless so a deferred cut is never stranded.
    function flushGiving() external nonReentrant {
        uint256 amount = pendingGiving;
        if (amount == 0) revert NothingToWithdraw();
        pendingGiving = 0;
        emit GivingPaid(givingRecipient, amount);
        token.safeTransfer(givingRecipient, amount);
    }

    /// @notice Exit before unlock, forfeiting `earlyExitHaircutBps` of your balance
    ///         to the members who stay. Recorded as a (mild) reputation penalty.
    ///         Unavailable once the pot is unlockable — use {withdraw} instead (this
    ///         also prevents dodging the giving cut once the goal is effectively met).
    /// @dev The haircut pool is only ever paid out by {withdraw}, pro-rata against
    ///      `unlockTotal`. If every depositor exits early, `unlockTotal` is 0 at
    ///      unlock and the pool would be stranded in the contract forever. So when
    ///      an exit empties the pot there is no stayer left to compensate: take no
    ///      haircut, and hand the pool accumulated from earlier exits to the last
    ///      member standing — which is exactly who the pool is for.
    function emergencyWithdraw() external nonReentrant {
        if (phase != Phase.LOCKED || _unlockable()) revert PotUnlocked();
        uint256 principal = deposited[msg.sender];
        if (principal == 0) revert NothingToWithdraw();

        bool lastOut = principal == totalDeposited;
        uint256 haircut = lastOut ? 0 : (principal * earlyExitHaircutBps) / BPS;
        uint256 payout = principal - haircut;

        deposited[msg.sender] = 0;
        totalDeposited -= principal;
        if (lastOut) {
            payout += totalHaircut;
            totalHaircut = 0;
        } else {
            totalHaircut += haircut;
        }

        reputationRegistry.recordEarlyExit(msg.sender);
        emit EarlyExit(msg.sender, payout, haircut);
        token.safeTransfer(msg.sender, payout);
    }

    /// @notice Add/remove invitees (organizer only, while locked).
    /// @param accounts Addresses to update.
    /// @param allowed Whether they may join.
    /// @dev Only meaningful while inviteOnly is set; harmless otherwise.
    function setAllowlist(address[] calldata accounts, bool allowed) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (phase != Phase.LOCKED) revert PotUnlocked();
        uint256 len = accounts.length;
        // caller-supplied array: bound it so one call cannot exceed the block gas limit
        if (len == 0 || len > MAX_ALLOWLIST_BATCH) revert InvalidParams();
        for (uint256 i; i < len; ++i) {
            allowlist[accounts[i]] = allowed;
            emit AllowlistUpdated(accounts[i], allowed);
        }
    }

    // ---------------------------------------------------------------- views

    /// @notice Whether the unlock condition (target reached OR deadline passed) holds.
    /// @dev True once unlocked, or once the condition holds while still locked.
    function unlockable() external view returns (bool) {
        return phase == Phase.UNLOCKED || _unlockable();
    }

    /// @notice Progress toward the target in bps (10000 = 100%; caps at 10000).
    /// @dev Caps at 10_000 so overfunded pots do not report above 100%.
    function progressBps() external view returns (uint256) {
        uint256 p = (totalDeposited * BPS) / targetAmount;
        return p > BPS ? BPS : p;
    }

    /// @notice Every depositor, in first-deposit order.
    /// @dev Length is bounded by memberCap unless it is zero (unlimited).
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    /// @notice How many distinct addresses have deposited.
    /// @dev Cheaper than getMembers() when only the count is needed.
    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // ------------------------------------------------------------ internals

    /// @notice Whether the unlock condition currently holds.
    function _unlockable() internal view returns (bool) {
        return totalDeposited >= targetAmount || block.timestamp > deadline;
    }

    /// @notice Attempt an ERC-20 transfer without reverting on failure.
    /// @dev Best-effort ERC-20 transfer that reports failure instead of reverting.
    ///      Caps BOTH forwarded gas and returndata copied, so a hostile token can
    ///      neither burn the caller's gas budget nor return a multi-megabyte blob
    ///      to charge them for the memory expansion — either would brick every
    ///      member's withdrawal. See RotaCircle._tryTransfer for the full rationale.
    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        bytes memory payload = abi.encodeCall(IERC20.transfer, (to, amount));
        address t = address(token);
        uint256 gasCap = PAYOUT_GAS;
        bool called;
        uint256 size;
        uint256 word;
        /// @dev Memory-safe: writes only to the 0x00-0x20 scratch space, and
///      caps the returndata copy at one word (see the doc comment above).
        assembly ("memory-safe") {
            called := call(gasCap, t, 0, add(payload, 0x20), mload(payload), 0x00, 0x20)
            size := returndatasize()
            word := mload(0x00)
        }
        if (!called) return false;
        // pre-EIP-20 tokens (USDT-style) return nothing on success
        if (size == 0) return t.code.length > 0;
        return size >= 32 && word != 0;
    }
}
