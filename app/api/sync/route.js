import { AcumaticaService } from "@/services/acumatica";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
    const encoder = new TextEncoder();
    const cookie = request.headers.get("cookie") || "";
    const signal = request.signal;
    
    if (!cookie) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const options = {
        inventory: searchParams.get("inventory") === "true",
        sales: searchParams.get("sales") === "true",
        mode: searchParams.get("mode") || "incremental"
    };

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                if (signal.aborted) return;
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            const delay = (ms) => new Promise(r => setTimeout(r, ms));

            const checkError = (err) => {
                const errStr = JSON.stringify(err);
                if (errStr.includes("API Login Limit") || err.message?.includes("API Login Limit")) {
                    return "API Login Limit reached. Please wait 10 minutes for sessions to clear.";
                }
                return null;
            };

            try {
                // --- PHASE 1: INVENTORY ---
                if (options.inventory) {
                    // 1.1 Branches
                    send({ section: "Inventory", status: "syncing", details: "Syncing branches...", progress: 2 });
                    try {
                        const branches = await AcumaticaService.getBranches(cookie);
                        const branchUpserts = (branches || []).map(b => ({
                            branch_id: (b.WarehouseID?.value || b.WarehouseID || b.SiteID || "").toString(),
                            branch_name: (b.Description?.value || b.Description || b.SiteID || "").toString()
                        })).filter(b => b.branch_id);

                        if (branchUpserts.length > 0 && !signal.aborted) {
                            await supabase.from('branches').upsert(branchUpserts);
                        }
                    } catch (e) {
                        const msg = checkError(e);
                        if (msg) throw new Error(msg);
                    }
                    
                    await delay(500); 

                    // 1.2 Products (5% -> 40%)
                    send({ section: "Inventory", status: "syncing", details: "Syncing products...", progress: 5 });
                    let pHasMore = true, pSkip = 0, pTotalSynced = 0;
                    const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

                    while (pHasMore && !signal.aborted) {
                        try {
                            const url = `${ACU_BASE}/StockItem?$top=100&$skip=${pSkip}`;
                            const res = await AcumaticaService.fetchWithRetry(url, cookie);
                            const data = await res.json();
                            const raw = data.value || (Array.isArray(data) ? data : []);
                            
                            const productUpserts = raw.map(item => ({
                                inventory_id: (item.InventoryID?.value || item.InventoryID || "").toString(),
                                description: (item.Description?.value || item.Description || "").toString(),
                                item_class: (item.ItemClass?.value || "").toString(),
                                default_price: Number(item.DefaultPrice?.value ?? 0),
                                item_status: (item.ItemStatus?.value || "Active").toString(),
                                base_unit: (item.BaseUnit?.value || "").toString(),
                                last_sync: new Date().toISOString()
                            })).filter(p => p.inventory_id);

                            if (productUpserts.length > 0) {
                                await supabase.from('products').upsert(productUpserts);
                                pTotalSynced += productUpserts.length;
                                // 5% base + incremental (stretch to 40%)
                                const prog = Math.min(40, 5 + Math.floor(pTotalSynced / 150));
                                send({ section: "Inventory", details: `Syncing products (${pTotalSynced})...`, progress: prog });
                            }
                            
                            pSkip += raw.length;
                            pHasMore = raw.length === 100 && (options.mode === 'full' || pSkip < 500);
                            await delay(300); 
                        } catch (e) {
                            const msg = checkError(e);
                            if (msg) throw new Error(msg);
                            throw e;
                        }
                    }

                    if (signal.aborted) throw new Error("Aborted");
                    await delay(500);

                    // 1.3 Inventory Levels (40% -> 98%)
                    send({ section: "Inventory", status: "syncing", details: "Syncing inventory levels...", progress: 40 });
                    let lHasMore = true, lSkip = 0, lTotalSynced = 0;
                    while (lHasMore && !signal.aborted) {
                        try {
                            const url = `${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=60&$skip=${lSkip}`;
                            const res = await AcumaticaService.fetchWithRetry(url, cookie);
                            const data = await res.json();
                            const raw = data.value || (Array.isArray(data) ? data : []);

                            const levelUpserts = [];
                            for (const item of raw) {
                                const invId = (item.InventoryID?.value || item.InventoryID || "").toString();
                                if (!invId) continue;
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
                                await supabase.from('inventory_levels').upsert(levelUpserts);
                                lTotalSynced += levelUpserts.length;
                                // 40% base + incremental (stretch to 98% based on your large data)
                                const prog = Math.min(98, 40 + Math.floor(lTotalSynced / 450));
                                send({ section: "Inventory", details: `Syncing inventory levels (${lTotalSynced})...`, progress: prog });
                            }

                            lSkip += raw.length;
                            lHasMore = raw.length === 60 && (options.mode === 'full' || lSkip < 300);
                            await delay(300);
                        } catch (e) {
                            const msg = checkError(e);
                            if (msg) throw new Error(msg);
                            throw e;
                        }
                    }
                    send({ section: "Inventory", status: "done", details: "Inventory sync complete!", progress: 100 });
                }

                // --- PHASE 2: SALES HISTORY ---
                if (options.sales && !signal.aborted) {
                    await delay(800);
                    send({ section: "Sales history", status: "syncing", details: "Syncing sales records...", progress: 5 });
                    
                    const today = new Date();
                    const startDate = new Date();
                    startDate.setDate(today.getDate() - 90);
                    const startDateStr = startDate.toISOString().split('T')[0];
                    const endDateStr = today.toISOString().split('T')[0];

                    let sHasMore = true, sSkip = 0, sTotalSynced = 0;
                    while (sHasMore && !signal.aborted) {
                        try {
                            const rawSales = await AcumaticaService.getPeriodicSales({
                                cookie,
                                startDate: startDateStr,
                                endDate: endDateStr,
                                top: 100, 
                                skip: sSkip
                            });

                            const salesUpserts = (rawSales || []).map(item => ({
                                branch_name: (item.BranchName?.value || item.BranchName || "").toString(),
                                order_type: (item.OrderType?.value || "").toString(),
                                financial_period: (item.FinancialPeriod?.value || "").toString(),
                                document_date: item.DocumentDate?.value || null,
                                description: (item.Description?.value || "").toString(),
                                qty: Number(item.Qty?.value || 0),
                                total_amount: Number(item.TotalAmount?.value || 0),
                                inventory_id: (item.InventoryID?.value || "").toString(),
                                item_class: (item.ItemClass?.value || "").toString(),
                                posting_class: (item.PostingClass?.value || "").toString(),
                                last_sync: new Date().toISOString()
                            })).filter(s => s.inventory_id);

                            if (salesUpserts.length > 0) {
                                await supabase.from('product_periodic_sales').upsert(salesUpserts);
                                sTotalSynced += salesUpserts.length;
                            }

                            sSkip += (rawSales || []).length;
                            sHasMore = (rawSales || []).length === 100;
                            
                            const prog = Math.min(99, 5 + Math.floor(sTotalSynced / 100));
                            send({ section: "Sales history", details: `Synced ${sTotalSynced} sales records...`, progress: prog });
                            
                            await delay(300);
                        } catch (e) {
                            const msg = checkError(e);
                            if (msg) throw new Error(msg);
                            throw e;
                        }
                    }
                    send({ section: "Sales history", status: "done", details: "Sales history sync complete!", progress: 100 });
                }

                if (!signal.aborted) {
                    send({ status: "complete", message: "Sync completed successfully" });
                    controller.close();
                }
            } catch (err) {
                if (err.message === "Aborted") {
                    console.log("[Sync] Request was aborted by client.");
                } else {
                    console.error("[Sync Stream Error]", err);
                    send({ status: "error", message: err.message });
                }
                try { controller.close(); } catch(e) {}
            }
        }
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    });
}
