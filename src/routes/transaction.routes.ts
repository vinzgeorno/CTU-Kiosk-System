import { db } from "../db/sqlite";
import { PaymentEventsRepository } from "../db/payment-events.repository";
import { SessionLogsRepository } from "../db/session-logs.repository";
import { TicketCounterRepository } from "../db/ticket-counter.repository";
import { TransactionRepository } from "../db/transaction.repository";
import { mapTransactionToPrintableTicketData } from "../printing/printer.mapper";
import { PrinterService } from "../printing/printer.service";
import { SummaryReportPrinterService } from "../printing/summary-report-printer.service";
import { buildTransactionDetails } from "../services/transaction-builder.service";
import { ProcessTransactionService } from "../services/process-transaction.service";
import { TransactionRecordBuilderService } from "../services/transaction-record-builder.service";
import { SupabaseSyncService } from "../services/supabase-sync.service";
import { TransactionRecord } from "../types/transaction.types";
import { paymentSessionStore } from "../hardware/shared-payment-session";

type CreateTransactionRequestBody = {
	facilityCode: string;
	quantities: Record<string, number>;
	amountPaid: number;
	createdAt?: string;
};

type StartPaymentSessionRequestBody = {
	facilityCode?: unknown;
	quantities?: unknown;
};

type InsertPaymentRequestBody = {
	amount?: unknown;
};

type RecentTransactionsQuery = {
	limit?: string | number;
};

type AllTransactionsQuery = {
	page?: string | number;
	limit?: string | number;
};

type UnsyncedTransactionsQuery = {
	status?: string;
	limit?: string | number;
};

type FacilitySummaryReportQuery = {
	startAt?: string;
	endAt?: string;
};

type FacilitySummaryReportPrintRow = {
	facility_code?: unknown;
	facility_name?: unknown;
	first_ticket_label?: unknown;
	last_ticket_label?: unknown;
	transaction_count?: unknown;
	total_units?: unknown;
	total_amount?: unknown;
};

type FacilitySummaryReportPrintBody = {
	reportTitle?: unknown;
	startAt?: unknown;
	endAt?: unknown;
	rows?: unknown;
};

type UpdateTicketCounterParams = {
	facilityCode?: string;
};

type UpdateTicketCounterBody = {
	lastSequence?: number;
};

type ReprintTransactionParams = {
	id?: string;
};

type RetryTransactionSyncParams = {
	id?: string;
};

type GetTransactionByTicketLabelParams = {
	ticketLabel?: string;
};

type TransactionBreakdownRow = {
	category_code: string;
	category_label: string;
	quantity: number;
	unit_price: number;
	subtotal: number;
};

type TransactionRowWithBreakdown = {
	id: number;
	facility_code: string;
	facility_name: string;
	ticket_start_no: number;
	ticket_end_no: number;
	ticket_label: string;
	is_bulk: number;
	total_units: number;
	amount_due: number;
	amount_paid: number;
	session_id?: string | null;
	started_at?: string | null;
	completed_at?: string | null;
	duration_ms?: number | null;
	payment_status?: string | null;
	print_status?: string | null;
	print_attempts?: number | null;
	source_mode?: string | null;
	sync_status?: string | null;
	synced_at?: string | null;
	sync_error?: string | null;
	error_message?: string | null;
	created_at: string;
	breakdown: TransactionBreakdownRow[];
};

function mapTransactionRowToRecord(transaction: TransactionRowWithBreakdown): TransactionRecord {
	return {
		facilityCode: transaction.facility_code as any,
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
			categoryCode: item.category_code as any,
			categoryLabel: item.category_label,
			quantity: item.quantity,
			unitPrice: item.unit_price,
			subtotal: item.subtotal,
		})),
		createdAt: transaction.created_at,
	};
}

