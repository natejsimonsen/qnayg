package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"slido/internal/filter"
	"slido/internal/middleware"
	"slido/internal/models"
)

type submitQuestionRequest struct {
	Text       string `json:"text"`
	AuthorName string `json:"author_name"`
}

func (h *Handler) SubmitQuestion(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	event, err := h.db.GetEventByCode(code)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if !event.Active {
		writeError(w, http.StatusForbidden, "event is not accepting questions")
		return
	}

	var req submitQuestionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if len(req.Text) < 5 {
		writeError(w, http.StatusBadRequest, "question is too short")
		return
	}
	if len(req.Text) > 500 {
		writeError(w, http.StatusBadRequest, "question is too long (max 500 characters)")
		return
	}
	if filter.ContainsBannedWord(req.Text) {
		writeError(w, http.StatusBadRequest, "your question contains inappropriate language, please rephrase")
		return
	}

	authorName := req.AuthorName
	if authorName == "" {
		authorName = "Anonymous"
	}

	question, err := h.db.CreateQuestion(event.ID, req.Text, authorName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to submit question")
		return
	}

	// Notify moderator via SSE
	data, _ := json.Marshal(map[string]interface{}{
		"type":     "question_pending",
		"question": question,
	})
	h.broker.Publish(fmt.Sprintf("mod:%d", event.ID), string(data))

	writeJSON(w, http.StatusCreated, map[string]string{"message": "question submitted, waiting for moderation"})
}

func (h *Handler) GetApprovedQuestions(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	event, err := h.db.GetEventByCode(code)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	questions, err := h.db.GetApprovedQuestions(event.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load questions")
		return
	}
	writeJSON(w, http.StatusOK, questions)
}

func (h *Handler) VoteQuestion(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	qidStr := chi.URLParam(r, "qid")

	event, err := h.db.GetEventByCode(code)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}

	qid, err := strconv.ParseInt(qidStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid question id")
		return
	}

	votes, err := h.db.IncrementVote(qid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to vote")
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type":        "vote_updated",
		"question_id": qid,
		"votes":       votes,
	})
	h.broker.Publish(fmt.Sprintf("audience:%s", code), string(msg))
	h.broker.Publish(fmt.Sprintf("mod:%d", event.ID), string(msg))

	writeJSON(w, http.StatusOK, map[string]int{"votes": votes})
}

func (h *Handler) GetPendingQuestions(w http.ResponseWriter, r *http.Request) {
	event, ok := h.requireEventAccess(w, r)
	if !ok {
		return
	}
	questions, err := h.db.GetPendingQuestions(event.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load questions")
		return
	}
	writeJSON(w, http.StatusOK, questions)
}

func (h *Handler) ApproveQuestion(w http.ResponseWriter, r *http.Request) {
	h.moderateQuestion(w, r, models.StatusApproved)
}

func (h *Handler) RejectQuestion(w http.ResponseWriter, r *http.Request) {
	h.moderateQuestion(w, r, models.StatusRejected)
}

func (h *Handler) AnswerQuestion(w http.ResponseWriter, r *http.Request) {
	qidStr := chi.URLParam(r, "qid")
	qid, err := strconv.ParseInt(qidStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid question id")
		return
	}

	question, err := h.db.GetQuestionByID(qid)
	if err != nil || question == nil {
		writeError(w, http.StatusNotFound, "question not found")
		return
	}

	user := middleware.GetUser(r)
	event, err := h.db.GetEventByID(question.EventID)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if user.Role != models.RoleSuperuser && event.CreatedBy != user.ID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := h.db.UpdateQuestionStatus(qid, models.StatusAnswered); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update question")
		return
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type":        "question_answered",
		"question_id": qid,
	})
	h.broker.Publish(fmt.Sprintf("audience:%s", event.Code), string(msg))
	h.broker.Publish(fmt.Sprintf("mod:%d", event.ID), string(msg))

	writeJSON(w, http.StatusOK, map[string]string{"status": "answered"})
}

func (h *Handler) moderateQuestion(w http.ResponseWriter, r *http.Request, status models.QuestionStatus) {
	qidStr := chi.URLParam(r, "qid")
	qid, err := strconv.ParseInt(qidStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid question id")
		return
	}

	question, err := h.db.GetQuestionByID(qid)
	if err != nil || question == nil {
		writeError(w, http.StatusNotFound, "question not found")
		return
	}

	user := middleware.GetUser(r)
	event, err := h.db.GetEventByID(question.EventID)
	if err != nil || event == nil {
		writeError(w, http.StatusNotFound, "event not found")
		return
	}
	if user.Role != models.RoleSuperuser && event.CreatedBy != user.ID {
		writeError(w, http.StatusForbidden, "forbidden")
		return
	}

	if err := h.db.UpdateQuestionStatus(qid, status); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update question")
		return
	}

	question.Status = status

	if status == models.StatusApproved {
		msg, _ := json.Marshal(map[string]interface{}{
			"type":     "question_new",
			"question": question,
		})
		h.broker.Publish(fmt.Sprintf("audience:%s", event.Code), string(msg))
	}

	msg, _ := json.Marshal(map[string]interface{}{
		"type":        "question_status_changed",
		"question_id": qid,
		"status":      string(status),
		"question":    question,
	})
	h.broker.Publish(fmt.Sprintf("mod:%d", event.ID), string(msg))

	writeJSON(w, http.StatusOK, question)
}
