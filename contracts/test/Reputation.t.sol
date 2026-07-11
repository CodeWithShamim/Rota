// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./BaseTest.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ReputationTest is BaseTest {
    function test_UnauthorizedWritesRevert() public {
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.recordContribution(users[1]);
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.recordDefault(users[1]);
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.recordCompletion(users[1]);
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.recordCure(users[1]);
        vm.expectRevert(ReputationRegistry.NotAuthorized.selector);
        registry.recordEarlyExit(users[1]);
    }

    function test_AuthorizeOnlyByFactory() public {
        vm.expectRevert(ReputationRegistry.NotFactory.selector);
        registry.authorize(users[1]);
    }

    function test_SetFactoryOnlyOwner() public {
        vm.prank(users[1]);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, users[1]));
        registry.setFactory(users[1]);
    }

    function test_ScoreFormula() public {
        // route writes through an authorized "clone": impersonate the factory to
        // authorize this test contract, then write directly
        vm.prank(address(factory));
        registry.authorize(address(this));

        address u = users[1];
        registry.recordCompletion(u); // +100
        registry.recordContribution(u); // +10
        registry.recordContribution(u); // +10
        registry.recordCure(u); // +20
        registry.recordDefault(u); // -50
        registry.recordEarlyExit(u); // -15

        (ReputationRegistry.Stats memory s, uint256 score) = registry.getScore(u);
        assertEq(s.completions, 1);
        assertEq(s.contributions, 2);
        assertEq(s.cures, 1);
        assertEq(s.defaults, 1);
        assertEq(s.earlyExits, 1);
        assertEq(score, 100 + 20 + 20 - 50 - 15);
    }

    function test_ScoreFlooredAtZero() public {
        vm.prank(address(factory));
        registry.authorize(address(this));
        registry.recordDefault(users[2]);
        registry.recordDefault(users[2]);
        (, uint256 score) = registry.getScore(users[2]);
        assertEq(score, 0);
    }
}
