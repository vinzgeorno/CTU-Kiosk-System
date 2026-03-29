"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionRecordBuilderService = void 0;
const facilities_1 = require("../config/facilities");
const ticket_format_1 = require("../utils/ticket-format");
const transaction_builder_service_1 = require("./transaction-builder.service");
class TransactionRecordBuilderService {
    constructor(ticketCounterRepository) {
        this.ticketCounterRepository = ticketCounterRepository;
    }
    buildRecord(input) {
        if (!input || typeof input !== "object") {
            throw new Error("Input is required.");
        }
        if (!input.facilityCode) {
            throw new Error("facilityCode is required.");
        }
        const facility = facilities_1.facilities.find((item) => item.code === input.facilityCode);
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
        const details = (0, transaction_builder_service_1.buildTransactionDetails)({
            facilityCode: input.facilityCode,
            quantities: input.quantities,
        });
        if (input.amountPaid < details.amountDue) {
            throw new Error(`Insufficient payment: amountPaid (${input.amountPaid}) is less than amountDue (${details.amountDue}).`);
        }
        const allocation = this.ticketCounterRepository.allocateRange(input.facilityCode, details.totalUnits);
        const ticketLabel = (0, ticket_format_1.buildTicketRangeLabel)(input.facilityCode, allocation.startNo, allocation.endNo);
        const completedAt = input.createdAt ?? new Date().toISOString();
        if (Number.isNaN(Date.parse(completedAt))) {
            throw new Error("createdAt must be a valid ISO date string.");
        }
        const startedAt = input.startedAt ?? completedAt;
        if (Number.isNaN(Date.parse(startedAt))) {
            throw new Error("startedAt must be a valid ISO date string.");
        }
        const durationMs = Math.max(new Date(completedAt).getTime() - new Date(startedAt).getTime(), 0);
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
            createdAt: completedAt,
        };
    }
}
exports.TransactionRecordBuilderService = TransactionRecordBuilderService;
