import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { TransactionStatus } from "genlayer-js/types";
import {
  genlayerClient,
  NEWS_CONFIGURED,
  NEWS_CONTRACT,
  parseNewsJson,
  type NewsItem,
} from "../lib/genlayer";
import { useToast } from "./toast";

export interface NewsMeta {
  refresh_count: number;
  last_refreshed_by: string;
}

export function useNews() {
  return useQuery({
    queryKey: ["genlayer", "news", NEWS_CONTRACT],
    enabled: NEWS_CONFIGURED,
    staleTime: 60_000,
    queryFn: async (): Promise<{ items: NewsItem[]; meta: NewsMeta }> => {
      const client = genlayerClient();
      const [raw, meta] = await Promise.all([
        client.readContract({ address: NEWS_CONTRACT, functionName: "get_news", args: [] }),
        client.readContract({
          address: NEWS_CONTRACT,
          functionName: "get_meta",
          args: [],
          jsonSafeReturn: true,
        }),
      ]);
      const m = (meta ?? {}) as Record<string, unknown>;
      return {
        items: parseNewsJson(raw),
        meta: {
          refresh_count: Number(m.refresh_count ?? 0),
          last_refreshed_by: typeof m.last_refreshed_by === "string" ? m.last_refreshed_by : "",
        },
      };
    },
  });
}

/**
 * Sends refresh_news() to the intelligent contract: GenLayer validators fetch
 * the news feeds, run the curation prompt, and reach consensus — this commonly
 * takes 30–60s, so we poll the receipt generously before refetching.
 */
export function useRefreshNews() {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const client = genlayerClient();
      const hash = await client.writeContract({
        address: NEWS_CONTRACT,
        functionName: "refresh_news",
        args: [],
        value: 0n,
      });
      await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.ACCEPTED,
        interval: 5_000,
        retries: 60,
      });
    },
    onMutate: () => toast.push("info", t("news.refreshing"), 8_000),
    onSuccess: async () => {
      toast.push("success", t("news.refreshed"), 6_000);
      await queryClient.invalidateQueries({ queryKey: ["genlayer", "news"] });
    },
    onError: () => toast.push("error", t("news.refreshFailed"), 8_000),
  });
}
