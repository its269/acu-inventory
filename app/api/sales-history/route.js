import { AcumaticaService } from "@/services/acumatica";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const { searchParams } = new URL(request.url);
        
        const branch = searchParams.get("branch") || "";
        const startDate = searchParams.get("startDate") || "";
        const endDate = searchParams.get("endDate") || "";

        const result = await AcumaticaService.getSalesAnalysis({
            branch,
            cookie,
            startDate,
            endDate
        });

        return NextResponse.json(result);
    } catch (err) {
        console.error("[BFF Sales History Error]", err);
        if (err.message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ message: "Failed to fetch sales history" }, { status: 500 });
    }
}
