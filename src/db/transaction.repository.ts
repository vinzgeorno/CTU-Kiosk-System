import Database from "better-sqlite3";
import { db } from "./sqlite";
import { TransactionRecord } from "../types/transaction.types";

type TransactionStatsRow = {
	totalTransactions: number | null;
	totalAmount: number | null;
	totalUnits: number | null;
	averageDurationMs: number | null;
	fastestDurationMs: number | null;
	slowestDurationMs: number | null;
};

export class TransactionRepository {
	constructor(private readonly database: Database.Database = db) {}

	createTransaction(record: TransactionRecord): number {
		const insertTransactionStatement = this.database.prepare(
			`
				INSERT INTO transactions (
					facility_code,
					facility_name,
					ticket_start_no,
					ticket_end_no,
					ticket_label,
					is_bulk,
					total_units,
					amount_due,
					amount_paid,
					session_id,
					started_at,
					completed_at,
					duration_ms,
					payment_status,
					print_status,
					print_attempts,
					source_mode,
					error_message,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`
		);

		const insertBreakdownStatement = this.database.prepare(
			`
				INSERT INTO transaction_breakdown (
					transaction_id,
					category_code,
					category_label,
					quantity,
					unit_price,
					subtotal
				)
				VALUES (?, ?, ?, ?, ?, ?)
			`
		);

		const execute = this.database.transaction((input: TransactionRecord): number => {
			const transactionResult = insertTransactionStatement.run(
				input.facilityCode,
				input.facilityName,
				input.ticketStartNo,
				input.ticketEndNo,
				input.ticketLabel,
				input.isBulk ? 1 : 0,
				input.totalUnits,
				input.amountDue,
				input.amountPaid,
				input.sessionId ?? null,
				input.startedAt ?? null,
				input.completedAt ?? null,
				input.durationMs ?? null,
				input.paymentStatus ?? "completed",
				input.printStatus ?? "printed",
				input.printAttempts ?? 1,
				input.sourceMode ?? "hardware_live",
				input.errorMessage ?? null,
				input.createdAt
			);

			const transactionId = Number(transactionResult.lastInsertRowid);

			for (const item of input.breakdown) {
				insertBreakdownStatement.run(
					transactionId,
					item.categoryCode,
					item.categoryLabel,
					item.quantity,
					item.unitPrice,
					item.subtotal
				);
			}

			return transactionId;
		});

		return execute(record);
	}

	getRecentTransactions(limit: number = 20) {
		const statement = this.database.prepare(
			`
				SELECT *
				FROM transactions
				ORDER BY id DESC
				LIMIT ?
			`
		);

		return statement.all(limit);
	}

	getTransactionById(id: number) {
		const transactionStatement = this.database.prepare(
			`
				SELECT *
				FROM transactions
				WHERE id = ?
				LIMIT 1
			`
		);

		const transactionRow = transactionStatement.get(id) as Record<string, unknown> | undefined;
		if (!transactionRow) {
			return null;
		}

		const breakdownStatement = this.database.prepare(
			`
				SELECT *
				FROM transaction_breakdown
				WHERE transaction_id = ?
			`
		);

		const breakdown = breakdownStatement.all(id) as Record<string, unknown>[];

		return {
			...transactionRow,
			breakdown,
		};
	}

	getTransactionByTicketLabel(ticketLabel: string) {
		const transactionStatement = this.database.prepare(
			`
				SELECT *
				FROM transactions
				WHERE ticket_label = ?
				LIMIT 1
			`
		);

		const transactionRow = transactionStatement.get(ticketLabel) as
			| Record<string, unknown>
			| undefined;
		if (!transactionRow) {
			return null;
		}

		const transactionId = Number((transactionRow as { id?: number }).id);
		const breakdownStatement = this.database.prepare(
			`
				SELECT *
				FROM transaction_breakdown
				WHERE transaction_id = ?
			`
		);

		const breakdown = breakdownStatement.all(transactionId) as Record<string, unknown>[];

		return {
			...transactionRow,
			breakdown,
		};
	}

	getTransactionStats() {
		const statement = this.database.prepare(
			`
				SELECT
					COUNT(*) AS totalTransactions,
					COALESCE(SUM(amount_paid), 0) AS totalAmount,
					COALESCE(SUM(total_units), 0) AS totalUnits,
					COALESCE(AVG(duration_ms), 0) AS averageDurationMs,
					COALESCE(MIN(duration_ms), 0) AS fastestDurationMs,
					COALESCE(MAX(duration_ms), 0) AS slowestDurationMs
				FROM transactions
				WHERE duration_ms IS NOT NULL
			`
		);

		const stats = statement.get() as TransactionStatsRow | undefined;

		if (!stats) {
			return {
				totalTransactions: 0,
				totalAmount: 0,
				totalUnits: 0,
				averageDurationMs: 0,
				fastestDurationMs: 0,
				slowestDurationMs: 0,
			};
		}

		return {
			totalTransactions: Number(stats.totalTransactions ?? 0),
			totalAmount: Number(stats.totalAmount ?? 0),
			totalUnits: Number(stats.totalUnits ?? 0),
			averageDurationMs: Number(stats.averageDurationMs ?? 0),
			fastestDurationMs: Number(stats.fastestDurationMs ?? 0),
			slowestDurationMs: Number(stats.slowestDurationMs ?? 0),
		};
	}
}
