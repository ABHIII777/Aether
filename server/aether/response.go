package aether

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

type Error struct {
	Status  int               `json:"-"`
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
	Err     error             `json:"-"`
}

type ErrorResponse struct {
	Error ErrorBody `json:"error"`
}

type ErrorBody struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

type Validator interface {
	Validate() map[string]string
}

func (e *Error) Error() string {
	if e.Err != nil {
		return e.Message + ": " + e.Err.Error()
	}

	return e.Message
}

func (e *Error) Unwrap() error {
	return e.Err
}

func NewError(status int, code string, message string) *Error {
	return &Error{
		Status:  status,
		Code:    code,
		Message: message,
	}
}

func BadRequest(message string) *Error {
	return NewError(http.StatusBadRequest, "bad_request", message)
}

func Unauthorized(message string) *Error {
	return NewError(http.StatusUnauthorized, "unauthorized", message)
}

func Forbidden(message string) *Error {
	return NewError(http.StatusForbidden, "forbidden", message)
}

func NotFound(message string) *Error {
	return NewError(http.StatusNotFound, "not_found", message)
}

func Conflict(message string) *Error {
	return NewError(http.StatusConflict, "conflict", message)
}

func WriteJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)

	if value == nil {
		return
	}

	_ = json.NewEncoder(w).Encode(value)
}

func WriteError(w http.ResponseWriter, err error) {
	var appError *Error

	if !errors.As(err, &appError) {
		appError = NewError(http.StatusInternalServerError, "internal_error", "Internal server error")
	}

	if appError.Status == 0 {
		appError.Status = http.StatusInternalServerError
	}

	if appError.Code == "" {
		appError.Code = "error"
	}

	if appError.Message == "" {
		appError.Message = http.StatusText(appError.Status)
	}

	WriteJSON(w, appError.Status, ErrorResponse{
		Error: ErrorBody{
			Code:    appError.Code,
			Message: appError.Message,
			Fields:  appError.Fields,
		},
	})
}

func DecodeJSON[T any](w http.ResponseWriter, r *http.Request) (T, error) {
	var value T

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&value); err != nil {
		return value, BadRequest("Invalid JSON body")
	}

	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return value, BadRequest("Request body must contain a single JSON object")
	}

	return value, nil
}

func Validate(value any) error {
	validator, ok := value.(Validator)

	if !ok {
		return nil
	}

	fields := validator.Validate()

	if len(fields) == 0 {
		return nil
	}

	return &Error{
		Status:  http.StatusUnprocessableEntity,
		Code:    "validation_failed",
		Message: "Validation failed",
		Fields:  fields,
	}
}
