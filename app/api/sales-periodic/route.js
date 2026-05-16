import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const branch = searchParams.get("branch") || "";
        const startDate = searchParams.get("startDate");
        const endDate = searchParams.get("endDate");

        if (!startDate || !endDate) {
            return NextResponse.json({ message: "Start date and end date are required" }, { status: 400 });
        }

        let query = supabase
            .from('product_periodic_sales')
            .select('*')
            .gte('document_date', startDate)
            .lte('document_date', endDate);

        if (branch && branch !== "All Branches") {
            query = query.eq('branch_name', branch);
        }

        const { data, error } = await query;
        if (error) throw error;

        // --- PIVOTING LOGIC ---
        
        // 1. Get unique months in the range
        const start = new Date(startDate);
        const end = new Date(endDate);
        const months = [];
        let curr = new Date(start.getFullYear(), start.getMonth(), 1);
        while (curr <= end) {
            const label = curr.toLocaleString('default', { month: 'short', year: 'numeric' });
            const key = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}`;
            months.push({ label, key });
            curr.setMonth(curr.getMonth() + 1);
        }

        // 2. Group data by InventoryID + Branch
        const grouped = {};

        data.forEach(item => {
            const invId = item.inventory_id;
            const bName = item.branch_name;
            const groupKey = `${invId}|${bName}`;
            
            if (!grouped[groupKey]) {
                grouped[groupKey] = {
                    inventoryId: invId,
                    branchName: bName,
                    description: item.description,
                    itemClass: item.item_class,
                    monthlyData: {},
                    totalQty: 0,
                    totalSales: 0
                };
                // Initialize monthly data
                months.forEach(m => {
                    grouped[groupKey].monthlyData[m.key] = { qty: 0, sales: 0 };
                });
            }

            const docDate = new Date(item.document_date);
            const mKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`;
            
            if (grouped[groupKey].monthlyData[mKey]) {
                grouped[groupKey].monthlyData[mKey].qty += Number(item.qty || 0);
                grouped[groupKey].monthlyData[mKey].sales += Number(item.total_amount || 0);
            }

            grouped[groupKey].totalQty += Number(item.qty || 0);
            grouped[groupKey].totalSales += Number(item.total_amount || 0);
        });

        const result = Object.values(grouped);

        return NextResponse.json({
            data: result,
            months: months,
            startDate,
            endDate
        });

    } catch (err) {
        console.error("[Periodic Sales API Error]", err);
        return NextResponse.json({ message: "Failed to fetch periodic sales", error: err.message }, { status: 500 });
    }
}
