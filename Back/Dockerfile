FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma

FROM base AS deps
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
