import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";

export async function GET(request) {
    try {
        const cookie = request.headers.get("cookie") || "";
        const { searchParams } = new URL(request.url);
        const username = searchParams.get("username") || "";

        const userInfo = await AuthService.getUserInfo(username, cookie);
        return NextResponse.json(userInfo);
    } catch (err) {
        console.error("[BFF Auth Me Error]", err);
        return NextResponse.json({ fullName: "" }, { status: 200 });
    }
}
