// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title RotaCircle — rotating savings & credit circle (ROSCA / chit fund)
/// @notice N members each contribute a fixed USDC amount per round; every round one
///         member receives the whole pot. Modes:
///         - FIXED_ORDER: payout order = join order.
///         - RANDOM_ORDER: order drawn from a blockhash-seeded shuffle at activation.
///         - BID: each round, members who have not yet won bid a discount (bps) to
///           take the pot early; the discount is redistributed to all members as a
///           dividend (chit-fund style price of liquidity).
///         Collateral (a % of one contribution) is escrowed on join and slashed to
///         cover missed contributions. An optional "giving round" routes a % of each
///         pot to a charity address. Deployed as an EIP-1167 clone by RotaFactory.
/// @dev    All amounts are in the circle's token units (USDC, 6 decimals). Funds only
///         ever leave via pull-pattern withdrawals or the settle payout; state changes
///         always precede transfers (checks-effects-interactions) and fund-moving
///         entry points are nonReentrant.
/// @author Rota (https://github.com/codewithshamim/rota)
contract RotaCircle is Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- types

    enum Mode {
        FIXED_ORDER,
        RANDOM_ORDER,
        BID
    }

    enum Phase {
        OPEN,
        ACTIVE,
        COMPLETED,
        CANCELLED
    }

    /// @notice Creation-time configuration, passed by the factory.
    struct CircleParams {
        address token; // USDC
        uint256 contributionAmount; // per member, per round (6 decimals)
        uint256 memberCap; // N, 3–20; also the number of rounds
        uint256 roundDuration; // seconds per round
        Mode mode;
        uint256 collateralBps; // collateral = contributionAmount * collateralBps / 10000
        uint256 givingBps; // 0–500; % of each pot sent to givingRecipient
        address givingRecipient;
        uint256 bidWindowBps; // BID: first X bps of each round accept bids
        uint256 maxDiscountBps; // BID: cap on bid discount, ≤ 3000
        uint256 openDeadline; // timestamp by which the circle must fill or be cancellable
        bool inviteOnly; // restrict join() to the organizer's allowlist
        bytes32 seedCommit; // RANDOM_ORDER: keccak256(abi.encode(secret)) — see activateWithSeed
        string name;
    }

    struct BestBid {
        address bidder;
        uint16 discountBps;
        bool exists;
    }

    // ------------------------------------------------------------ constants

    uint256 public constant BPS = 10_000;
    uint256 public constant MIN_MEMBERS = 3;
    uint256 public constant MAX_MEMBERS = 20;
    uint256 public constant MAX_GIVING_BPS = 500; // 5%
    uint256 public constant MAX_DISCOUNT_LIMIT = 3_000; // 30%
    uint256 public constant CURE_PENALTY_BPS = 500; // 5% penalty on arrears when curing
    /// @notice How long the organizer has to reveal the RANDOM_ORDER seed after the
    ///         circle fills, before anyone may activate on join order instead.
    uint256 public constant REVEAL_WINDOW = 1 days;
    /// @notice Gas forwarded to a best-effort payout transfer — see {_payOrCredit}.
    uint256 public constant PAYOUT_GAS = 250_000;
    /// @notice Upper bound on a round's length. Without it an organizer could set a
    ///         duration so large that `startTime + (r + 1) * roundDuration` overflows
    ///         — settleRound would then revert forever and escrowed funds would be
    ///         stranded — or simply push every deadline past any human timescale.
    uint256 public constant MAX_ROUND_DURATION = 365 days;
    /// @notice Upper bound on how far ahead `openDeadline` may sit, so a circle that
    ///         never fills always becomes cancellable within a bounded time.
    uint256 public constant MAX_OPEN_WINDOW = 365 days;
    /// @notice Max addresses per {setAllowlist} call, so a caller-supplied array can
    ///         never push the transaction past the block gas limit.
    uint256 public constant MAX_ALLOWLIST_BATCH = 100;

    // ---------------------------------------------------------------- state

    /// @notice The RotaFactory that deployed this clone.
    address public factory;
    /// @notice The ERC-20 all contributions, collateral and payouts are denominated in (USDC).
    IERC20 public token;
    /// @notice Registry this circle reports contributions, defaults and completions to.
    IReputationRegistry public reputationRegistry;
    /// @notice Circle creator; auto-joined as member #0 and controls the allowlist.
    address public organizer;
    /// @notice Human-readable circle name chosen at creation.
    string public name;

    /// @notice Payout selection strategy: FIXED_ORDER, RANDOM_ORDER or BID.
    Mode public mode;
    /// @notice Lifecycle stage: OPEN, ACTIVE, COMPLETED or CANCELLED.
    Phase public phase;
    /// @notice Amount each member owes per round, in token units.
    uint256 public contributionAmount;
    /// @notice Target member count; also the total number of rounds.
    uint256 public memberCap;
    /// @notice Length of one round in seconds.
    uint256 public roundDuration;
    /// @notice Collateral escrowed on join, in bps of one contribution.
    uint256 public collateralBps;
    /// @notice Share of each pot routed to `givingRecipient`, in bps (max 500).
    uint256 public givingBps;
    /// @notice Address receiving the giving cut; zero when giving is disabled.
    address public givingRecipient;
    /// @notice BID mode: share of each round that accepts bids, in bps.
    uint256 public bidWindowBps;
    /// @notice BID mode: largest discount a bid may offer, in bps (max 3000).
    uint256 public maxDiscountBps;
    /// @notice Timestamp after which an unfilled circle may be cancelled by anyone.
    uint256 public openDeadline;
    /// @notice Whether joining requires being on the organizer's allowlist.
    bool public inviteOnly;

    /// @notice Members in join order; member #0 is the organizer.
    address[] public members;
    /// @notice Whether an address has joined this circle.
    mapping(address account => bool joined) public isMember;
    /// @notice Whether an address may join an invite-only circle.
    mapping(address account => bool allowed) public allowlist;

    uint256 public startTime; // set at activation
    uint256 public currentRound; // 0-indexed; == memberCap when completed
    address[] public payoutOrder; // FIXED_ORDER / RANDOM_ORDER only

    /// @notice RANDOM_ORDER commitment: keccak256(abi.encode(secret)), fixed at
    ///         creation before any member (and therefore any permutation) is known.
    bytes32 public seedCommit;
    /// @notice Timestamp the circle filled; anchors the reveal window. 0 until full.
    uint256 public fullAt;
    /// @notice Block the circle filled; supplies the validator-side half of the seed.
    uint256 public fullBlock;

    /// @notice Whether a member has paid their contribution for a given round.
    mapping(uint256 round => mapping(address member => bool paid)) public hasContributed;
    /// @notice How many members have contributed in a given round.
    mapping(uint256 round => uint256 paidCount) public roundContributionCount;
    /// @notice Highest discount bid recorded for a given round (BID mode).
    mapping(uint256 round => BestBid bid) public bestBid;
    /// @notice Whether a member has already received a pot.
    mapping(address member => bool won) public hasWon;
    /// @notice Whether a member allows anyone to pull their contribution each round.
    mapping(address member => bool optedIn) public autoPayOptIn;
    /// @notice Withdrawable balance: bid dividends plus any deferred payout.
    mapping(address payee => uint256 amount) public dividendBalance;
    /// @notice Collateral still escrowed for a member, net of slashing.
    mapping(address member => uint256 amount) public collateralBalance;

    /// @notice Whether a member has missed a round and not yet cured.
    mapping(address member => bool defaulted) public inDefault;
    /// @notice Collateral slashed from a member to cover their missed rounds;
    ///         repaid on cure, restoring collateralBalance.
    mapping(address member => uint256 amount) public slashedAmount;
    /// @notice Missed contribution value NOT covered by collateral; repaid on cure
    ///         into penaltyCarry (next pot).
    mapping(address member => uint256 amount) public shortfallAmount;
    /// @notice Cure penalties/shortfalls (and rounding dust) rolled into the next pot.
    uint256 public penaltyCarry;

    // --------------------------------------------------------------- errors

    error InvalidParams();
    error WrongPhase();
    error NotMember();
    error AlreadyMember();
    error NotInvited();
    error CircleFull();
    error CircleNotFull();
    error AlreadyContributed();
    error RoundClosed();
    error NotOptedIn();
    error NotInBidWindow();
    error BidTooLow();
    error BidTooHigh();
    error NotEligibleToBid();
    error TooEarlyToSettle();
    error NothingToWithdraw();
    error NotInDefault();
    error NotOrganizer();
    error OpenDeadlineNotReached();
    error InvalidReveal();
    error RevealWindowOpen();

    // --------------------------------------------------------------- events

    event MemberJoined(address indexed member, uint256 collateral, uint256 memberCount);
    event CircleActivated(uint256 indexed startTime, address[] payoutOrder);
    event Contributed(address indexed member, uint256 indexed round, uint256 amount);
    event AutoPaid(address indexed member, uint256 indexed round, address indexed caller, uint256 amount);
    event AutoPayChanged(address indexed member, bool optedIn);
    event BidPlaced(address indexed bidder, uint256 indexed round, uint256 discountBps);
    event RoundSettled(
        uint256 indexed round, address indexed recipient, uint256 payout, uint256 discountBps, uint256 givingCut
    );
    event DividendWithdrawn(address indexed member, uint256 amount);
    event GivingPaid(uint256 indexed round, address indexed recipient, uint256 amount);
    event Defaulted(address indexed member, uint256 indexed round, uint256 slashed, uint256 shortfall);
    event DefaultCured(address indexed member, uint256 repaid, uint256 penalty);
    event CollateralWithdrawn(address indexed member, uint256 amount);
    event CircleCompleted();
    event CircleCancelled();
    event AllowlistUpdated(address indexed account, bool allowed);
    event PayoutDeferred(address indexed to, uint256 amount);
    event CircleFilled(uint256 indexed fullAt, uint256 fullBlock);
    event SeedRevealed(bytes32 indexed commitment);
    event SeedRevealTimedOut();

    // ---------------------------------------------------------- initializer

    /// @notice Deploy the RotaCircle logic contract.
    /// @dev Lock the implementation contract so it can never be initialized
    ///      directly. Clones get fresh storage and are initialized by the factory
    ///      in the same transaction that deploys them.
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize a freshly deployed clone. Called once by the factory.
    /// @dev The organizer is registered as member #0 here; the factory transfers the
    ///      organizer's collateral to this contract in the same transaction (the clone
    ///      address is unknown before deployment, so the organizer approves the
    ///      factory instead of the clone).
    /// @param p Circle configuration.
    /// @param organizer_ The circle creator (auto-joined as first member).
    /// @param registry_ ReputationRegistry address.
    /// @dev The `initializer` modifier is the access control here: the factory calls
    ///      this in the same transaction as {Clones.clone}, and the guard makes any
    ///      later call — by anyone — revert with `InvalidInitialization()`. There is
    ///      no window in which an uninitialized clone is reachable.
    function initialize(CircleParams calldata p, address organizer_, address registry_)
        external
        initializer
    {
        if (
            p.token == address(0) || organizer_ == address(0) || registry_ == address(0) || p.contributionAmount == 0
                || p.memberCap < MIN_MEMBERS || p.memberCap > MAX_MEMBERS || p.roundDuration == 0
                || p.roundDuration > MAX_ROUND_DURATION || p.openDeadline <= block.timestamp
                || p.openDeadline > block.timestamp + MAX_OPEN_WINDOW || p.givingBps > MAX_GIVING_BPS
                || (p.givingBps > 0 && p.givingRecipient == address(0)) || p.collateralBps > BPS
        ) revert InvalidParams();
        if (p.mode == Mode.BID && (p.bidWindowBps == 0 || p.bidWindowBps >= BPS || p.maxDiscountBps > MAX_DISCOUNT_LIMIT))
        {
            revert InvalidParams();
        }
        // RANDOM_ORDER is unusable without a commitment: there would be nothing to
        // reveal and every activation would fall back to join order.
        if (p.mode == Mode.RANDOM_ORDER && p.seedCommit == bytes32(0)) revert InvalidParams();

        factory = msg.sender;
        token = IERC20(p.token);
        reputationRegistry = IReputationRegistry(registry_);
        organizer = organizer_;
        name = p.name;
        mode = p.mode;
        contributionAmount = p.contributionAmount;
        memberCap = p.memberCap;
        roundDuration = p.roundDuration;
        collateralBps = p.collateralBps;
        givingBps = p.givingBps;
        givingRecipient = p.givingRecipient;
        bidWindowBps = p.bidWindowBps;
        maxDiscountBps = p.maxDiscountBps;
        openDeadline = p.openDeadline;
        inviteOnly = p.inviteOnly;
        seedCommit = p.seedCommit;

        // organizer auto-joins; collateral is transferred in by the factory
        members.push(organizer_);
        isMember[organizer_] = true;
        collateralBalance[organizer_] = collateralRequired();
        emit MemberJoined(organizer_, collateralRequired(), 1);
    }

    // ----------------------------------------------------------- open phase

    /// @notice Join the circle, escrowing collateral.
    /// @dev Requires prior ERC-20 approval of `collateralRequired()` to this contract.
    function join() external nonReentrant {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= memberCap) revert CircleFull();
        if (inviteOnly && !allowlist[msg.sender]) revert NotInvited();

        uint256 coll = collateralRequired();
        members.push(msg.sender);
        isMember[msg.sender] = true;
        collateralBalance[msg.sender] = coll;
        emit MemberJoined(msg.sender, coll, members.length);

        // Filling the circle fixes both halves of the RANDOM_ORDER seed: the
        // member set and the block whose hash the organizer could not know when
        // they committed. It also starts the organizer's reveal window.
        if (members.length == memberCap) {
            fullAt = block.timestamp;
            fullBlock = block.number;
            emit CircleFilled(fullAt, fullBlock);
        }

        if (coll > 0) token.safeTransferFrom(msg.sender, address(this), coll);
    }

    /// @notice Add/remove invitees while the circle is open (organizer only).
    /// @param accounts Addresses to update.
    /// @param allowed Whether they may join.
    /// @dev Only meaningful while inviteOnly is set; harmless otherwise.
    function setAllowlist(address[] calldata accounts, bool allowed) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (phase != Phase.OPEN) revert WrongPhase();
        uint256 len = accounts.length;
        // caller-supplied array: bound it so one call cannot exceed the block gas
        // limit (a circle only ever needs memberCap invitees anyway)
        if (len == 0 || len > MAX_ALLOWLIST_BATCH) revert InvalidParams();
        for (uint256 i; i < len; ++i) {
            allowlist[accounts[i]] = allowed;
            emit AllowlistUpdated(accounts[i], allowed);
        }
    }

    /// @notice Start the circle once full. Callable by anyone.
    /// @dev For RANDOM_ORDER this is the FALLBACK path: it only becomes available
    ///      once the organizer's {REVEAL_WINDOW} has elapsed without a reveal, and
    ///      it activates on join order. That guarantees an organizer who loses (or
    ///      withholds) their secret can never hold the circle hostage.
    function activate() external {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (members.length != memberCap) revert CircleNotFull();
        if (mode == Mode.RANDOM_ORDER) {
            if (block.timestamp < fullAt + REVEAL_WINDOW) revert RevealWindowOpen();
            emit SeedRevealTimedOut();
        }
        _activate(bytes32(0), false);
    }

    /// @notice RANDOM_ORDER: reveal the seed committed at creation and start the
    ///         circle with the resulting shuffle.
    /// @dev Commit–reveal splits control of the permutation so that neither side
    ///      can steer it:
    ///      - The organizer fixes `secret` at creation, before any member has
    ///        joined, so they cannot aim it at a particular ordering.
    ///      - `blockhash(fullBlock)` is fixed when the last member joins and is
    ///        unknown at commit time. A validator could grind it, but without
    ///        `secret` they cannot compute the permutation it produces, so the
    ///        grinding is blind.
    ///      Residual: at reveal time the organizer can see the resulting order and
    ///      choose to withhold, falling back to join order after REVEAL_WINDOW —
    ///      a one-bit choice between two orders neither of which they picked. That
    ///      is inherent to any reveal scheme without a VRF (Arc has none, and
    ///      block.prevrandao is always 0 there — see docs/ARC_NOTES.md).
    /// @param secret The pre-image committed as `seedCommit` at creation.
    function activateWithSeed(bytes32 secret) external {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (mode != Mode.RANDOM_ORDER) revert WrongPhase();
        if (members.length != memberCap) revert CircleNotFull();
        if (keccak256(abi.encode(secret)) != seedCommit) revert InvalidReveal();
        emit SeedRevealed(seedCommit);
        _activate(secret, true);
    }

    /// @notice Shared activation body for both activation paths.
    /// @dev Shared activation. `shuffle` is only ever true on the reveal path.
    function _activate(bytes32 secret, bool shuffle) internal {
        phase = Phase.ACTIVE;
        startTime = block.timestamp;

        if (mode != Mode.BID) {
            payoutOrder = members;
            if (shuffle) {
                bytes32 seed = keccak256(abi.encode(secret, blockhash(fullBlock), address(this), members));
                // Fisher–Yates. Static analysers flag `% (i + 1)` on a hash as a
                // weak PRNG; here the seed's entropy is the organizer's committed
                // 256-bit secret, which no validator knows, so the draw is not
                // block-predictable. Modulo bias over 2^256 into i+1 <= 20 is nil.
                // slither-disable-next-line weak-prng
                for (uint256 i = payoutOrder.length - 1; i > 0; --i) {
                    uint256 j = uint256(keccak256(abi.encode(seed, i))) % (i + 1);
                    (payoutOrder[i], payoutOrder[j]) = (payoutOrder[j], payoutOrder[i]);
                }
            }
        }
        emit CircleActivated(startTime, payoutOrder);
    }

    /// @notice Cancel an unfilled circle. Organizer may cancel any time before
    ///         activation; anyone may cancel after `openDeadline`. Members reclaim
    ///         collateral via {withdrawCollateral}.
    /// @dev Terminal: members reclaim collateral via withdrawCollateral().
    function cancel() external {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (msg.sender != organizer && block.timestamp <= openDeadline) revert OpenDeadlineNotReached();
        phase = Phase.CANCELLED;
        emit CircleCancelled();
    }

    // --------------------------------------------------------- active phase

    /// @notice Contribute this round's amount. Requires prior approval.
    /// @dev Reverts once the round's deadline has passed.
    function contribute() external nonReentrant {
        _contribute(msg.sender);
    }

    /// @notice Opt into AutoPay: anyone may then pull your exact contribution for the
    ///         current round on your behalf while the round is open. Requires you to
    ///         maintain an ERC-20 allowance to this contract; the contract can never
    ///         take more than `contributionAmount` once per round.
    /// @dev Does not itself move funds or set an ERC-20 allowance.
    function optInAutoPay() external {
        if (!isMember[msg.sender]) revert NotMember();
        autoPayOptIn[msg.sender] = true;
        emit AutoPayChanged(msg.sender, true);
    }

    /// @notice Opt out of AutoPay at any time.
    /// @dev Does not revoke the ERC-20 allowance; do that in your wallet.
    function optOutAutoPay() external {
        autoPayOptIn[msg.sender] = false;
        emit AutoPayChanged(msg.sender, false);
    }

    /// @notice Pull `member`'s contribution for the current round (keeper/organizer/
    ///         anyone). Only works if the member opted in, only for the exact
    ///         contribution amount, only once per round, only while the round is open.
    /// @param member The opted-in member to pull from.
    /// @dev Bounded by design: exactly one contribution, once per round.
    function pullContribution(address member) external nonReentrant {
        if (member == address(0)) revert NotMember();
        if (!autoPayOptIn[member]) revert NotOptedIn();
        uint256 r = currentRound;
        _contribute(member);
        emit AutoPaid(member, r, msg.sender, contributionAmount);
    }

    /// @notice BID mode: bid a discount (in bps of the pot) to win this round's pot.
    ///         Highest discount wins; ties are broken by earliest bid (a new bid must
    ///         strictly exceed the current best). Only members who have not yet won
    ///         and are not in default may bid, during the round's bid window.
    /// @param discountBps Discount offered, ≤ maxDiscountBps.
    /// @dev Not nonReentrant: it moves no funds.
    function placeBid(uint256 discountBps) external {
        if (phase != Phase.ACTIVE || mode != Mode.BID) revert WrongPhase();
        if (!isMember[msg.sender]) revert NotMember();
        if (hasWon[msg.sender] || inDefault[msg.sender]) revert NotEligibleToBid();
        uint256 r = currentRound;
        uint256 start = startTime + r * roundDuration;
        if (block.timestamp < start || block.timestamp >= bidWindowEnd(r)) revert NotInBidWindow();
        if (discountBps > maxDiscountBps) revert BidTooHigh();
        BestBid storage b = bestBid[r];
        if (b.exists && discountBps <= b.discountBps) revert BidTooLow();
        // SafeCast rather than a raw uint16 cast: discountBps <= maxDiscountBps
        // <= 3000 already, so this can never revert, but it keeps the narrowing
        // checked if MAX_DISCOUNT_LIMIT is ever raised.
        bestBid[r] =
            BestBid({bidder: msg.sender, discountBps: SafeCast.toUint16(discountBps), exists: true});
        emit BidPlaced(msg.sender, r, discountBps);
    }

    /// @notice Settle the current round: slash defaulters, pay the giving cut, pay
    ///         the recipient (order-based or winning bidder), credit bid dividends,
    ///         and advance to the next round. Callable by anyone once every member
    ///         has contributed (and, in BID mode, the bid window has closed) or the
    ///         round deadline has passed.
    /// @dev If no eligible recipient exists (everyone remaining is in default), the
    ///      pot is credited as dividends to non-defaulted members instead.
    function settleRound() external nonReentrant {
        if (phase != Phase.ACTIVE) revert WrongPhase();
        uint256 r = currentRound;
        uint256 n = members.length;
        bool allIn = roundContributionCount[r] == n;
        bool deadlinePassed = block.timestamp >= roundDeadline(r);
        if (mode == Mode.BID) {
            if (!((allIn && block.timestamp >= bidWindowEnd(r)) || deadlinePassed)) revert TooEarlyToSettle();
        } else {
            if (!(allIn || deadlinePassed)) revert TooEarlyToSettle();
        }

        // ---------------------------------------------------------- effects
        uint256 pot = roundContributionCount[r] * contributionAmount + penaltyCarry;
        penaltyCarry = 0;

        if (!allIn) pot += _slashDefaulters(r);

        uint256 givingCut = 0;
        if (givingBps > 0 && pot > 0) {
            givingCut = (pot * givingBps) / BPS;
            pot -= givingCut;
        }

        (address recipient, uint256 payout, uint256 discountBps) = _distributePot(r, pot);

        currentRound = r + 1;
        bool completed = currentRound == memberCap;
        if (completed) phase = Phase.COMPLETED;

        emit RoundSettled(r, recipient, payout, discountBps, givingCut);
        if (completed) emit CircleCompleted();

        // ----------------------------------------------------- interactions
        // Every external call is made only after all state is final, so a
        // misbehaving registry or token can never observe (or re-enter into) a
        // half-settled round. nonReentrant already blocks re-entry; this makes
        // the ordering correct on its own terms too.
        if (!allIn) _recordDefaults(r);
        if (completed) {
            for (uint256 i; i < n; ++i) {
                if (!inDefault[members[i]]) reputationRegistry.recordCompletion(members[i]);
            }
        }

        if (givingCut > 0) {
            emit GivingPaid(r, givingRecipient, givingCut);
            _payOrCredit(givingRecipient, givingCut);
        }
        if (recipient != address(0) && payout > 0) _payOrCredit(recipient, payout);
    }

    /// @notice Withdraw accumulated bid dividends (and fallback distributions).
    /// @dev Pull pattern; zeroes the balance before transferring.
    function withdrawDividends() external nonReentrant {
        uint256 amount = dividendBalance[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        dividendBalance[msg.sender] = 0;
        emit DividendWithdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    /// @notice Repay slashed collateral + uncovered arrears + a 5% penalty to exit
    ///         default. Restores slashed collateral; shortfall + penalty roll into
    ///         the next round's pot. Requires prior approval of `cureCost()`.
    /// @dev Requires prior approval of cureCost(msg.sender).
    function cureDefault() external nonReentrant {
        if (phase != Phase.ACTIVE) revert WrongPhase();
        if (!inDefault[msg.sender]) revert NotInDefault();

        uint256 slashed = slashedAmount[msg.sender];
        uint256 shortfall = shortfallAmount[msg.sender];
        uint256 owed = slashed + shortfall;
        uint256 penalty = (owed * CURE_PENALTY_BPS) / BPS;

        slashedAmount[msg.sender] = 0;
        shortfallAmount[msg.sender] = 0;
        inDefault[msg.sender] = false;
        collateralBalance[msg.sender] += slashed;
        penaltyCarry += shortfall + penalty;

        reputationRegistry.recordCure(msg.sender);
        emit DefaultCured(msg.sender, owed, penalty);
        token.safeTransferFrom(msg.sender, address(this), owed + penalty);
    }

    // ------------------------------------------------------------ terminal

    /// @notice Withdraw remaining collateral after the circle completes or is
    ///         cancelled (pull pattern).
    /// @dev Pull pattern; only available once the circle is terminal.
    function withdrawCollateral() external nonReentrant {
        if (phase != Phase.COMPLETED && phase != Phase.CANCELLED) revert WrongPhase();
        uint256 amount = collateralBalance[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        collateralBalance[msg.sender] = 0;
        emit CollateralWithdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }

    // ---------------------------------------------------------------- views

    /// @notice Collateral each member escrows on join.
    /// @dev Rounds down; zero when collateralBps is zero.
    function collateralRequired() public view returns (uint256) {
        return (contributionAmount * collateralBps) / BPS;
    }

    /// @notice Contribution deadline for round `r` (schedule-anchored).
    /// @dev Schedule-anchored: early settlement does not shift later rounds.
    function roundDeadline(uint256 r) public view returns (uint256) {
        return startTime + (r + 1) * roundDuration;
    }

    /// @notice End of the bid window for round `r` (BID mode; schedule-anchored).
    /// @dev Schedule-anchored, like roundDeadline.
    function bidWindowEnd(uint256 r) public view returns (uint256) {
        return startTime + r * roundDuration + (roundDuration * bidWindowBps) / BPS;
    }

    /// @notice Total repayment required to cure `member`'s default (arrears + penalty).
    /// @dev Returns zero for a member who is not in default.
    function cureCost(address member) external view returns (uint256) {
        uint256 owed = slashedAmount[member] + shortfallAmount[member];
        return owed + (owed * CURE_PENALTY_BPS) / BPS;
    }

    /// @notice The recipient the next settle would pay under current state (bids may
    ///         still change it in BID mode). address(0) = fallback distribution.
    /// @dev Advisory only: a later bid can still change the outcome.
    function previewRecipient() external view returns (address) {
        return _selectRecipient(currentRound);
    }

    /// @notice Every member, in join order.
    /// @dev Unbounded in name only: length is capped at MAX_MEMBERS.
    function getMembers() external view returns (address[] memory) {
        return members;
    }

    /// @notice The resolved payout order (empty in BID mode, which picks per round).
    /// @dev Populated at activation; RANDOM_ORDER shuffles it there.
    function getPayoutOrder() external view returns (address[] memory) {
        return payoutOrder;
    }

    /// @notice How many members have joined so far.
    /// @dev Cheaper than getMembers() when only the count is needed.
    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // ------------------------------------------------------------ internals

    /// @notice Shared contribution body for contribute() and pullContribution().
    /// @dev Shared contribution path for contribute() and pullContribution().
    ///      Contributions for round r are accepted from the moment r becomes current
    ///      (previous round settled — possibly early) until r's scheduled deadline.
    function _contribute(address member) internal {
        if (phase != Phase.ACTIVE) revert WrongPhase();
        if (!isMember[member]) revert NotMember();
        uint256 r = currentRound;
        if (hasContributed[r][member]) revert AlreadyContributed();
        if (block.timestamp >= roundDeadline(r)) revert RoundClosed();

        hasContributed[r][member] = true;
        roundContributionCount[r] += 1;
        reputationRegistry.recordContribution(member);
        emit Contributed(member, r, contributionAmount);
        token.safeTransferFrom(member, address(this), contributionAmount);
    }

    /// @notice Slash collateral from everyone who missed a round.
    /// @dev Slash collateral of every member who missed round `r`; returns the total
    ///      slashed value added to the pot. Uncovered value is recorded as shortfall
    ///      (the recipient receives a smaller pot — see SECURITY.md).
    /// @dev Pure state transition: reporting the defaults to the registry is an
    ///      external call and is deferred to {_recordDefaults}, called by
    ///      settleRound once every state write is final.
    function _slashDefaulters(uint256 r) internal returns (uint256 totalSlashed) {
        uint256 n = members.length;
        for (uint256 i; i < n; ++i) {
            address m = members[i];
            if (hasContributed[r][m]) continue;
            uint256 coll = collateralBalance[m];
            uint256 slash = coll >= contributionAmount ? contributionAmount : coll;
            uint256 shortfall = contributionAmount - slash;
            collateralBalance[m] = coll - slash;
            slashedAmount[m] += slash;
            shortfallAmount[m] += shortfall;
            inDefault[m] = true;
            totalSlashed += slash;
            emit Defaulted(m, r, slash, shortfall);
        }
    }

    /// @notice Report a round's defaulters to the reputation registry.
    /// @dev Report round `r`'s defaulters to the reputation registry. Split out of
    ///      {_slashDefaulters} so settlement performs no external call until its
    ///      state is final; the defaulter set is exactly the members with no
    ///      recorded contribution for `r`.
    function _recordDefaults(uint256 r) internal {
        uint256 n = members.length;
        for (uint256 i; i < n; ++i) {
            address m = members[i];
            if (!hasContributed[r][m]) reputationRegistry.recordDefault(m);
        }
    }

    /// @notice Choose the round's recipient and split the pot.
    /// @dev Pick the round's recipient, apply the bid discount, and credit dividends.
    ///      Returns (recipient, payout, discountBps). If recipient is address(0) the
    ///      pot was distributed as dividends (or carried) instead of paid out.
    function _distributePot(uint256 r, uint256 pot)
        internal
        returns (address recipient, uint256 payout, uint256 discountBps)
    {
        recipient = _selectRecipient(r);
        uint256 n = members.length;

        if (recipient == address(0)) {
            // everyone remaining is in default: distribute to non-defaulted members,
            // carrying rounding dust (and the everyone-defaulted edge) forward
            uint256 eligible = 0;
            for (uint256 i; i < n; ++i) {
                if (!inDefault[members[i]]) ++eligible;
            }
            if (eligible > 0) {
                uint256 per = pot / eligible;
                for (uint256 i; i < n; ++i) {
                    if (!inDefault[members[i]]) dividendBalance[members[i]] += per;
                }
                // remainder via modulo, not `pot - per * eligible`: identical
                // value without multiplying back a divided quantity
                penaltyCarry += pot % eligible;
            } else {
                penaltyCarry += pot;
            }
            return (address(0), 0, 0);
        }

        payout = pot;
        if (mode == Mode.BID) {
            BestBid memory b = bestBid[r];
            if (b.exists && b.bidder == recipient) {
                discountBps = b.discountBps;
                uint256 discount = (pot * discountBps) / BPS;
                uint256 per = discount / n;
                for (uint256 i; i < n; ++i) {
                    dividendBalance[members[i]] += per;
                }
                // recipient absorbs division dust; `discount % n` is exactly
                // `discount - per * n` without multiplying back a division
                payout = pot - discount + (discount % n);
            }
        }
        hasWon[recipient] = true;
    }

    /// @notice Pay a payee, falling back to a withdrawable credit.
    /// @dev Settlement transfers must never be able to block a round. USDC can
    ///      blacklist addresses, and safeTransfer would then revert settleRound
    ///      forever, freezing every member's contributions and collateral. Instead:
    ///      attempt the transfer, and on failure credit the amount to the payee's
    ///      dividend balance (withdrawable later via withdrawDividends).
    ///
    ///      The call is gas-capped. Returning `false` is not the only way a hostile
    ///      token can fail: it can also burn every wei of forwarded gas, and the
    ///      63/64 rule would leave this frame unable to finish — reverting the whole
    ///      settlement on every retry. PAYOUT_GAS is far above a real ERC-20
    ///      transfer (USDC's proxy costs ~90k) and bounds that griefing.
    ///
    ///      Crediting after the call is inherent to "try to push, fall back to
    ///      pull": the outcome is only known once the call returns. It is safe —
    ///      every fund-moving entry point is nonReentrant, and the credit is the
    ///      failure branch, so a reentrant token cannot mint itself a balance.
    // slither-disable-next-line reentrancy-benign,reentrancy-no-eth
    function _payOrCredit(address to, uint256 amount) internal {
        if (amount == 0) return; // nothing to move; skip the external call entirely
        if (_tryTransfer(to, amount)) return;
        dividendBalance[to] += amount;
        emit PayoutDeferred(to, amount);
    }

    /// @notice Attempt an ERC-20 transfer without reverting on failure.
    /// @dev Gas-capped, return-bomb-safe best-effort ERC-20 transfer. Reports
    ///      failure instead of reverting.
    ///
    ///      The call caps BOTH gas and returndata copied. Without the returndata
    ///      cap a hostile token could return megabytes and charge the caller for
    ///      the memory expansion — the same settlement-bricking griefing the gas
    ///      cap exists to prevent. The EVM copies min(returndatasize, 32) bytes
    ///      into scratch space, so the blob is never materialised.
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

    /// @notice Pick the member who should receive a given round's pot.
    /// @dev Recipient selection. BID mode: the best bidder if still eligible,
    ///      otherwise (or with no bids) fall back to join order among members who
    ///      have not won and are not in default. FIXED/RANDOM: first eligible member
    ///      in payoutOrder. address(0) if nobody is eligible.
    function _selectRecipient(uint256 r) internal view returns (address) {
        if (mode == Mode.BID) {
            BestBid memory b = bestBid[r];
            if (b.exists && !hasWon[b.bidder] && !inDefault[b.bidder]) return b.bidder;
            uint256 n = members.length;
            for (uint256 i; i < n; ++i) {
                address m = members[i];
                if (!hasWon[m] && !inDefault[m]) return m;
            }
            return address(0);
        }
        uint256 len = payoutOrder.length;
        for (uint256 i; i < len; ++i) {
            address m = payoutOrder[i];
            if (!hasWon[m] && !inDefault[m]) return m;
        }
        return address(0);
    }
}
