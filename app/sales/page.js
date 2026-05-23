"use client";

import { useState, useCallback, useEffect, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { DataCache } from "@/lib/data-cache";
import "@/styles/dashboard.css";

/* ── SVG Icons ───────────────────────────────────── */
const CalendarIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
);
const DownloadIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
);
const BranchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
);

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);

export default function SalesPeriodicPage() {
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [branchOptions, setBranchOptions] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [salesData, setSalesData] = useState([]);
    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [targetMonth, setTargetMonth] = useState(new Date().getMonth() + 1);
    const [targetYear, setTargetYear] = useState(currentYear);

    // Initial hydration and restore from localStorage
    useEffect(() => {
        setMounted(true);
        const branch = localStorage.getItem("sales_filter_branch") || "";
        const month = localStorage.getItem("sales_filter_month");
        const year = localStorage.getItem("sales_filter_year");

        if (branch) setSelectedBranch(branch);
        if (month) setTargetMonth(parseInt(month));
        if (year) setTargetYear(parseInt(year));
    }, []);

    // Save filters to localStorage when they change
    useEffect(() => {
        if (!mounted) return;
        localStorage.setItem("sales_filter_branch", selectedBranch);
        localStorage.setItem("sales_filter_month", targetMonth.toString());
        localStorage.setItem("sales_filter_year", targetYear.toString());
    }, [selectedBranch, targetMonth, targetYear, mounted]);

    /* ── Fetch branches ─────────────────────────────────── */
    useEffect(() => {
        const fetchBranches = async () => {
            const cacheKey = "branches";
            const cached = DataCache.get(cacheKey);
            if (cached) setBranchOptions(cached);

            try {
                const res = await fetch("/api/branches");
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.value || []);
                    const names = list.map((b) => b.SiteID || b.BranchName?.value || b.BranchID?.value).filter(Boolean);
                    const unique = [...new Set(names)].sort();
                    setBranchOptions(unique);
                    DataCache.set(cacheKey, unique);
                }
            } catch { }
        };
        fetchBranches();
    }, []);

    /* ── Fetch sales analysis ───────────────────────────── */
    const fetchSales = useCallback(async (isBackground = false) => {
        if (!isBackground) {
            setLoading(true);
            setError("");
            setSalesData([]);
            setMonths([]);
        }
        try {
            const params = new URLSearchParams({
                branch: selectedBranch,
                month: targetMonth.toString(),
                year: targetYear.toString()
            });
            const cacheKey = `sales_periodic_${params.toString()}`;

            const res = await fetch(`/api/sales-periodic?${params.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (!res.ok) {
                if (!isBackground) setError("Failed to load sales history.");
                return;
            }
            const result = await res.json();
            setSalesData(result.data || []);
            setMonths(result.months || []);
            DataCache.set(cacheKey, result);
        } catch {
            if (!isBackground) setError("Unable to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [selectedBranch, targetMonth, targetYear, router]);

    /* ── Restore from cache ─────────────────────────────── */
    useEffect(() => {
        const params = new URLSearchParams({
            branch: selectedBranch,
            month: targetMonth.toString(),
            year: targetYear.toString()
        });
        const cacheKey = `sales_periodic_${params.toString()}`;
        const cached = DataCache.get(cacheKey);
        if (cached) {
            setSalesData(cached.data || []);
            setMonths(cached.months || []);
        }
    }, []);

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

    const totalQtySold = salesData.reduce((s, r) => s + r.totalQty, 0);
    const totalAmountSold = salesData.reduce((s, r) => s + r.totalSales, 0);

    return (
        <div className="db-root" style={{ display: 'block', background: '#f8fafc', minHeight: '100vh' }}>
            <main className="db-main" style={{ maxWidth: '100%' }}>
                <div className="db-page-title">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1>Product Periodic Sales</h1>
                            <p>3-Month Comparative Sales Analysis based on Target Month. Fetched live from Acumatica.</p>
                        </div>
                        <button className="db-action-btn" onClick={exportCSV} disabled={salesData.length === 0}>
                            <DownloadIcon /> Export CSV
                        </button>
                    </div>
                </div>

                <div className="db-stats">
                    <div className="db-stat-card db-stat-blue">
                        <span className="db-stat-label">3M Total Volume</span>
                        <span className="db-stat-value">{salesData.length > 0 ? totalQtySold.toLocaleString() : "—"}</span>
                        <span className="db-stat-sub">Units Sold</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">3M Total Revenue</span>
                        <span className="db-stat-value">{salesData.length > 0 ? `₱${totalAmountSold.toLocaleString(undefined, { minimumFractionDigits: 0 })}` : "—"}</span>
                        <span className="db-stat-sub">Gross Sales</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Analyzing For</span>
                        <span className="db-stat-value" style={{ fontSize: '1.25rem' }}>{monthNames[targetMonth - 1]} {targetYear}</span>
                        <span className="db-stat-sub">Target Period</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Scope</span>
                        <span className="db-stat-value" style={{ fontSize: '1.1rem' }}>{selectedBranch || "All Branches"}</span>
                        <span className="db-stat-sub">Branch Selection</span>
                    </div>
                </div>

                <section className="db-toolbar" style={{ height: 'auto', padding: '1.25rem' }}>
                    <div className="db-toolbar-left" style={{ flexWrap: 'wrap', gap: '1.5rem' }}>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ right: '0.9rem' }}><path d="m6 9 6 6 6-9" /></svg>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ right: '0.9rem' }}><path d="m6 9 6 6 6-9" /></svg>
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
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ right: '0.9rem' }}><path d="m6 9 6 6 6-9" /></svg>
                            </div>
                        </div>
                    </div>

                    <div className="db-toolbar-right" style={{ alignSelf: 'flex-end' }}>
                        <button
                            type="button"
                            className="db-btn-run-analysis"
                            onClick={() => fetchSales()}
                            disabled={loading}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minWidth: '160px' }}
                        >
                            {loading && <div className="db-spinner" style={{ width: '16px', height: '16px', borderWidth: '2.5px', borderTopColor: '#fff' }}></div>}
                            <span>{loading ? "Analyzing..." : "Run Analysis"}</span>
                        </button>
                    </div>
                </section>

                {error && <div className="db-error-card"><div className="db-error-body"><div className="db-error-title">Error</div><div className="db-error-msg">{error}</div></div></div>}

                {loading && salesData.length === 0 ? (
                    <div className="db-loading">
                        <div className="db-spinner db-spinner-lg"></div>
                        <p>Fetching real-time data from Acumatica...</p>
                    </div>
                ) : (
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
                                    <th rowSpan={2} className="db-num" style={{ verticalAlign: 'middle', fontWeight: '800' }}>TOTAL QTY</th>
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
                                            <td className="db-desc" style={{ fontSize: '0.8rem' }}>{row.description}</td>
                                            {months.map(m => (
                                                <Fragment key={m.key}>
                                                    <td className="db-num">{(row.monthlyData[m.key]?.qty || 0).toLocaleString()}</td>
                                                    <td className="db-num">₱{(row.monthlyData[m.key]?.sales || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}</td>
                                                </Fragment>
                                            ))}
                                            <td className="db-num" style={{ fontWeight: '700' }}>
                                                {row.totalQty.toLocaleString()}
                                            </td>
                                            <td className="db-num" style={{ fontWeight: '700' }}>
                                                ₱{row.totalSales.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </main>
        </div>
    );
}
