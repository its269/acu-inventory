"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo, Fragment } from "react";
import { useRouter } from "next/navigation";
import "@/styles/dashboard.css";

/* ── SVG Icons ─────────────────────────────────────────────── */
const IconBarChart = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
));
IconBarChart.displayName = "IconBarChart";

const IconLogout = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
));
IconLogout.displayName = "IconLogout";
const IconSearch = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
));
IconSearch.displayName = "IconSearch";
const IconChevron = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
));
IconChevron.displayName = "IconChevron";
const IconBox = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
));
IconBox.displayName = "IconBox";
const IconFilter = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
));
IconFilter.displayName = "IconFilter";
const IconRefresh = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
));
IconRefresh.displayName = "IconRefresh";
const IconClose = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
));
IconClose.displayName = "IconClose";

/* ── Constants ────────────────────────────────────────────── */
const ROWS_PER_PAGE = 15;
const LOW_STOCK_THRESHOLD = 10;

const getStatus = (onHand) => {
    if (onHand <= 0) return "OUT_OF_STOCK";
    if (onHand <= LOW_STOCK_THRESHOLD) return "LOW_STOCK";
    return "IN_STOCK";
};
const STATUS_LABEL = { IN_STOCK: "In Stock", LOW_STOCK: "Low Stock", OUT_OF_STOCK: "Out of Stock" };
const STATUS_CLASS = { IN_STOCK: "db-status-in", LOW_STOCK: "db-status-low", OUT_OF_STOCK: "db-status-out" };
const cellVal = (row, key) => {
    const val = row[key]?.value;
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") return "—";
    return val;
};

