// Define mocks with 'mock' prefix and use 'var' for hoisting support
var mockScValToNative = jest.fn();
var mockSimulate = jest.fn();
var mockGetAccount = jest.fn();

import { GovernorClient } from "../governor";
import { ProposalState, UnknownProposalStateError, ProposalAction, ProposalSimulationResult } from "../types";

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk");
  return {
    ...actual,
    scValToNative: mockScValToNative,
    nativeToScVal: jest.fn(),
    SorobanRpc: {
      ...actual.SorobanRpc,
      Server: jest.fn().mockImplementation(() => ({
        simulateTransaction: mockSimulate,
        getAccount: mockGetAccount,
      })),
      Api: {
        isSimulationError: jest.fn((result) => result && result.error !== undefined),
      },
    },
    Contract: jest.fn().mockImplementation((addr) => ({
      call: jest.fn().mockReturnValue({}),
      address: () => addr,
    })),
    TransactionBuilder: jest.fn().mockImplementation(() => ({
      addOperation: jest.fn().mockReturnThis(),
      setTimeout: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({}),
    })),
  };
});

import { xdr, Account } from "@stellar/stellar-sdk";

describe("GovernorClient", () => {
  let client: GovernorClient;
  const validGAddr = "GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT";
  const validCAddr = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAccount.mockResolvedValue(new Account(validGAddr, "1"));
    
    // Default successful simulation response
    mockSimulate.mockResolvedValue({
      result: {
        retval: xdr.ScVal.scvVoid(),
        cost: { cpuInstructions: 125000 },
        footprint: []
      }
    });
    
    client = new GovernorClient({
      governorAddress: validCAddr,
      timelockAddress: validCAddr,
      votesAddress: validCAddr,
      network: "testnet",
    });
  });

  describe("getProposalState", () => {
    const variants = [
      { name: "Pending", expected: ProposalState.Pending },
      { name: "Active", expected: ProposalState.Active },
      { name: "Defeated", expected: ProposalState.Defeated },
      { name: "Succeeded", expected: ProposalState.Succeeded },
      { name: "Queued", expected: ProposalState.Queued },
      { name: "Executed", expected: ProposalState.Executed },
      { name: "Cancelled", expected: ProposalState.Cancelled },
    ];

    test.each(variants)("decodes variant '$name' correctly", async ({ name, expected }) => {
      const scv = {} as xdr.ScVal;
      mockSimulate.mockResolvedValue({
        result: { retval: scv },
      });
      mockScValToNative.mockReturnValue([name]);

      const state = await client.getProposalState(1n);
      expect(state).toBe(expected);
      expect(mockScValToNative).toHaveBeenCalledWith(scv);
    });

    it("throws UnknownProposalStateError for unrecognized variants", async () => {
      const scv = {} as xdr.ScVal;
      mockSimulate.mockResolvedValue({
        result: { retval: scv },
      });
      mockScValToNative.mockReturnValue(["MysteryState"]);

      await expect(client.getProposalState(1n)).rejects.toThrow(UnknownProposalStateError);
      await expect(client.getProposalState(1n)).rejects.toThrow("Unknown proposal state: MysteryState");
    });

    it("throws error for invalid ScVal format", async () => {
      const scv = {} as xdr.ScVal;
      mockSimulate.mockResolvedValue({
        result: { retval: scv },
      });
      mockScValToNative.mockReturnValue(123);

      await expect(client.getProposalState(1n)).rejects.toThrow("Invalid ScVal format for ProposalState enum");
    });
  });

  describe("simulateProposal", () => {
    const mockActions: ProposalAction[] = [
      {
        target: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA7",
        function: "transfer",
        args: ["GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT", 1000]
      }
    ];

    it("should return successful simulation result", async () => {
      mockSimulate.mockResolvedValue({
        result: {
          retval: xdr.ScVal.scvVoid(),
          cost: { cpuInstructions: 125000 },
          footprint: []
        }
      });

      const result = await client.simulateProposal(mockActions);

      expect(result).toEqual({
        success: true,
        computeUnits: 125000,
        stateChanges: []
      });
      expect(mockSimulate).toHaveBeenCalledTimes(1);
    });

    it("should handle simulation errors", async () => {
      const { SorobanRpc } = require("@stellar/stellar-sdk");
      SorobanRpc.Api.isSimulationError.mockReturnValue(true);
      mockSimulate.mockResolvedValue({
        error: "Insufficient fee"
      });

      const result = await client.simulateProposal(mockActions);

      expect(result).toEqual({
        success: false,
        error: "Simulation failed: Insufficient fee"
      });

      // Reset the mock for other tests
      SorobanRpc.Api.isSimulationError.mockReturnValue(false);
    });

    it("should handle multiple actions", async () => {
      const multipleActions: ProposalAction[] = [
        mockActions[0],
        {
          target: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8",
          function: "approve",
          args: ["GBFUUXATVOGXGD4KS3I423QFZSPE4ZFOQ3TCJVWFUYSIPULXIRVRE2DT"]
        }
      ];

      mockSimulate.mockResolvedValue({
        result: {
          retval: xdr.ScVal.scvVoid(),
          cost: { cpuInstructions: 75000 },
          footprint: []
        }
      });

      const result = await client.simulateProposal(multipleActions);

      expect(result).toEqual({
        success: true,
        computeUnits: 150000, // 75000 * 2
        stateChanges: []
      });
      expect(mockSimulate).toHaveBeenCalledTimes(2);
    });

    it("should handle network errors", async () => {
      mockSimulate.mockRejectedValue(new Error("Network error"));

      const result = await client.simulateProposal(mockActions);

      expect(result).toEqual({
        success: false,
        error: "Network error"
      });
    });

    it("should handle missing simulation result", async () => {
      mockSimulate.mockResolvedValue({
        result: null
      });

      const result = await client.simulateProposal(mockActions);

      expect(result).toEqual({
        success: false,
        error: "No simulation result returned"
      });
    });

    it("should handle zero compute units", async () => {
      mockSimulate.mockResolvedValue({
        result: {
          retval: xdr.ScVal.scvVoid(),
          cost: { cpuInstructions: 0 },
          footprint: []
        }
      });

      const result = await client.simulateProposal(mockActions);

      expect(result).toEqual({
        success: true,
        computeUnits: 0,
        stateChanges: []
      });
    });
  });
});
