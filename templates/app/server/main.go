package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"__MODULE__/server/aether"
	"github.com/joho/godotenv"
)

//go:embed assets/dist/*
var clientAssets embed.FS

//go:embed migrations/*.sql
var migrationFiles embed.FS

func main() {
	_ = godotenv.Load()

	if err := run(); err != nil {
		log.Fatal(err)
	}
}

func run() error {
	ctx, cancel := signal.NotifyContext(
		context.Background(),
		os.Interrupt,
		syscall.SIGTERM,
	)
	defer cancel()

	databaseURL := aether.Env("DATABASE_URL", "")
	db, err := aether.OpenDB(ctx, databaseURL)

	if err != nil {
		return err
	}
	defer db.Close()

	if err := aether.Migrate(ctx, db, migrationFiles); err != nil {
		return err
	}

	sessions := aether.NewSessionManager(db, aether.SessionOptions{
		CookieName: aether.Env("SESSION_COOKIE", "aether_session"),
		TTL:        aether.EnvDuration("SESSION_TTL", 7*24*time.Hour),
		Secure:     aether.EnvBool("SESSION_SECURE", false),
	})

	app := aether.New()
	app.Use(
		aether.RequestID(),
		aether.Logger(),
		aether.Recover(),
	)

	if origin := aether.Env("CORS_ORIGIN", ""); origin != "" {
		app.Use(aether.CORS(origin))
	}

	app.Get("/api/health", handleHealth)
	app.Post("/api/register", handleRegister(db))
	app.Post("/api/login", handleLogin(db, sessions))
	app.Post("/api/logout", handleLogout(sessions))
	app.Get("/api/me", handleMe(db), sessions.Require)

	static, err := fs.Sub(clientAssets, "assets/dist")

	if err != nil {
		return err
	}

	server := &http.Server{
		Addr:              ":" + aether.Env("PORT", "8080"),
		Handler:           aether.SPA(app.Handler(), static),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()
		_ = server.Shutdown(shutdownCtx)
	}()

	log.Printf("Aether listening on http://localhost:%s", aether.Env("PORT", "8080"))

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
