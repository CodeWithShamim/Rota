// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title GoalPot — non-rotating group savings toward a shared target
/// @notice Friends/family deposit USDC toward a common goal (festival, wedding,
///         tuition, land). Funds lock until the target amount is reached or the
///         deadline passes; then every member withdraws exactly what they deposited
///         (no pooling of principal), plus a pro-rata share of any early-exit
///         haircuts. An optional giving cut is taken from each final withdrawal.
/// @dev    Deployed as an EIP-1167 clone by RotaFactory. Members join implicitly on
///         first deposit. All amounts in token units (USDC, 6 decimals).
contract GoalPot is ReentrancyGuard {
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

    // ---------------------------------------------------------------- state

    address public factory;
    IERC20 public token;
    IReputationRegistry public reputationRegistry;
    address public organizer;
    string public name;

    Phase public phase;
    uint256 public targetAmount;
    uint256 public deadline;
    uint256 public memberCap;
    uint256 public minContribution;
    uint256 public earlyExitHaircutBps;
    uint256 public givingBps;
    address public givingRecipient;
    bool public inviteOnly;

    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => bool) public allowlist;
    mapping(address => uint256) public deposited;

    /// @notice Total principal currently held for members (excludes haircut pool).
    uint256 public totalDeposited;
    /// @notice Haircuts collected from early exits, shared pro-rata at unlock.
    uint256 public totalHaircut;
    /// @notice totalDeposited snapshot at unlock — denominator for haircut shares.
    uint256 public unlockTotal;
    /// @notice True if the target was reached (drives completion reputation).
    bool public targetReached;

    bool private _initialized;

    // --------------------------------------------------------------- errors

    error AlreadyInitialized();
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
    event Unlocked(uint256 totalDeposited, bool targetReached);
    event Withdrawn(address indexed member, uint256 principal, uint256 bonus, uint256 givingCut);
    event EarlyExit(address indexed member, uint256 returned, uint256 haircut);
    event GivingPaid(address indexed recipient, uint256 amount);
    event AllowlistUpdated(address indexed account, bool allowed);

    // ---------------------------------------------------------- initializer

    /// @notice Initialize a freshly deployed clone. Called once by the factory.
    /// @param p Pot configuration.
    /// @param organizer_ The pot creator (auto-allowlisted).
    /// @param registry_ ReputationRegistry address.
    function initialize(PotParams calldata p, address organizer_, address registry_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        if (
            p.token == address(0) || organizer_ == address(0) || registry_ == address(0) || p.targetAmount == 0
                || p.deadline <= block.timestamp || p.givingBps > MAX_GIVING_BPS
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
    function deposit(uint256 amount) external nonReentrant {
        if (phase != Phase.LOCKED || _unlockable()) revert PotUnlocked();
        if (amount == 0 || amount < minContribution) revert BelowMinContribution();

        if (!isMember[msg.sender]) {
            if (inviteOnly && !allowlist[msg.sender]) revert NotInvited();
            if (memberCap != 0 && members.length >= memberCap) revert PotFull();
            members.push(msg.sender);
            isMember[msg.sender] = true;
        }

        deposited[msg.sender] += amount;
        totalDeposited += amount;
        reputationRegistry.recordContribution(msg.sender);
        emit Deposited(msg.sender, amount, totalDeposited);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Flip the pot to UNLOCKED once the target is reached or the deadline
    ///         has passed. Callable by anyone; {withdraw} also triggers it lazily.
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
        if (targetReached) reputationRegistry.recordCompletion(msg.sender);
        emit Withdrawn(msg.sender, principal, bonus, givingCut);

        if (givingCut > 0) {
            emit GivingPaid(givingRecipient, givingCut);
            token.safeTransfer(givingRecipient, givingCut);
        }
        token.safeTransfer(msg.sender, gross - givingCut);
    }

    /// @notice Exit before unlock, forfeiting `earlyExitHaircutBps` of your balance
    ///         to the members who stay. Recorded as a (mild) reputation penalty.
    function emergencyWithdraw() external nonReentrant {
        if (phase != Phase.LOCKED) revert PotUnlocked();
        uint256 principal = deposited[msg.sender];
        if (principal == 0) revert NothingToWithdraw();

        uint256 haircut = (principal * earlyExitHaircutBps) / BPS;
        deposited[msg.sender] = 0;
        totalDeposited -= principal;
        totalHaircut += haircut;

        reputationRegistry.recordEarlyExit(msg.sender);
        emit EarlyExit(msg.sender, principal - haircut, haircut);
        token.safeTransfer(msg.sender, principal - haircut);
    }

    /// @notice Add/remove invitees (organizer only, while locked).
    /// @param accounts Addresses to update.
    /// @param allowed Whether they may join.
    function setAllowlist(address[] calldata accounts, bool allowed) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (phase != Phase.LOCKED) revert PotUnlocked();
        for (uint256 i; i < accounts.length; ++i) {
            allowlist[accounts[i]] = allowed;
            emit AllowlistUpdated(accounts[i], allowed);
        }
    }

    // ---------------------------------------------------------------- views

    /// @notice Whether the unlock condition (target reached OR deadline passed) holds.
    function unlockable() external view returns (bool) {
        return phase == Phase.UNLOCKED || _unlockable();
    }

    /// @notice Progress toward the target in bps (10000 = 100%; caps at 10000).
    function progressBps() external view returns (uint256) {
        uint256 p = (totalDeposited * BPS) / targetAmount;
        return p > BPS ? BPS : p;
    }

    function getMembers() external view returns (address[] memory) {
        return members;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // ------------------------------------------------------------ internals

    function _unlockable() internal view returns (bool) {
        return totalDeposited >= targetAmount || block.timestamp > deadline;
    }
}
