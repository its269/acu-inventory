"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { DataCache } from "@/lib/data-cache";
import "@/styles/dashboard.css";
import "@/styles/stock-items.css";

const PAGE_SIZE = 50;

/* ── SVG Icons ─────────────────────────────────────────── */
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
const IconTruck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 17h4V5H2v12h3" /><path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L17 7h-3v10" /><circle cx="7.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
);
const IconClock = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
);

const LEAD_TIME_OPTIONS = [
    { label: "1-2 Weeks", value: "1-2w" },
    { label: "3-4 Weeks", value: "3-4w" },
    { label: "1-2 Months", value: "1-2m" },
    { label: "3-6 Months", value: "3-6m" },
    { label: "On Demand", value: "od" },
];

export default function SuppliersPage() {
    /* ── State ────────────────────────────────────────────── */
    const [vendors, setVendors] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [leadTimes, setLeadTimes] = useState({});

    // Initial restoration & Hydration fix
    useEffect(() => {
        Promise.resolve().then(() => {
            const savedLeadTimes = localStorage.getItem("supplier_lead_times");
            if (savedLeadTimes) {
                try {
                    setLeadTimes(JSON.parse(savedLeadTimes));
                } catch (e) {
                    console.error("Failed to parse lead times", e);
                }
            }

            const params = new URLSearchParams({ page: "1", pageSize: String(PAGE_SIZE) });
            const cached = DataCache.get(`vendors_${params.toString()}`);
            if (cached) {
                setVendors(cached.vendors ?? []);
                setHasMore(cached.hasMore ?? false);
            }
        });
    }, []);

    // Save lead times to localStorage
    useEffect(() => {
        if (Object.keys(leadTimes).length > 0) {
            localStorage.setItem("supplier_lead_times", JSON.stringify(leadTimes));
        }
    }, [leadTimes]);

    const handleLeadTimeChange = (vendorId, value) => {
        setLeadTimes(prev => ({ ...prev, [vendorId]: value }));
    };

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(search), 350);
        return () => clearTimeout(t);
    }, [search]);

    useEffect(() => {
        Promise.resolve().then(() => setPage(1));
    }, [debouncedSearch]);

    const fetchVendors = useCallback(async (isBackground = false) => {
        if (!isBackground) setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
            if (debouncedSearch) params.set("search", debouncedSearch);
            const cacheKey = `vendors_${params.toString()}`;

            const res = await fetch(`/api/vendors?${params}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setVendors(data.vendors ?? []);
            setHasMore(data.hasMore ?? false);
            DataCache.set(cacheKey, data);
        } catch (err) {
            if (!isBackground) setError("Failed to load suppliers. Please try again.");
        } finally {
            setLoading(false);
        }
    }, [page, debouncedSearch]);

    useEffect(() => {
        const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch) params.set("search", debouncedSearch);
        const cacheKey = `vendors_${params.toString()}`;

        const cached = DataCache.get(cacheKey);
        if (cached) {
            Promise.resolve().then(() => fetchVendors(true));
        } else {
            Promise.resolve().then(() => fetchVendors(false));
        }
    }, [fetchVendors, page, debouncedSearch]);

    const stats = useMemo(() => {
        const total = vendors.length;
        const withLeadTime = Object.keys(leadTimes).filter(id => vendors.some(v => v.vendorId === id)).length;
        return { total, withLeadTime };
    }, [vendors, leadTimes]);

    return (
        <div className="db-root">
            <main className="db-main">
                <div className="db-page-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                        <div style={{ background: '#eff6ff', color: '#2563eb', padding: '0.75rem', borderRadius: '12px' }}>
                            <IconTruck />
                        </div>
                        <h1 style={{ margin: 0 }}>Suppliers Directory</h1>
                    </div>
                    <p>Manage your external suppliers and track average delivery lead times.</p>
                </div>

                <div className="db-stats" style={{ marginBottom: '2rem' }}>
                    <div className="db-stat-card db-stat-blue">
                        <span className="db-stat-label">Total Suppliers</span>
                        <span className="db-stat-value">{loading && vendors.length === 0 ? "..." : vendors.length}</span>
                        <span className="db-stat-sub">Active Vendors in ERP</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Tracked Lead Times</span>
                        <span className="db-stat-value">{stats.withLeadTime}</span>
                        <span className="db-stat-sub">Suppliers with user input</span>
                    </div>
                </div>

                <div className="db-toolbar" style={{ borderRadius: '16px', padding: '1.25rem' }}>
                    <div className="db-toolbar-left" style={{ flex: 1 }}>
                        <div className="db-search-wrapper" style={{ width: '100%', maxWidth: '500px' }}>
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search by Supplier ID or Name..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ height: '42px' }}
                            />
                        </div>
                    </div>
                    <div className="db-toolbar-right">
                        <button className="db-refresh-btn" onClick={() => fetchVendors()} disabled={loading}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {loading && <div className="db-spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div>}
                                <span>{loading ? "Syncing..." : "Refresh Suppliers"}</span>
                            </div>
                        </button>
                    </div>
                </div>

                {error && <div className="si-error">{error}</div>}

                <div className="db-table-wrap" style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <table className="db-table">
                        <thead style={{ background: '#f8fafc' }}>
                            <tr>
                                <th style={{ width: '200px', padding: '1.25rem' }}>Supplier ID</th>
                                <th style={{ padding: '1.25rem' }}>Supplier Name</th>
                                <th style={{ width: '180px', padding: '1.25rem', textAlign: 'center' }}>Reliability Score</th>
                                <th style={{ width: '220px', padding: '1.25rem' }}>Avg. Lead Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && vendors.length === 0 ? (
                                <tr><td colSpan={4} className="si-loading-cell">
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '4rem' }}>
                                        <div className="db-spinner db-spinner-lg"></div>
                                        <span style={{ color: '#64748b', fontWeight: '500' }}>Fetching suppliers from Acumatica...</span>
                                    </div>
                                </td></tr>
                            ) : vendors.length === 0 ? (
                                <tr><td colSpan={4} className="si-empty-cell" style={{ padding: '4rem' }}>No suppliers found matching your criteria.</td></tr>
                            ) : vendors.map(v => (
                                <tr key={v.vendorId} className="db-clickable-row">
                                    <td style={{ padding: '1.25rem' }}>
                                        <span className="db-inv-id" style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>{v.vendorId}</span>
                                    </td>
                                    <td style={{ padding: '1.25rem' }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.95rem' }}>{v.vendorName}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.25rem' }}>{v.status}</div>
                                    </td>
                                    <td style={{ padding: '1.25rem', textAlign: 'center' }}>
                                        <div style={{ 
                                            display: 'inline-flex', 
                                            alignItems: 'center', 
                                            justifyContent: 'center',
                                            width: '50px', 
                                            height: '50px', 
                                            borderRadius: '50%', 
                                            border: `4px solid ${v.reliabilityScore >= 90 ? '#22c55e' : v.reliabilityScore >= 80 ? '#eab308' : '#ef4444'}`,
                                            fontWeight: '700',
                                            fontSize: '0.85rem',
                                            color: '#0f172a',
                                            background: '#fff'
                                        }}>
                                            {v.reliabilityScore}%
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.25rem' }}>
                                        <div className="db-select-wrapper" style={{ height: '40px', background: '#fff' }}>
                                            <IconClock />
                                            <select
                                                className="db-select"
                                                value={leadTimes[v.vendorId] || ""}
                                                onChange={(e) => handleLeadTimeChange(v.vendorId, e.target.value)}
                                                style={{ border: 'none', background: 'transparent', width: '100%', cursor: 'pointer', fontSize: '0.85rem' }}
                                            >
                                                <option value="">— Select Time —</option>
                                                {LEAD_TIME_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!loading && (
                    <div className="db-pagination" style={{ marginTop: '2rem' }}>
                        <span className="db-page-info">Page <strong>{page}</strong></span>
                        <div className="db-page-btns">
                            <button className="db-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                <IconChevronLeft />
                            </button>
                            <button className="db-page-btn" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
                                <IconChevronRight />
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
