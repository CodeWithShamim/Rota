// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";

contract RotaCircleTest is BaseTest {
    // ------------------------------------------------------------ creation

    function test_CreateCircle_OrganizerAutoJoinsWithCollateral() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();

        assertEq(circle.memberCount(), 1);
        assertEq(circle.members(0), users[0]);
        assertEq(circle.collateralBalance(users[0]), CONTRIBUTION);
        assertEq(usdc.balanceOf(address(circle)), CONTRIBUTION);
        assertTrue(registry.authorized(address(circle)));
        assertCircleSolvent(circle);
    }

    function test_CreateCircle_InvalidParamsRevert() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 2); // below MIN_MEMBERS
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        vm.expectRevert(RotaCircle.InvalidParams.selector);
        factory.createCircle(p);

        p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 21);
        vm.expectRevert(RotaCircle.InvalidParams.selector);
        factory.createCircle(p);

        p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        p.givingBps = 501;
        vm.expectRevert(RotaCircle.InvalidParams.selector);
        factory.createCircle(p);

        p = defaultParams(RotaCircle.Mode.BID, 4);
        p.maxDiscountBps = 3_001;
        vm.expectRevert(RotaCircle.InvalidParams.selector);
        factory.createCircle(p);
        vm.stopPrank();
    }

    function test_Initialize_OnlyOnce() public {
        RotaCircle circle = createFullCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4));
        vm.expectRevert(RotaCircle.AlreadyInitialized.selector);
        circle.initialize(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4), users[0], address(registry));
    }

    // ---------------------------------------------------------------- join

    function test_Join_EscrowsCollateral() public {
        RotaCircle circle = createFullCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4));
        assertEq(circle.memberCount(), 4);
        assertEq(usdc.balanceOf(address(circle)), 4 * CONTRIBUTION);
        assertCircleSolvent(circle);
    }

    function test_Join_RevertsWhenFull() public {
        RotaCircle circle = createFullCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4));
        vm.startPrank(users[5]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.CircleFull.selector);
        circle.join();
        vm.stopPrank();
    }

    function test_Join_RevertsForExistingMember() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.AlreadyMember.selector);
        circle.join();
        vm.stopPrank();
    }

    function test_Join_InviteOnly() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 3);
        p.inviteOnly = true;
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();

        vm.startPrank(users[1]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.NotInvited.selector);
        circle.join();
        vm.stopPrank();

        address[] memory invitees = new address[](2);
        invitees[0] = users[1];
        invitees[1] = users[2];
        vm.prank(users[1]);
        vm.expectRevert(RotaCircle.NotOrganizer.selector);
        circle.setAllowlist(invitees, true);

        vm.prank(users[0]);
        circle.setAllowlist(invitees, true);

        vm.startPrank(users[1]);
        circle.join();
        vm.stopPrank();
        assertEq(circle.memberCount(), 2);
    }

    // ------------------------------------------------------------ activate

    function test_Activate_RevertsUntilFull() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();
        vm.expectRevert(RotaCircle.CircleNotFull.selector);
        circle.activate();
    }

    function test_Activate_FixedOrderIsJoinOrder() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4));
        address[] memory order = circle.getPayoutOrder();
        for (uint256 i; i < 4; ++i) {
            assertEq(order[i], users[i]);
        }
        assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.ACTIVE));
    }

    function test_Activate_RandomOrderIsPermutation() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.RANDOM_ORDER, 5));
        address[] memory order = circle.getPayoutOrder();
        assertEq(order.length, 5);
        // every member appears exactly once
        for (uint256 i; i < 5; ++i) {
            uint256 count;
            for (uint256 j; j < 5; ++j) {
                if (order[j] == users[i]) ++count;
            }
            assertEq(count, 1, "not a permutation");
        }
    }

    function test_Join_RevertsAfterActivation() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 4));
        vm.startPrank(users[5]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.WrongPhase.selector);
        circle.join();
        vm.stopPrank();
    }

    // ---------------------------------------------------- full happy path

    function test_FullLifecycle_FixedOrder() public {
        uint256 n = 4;
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, n));
        uint256[] memory startBal = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            startBal[i] = usdc.balanceOf(users[i]);
        }

        for (uint256 r; r < n; ++r) {
            uint256 recipientBefore = usdc.balanceOf(users[r]);
            contributeAll(circle, n);
            assertCircleSolvent(circle);
            circle.settleRound();
            assertCircleSolvent(circle);
            // fixed order: round r pays users[r]; they contributed too, so net +pot-contribution
            assertEq(usdc.balanceOf(users[r]), recipientBefore - CONTRIBUTION + n * CONTRIBUTION);
            assertEq(circle.currentRound(), r + 1);
        }

        assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.COMPLETED));
        for (uint256 i; i < n; ++i) {
            vm.prank(users[i]);
            circle.withdrawCollateral();
            // everyone paid N contributions and received one pot of N contributions,
            // plus their collateral back: net change vs post-join baseline = +collateral
            assertEq(usdc.balanceOf(users[i]), startBal[i] + circle.collateralRequired());
        }
        assertEq(usdc.balanceOf(address(circle)), 0);

        // reputation: N contributions + 1 completion each
        (ReputationRegistry.Stats memory s, uint256 score) = registry.getScore(users[1]);
        // casting to 'uint64' is safe: n <= MAX_MEMBERS (20)
        // forge-lint: disable-next-line(unsafe-typecast)
        assertEq(s.contributions, uint64(n));
        assertEq(s.completions, 1);
        assertEq(score, 100 + n * 10);
    }

    function test_EarlySettle_WhenAllContributed() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        contributeAll(circle, 3);
        circle.settleRound(); // no warp needed
        assertEq(circle.currentRound(), 1);
    }

    function test_Settle_TooEarlyReverts() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        contributeAs(circle, users[0]);
        vm.expectRevert(RotaCircle.TooEarlyToSettle.selector);
        circle.settleRound();
    }

    // ---------------------------------------------------------- contribute

    function test_Contribute_TwiceReverts() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        contributeAs(circle, users[0]);
        vm.startPrank(users[0]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.AlreadyContributed.selector);
        circle.contribute();
        vm.stopPrank();
    }

    function test_Contribute_AfterDeadlineReverts() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.warp(circle.roundDeadline(0));
        vm.startPrank(users[0]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.RoundClosed.selector);
        circle.contribute();
        vm.stopPrank();
    }

    function test_Contribute_NonMemberReverts() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.startPrank(users[5]);
        usdc.approve(address(circle), CONTRIBUTION);
        vm.expectRevert(RotaCircle.NotMember.selector);
        circle.contribute();
        vm.stopPrank();
    }

    // -------------------------------------------------------------- giving

    function test_GivingCut_PaidEachRound() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        p.givingBps = 250; // 2.5%
        p.givingRecipient = charity;
        RotaCircle circle = createActiveCircle(p);

        contributeAll(circle, 4);
        uint256 recipientBefore = usdc.balanceOf(users[0]);
        circle.settleRound();

        uint256 pot = 4 * CONTRIBUTION;
        uint256 cut = (pot * 250) / 10_000;
        assertEq(usdc.balanceOf(charity), cut);
        assertEq(usdc.balanceOf(users[0]), recipientBefore + pot - cut);
        assertCircleSolvent(circle);
    }

    // ------------------------------------------------------------- autopay

    function test_AutoPay_KeeperPullsExactAmountOncePerRound() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.startPrank(users[1]);
        usdc.approve(address(circle), type(uint256).max);
        circle.optInAutoPay();
        vm.stopPrank();

        uint256 before = usdc.balanceOf(users[1]);
        vm.prank(users[9]); // arbitrary keeper
        circle.pullContribution(users[1]);
        assertEq(usdc.balanceOf(users[1]), before - CONTRIBUTION); // exact amount only
        assertTrue(circle.hasContributed(0, users[1]));

        vm.prank(users[9]);
        vm.expectRevert(RotaCircle.AlreadyContributed.selector);
        circle.pullContribution(users[1]); // once per round
        assertCircleSolvent(circle);
    }

    function test_AutoPay_RequiresOptIn_AndOptOutRespected() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[9]);
        vm.expectRevert(RotaCircle.NotOptedIn.selector);
        circle.pullContribution(users[1]);

        vm.startPrank(users[1]);
        usdc.approve(address(circle), type(uint256).max);
        circle.optInAutoPay();
        circle.optOutAutoPay();
        vm.stopPrank();

        vm.prank(users[9]);
        vm.expectRevert(RotaCircle.NotOptedIn.selector);
        circle.pullContribution(users[1]);
    }

    function test_AutoPay_WindowEnforced() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.startPrank(users[1]);
        usdc.approve(address(circle), type(uint256).max);
        circle.optInAutoPay();
        vm.stopPrank();

        vm.warp(circle.roundDeadline(0));
        vm.prank(users[9]);
        vm.expectRevert(RotaCircle.RoundClosed.selector);
        circle.pullContribution(users[1]);
    }

    function test_AutoPay_NonMemberCannotOptIn() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[5]);
        vm.expectRevert(RotaCircle.NotMember.selector);
        circle.optInAutoPay();
    }

    // ------------------------------------------------------ default & cure

    function test_Default_SlashCoversPot_RecipientPaidInFull() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        // users[1] and users[2]... only users[1] misses round 0
        contributeAs(circle, users[0]);
        contributeAs(circle, users[2]);

        vm.warp(circle.roundDeadline(0));
        uint256 before = usdc.balanceOf(users[0]);
        circle.settleRound();

        // collateral (1x contribution) fully covers the miss → full pot
        assertEq(usdc.balanceOf(users[0]), before + 3 * CONTRIBUTION);
        assertTrue(circle.inDefault(users[1]));
        assertEq(circle.collateralBalance(users[1]), 0);
        assertEq(circle.slashedAmount(users[1]), CONTRIBUTION);
        assertEq(circle.shortfallAmount(users[1]), 0);
        (ReputationRegistry.Stats memory s,) = registry.getScore(users[1]);
        assertEq(s.defaults, 1);
        assertCircleSolvent(circle);
    }

    function test_Default_MemberSkippedForPayoutUntilCured() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        // users[0] (first in payout order) misses round 0
        contributeAs(circle, users[1]);
        contributeAs(circle, users[2]);
        vm.warp(circle.roundDeadline(0));

        uint256 u1Before = usdc.balanceOf(users[1]);
        circle.settleRound();
        // users[0] skipped; users[1] (next in order) receives
        assertEq(usdc.balanceOf(users[1]), u1Before + 3 * CONTRIBUTION);
        assertTrue(circle.hasWon(users[1]));
        assertFalse(circle.hasWon(users[0]));
    }

    function test_CureDefault_RestoresCollateralAndEligibility() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        contributeAs(circle, users[1]);
        contributeAs(circle, users[2]);
        vm.warp(circle.roundDeadline(0));
        circle.settleRound(); // users[0] defaults, users[1] wins round 0

        uint256 cost = circle.cureCost(users[0]);
        assertEq(cost, CONTRIBUTION + (CONTRIBUTION * 500) / 10_000); // slashed + 5%

        vm.startPrank(users[0]);
        usdc.approve(address(circle), cost);
        circle.cureDefault();
        vm.stopPrank();

        assertFalse(circle.inDefault(users[0]));
        assertEq(circle.collateralBalance(users[0]), CONTRIBUTION);
        assertEq(circle.penaltyCarry(), (CONTRIBUTION * 500) / 10_000);
        (ReputationRegistry.Stats memory s,) = registry.getScore(users[0]);
        assertEq(s.cures, 1);
        assertCircleSolvent(circle);

        // round 1: everyone contributes; users[0] is first eligible non-winner → paid,
        // and the pot includes the cure penalty
        contributeAll(circle, 3);
        uint256 before = usdc.balanceOf(users[0]);
        circle.settleRound();
        assertEq(usdc.balanceOf(users[0]), before + 3 * CONTRIBUTION + (CONTRIBUTION * 500) / 10_000);
        assertCircleSolvent(circle);
    }

    function test_Default_ShortfallWhenCollateralInsufficient() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 3);
        p.collateralBps = 5_000; // collateral = 0.5x contribution
        RotaCircle circle = createActiveCircle(p);

        contributeAs(circle, users[0]);
        contributeAs(circle, users[2]);
        vm.warp(circle.roundDeadline(0));
        uint256 before = usdc.balanceOf(users[0]);
        circle.settleRound();

        // pot = 2 contributions + 0.5 collateral slash → recipient shorted
        assertEq(usdc.balanceOf(users[0]), before + 2 * CONTRIBUTION + CONTRIBUTION / 2);
        assertEq(circle.shortfallAmount(users[1]), CONTRIBUTION / 2);
        assertCircleSolvent(circle);
    }

    function test_CureDefault_RevertsIfNotInDefault() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[0]);
        vm.expectRevert(RotaCircle.NotInDefault.selector);
        circle.cureDefault();
    }

    // ------------------------------------------------------------- cancel

    function test_Cancel_ByOrganizerBeforeDeadline_RefundsCollateral() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();
        vm.startPrank(users[1]);
        usdc.approve(address(circle), CONTRIBUTION);
        circle.join();
        vm.stopPrank();

        vm.prank(users[0]);
        circle.cancel();
        assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.CANCELLED));

        uint256 before = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        circle.withdrawCollateral();
        assertEq(usdc.balanceOf(users[1]), before + CONTRIBUTION);
    }

    function test_Cancel_ByAnyoneOnlyAfterOpenDeadline() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 4);
        vm.startPrank(users[0]);
        usdc.approve(address(factory), CONTRIBUTION);
        RotaCircle circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();

        vm.prank(users[5]);
        vm.expectRevert(RotaCircle.OpenDeadlineNotReached.selector);
        circle.cancel();

        vm.warp(p.openDeadline + 1);
        vm.prank(users[5]);
        circle.cancel();
        assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.CANCELLED));
    }

    function test_Cancel_RevertsOnceActive() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[0]);
        vm.expectRevert(RotaCircle.WrongPhase.selector);
        circle.cancel();
    }

    // ----------------------------------------------------------- terminal

    function test_WithdrawCollateral_OnlyInTerminalPhase() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[0]);
        vm.expectRevert(RotaCircle.WrongPhase.selector);
        circle.withdrawCollateral();
    }

    function test_WithdrawDividends_RevertsWhenEmpty() public {
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.FIXED_ORDER, 3));
        vm.prank(users[0]);
        vm.expectRevert(RotaCircle.NothingToWithdraw.selector);
        circle.withdrawDividends();
    }
}
