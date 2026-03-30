export interface LeaderboardHistory {
  id: number;
  user_id: number;
  score: bigint;
  rank: number;
  snapshot_date: Date;
  created_at: Date;
}

export interface LeaderboardHistoryWithUser extends LeaderboardHistory {
  wallet_address: string;
}
