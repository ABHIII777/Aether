# __APP_NAME__

Aether application with a TypeScript client and Go server.

## Development

```bash
pnpm install
pnpm dev
```

The client runs at `http://localhost:3000` and `/api` is proxied to the Go server on port `8080`.

## Build

```bash
pnpm build
./bin/__APP_NAME__
```

The build bundles the client, embeds it in the Go binary, and produces one executable.

## Environment

Copy `.env.example` to `.env` and point `DATABASE_URL` at PostgreSQL.

## Layout

```text
client/        TypeScript UI
server/        Go application and framework
packages/      Local Aether runtime and CLI
```
