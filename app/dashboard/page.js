"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { useRouter } from "next/navigation";
import "@/styles/dashboard.css";

/* ── SVG Icons — defined outside component so they are stable references
       and never recreated on re-render ─────────────────────────────── */
const IconLogout = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
));
IconLogout.displayName = "IconLogout";
const IconSearch = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
));
IconSearch.displayName = "IconSearch";
const IconChevron = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
));
IconChevron.displayName = "IconChevron";
const IconBox = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
));
IconBox.displayName = "IconBox";
const IconFilter = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
));
IconFilter.displayName = "IconFilter";
const IconRefresh = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
));
IconRefresh.displayName = "IconRefresh";
const IconSync = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
));
IconSync.displayName = "IconSync";
const IconEmpty = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        <line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" />
    </svg>
));
IconEmpty.displayName = "IconEmpty";
const IconTransfer = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
));
IconTransfer.displayName = "IconTransfer";
const IconPO = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
    </svg>
));
IconPO.displayName = "IconPO";
const IconAudit = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
    </svg>
));
IconAudit.displayName = "IconAudit";
const IconBarChart = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
        <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
));
IconBarChart.displayName = "IconBarChart";
const IconClose = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
));
IconClose.displayName = "IconClose";
const IconExport = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
));
IconExport.displayName = "IconExport";
const IconCheck = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
    </svg>
));
IconCheck.displayName = "IconCheck";
const IconTruck = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
        <circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
));
IconTruck.displayName = "IconTruck";

/* ── Constants (module-level — never recreated) ─────────── */
const ROWS_PER_PAGE = 15;
const LOW_STOCK_THRESHOLD = 10;
const EMPTY_PO = { vendor: "", items: [{ id: "", qty: 1 }] };

/* ── Pure helpers (module-level) ────────────────────────── */
const getStatus = (onHand) => {
    if (onHand <= 0) return "OUT_OF_STOCK";
    if (onHand <= LOW_STOCK_THRESHOLD) return "LOW_STOCK";
    return "IN_STOCK";
};
const STATUS_LABEL = { IN_STOCK: "In Stock", LOW_STOCK: "Low Stock", OUT_OF_STOCK: "Out of Stock" };
const STATUS_CLASS = { IN_STOCK: "db-status-in", LOW_STOCK: "db-status-low", OUT_OF_STOCK: "db-status-out" };
const ts = () => new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtNum = (val) => { 
    if (typeof val === "object" && val !== null) return "—";
    const n = Number(val); 
    return isNaN(n) ? "—" : n.toLocaleString("en-PH", { minimumFractionDigits: 2 }); 
};
const cellVal = (row, key) => {
    const val = row[key]?.value;
    if (val === null || val === undefined) return "—";
    if (typeof val === "object") return "—"; // Prevent rendering {} objects
    return val;
};
const formatDateInput = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};
const addMonths = (dateString, months) => {
    if (!dateString) return "";
    const baseDate = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return "";
    const result = new Date(baseDate);
    result.setMonth(result.getMonth() + months);
    return formatDateInput(result);
};
const clonePO = () => ({ vendor: "", requestedDate: formatDateInput(new Date()), items: [{ id: "", qty: 1 }] });

