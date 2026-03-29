"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTicketNumber = formatTicketNumber;
exports.buildSingleTicketLabel = buildSingleTicketLabel;
exports.buildTicketRangeLabel = buildTicketRangeLabel;
function formatTicketNumber(value) {
    if (value < 1) {
        throw new Error("Ticket number must be at least 1");
    }
    return String(value).padStart(4, "0");
}
function buildSingleTicketLabel(facilityCode, ticketNo) {
    return `${facilityCode}-${formatTicketNumber(ticketNo)}`;
}
function buildTicketRangeLabel(facilityCode, startNo, endNo) {
    if (endNo < startNo) {
        throw new Error("endNo cannot be less than startNo");
    }
    const startLabel = buildSingleTicketLabel(facilityCode, startNo);
    if (startNo === endNo) {
        return startLabel;
    }
    const endLabel = buildSingleTicketLabel(facilityCode, endNo);
    return `${startLabel}-${endLabel}`;
}
