#!/usr/bin/env node

import { Command } from "commander";
import { GovernorClient, VoteSupport, VotesClient, TreasuryClient, type Network } from "@nebgov/sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

type NebGovCliConfig = {
  network: Network;
  rpcUrl?: string;
  governorAddress?: string;
  timelockAddress?: string;
  votesAddress?: string;
  treasuryAddress?: string;
  keypairFile?: string;
  defaultAccount?: string;
};

type GlobalOptions = {
  human?: boolean;
  dryRun?: boolean;
  config?: string;
};

function output(value: unknown, opts: GlobalOptions): void {
  if (opts.human) {
    if (Array.isArray(value)) {
      console.table(value);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        console.log(`${key}: ${typeof val === "bigint" ? val.toString() : String(val)}`);
      }
      return;
    }
    console.log(String(value));
    return;
  }

  console.log(
    JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ),
  );
}

function resolvePath(rawPath: string): string {
  if (rawPath.startsWith("~/")) {
    return path.join(homedir(), rawPath.slice(2));
  }
  return rawPath;
}

async function loadConfig(configPathArg?: string): Promise<NebGovCliConfig> {
  const defaultPath = path.join(homedir(), ".nebgov", "config.json");
  const configPath = resolvePath(configPathArg ?? process.env.NEBGOV_CONFIG ?? defaultPath);

  let fromFile: Partial<NebGovCliConfig> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    fromFile = JSON.parse(raw) as Partial<NebGovCliConfig>;
  } catch {
    // optional config file
  }

  const fromEnv: Partial<NebGovCliConfig> = {
    network: (process.env.NEBGOV_NETWORK as Network | undefined),
    rpcUrl: process.env.NEBGOV_RPC_URL,
    governorAddress: process.env.NEBGOV_GOVERNOR_ADDRESS,
    timelockAddress: process.env.NEBGOV_TIMELOCK_ADDRESS,
    votesAddress: process.env.NEBGOV_VOTES_ADDRESS,
    treasuryAddress: process.env.NEBGOV_TREASURY_ADDRESS,
    keypairFile: process.env.NEBGOV_KEYPAIR_FILE,
    defaultAccount: process.env.NEBGOV_DEFAULT_ACCOUNT,
  };

  return {
    network: "testnet",
    ...fromFile,
    ...Object.fromEntries(
      Object.entries(fromEnv).filter(([, val]) => val !== undefined),
    ),
  } as NebGovCliConfig;
}

function required(value: string | undefined, field: string): string {
  if (!value) {
    throw new Error(`Missing required config: ${field}`);
  }
  return value;
}

async function loadKeypair(rawPath: string): Promise<Keypair> {
  const filePath = resolvePath(rawPath);
  const raw = await readFile(filePath, "utf8");

  try {
    const parsed = JSON.parse(raw) as
      | { secret?: string; secretKey?: string; privateKey?: string }
      | string;

    if (typeof parsed === "string") return Keypair.fromSecret(parsed);
    const secret = parsed.secret ?? parsed.secretKey ?? parsed.privateKey;
    if (!secret) throw new Error("No secret key found in keypair file");
    return Keypair.fromSecret(secret);
  } catch {
    return Keypair.fromSecret(raw.trim());
  }
}

function getVoteSupport(input: string): VoteSupport {
  const normalized = input.toLowerCase();
  if (normalized === "for") return VoteSupport.For;
  if (normalized === "against") return VoteSupport.Against;
  if (normalized === "abstain") return VoteSupport.Abstain;
  throw new Error("support must be one of: for, against, abstain");
}

async function parseRecipientsCsv(filePathRaw: string): Promise<Array<{ address: string; amount: bigint }>> {
  const filePath = resolvePath(filePathRaw);
  const text = await readFile(filePath, "utf8");
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const out: Array<{ address: string; amount: bigint }> = [];
  for (const line of lines) {
    const [address, amount] = line.split(",").map((part) => part.trim());
    if (!address || !amount) continue;
    out.push({ address, amount: BigInt(amount) });
  }
  return out;
}

const program = new Command();
program
  .name("nebgov")
  .description("NebGov terminal governance CLI")
  .option("--human", "human-readable output instead of JSON", false)
  .option("--dry-run", "simulate actions without submitting transactions", false)
  .option("--config <path>", "path to config file (defaults to ~/.nebgov/config.json)");

program
  .command("proposals")
  .description("Proposal commands")
  .addCommand(
    new Command("list")
      .option("--proposer <address>", "proposer address to list")
      .option("--limit <number>", "max proposals", "20")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const proposer =
          options.proposer ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);

        if (!proposer) {
          throw new Error("Provide --proposer or set NEBGOV_DEFAULT_ACCOUNT / keypair");
        }

        const proposals = await governor.getProposalsForAddress(proposer, {
          limit: Number(options.limit),
        });
        output(
          proposals.map((entry: { id: bigint; proposal: { proposer: string; description: string }; state: unknown }) => ({
            id: entry.id,
            state: entry.state,
            proposer: entry.proposal.proposer,
            description: entry.proposal.description,
          })),
          global,
        );
      }),
  )
  .addCommand(
    new Command("get")
      .argument("<id>", "proposal id")
      .action(async (id: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const proposalId = BigInt(id);
        const [proposal, state, votes] = await Promise.all([
          governor.getProposal(proposalId),
          governor.getProposalState(proposalId),
          governor.getProposalVotes(proposalId),
        ]);
        output({ id: proposalId, state, proposal, votes }, global);
      }),
  )
  .addCommand(
    new Command("create")
      .requiredOption("--title <title>", "proposal title/summary")
      .requiredOption("--description-file <file>", "proposal description markdown/text file")
      .requiredOption("--target <address>", "target contract address")
      .requiredOption("--fn <name>", "target function name")
      .option("--calldata-hex <hex>", "hex calldata bytes (default empty)")
      .option("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const description = await readFile(resolvePath(options.descriptionFile), "utf8");
        const descriptionHash = createHash("sha256").update(description).digest("hex");
        const calldata = Buffer.from((options.calldataHex ?? "").replace(/^0x/i, ""), "hex");

        if (global.dryRun) {
          output(
            {
              action: "proposals.create",
              title: options.title,
              descriptionHash,
              target: options.target,
              fn: options.fn,
              calldataHex: calldata.toString("hex"),
            },
            global,
          );
          return;
        }

        const keypairPath = options.keypair ?? cfg.keypairFile;
        if (!keypairPath) throw new Error("Missing --keypair or NEBGOV_KEYPAIR_FILE");
        const signer = await loadKeypair(keypairPath);
        const proposalId = await governor.propose(
          signer,
          options.title,
          descriptionHash,
          "",
          [options.target],
          [options.fn],
          [calldata],
        );
        output({ proposalId }, global);
      }),
  );

