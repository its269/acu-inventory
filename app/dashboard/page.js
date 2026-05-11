"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import "@/styles/dashboard.css";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconLogout = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);

const IconChevron = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const IconBox = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
);

const IconFilter = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
);

const IconRefresh = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
);

const IconEmpty = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" />
        <line x1="9" y1="14" x2="15" y2="14" />
    </svg>
);

const ROWS_PER_PAGE = 20;

export default function DashboardPage() {
    const router = useRouter();
    const [allInventory, setAllInventory] = useState([]);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const searchTimer = useRef(null);

    /* ── Debounce Search ────────────────────────────── */
    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 400);
        return () => clearTimeout(searchTimer.current);
    }, [search]);

    /* ── Fetch Inventory (no branch filter — filter client-side) ── */
    const fetchInventory = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (debouncedSearch) params.set("search", debouncedSearch);

            const res = await fetch(`/api/inventory?${params.toString()}`);

            if (res.status === 401) {
                router.push("/signin");
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                setError(data?.message || "Failed to load inventory.");
                return;
            }

            setAllInventory(Array.isArray(data) ? data : []);
            setPage(1);
        } catch {
            setError("Unable to connect to the server.");
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, router]);

    useEffect(() => {
        fetchInventory();
    }, [fetchInventory]);

    /* ── Client-side filter by branch ──────────────── */
    const inventory = selectedBranch
        ? allInventory.filter((r) => r.Branch?.value === selectedBranch)
        : allInventory;

    /* ── Pagination ──────────────────────────────────── */
    const totalPages = Math.max(1, Math.ceil(inventory.length / ROWS_PER_PAGE));
    const paged = inventory.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

    /* ── Derived branch list from ALL loaded data ────── */
    const branches = [...new Set(
        allInventory.map((r) => r.Branch?.value).filter(Boolean)
    )].sort();

    /* ── Stats ──────────────────────────────────────── */
    const totalOnHand = inventory.reduce((s, r) => s + (Number(r.OnHand?.value) || 0), 0);
    const totalAvailable = inventory.reduce((s, r) => s + (Number(r.Available?.value) || 0), 0);
    const uniqueItems = new Set(inventory.map((r) => r.InventoryID?.value)).size;

    /* ── Helpers ────────────────────────────────────── */
    const fmt = (val) => {
        const n = Number(val);
        return isNaN(n) ? "—" : n.toLocaleString("en-PH", { minimumFractionDigits: 2 });
    };

    const cell = (row, key) => row[key]?.value ?? "—";

    const handleBranchChange = (e) => {
        setSelectedBranch(e.target.value);
        setPage(1);
    };

    return (
        <div className="db-root">
            {/* ── Top Nav ── */}
            <header className="db-nav">
                <div className="db-nav-left">
                    <div className="db-nav-brand">
                        <IconBox />
                        <span>Inventory</span>
                    </div>
                </div>
                <div className="db-nav-right">
                    <button
                        className="db-nav-logout"
                        onClick={() => router.push("/signin")}
                        title="Sign Out"
                    >
                        <IconLogout />
                        <span>Sign Out</span>
                    </button>
                </div>
            </header>

            <main className="db-main">
                {/* ── Page Title ── */}
                <div className="db-page-title">
                    <h1>Inventory Summary</h1>
                    <p>View and filter inventory records across branches</p>
                </div>

                {/* ── Stats ── */}
                <div className="db-stats">
                    <div className="db-stat-card">
                        <span className="db-stat-label">Unique Items</span>
                        <span className="db-stat-value">{uniqueItems.toLocaleString()}</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total On Hand</span>
                        <span className="db-stat-value">{totalOnHand.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total Available</span>
                        <span className="db-stat-value">{totalAvailable.toLocaleString("en-PH", { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Records Loaded</span>
                        <span className="db-stat-value">{inventory.length.toLocaleString()}</span>
                    </div>
                </div>

                {/* ── Toolbar ── */}
                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-select-wrapper">
                            <IconFilter />
                            <select
                                className="db-select"
                                value={selectedBranch}
                                onChange={handleBranchChange}
                            >
                                <option value="">All Branches</option>
                                {branches.map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                            <IconChevron />
                        </div>

                        <div className="db-search-wrapper">
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search inventory ID or description…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <button className="db-refresh-btn" onClick={fetchInventory} title="Refresh">
                        <IconRefresh />
                        <span>Refresh</span>
                    </button>
                </div>

                {/* ── Error ── */}
                {error && <div className="db-error">{error}</div>}

                {/* ── Table ── */}
                <div className="db-table-wrap">
                    {loading ? (
                        <div className="db-loading">
                            <div className="db-spinner" />
                            <span>Loading inventory…</span>
                        </div>
                    ) : paged.length === 0 ? (
                        <div className="db-empty">
                            <IconEmpty />
                            <p>No records found</p>
                            <span>Try changing the branch or search term</span>
                        </div>
                    ) : (
                        <table className="db-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Inventory ID</th>
                                    <th>Description</th>
                                    <th>Site ID</th>
                                    <th>Location ID</th>
                                    <th className="db-num">On Hand</th>
                                    <th className="db-num">Available</th>
                                    <th className="db-num">Avail. for Shipping</th>
                                    <th className="db-num">Default Price</th>
                                    <th>Item Class</th>
                                    <th>Branch</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((row, i) => {
                                    const onHand = Number(row.OnHand?.value) || 0;
                                    const available = Number(row.Available?.value) || 0;
                                    return (
                                        <tr key={i} className={onHand > 0 ? "db-row-active" : ""}>
                                            <td className="db-row-num">{(page - 1) * ROWS_PER_PAGE + i + 1}</td>
                                            <td>
                                                <span className="db-inv-id">{cell(row, "InventoryID")}</span>
                                            </td>
                                            <td className="db-desc">{cell(row, "Description")}</td>
                                            <td>{cell(row, "SiteID")}</td>
                                            <td>{cell(row, "LocationID")}</td>
                                            <td className="db-num">
                                                <span className={onHand > 0 ? "db-badge db-badge-green" : "db-badge"}>
                                                    {fmt(row.OnHand?.value)}
                                                </span>
                                            </td>
                                            <td className="db-num">
                                                <span className={available > 0 ? "db-badge db-badge-blue" : "db-badge"}>
                                                    {fmt(row.Available?.value)}
                                                </span>
                                            </td>
                                            <td className="db-num">{fmt(row.AvailForShip?.value)}</td>
                                            <td className="db-num">{fmt(row.DefaultPrice?.value)}</td>
                                            <td>
                                                <span className="db-class-tag">{cell(row, "ItemClass")}</span>
                                            </td>
                                            <td>
                                                <span className="db-branch-tag">{cell(row, "Branch")}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Pagination ── */}
                {!loading && inventory.length > ROWS_PER_PAGE && (
                    <div className="db-pagination">
                        <span className="db-page-info">
                            Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{Math.min(page * ROWS_PER_PAGE, inventory.length)} of {inventory.length}
                        </span>
                        <div className="db-page-btns">
                            <button className="db-page-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
                            <button className="db-page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
                            {(() => {
                                const windowSize = Math.min(5, totalPages);
                                const start = Math.max(1, Math.min(page - Math.floor(windowSize / 2), totalPages - windowSize + 1));
                                return Array.from({ length: windowSize }, (_, i) => start + i).map((p) => (
                                    <button
                                        key={p}
                                        className={`db-page-btn ${p === page ? "db-page-btn-active" : ""}`}
                                        onClick={() => setPage(p)}
                                    >{p}</button>
                                ));
                            })()}
                            <button className="db-page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
                            <button className="db-page-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
