package aether

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type testRequest struct {
	Email string `json:"email"`
}

type invalidRequest struct{}

func (invalidRequest) Validate() map[string]string {
	return map[string]string{"email": "Email is required"}
}

func TestDecodeJSONRejectsUnknownFields(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/",
		strings.NewReader(`{"email":"a@example.com","extra":true}`),
	)

	_, err := DecodeJSON[testRequest](response, request)

	if err == nil {
		t.Fatal("expected decode error")
	}

	appError, ok := err.(*Error)

	if !ok || appError.Status != http.StatusBadRequest {
		t.Fatalf("expected bad request error, got %v", err)
	}
}

func TestDecodeJSON(t *testing.T) {
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/",
		strings.NewReader(`{"email":"a@example.com"}`),
	)

	value, err := DecodeJSON[testRequest](response, request)

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if value.Email != "a@example.com" {
		t.Fatalf("unexpected email: %s", value.Email)
	}
}

func TestValidate(t *testing.T) {
	err := Validate(invalidRequest{})

	if err == nil {
		t.Fatal("expected validation error")
	}

	appError, ok := err.(*Error)

	if !ok {
		t.Fatalf("expected *Error, got %T", err)
	}

	if appError.Status != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d", appError.Status)
	}

	if appError.Fields["email"] == "" {
		t.Fatal("expected email field error")
	}
}

func TestWriteError(t *testing.T) {
	response := httptest.NewRecorder()
	WriteError(response, Unauthorized("Authentication required"))

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}

	var body ErrorResponse

	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if body.Error.Code != "unauthorized" {
		t.Fatalf("unexpected code: %s", body.Error.Code)
	}

	if body.Error.Message != "Authentication required" {
		t.Fatalf("unexpected message: %s", body.Error.Message)
	}
}

func TestWriteErrorHidesInternalErrors(t *testing.T) {
	response := httptest.NewRecorder()
	WriteError(response, testError{})

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d", response.Code)
	}

	var body ErrorResponse

	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}

	if body.Error.Message != "Internal server error" {
		t.Fatalf("unexpected message: %s", body.Error.Message)
	}
}

type testError struct{}

func (testError) Error() string {
	return "private"
}
