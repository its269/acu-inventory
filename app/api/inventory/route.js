import { AcumaticaService } from "@/services/acumatica";

export const runtime = "nodejs";

/**
 * BFF API Route for Inventory
 * Handles request parsing and delegates to AcumaticaService.
 */
export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const { searchParams } = new URL(request.url);

        const page = parseInt(searchParams.get("page") || "1");
        const pageSize = parseInt(searchParams.get("pageSize") || "10");
        const search = searchParams.get("search") || "";
        const branch = searchParams.get("branch") || "";

        const result = await AcumaticaService.getStockItems({
            page,
            pageSize,
            search,
            branch,
            cookie
        });

        return Response.json({
            ...result,
            page,
            pageSize,
            source: "acumatica-direct"
        });

    } catch (err) {
        console.error("[BFF Inventory Error]", err);
        if (err.message === "Unauthorized") {
            return Response.json({ message: "Unauthorized" }, { status: 401 });
        }
        return Response.json({ message: "Internal server error", details: err.message }, { status: 500 });
    }
}
