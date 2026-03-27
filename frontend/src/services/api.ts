export const API_BASE_URL = "http://localhost:3000";

async function requestJson(path: string, init?: RequestInit) {
	const response = await fetch(`${API_BASE_URL}${path}`, init);
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
