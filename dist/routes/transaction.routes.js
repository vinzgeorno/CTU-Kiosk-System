"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = transactionRoutes;
const sqlite_1 = require("../db/sqlite");
const payment_events_repository_1 = require("../db/payment-events.repository");
const session_logs_repository_1 = require("../db/session-logs.repository");
const ticket_counter_repository_1 = require("../db/ticket-counter.repository");
const transaction_repository_1 = require("../db/transaction.repository");
const printer_mapper_1 = require("../printing/printer.mapper");
const printer_service_1 = require("../printing/printer.service");
const summary_report_printer_service_1 = require("../printing/summary-report-printer.service");
const transaction_builder_service_1 = require("../services/transaction-builder.service");
const process_transaction_service_1 = require("../services/process-transaction.service");
const transaction_record_builder_service_1 = require("../services/transaction-record-builder.service");
const supabase_sync_service_1 = require("../services/supabase-sync.service");
const shared_payment_session_1 = require("../hardware/shared-payment-session");
function mapTransactionRowToRecord(transaction) {
    return {
        facilityCode: transaction.facility_code,
        facilityName: transaction.facility_name,
        ticketStartNo: transaction.ticket_start_no,
        ticketEndNo: transaction.ticket_end_no,
        ticketLabel: transaction.ticket_label,
        isBulk: Boolean(transaction.is_bulk),
        totalUnits: transaction.total_units,
        amountDue: transaction.amount_due,
        amountPaid: transaction.amount_paid,
        sessionId: transaction.session_id ?? undefined,
        startedAt: transaction.started_at ?? undefined,
        completedAt: transaction.completed_at ?? undefined,
        durationMs: transaction.duration_ms ?? undefined,
        paymentStatus: transaction.payment_status ?? undefined,
        printStatus: transaction.print_status ?? undefined,
        printAttempts: transaction.print_attempts ?? undefined,
        sourceMode: transaction.source_mode ?? undefined,
        syncStatus: transaction.sync_status ?? undefined,
        syncedAt: transaction.synced_at ?? null,
        syncError: transaction.sync_error ?? null,
        errorMessage: transaction.error_message ?? null,
        breakdown: transaction.breakdown.map((item) => ({
            categoryCode: item.category_code,
            categoryLabel: item.category_label,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            subtotal: item.subtotal,
        })),
        createdAt: transaction.created_at,
    };
}
async function transactionRoutes(fastify) {
    const ticketCounterRepository = new ticket_counter_repository_1.TicketCounterRepository(sqlite_1.db);
    const transactionRecordBuilderService = new transaction_record_builder_service_1.TransactionRecordBuilderService(ticketCounterRepository);
    const transactionRepository = new transaction_repository_1.TransactionRepository(sqlite_1.db);
    const paymentEventsRepository = new payment_events_repository_1.PaymentEventsRepository(sqlite_1.db);
    const sessionLogsRepository = new session_logs_repository_1.SessionLogsRepository(sqlite_1.db);
    const printerService = new printer_service_1.PrinterService();
    const summaryReportPrinterService = new summary_report_printer_service_1.SummaryReportPrinterService();
    const supabaseSyncService = new supabase_sync_service_1.SupabaseSyncService();
    const processTransactionService = new process_transaction_service_1.ProcessTransactionService(transactionRecordBuilderService, transactionRepository, printerService, supabaseSyncService);
    fastify.post("/payment-session/start", async (request, reply) => {
        const body = request.body;
        if (!body || typeof body.facilityCode !== "string" || body.facilityCode.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "facilityCode is required and must be a string.",
            });
        }
        if (!body.quantities || typeof body.quantities !== "object" || Array.isArray(body.quantities)) {
            return reply.status(400).send({
                success: false,
                message: "quantities is required and must be an object.",
            });
        }
        const quantityEntries = Object.entries(body.quantities);
        if (quantityEntries.length === 0) {
            return reply.status(400).send({
                success: false,
                message: "quantities must contain at least one key.",
            });
        }
        for (const [key, value] of quantityEntries) {
            if (typeof value !== "number" || Number.isNaN(value)) {
                return reply.status(400).send({
                    success: false,
                    message: `Quantity for '${key}' must be a number.`,
                });
            }
            if (value < 0) {
                return reply.status(400).send({
                    success: false,
                    message: `Quantity for '${key}' must be greater than or equal to 0.`,
                });
            }
        }
        try {
            const transactionDetails = (0, transaction_builder_service_1.buildTransactionDetails)({
                facilityCode: body.facilityCode,
                quantities: body.quantities,
            });
            const nowIso = new Date().toISOString();
            const paymentSession = shared_payment_session_1.paymentSessionStore.create({
                id: `${Date.now()}`,
                facilityCode: transactionDetails.facilityCode,
                facilityName: transactionDetails.facilityName,
                breakdown: transactionDetails.breakdown,
                totalUnits: transactionDetails.totalUnits,
                amountDue: transactionDetails.amountDue,
                amountInserted: 0,
                status: "awaiting_payment",
                createdAt: nowIso,
                updatedAt: nowIso,
            });
            sessionLogsRepository.createSessionLog({
                sessionId: paymentSession.id,
                facilityCode: paymentSession.facilityCode,
                facilityName: paymentSession.facilityName,
                amountDue: paymentSession.amountDue,
                amountInserted: 0,
                totalUnits: paymentSession.totalUnits,
                status: "awaiting_payment",
                startedAt: paymentSession.createdAt,
                lastUpdatedAt: paymentSession.updatedAt,
            });
            return {
                success: true,
                session: paymentSession,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/payment-session/current", async (_request, reply) => {
        try {
            const session = shared_payment_session_1.paymentSessionStore.getCurrent();
            return {
                success: true,
                session,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/payment-session/insert", async (request, reply) => {
        const body = request.body;
        if (!body || body.amount === undefined || body.amount === null) {
            return reply.status(400).send({
                success: false,
                message: "amount is required.",
            });
        }
        if (typeof body.amount !== "number" || Number.isNaN(body.amount)) {
            return reply.status(400).send({
                success: false,
                message: "amount must be a number.",
            });
        }
        if (body.amount <= 0) {
            return reply.status(400).send({
                success: false,
                message: "amount must be greater than 0.",
            });
        }
        try {
            const currentSession = shared_payment_session_1.paymentSessionStore.getCurrent();
            if (!currentSession) {
                return reply.status(400).send({
                    success: false,
                    message: "No active payment session",
                });
            }
            paymentEventsRepository.createPaymentEvent({
                sessionId: currentSession.id,
                source: "manual_test",
                amount: body.amount,
                pulseCount: 0,
                recordedAt: new Date().toISOString(),
            });
            const newAmountInserted = currentSession.amountInserted + body.amount;
            const nextStatus = newAmountInserted >= currentSession.amountDue ? "paid" : "awaiting_payment";
            const updatedSession = shared_payment_session_1.paymentSessionStore.update({
                amountInserted: newAmountInserted,
                status: nextStatus,
            });
            sessionLogsRepository.updateSessionLog(updatedSession.id, {
                amountInserted: updatedSession.amountInserted,
                status: updatedSession.status,
            });
            return {
                success: true,
                session: updatedSession,
                remainingAmount: Math.max(updatedSession.amountDue - updatedSession.amountInserted, 0),
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/payment-session/complete", async (_request, reply) => {
        try {
            const session = shared_payment_session_1.paymentSessionStore.getCurrent();
            if (!session) {
                return reply.status(400).send({
                    success: false,
                    message: "No active payment session",
                });
            }
            if (session.status !== "paid") {
                return reply.status(400).send({
                    success: false,
                    message: "Payment session is not yet fully paid",
                });
            }
            const quantities = {};
            for (const item of session.breakdown) {
                quantities[item.categoryCode] = item.quantity;
            }
            const completionTimestamp = new Date().toISOString();
            const result = await processTransactionService.process({
                facilityCode: session.facilityCode,
                quantities,
                amountPaid: session.amountInserted,
                createdAt: completionTimestamp,
                sessionId: session.id,
                startedAt: session.createdAt,
                sourceMode: "hardware_live",
            });
            shared_payment_session_1.paymentSessionStore.update({ status: "completed" });
            sessionLogsRepository.markCompleted(session.id, result.transactionId, session.amountInserted);
            shared_payment_session_1.paymentSessionStore.clear();
            return {
                success: true,
                transactionId: result.transactionId,
                ticketLabel: result.record.ticketLabel,
                totalUnits: result.record.totalUnits,
                amountDue: result.record.amountDue,
                amountPaid: result.record.amountPaid,
                printResult: result.printResult,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/payment-session/cancel", async (_request, reply) => {
        try {
            const session = shared_payment_session_1.paymentSessionStore.getCurrent();
            if (!session) {
                return reply.status(400).send({
                    success: false,
                    message: "No active payment session",
                });
            }
            shared_payment_session_1.paymentSessionStore.update({ status: "cancelled" });
            sessionLogsRepository.markCancelled(session.id, session.amountInserted);
            shared_payment_session_1.paymentSessionStore.clear();
            return {
                success: true,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/transactions/recent", async (request, reply) => {
        const rawLimit = request.query?.limit;
        const parsedLimit = rawLimit === undefined ? 20 : Number(rawLimit);
        if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
            return reply.status(400).send({
                success: false,
                message: "Invalid limit",
            });
        }
        try {
            const transactions = transactionRepository.getRecentTransactions(parsedLimit);
            return {
                success: true,
                transactions,
            };
        }
        catch (error) {
            return reply.status(400).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/transactions/all", async (request, reply) => {
        const rawPage = request.query?.page;
        const rawLimit = request.query?.limit;
        const parsedPage = rawPage === undefined ? 1 : Number(rawPage);
        const parsedLimit = rawLimit === undefined ? 50 : Number(rawLimit);
        if (!Number.isFinite(parsedPage) || parsedPage < 1) {
            return reply.status(400).send({
                success: false,
                message: "Invalid page",
            });
        }
        if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            return reply.status(400).send({
                success: false,
                message: "Invalid limit (1-100)",
            });
        }
        try {
            const transactions = transactionRepository.getAllTransactionsPaginated(parsedPage, parsedLimit);
            const total = transactionRepository.getTotalTransactionCount();
            return {
                success: true,
                transactions,
                pagination: {
                    page: parsedPage,
                    limit: parsedLimit,
                    total,
                    totalPages: Math.ceil(total / parsedLimit),
                },
            };
        }
        catch (error) {
            return reply.status(400).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/transactions/unsynced", async (request, reply) => {
        const status = typeof request.query?.status === "string" && request.query.status.trim() !== ""
            ? request.query.status.trim()
            : "failed";
        const rawLimit = request.query?.limit;
        const parsedLimit = rawLimit === undefined ? 20 : Number(rawLimit);
        if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
            return reply.status(400).send({
                success: false,
                message: "Invalid limit",
            });
        }
        try {
            const transactions = transactionRepository.getTransactionsBySyncStatus(status, parsedLimit);
            return {
                success: true,
                transactions,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/transactions/stats", async (_request, reply) => {
        try {
            const stats = transactionRepository.getTransactionStats();
            return {
                success: true,
                stats,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/reports/facility-summary", async (request, reply) => {
        const startAt = request.query?.startAt;
        const endAt = request.query?.endAt;
        if (typeof startAt !== "string" || startAt.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "startAt is required and must be a non-empty string.",
            });
        }
        if (typeof endAt !== "string" || endAt.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "endAt is required and must be a non-empty string.",
            });
        }
        try {
            const report = transactionRepository.getFacilitySummaryReport(startAt, endAt);
            return {
                success: true,
                report,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/reports/facility-summary/print", async (request, reply) => {
        const reportTitle = request.body?.reportTitle;
        const startAt = request.body?.startAt;
        const endAt = request.body?.endAt;
        const rows = request.body?.rows;
        if (typeof reportTitle !== "string" || reportTitle.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "reportTitle is required and must be a non-empty string.",
            });
        }
        if (typeof startAt !== "string" || startAt.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "startAt is required and must be a non-empty string.",
            });
        }
        if (typeof endAt !== "string" || endAt.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "endAt is required and must be a non-empty string.",
            });
        }
        if (!Array.isArray(rows)) {
            return reply.status(400).send({
                success: false,
                message: "rows is required and must be an array.",
            });
        }
        try {
            const typedRows = rows;
            const generatedAt = new Date().toISOString();
            const grandTotalAmount = typedRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
            const grandTotalUnits = typedRows.reduce((sum, row) => sum + Number(row.total_units ?? 0), 0);
            const grandTransactionCount = typedRows.reduce((sum, row) => sum + Number(row.transaction_count ?? 0), 0);
            const printResult = await summaryReportPrinterService.printReport({
                reportTitle,
                startAt,
                endAt,
                generatedAt,
                rows: typedRows,
                grandTotalAmount,
                grandTotalUnits,
                grandTransactionCount,
            });
            return {
                success: true,
                printResult,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/ticket-counters", async (request, reply) => {
        try {
            const counters = ticketCounterRepository.getAllCounters();
            return {
                success: true,
                counters,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.patch("/ticket-counters/:facilityCode", async (request, reply) => {
        const facilityCode = request.params?.facilityCode;
        const lastSequence = request.body?.lastSequence;
        if (typeof facilityCode !== "string" || facilityCode.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "facilityCode is required and must be a non-empty string.",
            });
        }
        if (typeof lastSequence !== "number" || Number.isNaN(lastSequence)) {
            return reply.status(400).send({
                success: false,
                message: "lastSequence is required and must be a number.",
            });
        }
        if (lastSequence < 0) {
            return reply.status(400).send({
                success: false,
                message: "lastSequence must be greater than or equal to 0.",
            });
        }
        try {
            ticketCounterRepository.setLastSequence(facilityCode, lastSequence);
            return {
                success: true,
                message: "Ticket counter updated",
                facilityCode,
                lastSequence,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/transactions/:id/retry-sync", async (request, reply) => {
        const rawId = request.params?.id;
        const id = Number(rawId);
        if (!Number.isInteger(id) || id <= 0) {
            return reply.status(400).send({
                success: false,
                message: "id must be a valid positive number.",
            });
        }
        try {
            const transaction = transactionRepository.getTransactionById(id);
            if (!transaction) {
                return reply.status(404).send({
                    success: false,
                    message: "Transaction not found",
                });
            }
            const record = mapTransactionRowToRecord(transaction);
            await supabaseSyncService.syncTransactionWithBreakdown(record, id);
            transactionRepository.markTransactionSynced(id);
            return {
                success: true,
                message: `Transaction ${id} synced successfully.`,
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            transactionRepository.markTransactionSyncFailed(id, errorMessage);
            return reply.status(500).send({
                success: false,
                message: errorMessage,
            });
        }
    });
    fastify.post("/transactions/:id/reprint", async (request, reply) => {
        const rawId = request.params?.id;
        const id = Number(rawId);
        if (!Number.isInteger(id) || id <= 0) {
            return reply.status(400).send({
                success: false,
                message: "id must be a valid positive number.",
            });
        }
        try {
            const transaction = transactionRepository.getTransactionById(id);
            if (!transaction) {
                return reply.status(404).send({
                    success: false,
                    message: "Transaction not found",
                });
            }
            const record = mapTransactionRowToRecord(transaction);
            const printableData = (0, printer_mapper_1.mapTransactionToPrintableTicketData)(record);
            const printResult = await printerService.printTicket(printableData);
            return {
                success: true,
                transactionId: id,
                ticketLabel: record.ticketLabel,
                printResult,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.get("/transactions/by-ticket/:ticketLabel", async (request, reply) => {
        const ticketLabel = request.params?.ticketLabel;
        if (typeof ticketLabel !== "string" || ticketLabel.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "ticketLabel is required and must be a non-empty string.",
            });
        }
        try {
            const transaction = transactionRepository.getTransactionByTicketLabel(ticketLabel);
            if (!transaction) {
                return reply.status(404).send({
                    success: false,
                    message: "Transaction not found",
                });
            }
            return {
                success: true,
                transaction,
            };
        }
        catch (error) {
            return reply.status(500).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
    fastify.post("/transactions", async (request, reply) => {
        const body = request.body;
        if (!body || typeof body.facilityCode !== "string" || body.facilityCode.trim() === "") {
            return reply.status(400).send({
                success: false,
                message: "facilityCode is required and must be a non-empty string.",
            });
        }
        if (!body.quantities || typeof body.quantities !== "object" || Array.isArray(body.quantities)) {
            return reply.status(400).send({
                success: false,
                message: "quantities is required and must be an object.",
            });
        }
        const quantityEntries = Object.entries(body.quantities);
        if (quantityEntries.length === 0) {
            return reply.status(400).send({
                success: false,
                message: "quantities must contain at least one item.",
            });
        }
        for (const [category, value] of quantityEntries) {
            if (typeof value !== "number" || Number.isNaN(value)) {
                return reply.status(400).send({
                    success: false,
                    message: `Quantity for '${category}' must be a number.`,
                });
            }
            if (value < 0) {
                return reply.status(400).send({
                    success: false,
                    message: `Quantity for '${category}' must be greater than or equal to 0.`,
                });
            }
        }
        if (typeof body.amountPaid !== "number" || Number.isNaN(body.amountPaid)) {
            return reply.status(400).send({
                success: false,
                message: "amountPaid is required and must be a number.",
            });
        }
        if (body.amountPaid < 0) {
            return reply.status(400).send({
                success: false,
                message: "amountPaid must be greater than or equal to 0.",
            });
        }
        if (body.createdAt !== undefined && typeof body.createdAt !== "string") {
            return reply.status(400).send({
                success: false,
                message: "createdAt must be a string when provided.",
            });
        }
        try {
            const result = await processTransactionService.process({
                facilityCode: body.facilityCode,
                quantities: body.quantities,
                amountPaid: body.amountPaid,
                createdAt: body.createdAt,
            });
            return {
                success: true,
                transactionId: result.transactionId,
                ticketLabel: result.record.ticketLabel,
                totalUnits: result.record.totalUnits,
                amountDue: result.record.amountDue,
                amountPaid: result.record.amountPaid,
                printResult: result.printResult,
            };
        }
        catch (error) {
            return reply.status(400).send({
                success: false,
                message: error instanceof Error ? error.message : "Unknown error",
            });
        }
    });
}
