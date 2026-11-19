package aether

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"time"
)

var ErrNoSession = errors.New("no active session")

const userIDKey contextKey = "user_id"

type SessionManager struct {
	db         *sql.DB
	cookieName string
	ttl        time.Duration
	secure     bool
}

type SessionOptions struct {
	CookieName string
	TTL        time.Duration
	Secure     bool
}

func NewSessionManager(db *sql.DB, options SessionOptions) *SessionManager {
	cookieName := options.CookieName

	if cookieName == "" {
		cookieName = "aether_session"
	}

	ttl := options.TTL

	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}

	return &SessionManager{
		db:         db,
		cookieName: cookieName,
		ttl:        ttl,
		secure:     options.Secure,
	}
}

func (m *SessionManager) Create(ctx context.Context, userID string) (string, error) {
	token, err := sessionToken()

	if err != nil {
		return "", err
	}

	expiresAt := time.Now().Add(m.ttl)

	if _, err := m.db.ExecContext(
		ctx,
		`
			INSERT INTO sessions (user_id, token_hash, expires_at)
			VALUES ($1, $2, $3)
		`,
		userID,
		hashToken(token),
		expiresAt,
	); err != nil {
		return "", err
	}

	return token, nil
}

func (m *SessionManager) SetCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(m.ttl.Seconds()),
	})
}

func (m *SessionManager) ClearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     m.cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   m.secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func (m *SessionManager) Destroy(ctx context.Context, w http.ResponseWriter, r *http.Request) error {
	token := m.token(r)

	if token != "" {
		if _, err := m.db.ExecContext(
			ctx,
			"DELETE FROM sessions WHERE token_hash = $1",
			hashToken(token),
		); err != nil {
			return err
		}
	}

	m.ClearCookie(w)
	return nil
}

func (m *SessionManager) UserID(ctx context.Context, r *http.Request) (string, error) {
	token := m.token(r)

	if token == "" {
		return "", ErrNoSession
	}

	var userID string
	var expiresAt time.Time

	err := m.db.QueryRowContext(
		ctx,
		`
			SELECT user_id::text, expires_at
			FROM sessions
			WHERE token_hash = $1
		`,
		hashToken(token),
	).Scan(&userID, &expiresAt)

	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNoSession
	}

	if err != nil {
		return "", err
	}

	if time.Now().After(expiresAt) {
		_, _ = m.db.ExecContext(ctx, "DELETE FROM sessions WHERE token_hash = $1", hashToken(token))
		return "", ErrNoSession
	}

	return userID, nil
}

func (m *SessionManager) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		userID, err := m.UserID(r.Context(), r)

		if errors.Is(err, ErrNoSession) {
			WriteError(w, Unauthorized("Authentication required"))
			return
		}

		if err != nil {
			WriteError(w, err)
			return
		}

		ctx := context.WithValue(r.Context(), userIDKey, userID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserIDFromContext(ctx context.Context) (string, bool) {
	userID, ok := ctx.Value(userIDKey).(string)
	return userID, ok
}

func (m *SessionManager) token(r *http.Request) string {
	cookie, err := r.Cookie(m.cookieName)

	if err != nil || cookie.Value == "" {
		return ""
	}

	return cookie.Value
}

func sessionToken() (string, error) {
	value := make([]byte, 32)

	if _, err := rand.Read(value); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(value), nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
