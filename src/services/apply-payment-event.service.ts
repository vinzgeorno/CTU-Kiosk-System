import { HardwarePaymentEvent } from "../hardware/hardware.types";
import { PaymentSessionStore } from "../hardware/payment-session.store";

export type ApplyPaymentEventResult = {
	applied: boolean;
	message: string;
	session: any | null;
};

export class ApplyPaymentEventService {
	constructor(private readonly paymentSessionStore: PaymentSessionStore) {}

	apply(event: HardwarePaymentEvent): ApplyPaymentEventResult {
		const currentSession = this.paymentSessionStore.getCurrent();

		if (!currentSession) {
			return {
				applied: false,
				message: "No active payment session",
				session: null,
			};
		}

		if (currentSession.status !== "awaiting_payment") {
			return {
				applied: false,
				message: "Payment session is not accepting payments",
				session: currentSession,
			};
		}

		if (typeof event.amount !== "number" || Number.isNaN(event.amount)) {
			return {
				applied: false,
				message: "Invalid payment amount",
				session: currentSession,
			};
		}

		if (event.amount <= 0) {
			return {
				applied: false,
				message: "Invalid payment amount",
				session: currentSession,
			};
		}

		const newAmountInserted = currentSession.amountInserted + event.amount;
		const updatedSession = this.paymentSessionStore.update({
			amountInserted: newAmountInserted,
			status: newAmountInserted >= currentSession.amountDue ? "paid" : "awaiting_payment",
		});

		return {
			applied: true,
			message: "Payment event applied",
			session: updatedSession,
		};
	}
}
