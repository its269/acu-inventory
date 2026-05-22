import { AcumaticaService } from "@/services/acumatica";
import { getSession } from "@/lib/session-store";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const branch = searchParams.get("branch") || "";
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");
        const search = searchParams.get("search") || "";

        if (!startDate || !endDate) {
            return NextResponse.json({ message: "Start date and end date are required" }, { status: 400 });
        }

        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);

        if (!cookie) {
            return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        }

        // Fetch direct from Acumatica using the SalesInvoice endpoint
        console.log(`[Sales API] Fetching periodic sales: branch=${branch}, start=${startDate}, end=${endDate}, search=${search}`);
        
        const invoices = await AcumaticaService.getPeriodicSales({
            cookie,
            branch,
            startDate,
            endDate,
            search
        });

        console.log(`[Sales API] Successfully fetched ${invoices?.length || 0} invoices.`);

        // --- PIVOTING LOGIC ---
        let result = [];
        let months = [];

        try {
            // 1. Get unique months in the range
            const start = new Date(startDate);
            const end = new Date(endDate);
            let curr = new Date(start.getFullYear(), start.getMonth(), 1);
            while (curr <= end) {
                const label = curr.toLocaleString('default', { month: 'short', year: 'numeric' });
                const key = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
                months.push({ label, key });
                curr.setMonth(curr.getMonth() + 1);
            }

            // Helper to extract values robustly
            const getF = (obj, key) => {
                if (!obj) return null;
                const val = obj[key];
                return (val?.value !== undefined ? val.value : val) ?? null;
            };

            const getAny = (obj, ...keys) => {
                for (const k of keys) {
                    const v = getF(obj, k);
                    if (v !== null && v !== undefined) return v;
                }
                return null;
            };

            // 2. Group data by InventoryID + Branch
            const grouped = {};

            invoices.forEach(inv => {
                const invType = getF(inv, "Type") || "Invoice";
                const docDateStr = getF(inv, "Date");
                if (!docDateStr) return;
                
                const docDate = new Date(docDateStr);
                const mKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`;
                const hBranch = getAny(inv, "Branch", "BranchID") || "";

                const details = inv.Details || [];
                details.forEach(line => {
                    const invId = getF(line, "InventoryID");
                    if (!invId) return;

                    const branchName = getAny(line, "BranchID", "Branch") || hBranch;
                    const groupKey = `${invId}|${branchName}`;
                    
                    if (!grouped[groupKey]) {
                        grouped[groupKey] = {
                            inventoryId: invId,
                            branchName: branchName,
                            description: getAny(line, "Description", "TransactionDescr") || "",
                            monthlyData: {},
                            totalQty: 0,
                            totalSales: 0
                        };
                        // Initialize monthly data
                        months.forEach(m => {
                            grouped[groupKey].monthlyData[m.key] = { qty: 0, sales: 0 };
                        });
                    }

                    let qty = Number(getAny(line, "Qty", "Quantity") || 0);
                    let amount = Number(getAny(line, "Amount", "ExtendedPrice") || 0);

                    // Handle returns/credits
                    if (invType.includes("Credit") || invType.includes("Return")) {
                        qty = -Math.abs(qty);
                        amount = -Math.abs(amount);
                    }

                    if (grouped[groupKey].monthlyData[mKey]) {
                        grouped[groupKey].monthlyData[mKey].qty += qty;
                        grouped[groupKey].monthlyData[mKey].sales += amount;
                    }

                    grouped[groupKey].totalQty += qty;
                    grouped[groupKey].totalSales += amount;
                });
            });

            result = Object.values(grouped);
        } catch (procErr) {
            console.error("[Sales API] Processing Error:", procErr);
            return NextResponse.json({ message: "Error processing invoice data", error: procErr.message }, { status: 500 });
        }

        return NextResponse.json({
            data: result,
            months: months,
            startDate,
            endDate
        });

    } catch (err) {
        console.error("[Periodic Sales API Error]", err);
        if (err.message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ message: "Failed to fetch periodic sales", error: err.message }, { status: 500 });
    }
}
