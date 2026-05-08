package handlers

import (
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	qrcode "github.com/skip2/go-qrcode"
	"slido/internal/middleware"
	"slido/internal/models"
)

func (h *Handler) GetEvent(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	event, err := h.db.GetEventByCode(code)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	writeJSON(w, http.StatusOK, event)
}

func (h *Handler) ListEvents(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	var events []models.Event
	var err error
	if user.Role == models.RoleSuperuser {
		events, err = h.db.ListAllEvents()
	} else {
		events, err = h.db.ListEventsByCreator(user.ID)
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list events")
		return
	}
	writeJSON(w, http.StatusOK, events)
}

type createEventRequest struct {
	Name string `json:"name"`
}

func (h *Handler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	var req createEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	code, err := h.generateUniqueCode()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate code")
		return
	}

	event, err := h.db.CreateEvent(req.Name, code, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create event")
		return
	}
	writeJSON(w, http.StatusCreated, event)
}

func (h *Handler) GetEventByID(w http.ResponseWriter, r *http.Request) {
	event, ok := h.requireEventAccess(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, event)
}

type updateEventRequest struct {
	Name   string `json:"name"`
	Active bool   `json:"active"`
}

func (h *Handler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	event, ok := h.requireEventAccess(w, r)
	if !ok {
		return
	}
	var req updateEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.Name == "" {
		req.Name = event.Name
	}
	if err := h.db.UpdateEvent(event.ID, req.Name, req.Active); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update event")
		return
	}
	event.Name = req.Name
	event.Active = req.Active
	writeJSON(w, http.StatusOK, event)
}

func (h *Handler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	event, ok := h.requireEventAccess(w, r)
	if !ok {
		return
	}
	if err := h.db.DeleteEvent(event.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete event")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetQRCode(w http.ResponseWriter, r *http.Request) {
	event, ok := h.requireEventAccess(w, r)
	if !ok {
		return
	}
	mainDomain := os.Getenv("MAIN_DOMAIN")
	joinURL := fmt.Sprintf("https://%s/event/?code=%s", mainDomain, event.Code)
	png, err := qrcode.Encode(joinURL, qrcode.Medium, 256)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate QR code")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Write(png)
}

func (h *Handler) requireEventAccess(w http.ResponseWriter, r *http.Request) (*models.Event, bool) {
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid event id")
		return nil, false
	}
	event, err := h.db.GetEventByID(id)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return nil, false
	}
	user := middleware.GetUser(r)
	if user.Role != models.RoleSuperuser && event.CreatedBy != user.ID {
		writeError(w, http.StatusForbidden, "forbidden")
		return nil, false
	}
	return event, true
}

func (h *Handler) generateUniqueCode() (string, error) {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	for i := 0; i < 20; i++ {
		b := make([]byte, 6)
		for j := range b {
			b[j] = chars[rand.Intn(len(chars))]
		}
		code := string(b)
		exists, err := h.db.EventCodeExists(code)
		if err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", fmt.Errorf("could not generate unique code")
}
