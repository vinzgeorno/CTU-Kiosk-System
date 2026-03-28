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
