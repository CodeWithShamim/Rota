// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {RotaFactory} from "../src/RotaFactory.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";

abstract contract BaseTest is Test {
    MockUSDC internal usdc;
    ReputationRegistry internal registry;
    RotaFactory internal factory;
    address internal circleImpl;
    address internal potImpl;

    address internal charity = makeAddr("charity");
    address[] internal users;

    uint256 internal constant CONTRIBUTION = 100e6; // 100 USDC
    uint256 internal constant ROUND = 7 days;
    uint256 internal constant COLLATERAL_BPS = 10_000; // 1x contribution

    function setUp() public virtual {
        vm.warp(30 days); // move away from t=0 so openDeadline math is sane
        usdc = new MockUSDC();
        registry = new ReputationRegistry();
        circleImpl = address(new RotaCircle());
        potImpl = address(new GoalPot());
        factory = new RotaFactory(circleImpl, potImpl, address(registry));
        registry.setFactory(address(factory));

        for (uint256 i; i < 10; ++i) {
            address u = makeAddr(string(abi.encodePacked("user", vm.toString(i))));
            users.push(u);
            usdc.mint(u, 1_000_000e6);
        }
    }

    // ------------------------------------------------------------- helpers

    function defaultParams(RotaCircle.Mode mode, uint256 n)
        internal
        view
        returns (RotaCircle.CircleParams memory p)
    {
        p = RotaCircle.CircleParams({
            token: address(usdc),
            contributionAmount: CONTRIBUTION,
            memberCap: n,
            roundDuration: ROUND,
            mode: mode,
            collateralBps: COLLATERAL_BPS,
            givingBps: 0,
            givingRecipient: address(0),
            bidWindowBps: mode == RotaCircle.Mode.BID ? 3_000 : 0, // first 30% of round
            maxDiscountBps: mode == RotaCircle.Mode.BID ? 3_000 : 0,
            openDeadline: block.timestamp + 30 days,
            inviteOnly: false,
            name: "Test Circle"
        });
    }

    /// @dev users[0] organizes; users[0..n-1] join; not activated.
    function createFullCircle(RotaCircle.CircleParams memory p) internal returns (RotaCircle circle) {
        uint256 coll = (p.contributionAmount * p.collateralBps) / 10_000;
        vm.startPrank(users[0]);
        usdc.approve(address(factory), coll);
        circle = RotaCircle(factory.createCircle(p));
        vm.stopPrank();
        for (uint256 i = 1; i < p.memberCap; ++i) {
            vm.startPrank(users[i]);
            usdc.approve(address(circle), coll);
            circle.join();
            vm.stopPrank();
        }
    }

    function createActiveCircle(RotaCircle.CircleParams memory p) internal returns (RotaCircle circle) {
        circle = createFullCircle(p);
        circle.activate();
    }

    function contributeAll(RotaCircle circle, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            vm.startPrank(users[i]);
            usdc.approve(address(circle), circle.contributionAmount());
            circle.contribute();
            vm.stopPrank();
        }
    }

    function contributeAs(RotaCircle circle, address user) internal {
        vm.startPrank(user);
        usdc.approve(address(circle), circle.contributionAmount());
        circle.contribute();
        vm.stopPrank();
    }

    function defaultPotParams() internal view returns (GoalPot.PotParams memory p) {
        p = GoalPot.PotParams({
            token: address(usdc),
            targetAmount: 1_000e6,
            deadline: block.timestamp + 60 days,
            memberCap: 0,
            minContribution: 0,
            earlyExitHaircutBps: 200, // 2%
            givingBps: 0,
            givingRecipient: address(0),
            inviteOnly: false,
            name: "Test Pot"
        });
    }

    function createPot(GoalPot.PotParams memory p) internal returns (GoalPot pot) {
        vm.prank(users[0]);
        pot = GoalPot(factory.createGoalPot(p));
    }

    function depositAs(GoalPot pot, address user, uint256 amount) internal {
        vm.startPrank(user);
        usdc.approve(address(pot), amount);
        pot.deposit(amount);
        vm.stopPrank();
    }

    /// @dev Accounting identity that must hold for a circle at all times:
    ///      balance == Σcollateral + Σdividends + penaltyCarry + currentRoundContributions
    function assertCircleSolvent(RotaCircle circle) internal view {
        uint256 n = circle.memberCount();
        uint256 owed = circle.penaltyCarry();
        for (uint256 i; i < n; ++i) {
            address m = circle.members(i);
            owed += circle.collateralBalance(m) + circle.dividendBalance(m);
        }
        if (circle.phase() == RotaCircle.Phase.ACTIVE) {
            uint256 r = circle.currentRound();
            owed += circle.roundContributionCount(r) * circle.contributionAmount();
        }
        assertEq(usdc.balanceOf(address(circle)), owed, "circle accounting identity broken");
    }
}
