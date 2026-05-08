package handlers

import (
	"encoding/json"
	"net/http"

	"slido/internal/auth"
	"slido/internal/db"
	"slido/internal/sse"
)

type Handler struct {
	db     *db.DB
	broker *sse.Broker
	jwt    *auth.JWT
}

func New(database *db.DB, broker *sse.Broker, jwt *auth.JWT) *Handler {
	return &Handler{db: database, broker: broker, jwt: jwt}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
