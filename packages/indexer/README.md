# @nebgov/indexer

Off-chain governance event indexer for NebGov.

## Quick start

```bash
cp .env.example .env
# Edit .env with your governor contract address
docker-compose up -d
```

## API endpoints

- `GET /health` — health check with indexing lag metrics
- `GET /proposals?offset=0&limit=20` — paginated proposal list
- `GET /proposals/:id/votes` — votes for a specific proposal
- `GET /delegates?top=20` — top delegates by delegator count
- `GET /profile/:address` — governance activity for an address

## Health Check Endpoint

The `/health` endpoint provides comprehensive indexer health information:

```json
{
  "status": "ok",
  "last_indexed_ledger": 54321,
  "current_ledger": 54325,
  "lag_ledgers": 4,
  "lag_seconds": 20,
  "total_proposals_indexed": 12,
  "total_votes_indexed": 87,
  "total_delegates_indexed": 34,
  "uptime_seconds": 3600,
  "timestamp": "2026-04-23T12:00:00Z"
}
```

### Status Codes

- `200 OK` — Indexer is healthy and lag is within threshold
- `503 Service Unavailable` — Indexer is degraded (lag exceeds threshold or error occurred)

### Configuration

Set `HEALTH_LAG_THRESHOLD` environment variable to configure when the indexer is considered degraded (default: 100 ledgers).

```bash
HEALTH_LAG_THRESHOLD=100
```
