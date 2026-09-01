# Multi-stage production build for Workforce Hub (Client + Server)
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
COPY packages/client/package*.json ./packages/client/

RUN npm install

COPY packages/client ./packages/client
COPY packages/server ./packages/server

# Build client and server
RUN npm run build --workspace=packages/client
RUN npm run build --workspace=packages/server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
RUN npm install --omit=dev

COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/src/db/schema.sql ./packages/server/dist/db/schema.sql
COPY --from=builder /app/packages/client/dist ./packages/client/dist

# Ensure database directory exists
RUN mkdir -p /app/packages/server/data

ENV PORT=10000
EXPOSE 10000

CMD ["node", "packages/server/dist/server.js"]
