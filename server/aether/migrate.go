package aether

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

func Migrate(ctx context.Context, db *sql.DB, files fs.FS) error {
	if _, err := db.ExecContext(ctx, `
		CREATE TABLE IF NOT EXISTS schema_migrations (
			name text PRIMARY KEY,
			applied_at timestamptz NOT NULL DEFAULT now()
		)
	`); err != nil {
		return fmt.Errorf("create migrations table: %w", err)
	}

	names, err := fs.Glob(files, "*.sql")

	if err != nil {
		return fmt.Errorf("list migrations: %w", err)
	}

	sort.Strings(names)

	for _, name := range names {
		var applied bool

		if err := db.QueryRowContext(
			ctx,
			"SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE name = $1)",
			name,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", name, err)
		}

		if applied {
			continue
		}

		content, err := fs.ReadFile(files, name)

		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}

		tx, err := db.BeginTx(ctx, nil)

		if err != nil {
			return fmt.Errorf("begin migration %s: %w", name, err)
		}

		for _, statement := range statements(string(content)) {
			if _, err := tx.ExecContext(ctx, statement); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("run migration %s: %w", name, err)
			}
		}

		if _, err := tx.ExecContext(
			ctx,
			"INSERT INTO schema_migrations (name) VALUES ($1)",
			name,
		); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("record migration %s: %w", name, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", name, err)
		}
	}

	return nil
}

func statements(content string) []string {
	parts := strings.Split(content, ";")
	result := make([]string, 0, len(parts))

	for _, part := range parts {
		statement := strings.TrimSpace(part)

		if statement != "" {
			result = append(result, statement)
		}
	}

	return result
}
