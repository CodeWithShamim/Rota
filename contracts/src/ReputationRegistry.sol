// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IReputationRegistry} from "./interfaces/IReputationRegistry.sol";

/// @title ReputationRegistry
/// @notice Portable, on-chain savings reputation ("Credit Passport") for Rota users.
///         Circles and goal pots deployed by the RotaFactory report contributions,
///         defaults, completions, cures and early exits. Anyone can read a score.
/// @dev    Write access is a two-step trust chain: the owner sets the factory once,
///         and the factory authorizes each clone it deploys. Scores are computed on
///         read with a transparent, fixed formula so wallets/lenders can verify it.
///         Ownership uses {Ownable2Step}: transfers require the new owner to accept,
///         so a mistyped address cannot orphan the registry's only admin function.
/// @author Rota (https://github.com/codewithshamim/rota)
contract ReputationRegistry is Ownable2Step, IReputationRegistry {
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
    mapping(address writer => bool allowed) public authorized;

    mapping(address user => Stats stats) private _stats;

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

    /// @notice Restricts a write to factory-deployed circles and pots.
    /// @dev Authorization is granted per clone by the factory at deployment.
    modifier onlyAuthorized() {
        if (!authorized[msg.sender]) revert NotAuthorized();
        _;
    }

    /// @notice Restricts a call to the configured RotaFactory.
    /// @dev Only the RotaFactory may authorize new writers.
    modifier onlyFactory() {
        if (msg.sender != factory) revert NotFactory();
        _;
    }

    /// @notice Deploy the registry, owned by the deployer.
    /// @dev The factory is set separately via setFactory().
    constructor() Ownable(msg.sender) {}

    // ---------------------------------------------------------------- admin

    /// @notice Point the registry at the RotaFactory. Owner-only; updatable so a
    ///         factory upgrade does not orphan existing reputation data.
    /// @param factory_ The RotaFactory address.
    /// @dev Owner-only. Re-pointing does not migrate or clear existing scores.
    function setFactory(address factory_) external onlyOwner {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = factory_;
        emit FactorySet(factory_);
    }

    /// @notice Authorize a freshly deployed circle/pot clone as a writer.
    /// @dev Callable only by the factory, in the same tx that deploys the clone.
    /// @param writer The clone address.
    function authorize(address writer) external onlyFactory {
        if (writer == address(0)) revert ZeroAddress();
        authorized[writer] = true;
        emit WriterAuthorized(writer);
    }

    // --------------------------------------------------------------- writes

    /// @inheritdoc IReputationRegistry
    function recordContribution(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        _stats[user].contributions += 1;
        emit ContributionRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordDefault(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        _stats[user].defaults += 1;
        emit DefaultRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordCompletion(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        _stats[user].completions += 1;
        emit CompletionRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordCure(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
        _stats[user].cures += 1;
        emit CureRecorded(user, msg.sender);
    }

    /// @inheritdoc IReputationRegistry
    function recordEarlyExit(address user) external onlyAuthorized {
        if (user == address(0)) revert ZeroAddress();
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
        // Widening uint64 -> int256 via SafeCast: every counter fits comfortably,
        // but the explicit conversion documents that and reverts rather than
        // silently wrapping if the Stats types are ever widened.
        int256 s = SafeCast.toInt256(uint256(stats.completions)) * 100
            + SafeCast.toInt256(uint256(stats.contributions)) * 10
            + SafeCast.toInt256(uint256(stats.cures)) * 20
            - SafeCast.toInt256(uint256(stats.defaults)) * 50
            - SafeCast.toInt256(uint256(stats.earlyExits)) * 15;
        score = s > 0 ? SafeCast.toUint256(s) : 0;
    }
}
