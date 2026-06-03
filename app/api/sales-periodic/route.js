import { AcumaticaService } from "@/services/acumatica";
import { MySqlService } from "@/services/mysql";
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

        // 1. Calculate the target 3 months
        const targetMonths = [];
        for (let i = 0; i < 3; i++) {
            const d = new Date(targetYear, targetMonth - 1 + i, 1);
            if (d > new Date()) break;
            targetMonths.push({ 
                month: d.getMonth() + 1, 
                year: d.getFullYear(),
                label: d.toLocaleString('default', { month: 'short', year: 'numeric' }),
                key: `${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`
            });
        }

        // --- Try MySQL first ---
        console.log(`[Sales Periodic API] Fetching from MySQL (db_purchase) for ${targetMonth}/${targetYear}`);
        const mysqlResult = await MySqlService.getSalesAnalysis({
            branch,
            targetMonths
        });

        if (mysqlResult && mysqlResult.data && mysqlResult.data.length > 0) {
            return NextResponse.json({
                ...mysqlResult,
                months: targetMonths.map(m => ({ key: m.key, label: m.label })),
                pagination: {
                    totalItems: mysqlResult.data.length,
                    totalPages: Math.ceil(mysqlResult.data.length / pageSize)
                },
                source: "mysql"
            });
        }

        // --- Fallback: fetch live from Acumatica ---
        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        console.log(`[Sales Periodic API] Fallback: Live fetch from Acumatica`);
        const rawInvoices = await AcumaticaService.fetchSalesBySpecificMonths({
            cookie,
            targetMonths
        });

        // Aggregation logic for live fetch (same as before)
        const grouped = {};
        let totalRevenue = 0;
        let totalQtySold = 0;

        for (const inv of rawInvoices) {
            let pKey = getAny(inv, "PostPeriod", "FinancialPeriod", "Period");
            const hBranch = getAny(inv, "Branch", "BranchID", "SiteID", "LinkBranch");
            const rawDetails = inv.Details || inv.Transactions || inv.DocumentDetails || inv.value || [];
            const details = Array.isArray(rawDetails) ? rawDetails : (rawDetails.value || []);

            for (const line of details) {
                const invId = String(getAny(line, "InventoryID")).trim();
                if (!invId) continue;

                const lBranch = String(getAny(line, "BranchID") || hBranch || "").trim();
                if (branch && branch !== "All Branches" && lBranch !== branch) continue;

                const groupKey = `${invId}|${lBranch}`;
                if (!grouped[groupKey]) {
                    grouped[groupKey] = {
                        inventoryId: invId,
                        branchName: lBranch,
                        description: getAny(line, "Description") || "—",
                        monthlyData: {},
                        totalQty: 0,
                        totalSales: 0
                    };
                    targetMonths.forEach(m => { grouped[groupKey].monthlyData[m.key] = { qty: 0, sales: 0 }; });
                }

                let qty = Math.abs(Number(getAny(line, "Qty") || 0));
                let sales = Math.abs(Number(getAny(line, "Amount") || 0));

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

        const finalResults = Object.values(grouped).sort((a, b) => b.totalSales - a.totalSales);

        return NextResponse.json({
            data: finalResults,
            months: targetMonths.map(m => ({ key: m.key, label: m.label })),
            metrics: { totalRevenue, uniqueProducts: finalResults.length, totalQtySold },
            pagination: {
                totalItems: finalResults.length,
                totalPages: Math.ceil(finalResults.length / pageSize)
            },
            source: "acumatica"
        });

    } catch (err) {
        console.error("[Periodic Sales API Error]", err);
        return NextResponse.json({ message: "Error processing sales" }, { status: 500 });
    }
}
