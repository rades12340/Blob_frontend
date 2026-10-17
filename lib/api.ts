// Talks to api_gateway, which routes /api/auth/* to auth_service and
// /api/blob/* to blob_storage.
//
// The access token lives only in this closure (memory), as auth_service
// requires; the refresh token is an httpOnly cookie the browser sends itself.

export type User = { id: string; email: string };

export type StoredFile = {
    id: string;
    ownerId: string;
    name: string;
    size: number;
    type: string;
    sha256: string;
    createdAt: string;
};

export type DownloadLink = {
    url: string;
    expiresAt: string;
    name: string;
    size: number;
    type: string;
    sha256: string;
};

export class ApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ApiError";
    }
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export function createApi({
    baseUrl,
    fetch = globalThis.fetch,
}: {
    baseUrl: string;
    fetch?: Fetch;
}) {
    let accessToken: string | null = null;
    let refreshing: Promise<boolean> | null = null;

    async function send(path: string, init: RequestInit = {}) {
        const headers = new Headers(init.headers);
        if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
        return fetch(`${baseUrl}${path}`, {
            ...init,
            headers,
            // Sends and stores the refresh cookie.
            credentials: "include",
        });
    }

    async function errorFrom(response: Response): Promise<ApiError> {
        const body = await response.json().catch(() => null);
        const message =
            typeof body?.error === "string"
                ? body.error
                : `Request failed (${response.status})`;
        return new ApiError(message, response.status);
    }

    async function json<T>(response: Response): Promise<T> {
        if (!response.ok) throw await errorFrom(response);
        return response.json() as Promise<T>;
    }

    // Swaps the refresh cookie for a new access token. auth_service rotates
    // the cookie on every refresh and revokes all sessions if an old one is
    // reused, so concurrent callers must share a single request.
    function refresh(): Promise<boolean> {
        refreshing ??= (async () => {
            try {
                const response = await send("/api/auth/refresh", {
                    method: "POST",
                });
                if (!response.ok) {
                    accessToken = null;
                    return false;
                }
                accessToken = (await response.json()).accessToken;
                return true;
            } finally {
                refreshing = null;
            }
        })();
        return refreshing;
    }

    // For calls that need a token: on 401 (expired token) refresh once and
    // retry.
    async function authed(path: string, init: RequestInit = {}) {
        let response = await send(path, init);
        if (response.status === 401 && (await refresh())) {
            response = await send(path, init);
        }
        if (response.status === 401) accessToken = null;
        return response;
    }

    function postJson(path: string, body: unknown) {
        return send(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    return {
        get isSignedIn() {
            return accessToken !== null;
        },

        refresh,

        async register(email: string, password: string): Promise<User> {
            return json<User>(
                await postJson("/api/auth/register", { email, password }),
            );
        },

        async login(email: string, password: string): Promise<void> {
            const body = await json<{ accessToken: string }>(
                await postJson("/api/auth/login", { email, password }),
            );
            accessToken = body.accessToken;
        },

        async logout(): Promise<void> {
            try {
                await send("/api/auth/logout", { method: "POST" });
            } finally {
                accessToken = null;
            }
        },

        async me(): Promise<User> {
            return json<User>(await authed("/api/auth/me"));
        },

        async listFiles(): Promise<StoredFile[]> {
            const body = await json<{ files: StoredFile[] }>(
                await authed("/api/blob/files"),
            );
            return body.files;
        },

        async uploadFile(file: File): Promise<StoredFile> {
            const form = new FormData();
            form.set("file", file);
            return json<StoredFile>(
                await authed("/api/blob/upload", {
                    method: "POST",
                    body: form,
                }),
            );
        },

        async getDownloadLink(id: string): Promise<DownloadLink> {
            return json<DownloadLink>(
                await authed(`/api/blob/download/${encodeURIComponent(id)}`),
            );
        },
    };
}

export type Api = ReturnType<typeof createApi>;

// One instance for the whole app, so every component shares the token and
// the in-flight refresh.
export const api = createApi({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
});
