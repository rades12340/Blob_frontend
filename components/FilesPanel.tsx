"use client";

import {
    type ChangeEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { useAuth } from "@/app/providers";
import { ApiError, api, type StoredFile } from "@/lib/api";
import { formatBytes, formatDate, MAX_UPLOAD_BYTES } from "@/lib/format";

export function FilesPanel() {
    const { sessionExpired } = useAuth();
    const [files, setFiles] = useState<StoredFile[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [uploading, setUploading] = useState<string | null>(null);
    const [downloading, setDownloading] = useState<string | null>(null);
    const input = useRef<HTMLInputElement>(null);

    // Every request goes through here, so an expired session sends the user
    // back to sign in from anywhere on the page.
    const report = useCallback(
        (caught: unknown, fallback: string) => {
            if (caught instanceof ApiError && caught.status === 401) {
                sessionExpired();
                return;
            }
            if (caught instanceof ApiError && caught.status === 413) {
                setError(
                    `That file is too large (max ${formatBytes(MAX_UPLOAD_BYTES)}).`,
                );
                return;
            }
            if (caught instanceof ApiError && caught.status === 502) {
                setError(
                    "Storage is unavailable right now. Try again shortly.",
                );
                return;
            }
            setError(caught instanceof ApiError ? caught.message : fallback);
        },
        [sessionExpired],
    );

    const load = useCallback(async () => {
        try {
            setFiles(await api.listFiles());
        } catch (caught) {
            report(caught, "Couldn't load your files.");
        }
    }, [report]);

    useEffect(() => {
        load();
    }, [load]);

    async function onPick(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setError(null);
        if (file.size > MAX_UPLOAD_BYTES) {
            setError(
                `That file is too large (max ${formatBytes(MAX_UPLOAD_BYTES)}).`,
            );
            return;
        }
        setUploading(file.name);
        try {
            const stored = await api.uploadFile(file);
            setFiles((current) => [stored, ...(current ?? [])]);
        } catch (caught) {
            report(caught, "Upload failed.");
        } finally {
            setUploading(null);
        }
    }

    async function onDownload(file: StoredFile) {
        setError(null);
        setDownloading(file.id);
        try {
            const link = await api.getDownloadLink(file.id);
            // The presigned link answers with Content-Disposition: attachment,
            // so the browser saves the file and stays on this page.
            window.location.href = link.url;
        } catch (caught) {
            report(caught, "Couldn't get a download link.");
        } finally {
            setDownloading(null);
        }
    }

    return (
        <section className="card">
            <div className="toolbar">
                <p className="muted">
                    Up to {formatBytes(MAX_UPLOAD_BYTES)} per file. Only you can
                    see your files.
                </p>
                <input
                    ref={input}
                    type="file"
                    hidden
                    onChange={onPick}
                    aria-label="File to upload"
                />
                <button
                    type="button"
                    disabled={uploading !== null}
                    onClick={() => input.current?.click()}
                >
                    {uploading ? `Uploading ${uploading}…` : "Upload a file"}
                </button>
            </div>

            {error && (
                <p className="error" role="alert">
                    {error}
                </p>
            )}

            {files === null ? (
                <p className="muted">Loading files…</p>
            ) : files.length === 0 ? (
                <p className="empty">
                    No files yet. Upload one to get started.
                </p>
            ) : (
                <table className="files">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th className="num">Size</th>
                            <th>Type</th>
                            <th>Uploaded</th>
                            <th aria-label="Actions" />
                        </tr>
                    </thead>
                    <tbody>
                        {files.map((file) => (
                            <tr key={file.id}>
                                <td className="name" title={file.name}>
                                    {file.name}
                                </td>
                                <td className="num">
                                    {formatBytes(file.size)}
                                </td>
                                <td className="muted">{file.type}</td>
                                <td className="muted">
                                    {formatDate(file.createdAt)}
                                </td>
                                <td className="actions">
                                    <button
                                        type="button"
                                        className="secondary"
                                        disabled={downloading === file.id}
                                        onClick={() => onDownload(file)}
                                    >
                                        {downloading === file.id
                                            ? "Preparing…"
                                            : "Download"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
