"use client";

import { useState, useMemo, useRef } from "react";
import "@/styles/dashboard.css";

/* ── SVG Icons ─────────────────────────────────────────── */
const IconClose = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);
const IconSyncHeader = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
        <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
        <path d="M16 16h5v5" />
    </svg>
);
const IconRocket = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3" />
        <path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5" />
    </svg>
);
const IconTarget = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
);
const IconDatabase = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
);
const IconCheck = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
);

const MODULES = [
    { id: "inventory", name: "Inventory", apiFlag: "inventory" },
    { id: "products", name: "Products", apiFlag: "inventory" },
    { id: "branches", name: "Branches", apiFlag: "inventory" },
    { id: "sales", name: "Sales", apiFlag: "sales" },
];

export default function QuickSyncModal({ isOpen, onClose, onStatusChange }) {
    const [syncType, setSyncType] = useState("all");
    const [selectedModules, setSelectedModules] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);
    const [sections, setSections] = useState({});
    const [logs, setLogs] = useState([]);
    const [complete, setComplete] = useState(false);
    const [error, setError] = useState(null);
    const [overallProgress, setOverallProgress] = useState(0);
    const logsEndRef = useRef(null);

    const toggleModule = (id) => {
        if (isSyncing) return;
        setSelectedModules(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const addLog = (msg) => {
        setLogs(prev => {
            const next = [...prev, msg];
            setTimeout(() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
            return next;
        });
    };

    const handleSync = async () => {
        if (isSyncing) return;

        // Determine which API flags to enable
        let useInventory = false;
        let useSales = false;

        if (syncType === "all") {
            useInventory = true;
            useSales = false; // sales is a placeholder — skip unless explicitly chosen
        } else {
            const activeFlags = new Set(
                MODULES.filter(m => selectedModules[m.id]).map(m => m.apiFlag)
            );
            useInventory = activeFlags.has("inventory");
            useSales = activeFlags.has("sales");
        }

        if (!useInventory && !useSales) {
            alert("Please select at least one module.");
            return;
        }

        setIsSyncing(true);
        setComplete(false);
        setError(null);
        setSections({});
        setLogs([]);
        setOverallProgress(0);
        addLog("Starting sync...");
        onStatusChange?.("syncing");

        try {
            const res = await fetch(
                `/api/sync?inventory=${useInventory}&sales=${useSales}&mode=incremental`,
                { method: "POST" }
            );

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.message || `HTTP ${res.status}`);
            }

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

                        // Keep-alive ping — ignore
                        if (data.ping) continue;

                        if (data.section) {
                            setSections(prev => {
                                const next = {
                                    ...prev,
                                    [data.section]: {
                                        status: data.status || prev[data.section]?.status,
                                        details: data.details || prev[data.section]?.details,
                                        progress: data.progress ?? prev[data.section]?.progress ?? 0,
                                    }
                                };
                                const vals = Object.values(next);
                                const total = vals.reduce((a, s) => a + (s.progress || 0), 0);
                                setOverallProgress(Math.min(100, Math.floor(total / vals.length)));
                                return next;
                            });
                            if (data.details) addLog(`[${data.section}] ${data.details}`);
                        }

                        if (data.status === "complete") {
                            setComplete(true);
                            setOverallProgress(100);
                            addLog("✓ Sync completed successfully.");
                            onStatusChange?.("complete");
                        }

                        if (data.status === "error") {
                            setError(data.message);
                            addLog(`✗ Error: ${data.message}`);
                            onStatusChange?.("error");
                        }
                    } catch {
                        // non-JSON line — ignore
                    }
                }
            }
        } catch (err) {
            setError(err.message);
            addLog(`✗ ${err.message}`);
            onStatusChange?.("error");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleClose = () => {
        if (isSyncing) return;
        setSyncType("all");
        setSelectedModules({});
        setIsSyncing(false);
        setSections({});
        setLogs([]);
        setComplete(false);
        setError(null);
        setOverallProgress(0);
        onClose();
    };

    const selectedCount = useMemo(
        () => Object.values(selectedModules).filter(Boolean).length,
        [selectedModules]
    );

    if (!isOpen) return null;

    return (
        <div className="db-modal-overlay" style={{ zIndex: 10002 }}>
            <div className="db-modal db-qs-overhaul">
                {!isSyncing && (
                    <button className="db-qs-close-v2" onClick={handleClose} aria-label="Close">
                        <IconClose />
                    </button>
                )}

                <div className="db-qs-header-v2">
                    <div className="db-qs-icon-wrapper">
                        <IconSyncHeader />
                    </div>
                    <div className="db-qs-header-text">
                        <h2>{isSyncing ? "Syncing data…" : complete ? "Sync complete" : "Quick Data Sync"}</h2>
                        <p>{isSyncing ? "Do not close this window." : "Synchronize your ERP data with the database"}</p>
                    </div>
                </div>

                <div className="db-qs-body-v2">
                    {!isSyncing && !complete ? (
                        /* ── Setup view ── */
                        <>
                            <h3 className="db-qs-section-title">Select sync strategy</h3>
                            <div className="db-qs-strategy-grid">
                                <button
                                    className={`db-qs-strategy-card ${syncType === "all" ? "active" : ""}`}
                                    onClick={() => setSyncType("all")}
                                >
                                    <div className="db-qs-strategy-icon"><IconRocket /></div>
                                    <span className="db-qs-strategy-name">Sync all modules</span>
                                    <span className="db-qs-strategy-desc">All categories</span>
                                </button>
                                <button
                                    className={`db-qs-strategy-card ${syncType === "specific" ? "active" : ""}`}
                                    onClick={() => setSyncType("specific")}
                                >
                                    <div className="db-qs-strategy-icon"><IconTarget /></div>
                                    <span className="db-qs-strategy-name">Select specific</span>
                                    <span className="db-qs-strategy-desc">Choose modules</span>
                                </button>
                            </div>

                            {syncType === "specific" && (
                                <div className="db-qs-module-list-v2">
                                    {MODULES.map(module => (
                                        <button
                                            key={module.id}
                                            className={`db-qs-module-pill ${selectedModules[module.id] ? "active" : ""}`}
                                            onClick={() => toggleModule(module.id)}
                                        >
                                            <span className="db-qs-module-name">{module.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        /* ── Progress + logs view ── */
                        <>
                            {/* Status banner */}
                            <div style={{
                                display: "flex", alignItems: "center", gap: "0.5rem",
                                padding: "0.5rem 0.75rem", borderRadius: "8px", marginBottom: "1rem",
                                background: complete ? "#f0fdf4" : error ? "#fef2f2" : "#eff6ff",
                                border: `1px solid ${complete ? "#bbf7d0" : error ? "#fecaca" : "#bfdbfe"}`,
                            }}>
                                <span style={{
                                    width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0,
                                    background: complete ? "#22c55e" : error ? "#ef4444" : "#3b82f6",
                                    animation: !complete && !error ? "pulse-dot 1.5s ease-in-out infinite" : "none",
                                }} />
                                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: complete ? "#15803d" : error ? "#dc2626" : "#1d4ed8" }}>
                                    {complete ? "Sync completed successfully" : error ? "Sync failed" : "Sync in progress…"}
                                </span>
                                {complete && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: "auto" }}>
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </div>
                            {/* Overall progress bar */}
                            <div style={{ marginBottom: "1rem" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#1e293b" }}>Overall</span>
                                    <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#3b82f6" }}>{overallProgress}%</span>
                                </div>
                                <div style={{ height: "8px", background: "#f1f5f9", borderRadius: "8px", overflow: "hidden" }}>
                                    <div style={{ width: `${overallProgress}%`, height: "100%", background: complete ? "#22c55e" : "#3b82f6", transition: "width 0.3s ease" }} />
                                </div>
                            </div>

                            {/* Per-section progress */}
                            {Object.entries(sections).map(([section, s]) => (
                                <div key={section} style={{ marginBottom: "0.75rem" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                                        <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#334155" }}>{section}</span>
                                        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                                            {s.status === "done" && <IconCheck />}
                                            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>{s.progress || 0}%</span>
                                        </span>
                                    </div>
                                    <div style={{ height: "6px", background: "#f1f5f9", borderRadius: "6px", overflow: "hidden" }}>
                                        <div style={{ width: `${s.progress || 0}%`, height: "100%", background: s.status === "done" ? "#22c55e" : "#3b82f6", transition: "width 0.3s ease" }} />
                                    </div>
                                    {s.details && (
                                        <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "0.25rem" }}>{s.details}</div>
                                    )}
                                </div>
                            ))}

                            {/* Live log */}
                            <div style={{
                                marginTop: "1rem", maxHeight: "140px", overflowY: "auto",
                                background: "#0f172a", borderRadius: "8px", padding: "0.75rem",
                                fontFamily: "monospace", fontSize: "0.75rem", color: "#94a3b8",
                            }}>
                                {logs.map((l, i) => (
                                    <div key={i} style={{ color: l.startsWith("✓") ? "#22c55e" : l.startsWith("✗") ? "#ef4444" : "#94a3b8", lineHeight: 1.6 }}>{l}</div>
                                ))}
                                {isSyncing && (
                                    <div style={{ display: "inline-block", width: "8px", height: "14px", background: "#3b82f6", animation: "blink 1s step-end infinite" }} />
                                )}
                                <div ref={logsEndRef} />
                            </div>

                            {error && (
                                <div style={{ marginTop: "0.75rem", padding: "0.6rem 0.8rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", fontSize: "0.82rem", color: "#dc2626" }}>
                                    {error}
                                </div>
                            )}
                        </>
                    )}

                    {/* Action button */}
                    {!isSyncing && (
                        <button
                            className="db-qs-prime-btn"
                            onClick={complete ? handleClose : handleSync}
                            disabled={syncType === "specific" && selectedCount === 0}
                            style={{ marginTop: "1.25rem" }}
                        >
                            {complete ? (
                                <><IconCheck /><span>Done</span></>
                            ) : (
                                <><IconDatabase /><span>Execute Sync</span></>
                            )}
                        </button>
                    )}

                    {isSyncing && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "1.25rem", justifyContent: "center", color: "#64748b", fontSize: "0.85rem" }}>
                            <div className="db-spinner" style={{ width: "18px", height: "18px", borderTopColor: "#3b82f6" }} />
                            <span>Syncing in progress…</span>
                        </div>
                    )}

                    <span className="db-qs-target-db">Destination: MySQL (db_kelin_inventory)</span>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
                @keyframes pulse-dot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.4); } }
            `}</style>
        </div>
    );
}
