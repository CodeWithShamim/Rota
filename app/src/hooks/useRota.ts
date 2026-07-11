/**
 * Chain-data hooks. Reads go through TanStack Query (so useTxFlow's blanket
 * invalidation refreshes everything after a write) and are re-fetched live when
 * contract events fire (see useLiveInvalidation) plus a slow polling fallback.
 */
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { Address, PublicClient } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { goalPotAbi, reputationRegistryAbi, rotaCircleAbi, rotaFactoryAbi } from "../abi";
import { deployments } from "../config/chain";

export const Phase = { OPEN: 0, ACTIVE: 1, COMPLETED: 2, CANCELLED: 3 } as const;
export const Mode = { FIXED: 0, RANDOM: 1, BID: 2 } as const;
export const PotPhase = { LOCKED: 0, UNLOCKED: 1 } as const;

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const POLL_MS = 12_000;

export function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

// ---------------------------------------------------------------- summaries

export interface CircleSummary {
  address: Address;
  name: string;
  phase: number;
  mode: number;
  contributionAmount: bigint;
  memberCap: bigint;
  roundDuration: bigint;
  startTime: bigint;
  currentRound: bigint;
  memberCount: bigint;
  roundContributionCount: bigint;
  bidWindowBps: bigint;
  organizer: Address;
  isMember: boolean;
  hasContributedNow: boolean;
  hasWon: boolean;
  inDefault: boolean;
  dividendBalance: bigint;
  collateralBalance: bigint;
  /** current round deadline (0 when not active) */
  deadline: bigint;
  roundStart: bigint;
  bidWindowEnd: bigint;
}

async function fetchCircleSummary(
  pc: PublicClient,
  address: Address,
  user: Address | undefined
): Promise<CircleSummary> {
  const read = <F extends string>(functionName: F, args?: readonly unknown[]) =>
    pc.readContract({ address, abi: rotaCircleAbi, functionName, args } as unknown as Parameters<
      PublicClient["readContract"]
    >[0]);

  // Wave 1: everything that doesn't depend on the current round. All reads in
  // the same tick coalesce into a single multicall3 request (wagmi default).
  const [name, phase, mode, contributionAmount, memberCap, roundDuration, startTime, currentRound, memberCount, bidWindowBps, organizer, isMember, hasWon, inDefault, dividendBalance, collateralBalance] =
    (await Promise.all([
      read("name"),
      read("phase"),
      read("mode"),
      read("contributionAmount"),
      read("memberCap"),
      read("roundDuration"),
      read("startTime"),
      read("currentRound"),
      read("memberCount"),
      read("bidWindowBps"),
      read("organizer"),
      user ? read("isMember", [user]) : false,
      user ? read("hasWon", [user]) : false,
      user ? read("inDefault", [user]) : false,
      user ? read("dividendBalance", [user]) : 0n,
      user ? read("collateralBalance", [user]) : 0n,
    ])) as [string, number, number, bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, boolean, boolean, boolean, bigint, bigint];

  // Wave 2: only the round-dependent reads.
  const active = phase === Phase.ACTIVE;
  const round = active ? currentRound : 0n;
  const [roundContributionCount, hasContributedNow] = (await Promise.all([
    read("roundContributionCount", [round]),
    user ? read("hasContributed", [round, user]) : false,
  ])) as [bigint, boolean];

  const roundStart = startTime + round * roundDuration;
  return {
    address,
    name,
    phase,
    mode,
    contributionAmount,
    memberCap,
    roundDuration,
    startTime,
    currentRound,
    memberCount,
    roundContributionCount,
    bidWindowBps,
    organizer,
    isMember,
    hasContributedNow,
    hasWon,
    inDefault,
    dividendBalance,
    collateralBalance,
    deadline: active ? roundStart + roundDuration : 0n,
    roundStart,
    bidWindowEnd: active ? roundStart + (roundDuration * bidWindowBps) / 10_000n : 0n,
  };
}

