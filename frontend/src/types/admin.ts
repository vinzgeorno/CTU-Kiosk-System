export type RecentTransaction = {
  id: number;
  facility_code: string;
  facility_name: string;
  ticket_label: string;
  total_units: number;
  amount_due: number;
  amount_paid: number;
  created_at: string;
};

export type TicketCounterRow = {
  facility_code: string;
  last_sequence: number;
  updated_at: string;
};

export type TransactionStats = {
  totalTransactions: number;
  totalAmount: number;
  totalUnits: number;
  averageDurationMs: number;
  fastestDurationMs: number;
  slowestDurationMs: number;
};
