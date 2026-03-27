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
	created_at TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_transactions_ticket_label
	ON transactions (ticket_label);

CREATE INDEX IF NOT EXISTS idx_transactions_facility_code
	ON transactions (facility_code);

CREATE INDEX IF NOT EXISTS idx_transactions_created_at
	ON transactions (created_at);

CREATE INDEX IF NOT EXISTS idx_transaction_breakdown_transaction_id
	ON transaction_breakdown (transaction_id);
