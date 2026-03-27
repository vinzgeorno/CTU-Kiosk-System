import Database from "better-sqlite3";
import { db } from "./sqlite";
import { TransactionRecord } from "../types/transaction.types";

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
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
}
