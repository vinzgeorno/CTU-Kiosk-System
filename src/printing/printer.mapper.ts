import { TransactionRecord } from "../types/transaction.types";
import { PrintableTicketData } from "./printer.types";

export function mapTransactionToPrintableTicketData(
  record: TransactionRecord
): PrintableTicketData {
  return {
    facilityCode: record.facilityCode,
    facilityName: record.facilityName,
    ticketLabel: record.ticketLabel,
    totalUnits: record.totalUnits,
    amountDue: record.amountDue,
    amountPaid: record.amountPaid,
    breakdown: record.breakdown,
    createdAt: record.createdAt,
  };
}
