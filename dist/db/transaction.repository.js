"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionRepository = void 0;
const sqlite_1 = require("./sqlite");
class TransactionRepository {
    constructor(database = sqlite_1.db) {
        this.database = database;
    }
    createTransaction(record) {
        const insertTransactionStatement = this.database.prepare(`
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
					sync_status,
					synced_at,
					sync_error,
					error_message,
					created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
        const insertBreakdownStatement = this.database.prepare(`
				INSERT INTO transaction_breakdown (
					transaction_id,
					category_code,
					category_label,
					quantity,
					unit_price,
					subtotal
				)
				VALUES (?, ?, ?, ?, ?, ?)
			`);
        const execute = this.database.transaction((input) => {
            const transactionResult = insertTransactionStatement.run(input.facilityCode, input.facilityName, input.ticketStartNo, input.ticketEndNo, input.ticketLabel, input.isBulk ? 1 : 0, input.totalUnits, input.amountDue, input.amountPaid, input.sessionId ?? null, input.startedAt ?? null, input.completedAt ?? null, input.durationMs ?? null, input.paymentStatus ?? "completed", input.printStatus ?? "printed", input.printAttempts ?? 1, input.sourceMode ?? "hardware_live", input.syncStatus ?? "pending", input.syncedAt ?? null, input.syncError ?? null, input.errorMessage ?? null, input.createdAt);
            const transactionId = Number(transactionResult.lastInsertRowid);
            for (const item of input.breakdown) {
                insertBreakdownStatement.run(transactionId, item.categoryCode, item.categoryLabel, item.quantity, item.unitPrice, item.subtotal);
            }
            return transactionId;
        });
        return execute(record);
    }
    markTransactionSynced(localTransactionId) {
        const statement = this.database.prepare(`
				UPDATE transactions
				SET
					sync_status = 'synced',
					synced_at = ?,
					sync_error = NULL
				WHERE id = ?
			`);
        return statement.run(new Date().toISOString(), localTransactionId);
    }
    markTransactionSyncFailed(localTransactionId, errorMessage) {
        const statement = this.database.prepare(`
				UPDATE transactions
				SET
					sync_status = 'failed',
					sync_error = ?
				WHERE id = ?
			`);
        return statement.run(errorMessage, localTransactionId);
    }
    getTransactionsBySyncStatus(syncStatus, limit = 50) {
        const statement = this.database.prepare(`
				SELECT *
				FROM transactions
				WHERE sync_status = ?
				ORDER BY id DESC
				LIMIT ?
			`);
        return statement.all(syncStatus, limit);
    }
    getRecentTransactions(limit = 20) {
        const statement = this.database.prepare(`
				SELECT *
				FROM transactions
				ORDER BY id DESC
				LIMIT ?
			`);
        return statement.all(limit);
    }
    getTransactionById(id) {
        const transactionStatement = this.database.prepare(`
				SELECT *
				FROM transactions
				WHERE id = ?
				LIMIT 1
			`);
        const transactionRow = transactionStatement.get(id);
        if (!transactionRow) {
            return null;
        }
        const breakdownStatement = this.database.prepare(`
				SELECT *
				FROM transaction_breakdown
				WHERE transaction_id = ?
			`);
        const breakdown = breakdownStatement.all(id);
        return {
            ...transactionRow,
            breakdown,
        };
    }
    getTransactionByTicketLabel(ticketLabel) {
        const transactionStatement = this.database.prepare(`
				SELECT *
				FROM transactions
				WHERE ticket_label = ?
				LIMIT 1
			`);
        const transactionRow = transactionStatement.get(ticketLabel);
        if (!transactionRow) {
            return null;
        }
        const transactionId = Number(transactionRow.id);
        const breakdownStatement = this.database.prepare(`
				SELECT *
				FROM transaction_breakdown
				WHERE transaction_id = ?
			`);
        const breakdown = breakdownStatement.all(transactionId);
        return {
            ...transactionRow,
            breakdown,
        };
    }
    getTransactionStats() {
        const statement = this.database.prepare(`
				SELECT
					COUNT(*) AS totalTransactions,
					COALESCE(SUM(amount_paid), 0) AS totalAmount,
					COALESCE(SUM(total_units), 0) AS totalUnits,
					COALESCE(AVG(duration_ms), 0) AS averageDurationMs,
					COALESCE(MIN(duration_ms), 0) AS fastestDurationMs,
					COALESCE(MAX(duration_ms), 0) AS slowestDurationMs
				FROM transactions
				WHERE duration_ms IS NOT NULL
			`);
        const stats = statement.get();
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
    getFacilitySummaryReport(startAt, endAt) {
        const statement = this.database.prepare(`
				SELECT
					t.facility_code,
					t.facility_name,
					(
						SELECT inner_t.ticket_label
						FROM transactions inner_t
						WHERE inner_t.facility_code = t.facility_code
						  AND inner_t.created_at >= ?
						  AND inner_t.created_at < ?
						ORDER BY inner_t.created_at ASC, inner_t.id ASC
						LIMIT 1
					) AS first_ticket_label,
					(
						SELECT inner_t.ticket_label
						FROM transactions inner_t
						WHERE inner_t.facility_code = t.facility_code
						  AND inner_t.created_at >= ?
						  AND inner_t.created_at < ?
						ORDER BY inner_t.created_at DESC, inner_t.id DESC
						LIMIT 1
					) AS last_ticket_label,
					COUNT(*) AS transaction_count,
					COALESCE(SUM(t.total_units), 0) AS total_units,
					COALESCE(SUM(t.amount_paid), 0) AS total_amount
				FROM transactions t
				WHERE t.created_at >= ?
				  AND t.created_at < ?
				GROUP BY t.facility_code, t.facility_name
				ORDER BY t.facility_code ASC
			`);
        const rows = statement.all(startAt, endAt, startAt, endAt, startAt, endAt);
        return rows.map((row) => ({
            facility_code: row.facility_code,
            facility_name: row.facility_name,
            first_ticket_label: row.first_ticket_label,
            last_ticket_label: row.last_ticket_label,
            transaction_count: Number(row.transaction_count ?? 0),
            total_units: Number(row.total_units ?? 0),
            total_amount: Number(row.total_amount ?? 0),
        }));
    }
}
exports.TransactionRepository = TransactionRepository;
