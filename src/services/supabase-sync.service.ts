import { supabase } from "../config/supabase";
import { TransactionRecord } from "../types/transaction.types";

export class SupabaseSyncService {
	async syncTransactionWithBreakdown(record: TransactionRecord, transactionId: number): Promise<void> {
		if (!supabase) {
			return;
		}

		const transactionRow = {
			local_transaction_id: transactionId,
			facility_code: record.facilityCode,
			facility_name: record.facilityName,
			ticket_start_no: record.ticketStartNo,
			ticket_end_no: record.ticketEndNo,
			ticket_label: record.ticketLabel,
			is_bulk: record.isBulk,
			total_units: record.totalUnits,
			amount_due: record.amountDue,
			amount_paid: record.amountPaid,
			session_id: record.sessionId ?? null,
			started_at: record.startedAt ?? null,
			completed_at: record.completedAt ?? null,
			duration_ms: record.durationMs ?? null,
			payment_status: record.paymentStatus ?? null,
			print_status: record.printStatus ?? null,
			print_attempts: record.printAttempts ?? null,
			source_mode: record.sourceMode ?? null,
			error_message: record.errorMessage ?? null,
			created_at: record.createdAt,
		};

		const { error: transactionError } = await supabase
			.from("transactions")
			.insert(transactionRow);

		if (transactionError) {
			throw new Error(`Failed to sync transaction to Supabase: ${transactionError.message}`);
		}

		const breakdownRows = record.breakdown.map((item) => ({
			local_transaction_id: transactionId,
			category_code: item.categoryCode,
			category_label: item.categoryLabel,
			quantity: item.quantity,
			unit_price: item.unitPrice,
			subtotal: item.subtotal,
		}));

		if (breakdownRows.length === 0) {
			return;
		}

		const { error: breakdownError } = await supabase
			.from("transaction_breakdown")
			.insert(breakdownRows);

		if (breakdownError) {
			throw new Error(`Failed to sync transaction breakdown to Supabase: ${breakdownError.message}`);
		}
	}
}
