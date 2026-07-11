// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";
import {RotaFactory} from "../src/RotaFactory.sol";
import {ArcConfig} from "./config/ArcConfig.sol";

/// @notice Arc Testnet deployment. Uses the REAL USDC ERC-20 interface (no mock).
///         Requires PRIVATE_KEY in the environment; the deployer pays gas in USDC
///         (fund it at https://faucet.circle.com). Writes deployments/arc.json.
contract DeployArc is Script {
    error WrongChain();

    function run() external {
        if (block.chainid != ArcConfig.TESTNET_CHAIN_ID) revert WrongChain();

        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        ReputationRegistry registry = new ReputationRegistry();
        RotaCircle circleImpl = new RotaCircle();
        GoalPot potImpl = new GoalPot();
        RotaFactory factory = new RotaFactory(address(circleImpl), address(potImpl), address(registry));
        registry.setFactory(address(factory));

        vm.stopBroadcast();

        string memory json = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(ArcConfig.TESTNET_CHAIN_ID), ',\n',
            '  "usdc": "', vm.toString(ArcConfig.TESTNET_USDC), '",\n',
            '  "reputationRegistry": "', vm.toString(address(registry)), '",\n',
            '  "circleImplementation": "', vm.toString(address(circleImpl)), '",\n',
            '  "goalPotImplementation": "', vm.toString(address(potImpl)), '",\n',
            '  "factory": "', vm.toString(address(factory)), '"\n',
            "}\n"
        );
        vm.writeFile("deployments/arc.json", json);
    }
}
