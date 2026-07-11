// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {RotaCircle} from "./RotaCircle.sol";
import {GoalPot} from "./GoalPot.sol";
import {ReputationRegistry} from "./ReputationRegistry.sol";

/// @title RotaFactory — deploys RotaCircle and GoalPot clones (EIP-1167)
/// @notice Single entry point for creating circles and pots. Keeps a light on-chain
///         index of deployed addresses; rich data (params, membership, activity)
///         lives in events and in the clones themselves. Also authorizes each clone
///         as a writer on the ReputationRegistry.
contract RotaFactory {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- state

    address public immutable circleImplementation;
    address public immutable goalPotImplementation;
    ReputationRegistry public immutable registry;

    address[] public circles;
    address[] public goalPots;
    mapping(address => bool) public isRotaContract;

    // --------------------------------------------------------------- events

    event CircleCreated(address indexed circle, address indexed organizer, RotaCircle.CircleParams params);
    event GoalPotCreated(address indexed pot, address indexed organizer, GoalPot.PotParams params);

    // --------------------------------------------------------------- errors

    error ZeroAddress();

    constructor(address circleImplementation_, address goalPotImplementation_, address registry_) {
        if (circleImplementation_ == address(0) || goalPotImplementation_ == address(0) || registry_ == address(0)) {
            revert ZeroAddress();
        }
        circleImplementation = circleImplementation_;
        goalPotImplementation = goalPotImplementation_;
        registry = ReputationRegistry(registry_);
    }

    // -------------------------------------------------------------- actions

    /// @notice Deploy a new rotating circle. The caller becomes the organizer and is
    ///         auto-joined as the first member; their collateral is pulled here (the
    ///         clone address is unknown beforehand, so approve THE FACTORY for
    ///         `contributionAmount * collateralBps / 10000` before calling).
    /// @param p Circle configuration (see RotaCircle.CircleParams).
    /// @return circle The deployed clone address.
    function createCircle(RotaCircle.CircleParams calldata p) external returns (address circle) {
        circle = Clones.clone(circleImplementation);
        RotaCircle(circle).initialize(p, msg.sender, address(registry));
        registry.authorize(circle);

        circles.push(circle);
        isRotaContract[circle] = true;
        emit CircleCreated(circle, msg.sender, p);

        uint256 collateral = (p.contributionAmount * p.collateralBps) / 10_000;
        if (collateral > 0) IERC20(p.token).safeTransferFrom(msg.sender, circle, collateral);
    }

    /// @notice Deploy a new goal pot. The caller becomes the organizer (deposits are
    ///         made directly to the pot afterwards — approve the pot, not the factory).
    /// @param p Pot configuration (see GoalPot.PotParams).
    /// @return pot The deployed clone address.
    function createGoalPot(GoalPot.PotParams calldata p) external returns (address pot) {
        pot = Clones.clone(goalPotImplementation);
        GoalPot(pot).initialize(p, msg.sender, address(registry));
        registry.authorize(pot);

        goalPots.push(pot);
        isRotaContract[pot] = true;
        emit GoalPotCreated(pot, msg.sender, p);
    }

    // ---------------------------------------------------------------- views

    function getCircles() external view returns (address[] memory) {
        return circles;
    }

    function getGoalPots() external view returns (address[] memory) {
        return goalPots;
    }

    function circleCount() external view returns (uint256) {
        return circles.length;
    }

    function goalPotCount() external view returns (uint256) {
        return goalPots.length;
    }
}
