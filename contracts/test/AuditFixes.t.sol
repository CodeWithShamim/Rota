// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {BlacklistToken} from "./mocks/BlacklistToken.sol";

/// @dev Regression tests for the 2026-07 audit fixes:
///      1. blacklisted payout/giving addresses must not block settleRound
///      2. blacklisted givingRecipient must not block GoalPot withdrawals
///      3. emergencyWithdraw is unavailable once the pot is unlockable
///      4. GoalPot reputation is credited once per member, not per deposit
///      5. implementation contracts cannot be initialized
contract AuditFixesTest is BaseTest {
    BlacklistToken internal blToken;

    function setUp() public override {
        super.setUp();
        blToken = new BlacklistToken();
        for (uint256 i; i < 5; ++i) {
            blToken.mint(users[i], 1_000_000e6);
        }
    }

    function blCircle(uint256 givingBps) internal returns (RotaCircle circle) {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 3);
        p.token = address(blToken);
        p.givingBps = givingBps;
        p.givingRecipient = givingBps > 0 ? charity : address(0);
        vm.startPrank(users[0]);
        blToken.approve(address(factory), CONTRIBUTION);
        circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();
        for (uint256 i = 1; i < 3; ++i) {
            vm.startPrank(users[i]);
            blToken.approve(address(circle), type(uint256).max);
            circle.join();
            vm.stopPrank();
        }
        circle.activate();
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(users[i]);
            blToken.approve(address(circle), type(uint256).max);
            circle.contribute();
            vm.stopPrank();
        }
    }

    // ------------------------------------------------- 1. circle payout DoS

    function test_Settle_BlacklistedRecipient_DefersPayoutInsteadOfBricking() public {
        RotaCircle circle = blCircle(0);
        blToken.setBlacklisted(users[0], true); // round-0 recipient frozen

        circle.settleRound(); // must not revert
        assertEq(circle.currentRound(), 1);
        assertEq(circle.dividendBalance(users[0]), 3 * CONTRIBUTION);

        // once unfrozen, the recipient pulls the deferred payout
        blToken.setBlacklisted(users[0], false);
        uint256 before = blToken.balanceOf(users[0]);
        vm.prank(users[0]);
        circle.withdrawDividends();
        assertEq(blToken.balanceOf(users[0]), before + 3 * CONTRIBUTION);
    }

    function test_Settle_BlacklistedGivingRecipient_DefersCut() public {
        RotaCircle circle = blCircle(500); // 5% giving
        blToken.setBlacklisted(charity, true);

        uint256 pot = 3 * CONTRIBUTION;
        uint256 cut = (pot * 500) / 10_000;
        uint256 before = blToken.balanceOf(users[0]);

        circle.settleRound(); // must not revert
        assertEq(blToken.balanceOf(users[0]), before + pot - cut, "recipient still paid");
        assertEq(circle.dividendBalance(charity), cut, "giving cut deferred");

        blToken.setBlacklisted(charity, false);
        vm.prank(charity);
        circle.withdrawDividends();
        assertEq(blToken.balanceOf(charity), cut);
    }

    // ------------------------------------------------ 2. pot withdrawal DoS

    function test_Pot_BlacklistedGivingRecipient_DoesNotBlockWithdrawals() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.token = address(blToken);
        p.givingBps = 100; // 1%
        p.givingRecipient = charity;
        GoalPot pot = createPot(p);

        vm.startPrank(users[1]);
        blToken.approve(address(pot), type(uint256).max);
        pot.deposit(1_000e6);
        vm.stopPrank();
        pot.unlock();

        blToken.setBlacklisted(charity, true);
        uint256 before = blToken.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.withdraw(); // must not revert
        assertEq(blToken.balanceOf(users[1]), before + 990e6);
        assertEq(pot.pendingGiving(), 10e6);

        blToken.setBlacklisted(charity, false);
        pot.flushGiving();
        assertEq(blToken.balanceOf(charity), 10e6);
        assertEq(pot.pendingGiving(), 0);
    }

    // --------------------------------- 3. early exit once pot is unlockable

    function test_EmergencyWithdraw_BlockedOnceTargetReached() public {
        GoalPot pot = createPot(defaultPotParams()); // target 1000e6
        depositAs(pot, users[1], 1_000e6);
        // target reached but unlock() not yet called: exit must be closed
        vm.prank(users[1]);
        vm.expectRevert(GoalPot.PotUnlocked.selector);
        pot.emergencyWithdraw();
    }

    function test_EmergencyWithdraw_BlockedOnceDeadlinePassed() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 100e6);
        vm.warp(pot.deadline() + 1);
        vm.prank(users[1]);
        vm.expectRevert(GoalPot.PotUnlocked.selector);
        pot.emergencyWithdraw();
    }

    // ------------------------------------------- 4. reputation farming caps

    function test_Pot_RepeatDeposits_CreditReputationOnce() public {
        GoalPot pot = createPot(defaultPotParams());
        for (uint256 i; i < 5; ++i) {
            depositAs(pot, users[1], 1e6);
        }
        (ReputationRegistry.Stats memory s,) = registry.getScore(users[1]);
        assertEq(s.contributions, 1, "dust-deposit farming must not inflate score");
    }

    // ------------------------------------------ 5. implementations locked

    function test_Implementations_CannotBeInitialized() public {
        RotaCircle.CircleParams memory cp = defaultParams(RotaCircle.Mode.FIXED_ORDER, 3);
        vm.expectRevert(RotaCircle.AlreadyInitialized.selector);
        RotaCircle(circleImpl).initialize(cp, users[0], address(registry));

        GoalPot.PotParams memory pp = defaultPotParams();
        vm.expectRevert(GoalPot.AlreadyInitialized.selector);
        GoalPot(potImpl).initialize(pp, users[0], address(registry));
    }
}
