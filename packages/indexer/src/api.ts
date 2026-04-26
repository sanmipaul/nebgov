import express, { Request, Response } from "express";
import { SorobanRpc } from "@stellar/stellar-sdk";
import { pool } from "./db";
import { cached, getMetrics } from "./cache";
import { getLastIndexedLedger } from "./events";
import { startTime } from "./index";
import swaggerUi from "swagger-ui-express";
import { generateOpenApiDocument } from "./openapi";

const TTL = {
  proposals: 30_000, // 30 seconds
  proposalVotes: 15_000, // 15 seconds
  delegates: 60_000, // 60 seconds
  profile: 30_000, // 30 seconds
};

const HEALTH_LAG_THRESHOLD = Number(process.env.HEALTH_LAG_THRESHOLD ?? 100);
const STELLAR_LEDGER_CLOSE_TIME_SECONDS = 5; // Stellar ledgers close approximately every 5 seconds

interface HealthResponse {
  status: "ok" | "degraded";
  last_indexed_ledger: number;
  current_ledger: number;
  lag_ledgers: number;
  lag_seconds: number;
  total_proposals_indexed: number;
  total_votes_indexed: number;
  total_delegates_indexed: number;
  uptime_seconds: number;
  timestamp: string;
}

async function getHealthStatus(server: SorobanRpc.Server): Promise<HealthResponse> {
  // Fetch current ledger from RPC
  const latestLedger = await server.getLatestLedger();
  const currentLedger = latestLedger.sequence;

  // Get last indexed ledger from database
  const lastIndexedLedger = await getLastIndexedLedger();

  // Calculate lag
  const lagLedgers = Math.max(0, currentLedger - lastIndexedLedger);
  const lagSeconds = lagLedgers * STELLAR_LEDGER_CLOSE_TIME_SECONDS;

  // Get counts from database
  const [proposalsResult, votesResult, delegatesResult] = await Promise.all([
    pool.query("SELECT COUNT(*) as count FROM proposals"),
    pool.query("SELECT COUNT(*) as count FROM votes"),
    pool.query("SELECT COUNT(DISTINCT delegator) as count FROM delegates"),
  ]);

  const totalProposals = Number(proposalsResult.rows[0]?.count ?? 0);
  const totalVotes = Number(votesResult.rows[0]?.count ?? 0);
  const totalDelegates = Number(delegatesResult.rows[0]?.count ?? 0);

  // Calculate uptime
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Determine status
  const status = lagLedgers > HEALTH_LAG_THRESHOLD ? "degraded" : "ok";

  return {
    status,
    last_indexed_ledger: lastIndexedLedger,
    current_ledger: currentLedger,
    lag_ledgers: lagLedgers,
    lag_seconds: lagSeconds,
    total_proposals_indexed: totalProposals,
    total_votes_indexed: totalVotes,
    total_delegates_indexed: totalDelegates,
    uptime_seconds: uptimeSeconds,
    timestamp: new Date().toISOString(),
  };
}

