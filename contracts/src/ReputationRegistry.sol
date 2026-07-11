// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title ReputationRegistry
/// @notice Portable, on-chain savings reputation ("Credit Passport") for Rota users.
///         Circles and goal pots deployed by the RotaFactory report contributions,
///         defaults, completions, cures and early exits. Anyone can read a score.
/// @dev    Write access is a two-step trust chain: the owner sets the factory once,
///         and the factory authorizes each clone it deploys. Scores are computed on
///         read with a transparent, fixed formula so wallets/lenders can verify it.
contract ReputationRegistry is Ownable, IReputationRegistry {
    // ---------------------------------------------------------------- types

    struct Stats {
        uint64 contributions;
        uint64 defaults;
        uint64 completions;
        uint64 cures;
        uint64 earlyExits;
    }

    // ---------------------------------------------------------------- state

    /// @notice The RotaFactory allowed to authorize new writer contracts.
    address public factory;

    /// @notice Contracts (factory-deployed clones) allowed to write records.
    mapping(address => bool) public authorized;

    mapping(address => Stats) private _stats;

    // --------------------------------------------------------------- errors

    error NotFactory();
    error NotAuthorized();
    error ZeroAddress();

    // --------------------------------------------------------------- events

    event FactorySet(address indexed factory);
    event WriterAuthorized(address indexed writer);
    event ContributionRecorded(address indexed user, address indexed reporter);
    event DefaultRecorded(address indexed user, address indexed reporter);
    event CompletionRecorded(address indexed user, address indexed reporter);
    event CureRecorded(address indexed user, address indexed reporter);
    event EarlyExitRecorded(address indexed user, address indexed reporter);

    // ----------------------------------------------------------- modifiers

    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert NotAuthorized();
        _;
    }

    constructor() Ownable(msg.sender) {}

    // ---------------------------------------------------------------- admin

    /// @notice Point the registry at the RotaFactory. Owner-only; updatable so a
    ///         factory upgrade does not orphan existing reputation data.
    /// @param factory_ The RotaFactory address.
    function setFactory(address factory_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactorySet(factory_);
    }

    /// @notice Authorize a freshly deployed circle/pot clone as a writer.
    /// @dev Callable only by the factory, in the same tx that deploys the clone.
    /// @param writer The clone address.
    function authorize(address writer) external {
        if (msg.sender != factory) revert NotFactory();
        authorized[writer] = true;
        emit WriterAuthorized(writer);
    }

    // --------------------------------------------------------------- writes

    /// @inheritdoc IReputationRegistry
    function recordContribution(address user) external onlyAuthorized {
        _stats[user].contributions += 1;
        emit ContributionRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordDefault(address user) external onlyAuthorized {
        _stats[user].defaults += 1;
        emit DefaultRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordCompletion(address user) external onlyAuthorized {
        _stats[user].completions += 1;
        emit CompletionRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordCure(address user) external onlyAuthorized {
        _stats[user].cures += 1;
        emit CureRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordEarlyExit(address user) external onlyAuthorized {
        _stats[user].earlyExits += 1;
        emit EarlyExitRecorded(user, msg.sender);
    }

    // ---------------------------------------------------------------- reads

    /// @notice Raw counters plus the derived score for a user.
    /// @dev Score formula (transparent, floored at zero):
    ///      completions*100 + contributions*10 + cures*20 − defaults*50 − earlyExits*15
    /// @param user Address to score.
    /// @return stats Raw counters.
    /// @return score Derived score, floored at 0.
    function getScore(address user) external view returns (Stats memory stats, uint256 score) {
        stats = _stats[user];
        int256 s = int256(uint256(stats.completions)) * 100 + int256(uint256(stats.contributions)) * 10
            + int256(uint256(stats.cures)) * 20 - int256(uint256(stats.defaults)) * 50
            - int256(uint256(stats.earlyExits)) * 15;
        // casting to 'uint256' is safe: guarded by s > 0
        // forge-lint: disable-next-line(unsafe-typecast)
        score = s > 0 ? uint256(s) : 0;
    }
}
