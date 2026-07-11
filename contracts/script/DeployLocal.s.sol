// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {ReputationRegistry} from "../src/ReputationRegistry.sol";
import {RotaCircle} from "../src/RotaCircle.sol";
import {GoalPot} from "../src/GoalPot.sol";
import {RotaFactory} from "../src/RotaFactory.sol";

/// @notice Local (anvil) deployment: MockUSDC + registry + implementations + factory.
///         Mints 100k USDC to the first ten anvil accounts and writes
///         deployments/local.json (consumed by scripts/abi-sync.mjs).
contract DeployLocal is Script {
    function run() external {
        vm.startBroadcast();

        MockUSDC usdc = new MockUSDC();
        ReputationRegistry registry = new ReputationRegistry();
        RotaCircle circleImpl = new RotaCircle();
        GoalPot potImpl = new GoalPot();
        RotaFactory factory = new RotaFactory(address(circleImpl), address(potImpl), address(registry));
        registry.setFactory(address(factory));

        // fund the default anvil accounts for instant demos
        address[10] memory anvil = [
            0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,
            0x70997970C51812dc3A010C7d01b50e0d17dc79C8,
            0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
            0x90F79bf6EB2c4f870365E785982E1f101E93b906,
            0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
            0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc,
            0x976EA74026E726554dB657fA54763abd0C3a0aa9,
            0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
            0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
            0xa0Ee7A142d267C1f36714E4a8F75612F20a79720
        ];
        for (uint256 i; i < anvil.length; ++i) {
            usdc.mint(anvil[i], 100_000e6);
        }

        vm.stopBroadcast();

        string memory json = string.concat(
            "{\n",
            '  "chainId": 31337,\n',
            '  "usdc": "', vm.toString(address(usdc)), '",\n',
            '  "reputationRegistry": "', vm.toString(address(registry)), '",\n',
            '  "circleImplementation": "', vm.toString(address(circleImpl)), '",\n',
            '  "goalPotImplementation": "', vm.toString(address(potImpl)), '",\n',
            '  "factory": "', vm.toString(address(factory)), '"\n',
            "}\n"
        );
        vm.writeFile("deployments/local.json", json);
    }
}
