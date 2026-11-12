require("dotenv").config();

const db = require("../db");
const initializeDatabase = require("../database");

initializeDatabase()
    .then(() => console.log("Marketplace database and tables are ready."))
    .catch((error) => {
        console.error("Database setup failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
