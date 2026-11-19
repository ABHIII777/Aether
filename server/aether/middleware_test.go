package aether

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRecoverMiddleware(t *testing.T) {
	handler := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}), []Middleware{Recover()})

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", response.Code)
	}
}

func TestRateLimitMiddleware(t *testing.T) {
	handler := chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}), []Middleware{RateLimit(2, time.Minute)})

	first := httptest.NewRecorder()
	handler.ServeHTTP(first, httptest.NewRequest(http.MethodGet, "/", nil))

	second := httptest.NewRecorder()
	handler.ServeHTTP(second, httptest.NewRequest(http.MethodGet, "/", nil))

	third := httptest.NewRecorder()
	handler.ServeHTTP(third, httptest.NewRequest(http.MethodGet, "/", nil))

	if first.Code != http.StatusNoContent || second.Code != http.StatusNoContent {
		t.Fatal("expected first two requests to succeed")
	}

	if third.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429, got %d", third.Code)
	}
}

func TestCORSMiddleware(t *testing.T) {
	handler := chain(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}), []Middleware{CORS("http://localhost:3000")})

	request := httptest.NewRequest(http.MethodOptions, "/", nil)
	request.Header.Set("Origin", "http://localhost:3000")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", response.Code)
	}

	if response.Header().Get("Access-Control-Allow-Origin") != "http://localhost:3000" {
		t.Fatal("expected allow origin header")
	}
}