export interface PotSummary {
  address: Address;
  name: string;
  phase: number;
  targetAmount: bigint;
  deadline: bigint;
  totalDeposited: bigint;
  totalHaircut: bigint;
  memberCount: bigint;
  progressBps: bigint;
  unlockable: boolean;
  targetReached: boolean;
  minContribution: bigint;
  earlyExitHaircutBps: bigint;
  givingBps: bigint;
  givingRecipient: Address;
  inviteOnly: boolean;
  organizer: Address;
  deposited: bigint;
}

async function fetchPotSummary(pc: PublicClient, address: Address, user: Address | undefined): Promise<PotSummary> {
  const read = <F extends string>(functionName: F, args?: readonly unknown[]) =>
    pc.readContract({ address, abi: goalPotAbi, functionName, args } as unknown as Parameters<
      PublicClient["readContract"]
    >[0]);

  const [name, phase, targetAmount, deadline, totalDeposited, totalHaircut, memberCount, progressBps, unlockable, targetReached, minContribution, earlyExitHaircutBps, givingBps, givingRecipient, inviteOnly, organizer, deposited] =
    (await Promise.all([
      read("name"),
      read("phase"),
      read("targetAmount"),
      read("deadline"),
      read("totalDeposited"),
      read("totalHaircut"),
      read("memberCount"),
      read("progressBps"),
      read("unlockable"),
      read("targetReached"),
      read("minContribution"),
      read("earlyExitHaircutBps"),
      read("givingBps"),
      read("givingRecipient"),
      read("inviteOnly"),
      read("organizer"),
      user ? read("deposited", [user]) : 0n,
    ])) as [string, number, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, bigint, bigint, bigint, Address, boolean, Address, bigint];

  return {
    address,
    name,
    phase,
    targetAmount,
    deadline,
    totalDeposited,
    totalHaircut,
    memberCount,
    progressBps,
    unlockable,
    targetReached,
    minContribution,
    earlyExitHaircutBps,
    givingBps,
    givingRecipient,
    inviteOnly,
    organizer,
    deposited,
  };
}

// ----------------------------------------------------------------- overview

export function useCirclesOverview() {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  return useQuery({
    queryKey: ["circlesOverview", user ?? "anon"],
    enabled: !!pc && deployments.factory !== ZERO,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const addresses = (await pc!.readContract({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "getCircles",
      })) as readonly Address[];
      return Promise.all(addresses.map((a) => fetchCircleSummary(pc!, a, user)));
    },
  });
}

export function usePotsOverview() {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  return useQuery({
    queryKey: ["potsOverview", user ?? "anon"],
    enabled: !!pc && deployments.factory !== ZERO,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const addresses = (await pc!.readContract({
        address: deployments.factory,
        abi: rotaFactoryAbi,
        functionName: "getGoalPots",
      })) as readonly Address[];
      return Promise.all(addresses.map((a) => fetchPotSummary(pc!, a, user)));
    },
  });
}

// ------------------------------------------------------------------- detail

