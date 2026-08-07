FROM node:22-bookworm-slim

# Chromium for whatsapp-web.js (Puppeteer). Installing the distro package
# instead of letting Puppeteer download its own keeps the image smaller and
# avoids Puppeteer's Chromium download flakiness in some network setups.
# python3/make/g++ are a fallback build toolchain for better-sqlite3 (the
# Prisma SQLite driver adapter) in case no prebuilt binary matches the image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    openssl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# Persistent state: SQLite DB, linked-device sessions, uploaded template
# media. Mount volumes on these paths so they survive redeploys.
RUN mkdir -p /app/data /app/uploads /app/.wwebjs_auth /app/.wwebjs_cache

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "start"]
