package main

import (
	"database/sql"
	"errors"
	"net/http"
	"strings"

	"github.com/ABHIII777/aether/server/aether"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/crypto/bcrypt"
)

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type messageResponse struct {
	Message string `json:"message"`
}

type userResponse struct {
	Message string `json:"message"`
	ID      string `json:"id"`
}

type accountResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

func (r loginRequest) Validate() map[string]string {
	fields := make(map[string]string)

	email := strings.TrimSpace(r.Email)

	if email == "" {
		fields["email"] = "Email is required"
	} else if !strings.Contains(email, "@") {
		fields["email"] = "Email is invalid"
	}

	if r.Password == "" {
		fields["password"] = "Password is required"
	}

	return fields
}

func (r registerRequest) Validate() map[string]string {
	fields := loginRequest{
		Email:    r.Email,
		Password: r.Password,
	}.Validate()

	if len(r.Password) < 8 {
		fields["password"] = "Password must be at least 8 characters"
	}

	return fields
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	aether.WriteJSON(w, http.StatusOK, messageResponse{
		Message: "Aether API is running",
	})
}

func handleRegister(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		request, err := aether.DecodeJSON[registerRequest](w, r)

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		if err := aether.Validate(request); err != nil {
			aether.WriteError(w, err)
			return
		}

		hash, err := bcrypt.GenerateFromPassword(
			[]byte(request.Password),
			bcrypt.DefaultCost,
		)

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		var userID string

		err = db.QueryRowContext(
			r.Context(),
			`
				INSERT INTO users (email, password)
				VALUES (lower($1), $2)
				RETURNING id::text
			`,
			strings.TrimSpace(request.Email),
			string(hash),
		).Scan(&userID)

		if err != nil {
			var pgError *pgconn.PgError

			if errors.As(err, &pgError) && pgError.Code == "23505" {
				aether.WriteError(w, aether.Conflict("Email is already registered"))
				return
			}

			aether.WriteError(w, err)
			return
		}

		aether.WriteJSON(w, http.StatusCreated, userResponse{
			Message: "User created successfully",
			ID:      userID,
		})
	}
}

func handleLogin(db *sql.DB, sessions *aether.SessionManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		request, err := aether.DecodeJSON[loginRequest](w, r)

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		if err := aether.Validate(request); err != nil {
			aether.WriteError(w, err)
			return
		}

		var userID string
		var hash string

		err = db.QueryRowContext(
			r.Context(),
			`
				SELECT id::text, password
				FROM users
				WHERE lower(email) = lower($1)
			`,
			strings.TrimSpace(request.Email),
		).Scan(&userID, &hash)

		if errors.Is(err, sql.ErrNoRows) {
			aether.WriteError(w, aether.Unauthorized("Invalid email or password"))
			return
		}

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(request.Password)) != nil {
			aether.WriteError(w, aether.Unauthorized("Invalid email or password"))
			return
		}

		token, err := sessions.Create(r.Context(), userID)

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		sessions.SetCookie(w, token)
		aether.WriteJSON(w, http.StatusOK, userResponse{
			Message: "Logged in",
			ID:      userID,
		})
	}
}

func handleLogout(sessions *aether.SessionManager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := sessions.Destroy(r.Context(), w, r); err != nil {
			aether.WriteError(w, err)
			return
		}

		aether.WriteJSON(w, http.StatusOK, messageResponse{
			Message: "Logged out",
		})
	}
}

func handleMe(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, ok := aether.UserIDFromContext(r.Context())

		if !ok {
			aether.WriteError(w, aether.Unauthorized("Authentication required"))
			return
		}

		var email string

		err := db.QueryRowContext(
			r.Context(),
			"SELECT email FROM users WHERE id = $1",
			userID,
		).Scan(&email)

		if errors.Is(err, sql.ErrNoRows) {
			aether.WriteError(w, aether.Unauthorized("Authentication required"))
			return
		}

		if err != nil {
			aether.WriteError(w, err)
			return
		}

		aether.WriteJSON(w, http.StatusOK, accountResponse{
			ID:    userID,
			Email: email,
		})
	}
}