export interface ActivityItem {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

// Arc's RPC rejects eth_getLogs spans over 10,000 blocks (HTTP 413), so scan
// from the deployment block upward in chunks. Scanned logs are cached per
// address for the session; refetches only scan blocks newer than the last scan.
const LOG_CHUNK = 10_000n;
const LOG_START_BLOCK = BigInt(deployments.deployBlock ?? 0);
const activityCache = new Map<string, { scannedTo: bigint; items: ActivityItem[]; pending?: Promise<void> }>();

async function fetchContractActivity(
  pc: PublicClient,
  address: Address,
  abi: typeof rotaCircleAbi | typeof goalPotAbi | typeof reputationRegistryAbi
): Promise<ActivityItem[]> {
  const key = address.toLowerCase();
  const entry = activityCache.get(key) ?? { scannedTo: LOG_START_BLOCK - 1n, items: [] };
  activityCache.set(key, entry);

  const scan = async () => {
    const latest = await pc.getBlockNumber();
    if (latest <= entry.scannedTo) return;
    const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
    for (let from = entry.scannedTo + 1n; from <= latest; from += LOG_CHUNK) {
      const to = from + LOG_CHUNK - 1n;
      ranges.push({ fromBlock: from, toBlock: to < latest ? to : latest });
    }
    const chunks = await Promise.all(
      ranges.map(
        (r) =>
          pc.getContractEvents({ address, abi, ...r } as unknown as Parameters<
            PublicClient["getContractEvents"]
          >[0]) as Promise<import("viem").Log[]>
      )
    );
    const fresh = chunks
      .flat()
      .map((l) => ({
        eventName: (l as unknown as { eventName?: string }).eventName ?? "",
        args: ((l as unknown as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>,
        blockNumber: l.blockNumber ?? 0n,
        logIndex: l.logIndex ?? 0,
        txHash: l.transactionHash ?? "",
      }))
      .sort((a, b) =>
        a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : Number(a.blockNumber - b.blockNumber)
      );
    // fresh logs are strictly newer than cached ones, so appending keeps order
    entry.items = [...entry.items, ...fresh];
    entry.scannedTo = latest;
  };

  // chain onto any in-flight scan for this address so ranges aren't double-scanned
  const chained = (entry.pending ?? Promise.resolve()).then(scan, scan);
  entry.pending = chained;
  try {
    await chained;
  } finally {
    if (entry.pending === chained) entry.pending = undefined;
  }
  return entry.items;
}

export interface CircleDetail extends CircleSummary {
  collateralBps: bigint;
  givingBps: bigint;
  givingRecipient: Address;
  maxDiscountBps: bigint;
  openDeadline: bigint;
  inviteOnly: boolean;
  penaltyCarry: bigint;
  members: readonly Address[];
  payoutOrder: readonly Address[];
  bestBid: { bidder: Address; discountBps: number; exists: boolean };
  autoPayOptIn: boolean;
  allowlisted: boolean;
  cureCost: bigint;
  previewRecipient: Address;
  /** contributionMatrix[round][member] = contributed */
  contributionMatrix: Record<string, Record<string, boolean>>;
  activity: ActivityItem[];
}

export function useCircleDetail(address: Address | undefined) {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  useLiveInvalidation(address, ["circleDetail", "circlesOverview"]);

  return useQuery({
    queryKey: ["circleDetail", address, user ?? "anon"],
    enabled: !!pc && !!address,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<CircleDetail> => {
      const read = <F extends string>(functionName: F, args?: readonly unknown[]) =>
        pc!.readContract({ address: address!, abi: rotaCircleAbi, functionName, args } as unknown as Parameters<
          PublicClient["readContract"]
        >[0]);

      // Fire everything round-independent up front: the static reads join the
      // summary's wave-1 multicall, and the log scan overlaps both.
      const activityPromise = fetchContractActivity(pc!, address!, rotaCircleAbi);
      const staticsPromise = Promise.all([
        read("collateralBps"),
        read("givingBps"),
        read("givingRecipient"),
        read("maxDiscountBps"),
        read("openDeadline"),
        read("inviteOnly"),
        read("penaltyCarry"),
        read("getMembers"),
        read("getPayoutOrder"),
        user ? read("autoPayOptIn", [user]) : false,
        user ? read("allowlist", [user]) : false,
        user ? read("cureCost", [user]) : 0n,
        read("previewRecipient"),
      ]) as Promise<[bigint, bigint, Address, bigint, bigint, boolean, bigint, readonly Address[], readonly Address[], boolean, boolean, bigint, Address]>;

      const summary = await fetchCircleSummary(pc!, address!, user);
      const round = summary.phase === Phase.ACTIVE ? summary.currentRound : 0n;
      const bestBidRaw = (await read("bestBid", [round])) as readonly [Address, number, boolean];
      const [collateralBps, givingBps, givingRecipient, maxDiscountBps, openDeadline, inviteOnly, penaltyCarry, members, payoutOrder, autoPayOptIn, allowlisted, cureCost, previewRecipient] =
        await staticsPromise;

      const activity = await activityPromise;

      const contributionMatrix: Record<string, Record<string, boolean>> = {};
      for (const item of activity) {
        if (item.eventName === "Contributed") {
          const r = String(item.args.round);
          const m = String(item.args.member).toLowerCase();
          (contributionMatrix[r] ??= {})[m] = true;
        }
      }

      return {
        ...summary,
        collateralBps,
        givingBps,
        givingRecipient,
        maxDiscountBps,
        openDeadline,
        inviteOnly,
        penaltyCarry,
        members,
        payoutOrder,
        bestBid: { bidder: bestBidRaw[0], discountBps: Number(bestBidRaw[1]), exists: bestBidRaw[2] },
        autoPayOptIn,
        allowlisted,
        cureCost,
        previewRecipient,
        contributionMatrix,
        activity,
      };
    },
  });
}

export interface PotDetail extends PotSummary {
  members: readonly Address[];
  balances: Record<string, bigint>;
  activity: ActivityItem[];
}

export function usePotDetail(address: Address | undefined) {
  const pc = usePublicClient();
  const { address: user } = useAccount();
  useLiveInvalidation(address, ["potDetail", "potsOverview"], goalPotAbi);

  return useQuery({
    queryKey: ["potDetail", address, user ?? "anon"],
    enabled: !!pc && !!address,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PotDetail> => {
      // members + summary reads coalesce into one multicall; log scan overlaps
      const activityPromise = fetchContractActivity(pc!, address!, goalPotAbi);
      const membersPromise = pc!.readContract({
        address: address!,
        abi: goalPotAbi,
        functionName: "getMembers",
      }) as Promise<readonly Address[]>;
      const summaryPromise = fetchPotSummary(pc!, address!, user);

      const members = await membersPromise;
      const balances: Record<string, bigint> = {};
      await Promise.all(
        members.map(async (m) => {
          balances[m.toLowerCase()] = (await pc!.readContract({
            address: address!,
            abi: goalPotAbi,
            functionName: "deposited",
            args: [m],
          })) as bigint;
        })
      );
      const [summary, activity] = await Promise.all([summaryPromise, activityPromise]);
      return { ...summary, members, balances, activity };
    },
  });
}

// --------------------------------------------------------------- reputation

export interface ReputationData {
  contributions: bigint;
  defaults: bigint;
  completions: bigint;
  cures: bigint;
  earlyExits: bigint;
  score: bigint;
  history: ActivityItem[];
}

export function useReputation(subject: Address | undefined) {
  const pc = usePublicClient();
  return useQuery({
    queryKey: ["reputation", subject],
    enabled: !!pc && !!subject && deployments.reputationRegistry !== ZERO,
    refetchInterval: POLL_MS * 2,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ReputationData> => {
      const scorePromise = pc!.readContract({
        address: deployments.reputationRegistry,
        abi: reputationRegistryAbi,
        functionName: "getScore",
        args: [subject!],
      }) as Promise<
        [{ contributions: bigint; defaults: bigint; completions: bigint; cures: bigint; earlyExits: bigint }, bigint]
      >;
      const [[stats, score], allEvents] = await Promise.all([
        scorePromise,
        fetchContractActivity(pc!, deployments.reputationRegistry, reputationRegistryAbi),
      ]);
      const history = allEvents
        .filter((l) => String(l.args.user ?? "").toLowerCase() === subject!.toLowerCase())
        .reverse();
      return {
        contributions: BigInt(stats.contributions),
        defaults: BigInt(stats.defaults),
        completions: BigInt(stats.completions),
        cures: BigInt(stats.cures),
        earlyExits: BigInt(stats.earlyExits),
        score,
        history,
      };
    },
  });
}

// -------------------------------------------------------- live invalidation

/** Watch a contract's logs and invalidate the given query prefixes on any event. */
function useLiveInvalidation(
  address: Address | undefined,
  queryPrefixes: string[],
  abi: typeof rotaCircleAbi | typeof goalPotAbi = rotaCircleAbi
) {
  const pc = usePublicClient();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!pc || !address) return;
    const unwatch = pc.watchContractEvent({
      address,
      abi,
      onLogs: () => {
        for (const prefix of queryPrefixes) {
          void queryClient.invalidateQueries({ queryKey: [prefix] });
        }
      },
      pollingInterval: 4_000,
    } as unknown as Parameters<PublicClient["watchContractEvent"]>[0]);
    return unwatch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc, address, queryClient]);
}
