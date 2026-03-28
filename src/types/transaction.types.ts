import { CategoryCode, FacilityCode } from "../config/facilities";

export type TransactionBreakdownItem = {
  categoryCode: CategoryCode;
  categoryLabel: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type TransactionRecord = {
  facilityCode: FacilityCode;
  facilityName: string;
  ticketStartNo: number;
  ticketEndNo: number;
  ticketLabel: string;
  isBulk: boolean;
  totalUnits: number;
  amountDue: number;
  amountPaid: number;
  sessionId?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  paymentStatus?: string;
  printStatus?: string;
  printAttempts?: number;
  sourceMode?: string;
  errorMessage?: string | null;
  breakdown: TransactionBreakdownItem[];
  createdAt: string;
};

// Optional helper types for mapping to database / remote rows.
// These extend the existing shapes but are not used to remove or change
// any fields on the core types above.
export type TransactionBreakdownRow = TransactionBreakdownItem & {
  id?: number;
  transaction_id?: string | null;
  local_transaction_id?: string | null;
};

export type TransactionRecordRow = Omit<TransactionRecord, "breakdown"> & {
  id?: number;
  transaction_id?: string | null;
  local_transaction_id?: string | null;
  // keep breakdown present here as well when mapping joined rows
  breakdown?: TransactionBreakdownRow[];
};
