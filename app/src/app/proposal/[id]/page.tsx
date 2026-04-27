"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { VoteSupport, ProposalState, VotesClient, GovernorClient, VoteType, type GovernorSettings, type Network, type TimelockInfo } from "@nebgov/sdk";
import { AlertTriangle, Info, ExternalLink, Loader2, ChevronUp, ChevronDown, Clock, ShieldCheck, Zap } from "lucide-react";
import { useWallet } from "../../../lib/wallet-context";
import { DelegateModal } from "../../../components/DelegateModal";
import { VotingModal } from "../../../components/VotingModal";
import { CountdownTimer } from "../../../components/CountdownTimer";
import { fetchProposalMetadata, verifyMetadataHash } from "../../../lib/metadata";
import { fetchProposalVotes, type ProposalVote } from "../../../lib/backend";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie
} from "recharts";

interface Proposal {
  id: string;
  proposer: string;
  description: string;
  descriptionHash: string;
  uri: string;
  status: ProposalState;
  votes: {
    for: bigint;
    against: bigint;
    abstain: bigint;
  };
  startLedger: number;
  endLedger: number;
}

export default function ProposalDetailPage({ params }: { params: { id: string } }) {
  const { address, network } = useWallet();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<{ title: string; description: string } | null>(null);
  const [hashMismatched, setHashMismatched] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [votes, setVotes] = useState<ProposalVote[]>([]);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [showVotingModal, setShowVotingModal] = useState(false);
  const [selectedVoteType, setSelectedVoteType] = useState<VoteType | null>(null);
  const [governorSettings, setGovernorSettings] = useState<GovernorSettings | null>(null);
  const [timelockInfo, setTimelockInfo] = useState<TimelockInfo | null>(null);

  const governorClient = useMemo(() => new GovernorClient(network), [network]);
  const votesClient = useMemo(() => new VotesClient(network), [network]);

  const loadProposal = useCallback(async () => {
    try {
      setLoading(true);
      const p = await governorClient.getProposal(params.id);
      
      // Convert SDK proposal to local Proposal interface
      const localProposal: Proposal = {
        id: p.id.toString(),
        proposer: p.proposer,
        description: "", // Will be filled from metadata
        descriptionHash: p.descriptionHash.toString("hex"),
        uri: p.link,
        status: p.status,
        votes: {
          for: p.votes.for,
          against: p.votes.against,
          abstain: p.votes.abstain,
        },
        startLedger: p.startLedger,
        endLedger: p.endLedger,
      };
      
      setProposal(localProposal);

      // Fetch metadata
      try {
        const meta = await fetchProposalMetadata(p.link);
        setMetadata(meta);
        
        // Verify hash
        const isValid = verifyMetadataHash(JSON.stringify(meta), p.descriptionHash);
        setHashMismatched(!isValid);
      } catch (e) {
        console.error("Failed to fetch metadata:", e);
        setFetchError(true);
      }

      // Fetch votes from backend
      try {
        const v = await fetchProposalVotes(params.id);
        setVotes(v);
      } catch (e) {
        console.error("Failed to fetch votes:", e);
      }

      // Fetch governor settings
      try {
        const settings = await governorClient.getSettings();
        setGovernorSettings(settings);
      } catch (e) {
        console.error("Failed to fetch governor settings:", e);
      }

      // Fetch timelock info if in Queued state
      if (p.status === ProposalState.Queued) {
        try {
          const info = await governorClient.getProposalTimelockInfo(params.id);
          setTimelockInfo(info);
        } catch (e) {
          console.error("Failed to fetch timelock info:", e);
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }, [params.id, governorClient, network]);

  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  const voteData = useMemo(() => {
    if (!proposal) return [];
    const total = proposal.votes.for + proposal.votes.against + proposal.votes.abstain;
    if (total === 0n) return [
      { name: "For", value: 0, color: "#22c55e" },
      { name: "Against", value: 0, color: "#ef4444" },
      { name: "Abstain", value: 0, color: "#94a3b8" },
    ];
    
    return [
      { name: "For", value: Number(proposal.votes.for), color: "#22c55e" },
      { name: "Against", value: Number(proposal.votes.against), color: "#ef4444" },
      { name: "Abstain", value: Number(proposal.votes.abstain), color: "#94a3b8" },
    ];
  }, [proposal]);

  const statusColors = {
    [ProposalState.Pending]: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    [ProposalState.Active]: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    [ProposalState.Canceled]: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    [ProposalState.Defeated]: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    [ProposalState.Succeeded]: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    [ProposalState.Queued]: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
    [ProposalState.Expired]: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    [ProposalState.Executed]: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  };

  const statusLabels = {
    [ProposalState.Pending]: "Pending",
    [ProposalState.Active]: "Active",
    [ProposalState.Canceled]: "Canceled",
    [ProposalState.Defeated]: "Defeated",
    [ProposalState.Succeeded]: "Succeeded",
    [ProposalState.Queued]: "Queued",
    [ProposalState.Expired]: "Expired",
    [ProposalState.Executed]: "Executed",
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-500 font-medium">Loading proposal details...</p>
      </div>
    );
  }

  if (error || !proposal) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-900 mb-2">Error Loading Proposal</h2>
          <p className="text-red-700 mb-6">{error || "Proposal not found"}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Section */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusColors[proposal.status]}`}>
            {statusLabels[proposal.status]}
          </span>
          <span className="text-gray-400 text-sm">Proposal #{proposal.id.substring(0, 8)}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 dark:text-white mb-4 leading-tight">
          {metadata?.title || "Untitled Proposal"}
        </h1>
        <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex-shrink-0" />
            <span className="font-medium text-gray-700 dark:text-gray-300">
              {proposal.proposer.substring(0, 6)}...{proposal.proposer.substring(proposal.proposer.length - 4)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Ends at ledger {proposal.endLedger}</span>
          </div>
          <a 
            href={proposal.uri} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium transition-colors"
          >
            View Source <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Description & Votes */}
        <div className="lg:col-span-2 space-y-8">
          {/* Status Specific Alerts */}
          {proposal.status === ProposalState.Active && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-800 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-green-900 dark:text-green-100 mb-1">Voting is Open</h3>
                <div className="flex items-center gap-2">
                  <CountdownTimer 
                    label="Ends in" 
                    targetLedger={proposal.endLedger} 
                    className="text-green-700 dark:text-green-300 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {proposal.status === ProposalState.Queued && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-6 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-blue-900 dark:text-blue-100 mb-1">
                  Proposal Queued in Timelock
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-4">
                  The voting period has ended and the proposal is waiting in the timelock for execution.
                </p>

                {timelockInfo ? (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white/50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">Veto Window</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <CountdownTimer 
                          label="Closes in" 
                          targetLedger={timelockInfo.vetoWindowEndLedger} 
                        />
                        <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-mono">
                          until ledger {timelockInfo.vetoWindowEndLedger}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white/50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">Execution Readiness</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <CountdownTimer 
                          label="Executable in" 
                          targetLedger={timelockInfo.executableAtLedger} 
                        />
                        <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-mono">
                          after ledger {timelockInfo.executableAtLedger}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-white/50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                        <span className="text-xs font-semibold text-blue-800 dark:text-blue-200">Execution Deadline</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <CountdownTimer 
                          label="Expires in" 
                          targetLedger={timelockInfo.executionDeadlineLedger} 
                        />
                        <span className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-mono">
                          before ledger {timelockInfo.executionDeadlineLedger}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-blue-600 animate-pulse py-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs font-medium">Calculating timelock details...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* Hash Mismatch Warning */}
      {hashMismatched && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h3 className="font-semibold text-amber-800">Content Integrity Warning</h3>
            <p className="text-amber-700 mt-0.5">
              The external content fetched for this proposal does not match the hash stored on-chain.
              The displayed description may have been tampered with.
            </p>
            <div className="mt-2 space-y-1 font-mono text-[11px]">
              <p className="text-gray-500">On-chain: {proposal.descriptionHash.substring(0, 16)}...</p>
            </div>
          </div>
        </div>
      )}

      {/* Fetch Error Info */}
      {fetchError && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex gap-3 text-sm">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-blue-700">
            <p className="font-semibold text-blue-800">Metadata Unreachable</p>
            <p className="mt-0.5">Could not load the full description. Check the URI directly below.</p>
            <a 
              href={proposal.uri} 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 font-mono text-[11px] bg-white/50 px-2 py-1 rounded border border-blue-100"
            >
              {proposal.uri.substring(0, 50)}... <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Description</h2>
          <div className="prose prose-blue dark:prose-invert max-w-none">
            {metadata?.description ? (
              <div dangerouslySetInnerHTML={{ __html: metadata.description.replace(/\n/g, '<br/>') }} />
            ) : (
              <p className="text-gray-400 italic">No description provided.</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-8">Recent Votes</h2>
          {votes.length > 0 ? (
            <div className="space-y-4">
              {votes.map((vote, i) => (
                <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] font-bold">
                      {vote.voter.substring(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {vote.voter.substring(0, 6)}...{vote.voter.substring(vote.voter.length - 4)}
                      </p>
                      <p className="text-[10px] text-gray-500">{new Date(vote.timestamp).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {(Number(vote.amount) / 10**7).toLocaleString()} VOTES
                      </p>
                      <span className={`text-[10px] font-bold uppercase ${
                        vote.support === VoteSupport.For ? "text-green-600" :
                        vote.support === VoteSupport.Against ? "text-red-600" : "text-gray-500"
                      }`}>
                        {vote.support === VoteSupport.For ? "For" :
                         vote.support === VoteSupport.Against ? "Against" : "Abstain"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-400">No votes recorded yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Right Column: Voting & Info */}
    <div className="space-y-8">
      {/* Voting Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-xl shadow-blue-500/5 overflow-hidden sticky top-8">
        <div className="p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-8">Cast Your Vote</h2>
          
          <div className="h-64 mb-8">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={voteData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {voteData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-4 mb-8">
            {voteData.map((v) => (
              <div key={v.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: v.color }} />
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{v.name}</span>
                </div>
                <span className="text-sm font-bold text-gray-900 dark:text-white">
                  {(v.value / 10**7).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {proposal.status === ProposalState.Active && (
            <div className="space-y-3">
              <button 
                onClick={() => {
                  setSelectedVoteType(VoteType.For);
                  setShowVotingModal(true);
                }}
                className="w-full py-4 bg-green-600 text-white rounded-2xl font-bold hover:bg-green-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-green-600/20"
              >
                Vote For
              </button>
              <button 
                onClick={() => {
                  setSelectedVoteType(VoteType.Against);
                  setShowVotingModal(true);
                }}
                className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-red-600/20"
              >
                Vote Against
              </button>
              <button 
                onClick={() => {
                  setSelectedVoteType(VoteType.Abstain);
                  setShowVotingModal(true);
                }}
                className="w-full py-4 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-2xl font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
              >
                Abstain
              </button>
            </div>
          )}

          {proposal.status === ProposalState.Pending && (
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl">
              <p className="text-sm text-gray-500 font-medium">Voting has not started yet.</p>
              <p className="text-xs text-gray-400 mt-1">Starts at ledger {proposal.startLedger}</p>
            </div>
          )}

          {proposal.status !== ProposalState.Active && proposal.status !== ProposalState.Pending && (
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl">
              <p className="text-sm text-gray-500 font-medium">Voting is closed for this proposal.</p>
            </div>
          )}
        </div>
        
        <div className="border-t border-gray-100 dark:border-gray-800 p-8 bg-gray-50/50 dark:bg-gray-800/30">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Governance Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Quorum</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {governorSettings ? (Number(governorSettings.quorum) / 10**7).toLocaleString() : "..."} VOTES
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Threshold</span>
              <span className="font-semibold text-gray-700 dark:text-gray-300">
                {governorSettings ? (Number(governorSettings.countingType) === 0 ? "Single Majority" : "Super Majority") : "..."}
              </span>
            </div>
          </div>
          
          <button 
            onClick={() => setShowDelegateModal(true)}
            className="w-full mt-6 py-3 border-2 border-blue-600 text-blue-600 dark:text-blue-400 rounded-xl text-xs font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            Delegate Your Voting Power
          </button>
        </div>
      </div>
    </div>
  </div>

  <DelegateModal 
    isOpen={showDelegateModal} 
    onClose={() => setShowDelegateModal(false)} 
  />

  {proposal && selectedVoteType !== null && (
    <VotingModal
      isOpen={showVotingModal}
      onClose={() => {
        setShowVotingModal(false);
        setSelectedVoteType(null);
      }}
      proposalId={proposal.id}
      voteType={selectedVoteType}
      proposalTitle={metadata?.title || "Untitled Proposal"}
      onSuccess={loadProposal}
    />
  )}
</div>
);
}

