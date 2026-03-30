export interface CompetitionParticipant {
  id: number;
  competition_id: number;
  user_id: number;
  joined_at: Date;
  entry_fee_paid: bigint;
}

export interface CreateCompetitionParticipantInput {
  competition_id: number;
  user_id: number;
  entry_fee_paid: bigint;
}