/* ── Table Row Component ───────────────────────────────────── */
const InventoryRow = memo(({ row, index, onClick }) => {
    const onHand = Number(row.OnHand?.value) || 0;
    const available = Number(row.Available?.value) || 0;
    const status = getStatus(onHand);
    const price = Number(row.DefaultPrice?.value) || 0;
    
    return (
        <tr 
            className={`${status === "LOW_STOCK" ? "db-row-warn" : status === "OUT_OF_STOCK" ? "db-row-danger" : ""} db-clickable-row`}
            onClick={() => onClick(cellVal(row, "InventoryID"))}
        >
            <td className="db-row-num">{index}</td>
            <td><span className="db-inv-id">{cellVal(row, "InventoryID")}</span></td>
            <td className="db-desc">{cellVal(row, "Description")}</td>
            <td><span className="db-branch-tag">{cellVal(row, "Branch")}</span></td>
            <td>{cellVal(row, "SiteID")}</td>
            <td className="db-num"><span className={onHand > 0 ? "db-badge db-badge-green" : "db-badge"}>{onHand.toLocaleString()}</span></td>
            <td className="db-num"><span className={available > 0 ? "db-badge db-badge-blue" : "db-badge"}>{available.toLocaleString()}</span></td>
            <td className="db-num">₱{price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
            <td><span className="db-class-tag">{cellVal(row, "ItemClass")}</span></td>
            <td><span className={`db-status-badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span></td>
        </tr>
    );
});
InventoryRow.displayName = "InventoryRow";

/* ── Sales Analysis Modal Component ────────────────────────── */
const SalesAnalysisModal = ({ isOpen, onClose, initialProductId }) => {
    const [branchOptions, setBranchOptions] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [salesData, setSalesData] = useState([]);
    const [months, setMonths] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [search, setSearch] = useState(initialProductId || "");

    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (!isOpen) return;
        const fetchBranches = async () => {
            try {
                const res = await fetch("/api/branches");
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.value || []);
                    const names = list.map((b) => b.SiteID || b.BranchName?.value || b.BranchID?.value).filter(Boolean);
                    setBranchOptions([...new Set(names)].sort());
                }
            } catch {}
        };
        fetchBranches();
    }, [isOpen]);

    const fetchSales = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams({ branch: selectedBranch, startDate: fromDate, endDate: toDate });
            const res = await fetch(`/api/sales-periodic?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to load sales");
            const result = await res.json();
            
            let filtered = result.data || [];
            if (search) {
                filtered = filtered.filter(item => 
                    item.inventoryId.toLowerCase().includes(search.toLowerCase())
                );
            }
            setSalesData(filtered);
            setMonths(result.months || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [selectedBranch, fromDate, toDate, search]);

    useEffect(() => {
        if (isOpen) fetchSales();
    }, [isOpen, fetchSales]);

    if (!isOpen) return null;

    return (
        <div className="db-modal-overlay">
            <div className="db-modal db-modal-fullwide">
                <div className="db-modal-header">
                    <div className="db-modal-title"><IconBarChart /> <span>Product Periodic Sales Analysis</span></div>
                    <button className="db-modal-close" onClick={onClose}><IconClose /></button>
                </div>
                
                <div className="db-sales3m-filter-panel">
                    <div className="db-sales3m-filter-row">
                        <div className="db-sales3m-filter-group">
                            <label>Branch</label>
                            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="db-select" style={{ height: '42px', minWidth: '200px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0 1rem' }}>
                                <option value="">All Branches</option>
                                {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                        </div>
                        <div className="db-sales3m-filter-group">
                            <label>From</label>
                            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                        </div>
                        <span className="db-sales3m-filter-arrow">→</span>
                        <div className="db-sales3m-filter-group">
                            <label>To</label>
                            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                        </div>
                        <div className="db-sales3m-filter-group" style={{ flex: 1 }}>
                            <label>Filter Product ID</label>
                            <input 
                                type="text" 
                                placeholder="Search Product ID..." 
                                value={search} 
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ height: '42px', width: '100%', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0 1rem' }}
                            />
                        </div>
                        <button className="db-btn-run-analysis" onClick={fetchSales} disabled={loading}>
                            {loading ? "Loading..." : "Refresh Report"}
                        </button>
                    </div>
                </div>

                <div className="db-modal-body" style={{ background: '#f8fafc' }}>
                    {error ? (
                        <div className="db-error-card"><div className="db-error-body"><p>{error}</p></div></div>
                    ) : salesData.length === 0 && !loading ? (
                        <div className="db-empty"><IconBarChart /><p>No sales data found for this period.</p></div>
                    ) : (
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
                    )}
                </div>
            </div>
        </div>
    );
};

export default function DashboardPage() {
    const router = useRouter();

    /* ── State ────────────────────────────────────────────── */
    const [allInventory, setAllInventory] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [globalStats, setGlobalStats] = useState({ totalValue: 0, lowStock: 0, outOfStock: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [branchOptions, setBranchOptions] = useState([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [userName, setUserName] = useState("");
    const [showSalesModal, setShowSalesModal] = useState(false);
    const [activeProductId, setActiveProductId] = useState("");
    const searchTimer = useRef(null);

    /* ── Init Data ────────────────────────────────────────── */
    useEffect(() => {
        const display = localStorage.getItem("userName") || "User";
        setUserName(display);

        const fetchBranches = async () => {
            try {
                const res = await fetch("/api/branches");
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.value || []);
                    const names = list.map((b) => b.SiteID || b.BranchName?.value).filter(Boolean);
                    setBranchOptions([...new Set(names)].sort());
                }
            } catch (err) { console.error("Branch fetch error", err); }
        };
        fetchBranches();
    }, []);

    /* ── Fetch Data ───────────────────────────────────────── */
    const fetchInventory = useCallback(async () => {
        setLoading(true);
        try {
            const dataParams = new URLSearchParams({ page: String(page), pageSize: String(ROWS_PER_PAGE), search: debouncedSearch, branch: selectedBranch, count: "true", stats: "true", source: "supabase" });
            const res = await fetch(`/api/inventory?${dataParams.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (res.ok) {
                const result = await res.json();
                setAllInventory(result.data || []);
                setTotalCount(result.totalCount || 0);
                setHasMore(!!result.hasMore);
                if (result.globalStats) setGlobalStats(result.globalStats);
            }
        } catch (e) { console.error("Fetch error", e); }
        setLoading(false);
    }, [page, debouncedSearch, selectedBranch, router]);

    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
        return () => clearTimeout(searchTimer.current);
    }, [search]);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    const initials = useMemo(() => {
        const parts = userName.split(" ");
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
        return userName.slice(0, 2).toUpperCase();
    }, [userName]);

    /* ── Render ───────────────────────────────────────────── */
    return (
        <div className="db-root" style={{ display: 'block', background: '#f8fafc', minHeight: '100vh' }}>
            <main className="db-main" style={{ maxWidth: '1400px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                    <div className="db-logo" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="db-user-avatar" style={{ background: '#0f172a', width: '40px', height: '40px' }}><IconBox /></div>
                        <div>
                            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', lineHeight: '1.1' }}>ACU</div>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Inventory</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div className="db-user-chip">
                            <div className="db-user-avatar">{initials}</div>
                            <span className="db-user-name">{userName}</span>
                        </div>
                        <button className="db-refresh-btn" style={{ padding: '0.5rem', width: '40px' }} onClick={() => router.push("/signin")}><IconLogout /></button>
                    </div>
                </div>

                <div className="db-page-title">
                    <h1>Inventory Dashboard</h1>
                    <p>Manage and monitor stock levels across all locations.</p>
                </div>

                <div className="db-stats">
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total Products</span>
                        <span className="db-stat-value">{totalCount.toLocaleString()}</span>
                        <span className="db-stat-sub">{selectedBranch || "All Branches"}</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total Value</span>
                        <span className="db-stat-value">₱{globalStats.totalValue.toLocaleString("en-PH", { minimumFractionDigits: 0 })}</span>
                        <span className="db-stat-sub">Estimated inventory value</span>
                    </div>
                    <div className="db-stat-card db-stat-warn">
                        <span className="db-stat-label">Low Stock</span>
                        <span className="db-stat-value">{globalStats.lowStock.toLocaleString()}</span>
                        <span className="db-stat-sub">Under {LOW_STOCK_THRESHOLD} units</span>
                    </div>
                    <div className="db-stat-card db-stat-danger">
                        <span className="db-stat-label">Out of Stock</span>
                        <span className="db-stat-value">{globalStats.outOfStock.toLocaleString()}</span>
                        <span className="db-stat-sub">Zero units on hand</span>
                    </div>
                </div>

                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-select-wrapper">
                            <IconFilter />
                            <select className="db-select" value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setPage(1); }}>
                                <option value="">All Branches</option>
                                {branchOptions.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <IconChevron />
                        </div>
                        <div className="db-search-wrapper">
                            <IconSearch />
                            <input className="db-search" type="text" placeholder="Search ID or description..." value={search} onChange={(e) => setSearch(e.target.value)} />
                        </div>
                    </div>
                    <div className="db-toolbar-right">
                        <button className="db-action-btn db-action-sales3m" onClick={() => { setActiveProductId(""); setShowSalesModal(true); }}>
                            <IconBarChart /> <span>Periodic Sales</span>
                        </button>
                        <button className="db-refresh-btn" onClick={fetchInventory}><IconRefresh /> <span>Refresh</span></button>
                    </div>
                </div>

                <div className="db-table-wrap">
                    {loading ? (
                        <div className="db-loading"><div className="db-spinner" /><span>Loading data...</span></div>
                    ) : (
                        <table className="db-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Inventory ID</th>
                                    <th>Description</th>
                                    <th>Branch</th>
                                    <th>Site</th>
                                    <th className="db-num">On Hand</th>
                                    <th className="db-num">Available</th>
                                    <th className="db-num">Price</th>
                                    <th>Class</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {allInventory.map((row, i) => (
                                    <InventoryRow 
                                        key={i} 
                                        row={row} 
                                        index={(page - 1) * ROWS_PER_PAGE + i + 1} 
                                        onClick={(id) => { setActiveProductId(id); setShowSalesModal(true); }}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="db-pagination">
                    <span className="db-page-info">Showing {allInventory.length} items</span>
                    <div className="db-page-btns">
                        <button className="db-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lsaquo;</button>
                        <span className="db-page-dots">Page {page}</span>
                        <button className="db-page-btn" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>&rsaquo;</button>
                    </div>
                </div>

                <SalesAnalysisModal 
                    isOpen={showSalesModal} 
                    onClose={() => setShowSalesModal(false)} 
                    initialProductId={activeProductId} 
                />
            </main>
        </div>
    );
}
