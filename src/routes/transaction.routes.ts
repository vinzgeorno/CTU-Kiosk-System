import { db } from "../db/sqlite";
import { TicketCounterRepository } from "../db/ticket-counter.repository";
import { TransactionRepository } from "../db/transaction.repository";
import { PrinterService } from "../printing/printer.service";
import { ProcessTransactionService } from "../services/process-transaction.service";
import { TransactionRecordBuilderService } from "../services/transaction-record-builder.service";

type CreateTransactionRequestBody = {
	facilityCode: string;
	quantities: Record<string, number>;
	amountPaid: number;
	createdAt?: string;
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

	fastify.post(
		"/transactions",
		async (request: { body: CreateTransactionRequestBody }, reply: any) => {
			try {
				const result = await processTransactionService.process({
					facilityCode: request.body.facilityCode as any,
					quantities: request.body.quantities,
					amountPaid: request.body.amountPaid,
					createdAt: request.body.createdAt,
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
