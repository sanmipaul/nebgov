import pool from "../db/pool";

/**
 * Daily leaderboard snapshot job
 * Should be run via cron at midnight UTC
 */
export async function takeLeaderboardSnapshot() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get current leaderboard state
    const leaderboardResult = await client.query(`
      SELECT user_id, score, rank
      FROM leaderboard
      ORDER BY rank ASC
    `);

    // Insert snapshots for all users
    for (const row of leaderboardResult.rows) {
      await client.query(
        `INSERT INTO leaderboard_history (user_id, score, rank, snapshot_date)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, snapshot_date) DO UPDATE
         SET score = EXCLUDED.score, rank = EXCLUDED.rank`,
        [row.user_id, row.score, row.rank, today],
      );
    }

    await client.query("COMMIT");
    console.log(`✅ Leaderboard snapshot taken for ${today.toISOString()}`);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Failed to take leaderboard snapshot:", error);
    throw error;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  takeLeaderboardSnapshot()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
