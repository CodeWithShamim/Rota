// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IReputationRegistry
/// @notice Write/read interface for Rota's on-chain reputation ledger.
///         Only contracts deployed by the RotaFactory may write.
interface IReputationRegistry {
    /// @notice Record one on-time contribution (circle round payment or pot deposit).
    function recordContribution(address user) external;

    /// @notice Record one missed circle contribution (collateral was slashed).
    function recordDefault(address user) external;

    /// @notice Record one successfully completed circle or goal pot.
    function recordCompletion(address user) external;

    /// @notice Record a cured default (arrears + penalty repaid).
    function recordCure(address user) external;

    /// @notice Record an early exit from a goal pot (haircut taken).
    function recordEarlyExit(address user) external;
}
