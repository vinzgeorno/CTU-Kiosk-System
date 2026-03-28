import { FacilityCode, facilities } from "../config/facilities";
import { TicketCounterRepository } from "../db/ticket-counter.repository";
import { TransactionRecord } from "../types/transaction.types";
import { buildTicketRangeLabel } from "../utils/ticket-format";
import { buildTransactionDetails } from "./transaction-builder.service";

export type CreateTransactionRecordInput = {
	facilityCode: FacilityCode;
	quantities: Record<string, number>;
	amountPaid: number;
	sessionId?: string;
	startedAt?: string;
	sourceMode?: string;
	createdAt?: string;
};

export class TransactionRecordBuilderService {
	constructor(private readonly ticketCounterRepository: TicketCounterRepository) {}

	buildRecord(input: CreateTransactionRecordInput): TransactionRecord {
		if (!input || typeof input !== "object") {
			throw new Error("Input is required.");
		}

		if (!input.facilityCode) {
			throw new Error("facilityCode is required.");
		}

		const facility = facilities.find((item) => item.code === input.facilityCode);
		if (!facility) {
			throw new Error(`Invalid facility code: ${input.facilityCode}`);
		}

		if (!input.quantities || typeof input.quantities !== "object") {
			throw new Error("quantities must be a valid object.");
		}

		if (!Number.isFinite(input.amountPaid)) {
			throw new Error("amountPaid must be a valid number.");
		}

		if (input.amountPaid < 0) {
			throw new Error("amountPaid cannot be negative.");
		}

		const details = buildTransactionDetails({
			facilityCode: input.facilityCode,
			quantities: input.quantities,
		});

		if (input.amountPaid < details.amountDue) {
			throw new Error(
				`Insufficient payment: amountPaid (${input.amountPaid}) is less than amountDue (${details.amountDue}).`
			);
		}

		const allocation = this.ticketCounterRepository.allocateRange(
			input.facilityCode,
			details.totalUnits
		);

		const ticketLabel = buildTicketRangeLabel(
			input.facilityCode,
			allocation.startNo,
			allocation.endNo
		);

		const createdAt = input.createdAt ?? new Date().toISOString();

		if (Number.isNaN(Date.parse(createdAt))) {
			throw new Error("createdAt must be a valid ISO date string.");
		}

		const startedAt = input.startedAt ?? createdAt;
		if (Number.isNaN(Date.parse(startedAt))) {
			throw new Error("startedAt must be a valid ISO date string.");
		}

		const completedAt = createdAt;
		const startedAtDate = new Date(startedAt);
		const completedAtDate = new Date(completedAt);
		const durationMs =
			!Number.isNaN(startedAtDate.getTime()) && !Number.isNaN(completedAtDate.getTime())
				? Math.max(0, completedAtDate.getTime() - startedAtDate.getTime())
				: undefined;

		return {
			facilityCode: input.facilityCode,
			facilityName: details.facilityName,
			ticketStartNo: allocation.startNo,
			ticketEndNo: allocation.endNo,
			ticketLabel,
			isBulk: details.isBulk,
			totalUnits: details.totalUnits,
			amountDue: details.amountDue,
			amountPaid: input.amountPaid,
			sessionId: input.sessionId,
			startedAt,
			completedAt,
			durationMs,
			paymentStatus: "completed",
			printStatus: "pending",
			printAttempts: 0,
			sourceMode: input.sourceMode ?? "hardware_live",
			errorMessage: null,
			breakdown: details.breakdown,
			createdAt,
		};
	}
}
