"use client";

import { useState, useRef, useEffect } from "react";
import "@/styles/dashboard.css";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" cy1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

export default function SyncModal({ isOpen, onClose, onSyncComplete }) {
    const [syncing, setSyncing] = useState(false);
    const [mode, setMode] = useState("incremental");
    const [options, setOptions] = useState({ inventory: true, sales: false });
    const [dateRange, setDateRange] = useState({ 
        start: "2024-01-01", 
        end: new Date().toISOString().split('T')[0] 
    });
    const [sections, setSections] = useState({});
    const [overallProgress, setOverallProgress] = useState(0);
    const [complete, setComplete] = useState(false);
    const [error, setError] = useState(null);

    // Smooth animation states
    const [displayOverall, setDisplayOverall] = useState(0);
    const [displaySections, setDisplaySections] = useState({});

    const syncingRef = useRef(false);

    // Animation Effect
    useEffect(() => {
        if (!syncing) return;

        const interval = setInterval(() => {
            // Smooth Overall Progress
            setDisplayOverall(prev => {
                if (prev < overallProgress) return Math.min(prev + 1, overallProgress, 100);
                return Math.min(prev, 100);
            });

            // Smooth Section Progress
            setDisplaySections(prev => {
                const next = { ...prev };
                let changed = false;
                Object.keys(sections).forEach(key => {
                    const target = Math.min(100, sections[key].progress || 0);
                    const current = next[key] || 0;
                    if (current < target) {
                        next[key] = Math.min(current + 1, target, 100);
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, 30); // ~33fps for smooth crawling

        return () => clearInterval(interval);
    }, [syncing, overallProgress, sections]);

    const handleToggleOption = (key) => {
        if (syncing) return;
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const startSync = async () => {
        if (syncing || syncingRef.current) return;

        const selectedCount = Object.keys(options).filter(k => options[k]).length;
        if (selectedCount === 0) {
            alert("Pumili muna ng module.");
            return;
        }

        setSyncing(true);
        syncingRef.current = true;
        setComplete(false);
        setError(null);
        setSections({});
        setOverallProgress(0);
        setDisplayOverall(0);
        setDisplaySections({});

        try {
            const queryParams = new URLSearchParams({
                inventory: options.inventory,
                sales: options.sales,
                mode: mode,
                startDate: dateRange.start,
                endDate: dateRange.end
            });
            const res = await fetch(`/api/sync?${queryParams.toString()}`, {
                method: "POST",
            });

            if (!res.ok) throw new Error("Failed to start sync");

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const data = JSON.parse(line);

                        if (data.section) {
                            setSections(prev => {
                                const newSections = {
                                    ...prev,
                                    [data.section]: {
                                        status: data.status || prev[data.section]?.status,
                                        details: data.details || prev[data.section]?.details,
                                        progress: data.progress ?? prev[data.section]?.progress ?? 0
                                    }
                                };
                                const sectionValues = Object.values(newSections);
                                const totalProg = sectionValues.reduce((acc, s) => acc + (s.progress || 0), 0);
                                setOverallProgress(Math.floor(totalProg / selectedCount));
                                return newSections;
                            });
                        }

                        if (data.status === "complete") {
                            setComplete(true);
                            setOverallProgress(100);
                        }

                        if (data.status === "error") {
                            setError(data.message);
                        }
                    } catch (e) {
                        console.error("Error parsing line:", line, e);
                    }
                }
            }

        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            syncingRef.current = false;
        }
    };

    if (!isOpen) return null;

    return (
        <div className="db-modal-overlay" style={{ zIndex: 10001 }}>
            <div className="db-modal" style={{ maxWidth: '440px', borderRadius: '24px', overflow: 'hidden', padding: '0' }}>
                <div className="db-modal-header" style={{ borderBottom: 'none', padding: '2rem 2rem 0.5rem', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                        <div className="db-modal-title" style={{ color: '#0f172a', fontSize: '1.5rem', fontWeight: '800' }}>
                            {syncing ? "Syncing data" : "Sync data"}
                        </div>
                        {!syncing && <button className="db-modal-close" onClick={onClose} style={{ position: 'static', padding: '0' }}><IconClose /></button>}
                    </div>
                    {!syncing && <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: '500', margin: '0' }}>Choose what to sync and the sync type.</p>}
                </div>

                <div className="db-modal-body" style={{ padding: '1.5rem 2rem 2rem' }}>
                    {!syncing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Modules Section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Modules</div>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: '#fff', border: `1.5px solid ${options.inventory ? '#3b82f6' : '#e2e8f0'}`, borderRadius: '20px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: options.inventory ? '0 4px 12px rgba(59, 130, 246, 0.08)' : 'none' }}>
                                    <input type="checkbox" checked={options.inventory} onChange={() => handleToggleOption('inventory')} style={{ width: '20px', height: '20px', borderRadius: '6px', cursor: 'pointer' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Inventory</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Branches · Inventory levels · Products</div>
                                    </div>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1.25rem', background: '#fff', border: `1.5px solid ${options.sales ? '#3b82f6' : '#e2e8f0'}`, borderRadius: '20px', cursor: 'pointer', transition: 'all 0.2s', boxShadow: options.sales ? '0 4px 12px rgba(59, 130, 246, 0.08)' : 'none' }}>
                                    <input type="checkbox" checked={options.sales} onChange={() => handleToggleOption('sales')} style={{ width: '20px', height: '20px', borderRadius: '6px', cursor: 'pointer' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Sales history</div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>Product periodic sales</div>
                                    </div>
                                </label>
                            </div>

                            {options.sales && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date Range</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Start Date</span>
                                            <input 
                                                type="date" 
                                                value={dateRange.start} 
                                                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                                                style={{ padding: '0.75rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>End Date</span>
                                            <input 
                                                type="date" 
                                                value={dateRange.end} 
                                                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                                                style={{ padding: '0.75rem', borderRadius: '12px', border: '1.5px solid #e2e8f0', fontSize: '0.9rem' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Sync Type Section */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sync type</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                    <button 
                                        onClick={() => setMode("incremental")} 
                                        style={{ 
                                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem', padding: '1rem', borderRadius: '20px', border: `1.5px solid ${mode === 'incremental' ? '#3b82f6' : '#e2e8f0'}`, background: mode === 'incremental' ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ fontWeight: '700', color: mode === 'incremental' ? '#1e40af' : '#0f172a', fontSize: '0.95rem' }}>Quick</span>
                                        <span style={{ fontSize: '0.8rem', color: mode === 'incremental' ? '#3b82f6' : '#64748b', fontWeight: '500' }}>Changes only</span>
                                    </button>
                                    <button 
                                        onClick={() => setMode("full")} 
                                        style={{ 
                                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem', padding: '1rem', borderRadius: '20px', border: `1.5px solid ${mode === 'full' ? '#3b82f6' : '#e2e8f0'}`, background: mode === 'full' ? '#eff6ff' : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                                        }}
                                    >
                                        <span style={{ fontWeight: '700', color: mode === 'full' ? '#1e40af' : '#0f172a', fontSize: '0.95rem' }}>Full</span>
                                        <span style={{ fontSize: '0.8rem', color: mode === 'full' ? '#3b82f6' : '#64748b', fontWeight: '500' }}>All records</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* Syncing State with Smooth Animation */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.5rem' }}>{displayOverall}%</div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {options.inventory && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '1rem' }}>Inventory</span>
                                            {sections["Inventory"]?.status === "done" && displaySections["Inventory"] === 100 && <IconCheck />}
                                        </div>
                                        <div className="db-progress-container" style={{ height: '10px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div className="db-progress-bar" style={{ width: `${displaySections["Inventory"] || 0}%`, background: '#3b82f6', height: '100%', transition: 'width 0.1s linear' }} />
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
                                            {sections["Inventory"]?.details || "Preparing..."}
                                        </div>
                                    </div>
                                )}

                                {options.sales && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '1rem' }}>Sales history</span>
                                            {sections["Sales history"]?.status === "done" && displaySections["Sales history"] === 100 && <IconCheck />}
                                        </div>
                                        <div className="db-progress-container" style={{ height: '10px', background: '#f1f5f9', borderRadius: '10px', overflow: 'hidden' }}>
                                            <div className="db-progress-bar" style={{ width: `${displaySections["Sales history"] || 0}%`, background: '#3b82f6', height: '100%', transition: 'width 0.1s linear' }} />
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
                                            {sections["Sales history"]?.details || "Preparing..."}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {complete && displayOverall === 100 && (
                                <div style={{ textAlign: 'center', padding: '1rem', background: '#f0fdf4', borderRadius: '16px', border: '1px solid #bbf7d0' }}>
                                    <div style={{ color: '#166534', fontWeight: '700', fontSize: '0.95rem' }}>Sync completed successfully</div>
                                </div>
                            )}

                            {error && (
                                <div style={{ textAlign: 'center', padding: '1.25rem', background: '#fef2f2', borderRadius: '20px', border: '1px solid #fecaca' }}>
                                    <div style={{ color: '#991b1b', fontWeight: '700', fontSize: '0.95rem' }}>{error}</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="db-modal-footer" style={{ borderTop: 'none', padding: '0 2rem 2rem', display: 'flex', gap: '0.75rem' }}>
                    {!syncing ? (
                        <>
                            <button className="db-btn-secondary" onClick={onClose} style={{ flex: 1, height: '56px', borderRadius: '18px', fontSize: '1rem', fontWeight: '700', background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer' }}>Cancel</button>
                            <button className="db-btn-primary" onClick={startSync} style={{ flex: 1, height: '56px', borderRadius: '18px', fontSize: '1rem', fontWeight: '700', background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 99, 235, 0.25)' }}>Start sync</button>
                        </>
                    ) : (
                        <button 
                            className="db-btn-primary" 
                            disabled={!(complete && displayOverall === 100) && !error} 
                            onClick={() => {
                                setSyncing(false);
                                if (complete && onSyncComplete) onSyncComplete();
                                onClose();
                            }}
                            style={{ 
                                width: '100%', height: '56px', borderRadius: '18px', fontSize: '1rem', fontWeight: '700', background: (complete && displayOverall === 100) ? '#16a34a' : (error ? '#dc2626' : '#94a3b8'), color: '#fff', border: 'none', cursor: (!(complete && displayOverall === 100) && !error) ? 'not-allowed' : 'pointer'
                            }}
                        >
                            {(complete && displayOverall === 100) ? "Close" : (error ? "Close" : "Syncing...")}
                        </button>
                    )}

                    <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>Destination: MySQL (db_purchase)</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
