import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();

        const cookiesList = await AuthService.login({ username, password, company });
        const cookieStore = await cookies();

        if (cookiesList && Array.isArray(cookiesList)) {
            cookiesList.forEach(cookieStr => {
                // Parse the name=value part
                const parts = cookieStr.split(';')[0].split('=');
                if (parts.length < 2) return;

                const name = parts[0].trim();
                const value = parts.slice(1).join('=').trim();

                cookieStore.set(name, value, {
                    path: "/",
                    sameSite: "lax",
                    secure: false, // Localhost support
                    httpOnly: true,
                    maxAge: 3600 * 8
                });
            });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[BFF Login Error]", err);
        return NextResponse.json({ message: err.message || "Login failed" }, { status: 401 });
    }
}
