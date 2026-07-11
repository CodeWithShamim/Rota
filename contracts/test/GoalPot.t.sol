// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {GoalPot} from "../src/GoalPot.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract GoalPotTest is BaseTest {
    function test_Deposit_JoinsAndTracksLedger() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 300e6);
        depositAs(pot, users[1], 100e6); // top-up
        depositAs(pot, users[2], 200e6);

        assertEq(pot.memberCount(), 2);
        assertEq(pot.deposited(users[1]), 400e6);
        assertEq(pot.totalDeposited(), 600e6);
        assertEq(pot.progressBps(), 6_000);
        assertEq(usdc.balanceOf(address(pot)), 600e6);
    }

    function test_Deposit_MinContributionEnforced() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.minContribution = 50e6;
        GoalPot pot = createPot(p);
        vm.startPrank(users[1]);
        usdc.approve(address(pot), 40e6);
        vm.expectRevert(GoalPot.BelowMinContribution.selector);
        pot.deposit(40e6);
        vm.stopPrank();
    }

    function test_Deposit_MemberCapEnforced() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.memberCap = 2;
        GoalPot pot = createPot(p);
        depositAs(pot, users[1], 100e6);
        depositAs(pot, users[2], 100e6);
        vm.startPrank(users[3]);
        usdc.approve(address(pot), 100e6);
        vm.expectRevert(GoalPot.PotFull.selector);
        pot.deposit(100e6);
        vm.stopPrank();
    }

    function test_Deposit_InviteOnly() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.inviteOnly = true;
        GoalPot pot = createPot(p);

        vm.startPrank(users[1]);
        usdc.approve(address(pot), 100e6);
        vm.expectRevert(GoalPot.NotInvited.selector);
        pot.deposit(100e6);
        vm.stopPrank();

        address[] memory invitees = new address[](1);
        invitees[0] = users[1];
        vm.prank(users[0]);
        pot.setAllowlist(invitees, true);
        depositAs(pot, users[1], 100e6);
        assertEq(pot.deposited(users[1]), 100e6);
    }

    function test_Unlock_OnTargetReached_BlocksFurtherDeposits() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 600e6);
        depositAs(pot, users[2], 400e6); // exactly reaches 1000e6 target

        assertTrue(pot.unlockable());
        vm.startPrank(users[3]);
        usdc.approve(address(pot), 100e6);
        vm.expectRevert(GoalPot.PotUnlocked.selector);
        pot.deposit(100e6);
        vm.stopPrank();

        pot.unlock();
        assertEq(uint8(pot.phase()), uint8(GoalPot.Phase.UNLOCKED));
        assertTrue(pot.targetReached());
    }

    function test_Unlock_TooEarlyReverts() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 100e6);
        vm.expectRevert(GoalPot.CannotUnlockYet.selector);
        pot.unlock();
    }

    function test_Unlock_OnDeadline_NoCompletionCredit() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 100e6);
        vm.warp(pot.deadline() + 1);

        uint256 before = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.withdraw(); // lazily unlocks
        assertEq(usdc.balanceOf(users[1]), before + 100e6);
        assertFalse(pot.targetReached());
        (ReputationRegistry.Stats memory s,) = registry.getScore(users[1]);
        assertEq(s.completions, 0);
        assertEq(s.contributions, 1);
    }

    function test_Withdraw_ExactDeposits_CompletionRecorded() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 700e6);
        depositAs(pot, users[2], 300e6);
        pot.unlock();

        uint256 b1 = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[1]), b1 + 700e6);

        uint256 b2 = usdc.balanceOf(users[2]);
        vm.prank(users[2]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[2]), b2 + 300e6);
        assertEq(usdc.balanceOf(address(pot)), 0);

        (ReputationRegistry.Stats memory s,) = registry.getScore(users[1]);
        assertEq(s.completions, 1);
    }

    function test_Withdraw_TwiceReverts() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 1_000e6);
        vm.startPrank(users[1]);
        pot.withdraw();
        vm.expectRevert(GoalPot.NothingToWithdraw.selector);
        pot.withdraw();
        vm.stopPrank();
    }

    function test_EmergencyWithdraw_HaircutSharedProRata() public {
        GoalPot pot = createPot(defaultPotParams()); // 2% haircut
        depositAs(pot, users[1], 400e6);
        depositAs(pot, users[2], 300e6);
        depositAs(pot, users[3], 100e6);

        // users[3] bails early: gets 98, leaves 2 behind
        uint256 b3 = usdc.balanceOf(users[3]);
        vm.prank(users[3]);
        pot.emergencyWithdraw();
        assertEq(usdc.balanceOf(users[3]), b3 + 98e6);
        assertEq(pot.totalHaircut(), 2e6);
        assertEq(pot.deposited(users[3]), 0);
        (ReputationRegistry.Stats memory s,) = registry.getScore(users[3]);
        assertEq(s.earlyExits, 1);

        // remaining 700 total; deposit 300 more to hit target, then unlock
        depositAs(pot, users[2], 300e6);
        pot.unlock();

        // users[1] share of haircut: 2e6 * 400/1000 = 0.8e6
        uint256 b1 = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[1]), b1 + 400e6 + (2e6 * 400e6) / 1_000e6);

        // users[2] share: 2e6 * 600/1000 = 1.2e6
        uint256 b2 = usdc.balanceOf(users[2]);
        vm.prank(users[2]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[2]), b2 + 600e6 + (2e6 * 600e6) / 1_000e6);
        assertEq(usdc.balanceOf(address(pot)), 0, "dust beyond expected");
    }

    function test_EmergencyWithdraw_BlockedAfterUnlock() public {
        GoalPot pot = createPot(defaultPotParams());
        depositAs(pot, users[1], 1_000e6);
        pot.unlock();
        vm.prank(users[1]);
        vm.expectRevert(GoalPot.PotUnlocked.selector);
        pot.emergencyWithdraw();
    }

    function test_Withdraw_GivingCutTaken() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.givingBps = 100; // 1%
        p.givingRecipient = charity;
        GoalPot pot = createPot(p);
        depositAs(pot, users[1], 1_000e6);
        pot.unlock();

        uint256 before = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[1]), before + 990e6);
        assertEq(usdc.balanceOf(charity), 10e6);
    }

    function test_Initialize_OnlyOnceAndValidated() public {
        GoalPot pot = createPot(defaultPotParams());
        vm.expectRevert(GoalPot.AlreadyInitialized.selector);
        pot.initialize(defaultPotParams(), users[0], address(registry));

        GoalPot.PotParams memory bad = defaultPotParams();
        bad.targetAmount = 0;
        vm.prank(users[0]);
        vm.expectRevert(GoalPot.InvalidParams.selector);
        factory.createGoalPot(bad);

        bad = defaultPotParams();
        bad.earlyExitHaircutBps = 1_001;
        vm.prank(users[0]);
        vm.expectRevert(GoalPot.InvalidParams.selector);
        factory.createGoalPot(bad);
    }
}
