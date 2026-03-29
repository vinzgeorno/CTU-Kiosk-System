"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentSessionStore = void 0;
class PaymentSessionStore {
    constructor() {
        this.currentSession = null;
    }
    getCurrent() {
        return this.currentSession;
    }
    create(session) {
        this.currentSession = session;
        return this.currentSession;
    }
    update(patch) {
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
    clear() {
        this.currentSession = null;
    }
}
exports.PaymentSessionStore = PaymentSessionStore;
