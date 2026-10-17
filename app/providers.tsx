"use client";

import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { api, type User } from "@/lib/api";

type AuthState =
    | { status: "loading" }
    | { status: "signedOut" }
    | { status: "signedIn"; user: User };

type AuthContextValue = {
    state: AuthState;
    login(email: string, password: string): Promise<void>;
    register(email: string, password: string): Promise<void>;
    logout(): Promise<void>;
    // Called when a request finds the session gone (refresh failed).
    sessionExpired(): void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({ status: "loading" });

    // A reload loses the in-memory token, but the refresh cookie survives,
    // so try to swap it for a new token before deciding the user is out.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const user = (await api.refresh()) ? await api.me() : null;
            if (!cancelled) {
                setState(
                    user
                        ? { status: "signedIn", user }
                        : { status: "signedOut" },
                );
            }
        })().catch(() => {
            if (!cancelled) setState({ status: "signedOut" });
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        await api.login(email, password);
        setState({ status: "signedIn", user: await api.me() });
    }, []);

    const register = useCallback(
        async (email: string, password: string) => {
            await api.register(email, password);
            await login(email, password);
        },
        [login],
    );

    const logout = useCallback(async () => {
        await api.logout().catch(() => {});
        setState({ status: "signedOut" });
    }, []);

    const sessionExpired = useCallback(() => {
        setState({ status: "signedOut" });
    }, []);

    const value = useMemo(
        () => ({ state, login, register, logout, sessionExpired }),
        [state, login, register, logout, sessionExpired],
    );
    return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used inside AuthProvider");
    return context;
}
