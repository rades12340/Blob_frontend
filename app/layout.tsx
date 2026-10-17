import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./providers";

export const metadata: Metadata = {
    title: "Blob Storage",
    description: "Upload files and download them again.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
    return (
        <html lang="en">
            <body>
                <AuthProvider>{children}</AuthProvider>
            </body>
        </html>
    );
}
