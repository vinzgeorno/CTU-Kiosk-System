CREATE TABLE IF NOT EXISTS ticket_counters (
	facility_code TEXT PRIMARY KEY,
	last_sequence INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	facility_code TEXT NOT NULL,
	facility_name TEXT NOT NULL,
	ticket_start_no INTEGER NOT NULL,
	ticket_end_no INTEGER NOT NULL,
	ticket_label TEXT NOT NULL,
	is_bulk INTEGER NOT NULL,
	total_units INTEGER NOT NULL CHECK (total_units >= 1),
	amount_due REAL NOT NULL CHECK (amount_due >= 0),
	amount_paid REAL NOT NULL CHECK (amount_paid >= 0),
	session_id TEXT,
	started_at TEXT,
	completed_at TEXT,
	duration_ms INTEGER,
	payment_status TEXT NOT NULL DEFAULT 'completed',
	print_status TEXT NOT NULL DEFAULT 'printed',
	print_attempts INTEGER NOT NULL DEFAULT 1 CHECK (print_attempts >= 0),
	source_mode TEXT NOT NULL DEFAULT 'hardware_live',
	error_message TEXT,
	created_at TEXT NOT NULL,
	CHECK (duration_ms IS NULL OR duration_ms >= 0),
	CHECK (ticket_end_no >= ticket_start_no)
);

CREATE TABLE IF NOT EXISTS transaction_breakdown (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	transaction_id INTEGER NOT NULL,
	category_code TEXT NOT NULL,
	category_label TEXT NOT NULL,
	quantity INTEGER NOT NULL CHECK (quantity >= 1),
	unit_price REAL NOT NULL CHECK (unit_price >= 0),
	subtotal REAL NOT NULL CHECK (subtotal >= 0),
	FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL,
	source TEXT NOT NULL,
	amount REAL NOT NULL CHECK (amount >= 0),
	pulse_count INTEGER NOT NULL DEFAULT 0 CHECK (pulse_count >= 0),
	recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_logs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT NOT NULL UNIQUE,
	facility_code TEXT NOT NULL,
	facility_name TEXT NOT NULL,
	amount_due REAL NOT NULL,
	amount_inserted REAL NOT NULL DEFAULT 0,
	total_units INTEGER NOT NULL CHECK (total_units >= 1),
	status TEXT NOT NULL,
	started_at TEXT NOT NULL,
	last_updated_at TEXT NOT NULL,
	cancelled_at TEXT,
	completed_transaction_id INTEGER,
	FOREIGN KEY (completed_transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS survey_responses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	system_type TEXT NOT NULL,
	transaction_id INTEGER,
	ease_of_use INTEGER NOT NULL CHECK (ease_of_use BETWEEN 1 AND 5),
	speed_satisfaction INTEGER NOT NULL CHECK (speed_satisfaction BETWEEN 1 AND 5),
	accuracy_confidence INTEGER NOT NULL CHECK (accuracy_confidence BETWEEN 1 AND 5),
	overall_satisfaction INTEGER NOT NULL CHECK (overall_satisfaction BETWEEN 1 AND 5),
	submitted_at TEXT NOT NULL,
	FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_ticket_label
	ON transactions (ticket_label);

CREATE INDEX IF NOT EXISTS idx_transactions_facility_code
	ON transactions (facility_code);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
	ON transactions (created_at);

CREATE INDEX IF NOT EXISTS idx_transactions_session_id
	ON transactions (session_id);

CREATE INDEX IF NOT EXISTS idx_transaction_breakdown_transaction_id
	ON transaction_breakdown (transaction_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_session_id
	ON payment_events (session_id);

CREATE INDEX IF NOT EXISTS idx_payment_events_recorded_at
	ON payment_events (recorded_at);

CREATE INDEX IF NOT EXISTS idx_session_logs_session_id
	ON session_logs (session_id);

CREATE INDEX IF NOT EXISTS idx_session_logs_started_at
	ON session_logs (started_at);

CREATE INDEX IF NOT EXISTS idx_survey_responses_transaction_id
	ON survey_responses (transaction_id);

CREATE INDEX IF NOT EXISTS idx_survey_responses_submitted_at
	ON survey_responses (submitted_at);