export function createApp(server: SorobanRpc.Server): express.Application {
  const app = express();
  app.use(express.json());

  // Swagger documentation
  app.get("/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(generateOpenApiDocument());
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(generateOpenApiDocument()));

  // GET /health
  app.get("/health", async (_req: Request, res: Response): Promise<void> => {
    try {
      const health = await getHealthStatus(server);
      const httpStatus = health.status === "ok" ? 200 : 503;
      res.status(httpStatus).json(health);
    } catch (error) {
      console.error("Health check error:", error);
      res.status(503).json({
        status: "degraded",
        error: "Failed to retrieve health status",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // GET /proposals?offset=0&limit=20 or ?before=47&limit=20 or ?after=10&limit=20
  app.get("/proposals", async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(Number(req.query.limit ?? 20), 100);
    const before = req.query.before ? Number(req.query.before) : undefined;
    const after = req.query.after ? Number(req.query.after) : undefined;
    const offset = Number(req.query.offset ?? 0);

    try {
      let query: string;
      let params: any[];
      let key: string;

      // Use cursor-based pagination if before/after is provided
      if (before !== undefined || after !== undefined) {
        if (before !== undefined) {
          // Fetch proposals with id < before
          query = "SELECT * FROM proposals WHERE id < $1 ORDER BY id DESC LIMIT $2";
          params = [before, limit];
          key = `proposals:before:${before}:${limit}`;
        } else {
          // Fetch proposals with id > after
          query = "SELECT * FROM proposals WHERE id > $1 ORDER BY id ASC LIMIT $2";
          params = [after, limit];
          key = `proposals:after:${after}:${limit}`;
        }
      } else {
        // Fall back to offset-based pagination for backwards compatibility
        query = "SELECT * FROM proposals ORDER BY id DESC LIMIT $1 OFFSET $2";
        params = [limit, offset];
        key = `proposals:${offset}:${limit}`;
      }

      const data = await cached(key, TTL.proposals, async () => {
        const result = await pool.query(query, params);
        const proposals = result.rows;

        // For cursor pagination, calculate next/prev cursors and hasMore
        if (before !== undefined || after !== undefined) {
          let nextCursor: number | undefined;
          let prevCursor: number | undefined;
          let hasMore = false;

          if (proposals.length > 0) {
            if (before !== undefined) {
              // For "before" queries, next cursor is the smallest ID in results
              nextCursor = Math.min(...proposals.map(p => p.id));
              prevCursor = Math.max(...proposals.map(p => p.id));
              
              // Check if there are more proposals with smaller IDs
              const hasMoreResult = await pool.query(
                "SELECT 1 FROM proposals WHERE id < $1 LIMIT 1",
                [nextCursor]
              );
              hasMore = hasMoreResult.rows.length > 0;
            } else {
              // For "after" queries, reverse the order to match DESC ordering
              proposals.reverse();
              nextCursor = Math.min(...proposals.map(p => p.id));
              prevCursor = Math.max(...proposals.map(p => p.id));
              
              // Check if there are more proposals with larger IDs
              const hasMoreResult = await pool.query(
                "SELECT 1 FROM proposals WHERE id > $1 LIMIT 1",
                [prevCursor]
              );
              hasMore = hasMoreResult.rows.length > 0;
            }
          }

          return { 
            proposals, 
            nextCursor, 
            prevCursor, 
            hasMore 
          };
        } else {
          // For offset pagination, return legacy format
          return { proposals, total: result.rowCount ?? 0 };
        }
      });

      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /proposals/:id
  app.get("/proposals/:id", async (req: Request, res: Response): Promise<void> => {
    const id = parseInt(req.params.id);
    
    // Validate ID is a valid integer
    if (isNaN(id) || id < 1) {
      res.status(400).json({ error: "Invalid proposal ID" });
      return;
    }

    try {
      const result = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
      if (!result.rows[0]) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /proposals/:id/votes
  app.get(
    "/proposals/:id/votes",
    async (req: Request, res: Response): Promise<void> => {
      const { id } = req.params;
      const key = `proposal_votes:${id}`;
      try {
        const data = await cached(key, TTL.proposalVotes, async () => {
          const result = await pool.query(
            "SELECT * FROM votes WHERE proposal_id = $1 ORDER BY created_at DESC",
            [id],
          );
          return { votes: result.rows };
        });
        res.json(data);
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /delegates?top=20
  app.get("/delegates", async (req: Request, res: Response): Promise<void> => {
    const top = Math.min(Number(req.query.top ?? 20), 100);
    const key = `delegates:${top}`;
    try {
      const data = await cached(key, TTL.delegates, async () => {
        const result = await pool.query(
          `SELECT new_delegatee as address, COUNT(*) as delegator_count
           FROM delegates d1
           WHERE ledger = (
             SELECT MAX(d2.ledger) FROM delegates d2 WHERE d2.delegator = d1.delegator
           )
           GROUP BY new_delegatee
           ORDER BY delegator_count DESC
           LIMIT $1`,
          [top],
        );
        return { delegates: result.rows };
      });
      res.json(data);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /profile/:address
  app.get(
    "/profile/:address",
    async (req: Request, res: Response): Promise<void> => {
      const { address } = req.params;
      const key = `profile:${address}`;
      try {
        const data = await cached(key, TTL.profile, async () => {
          const [
            proposalsRes,
            votesRes,
            delegationsRes,
            wrapperDepositsRes,
            wrapperWithdrawalsRes,
          ] = await Promise.all([
            pool.query("SELECT COUNT(*) FROM proposals WHERE proposer = $1", [
              address,
            ]),
            pool.query(
              "SELECT COUNT(*), SUM(weight) FROM votes WHERE voter = $1",
              [address],
            ),
            pool.query(
              "SELECT new_delegatee FROM delegates WHERE delegator = $1 ORDER BY ledger DESC LIMIT 1",
              [address],
            ),
            pool.query(
              "SELECT COALESCE(SUM(amount), 0) AS sum FROM wrapper_deposits WHERE account = $1",
              [address],
            ),
            pool.query(
              "SELECT COALESCE(SUM(amount), 0) AS sum FROM wrapper_withdrawals WHERE account = $1",
              [address],
            ),
          ]);

          const depositTotal = BigInt(wrapperDepositsRes.rows[0]?.sum ?? 0);
          const withdrawalTotal = BigInt(
            wrapperWithdrawalsRes.rows[0]?.sum ?? 0,
          );
          const wrappedBalance = depositTotal - withdrawalTotal;

          return {
            address,
            proposalsCreated: Number(proposalsRes.rows[0].count),
            votescast: Number(votesRes.rows[0].count),
            totalVotingPowerUsed: String(votesRes.rows[0].sum ?? 0),
            currentDelegatee: delegationsRes.rows[0]?.new_delegatee ?? address,
            wrapper: {
              depositTotal: depositTotal.toString(),
              withdrawalTotal: withdrawalTotal.toString(),
              wrappedBalance: wrappedBalance.toString(),
            },
          };
        });
        res.json(data);
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /wrapper/deposits?account=G...&limit&offset
  app.get(
    "/wrapper/deposits",
    async (req: Request, res: Response): Promise<void> => {
      const account =
        typeof req.query.account === "string" ? req.query.account : undefined;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      try {
        const params: any[] = [];
        let where = "";
        if (account) {
          where = "WHERE account = $1";
          params.push(account);
        }
        params.push(limit, offset);
        const limitIdx = params.length - 1;
        const offsetIdx = params.length;

        const result = await pool.query(
          `SELECT * FROM wrapper_deposits ${where} ORDER BY ledger DESC, id DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params,
        );
        res.json({
          data: result.rows,
          pagination: { limit, offset, hasMore: result.rows.length === limit },
        });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /wrapper/withdrawals?account=G...&limit&offset
  app.get(
    "/wrapper/withdrawals",
    async (req: Request, res: Response): Promise<void> => {
      const account =
        typeof req.query.account === "string" ? req.query.account : undefined;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      try {
        const params: any[] = [];
        let where = "";
        if (account) {
          where = "WHERE account = $1";
          params.push(account);
        }
        params.push(limit, offset);
        const limitIdx = params.length - 1;
        const offsetIdx = params.length;

        const result = await pool.query(
          `SELECT * FROM wrapper_withdrawals ${where} ORDER BY ledger DESC, id DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
          params,
        );
        res.json({
          data: result.rows,
          pagination: { limit, offset, hasMore: result.rows.length === limit },
        });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /treasury/transfers?limit&offset — paginated treasury batch transfer history
  app.get(
    "/treasury/transfers",
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const offset = Number(req.query.offset ?? 0);
      try {
        const result = await pool.query(
          `SELECT * FROM treasury_transfers ORDER BY ledger DESC, id DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
        res.json({
          data: result.rows,
          pagination: { limit, offset, hasMore: result.rows.length === limit },
        });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /config-history?limit&offset — paginated list of config updates
  app.get(
    "/config-history",
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const offset = Number(req.query.offset ?? 0);
      try {
        const result = await pool.query(
          `SELECT * FROM config_updates ORDER BY ledger DESC, id DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
        res.json({
          data: result.rows,
          pagination: { limit, offset, hasMore: result.rows.length === limit },
        });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // GET /upgrade-history?limit&offset — paginated list of governor upgrades
  app.get(
    "/upgrade-history",
    async (req: Request, res: Response): Promise<void> => {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const offset = Number(req.query.offset ?? 0);
      try {
        const result = await pool.query(
          `SELECT * FROM governor_upgrades ORDER BY ledger DESC, id DESC LIMIT $1 OFFSET $2`,
          [limit, offset],
        );
        res.json({
          data: result.rows,
          pagination: { limit, offset, hasMore: result.rows.length === limit },
        });
      } catch {
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  return app;
}
