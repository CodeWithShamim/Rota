/**
 * One shared write path: simulate → wallet confirm → wait for receipt →
 * invalidate queries, with a single toast tracking the lifecycle and every
 * failure mapped to a localized message (never raw revert data).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Abi, Address, SimulateContractParameters } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { errorToI18nKey } from "../lib/errors";
import { useToast } from "./toast";

export interface TxParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

export function useTxFlow() {
  const publicClient = usePublicClient();
  const { address: account } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useTranslation();

  return useCallback(
    async (params: TxParams, successMessage?: string): Promise<`0x${string}` | undefined> => {
      if (!publicClient || !account) {
        toast.push("error", t("common.notConnected"), 5000);
        return undefined;
      }
      const id = toast.push("info", t("tx.simulating"));
      try {
        const { request } = await publicClient.simulateContract({
          ...params,
          account,
        } as unknown as SimulateContractParameters);
        toast.update(id, "info", t("tx.confirmWallet"));
        const hash = await writeContractAsync(
          request as unknown as Parameters<typeof writeContractAsync>[0]
        );
        toast.update(id, "info", t("tx.pending"));
        await publicClient.waitForTransactionReceipt({ hash });
        toast.update(id, "success", successMessage ?? t("tx.confirmed"), 4000);
        await queryClient.invalidateQueries();
        return hash;
      } catch (error) {
        toast.update(id, "error", t(errorToI18nKey(error)), 7000);
        return undefined;
      }
    },
    [publicClient, account, writeContractAsync, queryClient, toast, t]
  );
}
