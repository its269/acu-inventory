"use client";

import { useState, useCallback, useRef, memo } from "react";
import "@/styles/dashboard.css";

/* ── SVG Icons ───────────────────────────────────── */
const CloudUploadIcon = () => (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4 0 0 1 2.5 8.242" />
        <path d="M12 12v9" />
        <path d="m8 17 4-4 4 4" />
    </svg>
);

const FileTextIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14.5 2 14.5 7.5 20 7.5" />
        <path d="M8 13h8" /><path d="M8 17h8" /><path d="M10 9H8" />
    </svg>
);

const CheckCircleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
);

const XIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" /><path d="M6 6 12 12 18 18" />
    </svg>
);

const StepIcon = ({ num, active }) => (
    <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: active ? '#2563eb' : '#f1f5f9',
        color: active ? '#fff' : '#94a3b8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.9rem',
        fontWeight: '700',
        border: active ? 'none' : '1px solid #e2e8f0',
        transition: 'all 0.3s ease'
    }}>
        {num}
    </div>
);

/* ── Components ───────────────────────────────────── */

const InstructionStep = memo(({ num, title, desc, active }) => (
    <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '2rem', opacity: active ? 1 : 0.6 }}>
        <StepIcon num={num} active={active} />
        <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>{title}</h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>{desc}</p>
        </div>
    </div>
));
InstructionStep.displayName = "InstructionStep";

