import { SupabaseService } from "@/services/supabase";
import { AcumaticaService } from "@/services/acumatica";
import { getSession } from "@/lib/session-store";
import { NextResponse } from "next/server";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

function getF(obj, key) {
    if (!obj) return "";
    const k = Object.keys(obj).find(i => i.toLowerCase() === key.toLowerCase());
    if (!k) return "";
    const val = obj[k];
    return (val?.value !== undefined ? val.value : val) ?? "";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
    try {
        const { inventoryId: rawId } = await params;
        const inventoryId = decodeURIComponent(rawId);

        // --- Try Supabase first ---
        const detail = await SupabaseService.getProductStockDetail(inventoryId);

        // Only trust Supabase if it has branch rows with actual quantities
        const hasRealData = detail.branches.length > 0 && detail.branches.some(b => b.onHand > 0 || b.available > 0);
        if (hasRealData) {
            return NextResponse.json({ ...detail, source: "supabase" });
        }

        // --- Fallback: fetch live from Acumatica ---
        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        if (!cookie) {
            // No session — return Supabase partial data (product metadata only, no branches)
            return NextResponse.json({ ...detail, source: "supabase", notice: "No active session for live branch data" });
        }

        const url = `${ACU_BASE}/StockItem?$filter=InventoryID eq '${encodeURIComponent(inventoryId)}'&$expand=WarehouseDetails`;
        const res = await AcumaticaService.fetchWithRetry(url, cookie);
        const data = await res.json();
        const items = data.value || (Array.isArray(data) ? data : []);
        const item = items[0];

        if (!item) {
            return NextResponse.json({ ...detail, source: "acumatica_notfound" });
        }

        const wds = item.WarehouseDetails || [];
        const branches = wds
            .map(wh => ({
                branchId: String(getF(wh, "WarehouseID")).trim(),
                siteId: String(getF(wh, "WarehouseID")).trim(),
                onHand: Number(getF(wh, "QtyOnHand") || 0),
                available: Number(getF(wh, "QtyAvailable") || 0),
                updatedAt: null,
            }))
            .filter(b => b.branchId);

        const totalOnHand = branches.reduce((s, b) => s + b.onHand, 0);
        const totalAvailable = branches.reduce((s, b) => s + b.available, 0);

        return NextResponse.json({
            inventoryId,
            description: String(getF(item, "Description")).trim() || detail.description,
            itemClass: String(getF(item, "ItemClass")).trim() || detail.itemClass,
            unitPrice: Number(getF(item, "DefaultPrice") || detail.unitPrice),
            itemStatus: String(getF(item, "ItemStatus")).trim() || detail.itemStatus,
            baseUnit: String(getF(item, "BaseUnit")).trim() || detail.baseUnit,
            lastSync: null,
            totalOnHand,
            totalAvailable,
            branches,
            source: "acumatica",
        });

    } catch (err) {
        console.error("[Stock Item Detail API Error]", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
