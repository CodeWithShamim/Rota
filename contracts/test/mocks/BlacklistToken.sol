// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal USDC-like token with an owner-set blacklist: any transfer to or
///      from a blacklisted address reverts, like Circle's USDC. Used to prove that
///      one frozen address cannot brick settlement or withdrawals for everyone.
contract BlacklistToken is ERC20 {
    mapping(address => bool) public blacklisted;

    constructor() ERC20("Blacklist USDC", "bUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setBlacklisted(address account, bool value) external {
        blacklisted[account] = value;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[from] && !blacklisted[to], "blacklisted");
        super._update(from, to, value);
    }
}
