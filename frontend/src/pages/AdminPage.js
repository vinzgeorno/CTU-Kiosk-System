import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../config";
import { facilities } from "../data/facilities";
import { getRecentTransactions, getAllTransactions, getTicketCounters, getTransactionByTicketLabel, reprintTransactionById, updateTicketCounter, getTransactionStats, getFacilitySummaryReport, printFacilitySummaryReport, } from "../services/api";
const defaultStats = {
    totalTransactions: 0,
    totalAmount: 0,
    totalUnits: 0,
    averageDurationMs: 0,
    fastestDurationMs: 0,
    slowestDurationMs: 0,
};
const tabs = [
    { id: "dashboard", label: "Dashboard" },
    { id: "transactions", label: "Transactions" },
    { id: "counters", label: "Counters" },
    { id: "search", label: "Search / Reprint" },
    { id: "reports", label: "Reports" },
];
const asRecord = (value) => {
    if (!value || typeof value !== "object") {
        return null;
    }
    return value;
};
const extractArray = (payload, keys) => {
    if (Array.isArray(payload)) {
        return payload;
    }
    const record = asRecord(payload);
    if (!record) {
        return [];
    }
    for (const key of keys) {
        const value = record[key];
        if (Array.isArray(value)) {
            return value;
        }
    }
    return [];
};
const extractItem = (payload, keys) => {
    const direct = asRecord(payload);
    if (direct && !Array.isArray(payload)) {
        for (const key of keys) {
            const value = direct[key];
            if (value && typeof value === "object" && !Array.isArray(value)) {
                return value;
            }
        }
        return direct;
    }
    return null;
};
const formatCurrency = (value) => `PHP ${Number(value).toFixed(2)}`;
const formatDuration = (value) => {
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
const padDateTimePart = (value) => String(value).padStart(2, "0");
const formatDateInputValue = (value) => {
    return `${value.getFullYear()}-${padDateTimePart(value.getMonth() + 1)}-${padDateTimePart(value.getDate())}`;
};
const formatTimeInputValue = (value) => {
    return `${padDateTimePart(value.getHours())}:${padDateTimePart(value.getMinutes())}`;
};
const createReportRangeInputs = (start, end) => ({
    startDate: formatDateInputValue(start),
    startTime: formatTimeInputValue(start),
    endDate: formatDateInputValue(end),
    endTime: formatTimeInputValue(end),
});
const createDefaultReportInputs = () => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return createReportRangeInputs(start, now);
};
const buildLocalDateTime = (dateValue, timeValue) => {
    if (!dateValue || !timeValue) {
        return null;
    }
    const [yearText, monthText, dayText] = dateValue.split("-");
    const [hourText, minuteText] = timeValue.split(":");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (![year, month, day, hour, minute].every((part) => Number.isInteger(part)) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59) {
        return null;
    }
    const result = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (Number.isNaN(result.getTime()) ||
        result.getFullYear() !== year ||
        result.getMonth() !== month - 1 ||
        result.getDate() !== day ||
        result.getHours() !== hour ||
        result.getMinutes() !== minute) {
        return null;
    }
    return result;
};
const buildReportPeriodFromInputs = (inputs) => {
    const start = buildLocalDateTime(inputs.startDate, inputs.startTime);
    const end = buildLocalDateTime(inputs.endDate, inputs.endTime);
    if (!start || !end) {
        return {
            error: "Select a valid start and end date/time.",
            startAt: null,
            endAt: null,
        };
    }
    if (start > end) {
        return {
            error: "Report start must be earlier than or equal to the report end.",
            startAt: null,
            endAt: null,
        };
    }
    return {
        error: null,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
    };
};
const getStartOfCurrentWeek = (value) => {
    const result = new Date(value);
    const dayOfWeek = result.getDay();
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    result.setDate(result.getDate() - offset);
    result.setHours(0, 0, 0, 0);
    return result;
};
const getStartOfCurrentMonth = (value) => {
    const result = new Date(value);
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
    return result;
};
const getStartOfCurrentYear = (value) => {
    const result = new Date(value);
    result.setMonth(0, 1);
    result.setHours(0, 0, 0, 0);
    return result;
};
const formatReportPeriod = (value) => {
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
const panelStyle = {
    padding: 20,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #dbe4ee",
    boxShadow: "0 12px 28px rgba(15, 23, 42, 0.06)",
};
const messageStyle = (type) => ({
    padding: 12,
    borderRadius: 10,
    border: type === "success" ? "1px solid #86efac" : "1px solid #fecaca",
    background: type === "success" ? "#f0fdf4" : "#fef2f2",
    color: type === "success" ? "#166534" : "#991b1b",
    fontSize: 14,
});
const emptyStateStyle = {
    padding: 18,
    borderRadius: 14,
    border: "1px dashed #cbd5e1",
    background: "#f8fafc",
    color: "#64748b",
    fontSize: 14,
    lineHeight: 1.5,
};
const normalizeSyncStatus = (value) => {
    if (value === "synced" || value === "failed") {
        return value;
    }
    return "pending";
};
const getSyncBadgeStyle = (status) => {
    if (status === "synced") {
        return {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            background: "#dcfce7",
            color: "#166534",
            border: "1px solid #86efac",
        };
    }
    if (status === "failed") {
        return {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "4px 8px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fca5a5",
        };
    }
    return {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        background: "#fef3c7",
        color: "#92400e",
        border: "1px solid #fcd34d",
    };
};
const retryTransactionSync = async (id) => {
    let response;
    try {
        response = await fetch(`${API_BASE_URL}/transactions/${id}/retry-sync`, {
            method: "POST",
        });
    }
    catch {
        throw new Error(`Unable to reach backend at ${API_BASE_URL}`);
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        const message = data && typeof data.message === "string" ? data.message : "Retry sync failed";
        throw new Error(message);
    }
    return data;
};
const buildTicketPreview = (facilityCode, lastSequence) => {
    const monthCode = String(new Date().getMonth() + 1).padStart(2, "0");
    const nextSequence = String(Math.max(lastSequence, 0) + 1).padStart(4, "0");
    return `${facilityCode}-${monthCode}-${nextSequence}`;
};
const mergeCounterRows = (backendCounters) => {
    const backendCounterMap = new Map(backendCounters.map((counter) => [counter.facility_code, counter]));
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
    const [activeTab, setActiveTab] = useState("dashboard");
    const [recentTransactions, setRecentTransactions] = useState([]);
    const [allTransactions, setAllTransactions] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalTransactions, setTotalTransactions] = useState(0);
    const [ticketCounters, setTicketCounters] = useState([]);
    const [transactionStats, setTransactionStats] = useState(defaultStats);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [ticketLabel, setTicketLabel] = useState("");
    const [foundTransaction, setFoundTransaction] = useState(null);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState(null);
    const [counterInputs, setCounterInputs] = useState({});
    const [updatingCounters, setUpdatingCounters] = useState({});
    const [counterMessage, setCounterMessage] = useState(null);
    const [reprintMessage, setReprintMessage] = useState(null);
    const [reprintingTransactions, setReprintingTransactions] = useState({});
    const [retryingSyncTransactions, setRetryingSyncTransactions] = useState({});
    const [syncMessage, setSyncMessage] = useState(null);
    const [facilitySummaryRows, setFacilitySummaryRows] = useState([]);
    const [isLoadingFacilityReport, setIsLoadingFacilityReport] = useState(false);
    const [facilityReportError, setFacilityReportError] = useState(null);
    const [reportRangeInputs, setReportRangeInputs] = useState(() => createDefaultReportInputs());
    const [facilityReportPrintMessage, setFacilityReportPrintMessage] = useState(null);
    const [isPrintingFacilityReport, setIsPrintingFacilityReport] = useState(false);
    const [facilityReportPeriod, setFacilityReportPeriod] = useState({
        startAt: null,
        endAt: null,
    });
    const [facilityReportTitle, setFacilityReportTitle] = useState("Facility Summary Report");
    const loadCounters = async () => {
        const countersResult = await getTicketCounters();
        const counters = extractArray(countersResult, ["data", "counters", "items"]);
        const mergedCounters = mergeCounterRows(counters);
        setTicketCounters(mergedCounters);
        setCounterInputs(mergedCounters.reduce((acc, counter) => {
            acc[counter.facility_code] = String(counter.last_sequence);
            return acc;
        }, {}));
    };
    const loadRecentTransactionsData = async () => {
        const recentResult = await getRecentTransactions();
        setRecentTransactions(extractArray(recentResult, ["data", "transactions", "items"]));
    };
    const loadAllTransactionsData = async (page = 1) => {
        const result = await getAllTransactions(page, 50);
        const response = result;
        if (response.success) {
            setAllTransactions(response.transactions);
            setCurrentPage(response.pagination.page);
            setTotalPages(response.pagination.totalPages);
            setTotalTransactions(response.pagination.total);
        }
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
                setRecentTransactions(extractArray(recentResult, ["data", "transactions", "items"]));
                setTransactionStats(extractItem(statsResult, ["data", "stats", "item"]) ?? defaultStats);
                await loadCounters();
            }
            catch (error) {
                setLoadError(error instanceof Error ? error.message : "Failed to load admin data.");
            }
            finally {
                setIsLoading(false);
            }
        };
        void loadData();
    }, []);
    useEffect(() => {
        if (activeTab === "transactions") {
            void loadAllTransactionsData(1);
        }
    }, [activeTab]);
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
            const transaction = extractItem(result, ["data", "transaction", "item"]);
            if (!transaction) {
                setSearchError("Transaction not found.");
                return;
            }
            setFoundTransaction(transaction);
        }
        catch (error) {
            setSearchError(error instanceof Error ? error.message : "Transaction not found.");
        }
        finally {
            setIsSearching(false);
        }
    };
    const handleRetrySync = async (transaction) => {
        const syncedAt = new Date().toISOString();
        setSyncMessage(null);
        setRetryingSyncTransactions((prev) => ({
            ...prev,
            [transaction.id]: true,
        }));
        try {
            await retryTransactionSync(transaction.id);
            setRecentTransactions((prev) => prev.map((item) => item.id === transaction.id
                ? {
                    ...item,
                    sync_status: "synced",
                    sync_error: null,
                    synced_at: syncedAt,
                }
                : item));
            setAllTransactions((prev) => prev.map((item) => item.id === transaction.id
                ? {
                    ...item,
                    sync_status: "synced",
                    sync_error: null,
                    synced_at: syncedAt,
                }
                : item));
            setFoundTransaction((prev) => prev && prev.id === transaction.id
                ? {
                    ...prev,
                    sync_status: "synced",
                    sync_error: null,
                    synced_at: syncedAt,
                }
                : prev);
            void loadRecentTransactionsData();
            setSyncMessage({
                type: "success",
                text: `Sync retry successful for ticket ${transaction.ticket_label}.`,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Failed to retry sync.";
            setRecentTransactions((prev) => prev.map((item) => item.id === transaction.id
                ? {
                    ...item,
                    sync_status: "failed",
                    sync_error: errorMessage,
                }
                : item));
            setAllTransactions((prev) => prev.map((item) => item.id === transaction.id
                ? {
                    ...item,
                    sync_status: "failed",
                    sync_error: errorMessage,
                }
                : item));
            setFoundTransaction((prev) => prev && prev.id === transaction.id
                ? {
                    ...prev,
                    sync_status: "failed",
                    sync_error: errorMessage,
                }
                : prev);
            setSyncMessage({
                type: "error",
                text: errorMessage,
            });
        }
        finally {
            setRetryingSyncTransactions((prev) => ({
                ...prev,
                [transaction.id]: false,
            }));
        }
    };
    const handleCounterInputChange = (facilityCode, value) => {
        setCounterInputs((prev) => ({
            ...prev,
            [facilityCode]: value,
        }));
    };
    const handleUpdateCounter = async (counter) => {
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
        }
        catch (error) {
            setCounterMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to update ticket counter.",
            });
        }
        finally {
            setUpdatingCounters((prev) => ({
                ...prev,
                [counter.facility_code]: false,
            }));
        }
    };
    const handleReprint = async (transaction) => {
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
        }
        catch (error) {
            setReprintMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to reprint transaction.",
            });
        }
        finally {
            setReprintingTransactions((prev) => ({
                ...prev,
                [transaction.id]: false,
            }));
        }
    };
    const loadFacilityReport = async (startAt, endAt, reportTitle) => {
        setIsLoadingFacilityReport(true);
        setFacilityReportError(null);
        setFacilityReportPrintMessage(null);
        setFacilityReportPeriod({ startAt, endAt });
        setFacilityReportTitle(reportTitle);
        try {
            const result = await getFacilitySummaryReport(startAt, endAt);
            setFacilitySummaryRows(extractArray(result, ["report", "data", "items"]));
        }
        catch (error) {
            setFacilitySummaryRows([]);
            setFacilityReportError(error instanceof Error ? error.message : "Failed to load facility summary report.");
        }
        finally {
            setIsLoadingFacilityReport(false);
        }
    };
    const handleReportInputChange = (field, value) => {
        setReportRangeInputs((prev) => ({
            ...prev,
            [field]: value,
        }));
    };
    const handleLoadFacilityReport = async () => {
        const reportPeriod = buildReportPeriodFromInputs(reportRangeInputs);
        if (reportPeriod.error || !reportPeriod.startAt || !reportPeriod.endAt) {
            setFacilitySummaryRows([]);
            setFacilityReportPrintMessage(null);
            setFacilityReportError(reportPeriod.error ?? "Invalid report period.");
            return;
        }
        await loadFacilityReport(reportPeriod.startAt, reportPeriod.endAt, "Facility Summary Report");
    };
    const handleLoadShortcutReport = async (type) => {
        const now = new Date();
        const start = type === "weekly"
            ? getStartOfCurrentWeek(now)
            : type === "monthly"
                ? getStartOfCurrentMonth(now)
                : getStartOfCurrentYear(now);
        setReportRangeInputs(createReportRangeInputs(start, now));
        await loadFacilityReport(start.toISOString(), now.toISOString(), type === "weekly"
            ? "Weekly Facility Summary"
            : type === "monthly"
                ? "Monthly Facility Summary"
                : "Yearly Facility Summary");
    };
    const handlePrintFacilityReport = async () => {
        if (!facilityReportPeriod.startAt || !facilityReportPeriod.endAt || facilitySummaryRows.length === 0) {
            return;
        }
        setIsPrintingFacilityReport(true);
        setFacilityReportPrintMessage(null);
        try {
            await printFacilitySummaryReport({
                reportTitle: facilityReportTitle,
                startAt: facilityReportPeriod.startAt,
                endAt: facilityReportPeriod.endAt,
                rows: facilitySummaryRows,
            });
            setFacilityReportPrintMessage({
                type: "success",
                text: "Facility summary report sent to the printer.",
            });
        }
        catch (error) {
            setFacilityReportPrintMessage({
                type: "error",
                text: error instanceof Error ? error.message : "Failed to print facility summary report.",
            });
        }
        finally {
            setIsPrintingFacilityReport(false);
        }
    };
    const renderDashboard = () => (_jsxs("div", { style: { display: "grid", gap: 14 }, children: [_jsxs("div", { style: {
                    ...panelStyle,
                    padding: 16,
                    borderRadius: 16,
                    background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%)",
                    color: "#ffffff",
                }, children: [_jsx("div", { style: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", opacity: 0.75 }, children: "Operations Overview" }), _jsx("h2", { style: { margin: "8px 0 6px", fontSize: 24, lineHeight: 1.1 }, children: "Kiosk Admin Dashboard" }), _jsx("p", { style: { margin: 0, maxWidth: 680, lineHeight: 1.4, fontSize: 13, color: "rgba(255,255,255,0.84)" }, children: "Monitor transaction volume, payment speed, and ticketing activity from one place." })] }), _jsx("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: 12,
                }, children: [
                    { label: "Total Transactions", value: transactionStats.totalTransactions },
                    { label: "Total Amount", value: formatCurrency(transactionStats.totalAmount) },
                    { label: "Total Units", value: transactionStats.totalUnits },
                    { label: "Average Transaction Speed", value: formatDuration(transactionStats.averageDurationMs) },
                    { label: "Fastest Transaction", value: formatDuration(transactionStats.fastestDurationMs) },
                    { label: "Slowest Transaction", value: formatDuration(transactionStats.slowestDurationMs) },
                ].map((card) => (_jsxs("div", { style: {
                        ...panelStyle,
                        padding: 14,
                        borderRadius: 14,
                        minHeight: 108,
                        display: "grid",
                        alignContent: "space-between",
                        gap: 8,
                    }, children: [_jsx("div", { style: { fontSize: 12, color: "#64748b", lineHeight: 1.35 }, children: card.label }), _jsx("div", { style: { fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: "#0f172a", wordBreak: "break-word" }, children: card.value })] }, card.label))) })] }));
    const renderTransactions = () => (_jsxs("section", { style: { ...panelStyle, display: "grid", gap: 14 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: 22, color: "#0f172a" }, children: "All Transactions" }), _jsxs("p", { style: { margin: "6px 0 0", color: "#64748b", fontSize: 14 }, children: ["All ticket transactions with pagination. Showing ", allTransactions.length, " of ", totalTransactions, " transactions."] })] }), _jsxs("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [_jsx("button", { type: "button", onClick: () => loadAllTransactionsData(currentPage - 1), disabled: currentPage <= 1, style: {
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #d1d5db",
                                    background: currentPage <= 1 ? "#f3f4f6" : "#ffffff",
                                    color: currentPage <= 1 ? "#9ca3af" : "#374151",
                                    cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                                }, children: "Previous" }), _jsxs("span", { style: { fontSize: 14, color: "#6b7280" }, children: ["Page ", currentPage, " of ", totalPages] }), _jsx("button", { type: "button", onClick: () => loadAllTransactionsData(currentPage + 1), disabled: currentPage >= totalPages, style: {
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "1px solid #d1d5db",
                                    background: currentPage >= totalPages ? "#f3f4f6" : "#ffffff",
                                    color: currentPage >= totalPages ? "#9ca3af" : "#374151",
                                    cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                                }, children: "Next" })] })] }), reprintMessage ? _jsx("div", { style: messageStyle(reprintMessage.type), children: reprintMessage.text }) : null, syncMessage ? _jsx("div", { style: messageStyle(syncMessage.type), children: syncMessage.text }) : null, isLoading ? _jsx("p", { style: { margin: 0, color: "#475569" }, children: "Loading data..." }) : null, loadError ? _jsx("div", { style: messageStyle("error"), children: loadError }) : null, !isLoading && !loadError ? (_jsx("div", { style: {
                    overflowX: "auto",
                    overflowY: "hidden",
                    paddingBottom: 14,
                    scrollbarGutter: "stable",
                }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 980 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "ID" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Ticket" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Facility" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Units" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Due" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Paid" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Sync" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Created At" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Action" })] }) }), _jsx("tbody", { children: allTransactions.length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { padding: "14px 8px", color: "#64748b" }, colSpan: 9, children: "No transactions found." }) })) : (allTransactions.map((transaction) => {
                                const syncStatus = normalizeSyncStatus(transaction.sync_status);
                                const canRetrySync = syncStatus === "failed" || syncStatus === "pending";
                                return (_jsxs("tr", { children: [_jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: transaction.id }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }, children: transaction.ticket_label }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: transaction.facility_name }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: transaction.total_units }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: formatCurrency(transaction.amount_due) }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: formatCurrency(transaction.amount_paid) }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" }, children: _jsxs("div", { style: { display: "grid", gap: 6, justifyItems: "start" }, children: [_jsx("span", { style: getSyncBadgeStyle(syncStatus), children: syncStatus }), syncStatus === "failed" && transaction.sync_error ? (_jsx("span", { style: { fontSize: 11, color: "#991b1b", lineHeight: 1.35, maxWidth: 160 }, children: transaction.sync_error })) : null] }) }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: transaction.created_at }), _jsx("td", { style: { padding: "10px 8px 18px", borderBottom: "1px solid #f1f5f9", minWidth: 180, verticalAlign: "top" }, children: _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }, children: [_jsx("button", { type: "button", onClick: () => handleReprint(transaction), disabled: Boolean(reprintingTransactions[transaction.id]), style: {
                                                            padding: "8px 12px",
                                                            borderRadius: 10,
                                                            border: "none",
                                                            background: "#0f766e",
                                                            color: "#ffffff",
                                                            fontWeight: 600,
                                                            whiteSpace: "nowrap",
                                                            cursor: reprintingTransactions[transaction.id] ? "not-allowed" : "pointer",
                                                        }, children: reprintingTransactions[transaction.id] ? "Reprinting..." : "Reprint" }), canRetrySync ? (_jsx("button", { type: "button", onClick: () => handleRetrySync(transaction), disabled: Boolean(retryingSyncTransactions[transaction.id]), style: {
                                                            padding: "8px 12px",
                                                            borderRadius: 10,
                                                            border: "1px solid #2563eb",
                                                            background: "#eff6ff",
                                                            color: "#1d4ed8",
                                                            fontWeight: 700,
                                                            whiteSpace: "nowrap",
                                                            cursor: retryingSyncTransactions[transaction.id] ? "not-allowed" : "pointer",
                                                        }, children: retryingSyncTransactions[transaction.id] ? "Retrying..." : "Retry Sync" })) : null] }) })] }, transaction.id));
                            })) })] }) })) : null] }));
    const renderCounters = () => (_jsxs("section", { style: { ...panelStyle, display: "grid", gap: 14 }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: 22, color: "#0f172a" }, children: "Ticket Counters" }), _jsx("p", { style: { margin: "6px 0 0", color: "#64748b", fontSize: 14 }, children: "Review all facility counters, preview ticket formats, and update sequences when required." })] }), counterMessage ? _jsx("div", { style: messageStyle(counterMessage.type), children: counterMessage.text }) : null, isLoading ? _jsx("p", { style: { margin: 0, color: "#475569" }, children: "Loading counters..." }) : null, loadError ? _jsx("div", { style: messageStyle("error"), children: loadError }) : null, !isLoading && !loadError ? (_jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 920 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Facility Code" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Facility" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Ticket Preview" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Last Sequence" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Updated At" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "New Sequence" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0" }, children: "Action" })] }) }), _jsx("tbody", { children: ticketCounters.length === 0 ? (_jsx("tr", { children: _jsx("td", { style: { padding: "14px 8px", color: "#64748b" }, colSpan: 7, children: "No ticket counters found." }) })) : (ticketCounters.map((counter) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }, children: counter.facility_code }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", color: "#334155" }, children: counter.facility_name }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: _jsx("div", { style: {
                                                display: "inline-flex",
                                                alignItems: "center",
                                                padding: "6px 10px",
                                                borderRadius: 999,
                                                background: "#eff6ff",
                                                border: "1px solid #bfdbfe",
                                                color: "#1d4ed8",
                                                fontWeight: 700,
                                                fontSize: 13,
                                            }, children: counter.ticket_preview }) }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: counter.last_sequence }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: counter.updated_at }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: _jsx("input", { type: "number", min: 0, step: 1, value: counterInputs[counter.facility_code] ?? "", onChange: (event) => handleCounterInputChange(counter.facility_code, event.target.value), style: {
                                                width: 140,
                                                padding: "8px 10px",
                                                borderRadius: 10,
                                                border: "1px solid #cbd5e1",
                                            } }) }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: _jsx("button", { type: "button", onClick: () => handleUpdateCounter(counter), disabled: Boolean(updatingCounters[counter.facility_code]), style: {
                                                padding: "8px 12px",
                                                borderRadius: 10,
                                                border: "none",
                                                background: "#0369a1",
                                                color: "#ffffff",
                                                fontWeight: 600,
                                                cursor: updatingCounters[counter.facility_code] ? "not-allowed" : "pointer",
                                            }, children: updatingCounters[counter.facility_code] ? "Updating..." : "Update" }) })] }, counter.facility_code)))) })] }) })) : null] }));
    const renderSearchAndReprint = () => (_jsx("div", { style: { display: "grid", gap: 18 }, children: _jsxs("section", { style: { ...panelStyle, display: "grid", gap: 14 }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: 22, color: "#0f172a" }, children: "Search By Ticket Label" }), _jsx("p", { style: { margin: "6px 0 0", color: "#64748b", fontSize: 14 }, children: "Find a transaction quickly and trigger a reprint from the result panel." })] }), _jsxs("div", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: [_jsx("input", { type: "text", value: ticketLabel, onChange: (event) => setTicketLabel(event.target.value), placeholder: "Enter ticket label", style: {
                                flex: "1 1 280px",
                                padding: "11px 12px",
                                borderRadius: 10,
                                border: "1px solid #cbd5e1",
                                fontSize: 14,
                            } }), _jsx("button", { type: "button", onClick: handleSearch, disabled: isSearching, style: {
                                padding: "11px 16px",
                                borderRadius: 10,
                                border: "none",
                                background: "#0369a1",
                                color: "#ffffff",
                                fontWeight: 600,
                                cursor: isSearching ? "not-allowed" : "pointer",
                            }, children: isSearching ? "Searching..." : "Search" })] }), searchError ? _jsx("div", { style: messageStyle("error"), children: searchError }) : null, reprintMessage ? _jsx("div", { style: messageStyle(reprintMessage.type), children: reprintMessage.text }) : null, foundTransaction ? (_jsxs("div", { style: {
                        padding: 16,
                        borderRadius: 14,
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        display: "grid",
                        gap: 8,
                    }, children: [_jsxs("div", { children: [_jsx("strong", { children: "ID:" }), " ", foundTransaction.id] }), _jsxs("div", { children: [_jsx("strong", { children: "Ticket:" }), " ", foundTransaction.ticket_label] }), _jsxs("div", { children: [_jsx("strong", { children: "Facility:" }), " ", foundTransaction.facility_name, " (", foundTransaction.facility_code, ")"] }), _jsxs("div", { children: [_jsx("strong", { children: "Total Units:" }), " ", foundTransaction.total_units] }), _jsxs("div", { children: [_jsx("strong", { children: "Amount Due:" }), " ", formatCurrency(foundTransaction.amount_due)] }), _jsxs("div", { children: [_jsx("strong", { children: "Amount Paid:" }), " ", formatCurrency(foundTransaction.amount_paid)] }), _jsxs("div", { children: [_jsx("strong", { children: "Created At:" }), " ", foundTransaction.created_at] }), _jsx("div", { style: { marginTop: 8 }, children: _jsx("button", { type: "button", onClick: () => handleReprint(foundTransaction), disabled: Boolean(reprintingTransactions[foundTransaction.id]), style: {
                                    padding: "9px 14px",
                                    borderRadius: 10,
                                    border: "none",
                                    background: "#0f766e",
                                    color: "#ffffff",
                                    fontWeight: 600,
                                    cursor: reprintingTransactions[foundTransaction.id] ? "not-allowed" : "pointer",
                                }, children: reprintingTransactions[foundTransaction.id] ? "Reprinting..." : "Reprint" }) })] })) : null, !foundTransaction && !searchError && !isSearching ? (_jsx("div", { style: emptyStateStyle, children: "Search for a ticket label to view transaction details and reprint controls." })) : null] }) }));
    const renderReports = () => (_jsxs("section", { style: { ...panelStyle, display: "grid", gap: 14 }, children: [_jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: [_jsxs("div", { children: [_jsx("h2", { style: { margin: 0, fontSize: 22, color: "#0f172a" }, children: "Reports" }), _jsx("p", { style: { margin: "6px 0 0", color: "#64748b", fontSize: 14 }, children: "Load facility summaries for any selected period or use quick weekly, monthly, and yearly ranges." })] }), _jsxs("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" }, children: [[
                                { key: "weekly", label: "Weekly" },
                                { key: "monthly", label: "Monthly" },
                                { key: "yearly", label: "Yearly" },
                            ].map((shortcut) => (_jsx("button", { type: "button", onClick: () => void handleLoadShortcutReport(shortcut.key), disabled: isLoadingFacilityReport, style: {
                                    padding: "9px 12px",
                                    borderRadius: 10,
                                    border: "1px solid #cbd5e1",
                                    background: "#ffffff",
                                    color: "#334155",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: isLoadingFacilityReport ? "not-allowed" : "pointer",
                                }, children: shortcut.label }, shortcut.key))), _jsx("button", { type: "button", onClick: () => void handleLoadFacilityReport(), disabled: isLoadingFacilityReport, style: {
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    border: "none",
                                    background: "#1d4ed8",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    cursor: isLoadingFacilityReport ? "not-allowed" : "pointer",
                                }, children: isLoadingFacilityReport ? "Loading Report..." : "Load Report" }), facilitySummaryRows.length > 0 ? (_jsx("button", { type: "button", onClick: handlePrintFacilityReport, disabled: isPrintingFacilityReport, style: {
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    border: "none",
                                    background: "#0f766e",
                                    color: "#ffffff",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    cursor: isPrintingFacilityReport ? "not-allowed" : "pointer",
                                }, children: isPrintingFacilityReport ? "Printing..." : "Print Report" })) : null] })] }), _jsxs("div", { style: {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                    gap: 10,
                    padding: 14,
                    borderRadius: 12,
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                }, children: [_jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: "#64748b" }, htmlFor: "report-start-date", children: "Start Date" }), _jsx("input", { id: "report-start-date", type: "date", value: reportRangeInputs.startDate, onChange: (event) => handleReportInputChange("startDate", event.target.value), style: {
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid #cbd5e1",
                                    fontSize: 13,
                                    background: "#ffffff",
                                    color: "#0f172a",
                                } })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: "#64748b" }, htmlFor: "report-start-time", children: "Start Time" }), _jsx("input", { id: "report-start-time", type: "time", value: reportRangeInputs.startTime, onChange: (event) => handleReportInputChange("startTime", event.target.value), style: {
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid #cbd5e1",
                                    fontSize: 13,
                                    background: "#ffffff",
                                    color: "#0f172a",
                                } })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: "#64748b" }, htmlFor: "report-end-date", children: "End Date" }), _jsx("input", { id: "report-end-date", type: "date", value: reportRangeInputs.endDate, onChange: (event) => handleReportInputChange("endDate", event.target.value), style: {
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid #cbd5e1",
                                    fontSize: 13,
                                    background: "#ffffff",
                                    color: "#0f172a",
                                } })] }), _jsxs("div", { style: { display: "grid", gap: 4 }, children: [_jsx("label", { style: { fontSize: 12, color: "#64748b" }, htmlFor: "report-end-time", children: "End Time" }), _jsx("input", { id: "report-end-time", type: "time", value: reportRangeInputs.endTime, onChange: (event) => handleReportInputChange("endTime", event.target.value), style: {
                                    padding: "8px 10px",
                                    borderRadius: 10,
                                    border: "1px solid #cbd5e1",
                                    fontSize: 13,
                                    background: "#ffffff",
                                    color: "#0f172a",
                                } })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: "#64748b", marginBottom: 4 }, children: "Loaded Start" }), _jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "#0f172a" }, children: formatReportPeriod(facilityReportPeriod.startAt) })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: "#64748b", marginBottom: 4 }, children: "Loaded End" }), _jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "#0f172a" }, children: formatReportPeriod(facilityReportPeriod.endAt) })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: "#64748b", marginBottom: 4 }, children: "Loaded Report" }), _jsx("div", { style: { fontSize: 14, fontWeight: 600, color: "#0f172a" }, children: facilityReportTitle })] })] }), facilityReportError ? _jsx("div", { style: messageStyle("error"), children: facilityReportError }) : null, facilityReportPrintMessage ? (_jsx("div", { style: messageStyle(facilityReportPrintMessage.type), children: facilityReportPrintMessage.text })) : null, isLoadingFacilityReport ? (_jsx("div", { style: emptyStateStyle, children: "Loading facility summary report..." })) : facilitySummaryRows.length === 0 ? (_jsx("div", { style: emptyStateStyle, children: facilityReportPeriod.startAt && facilityReportPeriod.endAt
                    ? "No facility summary rows found for the selected report period."
                    : "Choose a start and end date/time, or use a shortcut range, then load the report." })) : (_jsx("div", { style: { overflowX: "auto" }, children: _jsxs("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 860 }, children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Facility" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "First Ticket" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Last Ticket" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Transactions" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Units" }), _jsx("th", { style: { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", color: "#334155" }, children: "Total Amount" })] }) }), _jsx("tbody", { children: facilitySummaryRows.map((row) => (_jsxs("tr", { children: [_jsxs("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: [_jsx("div", { style: { fontWeight: 700, color: "#0f172a", fontSize: 14 }, children: row.facility_name }), _jsx("div", { style: { color: "#64748b", fontSize: 12 }, children: row.facility_code })] }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }, children: row.first_ticket_label || "-" }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }, children: row.last_ticket_label || "-" }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: row.transaction_count }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }, children: row.total_units }), _jsx("td", { style: { padding: "10px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 700 }, children: formatCurrency(row.total_amount) })] }, row.facility_code))) })] }) }))] }));
    const renderActiveTab = () => {
        const tabContent = {
            dashboard: renderDashboard(),
            transactions: renderTransactions(),
            counters: renderCounters(),
            search: renderSearchAndReprint(),
            reports: renderReports(),
        };
        return tabContent[activeTab] ?? (_jsx("section", { style: { ...panelStyle, minHeight: 240, display: "grid", alignItems: "center" }, children: _jsx("div", { style: emptyStateStyle, children: "Select a tab to view admin content." }) }));
    };
    return (_jsxs("div", { style: {
            height: "100vh",
            padding: 24,
            background: "linear-gradient(180deg, #e2e8f0 0%, #f8fafc 28%, #f8fafc 100%)",
            overflowY: "auto",
            overflowX: "hidden",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }, children: [_jsx("button", { type: "button", "aria-label": "Back to welcome", onClick: () => {
                    window.location.pathname = "/";
                }, style: {
                    position: "fixed",
                    top: 24,
                    left: 24,
                    zIndex: 12,
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(15,23,42,0.08)",
                    border: "1px solid rgba(15,23,42,0.12)",
                    cursor: "pointer",
                }, children: _jsxs("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", children: [_jsx("path", { d: "M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z", stroke: "#0f172a", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }), _jsx("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 1 1 2.28 16.9l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.7 0 1.3-.4 1.51-1a1.65 1.65 0 0 0-.33-1.82L4.3 4.7A2 2 0 1 1 7.13 1.87l.06.06c.5.5 1.2.7 1.82.33.5-.3 1.1-.47 1.7-.47h.02c.6 0 1.2.17 1.7.47.62.37 1.32.17 1.82-.33l.06-.06A2 2 0 1 1 20.87 4.7l-.06.06a1.65 1.65 0 0 0-.33 1.82c.2.6.5 1 1 1.51H21a2 2 0 0 1 0 4h-.09c-.7 0-1.3.4-1.51 1z", stroke: "#0f172a", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" })] }) }), _jsxs("div", { style: { maxWidth: 1240, margin: "0 auto", display: "grid", gap: 18 }, children: [_jsxs("header", { style: {
                            ...panelStyle,
                            padding: 18,
                            display: "grid",
                            gap: 14,
                            position: "sticky",
                            top: 0,
                            zIndex: 5,
                        }, children: [_jsx("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, children: _jsxs("div", { children: [_jsx("h1", { style: { margin: 0, fontSize: 30, color: "#0f172a" }, children: "CTU Kiosk Admin" }), _jsx("p", { style: { margin: "6px 0 0", color: "#64748b", fontSize: 14 }, children: "Operational tools for transactions, ticketing, and kiosk support." })] }) }), _jsx("nav", { style: { display: "flex", gap: 10, flexWrap: "wrap" }, children: tabs.map((tab) => {
                                    const isActive = tab.id === activeTab;
                                    return (_jsx("button", { type: "button", onClick: () => setActiveTab(tab.id), style: {
                                            padding: "10px 14px",
                                            borderRadius: 999,
                                            border: isActive ? "1px solid #0f172a" : "1px solid #cbd5e1",
                                            background: isActive ? "#0f172a" : "#ffffff",
                                            color: isActive ? "#ffffff" : "#334155",
                                            fontWeight: 700,
                                            fontSize: 14,
                                            cursor: "pointer",
                                        }, children: tab.label }, tab.id));
                                }) })] }), loadError && activeTab === "dashboard" ? _jsx("div", { style: messageStyle("error"), children: loadError }) : null, _jsx("main", { style: { display: "grid", gap: 18, minHeight: 320 }, children: renderActiveTab() })] })] }));
}
