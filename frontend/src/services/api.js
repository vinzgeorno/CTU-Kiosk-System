import { API_BASE_URL } from "../config";
async function requestJson(path, init) {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}${path}`, init);
    }
    catch {
        throw new Error(`Unable to reach backend at ${API_BASE_URL}`);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data && typeof data.message === "string" ? data.message : "Request failed";
        throw new Error(message);
    }
    return data;
}
export async function startPaymentSession(payload) {
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
        cache: "no-store",
    });
}
export async function insertPaymentAmount(amount) {
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
export async function getRecentTransactions(limit) {
    const query = typeof limit === "number" ? `?limit=${limit}` : "";
    return requestJson(`/transactions/recent${query}`, {
        method: "GET",
    });
}
export async function getAllTransactions(page, limit) {
    const params = new URLSearchParams();
    if (typeof page === "number")
        params.append("page", page.toString());
    if (typeof limit === "number")
        params.append("limit", limit.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return requestJson(`/transactions/all${query}`, {
        method: "GET",
    });
}
export async function getTicketCounters() {
    return requestJson("/ticket-counters", {
        method: "GET",
    });
}
export async function getTransactionByTicketLabel(ticketLabel) {
    return requestJson(`/transactions/by-ticket/${encodeURIComponent(ticketLabel)}`, {
        method: "GET",
    });
}
export async function updateTicketCounter(facilityCode, lastSequence) {
    return requestJson(`/ticket-counters/${encodeURIComponent(facilityCode)}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ lastSequence }),
    });
}
export async function reprintTransactionById(id) {
    return requestJson(`/transactions/${id}/reprint`, {
        method: "POST",
    });
}
export async function getTransactionStats() {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}/transactions/stats`, {
            method: "GET",
        });
    }
    catch {
        throw new Error(`Unable to reach backend at ${API_BASE_URL}`);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data && typeof data.message === "string" ? data.message : "Request failed";
        throw new Error(message);
    }
    return data;
}
export async function getFacilitySummaryReport(startAt, endAt) {
    const query = `?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`;
    return requestJson(`/reports/facility-summary${query}`, {
        method: "GET",
    });
}
export async function printFacilitySummaryReport(payload) {
    return requestJson("/reports/facility-summary/print", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}
