FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY index.html script.js style.css farmers.html /app/

EXPOSE 5000

CMD ["npm", "start"]
