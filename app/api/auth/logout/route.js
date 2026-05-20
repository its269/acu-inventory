import { NextResponse } from "next/server";
import { AuthService } from "@/services/auth";
import { getSession, deleteSession } from "@/lib/session-store";

export async function GET(request) {
    console.log("[Logout] Clearing session and redirecting to /signin");
    const sessionId = request.cookies.get("acu_session")?.value;
    const cookie = getSession(sessionId);
    if (cookie) await AuthService.logout(cookie);
    if (sessionId) deleteSession(sessionId);

    const response = NextResponse.redirect(
        new URL("/signin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
    response.cookies.set("acu_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    console.log("[Logout] Done — redirecting to /signin");
    return response;
}
