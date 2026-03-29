"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessTransactionService = void 0;
const printer_mapper_1 = require("../printing/printer.mapper");
class ProcessTransactionService {
    constructor(recordBuilder, transactionRepository, printerService, supabaseSyncService) {
        this.recordBuilder = recordBuilder;
        this.transactionRepository = transactionRepository;
        this.printerService = printerService;
        this.supabaseSyncService = supabaseSyncService;
    }
    async process(input) {
        let record;
        try {
            record = this.recordBuilder.buildRecord(input);
        }
        catch (error) {
            throw new Error(`Failed to build transaction record: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        let transactionId;
        try {
            transactionId = this.transactionRepository.createTransaction(record);
        }
        catch (error) {
            throw new Error(`Failed to save transaction: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        const printableData = (0, printer_mapper_1.mapTransactionToPrintableTicketData)(record);
        let printResult;
        try {
            printResult = await this.printerService.printTicket(printableData);
        }
        catch (error) {
            throw new Error(`Failed to print ticket for transaction ${transactionId}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        // Attempt to sync the saved transaction to Supabase.
        // Failures here must not affect the successful local transaction flow.
        try {
            await this.supabaseSyncService.syncTransactionWithBreakdown(record, transactionId);
            this.transactionRepository.markTransactionSynced(transactionId);
            record.syncStatus = "synced";
            record.syncedAt = new Date().toISOString();
            record.syncError = null;
        }
        catch (syncError) {
            const syncErrorMessage = syncError instanceof Error ? syncError.message : String(syncError);
            this.transactionRepository.markTransactionSyncFailed(transactionId, syncErrorMessage);
            record.syncStatus = "failed";
            record.syncError = syncErrorMessage;
            console.error(`[Supabase Sync] Failed to sync transaction ${transactionId}:`, syncErrorMessage);
        }
        return {
            transactionId,
            record,
            printResult,
        };
    }
}
exports.ProcessTransactionService = ProcessTransactionService;
