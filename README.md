# Aether

**A full-stack framework for React-style interfaces and Go backends.**

Aether pairs a small first-party component runtime in TypeScript with a Go
server framework and one CLI that owns development, builds, and deployment.
Production is a single Go binary with the client embedded.

```bash
aether create myapp
cd myapp
aether dev
aether build
./bin/myapp
```

## What v0.1 includes

- Function components, props, children, and fragments
- A JSX runtime with automatic `jsxImportSource: "@aether/core"`
- `useState` and `useEffect` with cleanup
- Keyed reconciliation that patches the DOM in place
- `unmount` plus component and effect teardown
- A history router with `Router`, `Link`, `navigate`, `useLocation`,
  `useNavigate`, and `matchRoute`
- Route groups and typed path parameters in Go
- Middleware chain: request IDs, logging, recovery, CORS, rate limiting
- JSON decoding, validation, and one consistent error model
- PostgreSQL-backed cookie sessions and bcrypt password auth
- SQL migrations with a tracked `schema_migrations` table
- `aether dev`, `aether build`, and `aether create`
- Live reload, `/api` proxying, and a single-origin development server
- Client bundling into one Go binary with `go:embed`
- Runtime tests, Go tests, and CI

## Requirements

- Node.js 22 or newer
- pnpm 11
- Go 1.26 or newer
- PostgreSQL for authentication

A database is only required when running the server. Client runtime tests do not
need PostgreSQL.

## Repository layout

```text
packages/
  core/       client runtime, JSX runtime, router, and runtime tests
  cli/        aether dev, aether build, and aether create
templates/
  app/        starter application copied by aether create
server/       Go module: framework, reference server, migrations
aether.config.json
```

## Development

Install dependencies and build every workspace package:

```bash
pnpm install
pnpm build
```

Build the reference application and its binary:

```bash
pnpm build:app
./bin/aether
```

Start the reference application:

```bash
pnpm dev
```

`aether dev` bundles the client with esbuild, serves it on
`http://localhost:3000`, proxies `/api/*` to the Go server on port `8080`, and
reloads the browser when the client changes. Go and SQL changes restart the API
process automatically.

Start PostgreSQL for the reference server:

```bash
docker compose -f packages/core/infra/postgres/docker-compose.yaml up -d
```

Copy `server/.env` settings or provide environment variables directly. The
reference server expects:

```text
DATABASE_URL=postgres://aether:aether_dev_password@localhost:5432/aether?sslmode=disable
PORT=8080
SESSION_COOKIE=aether_session
SESSION_TTL=168h
SESSION_SECURE=false
CORS_ORIGIN=
```

## Creating an application

```bash
pnpm exec aether create myapp
cd myapp
pnpm install
pnpm dev
```

The generated app contains:

```text
client/       TypeScript, JSX, and the application shell
server/       Go entrypoint, handlers, framework, and migrations
packages/     Local copies of @aether/core and @aether/cli
aether.config.json
```

## Building a single binary

```bash
pnpm build
```

`aether build` bundles and minifies the client into the directory named by
`outDir`, copies `client/index.html`, runs `go build`, and writes the executable
named by `binary`. The Go server embeds those assets with `//go:embed`, so the
result runs without Node installed.

```bash
./bin/myapp
```

## Client API

### Components and state

```tsx
import { render, useState } from "@aether/core";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <button onClick={() => setCount((value) => value + 1)}>
      Count: {count}
    </button>
  );
}

render(<Counter />, document.getElementById("root")!);
```

State changes schedule a root re-render. Existing DOM nodes are patched instead
of replaced, and keyed children keep their identity and state when reordered.

### Effects

```tsx
import { useEffect, useState } from "@aether/core";

function Account() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => response.json())
      .then((account) => {
        if (active) {
          setEmail(account.email);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return <p>{email ?? "Loading..."}</p>;
}
```

Effects run after the DOM is committed. Returning a function registers cleanup,
which runs before the next effect execution and when the component unmounts.

### Routing

```tsx
import { Link, Router, navigate } from "@aether/core";

const routes = [
  { path: "/", component: HomePage },
  { path: "/users/:id", component: UserPage },
  { path: "/files/*", component: FilesPage },
];

function App() {
  return <Router routes={routes} fallback={<NotFound />} />;
}

navigate("/users/42");
navigate("/", { replace: true });

<Link to="/users/42">Open user</Link>;
```

The router uses the History API and listens for `popstate`. Route parameters are
passed as props to the page component. Wildcard routes receive a `*` prop.

### Mounting

```ts
import { render, unmount } from "@aether/core";

render(<App />, container);
unmount(container);
```

`unmount` removes the rendered tree and runs any registered effect cleanup.

## Go API

Create a server, register routes, and wrap the application in middleware:

```go
package main

import (
	"net/http"

	"example.com/app/server/aether"
)

func main() {
	app := aether.New()

	app.Use(
		aether.RequestID(),
		aether.Logger(),
		aether.Recover(),
	)

	app.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		aether.WriteJSON(w, http.StatusOK, map[string]string{
			"status": "ok",
		})
	})

	api := app.Group("/api")
	api.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := aether.Param(r, "id")
		aether.WriteJSON(w, http.StatusOK, map[string]string{"id": id})
	})

	http.ListenAndServe(":8080", app.Handler())
}
```

