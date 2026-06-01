"use client";

import { useState, useMemo } from "react";
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

const MODULES = [
    { id: "inventory", name: "Inventory" },
    { id: "products", name: "Products" },
    { id: "branches", name: "Branches" },
    { id: "sales", name: "Sales" },
    { id: "suppliers", name: "Suppliers" },
];

export default function QuickSyncModal({ isOpen, onClose }) {
    const [syncType, setSyncType] = useState("all"); // "all" or "specific"
    const [selectedModules, setSelectedModules] = useState({});
    const [isSyncing, setIsSyncing] = useState(false);

    const toggleModule = (id) => {
        setSelectedModules(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleSync = () => {
        setIsSyncing(true);
        setTimeout(() => {
            setIsSyncing(false);
            onClose();
        }, 2000);
    };

    const selectedCount = useMemo(() => 
        Object.values(selectedModules).filter(Boolean).length
    , [selectedModules]);

    if (!isOpen) return null;

    return (
        <div className="db-modal-overlay" style={{ zIndex: 10002 }}>
            <div className="db-modal db-qs-overhaul">
                
                <button className="db-qs-close-v2" onClick={onClose} aria-label="Close">
                    <IconClose />
                </button>

                <div className="db-qs-header-v2">
                    <div className="db-qs-icon-wrapper">
                        <IconSyncHeader />
                    </div>
                    <div className="db-qs-header-text">
                        <h2>Quick Data Sync</h2>
                        <p>Synchronize your ERP data with the target database</p>
                    </div>
                </div>

                <div className="db-qs-body-v2">
                    <h3 className="db-qs-section-title">Select sync strategy</h3>
                    
                    <div className="db-qs-strategy-grid">
                        <button 
                            className={`db-qs-strategy-card ${syncType === 'all' ? 'active' : ''}`}
                            onClick={() => setSyncType('all')}
                        >
                            <div className="db-qs-strategy-icon">
                                <IconRocket />
                            </div>
                            <span className="db-qs-strategy-name">Sync all module</span>
                            <span className="db-qs-strategy-desc">All categories</span>
                        </button>

                        <button 
                            className={`db-qs-strategy-card ${syncType === 'specific' ? 'active' : ''}`}
                            onClick={() => setSyncType('specific')}
                        >
                            <div className="db-qs-strategy-icon">
                                <IconTarget />
                            </div>
                            <span className="db-qs-strategy-name">Select specific</span>
                            <span className="db-qs-strategy-desc">Choose modules</span>
                        </button>
                    </div>

                    {syncType === 'specific' && (
                        <div className="db-qs-module-list-v2" style={{ animation: 'fadeIn 0.3s ease' }}>
                            {MODULES.map(module => (
                                <button 
                                    key={module.id} 
                                    className={`db-qs-module-pill ${selectedModules[module.id] ? 'active' : ''}`}
                                    onClick={() => toggleModule(module.id)}
                                >
                                    <span className="db-qs-module-name">{module.name}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    <button 
                        className="db-qs-prime-btn" 
                        onClick={handleSync}
                        disabled={isSyncing || (syncType === 'specific' && selectedCount === 0)}
                    >
                        {isSyncing ? (
                            <div className="db-spinner" style={{ width: '22px', height: '22px', borderTopColor: '#fff' }} />
                        ) : (
                            <>
                                <IconDatabase />
                                <span>Execute Sync</span>
                            </>
                        )}
                    </button>
                    
                    <span className="db-qs-target-db">Destination: External Storage</span>
                </div>
            </div>

            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(5px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
}
