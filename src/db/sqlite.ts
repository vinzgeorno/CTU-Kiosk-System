import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const databaseFilePath = path.resolve(process.cwd(), "kiosk.db");
const schemaFilePath = path.join(__dirname, "schema.sql");

type SqliteTableInfoRow = {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
};

export const db = new Database(databaseFilePath);

db.pragma("foreign_keys = ON");

function doesTableExist(tableName: string): boolean {
	const row = db
		.prepare(
			`
				SELECT name
				FROM sqlite_master
				WHERE type = 'table' AND name = ?
				LIMIT 1
			`
		)
		.get(tableName);

	return Boolean(row);
}

function getColumnNames(tableName: string): Set<string> {
	const columns = db
		.prepare(`PRAGMA table_info(${tableName})`)
		.all() as SqliteTableInfoRow[];

	return new Set(columns.map((column) => column.name));
}

function migrateLegacyTransactionsTable() {
	if (!doesTableExist("transactions")) {
		return;
	}

	const columnNames = getColumnNames("transactions");

	if (!columnNames.has("sync_status")) {
		db.exec(
			`
				ALTER TABLE transactions
				ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'
			`
		);
	}

	if (!columnNames.has("synced_at")) {
		db.exec(
			`
				ALTER TABLE transactions
				ADD COLUMN synced_at TEXT
			`
		);
	}

	if (!columnNames.has("sync_error")) {
		db.exec(
			`
				ALTER TABLE transactions
				ADD COLUMN sync_error TEXT
			`
		);
	}
}

const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
migrateLegacyTransactionsTable();
db.exec(schemaSql);
