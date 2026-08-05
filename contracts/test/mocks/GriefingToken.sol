// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev USDC-like token whose `transfer` grieves the caller instead of failing
///      cleanly, for a chosen victim address. Two modes:
///
///      - GAS_BURN: loops until it runs out of the gas it was forwarded. Without a
///        gas cap the 63/64 rule leaves the caller unable to finish, so settlement
///        reverts on every retry and the circle is bricked.
///      - RETURN_BOMB: returns a multi-megabyte blob. Without a bounded
///        returndatacopy the caller pays for the memory expansion — same outcome.
///
///      Everything else behaves like a normal ERC-20 so the surrounding flow works.
contract GriefingToken is ERC20 {
    enum Mode {
        NONE,
        GAS_BURN,
        RETURN_BOMB
    }

    address public victim;
    Mode public mode;

    constructor() ERC20("Griefing USDC", "gUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setGrief(address victim_, Mode mode_) external {
        victim = victim_;
        mode = mode_;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (to == victim && mode == Mode.GAS_BURN) {
            // burn everything we were given; never returns normally
            uint256 slot = 0;
            while (true) {
                assembly {
                    sstore(slot, add(sload(slot), 1))
                }
                unchecked {
                    ++slot;
                }
            }
        }
        if (to == victim && mode == Mode.RETURN_BOMB) {
            assembly {
                // ~1 MB of returndata; charging the caller for copying it is the attack
                return(0, 0x100000)
            }
        }
        return super.transfer(to, amount);
    }
}
