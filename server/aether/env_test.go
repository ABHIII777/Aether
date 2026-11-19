package aether

import (
	"testing"
	"time"
)

func TestEnv(t *testing.T) {
	t.Setenv("AETHER_TEST_VALUE", "  configured  ")

	if value := Env("AETHER_TEST_VALUE", "fallback"); value != "configured" {
		t.Fatalf("unexpected value: %s", value)
	}

	if value := Env("AETHER_TEST_MISSING", "fallback"); value != "fallback" {
		t.Fatalf("unexpected fallback: %s", value)
	}
}

func TestEnvBool(t *testing.T) {
	cases := map[string]bool{
		"1":     true,
		"true":  true,
		"yes":   true,
		"on":    true,
		"0":     false,
		"false": false,
		"no":    false,
		"off":   false,
		"other": false,
	}

	for value, expected := range cases {
		t.Setenv("AETHER_TEST_BOOL", value)

		if result := EnvBool("AETHER_TEST_BOOL", false); result != expected {
			t.Fatalf("expected %v for %s, got %v", expected, value, result)
		}
	}

	t.Setenv("AETHER_TEST_BOOL", "")

	if !EnvBool("AETHER_TEST_BOOL", true) {
		t.Fatal("expected fallback true")
	}
}

func TestEnvInt(t *testing.T) {
	t.Setenv("AETHER_TEST_INT", "42")

	if value := EnvInt("AETHER_TEST_INT", 0); value != 42 {
		t.Fatalf("unexpected value: %d", value)
	}

	t.Setenv("AETHER_TEST_INT", "invalid")

	if value := EnvInt("AETHER_TEST_INT", 7); value != 7 {
		t.Fatalf("unexpected fallback: %d", value)
	}
}

func TestEnvDuration(t *testing.T) {
	t.Setenv("AETHER_TEST_DURATION", "90m")

	if value := EnvDuration("AETHER_TEST_DURATION", time.Hour); value != 90*time.Minute {
		t.Fatalf("unexpected duration: %s", value)
	}

	t.Setenv("AETHER_TEST_DURATION", "invalid")

	if value := EnvDuration("AETHER_TEST_DURATION", time.Hour); value != time.Hour {
		t.Fatalf("unexpected fallback: %s", value)
	}
}
