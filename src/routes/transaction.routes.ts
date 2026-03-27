import { db } from "../db/sqlite";
import { TicketCounterRepository } from "../db/ticket-counter.repository";
import { TransactionRepository } from "../db/transaction.repository";
import { mapTransactionToPrintableTicketData } from "../printing/printer.mapper";
import { PrinterService } from "../printing/printer.service";
import { ProcessTransactionService } from "../services/process-transaction.service";
import { TransactionRecordBuilderService } from "../services/transaction-record-builder.service";
import { TransactionRecord } from "../types/transaction.types";

type CreateTransactionRequestBody = {
	facilityCode: string;
	quantities: Record<string, number>;
	amountPaid: number;
	createdAt?: string;
};

type RecentTransactionsQuery = {
	limit?: string | number;
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
	created_at: string;
	breakdown: TransactionBreakdownRow[];
};

export default async function transactionRoutes(fastify: any) {
	const ticketCounterRepository = new TicketCounterRepository(db);
	const transactionRecordBuilderService = new TransactionRecordBuilderService(
		ticketCounterRepository
	);
	const transactionRepository = new TransactionRepository(db);
	const printerService = new PrinterService();
	const processTransactionService = new ProcessTransactionService(
		transactionRecordBuilderService,
		transactionRepository,
		printerService
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

				const record: TransactionRecord = {
					facilityCode: transaction.facility_code as any,
					facilityName: transaction.facility_name,
					ticketStartNo: transaction.ticket_start_no,
					ticketEndNo: transaction.ticket_end_no,
					ticketLabel: transaction.ticket_label,
					isBulk: Boolean(transaction.is_bulk),
					totalUnits: transaction.total_units,
					amountDue: transaction.amount_due,
					amountPaid: transaction.amount_paid,
					breakdown: transaction.breakdown.map((item) => ({
						categoryCode: item.category_code as any,
						categoryLabel: item.category_label,
						quantity: item.quantity,
						unitPrice: item.unit_price,
						subtotal: item.subtotal,
					})),
					createdAt: transaction.created_at,
				};

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
