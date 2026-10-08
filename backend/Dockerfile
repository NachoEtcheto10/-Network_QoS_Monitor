FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "src/server.js"]
