import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

const databaseFilePath = path.resolve(process.cwd(), "kiosk.db");
const schemaFilePath = path.join(__dirname, "schema.sql");

export const db = new Database(databaseFilePath);

db.pragma("foreign_keys = ON");

const schemaSql = fs.readFileSync(schemaFilePath, "utf8");
db.exec(schemaSql);
