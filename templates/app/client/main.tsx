import {
  Link,
  Router,
  navigate,
  render,
  useEffect,
  useState,
} from "@aether/core";

type Account = {
  id: string;
  email: string;
};

type ErrorBody = {
  error?: {
    message?: string;
  };
};

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = (await response.json()) as ErrorBody;
      setError(body.error?.message ?? "Unable to log in");
      return;
    }

    navigate("/app");
  }

  return (
    <main class="app">
      <section class="card stack">
        <div>
          <p class="muted">Aether reference application</p>
          <h1>Log in</h1>
        </div>

        <form class="stack" onSubmit={handleSubmit}>
          <label for="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            value={email}
            required
            onInput={(event: Event) =>
              setEmail((event.target as HTMLInputElement).value)
            }
          />

          <label for="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            value={password}
            required
            onInput={(event: Event) =>
              setPassword((event.target as HTMLInputElement).value)
            }
          />

          {error ? <p class="error">{error}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? "Logging in..." : "Log in"}
          </button>
        </form>
      </section>
    </main>
  );
}

function DashboardPage() {
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then(async (response) => {
        if (!response.ok) {
          navigate("/", { replace: true });
          return;
        }

        const body = (await response.json()) as Account;

        if (active) {
          setAccount(body);
        }
      })
      .catch(() => {
        if (active) {
          setError("Unable to load your account");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    navigate("/", { replace: true });
  }

  if (error) {
    return (
      <main class="app">
        <section class="card stack">
          <p class="error">{error}</p>
          <Link to="/">Back to login</Link>
        </section>
      </main>
    );
  }

  if (!account) {
    return (
      <main class="app">
        <p class="muted">Loading your account...</p>
      </main>
    );
  }

  const features = [
    "Function components",
    "useState",
    "useEffect",
    "Keyed reconciliation",
    "Go sessions",
  ];

  return (
    <main class="app">
      <section class="card stack">
        <div class="row">
          <div>
            <p class="muted">Signed in as</p>
            <h1>{account.email}</h1>
          </div>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>

        <p>
          This page is protected by a PostgreSQL-backed session cookie issued by
          the Go server.
        </p>

        <ul>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function NotFound() {
  return (
    <main class="app">
      <section class="card stack">
        <h1>Not found</h1>
        <Link to="/">Return home</Link>
      </section>
    </main>
  );
}

const routes = [
  { path: "/", component: LoginPage },
  { path: "/app", component: DashboardPage },
];

function App() {
  return <Router routes={routes} fallback={<NotFound />} />;
}

const root = document.getElementById("root");

if (!root) {
  throw new Error("Aether could not find the root element");
}

render(<App />, root);
