const ACUMATICA_LOGIN_URL =
    "https://accounting.holocrontrackertrading.com/ERP/entity/auth/login";

export async function POST(request) {
    try {
        const { username, password, company } = await request.json();

        if (!username || !password) {
            return Response.json(
                { message: "Username and password are required." },
                { status: 400 }
            );
        }

        const body = {
            name: username,       // Acumatica expects "name", not "username"
            password,
            ...(company && { company }),
        };

        const acuResponse = await fetch(ACUMATICA_LOGIN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            // Forward cookies so Acumatica session is established
            credentials: "include",
        });

        // Acumatica returns 204 No Content on success
        if (acuResponse.status === 204 || acuResponse.ok) {
            // Forward Set-Cookie headers from Acumatica to the browser
            const setCookie = acuResponse.headers.get("set-cookie");
            const headers = new Headers();
            headers.set("Content-Type", "application/json");
            if (setCookie) {
                headers.set("set-cookie", setCookie);
            }
            return new Response(
                JSON.stringify({ success: true, message: "Login successful." }),
                { status: 200, headers }
            );
        }

        // Try to parse error from Acumatica
        let errorMessage = "Invalid credentials. Please try again.";
        try {
            const errorData = await acuResponse.json();
            errorMessage = errorData?.message || errorData?.exceptionMessage || errorMessage;
        } catch {
            // Acumatica may return plain text on errors
            const text = await acuResponse.text().catch(() => "");
            if (text) errorMessage = text;
        }

        return Response.json({ message: errorMessage }, { status: acuResponse.status });
    } catch (err) {
        console.error("[auth/login proxy error]", err);
        return Response.json(
            { message: "Unable to reach the authentication server." },
            { status: 502 }
        );
    }
}
