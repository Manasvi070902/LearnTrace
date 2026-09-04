# Build the React application.
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Compile the Express application.
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npm run build

# Run the compiled backend and serve the compiled frontend from one image.
FROM node:22-bookworm-slim AS runtime
WORKDIR /app/backend

ENV NODE_ENV=production

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8080

CMD ["npm", "start"]
