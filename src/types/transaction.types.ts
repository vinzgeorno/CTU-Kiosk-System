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
  breakdown: TransactionBreakdownItem[];
  createdAt: string;
};
