/** USDC balance/allowance reads + approve/faucet writes (6 decimals everywhere). */
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { mockUSDCAbi } from "../abi";
import { CHAIN_KEY, deployments } from "../config/chain";
import { useTxFlow } from "./useTxFlow";

export function useUsdcBalance() {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  return useQuery({
    queryKey: ["usdcBalance", user],
    enabled: !!pc && !!user,
    refetchInterval: 12_000,
    queryFn: async () =>
      (await pc!.readContract({
        address: deployments.usdc,
        abi: mockUSDCAbi,
        functionName: "balanceOf",
        args: [user!],
      })) as bigint,
  });
}

export function useUsdcAllowance(spender: Address | undefined) {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  return useQuery({
    queryKey: ["usdcAllowance", user, spender],
    enabled: !!pc && !!user && !!spender,
    queryFn: async () =>
      (await pc!.readContract({
        address: deployments.usdc,
        abi: mockUSDCAbi,
        functionName: "allowance",
        args: [user!, spender!],
      })) as bigint,
  });
}

export function useUsdcActions() {
  const runTx = useTxFlow();
  return {
    approve: (spender: Address, amount: bigint) =>
      runTx({ address: deployments.usdc, abi: mockUSDCAbi, functionName: "approve", args: [spender, amount] }),
    /** Local anvil only: MockUSDC self-serve faucet (1,000 USDC). */
    faucet: CHAIN_KEY === "local"
      ? () => runTx({ address: deployments.usdc, abi: mockUSDCAbi, functionName: "faucet" })
      : undefined,
  };
}
