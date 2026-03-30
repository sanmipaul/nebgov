import { Router } from "express";
import { body, param, validationResult } from "express-validator";
import pool from "../db/pool";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Competition } from "../entities/Competition";
import { CompetitionParticipant } from "../entities/CompetitionParticipant";

const router = Router();

// POST /competitions/:id/join - Join a competition
router.post(
  "/:id/join",
  authenticate,
  param("id").isInt().toInt(),
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const competitionId = parseInt(req.params.id);
      const userId = req.userId!;

      // Check if competition exists and is active
      const compResult = await client.query<Competition>(
        "SELECT * FROM competitions WHERE id = $1",
        [competitionId],
      );

      if (compResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Competition not found" });
      }

      const competition = compResult.rows[0];

      if (!competition.is_active) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Competition is not active" });
      }

      // Check if competition has started
      if (new Date() >= new Date(competition.start_date)) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Competition has already started" });
      }

      // Check if user already joined
      const existingResult = await client.query(
        "SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $2",
        [competitionId, userId],
      );

      if (existingResult.rows.length > 0) {
        await client.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Already joined this competition" });
      }

      // Insert participant
      const insertResult = await client.query<CompetitionParticipant>(
        `INSERT INTO competition_participants (competition_id, user_id, entry_fee_paid)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [competitionId, userId, competition.entry_fee],
      );

      await client.query("COMMIT");

      res.status(201).json({
        message: "Successfully joined competition",
        participant: insertResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error joining competition:", error);
      res.status(500).json({ error: "Failed to join competition" });
    } finally {
      client.release();
    }
  },
);

// DELETE /competitions/:id/leave - Leave a competition
router.delete(
  "/:id/leave",
  authenticate,
  param("id").isInt().toInt(),
  async (req: AuthRequest, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const competitionId = parseInt(req.params.id);
      const userId = req.userId!;

      // Check if competition exists
      const compResult = await client.query<Competition>(
        "SELECT * FROM competitions WHERE id = $1",
        [competitionId],
      );

      if (compResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Competition not found" });
      }

      const competition = compResult.rows[0];

      // Only allow leaving before competition starts
      if (new Date() >= new Date(competition.start_date)) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Cannot leave competition after it has started",
        });
      }

      // Check if user is a participant
      const participantResult = await client.query<CompetitionParticipant>(
        "SELECT * FROM competition_participants WHERE competition_id = $1 AND user_id = $2",
        [competitionId, userId],
      );

      if (participantResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return res
          .status(404)
          .json({ error: "Not a participant in this competition" });
      }

      const participant = participantResult.rows[0];

      // Delete participant
      await client.query(
        "DELETE FROM competition_participants WHERE competition_id = $1 AND user_id = $2",
        [competitionId, userId],
      );

      await client.query("COMMIT");

      res.json({
        message: "Successfully left competition",
        refund: participant.entry_fee_paid.toString(),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("Error leaving competition:", error);
      res.status(500).json({ error: "Failed to leave competition" });
    } finally {
      client.release();
    }
  },
);

export default router;
