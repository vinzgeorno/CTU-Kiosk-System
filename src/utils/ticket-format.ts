export function formatTicketNumber(value: number): string {
	if (value < 1) {
		throw new Error("Ticket number must be at least 1");
	}

	return String(value).padStart(4, "0");
}

export function buildSingleTicketLabel(
	facilityCode: string,
	ticketNo: number
): string {
	return `${facilityCode}-${formatTicketNumber(ticketNo)}`;
}

export function buildTicketRangeLabel(
	facilityCode: string,
	startNo: number,
	endNo: number
): string {
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
