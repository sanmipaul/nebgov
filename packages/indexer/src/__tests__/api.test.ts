import request from "supertest";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { createApp } from "../api";
import { pool } from "../db";

// Mock the database
jest.mock("../db", () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock the cache module
jest.mock("../cache", () => ({
  cached: jest.fn((key, ttl, fn) => fn()),
  getMetrics: jest.fn(() => ({ hits: 0, misses: 0, size: 0 })),
}));

// Mock the events module
jest.mock("../events", () => ({
  getLastIndexedLedger: jest.fn(() => Promise.resolve(1000)),
}));

// Mock the index module
jest.mock("../index", () => ({
  startTime: Date.now() - 60000, // 1 minute ago
}));

const mockPool = pool as jest.Mocked<typeof pool>;

describe("API Endpoints", () => {
  let app: any;
  let mockServer: SorobanRpc.Server;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock SorobanRpc.Server
    mockServer = {
      getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1050 }),
    } as any;
    
    app = createApp(mockServer);
  });

  describe("GET /proposals/:id", () => {
    it("should return a proposal when found", async () => {
      const mockProposal = {
        id: 5,
        proposer: "GABC123...",
        description: "Fund the security audit",
        start_ledger: 54000,
        end_ledger: 54500,
        votes_for: 12000,
        votes_against: 3000,
        votes_abstain: 500,
        executed: false,
        cancelled: false,
        queued: false,
        created_at: "2026-04-20T10:00:00Z",
      };

      (mockPool.query as jest.Mock).mockResolvedValueOnce({
        rows: [mockProposal],
        rowCount: 1,
      });

      const response = await request(app).get("/proposals/5");

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProposal);
      expect(mockPool.query).toHaveBeenCalledWith(
        "SELECT * FROM proposals WHERE id = $1",
        [5]
      );
    });

    it("should return 404 when proposal not found", async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      });

      const response = await request(app).get("/proposals/999");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: "Proposal not found" });
    });

    it("should return 400 for invalid proposal ID", async () => {
      const response = await request(app).get("/proposals/invalid");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Invalid proposal ID" });
    });

    it("should return 400 for negative proposal ID", async () => {
      const response = await request(app).get("/proposals/-1");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Invalid proposal ID" });
    });

    it("should return 500 on database error", async () => {
      (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error("Database error"));

      const response = await request(app).get("/proposals/5");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Internal server error" });
    });
  });

  describe("GET /proposals with cursor pagination", () => {
    const mockProposals = [
      { id: 47, description: "Proposal 47" },
      { id: 46, description: "Proposal 46" },
      { id: 45, description: "Proposal 45" },
    ];

    it("should return proposals with cursor pagination (before)", async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: mockProposals,
          rowCount: 3,
        })
        .mockResolvedValueOnce({
          rows: [{ id: 44 }], // hasMore check
          rowCount: 1,
        });

      const response = await request(app).get("/proposals?before=47&limit=3");

      expect(response.status).toBe(200);
      expect(response.body.proposals).toEqual(mockProposals);
      expect(response.body.nextCursor).toBe(45);
      expect(response.body.prevCursor).toBe(47);
      expect(response.body.hasMore).toBe(true);
    });

    it("should return proposals with cursor pagination (after)", async () => {
      const reversedProposals = [...mockProposals].reverse();
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: reversedProposals, // Will be reversed back
          rowCount: 3,
        })
        .mockResolvedValueOnce({
          rows: [{ id: 48 }], // hasMore check
          rowCount: 1,
        });

      const response = await request(app).get("/proposals?after=44&limit=3");

      expect(response.status).toBe(200);
      expect(response.body.proposals).toEqual(mockProposals);
      expect(response.body.hasMore).toBe(true);
    });

    it("should fall back to offset pagination when no cursor provided", async () => {
      (mockPool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockProposals,
        rowCount: 3,
      });

      const response = await request(app).get("/proposals?offset=0&limit=3");

      expect(response.status).toBe(200);
      expect(response.body.proposals).toEqual(mockProposals);
      expect(response.body.total).toBe(3);
      expect(response.body.nextCursor).toBeUndefined();
    });

    it("should handle hasMore=false when no more results", async () => {
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: mockProposals,
          rowCount: 3,
        })
        .mockResolvedValueOnce({
          rows: [], // No more results
          rowCount: 0,
        });

      const response = await request(app).get("/proposals?before=47&limit=3");

      expect(response.status).toBe(200);
      expect(response.body.hasMore).toBe(false);
    });

    it("should return 500 on database error", async () => {
      (mockPool.query as jest.Mock).mockRejectedValueOnce(new Error("Database error"));

      const response = await request(app).get("/proposals?before=47&limit=3");

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: "Internal server error" });
    });
  });
});