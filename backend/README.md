# NebGov Backend API

Backend API for competition management and leaderboard tracking.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your database credentials
```

3. Run migrations:

```bash
pnpm migrate
```

4. Start development server:

```bash
pnpm dev
```

## API Endpoints

### Competitions

#### POST /competitions/:id/join

Join a competition (requires authentication).

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Successfully joined competition",
  "participant": {
    "id": 1,
    "competition_id": 1,
    "user_id": 1,
    "joined_at": "2024-01-01T00:00:00Z",
    "entry_fee_paid": "1000"
  }
}
```

#### DELETE /competitions/:id/leave

Leave a competition before it starts (requires authentication).

**Headers:**

- `Authorization: Bearer <token>`

**Response:**

```json
{
  "message": "Successfully left competition",
  "refund": "1000"
}
```

### Leaderboard

#### GET /leaderboard/history

Get historical leaderboard rankings.

**Query Parameters:**

- `date` (optional): ISO date string (e.g., "2024-01-01")
- `user_id` (optional): Filter by user ID
- `limit` (optional): Results per page (default: 50, max: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "score": "1500",
      "rank": 1,
      "snapshot_date": "2024-01-01",
      "created_at": "2024-01-01T00:00:00Z",
      "wallet_address": "GABC..."
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

## Testing

Run tests:

```bash
pnpm test
```

## Cron Jobs

### Leaderboard Snapshot

Takes a daily snapshot of the leaderboard at midnight UTC.

Run manually:

```bash
tsx src/jobs/leaderboard-snapshot.ts
```

Set up cron (add to crontab):

```
0 0 * * * cd /path/to/project && tsx backend/src/jobs/leaderboard-snapshot.ts
```

## Database Schema

See `src/db/schema.sql` for the complete database schema.

Key tables:

- `users` - User accounts
- `competitions` - Competition definitions
- `competition_participants` - Competition membership
- `leaderboard` - Current leaderboard state
- `leaderboard_history` - Historical snapshots
