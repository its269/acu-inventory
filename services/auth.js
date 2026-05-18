const AUTH_URL = "https://accounting.holocrontrackertrading.com/ERP/entity/auth/login";
const COMMON_HEADERS = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "X-Requested-With": "XMLHttpRequest"
};

export const AuthService = {
    async login({ username, password, company }) {
        const res = await fetch(AUTH_URL, {
            method: "POST",
            headers: COMMON_HEADERS,
            body: JSON.stringify({ name: username, password, company }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "Login failed");
            throw new Error(text);
        }

        return res.headers.getSetCookie();
    },

    async logout(cookie) {
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
