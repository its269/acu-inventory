import { NextResponse } from "next/server";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";

        const res = await fetch(`${ACU_BASE}/Branch?$select=BranchID,BranchName&$top=100`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Cookie: cookie,
            },
        });

        if (res.status === 401) {
            return NextResponse.json({ message: "Session expired." }, { status: 401 });
        }

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            return NextResponse.json({ message: text || "Failed to fetch branches." }, { status: res.status });
        }

        const data = await res.json();
        return NextResponse.json(data, { status: 200 });
    } catch (err) {
        console.error("[branches proxy error]", err);
        return NextResponse.json({ message: "Unable to reach Acumatica." }, { status: 502 });
    }
}
