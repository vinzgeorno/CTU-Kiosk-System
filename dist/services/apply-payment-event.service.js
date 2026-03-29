"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApplyPaymentEventService = void 0;
class ApplyPaymentEventService {
    constructor(paymentSessionStore, paymentEventsRepository) {
        this.paymentSessionStore = paymentSessionStore;
        this.paymentEventsRepository = paymentEventsRepository;
    }
    apply(event) {
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
        this.paymentEventsRepository.createPaymentEvent({
            sessionId: currentSession.id,
            source: event.source,
            amount: event.amount,
            pulseCount: event.pulseCount,
            recordedAt: event.timestamp ?? new Date().toISOString(),
        });
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
exports.ApplyPaymentEventService = ApplyPaymentEventService;
