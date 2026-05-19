const AUTH_BASE = "https://accounting.holocrontrackertrading.com/ERP/entity/auth";
const AUTH_URL = `${AUTH_BASE}/login`;
const LOGOUT_URL = `${AUTH_BASE}/logout`;
const COMMON_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
};

// Parse Acumatica error responses into a clean user-facing message
function parseAcuError(raw) {
    try {
        const obj = JSON.parse(raw);
        if (obj.exceptionMessage) return obj.exceptionMessage;
        if (obj.message) return obj.message;
    } catch { /* not JSON */ }
    return raw || "Login failed";
}

export const AuthService = {
    async login({ username, password, company }) {
        // Attempt to release any lingering Acumatica API session before logging in.
        // This helps avoid "API Login Limit" errors caused by sessions not being
        // properly closed on a previous logout.
        try {
            await fetch(LOGOUT_URL, { method: "POST", headers: COMMON_HEADERS });
        } catch { /* ignore — session may not exist */ }

        const res = await fetch(AUTH_URL, {
            method: "POST",
            headers: COMMON_HEADERS,
            body: JSON.stringify({ name: username, password, company }),
        });

        if (!res.ok) {
            const raw = await res.text().catch(() => "Login failed");
            throw new Error(parseAcuError(raw));
        }

        return res.headers.getSetCookie();
    },

    async logout(cookie) {
        try {
            await fetch(LOGOUT_URL, {
                method: "POST",
                headers: { ...COMMON_HEADERS, Cookie: cookie },
            });
        } catch { /* ignore */ }
        return true;
    },

    async getUserInfo(username, cookie) {
        const safeUsername = username.replace(/'/g, "''");
        const url = `https://accounting.holocrontrackertrading.com/ERP/entity/Default/20.200.001/Users?$filter=Username eq '${safeUsername}'&$select=Username,FirstName,LastName&$top=1`;

        const res = await fetch(url, {
            headers: { ...COMMON_HEADERS, Cookie: cookie },
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
