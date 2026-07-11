// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Chain-specific constants for Arc, sourced from docs/ARC_NOTES.md.
///      This is the ONLY place chain values live on the contracts side.
library ArcConfig {
    /// @notice Arc Testnet chain id.
    uint256 internal constant TESTNET_CHAIN_ID = 5042002;

    /// @notice USDC ERC-20 interface over the native balance on Arc Testnet (6 decimals).
    address internal constant TESTNET_USDC = 0x3600000000000000000000000000000000000000;
}
