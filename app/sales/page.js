"use client";

import { useState, useCallback, useEffect, memo, Fragment } from "react";
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
    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [salesDays, setSalesDays] = useState(90);
    const [searchQuery, setSearchQuery] = useState("");

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
    const fetchSales = useCallback(async (from, to, branch, search) => {
        setLoading(true);
        setError("");
        setSalesData([]);
        setMonths([]);
        try {
            const params = new URLSearchParams({ 
                branch: branch ?? selectedBranch, 
                startDate: from ?? fromDate, 
                endDate: to ?? toDate,
                search: search ?? searchQuery
            });
            const res = await fetch(`/api/sales-periodic?${params.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (!res.ok) { 
                const errData = await res.json().catch(() => ({}));
                setError(errData.message || errData.error || "Failed to load sales history."); 
                return; 
            }
            const result = await res.json();
            setSalesData(result.data || []);
            setMonths(result.months || []);
            
            const d1 = new Date(from ?? fromDate);
            const d2 = new Date(to ?? toDate);
            setSalesDays(Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
        } catch {
            setError("Unable to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [selectedBranch, fromDate, toDate, searchQuery, router]);

    /* ── Export CSV ─────────────────────────────────────── */
    const exportCSV = useCallback(() => {
        const headers = ["Inventory ID", "Branch Name", "Description"];
        months.forEach(m => {
            headers.push(`${m.label} Qty`);
            headers.push(`${m.label} Sales`);
        });
        headers.push("Total Qty");
        headers.push("Total Sales");

        const rows = salesData.map((r) => {
            const row = [r.inventoryId, r.branchName, r.description];
            months.forEach(m => {
                row.push(r.monthlyData[m.key]?.qty || 0);
                row.push(r.monthlyData[m.key]?.sales || 0);
            });
            row.push(r.totalQty);
            row.push(r.totalSales);
            return row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",");
        });

        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sales-periodic-${selectedBranch || "all"}-${fromDate}-to-${toDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [salesData, selectedBranch, fromDate, toDate, months]);

    /* ── Handle branch change ───────────────────────────── */
    const handleBranchChange = useCallback((e) => {
        const branch = e.target.value;
        setSelectedBranch(branch);
        if (salesData.length > 0) {
            fetchSales(fromDate, toDate, branch, searchQuery);
        }
    }, [salesData.length, fromDate, toDate, searchQuery, fetchSales]);

    /* ── Derived summary ────────────────────────────────── */
    const totalQtySold = salesData.reduce((s, r) => s + r.totalQty, 0);
    const totalAmountSold = salesData.reduce((s, r) => s + r.totalSales, 0);

    return (
        <div className="db-main">
            {/* ── Page title ─────────────────────────────── */}
            <div className="db-page-title">
                <h1>Last 3 Months Sales</h1>
                <p>Analyze monthly sales trends across different branches directly from Acumatica.</p>
            </div>

            {/* ── Filter toolbar ─────────────────────────── */}
            <div className="db-toolbar">
                <div className="db-toolbar-left">
                    {/* Search filter */}
                    <div className="db-search-wrapper" style={{ minWidth: "220px" }}>
                        <svg className="db-search-icon" style={{ left: '1rem', position: 'absolute', color: '#64748b' }} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                        <input
                            type="text"
                            className="db-search"
                            placeholder="Invoice # or ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && fetchSales(fromDate, toDate, selectedBranch, searchQuery)}
                        />
                    </div>

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
                        onClick={() => fetchSales(fromDate, toDate, selectedBranch, searchQuery)}
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
                            <span className="db-sales3m-card-label">Unique Products</span>
                        </div>
                        <div className="db-sales3m-card db-sales3m-card-blue">
                            <span className="db-sales3m-card-val">{totalQtySold.toLocaleString("en-PH", { maximumFractionDigits: 0 })}</span>
                            <span className="db-sales3m-card-label">Total Qty Sold</span>
                        </div>
                        <div className="db-sales3m-card db-sales3m-card-warn">
                            <span className="db-sales3m-card-val">₱{(totalAmountSold/1000).toFixed(1)}K</span>
                            <span className="db-sales3m-card-label">Total Revenue</span>
                        </div>
                        <div className="db-sales3m-card">
                            <span className="db-sales3m-card-val">{months.length}</span>
                            <span className="db-sales3m-card-label">Months Selected</span>
                        </div>
                    </div>

                    {/* Data table */}
                    <div className="db-sales3m-table-wrap">
                        <table className="db-table db-sales3m-table">
                            <thead>
                                <tr>
                                    <th rowSpan="2">#</th>
                                    <th rowSpan="2">Inventory ID</th>
                                    <th rowSpan="2">Branch</th>
                                    {months.map(m => (
                                        <th key={m.key} colSpan="2" className="db-centered-header">{m.label}</th>
                                    ))}
                                    <th colSpan="2" className="db-centered-header">Total Period</th>
                                </tr>
                                <tr>
                                    {months.map(m => (
                                        <Fragment key={m.key + "-sub"}>
                                            <th className="db-num">Qty</th>
                                            <th className="db-num">Sales</th>
                                        </Fragment>
                                    ))}
                                    <th className="db-num">Qty</th>
                                    <th className="db-num">Sales</th>
                                </tr>
                            </thead>
                            <tbody>
                                {salesData.map((r, i) => (
                                    <tr key={r.inventoryId + r.branchName + i}>
                                        <td className="db-row-num">{i + 1}</td>
                                        <td><span className="db-inv-id">{r.inventoryId}</span></td>
                                        <td>{r.branchName}</td>
                                        {months.map(m => (
                                            <Fragment key={m.key + "-val"}>
                                                <td className="db-num">{r.monthlyData[m.key]?.qty.toLocaleString() || 0}</td>
                                                <td className="db-num">₱{r.monthlyData[m.key]?.sales.toLocaleString() || 0}</td>
                                            </Fragment>
                                        ))}
                                        <td className="db-num"><strong>{r.totalQty.toLocaleString()}</strong></td>
                                        <td className="db-num"><strong>₱{r.totalSales.toLocaleString()}</strong></td>
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