program
  .command("vote")
  .description("Vote commands")
  .addCommand(
    new Command("cast")
      .argument("<proposalId>", "proposal id")
      .argument("<support>", "for|against|abstain")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (proposalId: string, support: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const voteSupport = getVoteSupport(support);
        if (global.dryRun) {
          output({ action: "vote.cast", proposalId, support: voteSupport }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        await governor.castVote(signer, BigInt(proposalId), voteSupport);
        output({ ok: true, proposalId, support: voteSupport }, global);
      }),
  )
  .addCommand(
    new Command("status")
      .argument("<proposalId>", "proposal id")
      .option("--voter <address>", "voter address")
      .action(async (proposalId: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const governor = new GovernorClient({
          network: cfg.network,
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const voter =
          options.voter ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);
        if (!voter) throw new Error("Provide --voter or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const receipt = await governor.getReceipt(BigInt(proposalId), voter);
        output({ proposalId, voter, receipt }, global);
      }),
  );

program
  .command("delegate")
  .description("Delegation commands")
  .addCommand(
    new Command("to")
      .argument("<address>", "delegatee address")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (address: string, options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votes = new VotesClient({
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          network: cfg.network,
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        if (global.dryRun) {
          output({ action: "delegate.to", delegatee: address }, global);
          return;
        }

        const signer = await loadKeypair(options.keypair);
        await votes.delegate(signer, address);
        output({ ok: true, delegatee: address, delegator: signer.publicKey() }, global);
      }),
  )
  .addCommand(
    new Command("show")
      .argument("<address>", "delegator address")
      .action(async (address: string) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const votes = new VotesClient({
          governorAddress: required(cfg.governorAddress, "governorAddress"),
          timelockAddress: required(cfg.timelockAddress, "timelockAddress"),
          network: cfg.network,
          votesAddress: required(cfg.votesAddress, "votesAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const [delegatee, votingPower] = await Promise.all([
          votes.getDelegatee(address),
          votes.getVotes(address),
        ]);
        output({ address, delegatee, votingPower }, global);
      }),
  );

program
  .command("treasury")
  .description("Treasury commands")
  .addCommand(
    new Command("balance")
      .option("--viewer <address>", "simulation viewer account")
      .option("--token <address>", "token address to inspect spending metrics")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const viewer =
          options.viewer ??
          cfg.defaultAccount ??
          (cfg.keypairFile ? (await loadKeypair(cfg.keypairFile)).publicKey() : undefined);
        if (!viewer) throw new Error("Provide --viewer or set NEBGOV_DEFAULT_ACCOUNT / keypair");

        const treasury = new TreasuryClient({
          network: cfg.network,
          treasuryAddress: required(cfg.treasuryAddress, "treasuryAddress"),
          rpcUrl: cfg.rpcUrl,
          simulationAccount: viewer,
        });

        const [owners, threshold, txCount] = await Promise.all([
          treasury.getOwners(),
          treasury.getThreshold(),
          treasury.getTxCount(),
        ]);

        let spentThisPeriod: bigint | null = null;
        if (options.token) {
          spentThisPeriod = await treasury.getSpentThisPeriod(options.token);
        }

        output(
          {
            viewer,
            owners,
            threshold,
            txCount,
            spentThisPeriod,
            token: options.token ?? null,
          },
          global,
        );
      }),
  )
  .addCommand(
    new Command("batch-transfer")
      .requiredOption("--token <address>", "token contract address")
      .requiredOption("--recipients <csv>", "CSV file containing address,amount rows")
      .requiredOption("--keypair <file>", "keypair file path")
      .action(async (options) => {
        const global = program.opts<GlobalOptions>();
        const cfg = await loadConfig(global.config);
        const treasury = new TreasuryClient({
          network: cfg.network,
          treasuryAddress: required(cfg.treasuryAddress, "treasuryAddress"),
          rpcUrl: cfg.rpcUrl,
        });

        const recipients = await parseRecipientsCsv(options.recipients);
        if (recipients.length === 0) {
          throw new Error("No recipients parsed from CSV");
        }

        if (global.dryRun) {
          output(
            {
              action: "treasury.batch-transfer",
              token: options.token,
              recipients,
              count: recipients.length,
            },
            global,
          );
          return;
        }

        const signer = await loadKeypair(options.keypair);
        const opHash = await treasury.batchTransfer(signer, options.token, recipients);
        output({ opHash, recipients: recipients.length }, global);
      }),
  );

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
