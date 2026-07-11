// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
contract RotaCircle is ReentrancyGuard {
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

    // ---------------------------------------------------------------- state

    address public factory;
    IERC20 public token;
    IReputationRegistry public reputationRegistry;
    address public organizer;
    string public name;

    Mode public mode;
    Phase public phase;
    uint256 public contributionAmount;
    uint256 public memberCap;
    uint256 public roundDuration;
    uint256 public collateralBps;
    uint256 public givingBps;
    address public givingRecipient;
    uint256 public bidWindowBps;
    uint256 public maxDiscountBps;
    uint256 public openDeadline;
    bool public inviteOnly;

    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => bool) public allowlist;

    uint256 public startTime; // set at activation
    uint256 public currentRound; // 0-indexed; == memberCap when completed
    address[] public payoutOrder; // FIXED_ORDER / RANDOM_ORDER only

    mapping(uint256 => mapping(address => bool)) public hasContributed;
    mapping(uint256 => uint256) public roundContributionCount;
    mapping(uint256 => BestBid) public bestBid;
    mapping(address => bool) public hasWon;
    mapping(address => bool) public autoPayOptIn;
    mapping(address => uint256) public dividendBalance;
    mapping(address => uint256) public collateralBalance;

    mapping(address => bool) public inDefault;
    /// @notice Collateral slashed from a member to cover their missed rounds;
    ///         repaid on cure, restoring collateralBalance.
    mapping(address => uint256) public slashedAmount;
    /// @notice Missed contribution value NOT covered by collateral; repaid on cure
    ///         into penaltyCarry (next pot).
    mapping(address => uint256) public shortfallAmount;
    /// @notice Cure penalties/shortfalls (and rounding dust) rolled into the next pot.
    uint256 public penaltyCarry;

    bool private _initialized;

    // --------------------------------------------------------------- errors

    error AlreadyInitialized();
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

    // --------------------------------------------------------------- events

    event MemberJoined(address indexed member, uint256 collateral, uint256 memberCount);
    event CircleActivated(uint256 startTime, address[] payoutOrder);
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

    // ---------------------------------------------------------- initializer

    /// @notice Initialize a freshly deployed clone. Called once by the factory.
    /// @dev The organizer is registered as member #0 here; the factory transfers the
    ///      organizer's collateral to this contract in the same transaction (the clone
    ///      address is unknown before deployment, so the organizer approves the
    ///      factory instead of the clone).
    /// @param p Circle configuration.
    /// @param organizer_ The circle creator (auto-joined as first member).
    /// @param registry_ ReputationRegistry address.
    function initialize(CircleParams calldata p, address organizer_, address registry_) external {
        if (_initialized) revert AlreadyInitialized();
        _initialized = true;

        if (
            p.token == address(0) || organizer_ == address(0) || registry_ == address(0) || p.contributionAmount == 0
                || p.memberCap < MIN_MEMBERS || p.memberCap > MAX_MEMBERS || p.roundDuration == 0
                || p.openDeadline <= block.timestamp || p.givingBps > MAX_GIVING_BPS
                || (p.givingBps > 0 && p.givingRecipient == address(0)) || p.collateralBps > BPS
        ) revert InvalidParams();
        if (p.mode == Mode.BID && (p.bidWindowBps == 0 || p.bidWindowBps >= BPS || p.maxDiscountBps > MAX_DISCOUNT_LIMIT))
        {
            revert InvalidParams();
        }

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

        if (coll > 0) token.safeTransferFrom(msg.sender, address(this), coll);
    }

    /// @notice Add/remove invitees while the circle is open (organizer only).
    /// @param accounts Addresses to update.
    /// @param allowed Whether they may join.
    function setAllowlist(address[] calldata accounts, bool allowed) external {
        if (msg.sender != organizer) revert NotOrganizer();
        if (phase != Phase.OPEN) revert WrongPhase();
        for (uint256 i; i < accounts.length; ++i) {
            allowlist[accounts[i]] = allowed;
            emit AllowlistUpdated(accounts[i], allowed);
        }
    }

    /// @notice Start the circle once full. Callable by anyone.
    /// @dev RANDOM_ORDER derives its permutation from
    ///      keccak256(blockhash(block.number-1), address(this), members). A block
    ///      producer can in theory grind blockhashes to influence the order; this is
    ///      an accepted MVP trade-off (order only changes WHEN you receive, never
    ///      WHETHER you receive). VRF is future work.
    function activate() external {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (members.length != memberCap) revert CircleNotFull();

        phase = Phase.ACTIVE;
        startTime = block.timestamp;

        if (mode != Mode.BID) {
            payoutOrder = members;
            if (mode == Mode.RANDOM_ORDER) {
                bytes32 seed = keccak256(abi.encode(blockhash(block.number - 1), address(this), members));
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
    function cancel() external {
        if (phase != Phase.OPEN) revert WrongPhase();
        if (msg.sender != organizer && block.timestamp <= openDeadline) revert OpenDeadlineNotReached();
        phase = Phase.CANCELLED;
        emit CircleCancelled();
    }

    // --------------------------------------------------------- active phase

    /// @notice Contribute this round's amount. Requires prior approval.
    function contribute() external nonReentrant {
        _contribute(msg.sender);
    }

    /// @notice Opt into AutoPay: anyone may then pull your exact contribution for the
    ///         current round on your behalf while the round is open. Requires you to
    ///         maintain an ERC-20 allowance to this contract; the contract can never
    ///         take more than `contributionAmount` once per round.
    function optInAutoPay() external {
        if (!isMember[msg.sender]) revert NotMember();
        autoPayOptIn[msg.sender] = true;
        emit AutoPayChanged(msg.sender, true);
    }

    /// @notice Opt out of AutoPay at any time.
    function optOutAutoPay() external {
        autoPayOptIn[msg.sender] = false;
        emit AutoPayChanged(msg.sender, false);
    }

    /// @notice Pull `member`'s contribution for the current round (keeper/organizer/
    ///         anyone). Only works if the member opted in, only for the exact
    ///         contribution amount, only once per round, only while the round is open.
    /// @param member The opted-in member to pull from.
    function pullContribution(address member) external nonReentrant {
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
        // casting to 'uint16' is safe: discountBps <= maxDiscountBps <= 3000
        // forge-lint: disable-next-line(unsafe-typecast)
        bestBid[r] = BestBid({bidder: msg.sender, discountBps: uint16(discountBps), exists: true});
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

        uint256 pot = roundContributionCount[r] * contributionAmount + penaltyCarry;
        penaltyCarry = 0;

        if (!allIn) pot += _slashDefaulters(r);

        uint256 givingCut;
        if (givingBps > 0 && pot > 0) {
            givingCut = (pot * givingBps) / BPS;
            pot -= givingCut;
        }

        (address recipient, uint256 payout, uint256 discountBps) = _distributePot(r, pot);

        currentRound = r + 1;
        emit RoundSettled(r, recipient, payout, discountBps, givingCut);

        if (currentRound == memberCap) {
            phase = Phase.COMPLETED;
            for (uint256 i; i < n; ++i) {
                if (!inDefault[members[i]]) reputationRegistry.recordCompletion(members[i]);
            }
            emit CircleCompleted();
        }

        if (givingCut > 0) {
            emit GivingPaid(r, givingRecipient, givingCut);
            token.safeTransfer(givingRecipient, givingCut);
        }
        if (recipient != address(0) && payout > 0) token.safeTransfer(recipient, payout);
    }

    /// @notice Withdraw accumulated bid dividends (and fallback distributions).
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
    function collateralRequired() public view returns (uint256) {
        return (contributionAmount * collateralBps) / BPS;
    }

    /// @notice Contribution deadline for round `r` (schedule-anchored).
    function roundDeadline(uint256 r) public view returns (uint256) {
        return startTime + (r + 1) * roundDuration;
    }

    /// @notice End of the bid window for round `r` (BID mode; schedule-anchored).
    function bidWindowEnd(uint256 r) public view returns (uint256) {
        return startTime + r * roundDuration + (roundDuration * bidWindowBps) / BPS;
    }

    /// @notice Total repayment required to cure `member`'s default (arrears + penalty).
    function cureCost(address member) external view returns (uint256) {
        uint256 owed = slashedAmount[member] + shortfallAmount[member];
        return owed + (owed * CURE_PENALTY_BPS) / BPS;
    }

    /// @notice The recipient the next settle would pay under current state (bids may
    ///         still change it in BID mode). address(0) = fallback distribution.
    function previewRecipient() external view returns (address) {
        return _selectRecipient(currentRound);
    }

    function getMembers() external view returns (address[] memory) {
        return members;
    }

    function getPayoutOrder() external view returns (address[] memory) {
        return payoutOrder;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    // ------------------------------------------------------------ internals

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

    /// @dev Slash collateral of every member who missed round `r`; returns the total
    ///      slashed value added to the pot. Uncovered value is recorded as shortfall
    ///      (the recipient receives a smaller pot — see SECURITY.md).
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
            reputationRegistry.recordDefault(m);
            emit Defaulted(m, r, slash, shortfall);
        }
    }

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
            uint256 eligible;
            for (uint256 i; i < n; ++i) {
                if (!inDefault[members[i]]) ++eligible;
            }
            if (eligible > 0) {
                uint256 per = pot / eligible;
                for (uint256 i; i < n; ++i) {
                    if (!inDefault[members[i]]) dividendBalance[members[i]] += per;
                }
                penaltyCarry += pot - per * eligible;
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
                // recipient absorbs division dust
                payout = pot - per * n;
            }
        }
        hasWon[recipient] = true;
    }

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
