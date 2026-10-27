# syntax=docker/dockerfile:1

# --- frontend ---------------------------------------------------------------
FROM node:26-alpine AS frontend
WORKDIR /app/frontend
RUN npm install -g pnpm@12.15.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm run build

# --- backend ----------------------------------------------------------------
FROM golang:1.27-alpine AS backend
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /redisui .

# --- runtime ----------------------------------------------------------------
FROM gcr.io/distroless/static-debian12
WORKDIR /app
COPY --from=backend /redisui /app/redisui
COPY --from=frontend /app/frontend/dist /app/web
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/redisui"]
CMD ["-addr", "0.0.0.0:8080", "-data", "/data", "-static", "/app/web"]
