import { useMemo, useState } from "react";
import { facilities } from "../data/facilities";
import type { CategoryCode } from "../data/facilities";
import { KioskSelectionState } from "../types/kiosk";
import {
	completePaymentSession,
	getCurrentPaymentSession,
	insertPaymentAmount,
	startPaymentSession,
} from "../services/api";

const initialState: KioskSelectionState = {
	facilityCode: null,
	quantities: {},
};

type PaymentSessionView = {
	facilityName: string;
	amountDue: number;
	amountInserted: number;
	remainingAmount: number;
	totalUnits: number;
	status: string;
};

type CompletionResult = {
	ticketLabel: string;
	transactionId: string;
	amountDue: number;
	amountPaid: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
	if (!value || typeof value !== "object") {
		return null;
	}

	return value as Record<string, unknown>;
};

const getNumber = (record: Record<string, unknown>, keys: string[], fallback = 0) => {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "number" && Number.isFinite(value)) {
			return value;
		}
	}

	return fallback;
};

const getString = (record: Record<string, unknown>, keys: string[], fallback = "") => {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			return value;
		}
	}

	return fallback;
};

const extractDataRecord = (value: unknown) => {
	const topLevel = asRecord(value);
	if (!topLevel) {
		return null;
	}

	const nested = asRecord(topLevel.session) ?? asRecord(topLevel.data);
	return nested ?? topLevel;
};

