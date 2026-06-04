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

    try {
        const result = await AcumaticaService.getReplenishmentRecommendations({ cookie });
        return NextResponse.json(result);
    } catch (err) {
        console.error("[Replenishment API Error]", err);
        return NextResponse.json({ message: err.message }, { status: 500 });
    }
}
