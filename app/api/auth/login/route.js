import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";
import { setSession, setTokenSession } from "@/lib/session-store";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();
        console.log('[Login] Attempting login for user: ' + username);

        const sessionId = crypto.randomUUID();

        // Try OAuth2 Bearer token first
        let usedTokenAuth = false;
        try {
            const tokenData = await AuthService.loginWithToken({ username, password, company });
            setTokenSession(sessionId, tokenData);
            usedTokenAuth = true;
            console.log('[Login] OAuth2 token login successful');
        } catch (tokenErr) {
            console.warn('[Login] OAuth2 token login failed, falling back to cookie auth:', tokenErr.message);
        }

        // Fall back to cookie-based login
        if (!usedTokenAuth) {
            const cookies = await AuthService.login({ username, password, company });
            console.log('[Login] Acumatica returned ' + (cookies?.length ?? 0) + ' cookie(s)');
            setSession(sessionId, cookies || []);
        }

        console.log('[Login] Session stored: ' + sessionId);
        const response = NextResponse.json({ success: true });
        response.cookies.set("acu_session", sessionId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 8 });
        return response;
    } catch (err) {
        console.error("[BFF Login Error]", err);
        return NextResponse.json({ message: err.message || "Login failed" }, { status: 401 });
    }
}