export default function KioskStartPage() {
	const [selection, setSelection] = useState<KioskSelectionState>(initialState);
	const [session, setSession] = useState<PaymentSessionView | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [completedTransaction, setCompletedTransaction] = useState<CompletionResult | null>(null);
	const [isPaymentActionLoading, setIsPaymentActionLoading] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
	const [isInserting, setIsInserting] = useState<number | null>(null);
	const [isCompleting, setIsCompleting] = useState(false);

	const selectedFacility = useMemo(
		() => facilities.find((facility) => facility.code === selection.facilityCode) ?? null,
		[selection.facilityCode]
	);

	const totalUnits = useMemo(
		() => Object.values(selection.quantities).reduce((sum, qty) => sum + (qty ?? 0), 0),
		[selection.quantities]
	);

	const totalAmount = useMemo(() => {
		if (!selectedFacility) {
			return 0;
		}

		return selectedFacility.categories.reduce((sum, category) => {
			const qty = selection.quantities[category.code] ?? 0;
			return sum + qty * category.price;
		}, 0);
	}, [selectedFacility, selection.quantities]);

	const handleSelectFacility = (facilityCode: KioskSelectionState["facilityCode"]) => {
		setSelection({
			facilityCode,
			quantities: {},
		});
	};

	const handleChangeQuantity = (categoryCode: CategoryCode, delta: number) => {
		setSelection((prev) => {
			const currentQty = prev.quantities[categoryCode] ?? 0;
			const nextQty = Math.max(0, currentQty + delta);

			return {
				...prev,
				quantities: {
					...prev.quantities,
					[categoryCode]: nextQty,
				},
			};
		});
	};

	const handleClear = () => {
		setSelection((prev) => ({
			...prev,
			quantities: {},
		}));
	};

	const canProceed = Boolean(selection.facilityCode) && totalUnits > 0;
	const canComplete = session?.status.toLowerCase() === "paid";

	const formatCategoryLabel = (categoryCode: CategoryCode) =>
		categoryCode
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

	const mapSessionView = (
		payload: unknown,
		fallbackFacilityName: string,
		fallbackAmountDue: number,
		fallbackUnits: number
	): PaymentSessionView => {
		const record = extractDataRecord(payload);

		if (!record) {
			return {
				facilityName: fallbackFacilityName,
				amountDue: fallbackAmountDue,
				amountInserted: 0,
				remainingAmount: fallbackAmountDue,
				totalUnits: fallbackUnits,
				status: "pending",
			};
		}

		const amountDue = getNumber(record, ["amountDue", "amount_due", "totalAmount", "total_amount"], fallbackAmountDue);
		const amountInserted = getNumber(record, ["amountInserted", "amount_inserted", "insertedAmount", "inserted_amount"], 0);
		const remainingAmount = getNumber(
			record,
			["remainingAmount", "remaining_amount", "amountRemaining", "amount_remaining"],
			Math.max(0, amountDue - amountInserted)
		);

		return {
			facilityName: getString(record, ["facilityName", "facility_name", "facility"], fallbackFacilityName),
			amountDue,
			amountInserted,
			remainingAmount,
			totalUnits: getNumber(record, ["totalUnits", "total_units", "units"], fallbackUnits),
			status: getString(record, ["status"], "pending"),
		};
	};

	const handleStartSession = async () => {
		if (!selectedFacility || !canProceed) {
			return;
		}

		setIsStarting(true);
		setErrorMessage(null);
		setCompletedTransaction(null);

		try {
			const startPayload = {
				facilityCode: selectedFacility.code,
				quantities: selection.quantities,
			};

			const startResult = await startPaymentSession(startPayload);
			const currentResult = await getCurrentPaymentSession().catch(() => startResult);

			setSession(mapSessionView(currentResult, selectedFacility.name, totalAmount, totalUnits));
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to start payment session");
		} finally {
			setIsStarting(false);
		}
	};

	const refreshCurrentSession = async (fallbackSession: PaymentSessionView) => {
		const currentResult = await getCurrentPaymentSession();
		setSession(mapSessionView(currentResult, fallbackSession.facilityName, fallbackSession.amountDue, fallbackSession.totalUnits));
	};

	const handleInsertAmount = async (amount: number) => {
		if (!session) {
			return;
		}

		setIsPaymentActionLoading(true);
		setIsInserting(amount);
		setErrorMessage(null);

		try {
			await insertPaymentAmount(amount);
			await refreshCurrentSession(session);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to insert payment amount");
		} finally {
			setIsPaymentActionLoading(false);
			setIsInserting(null);
		}
	};

	const handleCompletePayment = async () => {
		if (!session || !canComplete) {
			return;
		}

		setIsPaymentActionLoading(true);
		setIsCompleting(true);
		setErrorMessage(null);

		try {
			const result = await completePaymentSession();
			const record = extractDataRecord(result);

			setCompletedTransaction({
				ticketLabel: record ? getString(record, ["ticketLabel", "ticket_label", "label"], "N/A") : "N/A",
				transactionId: record
					? getString(record, ["transactionId", "transaction_id", "id"], "N/A")
					: "N/A",
				amountDue: record ? getNumber(record, ["amountDue", "amount_due"], session.amountDue) : session.amountDue,
				amountPaid: record
					? getNumber(record, ["amountPaid", "amount_paid"], session.amountInserted)
					: session.amountInserted,
			});

			setSession(null);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to complete payment session");
		} finally {
			setIsPaymentActionLoading(false);
			setIsCompleting(false);
		}
	};

	const handleCancelSession = () => {
		setSession(null);
		setCompletedTransaction(null);
		setErrorMessage(null);
		setIsPaymentActionLoading(false);
	};

	const resetAll = () => {
		setSelection(initialState);
		setSession(null);
		setCompletedTransaction(null);
		setErrorMessage(null);
		setIsStarting(false);
		setIsInserting(null);
		setIsCompleting(false);
		setIsPaymentActionLoading(false);
	};

	const showNewTransactionButton = Boolean(
		completedTransaction || (session === null && (selection.facilityCode !== null || totalUnits > 0 || errorMessage !== null))
	);

	return (
		<div
			style={{
				maxWidth: "920px",
				margin: "0 auto",
				padding: "28px",
				display: "grid",
				gap: "18px",
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
				alignItems: "start",
			}}
		>
			<h1 style={{ margin: 0, textAlign: "center", fontSize: "28px" }}>CTU Kiosk Ticketing</h1>
			<p style={{ margin: 0, textAlign: "center", color: "#475569", fontSize: "14px" }}>Quickly purchase tickets — tap selections, insert test payments, then complete.</p>

			{/* Facility Selection */}
			<section style={{ borderRadius: 12, padding: 16, background: "#ffffff", boxShadow: "0 1px 3px rgba(2,6,23,0.06)", border: "1px solid #e6eef0" }}>
				<h2 style={{ margin: 0, fontSize: 18 }}>Facility</h2>
				<div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
					{facilities.map((facility) => {
						const isSelected = selection.facilityCode === facility.code;

						return (
							<button
								key={facility.code}
								type="button"
								onClick={() => handleSelectFacility(facility.code)}
								style={{
									padding: "18px",
									borderRadius: 12,
									border: isSelected ? "2px solid #0369a1" : "1px solid #cbd5e1",
									background: isSelected ? "#e0f2fe" : "#ffffff",
									cursor: "pointer",
									textAlign: "left",
									minHeight: 72,
									display: "flex",
									flexDirection: "column",
									justifyContent: "center",
								}}
							>
								<div style={{ fontWeight: 700, fontSize: 16 }}>{facility.name}</div>
								<div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>{facility.code}</div>
							</button>
						);
					})}
				</div>
			</section>

			{/* Categories */}
			<section style={{ borderRadius: 12, padding: 16, background: "#ffffff", boxShadow: "0 1px 3px rgba(2,6,23,0.06)", border: "1px solid #e6eef0" }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<h2 style={{ margin: 0, fontSize: 18 }}>Categories</h2>
					<button
						type="button"
						onClick={handleClear}
						disabled={!selectedFacility}
						style={{
							padding: "10px 14px",
							borderRadius: 10,
							border: "1px solid #cbd5e1",
							background: "#ffffff",
							cursor: selectedFacility ? "pointer" : "not-allowed",
							fontWeight: 600,
						}}
					>
						Clear
					</button>
				</div>

				{!selectedFacility ? (
					<p style={{ marginTop: 12, color: "#64748b" }}>Choose a facility to show available categories.</p>
				) : (
					<div style={{ marginTop: 12, display: "grid", gap: 12 }}>
						{selectedFacility.categories.map((category) => {
							const quantity = selection.quantities[category.code] ?? 0;

							return (
								<div
									key={category.code}
									style={{
										display: "flex",
										alignItems: "center",
										gap: 12,
										padding: 12,
										borderRadius: 12,
										border: "1px solid #eef2f7",
										background: "#fff",
									}}
								>
									<div style={{ flex: 1 }}>
										<div style={{ fontWeight: 700, fontSize: 16 }}>{formatCategoryLabel(category.code)}</div>
										<div style={{ fontSize: 13, color: "#64748b", marginTop: 6 }}>PHP {category.price.toFixed(2)} each</div>
									</div>

									<div style={{ display: "flex", gap: 10, alignItems: "center" }}>
										<button
											type="button"
											onClick={() => handleChangeQuantity(category.code, -1)}
											aria-label={`Decrease ${category.code}`}
											style={{
												width: 56,
												height: 56,
												borderRadius: 12,
												border: "1px solid #cbd5e1",
												background: "#fff",
												fontSize: 24,
												cursor: "pointer",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											−
										</button>

										<div style={{ minWidth: 52, textAlign: "center", fontWeight: 700, fontSize: 20 }}>{quantity}</div>

										<button
											type="button"
											onClick={() => handleChangeQuantity(category.code, 1)}
											aria-label={`Increase ${category.code}`}
											style={{
												width: 56,
												height: 56,
												borderRadius: 12,
												border: "1px solid #0369a1",
												background: "#0369a1",
												color: "#ffffff",
												fontSize: 22,
												cursor: "pointer",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											+
										</button>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</section>

			{/* Summary & Proceed */}
			<section style={{ borderRadius: 12, padding: 16, background: "#ffffff", boxShadow: "0 1px 3px rgba(2,6,23,0.06)", border: "1px solid #e6eef0", display: "flex", flexDirection: "column", gap: 12 }}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
					<div>
						<div style={{ fontSize: 12, color: "#64748b" }}>Total Units</div>
						<div style={{ fontWeight: 800, fontSize: 20 }}>{totalUnits}</div>
					</div>

					<div style={{ textAlign: "right" }}>
						<div style={{ fontSize: 12, color: "#64748b" }}>Total Amount</div>
						<div style={{ fontWeight: 900, fontSize: 24, color: "#0f766e" }}>PHP {totalAmount.toFixed(2)}</div>
					</div>
				</div>

				<div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 6 }}>
					<button
						type="button"
						onClick={handleStartSession}
						disabled={!canProceed}
						style={{
							padding: "16px 28px",
							borderRadius: 12,
							border: "none",
							background: canProceed ? "#0369a1" : "#cbd5e1",
							color: canProceed ? "#ffffff" : "#334155",
							cursor: canProceed ? "pointer" : "not-allowed",
							fontWeight: 800,
							fontSize: 16,
							minWidth: 220,
						}}
					>
						{isStarting ? "Starting..." : "Proceed"}
					</button>
				</div>
			</section>

			{errorMessage ? (
				<section style={{ borderRadius: 12, padding: 12, background: "#fff7f7", border: "1px solid #fecaca", color: "#991b1b" }}>
					{errorMessage}
				</section>
			) : null}

			{/* Payment Panel */}
			{session ? (
				<section style={{ borderRadius: 12, padding: 16, background: "#ffffff", boxShadow: "0 1px 3px rgba(2,6,23,0.06)", border: "1px solid #e6eef0" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<h2 style={{ margin: 0, fontSize: 18 }}>Payment</h2>
						<div style={{ display: "flex", gap: 8, alignItems: "center" }}>
							<div style={{ fontSize: 12, color: "#64748b" }}>{session.facilityName}</div>
							<div style={{ padding: "6px 10px", borderRadius: 999, background: session.status.toLowerCase() === "paid" ? "#dcfce7" : "#eef2ff", color: session.status.toLowerCase() === "paid" ? "#166534" : "#3730a3", fontWeight: 700, fontSize: 12 }}>{session.status.toUpperCase()}</div>
						</div>
					</div>

					<div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
						<div style={{ flex: 1, padding: 12, borderRadius: 10, background: "#fafafa", border: "1px solid #eef2f7" }}>
							<div style={{ fontSize: 12, color: "#64748b" }}>Amount Due</div>
							<div style={{ fontWeight: 900, fontSize: 28, color: "#0f766e" }}>PHP {session.amountDue.toFixed(2)}</div>
						</div>

						<div style={{ flex: 1, padding: 12, borderRadius: 10, background: "#fff7ed", border: "1px solid #ffedd5" }}>
							<div style={{ fontSize: 12, color: "#92400e" }}>Inserted</div>
							<div style={{ fontWeight: 900, fontSize: 28, color: "#b45309" }}>PHP {session.amountInserted.toFixed(2)}</div>
						</div>

						<div style={{ flex: 1, padding: 12, borderRadius: 10, background: "#fffaf0", border: "1px solid #fef3c7" }}>
							<div style={{ fontSize: 12, color: "#92400e" }}>Remaining</div>
							<div style={{ fontWeight: 900, fontSize: 28, color: "#b45309" }}>PHP {session.remainingAmount.toFixed(2)}</div>
						</div>
					</div>

					<div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
						{[10, 20, 50].map((amt) => (
							<button
								key={amt}
								type="button"
								onClick={() => handleInsertAmount(amt)}
								disabled={isPaymentActionLoading}
								style={{
									padding: "14px 18px",
									borderRadius: 12,
									border: "1px solid #cbd5e1",
									background: "#ffffff",
									cursor: isPaymentActionLoading ? "not-allowed" : "pointer",
									fontWeight: 800,
									minWidth: 140,
									fontSize: 16,
								}}
							>
								{isInserting === amt ? `Inserting ${amt}...` : `Insert ${amt}`}
							</button>
						))}
					</div>

					<div style={{ marginTop: 14, display: "flex", gap: 12 }}>
						<button
							type="button"
							onClick={handleCompletePayment}
							disabled={!canComplete || isPaymentActionLoading}
							style={{
								padding: "14px 20px",
								borderRadius: 12,
								border: "none",
								background: canComplete ? "#059669" : "#cbd5e1",
								color: canComplete ? "#ffffff" : "#334155",
								cursor: canComplete && !isPaymentActionLoading ? "pointer" : "not-allowed",
								fontWeight: 900,
								fontSize: 16,
								minWidth: 220,
							}}
						>
							{isCompleting ? "Completing..." : "Complete Payment"}
						</button>

						<button
							type="button"
							onClick={handleCancelSession}
							disabled={isPaymentActionLoading}
							style={{
								padding: "12px 16px",
								borderRadius: 12,
								border: "1px solid #cbd5e1",
								background: "#ffffff",
								cursor: isPaymentActionLoading ? "not-allowed" : "pointer",
								fontWeight: 700,
							}}
						>
							Cancel
						</button>
					</div>
				</section>
			) : null}

			{/* New Transaction button */}
			{showNewTransactionButton ? (
				<div style={{ display: "flex", justifyContent: "center" }}>
					<button
						type="button"
						onClick={resetAll}
						style={{
							padding: "14px 22px",
							borderRadius: 12,
							border: "none",
							background: "#0b63b2",
							color: "#fff",
							cursor: "pointer",
							fontWeight: 900,
							fontSize: 16,
							minWidth: 240,
						}}
					>
						New Transaction
					</button>
				</div>
			) : null}

			{/* Completed result */}
			{completedTransaction ? (
				<section style={{ borderRadius: 12, padding: 16, background: "#ecfdf5", border: "1px solid #bbf7d0", display: "grid", gap: 8 }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
						<div>
							<div style={{ fontSize: 12, color: "#065f46" }}>Payment Completed</div>
							<div style={{ fontWeight: 900, fontSize: 20, color: "#065f46" }}>{completedTransaction.ticketLabel}</div>
						</div>
						<div style={{ fontWeight: 800, fontSize: 14, color: "#065f46" }}>ID: {completedTransaction.transactionId}</div>
					</div>

					<div style={{ display: "flex", gap: 12 }}>
						<div style={{ flex: 1, padding: 12, borderRadius: 10, background: "#fff", border: "1px solid #e6eef0" }}>
							<div style={{ fontSize: 12, color: "#64748b" }}>Amount Due</div>
							<div style={{ fontWeight: 800, fontSize: 18 }}>PHP {completedTransaction.amountDue.toFixed(2)}</div>
						</div>
						<div style={{ flex: 1, padding: 12, borderRadius: 10, background: "#fff", border: "1px solid #e6eef0" }}>
							<div style={{ fontSize: 12, color: "#64748b" }}>Amount Paid</div>
							<div style={{ fontWeight: 800, fontSize: 18 }}>PHP {completedTransaction.amountPaid.toFixed(2)}</div>
						</div>
					</div>

					<div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
						<button
							type="button"
							onClick={resetAll}
							style={{ padding: "12px 16px", borderRadius: 12, border: "none", background: "#0369a1", color: "#fff", fontWeight: 800, minWidth: 220 }}
						>
							New Transaction
						</button>
					</div>
				</section>
			) : null}
		</div>
	);
}
