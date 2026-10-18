import type { NextConfig } from "next";

// Where this server forwards /api/* (api_gateway). Read when the app is
// built, so the Docker image takes it as a build argument.
const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
    // A self-contained server in .next/standalone, for the Docker image.
    output: "standalone",
    experimental: {
        // Next buffers request bodies it proxies and cuts them off at 10 MB by
        // default. Uploads may be up to 25 MB (blob_storage's limit), so allow
        // a little more and let blob_storage answer 413 for anything bigger.
        proxyClientMaxBodySize: "30mb",
    },
    // The browser only ever calls its own origin, so there's no CORS and the
    // refresh cookie is first-party on any host the app is opened on.
    async rewrites() {
        return [
            { source: "/api/:path*", destination: `${gatewayUrl}/api/:path*` },
        ];
    },
};

export default nextConfig;
