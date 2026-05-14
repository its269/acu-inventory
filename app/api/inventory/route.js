import { getCachedInventoryPage, upsertInventoryRows } from "@/lib/inventory-cache";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

export const runtime = "nodejs";

/* ── Flatten one StockItem into warehouse rows ────────── */
function flattenItem(item, selectedBranch = "") {
    const wds = item.WarehouseDetails;
    if (Array.isArray(wds) && wds.length > 0) {
        let rows = wds.map((wh) => {
            const siteId = wh.WarehouseID?.value || wh.WarehouseID?.Value || "";
            return {
                InventoryID: item.InventoryID,
                Description: item.Description,
                SiteID: wh.WarehouseID,
                OnHand: wh.QtyOnHand ?? wh.QtyOnHandUpdated ?? { value: 0 },
                Available: wh.QtyAvailable ?? { value: 0 },
                AvailForShip: wh.QtyAvailableForShipment ?? wh.QtyAvailableforShipment ?? { value: 0 },
                DefaultPrice: item.DefaultPrice,
                ItemClass: item.ItemClass ?? item.ItemClassID,
                Branch: { value: siteId },
            };
        });

        if (selectedBranch) {
            rows = rows.filter(r => (r.Branch?.value || "").toLowerCase() === selectedBranch.toLowerCase());
        }
        return rows;
    }

    const defaultRow = {
        InventoryID: item.InventoryID,
        Description: item.Description,
        SiteID: item.DefaultWarehouse ?? item.DefaultWarehouseID ?? { value: "" },
        OnHand: { value: 0 },
        Available: { value: 0 },
        AvailForShip: { value: 0 },
        DefaultPrice: item.DefaultPrice,
        ItemClass: item.ItemClass ?? item.ItemClassID,
        Branch: item.DefaultWarehouseID ?? item.DefaultWarehouse ?? { value: "" },
    };

    if (selectedBranch && defaultRow.Branch.value.toLowerCase() !== selectedBranch.toLowerCase()) {
        return [];
    }
    return [defaultRow];
}

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const { searchParams } = new URL(request.url);

        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "10");
        const search = searchParams.get("search") || "";
        const branch = searchParams.get("branch") || "";
        const readFromCache = () => getCachedInventoryPage({ page, pageSize, search, branch });

        const skip = (page - 1) * pageSize;

        let filterParts = [];
        if (search) {
            const s = search.replace(/'/g, "''");
            filterParts.push(`(substringof('${s}', InventoryID/Value) or substringof('${s}', Description/Value))`);
        }
        if (branch) {
            const b = branch.replace(/'/g, "''");
            filterParts.push(`DefaultWarehouseID/Value eq '${b}'`);
        }

        const filterStr = filterParts.length > 0 ? `&$filter=${filterParts.join(" and ")}` : "";

        const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${pageSize}&$skip=${skip}${filterStr}`;
        // Lightweight count request: only fetch InventoryID (no expand), up to 10 000 items
        const countUrl = `${ACU_BASE}/StockItem?$select=InventoryID&$top=10000${filterStr}`;

        console.log("[inventory] fetching:", url);

        const [res, countRes] = await Promise.all([
            fetch(url, { headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie } }),
            fetch(countUrl, { headers: { Accept: "application/json", Cookie: cookie } }),
        ]);

        if (res.status === 401) return Response.json({ message: "Unauthorized" }, { status: 401 });

        if (!res.ok) {
            console.log("[inventory] error, retrying without count...");
            const res2 = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie },
            });
            if (res2.ok) {
                const data = await res2.json();
                const rawItems = data.value || data.d?.results || (Array.isArray(data) ? data : (data.d || []));
                const rows = rawItems.flatMap(item => flattenItem(item, branch));
                upsertInventoryRows(rows);
                return Response.json({ data: rows, totalCount: 0, hasMore: rawItems.length >= pageSize, page, pageSize, source: "server" });
            }
            const cached = readFromCache();
            if (cached.totalCount > 0 || cached.data.length > 0) {
                return Response.json(cached);
            }
            return Response.json({ message: "Acumatica Error" }, { status: res.status });
        }

        const data = await res.json();
        const rawItems = data.value || data.d?.results || (Array.isArray(data) ? data : (data.d || []));

        // Derive total count from the lightweight parallel count request
        let totalCount = 0;
        if (countRes.ok) {
            const countData = await countRes.json();
            // Try OData wrapper first, then fall back to counting returned IDs
            const fromMeta = parseInt(
                countData["odata.count"] || countData["@odata.count"] ||
                countData["count"] || countData.d?.__count || "0"
            );
            if (fromMeta > 0) {
                totalCount = fromMeta;
            } else {
                const countItems = countData.value ?? (Array.isArray(countData) ? countData : []);
                totalCount = countItems.length;
            }
        }

        const rows = rawItems.flatMap(item => flattenItem(item, branch));
        upsertInventoryRows(rows);

        return Response.json({
            data: rows,
            totalCount: totalCount,
            hasMore: rawItems.length >= pageSize,
            page,
            pageSize,
            source: "server"
        });

    } catch (err) {
        console.error("[inventory error]", err);
        try {
            const { searchParams } = new URL(request.url);
            const cached = getCachedInventoryPage({
                page: parseInt(searchParams.get("page") || "1"),
                pageSize: parseInt(searchParams.get("pageSize") || "10"),
                search: searchParams.get("search") || "",
                branch: searchParams.get("branch") || "",
            });
            if (cached.totalCount > 0 || cached.data.length > 0) {
                return Response.json(cached);
            }
        } catch (cacheErr) {
            console.error("[inventory cache fallback error]", cacheErr);
        }

        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}
