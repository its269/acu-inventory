import { AcumaticaService } from "@/services/acumatica";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const branch = searchParams.get("branch") || "";
        const targetMonth = parseInt(searchParams.get("month")); // 1-12
        const targetYear = parseInt(searchParams.get("year"));
        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "50");

        if (!targetMonth || !targetYear) {
            return NextResponse.json({ message: "Month and Year are required" }, { status: 400 });
        }

        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        // 1. Calculate 3-month Date Range (Selected Month + Next 2 Months)
        // Halimbawa: Jan 2026 selected -> Start Jan 1, End Mar 31
        const startLimit = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0);
        const endLimit = new Date(targetYear, targetMonth + 2, 0, 23, 59, 59); // 0th day of M+3 is last day of M+2
        
        const formatACU = (d) => d.toISOString().split('T')[0];
        const startDate = formatACU(startLimit);
        const endDate = formatACU(endLimit);

        // 2. Fetch Data from Acumatica (Unfiltered for stability)
        const invoices = await AcumaticaService.fetchSalesInvoicesByDateRange({ 
            cookie, 
            startDate, 
            endDate 
        });

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

        // 3. Define the consecutive months we WANT to show
        const targetMonths = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(targetYear, targetMonth - 1 + i, 1);
            const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const mLabel = d.toLocaleString('default', { month: 'short', year: 'numeric' });
            targetMonths.push({ key: mKey, label: mLabel, date: d });
        }

        // 4. Discover if data exists in our target range
        let filteredInvoices = invoices.filter(inv => {
            const d = new Date(getF(inv, "Date"));
            return d >= startLimit && d <= endLimit;
        });

        // 5. SMART DISCOVERY: If target range is empty, anchor to whatever we found
        let displayMonths = targetMonths;
        if (filteredInvoices.length === 0 && invoices.length > 0) {
            console.log(">>> [Sales API] Target range empty. Anchoring to discovered data.");
            filteredInvoices = invoices;
            
            const latestFound = new Date(getF(invoices[0], "Date"));
            const anchor = new Date(latestFound.getFullYear(), latestFound.getMonth(), 1);
            
            displayMonths = [];
            for (let i = 2; i >= 0; i--) {
                const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
                displayMonths.push({
                    key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                    label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
                    date: d
                });
            }
        }

        // 6. Aggregate
        const grouped = {};
        const { data: catalog } = await supabase.from("products").select("inventory_id,item_class,description");
        const productMap = new Map((catalog || []).map(p => [p.inventory_id.toUpperCase().trim(), p]));

        for (const inv of filteredInvoices) {
            const dateObj = new Date(getF(inv, "Date"));
            const mKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            
            if (!displayMonths.some(m => m.key === mKey)) continue;

            const hBranch = getAny(inv, "Branch", "BranchID") || "";
            for (const line of (inv.Details || [])) {
                const invId = String(getF(line, "InventoryID")).trim();
                if (!invId) continue;
                const lBranch = String(getAny(line, "BranchID", "Branch") || hBranch || "").trim();
                
                if (branch && branch !== "All Branches" && lBranch.toLowerCase() !== branch.toLowerCase()) continue;

                const groupKey = `${invId}|${lBranch}`;
                if (!grouped[groupKey]) {
                    const p = productMap.get(invId.toUpperCase());
                    grouped[groupKey] = {
                        inventoryId: invId,
                        branchName: lBranch,
                        description: p?.description || String(getAny(line, "TransactionDescr", "Description") || "").trim(),
                        itemClass: p?.item_class || "",
                        monthlyData: {},
                        totalQty: 0,
                        totalSales: 0
                    };
                    displayMonths.forEach(m => { grouped[groupKey].monthlyData[m.key] = { qty: 0, sales: 0 }; });
                }

                const qty = Number(getAny(line, "Qty", "Quantity") || 0);
                const sales = Number(getAny(line, "Amount", "ExtCost", "ExtPrice") || 0);

                if (grouped[groupKey].monthlyData[mKey]) {
                    grouped[groupKey].monthlyData[mKey].qty += qty;
                    grouped[groupKey].monthlyData[mKey].sales += sales;
                }
                grouped[groupKey].totalQty += qty;
                grouped[groupKey].totalSales += sales;
            }
        }

        const finalResults = Object.values(grouped).sort((a, b) => b.totalSales - a.totalSales);

        return NextResponse.json({
            data: finalResults.slice((page - 1) * pageSize, page * pageSize),
            months: displayMonths.map(m => ({ key: m.key, label: m.label })),
            pagination: {
                page,
                pageSize,
                totalItems: finalResults.length,
                totalPages: Math.ceil(finalResults.length / pageSize)
            }
        });

    } catch (err) {
        console.error("[Periodic Sales API Error]", err);
        return NextResponse.json({ message: "Failed to fetch periodic sales", error: err.message }, { status: 500 });
    }
}
