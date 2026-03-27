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
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
				padding: "12px",
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				gap: "10px",
				background: "#f5f8fb",
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			}}
		>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
				<div>
					<h1 style={{ margin: 0, fontSize: "24px", lineHeight: 1.1 }}>CTU Kiosk Ticketing</h1>
					<div style={{ marginTop: 2, color: "#475569", fontSize: "13px" }}>Tap selections, insert payment, and complete.</div>
				</div>
				{showNewTransactionButton ? (
					<button
						type="button"
						onClick={resetAll}
						style={{
							padding: "12px 18px",
							borderRadius: 10,
							border: "none",
							background: "#0b63b2",
							color: "#fff",
							cursor: "pointer",
							fontWeight: 800,
							fontSize: 15,
							minWidth: 190,
							height: 48,
						}}
					>
						New Transaction
					</button>
				) : null}
			</div>

			{errorMessage ? (
				<section
					style={{
						borderRadius: 10,
						padding: "9px 12px",
						background: "#fff7f7",
						border: "1px solid #fecaca",
						color: "#991b1b",
						fontSize: 13,
						flexShrink: 0,
					}}
				>
					{errorMessage}
				</section>
			) : null}

			<div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10, overflow: "hidden" }}>
				<div style={{ flex: "0 0 58%", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
					<section
						style={{
							borderRadius: 12,
							padding: 12,
							background: "#ffffff",
							border: "1px solid #e6eef0",
							flexShrink: 0,
						}}
					>
						<h2 style={{ margin: 0, fontSize: 16 }}>Facility</h2>
						<div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
							{facilities.map((facility) => {
								const isSelected = selection.facilityCode === facility.code;

								return (
									<button
										key={facility.code}
										type="button"
										onClick={() => handleSelectFacility(facility.code)}
										style={{
											padding: "12px",
											borderRadius: 10,
											border: isSelected ? "2px solid #0369a1" : "1px solid #cbd5e1",
											background: isSelected ? "#e0f2fe" : "#ffffff",
											cursor: "pointer",
											textAlign: "left",
											height: 74,
											display: "flex",
											flexDirection: "column",
											justifyContent: "center",
										}}
									>
										<div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>{facility.name}</div>
										<div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>{facility.code}</div>
									</button>
								);
							})}
						</div>
					</section>

					<section
						style={{
							borderRadius: 12,
							padding: 12,
							background: "#ffffff",
							border: "1px solid #e6eef0",
							flex: 1,
							minHeight: 0,
							overflow: "hidden",
							display: "flex",
							flexDirection: "column",
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
							<h2 style={{ margin: 0, fontSize: 16 }}>Categories</h2>
							<button
								type="button"
								onClick={handleClear}
								disabled={!selectedFacility}
								style={{
									padding: "8px 12px",
									borderRadius: 8,
									border: "1px solid #cbd5e1",
									background: "#ffffff",
									cursor: selectedFacility ? "pointer" : "not-allowed",
									fontWeight: 700,
									fontSize: 13,
									height: 36,
								}}
							>
								Clear
							</button>
						</div>

						{!selectedFacility ? (
							<div style={{ marginTop: 10, color: "#64748b", fontSize: 13 }}>Choose a facility to show categories.</div>
						) : (
							<div style={{ marginTop: 8, display: "grid", gap: 8, flex: 1, minHeight: 0 }}>
								{selectedFacility.categories.map((category) => {
									const quantity = selection.quantities[category.code] ?? 0;

									return (
										<div
											key={category.code}
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												padding: "8px 10px",
												borderRadius: 10,
												border: "1px solid #eef2f7",
												background: "#fff",
												minHeight: 62,
											}}
										>
											<div style={{ flex: 1, minWidth: 0 }}>
												<div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{formatCategoryLabel(category.code)}</div>
												<div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>PHP {category.price.toFixed(2)} each</div>
											</div>

											<div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
												<button
													type="button"
													onClick={() => handleChangeQuantity(category.code, -1)}
													aria-label={`Decrease ${category.code}`}
													style={{
														width: 44,
														height: 44,
														borderRadius: 10,
														border: "1px solid #cbd5e1",
														background: "#fff",
														fontSize: 24,
														cursor: "pointer",
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														lineHeight: 1,
													}}
												>
													−
												</button>

												<div style={{ minWidth: 36, textAlign: "center", fontWeight: 800, fontSize: 20 }}>{quantity}</div>

												<button
													type="button"
													onClick={() => handleChangeQuantity(category.code, 1)}
													aria-label={`Increase ${category.code}`}
													style={{
														width: 44,
														height: 44,
														borderRadius: 10,
														border: "1px solid #0369a1",
														background: "#0369a1",
														color: "#ffffff",
														fontSize: 22,
														cursor: "pointer",
														display: "flex",
														alignItems: "center",
														justifyContent: "center",
														lineHeight: 1,
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
				</div>

				<div style={{ flex: "0 0 42%", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
					<section
						style={{
							borderRadius: 12,
							padding: 12,
							background: "#ffffff",
							border: "1px solid #e6eef0",
							display: "grid",
							gap: 10,
							flexShrink: 0,
						}}
					>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
							<div>
								<div style={{ fontSize: 11, color: "#64748b" }}>Total Units</div>
								<div style={{ fontWeight: 800, fontSize: 20 }}>{totalUnits}</div>
							</div>
							<div style={{ textAlign: "right" }}>
								<div style={{ fontSize: 11, color: "#64748b" }}>Total Amount</div>
								<div style={{ fontWeight: 900, fontSize: 24, color: "#0f766e" }}>PHP {totalAmount.toFixed(2)}</div>
							</div>
						</div>

						<button
							type="button"
							onClick={handleStartSession}
							disabled={!canProceed}
							style={{
								height: 52,
								padding: "10px 14px",
								borderRadius: 10,
								border: "none",
								background: canProceed ? "#0369a1" : "#cbd5e1",
								color: canProceed ? "#ffffff" : "#334155",
								cursor: canProceed ? "pointer" : "not-allowed",
								fontWeight: 800,
								fontSize: 17,
							}}
						>
							{isStarting ? "Starting..." : "Proceed"}
						</button>
					</section>

					{completedTransaction ? (
						<section
							style={{
								borderRadius: 12,
								padding: 12,
								background: "#ecfdf5",
								border: "1px solid #bbf7d0",
								display: "grid",
								gap: 8,
								flex: 1,
								minHeight: 0,
							}}
						>
							<div style={{ fontSize: 12, color: "#065f46", fontWeight: 700 }}>Payment Completed</div>
							<div style={{ fontWeight: 900, fontSize: 20, color: "#065f46", lineHeight: 1.1 }}>{completedTransaction.ticketLabel}</div>
							<div style={{ fontWeight: 700, fontSize: 13, color: "#065f46" }}>ID: {completedTransaction.transactionId}</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 2 }}>
								<div style={{ padding: 10, borderRadius: 8, background: "#fff", border: "1px solid #e6eef0" }}>
									<div style={{ fontSize: 11, color: "#64748b" }}>Amount Due</div>
									<div style={{ fontWeight: 800, fontSize: 17 }}>PHP {completedTransaction.amountDue.toFixed(2)}</div>
								</div>
								<div style={{ padding: 10, borderRadius: 8, background: "#fff", border: "1px solid #e6eef0" }}>
									<div style={{ fontSize: 11, color: "#64748b" }}>Amount Paid</div>
									<div style={{ fontWeight: 800, fontSize: 17 }}>PHP {completedTransaction.amountPaid.toFixed(2)}</div>
								</div>
							</div>
						</section>
					) : session ? (
						<section
							style={{
								borderRadius: 12,
								padding: 12,
								background: "#ffffff",
								border: "1px solid #e6eef0",
								display: "grid",
								gap: 8,
								flex: 1,
								minHeight: 0,
								overflow: "hidden",
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
								<h2 style={{ margin: 0, fontSize: 16 }}>Payment</h2>
								<div style={{ display: "flex", gap: 6, alignItems: "center" }}>
									<div style={{ fontSize: 11, color: "#64748b", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.facilityName}</div>
									<div
										style={{
											padding: "4px 8px",
											borderRadius: 999,
											background: session.status.toLowerCase() === "paid" ? "#dcfce7" : "#eef2ff",
											color: session.status.toLowerCase() === "paid" ? "#166534" : "#3730a3",
											fontWeight: 700,
											fontSize: 11,
										}}
									>
										{session.status.toUpperCase()}
									</div>
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
								<div style={{ padding: "8px 7px", borderRadius: 8, background: "#fafafa", border: "1px solid #eef2f7" }}>
									<div style={{ fontSize: 10, color: "#64748b" }}>Due</div>
									<div style={{ fontWeight: 900, fontSize: 16, color: "#0f766e" }}>PHP {session.amountDue.toFixed(2)}</div>
								</div>
								<div style={{ padding: "8px 7px", borderRadius: 8, background: "#fff7ed", border: "1px solid #ffedd5" }}>
									<div style={{ fontSize: 10, color: "#92400e" }}>Inserted</div>
									<div style={{ fontWeight: 900, fontSize: 16, color: "#b45309" }}>PHP {session.amountInserted.toFixed(2)}</div>
								</div>
								<div style={{ padding: "8px 7px", borderRadius: 8, background: "#fffaf0", border: "1px solid #fef3c7" }}>
									<div style={{ fontSize: 10, color: "#92400e" }}>Remaining</div>
									<div style={{ fontWeight: 900, fontSize: 16, color: "#b45309" }}>PHP {session.remainingAmount.toFixed(2)}</div>
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
								{[10, 20, 50].map((amt) => (
									<button
										key={amt}
										type="button"
										onClick={() => handleInsertAmount(amt)}
										disabled={isPaymentActionLoading}
										style={{
											height: 46,
											borderRadius: 10,
											border: "1px solid #cbd5e1",
											background: "#ffffff",
											cursor: isPaymentActionLoading ? "not-allowed" : "pointer",
											fontWeight: 800,
											fontSize: 15,
										}}
									>
										{isInserting === amt ? `Inserting ${amt}...` : `Insert ${amt}`}
									</button>
								))}
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
								<button
									type="button"
									onClick={handleCompletePayment}
									disabled={!canComplete || isPaymentActionLoading}
									style={{
										height: 50,
										borderRadius: 10,
										border: "none",
										background: canComplete ? "#059669" : "#cbd5e1",
										color: canComplete ? "#ffffff" : "#334155",
										cursor: canComplete && !isPaymentActionLoading ? "pointer" : "not-allowed",
										fontWeight: 900,
										fontSize: 16,
									}}
								>
									{isCompleting ? "Completing..." : "Complete Payment"}
								</button>

								<button
									type="button"
									onClick={handleCancelSession}
									disabled={isPaymentActionLoading}
									style={{
										height: 50,
										borderRadius: 10,
										border: "1px solid #cbd5e1",
										background: "#ffffff",
										cursor: isPaymentActionLoading ? "not-allowed" : "pointer",
										fontWeight: 700,
										fontSize: 14,
									}}
								>
									Cancel
								</button>
							</div>
						</section>
					) : (
						<section
							style={{
								borderRadius: 12,
								padding: 12,
								background: "#ffffff",
								border: "1px dashed #cbd5e1",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#64748b",
								fontSize: 13,
								flex: 1,
								minHeight: 0,
							}}
						>
							Payment panel will appear after pressing Proceed.
						</section>
					)}
				</div>
			</div>
		</div>
	);
}
