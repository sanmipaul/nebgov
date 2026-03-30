import { SorobanRpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { GovernorSettings, Network } from "./types";

const RPC_URLS: Record<Network, string> = {
  mainnet: "https://soroban-rpc.mainnet.stellar.gateway.fm",
  testnet: "https://soroban-testnet.stellar.org",
  futurenet: "https://rpc-futurenet.stellar.org",
};

const DEFAULT_POLL_INTERVAL_MS = 10_000;

const TOPICS = {
  proposalCreated: "ProposalCreated",
  voteCast: "VoteCast",
  proposalQueued: "ProposalQueued",
  proposalExecuted: "ProposalExecuted",
  proposalCancelled: "ProposalCancelled",
  proposalExpired: "ProposalExpired",
  governorUpgraded: "GovernorUpgraded",
  configUpdated: "ConfigUpdated",
  legacyProposalCreated: "prop_crtd",
  legacyVoteCast: "vote",
  legacyProposalExecuted: "execute",
} as const;

export interface SorobanEvent {
  ledger: number;
  contractId: string;
  topic: string[];
  value: unknown;
}

export interface ProposalCreatedEventData {
  proposalId: bigint;
  proposer: string;
  description: string;
  targets: unknown[];
  fnNames: unknown[];
  calldatas: unknown[];
  startLedger: number;
  endLedger: number;
}

export interface VoteCastEventData {
  proposalId: bigint;
  voter: string;
  support: number;
  weight: bigint;
}

export interface ProposalQueuedEventData {
  proposalId: bigint;
  opId: unknown;
  eta: bigint;
}

export interface ProposalExecutedEventData {
  proposalId: bigint;
  caller: string;
}

export interface ProposalCancelledEventData {
  proposalId: bigint;
  caller: string;
}

export interface ProposalExpiredEventData {
  proposalId: bigint;
  expiredAtLedger: number;
}

export interface GovernorUpgradedEventData {
  oldHash: unknown;
  newHash: unknown;
}

export interface ConfigUpdatedEventData {
  oldSettings: GovernorSettings;
  newSettings: GovernorSettings;
}

export interface SubscriptionOptions {
  network: Network;
  rpcUrl?: string;
  intervalMs?: number;
}

type EventRecord = Record<string, unknown>;

function isRecord(value: unknown): value is EventRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" || typeof value === "string") return BigInt(value);
    return null;
  } catch {
    return null;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function toGovernorSettings(value: unknown): GovernorSettings | null {
  if (!isRecord(value)) return null;

  const votingDelay = toNumber(value.voting_delay);
  const votingPeriod = toNumber(value.voting_period);
  const quorumNumerator = toNumber(value.quorum_numerator);
  const proposalThreshold = toBigInt(value.proposal_threshold);

  if (
    votingDelay === null ||
    votingPeriod === null ||
    quorumNumerator === null ||
    proposalThreshold === null
  ) {
    return null;
  }

  return {
    votingDelay,
    votingPeriod,
    quorumNumerator,
    proposalThreshold,
  };
}

function decodeEvent(raw: SorobanRpc.Api.EventResponse): SorobanEvent {
  const topic = raw.topic.map((segment) => String(scValToNative(segment)));
  const value = scValToNative(raw.value);

  return {
    ledger: raw.ledger,
    contractId: raw.contractId?.contractId() ?? "",
    topic,
    value,
  };
}

function buildServer(opts: SubscriptionOptions): SorobanRpc.Server {
  return new SorobanRpc.Server(opts.rpcUrl ?? RPC_URLS[opts.network], {
    allowHttp: false,
  });
}

function createTopicSubscription(
  governorAddress: string,
  topicName: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions,
  filter?: (event: SorobanEvent) => boolean
): () => void {
  const server = buildServer(opts);
  const topicFilter = [xdr.ScVal.scvSymbol(topicName)];
  const intervalMs = opts.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  let cursor = 0;
  let initialized = false;
  let stopped = false;

  async function poll(): Promise<void> {
    if (stopped) return;

    try {
      if (!initialized) {
        const latest = await server.getLatestLedger();
        cursor = latest.sequence;
        initialized = true;
      }

      const { events, latestLedger } = await fetchEvents(
        server,
        governorAddress,
        topicFilter,
        cursor
      );

      for (const event of events) {
        if (!stopped && (!filter || filter(event))) callback(event);
      }

      cursor = latestLedger + 1;
    } catch {
      // Retry on the next interval.
    }
  }

  void poll();
  const handle = setInterval(() => void poll(), intervalMs);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

export async function fetchEvents(
  server: SorobanRpc.Server,
  contractId: string,
  topicFilter: xdr.ScVal[],
  startLedger: number
): Promise<{ events: SorobanEvent[]; latestLedger: number }> {
  const response = await server.getEvents({
    startLedger,
    filters: [
      {
        type: "contract",
        contractIds: [contractId],
        topics: [topicFilter.map((segment) => segment.toXDR("base64"))],
      },
    ],
    limit: 100,
  });

  return {
    events: (response.events ?? []).map(decodeEvent),
    latestLedger: response.latestLedger ? Number(response.latestLedger) : startLedger,
  };
}

export function parseProposalCreatedEvent(
  event: SorobanEvent
): ProposalCreatedEventData | null {
  if (event.topic[0] === TOPICS.legacyProposalCreated) {
    if (!Array.isArray(event.value) || event.value.length < 7 || event.topic.length < 2) {
      return null;
    }

    const proposalId = toBigInt(event.value[0]);
    const startLedger = toNumber(event.value[5]);
    const endLedger = toNumber(event.value[6]);

    if (proposalId === null || startLedger === null || endLedger === null) return null;

    return {
      proposalId,
      proposer: String(event.topic[1]),
      description: String(event.value[1] ?? ""),
      targets: Array.isArray(event.value[2]) ? event.value[2] : [],
      fnNames: Array.isArray(event.value[3]) ? event.value[3] : [],
      calldatas: Array.isArray(event.value[4]) ? event.value[4] : [],
      startLedger,
      endLedger,
    };
  }

  if (event.topic[0] !== TOPICS.proposalCreated || !isRecord(event.value)) return null;

  const proposalId = toBigInt(event.value.proposal_id);
  const startLedger = toNumber(event.value.start_ledger);
  const endLedger = toNumber(event.value.end_ledger);

  if (proposalId === null || startLedger === null || endLedger === null) return null;

  return {
    proposalId,
    proposer: String(event.value.proposer ?? ""),
    description: String(event.value.description ?? ""),
    targets: Array.isArray(event.value.targets) ? event.value.targets : [],
    fnNames: Array.isArray(event.value.fn_names) ? event.value.fn_names : [],
    calldatas: Array.isArray(event.value.calldatas) ? event.value.calldatas : [],
    startLedger,
    endLedger,
  };
}

export function parseVoteCastEvent(event: SorobanEvent): VoteCastEventData | null {
  if (event.topic[0] === TOPICS.legacyVoteCast) {
    if (!Array.isArray(event.value) || event.value.length < 3 || event.topic.length < 2) {
      return null;
    }

    const proposalId = toBigInt(event.value[0]);
    const weight = toBigInt(event.value[2]);

    if (proposalId === null || weight === null) return null;

    return {
      proposalId,
      voter: String(event.topic[1]),
      support: toNumber(event.value[1]) ?? -1,
      weight,
    };
  }

  if (event.topic[0] !== TOPICS.voteCast || !isRecord(event.value)) return null;

  const proposalId = toBigInt(event.value.proposal_id);
  const support = toNumber(event.value.support);
  const weight = toBigInt(event.value.weight);

  if (proposalId === null || support === null || weight === null) return null;

  return {
    proposalId,
    voter: String(event.value.voter ?? ""),
    support,
    weight,
  };
}

export function parseProposalQueuedEvent(
  event: SorobanEvent
): ProposalQueuedEventData | null {
  if (event.topic[0] !== TOPICS.proposalQueued) return null;

  if (Array.isArray(event.value)) {
    const proposalId = toBigInt(event.value[0]);
    const eta = toBigInt(event.value[1]);
    if (proposalId === null || eta === null) return null;
    return { proposalId, opId: null, eta };
  }

  if (!isRecord(event.value)) return null;
  const proposalId = toBigInt(event.value.proposal_id);
  const eta = toBigInt(event.value.eta);

  if (proposalId === null || eta === null) return null;

  return {
    proposalId,
    opId: event.value.op_id ?? null,
    eta,
  };
}

export function parseProposalExecutedEvent(
  event: SorobanEvent
): ProposalExecutedEventData | null {
  if (event.topic[0] === TOPICS.legacyProposalExecuted) {
    const proposalId = toBigInt(event.value);
    if (proposalId === null) return null;
    return {
      proposalId,
      caller: "",
    };
  }

  if (event.topic[0] !== TOPICS.proposalExecuted || !isRecord(event.value)) return null;
  const proposalId = toBigInt(event.value.proposal_id);
  if (proposalId === null) return null;

  return {
    proposalId,
    caller: String(event.value.caller ?? ""),
  };
}

export function parseProposalCancelledEvent(
  event: SorobanEvent
): ProposalCancelledEventData | null {
  if (event.topic[0] !== TOPICS.proposalCancelled || !isRecord(event.value)) return null;
  const proposalId = toBigInt(event.value.proposal_id);
  if (proposalId === null) return null;

  return {
    proposalId,
    caller: String(event.value.caller ?? ""),
  };
}

export function parseProposalExpiredEvent(
  event: SorobanEvent
): ProposalExpiredEventData | null {
  if (event.topic[0] !== TOPICS.proposalExpired || !isRecord(event.value)) return null;
  const proposalId = toBigInt(event.value.proposal_id);
  const expiredAtLedger = toNumber(event.value.expired_at_ledger);

  if (proposalId === null || expiredAtLedger === null) return null;

  return {
    proposalId,
    expiredAtLedger,
  };
}

export function parseGovernorUpgradedEvent(
  event: SorobanEvent
): GovernorUpgradedEventData | null {
  if (event.topic[0] !== TOPICS.governorUpgraded || !isRecord(event.value)) return null;

  return {
    oldHash: event.value.old_hash ?? null,
    newHash: event.value.new_hash ?? null,
  };
}

export function parseConfigUpdatedEvent(
  event: SorobanEvent
): ConfigUpdatedEventData | null {
  if (event.topic[0] !== TOPICS.configUpdated || !isRecord(event.value)) return null;

  const oldSettings = toGovernorSettings(event.value.old_settings);
  const newSettings = toGovernorSettings(event.value.new_settings);

  if (!oldSettings || !newSettings) return null;

  return {
    oldSettings,
    newSettings,
  };
}

export function subscribeToProposals(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.proposalCreated, callback, opts);
}

export function subscribeToVotes(
  governorAddress: string,
  proposalId: bigint,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(
    governorAddress,
    TOPICS.voteCast,
    callback,
    opts,
    (event) => parseVoteCastEvent(event)?.proposalId === proposalId
  );
}

export async function getProposalEvents(
  governorAddress: string,
  fromLedger: number,
  opts: SubscriptionOptions
): Promise<SorobanEvent[]> {
  const server = buildServer(opts);
  const latest = (await server.getLatestLedger()).sequence;
  const topicFilter = [xdr.ScVal.scvSymbol(TOPICS.proposalCreated)];
  const events: SorobanEvent[] = [];
  let startLedger = Math.max(1, fromLedger);

  while (startLedger <= latest) {
    const { events: page, latestLedger } = await fetchEvents(
      server,
      governorAddress,
      topicFilter,
      startLedger
    );

    if (page.length === 0) {
      startLedger = latestLedger + 1;
      continue;
    }

    events.push(...page);
    startLedger = Math.max(...page.map((event) => event.ledger)) + 1;
  }

  return events;
}

export function subscribeToProposalQueued(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.proposalQueued, callback, opts);
}

export function subscribeToProposalExecuted(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.proposalExecuted, callback, opts);
}

export function subscribeToProposalCancelled(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.proposalCancelled, callback, opts);
}

export function subscribeToProposalExpired(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.proposalExpired, callback, opts);
}

export function subscribeToGovernorUpgraded(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.governorUpgraded, callback, opts);
}

export function subscribeToConfigUpdated(
  governorAddress: string,
  callback: (event: SorobanEvent) => void,
  opts: SubscriptionOptions
): () => void {
  return createTopicSubscription(governorAddress, TOPICS.configUpdated, callback, opts);
}
