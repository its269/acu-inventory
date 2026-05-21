"use client";

import { useState, useEffect, useCallback } from "react";
import "@/styles/dashboard.css";
import "@/styles/stock-items.css";

const PAGE_SIZE = 50;

const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
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
const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

function stockStatus(onHand) {
    if (onHand <= 0) return { label: "Out of Stock", cls: "db-status-out" };
    if (onHand <= 10) return { label: "Low Stock", cls: "db-status-low" };
    return { label: "In Stock", cls: "db-status-in" };
}

function fmtDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/* ── Detail Panel ───────────────────────────────────────── */
function DetailPanel({ inventoryId, onClose }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!inventoryId) return;

        // Use a microtask to avoid synchronous state update in effect body
        const controller = new AbortController();
        Promise.resolve().then(() => {
            if (controller.signal.aborted) return;
            setLoading(true);
            setDetail(null);
            setError(null);
            fetch(`/api/stock-items/${encodeURIComponent(inventoryId)}`, { signal: controller.signal })
                .then(r => r.json())
                .then(d => { setDetail(d); setLoading(false); })
                .catch((err) => {
                    if (err.name !== 'AbortError') {
                        setError("Failed to load details.");
                        setLoading(false);
                    }
                });
        });
        return () => controller.abort();
    }, [inventoryId]);

    const totalStatus = detail ? stockStatus(detail.totalOnHand) : null;

    return (
        <div className="si-detail-overlay" onClick={onClose}>
            <div className="si-detail-panel" onClick={e => e.stopPropagation()}>
                <div className="si-detail-header">
                    <div>
                        <span className="si-id-chip">{inventoryId}</span>
                        {detail && <span className="si-detail-class">{detail.itemClass}</span>}
                    </div>
                    <button className="si-detail-close" onClick={onClose}><IconClose /></button>
                </div>

                {loading && <div className="si-loading-cell" style={{ padding: "32px", textAlign: "center" }}>Loading…</div>}
                {error && <div className="si-error">{error}</div>}

                {detail && !loading && (
                    <>
                        <div className="si-detail-name">{detail.description}</div>

                        {/* Data source badge */}
                        <div style={{ padding: "0 1.5rem 0.25rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                            {detail.source === "acumatica" && (
                                <span className="si-source-badge si-source-live">● Live from Acumatica</span>
                            )}
                            {detail.source === "supabase" && (
                                <span className="si-source-badge si-source-cache">● From local database</span>
                            )}
                            {detail.notice && (
                                <span className="si-source-badge si-source-warn">{detail.notice}</span>
                            )}
                        </div>

                        {/* Summary cards */}
                        <div className="si-detail-cards">
                            <div className="si-detail-card">
                                <div className="si-detail-card-label">Total On Hand</div>
                                <div className="si-detail-card-value">{Number(detail.totalOnHand).toLocaleString()}</div>
                                <span className={`db-status-badge ${totalStatus.cls}`} style={{ marginTop: 6 }}>{totalStatus.label}</span>
                            </div>
                            <div className="si-detail-card">
                                <div className="si-detail-card-label">Total Available</div>
                                <div className="si-detail-card-value">{Number(detail.totalAvailable).toLocaleString()}</div>
                            </div>
                            <div className="si-detail-card">
                                <div className="si-detail-card-label">Unit Price</div>
                                <div className="si-detail-card-value">₱{Number(detail.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            </div>
                            <div className="si-detail-card">
                                <div className="si-detail-card-label">Base Unit</div>
                                <div className="si-detail-card-value">{detail.baseUnit || "—"}</div>
                            </div>
                        </div>

                        <div className="si-detail-meta">
                            <span>Item Status: <strong>{detail.itemStatus}</strong></span>
                            <span>Item Class: <strong>{detail.itemClass}</strong></span>
                            {detail.lastSync && <span>Last Sync: <strong>{fmtDate(detail.lastSync)}</strong></span>}
                        </div>

                        {/* Per-branch breakdown */}
                        <div className="si-detail-section-title">Qty. On Hand by Warehouse / Branch</div>
                        {detail.branches.length === 0 ? (
                            <div className="si-empty-cell" style={{ padding: "1.5rem" }}>No warehouse data available.</div>
                        ) : (
                            <div className="db-table-wrap" style={{ marginTop: 0 }}>
                                <table className="db-table">
                                    <thead>
                                        <tr>
                                            <th>Warehouse</th>
                                            <th style={{ textAlign: "right" }}>Qty. On Hand</th>
                                            <th style={{ textAlign: "right" }}>Available</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.branches.map(b => {
                                            const s = stockStatus(b.onHand);
                                            return (
                                                <tr key={b.branchId}>
                                                    <td><strong>{b.branchId}</strong></td>
                                                    <td style={{ textAlign: "right", fontWeight: 700 }}>{Number(b.onHand).toLocaleString()}</td>
                                                    <td style={{ textAlign: "right" }}>{Number(b.available).toLocaleString()}</td>
                                                    <td><span className={`db-status-badge ${s.cls}`}>{s.label}</span></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: "2px solid #e2e8f0", fontWeight: 700 }}>
                                            <td>TOTAL</td>
                                            <td style={{ textAlign: "right" }}>{Number(detail.totalOnHand).toLocaleString()}</td>
                                            <td style={{ textAlign: "right" }}>{Number(detail.totalAvailable).toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function StockItemsPage() {
    const [items, setItems] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedId, setSelectedId] = useState(null);

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        Promise.resolve().then(() => setPage(1));
    }, [debouncedSearch]);

    const fetchItems = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
            if (debouncedSearch) params.set("search", debouncedSearch);
            const res = await fetch(`/api/stock-items?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setItems(data.items ?? []);
            setTotalCount(data.totalCount ?? 0);
        } catch (err) {
            setError("Failed to load stock items. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        const controller = new AbortController();
        Promise.resolve().then(() => {
            if (!controller.signal.aborted) fetchItems();
        });
        return () => controller.abort();
    }, [fetchItems]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    return (
        <div className="si-root">
            <div className="si-main">
                <div className="db-page-title">
                    <h1>Stock Items</h1>
                    <p>All products — click any item to view stock details across branches</p>
                </div>

                <div className="si-summary-row">
                    <span className="si-total-chip">
                        {loading ? "Loading…" : `${totalCount.toLocaleString()} products`}
                    </span>
                </div>

                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-search-wrapper">
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search by Inventory ID or description…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {error && <div className="si-error">{error}</div>}

                <div className="db-table-wrap">
                    <table className="db-table">
                        <thead>
                            <tr>
                                <th>Inventory ID</th>
                                <th>Description</th>
                                <th>Item Class</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={3} className="si-loading-cell">Loading…</td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={3} className="si-empty-cell">No items found.</td></tr>
                            ) : items.map(item => (
                                <tr
                                    key={item.inventoryId}
                                    className={`si-clickable-row ${selectedId === item.inventoryId ? "si-row-selected" : ""}`}
                                    onClick={() => setSelectedId(item.inventoryId)}
                                >
                                    <td><span className="si-id-chip">{item.inventoryId}</span></td>
                                    <td>{item.description}</td>
                                    <td>{item.itemClass}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!loading && totalPages > 1 && (
                    <div className="si-pagination">
                        <span className="si-page-info">Page {page} of {totalPages}</span>
                        <div className="si-page-buttons">
                            <button className="si-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                <IconChevronLeft /> Prev
                            </button>
                            <button className="si-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                Next <IconChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {selectedId && (
                <DetailPanel inventoryId={selectedId} onClose={() => setSelectedId(null)} />
            )}
        </div>
    );
}


