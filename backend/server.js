require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("node:path");
const db = require("./db");
const initializeDatabase = require("./database");

const app = express();
const projectRoot = path.resolve(__dirname, "..");

const defaultCorsOrigins = [
    "http://localhost:5000",
    "http://127.0.0.1:5000",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5501",
    "http://127.0.0.1:5501"
];
const corsOrigins = (process.env.CORS_ORIGIN || defaultCorsOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim());
app.use(cors({ origin: corsOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/index.html", (req, res) => res.sendFile(path.join(projectRoot, "index.html")));
app.get("/style.css", (req, res) => res.sendFile(path.join(projectRoot, "style.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(projectRoot, "script.js")));
app.get("/farmers.html", (req, res) => res.sendFile(path.join(projectRoot, "farmers.html")));

app.get("/api/health", (req, res) => {
    res.json({ success: true, message: "Agri Marketplace API is working." });
});

app.get("/api/farmers/register", (req, res) => {
    res.set("Allow", "POST").status(405).json({
        message: "Farmer registration accepts POST requests. Open the marketplace and use Create account, or send a JSON POST request."
    });
});

app.get("/api/test-db", async (req, res, next) => {
    try {
        const [rows] = await db.execute("SELECT DATABASE() AS databaseName");
        res.json({ success: true, message: "Database is working.", database: rows[0].databaseName });
    } catch (error) {
        next(error);
    }
});

const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);
app.post("/api/farmers/register", (req, res, next) => {
    req.body = {
        ...req.body,
        role: "farmer",
        farmName: req.body.farmName || req.body.name
    };
    authRoutes.registerFarmer(req, res, next);
});
app.use("/api/farmers", require("./routes/farmerRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));

app.use((req, res) => {
    res.status(404).json({ message: "The requested API endpoint was not found." });
});

app.use((error, req, res, next) => {
    console.error("Request failed:", error.message);
    if (res.headersSent) return next(error);
    res.status(500).json({ message: "The request could not be completed. Please try again." });
});

const PORT = Number(process.env.PORT || 5000);

async function start() {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        throw new Error("Set JWT_SECRET to a random secret of at least 32 characters in backend/.env.");
    }
    await initializeDatabase();
    console.log("MySQL Database Connected!");
    app.listen(PORT, () => {
        console.log(`Agri Marketplace is ready at http://localhost:${PORT}`);
    });
}

start().catch(async (error) => {
    console.error("Startup failed:", error.message);
    await db.end();
    process.exitCode = 1;
});
