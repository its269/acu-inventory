const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

const toISODate = (date) => date.toISOString().split("T")[0];

// In-memory caches to improve performance and avoid redundant ERP hits
const countCache = new Map();
const statsCache = new Map();
const branchCache = {
    data: null,
    timestamp: 0
};

// Helper for delays
const sleep = (ms) => new Promise(res => setTimeout(ms, res));

/**
 * Service for interacting with Acumatica ERP.
 * This acts as the core of our BFF (Backend-for-Frontend) layer.
 */
export const AcumaticaService = {
    /** ── HELPER: Generic multi-page fetcher with Retry for 429/500 ── */
    async fetchAllPages(url, cookie, pageSize = 500) {
        const results = [];
        for (let skip = 0; skip < 20000; skip += pageSize) {
            const sep = url.includes("?") ? "&" : "?";
            const fullUrl = `${url}${sep}$top=${pageSize}&$skip=${skip}`;
            
            let attempts = 0;
            let success = false;
            
            while (attempts < 3 && !success) {
                try {
                    const res = await fetch(fullUrl, {
                        headers: { Cookie: cookie, Accept: "application/json" },
                        cache: 'no-store',
                    });

                    if (res.status === 401) {
                        console.error("[Acumatica] Session expired or unauthorized during sync.");
                        throw new Error("Unauthorized");
                    }
                    
                    if (res.status === 429 || res.status === 500) {
                        const wait = (attempts + 1) * 5000; // Increase to 5s, 10s, 15s
                        console.warn(`[Acumatica] Status ${res.status}. Retrying (${attempts + 1}/3) in ${wait}ms...`);
                        await new Promise(r => setTimeout(r, wait));
                        attempts++;
                        continue;
                    }

                    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                    
                    const data = await res.json();
                    const items = data.value ?? data.d?.results ?? (Array.isArray(data) ? data : []);
                    results.push(...items);
                    
                    if (items.length < pageSize) {
                        success = true;
                        break;
                    }
                    
                    success = true;
                    // Breath between pages: 500ms (half a second) to stay under the radar
                    await new Promise(r => setTimeout(r, 500));
                } catch (fetchErr) {
                    if (fetchErr.message === "Unauthorized") throw fetchErr;
                    console.error(`[Acumatica Fetch Error] Attempt ${attempts + 1}:`, fetchErr.message);
                    attempts++;
                    if (attempts >= 3) throw fetchErr;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
            
            if (!success) throw new Error(`Failed to fetch page at skip ${skip} after multiple retries.`);
            if (results.length >= 20000) break;
        }
        return results;
    },

    /** ── INVENTORY: Transform StockItem ── 
     * Ensures all fields are flattened into the same structure { value: ... } 
     * to prevent React "Objects are not valid as child" errors.
     */
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

        // BFF Transformation Rule: Everything must be wrapped in { value: ... }
        // This ensures the cellVal() helper in the UI works consistently.
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
        
        const promises = [
            fetch(dataUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' })
        ];

        let statsPromiseIdx = -1;
        let countPromiseIdx = -1;

        // ONLY fetch stats if requested AND not in cache
        if (includeStats && !cachedStats) {
            const statsUrl = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$select=DefaultPrice,WarehouseDetails&$top=1000${filterStr}`;
            statsPromiseIdx = promises.length;
            promises.push(fetch(statsUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' }));
        }

        // ONLY fetch count if requested AND not in cache
        if (includeCount && !cachedCount) {
            const countUrl = `${ACU_BASE}/StockItem?$select=InventoryID&$top=10000${filterStr}`;
            countPromiseIdx = promises.length;
            promises.push(fetch(countUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' }));
        }

        const results = await Promise.all(promises);
        const res = results[0];

        if (res.status === 401) throw new Error("Unauthorized");
        if (!res.ok) throw new Error(`Acumatica Error: ${res.status}`);

        const data = await res.json();
        const rawItems = data.value || (Array.isArray(data) ? data : []);

        let globalStats = cachedStats || { totalValue: 0, lowStock: 0, outOfStock: 0, count: 0 };
        if (includeStats && !cachedStats && statsPromiseIdx !== -1 && results[statsPromiseIdx].ok) {
            const sData = await results[statsPromiseIdx].json();
            const sItems = sData.value || [];
            
            // Re-initialize to zero for fresh calculation
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
        }

        let totalCount = cachedCount || 0;
        if (includeCount && !cachedCount && countPromiseIdx !== -1 && results[countPromiseIdx].ok) {
            const cData = await results[countPromiseIdx].json();
            const cItems = cData.value || (Array.isArray(cData) ? cData : []);
            totalCount = cItems.length;
            if (totalCount > 0) countCache.set(cacheKey, totalCount);
        }
        
        // Ensure stats object always has correct count even if not re-calculated
        if (totalCount > 0) globalStats.count = totalCount;

        const hasMore = totalCount > (skip + rawItems.length) || rawItems.length === pageSize;

        return {
            data: rawItems.map(item => this.transformStockItem(item, branch)),
            totalCount,
            globalStats,
            hasMore
        };
    },

    /** ── BRANCHES: Get Site IDs / Warehouses ── */
    async getBranches(cookie) {
        const now = Date.now();
        if (branchCache.data && (now - branchCache.timestamp < 3600000)) {
            return branchCache.data;
        }

        const url = `${ACU_BASE}/Warehouse?$select=WarehouseID,Description`;
        const res = await fetch(url, {
            headers: { Accept: "application/json", Cookie: cookie },
            cache: 'no-store'
        });

        if (!res.ok) {
            const fallbackUrl = `${ACU_BASE}/StockItem?$select=DefaultWarehouseID&$top=500`;
            const fbRes = await fetch(fallbackUrl, { headers: { Cookie: cookie } });
            if (!fbRes.ok) return [];
            const fbData = await fbRes.json();
            const seen = new Set((fbData.value || []).map(i => i.DefaultWarehouseID?.value || i.DefaultWarehouseID).filter(Boolean));
            return [...seen].sort().map(id => ({ SiteID: id }));
        }

        const data = await res.json();
        const warehouses = data.value || (Array.isArray(data) ? data : []);
        const result = warehouses
            .map(w => ({ SiteID: w.WarehouseID?.value || w.WarehouseID }))
            .filter(w => w.SiteID)
            .sort((a, b) => a.SiteID.toString().localeCompare(b.SiteID.toString()));

        branchCache.data = result;
        branchCache.timestamp = now;
        return result;
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
    }
};
