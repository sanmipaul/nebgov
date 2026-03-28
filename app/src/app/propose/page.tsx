"use client";

/**
 * Create proposal page with simulation support.
 * TODO issue #44: add calldata encoder for on-chain execution targets.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProposalAction {
  target: string;
  function: string;
  args: any[];
}

interface SimulationResult {
  success: boolean;
  computeUnits?: number;
  stateChanges?: any[];
  error?: string;
}

export default function ProposePage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [target, setTarget] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [args, setArgs] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parseArgs = (argsString: string): any[] => {
    if (!argsString.trim()) return [];
    try {
      return JSON.parse(argsString);
    } catch {
      return argsString.split(',').map(arg => arg.trim());
    }
  };

  const getErrorMessage = (error: string): string => {
    if (error.includes("insufficient fee")) {
      return "Transaction fee is too low. Please increase the fee.";
    }
    if (error.includes("invalid address")) {
      return "Invalid contract address provided.";
    }
    if (error.includes("no such function")) {
      return "The specified function doesn't exist on the target contract.";
    }
    if (error.includes("invalid args")) {
      return "The function arguments are invalid or malformed.";
    }
    return error;
  };

  async function handleSimulation(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !target.trim() || !functionName.trim()) return;

    setSimulating(true);
    setSimulationResult(null);
    setError(null);

    try {
      const actions: ProposalAction[] = [{
        target: target.trim(),
        function: functionName.trim(),
        args: parseArgs(args)
      }];

      // TODO: Replace with actual GovernorClient.simulateProposal call
      console.log("Simulating proposal:", { description, actions });
      
      // Mock simulation result for now
      await new Promise((r) => setTimeout(r, 1000));
      
      const mockResult: SimulationResult = {
        success: true,
        computeUnits: 125000,
        stateChanges: []
      };
      
      setSimulationResult(mockResult);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      setSimulationResult({
        success: false,
        error: getErrorMessage(errorMessage)
      });
    } finally {
      setSimulating(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !target.trim() || !functionName.trim()) return;

    // Check if simulation was successful
    if (!simulationResult?.success) {
      setError("Please run and pass simulation before submitting the proposal.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // TODO issue #44: call GovernorClient.propose() with connected wallet.
      // Placeholder — replace with real submission.
      console.log("Submitting proposal:", { description, target, functionName, args });
      await new Promise((r) => setTimeout(r, 1500));
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">New Proposal</h1>
      <p className="text-gray-500 mb-8">
        Proposals require meeting the proposal threshold in voting power.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label
            htmlFor="description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Title / Description
          </label>
          <textarea
            id="description"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this proposal will do..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label
            htmlFor="target"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Target Contract Address
          </label>
          <input
            id="target"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label
            htmlFor="function"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Function Name
          </label>
          <input
            id="function"
            type="text"
            value={functionName}
            onChange={(e) => setFunctionName(e.target.value)}
            placeholder="transfer"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            required
          />
        </div>

        <div>
          <label
            htmlFor="args"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Function Arguments (JSON or comma-separated)
          </label>
          <textarea
            id="args"
            rows={3}
            value={args}
            onChange={(e) => setArgs(e.target.value)}
            placeholder='["recipient_address", 1000] or recipient_address, 1000'
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Simulation Results */}
        {simulationResult && (
          <div className={`rounded-lg p-4 ${simulationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <h3 className={`font-medium mb-2 ${simulationResult.success ? 'text-green-800' : 'text-red-800'}`}>
              Simulation {simulationResult.success ? 'Passed' : 'Failed'}
            </h3>
            {simulationResult.success ? (
              <div className="text-sm text-green-700">
                <p>Compute units required: {simulationResult.computeUnits?.toLocaleString()}</p>
                <p className="mt-1">✓ Proposal execution should succeed</p>
              </div>
            ) : (
              <div className="text-sm text-red-700">
                <p>{simulationResult.error}</p>
                <p className="mt-1">✗ Please fix the issues before submitting</p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            type="button"
            onClick={handleSimulation}
            disabled={simulating || !description.trim() || !target.trim() || !functionName.trim()}
            className="flex-1 bg-gray-600 text-white py-2.5 rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {simulating ? "Simulating..." : "Run Simulation"}
          </button>

          <button
            type="submit"
            disabled={submitting || !description.trim() || !target.trim() || !functionName.trim() || !simulationResult?.success}
            className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Submitting..." : "Submit Proposal"}
          </button>
        </div>

        {error && (
          <p className="text-red-600 text-sm">{error}</p>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <strong>Simulation Required:</strong> Run simulation before submission to verify your proposal will execute successfully.
        </div>
      </form>
    </div>
  );
}
