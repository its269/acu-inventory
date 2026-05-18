import { NextResponse } from "next/server";

export async function POST() {
    console.log("[Logout] Clearing acu_session cookie");
    const response = NextResponse.json({ success: true });

    // Clear the session marker cookie
    response.cookies.set("acu_session", "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    console.log("[Logout] Session cookie cleared — user logged out");
    return response;
}
