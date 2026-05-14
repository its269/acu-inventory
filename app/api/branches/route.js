import { NextResponse } from "next/server";

const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const pageSize = 200;
        const seen = new Set();

        for (let skip = 0; skip < 5000; skip += pageSize) {
            const res = await fetch(`${ACU_BASE}/StockItem?$select=DefaultWarehouseID&$top=${pageSize}&$skip=${skip}`, {
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
            const items = data.value || data.d?.results || (Array.isArray(data) ? data : []);

            for (const item of items) {
                const siteId = item.DefaultWarehouseID?.value || item.DefaultWarehouseID?.Value || "";
                if (siteId) seen.add(siteId);
            }

            if (items.length < pageSize) break;
        }

        const branches = [...seen].sort((a, b) => a.localeCompare(b)).map((siteId) => ({ SiteID: siteId }));
        return NextResponse.json(branches, { status: 200 });
    } catch (err) {
        console.error("[branches proxy error]", err);
        return NextResponse.json({ message: "Unable to reach Acumatica." }, { status: 502 });
    }
}
