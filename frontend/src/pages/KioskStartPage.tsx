import { useEffect, useMemo, useState } from "react";
import { facilities } from "../data/facilities";
import type { CategoryCode } from "../data/facilities";
import { KioskSelectionState } from "../types/kiosk";
import {
	completePaymentSession,
	getCurrentPaymentSession,
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

	if (Object.prototype.hasOwnProperty.call(topLevel, "session")) {
		return asRecord(topLevel.session);
	}

	if (Object.prototype.hasOwnProperty.call(topLevel, "data")) {
		return asRecord(topLevel.data);
	}

	return topLevel;
};

export default function KioskStartPage() {
	const [selection, setSelection] = useState<KioskSelectionState>(initialState);
	const [session, setSession] = useState<PaymentSessionView | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [completedTransaction, setCompletedTransaction] = useState<CompletionResult | null>(null);
	const [isPaymentActionLoading, setIsPaymentActionLoading] = useState(false);
	const [isStarting, setIsStarting] = useState(false);
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
	): PaymentSessionView | null => {
		const record = extractDataRecord(payload);

		if (!record) {
			return null;
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

	const createFallbackSessionView = (
		facilityName: string,
		amountDue: number,
		units: number
	): PaymentSessionView => ({
		facilityName,
		amountDue,
		amountInserted: 0,
		remainingAmount: amountDue,
		totalUnits: units,
		status: "pending",
	});

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
			const nextSession =
				mapSessionView(currentResult, selectedFacility.name, totalAmount, totalUnits) ??
				mapSessionView(startResult, selectedFacility.name, totalAmount, totalUnits) ??
				createFallbackSessionView(selectedFacility.name, totalAmount, totalUnits);

			setSession(nextSession);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to start payment session");
		} finally {
			setIsStarting(false);
		}
	};

	useEffect(() => {
		if (!session || completedTransaction) {
			return;
		}

		let isStopped = false;

		const pollCurrentSession = async () => {
			try {
				const currentResult = await getCurrentPaymentSession();

				if (isStopped) {
					return;
				}

				setSession((prev) => {
					if (!prev) {
						return prev;
					}

					return mapSessionView(
						currentResult,
						prev.facilityName,
						prev.amountDue,
						prev.totalUnits
					);
				});
			} catch {
				// Ignore transient polling failures and keep current UI state.
			}
		};

		const intervalId = window.setInterval(() => {
			void pollCurrentSession();
		}, 1000);

		return () => {
			isStopped = true;
			window.clearInterval(intervalId);
		};
	}, [Boolean(session), Boolean(completedTransaction)]);

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

	const handleGoHome = () => {
		window.location.pathname = "/";
	};

	return (
		<div
			style={{
				width: "100vw",
				height: "100vh",
				overflow: "hidden",
				margin: 0,
				padding: 0,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				background:
					"radial-gradient(1200px 500px at -10% -20%, #e0f2fe 0%, #dbeafe 38%, #e2e8f0 100%)",
				fontFamily: "Segoe UI, Tahoma, Geneva, Verdana, sans-serif",
			}}
		>
			<div
				style={{
					width: "min(100vw, 1024px)",
					height: "min(100vh, 600px)",
					boxSizing: "border-box",
					padding: 12,
					display: "flex",
					flexDirection: "column",
					gap: 10,
					overflow: "hidden",
					background: "linear-gradient(160deg, #ffffff 0%, #f8fafc 100%)",
					border: "1px solid #dbe7f0",
					borderRadius: 18,
					boxShadow: "0 18px 35px rgba(15, 23, 42, 0.14)",
				}}
			>
				<header
					style={{
						display: "grid",
						gridTemplateColumns: "150px 1fr 150px",
						alignItems: "center",
						gap: 8,
						flexShrink: 0,
					}}
				>
					<button
						type="button"
						onClick={handleGoHome}
						style={{
							height: 44,
							borderRadius: 12,
							border: "1px solid #93c5fd",
							background: "linear-gradient(145deg, #eff6ff 0%, #dbeafe 100%)",
							color: "#0f172a",
							fontWeight: 800,
							fontSize: 15,
							cursor: "pointer",
						}}
					>
						Home
					</button>

					<div style={{ textAlign: "center", minWidth: 0 }}>
						<h1 style={{ margin: 0, fontSize: 27, lineHeight: 1.05, color: "#0f172a", letterSpacing: 0.2 }}>
							CTU Kiosk Ticketing
						</h1>
						<div style={{ marginTop: 3, color: "#475569", fontSize: 12 }}>
							Select tickets, pay at the kiosk, then complete checkout
						</div>
					</div>

					<div style={{ textAlign: "right", color: "#64748b", fontSize: 12, fontWeight: 700 }}>Touch Ready</div>
				</header>

				{errorMessage ? (
					<section
						style={{
							borderRadius: 12,
							padding: "9px 12px",
							background: "linear-gradient(90deg, #fff1f2 0%, #fff7ed 100%)",
							border: "1px solid #fecaca",
							color: "#991b1b",
							fontSize: 13,
							fontWeight: 600,
							flexShrink: 0,
						}}
					>
						{errorMessage}
					</section>
				) : null}

				<div style={{ flex: 1, minHeight: 0, display: "flex", gap: 10, overflow: "hidden" }}>
					<div style={{ flex: "0 0 61%", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
						<section
							style={{
								borderRadius: 14,
								padding: 12,
								background: "linear-gradient(145deg, #ffffff 0%, #f8fbff 100%)",
								border: "1px solid #dbe7f0",
								boxShadow: "0 8px 18px rgba(15, 23, 42, 0.07)",
								flexShrink: 0,
							}}
						>
							<h2 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>Facility</h2>
							<div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
								{facilities.map((facility) => {
									const isSelected = selection.facilityCode === facility.code;

									return (
										<button
											key={facility.code}
											type="button"
											onClick={() => handleSelectFacility(facility.code)}
											style={{
												padding: "10px 12px",
												borderRadius: 12,
												border: isSelected ? "2px solid #0284c7" : "1px solid #cbd5e1",
												background: isSelected
													? "linear-gradient(145deg, #e0f2fe 0%, #dbeafe 100%)"
													: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
												boxShadow: isSelected ? "0 10px 18px rgba(2, 132, 199, 0.22)" : "none",
												cursor: "pointer",
												textAlign: "left",
												height: 72,
												display: "flex",
												flexDirection: "column",
												justifyContent: "center",
											}}
										>
											<div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2, color: "#0f172a" }}>{facility.name}</div>
											<div style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{facility.code}</div>
										</button>
									);
								})}
							</div>
						</section>

						<section
							style={{
								borderRadius: 14,
								padding: 12,
								background: "linear-gradient(150deg, #ffffff 0%, #f8fafc 100%)",
								border: "1px solid #dbe7f0",
								boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
								flex: 1,
								minHeight: 0,
								overflow: "hidden",
								display: "flex",
								flexDirection: "column",
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 8 }}>
								<h2 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>Categories</h2>
								<button
									type="button"
									onClick={handleClear}
									disabled={!selectedFacility}
									style={{
										padding: "8px 14px",
										borderRadius: 10,
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
								<div
									style={{
										marginTop: 8,
										display: "grid",
										gridTemplateColumns: selectedFacility.categories.length >= 3 ? "1fr 1fr" : "1fr",
										gap: 8,
										alignContent: "start",
										flex: 1,
										minHeight: 0,
										overflow: "hidden",
									}}
								>
									{selectedFacility.categories.map((category) => {
										const quantity = selection.quantities[category.code] ?? 0;

										return (
											<div
												key={category.code}
												style={{
													display: "flex",
													alignItems: "center",
													gap: 6,
													padding: "8px 9px",
													borderRadius: 12,
													border: "1px solid #dbe7f0",
													background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
													minHeight: 72,
													boxShadow: "0 6px 12px rgba(15, 23, 42, 0.06)",
												}}
											>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div
														style={{
															fontWeight: 800,
															fontSize: 14,
															lineHeight: 1.2,
															color: "#0f172a",
															whiteSpace: "nowrap",
															overflow: "hidden",
															textOverflow: "ellipsis",
														}}
													>
														{formatCategoryLabel(category.code)}
													</div>
													<div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>PHP {category.price.toFixed(2)} each</div>
												</div>

												<div style={{ display: "flex", gap: 7, alignItems: "center", flexShrink: 0 }}>
													<button
														type="button"
														onClick={() => handleChangeQuantity(category.code, -1)}
														aria-label={`Decrease ${category.code}`}
														style={{
															width: 40,
															height: 40,
															borderRadius: 10,
															border: "1px solid #cbd5e1",
															background: "#fff",
															fontSize: 22,
															cursor: "pointer",
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															lineHeight: 1,
														}}
													>
														-
													</button>

													<div style={{ minWidth: 28, textAlign: "center", fontWeight: 900, fontSize: 20, color: "#0f172a" }}>
														{quantity}
													</div>

													<button
														type="button"
														onClick={() => handleChangeQuantity(category.code, 1)}
														aria-label={`Increase ${category.code}`}
														style={{
															width: 40,
															height: 40,
															borderRadius: 10,
															border: "1px solid #0284c7",
															background: "linear-gradient(145deg, #0ea5e9 0%, #0284c7 100%)",
															color: "#ffffff",
															fontSize: 20,
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

					<div style={{ flex: "0 0 39%", minWidth: 0, display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
						<section
							style={{
								borderRadius: 14,
								padding: 12,
								background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
								border: "1px solid #dbe7f0",
								boxShadow: "0 8px 18px rgba(15, 23, 42, 0.07)",
								display: "grid",
								gap: 10,
								flexShrink: 0,
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
								<div>
									<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Total Units</div>
									<div style={{ fontWeight: 900, fontSize: 22, color: "#0f172a" }}>{totalUnits}</div>
								</div>
								<div style={{ textAlign: "right" }}>
									<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Total Amount</div>
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
									borderRadius: 12,
									border: "none",
									background: canProceed
										? "linear-gradient(145deg, #0ea5e9 0%, #0369a1 100%)"
										: "#cbd5e1",
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
									borderRadius: 14,
									padding: 12,
									background: "linear-gradient(145deg, #ecfdf5 0%, #f0fdf4 100%)",
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
									borderRadius: 14,
									padding: 12,
									background: "linear-gradient(150deg, #ffffff 0%, #f8fafc 100%)",
									border: "1px solid #dbe7f0",
									boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
									display: "grid",
									gap: 8,
									flex: 1,
									minHeight: 0,
									overflow: "hidden",
								}}
							>
								<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
									<h2 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>Payment</h2>
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

								<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
									<div style={{ padding: "8px 7px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
										<div style={{ fontSize: 10, color: "#64748b" }}>Due</div>
										<div style={{ fontWeight: 900, fontSize: 16, color: "#0f766e" }}>PHP {session.amountDue.toFixed(2)}</div>
									</div>
									<div style={{ padding: "8px 7px", borderRadius: 10, background: "#fff7ed", border: "1px solid #ffedd5" }}>
										<div style={{ fontSize: 10, color: "#92400e" }}>Inserted</div>
										<div style={{ fontWeight: 900, fontSize: 16, color: "#b45309" }}>PHP {session.amountInserted.toFixed(2)}</div>
									</div>
									<div style={{ padding: "8px 7px", borderRadius: 10, background: "#fffaf0", border: "1px solid #fef3c7" }}>
										<div style={{ fontSize: 10, color: "#92400e" }}>Remaining</div>
										<div style={{ fontWeight: 900, fontSize: 16, color: "#b45309" }}>PHP {session.remainingAmount.toFixed(2)}</div>
									</div>
									<div style={{ padding: "8px 7px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
										<div style={{ fontSize: 10, color: "#475569" }}>Total Units</div>
										<div style={{ fontWeight: 900, fontSize: 16, color: "#0f172a" }}>{session.totalUnits}</div>
									</div>
								</div>

								<div
									style={{
										padding: "10px 12px",
										borderRadius: 12,
										background: "#f8fafc",
										border: "1px solid #e2e8f0",
										display: "grid",
										gap: 4,
									}}
								>
									<div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Please insert exact amount</div>
									<div style={{ fontSize: 12, color: "#475569" }}>Waiting for coin or bill acceptor input</div>
								</div>

								<div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8 }}>
									<button
										type="button"
										onClick={handleCompletePayment}
										disabled={!canComplete || isPaymentActionLoading}
										style={{
											height: 50,
											borderRadius: 12,
											border: "none",
											background: canComplete
												? "linear-gradient(145deg, #10b981 0%, #059669 100%)"
												: "#cbd5e1",
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
											borderRadius: 12,
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
									borderRadius: 14,
									padding: 12,
									background: "linear-gradient(150deg, #ffffff 0%, #f8fafc 100%)",
									border: "1px dashed #cbd5e1",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: "#64748b",
									fontSize: 14,
									fontWeight: 600,
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
		</div>
	);
}
