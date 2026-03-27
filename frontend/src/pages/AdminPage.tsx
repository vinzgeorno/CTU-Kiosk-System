import React, { useEffect, useState } from "react";
import {
	getRecentTransactions,
	getTicketCounters,
	getTransactionByTicketLabel,
	reprintTransactionById,
	updateTicketCounter,
} from "../services/api";
import type { RecentTransaction, TicketCounterRow } from "../types/admin";

const asRecord = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	return value as Record<string, unknown>;
};

const extractArray = <T,>(payload: unknown, keys: string[]): T[] => {
	if (Array.isArray(payload)) {
		return payload as T[];
	}

	const record = asRecord(payload);
	if (!record) {
		return [];
	}

	for (const key of keys) {
		const value = record[key];
		if (Array.isArray(value)) {
			return value as T[];
		}
	}

	return [];
};

const extractItem = <T,>(payload: unknown, keys: string[]): T | null => {
	const direct = asRecord(payload);
	if (direct && !Array.isArray(payload)) {
		for (const key of keys) {
			const value = direct[key];
			if (value && typeof value === "object" && !Array.isArray(value)) {
				return value as T;
			}
		}

		return direct as T;
	}

	return null;
};

export default function AdminPage() {
	const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
	const [ticketCounters, setTicketCounters] = useState<TicketCounterRow[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [loadError, setLoadError] = useState<string | null>(null);

	const [ticketLabel, setTicketLabel] = useState("");
	const [foundTransaction, setFoundTransaction] = useState<RecentTransaction | null>(null);
	const [isSearching, setIsSearching] = useState(false);
	const [searchError, setSearchError] = useState<string | null>(null);
	const [counterInputs, setCounterInputs] = useState<Record<string, string>>({});
	const [updatingCounters, setUpdatingCounters] = useState<Record<string, boolean>>({});
	const [counterMessage, setCounterMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
	const [reprintMessage, setReprintMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
	const [reprintingTransactions, setReprintingTransactions] = useState<Record<number, boolean>>({});

	const loadCounters = async () => {
		const countersResult = await getTicketCounters();
		const counters = extractArray<TicketCounterRow>(countersResult, ["data", "counters", "items"]);

		setTicketCounters(counters);
		setCounterInputs(
			counters.reduce<Record<string, string>>((acc, counter) => {
				acc[counter.facility_code] = String(counter.last_sequence);
				return acc;
			}, {})
		);
	};

	useEffect(() => {
		const loadData = async () => {
			setIsLoading(true);
			setLoadError(null);

			try {
				const [recentResult] = await Promise.all([
					getRecentTransactions(),
				]);

				setRecentTransactions(
					extractArray<RecentTransaction>(recentResult, ["data", "transactions", "items"])
				);
				await loadCounters();
			} catch (error) {
				setLoadError(error instanceof Error ? error.message : "Failed to load admin data.");
			} finally {
				setIsLoading(false);
			}
		};

		void loadData();
	}, []);

	const handleSearch = async () => {
		const trimmed = ticketLabel.trim();
		if (!trimmed) {
			return;
		}

		setIsSearching(true);
		setSearchError(null);
		setFoundTransaction(null);

		try {
			const result = await getTransactionByTicketLabel(trimmed);
			const transaction = extractItem<RecentTransaction>(result, ["data", "transaction", "item"]);

			if (!transaction) {
				setSearchError("Transaction not found.");
				return;
			}

			setFoundTransaction(transaction);
		} catch (error) {
			setSearchError(error instanceof Error ? error.message : "Transaction not found.");
		} finally {
			setIsSearching(false);
		}
	};

	const handleCounterInputChange = (facilityCode: string, value: string) => {
		setCounterInputs((prev) => ({
			...prev,
			[facilityCode]: value,
		}));
	};

	const handleUpdateCounter = async (counter: TicketCounterRow) => {
		const inputValue = counterInputs[counter.facility_code] ?? "";
		const parsedValue = Number(inputValue);

		if (!Number.isFinite(parsedValue) || parsedValue < 0 || !Number.isInteger(parsedValue)) {
			setCounterMessage({ type: "error", text: "Sequence must be a whole number greater than or equal to 0." });
			return;
		}

		setCounterMessage(null);
		setUpdatingCounters((prev) => ({
			...prev,
			[counter.facility_code]: true,
		}));

		try {
			await updateTicketCounter(counter.facility_code, parsedValue);
			await loadCounters();
			setCounterMessage({ type: "success", text: `Counter for ${counter.facility_code} updated successfully.` });
		} catch (error) {
			setCounterMessage({
				type: "error",
				text: error instanceof Error ? error.message : "Failed to update ticket counter.",
			});
		} finally {
			setUpdatingCounters((prev) => ({
				...prev,
				[counter.facility_code]: false,
			}));
		}
	};

	const handleReprint = async (transaction: RecentTransaction) => {
		setReprintMessage(null);
		setReprintingTransactions((prev) => ({
			...prev,
			[transaction.id]: true,
		}));

		try {
			await reprintTransactionById(transaction.id);
			setReprintMessage({
				type: "success",
				text: `Reprint successful for ticket ${transaction.ticket_label}.`,
			});
		} catch (error) {
			setReprintMessage({
				type: "error",
				text: error instanceof Error ? error.message : "Failed to reprint transaction.",
			});
		} finally {
			setReprintingTransactions((prev) => ({
				...prev,
				[transaction.id]: false,
			}));
		}
	};

	return (
		<div
			style={{
				maxWidth: 1100,
				margin: "0 auto",
				padding: 24,
				display: "grid",
				gap: 16,
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			}}
		>
			<header style={{ padding: 16, borderRadius: 12, background: "#ffffff", border: "1px solid #e2e8f0" }}>
				<h1 style={{ margin: 0, fontSize: 28 }}>CTU Kiosk Admin</h1>
			</header>

			<section style={{ padding: 16, borderRadius: 12, background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
				<h2 style={{ margin: 0, fontSize: 20 }}>Search By Ticket Label</h2>
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<input
						type="text"
						value={ticketLabel}
						onChange={(event) => setTicketLabel(event.target.value)}
						placeholder="Enter ticket label"
						style={{
							flex: "1 1 280px",
							padding: "10px 12px",
							borderRadius: 8,
							border: "1px solid #cbd5e1",
							fontSize: 14,
						}}
					/>
					<button
						type="button"
						onClick={handleSearch}
						disabled={isSearching}
						style={{
							padding: "10px 16px",
							borderRadius: 8,
							border: "none",
							background: "#0369a1",
							color: "#ffffff",
							fontWeight: 600,
							cursor: isSearching ? "not-allowed" : "pointer",
						}}
					>
						{isSearching ? "Searching..." : "Search"}
					</button>
				</div>

				{searchError ? (
					<div style={{ padding: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b" }}>
						{searchError}
					</div>
				) : null}

				{foundTransaction ? (
					<div style={{ padding: 12, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0", display: "grid", gap: 6 }}>
						<div><strong>ID:</strong> {foundTransaction.id}</div>
						<div><strong>Ticket:</strong> {foundTransaction.ticket_label}</div>
						<div><strong>Facility:</strong> {foundTransaction.facility_name} ({foundTransaction.facility_code})</div>
						<div><strong>Total Units:</strong> {foundTransaction.total_units}</div>
						<div><strong>Amount Due:</strong> PHP {Number(foundTransaction.amount_due).toFixed(2)}</div>
						<div><strong>Amount Paid:</strong> PHP {Number(foundTransaction.amount_paid).toFixed(2)}</div>
						<div><strong>Created At:</strong> {foundTransaction.created_at}</div>
						<div style={{ marginTop: 6 }}>
							<button
								type="button"
								onClick={() => handleReprint(foundTransaction)}
								disabled={Boolean(reprintingTransactions[foundTransaction.id])}
								style={{
									padding: "8px 12px",
									borderRadius: 8,
									border: "none",
									background: "#0f766e",
									color: "#ffffff",
									fontWeight: 600,
									cursor: reprintingTransactions[foundTransaction.id] ? "not-allowed" : "pointer",
								}}
							>
								{reprintingTransactions[foundTransaction.id] ? "Reprinting..." : "Reprint"}
							</button>
						</div>
					</div>
				) : null}
			</section>

			<section style={{ padding: 16, borderRadius: 12, background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
				<h2 style={{ margin: 0, fontSize: 20 }}>Recent Transactions</h2>

				{reprintMessage ? (
					<div
						style={{
							padding: 10,
							borderRadius: 8,
							border: reprintMessage.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
							background: reprintMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
							color: reprintMessage.type === "success" ? "#166534" : "#991b1b",
						}}
					>
						{reprintMessage.text}
					</div>
				) : null}

				{isLoading ? <p style={{ margin: 0 }}>Loading data...</p> : null}
				{loadError ? (
					<div style={{ padding: 10, borderRadius: 8, border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b" }}>
						{loadError}
					</div>
				) : null}

				{!isLoading && !loadError ? (
					<div style={{ overflowX: "auto" }}>
						<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
							<thead>
								<tr>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>ID</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Ticket</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Facility</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Units</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Due</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Paid</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Created At</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Action</th>
								</tr>
							</thead>
							<tbody>
								{recentTransactions.length === 0 ? (
									<tr>
										<td style={{ padding: "12px 8px" }} colSpan={8}>
											No recent transactions.
										</td>
									</tr>
								) : (
									recentTransactions.map((transaction) => (
										<tr key={transaction.id}>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.id}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.ticket_label}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.facility_name}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.total_units}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>PHP {Number(transaction.amount_due).toFixed(2)}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>PHP {Number(transaction.amount_paid).toFixed(2)}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.created_at}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
												<button
													type="button"
													onClick={() => handleReprint(transaction)}
													disabled={Boolean(reprintingTransactions[transaction.id])}
													style={{
														padding: "8px 12px",
														borderRadius: 8,
														border: "none",
														background: "#0f766e",
														color: "#ffffff",
														fontWeight: 600,
														cursor: reprintingTransactions[transaction.id] ? "not-allowed" : "pointer",
													}}
												>
													{reprintingTransactions[transaction.id] ? "Reprinting..." : "Reprint"}
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : null}
			</section>

			<section style={{ padding: 16, borderRadius: 12, background: "#ffffff", border: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
				<h2 style={{ margin: 0, fontSize: 20 }}>Ticket Counters</h2>

				{counterMessage ? (
					<div
						style={{
							padding: 10,
							borderRadius: 8,
							border: counterMessage.type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
							background: counterMessage.type === "success" ? "#f0fdf4" : "#fef2f2",
							color: counterMessage.type === "success" ? "#166534" : "#991b1b",
						}}
					>
						{counterMessage.text}
					</div>
				) : null}

				{!isLoading && !loadError ? (
					<div style={{ overflowX: "auto" }}>
						<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
							<thead>
								<tr>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Facility Code</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Last Sequence</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Updated At</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>New Sequence</th>
									<th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e2e8f0" }}>Action</th>
								</tr>
							</thead>
							<tbody>
								{ticketCounters.length === 0 ? (
									<tr>
										<td style={{ padding: "12px 8px" }} colSpan={5}>
											No ticket counters found.
										</td>
									</tr>
								) : (
									ticketCounters.map((counter) => (
										<tr key={counter.facility_code}>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{counter.facility_code}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{counter.last_sequence}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{counter.updated_at}</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
												<input
													type="number"
													min={0}
													step={1}
													value={counterInputs[counter.facility_code] ?? ""}
													onChange={(event) => handleCounterInputChange(counter.facility_code, event.target.value)}
													style={{
														width: 120,
														padding: "8px 10px",
														borderRadius: 8,
														border: "1px solid #cbd5e1",
													}}
												/>
											</td>
											<td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
												<button
													type="button"
													onClick={() => handleUpdateCounter(counter)}
													disabled={Boolean(updatingCounters[counter.facility_code])}
													style={{
														padding: "8px 12px",
														borderRadius: 8,
														border: "none",
														background: "#0369a1",
														color: "#ffffff",
														fontWeight: 600,
														cursor: updatingCounters[counter.facility_code] ? "not-allowed" : "pointer",
													}}
												>
													{updatingCounters[counter.facility_code] ? "Updating..." : "Update"}
												</button>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : null}
			</section>
		</div>
	);
}
