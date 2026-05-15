import { AcumaticaService } from "@/services/acumatica";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "products"; // 'branches', 'products', or 'levels'
        const skip = parseInt(searchParams.get("skip") || "0");
        const limit = parseInt(searchParams.get("limit") || "100");

        const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

        // --- PHASE A: BRANCHES ---
        if (type === "branches") {
            const branches = await AcumaticaService.getBranches(cookie);
            const branchUpserts = branches.map(b => ({
                branch_id: b.WarehouseID?.value || b.WarehouseID || b.SiteID || "",
                branch_name: b.Description?.value || b.Description || b.SiteID || ""
            })).filter(b => b.branch_id);
            if (branchUpserts.length > 0) await supabase.from('branches').upsert(branchUpserts);
            return NextResponse.json({ success: true, count: branchUpserts.length });
        }

        // --- PHASE B: PRODUCTS (Master List) ---
        if (type === "products") {
            const url = `${ACU_BASE}/StockItem?$select=InventoryID,Description,DefaultPrice,ItemClass,ItemStatus,BaseUnit&$top=${limit}&$skip=${skip}`;
            const res = await fetch(url, { headers: { Cookie: cookie, Accept: "application/json" }, cache: 'no-store' });
            
            if (res.status === 429) return NextResponse.json({ message: "Rate Limited" }, { status: 429 });
            if (!res.ok) throw new Error(`Acumatica Error: ${res.status}`);

            const data = await res.json();
            const raw = data.value || [];
            
            const upserts = raw.map(item => ({
                inventory_id: item.InventoryID?.value || item.InventoryID || "",
                description: item.Description?.value || item.Description || "",
                item_class: item.ItemClass?.value || "",
                default_price: Number(item.DefaultPrice?.value ?? 0),
                item_status: item.ItemStatus?.value || "Active",
                base_unit: item.BaseUnit?.value || "",
                last_sync: new Date().toISOString()
            })).filter(p => p.inventory_id);

            if (upserts.length > 0) await supabase.from('products').upsert(upserts);
            return NextResponse.json({ success: true, count: upserts.length, hasMore: raw.length === limit });
        }

        // --- PHASE C: LEVELS (Stock per Branch) ---
        if (type === "levels") {
            // Increased to 50 for faster turbo sync
            const levelLimit = 50; 
            const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$select=InventoryID,WarehouseDetails/WarehouseID,WarehouseDetails/QtyOnHand,WarehouseDetails/QtyAvailable&$top=${levelLimit}&$skip=${skip}`;
            
            const res = await fetch(url, { headers: { Cookie: cookie, Accept: "application/json" }, cache: 'no-store' });
            if (res.status === 429) return NextResponse.json({ message: "Rate Limited" }, { status: 429 });
            if (!res.ok) throw new Error(`Acumatica Error: ${res.status}`);

            const data = await res.json();
            const raw = data.value || [];
            
            const levelUpserts = [];
            for (const item of raw) {
                const invId = item.InventoryID?.value || item.InventoryID || "";
                const wds = item.WarehouseDetails || [];
                for (const wh of wds) {
                    const whId = (wh.WarehouseID?.value || wh.WarehouseID || "").toString();
                    if (!whId) continue;
                    levelUpserts.push({
                        inventory_id: invId,
                        branch_id: whId,
                        site_id: whId,
                        on_hand: Number(wh.QtyOnHand?.value ?? 0),
                        available: Number(wh.QtyAvailable?.value ?? 0),
                        updated_at: new Date().toISOString()
                    });
                }
            }

            if (levelUpserts.length > 0) {
                const chunkSize = 500;
                for (let i = 0; i < levelUpserts.length; i += chunkSize) {
                    await supabase.from('inventory_levels').upsert(levelUpserts.slice(i, i + chunkSize));
                }
            }
            return NextResponse.json({ success: true, count: raw.length, levels: levelUpserts.length, hasMore: raw.length === levelLimit });
        }

        return NextResponse.json({ message: "Invalid type" }, { status: 400 });

    } catch (err) {
        console.error("[Sync Error]", err);
        return NextResponse.json({ message: "Sync failed", error: err.message }, { status: 500 });
    }
}
