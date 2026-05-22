const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

const toISODate = (date) => date.toISOString().split("T")[0];

// In-memory caches to improve performance and avoid redundant ERP hits
const countCache = new Map();
const statsCache = new Map();
const branchCache = {
    data: null,
    timestamp: 0
};

/**
 * Service for interacting with Acumatica ERP.
 * This acts as the core of our BFF (Backend-for-Frontend) layer.
 */
export const AcumaticaService = {
    /** ── HELPER: Robust Fetch with Retries ── */
    async fetchWithRetry(url, cookie, options = {}) {
        let lastError = null;
        const maxAttempts = 3;

        for (let attempts = 1; attempts <= maxAttempts; attempts++) {
            try {
                // Mimic browser headers to avoid being blocked by ERP security rules
                const res = await fetch(url, {
                    ...options,
                    headers: {
                        "Accept": "application/json",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Cookie": cookie || "",
                        ...options.headers,
                    },
                    cache: 'no-store',
                });

                if (res.status === 401) {
                    console.error(`[Acumatica] 401 Unauthorized at ${url}. Cookie length: ${cookie?.length || 0}`);
                    throw new Error("Unauthorized");
                }

                if (res.status === 429 || res.status === 500 || res.status === 503) {
                    const errorText = await res.text().catch(() => "No error body");
                    console.warn(`[Acumatica] Status ${res.status}. Retry ${attempts}/${maxAttempts}. Body: ${errorText.substring(0, 100)}`);
                    await new Promise(r => setTimeout(r, 2000 * attempts));
                    lastError = new Error(`Acumatica Error: ${res.status}`);
                    continue;
                }

                if (!res.ok) throw new Error(`Acumatica Error: ${res.status}`);

                return res;
            } catch (err) {
                if (err.message === "Unauthorized") throw err;
                console.error(`[Acumatica Fetch Error] Attempt ${attempts}:`, err.message);
                lastError = err;
                if (attempts < maxAttempts) {
                    await new Promise(r => setTimeout(r, 1500 * attempts));
                }
            }
        }
        throw lastError || new Error("Failed to fetch after multiple retries");
    },

    /** ── HELPER: Generic multi-page fetcher with Retry ── */
    async fetchAllPages(url, cookie, pageSize = 500) {
        const results = [];
        for (let skip = 0; skip < 20000; skip += pageSize) {
            const sep = url.includes("?") ? "&" : "?";
            const fullUrl = `${url}${sep}$top=${pageSize}&$skip=${skip}`;

            const res = await this.fetchWithRetry(fullUrl, cookie);
            const data = await res.json();
            const items = data.value ?? data.d?.results ?? (Array.isArray(data) ? data : []);
            results.push(...items);

            if (items.length < pageSize) break;

            await new Promise(r => setTimeout(r, 300));
            if (results.length >= 20000) break;
        }
        return results;
    },

    /** ── INVENTORY: Transform StockItem ── */
    transformStockItem(item, selectedBranch = "") {
        const wds = item.WarehouseDetails || [];
        let onHand = 0;
        let available = 0;
        let availForShip = 0;
        let siteId = item.DefaultWarehouseID?.value ?? item.DefaultWarehouseID ?? item.DefaultWarehouse?.value ?? "—";
        let branchName = siteId;

        if (selectedBranch) {
            const wh = wds.find(w => {
                const whId = (w.WarehouseID?.value ?? w.WarehouseID ?? "").toString().toLowerCase();
                return whId === selectedBranch.toLowerCase();
            });

            if (wh) {
                onHand = Number(wh.QtyOnHand?.value ?? wh.QtyOnHand ?? 0);
                available = Number(wh.QtyAvailable?.value ?? 0);
                availForShip = Number(wh.QtyAvailableForShipment?.value ?? 0);
                siteId = wh.WarehouseID?.value ?? wh.WarehouseID ?? "";
                branchName = siteId;
            } else {
                onHand = 0; available = 0; availForShip = 0;
                branchName = selectedBranch;
            }
        } else {
            if (wds.length > 0) {
                wds.forEach(wh => {
                    onHand += Number(wh.QtyOnHand?.value ?? wh.QtyOnHand ?? 0);
                    available += Number(wh.QtyAvailable?.value ?? 0);
                    availForShip += Number(wh.QtyAvailableForShipment?.value ?? 0);
                });
                branchName = "All Warehouses";
            } else {
                onHand = 0; available = 0; availForShip = 0;
            }
        }

        return {
            InventoryID: { value: item.InventoryID?.value ?? item.InventoryID ?? "" },
            Description: { value: item.Description?.value ?? item.Description ?? "" },
            SiteID: { value: siteId },
            OnHand: { value: onHand },
            Available: { value: available },
            AvailForShip: { value: availForShip },
            DefaultPrice: { value: item.DefaultPrice?.value ?? item.DefaultPrice ?? 0 },
            ItemClass: { value: item.ItemClass?.value ?? item.ItemClass ?? item.ItemClassID?.value ?? "" },
            Branch: { value: branchName },
        };
    },

    /** ── INVENTORY: Get Paginated List ── */
    async getStockItems({ page, pageSize, search, branch, cookie, includeStats = false, includeCount = false }) {
        const skip = (page - 1) * pageSize;
        const cacheKey = `count-${search}-${branch}`;
        const statsKey = `stats-${search}-${branch}`;
        let filterParts = [];

        if (search) {
            const s = search.replace(/'/g, "''");
            filterParts.push(`(substringof('${s}', InventoryID/Value) or substringof('${s}', Description/Value))`);
        }
        if (branch) {
            const b = branch.replace(/'/g, "''");
            filterParts.push(`DefaultWarehouseID eq '${b}'`);
        }

        const filterStr = filterParts.length > 0 ? `&$filter=${filterParts.join(" and ")}` : "";
        const selectFields = "InventoryID,Description,DefaultWarehouseID,DefaultPrice,ItemClass";

        const cachedCount = countCache.get(cacheKey);
        const cachedStats = statsCache.get(statsKey);

        const dataUrl = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$select=${selectFields}&$top=${pageSize}&$skip=${skip}${filterStr}`;
        const res = await this.fetchWithRetry(dataUrl, cookie);
        const data = await res.json();
        const rawItems = data.value || (Array.isArray(data) ? data : []);

        let globalStats = cachedStats || { totalValue: 0, lowStock: 0, outOfStock: 0, count: 0 };
        if (includeStats && !cachedStats) {
            try {
                const statsUrl = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$select=DefaultPrice,WarehouseDetails&$top=1000${filterStr}`;
                const sRes = await this.fetchWithRetry(statsUrl, cookie);
                const sData = await sRes.json();
                const sItems = sData.value || [];

                globalStats = { totalValue: 0, lowStock: 0, outOfStock: 0, count: 0 };
                for (const item of sItems) {
                    const price = Number(item.DefaultPrice?.value ?? item.DefaultPrice ?? 0);
                    let onHand = 0;
                    const wds = item.WarehouseDetails || [];
                    if (branch) {
                        const wh = wds.find(w => (w.WarehouseID?.value ?? w.WarehouseID ?? "").toString().toLowerCase() === branch.toLowerCase());
                        onHand = Number(wh?.QtyOnHand?.value ?? wh?.QtyOnHand ?? 0);
                    } else {
                        wds.forEach(wh => { onHand += Number(wh.QtyOnHand?.value ?? wh.QtyOnHand ?? 0); });
                    }
                    if (!isNaN(price) && !isNaN(onHand)) globalStats.totalValue += price * onHand;
                    if (onHand <= 0) globalStats.outOfStock++;
                    else if (onHand <= 10) globalStats.lowStock++;
                }
                statsCache.set(statsKey, globalStats);
            } catch (err) {
                console.warn("[Acumatica Stats Error] Non-critical:", err.message);
            }
        }

        let totalCount = cachedCount || 0;
        if (includeCount && !cachedCount) {
            try {
                const countUrl = `${ACU_BASE}/StockItem?$select=InventoryID&$top=10000${filterStr}`;
                const cRes = await this.fetchWithRetry(countUrl, cookie);
                const cData = await cRes.json();
                const cItems = cData.value || (Array.isArray(cData) ? cData : []);
                totalCount = cItems.length;
                if (totalCount > 0) countCache.set(cacheKey, totalCount);
            } catch (err) {
                console.warn("[Acumatica Count Error] Non-critical:", err.message);
            }
        }

        if (totalCount > 0) globalStats.count = totalCount;
        const hasMore = totalCount > (skip + rawItems.length) || rawItems.length === pageSize;

        return {
            data: rawItems.map(item => this.transformStockItem(item, branch)),
            totalCount,
            globalStats,
            hasMore
        };
    },

    /** ── BRANCHES: Get Actual Branch IDs ── */
    async getRealBranches(cookie) {
        // Try Warehouse endpoint (Branch endpoint not available on this API version)
        try {
            const url = `${ACU_BASE}/Warehouse?$select=WarehouseID,Description`;
            const res = await this.fetchWithRetry(url, cookie);
            const data = await res.json();
            const warehouses = data.value || (Array.isArray(data) ? data : []);
            return warehouses.map(w => ({
                BranchID: w.WarehouseID?.value || w.WarehouseID,
                Description: w.Description?.value || w.Description || ""
            })).filter(b => b.BranchID);
        } catch (err) {
            console.warn("[Acumatica Real Branch Error]", err.message);
            return [];
        }
    },

    /** ── BRANCHES: Get Site IDs / Warehouses ── */
    async getBranches(cookie) {
        const now = Date.now();
        if (branchCache.data && (now - branchCache.timestamp < 3600000)) {
            return branchCache.data;
        }

        const url = `${ACU_BASE}/Warehouse?$select=WarehouseID,Description`;
        try {
            const res = await this.fetchWithRetry(url, cookie);
            const data = await res.json();
            const warehouses = data.value || (Array.isArray(data) ? data : []);
            const result = warehouses
                .map(w => ({
                    SiteID: w.WarehouseID?.value || w.WarehouseID,
                    Description: w.Description?.value || w.Description || ""
                }))
                .filter(w => w.SiteID)
                .sort((a, b) => a.SiteID.toString().localeCompare(b.SiteID.toString()));

            branchCache.data = result;
            branchCache.timestamp = now;
            return result;
        } catch (err) {
            console.warn("[Acumatica Branch Error] Falling back to StockItem heuristic:", err.message);
            const fallbackUrl = `${ACU_BASE}/StockItem?$select=DefaultWarehouseID&$top=500`;
            const fbRes = await this.fetchWithRetry(fallbackUrl, cookie);
            const fbData = await fbRes.json();
            const seen = new Set((fbData.value || []).map(i => i.DefaultWarehouseID?.value || i.DefaultWarehouseID).filter(Boolean));
            return [...seen].sort().map(id => ({ SiteID: id }));
        }
    },

    /** ── SALES: Get History/Analysis ── */
    async getSalesAnalysis({ branch, cookie, startDate, endDate }) {
        const today = new Date();
        const start = startDate ? new Date(startDate) : new Date(today.setDate(today.getDate() - 90));
        const end = endDate ? new Date(endDate) : new Date();
        const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));

        let invUrl = `${ACU_BASE}/StockItem?$select=InventoryID,Description,ItemClass,PostingClass,DefaultWarehouseID&$expand=WarehouseDetails`;
        if (branch) invUrl += `&$filter=DefaultWarehouseID eq '${branch.replace(/'/g, "''")}'`;
        const inventory = await this.fetchAllPages(invUrl, cookie, 200);

        const salesUrl = `${ACU_BASE}/InventoryTransaction?$filter=Date ge datetime'${toISODate(start)}T00:00:00' and Date le datetime'${toISODate(end)}T23:59:59'&$select=InventoryID,Qty`;
        const salesData = await this.fetchAllPages(salesUrl, cookie, 500);

        const salesMap = new Map();
        for (const s of salesData) {
            const id = (s.InventoryID?.value || s.InventoryID || "").toString();
            const qty = Math.abs(Number(s.Qty?.value || s.Qty || 0));
            salesMap.set(id, (salesMap.get(id) || 0) + qty);
        }

        const rows = inventory.map(item => {
            const invId = (item.InventoryID?.value || item.InventoryID || "").toString();
            const last3mQty = salesMap.get(invId) || 0;
            const whs = item.WarehouseDetails || [];
            let onHand = 0;
            for (const wh of whs) {
                const whId = (wh.WarehouseID?.value || wh.WarehouseID || "").toString();
                if (branch && whId !== branch) continue;
                onHand += Number(wh.OnHand?.value || wh.OnHand || 0);
            }

            return {
                inventoryId: invId,
                description: item.Description?.value || item.Description || "",
                onHand,
                last3mQty,
                avgPerDay: last3mQty / days,
                remarks: (last3mQty - onHand) > 0 ? "Reorder" : "Overstock"
            };
        });

        return { data: rows, days, startDate: toISODate(start), endDate: toISODate(end) };
    },

    /** ── PERIODIC SALES: Get Data from GI640113 ── */
    async getPeriodicSales({ cookie, branch, startDate, endDate, top = 1000, skip = 0 }) {
        let url = `${ACU_BASE}/GI640113?$top=${top}&$skip=${skip}`;
        let filterParts = [];
        if (startDate) filterParts.push(`DocumentDate ge datetime'${startDate}T00:00:00'`);
        if (endDate) filterParts.push(`DocumentDate le datetime'${endDate}T23:59:59'`);
        if (branch) filterParts.push(`BranchName eq '${branch.replace(/'/g, "''")}'`);

        if (filterParts.length > 0) {
            url += `&$filter=${filterParts.join(" and ")}`;
        }

        const res = await this.fetchWithRetry(url, cookie);
        const data = await res.json();
        return data.value || [];
    },

    async fetchSalesInvoicesByDateRange({ cookie, startDate, endDate }) {
        const results = [];
        const filter = `Date ge datetimeoffset'${startDate}T00:00:00Z' and Date le datetimeoffset'${endDate}T23:59:59Z'`;
        
        try {
            console.log(`>>> [Acumatica] Searching SalesInvoice: ${filter}`);
            let url = `${ACU_BASE}/SalesInvoice?$expand=Details&$top=500&$filter=${filter}`;
            let res = await this.fetchWithRetry(url, cookie);
            let data = await res.json();
            let items = data.value || (Array.isArray(data) ? data : []);
            
            if (items.length > 0) return items;

            url = `${ACU_BASE}/Invoice?$expand=Details&$top=500&$filter=${filter}`;
            res = await this.fetchWithRetry(url, cookie);
            data = await res.json();
            items = data.value || (Array.isArray(data) ? data : []);
            
            if (items.length > 0) return items;

            url = `${ACU_BASE}/Invoice?$expand=Details&$top=100&$orderby=Date desc`;
            res = await this.fetchWithRetry(url, cookie);
            data = await res.json();
            return data.value || [];

        } catch (err) {
            return [];
        }
    },

    async getIncomingPO(cookie) {
        try {
            const url = `${ACU_BASE}/PurchaseOrder?$expand=Details&$filter=Status eq 'Open' or Status eq 'Balanced'`;
            const res = await this.fetchWithRetry(url, cookie);
            const data = await res.json();
            const pos = data.value || (Array.isArray(data) ? data : []);

            return pos.map(po => ({
                orderNbr: getF(po, "OrderNbr"),
                status: getF(po, "Status"),
                vendor: getF(po, "VendorID") || getF(po, "Vendor"),
                orderDate: getF(po, "Date") || getF(po, "OrderDate"),
                details: (po.Details || []).map(d => ({
                    inventoryId: getF(d, "InventoryID"),
                    description: getF(d, "Description") || getF(d, "TransactionDescr"),
                    qty: Number(getF(d, "OrderQty") || getF(d, "Qty") || 0),
                    unitCost: Number(getF(d, "UnitCost") || 0),
                    extCost: Number(getF(d, "ExtCost") || getF(d, "Amount") || 0),
                    uom: getF(d, "UOM"),
                    warehouseId: getF(d, "WarehouseID") || getF(d, "SiteID"),
                })),
            }));
        } catch (err) {
            console.error("[Acumatica PO Error]", err.message);
            return [];
        }
    }
};

const getF = (obj, keyName) => {
    if (!obj) return "";
    const k = Object.keys(obj).find(i => i.toLowerCase() === keyName.toLowerCase());
    if (!k) return "";
    const val = obj[k];
    return (val?.value !== undefined ? val.value : val) ?? "";
};