### Middleware

Middleware can be attached to the application, a group, or a single route.
Order is application first, then group, then route, then handler.

```go
app.Use(aether.RequestID(), aether.Logger(), aether.Recover())

api := app.Group("/api", aether.RateLimit(60, time.Minute))
api.Get("/me", handleMe, sessions.Require)
```

### Validation and errors

```go
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (r LoginRequest) Validate() map[string]string {
	fields := map[string]string{}

	if r.Email == "" {
		fields["email"] = "Email is required"
	}

	if r.Password == "" {
		fields["password"] = "Password is required"
	}

	return fields
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	request, err := aether.DecodeJSON[LoginRequest](w, r)

	if err != nil {
		aether.WriteError(w, err)
		return
	}

	if err := aether.Validate(request); err != nil {
		aether.WriteError(w, err)
		return
	}
}
```

Errors have one JSON shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Validation failed",
    "fields": {
      "email": "Email is required"
    }
  }
}
```

Unexpected errors are replaced with a generic 500 response.

### Sessions and authentication

```go
sessions := aether.NewSessionManager(db, aether.SessionOptions{
	CookieName: aether.Env("SESSION_COOKIE", "aether_session"),
	TTL:        aether.EnvDuration("SESSION_TTL", 7*24*time.Hour),
	Secure:     aether.EnvBool("SESSION_SECURE", false),
})

token, err := sessions.Create(r.Context(), userID)
sessions.SetCookie(w, token)

app.Get("/api/me", handleMe, sessions.Require)
```

Sessions are stored as SHA-256 token hashes, delivered in HTTP-only cookies, and
checked against their expiry on every request. `sessions.Require` places the user
ID in the request context. Read it with `aether.UserIDFromContext`.

### Database and migrations

```go
db, err := aether.OpenDB(ctx, aether.Env("DATABASE_URL", ""))
defer db.Close()

if err := aether.Migrate(ctx, db, migrationFiles); err != nil {
	return err
}
```

Migrations are embedded with `//go:embed migrations/*.sql`. Applied files are
recorded in `schema_migrations`. Use `aether.Transaction` for multi-statement
writes:

```go
err := aether.Transaction(ctx, db, func(tx *sql.Tx) error {
	_, err := tx.ExecContext(ctx, "UPDATE accounts SET plan = $1 WHERE id = $2", "pro", id)
	return err
})
```

### Serving the SPA

```go
static, err := fs.Sub(clientAssets, "assets/dist")

if err != nil {
	return err
}

handler := aether.SPA(app.Handler(), static)
```

`aether.SPA` sends `/api` and `/api/*` to the Go handler. Existing files are
served directly. Other GET requests fall back to `index.html` so client-side
routes work on refresh.

### Embedded assets

```go
//go:embed assets/dist/*
var clientAssets embed.FS
```

The build writes the client bundle and `index.html` into `server/assets/dist`
before invoking `go build`.

## Configuration

`aether.config.json` controls the CLI:

```json
{
  "name": "myapp",
  "clientEntry": "client/main.tsx",
  "clientIndex": "client/index.html",
  "publicDir": null,
  "serverDir": "server",
  "devPort": 3000,
  "apiPort": 8080,
  "outDir": "server/assets/dist",
  "binary": "bin/myapp"
}
```

CLI flags override ports:

```bash
aether dev --port 4000 --api-port 9000
```

Server configuration comes from environment variables. `aether.Env`,
`aether.EnvBool`, `aether.EnvInt`, and `aether.EnvDuration` provide defaults for
missing or invalid values.

## Testing

```bash
pnpm test
pnpm typecheck

cd server
go test ./...
go vet ./...
```

Client tests use a small fake DOM and cover rendering, patching, keyed lists,
events, controlled inputs, components, hooks, fragments, unmount, and routing.
Go tests cover routing, groups, middleware order, JSON helpers, validation,
errors, rate limiting, CORS, sessions, migrations splitting, and SPA fallback.

## Architecture

Development:

```text
Browser -> aether dev (single port)
             |-> /api/*       -> Go server (:8080)
             |-> /__aether_reload -> live reload SSE
             |-> everything else  -> esbuild output
```

Production:

```text
Browser -> Go binary
             |-> embedded client assets
             |-> /api/* handlers
             |-> PostgreSQL
```

Client and server communicate only over HTTP and JSON. Go owns routing,
authentication, data access, migrations, and static serving. The client owns
rendering, navigation, and local UI state.

## Design principles

1. Explicit over magic.
2. One deployable: a Go executable and a database.
3. A small surface area.
4. TypeScript on the client, Go on the server.
5. Learnable in an afternoon.

## Non-goals

- Drop-in React compatibility or ecosystem parity
- Server rendering inside Go for v0.1
- Node or TypeScript backends
- GraphQL, microservices, and edge runtimes

## License

Not yet decided.
