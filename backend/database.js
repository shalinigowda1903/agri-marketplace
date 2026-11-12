const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("./db");

async function ensureColumn(table, column, definition) {
    const [rows] = await db.execute(
        `SELECT COUNT(*) AS found
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );

    if (rows[0].found === 0) {
        await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    }
}

async function initializeDatabase() {
    const schema = await fs.readFile(path.join(__dirname, "database.sql"), "utf8");
    const statements = schema
        .split(";")
        .map((statement) => statement.trim())
        .filter((statement) => statement && !/^USE\s+/i.test(statement));

    for (const statement of statements) {
        await db.query(statement);
    }

    await ensureColumn("users", "farm_name", "VARCHAR(150) NULL");
    await ensureColumn("users", "bio", "TEXT NULL");
    await ensureColumn(
        "users",
        "approval_status",
        "ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending'"
    );
    await ensureColumn(
        "users",
        "updated_at",
        "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
    );
}

module.exports = initializeDatabase;