export default async function transactionRoutes(fastify: any) {
	const ticketCounterRepository = new TicketCounterRepository(db);
	const transactionRecordBuilderService = new TransactionRecordBuilderService(
		ticketCounterRepository
	);
	const transactionRepository = new TransactionRepository(db);
	const paymentEventsRepository = new PaymentEventsRepository(db);
	const sessionLogsRepository = new SessionLogsRepository(db);
	const printerService = new PrinterService();
	const summaryReportPrinterService = new SummaryReportPrinterService();
	const supabaseSyncService = new SupabaseSyncService();
	const processTransactionService = new ProcessTransactionService(
		transactionRecordBuilderService,
		transactionRepository,
		printerService,
		supabaseSyncService
	);

	fastify.post(
		"/payment-session/start",
		async (request: { body: StartPaymentSessionRequestBody }, reply: any) => {
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

			const quantityEntries = Object.entries(body.quantities as Record<string, unknown>);

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
				const transactionDetails = buildTransactionDetails({
					facilityCode: body.facilityCode as any,
					quantities: body.quantities as Record<string, number>,
				});

				const nowIso = new Date().toISOString();
				const paymentSession = paymentSessionStore.create({
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
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/payment-session/current",
		async (_request: any, reply: any) => {
			try {
				const session = paymentSessionStore.getCurrent();
				return {
					success: true,
					session,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/payment-session/insert",
		async (request: { body: InsertPaymentRequestBody }, reply: any) => {
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
				const currentSession = paymentSessionStore.getCurrent();

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
				const nextStatus =
					newAmountInserted >= currentSession.amountDue ? "paid" : "awaiting_payment";

				const updatedSession = paymentSessionStore.update({
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
					remainingAmount: Math.max(
						updatedSession.amountDue - updatedSession.amountInserted,
						0
					),
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/payment-session/complete",
		async (_request: any, reply: any) => {
			try {
				const session = paymentSessionStore.getCurrent();

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

				const quantities: Record<string, number> = {};
				for (const item of session.breakdown) {
					quantities[item.categoryCode] = item.quantity;
				}

				const completionTimestamp = new Date().toISOString();

				const result = await processTransactionService.process({
					facilityCode: session.facilityCode as any,
					quantities,
					amountPaid: session.amountInserted,
					createdAt: completionTimestamp,
					sessionId: session.id,
					startedAt: session.createdAt,
					sourceMode: "hardware_live",
				});

				paymentSessionStore.update({ status: "completed" });
				sessionLogsRepository.markCompleted(
					session.id,
					result.transactionId,
					session.amountInserted
				);
				paymentSessionStore.clear();

				return {
					success: true,
					transactionId: result.transactionId,
					ticketLabel: result.record.ticketLabel,
					totalUnits: result.record.totalUnits,
					amountDue: result.record.amountDue,
					amountPaid: result.record.amountPaid,
					printResult: result.printResult,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/payment-session/cancel",
		async (_request: any, reply: any) => {
			try {
				const session = paymentSessionStore.getCurrent();

				if (!session) {
					return reply.status(400).send({
						success: false,
						message: "No active payment session",
					});
				}

				paymentSessionStore.update({ status: "cancelled" });
				sessionLogsRepository.markCancelled(session.id, session.amountInserted);
				paymentSessionStore.clear();

				return {
					success: true,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/transactions/recent",
		async (request: { query: RecentTransactionsQuery }, reply: any) => {
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
			} catch (error) {
				return reply.status(400).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/transactions/all",
		async (request: { query: AllTransactionsQuery }, reply: any) => {
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
			} catch (error) {
				return reply.status(400).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/transactions/unsynced",
		async (request: { query: UnsyncedTransactionsQuery }, reply: any) => {
			const status =
				typeof request.query?.status === "string" && request.query.status.trim() !== ""
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
				const transactions = transactionRepository.getTransactionsBySyncStatus(
					status,
					parsedLimit
				);

				return {
					success: true,
					transactions,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/transactions/stats",
		async (_request: any, reply: any) => {
			try {
				const stats = transactionRepository.getTransactionStats();

				return {
					success: true,
					stats,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/reports/facility-summary",
		async (request: { query: FacilitySummaryReportQuery }, reply: any) => {
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
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/reports/facility-summary/print",
		async (request: { body: FacilitySummaryReportPrintBody }, reply: any) => {
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
				const typedRows = rows as FacilitySummaryReportPrintRow[];
				const generatedAt = new Date().toISOString();
				const grandTotalAmount = typedRows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
				const grandTotalUnits = typedRows.reduce((sum, row) => sum + Number(row.total_units ?? 0), 0);
				const grandTransactionCount = typedRows.reduce(
					(sum, row) => sum + Number(row.transaction_count ?? 0),
					0
				);

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
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/ticket-counters",
		async (request: any, reply: any) => {
			try {
				const counters = ticketCounterRepository.getAllCounters();

				return {
					success: true,
					counters,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.patch(
		"/ticket-counters/:facilityCode",
		async (
			request: { params: UpdateTicketCounterParams; body: UpdateTicketCounterBody },
			reply: any
		) => {
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
				ticketCounterRepository.setLastSequence(facilityCode as any, lastSequence);

				return {
					success: true,
					message: "Ticket counter updated",
					facilityCode,
					lastSequence,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/transactions/:id/retry-sync",
		async (request: { params: RetryTransactionSyncParams }, reply: any) => {
			const rawId = request.params?.id;
			const id = Number(rawId);

			if (!Number.isInteger(id) || id <= 0) {
				return reply.status(400).send({
					success: false,
					message: "id must be a valid positive number.",
				});
			}

			try {
				const transaction = transactionRepository.getTransactionById(id) as
					| TransactionRowWithBreakdown
					| null;

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
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				transactionRepository.markTransactionSyncFailed(id, errorMessage);

				return reply.status(500).send({
					success: false,
					message: errorMessage,
				});
			}
		}
	);

	fastify.post(
		"/transactions/:id/reprint",
		async (request: { params: ReprintTransactionParams }, reply: any) => {
			const rawId = request.params?.id;
			const id = Number(rawId);

			if (!Number.isInteger(id) || id <= 0) {
				return reply.status(400).send({
					success: false,
					message: "id must be a valid positive number.",
				});
			}

			try {
				const transaction = transactionRepository.getTransactionById(id) as
					| TransactionRowWithBreakdown
					| null;

				if (!transaction) {
					return reply.status(404).send({
						success: false,
						message: "Transaction not found",
					});
				}

				const record = mapTransactionRowToRecord(transaction);

				const printableData = mapTransactionToPrintableTicketData(record);
				const printResult = await printerService.printTicket(printableData);

				return {
					success: true,
					transactionId: id,
					ticketLabel: record.ticketLabel,
					printResult,
				};
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.get(
		"/transactions/by-ticket/:ticketLabel",
		async (request: { params: GetTransactionByTicketLabelParams }, reply: any) => {
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
			} catch (error) {
				return reply.status(500).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);

	fastify.post(
		"/transactions",
		async (request: { body: CreateTransactionRequestBody }, reply: any) => {
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
					facilityCode: body.facilityCode as any,
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
			} catch (error) {
				return reply.status(400).send({
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}
	);
}
