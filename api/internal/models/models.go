package models

import "time"

type Role string

const (
	RoleSuperuser Role = "superuser"
	RoleModerator Role = "moderator"
)

type QuestionStatus string

const (
	StatusPending  QuestionStatus = "pending"
	StatusApproved QuestionStatus = "approved"
	StatusRejected QuestionStatus = "rejected"
	StatusAnswered QuestionStatus = "answered"
)

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Password  string    `json:"-"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type Event struct {
	ID        int64     `json:"id"`
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	CreatedBy int64     `json:"created_by"`
	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"created_at"`
}

type Question struct {
	ID         int64          `json:"id"`
	EventID    int64          `json:"event_id"`
	Text       string         `json:"text"`
	AuthorName string         `json:"author_name"`
	Status     QuestionStatus `json:"status"`
	Votes      int            `json:"votes"`
	CreatedAt  time.Time      `json:"created_at"`
}
