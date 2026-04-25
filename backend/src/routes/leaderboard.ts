import { Request, Response, Router } from "express";
import { z } from "zod";
import pool from "../db/pool";
import { validate } from "../middleware/validate";
import { LeaderboardHistoryWithUser } from "../entities/LeaderboardHistory";

const router = Router();

const leaderboardHistorySchema = z.object({
  date: z.coerce.date().optional(),
  user_id: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// GET /leaderboard/history - Get historical leaderboard rankings
router.get(
  "/history",
  validate({ query: leaderboardHistorySchema }),
  async (req: Request, res: Response) => {
    try {
      const { date, user_id: userId, limit, offset } = req.query as any;

      let queryText = `
        SELECT 
          lh.id,
          lh.user_id,
          lh.score,
          lh.rank,
          lh.snapshot_date,
          lh.created_at,
          u.wallet_address
        FROM leaderboard_history lh
        JOIN users u ON lh.user_id = u.id
        WHERE 1=1
      `;
      const queryParams: any[] = [];
      let paramIndex = 1;

      if (date) {
        queryText += ` AND lh.snapshot_date = $${paramIndex}`;
        queryParams.push(date);
        paramIndex++;
      }

      if (userId) {
        queryText += ` AND lh.user_id = $${paramIndex}`;
        queryParams.push(userId);
        paramIndex++;
      }

      queryText += ` ORDER BY lh.snapshot_date DESC, lh.rank ASC`;
      queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      queryParams.push(limit, offset);

      const result = await pool.query<LeaderboardHistoryWithUser>(
        queryText,
        queryParams,
      );

      // Get total count
      let countQuery = "SELECT COUNT(*) FROM leaderboard_history WHERE 1=1";
      const countParams: any[] = [];
      let countParamIndex = 1;

      if (date) {
        countQuery += ` AND snapshot_date = $${countParamIndex}`;
        countParams.push(date);
        countParamIndex++;
      }

      if (userId) {
        countQuery += ` AND user_id = $${countParamIndex}`;
        countParams.push(userId);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].count);

      res.json({
        data: result.rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total,
        },
      });
    } catch (error) {
      console.error("Error fetching leaderboard history:", error);
      res.status(500).json({ error: "Failed to fetch leaderboard history" });
    }
  },
);

export default router;
