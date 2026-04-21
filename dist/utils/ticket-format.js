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
function getCurrentMonthCode() {
    const currentMonth = new Date().getMonth() + 1;
    return String(currentMonth).padStart(2, "0");
}
function formatTicketLabel(facilityCode, monthCode, ticketNo) {
    return `${facilityCode}-${monthCode}-${formatTicketNumber(ticketNo)}`;
}
function buildSingleTicketLabel(facilityCode, ticketNo) {
    return formatTicketLabel(facilityCode, getCurrentMonthCode(), ticketNo);
}
function buildTicketRangeLabel(facilityCode, startNo, endNo) {
    if (endNo < startNo) {
        throw new Error("endNo cannot be less than startNo");
    }
    const monthCode = getCurrentMonthCode();
    const startLabel = formatTicketLabel(facilityCode, monthCode, startNo);
    if (startNo === endNo) {
        return startLabel;
    }
    const endLabel = formatTicketLabel(facilityCode, monthCode, endNo);
    return `${startLabel} - ${endLabel}`;
}
