FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server.js ./
COPY public ./public
EXPOSE 5173
CMD ["node", "server.js"]
