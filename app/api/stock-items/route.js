import { SupabaseService } from "@/services/supabase";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
        const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
        const search = searchParams.get("search") || "";

        console.log(`[Stock Items API] page=${page} pageSize=${pageSize} search="${search}"`);

        const result = await SupabaseService.getStockItems({ page, pageSize, search });

        return NextResponse.json(result);
    } catch (err) {
        console.error("[Stock Items API Error]", err);
        return NextResponse.json({ error: err.message || "Failed to fetch stock items" }, { status: 500 });
    }
}
