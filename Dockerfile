FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Database migrations, the spreadsheet import, and admin creation.
FROM node:24-bookworm-slim AS tools
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/app/uploads
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json drizzle.config.ts ./
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src ./src
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

# Encrypted backups, with rclone for an optional copy to cloud storage.
FROM postgres:17-alpine AS backup
RUN apk add --no-cache gnupg rclone
COPY scripts/backup.sh /usr/local/bin/backup.sh
COPY scripts/backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
# The entrypoint hands the folders over, then runs the backups as the postgres user, not as root.
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/app/uploads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "server.js"]
