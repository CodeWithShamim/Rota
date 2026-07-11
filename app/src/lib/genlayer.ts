import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import type { GenLayerClient, GenLayerChain } from "genlayer-js/types";

/**
 * GenLayer Intelligent Contract that curates Arc-ecosystem + Rota-domain news
 * (see genlayer/news_curator.py). Deployed on GenLayer Studio testnet, which is
 * independent from the EVM chain the rest of the app talks to.
 */
export const NEWS_CONTRACT = (import.meta.env.VITE_GENLAYER_NEWS_CONTRACT ?? "") as `0x${string}`;

export const NEWS_CONFIGURED = /^0x[0-9a-fA-F]{40}$/.test(NEWS_CONTRACT);

export const GENLAYER_STUDIO_URL = "https://studio.genlayer.com";

export const GENLAYER_EXPLORER_URL = "https://explorer-studio.genlayer.com";

export function genlayerExplorerAddressUrl(address: string): string {
  return `${GENLAYER_EXPLORER_URL}/address/${address}`;
}

export type NewsCategory = "arc" | "rota";

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  date: string; // ISO YYYY-MM-DD or ""
  summary: string;
  category: NewsCategory;
  relevance: number; // 1-10
}

/** Parse the contract's JSON payload defensively — it is LLM-produced. */
export function parseNewsJson(raw: unknown): NewsItem[] {
  if (typeof raw !== "string") return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const items: NewsItem[] = [];
  for (const it of data) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;
    if (typeof o.title !== "string" || typeof o.url !== "string") continue;
    if (o.category !== "arc" && o.category !== "rota") continue;
    items.push({
      title: o.title,
      url: o.url,
      source: typeof o.source === "string" ? o.source : "",
      date: typeof o.date === "string" ? o.date : "",
      summary: typeof o.summary === "string" ? o.summary : "",
      category: o.category,
      relevance: typeof o.relevance === "number" ? Math.min(10, Math.max(1, o.relevance)) : 5,
    });
  }
  return items.sort((a, b) => b.relevance - a.relevance);
}

// Studionet is a free testnet (no gas token), so a throwaway locally stored
// key is enough to sign refresh transactions — nothing of value is at risk.
const BURNER_KEY = "rota.genlayer.burnerKey";

function burnerPrivateKey(): `0x${string}` {
  const existing = localStorage.getItem(BURNER_KEY);
  if (existing && /^0x[0-9a-fA-F]{64}$/.test(existing)) return existing as `0x${string}`;
  const key = generatePrivateKey();
  localStorage.setItem(BURNER_KEY, key);
  return key;
}

let client: GenLayerClient<GenLayerChain> | undefined;

export function genlayerClient(): GenLayerClient<GenLayerChain> {
  if (!client) {
    client = createClient({
      chain: studionet,
      account: createAccount(burnerPrivateKey()),
    });
  }
  return client;
}
