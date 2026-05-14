import { NextResponse } from "next/server";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

function toISODate(date) {
    return date.toISOString().split("T")[0];
}

/** Fetch all pages of an OData endpoint; returns { status: 401 } on auth error, null on other errors */
async function fetchAllPages(baseUrl, cookie, pageSize = 500) {
    const results = [];
    for (let skip = 0; skip < 20000; skip += pageSize) {
        const sep = baseUrl.includes("?") ? "&" : "?";
        const res = await fetch(`${baseUrl}${sep}$top=${pageSize}&$skip=${skip}`, {
            headers: { Cookie: cookie, Accept: "application/json" },
            cache: "no-store",
        });
        if (res.status === 401) return { status: 401 };
        if (!res.ok) return null;
        const data = await res.json();
        const items = data.value ?? data.d?.results ?? (Array.isArray(data) ? data : []);
        results.push(...items);
        if (items.length < pageSize) break;
    }
    return results;
}

/** Aggregate transaction lines into Map<inventoryId, totalQty> */
function aggregateSales(lines, idField = "InventoryID", qtyField = "Qty") {
    const map = new Map();
    for (const t of lines) {
        const id = t[idField]?.value ?? t[idField] ?? "";
        if (!id) continue;
        const qty = Math.abs(Number(t[qtyField]?.value ?? t[qtyField] ?? 0));
        map.set(id, (map.get(id) ?? 0) + qty);
    }
    return map;
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const branch = searchParams.get("branch") ?? "";
    const cookie = request.headers.get("cookie") ?? "";

    // Resolve date range — accept explicit startDate/endDate, fall back to last 90 days
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 90);

    const endDateStr = searchParams.get("endDate") || toISODate(today);
    const startDateStr = searchParams.get("startDate") || toISODate(defaultStart);

    const endDate = new Date(`${endDateStr}T23:59:59`);
    const startDate = new Date(`${startDateStr}T00:00:00`);
    const days = Math.max(1, Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)));

    // ── Step 1: Fetch inventory with warehouse details ──────────────────
    let invFilter = "$select=InventoryID,Description,ItemClass,PostingClass,DefaultWarehouseID&$expand=WarehouseDetails";
    if (branch) {
        invFilter += `&$filter=DefaultWarehouseID/Value eq '${branch.replace(/'/g, "''")}'`;
    }

    const invResult = await fetchAllPages(`${ACU_BASE}/StockItem?${invFilter}`, cookie, 200);
    if (invResult?.status === 401) {
        return NextResponse.json({ message: "Session expired." }, { status: 401 });
    }
    if (!invResult) {
        return NextResponse.json({ message: "Failed to fetch inventory." }, { status: 502 });
    }

    // ── Step 2: Fetch sales transactions for the date range ────────────
    let salesMap = new Map();

    const salesAttempts = [
        `${ACU_BASE}/InventoryTransaction?$filter=Date ge datetime'${startDateStr}T00:00:00' and Date le datetime'${endDateStr}T23:59:59' and TranType/Value eq 'Issue'&$select=InventoryID,Qty`,
        `${ACU_BASE}/InventoryTransaction?$filter=Date ge datetime'${startDateStr}T00:00:00' and Date le datetime'${endDateStr}T23:59:59'&$select=InventoryID,Qty,TranType`,
        `${ACU_BASE}/ARTran?$filter=TranDate ge datetime'${startDateStr}T00:00:00' and TranDate le datetime'${endDateStr}T23:59:59' and InventoryID/Value ne null&$select=InventoryID,Qty`,
        `${ACU_BASE}/INTran?$filter=TranDate ge datetime'${startDateStr}T00:00:00' and TranDate le datetime'${endDateStr}T23:59:59'&$select=InventoryID,Qty`,
    ];

    for (const url of salesAttempts) {
        try {
            const result = await fetchAllPages(url, cookie, 500);
            if (result === null || result?.status === 401) continue;
            if (Array.isArray(result) && result.length >= 0) {
                salesMap = aggregateSales(result);
                break;
            }
        } catch {
            // try next option
        }
    }

    // ── Step 3: Build analysis rows ─────────────────────────────────────
    const rows = [];
    for (const item of invResult) {
        const invId = item.InventoryID?.value ?? "";
        if (!invId) continue;

        const whs = item.WarehouseDetails ?? [];
        let onHand = 0;
        let coming = 0;

        for (const wh of whs) {
            const whId = wh.WarehouseID?.value ?? "";
            if (branch && whId !== branch) continue;
            onHand += Number(wh.OnHand?.value ?? 0);
            coming += Number(
                wh.QtyOnBackOrder?.value ??
                wh.QtyPurchaseOrders?.value ??
                wh.QtyOnPurchaseOrders?.value ??
                0
            );
        }

        const inv = onHand;
        const invPlusComing = inv + coming;
        const last3mQty = salesMap.get(invId) ?? 0;
        const avgPerDay = last3mQty / days;
        const consumeDays = avgPerDay > 0 ? invPlusComing / avgPerDay : 9999;
        const moh = consumeDays / 30;
        const nto = last3mQty - invPlusComing;
        const remarks = nto > 0 ? "Reorder" : "Overstock";

        rows.push({
            inventoryId: invId,
            description: item.Description?.value ?? "",
            itemClass: item.ItemClass?.value ?? "",
            postingClass: item.PostingClass?.value ?? "",
            inv,
            coming,
            invPlusComing,
            last3mQty: Math.round(last3mQty * 100) / 100,
            avgPerDay: Math.round(avgPerDay * 10000) / 10000,
            consumeDays: consumeDays >= 9999 ? 9999 : Math.round(consumeDays * 100) / 100,
            moh: moh >= 9999 ? 9999 : Math.round(moh * 100) / 100,
            nto: Math.round(nto * 100) / 100,
            remarks,
        });
    }

    return NextResponse.json({ data: rows, days, startDate: startDateStr, endDate: endDateStr });
}
