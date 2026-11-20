package aether

import (
	"sort"
	"testing"
	"testing/fstest"
)

func TestMigrationNamesFindsNestedFiles(t *testing.T) {
	files := fstest.MapFS{
		"migrations/001_users.sql":    {Data: []byte("SELECT 1")},
		"migrations/002_sessions.sql": {Data: []byte("SELECT 1")},
		"nested/003_extra.sql":        {Data: []byte("SELECT 1")},
		"README.md":                   {Data: []byte("not a migration")},
	}

	names, err := migrationNames(files)

	if err != nil {
		t.Fatalf("migrationNames failed: %v", err)
	}

	sort.Strings(names)

	want := []string{
		"migrations/001_users.sql",
		"migrations/002_sessions.sql",
		"nested/003_extra.sql",
	}

	if len(names) != len(want) {
		t.Fatalf("expected %d names, got %d: %v", len(want), len(names), names)
	}

	for index := range want {
		if names[index] != want[index] {
			t.Fatalf("expected %v, got %v", want, names)
		}
	}
}
