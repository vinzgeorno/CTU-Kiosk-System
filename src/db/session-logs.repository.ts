import Database from "better-sqlite3";
import { db } from "./sqlite";

export type CreateSessionLogInput = {
	sessionId: string;
	facilityCode: string;
	facilityName: string;
	amountDue: number;
	amountInserted: number;
	totalUnits: number;
	status: string;
	startedAt: string;
	lastUpdatedAt?: string;
};

export type SessionLogPatch = {
	facilityCode?: string;
	facilityName?: string;
	amountDue?: number;
	amountInserted?: number;
	totalUnits?: number;
	status?: string;
	startedAt?: string;
	cancelledAt?: string | null;
	completedTransactionId?: number | null;
};

type SessionLogRow = {
	id: number;
	session_id: string;
	facility_code: string;
	facility_name: string;
	amount_due: number;
	amount_inserted: number;
	total_units: number;
	status: string;
	started_at: string;
	last_updated_at: string;
	cancelled_at: string | null;
	completed_transaction_id: number | null;
};

export class SessionLogsRepository {
	constructor(private readonly database: Database.Database = db) {}

	createSessionLog(input: CreateSessionLogInput): number {
		const lastUpdatedAt = input.lastUpdatedAt ?? new Date().toISOString();

		const statement = this.database.prepare(
			`
				INSERT INTO session_logs (
					session_id,
					facility_code,
					facility_name,
					amount_due,
					amount_inserted,
					total_units,
					status,
					started_at,
					last_updated_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
		);

		const result = statement.run(
			input.sessionId,
			input.facilityCode,
			input.facilityName,
			input.amountDue,
			input.amountInserted,
			input.totalUnits,
			input.status,
			input.startedAt,
			lastUpdatedAt
		);

		return Number(result.lastInsertRowid);
	}

	updateSessionLog(sessionId: string, patch: SessionLogPatch): void {
		const lastUpdatedAt = new Date().toISOString();
		const assignments: string[] = ["last_updated_at = ?"];
		const values: unknown[] = [lastUpdatedAt];

		if (patch.facilityCode !== undefined) {
			assignments.push("facility_code = ?");
			values.push(patch.facilityCode);
		}

		if (patch.facilityName !== undefined) {
			assignments.push("facility_name = ?");
			values.push(patch.facilityName);
		}

		if (patch.amountDue !== undefined) {
			assignments.push("amount_due = ?");
			values.push(patch.amountDue);
		}

		if (patch.amountInserted !== undefined) {
			assignments.push("amount_inserted = ?");
			values.push(patch.amountInserted);
		}

		if (patch.totalUnits !== undefined) {
			assignments.push("total_units = ?");
			values.push(patch.totalUnits);
		}

		if (patch.status !== undefined) {
			assignments.push("status = ?");
			values.push(patch.status);
		}

		if (patch.startedAt !== undefined) {
			assignments.push("started_at = ?");
			values.push(patch.startedAt);
		}

		if (patch.cancelledAt !== undefined) {
			assignments.push("cancelled_at = ?");
			values.push(patch.cancelledAt);
		}

		if (patch.completedTransactionId !== undefined) {
			assignments.push("completed_transaction_id = ?");
			values.push(patch.completedTransactionId);
		}

		const statement = this.database.prepare(
			`
				UPDATE session_logs
				SET ${assignments.join(", ")}
				WHERE session_id = ?
			`
		);

		statement.run(...values, sessionId);
	}

	markCompleted(sessionId: string, transactionId: number, amountInserted: number): void {
		const lastUpdatedAt = new Date().toISOString();

		const statement = this.database.prepare(
			`
				UPDATE session_logs
				SET
					status = ?,
					amount_inserted = ?,
					completed_transaction_id = ?,
					last_updated_at = ?
				WHERE session_id = ?
			`
		);

		statement.run("completed", amountInserted, transactionId, lastUpdatedAt, sessionId);
	}

	markCancelled(sessionId: string, amountInserted: number): void {
		const cancelledAt = new Date().toISOString();

		const statement = this.database.prepare(
			`
				UPDATE session_logs
				SET
					status = ?,
					amount_inserted = ?,
					cancelled_at = ?,
					last_updated_at = ?
				WHERE session_id = ?
			`
		);

		statement.run("cancelled", amountInserted, cancelledAt, cancelledAt, sessionId);
	}

	getSessionLog(sessionId: string): SessionLogRow | null {
		const statement = this.database.prepare(
			`
				SELECT *
				FROM session_logs
				WHERE session_id = ?
				LIMIT 1
			`
		);

		return (statement.get(sessionId) as SessionLogRow | undefined) ?? null;
	}
}
