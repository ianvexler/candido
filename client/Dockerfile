FROM node:24-alpine AS dev
WORKDIR /app
# Chrome makes the CV PDFs (lib/pdf).
RUN apk add --no-cache chromium font-noto
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV=development
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "dev"]

FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build

FROM node:24-alpine
WORKDIR /app
# Chrome makes the CV PDFs (lib/pdf); fonts for text the templates' own don't cover.
RUN apk add --no-cache chromium font-noto
ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
