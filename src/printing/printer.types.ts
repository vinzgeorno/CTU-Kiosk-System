import { FacilityCode } from "../config/facilities";
import { TransactionBreakdownItem } from "../types/transaction.types";

export type PrintableTicketData = {
	facilityCode: FacilityCode;
	facilityName: string;
	ticketLabel: string;
	totalUnits: number;
	amountDue: number;
	amountPaid: number;
	breakdown: TransactionBreakdownItem[];
	createdAt: string;
};
