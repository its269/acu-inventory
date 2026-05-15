import { AuthService } from "@/services/auth";
import { NextResponse } from "next/server";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();
        
        const setCookie = await AuthService.login({ username, password, company });
        
        const response = NextResponse.json({ success: true });
        if (setCookie) {
            response.headers.set("set-cookie", setCookie);
        }
        
        return response;
    } catch (err) {
        console.error("[BFF Login Error]", err);
        return NextResponse.json({ message: err.message || "Login failed" }, { status: 401 });
    }
}
