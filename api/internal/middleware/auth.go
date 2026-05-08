package middleware

import (
	"context"
	"net/http"
	"strings"

	"slido/internal/auth"
	"slido/internal/models"
)

type contextKey string

const userContextKey contextKey = "user"

type Middleware struct {
	jwt *auth.JWT
}

func New(jwt *auth.JWT) *Middleware {
	return &Middleware{jwt: jwt}
}

func (m *Middleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenStr := extractToken(r)
		if tokenStr == "" {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		claims, err := m.jwt.Parse(tokenStr)
		if err != nil {
			http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
			return
		}
		user := &models.User{
			ID:       claims.UserID,
			Username: claims.Username,
			Role:     models.Role(claims.Role),
		}
		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (m *Middleware) RequireSuperuser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUser(r)
		if user == nil || user.Role != models.RoleSuperuser {
			http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func extractToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimPrefix(header, "Bearer ")
	}
	return r.URL.Query().Get("token")
}

func GetUser(r *http.Request) *models.User {
	if u, ok := r.Context().Value(userContextKey).(*models.User); ok {
		return u
	}
	return nil
}
