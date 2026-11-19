package aether

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestStatements(t *testing.T) {
	result := statements("SELECT 1; SELECT 2;\n\n")

	if len(result) != 2 {
		t.Fatalf("expected 2 statements, got %d", len(result))
	}

	if result[0] != "SELECT 1" || result[1] != "SELECT 2" {
		t.Fatalf("unexpected statements: %v", result)
	}
}

func TestSessionCookieRoundTrip(t *testing.T) {
	sessions := NewSessionManager(nil, SessionOptions{
		CookieName: "test_session",
		TTL:        time.Hour,
	})
	response := httptest.NewRecorder()
	sessions.SetCookie(response, "token")

	cookies := response.Result().Cookies()

	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}

	request := httptest.NewRequest(http.MethodGet, "/", nil)
	request.AddCookie(cookies[0])

	if sessions.token(request) != "token" {
		t.Fatalf("unexpected token: %s", sessions.token(request))
	}

	if len(hashToken("token")) != 64 {
		t.Fatal("expected sha256 hex hash")
	}
}

func TestSessionClearCookie(t *testing.T) {
	sessions := NewSessionManager(nil, SessionOptions{})
	response := httptest.NewRecorder()
	sessions.ClearCookie(response)

	cookies := response.Result().Cookies()

	if len(cookies) != 1 {
		t.Fatalf("expected one cookie, got %d", len(cookies))
	}

	if cookies[0].MaxAge >= 0 {
		t.Fatal("expected expired cookie")
	}
}

func TestValidationErrorJSON(t *testing.T) {
	response := httptest.NewRecorder()
	WriteError(response, &Error{
		Status:  http.StatusUnprocessableEntity,
		Code:    "validation_failed",
		Message: "Validation failed",
		Fields:  map[string]string{"email": "required"},
	})

	body := response.Body.String()

	if !strings.Contains(body, `"fields":{"email":"required"}`) {
		t.Fatalf("unexpected body: %s", body)
	}
}
