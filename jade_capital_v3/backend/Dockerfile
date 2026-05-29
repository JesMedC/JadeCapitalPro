FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm ci --ignore-scripts

COPY . .

RUN npm run build

FROM node:20-alpine AS runtime

RUN apk add --no-cache dumb-init

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

RUN addgroup -g 1001 nestjs && \
    adduser -u 1001 -G nestjs -s /bin/sh -D nestjs

USER nestjs

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "dist/main"]
