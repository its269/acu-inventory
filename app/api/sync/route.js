import { AcumaticaService } from "@/services/acumatica";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
    console.log(">>> [Sync API] Starting Sync Process");
    const encoder = new TextEncoder();
    const signal = request.signal;

    const sessionId = request.cookies.get("acu_session")?.value;
    const cookie = getSession(sessionId);
    console.log(">>> [Sync API] sessionId=" + sessionId + " cookie=" + (cookie ? "found (" + cookie.length + " chars)" : "NOT FOUND"));

    if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const options = {
        inventory: searchParams.get("inventory") === "true",
        sales: searchParams.get("sales") === "true",
        mode: searchParams.get("mode") || "incremental"
    };

    console.log(">>> [Sync API] options:", options);

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                if (signal.aborted) return;
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            const delay = (ms) => new Promise(r => setTimeout(r, ms));

            // Case-insensitive field extractor â€” handles both {value: X} and plain X
            const getF = (obj, keyName) => {
                if (!obj) return "";
                const k = Object.keys(obj).find(i => i.toLowerCase() === keyName.toLowerCase());
                if (!k) return "";
                const val = obj[k];
                return (val?.value !== undefined ? val.value : val) ?? "";
            };

            // Try multiple field name variants (handles Acumatica API inconsistencies)
            const getAny = (obj, ...keys) => {
                for (const k of keys) {
                    const v = getF(obj, k);
                    if (v !== "" && v !== null && v !== undefined) return v;
                }
                return "";
            };

            // Supabase write helper with error logging
            const sbWrite = async (label, fn) => {
                const { error } = await fn();
                if (error) {
                    console.error(`>>> [Sync Supabase Error] ${label}:`, error.message, error.details || "");
                    return false;
                }
                return true;
            };

            try {
                const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

                // â”€â”€ PHASE 1: INVENTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (options.inventory) {
                    // Get total items count for better progress distribution
                    let totalItems = 3000; // Increased default
                    try {
                        const cRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$count=true&$top=1`, cookie);
                        const cData = await cRes.json();
                        // Handle multiple possible count property names
                        totalItems = parseInt(cData["@odata.count"] || cData["count"] || cData["d"]?.["__count"] || 0) || totalItems;
                        console.log(`>>> [Sync] Total StockItems to sync: ${totalItems}`);
                    } catch (e) {
                        console.warn(">>> [Sync] Could not get StockItem count:", e.message);
                    }

                    // 1a. Branches from Warehouse endpoint
                    send({ section: "Inventory", details: "Updating warehouse/branch list...", progress: 5 });
                    const branches = await AcumaticaService.getRealBranches(cookie);
                    if (branches.length > 0) {
                        const bRows = branches.map(b => ({
                            branch_id: String(b.BranchID).trim(),
                            branch_name: String(b.Description || b.BranchID).trim(),
                            active: true,
                            created_at: new Date().toISOString()
                        }));
                        await sbWrite("branches upsert", () =>
                            supabase.from("branches").upsert(bRows, { onConflict: "branch_id" })
                        );
                        console.log(`>>> [Sync] ${bRows.length} branches written`);
                    }

                    // 1b. Products (StockItem catalog)
                    send({ section: "Inventory", details: "Syncing product catalog...", progress: 10 });
                    let pSkip = 0, pTotal = 0;
                    while (!signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(
                            `${ACU_BASE}/StockItem?$top=100&$skip=${pSkip}`, cookie
                        );
                        const data = await res.json();
                        const raw = data.value || (Array.isArray(data) ? data : []);
                        if (raw.length === 0) break;

                        const rows = raw.map(item => {
                            const invId = String(getF(item, "InventoryID")).trim();
                            if (!invId) return null;
                            return {
                                inventory_id: invId,
                                description: String(getF(item, "Description")).trim(),
                                item_class: String(getF(item, "ItemClass")).trim(),
                                default_price: Number(getAny(item, "DefaultPrice", "ListPrice", "BasePrice") || 0),
                                item_status: String(getAny(item, "ItemStatus", "Status") || "Active").trim(),
                                base_unit: String(getAny(item, "BaseUnit", "SalesUnit", "UOM") || "").trim(),
                                last_sync: new Date().toISOString()
                            };
                        }).filter(Boolean);

                        if (rows.length > 0) {
                            await sbWrite(`products upsert skip=${pSkip}`, () =>
                                supabase.from("products").upsert(rows, { onConflict: "inventory_id" })
                            );
                            pTotal += rows.length;
                        }

                        pSkip += raw.length;
                        
                        // Dynamic expansion: if we hit the limit, push the "horizon" further
                        if (pSkip >= totalItems) totalItems = pSkip + 500;

                        // Progress 10% -> 40% (Range: 30%)
                        const pProg = 10 + Math.floor((pSkip / totalItems) * 30);
                        send({ section: "Inventory", details: `Products: ${pTotal} synced...`, progress: Math.min(44, pProg) });
                        await delay(250);

                        if (raw.length < 100) break; // last page
                        if (options.mode !== "full" && pSkip >= 500) break;
                    }
                    console.log(`>>> [Sync] Products done: ${pTotal} total`);

                    // 1c. Inventory levels (WarehouseDetails per item)
                    send({ section: "Inventory", details: "Syncing warehouse stock levels...", progress: 45 });
                    let lSkip = 0, lTotal = 0;
                    // Reset totalItems if it was expanded too much, or use the real pTotal discovered
                    if (pTotal > 0) totalItems = pTotal;

                    while (!signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(
                            `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=40&$skip=${lSkip}`, cookie
                        );
                        const data = await res.json();
                        const raw = data.value || (Array.isArray(data) ? data : []);
                        if (raw.length === 0) break;

                        const levels = [];
                        const newBranches = [];

                        for (const item of raw) {
                            const invId = String(getF(item, "InventoryID")).trim();
                            if (!invId) continue;

                            let wds = item.WarehouseDetails
                                ?? item.warehouseDetails
                                ?? item.Warehouses
                                ?? [];
                            
                            // Handle if expansion is wrapped in { value: [...] }
                            if (wds && !Array.isArray(wds) && wds.value) wds = wds.value;

                            if (!Array.isArray(wds) || wds.length === 0) continue;

                            for (const wh of wds) {
                                const whId = String(getAny(wh, "WarehouseID", "SiteID", "BranchID", "ID")).trim();
                                if (!whId) continue;

                                const onHand = Number(getAny(wh, "QtyOnHand", "OnHand", "Qty", "QtyAvailable") || 0);
                                const available = Number(getAny(wh, "QtyAvailable", "Available", "QtyOnHand", "OnHand") || 0);

                                levels.push({
                                    inventory_id: invId,
                                    branch_id: whId,
                                    site_id: whId,
                                    on_hand: onHand,
                                    available: available,
                                    updated_at: new Date().toISOString()
                                });
                                newBranches.push({ 
                                    branch_id: whId, 
                                    branch_name: whId,
                                    active: true,
                                    created_at: new Date().toISOString()
                                });
                            }
                        }

                        if (levels.length > 0) {
                            const invIds = [...new Set(levels.map(l => l.inventory_id))];
                            // Delete stale rows then insert fresh
                            const { error: delErr } = await supabase
                                .from("inventory_levels")
                                .delete()
                                .in("inventory_id", invIds);
                            if (delErr) console.error(">>> [Sync] inventory_levels delete error:", delErr.message);

                            const { error: insErr } = await supabase
                                .from("inventory_levels")
                                .insert(levels);
                            if (insErr) console.error(">>> [Sync] inventory_levels insert error:", insErr.message);

                            if (!insErr) lTotal += levels.length;

                            // Upsert any newly discovered branches
                            await sbWrite("branches discovered", () =>
                                supabase.from("branches").upsert(newBranches, { onConflict: "branch_id" })
                            );
                        }

                        lSkip += raw.length;
                        if (lSkip >= totalItems) totalItems = lSkip + 200;

                        // Progress 45% -> 98% (Range: 53%)
                        const lProg = 45 + Math.floor((lSkip / totalItems) * 53);
                        send({ section: "Inventory", details: `Stock levels: ${lTotal} rows...`, progress: Math.min(99, lProg) });
                        await delay(250);

                        if (raw.length < 40) break; // last page
                        if (options.mode !== "full" && lSkip >= 200) break;
                    }
                    console.log(`>>> [Sync] Inventory levels done: ${lTotal} total rows`);
                    send({ section: "Inventory", status: "done", details: `Inventory complete! ${pTotal} products, ${lTotal} stock level rows.`, progress: 100 });
                }

                send({ status: "complete", message: "Sync completed successfully" });
                controller.close();

            } catch (err) {
                console.error(">>> [Sync Fatal Error]", err);
                send({ status: "error", message: err.message });
                try { controller.close(); } catch { }
            }
        }
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
