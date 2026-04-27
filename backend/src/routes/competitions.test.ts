import request from "supertest";
import express, { Express } from "express";

// Use a simple mock that we can control
const mockQuery = jest.fn();
jest.mock("../db/pool", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
  connect: jest.fn(),
}));

import competitionsRouter from "./competitions";

function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/competitions", competitionsRouter);
  return app;
}

describe("Competitions API", () => {
  let app: Express;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_SECRET = "test-admin-secret";
    app = createApp();
  });

  describe("GET /competitions", () => {
    it("returns paginated list of competitions", async () => {
      const mockCompetitions = [
        {
          id: 1,
          name: "Test Competition",
          description: "A test competition",
          entry_fee: "100",
          start_date: new Date("2025-01-01"),
          end_date: new Date("2025-12-31"),
          is_active: true,
          created_by: 1,
          created_at: new Date(),
          updated_at: new Date(),
          participant_count: "5",
        },
      ];

      mockQuery
        .mockResolvedValueOnce({
          rows: mockCompetitions,
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "1" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get("/competitions")
        .expect(200);

      expect(response.body).toHaveProperty("competitions");
      expect(response.body).toHaveProperty("total");
      expect(response.body).toHaveProperty("limit");
      expect(response.body).toHaveProperty("offset");
      expect(response.body.competitions).toHaveLength(1);
      expect(response.body.competitions[0].name).toBe("Test Competition");
      expect(response.body.total).toBe(1);
    });

    it("returns empty array when no competitions exist", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get("/competitions")
        .expect(200);

      expect(response.body.competitions).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it("filters by is_active query param", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await request(app)
        .get("/competitions?is_active=true")
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("is_active"),
        expect.any(Array),
      );
    });

    it("respects limit and offset query params", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await request(app)
        .get("/competitions?limit=10&offset=5")
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT"),
        expect.arrayContaining([10, 5]),
      );
    });

    it("uses default limit and offset when not provided", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await request(app).get("/competitions").expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT $"),
        expect.arrayContaining([20, 0]),
      );
    });

    it("returns 400 for invalid limit", async () => {
      const response = await request(app)
        .get("/competitions?limit=invalid")
        .expect(400);

      expect(response.body).toHaveProperty("errors");
      expect(response.body.errors[0].field).toBe("limit");
    });

    it("returns 400 for negative offset", async () => {
      const response = await request(app)
        .get("/competitions?offset=-1")
        .expect(400);

      expect(response.body).toHaveProperty("errors");
      expect(response.body.errors[0].field).toBe("offset");
    });

    it("returns 400 for limit exceeding max", async () => {
      const response = await request(app)
        .get("/competitions?limit=999")
        .expect(400);

      expect(response.body).toHaveProperty("errors");
    });
  });

  describe("GET /competitions/:id", () => {
    it("returns a single competition with participant count", async () => {
      const mockCompetition = {
        id: 1,
        name: "Test Competition",
        description: "A test competition",
        entry_fee: "100",
        start_date: new Date("2025-01-01"),
        end_date: new Date("2025-12-31"),
        is_active: true,
        created_by: 1,
        created_at: new Date(),
        updated_at: new Date(),
        participant_count: "42",
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockCompetition],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get("/competitions/1")
        .expect(200);

      expect(response.body).toHaveProperty("competition");
      expect(response.body.competition.name).toBe("Test Competition");
      expect(response.body.competition.participant_count).toBe("42");
    });

    it("returns 404 for non-existent competition", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: "",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get("/competitions/999")
        .expect(404);

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Competition not found");
    });

    it("returns 400 for invalid id format", async () => {
      const response = await request(app)
        .get("/competitions/invalid")
        .expect(400);

      expect(response.body).toHaveProperty("errors");
      expect(response.body.errors[0].field).toBe("id");
    });
  });

  describe("GET /competitions/:id/participants", () => {
    it("returns paginated participant list", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              competition_id: 1,
              user_id: 1,
              joined_at: new Date(),
              entry_fee_paid: "100",
              wallet_address: "0x123",
            },
          ],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "1" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get("/competitions/1/participants")
        .expect(200);

      expect(response.body).toHaveProperty("participants");
      expect(response.body).toHaveProperty("total");
      expect(response.body.participants).toHaveLength(1);
      expect(response.body.participants[0]).toHaveProperty("wallet_address");
    });

    it("returns empty array when no participants", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .get("/competitions/1/participants")
        .expect(200);

      expect(response.body.participants).toEqual([]);
      expect(response.body.total).toBe(0);
    });

    it("respects limit and offset params", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ id: 1 }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 0,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await request(app)
        .get("/competitions/1/participants?limit=5&offset=10")
        .expect(200);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT"),
        expect.arrayContaining([5, 10]),
      );
    });

    it("returns 404 when competition does not exist", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: "",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .get("/competitions/999/participants")
        .expect(404);

      expect(response.body).toHaveProperty("error");
    });

    it("returns 400 for invalid competition id", async () => {
      const response = await request(app)
        .get("/competitions/invalid/participants")
        .expect(400);

      expect(response.body).toHaveProperty("errors");
    });
  });

  describe("Admin competition routes", () => {
    const adminHeader = { ADMIN_SECRET: "test-admin-secret" };

    it("blocks create competition without admin secret", async () => {
      await request(app)
        .post("/competitions")
        .send({
          name: "Q2 Governance Sprint",
          description: "desc",
          entry_fee: 1000,
          start_date: "2030-07-01T00:00:00.000Z",
          end_date: "2030-07-31T00:00:00.000Z",
        })
        .expect(403);
    });

    it("creates a competition with admin secret", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 7,
          name: "Q2 Governance Sprint",
          description: "desc",
          entry_fee: "1000",
          start_date: "2030-07-01T00:00:00.000Z",
          end_date: "2030-07-31T00:00:00.000Z",
          is_active: true,
          created_by: null,
        }],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .post("/competitions")
        .set(adminHeader)
        .send({
          name: "Q2 Governance Sprint",
          description: "desc",
          entry_fee: 1000,
          start_date: "2030-07-01T00:00:00.000Z",
          end_date: "2030-07-31T00:00:00.000Z",
        })
        .expect(201);

      expect(response.body).toHaveProperty("competition");
      expect(response.body.competition.name).toBe("Q2 Governance Sprint");
    });

    it("rejects create when end_date is not in the future", async () => {
      const response = await request(app)
        .post("/competitions")
        .set(adminHeader)
        .send({
          name: "Old Competition",
          description: "desc",
          entry_fee: 1000,
          start_date: "2020-01-01T00:00:00.000Z",
          end_date: "2020-01-02T00:00:00.000Z",
        })
        .expect(400);

      expect(response.body).toHaveProperty("errors");
    });

    it("updates a competition before start_date", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 7,
            name: "Existing",
            description: "desc",
            entry_fee: "1000",
            start_date: "2030-07-01T00:00:00.000Z",
            end_date: "2030-07-31T00:00:00.000Z",
            is_active: true,
            created_by: null,
          }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 7,
            name: "Updated Name",
            description: "desc",
            entry_fee: "2000",
            start_date: "2030-07-01T00:00:00.000Z",
            end_date: "2030-08-15T00:00:00.000Z",
            is_active: true,
            created_by: null,
          }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .put("/competitions/7")
        .set(adminHeader)
        .send({
          name: "Updated Name",
          entry_fee: 2000,
          end_date: "2030-08-15T00:00:00.000Z",
        })
        .expect(200);

      expect(response.body.competition.name).toBe("Updated Name");
    });

    it("rejects update after competition start_date", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 8,
          name: "Started Competition",
          description: "desc",
          entry_fee: "1000",
          start_date: "2020-01-01T00:00:00.000Z",
          end_date: "2030-01-01T00:00:00.000Z",
          is_active: true,
          created_by: null,
        }],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const response = await request(app)
        .put("/competitions/8")
        .set(adminHeader)
        .send({ name: "Too Late" })
        .expect(400);

      expect(response.body.error).toContain("before start_date");
    });

    it("soft deletes a competition without participants", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 9,
            name: "To Delete",
            start_date: "2030-07-01T00:00:00.000Z",
          }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "0" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      await request(app)
        .delete("/competitions/9")
        .set(adminHeader)
        .expect(204);
    });

    it("rejects soft delete when participants exist", async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            name: "Has Participants",
            start_date: "2030-07-01T00:00:00.000Z",
          }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        })
        .mockResolvedValueOnce({
          rows: [{ count: "3" }],
          command: "",
          rowCount: 1,
          oid: 0,
          fields: [],
        });

      const response = await request(app)
        .delete("/competitions/10")
        .set(adminHeader)
        .expect(400);

      expect(response.body.error).toContain("existing participants");
    });
  });
});
