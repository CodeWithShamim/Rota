// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC — 6-decimal test stablecoin for local development
/// @notice Open faucet; NEVER deploy beyond local/test networks. On Arc testnet the
///         real USDC ERC-20 interface at 0x3600...0000 is used instead.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint arbitrary amounts (local testing only).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Self-serve faucet: 1,000 USDC per call.
    function faucet() external {
        _mint(msg.sender, 1_000e6);
    }
}
