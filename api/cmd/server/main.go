package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"
	"slido/internal/auth"
	"slido/internal/db"
	"slido/internal/handlers"
	"slido/internal/middleware"
	"slido/internal/models"
	"slido/internal/sse"
)

func main() {
	port := getEnv("API_PORT", "8080")
	dbPath := getEnv("DB_PATH", "/data/slido.db")
	jwtSecret := getEnv("JWT_SECRET", "change-me-in-production")
	superuserUsername := getEnv("SUPERUSER_USERNAME", "admin")
	superuserPassword := getEnv("SUPERUSER_PASSWORD", "changeme")

	database, err := db.New(dbPath)
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	if err := ensureSuperuser(database, superuserUsername, superuserPassword); err != nil {
		log.Fatalf("failed to ensure superuser: %v", err)
	}

	broker := sse.NewBroker()
	jwtAuth := auth.NewJWT(jwtSecret)
	h := handlers.New(database, broker, jwtAuth)
	mw := middleware.New(jwtAuth)

	r := chi.NewRouter()
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Post("/api/auth/login", h.Login)
	r.With(mw.RequireAuth).Get("/api/auth/me", h.Me)

	r.Get("/api/events/{code}", h.GetEvent)
	r.Get("/api/events/{code}/questions", h.GetApprovedQuestions)
	r.Post("/api/events/{code}/questions", h.SubmitQuestion)
	r.Post("/api/events/{code}/questions/{qid}/vote", h.VoteQuestion)
	r.Get("/api/events/{code}/stream", h.AudienceStream)

	r.Group(func(r chi.Router) {
		r.Use(mw.RequireAuth)
		r.Get("/api/mod/events", h.ListEvents)
		r.Post("/api/mod/events", h.CreateEvent)
		r.Get("/api/mod/events/{id}", h.GetEventByID)
		r.Put("/api/mod/events/{id}", h.UpdateEvent)
		r.Delete("/api/mod/events/{id}", h.DeleteEvent)
		r.Get("/api/mod/events/{id}/qr", h.GetQRCode)
		r.Get("/api/mod/events/{id}/questions/pending", h.GetPendingQuestions)
		r.Get("/api/mod/events/{id}/stream", h.ModStream)
		r.Put("/api/mod/questions/{qid}/approve", h.ApproveQuestion)
		r.Put("/api/mod/questions/{qid}/reject", h.RejectQuestion)
		r.Put("/api/mod/questions/{qid}/answered", h.AnswerQuestion)
	})

	r.Group(func(r chi.Router) {
		r.Use(mw.RequireAuth)
		r.Use(mw.RequireSuperuser)
		r.Get("/api/admin/users", h.ListUsers)
		r.Post("/api/admin/users", h.CreateUser)
		r.Delete("/api/admin/users/{id}", h.DeleteUser)
	})

	log.Printf("Server starting on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ensureSuperuser(database *db.DB, username, password string) error {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	exists, err := database.UserExistsByUsername(username)
	if err != nil {
		return err
	}
	if exists {
		return database.UpdateUserPassword(username, string(hash))
	}
	_, err = database.CreateUser(username, string(hash), string(models.RoleSuperuser))
	return err
}
