# Stage 1 — build Node dependencies (needs compiler for native modules like better-sqlite3)
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2 — runtime image (sem ferramentas de compilação)
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python-is-python3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules

COPY scripts/requirements.txt ./scripts/
RUN pip3 install --no-cache-dir --break-system-packages -r scripts/requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 3500

CMD ["node", "src/server.js"]
