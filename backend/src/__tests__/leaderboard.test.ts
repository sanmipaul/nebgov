import request from "supertest";
import app from "../index";
import pool from "../db/pool";

describe("Leaderboard Endpoints", () => {
  let userId: number;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING id",
      ["GTEST987654321ZYXWVUTSRQPONMLKJIHGFEDCBA"],
    );
    userId = userResult.rows[0].id;

    // Create test leaderboard history
    await pool.query(
      `INSERT INTO leaderboard_history (user_id, score, rank, snapshot_date)
       VALUES ($1, $2, $3, $4)`,
      [userId, 1000, 1, new Date("2024-01-01")],
    );

    await pool.query(
      `INSERT INTO leaderboard_history (user_id, score, rank, snapshot_date)
       VALUES ($1, $2, $3, $4)`,
      [userId, 1500, 1, new Date("2024-01-02")],
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM leaderboard_history WHERE user_id = $1", [
      userId,
    ]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  });

  describe("GET /leaderboard/history", () => {
    it("should fetch leaderboard history", async () => {
      const response = await request(app)
        .get("/leaderboard/history")
        .expect(200);

      expect(response.body).toHaveProperty("data");
      expect(response.body).toHaveProperty("pagination");
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it("should filter by date", async () => {
      const response = await request(app)
        .get("/leaderboard/history?date=2024-01-01")
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      response.body.data.forEach((entry: any) => {
        expect(entry.snapshot_date).toContain("2024-01-01");
      });
    });

    it("should filter by user_id", async () => {
      const response = await request(app)
        .get(`/leaderboard/history?user_id=${userId}`)
        .expect(200);

      expect(response.body.data.length).toBe(2);
      response.body.data.forEach((entry: any) => {
        expect(entry.user_id).toBe(userId);
      });
    });

    it("should respect pagination", async () => {
      const response = await request(app)
        .get("/leaderboard/history?limit=1&offset=0")
        .expect(200);

      expect(response.body.data.length).toBe(1);
      expect(response.body.pagination.limit).toBe(1);
      expect(response.body.pagination.offset).toBe(0);
    });
  });
});
