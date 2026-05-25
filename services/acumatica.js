const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

const toISODate = (date) => date.toISOString().split("T")[0];

// --- SALES SYNC STATE MANAGEMENT ---
let activeSalesSyncId = 0;
let salesAbortController = null;

export const AcumaticaService = {
    async fetchWithRetry(url, cookie, options = {}) {
        let lastError = null;
        for (let attempts = 1; attempts <= 3; attempts++) {
            try {
                const res = await fetch(url, {
                    ...options,
                    headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0", "Cookie": cookie || "", ...options.headers },
                    cache: 'no-store',
                });
                if (res.status === 401) throw new Error("Unauthorized");
                if (res.ok) return res;
                await new Promise(r => setTimeout(r, 1000 * attempts));
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                lastError = err;
            }
        }
        throw lastError;
    },

    async getBranches(cookie) {
        const url = `${ACU_BASE}/Warehouse?$select=WarehouseID,Description`;
        const res = await this.fetchWithRetry(url, cookie);
        const data = await res.json();
        return (data.value || []).map(w => ({ SiteID: w.WarehouseID?.value || w.WarehouseID })).sort((a, b) => a.SiteID.localeCompare(b.SiteID));
    },

    /** ── SALES: Discover Periods and Fetch Data ── */
    async fetchSalesBySpecificMonths({ cookie, targetMonths }) {
        if (salesAbortController) salesAbortController.abort();
        salesAbortController = new AbortController();
        const signal = salesAbortController.signal;
        const syncId = ++activeSalesSyncId;

        const results = [];
        const pageSize = 1000;

        try {
            // 1. DISCOVER ACTUAL PERIOD IDs FROM ACUMATICA
            console.log(`>>> [Acumatica] [Req #${syncId}] Discovering actual Period IDs for:`, targetMonths);
            const pRes = await this.fetchWithRetry(`${ACU_BASE}/FinancialPeriod?$top=500`, cookie);
            const pData = await pRes.json();
            const allPeriods = Array.isArray(pData) ? pData : (pData.value || []);

            const getPeriodId = (p) => p.FinancialPeriodID?.value || p.FinancialPeriodID || p.PeriodID?.value || p.PeriodID;

            // Match our target months to actual ERP Period IDs
            const discoveredIds = [];
            for (const target of targetMonths) {
                const match = allPeriods.find(p => {
                    const pStart = new Date(p.StartDate?.value || p.StartDate);
                    return pStart.getMonth() === target.month - 1 && pStart.getFullYear() === target.year;
                });
                if (match) discoveredIds.push(getPeriodId(match));
            }

            console.log(`>>> [Acumatica] [Req #${syncId}] Discovered ERP Period IDs:`, discoveredIds);

            if (discoveredIds.length === 0) {
                console.log(`>>> [Acumatica] [Req #${syncId}] No matching periods found in ERP. Falling back to latest data.`);
                const url = `${ACU_BASE}/Invoice?$expand=Details&$top=100&$orderby=Date desc`;
                const res = await this.fetchWithRetry(url, cookie);
                const data = await res.json();
                return data.value || [];
            }

            // 2. FETCH DATA USING DISCOVERED IDs
            for (const id of discoveredIds) {
                if (signal.aborted) break;
                let skip = 0;
                while (true) {
                    if (signal.aborted) break;
                    console.log(`>>> [Acumatica] [Req #${syncId}] Fetching Period ${id} (Skip ${skip})...`);
                    const url = `${ACU_BASE}/Invoice?$expand=Details&$top=${pageSize}&$skip=${skip}&$filter=PostPeriod eq '${id}'`;
                    
                    const res = await this.fetchWithRetry(url, cookie, { signal });
                    const data = await res.json();
                    const items = data.value || [];
                    
                    results.push(...items);
                    if (items.length < pageSize) break;
                    skip += pageSize;
                }
            }

            console.log(`>>> [Acumatica] [Req #${syncId}] FETCH COMPLETE. Total: ${results.length} records.`);
            return results;

        } catch (err) {
            return [];
        } finally {
            if (activeSalesSyncId === syncId) salesAbortController = null;
        }
    }
};

const getF = (obj, keyName) => {
    if (!obj) return "";
    const k = Object.keys(obj).find(i => i.toLowerCase() === keyName.toLowerCase());
    if (!k) return "";
    const val = obj[k];
    if (val === null || val === undefined) return "";
    if (typeof val === "object") return val.value ?? "";
    return val;
};
