"use client";

import { useState, useCallback, useEffect, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import "@/styles/dashboard.css";

/* ── SVG Icons ───────────────────────────────────── */
const CalendarIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
);
const DownloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" x1="12" x2="12" y2="3"></line></svg>
);
const BranchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
);
const IconChevronLeft = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6" />
    </svg>
);
const IconChevronRight = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
    </svg>
);

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function SalesPeriodicPage() {
    const router = useRouter();
    const [branchOptions, setBranchOptions] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [salesData, setSalesData] = useState([]);
    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [pagination, setPagination] = useState({ page: 1, pageSize: 15, totalItems: 0, totalPages: 0 });
    const [metrics, setMetrics] = useState({ overallStocks: 0, totalRevenue: 0, uniqueProducts: 0, totalQtySold: 0 });
    
    const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
    const [targetYear, setTargetYear] = useState(currentYear);

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
            } catch { }
        };
        fetchBranches();
    }, []);

    /* ── Fetch sales analysis ───────────────────────────── */
    const fetchSales = useCallback(async (page = 1) => {
        console.log(">>> [Sales UI] Calling /api/sales-periodic...");
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ 
                branch: selectedBranch, 
                month: targetMonth.toString(),
                year: targetYear.toString(),
                page: page.toString(),
                pageSize: "15"
            });
            const res = await fetch(`/api/sales-periodic?${params.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (!res.ok) { setError("Failed to load sales history."); return; }
            const result = await res.json();
            setSalesData(result.data || []);
            setMonths(result.months || []);
            setPagination(result.pagination || { page: 1, pageSize: 15, totalItems: 0, totalPages: 0 });
            setMetrics(result.metrics || { overallStocks: 0, totalRevenue: 0, uniqueProducts: 0, totalQtySold: 0 });
        } catch {
            setError("Unable to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [selectedBranch, targetMonth, targetYear, router]);

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
        a.download = `sales-periodic-${selectedBranch || "all"}-${targetMonth}-${targetYear}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [salesData, selectedBranch, targetMonth, targetYear, months]);

    return (
        <main className="db-main">
            <header className="db-page-title">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1>Product Periodic Sales</h1>
                        <p>3-Month Comparative Sales Analysis</p>
                    </div>
                    <button className="db-action-btn" onClick={exportCSV} disabled={salesData.length === 0}>
                        <DownloadIcon /> Export CSV
                    </button>
                </div>
            </header>

            <section className="db-sales3m-filter-panel" style={{ borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                <div className="db-sales3m-filter-row">
                    <div className="db-sales3m-filter-group">
                        <label><CalendarIcon /> Target Month</label>
                        <div className="db-select-wrapper" style={{ minWidth: '180px' }}>
                            <select 
                                className="db-select" 
                                value={targetMonth} 
                                onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                            >
                                {monthNames.map((name, i) => (
                                    <option key={name} value={i + 1}>{name}</option>
                                ))}
                            </select>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-9"/></svg>
                        </div>
                    </div>

                    <div className="db-sales3m-filter-group">
                        <label>Year</label>
                        <div className="db-select-wrapper" style={{ minWidth: '120px' }}>
                            <select 
                                className="db-select" 
                                value={targetYear} 
                                onChange={(e) => setTargetYear(parseInt(e.target.value))}
                            >
                                {years.map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-9"/></svg>
                        </div>
                    </div>

                    <div className="db-sales3m-filter-group">
                        <label><BranchIcon /> Branch / Warehouse</label>
                        <div className="db-select-wrapper" style={{ minWidth: '220px' }}>
                            <select className="db-select" value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
                                <option value="">All Branches</option>
                                {branchOptions.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-9"/></svg>
                        </div>
                    </div>

                    <button className="db-btn-run-analysis" onClick={() => fetchSales(1)} disabled={loading}>
                        {loading ? "Analyzing..." : "Run Analysis"}
                    </button>
                </div>
            </section>

            {error && <div className="db-error-card"><div className="db-error-body"><div className="db-error-title">Error</div><div className="db-error-msg">{error}</div></div></div>}

            {loading ? (
                <div className="db-loading">
                    <div className="db-spinner db-spinner-lg"></div>
                    <p>Fetching real-time data from Acumatica (This may take 1-2 minutes)...</p>
                </div>
            ) : (
                <>
                    {salesData.length > 0 && (
                        <div className="db-stats">
                            <div className="db-stat-card db-stat-blue">
                                <span className="db-stat-label">Overall Stocks ({selectedBranch || 'All'})</span>
                                <span className="db-stat-value">{metrics.overallStocks.toLocaleString()}</span>
                            </div>
                            <div className="db-stat-card">
                                <span className="db-stat-label">Overall Sales (3 Months)</span>
                                <span className="db-stat-value">₱{metrics.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="db-stat-card">
                                <span className="db-stat-label">Unique Products Sold</span>
                                <span className="db-stat-value">{metrics.uniqueProducts.toLocaleString()}</span>
                            </div>
                            <div className="db-stat-card">
                                <span className="db-stat-label">Total Units Sold</span>
                                <span className="db-stat-value">{metrics.totalQtySold.toLocaleString()}</span>
                            </div>
                        </div>
                    )}

                    <div className="db-table-wrap">
                        <table className="db-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Inventory ID</th>
                                    <th rowSpan={2} style={{ verticalAlign: 'middle' }}>Branch</th>
                                    <th rowSpan={2} style={{ verticalAlign: 'middle', width: '300px' }}>Description</th>
                                    {months.map(m => (
                                        <th key={m.key} colSpan={2} className="db-centered-header" style={{ textAlign: 'center' }}>
                                            {m.label.toUpperCase()}
                                        </th>
                                    ))}
                                    <th rowSpan={2} className="db-num" style={{ borderLeft: '2px solid #e2e8f0', verticalAlign: 'middle', fontWeight: '800' }}>TOTAL QTY</th>
                                    <th rowSpan={2} className="db-num" style={{ verticalAlign: 'middle', fontWeight: '800' }}>TOTAL SALES</th>
                                </tr>
                                <tr>
                                    {months.map(m => (
                                        <Fragment key={`${m.key}-sub`}>
                                            <th className="db-num" style={{ background: '#f8fafc', fontSize: '0.65rem' }}>QTY</th>
                                            <th className="db-num" style={{ background: '#f0f9ff', fontSize: '0.65rem' }}>SALES</th>
                                        </Fragment>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {salesData.length === 0 ? (
                                    <tr>
                                        <td colSpan={5 + (months.length * 2)} className="db-empty" style={{ textAlign: 'center', padding: '4rem' }}>
                                            <p>No data found for the selected period.</p>
                                            <span>Try selecting a different month or year.</span>
                                        </td>
                                    </tr>
                                ) : (
                                    salesData.map((row) => (
                                        <tr key={`${row.inventoryId}-${row.branchName}`}>
                                            <td><code className="db-inv-id">{row.inventoryId}</code></td>
                                            <td><span className="db-branch-tag">{row.branchName}</span></td>
                                            <td className="db-desc">{row.description}</td>
                                            {months.map(m => (
                                                <Fragment key={m.key}>
                                                    <td className="db-num">{(row.monthlyData[m.key]?.qty || 0).toLocaleString()}</td>
                                                    <td className="db-num">₱{(row.monthlyData[m.key]?.sales || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                </Fragment>
                                            ))}
                                            <td className="db-num" style={{ borderLeft: '2px solid #e2e8f0', fontWeight: '700' }}>
                                                {row.totalQty.toLocaleString()}
                                            </td>
                                            <td className="db-num" style={{ fontWeight: '700' }}>
                                                ₱{row.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {salesData.length > 0 && pagination.totalPages > 1 && (
                        <div className="si-pagination" style={{ marginTop: '20px' }}>
                            <span className="si-page-info">Page {pagination.page} of {pagination.totalPages}</span>
                            <div className="si-page-buttons">
                                <button 
                                    className="si-page-btn" 
                                    onClick={() => fetchSales(pagination.page - 1)} 
                                    disabled={pagination.page === 1}
                                >
                                    <IconChevronLeft /> Prev
                                </button>
                                <button 
                                    className="si-page-btn" 
                                    onClick={() => fetchSales(pagination.page + 1)} 
                                    disabled={pagination.page === pagination.totalPages}
                                >
                                    Next <IconChevronRight />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </main>
    );
}
