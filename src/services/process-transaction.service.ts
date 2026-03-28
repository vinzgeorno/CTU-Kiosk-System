import { FacilityCode } from "../config/facilities";
import { TransactionRepository } from "../db/transaction.repository";
import { mapTransactionToPrintableTicketData } from "../printing/printer.mapper";
import { PrinterService } from "../printing/printer.service";
import { TransactionRecord } from "../types/transaction.types";
import { TransactionRecordBuilderService } from "./transaction-record-builder.service";
import { SupabaseSyncService } from "./supabase-sync.service";

export type ProcessTransactionInput = {
  facilityCode: FacilityCode;
  quantities: Record<string, number>;
  amountPaid: number;
  createdAt?: string;
  sessionId?: string;
  startedAt?: string;
  sourceMode?: string;
};

export type ProcessTransactionResult = {
  transactionId: number;
  record: TransactionRecord;
  printResult: any;
};

export class ProcessTransactionService {
  constructor(
    private readonly recordBuilder: TransactionRecordBuilderService,
    private readonly transactionRepository: TransactionRepository,
    private readonly printerService: PrinterService,
    private readonly supabaseSyncService: SupabaseSyncService
  ) {}

  async process(input: ProcessTransactionInput): Promise<ProcessTransactionResult> {
    let record: TransactionRecord;

    try {
      record = this.recordBuilder.buildRecord(input);
    } catch (error) {
      throw new Error(
        `Failed to build transaction record: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    let transactionId: number;

    try {
      transactionId = this.transactionRepository.createTransaction(record);
    } catch (error) {
      throw new Error(
        `Failed to save transaction: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const printableData = mapTransactionToPrintableTicketData(record);

    let printResult: any;

    try {
      printResult = await this.printerService.printTicket(printableData);
    } catch (error) {
      throw new Error(
        `Failed to print ticket for transaction ${transactionId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Attempt to sync the saved transaction to Supabase.
    // Failures here must not affect the successful local transaction flow.
    try {
      await this.supabaseSyncService.syncTransactionWithBreakdown(record, transactionId);
    } catch (syncError) {
      console.error(
        `[Supabase Sync] Failed to sync transaction ${transactionId}:`,
        syncError instanceof Error ? syncError.message : syncError
      );
    }

    return {
      transactionId,
      record,
      printResult,
    };
  }
}
