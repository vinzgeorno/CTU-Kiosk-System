"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentEventsRepository = void 0;
const sqlite_1 = require("./sqlite");
class PaymentEventsRepository {
    constructor(database = sqlite_1.db) {
        this.database = database;
    }
    createPaymentEvent(input) {
        const statement = this.database.prepare(`
				INSERT INTO payment_events (
					session_id,
					source,
					amount,
					pulse_count,
					recorded_at
				)
				VALUES (?, ?, ?, ?, ?)
			`);
        const result = statement.run(input.sessionId, input.source, input.amount, input.pulseCount, input.recordedAt);
        return Number(result.lastInsertRowid);
    }
    getPaymentEventsBySessionId(sessionId) {
        const statement = this.database.prepare(`
				SELECT *
				FROM payment_events
				WHERE session_id = ?
				ORDER BY id ASC
			`);
        return statement.all(sessionId);
    }
}
exports.PaymentEventsRepository = PaymentEventsRepository;
