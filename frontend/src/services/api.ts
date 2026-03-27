import { API_BASE_URL } from "../config";

async function requestJson(path: string, init?: RequestInit) {
	let response: Response;

	try {
		response = await fetch(`${API_BASE_URL}${path}`, init);
	} catch {
		throw new Error(`Unable to reach backend at ${API_BASE_URL}`);
	}

	const data = await response.json().catch(() => null);

	if (!response.ok) {
		const message = data && typeof data.message === "string" ? data.message : "Request failed";
		throw new Error(message);
	}

	return data;
}

export async function startPaymentSession(payload: unknown) {
	return requestJson("/payment-session/start", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});
}

export async function getCurrentPaymentSession() {
	return requestJson("/payment-session/current", {
		method: "GET",
	});
}

export async function insertPaymentAmount(amount: number) {
	return requestJson("/payment-session/insert", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ amount }),
	});
}

export async function completePaymentSession() {
	return requestJson("/payment-session/complete", {
		method: "POST",
	});
}

export async function getRecentTransactions(limit?: number) {
	const query = typeof limit === "number" ? `?limit=${limit}` : "";

	return requestJson(`/transactions/recent${query}`, {
		method: "GET",
	});
}

export async function getTicketCounters() {
	return requestJson("/ticket-counters", {
		method: "GET",
	});
}

export async function getTransactionByTicketLabel(ticketLabel: string) {
	return requestJson(`/transactions/by-ticket/${encodeURIComponent(ticketLabel)}`, {
		method: "GET",
	});
}

export async function updateTicketCounter(facilityCode: string, lastSequence: number) {
	return requestJson(`/ticket-counters/${encodeURIComponent(facilityCode)}`, {
		method: "PATCH",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ lastSequence }),
	});
}

export async function reprintTransactionById(id: number) {
    return requestJson(`/transactions/${id}/reprint`, {
        method: "POST",
    });
}
