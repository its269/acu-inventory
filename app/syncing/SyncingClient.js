"use client";

import { useState, useCallback, useRef, memo } from "react";
import "@/styles/sync.css";

/* ── SVG Icons ───────────────────────────────────── */
const CloudUploadIcon = () => (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4 0 0 1 2.5 8.242" />
        <path d="M12 12v9" />
        <path d="m8 17 4-4 4 4" />
    </svg>
);

const FileTextIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14.5 2 14.5 7.5 20 7.5" />
    </svg>
);

const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 6 6 18" /><path d="M6 6 12 12 18 18" />
    </svg>
);

/* ── Components ───────────────────────────────────── */

const MinimalStep = memo(({ num, title, desc, active }) => (
    <div className={`step-item-min ${active ? 'active' : ''}`}>
        <div className="step-number-min">{num}</div>
        <h4>{title}</h4>
        <p>{desc}</p>
    </div>
));
MinimalStep.displayName = "MinimalStep";

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
                          f.name.toLowerCase().includes("vendor") ? "Suppliers" : "Data"
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
        alert(`Starting sync for ${files.length} files...`);
    };

    return (
        <div className="sync-root">
            <header className="sync-header">
                <div className="sync-branding">
                    <img src="/KELIN LOGO-01.png" alt="Logo" style={{ width: '32px' }} />
                    <span className="sync-branding-text">
                        ACU <span className="sync-branding-accent">SYNC</span>
                    </span>
                </div>
                <div className="sync-badge">Data Management</div>
            </header>

            <main className="sync-main">
                <div className="sync-intro">
                    <h1 className="sync-title">Data Synchronization</h1>
                    <p className="sync-description">Sync Acumatica ERP datasets with local MySQL infrastructure.</p>
                </div>

                <div className="sync-steps-horizontal">
                    <MinimalStep num="1" title="Export" desc="CSV from Acumatica" active={files.length === 0} />
                    <MinimalStep num="2" title="Upload" desc="Drop files below" active={files.length > 0 && files.length < 3} />
                    <MinimalStep num="3" title="Sync" desc="Push to MySQL" active={files.length >= 3} />
                </div>

                <div 
                    className={`sync-drop-zone ${isDragging ? 'dragging' : ''}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current.click()}
                >
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={(e) => processFiles(e.target.files)} 
                        multiple 
                        accept=".csv" 
                        style={{ display: 'none' }}
                    />
                    <div className="sync-icon-container">
                        <CloudUploadIcon />
                    </div>
                    <h3>{isDragging ? 'Drop Files Now' : 'Upload CSV Files'}</h3>
                    <p>Select or drag Acumatica exports here.</p>
                </div>

                {files.length > 0 && (
                    <div className="sync-queue-container">
                        <div className="sync-queue-header">
                            <div>
                                <h4>Ready to sync</h4>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{files.length} file{files.length !== 1 ? 's' : ''} selected</span>
                            </div>
                            <button className="sync-start-btn" onClick={startSync}>
                                Start Sync
                            </button>
                        </div>
                        <div className="sync-file-list">
                            {files.map((file) => (
                                <div key={file.id} className="sync-file-item">
                                    <div className="sync-file-icon" style={{ color: 'var(--primary)' }}>
                                        <FileTextIcon />
                                    </div>
                                    <div className="sync-file-info">
                                        <div className="sync-file-name">{file.file.name}</div>
                                        <div className="sync-file-meta">
                                            {(file.file.size / 1024).toFixed(1)} KB • {file.type}
                                        </div>
                                    </div>
                                    <span className="sync-status-badge">Ready</span>
                                    <button className="sync-remove-btn" onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}>
                                        <XIcon />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="sync-footer-actions">
                    <button className="sync-back-btn" onClick={() => window.location.href = '/dashboard'}>
                        Back to Dashboard
                    </button>
                </div>
            </main>
        </div>
    );
}
