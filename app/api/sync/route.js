import { AcumaticaService } from "@/services/acumatica";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
    console.log(">>> [Sync API] Starting Final Relational Sync Process");
    const encoder = new TextEncoder();
    const signal = request.signal;

    // Read the UUID from the browser cookie, look up the real Acumatica cookies
    // from the server-side store (avoids Path=/ERP/ browser restriction)
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

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data) => {
                if (signal.aborted) return;
                controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            };

            const delay = (ms) => new Promise(r => setTimeout(r, ms));

            const getF = (obj, keyName) => {
                if (!obj) return "";
                const k = Object.keys(obj).find(i => i.toLowerCase() === keyName.toLowerCase());
                if (!k) return "";
                const val = obj[k];
                return (val?.value !== undefined ? val.value : val) || "";
            };

            try {
                const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

                // --- PHASE 0.1: FINANCIAL PERIOD MASTER ---
                send({ section: "Sales history", details: "Loading financial calendar...", progress: 2 });
                const periodRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/FinancialPeriod`, cookie);
                const periodData = await periodRes.json();
                const rawPeriods = periodData.value || (Array.isArray(periodData) ? periodData : []);
                const periodMap = rawPeriods.map(p => {
                    const d = new Date(getF(p, "StartDate"));
                    let label = getF(p, "FinancialPeriodID") || getF(p, "PeriodID");
                    if (label && label.length >= 6) {
                        const m = label.substring(0, 2);
                        const y = label.substring(label.length - 4);
                        label = (parseInt(m) <= 12) ? `${m}-${y}` : `${label.substring(4, 6)}-${label.substring(0, 4)}`;
                    } else if (!label || label.length < 3) {
                        label = `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
                    }
                    return { start: d, label };
                }).filter(p => !isNaN(p.start.getTime())).sort((a, b) => b.start - a.start);

                const getPeriodForDate = (dateStr) => {
                    if (!dateStr) return "";
                    const d = new Date(dateStr);
                    const match = periodMap.find(p => p.start <= d);
                    return match ? match.label : "";
                };

                // --- PHASE 0.2: ITEM CLASS MASTER (Source for PostingClass) ---
                send({ section: "Inventory", details: "Mapping item categories...", progress: 4 });
                const icRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/ItemClass`, cookie);
                const icData = await icRes.json();
                const icMap = new Map((icData.value || (Array.isArray(icData) ? icData : [])).map(ic => [
                    getF(ic, "ClassID").toUpperCase().trim(),
                    getF(ic, "PostingClass").toString().trim()
                ]));
                console.log(`>>> [Sync] Master Map Ready: ${icMap.size} Item Classes linked to PostingClasses.`);

                // --- PHASE 1: INVENTORY (Total Branches + Products + Levels) ---
                if (options.inventory) {
                    send({ section: "Inventory", details: "Updating branch list...", progress: 6 });
                    const branches = await AcumaticaService.getRealBranches(cookie);
                    if (branches.length > 0) {
                        const bUpserts = branches.map(b => ({
                            branch_id: b.BranchID.toString().trim(),
                            branch_name: b.Description.toString().trim() || b.BranchID
                        }));
                        await supabase.from('branches').upsert(bUpserts);
                    }

                    send({ section: "Inventory", details: "Updating product catalog...", progress: 10 });
                    let pSkip = 0, pTotal = 0, pHasMore = true;
                    while (pHasMore && !signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$top=100&$skip=${pSkip}`, cookie);
                        const data = await res.json();
                        const raw = data.value || [];
                        const upserts = raw.map(item => {
                            const invId = getF(item, "InventoryID").toString().trim();
                            const itemClass = getF(item, "ItemClass").toString().trim();
                            if (!invId) return null;
                            return {
                                inventory_id: invId,
                                description: getF(item, "Description").toString().trim(),
                                item_class: itemClass,
                                posting_class: icMap.get(itemClass.toUpperCase()) || "",
                                default_price: Number(getF(item, "DefaultPrice") || 0),
                                item_status: getF(item, "ItemStatus") || "Active",
                                base_unit: getF(item, "BaseUnit") || "",
                                last_sync: new Date().toISOString()
                            };
                        }).filter(Boolean);
                        if (upserts.length > 0) await supabase.from('products').upsert(upserts);
                        pTotal += upserts.length;
                        pSkip += raw.length;
                        pHasMore = raw.length === 100 && (options.mode === 'full' || pSkip < 500);
                        send({ section: "Inventory", details: `Catalog: ${pTotal} products...`, progress: Math.min(45, 10 + Math.floor(pSkip / 15)) });
                        await delay(300);
                    }

                    send({ section: "Inventory", details: "Syncing stock levels for ALL branches...", progress: 45 });
                    let lSkip = 0, lTotal = 0, lHasMore = true;
                    while (lHasMore && !signal.aborted) {
                        const res = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/StockItem?$expand=WarehouseDetails&$top=40&$skip=${lSkip}`, cookie);
                        const data = await res.json();
                        const raw = data.value || [];
                        const levels = [];
                        const discoveredBranches = [];
                        for (const item of raw) {
                            const invId = getF(item, "InventoryID").toString().trim();
                            const wds = item.WarehouseDetails || [];
                            for (const wh of wds) {
                                const whId = getF(wh, "WarehouseID").toString().trim();
                                if (!whId) continue;
                                levels.push({
                                    inventory_id: invId, branch_id: whId, site_id: whId,
                                    on_hand: Number(getF(wh, "QtyOnHand") || 0),
                                    available: Number(getF(wh, "QtyAvailable") || 0),
                                    updated_at: new Date().toISOString()
                                });
                                discoveredBranches.push({ branch_id: whId, branch_name: whId });
                            }
                        }
                        if (levels.length > 0) {
                            await supabase.from('inventory_levels').upsert(levels);
                            await supabase.from('branches').upsert(discoveredBranches, { onConflict: 'branch_id', ignoreDuplicates: true });
                            lTotal += levels.length;
                        }
                        lSkip += raw.length;
                        lHasMore = raw.length === 40 && (options.mode === 'full' || lSkip < 200);
                        send({ section: "Inventory", details: `Stock levels: ${lTotal}...`, progress: Math.min(98, 45 + Math.floor(lSkip / 10)) });
                        await delay(300);
                    }
                    send({ section: "Inventory", status: "done", details: "Inventory complete!", progress: 100 });
                }

                // --- PHASE 2: SALES HISTORY ---
                if (options.sales && !signal.aborted) {
                    send({ section: "Sales history", status: "syncing", details: "Mapping relational data...", progress: 2 });
                    const [{ data: catalog }] = await Promise.all([
                        supabase.from('products').select('*')
                    ]);
                    const productMap = new Map((catalog || []).map(p => [p.inventory_id.toUpperCase().trim(), p]));

                    send({ section: "Sales history", details: "Counting total records for accuracy...", progress: 4 });
                    let totalExpected = 1000000; // Default fallback
                    try {
                        const countRes = await AcumaticaService.fetchWithRetry(`${ACU_BASE}/SalesInvoice?$count=true&$top=1`, cookie);
                        const countData = await countRes.json();
                        totalExpected = parseInt(countData["@odata.count"]) || totalExpected;
                        console.log(`>>> [Sync] Total Records to Sync: ${totalExpected}`);
                    } catch (cErr) {
                        console.warn(">>> [Sync] Could not get total count, using fallback.");
                    }

                    send({ section: "Sales history", details: `Fetching all branches (Total: ~${totalExpected.toLocaleString()})...`, progress: 5 });

                    let sSkip = 0, sTotal = 0, sHasMore = true;
                    // Single pass to get everything from SalesInvoice
                    while (sHasMore && !signal.aborted) {
                        const url = `${ACU_BASE}/SalesInvoice?$expand=Details&$top=100&$skip=${sSkip}`;

                        try {
                            const res = await AcumaticaService.fetchWithRetry(url, cookie);
                            const data = await res.json();
                            let invoices = data.value || (Array.isArray(data) ? data : []);

                            if (invoices.length === 0) { sHasMore = false; break; }

                            const sUpserts = [];
                            for (const inv of invoices) {
                                const date = getF(inv, "Date");
                                const period = getF(inv, "FinancialPeriod") || getPeriodForDate(date);
                                const invType = getF(inv, "Type") || "Invoice";
                                const hBranch = getF(inv, "Branch") || getF(inv, "BranchID") || "";

                                for (const line of (inv.Details || [])) {
                                    const invIdRaw = getF(line, "InventoryID").toString().trim();
                                    if (!invIdRaw) continue;

                                    const p = productMap.get(invIdRaw.toUpperCase());
                                    const lineBranch = (getF(line, "BranchID") || getF(line, "Branch") || hBranch || "BACOLOD").toString().trim();

                                    sUpserts.push({
                                        branch_name: lineBranch,
                                        order_type: invType,
                                        financial_period: period,
                                        document_date: date || null,
                                        description: p?.description || getF(line, "TransactionDescr") || getF(line, "Description") || "",
                                        qty: Number(getF(line, "Qty") || 0),
                                        total_amount: Number(getF(line, "Amount") || 0),
                                        inventory_id: invIdRaw,
                                        item_class: p?.item_class || "",
                                        posting_class: p?.posting_class || "",
                                        last_sync: new Date().toISOString()
                                    });
                                }
                            }

                            if (sUpserts.length > 0) {
                                await supabase.from('product_periodic_sales').upsert(sUpserts);
                                sTotal += sUpserts.length;
                            }

                            sSkip += invoices.length;
                            sHasMore = invoices.length === 100;

                            const currentProgress = Math.min(99, 5 + Math.floor((sSkip / totalExpected) * 94));
                            send({
                                section: "Sales history",
                                details: `Synced ${sTotal.toLocaleString()} of ~${totalExpected.toLocaleString()} records...`,
                                progress: currentProgress
                            });

                            await delay(50);
                        } catch (fetchErr) {
                            console.error(`>>> [Sync Error] Failed at skip ${sSkip}:`, fetchErr.message);
                            if (fetchErr.message === "Unauthorized") throw fetchErr;
                            sHasMore = false;
                        }
                    }
                    send({ section: "Sales history", status: "done", details: `Sales History Updated! Total: ${sTotal.toLocaleString()} records across all branches.`, progress: 100 });
                }

                send({ status: "complete", message: "Sync completed successfully" });
                controller.close();
            } catch (err) {
                console.error(">>> [Sync Error]", err);
                send({ status: "error", message: err.message });
                try { controller.close(); } catch (e) { }
            }
        }
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
