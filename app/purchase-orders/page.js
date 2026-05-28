"use client";

import { Fragment, useState } from "react";
import "@/styles/dashboard.css";
import "@/styles/stock-items.css";
import "@/styles/po.css";

const IconSearch = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);
const IconChevronDown = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

// Static Placeholder Data
const STATIC_ORDERS = [
    { orderNbr: "PO000123", orderType: "Normal", vendorName: "ABC Supplier", vendorId: "VEND001", status: "Open", date: "2026-05-20", totalAmount: 15000.50 },
    { orderNbr: "PO000124", orderType: "Normal", vendorName: "XYZ Trading", vendorId: "VEND002", status: "Closed", date: "2026-05-21", totalAmount: 8400.00 },
    { orderNbr: "PO000125", orderType: "Normal", vendorName: "Keling Phils", vendorId: "VEND003", status: "Completed", date: "2026-05-22", totalAmount: 22100.75 },
];

function fmt(n) { return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtDate(d) {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export default function PurchaseOrdersPage() {
    const [expanded, setExpanded] = useState({});

    const toggleExpand = (key) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

    return (
        <div className="db-root">
            <main className="db-main">
                <div className="db-page-title">
                    <h1>Purchase Orders</h1>
                    <p>Module Preview: View and manage all purchase orders (Static Placeholder).</p>
                </div>

                <div className="db-toolbar" style={{ height: 'auto', padding: '1.25rem' }}>
                    <div className="db-toolbar-left" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                        <div className="db-search-wrapper" style={{ flex: '1', minWidth: '250px', height: '42px' }}>
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search Order # (Static UI Only)..."
                                style={{ height: '40px', fontSize: '0.85rem' }}
                                disabled
                            />
                        </div>
                    </div>
                </div>

                <div className="db-table-wrap">
                    <table className="db-table po-table">
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th style={{ width: 140 }}>Order #</th>
                                <th>Type</th>
                                <th>Vendor</th>
                                <th style={{ width: 150 }}>Status</th>
                                <th>Order Date</th>
                                <th style={{ textAlign: "right" }}>Total Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {STATIC_ORDERS.map(po => {
                                const key = po.orderNbr;
                                const isOpen = !!expanded[key];
                                return (
                                    <Fragment key={key}>
                                        <tr className="db-clickable-row" onClick={() => toggleExpand(key)}>
                                            <td>
                                                <span className={`po-expand-icon ${isOpen ? "po-expand-open" : ""}`} style={{ color: '#94a3b8' }}>
                                                    <IconChevronDown />
                                                </span>
                                            </td>
                                            <td><span className="db-inv-id" style={{ background: '#eff6ff', borderColor: '#dbeafe' }}>{po.orderNbr}</span></td>
                                            <td><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>{po.orderType}</span></td>
                                            <td>
                                                <div style={{ fontWeight: '700', color: '#0f172a', fontSize: '0.85rem' }}>{po.vendorName}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{po.vendorId}</div>
                                            </td>
                                            <td>
                                                <span className="db-status-badge po-status-open">{po.status}</span>
                                            </td>
                                            <td><span style={{ fontSize: '0.8rem', color: '#475569' }}>{fmtDate(po.date)}</span></td>
                                            <td style={{ textAlign: "right" }}><strong style={{ color: '#0f172a' }}>₱{fmt(po.totalAmount)}</strong></td>
                                        </tr>
                                        {isOpen && (
                                            <tr className="po-lines-row">
                                                <td colSpan={7} style={{ padding: '1rem', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                                                    Item details placeholder...
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </main>
        </div>
    );
}
