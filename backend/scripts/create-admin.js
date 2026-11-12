require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("../db");

async function createAdmin() {
    const [email, password, ...nameParts] = process.argv.slice(2);
    const name = nameParts.join(" ").trim() || "Marketplace Admin";

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 12) {
        throw new Error(
            "Usage: node scripts/create-admin.js admin@example.com \"A-unique-password-12+chars\" [Admin Name]"
        );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
        `INSERT INTO users (name, email, phone, password, role, location, approval_status)
         VALUES (?, ?, ?, ?, 'admin', ?, 'approved')
         ON DUPLICATE KEY UPDATE
            name = VALUES(name), password = VALUES(password), role = 'admin',
            approval_status = 'approved'`,
        [name, email.trim().toLowerCase(), "Not provided", passwordHash, "Platform administration"]
    );

    console.log(result.affectedRows === 1 ? "Admin account created." : "Admin account updated.");
}

createAdmin()
    .catch((error) => {
        console.error("Could not create admin:", error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
