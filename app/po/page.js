"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import "@/styles/dashboard.css";
import "@/styles/stock-items.css";
import "@/styles/po.css";

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
const IconChevronDown = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

function poStatusClass(status) {
    const s = (status || "").toLowerCase();
    if (s === "open") return "po-status-open";
    if (s === "closed") return "po-status-closed";
    if (s === "completed") return "po-status-completed";
    if (s === "cancelled" || s === "canceled") return "po-status-cancelled";
    return "po-status-default";
}

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function POPage() {
    const [orders, setOrders] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [search, setSearch] = useState("");
    const [debSearch, setDebSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState({}); // orderNbr -> bool

    useEffect(() => {
        const t = setTimeout(() => setDebSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        Promise.resolve().then(() => setPage(1));
    }, [debSearch]);

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
            if (debSearch) params.set("search", debSearch);
            const res = await fetch(`/api/po?${params}`);
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setOrders(data.orders ?? []);
            setHasMore(data.hasMore ?? false);
        } catch (err) {
            setError(err.message || "Failed to load purchase orders.");
        } finally {
            setLoading(false);
        }
    }, [page, debSearch]);

    useEffect(() => {
        const controller = new AbortController();
        Promise.resolve().then(() => {
            if (!controller.signal.aborted) fetchOrders();
        });
        return () => controller.abort();
    }, [fetchOrders]);

    const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className="si-root">
            <div className="si-main">
                {/* Header */}
                <div className="db-page-title">
                    <h1>Incoming PO</h1>
                    <p>Purchase orders fetched live from Acumatica ERP</p>
                </div>

                {/* Toolbar */}
                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-search-wrapper">
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search by Order #, Vendor, or Description…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="db-toolbar-right">
                        <button className="si-page-btn" onClick={fetchOrders} disabled={loading}>
                            {loading ? "Loading…" : "Refresh"}
                        </button>
                    </div>
                </div>

                {error && <div className="si-error">{error}</div>}

                {/* Table */}
                <div className="db-table-wrap">
                    <table className="db-table po-table">
                        <thead>
                            <tr>
                                <th style={{ width: 32 }}></th>
                                <th>Order #</th>
                                <th>Type</th>
                                <th>Vendor</th>
                                <th>Status</th>
                                <th>Order Date</th>
                                <th>Promised</th>
                                <th>Lines</th>
                                <th style={{ textAlign: "right" }}>Total Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={9} className="si-loading-cell">Loading…</td></tr>
                            ) : orders.length === 0 ? (
                                <tr><td colSpan={9} className="si-empty-cell">No purchase orders found.</td></tr>
                            ) : orders.map(po => {
                                const key = `${po.orderType}-${po.orderNbr}`;
                                const isOpen = !!expanded[key];
                                return (
                                    <Fragment key={key}>
                                        <tr className={`po-row ${isOpen ? "po-row-expanded" : ""}`} onClick={() => toggleExpand(key)} style={{ cursor: "pointer" }}>
                                            <td>
                                                <span className={`po-expand-icon ${isOpen ? "po-expand-open" : ""}`}>
                                                    <IconChevronDown />
                                                </span>
                                            </td>
                                            <td><span className="si-id-chip">{po.orderNbr}</span></td>
                                            <td>{po.orderType}</td>
                                            <td>
                                                <div className="po-vendor">{po.vendorId}</div>
                                                {po.vendorName && <div className="po-vendor-name">{po.vendorName}</div>}
                                            </td>
                                            <td>
                                                <span className={`db-status-badge ${poStatusClass(po.status)}`}>{po.status || "—"}</span>
                                            </td>
                                            <td>{fmtDate(po.date)}</td>
                                            <td>{fmtDate(po.promisedOn)}</td>
                                            <td>{po.lineCount}</td>
                                            <td style={{ textAlign: "right" }}><strong>₱{fmt(po.totalAmount)}</strong></td>
                                        </tr>
                                        {isOpen && po.lines.length > 0 && (
                                            <tr className="po-lines-row">
                                                <td colSpan={9} style={{ padding: 0 }}>
                                                    <div className="po-lines-wrap">
                                                        <table className="po-lines-table">
                                                            <thead>
                                                                <tr>
                                                                    <th>Inventory ID</th>
                                                                    <th>Description</th>
                                                                    <th>Warehouse</th>
                                                                    <th>UOM</th>
                                                                    <th style={{ textAlign: "right" }}>Qty</th>
                                                                    <th style={{ textAlign: "right" }}>Unit Cost</th>
                                                                    <th style={{ textAlign: "right" }}>Ext. Cost</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {po.lines.map((line, i) => (
                                                                    <tr key={i}>
                                                                        <td><span className="si-id-chip si-id-chip-sm">{line.inventoryId || "—"}</span></td>
                                                                        <td>{line.description || "—"}</td>
                                                                        <td>{line.warehouseId || "—"}</td>
                                                                        <td>{line.uom || "—"}</td>
                                                                        <td style={{ textAlign: "right" }}>{Number(line.qty).toLocaleString()}</td>
                                                                        <td style={{ textAlign: "right" }}>₱{fmt(line.unitCost)}</td>
                                                                        <td style={{ textAlign: "right" }}>₱{fmt(line.extCost)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {!loading && (
                    <div className="si-pagination">
                        <span className="si-page-info">Page {page}</span>
                        <div className="si-page-buttons">
                            <button className="si-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                <IconChevronLeft /> Prev
                            </button>
                            <button className="si-page-btn" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
                                Next <IconChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
