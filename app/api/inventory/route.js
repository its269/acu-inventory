const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";

        // Build OData filter
        const filters = [];
        if (search) {
            filters.push(
                `startswith(InventoryID, '${search}') or substringof('${search}', Description)`
            );
        }

        const filterQuery = filters.length
            ? `&$filter=${encodeURIComponent(filters.join(" and "))}`
            : "";

        const cookie = request.headers.get("cookie") || "";

        // Paginate through ALL StockItems
        const PAGE_SIZE = 500;
        let allItems = [];
        let skip = 0;

        while (true) {
            const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${PAGE_SIZE}&$skip=${skip}${filterQuery}`;

            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Cookie: cookie,
                },
            });

            if (res.status === 401) {
                return Response.json({ message: "Session expired. Please log in again." }, { status: 401 });
            }

            if (!res.ok) {
                const text = await res.text().catch(() => "");
                return Response.json({ message: text || "Failed to fetch inventory data." }, { status: res.status });
            }

            const page = await res.json();
            if (!Array.isArray(page) || page.length === 0) break;

            allItems = allItems.concat(page);
            if (page.length < PAGE_SIZE) break;
            skip += PAGE_SIZE;
        }

        // Flatten: one row per (StockItem x WarehouseDetail)
        const rows = [];
        for (const item of allItems) {
            const warehouseDetails = item.WarehouseDetails;
            const hasWarehouses = Array.isArray(warehouseDetails) && warehouseDetails.length > 0;

            if (hasWarehouses) {
                for (const wh of warehouseDetails) {
                    const whBranch = wh.Branch?.value || wh.WarehouseID?.value || "";
                    rows.push({
                        InventoryID: item.InventoryID,
                        Description: item.Description,
                        SiteID: wh.WarehouseID,
                        LocationID: wh.LocationID ?? { value: "" },
                        OnHand: wh.QtyOnHand ?? wh.QtyOnHandUpdated ?? { value: 0 },
                        Available: wh.QtyAvailable ?? { value: 0 },
                        AvailForShip: wh.QtyAvailableForShipment ?? wh.QtyAvailableforShipment ?? { value: 0 },
                        DefaultPrice: item.DefaultPrice,
                        ItemClass: item.ItemClass ?? item.ItemClassID,
                        Branch: wh.Branch ?? { value: whBranch },
                    });
                }
            } else {
                rows.push({
                    InventoryID: item.InventoryID,
                    Description: item.Description,
                    SiteID: item.DefaultWarehouse ?? item.DefaultWarehouseID ?? { value: "" },
                    LocationID: { value: "" },
                    OnHand: { value: 0 },
                    Available: { value: 0 },
                    AvailForShip: { value: 0 },
                    DefaultPrice: item.DefaultPrice,
                    ItemClass: item.ItemClass ?? item.ItemClassID,
                    Branch: { value: "" },
                });
            }
        }

        return Response.json(rows, { status: 200 });
    } catch (err) {
        console.error("[inventory proxy error]", err);
        return Response.json({ message: "Unable to reach Acumatica." }, { status: 502 });
    }
}
