"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTransactionToPrintableTicketData = mapTransactionToPrintableTicketData;
function mapTransactionToPrintableTicketData(record) {
    return {
        facilityCode: record.facilityCode,
        facilityName: record.facilityName,
        ticketLabel: record.ticketLabel,
        totalUnits: record.totalUnits,
        amountDue: record.amountDue,
        amountPaid: record.amountPaid,
        breakdown: record.breakdown,
        createdAt: record.createdAt,
    };
}
