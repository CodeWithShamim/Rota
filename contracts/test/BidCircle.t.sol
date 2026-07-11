// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";

contract BidCircleTest is BaseTest {
    uint256 internal constant N = 4;

    function activeBidCircle() internal returns (RotaCircle circle) {
        circle = createActiveCircle(defaultParams(RotaCircle.Mode.BID, N));
    }

    function bidAs(RotaCircle circle, address user, uint256 bps) internal {
        vm.prank(user);
        circle.placeBid(bps);
    }

    // ------------------------------------------------------------- bidding

    function test_Bid_WinnerGetsDiscountedPot_DividendsCredited() public {
        RotaCircle circle = activeBidCircle();
        contributeAll(circle, N);
        bidAs(circle, users[2], 1_000); // 10% discount

        // settle only after bid window closes
        vm.expectRevert(RotaCircle.TooEarlyToSettle.selector);
        circle.settleRound();
        vm.warp(circle.bidWindowEnd(0));

        uint256 before = usdc.balanceOf(users[2]);
        circle.settleRound();

        uint256 pot = N * CONTRIBUTION;
        uint256 discount = (pot * 1_000) / 10_000;
        uint256 per = discount / N;
        assertEq(usdc.balanceOf(users[2]), before + pot - per * N);
        for (uint256 i; i < N; ++i) {
            assertEq(circle.dividendBalance(users[i]), per);
        }
        assertTrue(circle.hasWon(users[2]));
        assertCircleSolvent(circle);
    }

    function test_Bid_HigherBidReplaces_EqualBidReverts() public {
        RotaCircle circle = activeBidCircle();
        bidAs(circle, users[1], 500);

        // tie broken by earliest: an equal bid is rejected
        vm.prank(users[2]);
        vm.expectRevert(RotaCircle.BidTooLow.selector);
        circle.placeBid(500);

        bidAs(circle, users[2], 501);
        (address bidder, uint16 bps, bool exists) = circle.bestBid(0);
        assertEq(bidder, users[2]);
        assertEq(bps, 501);
        assertTrue(exists);
    }

    function test_Bid_BoundsAndEligibility() public {
        RotaCircle circle = activeBidCircle();

        vm.prank(users[1]);
        vm.expectRevert(RotaCircle.BidTooHigh.selector);
        circle.placeBid(3_001);

        vm.prank(users[5]);
        vm.expectRevert(RotaCircle.NotMember.selector);
        circle.placeBid(100);

        // after the window closes, bids revert
        vm.warp(circle.bidWindowEnd(0));
        vm.prank(users[1]);
        vm.expectRevert(RotaCircle.NotInBidWindow.selector);
        circle.placeBid(100);
    }

    function test_Bid_WinnerCannotBidAgain() public {
        RotaCircle circle = activeBidCircle();
        contributeAll(circle, N);
        bidAs(circle, users[1], 100);
        vm.warp(circle.bidWindowEnd(0));
        circle.settleRound();

        // round 1: users[1] already won
        vm.prank(users[1]);
        vm.expectRevert(RotaCircle.NotEligibleToBid.selector);
        circle.placeBid(200);
    }

    function test_NoBids_FallbackToJoinOrder() public {
        RotaCircle circle = activeBidCircle();
        contributeAll(circle, N);
        vm.warp(circle.bidWindowEnd(0));
        uint256 before = usdc.balanceOf(users[0]);
        circle.settleRound();
        // no bids → first non-winner in join order
        assertEq(usdc.balanceOf(users[0]), before + N * CONTRIBUTION);
        assertTrue(circle.hasWon(users[0]));
    }

    function test_BidderWhoDefaultsFallsBack() public {
        RotaCircle circle = activeBidCircle();
        bidAs(circle, users[3], 2_000);
        // users[3] never contributes; everyone else does
        for (uint256 i; i < N - 1; ++i) {
            contributeAs(circle, users[i]);
        }
        vm.warp(circle.roundDeadline(0));
        uint256 before = usdc.balanceOf(users[0]);
        circle.settleRound();

        assertTrue(circle.inDefault(users[3]));
        // bidder ineligible → fallback recipient users[0]; pot covered by slash
        // (`before` was captured after users[0] contributed)
        assertEq(usdc.balanceOf(users[0]), before + N * CONTRIBUTION);
        assertFalse(circle.hasWon(users[3]));
        assertCircleSolvent(circle);
    }

    // --------------------------------------------------- accounting/lifecycle

    /// @dev Per-round conservation: payout + credited dividends + giving == pot inflows.
    function test_DividendAccounting_FullLifecycleConserved() public {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.BID, N);
        p.givingBps = 200;
        p.givingRecipient = charity;
        RotaCircle circle = createActiveCircle(p);

        uint256[] memory startBal = new uint256[](N);
        for (uint256 i; i < N; ++i) {
            startBal[i] = usdc.balanceOf(users[i]);
        }

        uint256[4] memory bids = [uint256(1_500), 700, 0, 0]; // last rounds: no bids
        for (uint256 r; r < N; ++r) {
            // bid windows are schedule-anchored: move to the round's scheduled start
            uint256 roundStart = circle.startTime() + r * circle.roundDuration();
            if (block.timestamp < roundStart) vm.warp(roundStart);
            contributeAll(circle, N);
            if (bids[r] > 0) {
                // an eligible (non-winner) member bids: pick the highest-indexed non-winner
                for (uint256 i = N; i > 0; --i) {
                    if (!circle.hasWon(users[i - 1])) {
                        bidAs(circle, users[i - 1], bids[r]);
                        break;
                    }
                }
            }
            vm.warp(circle.bidWindowEnd(r));
            circle.settleRound();
            assertCircleSolvent(circle);
        }
        assertEq(uint8(circle.phase()), uint8(RotaCircle.Phase.COMPLETED));

        // everyone won exactly once
        for (uint256 i; i < N; ++i) {
            assertTrue(circle.hasWon(users[i]));
        }

        // drain all balances
        for (uint256 i; i < N; ++i) {
            vm.startPrank(users[i]);
            if (circle.dividendBalance(users[i]) > 0) circle.withdrawDividends();
            circle.withdrawCollateral();
            vm.stopPrank();
        }
        assertEq(usdc.balanceOf(address(circle)), 0, "funds stuck in circle");

        // global conservation: member deltas + charity == returned collateral
        // (collateral entered escrow before the baseline snapshot was taken)
        int256 memberDelta;
        for (uint256 i; i < N; ++i) {
            memberDelta += int256(usdc.balanceOf(users[i])) - int256(startBal[i]);
        }
        // casting to 'int256' is safe: test amounts are far below 2^255
        // forge-lint: disable-next-line(unsafe-typecast)
        int256 totalCollateral = int256(N * circle.collateralRequired());
        assertEq(memberDelta + int256(usdc.balanceOf(charity)), totalCollateral, "value created or destroyed");
    }

    function test_Settle_DeadlineOverridesBidWindowWait() public {
        RotaCircle circle = activeBidCircle();
        // nobody contributes at all; deadline passes → settle slashes everyone
        vm.warp(circle.roundDeadline(0));
        circle.settleRound();
        // all in default → pot distributed as dividends to nobody eligible → carried
        assertEq(circle.penaltyCarry(), N * CONTRIBUTION);
        assertCircleSolvent(circle);
    }
}
