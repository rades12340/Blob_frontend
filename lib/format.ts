const UNITS = ["B", "KB", "MB", "GB"];

// 1536 -> "1.5 KB". Powers of 1024, one decimal above bytes.
export function formatBytes(bytes: number): string {
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < UNITS.length - 1) {
        value /= 1024;
        unit++;
    }
    return unit === 0
        ? `${value} B`
        : `${value.toFixed(1).replace(/\.0$/, "")} ${UNITS[unit]}`;
}

export function formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

// Same default as blob_storage's MAX_UPLOAD_BYTES. The server still decides;
// this only saves uploading a file that will be rejected.
export const MAX_UPLOAD_BYTES = Number(
    process.env.NEXT_PUBLIC_MAX_UPLOAD_BYTES ?? 25 * 1024 * 1024,
);
