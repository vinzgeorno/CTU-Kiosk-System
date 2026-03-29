export function formatTicketNumber(value: number): string {
	if (value < 1) {
		throw new Error("Ticket number must be at least 1");
	}

	return String(value).padStart(4, "0");
}

function getCurrentMonthCode(): string {
	const currentMonth = new Date().getMonth() + 1;
	return String(currentMonth).padStart(2, "0");
}

function formatTicketLabel(
	facilityCode: string,
	monthCode: string,
	ticketNo: number
): string {
	return `${facilityCode}-${monthCode}-${formatTicketNumber(ticketNo)}`;
}

export function buildSingleTicketLabel(
	facilityCode: string,
	ticketNo: number
): string {
	return formatTicketLabel(facilityCode, getCurrentMonthCode(), ticketNo);
}

export function buildTicketRangeLabel(
	facilityCode: string,
	startNo: number,
	endNo: number
): string {
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
