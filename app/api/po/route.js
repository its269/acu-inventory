import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";
import { AcumaticaService } from "@/services/acumatica";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
    const sessionId = request.cookies.get("acu_session")?.value;
    const cookie = getSession(sessionId);
    
    if (!cookie) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"));
    const search = (searchParams.get("search") || "").trim();
    const startDate = searchParams.get("startDate") || "";
    const status = searchParams.get("status") || "";

    try {
        const result = await AcumaticaService.getPurchaseOrders({
            page,
            pageSize,
            search,
            cookie,
            startDate,
            status
        });

        return NextResponse.json({ 
            ...result, 
            page, 
            pageSize 
        });
    } catch (err) {
        console.error("[PO API Error]", err);
        return NextResponse.json({ message: err.message }, { status: 500 });
    }
}

