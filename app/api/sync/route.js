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
    const mode = searchParams.get("mode") || "incremental";
    const options = {
        inventory: searchParams.get("inventory") === "true",
        sales: searchParams.get("sales") === "true",
        mode: mode,
        startDate: searchParams.get("startDate"),
        endDate: searchParams.get("endDate"),
    };

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                if (signal.aborted) return;
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            const keepAlive = setInterval(() => {
                if (!signal.aborted) {
                    try { controller.enqueue(encoder.encode(JSON.stringify({ ping: true }) + "\n")); } catch { }
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
                const isDelta = options.mode === "delta" || options.mode === "incremental";
                const todayStr = new Date().toISOString().split('T')[0];

                // Get last sync timestamps for incremental mode
                let lastInvSync = null;
                let lastSalesSync = null;
                if (isDelta) {
                    lastInvSync = await MySqlService.getLastInventorySyncTime();
                    lastSalesSync = await MySqlService.getLastSalesSyncTime();
                    
                    // Add 5-minute safety overlap buffer if timestamp exists
                    // Also format to ISO without milliseconds for better OData compatibility
                    const formatOData = (date) => date.toISOString().replace(/\.\d{3}/, "");

                    if (lastInvSync) {
                        const d = new Date(new Date(lastInvSync).getTime() - (5 * 60 * 1000));
                        lastInvSync = formatOData(d);
                    }
                    if (lastSalesSync) {
                        const d = new Date(new Date(lastSalesSync).getTime() - (5 * 60 * 1000));
                        lastSalesSync = formatOData(d);
                    }
                }

                // 1. BRANCHES (Always fast, sync every time)
                send({ section: "Inventory", details: "Updating branches...", progress: 5 });
                try {
                    const branches = await AcumaticaService.getRealBranches(cookie);
                    if (branches.length > 0) {
                        await MySqlService.upsertBranches(branches.map(b => ({
                            branch_id: String(b.BranchID).trim(),
                            branch_name: String(b.Description || b.BranchID).trim(), active: true
                        })));
                    }
                } catch (e) { }

                // 2. INVENTORY
                if (options.inventory) {
                    const filterArr = [];
                    if (isDelta && lastInvSync) {
                        filterArr.push(`LastModified gt datetimeoffset'${lastInvSync}'`);
                        send({ section: "Inventory", details: `Incremental Sync: Fetching changes since ${lastInvSync}...`, progress: 10 });
                    } else {
                        send({ section: "Inventory", details: "Full Daily Refresh: Scanning 3,000+ items...", progress: 10 });
                    }

                    const filterStr = filterArr.length > 0 ? `&$filter=${filterArr.join(" and ")}` : "";
                    let skip = 0, totalSynced = 0, top = 100;
                    
                    while (!signal.aborted) {
                        const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=${top}&$skip=${skip}${filterStr}`;
                        const res = await AcumaticaService.fetchWithRetry(url, cookie);
                        const data = await res.json();
                        const items = data.value || (Array.isArray(data) ? data : []);
                        if (items.length === 0) break;

                        const levels = [];
                        const catalogs = [];
                        for (const item of items) {
                            const invId = String(getF(item, "InventoryID")).trim();
                            if (!invId) continue;
                            const desc = String(getF(item, "Description")).trim();
                            const itemClass = String(getF(item, "ItemClass")).trim();
                            catalogs.push({
                                inventory_id: invId, description: desc, item_class: itemClass,
                                default_price: parseFloat(getF(item, "DefaultPrice") || 0),
                                item_status: String(getF(item, "ItemStatus") || "Active"),
                                base_unit: String(getF(item, "BaseUnit") || ""),
                            });
                            let wds = item.WarehouseDetails || [];
                            if (wds.value) wds = wds.value;
                            if (Array.isArray(wds)) {
                                for (const wh of wds) {
                                    const whId = String(getAny(wh, "WarehouseID", "SiteID")).trim();
                                    if (whId) levels.push({
                                        inventory_id: invId, branch_id: whId, site_id: whId,
                                        on_hand: Number(getAny(wh, "QtyOnHand") || 0),
                                        available: Number(getAny(wh, "QtyAvailable") || 0),
                                        description: desc, item_class: itemClass
                                    });
                                }
                            }
                        }
                        await MySqlService.upsertInventoryItems(catalogs);
                        await MySqlService.upsertInventoryLevels(levels);
                        totalSynced += items.length; skip += items.length;
                        send({ section: "Inventory", details: `Processed ${totalSynced} items...`, progress: Math.min(99, 45) });
                        if (items.length < top) break;
                    }
                }

                // 3. SALES
                const affectedInventoryIds = new Set();
                if (options.sales) {
                    const filterArr = [];
                    if (isDelta && lastSalesSync) {
                        filterArr.push(`LastModifiedDateTime gt datetimeoffset'${lastSalesSync}'`);
                        send({ section: "Sales history", details: `Incremental Sync: Fetching changes since ${lastSalesSync}...`, progress: 50 });
                    } else {
                        let sStart = options.startDate || "2024-01-01";
                        filterArr.push(`Date ge datetimeoffset'${sStart}T00:00:00Z' and Date le datetimeoffset'${(options.endDate || todayStr)}T23:59:59Z'`);
                        send({ section: "Sales history", details: `Full Sync: Range ${sStart} to ${options.endDate || todayStr}`, progress: 50 });
                    }

                    const filterStr = `$filter=${filterArr.join(" and ")}`;
                    let sSkip = 0, sTotal = 0;
                    while (!signal.aborted) {
                        const url = `${ACU_BASE}/Invoice?$expand=Details&$top=100&$skip=${sSkip}&${filterStr}`;
                        const res = await AcumaticaService.fetchWithRetry(url, cookie);
                        const data = await res.json();
                        const invoices = data.value || [];
                        if (invoices.length === 0) break;

                        const salesRows = [];
                        for (const inv of invoices) {
                            const refNbr = getF(inv, "ReferenceNbr");
                            const branchName = getF(inv, "Branch");
                            const docDate = getF(inv, "Date");
                            for (const line of (inv.Details || [])) {
                                const invId = getF(line, "InventoryID");
                                if (!invId) continue;
                                if (options.mode === "delta") affectedInventoryIds.add(invId);
                                salesRows.push({
                                    id: `${refNbr}-${getF(line, "LineNbr")}`,
                                    branch_name: branchName,
                                    order_type: getF(inv, "Type"),
                                    financial_period: getF(inv, "PostPeriod"),
                                    document_date: docDate ? docDate.split('T')[0] : null,
                                    description: getF(line, "Description"),
                                    qty: parseFloat(getF(line, "Qty") || 0),
                                    total_amount: parseFloat(getF(line, "Amount") || 0),
                                    inventory_id: invId,
                                    last_sync: new Date(),
                                });
                            }
                        }
                        if (salesRows.length > 0) await MySqlService.upsertPeriodicSales(salesRows);
                        sTotal += invoices.length; sSkip += invoices.length;
                        send({ section: "Sales history", details: `Synced ${sTotal} records...`, progress: 90 });
                        if (invoices.length < 100) break;
                    }
                    send({ section: "Sales history", status: "done", details: "Sales sync complete.", progress: 100 });
                }

                // 4. SMART DELTA REFRESH (Only for items sold today)
                if (options.mode === "delta" && affectedInventoryIds.size > 0) {
                    send({ section: "Inventory", details: `Updating stocks for ${affectedInventoryIds.size} sold items...`, progress: 95 });
                    const idList = Array.from(affectedInventoryIds);
                    const idChunks = [];
                    for (let i = 0; i < idList.length; i += 10) idChunks.push(idList.slice(i, i + 10));

                    for (const batch of idChunks) {
                        const filter = batch.map(id => `InventoryID eq '${id}'`).join(" or ");
                        const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$filter=${filter}`;
                        const res = await AcumaticaService.fetchWithRetry(url, cookie);
                        const data = await res.json();
                        const items = data.value || [];
                        const levels = [];
                        for (const item of items) {
                            const invId = String(getF(item, "InventoryID")).trim();
                            let wds = item.WarehouseDetails || [];
                            if (wds.value) wds = wds.value;
                            if (Array.isArray(wds)) {
                                for (const wh of wds) {
                                    const whId = String(getAny(wh, "WarehouseID", "SiteID")).trim();
                                    if (whId) levels.push({
                                        inventory_id: invId, branch_id: whId, site_id: whId,
                                        on_hand: Number(getAny(wh, "QtyOnHand") || 0),
                                        available: Number(getAny(wh, "QtyAvailable") || 0),
                                        description: String(getF(item, "Description")),
                                        item_class: String(getF(item, "ItemClass"))
                                    });
                                }
                            }
                        }
                        if (levels.length > 0) await MySqlService.upsertInventoryLevels(levels);
                    }
                }
                if (isDelta) send({ section: "Inventory", status: "done", details: "Stock refresh complete.", progress: 100 });

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
