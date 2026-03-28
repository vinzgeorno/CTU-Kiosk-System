import Database from "better-sqlite3";
import { db } from "./sqlite";

export type CreatePaymentEventInput = {
	sessionId: string;
	source: string;
	amount: number;
	pulseCount: number;
	recordedAt: string;
};

type PaymentEventRow = {
	id: number;
	session_id: string;
	source: string;
	amount: number;
	pulse_count: number;
	recorded_at: string;
};

export class PaymentEventsRepository {
	constructor(private readonly database: Database.Database = db) {}

	createPaymentEvent(input: CreatePaymentEventInput): number {
		const statement = this.database.prepare(
			`
				INSERT INTO payment_events (
					session_id,
					source,
					amount,
					pulse_count,
					recorded_at
				)
				VALUES (?, ?, ?, ?, ?)
			`
		);

		const result = statement.run(
			input.sessionId,
			input.source,
			input.amount,
			input.pulseCount,
			input.recordedAt
		);

		return Number(result.lastInsertRowid);
	}

	getPaymentEventsBySessionId(sessionId: string): PaymentEventRow[] {
		const statement = this.database.prepare(
			`
				SELECT *
				FROM payment_events
				WHERE session_id = ?
				ORDER BY id ASC
			`
		);

		return statement.all(sessionId) as PaymentEventRow[];
	}
}
