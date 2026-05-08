package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
	"slido/internal/models"
)

type DB struct {
	*sql.DB
}

func New(path string) (*DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, err
	}
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, err
	}
	return &DB{db}, nil
}

func (d *DB) Migrate() error {
	_, err := d.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			role TEXT NOT NULL DEFAULT 'moderator',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			code TEXT UNIQUE NOT NULL,
			name TEXT NOT NULL,
			created_by INTEGER NOT NULL,
			active INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (created_by) REFERENCES users(id)
		);
		CREATE TABLE IF NOT EXISTS questions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			event_id INTEGER NOT NULL,
			text TEXT NOT NULL,
			author_name TEXT NOT NULL DEFAULT 'Anonymous',
			status TEXT NOT NULL DEFAULT 'pending',
			votes INTEGER NOT NULL DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (event_id) REFERENCES events(id)
		);
	`)
	return err
}

func (d *DB) UserExistsByUsername(username string) (bool, error) {
	var count int
	err := d.QueryRow("SELECT COUNT(*) FROM users WHERE username = ?", username).Scan(&count)
	return count > 0, err
}

func (d *DB) CreateUser(username, passwordHash, role string) (*models.User, error) {
	res, err := d.Exec(
		"INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
		username, passwordHash, role,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &models.User{ID: id, Username: username, Role: models.Role(role), CreatedAt: time.Now()}, nil
}

func (d *DB) UpdateUserPassword(username, passwordHash string) error {
	_, err := d.Exec("UPDATE users SET password = ? WHERE username = ?", passwordHash, username)
	return err
}

func (d *DB) GetUserByUsername(username string) (*models.User, error) {
	u := &models.User{}
	var createdAt string
	err := d.QueryRow(
		"SELECT id, username, password, role, created_at FROM users WHERE username = ?",
		username,
	).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return u, nil
}

func (d *DB) GetUserByID(id int64) (*models.User, error) {
	u := &models.User{}
	var createdAt string
	err := d.QueryRow(
		"SELECT id, username, password, role, created_at FROM users WHERE id = ?",
		id,
	).Scan(&u.ID, &u.Username, &u.Password, &u.Role, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return u, nil
}

func (d *DB) ListModerators() ([]models.User, error) {
	rows, err := d.Query(
		"SELECT id, username, role, created_at FROM users WHERE role = 'moderator' ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []models.User
	for rows.Next() {
		var u models.User
		var createdAt string
		if err := rows.Scan(&u.ID, &u.Username, &u.Role, &createdAt); err != nil {
			return nil, err
		}
		u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		users = append(users, u)
	}
	if users == nil {
		users = []models.User{}
	}
	return users, nil
}

func (d *DB) DeleteUser(id int64) error {
	_, err := d.Exec("DELETE FROM users WHERE id = ? AND role != 'superuser'", id)
	return err
}

func (d *DB) CreateEvent(name, code string, createdBy int64) (*models.Event, error) {
	res, err := d.Exec(
		"INSERT INTO events (name, code, created_by) VALUES (?, ?, ?)",
		name, code, createdBy,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &models.Event{ID: id, Code: code, Name: name, CreatedBy: createdBy, Active: true, CreatedAt: time.Now()}, nil
}

func (d *DB) GetEventByCode(code string) (*models.Event, error) {
	e := &models.Event{}
	var active int
	var createdAt string
	err := d.QueryRow(
		"SELECT id, code, name, created_by, active, created_at FROM events WHERE code = ?",
		code,
	).Scan(&e.ID, &e.Code, &e.Name, &e.CreatedBy, &active, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Active = active == 1
	e.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return e, nil
}

func (d *DB) GetEventByID(id int64) (*models.Event, error) {
	e := &models.Event{}
	var active int
	var createdAt string
	err := d.QueryRow(
		"SELECT id, code, name, created_by, active, created_at FROM events WHERE id = ?",
		id,
	).Scan(&e.ID, &e.Code, &e.Name, &e.CreatedBy, &active, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	e.Active = active == 1
	e.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return e, nil
}

func (d *DB) ListEventsByCreator(userID int64) ([]models.Event, error) {
	rows, err := d.Query(
		"SELECT id, code, name, created_by, active, created_at FROM events WHERE created_by = ? ORDER BY created_at DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func (d *DB) ListAllEvents() ([]models.Event, error) {
	rows, err := d.Query(
		"SELECT id, code, name, created_by, active, created_at FROM events ORDER BY created_at DESC",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanEvents(rows)
}

func scanEvents(rows *sql.Rows) ([]models.Event, error) {
	var events []models.Event
	for rows.Next() {
		var e models.Event
		var active int
		var createdAt string
		if err := rows.Scan(&e.ID, &e.Code, &e.Name, &e.CreatedBy, &active, &createdAt); err != nil {
			return nil, err
		}
		e.Active = active == 1
		e.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		events = append(events, e)
	}
	if events == nil {
		events = []models.Event{}
	}
	return events, nil
}

func (d *DB) UpdateEvent(id int64, name string, active bool) error {
	activeInt := 0
	if active {
		activeInt = 1
	}
	_, err := d.Exec("UPDATE events SET name = ?, active = ? WHERE id = ?", name, activeInt, id)
	return err
}

func (d *DB) DeleteEvent(id int64) error {
	_, err := d.Exec("DELETE FROM events WHERE id = ?", id)
	return err
}

func (d *DB) CreateQuestion(eventID int64, text, authorName string) (*models.Question, error) {
	res, err := d.Exec(
		"INSERT INTO questions (event_id, text, author_name) VALUES (?, ?, ?)",
		eventID, text, authorName,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return &models.Question{
		ID:         id,
		EventID:    eventID,
		Text:       text,
		AuthorName: authorName,
		Status:     models.StatusPending,
		Votes:      0,
		CreatedAt:  time.Now(),
	}, nil
}

func (d *DB) GetQuestionByID(id int64) (*models.Question, error) {
	q := &models.Question{}
	var createdAt string
	err := d.QueryRow(
		"SELECT id, event_id, text, author_name, status, votes, created_at FROM questions WHERE id = ?",
		id,
	).Scan(&q.ID, &q.EventID, &q.Text, &q.AuthorName, &q.Status, &q.Votes, &createdAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	q.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return q, nil
}

func (d *DB) GetApprovedQuestions(eventID int64) ([]models.Question, error) {
	rows, err := d.Query(
		"SELECT id, event_id, text, author_name, status, votes, created_at FROM questions WHERE event_id = ? AND status = 'approved' ORDER BY votes DESC, created_at ASC",
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanQuestions(rows)
}

func (d *DB) GetPendingQuestions(eventID int64) ([]models.Question, error) {
	rows, err := d.Query(
		"SELECT id, event_id, text, author_name, status, votes, created_at FROM questions WHERE event_id = ? AND status = 'pending' ORDER BY created_at ASC",
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanQuestions(rows)
}

func (d *DB) GetAllModQuestions(eventID int64) ([]models.Question, error) {
	rows, err := d.Query(
		`SELECT id, event_id, text, author_name, status, votes, created_at FROM questions
		 WHERE event_id = ?
		 ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'answered' THEN 2 ELSE 3 END,
		          votes DESC, created_at ASC`,
		eventID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanQuestions(rows)
}

func scanQuestions(rows *sql.Rows) ([]models.Question, error) {
	var questions []models.Question
	for rows.Next() {
		var q models.Question
		var createdAt string
		if err := rows.Scan(&q.ID, &q.EventID, &q.Text, &q.AuthorName, &q.Status, &q.Votes, &createdAt); err != nil {
			return nil, err
		}
		q.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		questions = append(questions, q)
	}
	if questions == nil {
		questions = []models.Question{}
	}
	return questions, nil
}

func (d *DB) UpdateQuestionStatus(id int64, status models.QuestionStatus) error {
	_, err := d.Exec("UPDATE questions SET status = ? WHERE id = ?", string(status), id)
	return err
}

func (d *DB) IncrementVote(id int64) (int, error) {
	_, err := d.Exec("UPDATE questions SET votes = votes + 1 WHERE id = ? AND status = 'approved'", id)
	if err != nil {
		return 0, err
	}
	var votes int
	err = d.QueryRow("SELECT votes FROM questions WHERE id = ?", id).Scan(&votes)
	return votes, err
}

func (d *DB) EventCodeExists(code string) (bool, error) {
	var count int
	err := d.QueryRow("SELECT COUNT(*) FROM events WHERE code = ?", code).Scan(&count)
	return count > 0, err
}

func (d *DB) GetEventByIDStr(id string) (*models.Event, error) {
	var eventID int64
	if _, err := fmt.Sscan(id, &eventID); err != nil {
		return nil, fmt.Errorf("invalid id")
	}
	return d.GetEventByID(eventID)
}
