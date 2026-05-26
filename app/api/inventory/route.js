import { AcumaticaService } from "@/services/acumatica";
import { SupabaseService } from "@/services/supabase";
import { getSession } from "@/lib/session-store";

export const runtime = "nodejs";

/**
 * BFF API Route for Inventory
 * Handles request parsing and delegates to AcumaticaService or SupabaseService.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);

        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "10");
        const search = searchParams.get("search") || "";
        const branch = searchParams.get("branch") || "";
        const stats = searchParams.get("stats") === "true";
        const count = searchParams.get("count") === "true";
        const source = searchParams.get("source") || "supabase"; // Default to supabase for speed

        let result;

        if (source === "supabase") {
            console.log("[BFF] Fetching from Supabase...");
            try {
                const inventory = await SupabaseService.getInventory({ page, pageSize, search, branch });
                
                let globalStats = { totalValue: 0, lowStock: 0, outOfStock: 0 };
                if (stats) {
                    globalStats = await SupabaseService.getGlobalStats(branch, search);
                }

                result = {
                    ...inventory,
                    globalStats,
                    source: "supabase"
                };
            } catch (sError) {
                console.error("[Supabase Inventory Error]", sError);
                return Response.json({ 
                    message: "Supabase query failed", 
                    details: sError.message,
                    hint: "Did you run the SQL script in Supabase Editor?"
                }, { status: 500 });
            }
        } else {
            console.log("[BFF] Fetching from Acumatica...");
            const sessionId = request.cookies.get("acu_session")?.value;
            const cookie = getSession(sessionId);
            if (!cookie) return Response.json({ message: "Unauthorized" }, { status: 401 });

            result = await AcumaticaService.getStockItems({
                page,
                pageSize,
                search,
                branch,
                cookie,
                includeStats: stats,
                includeCount: count
            });
            result.source = "acumatica-direct";
        }

        return Response.json({
            ...result,
            page,
            pageSize
        });

    } catch (err) {
        console.error("[BFF Inventory Error]", err);
        if (err.message === "Unauthorized") {
            return Response.json({ message: "Unauthorized" }, { status: 401 });
        }
        return Response.json({ message: "Internal server error", details: err.message }, { status: 500 });
    }
}
