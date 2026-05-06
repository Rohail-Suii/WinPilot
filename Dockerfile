# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install all dependencies (dev deps needed for build stage)
RUN npm ci

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set Next.js telemetry off during build
ENV NEXT_TELEMETRY_DISABLED=1

# Provide dummy build-time env vars so Next.js can import route modules
# during static analysis without throwing (real values are injected at runtime
# via docker-compose env_file / .env.production).
# Use ARG so values don't persist in the final image layers.
ARG NEXTAUTH_SECRET=build-time-placeholder-secret
ARG NEXTAUTH_URL=http://localhost:3000
ARG MONGODB_URI=mongodb://localhost:27017/build
ARG ENCRYPTION_MASTER_KEY=build-time-placeholder-key-32chars!!
ARG RESEND_API_KEY=build-time-placeholder

ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV MONGODB_URI=$MONGODB_URI
ENV ENCRYPTION_MASTER_KEY=$ENCRYPTION_MASTER_KEY
ENV RESEND_API_KEY=$RESEND_API_KEY

# Build Next.js (produces .next/standalone)
RUN npm run build

# Bundle the custom server with esbuild
# - Resolve @/* path aliases to ./* (matches tsconfig paths)
# - Externalize all npm packages (resolved from standalone node_modules at runtime)
# - Bundle local source files (server.ts, lib/websocket/server.ts, auth.ts, etc.)
RUN npx esbuild server.ts --bundle --platform=node --target=node20 \
    --outfile=server.compiled.js \
    --format=cjs \
    --alias:@=. \
    --packages=external

# ============================================
# Stage 3: Production runner
# ============================================
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV WS_PORT=3001
ENV HOSTNAME=0.0.0.0

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Copy Next.js standalone output (includes node_modules and compiled Next.js server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the bundled custom server (replaces the default standalone server.js)
COPY --from=builder --chown=nextjs:nodejs /app/server.compiled.js ./server.js

# Set proper ownership for Next.js cache directory
RUN mkdir -p .next && chown nextjs:nodejs .next

# Switch to non-root user
USER nextjs

# Expose ports: 3000 (Next.js), 3001 (WebSocket)
EXPOSE 3000 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Use dumb-init to handle PID 1 and signal forwarding
ENTRYPOINT ["dumb-init", "--"]

# Start the custom server (compiled server.ts -> server.js)
CMD ["node", "server.js"]
