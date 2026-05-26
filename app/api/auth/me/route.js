import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session-store";

export async function GET(request) {
    try {
        const sessionId = request.cookies.get("acu_session")?.value;
        const cookie = getSession(sessionId);
        
        if (!cookie) {
            console.warn(`[Auth Me API] No session found for sessionId: ${sessionId || "(none)"}`);
            return NextResponse.json({ fullName: "" }, { status: 200 });
        }

        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username") || "";

        const userInfo = await AuthService.getUserInfo(username, cookie);
        return NextResponse.json(userInfo);
    } catch (err) {
        console.error("[BFF Auth Me Error]", err);
        return NextResponse.json({ fullName: "" }, { status: 200 });
    }
}
