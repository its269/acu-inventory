const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

const toISODate = (date) => date.toISOString().split("T")[0];

// In-memory caches to improve performance and avoid redundant ERP hits
const countCache = new Map();
const branchCache = {
    data: null,
    timestamp: 0
};

/**
 * Service for interacting with Acumatica ERP.
 * This acts as the core of our BFF (Backend-for-Frontend) layer.
 */
export const AcumaticaService = {
    /** ── HELPER: Generic multi-page fetcher ── */
    async fetchAllPages(url, cookie, pageSize = 500) {
        const results = [];
        for (let skip = 0; skip < 20000; skip += pageSize) {
            const sep = url.includes("?") ? "&" : "?";
            const res = await fetch(`${url}${sep}$top=${pageSize}&$skip=${skip}`, {
                headers: { Cookie: cookie, Accept: "application/json" },
                cache: "no-store",
            });
            if (res.status === 401) throw new Error("Unauthorized");
            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
            
            const data = await res.json();
            const items = data.value ?? data.d?.results ?? (Array.isArray(data) ? data : []);
            results.push(...items);
            if (items.length < pageSize) break;
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
    async getStockItems({ page, pageSize, search, branch, cookie }) {
        const skip = (page - 1) * pageSize;
        const cacheKey = `count-${search}-${branch}`;
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
        
        const dataUrl = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$select=${selectFields}&$top=${pageSize}&$skip=${skip}${filterStr}`;
        
        // Stats: Fetch top 1000 items to calculate dashboard card values (Price x Stock)
        const statsUrl = `${ACU_BASE}/StockItem?$expand=WarehouseDetails($select=QtyOnHand)&$select=InventoryID,DefaultPrice,WarehouseDetails/QtyOnHand&$top=1000${filterStr}`;
        
        // Count: Fetch up to 10000 IDs for accurate pagination count
        const countUrl = `${ACU_BASE}/StockItem?$select=InventoryID&$top=10000${filterStr}`;

        const promises = [
            fetch(dataUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' }),
            fetch(statsUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' }),
            fetch(countUrl, { headers: { Accept: "application/json", Cookie: cookie }, cache: 'no-store' })
        ];

        const results = await Promise.all(promises);
        const res = results[0];
        const statsRes = results[1];
        const countRes = results[2];

        if (res.status === 401) throw new Error("Unauthorized");
        if (!res.ok) throw new Error(`Acumatica Error: ${res.status}`);

        const data = await res.json();
        const rawItems = data.value || (Array.isArray(data) ? data : []);

        let globalStats = { totalValue: 0, lowStock: 0, outOfStock: 0, count: 0 };
        if (statsRes && statsRes.ok) {
            const sData = await statsRes.json();
            const sItems = sData.value || [];
            
            for (const item of sItems) {
                const price = Number(item.DefaultPrice?.value ?? item.DefaultPrice ?? 0);
                let onHand = 0;
                (item.WarehouseDetails || []).forEach(wh => {
                    onHand += Number(wh.QtyOnHand?.value ?? wh.QtyOnHand ?? 0);
                });
                globalStats.totalValue += price * onHand;
                if (onHand <= 0) globalStats.outOfStock++;
                else if (onHand <= 10) globalStats.lowStock++;
            }
        }

        let totalCount = cachedCount || 0;
        if (!totalCount && countRes && countRes.ok) {
            const cData = await countRes.json();
            const cItems = cData.value || (Array.isArray(cData) ? cData : []);
            totalCount = cItems.length;
            if (totalCount > 0) countCache.set(cacheKey, totalCount);
        }
        globalStats.count = totalCount;

        // More robust hasMore: if we have a full page, there's likely more data
        // even if our totalCount (limited to 10000) says otherwise.
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
