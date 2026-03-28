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

type KioskStep = "select" | "payment" | "success";

type PaymentSessionView = {
	facilityName: string;
	amountDue: number;
	amountInserted: number;
	totalUnits: number;
	status: string;
};

type SelectedBreakdownItem = {
	code: CategoryCode;
	label: string;
	quantity: number;
	unitPrice: number;
	subtotal: number;
};

type CompletionResult = {
	ticketLabel: string;
	transactionId: string;
	facilityName: string;
	totalUnits: number;
	amountDue: number;
	amountPaid: number;
	completedAt: string;
	breakdown: SelectedBreakdownItem[];
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

export default function KioskStartPage() {
	const [step, setStep] = useState<KioskStep>("select");
	const [selection, setSelection] = useState<KioskSelectionState>(initialState);
	const [session, setSession] = useState<PaymentSessionView | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [completedTransaction, setCompletedTransaction] = useState<CompletionResult | null>(null);
	const [isStarting, setIsStarting] = useState(false);
	const [isCompleting, setIsCompleting] = useState(false);
	const [loadingAnimationStep, setLoadingAnimationStep] = useState(0);
	const [hasTriggeredAutoComplete, setHasTriggeredAutoComplete] = useState(false);
	const [animatePaidState, setAnimatePaidState] = useState(false);
	const [isQrAvailable, setIsQrAvailable] = useState(true);

	const formatCategoryLabel = (categoryCode: CategoryCode) =>
		categoryCode
			.split("_")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(" ");

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

	const selectedBreakdown = useMemo<SelectedBreakdownItem[]>(() => {
		if (!selectedFacility) {
			return [];
		}

		return selectedFacility.categories
			.map((category) => {
				const quantity = selection.quantities[category.code] ?? 0;

				return {
					code: category.code,
					label: formatCategoryLabel(category.code),
					quantity,
					unitPrice: category.price,
					subtotal: quantity * category.price,
				};
			})
			.filter((item) => item.quantity > 0);
	}, [selectedFacility, selection.quantities]);

	const canProceed = Boolean(selection.facilityCode) && totalUnits > 0;
	const canComplete = session?.status === "paid";
	const remainingAmount = session ? Math.max(session.amountDue - session.amountInserted, 0) : 0;
	const isPaymentPaid = session?.status.toLowerCase() === "paid";
	const receiptQrSource = completedTransaction
		? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
				`${completedTransaction.ticketLabel}|${completedTransaction.transactionId}`
			)}`
		: "";

	const mapSessionView = (payload: unknown): PaymentSessionView | null => {
		const record = extractDataRecord(payload);

		if (!record) {
			return null;
		}

		return {
			facilityName: getString(record, ["facilityName", "facility_name", "facility"], ""),
			amountDue: getNumber(record, ["amountDue", "amount_due", "totalAmount", "total_amount"], 0),
			amountInserted: getNumber(record, ["amountInserted", "amount_inserted", "insertedAmount", "inserted_amount"], 0),
			totalUnits: getNumber(record, ["totalUnits", "total_units", "units"], 0),
			status: getString(record, ["status"], "pending"),
		};
	};

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

	const handleGoHome = () => {
		window.location.pathname = "/";
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
			const nextSession = mapSessionView(currentResult) ?? mapSessionView(startResult);

			if (!nextSession) {
				throw new Error("Payment session started but no session data was returned");
			}

			setSession(nextSession);
			setStep("payment");
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to start payment session");
		} finally {
			setIsStarting(false);
		}
	};

	const handleCompletePayment = async () => {
		if (!session || !canComplete) {
			return;
		}

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
				facilityName: session.facilityName || selectedFacility?.name || "Selected Facility",
				totalUnits: session.totalUnits,
				amountDue: record ? getNumber(record, ["amountDue", "amount_due"], session.amountDue) : session.amountDue,
				amountPaid: record
					? getNumber(record, ["amountPaid", "amount_paid"], session.amountInserted)
					: session.amountInserted,
				completedAt: new Date().toISOString(),
				breakdown: selectedBreakdown,
			});

			setSession(null);
			setStep("success");
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : "Failed to complete payment session");
		} finally {
			setIsCompleting(false);
		}
	};

	useEffect(() => {
		if (step !== "payment" || !session || isPaymentPaid) {
			setLoadingAnimationStep(0);
			return;
		}

		const intervalId = window.setInterval(() => {
			setLoadingAnimationStep((prev) => (prev + 1) % 3);
		}, 220);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [step, Boolean(session), isPaymentPaid]);

	useEffect(() => {
		if (!isPaymentPaid) {
			setAnimatePaidState(false);
			return;
		}

		const animationFrameId = window.requestAnimationFrame(() => {
			setAnimatePaidState(true);
		});

		return () => {
			window.cancelAnimationFrame(animationFrameId);
		};
	}, [isPaymentPaid]);

	useEffect(() => {
		if (step !== "payment" || !session || !isPaymentPaid) {
			setHasTriggeredAutoComplete(false);
			return;
		}

		if (hasTriggeredAutoComplete || isCompleting) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setHasTriggeredAutoComplete(true);
			void handleCompletePayment();
		}, 900);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [step, Boolean(session), isPaymentPaid, hasTriggeredAutoComplete, isCompleting]);

	useEffect(() => {
		if (step !== "payment" || !session) {
			return;
		}

		let isStopped = false;

		const pollCurrentSession = async () => {
			try {
				const currentResult = await getCurrentPaymentSession();

				if (isStopped) {
					return;
				}

				const nextSession = mapSessionView(currentResult);
				if (nextSession) {
					setSession(nextSession);
				}
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
	}, [step, Boolean(session)]);

	useEffect(() => {
		if (step !== "success") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			window.location.pathname = "/";
		}, 4000);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [step]);

	useEffect(() => {
		setIsQrAvailable(true);
	}, [completedTransaction?.ticketLabel, completedTransaction?.transactionId]);

	const renderHeader = step === "success" ? (
		<header
			style={{
				display: "grid",
				gridTemplateColumns: "1fr",
				alignItems: "center",
				gap: 8,
				flexShrink: 0,
			}}
		>
			<div style={{ textAlign: "center", minWidth: 0 }}>
				<h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05, color: "#0f172a", letterSpacing: 0.2 }}>
					CTU Kiosk Ticketing
				</h1>
				<div style={{ marginTop: 4, color: "#475569", fontSize: 12 }}>
					Payment complete. Returning to home screen...
				</div>
			</div>
		</header>
	) : (
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

			<div />
		</header>
	);

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
					"radial-gradient(860px 360px at -6% -12%, #e0f2fe 0%, #dbeafe 34%, #e2e8f0 100%)",
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
				{renderHeader}

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

				{step === "select" ? (
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

						<div
							style={{
								flex: "0 0 39%",
								minWidth: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								overflow: "hidden",
							}}
						>
							<section
								style={{
									width: "100%",
									maxHeight: "100%",
									borderRadius: 16,
									padding: 14,
									background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
									border: "1px solid #dbe7f0",
									boxShadow: "0 10px 22px rgba(15, 23, 42, 0.08)",
									display: "grid",
									gridTemplateRows: "auto auto 1fr auto",
									gap: 12,
									overflow: "hidden",
								}}
							>
								<div>
									<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 0.3 }}>
										Selected Facility
									</div>
									<div style={{ marginTop: 5, fontSize: 20, fontWeight: 900, color: "#0f172a", lineHeight: 1.15 }}>
										{selectedFacility?.name ?? "Choose a facility"}
									</div>
									<div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
										{selectedFacility?.code ?? "No facility selected yet"}
									</div>
								</div>

								<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
									<div style={{ padding: "12px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
										<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Total Units</div>
										<div style={{ marginTop: 3, fontWeight: 900, fontSize: 24, color: "#0f172a" }}>{totalUnits}</div>
									</div>
									<div style={{ padding: "12px 10px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
										<div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700 }}>Total Amount</div>
										<div style={{ marginTop: 3, fontWeight: 900, fontSize: 24, color: "#0369a1" }}>PHP {totalAmount.toFixed(2)}</div>
									</div>
								</div>

								<div style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 8, overflow: "hidden" }}>
									<div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>Category Breakdown</div>
									<div style={{ minHeight: 0, overflowY: "auto", display: "grid", gap: 8, paddingRight: 2 }}>
										{selectedBreakdown.length === 0 ? (
											<div
												style={{
													padding: 14,
													borderRadius: 12,
													border: "1px dashed #cbd5e1",
													background: "#f8fafc",
													color: "#64748b",
													fontSize: 13,
													lineHeight: 1.45,
												}}
											>
												Select one or more categories to see the ticket breakdown here.
											</div>
										) : (
											selectedBreakdown.map((item) => (
												<div
													key={item.code}
													style={{
														padding: "10px 11px",
														borderRadius: 12,
														border: "1px solid #dbe7f0",
														background: "#ffffff",
														display: "grid",
														gap: 4,
													}}
												>
													<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
														<div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{item.label}</div>
														<div style={{ fontWeight: 900, fontSize: 13, color: "#0f766e" }}>PHP {item.subtotal.toFixed(2)}</div>
													</div>
													<div style={{ fontSize: 12, color: "#475569" }}>
														{item.quantity} x PHP {item.unitPrice.toFixed(2)}
													</div>
												</div>
											))
										)}
									</div>
								</div>

								<button
									type="button"
									onClick={handleStartSession}
									disabled={!canProceed || isStarting}
									style={{
										height: 54,
										padding: "10px 14px",
										borderRadius: 12,
										border: "none",
										background: canProceed
											? "linear-gradient(145deg, #0ea5e9 0%, #0369a1 100%)"
											: "#cbd5e1",
										color: canProceed ? "#ffffff" : "#334155",
										cursor: canProceed && !isStarting ? "pointer" : "not-allowed",
										fontWeight: 800,
										fontSize: 17,
									}}
								>
									{isStarting ? "Starting..." : "Proceed"}
								</button>
							</section>
						</div>
					</div>
				) : null}

				{step === "payment" && session ? (
					<section
						style={{
							flex: 1,
							minHeight: 0,
							borderRadius: 16,
							padding: 16,
							background: "linear-gradient(150deg, #ffffff 0%, #f8fafc 100%)",
							border: "1px solid #dbe7f0",
							boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
							display: "grid",
							gridTemplateColumns: "minmax(300px, 0.9fr) minmax(340px, 1.1fr)",
							gap: 12,
							overflow: "hidden",
						}}
					>
						<div
							style={{
								borderRadius: 14,
								padding: 14,
								background: "linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)",
								border: "1px solid #dbe7f0",
								display: "grid",
								gridTemplateRows: "auto auto 1fr auto",
								gap: 12,
								overflow: "hidden",
							}}
						>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
								<div>
									<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Facility</div>
									<div style={{ marginTop: 4, fontWeight: 900, fontSize: 19, color: "#0f172a" }}>{session.facilityName || "Facility"}</div>
								</div>
								<div
									style={{
										padding: "6px 11px",
										borderRadius: 999,
										background: isPaymentPaid ? "#dcfce7" : "#eef2ff",
										color: isPaymentPaid ? "#166534" : "#3730a3",
										fontWeight: 900,
										fontSize: 12,
										letterSpacing: 0.4,
									}}
								>
									{session.status.toUpperCase()}
								</div>
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
								<div style={{ padding: "12px 10px", borderRadius: 12, background: "#eff6ff", border: "1px solid #bfdbfe" }}>
									<div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 700 }}>Amount Due</div>
									<div style={{ marginTop: 3, fontWeight: 900, fontSize: 22, color: "#0369a1" }}>PHP {session.amountDue.toFixed(2)}</div>
								</div>
								<div style={{ padding: "12px 10px", borderRadius: 12, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
									<div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>Total Units</div>
									<div style={{ marginTop: 3, fontWeight: 900, fontSize: 22, color: "#0f172a" }}>{session.totalUnits}</div>
								</div>
							</div>

							<div style={{ minHeight: 0, overflowY: "auto", display: "grid", gap: 8, paddingRight: 2 }}>
								{selectedBreakdown.map((item) => (
									<div
										key={item.code}
										style={{
											padding: "10px 11px",
											borderRadius: 12,
											border: "1px solid #dbe7f0",
											background: "#ffffff",
											display: "grid",
											gap: 4,
										}}
									>
										<div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
											<div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a" }}>{item.label}</div>
											<div style={{ fontWeight: 900, fontSize: 13, color: "#0f766e" }}>PHP {item.subtotal.toFixed(2)}</div>
										</div>
										<div style={{ fontSize: 12, color: "#475569" }}>
											{item.quantity} x PHP {item.unitPrice.toFixed(2)}
										</div>
									</div>
								))}
							</div>

							<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
								<div style={{ padding: "12px 10px", borderRadius: 12, background: "#fff7ed", border: "1px solid #ffedd5" }}>
									<div style={{ fontSize: 11, color: "#92400e", fontWeight: 700 }}>Amount Inserted</div>
									<div style={{ marginTop: 3, fontWeight: 900, fontSize: 22, color: "#b45309" }}>PHP {session.amountInserted.toFixed(2)}</div>
								</div>
								<div style={{ padding: "12px 10px", borderRadius: 12, background: "#fffaf0", border: "1px solid #fef3c7" }}>
									<div style={{ fontSize: 11, color: "#92400e", fontWeight: 700 }}>Remaining</div>
									<div style={{ marginTop: 3, fontWeight: 900, fontSize: 22, color: "#b45309" }}>PHP {remainingAmount.toFixed(2)}</div>
								</div>
							</div>
						</div>

						<div
							style={{
								borderRadius: 14,
								padding: 18,
								background: isPaymentPaid
									? "linear-gradient(150deg, #ecfdf5 0%, #f0fdf4 100%)"
									: "linear-gradient(150deg, #ffffff 0%, #eff6ff 100%)",
								border: isPaymentPaid ? "1px solid #bbf7d0" : "1px solid #dbeafe",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								minHeight: 0,
							}}
						>
							<div style={{ width: "100%", maxWidth: 430, display: "grid", gap: 16, textAlign: "center" }}>
								{isPaymentPaid ? (
									<>
										<div
											style={{
												width: 100,
												height: 100,
												margin: "0 auto",
												borderRadius: "50%",
												background: "#dcfce7",
												border: "2px solid #86efac",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												transform: animatePaidState ? "scale(1)" : "scale(0.72)",
												opacity: animatePaidState ? 1 : 0.4,
												transition: "all 220ms ease",
											}}
										>
											<div
												style={{
													fontSize: 48,
													fontWeight: 900,
													color: "#16a34a",
													lineHeight: 1,
													transform: animatePaidState ? "scale(1)" : "scale(0.5)",
													transition: "transform 240ms ease",
												}}
											>
												✓
											</div>
										</div>
										<div style={{ fontSize: 30, fontWeight: 900, color: "#166534", lineHeight: 1.05 }}>
											Payment Received
										</div>
										<div style={{ fontSize: 16, color: "#047857", fontWeight: 700 }}>
											Printing your ticket and preparing the receipt page...
										</div>
									</>
								) : (
									<>
										<div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", lineHeight: 1.05 }}>
											Enter Exact Payment
										</div>
										<div style={{ fontSize: 18, color: "#0369a1", fontWeight: 800 }}>
											PHP {remainingAmount.toFixed(2)} remaining
										</div>
										<div style={{ display: "flex", justifyContent: "center", gap: 10, alignItems: "center" }}>
											{[0, 1, 2].map((index) => (
												<div
													key={index}
													style={{
														width: 13,
														height: 13,
														borderRadius: "50%",
														background: "#0ea5e9",
														opacity: loadingAnimationStep === index ? 1 : 0.24,
														transform: loadingAnimationStep === index ? "scale(1.15)" : "scale(0.82)",
														transition: "all 160ms ease",
													}}
												/>
											))}
										</div>
										<div style={{ fontSize: 15, color: "#475569", lineHeight: 1.45 }}>
											Waiting for coin or bill acceptor input.
										</div>
									</>
								)}

								<button
									type="button"
									onClick={handleCompletePayment}
									disabled={!isPaymentPaid || isCompleting || !errorMessage}
									style={{
										height: 54,
										borderRadius: 12,
										border: "none",
										background:
											isPaymentPaid && errorMessage && !isCompleting
												? "linear-gradient(145deg, #10b981 0%, #059669 100%)"
												: "#cbd5e1",
										color: isPaymentPaid && errorMessage && !isCompleting ? "#ffffff" : "#334155",
										cursor: isPaymentPaid && errorMessage && !isCompleting ? "pointer" : "not-allowed",
										fontWeight: 900,
										fontSize: 17,
									}}
								>
									{isCompleting
										? "Preparing Ticket..."
										: isPaymentPaid
											? errorMessage
												? "Retry Ticket Completion"
												: "Preparing Ticket..."
											: "Waiting for Payment"}
								</button>
							</div>
						</div>
					</section>
				) : null}

				{step === "success" && completedTransaction ? (
					<section
						style={{
							flex: 1,
							minHeight: 0,
							borderRadius: 18,
							padding: 16,
							background: "linear-gradient(145deg, #f8fafc 0%, #eef2f7 100%)",
							border: "1px solid #dbe7f0",
							boxShadow: "0 12px 24px rgba(15, 23, 42, 0.08)",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							overflow: "hidden",
						}}
					>
						<div
							style={{
								width: "min(100%, 720px)",
								maxHeight: "100%",
								borderRadius: 18,
								padding: 18,
								background: "#fffef7",
								border: "1px solid #e5e7eb",
								boxShadow: "0 12px 26px rgba(15, 23, 42, 0.12)",
								display: "grid",
								gap: 14,
								position: "relative",
								fontFamily: "Courier New, monospace",
								overflow: "hidden",
							}}
						>
							<div
								style={{
									position: "absolute",
									left: -10,
									top: "46%",
									width: 20,
									height: 20,
									borderRadius: "50%",
									background: "#eef2f7",
									border: "1px solid #dbe7f0",
								}}
							/>
							<div
								style={{
									position: "absolute",
									right: -10,
									top: "46%",
									width: 20,
									height: 20,
									borderRadius: "50%",
									background: "#eef2f7",
									border: "1px solid #dbe7f0",
								}}
							/>

							<div style={{ textAlign: "center", display: "grid", gap: 5 }}>
								<div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", letterSpacing: 1.2 }}>CTU KIOSK TICKET</div>
								<div style={{ fontSize: 24, fontWeight: 900, color: "#111827", letterSpacing: 0.6 }}>
									{completedTransaction.ticketLabel}
								</div>
								<div style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>
									Payment received and ticket printed
								</div>
							</div>

							<div style={{ borderTop: "1px dashed #94a3b8" }} />

							<div style={{ display: "grid", gridTemplateColumns: "1.2fr 180px", gap: 16, alignItems: "start" }}>
								<div style={{ display: "grid", gap: 8 }}>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>FACILITY</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>{completedTransaction.facilityName}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>TRANSACTION ID</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>{completedTransaction.transactionId}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>TOTAL UNITS</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>{completedTransaction.totalUnits}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>AMOUNT DUE</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>PHP {completedTransaction.amountDue.toFixed(2)}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>AMOUNT PAID</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>PHP {completedTransaction.amountPaid.toFixed(2)}</span>
									</div>
									<div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
										<span style={{ color: "#64748b" }}>PRINTED AT</span>
										<span style={{ fontWeight: 800, color: "#111827", textAlign: "right" }}>{formatReportPeriod(completedTransaction.completedAt)}</span>
									</div>
								</div>

								<div
									style={{
										width: 180,
										padding: 10,
										borderRadius: 12,
										border: "1px solid #dbe7f0",
										background: "#ffffff",
										display: "grid",
										gap: 8,
										justifyItems: "center",
									}}
								>
									{isQrAvailable ? (
										<img
											src={receiptQrSource}
											alt="Ticket QR Code"
											onError={() => setIsQrAvailable(false)}
											style={{ width: 150, height: 150, objectFit: "contain", imageRendering: "pixelated" }}
										/>
									) : (
										<div
											style={{
												width: 150,
												height: 150,
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												borderRadius: 10,
												background: "#f8fafc",
												border: "1px dashed #cbd5e1",
												fontSize: 12,
												color: "#64748b",
												textAlign: "center",
											}}
										>
											QR unavailable
										</div>
									)}
									<div style={{ fontSize: 11, color: "#475569", textAlign: "center", lineHeight: 1.35 }}>
										Scan or present this ticket code
									</div>
								</div>
							</div>

							<div style={{ borderTop: "1px dashed #94a3b8" }} />

							<div style={{ display: "grid", gap: 7 }}>
								<div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a" }}>ITEM BREAKDOWN</div>
								{completedTransaction.breakdown.map((item) => (
									<div key={item.code} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#111827" }}>
										<span>{item.label} x{item.quantity}</span>
										<span style={{ fontWeight: 800 }}>PHP {item.subtotal.toFixed(2)}</span>
									</div>
								))}
							</div>

							<div style={{ borderTop: "1px dashed #94a3b8" }} />

							<div style={{ textAlign: "center", fontSize: 12, color: "#334155", lineHeight: 1.45, fontWeight: 700 }}>
								Keep this ticket with you. Returning to home in 4 seconds...
							</div>
						</div>
					</section>
				) : null}
			</div>
		</div>
	);
}
