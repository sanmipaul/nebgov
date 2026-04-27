-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  wallet_address VARCHAR(56) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Competitions table
CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  entry_fee BIGINT DEFAULT 0,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Competition participants table
CREATE TABLE IF NOT EXISTS competition_participants (
  id SERIAL PRIMARY KEY,
  competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  entry_fee_paid BIGINT DEFAULT 0,
  UNIQUE(competition_id, user_id)
);

-- Leaderboard table
CREATE TABLE IF NOT EXISTS leaderboard (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score BIGINT DEFAULT 0,
  rank INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- Leaderboard history table
CREATE TABLE IF NOT EXISTS leaderboard_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score BIGINT NOT NULL,
  rank INTEGER NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, snapshot_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competition_participants_competition ON competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_competition_participants_user ON competition_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_rank ON leaderboard(rank);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_date ON leaderboard_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_leaderboard_history_user_date ON leaderboard_history(user_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_competitions_active ON competitions(is_active);
CREATE INDEX IF NOT EXISTS idx_competitions_dates ON competitions(start_date, end_date);

-- Notification preferences (per user)
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  created_self BOOLEAN DEFAULT true,
  active BOOLEAN DEFAULT true,
  voting_ends_soon BOOLEAN DEFAULT true,
  outcome BOOLEAN DEFAULT true,
  queued BOOLEAN DEFAULT true,
  executed BOOLEAN DEFAULT true
);

-- Notification history (per user)
CREATE TABLE IF NOT EXISTS notification_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  proposal_id BIGINT,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_user_created_at
  ON notification_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_history_user_read
  ON notification_history(user_id, read);

-- Refresh tokens table
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Security alerts table
CREATE TABLE IF NOT EXISTS security_alerts (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL, -- e.g., 'LARGE_TRANSFER', 'PAUSE_DETECTED', 'SUSPICIOUS_PROPOSAL'
  severity TEXT NOT NULL, -- e.g., 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  message TEXT NOT NULL,
  metadata JSONB, -- Additional details like proposal_id, amount, addresses
  resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP,
  resolved_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_alerts_type ON security_alerts(type);
CREATE INDEX IF NOT EXISTS idx_security_alerts_severity ON security_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_security_alerts_created_at ON security_alerts(created_at DESC);

-- Monitoring state table
CREATE TABLE IF NOT EXISTS monitoring_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize last processed ledger for various contracts if needed
INSERT INTO monitoring_state (key, value) VALUES ('last_processed_ledger', '0')
ON CONFLICT (key) DO NOTHING;
