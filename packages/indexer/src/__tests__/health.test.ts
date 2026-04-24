import request from "supertest";
import { SorobanRpc } from "@stellar/stellar-sdk";
import express from "express";
import { pool } from "../db";
import { getLastIndexedLedger } from "../events";

// Mock dependencies
jest.mock("../db");
jest.mock("../events");
jest.mock("../index", () => ({
  startTime: Date.now() - 3600000, // 1 hour ago
}));

const mockPool = pool as jest.Mocked<typeof pool>;
const mockGetLastIndexedLedger = getLastIndexedLedger as jest.MockedFunction<typeof getLastIndexedLedger>;

// Import after mocks are set up
import { createApp } from "../api";

describe("GET /health", () => {
  let app: express.Application;
  let mockServer: jest.Mocked<SorobanRpc.Server>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock Soroban RPC server
    mockServer = {
      getLatestLedger: jest.fn(),
    } as any;

    app = createApp(mockServer);

    // Default mock implementations
    mockGetLastIndexedLedger.mockResolvedValue(54321);
    
    (mockPool.query as jest.Mock).mockImplementation((query: string) => {
      if (query.includes("proposals")) {
        return Promise.resolve({ rows: [{ count: "12" }] });
      }
      if (query.includes("votes")) {
        return Promise.resolve({ rows: [{ count: "87" }] });
      }
      if (query.includes("delegates")) {
        return Promise.resolve({ rows: [{ count: "34" }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  it("returns 200 and full health status when lag is within threshold", async () => {
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 54325,
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      last_indexed_ledger: 54321,
      current_ledger: 54325,
      lag_ledgers: 4,
      lag_seconds: 20,
      total_proposals_indexed: 12,
      total_votes_indexed: 87,
      total_delegates_indexed: 34,
    });
    expect(response.body.uptime_seconds).toBeGreaterThan(3500);
    expect(response.body.timestamp).toBeDefined();
    expect(new Date(response.body.timestamp).getTime()).toBeGreaterThan(0);
  });

  it("returns 503 and degraded status when lag exceeds threshold", async () => {
    // Set HEALTH_LAG_THRESHOLD to 100 (default)
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 54521, // 200 ledgers ahead
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      last_indexed_ledger: 54321,
      current_ledger: 54521,
      lag_ledgers: 200,
      lag_seconds: 1000, // 200 * 5 seconds
      total_proposals_indexed: 12,
      total_votes_indexed: 87,
      total_delegates_indexed: 34,
    });
  });

  it("calculates lag correctly when indexer is at current ledger", async () => {
    mockGetLastIndexedLedger.mockResolvedValue(54325);
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 54325,
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      lag_ledgers: 0,
      lag_seconds: 0,
    });
  });

  it("handles zero counts gracefully", async () => {
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 100,
      id: "abc123",
      protocolVersion: 20,
    } as any);
    mockGetLastIndexedLedger.mockResolvedValue(95);

    (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{ count: "0" }] });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: "ok",
      total_proposals_indexed: 0,
      total_votes_indexed: 0,
      total_delegates_indexed: 0,
    });
  });

  it("returns 503 when RPC call fails", async () => {
    mockServer.getLatestLedger.mockRejectedValue(new Error("RPC connection failed"));

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      error: "Failed to retrieve health status",
    });
    expect(response.body.timestamp).toBeDefined();
  });

  it("returns 503 when database query fails", async () => {
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 54325,
      id: "abc123",
      protocolVersion: 20,
    } as any);
    (mockPool.query as jest.Mock).mockRejectedValue(new Error("Database connection failed"));

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: "degraded",
      error: "Failed to retrieve health status",
    });
  });

  it("calculates lag_seconds correctly based on ledger difference", async () => {
    mockGetLastIndexedLedger.mockResolvedValue(1000);
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 1050, // 50 ledgers behind
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.lag_ledgers).toBe(50);
    expect(response.body.lag_seconds).toBe(250); // 50 * 5 seconds
  });

  it("handles boundary case at exact threshold", async () => {
    mockGetLastIndexedLedger.mockResolvedValue(1000);
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 1100, // exactly 100 ledgers behind (threshold)
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(response.body.lag_ledgers).toBe(100);
  });

  it("marks as degraded when lag is threshold + 1", async () => {
    mockGetLastIndexedLedger.mockResolvedValue(1000);
    mockServer.getLatestLedger.mockResolvedValue({
      sequence: 1101, // 101 ledgers behind (threshold + 1)
      id: "abc123",
      protocolVersion: 20,
    } as any);

    const response = await request(app).get("/health");

    expect(response.status).toBe(503);
    expect(response.body.status).toBe("degraded");
    expect(response.body.lag_ledgers).toBe(101);
  });
});
