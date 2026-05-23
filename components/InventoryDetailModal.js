"use client";

import { useState, useEffect } from "react";
import { DataCache } from "@/lib/data-cache";
import "@/styles/inventory-detail.css";

const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const IconInfo = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
);

function stockStatus(onHand) {
    if (onHand <= 0) return { label: "Out of Stock", cls: "status-out" };
    if (onHand <= 10) return { label: "Low Stock", cls: "status-low" };
    return { label: "In Stock", cls: "status-in" };
}

function fmtDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function InventoryDetailModal({ inventoryId, onClose }) {
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!inventoryId) return;

        const cacheKey = `stock_detail_${inventoryId}`;
        const cached = DataCache.get(cacheKey);
        if (cached) {
            setDetail(cached);
            setLoading(false);
        }

        const controller = new AbortController();
        const fetchDetail = async () => {
            if (!cached) setLoading(true);
            setError(null);
            try {
                const r = await fetch(`/api/stock-items/${encodeURIComponent(inventoryId)}`, { signal: controller.signal });
                const d = await r.json();
                setDetail(d);
                DataCache.set(cacheKey, d);
            } catch (err) {
                if (err.name !== 'AbortError') setError("Failed to load details.");
            } finally {
                setLoading(false);
            }
        };

        fetchDetail();
        return () => controller.abort();
    }, [inventoryId]);

    if (!inventoryId) return null;

    const totalStatus = detail ? stockStatus(detail.totalOnHand) : null;

    return (
        <div className="idm-overlay" onClick={onClose}>
            <div className="idm-modal" onClick={e => e.stopPropagation()}>
                <button className="idm-close-btn" onClick={onClose} aria-label="Close">
                    <IconClose />
                </button>

                {loading && (
                    <div className="idm-loading">
                        <div className="idm-spinner"></div>
                        <p>Fetching item details...</p>
                    </div>
                )}

                {error && (
                    <div className="idm-error">
                        <p>{error}</p>
                        <button onClick={() => window.location.reload()}>Retry</button>
                    </div>
                )}

                {detail && !loading && (
                    <div className="idm-content">
                        {/* Header Section */}
                        <header className="idm-header">
                            <div className="idm-top-row">
                                <span className="idm-badge-id">{inventoryId}</span>
                                <span className="idm-badge-class">{detail.itemClass}</span>
                            </div>
                            <h2 className="idm-title">{detail.description}</h2>
                            
                            <div className="idm-source-row">
                                {detail.source === "acumatica" && (
                                    <span className="idm-source idm-source-live">● Live from Acumatica</span>
                                )}
                                {detail.source === "supabase" && (
                                    <span className="idm-source idm-source-cache">● From local database</span>
                                )}
                                {detail.notice && (
                                    <span className="idm-source idm-source-warn">● {detail.notice}</span>
                                )}
                            </div>
                        </header>

                        {/* Summary Cards */}
                        <div className="idm-grid">
                            <div className="idm-card">
                                <span className="idm-card-label">Total On Hand</span>
                                <div className="idm-card-value-group">
                                    <span className="idm-card-value">{Number(detail.totalOnHand).toLocaleString()}</span>
                                    <span className={`idm-status-pill ${totalStatus.cls}`}>{totalStatus.label}</span>
                                </div>
                            </div>
                            <div className="idm-card">
                                <span className="idm-card-label">Total Available</span>
                                <span className="idm-card-value">{Number(detail.totalAvailable).toLocaleString()}</span>
                            </div>
                            <div className="idm-card">
                                <span className="idm-card-label">Unit Price</span>
                                <span className="idm-card-value">₱{Number(detail.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="idm-card">
                                <span className="idm-card-label">Base Unit</span>
                                <span className="idm-card-value">{detail.baseUnit || "—"}</span>
                            </div>
                        </div>

                        {/* Metadata row */}
                        <div className="idm-meta-bar">
                            <div className="idm-meta-item">
                                <span className="idm-meta-label">Status:</span>
                                <span className="idm-meta-value">{detail.itemStatus}</span>
                            </div>
                            <div className="idm-meta-item">
                                <span className="idm-meta-label">Class:</span>
                                <span className="idm-meta-value">{detail.itemClass}</span>
                            </div>
                            {detail.lastSync && (
                                <div className="idm-meta-item">
                                    <span className="idm-meta-label">Last Sync:</span>
                                    <span className="idm-meta-value">{fmtDate(detail.lastSync)}</span>
                                </div>
                            )}
                        </div>

                        {/* Warehouse Breakdown */}
                        <div className="idm-section">
                            <h3 className="idm-section-title">Qty. On Hand by Warehouse / Branch</h3>
                            <div className="idm-table-container">
                                <table className="idm-table">
                                    <thead>
                                        <tr>
                                            <th>Warehouse</th>
                                            <th className="idm-txt-right">On Hand</th>
                                            <th className="idm-txt-right">Available</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail.branches.length === 0 ? (
                                            <tr><td colSpan={4} className="idm-empty">No warehouse data available.</td></tr>
                                        ) : (
                                            detail.branches.map(b => {
                                                const s = stockStatus(b.onHand);
                                                return (
                                                    <tr key={b.branchId}>
                                                        <td><strong>{b.branchId}</strong></td>
                                                        <td className="idm-txt-right idm-txt-bold">{Number(b.onHand).toLocaleString()}</td>
                                                        <td className="idm-txt-right">{Number(b.available).toLocaleString()}</td>
                                                        <td><span className={`idm-status-pill idm-status-pill-sm ${s.cls}`}>{s.label}</span></td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td>TOTAL</td>
                                            <td className="idm-txt-right">{Number(detail.totalOnHand).toLocaleString()}</td>
                                            <td className="idm-txt-right">{Number(detail.totalAvailable).toLocaleString()}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
