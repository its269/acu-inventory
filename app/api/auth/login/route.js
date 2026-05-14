const ACUMATICA_LOGIN_URL = "https://accounting.holocrontrackertrading.com/ERP/entity/auth/login";

export async function POST(request) {
    console.log("[auth/login] API hit");
    
    try {
        const bodyText = await request.text();
        console.log("[auth/login] raw body received:", bodyText);
        
        let bodyJson;
        try {
            bodyJson = JSON.parse(bodyText);
        } catch (e) {
            return new Response(JSON.stringify({ message: "Invalid JSON" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const { username, password, company } = bodyJson;
        if (!username || !password) {
            return new Response(JSON.stringify({ message: "Missing credentials" }), {
                status: 400,
                headers: { "Content-Type": "application/json" }
            });
        }

        const acuBody = {
            name: username,
            password: password,
            ...(company && { company })
        };

        console.log("[auth/login] sending fetch to Acumatica...");
        const acuResponse = await fetch(ACUMATICA_LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(acuBody),
        });

        console.log("[auth/login] Acumatica responded with status:", acuResponse.status);

        if (acuResponse.status === 204 || acuResponse.ok) {
            const setCookie = acuResponse.headers.get("set-cookie");
            const responseHeaders = { "Content-Type": "application/json" };
            if (setCookie) {
                responseHeaders["set-cookie"] = setCookie;
            }
            
            return new Response(JSON.stringify({ success: true }), {
                status: 200,
                headers: responseHeaders
            });
        }

        const errorText = await acuResponse.text().catch(() => "Login failed");
        return new Response(JSON.stringify({ message: errorText }), {
            status: acuResponse.status,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err) {
        console.error("[auth/login CRITICAL ERROR]", err);
        return new Response(JSON.stringify({ 
            message: "Internal Server Error", 
            error: err.message,
            stack: err.stack 
        }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
