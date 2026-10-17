# Build with Bun, run the standalone Next.js server with Node.
FROM oven/bun:1.4.2-alpine AS build

WORKDIR /app

# --ignore-scripts skips the "prepare" script (husky), a dev-only git hook setup.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
# NEXT_PUBLIC_* values are baked into the browser bundle at build time,
# so the gateway's address is a build argument, not a runtime variable.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_MAX_UPLOAD_BYTES=26214400
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAX_UPLOAD_BYTES=$NEXT_PUBLIC_MAX_UPLOAD_BYTES \
    NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=5173 \
    HOSTNAME=0.0.0.0

# The standalone server doesn't include static assets; copy them next to it.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 5173
CMD ["node", "server.js"]
