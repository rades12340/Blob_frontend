"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { FilesPanel } from "@/components/FilesPanel";
import { useAuth } from "./providers";

export default function Home() {
    const auth = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (auth.state.status === "signedOut") router.replace("/login");
    }, [auth.state.status, router]);

    if (auth.state.status !== "signedIn") {
        return <p className="loading">Loading…</p>;
    }

    return (
        <main className="page">
            <header className="topbar">
                <h1>Your files</h1>
                <div className="account">
                    <span className="muted">{auth.state.user.email}</span>
                    <button
                        type="button"
                        className="secondary"
                        onClick={() => auth.logout()}
                    >
                        Sign out
                    </button>
                </div>
            </header>
            <FilesPanel />
        </main>
    );
}
