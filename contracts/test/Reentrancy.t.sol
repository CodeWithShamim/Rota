// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";
import {MaliciousToken} from "./mocks/MaliciousToken.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ReentrancyTest is BaseTest {
    MaliciousToken internal evil;

    function setUp() public override {
        super.setUp();
        evil = new MaliciousToken();
        for (uint256 i; i < 5; ++i) {
            evil.mint(users[i], 1_000_000e6);
        }
    }

    function evilCircle(bool activate_) internal returns (RotaCircle circle) {
        RotaCircle.CircleParams memory p = defaultParams(RotaCircle.Mode.FIXED_ORDER, 3);
        p.token = address(evil);
        vm.startPrank(users[0]);
        evil.approve(address(factory), CONTRIBUTION);
        circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();
        for (uint256 i = 1; i < 3; ++i) {
            vm.startPrank(users[i]);
            evil.approve(address(circle), type(uint256).max);
            circle.join();
            vm.stopPrank();
        }
        if (activate_) circle.activate();
    }

    function test_SettleRound_ReentrantTokenCannotBlockOrDoubleSettle() public {
        RotaCircle circle = evilCircle(true);
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(users[i]);
            evil.approve(address(circle), type(uint256).max);
            circle.contribute();
            vm.stopPrank();
        }
        // during the payout transfer, the token re-enters settleRound; the guard
        // makes the reentrant call (and thus the whole transfer) revert, so the
        // payout is deferred to the recipient's dividend balance instead — the
        // hostile token can neither double-settle nor block settlement
        evil.setAttack(address(circle), abi.encodeCall(RotaCircle.settleRound, ()));
        circle.settleRound();
        assertEq(circle.currentRound(), 1, "settled exactly once");
        assertEq(circle.dividendBalance(users[0]), 3 * CONTRIBUTION, "payout deferred");

        // once the token behaves again, the recipient can pull the deferred payout
        evil.setAttack(address(0), "");
        uint256 before = evil.balanceOf(users[0]);
        vm.prank(users[0]);
        circle.withdrawDividends();
        assertEq(evil.balanceOf(users[0]), before + 3 * CONTRIBUTION);
    }

    function test_WithdrawDividends_ReentrancyBlocked() public {
        RotaCircle circle = evilCircle(true);
        for (uint256 i; i < 3; ++i) {
            vm.startPrank(users[i]);
            evil.approve(address(circle), type(uint256).max);
            circle.contribute();
            vm.stopPrank();
        }
        evil.setAttack(address(circle), abi.encodeCall(RotaCircle.settleRound, ()));
        circle.settleRound(); // payout deferred to users[0]'s dividend balance

        evil.setAttack(address(circle), abi.encodeCall(RotaCircle.withdrawDividends, ()));
        vm.prank(users[0]);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        circle.withdrawDividends();
    }

    function test_WithdrawCollateral_ReentrancyBlocked() public {
        RotaCircle circle = evilCircle(false); // stay in OPEN so cancel() works
        vm.prank(users[0]);
        circle.cancel();

        evil.setAttack(address(circle), abi.encodeCall(RotaCircle.withdrawCollateral, ()));
        vm.prank(users[1]);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        circle.withdrawCollateral();
    }

    function test_GoalPot_WithdrawReentrancyBlocked() public {
        GoalPot.PotParams memory p = defaultPotParams();
        p.token = address(evil);
        vm.prank(users[0]);
        GoalPot pot = GoalPot(factory.createGoalPot(p));

        vm.startPrank(users[1]);
        evil.approve(address(pot), type(uint256).max);
        pot.deposit(1_000e6);
        vm.stopPrank();
        pot.unlock();

        evil.setAttack(address(pot), abi.encodeCall(GoalPot.withdraw, ()));
        vm.prank(users[1]);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        pot.withdraw();
    }
}
