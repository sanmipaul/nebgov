export interface Competition {
  id: number;
  name: string;
  description: string | null;
  entry_fee: bigint;
  start_date: Date;
  end_date: Date;
  is_active: boolean;
  created_by: number;
  created_at: Date;
  updated_at: Date;
}
