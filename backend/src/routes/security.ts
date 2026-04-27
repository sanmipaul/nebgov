import { Router } from "express";
import pool from "../db/pool";
import { AlertSeverity } from "../services/security-monitor";

const router = Router();

// Get all security alerts
router.get("/alerts", async (req, res) => {
  try {
    const { severity, resolved, limit = 50 } = req.query;
    
    let query = "SELECT * FROM security_alerts WHERE 1=1";
    const params: any[] = [];
    
    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }
    
    if (resolved !== undefined) {
      params.push(resolved === "true");
      query += ` AND resolved = $${params.length}`;
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch security alerts" });
  }
});

// Get security stats
router.get("/stats", async (req, res) => {
  try {
    const totalAlerts = await pool.query("SELECT COUNT(*) FROM security_alerts");
    const unresolvedAlerts = await pool.query("SELECT COUNT(*) FROM security_alerts WHERE resolved = false");
    const alertsBySeverity = await pool.query(
      "SELECT severity, COUNT(*) FROM security_alerts GROUP BY severity"
    );
    
    res.json({
      total: parseInt(totalAlerts.rows[0].count),
      unresolved: parseInt(unresolvedAlerts.rows[0].count),
      bySeverity: alertsBySeverity.rows.reduce((acc: any, row) => {
        acc[row.severity] = parseInt(row.count);
        return acc;
      }, {}),
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch security stats" });
  }
});

// Resolve an alert
router.post("/alerts/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body; // In real app, get from auth middleware
    
    const result = await pool.query(
      "UPDATE security_alerts SET resolved = true, resolved_at = NOW(), resolved_by = $1 WHERE id = $2 RETURNING *",
      [userId, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Alert not found" });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to resolve alert" });
  }
});

export default router;
