"use client";

import { useState, useCallback, useEffect, memo } from "react";
import { useRouter } from "next/navigation";
import "@/styles/dashboard.css";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconBarChart = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
));
IconBarChart.displayName = "IconBarChart";

const IconExport = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
));
IconExport.displayName = "IconExport";

const IconFilter = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
));
IconFilter.displayName = "IconFilter";

const IconChevron = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
));
IconChevron.displayName = "IconChevron";

/* ── Pure helpers ───────────────────────────────────────── */
const formatDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export default function SalesPage() {
    const router = useRouter();

    /* ── State ──────────────────────────────────────────── */
    const [branchOptions, setBranchOptions] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState("");

    const [salesData, setSalesData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [salesDays, setSalesDays] = useState(90);

    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return formatDateInput(d);
    });
    const [toDate, setToDate] = useState(formatDateInput(new Date()));

    /* ── Fetch branches ─────────────────────────────────── */
    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const res = await fetch("/api/branches");
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.value || []);
                    const names = list.map((b) => b.SiteID || b.BranchName?.value || b.BranchID?.value).filter(Boolean);
                    setBranchOptions([...new Set(names)].sort());
                }
            } catch {
                // non-fatal
            }
        };
        fetchBranches();
    }, []);

    /* ── Fetch sales analysis ───────────────────────────── */
    const fetchSales = useCallback(async (from, to, branch) => {
        setLoading(true);
        setError("");
        setSalesData([]);
        try {
            const params = new URLSearchParams({ branch: branch ?? selectedBranch, startDate: from, endDate: to });
            const res = await fetch(`/api/sales-history?${params.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (!res.ok) { setError("Failed to load sales history."); return; }
            const result = await res.json();
            setSalesData(result.data || []);
            setSalesDays(result.days || 90);
        } catch {
            setError("Unable to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [selectedBranch, router]);

    /* ── Export CSV ─────────────────────────────────────── */
    const exportCSV = useCallback(() => {
        const headers = ["Inventory ID", "Description", "Item Class", "Posting Class", "Inv", "Coming", "Inv+Coming", `Last ${salesDays}d`, "Avg/Day", "Consume Days", "MOH", "NTO", "Remarks"];
        const rows = salesData.map((r) => [
            r.inventoryId, r.description, r.itemClass, r.postingClass,
            r.inv, r.coming, r.invPlusComing, r.last3mQty,
            r.avgPerDay, r.consumeDays, r.moh, r.nto, r.remarks,
        ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sales-analysis-${selectedBranch || "all"}-${fromDate}-to-${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [salesData, selectedBranch, fromDate, toDate, salesDays]);

    /* ── Handle branch change ───────────────────────────── */
    const handleBranchChange = useCallback((e) => {
        const branch = e.target.value;
        setSelectedBranch(branch);
        // Re-run analysis with new branch if data is already loaded
        if (salesData.length > 0) {
            fetchSales(fromDate, toDate, branch);
        }
    }, [salesData.length, fromDate, toDate, fetchSales]);

    /* ── Derived summary ────────────────────────────────── */
    const reorderCount = salesData.filter(r => r.remarks === "Reorder").length;
    const overstockCount = salesData.filter(r => r.remarks === "Overstock").length;
    const totalQtySold = salesData.reduce((s, r) => s + r.last3mQty, 0);

    return (
        <div className="db-main">
            {/* ── Page title ─────────────────────────────── */}
            <div className="db-page-title">
                <h1>Last 3 Months Sales</h1>
                <p>Analyze inventory movement, consumption rate, and reorder requirements.</p>
            </div>

            {/* ── Filter toolbar ─────────────────────────── */}
            <div className="db-toolbar">
                <div className="db-toolbar-left">
                    {/* Branch filter */}
                    <div className="db-select-wrapper">
                        <IconFilter />
                        <select className="db-select" value={selectedBranch} onChange={handleBranchChange}>
                            <option value="">All Branches</option>
                            {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                        <IconChevron />
                    </div>

                    {/* Date range */}
                    <div className="db-sales3m-filter-row" style={{ gap: "0.5rem", alignItems: "flex-end" }}>
                        <div className="db-sales3m-filter-group">
                            <label>From</label>
                            <input
                                type="date"
                                value={fromDate}
                                max={toDate}
                                onChange={(e) => setFromDate(e.target.value)}
                            />
                        </div>
                        <span className="db-sales3m-filter-arrow">→</span>
                        <div className="db-sales3m-filter-group">
                            <label>To</label>
                            <input
                                type="date"
                                value={toDate}
                                min={fromDate}
                                max={formatDateInput(new Date())}
                                onChange={(e) => setToDate(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="db-toolbar-right">
                    <button
                        className="db-btn-run-analysis"
                        onClick={() => fetchSales(fromDate, toDate)}
                        disabled={loading || !fromDate || !toDate}
                    >
                        <IconBarChart />
                        <span>{loading ? "Loading…" : "Run Analysis"}</span>
                    </button>
                    {salesData.length > 0 && !loading && (
                        <button className="db-action-btn" onClick={exportCSV}>
                            <IconExport /><span>Export CSV</span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Error ──────────────────────────────────── */}
            {error && (
                <div className="db-error-card">
                    <div className="db-error-body">
                        <p className="db-error-title">{error}</p>
                        <p className="db-error-msg">Check your connection or try a different date range.</p>
                    </div>
                    <button className="db-error-retry" onClick={() => fetchSales(fromDate, toDate)}>Retry</button>
                </div>
            )}

            {/* ── Loading ────────────────────────────────── */}
            {loading && (
                <div className="db-loading">
                    <div className="db-spinner" />
                    <span>Fetching sales data for {fromDate} → {toDate}…</span>
                </div>
            )}

            {/* ── Empty state ────────────────────────────── */}
            {!loading && !error && salesData.length === 0 && (
                <div className="db-empty" style={{ marginTop: "4rem" }}>
                    <IconBarChart />
                    <p>No data yet</p>
                    <span>Select a date range and click <strong>Run Analysis</strong> to view sales data.</span>
                </div>
            )}

            {/* ── Results ────────────────────────────────── */}
            {!loading && salesData.length > 0 && (
                <>
                    {/* Summary cards */}
                    <div className="db-sales3m-summary">
                        <div className="db-sales3m-card">
                            <span className="db-sales3m-card-val">{salesData.length}</span>
                            <span className="db-sales3m-card-label">Total Items</span>
                        </div>
                        <div className="db-sales3m-card db-sales3m-card-danger">
                            <span className="db-sales3m-card-val">{reorderCount}</span>
                            <span className="db-sales3m-card-label">Reorder</span>
                        </div>
                        <div className="db-sales3m-card db-sales3m-card-warn">
                            <span className="db-sales3m-card-val">{overstockCount}</span>
                            <span className="db-sales3m-card-label">Overstock</span>
                        </div>
                        <div className="db-sales3m-card db-sales3m-card-blue">
                            <span className="db-sales3m-card-val">{totalQtySold.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</span>
                            <span className="db-sales3m-card-label">Total Qty Sold</span>
                        </div>
                        <div className="db-sales3m-card">
                            <span className="db-sales3m-card-val">{salesDays}d</span>
                            <span className="db-sales3m-card-label">{fromDate} → {toDate}</span>
                        </div>
                    </div>

                    {/* Data table */}
                    <div className="db-sales3m-table-wrap">
                        <table className="db-table db-sales3m-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Inventory ID</th>
                                    <th>Description</th>
                                    <th>Item Class</th>
                                    <th>Posting Class</th>
                                    <th className="db-num">Inv</th>
                                    <th className="db-num">Coming</th>
                                    <th className="db-num">Inv+Coming</th>
                                    <th className="db-num">Last {salesDays}d</th>
                                    <th className="db-num">Avg/Day</th>
                                    <th className="db-num">Consume Days</th>
                                    <th className="db-num">MOH</th>
                                    <th className="db-num">NTO</th>
                                    <th>Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesData.map((r, i) => (
                                    <tr key={r.inventoryId + i} className={r.remarks === "Reorder" ? "db-row-danger" : "db-row-warn"}>
                                        <td className="db-row-num">{i + 1}</td>
                                        <td><span className="db-inv-id">{r.inventoryId}</span></td>
                                        <td className="db-desc">{r.description}</td>
                                        <td><span className="db-class-tag">{r.itemClass}</span></td>
                                        <td>{r.postingClass}</td>
                                        <td className="db-num">{r.inv.toLocaleString()}</td>
                                        <td className="db-num">{r.coming.toLocaleString()}</td>
                                        <td className="db-num"><strong>{r.invPlusComing.toLocaleString()}</strong></td>
                                        <td className="db-num"><span className="db-badge db-badge-blue">{r.last3mQty.toLocaleString()}</span></td>
                                        <td className="db-num">{r.avgPerDay.toFixed(2)}</td>
                                        <td className="db-num">{r.consumeDays >= 9999 ? "∞" : r.consumeDays.toFixed(2)}</td>
                                        <td className="db-num">{r.moh >= 9999 ? "∞" : r.moh.toFixed(2)}</td>
                                        <td className={`db-num ${r.nto > 0 ? "db-nto-positive" : "db-nto-negative"}`}>{r.nto.toFixed(2)}</td>
                                        <td>
                                            <span className={`db-status-badge ${r.remarks === "Reorder" ? "db-status-out" : "db-status-low"}`}>
                                                {r.remarks}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
