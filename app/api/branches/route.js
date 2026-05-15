import { AcumaticaService } from "@/services/acumatica";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const branches = await AcumaticaService.getBranches(cookie);
        return NextResponse.json(branches);
    } catch (err) {
        console.error("[BFF Branches Error]", err);
        if (err.message === "Unauthorized") return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
        return NextResponse.json({ message: "Failed to fetch branches" }, { status: 500 });
    }
}
