import { AcumaticaService } from "@/services/acumatica";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

// Robust field extractor helpers
const getF = (obj, k) => {
    if (!obj) return "";
    const key = Object.keys(obj).find(i => i.toLowerCase() === k.toLowerCase());
    if (!key) return "";
    const val = obj[key];
    if (val === null || val === undefined) return "";
    if (Array.isArray(val)) return val; // FIX: Return arrays directly (for Details/Transactions)
    if (typeof val === "object") return val.value ?? "";
    return val;
};

const getAny = (obj, ...keys) => {
    for (const k of keys) {
        const v = getF(obj, k);
        if (v !== "" && v !== null && v !== undefined) return v;
    }
    return "";
};

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const branch = searchParams.get("branch") || "";
        const targetMonth = parseInt(searchParams.get("month")); 
        const targetYear = parseInt(searchParams.get("year"));
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "15");

        if (!targetMonth || !targetYear) {
            return NextResponse.json({ message: "Month and Year are required" }, { status: 400 });
        }

        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        // 1. Calculate the target 3 months
        const targetMonths = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(targetYear, targetMonth - 1 + i, 1);
            if (d > new Date()) break;
            targetMonths.push({ month: d.getMonth() + 1, year: d.getFullYear() });
        }

        // 2. Fetch Data from Acumatica
        const rawInvoices = await AcumaticaService.fetchSalesBySpecificMonths({
            cookie,
            targetMonths
        });

        // 2.5 De-duplicate by ReferenceNbr
        const invoiceMap = new Map();
        for (const inv of rawInvoices) {
            const ref = getAny(inv, "ReferenceNbr", "OrderNbr", "id");
            if (!ref) continue;
            if (!invoiceMap.has(ref)) {
                invoiceMap.set(ref, inv);
            }
        }
        const invoices = Array.from(invoiceMap.values());
        console.log(`>>> [Sales API] De-duplicated from ${rawInvoices.length} to ${invoices.length} unique records.`);

        // 3. Discover months from actual data to build headers
        const monthMap = new Map();
        for (const inv of invoices) {
            let pKey = getAny(inv, "PostPeriod", "FinancialPeriod", "Period");
            const dateStr = getAny(inv, "Date", "DocumentDate");
            
            if (!pKey && dateStr) {
                const d = new Date(dateStr);
                pKey = `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
            }

            if (!pKey) continue;
            
            if (!monthMap.has(pKey)) {
                const d = new Date(dateStr);
                monthMap.set(pKey, {
                    key: pKey,
                    label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
                    date: d
                });
            }
        }

        const sortedMonths = Array.from(monthMap.values()).sort((a, b) => a.date - b.date);

        // 4. Aggregate
        const grouped = {};
        const { data: catalog } = await supabase.from("products").select("inventory_id,item_class,description");
        const productMap = new Map((catalog || []).map(p => [p.inventory_id.toUpperCase().trim(), p]));

        let totalRevenue = 0;
        let totalQtySold = 0;

        for (const inv of invoices) {
            let pKey = getAny(inv, "PostPeriod", "FinancialPeriod", "Period");
            const dateStr = getAny(inv, "Date", "DocumentDate");

            if (!pKey && dateStr) {
                const d = new Date(dateStr);
                pKey = `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
            }

            const invType = String(getAny(inv, "Type", "DocumentType")).trim();
            const isReturn = invType === "Credit Memo" || invType === "Return" || invType === "Credit Adj.";
            
            // PRESENTATION MODE: Treat everything as positive Gross Sales
            // if (isReturn) continue; 

            const hBranch = getAny(inv, "Branch", "BranchID", "SiteID", "LinkBranch");
            const rawDetails = inv.Details || inv.Transactions || inv.DocumentDetails || inv.value || [];
            const details = Array.isArray(rawDetails) ? rawDetails : (rawDetails.value || []);

            for (const line of details) {
                const invId = String(getAny(line, "InventoryID", "InventoryItem", "ItemID")).trim();
                if (!invId) continue;

                const lBranch = String(getAny(line, "BranchID", "Branch", "WarehouseID", "SiteID") || hBranch || "").trim();
                
                if (branch && branch !== "All Branches") {
                    const bTarget = branch.toLowerCase();
                    const bActual = lBranch.toLowerCase();
                    if (bActual !== bTarget && !bActual.includes(bTarget) && !bTarget.includes(bActual)) continue;
                }

                const groupKey = `${invId}|${lBranch}`;
                if (!grouped[groupKey]) {
                    const p = productMap.get(invId.toUpperCase());
                    grouped[groupKey] = {
                        inventoryId: invId,
                        branchName: lBranch,
                        description: p?.description || getAny(line, "TransactionDescription", "TransactionDescr", "Description") || "—",
                        itemClass: p?.item_class || getAny(line, "ItemClass") || "",
                        monthlyData: {},
                        totalQty: 0,
                        totalSales: 0
                    };
                    sortedMonths.forEach(m => { grouped[groupKey].monthlyData[m.key] = { qty: 0, sales: 0 }; });
                }

                let qty = Number(getAny(line, "Qty", "Quantity", "QtyOrdered") || 0);
                let sales = Number(getAny(line, "Amount", "ExtendedPrice", "ExtPrice", "LineAmount") || 0);

                // PRESENTATION MODE: Force POSITIVE for everything to show Gross Sales
                qty = Math.abs(qty);
                sales = Math.abs(sales);

                if (grouped[groupKey].monthlyData[pKey]) {
                    grouped[groupKey].monthlyData[pKey].qty += qty;
                    grouped[groupKey].monthlyData[pKey].sales += sales;
                }
                grouped[groupKey].totalQty += qty;
                grouped[groupKey].totalSales += sales;
                totalRevenue += sales;
                totalQtySold += qty;
            }
        }

        console.log(`>>> [Sales API] Aggregation Complete. Total Rev: ${totalRevenue}, Total Qty: ${totalQtySold}`);

        // Overall stocks
        let overallStocks = 0;
        try {
            const sQuery = supabase.from("warehouse_stock").select("on_hand");
            if (branch && branch !== "All Branches") sQuery.eq("warehouse_id", branch);
            const { data: sData } = await sQuery;
            overallStocks = (sData || []).reduce((sum, item) => sum + (item.on_hand || 0), 0);
        } catch (e) {}

        const finalResults = Object.values(grouped).sort((a, b) => b.totalSales - a.totalSales);

        return NextResponse.json({
            data: finalResults, // Return EVERYTHING for client-side pagination
            months: sortedMonths.map(m => ({ key: m.key, label: m.label })),
            metrics: { overallStocks, totalRevenue, uniqueProducts: finalResults.length, totalQtySold },
            pagination: { 
                totalItems: finalResults.length, 
                totalPages: Math.ceil(finalResults.length / pageSize) 
            }
        });

    } catch (err) {
        console.error("[Periodic Sales API Error]", err);
        return NextResponse.json({ message: "Error processing sales" }, { status: 500 });
    }
}
