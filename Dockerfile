FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone Next.js output (self-contained, no node_modules needed at runtime)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Seed files (source of truth for volume initialization)
COPY --from=builder /app/data ./data
# Startup script
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# Seed the persistent volume on first run, then start the Next.js server.
CMD ["sh", "-c", "node scripts/seed-volume.mjs && node server.js"]
