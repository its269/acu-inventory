import { NextResponse } from "next/server";

export async function GET() {
    console.log("[Logout] Clearing acu_session cookie and redirecting to /signin");

    // Redirect to /signin — cookie is cleared in the same response so the
    // middleware sees it immediately and won't bounce the user back to /dashboard.
    const response = NextResponse.redirect(
        new URL("/signin", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );

    response.cookies.set("acu_session", "", {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
    });

    console.log("[Logout] Done — redirecting to /signin");
    return response;
}
