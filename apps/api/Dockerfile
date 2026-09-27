# syntax=docker/dockerfile:1
# Build context is the repository root (Railway root directory "/"):
#   docker build -f apps/api/Dockerfile -t tilawah-api .
# apps/api/Dockerfile.dockerignore keeps the context down to apps/api.
FROM golang:1.24-alpine AS build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download
COPY apps/api/ ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/server /server
ENV PORT=8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
