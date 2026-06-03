import { AcumaticaService } from "@/services/acumatica";
import { MySqlService } from "@/services/mysql";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF API Route for Data Synchronization
 * Syncs data from Acumatica ERP to the MySQL database.
 */
export async function POST(request) {
    console.log(">>> [Sync API] Starting MySQL Sync Process");
    const encoder = new TextEncoder();
    const signal = request.signal;

    const sessionId = request.cookies.get("acu_session")?.value;
    const cookie = getSession(sessionId);

    if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const options = {
        inventory: searchParams.get("inventory") === "true",
        sales: searchParams.get("sales") === "true",
        mode: searchParams.get("mode") || "incremental",
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
    };

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                if (signal.aborted) return;
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            // Keep-alive: send a ping every 15s so the stream doesn't time out
            // during long DB writes or slow Acumatica responses.
            const keepAlive = setInterval(() => {
                if (!signal.aborted) {
                    try { controller.enqueue(encoder.encode(JSON.stringify({ ping: true }) + "\n")); } catch { /* stream may be closed */ }
                }
            }, 15000);
            const finish = () => { clearInterval(keepAlive); controller.close(); };

            const getF = (obj, keyName) => {
                if (!obj) return "";
                const k = Object.keys(obj).find(i => i.toLowerCase() === keyName.toLowerCase());
                if (!k) return "";
                const val = obj[k];
                return (val?.value !== undefined ? val.value : val) ?? "";
            };

            const getAny = (obj, ...keys) => {
                for (const k of keys) {
                    const v = getF(obj, k);
                    if (v !== "" && v !== null && v !== undefined) return v;
                }
                return "";
            };

            try {
                const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

                if (options.inventory) {
                    let totalItems = 3000;
                    try {
                        const cRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$count=true&$top=1`, cookie);
                        const cData = await cRes.json();
                        totalItems = parseInt(cData["@odata.count"] || cData["count"] || 0) || totalItems;
                    } catch (e) { }

                    // 1a. Branches
                    send({ section: "Inventory", details: "Updating branches...", progress: 5 });
                    try {
                        const branches = await AcumaticaService.getRealBranches(cookie);
                        if (branches.length > 0) {
                            const bRows = branches.map(b => ({
                                branch_id: String(b.BranchID).trim(),
                                branch_name: String(b.Description || b.BranchID).trim(),
                                active: true
                            }));
                            await MySqlService.upsertBranches(bRows);
                        }
                    } catch (bErr) {
                        console.warn("[Sync] Branches step failed (non-fatal):", bErr?.message);
                        send({ section: "Inventory", details: `Branches skipped: ${bErr?.message || "unavailable"}`, progress: 8 });
                    }

                    // 1b. Products
                    send({ section: "Inventory", details: "Syncing product catalog...", progress: 10 });
                    let pSkip = 0, pTotal = 0;
                    while (!signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$top=100&$skip=${pSkip}`, cookie);
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
                                default_price: parseFloat(String(getAny(item, "DefaultPrice", "ListPrice") || "0")) || 0,
                                item_status: String(getAny(item, "ItemStatus") || "active").trim().toLowerCase(),
                                base_unit: String(getAny(item, "BaseUnit") || "").trim(),
                                item_type: String(getAny(item, "ItemType", "Type") || "").trim(),
                                posting_class: String(getAny(item, "PostingClass") || "").trim(),
                            };
                        }).filter(Boolean);

                        if (rows.length > 0) {
                            await MySqlService.upsertInventoryItems(rows);
                            pTotal += rows.length;
                        }
                        pSkip += raw.length;
                        const pProg = 10 + Math.floor((pSkip / totalItems) * 30);
                        send({ section: "Inventory", details: `Products: ${pTotal} synced...`, progress: Math.min(44, pProg) });
                        if (raw.length < 100) break;
                    }

                    // 1c. Inventory levels
                    send({ section: "Inventory", details: "Syncing stock levels...", progress: 45 });
                    let lSkip = 0, lTotal = 0;
                    while (!signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=40&$skip=${lSkip}`, cookie);
                        const data = await res.json();
                        const raw = data.value || (Array.isArray(data) ? data : []);
                        if (raw.length === 0) break;

                        const levels = [];
                        for (const item of raw) {
                            const invId = String(getF(item, "InventoryID")).trim();
                            if (!invId) continue;
                            let wds = item.WarehouseDetails || [];
                            if (wds.value) wds = wds.value;
                            if (!Array.isArray(wds)) continue;

                            const description = String(getF(item, "Description")).trim();
                            const item_class = String(getF(item, "ItemClass")).trim();
                            const default_price = parseFloat(String(getAny(item, "DefaultPrice", "ListPrice") || "0")) || 0;
                            const item_status = String(getAny(item, "ItemStatus") || "active").trim().toLowerCase();
                            const base_unit = String(getAny(item, "BaseUnit") || "").trim();
                            const item_type = String(getAny(item, "ItemType", "Type") || "").trim();
                            const posting_class = String(getAny(item, "PostingClass") || "").trim();

                            for (const wh of wds) {
                                const whId = String(getAny(wh, "WarehouseID", "SiteID")).trim();
                                if (!whId) continue;
                                levels.push({
                                    inventory_id: invId,
                                    branch_id: whId,
                                    site_id: whId,
                                    on_hand: Number(getAny(wh, "QtyOnHand") || 0),
                                    available: Number(getAny(wh, "QtyAvailable") || 0),
                                    description,
                                    item_class,
                                    default_price,
                                    item_status,
                                    base_unit,
                                    item_type,
                                    posting_class,
                                });
                            }
                        }

                        if (levels.length > 0) {
                            await MySqlService.upsertInventoryLevels(levels);
                            lTotal += levels.length;
                        }
                        lSkip += raw.length;
                        const lProg = 45 + Math.floor((lSkip / totalItems) * 53);
                        send({ section: "Inventory", details: `Levels: ${lTotal} rows...`, progress: Math.min(99, lProg) });
                        if (raw.length < 40) break;
                    }
                    send({ section: "Inventory", status: "done", details: `Complete! ${pTotal} products, ${lTotal} levels.`, progress: 100 });
                }

                if (options.sales) {
                    send({ section: "Sales history", details: "Fetching sales from Acumatica...", progress: 0 });
                    
                    const startDate = options.startDate || "2024-01-01"; 
                    const endDate = options.endDate || new Date().toISOString().split('T')[0];

                    let filterArr = [
                        `Date ge datetimeoffset'${startDate}T00:00:00Z'`,
                        `Date le datetimeoffset'${endDate}T23:59:59Z'`,
                        `Status eq 'Open' or Status eq 'Closed'`
                    ];
                    
                    const filter = `&$filter=${filterArr.join(" and ")}`;
                    let sSkip = 0, sTotal = 0;
                    
                    while (!signal.aborted) {
                        const url = `${ACU_BASE}/SalesInvoice?$expand=Details&$top=50&$skip=${sSkip}${filter}&$orderby=Date desc`;
                        const res = await AcumaticaService.fetchWithRetry(url, cookie);
                        const data = await res.json();
                        const rawInvoices = data.value || (Array.isArray(data) ? data : []);
                        
                        if (rawInvoices.length === 0) break;

                        const salesRows = [];
                        for (const inv of rawInvoices) {
                            const refNbr = getF(inv, "ReferenceNbr");
                            const branchName = getF(inv, "Branch");
                            const orderType = getF(inv, "Type");
                            const financialPeriod = getF(inv, "PostPeriod");
                            const docDate = getF(inv, "Date");
                            
                            const details = inv.Details || [];
                            for (const line of details) {
                                const lineNbr = getF(line, "LineNbr");
                                const invId = getF(line, "InventoryID");
                                if (!invId) continue;

                                salesRows.push({
                                    id: `${refNbr}-${lineNbr}`,
                                    branch_name: branchName,
                                    order_type: orderType,
                                    financial_period: financialPeriod,
                                    document_date: docDate ? docDate.split('T')[0] : null,
                                    description: getF(line, "Description"),
                                    qty: parseFloat(getF(line, "Qty") || 0),
                                    total_amount: parseFloat(getF(line, "Amount") || 0),
                                    item_class: null,
                                    inventory_id: invId,
                                    posting_class: null,
                                    last_sync: new Date(),
                                });
                            }
                        }

                        if (salesRows.length > 0) {
                            await MySqlService.upsertPeriodicSales(salesRows);
                            sTotal += salesRows.length;
                        }
                        
                        sSkip += rawInvoices.length;
                        send({ 
                            section: "Sales history", 
                            details: `Sales: ${sTotal} records synced...`, 
                            progress: Math.min(99, Math.floor((sSkip / (sSkip + 50)) * 100)) 
                        });
                        
                        if (rawInvoices.length < 50) break;
                    }

                    send({ section: "Sales history", status: "done", details: `Complete! ${sTotal} sales records synced.`, progress: 100 });
                }

                send({ status: "complete", message: "Sync completed successfully" });
                finish();
            } catch (err) {
                console.error(">>> [Sync Error]", err);
                send({ status: "error", message: err?.message || String(err) || "An unknown sync error occurred" });
                finish();
            }
        }
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
