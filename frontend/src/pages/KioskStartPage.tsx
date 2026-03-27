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
	const [isOfflineSession, setIsOfflineSession] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [completion, setCompletion] = useState<CompletionResult | null>(null);
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

	const isNetworkError = (error: unknown) =>
		error instanceof TypeError && error.message.toLowerCase().includes("fetch");

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
		setCompletion(null);

		try {
			const startPayload = {
				facilityCode: selectedFacility.code,
				quantities: selection.quantities,
			};

			const startResult = await startPaymentSession(startPayload);
			const currentResult = await getCurrentPaymentSession().catch(() => startResult);

			setSession(mapSessionView(currentResult, selectedFacility.name, totalAmount, totalUnits));
			setIsOfflineSession(false);
		} catch (error) {
			if (isNetworkError(error)) {
				setSession({
					facilityName: selectedFacility.name,
					amountDue: totalAmount,
					amountInserted: 0,
					remainingAmount: totalAmount,
					totalUnits,
					status: "pending",
				});
				setIsOfflineSession(true);
				setErrorMessage("Backend is unreachable. Running in temporary local test mode.");
			} else {
				setErrorMessage(error instanceof Error ? error.message : "Failed to start payment session");
			}
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

		setIsInserting(amount);
		setErrorMessage(null);

		try {
			await insertPaymentAmount(amount);
			await refreshCurrentSession(session);
			setIsOfflineSession(false);
		} catch (error) {
			if (isNetworkError(error)) {
				setSession((prev) => {
					if (!prev) {
						return prev;
					}

					const amountInserted = prev.amountInserted + amount;
					const remainingAmount = Math.max(0, prev.amountDue - amountInserted);

					return {
						...prev,
						amountInserted,
						remainingAmount,
						status: remainingAmount <= 0 ? "paid" : "pending",
					};
				});
				setIsOfflineSession(true);
				setErrorMessage("Backend is unreachable. Amount updated in local test mode.");
			} else {
				setErrorMessage(error instanceof Error ? error.message : "Failed to insert payment amount");
			}
		} finally {
			setIsInserting(null);
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

			setCompletion({
				ticketLabel: record ? getString(record, ["ticketLabel", "ticket_label", "label"], "N/A") : "N/A",
				transactionId: record
					? getString(record, ["transactionId", "transaction_id", "id"], "N/A")
					: "N/A",
			});

			await refreshCurrentSession(session);
			setIsOfflineSession(false);
		} catch (error) {
			if (isNetworkError(error) && isOfflineSession) {
				const localTransactionId = `LOCAL-${Date.now()}`;
				setCompletion({
					ticketLabel: "LOCAL TEST TICKET",
					transactionId: localTransactionId,
				});
				setSession((prev) => (prev ? { ...prev, status: "completed", remainingAmount: 0 } : prev));
				setErrorMessage("Backend is unreachable. Completion simulated in local test mode.");
			} else {
				setErrorMessage(error instanceof Error ? error.message : "Failed to complete payment session");
			}
		} finally {
			setIsCompleting(false);
		}
	};

	const handleCancelSession = () => {
		setSelection(initialState);
		setSession(null);
		setCompletion(null);
		setErrorMessage(null);
		setIsOfflineSession(false);
		setIsStarting(false);
		setIsInserting(null);
		setIsCompleting(false);
	};

	return (
		<div
			style={{
				maxWidth: "960px",
				margin: "0 auto",
				padding: "24px",
				display: "grid",
				gap: "20px",
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			}}
		>
			<h1 style={{ margin: 0 }}>CTU Kiosk</h1>

			<section>
				<h2 style={{ marginTop: 0 }}>Select Facility</h2>
				<div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
					{facilities.map((facility) => {
						const isSelected = selection.facilityCode === facility.code;

						return (
							<button
								key={facility.code}
								type="button"
								onClick={() => handleSelectFacility(facility.code)}
								style={{
									padding: "12px 16px",
									borderRadius: "8px",
									border: isSelected ? "2px solid #0f766e" : "1px solid #cbd5e1",
									background: isSelected ? "#ccfbf1" : "#ffffff",
									cursor: "pointer",
									minWidth: "180px",
									textAlign: "left",
								}}
							>
								<div style={{ fontWeight: 600 }}>{facility.name}</div>
								<div style={{ fontSize: "12px", opacity: 0.8 }}>{facility.code}</div>
							</button>
						);
					})}
				</div>
			</section>

			<section>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "12px",
					}}
				>
					<h2 style={{ margin: 0 }}>Categories</h2>
					<button
						type="button"
						onClick={handleClear}
						disabled={!selectedFacility}
						style={{
							padding: "8px 12px",
							borderRadius: "6px",
							border: "1px solid #cbd5e1",
							background: "#ffffff",
							cursor: selectedFacility ? "pointer" : "not-allowed",
						}}
					>
						Clear
					</button>
				</div>

				{!selectedFacility ? (
					<p style={{ margin: 0, color: "#64748b" }}>Please choose a facility to view categories.</p>
				) : (
					<div style={{ display: "grid", gap: "10px" }}>
						{selectedFacility.categories.map((category) => {
							const quantity = selection.quantities[category.code] ?? 0;

							return (
								<div
									key={category.code}
									style={{
										display: "grid",
										gridTemplateColumns: "1fr auto auto auto",
										alignItems: "center",
										gap: "10px",
										padding: "12px",
										border: "1px solid #e2e8f0",
										borderRadius: "8px",
									}}
								>
									<div>
										<div style={{ fontWeight: 600 }}>{formatCategoryLabel(category.code)}</div>
										<div style={{ fontSize: "14px", color: "#475569" }}>PHP {category.price.toFixed(2)}</div>
									</div>

									<button
										type="button"
										onClick={() => handleChangeQuantity(category.code, -1)}
										style={{
											width: "36px",
											height: "36px",
											borderRadius: "6px",
											border: "1px solid #cbd5e1",
											background: "#ffffff",
											cursor: "pointer",
										}}
									>
										-
									</button>

									<div style={{ minWidth: "24px", textAlign: "center", fontWeight: 600 }}>{quantity}</div>

									<button
										type="button"
										onClick={() => handleChangeQuantity(category.code, 1)}
										style={{
											width: "36px",
											height: "36px",
											borderRadius: "6px",
											border: "1px solid #cbd5e1",
											background: "#ffffff",
											cursor: "pointer",
										}}
									>
										+
									</button>
								</div>
							);
						})}
					</div>
				)}
			</section>

			<section
				style={{
					borderTop: "1px solid #e2e8f0",
					paddingTop: "16px",
					display: "grid",
					gap: "12px",
				}}
			>
				<div style={{ display: "flex", justifyContent: "space-between" }}>
					<span>Total Units</span>
					<strong>{totalUnits}</strong>
				</div>
				<div style={{ display: "flex", justifyContent: "space-between" }}>
					<span>Total Amount</span>
					<strong>PHP {totalAmount.toFixed(2)}</strong>
				</div>
				<button
					type="button"
					onClick={handleStartSession}
					disabled={!canProceed}
					style={{
						marginTop: "8px",
						padding: "12px 16px",
						borderRadius: "8px",
						border: "none",
						background: canProceed ? "#0f766e" : "#cbd5e1",
						color: canProceed ? "#ffffff" : "#475569",
						cursor: canProceed ? "pointer" : "not-allowed",
						fontWeight: 600,
					}}
				>
					{isStarting ? "Starting..." : "Proceed"}
				</button>
			</section>

			{errorMessage ? (
				<section
					style={{
						padding: "12px",
						borderRadius: "8px",
						border: "1px solid #fecaca",
						background: "#fef2f2",
						color: "#991b1b",
					}}
				>
					{errorMessage}
				</section>
			) : null}

			{session ? (
				<section
					style={{
						border: "1px solid #cbd5e1",
						borderRadius: "10px",
						padding: "16px",
						display: "grid",
						gap: "10px",
					}}
				>
					<h2 style={{ margin: 0 }}>Payment Session</h2>
					{isOfflineSession ? (
						<div
							style={{
								padding: "8px 10px",
								borderRadius: "6px",
								background: "#fffbeb",
								border: "1px solid #fde68a",
								color: "#92400e",
								fontSize: "13px",
							}}
						>
							Local test mode: backend calls are unavailable, so payment updates are simulated.
						</div>
					) : null}

					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Facility</span>
						<strong>{session.facilityName}</strong>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Amount Due</span>
						<strong>PHP {session.amountDue.toFixed(2)}</strong>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Amount Inserted</span>
						<strong>PHP {session.amountInserted.toFixed(2)}</strong>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Remaining Amount</span>
						<strong>PHP {session.remainingAmount.toFixed(2)}</strong>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Total Units</span>
						<strong>{session.totalUnits}</strong>
					</div>
					<div style={{ display: "flex", justifyContent: "space-between" }}>
						<span>Status</span>
						<strong>{session.status}</strong>
					</div>

					<div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "8px" }}>
						<button
							type="button"
							onClick={() => handleInsertAmount(10)}
							disabled={isInserting !== null || isCompleting}
							style={{
								padding: "10px 12px",
								borderRadius: "6px",
								border: "1px solid #cbd5e1",
								background: "#ffffff",
								cursor: isInserting !== null || isCompleting ? "not-allowed" : "pointer",
							}}
						>
							{isInserting === 10 ? "Inserting..." : "Insert 10"}
						</button>
						<button
							type="button"
							onClick={() => handleInsertAmount(20)}
							disabled={isInserting !== null || isCompleting}
							style={{
								padding: "10px 12px",
								borderRadius: "6px",
								border: "1px solid #cbd5e1",
								background: "#ffffff",
								cursor: isInserting !== null || isCompleting ? "not-allowed" : "pointer",
							}}
						>
							{isInserting === 20 ? "Inserting..." : "Insert 20"}
						</button>
						<button
							type="button"
							onClick={() => handleInsertAmount(50)}
							disabled={isInserting !== null || isCompleting}
							style={{
								padding: "10px 12px",
								borderRadius: "6px",
								border: "1px solid #cbd5e1",
								background: "#ffffff",
								cursor: isInserting !== null || isCompleting ? "not-allowed" : "pointer",
							}}
						>
							{isInserting === 50 ? "Inserting..." : "Insert 50"}
						</button>
					</div>

					<div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "8px" }}>
						<button
							type="button"
							onClick={handleCompletePayment}
							disabled={!canComplete || isCompleting || isInserting !== null}
							style={{
								padding: "10px 14px",
								borderRadius: "6px",
								border: "none",
								background: canComplete ? "#0f766e" : "#cbd5e1",
								color: canComplete ? "#ffffff" : "#334155",
								cursor: canComplete && !isCompleting && isInserting === null ? "pointer" : "not-allowed",
								fontWeight: 600,
							}}
						>
							{isCompleting ? "Completing..." : "Complete Payment"}
						</button>

						<button
							type="button"
							onClick={handleCancelSession}
							disabled={isCompleting || isInserting !== null}
							style={{
								padding: "10px 14px",
								borderRadius: "6px",
								border: "1px solid #cbd5e1",
								background: "#ffffff",
								cursor: isCompleting || isInserting !== null ? "not-allowed" : "pointer",
							}}
						>
							Cancel Session
						</button>
					</div>

					{completion ? (
						<div
							style={{
								marginTop: "8px",
								padding: "10px",
								borderRadius: "8px",
								border: "1px solid #bbf7d0",
								background: "#f0fdf4",
							}}
						>
							<div>
								<strong>Ticket Label:</strong> {completion.ticketLabel}
							</div>
							<div>
								<strong>Transaction ID:</strong> {completion.transactionId}
							</div>
						</div>
					) : null}
				</section>
			) : null}
		</div>
	);
}
