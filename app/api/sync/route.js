import { AcumaticaService } from "@/services/acumatica";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(request.url);
        const type = searchParams.get("type") || "products"; 
        const limit = parseInt(searchParams.get("limit") || "50");
        const mode = searchParams.get("mode") || "full"; 
        const lastId = searchParams.get("lastId") || ""; // Keyset pagination

        const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

        // --- PHASE A: BRANCHES ---
        if (type === "branches") {
            const branches = await AcumaticaService.getBranches(cookie);
            const branchUpserts = branches.map(b => ({
                branch_id: b.WarehouseID?.value || b.WarehouseID || b.SiteID || "",
                branch_name: b.Description?.value || b.Description || b.SiteID || ""
            })).filter(b => b.branch_id);
            
            if (branchUpserts.length > 0) {
                const { error: branchError } = await supabase.from('branches').upsert(branchUpserts);
                if (branchError) throw branchError;
            }
            return NextResponse.json({ success: true, count: branchUpserts.length });
        }

        // --- PHASE B: PRODUCTS ---
        if (type === "products") {
            const finalLimit = limit > 200 ? 200 : limit; 
            let filters = [];

            // Bypass 5000 record limit using ID comparison instead of $skip
            if (lastId) {
                filters.push(`InventoryID gt '${lastId.replace(/'/g, "''")}'`);
            }

            if (mode === "incremental") {
                const { data: lastItem } = await supabase.from('products').select('last_sync').order('last_sync', { ascending: false }).limit(1).single();
                if (lastItem?.last_sync) {
                    const date = new Date(new Date(lastItem.last_sync).getTime() - 2 * 60 * 1000);
                    filters.push(`LastModifiedDateTime gt datetime'${date.toISOString()}'`);
                }
            }

            const filterStr = filters.length > 0 ? `&$filter=${filters.join(" and ")}` : "";
            // Important: $orderby is required for Keyset pagination
            const url = `${ACU_BASE}/StockItem?$top=${finalLimit}&$orderby=InventoryID${filterStr}`;
            
            const res = await AcumaticaService.fetchWithRetry(url, cookie);
            const data = await res.json();
            const raw = data.value || (Array.isArray(data) ? data : []);
            
            const upserts = raw.map(item => ({
                inventory_id: item.InventoryID?.value || item.InventoryID || "",
                description: item.Description?.value || item.Description || "",
                item_class: item.ItemClass?.value || "",
                default_price: Number(item.DefaultPrice?.value ?? 0),
                item_status: item.ItemStatus?.value || "Active",
                base_unit: item.BaseUnit?.value || "",
                last_sync: new Date().toISOString()
            })).filter(p => p.inventory_id);

            if (upserts.length > 0) {
                const { error: upsertError } = await supabase.from('products').upsert(upserts);
                if (upsertError) throw upsertError;
            }

            return NextResponse.json({ 
                success: true, 
                count: upserts.length, 
                lastId: upserts[upserts.length - 1]?.inventory_id || lastId,
                hasMore: raw.length === finalLimit
            });
        }

        // --- PHASE C: LEVELS ---
        if (type === "levels") {
            const finalLimit = limit > 200 ? 200 : limit; 
            let filters = [];

            if (lastId) {
                filters.push(`InventoryID gt '${lastId.replace(/'/g, "''")}'`);
            }

            if (mode === "incremental") {
                const { data: lastLevel } = await supabase.from('inventory_levels').select('updated_at').order('updated_at', { ascending: false }).limit(1).single();
                if (lastLevel?.updated_at) {
                    const date = new Date(new Date(lastLevel.updated_at).getTime() - 2 * 60 * 1000);
                    filters.push(`LastModifiedDateTime gt datetime'${date.toISOString()}'`);
                }
            }

            const filterStr = filters.length > 0 ? `&$filter=${filters.join(" and ")}` : "";
            const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${finalLimit}&$orderby=InventoryID${filterStr}`;
            
            const res = await AcumaticaService.fetchWithRetry(url, cookie);
            const data = await res.json();
            const raw = data.value || (Array.isArray(data) ? data : []);
            
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
            return NextResponse.json({ 
                success: true, 
                count: raw.length, 
                levels: levelUpserts.length, 
                lastId: raw[raw.length - 1]?.InventoryID?.value || lastId,
                hasMore: raw.length === finalLimit 
            });
        }

        return NextResponse.json({ message: "Invalid type" }, { status: 400 });

    } catch (err) {
        console.error("[Sync Error]", err);
        if (err.message.includes("Unauthorized")) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ message: "Sync failed", error: err.message }, { status: 500 });
    }
}
