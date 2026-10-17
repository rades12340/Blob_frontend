"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/app/providers";
import { ApiError } from "@/lib/api";

const COPY = {
    login: {
        title: "Sign in",
        submit: "Sign in",
        busy: "Signing in…",
        switchText: "No account yet?",
        switchLink: "Create one",
        switchHref: "/register",
    },
    register: {
        title: "Create an account",
        submit: "Create account",
        busy: "Creating account…",
        switchText: "Already have an account?",
        switchLink: "Sign in",
        switchHref: "/login",
    },
} as const;

function messageFor(error: unknown, mode: "login" | "register") {
    if (error instanceof ApiError) {
        if (error.status === 401) return "Wrong email or password.";
        if (error.status === 409)
            return "An account with this email already exists.";
        if (error.status === 429)
            return "Too many attempts. Wait a minute and try again.";
        if (error.status === 400 && mode === "register") {
            return "Use a valid email and a password of 8 to 256 characters.";
        }
        return error.message;
    }
    return "Can't reach the server. Is api_gateway running?";
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
    const copy = COPY[mode];
    const auth = useAuth();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (auth.state.status === "signedIn") router.replace("/");
    }, [auth.state.status, router]);

    async function onSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const email = String(form.get("email"));
        const password = String(form.get("password"));
        setBusy(true);
        setError(null);
        try {
            await (mode === "login"
                ? auth.login(email, password)
                : auth.register(email, password));
        } catch (caught) {
            setError(messageFor(caught, mode));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="auth-page">
            <form className="card auth-card" onSubmit={onSubmit}>
                <h1>{copy.title}</h1>
                <label>
                    Email
                    <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                    />
                </label>
                <label>
                    Password
                    <input
                        name="password"
                        type="password"
                        autoComplete={
                            mode === "login"
                                ? "current-password"
                                : "new-password"
                        }
                        minLength={mode === "register" ? 8 : undefined}
                        maxLength={256}
                        required
                    />
                </label>
                {error && (
                    <p className="error" role="alert">
                        {error}
                    </p>
                )}
                <button type="submit" disabled={busy}>
                    {busy ? copy.busy : copy.submit}
                </button>
                <p className="muted">
                    {copy.switchText}{" "}
                    <Link href={copy.switchHref}>{copy.switchLink}</Link>
                </p>
            </form>
        </main>
    );
}
