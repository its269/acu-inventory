const AUTH_URL = "https://accounting.holocrontrackertrading.com/ERP/entity/auth/login";

export const AuthService = {
    async login({ username, password, company }) {
        const res = await fetch(AUTH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: username, password, company }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "Login failed");
            throw new Error(text);
        }

        // Return all cookies as an array
        return res.headers.getSetCookie();
    },

    async logout(cookie) {
        // Acumatica doesn't always need a server-side logout if session is short,
        // but we can add it here if needed.
        return true;
    },

    async getUserInfo(username, cookie) {
        const safeUsername = username.replace(/'/g, "''");
        const url = `https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001/Users?$filter=Username eq '${safeUsername}'&$select=Username,FirstName,LastName&$top=1`;

        const res = await fetch(url, {
            headers: { "Content-Type": "application/json", Accept: "application/json", Cookie: cookie },
        });

        if (!res.ok) return { fullName: username };

        const data = await res.json();
        const user = Array.isArray(data) ? data[0] : data;

        if (!user) return { fullName: username };

        const first = (user.FirstName?.value ?? user.FirstName ?? "").trim();
        const last = (user.LastName?.value ?? user.LastName ?? "").trim();
        
        return {
            first,
            last,
            fullName: [first, last].filter(Boolean).join(" ") || username
        };
    }
};
