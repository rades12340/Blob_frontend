import { expect, test } from "bun:test";
import { ApiError, createApi } from "./api";
import { formatBytes } from "./format";

type Call = { url: string; init: RequestInit; auth: string | null };

// A scripted fetch: each call takes the next response, and records what was
// sent.
function fakeFetch(responses: (() => Response)[]) {
    const calls: Call[] = [];
    const fetch = async (url: string, init: RequestInit = {}) => {
        calls.push({
            url,
            init,
            auth: new Headers(init.headers).get("Authorization"),
        });
        const next = responses.shift();
        if (!next) throw new Error(`Unexpected request to ${url}`);
        return next();
    };
    return { fetch, calls };
}

const ok = (body: unknown) => () => Response.json(body);
const status =
    (code: number, body: unknown = { error: `E${code}` }) =>
    () =>
        Response.json(body, { status: code });

test("login stores the token and sends it with later requests", async () => {
    const { fetch, calls } = fakeFetch([
        ok({ accessToken: "t1" }),
        ok({ files: [] }),
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });

    await api.login("me@example.com", "password123");
    expect(api.isSignedIn).toBe(true);
    expect(await api.listFiles()).toEqual([]);

    expect(calls[0]?.url).toBe("http://gw/api/auth/login");
    expect(calls[0]?.init.credentials).toBe("include");
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
        email: "me@example.com",
        password: "password123",
    });
    expect(calls[1]?.url).toBe("http://gw/api/blob/files");
    expect(calls[1]?.auth).toBe("Bearer t1");
});

test("an expired token is refreshed once and the request retried", async () => {
    const { fetch, calls } = fakeFetch([
        ok({ accessToken: "old" }),
        status(401),
        ok({ accessToken: "new" }),
        ok({ id: "u1", email: "me@example.com" }),
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });
    await api.login("me@example.com", "password123");

    expect(await api.me()).toEqual({ id: "u1", email: "me@example.com" });
    expect(calls.map((c) => c.url.replace("http://gw", ""))).toEqual([
        "/api/auth/login",
        "/api/auth/me",
        "/api/auth/refresh",
        "/api/auth/me",
    ]);
    expect(calls[1]?.auth).toBe("Bearer old");
    expect(calls[3]?.auth).toBe("Bearer new");
});

test("a failed refresh signs out and surfaces 401", async () => {
    const { fetch } = fakeFetch([
        ok({ accessToken: "old" }),
        status(401),
        status(401),
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });
    await api.login("me@example.com", "password123");

    const error = await api.listFiles().catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(401);
    expect(api.isSignedIn).toBe(false);
});

test("concurrent refreshes share one request", async () => {
    // auth_service revokes every session if a rotated refresh cookie is
    // reused, so two parallel refreshes would sign the user out.
    const { fetch, calls } = fakeFetch([ok({ accessToken: "t" })]);
    const api = createApi({ baseUrl: "http://gw", fetch });

    expect(await Promise.all([api.refresh(), api.refresh()])).toEqual([
        true,
        true,
    ]);
    expect(calls).toHaveLength(1);
});

test("refresh without a valid cookie reports signed out", async () => {
    const { fetch } = fakeFetch([status(401)]);
    const api = createApi({ baseUrl: "http://gw", fetch });

    expect(await api.refresh()).toBe(false);
    expect(api.isSignedIn).toBe(false);
});

test("errors carry the server's message and status", async () => {
    const { fetch } = fakeFetch([
        status(409, { error: "Email already registered" }),
        status(500, "not json"),
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });

    const conflict = await api.register("a@b.c", "password123").catch((e) => e);
    expect(conflict).toMatchObject({
        status: 409,
        message: "Email already registered",
    });

    const broken = await api.login("a@b.c", "password123").catch((e) => e);
    expect(broken).toMatchObject({
        status: 500,
        message: "Request failed (500)",
    });
});

test("uploads send the file as multipart form data", async () => {
    const { fetch, calls } = fakeFetch([
        ok({ accessToken: "t" }),
        ok({ id: "f1", name: "a.txt" }),
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });
    await api.login("me@example.com", "password123");

    await api.uploadFile(new File(["hi"], "a.txt"));
    const body = calls[1]?.init.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get("file")).toBeInstanceOf(File);
    expect(calls[1]?.init.method).toBe("POST");
});

test("logout clears the token even if the request fails", async () => {
    const { fetch } = fakeFetch([
        ok({ accessToken: "t" }),
        () => {
            throw new TypeError("network down");
        },
    ]);
    const api = createApi({ baseUrl: "http://gw", fetch });
    await api.login("me@example.com", "password123");

    await api.logout().catch(() => {});
    expect(api.isSignedIn).toBe(false);
});

test("download ids are escaped into the path", async () => {
    const { fetch, calls } = fakeFetch([ok({ url: "http://s3/x" })]);
    const api = createApi({ baseUrl: "http://gw", fetch });

    await api.getDownloadLink("../../x");
    expect(calls[0]?.url).toBe("http://gw/api/blob/download/..%2F..%2Fx");
});

test("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
});
