"use client";

import { useState, useEffect, useCallback } from "react";
import { DataCache } from "@/lib/data-cache";
import InventoryDetailModal from "@/components/InventoryDetailModal";
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
        const t = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        Promise.resolve().then(() => setPage(1));
    }, [debouncedSearch]);

    const fetchItems = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
            if (debouncedSearch) params.set("search", debouncedSearch);
            const cacheKey = `stock_items_${params.toString()}`;

            const res = await fetch(`/api/stock-items?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setItems(data.items ?? []);
            setTotalCount(data.totalCount ?? 0);
            DataCache.set(cacheKey, data);
        } catch (err) {
            if (!isBackground) setError("Failed to load stock items. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const cacheKey = `stock_items_${params.toString()}`;

        const cached = DataCache.get(cacheKey);
        if (cached) {
            setItems(cached.items ?? []);
            setTotalCount(cached.totalCount ?? 0);
            setLoading(false);
            fetchItems(true);
        } else {
            fetchItems(false);
        }
    }, [fetchItems, page, debouncedSearch]);

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    return (
        <div className="db-root">
            <main className="db-main">
                <div className="db-page-title">
                    <h1>Stock Items Masterlist</h1>
                    <p>View all products and their configurations. Click a row to see detailed branch availability.</p>
                </div>

                <div className="db-stats">
                    <div className="db-stat-card db-stat-blue">
                        <span className="db-stat-label">Total Catalog</span>
                        <span className="db-stat-value">{loading && totalCount === 0 ? "..." : totalCount.toLocaleString()}</span>
                        <span className="db-stat-sub">Active Stock Items</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Current View</span>
                        <span className="db-stat-value">{items.length}</span>
                        <span className="db-stat-sub">Items on this page</span>
                    </div>
                </div>

                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-search-wrapper" style={{ maxWidth: '600px' }}>
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
                    <div className="db-toolbar-right">
                        <button className="db-refresh-btn" onClick={() => fetchItems()} disabled={loading}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {loading && <div className="db-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>}
                                <span>{loading ? "Loading..." : "Refresh List"}</span>
                            </div>
                        </button>
                    </div>
                </div>

                {error && <div className="si-error">{error}</div>}

                <div className="db-table-wrap">
                    <table className="db-table">
                        <thead>
                            <tr>
                                <th style={{ width: '200px' }}>Inventory ID</th>
                                <th>Description</th>
                                <th style={{ width: '250px' }}>Item Class</th>
                                <th style={{ width: '120px', textAlign: 'center' }}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && items.length === 0 ? (
                                <tr><td colSpan={4} className="si-loading-cell">
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                        <div className="db-spinner db-spinner-lg"></div>
                                        <span>Fetching items...</span>
                                    </div>
                                </td></tr>
                            ) : items.length === 0 ? (
                                <tr><td colSpan={4} className="si-empty-cell">No items found matching your search.</td></tr>
                            ) : items.map(item => (
                                <tr
                                    key={item.inventoryId}
                                    className={`db-clickable-row ${selectedId === item.inventoryId ? "si-row-selected" : ""}`}
                                    onClick={() => setSelectedId(item.inventoryId)}
                                >
                                    <td><span className="db-inv-id">{item.inventoryId}</span></td>
                                    <td className="db-desc" style={{ fontWeight: '500', color: '#0f172a' }}>{item.description}</td>
                                    <td><span className="db-class-tag">{item.itemClass}</span></td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button className="si-view-btn">View Details</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!loading && totalPages > 1 && (
                    <div className="db-pagination">
                        <span className="db-page-info">
                            Showing <strong>{((page - 1) * PAGE_SIZE) + 1}</strong> to <strong>{Math.min(page * PAGE_SIZE, totalCount)}</strong> of <strong>{totalCount}</strong> items
                        </span>
                        <div className="db-page-btns">
                            <button className="db-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                <IconChevronLeft />
                            </button>
                            <span className="db-page-dots">Page {page} of {totalPages}</span>
                            <button className="db-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                <IconChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {selectedId && (
                <InventoryDetailModal inventoryId={selectedId} onClose={() => setSelectedId(null)} />
            )}
        </div>
    );
}