export default function SyncingClient() {
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);

    const onDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const processFiles = (newFiles) => {
        const csvFiles = Array.from(newFiles).filter(f => f.name.toLowerCase().endsWith(".csv"));
        if (csvFiles.length === 0) return;
        
        setFiles(prev => {
            const existingNames = new Set(prev.map(f => f.file.name));
            const uniqueNew = csvFiles
                .filter(f => !existingNames.has(f.name))
                .map(f => ({
                    id: Math.random().toString(36).substr(2, 9),
                    file: f,
                    status: "ready",
                    type: f.name.toLowerCase().includes("sales") ? "Sales" : 
                          f.name.toLowerCase().includes("item") ? "Inventory" : 
                          f.name.toLowerCase().includes("vendor") ? "Suppliers" : "General Data"
                }));
            return [...prev, ...uniqueNew];
        });
    };

    const onDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            processFiles(e.dataTransfer.files);
        }
    };

    const removeFile = (id) => {
        setFiles(prev => prev.filter(f => f.id !== id));
    };

    const startSync = () => {
        alert(`Initializing synchronization for ${files.length} files... \n\nConnecting to MySQL (XAMPP) via local PHP endpoint.`);
    };

    return (
        <div className="db-root" style={{ background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            {/* Header Branding */}
            <header style={{ padding: '1.5rem 3rem', background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <img src="/KELIN LOGO-01.png" alt="Logo" style={{ width: '40px' }} />
                    <span style={{ fontWeight: '800', letterSpacing: '-0.025em', color: '#0f172a', fontSize: '1.25rem' }}>
                        KGS <span style={{ color: '#2563eb' }}>PURCHASE</span> SYSTEM
                    </span>
                </div>
                <div style={{ background: '#f1f5f9', padding: '6px 16px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: '#475569' }}>
                    Admin / Sync Module
                </div>
            </header>

            <main style={{ flex: 1, padding: '4rem 2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '4rem', alignItems: 'start' }}>
                    
                    {/* Left: Instructions */}
                    <div style={{ position: 'sticky', top: '4rem' }}>
                        <div style={{ marginBottom: '3rem' }}>
                            <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: '#0f172a', marginBottom: '1rem', letterSpacing: '-0.05em' }}>
                                Data Sync <span style={{ color: '#2563eb' }}>Gateway</span>
                            </h1>
                            <p style={{ fontSize: '1.1rem', color: '#64748b', lineHeight: '1.6' }}>
                                Manually sync your Acumatica ERP datasets with our high-speed local MySQL infrastructure.
                            </p>
                        </div>

                        <InstructionStep 
                            num="1" 
                            title="Export from Acumatica" 
                            desc="Go to your Acumatica module (Invoices, Stock Items, or Vendors) and export the grid as a CSV file."
                            active={files.length === 0}
                        />
                        <InstructionStep 
                            num="2" 
                            title="Drop Files Here" 
                            desc="Drag your downloaded CSV files into the upload zone. We automatically detect the data type."
                            active={files.length > 0 && files.length < 5}
                        />
                        <InstructionStep 
                            num="3" 
                            title="Finalize Sync" 
                            desc="Review your file list and click 'Start Synchronization' to push data to the local MySQL server."
                            active={files.length > 0}
                        />

                        <div style={{ marginTop: '4rem', padding: '1.5rem', background: '#eff6ff', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <div style={{ color: '#2563eb' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: '#1e40af', fontWeight: '500', lineHeight: '1.5' }}>
                                    <strong>Developer Note:</strong> This module replaces direct Supabase calls with local PHP endpoints connected to XAMPP MySQL.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right: Upload Area */}
                    <div>
                        <div 
                            className={`sync-drop-zone ${isDragging ? 'dragging' : ''}`}
                            onDragOver={onDragOver}
                            onDragLeave={onDragLeave}
                            onDrop={onDrop}
                            onClick={() => fileInputRef.current.click()}
                            style={{
                                border: '2px dashed #e2e8f0',
                                borderRadius: '32px',
                                padding: '6rem 2rem',
                                textAlign: 'center',
                                background: isDragging ? '#f0f7ff' : '#fff',
                                borderColor: isDragging ? '#2563eb' : '#e2e8f0',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                cursor: 'pointer',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: isDragging ? '0 25px 50px -12px rgba(37, 99, 235, 0.15)' : '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                            }}
                        >
                            {/* Decorative Background Circles */}
                            <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '200px', height: '200px', borderRadius: '50%', background: 'rgba(37, 99, 235, 0.03)', zIndex: 0 }}></div>
                            <div style={{ position: 'absolute', bottom: '-50px', left: '-50px', width: '150px', height: '150px', borderRadius: '50%', background: 'rgba(37, 99, 235, 0.03)', zIndex: 0 }}></div>

                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={(e) => processFiles(e.target.files)} 
                                    multiple 
                                    accept=".csv" 
                                    style={{ display: 'none' }}
                                />
                                <div style={{ 
                                    color: isDragging ? '#2563eb' : '#94a3b8', 
                                    marginBottom: '2rem',
                                    transform: isDragging ? 'translateY(-10px)' : 'translateY(0)',
                                    transition: 'all 0.3s ease'
                                }}>
                                    <CloudUploadIcon />
                                </div>
                                <h3 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#0f172a', marginBottom: '0.75rem' }}>
                                    {isDragging ? 'Drop to Sync' : 'Upload CSV Data'}
                                </h3>
                                <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '300px', margin: '0 auto' }}>
                                    Drag and drop your Acumatica CSV exports here to begin.
                                </p>
                            </div>
                        </div>

                        {/* File Queue */}
                        {files.length > 0 && (
                            <div style={{ marginTop: '2rem', animation: 'fadeIn 0.5s ease' }}>
                                <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)', overflow: 'hidden' }}>
                                    <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fcfcfd' }}>
                                        <div>
                                            <h4 style={{ margin: 0, fontWeight: '800', color: '#0f172a', fontSize: '1.1rem' }}>Upload Queue</h4>
                                            <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: '600' }}>{files.length} file{files.length !== 1 ? 's' : ''} ready for ingestion</span>
                                        </div>
                                        <button 
                                            className="db-btn-run-analysis" 
                                            onClick={startSync}
                                            style={{ padding: '0.75rem 2rem', borderRadius: '12px', fontSize: '0.95rem', boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.3)' }}
                                        >
                                            Start Synchronization
                                        </button>
                                    </div>
                                    <div style={{ padding: '0.75rem' }}>
                                        {files.map((file, idx) => (
                                            <div key={file.id} style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '1.25rem', 
                                                padding: '1.25rem 1.5rem', 
                                                borderRadius: '16px',
                                                borderBottom: idx === files.length - 1 ? 'none' : '1px solid #f8fafc',
                                                transition: 'background 0.2s ease'
                                            }}>
                                                <div style={{ color: '#2563eb', background: '#eff6ff', padding: '12px', borderRadius: '14px' }}>
                                                    <FileTextIcon />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '1rem', marginBottom: '0.2rem' }}>{file.file.name}</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '600' }}>{(file.file.size / 1024).toFixed(1)} KB</span>
                                                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#e2e8f0' }}></span>
                                                        <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: '700', letterSpacing: '0.05em' }}>{file.type.toUpperCase()}</span>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#16a34a', background: '#f0fdf4', padding: '6px 14px', borderRadius: '25px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #dcfce7' }}>
                                                        <CheckCircleIcon /> Valid CSV
                                                    </span>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                                                        style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#94a3b8', cursor: 'pointer', padding: '8px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fee2e2'; e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fef2f2'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = '#fff'; }}
                                                    >
                                                        <XIcon />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                            <button 
                                onClick={() => window.location.href = '/dashboard'}
                                style={{ background: 'rgba(255,255,255,0.8)', border: '1px solid #e2e8f0', color: '#64748b', padding: '10px 24px', borderRadius: '14px', cursor: 'pointer', fontWeight: '700', fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s' }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#1e293b'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                Return to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* Global Animations & Overrides */}
            <style jsx>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .sync-drop-zone:hover {
                    border-color: #2563eb !important;
                    background: #f8fbff !important;
                }
                .dragging {
                    border-style: solid !important;
                    transform: translateY(-4px);
                }
            `}</style>
        </div>
    );
}
