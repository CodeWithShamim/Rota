// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";

/// @dev Random-action fuzz handler for an active BID circle (the mode with the most
///      moving parts: bids, dividends, defaults, cures, giving).
contract CircleHandler is Test {
    RotaCircle public circle;
    MockUSDC public usdc;
    address[] public actors;

    constructor(RotaCircle circle_, MockUSDC usdc_, address[] memory actors_) {
        circle = circle_;
        usdc = usdc_;
        actors = actors_;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function contribute(uint256 seed) external {
        address a = _actor(seed);
        vm.startPrank(a);
        usdc.approve(address(circle), type(uint256).max);
        try circle.contribute() {} catch {}
        vm.stopPrank();
    }

    function optInAndPull(uint256 seed) external {
        address a = _actor(seed);
        vm.startPrank(a);
        usdc.approve(address(circle), type(uint256).max);
        try circle.optInAutoPay() {} catch {}
        vm.stopPrank();
        try circle.pullContribution(a) {} catch {}
    }

    function placeBid(uint256 seed, uint256 bps) external {
        vm.prank(_actor(seed));
        try circle.placeBid(bound(bps, 0, 3_000)) {} catch {}
    }

    function settle() external {
        try circle.settleRound() {} catch {}
    }

    function cure(uint256 seed) external {
        address a = _actor(seed);
        vm.startPrank(a);
        usdc.approve(address(circle), type(uint256).max);
        try circle.cureDefault() {} catch {}
        vm.stopPrank();
    }

    function withdrawDividends(uint256 seed) external {
        vm.prank(_actor(seed));
        try circle.withdrawDividends() {} catch {}
    }

    function withdrawCollateral(uint256 seed) external {
        vm.prank(_actor(seed));
        try circle.withdrawCollateral() {} catch {}
    }

    function warpAhead(uint256 seed) external {
        vm.warp(block.timestamp + bound(seed, 1 hours, 4 days));
    }
}

contract CircleInvariantTest is BaseTest {
    RotaCircle internal circle;
    CircleHandler internal handler;

    function setUp() public override {
        super.setUp();
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.BID, 5);
        p.givingBps = 200;
        p.givingRecipient = charity;
        circle = createActiveCircle(p);

        address[] memory actors = new address[](5);
        for (uint256 i; i < 5; ++i) {
            actors[i] = users[i];
        }
        handler = new CircleHandler(circle, usdc, actors);
        targetContract(address(handler));
    }

    /// @dev The contract can always cover everything it owes: remaining collateral,
    ///      unclaimed dividends, the carried penalty pot, and contributions received
    ///      for the not-yet-settled round. (Equality — Rota holds no surplus.)
    function invariant_CircleBalanceCoversObligations() public view {
        uint256 owed = circle.penaltyCarry();
        uint256 n = circle.memberCount();
        for (uint256 i; i < n; ++i) {
            address m = circle.members(i);
            owed += circle.collateralBalance(m) + circle.dividendBalance(m);
        }
        if (circle.phase() == RotaCircle.Phase.ACTIVE) {
            owed += circle.roundContributionCount(circle.currentRound()) * circle.contributionAmount();
        }
        assertEq(usdc.balanceOf(address(circle)), owed, "obligations exceed balance");
    }

    /// @dev Round index never exceeds the member cap and phase machine is monotone.
    function invariant_RoundNeverExceedsCap() public view {
        assertLe(circle.currentRound(), circle.memberCap());
        if (circle.currentRound() == circle.memberCap()) {
            assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.COMPLETED));
        }
    }
}
