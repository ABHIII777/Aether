package aether

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type contextKey string

const requestIDKey contextKey = "request_id"

type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(status int) {
	if w.status != 0 {
		return
	}

	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusWriter) Write(data []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(http.StatusOK)
	}

	written, err := w.ResponseWriter.Write(data)
	w.bytes += written
	return written, err
}

func (w *statusWriter) Unwrap() http.ResponseWriter {
	return w.ResponseWriter
}

func Logger() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			writer := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(writer, r)

			status := writer.status
			if status == 0 {
				status = http.StatusOK
			}

			requestID := RequestIDFrom(r.Context())
			log.Printf(
				"method=%s path=%s status=%d bytes=%d duration=%s request_id=%s",
				r.Method,
				r.URL.Path,
				status,
				writer.bytes,
				time.Since(start).Round(time.Millisecond),
				requestID,
			)
		})
	}
}

func Recover() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if recovered := recover(); recovered != nil {
					log.Printf("panic: %v", recovered)
					WriteError(w, NewError(http.StatusInternalServerError, "internal_error", "Internal server error"))
				}
			}()

			next.ServeHTTP(w, r)
		})
	}
}

func RequestID() Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := r.Header.Get("X-Request-ID")

			if id == "" {
				id = newRequestID()
			}

			w.Header().Set("X-Request-ID", id)
			ctx := context.WithValue(r.Context(), requestIDKey, id)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

func RateLimit(limit int, window time.Duration) Middleware {
	type bucket struct {
		count int
		reset time.Time
	}

	var mutex sync.Mutex
	buckets := make(map[string]*bucket)

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			now := time.Now()
			key := clientIP(r)

			mutex.Lock()

			if len(buckets) > 1024 {
				for address, value := range buckets {
					if now.After(value.reset) {
						delete(buckets, address)
					}
				}
			}

			value := buckets[key]

			if value == nil || now.After(value.reset) {
				value = &bucket{reset: now.Add(window)}
				buckets[key] = value
			}

			value.count++
			allowed := value.count <= limit
			retryAfter := int(time.Until(value.reset).Seconds())
			mutex.Unlock()

			if !allowed {
				if retryAfter < 1 {
					retryAfter = 1
				}

				w.Header().Set("Retry-After", strconv.Itoa(retryAfter))
				WriteError(w, NewError(http.StatusTooManyRequests, "rate_limited", "Too many requests"))
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func CORS(allowedOrigin string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")

			if allowedOrigin == "*" || origin == allowedOrigin {
				w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
			}

			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)

	if err == nil {
		return host
	}

	return r.RemoteAddr
}

func newRequestID() string {
	value := make([]byte, 16)

	if _, err := rand.Read(value); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 16)
	}

	return hex.EncodeToString(value)
}
