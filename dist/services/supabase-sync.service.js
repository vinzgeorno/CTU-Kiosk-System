"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseSyncService = void 0;
const supabase_1 = require("../config/supabase");
class SupabaseSyncService {
    async syncTransactionWithBreakdown(record, transactionId) {
        if (!supabase_1.supabase) {
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
        const { error: transactionError } = await supabase_1.supabase
            .from("transactions")
            .upsert(transactionRow, {
            onConflict: "local_transaction_id",
        });
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
        const { error: breakdownError } = await supabase_1.supabase
            .from("transaction_breakdown")
            .upsert(breakdownRows, {
            onConflict: "local_transaction_id,category_code",
        });
        if (breakdownError) {
            throw new Error(`Failed to sync transaction breakdown to Supabase: ${breakdownError.message}`);
        }
    }
}
exports.SupabaseSyncService = SupabaseSyncService;
