# Aether

**A full-stack framework for React-style interfaces and Go backends.**

Aether lets you build web applications with a React-style component model on the
client and an entirely Go-based backend on the server — no Node in production,
no JavaScript on the server, one binary to deploy.

> **Status:** pre-alpha. Aether is under active design and is not yet usable for
> real projects. This README describes the target, not the current state.

---

## Why Aether

Today you generally have two choices:

- **React + Node** (Next.js, Remix, NestJS) — an excellent client programming
  model, but the server is JavaScript, production runs a Node process, and your
  backend is locked into the JavaScript ecosystem.
- **Go + SPA boilerplate** — an excellent server language, but a fractured
  developer experience. You assemble a bundler, a dev proxy, CORS rules, a
  router, session handling, migrations, and a build pipeline yourself, then keep
  two deployables in sync forever.

Aether's bet is that you should not have to choose. Keep the programming model
developers already know — components, props, state, JSX — implement it in a
small first-party runtime, and pair it with a Go framework designed for the same
application. One CLI owns development, build, and deployment.

## Our goal

> **One framework, one runtime, one binary.**
>
> A developer writes a React-style client in TypeScript and a backend in Go,
> runs one command to start both, and ships a single Go executable that serves
> the client, the API, and talks to PostgreSQL — with no Node runtime in
> production.

Concretely, Aether should make this workflow real:

```bash
aether create myapp
cd myapp
aether dev      # client + server on one port
aether build    # single binary with the client embedded
```

## The four pillars

### 1. A first-party React-style runtime

A small, auditable runtime that provides the React programming model without
depending on React or Preact.

- Function components with props and children
- JSX compiled to a `createElement` factory
- `useState` for local state; effects and memoization later
- Keyed reconciliation: diff the tree and patch the DOM instead of rebuilding it
- Event props (`onClick`, `onSubmit`, `onInput`) with predictable normalization
- Explicit rules, explicit errors — no silently dropped handlers

### 2. A Go backend framework

A server framework designed for the same application, not a bag of handlers.

- Router with route groups and typed path parameters
- Middleware chain: logging, recovery, auth, rate limiting
- JSON request/response helpers and declarative request validation
- Cookie-based sessions and password auth (bcrypt), backed by the database
- Migrations plus a repository/query layer, PostgreSQL first
- Configuration from environment, with one consistent error model

### 3. A unified developer experience

One CLI that owns the whole loop.

- `aether dev` — bundler and Go server behind a single port, with hot reload and
  `/api` proxied to Go
- `aether build` — bundle the client and embed it into the Go binary
- `aether create` — scaffold an application from a maintained template
- No CORS configuration in development, because there is only one origin

### 4. Single-binary deployment

- `go build` produces the server with the client assets compiled in via `go:embed`
- No Node runtime, no separate static host, no two-service deploys
- Configuration lives in one `.env` file (or environment variables)

## Architecture

**Development**

```
Browser ──► aether dev (single port)
              ├─► /api/*  ──► Go server (:8080)
              └─► everything else ──► bundler (HMR)
```

**Production**

```
Browser ──► Go binary ──┬─► embedded client assets
                        ├─► /api/* handlers
                        └─► PostgreSQL
```

Rules that keep the boundary clean:

- Client and server communicate **only** over HTTP/JSON. No hidden RPC or
  compile-time bridging.
- **Go owns** routing, authentication, data access, and static file serving.
- **The client owns** rendering, navigation, and local UI state.

## Target API

**Client — TypeScript + JSX on the Aether runtime**

```tsx
import { useState } from "@aether/runtime";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) setError("Invalid credentials");
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={email} onInput={(e) => setEmail(e.target.value)} />
      <input
        type="password"
        value={password}
        onInput={(e) => setPassword(e.target.value)}
      />
      {error && <p class="error">{error}</p>}
      <button type="submit">Log in</button>
    </form>
  );
}
```

**Server — Go**

```go
func main() {
    app := aether.New(aether.Config{EnvPath: ".env"})

    app.Use(aether.Logger())
    app.Use(aether.Recover())

    app.Post("/api/login", handlers.Login)
    app.Get("/api/me", handlers.Me, aether.RequireSession())

    app.Listen(":8080")
}
```

## Design principles

1. **Explicit over magic.** Every mechanism is visible in the code you write.
2. **One deployable.** Production is a Go executable and a database.
3. **A small surface area.** Features earn their place; nothing ships "just in case."
4. **Language discipline.** TypeScript on the client, Go on the server. No
   polyglot backend, no JavaScript on the server.
5. **Learnable.** A developer should be productive in an afternoon.

## Technology

| Layer      | Choice                                                     |
| ---------- | ---------------------------------------------------------- |
| Client     | TypeScript, Aether runtime, JSX, Vite/esbuild for bundling |
| Server     | Go, `net/http` with Go 1.22+ method routing                |
| Database   | PostgreSQL via `pgx`                                       |
| Auth       | bcrypt password hashes + HTTP-only cookie sessions         |
| Tooling    | pnpm workspace, `go:embed`, GitHub Actions                 |

## What v0.1 means

Aether v0.1 is done when all of the following are true:

- [ ] `aether create myapp && cd myapp && aether dev` boots a working app
- [ ] A developer builds a login-protected page using components, props, and `useState`
- [ ] The reconciler patches the DOM on state change, with working keyed lists
- [ ] Authentication works against PostgreSQL with hashed passwords and sessions
- [ ] Route groups and middleware run in the Go server framework
- [ ] `aether build` produces one binary that runs with **no Node installed**
- [ ] The reference application is covered by runtime tests and Go tests
- [ ] CI enforces typecheck, tests, `go vet`, and a production build

## Non-goals

- **A drop-in React replacement.** No `react-dom` compatibility or ecosystem parity.
- **SSR inside Go for v1.** Aether starts as an SPA. Server rendering is a later
  exploration, and will require either an embedded JS engine or a Node sidecar.
- **Node or TypeScript backends.** The server is Go, by design.
- **GraphQL, microservices, edge runtimes.** Not now; possibly never.

## Repository layout (target)

```
packages/
  runtime/     # client runtime: createElement, reconciler, hooks
  cli/         # aether dev | build | create
  templates/   # starter applications
server/        # Go module: the framework and reference server
playground/    # reference app used to validate the framework
```

## Roadmap

The order is deliberate: the reconciler comes first because nothing else is
meaningful without it.

1. **Reconciler and hooks** — diffing, keyed lists, `useState`
2. **Components and JSX** — function components, children, event normalization
3. **Application shell** — client router, SPA fallback, data conventions
4. **Server framework** — router groups, middleware, validation, auth, migrations
5. **Toolchain** — `aether dev`, `aether build`, `go:embed` pipeline
6. **Scaffolding and docs** — `aether create`, templates, CI, documentation

## License

Not yet decided.