/* ── Memoised table row ─────────────────────────────────── */
const InventoryRow = memo(({ row, index }) => {
    const onHand = Number(row.OnHand?.value) || 0;
    const available = Number(row.Available?.value) || 0;
    const status = getStatus(onHand);
    
    return (
        <tr className={status === "LOW_STOCK" ? "db-row-warn" : status === "OUT_OF_STOCK" ? "db-row-danger" : ""}>
            <td className="db-row-num">{index}</td>
            <td><span className="db-inv-id">{cellVal(row, "InventoryID")}</span></td>
            <td className="db-desc">{cellVal(row, "Description")}</td>
            <td><span className="db-branch-tag">{cellVal(row, "Branch")}</span></td>
            <td>{cellVal(row, "SiteID")}</td>
            <td className="db-num">
                <span className={onHand > 0 ? "db-badge db-badge-green" : "db-badge"}>{onHand.toLocaleString()}</span>
            </td>
            <td className="db-num">
                <span className={available > 0 ? "db-badge db-badge-blue" : "db-badge"}>{available.toLocaleString()}</span>
            </td>
            <td className="db-num">{fmtNum(row.DefaultPrice?.value)}</td>
            <td><span className="db-class-tag">{cellVal(row, "ItemClass")}</span></td>
            <td><span className={`db-status-badge ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span></td>
        </tr>
    );
});
InventoryRow.displayName = "InventoryRow";

export default function DashboardPage() {
    const router = useRouter();

    /* ── Core state ─────────────────────────────────── */
    const [allInventory, setAllInventory] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [globalStats, setGlobalStats] = useState({ totalValue: 0, lowStock: 0, outOfStock: 0 });
    const [hasMore, setHasMore] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState("");
    const [branchOptions, setBranchOptions] = useState([]);
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [isCounting, setIsCounting] = useState(false);
    const [syncProgress, setSyncProgress] = useState({ current: 0, total: 30000, stage: "" });
    const [error, setError] = useState("");
    const [page, setPage] = useState(1);
    const [userName, setUserName] = useState("");
    const searchTimer = useRef(null);

    /* ── Audit log ──────────────────────────────────── */
    const [auditLog, setAuditLog] = useState([]);
    const addAudit = useCallback((action) => {
        setAuditLog((prev) => [{ time: ts(), action }, ...prev]);
    }, []);

    /* ── Modal visibility ───────────────────────────── */
    const [showTransfer, setShowTransfer] = useState(false);
    const [showPO, setShowPO] = useState(false);
    const [showAudit, setShowAudit] = useState(false);
    const [showSyncConfirm, setShowSyncConfirm] = useState(false);

    /* ── Transfer form state ────────────────────────── */
    const [transfer, setTransfer] = useState({ fromBranch: "", toBranch: "", itemId: "", qty: 1 });
    const [transferStep, setTransferStep] = useState(0);

    /* ── PO form state ──────────────────────────────── */
    const [po, setPO] = useState(clonePO);
    const [poSubmitted, setPOSubmitted] = useState(false);

    /* ── Load full name and branches ─────────────────── */
    useEffect(() => {
        const full = localStorage.getItem("userName") || "";
        const first = localStorage.getItem("userFirstName") || "";
        const last = localStorage.getItem("userLastName") || "";
        const display = (first || last)
            ? [first, last].filter(Boolean).join(" ")
            : full || "User";
        Promise.resolve().then(() => setUserName(display));

        // Fetch branches for the filter dropdown
        const fetchBranches = async () => {
            try {
                const res = await fetch("/api/branches");
                if (res.ok) {
                    const data = await res.json();
                    const list = Array.isArray(data) ? data : (data?.value || []);
                    const names = list.map((b) => b.SiteID || b.BranchName?.value || b.BranchID?.value).filter(Boolean);
                    setBranchOptions([...new Set(names)].sort());
                }
            } catch (err) {
                console.error("Branch fetch error", err);
            }
        };
        fetchBranches();
    }, []);

    /* ── Debounce search ────────────────────────────── */
    useEffect(() => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
        return () => clearTimeout(searchTimer.current);
    }, [search]);

    /* ── Fetch inventory — Server-side Pagination ────────────── */
    const fetchInventory = useCallback(async () => {
        if (syncing) return; // DON'T fetch while syncing to avoid 429
        setLoading(true);
        setError("");
        setAllInventory([]);

        try {
            // Step 1: Fast fetch for data + count (from Supabase)
            const dataParams = new URLSearchParams({
                page: String(page),
                pageSize: String(ROWS_PER_PAGE),
                search: debouncedSearch,
                branch: selectedBranch,
                count: "true",
                stats: "false",
                source: "supabase" // Use Supabase for instant speed
            });
            
            const res = await fetch(`/api/inventory?${dataParams.toString()}`);
            if (res.status === 401) { router.push("/signin"); return; }
            if (!res.ok) { setError("Failed to load inventory."); return; }

            const result = await res.json();
            setAllInventory(result.data || []);
            setTotalCount(result.totalCount || 0);
            setHasMore(!!result.hasMore);
            
            setLoading(false);

            // Step 2: Background fetch for stats (from Supabase)
            const statsParams = new URLSearchParams({
                page: "1",
                pageSize: "1",
                search: debouncedSearch,
                branch: selectedBranch,
                stats: "true",
                count: "false",
                source: "supabase"
            });
            
            fetch(`/api/inventory?${statsParams.toString()}`)
                .then(r => r.json())
                .then(sResult => {
                    if (sResult.globalStats) {
                        setGlobalStats(sResult.globalStats);
                    }
                })
                .catch(err => console.error("Stats fetch error:", err));

        } catch (err) {
            console.error("Fetch error:", err);
            setError("Unable to connect to the server.");
            setLoading(false);
        }
    }, [page, debouncedSearch, selectedBranch, router, syncing]);

    /* ── Sync Data from Acumatica to Supabase ─────────── */
    const startSync = useCallback(async (actualTotal) => {
        setShowSyncConfirm(false);
        setSyncing(true);
        let totalToSync = actualTotal || 30000;
        setSyncProgress({ current: 0, total: totalToSync, stage: "Phase 0: Initializing Turbo Sync..." });

        const startTime = Date.now();

        try {
            if (!actualTotal) {
                const countRes = await fetch("/api/inventory?count=true&pageSize=1&source=acumatica-direct");
                const countData = await countRes.json();
                totalToSync = countData.totalCount || 30000;
                setSyncProgress(p => ({ ...p, total: totalToSync }));
            }

            setSyncProgress(p => ({ ...p, stage: "Phase 1: Syncing Branches..." }));
            await fetch("/api/sync?type=branches", { method: "POST" });

            const prodLimit = 1000;
            let prodSkip = 0;
            let prodHasMore = true;

            while (prodHasMore) {
                setSyncProgress({ 
                    current: prodSkip, 
                    total: totalToSync, 
                    stage: `Phase 2: Products (${prodSkip.toLocaleString()} / ${totalToSync.toLocaleString()})` 
                });
                
                const res = await fetch(`/api/sync?type=products&skip=${prodSkip}&limit=${prodLimit}`, { method: "POST" });
                if (res.status === 429) { await new Promise(r => setTimeout(r, 10000)); continue; }
                if (!res.ok) throw new Error("Product sync failed");
                
                const data = await res.json();
                prodHasMore = data.hasMore;
                prodSkip += prodLimit;
                await new Promise(r => setTimeout(r, 200));
            }

            const levelLimit = 50; 
            let levelSkip = 0;
            const CONCURRENCY = 6;

            while (levelSkip < totalToSync) {
                setSyncProgress({ 
                    current: levelSkip, 
                    total: totalToSync, 
                    stage: `Phase 3: Turbo Stock Sync (${levelSkip.toLocaleString()} / ${totalToSync.toLocaleString()})` 
                });

                const batches = [];
                for (let i = 0; i < CONCURRENCY && (levelSkip + i * levelLimit) < totalToSync; i++) {
                    const currentSkip = levelSkip + (i * levelLimit);
                    batches.push(fetch(`/api/sync?type=levels&skip=${currentSkip}`, { method: "POST" }));
                }

                const responses = await Promise.all(batches);
                const has429 = responses.some(r => r.status === 429);
                
                if (has429) {
                    setSyncProgress(p => ({ ...p, stage: "Server busy, cooling down 10s..." }));
                    await new Promise(r => setTimeout(r, 10000));
                    continue;
                }

                levelSkip += (levelLimit * CONCURRENCY);
                await new Promise(r => setTimeout(r, 400));
            }

            const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            addAudit(`Manual Sync Complete: ${totalToSync.toLocaleString()} items updated in ${duration} mins.`);
            alert(`Sync Complete! Total time: ${duration} minutes.`);
            fetchInventory(); 

        } catch (err) {
            console.error("Sync error:", err);
            alert(`Sync interrupted: ${err.message}`);
        } finally {
            setSyncing(false);
            setSyncProgress({ current: 0, total: 30000, stage: "" });
        }
    }, [fetchInventory, addAudit]);

    const handleSyncClick = useCallback(() => {
        setSyncProgress(p => ({ ...p, total: 0 }));
        setShowSyncConfirm(true);
        fetch("/api/inventory?count=true&pageSize=1&source=acumatica-direct")
            .then(r => r.json())
            .then(data => {
                if (data.totalCount) setSyncProgress(p => ({ ...p, total: data.totalCount }));
            })
            .catch(e => console.warn("Background count fetch failed", e));
    }, []);

    useEffect(() => {
        Promise.resolve().then(() => fetchInventory());
    }, [fetchInventory]);

    /* ── Memoised derived data ──────────────────────── */

    // Use allInventory directly as it is already filtered by server
    const inventory = allInventory;

    // Stats — calculated for current page (can be updated to server-side global stats later)
    const stats = useMemo(() => {
        let totalValue = 0;
        let lowStock = 0;
        let outOfStock = 0;
        const seenIds = new Set();
        for (const r of inventory) {
            const onHand = Number(r.OnHand?.value) || 0;
            totalValue += (Number(r.DefaultPrice?.value) || 0) * onHand;
            const s = getStatus(onHand);
            if (s === "LOW_STOCK") lowStock++;
            else if (s === "OUT_OF_STOCK") outOfStock++;
            seenIds.add(r.InventoryID?.value);
        }
        return { uniqueItems: seenIds.size, totalValue, lowStock, outOfStock };
    }, [inventory]);

    // Use globalStats for cards, falling back to local stats if not available
    const displayStats = useMemo(() => ({
        totalValue: globalStats.totalValue > 0 ? globalStats.totalValue : stats.totalValue,
        lowStock: globalStats.lowStock > 0 ? globalStats.lowStock : stats.lowStock,
        outOfStock: globalStats.outOfStock > 0 ? globalStats.outOfStock : stats.outOfStock,
    }), [globalStats, stats]);

    // Pagination
    const totalPages = useMemo(() => {
        if (totalCount > 0) return Math.ceil(totalCount / ROWS_PER_PAGE);
        return hasMore ? page + 1 : page;
    }, [totalCount, hasMore, page]);

    const paged = inventory;

    // Item options for modals — since we don't have all inventory, we use what's on page
    // or we could fetch a separate full list if needed for modals.
    const inventoryOptions = useMemo(() =>
        [...new Map(allInventory.map((r) => [r.InventoryID?.value, r.Description?.value])).entries()]
            .sort((a, b) => (a[0] || "").localeCompare(b[0] || "")),
        [allInventory]
    );

    /* ── Stable user info ───────────────────────────── */
    const initials = useMemo(() => {
        const parts = userName.trim().split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return userName.slice(0, 2).toUpperCase();
    }, [userName]);

    /* ── Stable callbacks ───────────────────────────── */
    const handleBranchChange = useCallback((e) => {
        setSelectedBranch(e.target.value);
        setPage(1);
    }, []);

    const exportInventoryCSV = useCallback(() => {
        const headers = ["InventoryID", "Description", "SiteID", "Branch", "OnHand", "Available", "DefaultPrice", "ItemClass", "Status"];
        const rows = inventory.map((r) => {
            const onHand = Number(r.OnHand?.value) || 0;
            return [
                cellVal(r, "InventoryID"), cellVal(r, "Description"), cellVal(r, "SiteID"),
                cellVal(r, "Branch"), onHand, Number(r.Available?.value) || 0,
                Number(r.DefaultPrice?.value) || 0, cellVal(r, "ItemClass"),
                STATUS_LABEL[getStatus(onHand)],
            ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
        });
        const csv = [headers.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `inventory-${selectedBranch || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
        addAudit(`Exported inventory CSV (${selectedBranch || "All Branches"})`);
    }, [inventory, selectedBranch, addAudit]);

    const exportAuditCSV = useCallback(() => {
        const csv = ["Time,User,Action", ...auditLog.map((l) => `"${l.time}","${userName}","${l.action}"`)].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click(); URL.revokeObjectURL(url);
    }, [auditLog, userName]);

    const closeTransfer = useCallback(() => {
        setShowTransfer(false);
        setTransferStep(0);
        setTransfer({ fromBranch: "", toBranch: "", itemId: "", qty: 1 });
    }, []);

    const handleTransferSubmit = useCallback((e) => {
        e.preventDefault();
        if (!transfer.fromBranch || !transfer.toBranch || !transfer.itemId) return;
        if (transfer.fromBranch === transfer.toBranch) {
            alert("Source and target branch must be different.");
            return;
        }
        setTransferStep(1);
        setTimeout(() => {
            setTransferStep(2);
            addAudit(`Stock Transfer: ${transfer.itemId} × ${transfer.qty} | ${transfer.fromBranch} → ${transfer.toBranch} [IN TRANSIT]`);
        }, 1800);
    }, [transfer, addAudit]);

    const handlePOSubmit = useCallback((e) => {
        e.preventDefault();
        if (!po.vendor || !po.requestedDate || po.items.some((i) => !i.id)) { alert("Please fill in all fields."); return; }
        const nextRestockDate = addMonths(po.requestedDate, 3);
        const csv = [
            "Purchase Order",
            `Vendor,${po.vendor}`,
            `Requested Date,${po.requestedDate}`,
            `Next Restock Date,${nextRestockDate}`,
            `Generated By,${userName}`,
            "",
            "Item ID,Quantity",
            ...po.items.map((i) => `${i.id},${i.qty}`),
        ].join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `PO-${po.vendor.replace(/\s+/g, "-")}-${Date.now()}.csv`;
        a.click(); URL.revokeObjectURL(url);
        addAudit(`PO Created: Vendor "${po.vendor}" — ${po.items.length} line(s) — Next restock ${nextRestockDate}`);
        setPOSubmitted(true);
        setTimeout(() => { setPOSubmitted(false); setPO(clonePO()); setShowPO(false); }, 2200);
    }, [po, userName, addAudit]);

    /* ════════════════════════════════════════════════════
       RENDER
    ═════════════════════════════════════════════════════ */
    return (
        <div className="db-root">
            {/* ── Sync Confirmation Modal ── */}
            {showSyncConfirm && (
                <div className="db-modal-overlay">
                    <div className="db-modal" style={{ maxWidth: "400px" }}>
                        <div className="db-modal-header">
                            <div className="db-modal-title"><IconSync /><span>Sync Confirmation</span></div>
                            <button className="db-modal-close" onClick={() => setShowSyncConfirm(false)}><IconClose /></button>
                        </div>
                        <div className="db-modal-body" style={{ textAlign: "center", padding: "2rem" }}>
                            <div className="db-state-icon db-state-icon-blue" style={{ margin: "0 auto 1.5rem" }}><IconSync /></div>
                            <h3>Start Incremental Sync?</h3>
                            <p style={{ marginTop: "0.5rem", color: "#64748b" }}>
                                {syncProgress.total > 0 ? (
                                    <>This will process <strong>{syncProgress.total.toLocaleString()}</strong> items in turbo batches.</>
                                ) : (
                                    "Counting items in background..."
                                )}
                            </p>
                            <p style={{ fontSize: "0.8125rem", marginTop: "1rem", color: "#94a3b8" }}>
                                Turbo mode uses parallel requests to speed up syncing by 5x.
                            </p>
                        </div>
                        <div className="db-modal-footer" style={{ justifyContent: "center", gap: "1rem" }}>
                            <button className="db-btn-secondary" onClick={() => setShowSyncConfirm(false)}>Cancel</button>
                            <button className="db-btn-primary" onClick={() => startSync(syncProgress.total)}>Yes, Start Sync</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Sync Progress Overlay ── */}
            {syncing && (
                <div className="db-sync-overlay">
                    <div className="db-sync-card">
                        <div className="db-spinner db-spinner-lg" style={{ margin: "0 auto 1.5rem" }} />
                        <h3>Turbo Syncing...</h3>
                        <p>{syncProgress.stage}</p>
                        
                        <div className="db-progress-container">
                            <div 
                                className="db-progress-bar" 
                                style={{ width: `${Math.min(100, (syncProgress.current / syncProgress.total) * 100)}%` }} 
                            />
                        </div>
                        
                        <div className="db-progress-stats">
                            {syncProgress.current.toLocaleString()} / {syncProgress.total.toLocaleString()} processed
                        </div>
                        <p style={{ marginTop: "1rem", fontSize: "0.75rem" }}>
                            Please do not close this tab. Turbo mode is active.
                        </p>
                    </div>
                </div>
            )}

            <main className="db-main">

                {/* ── Welcome banner ───────────────────────── */}
                <div className="db-page-title">
                    <h1>Dashboard</h1>
                    <p>Welcome back, <strong>{userName}</strong>! Here&apos;s your inventory overview{selectedBranch ? ` for ${selectedBranch}` : " across all branches"}.</p>
                </div>

                {/* ── Stat cards ───────────────────────────── */}
                <div className="db-stats">
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total Products</span>
                        <span className="db-stat-value">{(totalCount > 0 ? totalCount : stats.uniqueItems).toLocaleString()}</span>
                        <span className="db-stat-sub">{selectedBranch || "All Branches"}</span>
                    </div>
                    <div className="db-stat-card">
                        <span className="db-stat-label">Total Value</span>
                        <span className="db-stat-value">
                            ₱{displayStats.totalValue.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span className="db-stat-sub">Price × On-Hand stock</span>
                    </div>
                    <div className="db-stat-card db-stat-warn">
                        <span className="db-stat-label">⚠ Low Stock Alerts</span>
                        <span className="db-stat-value">{displayStats.lowStock.toLocaleString()}</span>
                        <span className="db-stat-sub">Items ≤ {LOW_STOCK_THRESHOLD} units</span>
                    </div>
                    <div className="db-stat-card db-stat-danger">
                        <span className="db-stat-label">🚫 Out of Stock</span>
                        <span className="db-stat-value">{displayStats.outOfStock.toLocaleString()}</span>
                        <span className="db-stat-sub">Zero units on hand</span>
                    </div>
                </div>

                {/* ── Toolbar ──────────────────────────────── */}
                <div className="db-toolbar">
                    <div className="db-toolbar-left">
                        <div className="db-select-wrapper">
                            <IconFilter />
                            <select className="db-select" value={selectedBranch} onChange={handleBranchChange}>
                                <option value="">All Branches</option>
                                {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                            </select>
                            <IconChevron />
                        </div>
                        <div className="db-search-wrapper">
                            <IconSearch />
                            <input
                                className="db-search"
                                type="text"
                                placeholder="Search inventory ID or description…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="db-toolbar-right">
                        <button className={`db-action-btn db-action-sync ${syncing ? "db-btn-loading" : ""}`} onClick={handleSyncClick} disabled={syncing}>
                            <IconSync />
                            <span>{syncing ? "Syncing..." : "Sync Acumatica"}</span>
                        </button>
                        <button className="db-action-btn db-action-audit" onClick={() => setShowAudit(true)}>
                            <IconAudit />
                            <span>Audit Log</span>
                            {auditLog.length > 0 && <span className="db-badge-count">{auditLog.length}</span>}
                        </button>
                        <button className="db-action-btn" onClick={exportInventoryCSV}>
                            <IconExport /><span>Export CSV</span>
                        </button>
                        <button className="db-refresh-btn" onClick={fetchInventory} title="Refresh">
                            <IconRefresh /><span>Refresh</span>
                        </button>
                    </div>
                </div>

                {/* ── Error ──────────────────────────────────── */}
                {error && (
                    <div className="db-error-card">
                        <div className="db-error-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                        </div>
                        <div className="db-error-body">
                            <p className="db-error-title">Unable to load inventory</p>
                            <p className="db-error-msg">There was a problem connecting to the server. Please refresh or try again.</p>
                        </div>
                        <button className="db-error-retry" onClick={fetchInventory}>Retry</button>
                    </div>
                )}

                {/* ── Loading Overlay ──────────────── */}
                {loading && allInventory.length > 0 && (
                    <div className="db-stream-bar">
                        <div className="db-stream-pulse" />
                        <span>Updating view…</span>
                    </div>
                )}

                {/* ── Inventory Table ───────────────────── */}
                <div className="db-table-wrap">
                    {loading && allInventory.length === 0 ? (
                        <div className="db-loading">
                            <div className="db-spinner" />
                            <span>Loading inventory…</span>
                        </div>
                    ) : paged.length === 0 && !loading ? (
                        <div className="db-empty">
                            <IconEmpty />
                            <p>No records found</p>
                            <span>Try changing the branch or search term</span>
                        </div>
                    ) : (
                        <table className="db-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Inventory ID</th>
                                    <th>Description</th>
                                    <th>Branch</th>
                                    <th>Site ID</th>
                                    <th className="db-num">On Hand</th>
                                    <th className="db-num">Available</th>
                                    <th className="db-num">Default Price</th>
                                    <th>Item Class</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((row, i) => (
                                    <InventoryRow
                                        key={(row.InventoryID?.value ?? i) + "-" + (row.SiteID?.value ?? "")}
                                        row={row}
                                        index={(page - 1) * ROWS_PER_PAGE + i + 1}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Pagination ─────────────────────────── */}
                {!loading && inventory.length > 0 && (totalPages > 1 || page > 1) && (
                    <div className="db-pagination">
                        <span className="db-page-info">
                            Showing {((page - 1) * ROWS_PER_PAGE) + 1}–{((page - 1) * ROWS_PER_PAGE) + inventory.length} 
                            {totalCount > 0 ? ` of ${totalCount.toLocaleString()} items` : " items"}
                        </span>
                        <div className="db-page-btns">
                            <button className="db-page-btn db-page-btn-nav" disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Previous Page">&lsaquo;</button>

                            {(() => {
                                const pages = [];
                                const actualTotalPages = totalPages;
                                const current = page;
                                const delta = 2; 
                                
                                if (actualTotalPages <= 7) {
                                    for (let i = 1; i <= actualTotalPages; i++) pages.push(i);
                                } else {
                                    // Laging ipakita ang Page 1
                                    pages.push(1);
                                    
                                    const start = Math.max(2, current - delta);
                                    const end = Math.min(actualTotalPages - 1, current + delta);
                                    
                                    if (start > 2) {
                                        pages.push("...");
                                    }
                                    
                                    for (let i = start; i <= end; i++) {
                                        pages.push(i);
                                    }
                                    
                                    if (end < actualTotalPages - 1) {
                                        pages.push("...");
                                    }
                                    
                                    // Laging ipakita ang Last Page Number
                                    pages.push(actualTotalPages);
                                }

                                return pages.map((p, i) => (
                                    p === "..." ? (
                                        <span key={`ell-${i}`} className="db-page-dots">...</span>
                                    ) : (
                                        <button
                                            key={p}
                                            className={`db-page-btn ${p === page ? "db-page-btn-active" : ""}`}
                                            onClick={() => setPage(p)}
                                        >{p}</button>
                                    )
                                ));
                            })()}
                            
                            <button className="db-page-btn db-page-btn-nav" disabled={!hasMore && page >= totalPages} onClick={() => setPage(p => p + 1)} title="Next Page">&rsaquo;</button>
                        </div>
                    </div>
                )}
            </main>

            {/* ══════════════════════════════════════════
                MODAL — Stock Transfer
            ══════════════════════════════════════════ */}
            {showTransfer && (
                <div className="db-modal-overlay" onClick={closeTransfer}>
                    <div className="db-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="db-modal-header">
                            <div className="db-modal-title"><IconTransfer /><span>Stock Transfer</span></div>
                            <button className="db-modal-close" onClick={closeTransfer}><IconClose /></button>
                        </div>

                        {transferStep === 0 && (
                            <form className="db-modal-body" onSubmit={handleTransferSubmit}>
                                <div className="db-transfer-steps">
                                    <div className="db-step db-step-active"><span>1</span>Source Branch</div>
                                    <div className="db-step-arrow">›</div>
                                    <div className="db-step db-step-active"><span>2</span>Target Branch</div>
                                    <div className="db-step-arrow">›</div>
                                    <div className="db-step"><span>3</span>In Transit</div>
                                </div>

                                <div className="db-form-row">
                                    <div className="db-form-group">
                                        <label>Source Branch</label>
                                        <select required value={transfer.fromBranch} onChange={(e) => setTransfer({ ...transfer, fromBranch: e.target.value })}>
                                            <option value="">Select branch…</option>
                                            {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                    <div className="db-form-group">
                                        <label>Target Branch</label>
                                        <select required value={transfer.toBranch} onChange={(e) => setTransfer({ ...transfer, toBranch: e.target.value })}>
                                            <option value="">Select branch…</option>
                                            {branchOptions.map((b) => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="db-form-group">
                                    <label>Item to Transfer</label>
                                    <select required value={transfer.itemId} onChange={(e) => setTransfer({ ...transfer, itemId: e.target.value })}>
                                        <option value="">Select item…</option>
                                        {inventoryOptions.map(([id, desc]) => (
                                            <option key={id} value={id}>{id}{desc ? ` — ${desc}` : ""}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="db-form-group">
                                    <label>Quantity</label>
                                    <input type="number" min="1" required value={transfer.qty} onChange={(e) => setTransfer({ ...transfer, qty: Number(e.target.value) })} />
                                </div>

                                <div className="db-modal-footer">
                                    <button type="button" className="db-btn-secondary" onClick={closeTransfer}>Cancel</button>
                                    <button type="submit" className="db-btn-primary"><IconTransfer /> Initiate Transfer</button>
                                </div>
                            </form>
                        )}

                        {transferStep === 1 && (
                            <div className="db-modal-body db-state-center">
                                <div className="db-state-icon db-state-icon-blue"><IconTruck /></div>
                                <h3>Processing Transfer…</h3>
                                <p className="db-state-sub">{transfer.fromBranch} → {transfer.toBranch}</p>
                                <div className="db-spinner db-spinner-lg" style={{ marginTop: "1.5rem" }} />
                            </div>
                        )}

                        {transferStep === 2 && (
                            <div className="db-modal-body db-state-center">
                                <div className="db-state-icon db-state-icon-green"><IconCheck /></div>
                                <h3 className="db-transit-label">IN TRANSIT</h3>
                                <p><strong>{transfer.qty}× {transfer.itemId}</strong></p>
                                <p className="db-state-sub">{transfer.fromBranch} → {transfer.toBranch}</p>
                                <p className="db-state-note">Transfer has been logged to the Audit Log.</p>
                                <button className="db-btn-primary" style={{ marginTop: "1.5rem" }} onClick={closeTransfer}>Done</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                MODAL — Purchase Order
            ══════════════════════════════════════════ */}
            {showPO && (
                <div className="db-modal-overlay" onClick={() => { if (!poSubmitted) { setPO(clonePO()); setShowPO(false); } }}>
                    <div className="db-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="db-modal-header">
                            <div className="db-modal-title"><IconPO /><span>Create Purchase Order</span></div>
                            <button className="db-modal-close" onClick={() => { setPO(clonePO()); setShowPO(false); }}><IconClose /></button>
                        </div>

                        {poSubmitted ? (
                            <div className="db-modal-body db-state-center">
                                <div className="db-state-icon db-state-icon-green"><IconCheck /></div>
                                <h3>PO Submitted!</h3>
                                <p className="db-state-sub">CSV file downloaded successfully.</p>
                            </div>
                        ) : (
                            <form className="db-modal-body" onSubmit={handlePOSubmit}>
                                <div className="db-transfer-steps">
                                    <div className="db-step db-step-active"><span>1</span>Select Vendor</div>
                                    <div className="db-step-arrow">›</div>
                                    <div className="db-step db-step-active"><span>2</span>Add Items</div>
                                    <div className="db-step-arrow">›</div>
                                    <div className="db-step"><span>3</span>Submit PO</div>
                                </div>

                                <div className="db-form-group">
                                    <label>Vendor Name</label>
                                    <input type="text" required placeholder="Enter vendor name…" value={po.vendor} onChange={(e) => setPO({ ...po, vendor: e.target.value })} />
                                </div>

                                <div className="db-form-row">
                                    <div className="db-form-group">
                                        <label>Restock Request Date</label>
                                        <input type="date" required value={po.requestedDate} onChange={(e) => setPO({ ...po, requestedDate: e.target.value })} />
                                    </div>
                                    <div className="db-form-group">
                                        <label>Next Restock Due</label>
                                        <input type="date" value={addMonths(po.requestedDate, 3)} readOnly />
                                    </div>
                                </div>

                                <div className="db-po-items-label">
                                    <label>Items</label>
                                    <button type="button" className="db-btn-add-item" onClick={() => setPO({ ...po, items: [...po.items, { id: "", qty: 1 }] })}>+ Add Item</button>
                                </div>

                                {po.items.map((item, idx) => (
                                    <div className="db-po-item-row" key={idx}>
                                        <select required value={item.id} onChange={(e) => { const items = [...po.items]; items[idx].id = e.target.value; setPO({ ...po, items }); }}>
                                            <option value="">Select item…</option>
                                            {inventoryOptions.map(([id, desc]) => (
                                                <option key={id} value={id}>{id}{desc ? ` — ${desc}` : ""}</option>
                                            ))}
                                        </select>
                                        <input
                                            type="number" min="1" value={item.qty}
                                            onChange={(e) => { const items = [...po.items]; items[idx].qty = Number(e.target.value); setPO({ ...po, items }); }}
                                        />
                                        {po.items.length > 1 && (
                                            <button type="button" className="db-btn-remove-item" onClick={() => setPO({ ...po, items: po.items.filter((_, i) => i !== idx) })}>×</button>
                                        )}
                                    </div>
                                ))}

                                <div className="db-modal-footer">
                                    <button type="button" className="db-btn-secondary" onClick={() => { setPO(clonePO()); setShowPO(false); }}>Cancel</button>
                                    <button type="submit" className="db-btn-primary"><IconPO /> Submit PO</button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════
                MODAL — Audit Log
            ══════════════════════════════════════════ */}
            {showAudit && (
                <div className="db-modal-overlay" onClick={() => setShowAudit(false)}>
                    <div className="db-modal db-modal-wide" onClick={(e) => e.stopPropagation()}>
                        <div className="db-modal-header">
                            <div className="db-modal-title"><IconAudit /><span>Audit Log</span></div>
                            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                {auditLog.length > 0 && (
                                    <button className="db-action-btn" onClick={exportAuditCSV}>
                                        <IconExport /><span>Export CSV</span>
                                    </button>
                                )}
                                <button className="db-modal-close" onClick={() => setShowAudit(false)}><IconClose /></button>
                            </div>
                        </div>
                        <div className="db-modal-body">
                            {auditLog.length === 0 ? (
                                <div className="db-audit-empty">No activity recorded yet in this session.</div>
                            ) : (
                                <ul className="db-audit-list">
                                    {auditLog.map((entry, i) => (
                                        <li key={i} className="db-audit-entry">
                                            <span className="db-audit-time">{entry.time}</span>
                                            <span className="db-audit-user">{userName}</span>
                                            <span className="db-audit-action">{entry.action}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
