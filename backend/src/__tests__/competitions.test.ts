import request from "supertest";
import app from "../index";
import pool from "../db/pool";
import jwt from "jsonwebtoken";

describe("Competition Endpoints", () => {
  let authToken: string;
  let userId: number;
  let competitionId: number;

  beforeAll(async () => {
    // Create test user
    const userResult = await pool.query(
      "INSERT INTO users (wallet_address) VALUES ($1) RETURNING id",
      ["GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    );
    userId = userResult.rows[0].id;

    // Generate auth token
    authToken = jwt.sign(
      { userId, walletAddress: "GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ" },
      process.env.JWT_SECRET!,
    );

    // Create test competition
    const compResult = await pool.query(
      `INSERT INTO competitions (name, description, entry_fee, start_date, end_date, is_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        "Test Competition",
        "Test Description",
        1000,
        new Date(Date.now() + 86400000), // Tomorrow
        new Date(Date.now() + 172800000), // Day after tomorrow
        true,
        userId,
      ],
    );
    competitionId = compResult.rows[0].id;
  });

  afterAll(async () => {
    await pool.query(
      "DELETE FROM competition_participants WHERE user_id = $1",
      [userId],
    );
    await pool.query("DELETE FROM competitions WHERE id = $1", [competitionId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.end();
  });

  describe("POST /competitions/:id/join", () => {
    it("should join a competition successfully", async () => {
      const response = await request(app)
        .post(`/competitions/${competitionId}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(201);

      expect(response.body.message).toBe("Successfully joined competition");
      expect(response.body.participant).toHaveProperty("id");
      expect(response.body.participant.competition_id).toBe(competitionId);
    });

    it("should fail when already joined", async () => {
      const response = await request(app)
        .post(`/competitions/${competitionId}/join`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error).toBe("Already joined this competition");
    });

    it("should fail without authentication", async () => {
      await request(app)
        .post(`/competitions/${competitionId}/join`)
        .expect(401);
    });

    it("should fail for non-existent competition", async () => {
      const response = await request(app)
        .post("/competitions/99999/join")
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe("Competition not found");
    });
  });

  describe("DELETE /competitions/:id/leave", () => {
    it("should leave a competition successfully", async () => {
      const response = await request(app)
        .delete(`/competitions/${competitionId}/leave`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe("Successfully left competition");
      expect(response.body).toHaveProperty("refund");
    });

    it("should fail when not a participant", async () => {
      const response = await request(app)
        .delete(`/competitions/${competitionId}/leave`)
        .set("Authorization", `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error).toBe("Not a participant in this competition");
    });

    it("should fail without authentication", async () => {
      await request(app)
        .delete(`/competitions/${competitionId}/leave`)
        .expect(401);
    });
  });
});
