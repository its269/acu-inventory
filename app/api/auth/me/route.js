const ACU_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username") || "";

        // OData eq filter — do NOT encode the value, just escape single quotes by doubling them
        const safeUsername = username.replace(/'/g, "''");
        const url = `${ACU_BASE}/Users?$filter=Username eq '${safeUsername}'&$select=Username,FirstName,LastName&$top=1`;

        const res = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Cookie: cookie,
            },
        });

        if (!res.ok) {
            console.warn("[auth/me] Users fetch failed:", res.status, await res.text().catch(() => ""));
            return Response.json({ fullName: username }, { status: 200 });
        }

        const data = await res.json();
        console.log("[auth/me] raw response:", JSON.stringify(data));

        const user = Array.isArray(data) ? data[0] : data;

        if (!user) {
            return Response.json({ fullName: username }, { status: 200 });
        }

        // Acumatica wraps field values in { value: "..." } objects
        const first = (user.FirstName?.value ?? user.FirstName ?? "").trim();
        const last = (user.LastName?.value ?? user.LastName ?? "").trim();
        const fullName = [first, last].filter(Boolean).join(" ") || username;

        return Response.json({ fullName, first, last }, { status: 200 });
    } catch (err) {
        console.error("[auth/me error]", err);
        return Response.json({ fullName: "" }, { status: 200 });
    }
}

