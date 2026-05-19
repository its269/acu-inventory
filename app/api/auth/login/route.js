import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();

        console.log(`[Login] Attempting login for user: ${username}`);
        const cookies = await AuthService.login({ username, password, company });
        console.log(`[Login] Acumatica returned ${cookies?.length ?? 0} cookie(s)`);

        const response = NextResponse.json({ success: true });

        if (cookies && Array.isArray(cookies)) {
            cookies.forEach(cookie => {
                response.headers.append("set-cookie", cookie);
            });
        }

        // Marker cookie so middleware can verify authenticated state
        response.cookies.set("acu_session", "1", {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 60 * 60 * 8, // 8 hours
        });

        console.log(`[Login] acu_session cookie set for: ${username}`);
        return response;
    } catch (err) {
        console.error("[BFF Login Error]", err);
        return NextResponse.json({ message: err.message || "Login failed" }, { status: 401 });
    }
}
