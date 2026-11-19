package aether

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRouteParamsAndGroups(t *testing.T) {
	app := New()
	app.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	api := app.Group("/api")
	api.Get("/users/{id}", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(Param(r, "id")))
	})

	response := httptest.NewRecorder()
	app.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/users/42", nil))

	if response.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", response.Code)
	}

	if response.Body.String() != "42" {
		t.Fatalf("expected param 42, got %s", response.Body.String())
	}
}

func TestMiddlewareOrder(t *testing.T) {
	app := New()
	var order []string

	middleware := func(name string) Middleware {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}

	app.Use(middleware("app"))
	group := app.Group("/api", middleware("group"))
	group.Get("/test", func(http.ResponseWriter, *http.Request) {
		order = append(order, "handler")
	}, middleware("route"))

	app.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/test", nil))

	expected := []string{"app", "group", "route", "handler"}

	if len(order) != len(expected) {
		t.Fatalf("expected %d middleware calls, got %d", len(expected), len(order))
	}

	for index := range expected {
		if order[index] != expected[index] {
			t.Fatalf("expected %v, got %v", expected, order)
		}
	}
}

func TestJoinPattern(t *testing.T) {
	cases := map[string]string{
		joinPattern("", "/health"):       "/health",
		joinPattern("/api", "/users"):    "/api/users",
		joinPattern("/api/", "/users"):   "/api/users",
		joinPattern("/api", "/"):         "/api",
		joinPattern("/api", ""):          "/api",
		joinPattern("/api", "/v1/users"): "/api/v1/users",
		joinPattern("/", "/"):            "/",
	}

	for actual, expected := range cases {
		if actual != expected {
			t.Fatalf("expected %s, got %s", expected, actual)
		}
	}
}
