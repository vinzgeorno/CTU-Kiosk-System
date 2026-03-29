"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const databaseFilePath = path_1.default.resolve(process.cwd(), "kiosk.db");
const schemaFilePath = path_1.default.join(__dirname, "schema.sql");
exports.db = new better_sqlite3_1.default(databaseFilePath);
exports.db.pragma("foreign_keys = ON");
function doesTableExist(tableName) {
    const row = exports.db
        .prepare(`
				SELECT name
				FROM sqlite_master
				WHERE type = 'table' AND name = ?
				LIMIT 1
			`)
        .get(tableName);
    return Boolean(row);
}
function getColumnNames(tableName) {
    const columns = exports.db
        .prepare(`PRAGMA table_info(${tableName})`)
        .all();
    return new Set(columns.map((column) => column.name));
}
function migrateLegacyTransactionsTable() {
    if (!doesTableExist("transactions")) {
        return;
    }
    const columnNames = getColumnNames("transactions");
    if (!columnNames.has("sync_status")) {
        exports.db.exec(`
				ALTER TABLE transactions
				ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'pending'
			`);
    }
    if (!columnNames.has("synced_at")) {
        exports.db.exec(`
				ALTER TABLE transactions
				ADD COLUMN synced_at TEXT
			`);
    }
    if (!columnNames.has("sync_error")) {
        exports.db.exec(`
				ALTER TABLE transactions
				ADD COLUMN sync_error TEXT
			`);
    }
}
const schemaSql = fs_1.default.readFileSync(schemaFilePath, "utf8");
migrateLegacyTransactionsTable();
exports.db.exec(schemaSql);
