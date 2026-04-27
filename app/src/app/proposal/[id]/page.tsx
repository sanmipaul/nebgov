import { GovernorClient } from "@nebgov/sdk";
import type { Metadata } from "next";
import { readGovernorConfig } from "../../../lib/nebgov-env";
import ProposalDetailClient from "./ProposalDetailClient";

function titleFromDescription(description: string): string {
  const line = description.split("\n")[0]?.trim();
  return line || "Proposal";
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const config = readGovernorConfig();
  if (!config) {
    return {
      title: `Proposal #${id}`,
      description: "NebGov proposal",
      openGraph: { title: `Proposal #${id}`, description: "NebGov proposal", type: "article" },
      twitter: { card: "summary", title: `Proposal #${id}`, description: "NebGov proposal" },
    };
  }

  try {
    const governorClient = new GovernorClient(config);
    const proposalId = BigInt(id);
    const [p, state] = await Promise.all([
      governorClient.getProposal(proposalId),
      governorClient.getProposalState(proposalId),
    ]);

    const title = titleFromDescription(p.description);
    const description = `For: ${p.votesFor.toString()} | Against: ${p.votesAgainst.toString()} | Abstain: ${p.votesAbstain.toString()} | State: ${state} | Ends: ledger ${p.endLedger}`;

    return {
      title,
      description,
      openGraph: { title, description, type: "article" },
      twitter: { card: "summary", title, description },
    };
  } catch {
    return {
      title: `Proposal #${id}`,
      description: `NebGov proposal #${id}`,
      openGraph: { title: `Proposal #${id}`, description: `NebGov proposal #${id}`, type: "article" },
      twitter: { card: "summary", title: `Proposal #${id}`, description: `NebGov proposal #${id}` },
    };
  }
}

export default async function ProposalDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return <ProposalDetailClient params={{ id }} />;
}

