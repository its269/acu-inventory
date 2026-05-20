import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";
import { setSession } from "@/lib/session-store";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();
        console.log('[Login] Attempting login for user: ' + username);
        const cookies = await AuthService.login({ username, password, company });
        console.log('[Login] Acumatica returned ' + (cookies?.length ?? 0) + ' cookie(s)');
        const sessionId = crypto.randomUUID();
        setSession(sessionId, cookies || []);
        console.log('[Login] Session stored: ' + sessionId);
        const response = NextResponse.json({ success: true });
        response.cookies.set("acu_session", sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
        return response;
    } catch (err) {
        console.error("[BFF Login Error]", err);
        return NextResponse.json({ message: err.message || "Login failed" }, { status: 401 });
    }
}

