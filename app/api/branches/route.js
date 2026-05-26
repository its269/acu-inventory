import { AcumaticaService } from "@/services/acumatica";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const source = searchParams.get("source") || "supabase";

        if (source === "supabase") {
            const { data, error } = await supabase.from('branches').select('*').order('branch_name');
            if (error) {
                console.error("[Supabase Branches Error]", error);
                return NextResponse.json({ message: "Supabase error", details: error.message }, { status: 500 });
            }
            
            // Map to Acumatica-like structure for frontend compatibility
            return NextResponse.json((data || []).map(b => ({
                SiteID: b.branch_id,
                Description: { value: b.branch_name }
            })));
        }

        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        if (!cookie) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const branches = await AcumaticaService.getBranches(cookie);
        return NextResponse.json(branches);
    } catch (err) {
        console.error("[BFF Branches Error]", err);
        if (err.message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ message: "Failed to fetch branches" }, { status: 500 });
    }
}
