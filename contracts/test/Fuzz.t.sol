// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";

contract FuzzTest is BaseTest {
    /// @dev Any member count and contribution size: a clean fixed-order lifecycle is
    ///      value-neutral for every member and leaves the circle empty.
    function testFuzz_FixedOrder_FullLifecycle_NetZero(uint8 nSeed, uint96 amountSeed) public {
        uint256 n = 3 + (uint256(nSeed) % 8); // 3..10 (10 funded users)
        uint256 amount = bound(uint256(amountSeed), 1, 1_000e6);

        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, n);
        p.contributionAmount = amount;
        RotaCircle circle = createActiveCircle(p);

        uint256[] memory startBal = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            startBal[i] = usdc.balanceOf(users[i]);
        }

        for (uint256 r; r < n; ++r) {
            for (uint256 i; i < n; ++i) {
                vm.startPrank(users[i]);
                usdc.approve(address(circle), amount);
                circle.contribute();
                vm.stopPrank();
            }
            circle.settleRound();
            assertCircleSolvent(circle);
        }

        for (uint256 i; i < n; ++i) {
            vm.prank(users[i]);
            circle.withdrawCollateral();
            // baseline was taken after collateral escrow, so expect it back on top
            assertEq(usdc.balanceOf(users[i]), startBal[i] + circle.collateralRequired(), "member not made whole");
        }
        assertEq(usdc.balanceOf(address(circle)), 0, "funds stuck");
    }

    /// @dev Bid payout math holds for any discount within bounds.
    function testFuzz_BidDiscountMath(uint16 discountSeed) public {
        uint256 discount = bound(uint256(discountSeed), 1, 3_000);
        uint256 n = 4;
        RotaCircle circle = createActiveCircle(defaultParams(RotaCircle.Mode.BID, n));
        contributeAll(circle, n);
        vm.prank(users[2]);
        circle.placeBid(discount);
        vm.warp(circle.bidWindowEnd(0));

        uint256 before = usdc.balanceOf(users[2]);
        circle.settleRound();

        uint256 pot = n * CONTRIBUTION;
        uint256 cut = (pot * discount) / 10_000;
        uint256 per = cut / n;
        assertEq(usdc.balanceOf(users[2]), before + pot - per * n);
        // conservation of the round: payout + dividends == pot
        uint256 divs;
        for (uint256 i; i < n; ++i) {
            divs += circle.dividendBalance(users[i]);
        }
        assertEq((pot - per * n) + divs, pot);
        assertCircleSolvent(circle);
    }

    /// @dev Early-exit haircut math for arbitrary deposits/haircut settings.
    function testFuzz_GoalPot_EarlyExitHaircut(uint96 depositSeed, uint16 haircutSeed) public {
        uint256 amount = bound(uint256(depositSeed), 1e6, 100_000e6);
        uint256 haircutBps = bound(uint256(haircutSeed), 0, 1_000);

        GoalPot.PotParams memory p = defaultPotParams();
        p.earlyExitHaircutBps = haircutBps;
        p.targetAmount = type(uint128).max; // never auto-unlocks
        GoalPot pot = createPot(p);

        depositAs(pot, users[1], amount);
        depositAs(pot, users[2], amount);

        uint256 haircut = (amount * haircutBps) / 10_000;
        uint256 before = usdc.balanceOf(users[1]);
        vm.prank(users[1]);
        pot.emergencyWithdraw();
        assertEq(usdc.balanceOf(users[1]), before + amount - haircut);

        // remaining member gets principal + full haircut pool after deadline
        vm.warp(pot.deadline() + 1);
        uint256 b2 = usdc.balanceOf(users[2]);
        vm.prank(users[2]);
        pot.withdraw();
        assertEq(usdc.balanceOf(users[2]), b2 + amount + haircut);
        assertEq(usdc.balanceOf(address(pot)), 0);
    }
}
