const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

/* ── Flatten one StockItem into warehouse rows ────────── */
function flattenItem(item, selectedBranch = "") {
    const wds = item.WarehouseDetails;
    if (Array.isArray(wds) && wds.length > 0) {
        let rows = wds.map((wh) => {
            const whBranch = wh.Branch?.value || wh.WarehouseID?.value || "";
            return {
                InventoryID: item.InventoryID,
                Description: item.Description,
                SiteID: wh.WarehouseID,
                OnHand: wh.QtyOnHand ?? wh.QtyOnHandUpdated ?? { value: 0 },
                Available: wh.QtyAvailable ?? { value: 0 },
                AvailForShip: wh.QtyAvailableForShipment ?? wh.QtyAvailableforShipment ?? { value: 0 },
                DefaultPrice: item.DefaultPrice,
                ItemClass: item.ItemClass ?? item.ItemClassID,
                Branch: wh.Branch ?? { value: whBranch },
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
        Branch: { value: "" },
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
        
        const skip = (page - 1) * pageSize;

        let filterParts = [];
        if (search) {
            const s = search.replace(/'/g, "''");
            filterParts.push(`(substringof('${s}', InventoryID/value) or substringof('${s}', Description/value))`);
        }
        if (branch) {
            const b = branch.replace(/'/g, "''");
            filterParts.push(`WarehouseDetails/any(w: w/Branch/value eq '${b}')`);
        }
        
        const filterStr = filterParts.length > 0 ? `&$filter=${filterParts.join(" and ")}` : "";

        // Attempting to get total count using all possible OData count parameters
        const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${pageSize}&$skip=${skip}${filterStr}&$inlinecount=allpages&$count=true`;

        console.log("[inventory] fetching:", url);

        const res = await fetch(url, {
            method: "GET",
            headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie },
        });

        if (res.status === 401) return Response.json({ message: "Unauthorized" }, { status: 401 });
        
        if (!res.ok) {
            // Tiered fallback logic preserved
            console.log("[inventory] error, retrying without count...");
            const fallbackUrl = url.replace("&$inlinecount=allpages", "").replace("&$count=true", "");
            const res2 = await fetch(fallbackUrl, {
                method: "GET",
                headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie },
            });
            if (res2.ok) {
                const data = await res2.json();
                const rawItems = data.value || data.d?.results || (Array.isArray(data) ? data : (data.d || []));
                return Response.json({ data: rawItems.flatMap(item => flattenItem(item, branch)), totalCount: 0, hasMore: rawItems.length >= pageSize, page, pageSize });
            }
            return Response.json({ message: "Acumatica Error" }, { status: res.status });
        }

        const data = await res.json();
        const rawItems = data.value || data.d?.results || (Array.isArray(data) ? data : (data.d || []));
        
        // Extract total count from all possible OData metadata fields
        let totalCount = parseInt(
            data["odata.count"] || 
            data["@odata.count"] || 
            data["count"] || 
            data.d?.__count || 
            "0"
        );

        // Logic for "totalCount" on Screen API: sometimes it's returned as a separate property if $inlinecount is used.
        // If it's STILL 0, we can't show "300", we must find why Acumatica isn't giving us the count.
        
        return Response.json({
            data: rawItems.flatMap(item => flattenItem(item, branch)),
            totalCount: totalCount,
            hasMore: rawItems.length >= pageSize,
            page,
            pageSize
        });

    } catch (err) {
        console.error("[inventory error]", err);
        return Response.json({ message: "Internal server error" }, { status: 500 });
    }
}
