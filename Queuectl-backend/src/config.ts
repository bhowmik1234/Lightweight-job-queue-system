const { db } = require("./db");
const dotenv = require("dotenv");
dotenv.config();

export function getConfig(key: string) {
    const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key);
    return row ? row.value : undefined;
}

export function setConfig(key: string, value: string) {
    db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)").run(
        key,
        value
    );
}
