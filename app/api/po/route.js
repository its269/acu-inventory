import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

const getF = (obj, key) => {
    if (!obj) return "";
    const k = Object.keys(obj).find(i => i.toLowerCase() === key.toLowerCase());
    if (!k) return "";
    const val = obj[k];
    const raw = (val?.value !== undefined ? val.value : val) ?? "";
    // Guard: never return a plain object — React can't render them
    if (raw !== null && typeof raw === "object") return "";
    return raw;
};

export async function GET(request) {
    const sessionId = request.cookies.get("acu_session")?.value;
    const cookie = getSession(sessionId);
    if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));
    const search = (searchParams.get("search") || "").trim();
    const skip = (page - 1) * pageSize;

    let filter = "";
    if (search) {
        const s = search.replace(/'/g, "''");
        filter = `$filter=contains(VendorID,'${s}') or contains(Description,'${s}') or contains(OrderNbr,'${s}')&`;
    }

    const url = `${ACU_BASE}/PurchaseOrder?${filter}$expand=Details&$top=${pageSize}&$skip=${skip}`;
    console.log(`[PO API] ${url}`);

    try {
        const res = await fetch(url, {
            headers: { Accept: "application/json", Cookie: cookie },
            cache: "no-store",
        });

        if (res.status === 401) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        if (!res.ok) return NextResponse.json({ message: `Acumatica error: ${res.status}` }, { status: res.status });

        const data = await res.json();
        const raw = data.value || (Array.isArray(data) ? data : []);

        const orders = raw.map(po => ({
            orderType: getF(po, "OrderType"),
            orderNbr: getF(po, "OrderNbr"),
            vendorId: getF(po, "VendorID"),
            vendorName: getF(po, "VendorName") || getF(po, "VendorRef"),
            status: getF(po, "Status"),
            date: getF(po, "Date") || getF(po, "OrderDate"),
            promisedOn: getF(po, "PromisedOn") || getF(po, "PromisedDate"),
            description: getF(po, "Description"),
            totalQty: Number(getF(po, "ControlQty") || getF(po, "OrderQty") || 0),
            totalAmount: Number(getF(po, "ControlTotal") || getF(po, "OrderTotal") || getF(po, "Amount") || 0),
            lineCount: (po.Details || []).length,
            lines: (po.Details || []).map(d => ({
                inventoryId: getF(d, "InventoryID"),
                description: getF(d, "Description") || getF(d, "TransactionDescr"),
                qty: Number(getF(d, "OrderQty") || getF(d, "Qty") || 0),
                unitCost: Number(getF(d, "UnitCost") || 0),
                extCost: Number(getF(d, "ExtCost") || getF(d, "Amount") || 0),
                uom: getF(d, "UOM"),
                warehouseId: getF(d, "WarehouseID") || getF(d, "SiteID"),
            })),
        }));

        return NextResponse.json({ orders, page, pageSize, hasMore: raw.length === pageSize });
    } catch (err) {
        console.error("[PO API Error]", err);
        return NextResponse.json({ message: err.message }, { status: 500 });
    }
}
