import React, { useEffect, useState } from "react";
import { facilities } from "../data/facilities";
import {
	getRecentTransactions,
	getTicketCounters,
	getTransactionByTicketLabel,
	reprintTransactionById,
	updateTicketCounter,
	getTransactionStats,
	getFacilitySummaryReport,
	printFacilitySummaryReport,
} from "../services/api";
import type {
	RecentTransaction,
	TicketCounterRow,
	TransactionStats,
	FacilitySummaryReportRow,
} from "../types/admin";

type AdminTab = "dashboard" | "transactions" | "counters" | "search" | "reports";

const defaultStats: TransactionStats = {
	totalTransactions: 0,
	totalAmount: 0,
	totalUnits: 0,
	averageDurationMs: 0,
	fastestDurationMs: 0,
	slowestDurationMs: 0,
};

const tabs: Array<{ id: AdminTab; label: string }> = [
	{ id: "dashboard", label: "Dashboard" },
	{ id: "transactions", label: "Transactions" },
	{ id: "counters", label: "Counters" },
	{ id: "search", label: "Search / Reprint" },
	{ id: "reports", label: "Reports" },
];

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

const formatCurrency = (value: number) => `PHP ${Number(value).toFixed(2)}`;

const formatDuration = (value: number) => {
	if (!Number.isFinite(value) || value <= 0) {
		return "0s";
	}

	const totalSeconds = Math.round(value / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = Math.round(value % 1000);

	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}

	if (totalSeconds > 0) {
		return `${totalSeconds}s`;
	}

	return `${milliseconds}ms`;
};

const createDefaultReportWindow = () => {
	const start = new Date();
	start.setHours(9, 0, 0, 0);

	const end = new Date(start);
	end.setDate(end.getDate() + 1);

	return {
		start,
		end,
		startAt: start.toISOString(),
		endAt: end.toISOString(),
	};
};

