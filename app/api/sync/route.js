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
                        const raw = data.value || [];
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
                        send({ section: "Inventory", details: `Products: ${pTotal} synced...`, progress: Math.min(44, 10 + Math.floor(pSkip / 20)) });
                        await delay(250);

                        if (raw.length < 100) break; // last page
                        if (options.mode !== "full" && pSkip >= 500) break;
                    }
                    console.log(`>>> [Sync] Products done: ${pTotal} total`);

                    // 1c. Inventory levels (WarehouseDetails per item)
                    send({ section: "Inventory", details: "Syncing warehouse stock levels...", progress: 45 });
                    let lSkip = 0, lTotal = 0;
                    while (!signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(
                            `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=40&$skip=${lSkip}`, cookie
                        );
                        const data = await res.json();
                        const raw = data.value || [];
                        if (raw.length === 0) break;

                        const levels = [];
                        const newBranches = [];

                        for (const item of raw) {
                            const invId = String(getF(item, "InventoryID")).trim();
                            if (!invId) continue;

                            const wds = item.WarehouseDetails
                                ?? item.warehouseDetails
                                ?? item.Warehouses
                                ?? [];

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
                        send({ section: "Inventory", details: `Stock levels: ${lTotal} rows...`, progress: Math.min(98, 45 + Math.floor(lSkip / 10)) });
                        await delay(250);

                        if (raw.length < 40) break; // last page
                        if (options.mode !== "full" && lSkip >= 200) break;
                    }
                    console.log(`>>> [Sync] Inventory levels done: ${lTotal} total rows`);
                    send({ section: "Inventory", status: "done", details: `Inventory complete! ${pTotal} products, ${lTotal} stock level rows.`, progress: 100 });
                }

                // â”€â”€ PHASE 2: SALES HISTORY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                if (options.sales && !signal.aborted) {

                    // Build ItemClass â†’ PostingClass map
                    send({ section: "Sales history", details: "Loading item class map...", progress: 2 });
                    let icMap = new Map();
                    try {
                        const icRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/ItemClass`, cookie);
                        const icData = await icRes.json();
                        icMap = new Map((icData.value || []).map(ic => [
                            String(getF(ic, "ClassID")).toUpperCase().trim(),
                            String(getF(ic, "PostingClass")).trim()
                        ]));
                    } catch (e) {
                        console.warn(">>> [Sync] ItemClass fetch failed:", e.message);
                    }

                    // Build FinancialPeriod map
                    let getPeriodForDate = () => "";
                    try {
                        const pRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/FinancialPeriod`, cookie);
                        const pData = await pRes.json();
                        const rawPeriods = (pData.value || []).map(p => {
                            const d = new Date(getF(p, "StartDate"));
                            let label = getF(p, "FinancialPeriodID") || getF(p, "PeriodID");
                            if (label && label.length >= 6) {
                                const m = label.substring(0, 2);
                                const y = label.substring(label.length - 4);
                                label = parseInt(m) <= 12 ? `${m}-${y}` : `${label.substring(4, 6)}-${label.substring(0, 4)}`;
                            } else {
                                label = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
                            }
                            return { start: d, label };
                        }).filter(p => !isNaN(p.start.getTime())).sort((a, b) => b.start - a.start);
                        getPeriodForDate = (dateStr) => {
                            if (!dateStr) return "";
                            const d = new Date(dateStr);
                            const match = rawPeriods.find(p => p.start <= d);
                            return match ? match.label : "";
                        };
                    } catch (e) {
                        console.warn(">>> [Sync] FinancialPeriod fetch failed:", e.message);
                    }

                    // Load product catalog for enrichment
                    const { data: catalog } = await supabase.from("products").select("inventory_id,item_class,description");
                    const productMap = new Map((catalog || []).map(p => [p.inventory_id.toUpperCase().trim(), p]));

                    // Clear old sales rows
                    send({ section: "Sales history", details: "Clearing previous sales data...", progress: 3 });
                    await sbWrite("sales clear", () => 
                        supabase.from("product_periodic_sales").delete().neq("id", "00000000-0000-0000-0000-000000000000")
                    );

                    let totalExpected = 10000;
                    try {
                        const cRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/SalesInvoice?$count=true&$top=1`, cookie);
                        const cData = await cRes.json();
                        totalExpected = parseInt(cData["@odata.count"]) || totalExpected;
                    } catch { }

                    send({ section: "Sales history", details: `Fetching ~${totalExpected.toLocaleString()} records...`, progress: 5 });

                    let sSkip = 0, sTotal = 0;
                    while (!signal.aborted) {
                        try {
                            const res = await AcumaticaService.fetchWithRetry(
                                `${ACU_BASE}/SalesInvoice?$expand=Details&$top=100&$skip=${sSkip}`, cookie
                            );
                            const data = await res.json();
                            const invoices = data.value || [];
                            if (invoices.length === 0) break;

                            const rows = [];
                            for (const inv of invoices) {
                                const date = getF(inv, "Date");
                                const period = getF(inv, "FinancialPeriod") || getPeriodForDate(date);
                                const invType = getF(inv, "Type") || "Invoice";
                                const hBranch = getAny(inv, "Branch", "BranchID") || "";

                                for (const line of (inv.Details || [])) {
                                    const invId = String(getF(line, "InventoryID")).trim();
                                    if (!invId) continue;
                                    const p = productMap.get(invId.toUpperCase());
                                    const branch = String(getAny(line, "BranchID", "Branch") || hBranch || "").trim();
                                    rows.push({
                                        branch_name: branch,
                                        order_type: invType,
                                        financial_period: period,
                                        document_date: date || null,
                                        description: p?.description || String(getAny(line, "TransactionDescr", "Description") || "").trim(),
                                        qty: Number(getAny(line, "Qty", "Quantity") || 0),
                                        total_amount: Number(getAny(line, "Amount", "ExtCost", "ExtPrice") || 0),
                                        inventory_id: invId,
                                        item_class: p?.item_class || "",
                                        posting_class: icMap.get((p?.item_class || "").toUpperCase()) || "",
                                        last_sync: new Date().toISOString()
                                    });
                                }
                            }

                            if (rows.length > 0) {
                                await sbWrite(`sales insert skip=${sSkip}`, () => 
                                    supabase.from("product_periodic_sales").insert(rows)
                                );
                                sTotal += rows.length;
                            }

                            sSkip += invoices.length;
                            if (invoices.length < 100) break;
                            send({
                                section: "Sales history",
                                details: `Synced ${sTotal.toLocaleString()} records...`,
                                progress: Math.min(99, 5 + Math.floor((sSkip / totalExpected) * 94))
                            });
                            await delay(50);
                        } catch (err) {
                            console.error(`>>> [Sync] Sales error at skip=${sSkip}:`, err.message);
                            if (err.message === "Unauthorized") throw err;
                            break;
                        }
                    }
                    console.log(`>>> [Sync] Sales done: ${sTotal} total rows`);
                    send({ section: "Sales history", status: "done", details: `Sales complete! ${sTotal.toLocaleString()} records synced.`, progress: 100 });
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
