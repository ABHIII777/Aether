package main

import (
	"encoding/json"
	"log"
	"net/http"
)

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type APIResponse struct {
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, data APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func main() {
	mux := http.NewServeMux()

	db, err := OpenDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	log.Println("Connected to PostgreSQL")

	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, APIResponse{
			Message: "Aether API is running",
		})
	})

	mux.HandleFunc("POST /api/login", func(w http.ResponseWriter, r *http.Request) {
		var request LoginRequest

		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, APIResponse{
				Message: "Invalid JSON request",
			})
			return
		}

		if request.Email == "" || request.Password == "" {
			writeJSON(w, http.StatusBadRequest, APIResponse{
				Message: "Email and password are required",
			})
			return
		}

		writeJSON(w, http.StatusNotImplemented, APIResponse{
			Message: "Authentication is not implemented yet",
		})
	})

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:4173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		mux.ServeHTTP(w, r)
	})

	log.Println("Aether API listening on http://localhost:8080")

	if err := http.ListenAndServe(":8080", handler); err != nil {
		log.Fatal(err)
	}
}