const formatReportPeriod = (value: string | null) => {
	if (!value) {
		return "-";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString([], {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
};

const panelStyle: React.CSSProperties = {
	padding: 20,
	borderRadius: 18,
	background: "#ffffff",
	border: "1px solid #dbe4ee",
	boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
};

const messageStyle = (type: "success" | "error"): React.CSSProperties => ({
	padding: 12,
	borderRadius: 10,
	border: type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
	background: type === "success" ? "#f0fdf4" : "#fef2f2",
	color: type === "success" ? "#166534" : "#991b1b",
	fontSize: 14,
});

const emptyStateStyle: React.CSSProperties = {
	padding: 18,
	borderRadius: 14,
	border: "1px dashed #cbd5e1",
	background: "#f8fafc",
	color: "#64748b",
	fontSize: 14,
	lineHeight: 1.5,
};

type DisplayTicketCounterRow = TicketCounterRow & {
	facility_name: string;
	ticket_preview: string;
};

const buildTicketPreview = (facilityCode: string, lastSequence: number) => {
	const monthCode = String(new Date().getMonth() + 1).padStart(2, "0");
	const nextSequence = String(Math.max(lastSequence, 0) + 1).padStart(4, "0");

	return `${facilityCode}-${monthCode}-${nextSequence}`;
};

const mergeCounterRows = (backendCounters: TicketCounterRow[]): DisplayTicketCounterRow[] => {
	const backendCounterMap = new Map(
		backendCounters.map((counter) => [counter.facility_code, counter])
	);

	return facilities.map((facility) => {
		const backendCounter = backendCounterMap.get(facility.code);
		const lastSequence = backendCounter?.last_sequence ?? 0;
		const updatedAt = backendCounter?.updated_at ?? "-";

		return {
			facility_code: facility.code,
			facility_name: facility.name,
			last_sequence: lastSequence,
			updated_at: updatedAt,
			ticket_preview: buildTicketPreview(facility.code, lastSequence),
		};
	});
};

export default function AdminPage() {
	const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
	const [recentTransactions, setRecentTransactions] = useState<RecentTransaction[]>([]);
	const [ticketCounters, setTicketCounters] = useState<DisplayTicketCounterRow[]>([]);
	const [transactionStats, setTransactionStats] = useState<TransactionStats>(defaultStats);
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
	const [facilitySummaryRows, setFacilitySummaryRows] = useState<FacilitySummaryReportRow[]>([]);
	const [isLoadingFacilityReport, setIsLoadingFacilityReport] = useState(false);
	const [facilityReportError, setFacilityReportError] = useState<string | null>(null);
	const [facilityReportPrintMessage, setFacilityReportPrintMessage] = useState<{
		type: "success" | "error";
		text: string;
	} | null>(null);
	const [isPrintingFacilityReport, setIsPrintingFacilityReport] = useState(false);
	const [facilityReportPeriod, setFacilityReportPeriod] = useState<{ startAt: string | null; endAt: string | null }>({
		startAt: null,
		endAt: null,
	});

	const loadCounters = async () => {
		const countersResult = await getTicketCounters();
		const counters = extractArray<TicketCounterRow>(countersResult, ["data", "counters", "items"]);
		const mergedCounters = mergeCounterRows(counters);

		setTicketCounters(mergedCounters);
		setCounterInputs(
			mergedCounters.reduce<Record<string, string>>((acc, counter) => {
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
				const [recentResult, statsResult] = await Promise.all([
					getRecentTransactions(),
					getTransactionStats(),
				]);

				setRecentTransactions(
					extractArray<RecentTransaction>(recentResult, ["data", "transactions", "items"])
				);

				setTransactionStats(
					extractItem<TransactionStats>(statsResult, ["data", "stats", "item"]) ?? defaultStats
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
			setCounterMessage({
				type: "error",
				text: "Sequence must be a whole number greater than or equal to 0.",
			});
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
			setCounterMessage({
				type: "success",
				text: `Counter for ${counter.facility_code} updated successfully.`,
			});
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

	const handleLoadFacilityReport = async () => {
		const { startAt, endAt } = createDefaultReportWindow();

		setIsLoadingFacilityReport(true);
		setFacilityReportError(null);
		setFacilityReportPrintMessage(null);
		setFacilityReportPeriod({ startAt, endAt });

		try {
			const result = await getFacilitySummaryReport(startAt, endAt);
			setFacilitySummaryRows(
				extractArray<FacilitySummaryReportRow>(result, ["report", "data", "items"])
			);
		} catch (error) {
			setFacilitySummaryRows([]);
			setFacilityReportError(
				error instanceof Error ? error.message : "Failed to load facility summary report."
			);
		} finally {
			setIsLoadingFacilityReport(false);
		}
	};

	const handlePrintFacilityReport = async () => {
		if (!facilityReportPeriod.startAt || !facilityReportPeriod.endAt || facilitySummaryRows.length === 0) {
			return;
		}

		setIsPrintingFacilityReport(true);
		setFacilityReportPrintMessage(null);

		try {
			await printFacilitySummaryReport({
				reportTitle: "9AM-9AM Facility Summary",
				startAt: facilityReportPeriod.startAt,
				endAt: facilityReportPeriod.endAt,
				rows: facilitySummaryRows,
			});

			setFacilityReportPrintMessage({
				type: "success",
				text: "Facility summary report sent to the printer.",
			});
		} catch (error) {
			setFacilityReportPrintMessage({
				type: "error",
				text: error instanceof Error ? error.message : "Failed to print facility summary report.",
			});
		} finally {
			setIsPrintingFacilityReport(false);
		}
	};

	const renderDashboard = () => (
		<div style={{ display: "grid", gap: 14 }}>
			<div
				style={{
					...panelStyle,
					padding: 16,
					borderRadius: 16,
					background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
					color: "#ffffff",
				}}
			>
				<div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.75 }}>
					Operations Overview
				</div>
				<h2 style={{ margin: "8px 0 6px", fontSize: 24, lineHeight: 1.1 }}>Kiosk Admin Dashboard</h2>
				<p style={{ margin: 0, maxWidth: 680, lineHeight: 1.4, fontSize: 13, color: "rgba(255,255,255,0.84)" }}>
					Monitor transaction volume, payment speed, and ticketing activity from one place.
				</p>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
					gap: 12,
				}}
			>
				{[
					{ label: "Total Transactions", value: transactionStats.totalTransactions },
					{ label: "Total Amount", value: formatCurrency(transactionStats.totalAmount) },
					{ label: "Total Units", value: transactionStats.totalUnits },
					{ label: "Average Transaction Speed", value: formatDuration(transactionStats.averageDurationMs) },
					{ label: "Fastest Transaction", value: formatDuration(transactionStats.fastestDurationMs) },
					{ label: "Slowest Transaction", value: formatDuration(transactionStats.slowestDurationMs) },
				].map((card) => (
					<div
						key={card.label}
						style={{
							...panelStyle,
							padding: 14,
							borderRadius: 14,
							minHeight: 108,
							display: "grid",
							alignContent: "space-between",
							gap: 8,
						}}
					>
						<div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.35 }}>{card.label}</div>
						<div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: "#0f172a", wordBreak: "break-word" }}>
							{card.value}
						</div>
					</div>
				))}
			</div>
		</div>
	);

	const renderTransactions = () => (
		<section style={{ ...panelStyle, display: "grid", gap: 14 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Recent Transactions</h2>
					<p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
						Latest ticket activity and quick reprint access.
					</p>
				</div>
			</div>

			{reprintMessage ? <div style={messageStyle(reprintMessage.type)}>{reprintMessage.text}</div> : null}

			{isLoading ? <p style={{ margin: 0, color: "#475569" }}>Loading data...</p> : null}
			{loadError ? <div style={messageStyle("error")}>{loadError}</div> : null}

			{!isLoading && !loadError ? (
				<div style={{ overflowX: "auto" }}>
					<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 780 }}>
						<thead>
							<tr>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>ID</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Ticket</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Facility</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Units</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Due</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Paid</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Created At</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Action</th>
							</tr>
						</thead>
						<tbody>
							{recentTransactions.length === 0 ? (
								<tr>
									<td style={{ padding: "14px 8px", color: "#64748b" }} colSpan={8}>
										No recent transactions.
									</td>
								</tr>
							) : (
								recentTransactions.map((transaction) => (
									<tr key={transaction.id}>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.id}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>{transaction.ticket_label}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.facility_name}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.total_units}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{formatCurrency(transaction.amount_due)}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{formatCurrency(transaction.amount_paid)}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{transaction.created_at}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
											<button
												type="button"
												onClick={() => handleReprint(transaction)}
												disabled={Boolean(reprintingTransactions[transaction.id])}
												style={{
													padding: "8px 12px",
													borderRadius: 10,
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
	);

	const renderCounters = () => (
		<section style={{ ...panelStyle, display: "grid", gap: 14 }}>
			<div>
				<h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Ticket Counters</h2>
				<p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
					Review all facility counters, preview ticket formats, and update sequences when required.
				</p>
			</div>

			{counterMessage ? <div style={messageStyle(counterMessage.type)}>{counterMessage.text}</div> : null}
			{isLoading ? <p style={{ margin: 0, color: "#475569" }}>Loading counters...</p> : null}
			{loadError ? <div style={messageStyle("error")}>{loadError}</div> : null}

			{!isLoading && !loadError ? (
				<div style={{ overflowX: "auto" }}>
					<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 920 }}>
						<thead>
							<tr>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Facility Code</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Facility</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Ticket Preview</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Last Sequence</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Updated At</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>New Sequence</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }}>Action</th>
							</tr>
						</thead>
						<tbody>
							{ticketCounters.length === 0 ? (
								<tr>
									<td style={{ padding: "14px 8px", color: "#64748b" }} colSpan={7}>
										No ticket counters found.
									</td>
								</tr>
							) : (
								ticketCounters.map((counter) => (
									<tr key={counter.facility_code}>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>{counter.facility_code}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", color: "#334155" }}>{counter.facility_name}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
											<div
												style={{
													display: "inline-flex",
													alignItems: "center",
													padding: "6px 10px",
													borderRadius: 999,
													background: "#eff6ff",
													border: "1px solid #bfdbfe",
													color: "#1d4ed8",
													fontWeight: 700,
													fontSize: 13,
												}}
											>
												{counter.ticket_preview}
											</div>
										</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{counter.last_sequence}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{counter.updated_at}</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
											<input
												type="number"
												min={0}
												step={1}
												value={counterInputs[counter.facility_code] ?? ""}
												onChange={(event) => handleCounterInputChange(counter.facility_code, event.target.value)}
												style={{
													width: 140,
													padding: "8px 10px",
													borderRadius: 10,
													border: "1px solid #cbd5e1",
												}}
											/>
										</td>
										<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
											<button
												type="button"
												onClick={() => handleUpdateCounter(counter)}
												disabled={Boolean(updatingCounters[counter.facility_code])}
												style={{
													padding: "8px 12px",
													borderRadius: 10,
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
	);

	const renderSearchAndReprint = () => (
		<div style={{ display: "grid", gap: 18 }}>
			<section style={{ ...panelStyle, display: "grid", gap: 14 }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Search By Ticket Label</h2>
					<p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
						Find a transaction quickly and trigger a reprint from the result panel.
					</p>
				</div>

				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<input
						type="text"
						value={ticketLabel}
						onChange={(event) => setTicketLabel(event.target.value)}
						placeholder="Enter ticket label"
						style={{
							flex: "1 1 280px",
							padding: "11px 12px",
							borderRadius: 10,
							border: "1px solid #cbd5e1",
							fontSize: 14,
						}}
					/>
					<button
						type="button"
						onClick={handleSearch}
						disabled={isSearching}
						style={{
							padding: "11px 16px",
							borderRadius: 10,
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

				{searchError ? <div style={messageStyle("error")}>{searchError}</div> : null}
				{reprintMessage ? <div style={messageStyle(reprintMessage.type)}>{reprintMessage.text}</div> : null}

				{foundTransaction ? (
					<div
						style={{
							padding: 16,
							borderRadius: 14,
							background: "#f8fafc",
							border: "1px solid #e2e8f0",
							display: "grid",
							gap: 8,
						}}
					>
						<div><strong>ID:</strong> {foundTransaction.id}</div>
						<div><strong>Ticket:</strong> {foundTransaction.ticket_label}</div>
						<div><strong>Facility:</strong> {foundTransaction.facility_name} ({foundTransaction.facility_code})</div>
						<div><strong>Total Units:</strong> {foundTransaction.total_units}</div>
						<div><strong>Amount Due:</strong> {formatCurrency(foundTransaction.amount_due)}</div>
						<div><strong>Amount Paid:</strong> {formatCurrency(foundTransaction.amount_paid)}</div>
						<div><strong>Created At:</strong> {foundTransaction.created_at}</div>
						<div style={{ marginTop: 8 }}>
							<button
								type="button"
								onClick={() => handleReprint(foundTransaction)}
								disabled={Boolean(reprintingTransactions[foundTransaction.id])}
								style={{
									padding: "9px 14px",
									borderRadius: 10,
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

				{!foundTransaction && !searchError && !isSearching ? (
					<div style={emptyStateStyle}>
						Search for a ticket label to view transaction details and reprint controls.
					</div>
				) : null}
			</section>
		</div>
	);

	const renderReports = () => (
		<section style={{ ...panelStyle, display: "grid", gap: 14 }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
				<div>
					<h2 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>Reports</h2>
					<p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
						Load a 9AM-to-9AM facility summary for the current operating day.
					</p>
				</div>
				<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
					<button
						type="button"
						onClick={handleLoadFacilityReport}
						disabled={isLoadingFacilityReport}
						style={{
							padding: "10px 14px",
							borderRadius: 10,
							border: "none",
							background: "#1d4ed8",
							color: "#ffffff",
							fontWeight: 700,
							fontSize: 14,
							cursor: isLoadingFacilityReport ? "not-allowed" : "pointer",
						}}
					>
						{isLoadingFacilityReport ? "Loading Report..." : "Load 9AM-9AM Report"}
					</button>
					{facilitySummaryRows.length > 0 ? (
						<button
							type="button"
							onClick={handlePrintFacilityReport}
							disabled={isPrintingFacilityReport}
							style={{
								padding: "10px 14px",
								borderRadius: 10,
								border: "none",
								background: "#0f766e",
								color: "#ffffff",
								fontWeight: 700,
								fontSize: 14,
								cursor: isPrintingFacilityReport ? "not-allowed" : "pointer",
							}}
						>
							{isPrintingFacilityReport ? "Printing..." : "Print Report"}
						</button>
					) : null}
				</div>
			</div>

			<div
				style={{
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
					gap: 10,
					padding: 14,
					borderRadius: 12,
					background: "#f8fafc",
					border: "1px solid #e2e8f0",
				}}
			>
				<div>
					<div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Report Start</div>
					<div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
						{formatReportPeriod(facilityReportPeriod.startAt)}
					</div>
				</div>
				<div>
					<div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>Report End</div>
					<div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>
						{formatReportPeriod(facilityReportPeriod.endAt)}
					</div>
				</div>
			</div>

			{facilityReportError ? <div style={messageStyle("error")}>{facilityReportError}</div> : null}
			{facilityReportPrintMessage ? (
				<div style={messageStyle(facilityReportPrintMessage.type)}>{facilityReportPrintMessage.text}</div>
			) : null}

			{isLoadingFacilityReport ? (
				<div style={emptyStateStyle}>Loading facility summary report...</div>
			) : facilitySummaryRows.length === 0 ? (
				<div style={emptyStateStyle}>
					{facilityReportPeriod.startAt && facilityReportPeriod.endAt
						? "No facility summary rows found for the selected 9AM-to-9AM report window."
						: "Load the 9AM-to-9AM report to view facility ticket and transaction totals."}
				</div>
			) : (
				<div style={{ overflowX: "auto" }}>
					<table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
						<thead>
							<tr>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Facility</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>First Ticket</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Last Ticket</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Transactions</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Units</th>
								<th style={{ textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }}>Total Amount</th>
							</tr>
						</thead>
						<tbody>
							{facilitySummaryRows.map((row) => (
								<tr key={row.facility_code}>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
										<div style={{ fontWeight: 700, color: "#0f172a", fontSize: 14 }}>{row.facility_name}</div>
										<div style={{ color: "#64748b", fontSize: 12 }}>{row.facility_code}</div>
									</td>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>
										{row.first_ticket_label || "-"}
									</td>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>
										{row.last_ticket_label || "-"}
									</td>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{row.transaction_count}</td>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>{row.total_units}</td>
									<td style={{ padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 }}>
										{formatCurrency(row.total_amount)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);

	const renderActiveTab = () => {
		const tabContent: Record<AdminTab, React.ReactNode> = {
			dashboard: renderDashboard(),
			transactions: renderTransactions(),
			counters: renderCounters(),
			search: renderSearchAndReprint(),
			reports: renderReports(),
		};

		return tabContent[activeTab] ?? (
			<section style={{ ...panelStyle, minHeight: 240, display: "grid", alignItems: "center" }}>
				<div style={emptyStateStyle}>Select a tab to view admin content.</div>
			</section>
		);
	};

	return (
		<div
			style={{
				height: "100vh",
				padding: 24,
				background: "linear-gradient(180deg, #e2e8f0 0%, #f8fafc 28%, #f8fafc 100%)",
				overflowY: "auto",
				overflowX: "hidden",
				boxSizing: "border-box",
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			}}
		>
			<div style={{ maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18 }}>
				<header
					style={{
						...panelStyle,
						padding: 18,
						display: "grid",
						gap: 14,
						position: "sticky",
						top: 0,
						zIndex: 5,
					}}
				>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
						<div>
							<h1 style={{ margin: 0, fontSize: 30, color: "#0f172a" }}>CTU Kiosk Admin</h1>
							<p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>
								Operational tools for transactions, ticketing, and kiosk support.
							</p>
						</div>
					</div>

					<nav style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
						{tabs.map((tab) => {
							const isActive = tab.id === activeTab;

							return (
								<button
									key={tab.id}
									type="button"
									onClick={() => setActiveTab(tab.id)}
									style={{
										padding: "10px 14px",
										borderRadius: 999,
										border: isActive ? "1px solid #0f172a" : "1px solid #cbd5e1",
										background: isActive ? "#0f172a" : "#ffffff",
										color: isActive ? "#ffffff" : "#334155",
										fontWeight: 700,
										fontSize: 14,
										cursor: "pointer",
									}}
								>
									{tab.label}
								</button>
							);
						})}
					</nav>
				</header>

				{loadError && activeTab === "dashboard" ? <div style={messageStyle("error")}>{loadError}</div> : null}

				<main style={{ display: "grid", gap: 18, minHeight: 320 }}>{renderActiveTab()}</main>
			</div>
		</div>
	);
}
