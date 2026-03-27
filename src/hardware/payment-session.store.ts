import { FacilityCode } from "../config/facilities";
import { TransactionBreakdownItem } from "../types/transaction.types";

export type PaymentSessionStatus =
	| "idle"
	| "awaiting_payment"
	| "paid"
	| "printing"
	| "completed"
	| "cancelled";

export type PaymentSession = {
	id: string;
	facilityCode: FacilityCode;
	facilityName: string;
	breakdown: TransactionBreakdownItem[];
	totalUnits: number;
	amountDue: number;
	amountInserted: number;
	status: PaymentSessionStatus;
	createdAt: string;
	updatedAt: string;
};

export class PaymentSessionStore {
	private currentSession: PaymentSession | null = null;

	getCurrent(): PaymentSession | null {
		return this.currentSession;
	}

	create(session: PaymentSession): PaymentSession {
		this.currentSession = session;
		return this.currentSession;
	}

	update(patch: Partial<PaymentSession>): PaymentSession {
		if (!this.currentSession) {
			throw new Error("No active payment session.");
		}

		this.currentSession = {
			...this.currentSession,
			...patch,
			updatedAt: new Date().toISOString(),
		};

		return this.currentSession;
	}

	clear(): void {
		this.currentSession = null;
	}
}
