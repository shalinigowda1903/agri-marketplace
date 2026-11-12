const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

function createToken(user) {
    return jwt.sign(
        { id: user.id, role: user.role, name: user.name },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        location: user.location,
        farmName: user.farm_name,
        bio: user.bio,
        approvalStatus: user.approval_status
    };
}

async function registerAccount(req, res, next, forcedRole) {
    const { name, email, phone, password, location, farmName, bio } = req.body;
    const role = forcedRole || req.body.role;
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (
        typeof name !== "string" || !name.trim() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        typeof phone !== "string" || !phone.trim() ||
        typeof password !== "string" || password.length < 8 ||
        typeof location !== "string" || !location.trim() ||
        !["customer", "farmer"].includes(role)
    ) {
        return res.status(400).json({
            message: "Enter your name, a valid email, phone, location, customer or farmer role, and a password of at least 8 characters."
        });
    }

    if (role === "farmer" && (typeof farmName !== "string" || !farmName.trim())) {
        return res.status(400).json({ message: "Farm name is required for farmer accounts." });
    }

    try {
        const passwordHash = await bcrypt.hash(password, 12);
        const [result] = await db.execute(
            `INSERT INTO users (name, email, phone, password, role, location, farm_name, bio)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name.trim(),
                normalizedEmail,
                phone.trim(),
                passwordHash,
                role,
                location.trim(),
                role === "farmer" ? farmName.trim() : null,
                typeof bio === "string" ? bio.trim() || null : null
            ]
        );

        const [users] = await db.execute("SELECT * FROM users WHERE id = ?", [result.insertId]);
        const user = users[0];
        const response = {
            token: createToken(user),
            user: publicUser(user),
            message: role === "farmer"
                ? "Account created. Your farm will appear in the marketplace after admin approval."
                : "Welcome to Agri Marketplace."
        };
        if (forcedRole === "farmer") response.farmerId = result.insertId;
        res.status(201).json(response);
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "An account with this email already exists." });
        }
        next(error);
    }
}

router.post("/register", (req, res, next) => registerAccount(req, res, next));

router.post("/login", async (req, res, next) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
        return res.status(400).json({ message: "Enter your email and password." });
    }

    try {
        const [users] = await db.execute("SELECT * FROM users WHERE email = ? LIMIT 1", [email]);
        if (!users.length || !(await bcrypt.compare(password, users[0].password))) {
            return res.status(401).json({ message: "Email or password is incorrect." });
        }

        res.json({ token: createToken(users[0]), user: publicUser(users[0]) });
    } catch (error) {
        next(error);
    }
});

router.get("/me", authenticate, async (req, res, next) => {
    try {
        const [users] = await db.execute(
            `SELECT id, name, email, phone, role, location, farm_name, bio, approval_status
             FROM users WHERE id = ?`,
            [req.user.id]
        );
        if (!users.length) {
            return res.status(404).json({ message: "Account not found." });
        }
        res.json({ user: publicUser(users[0]) });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
module.exports.registerFarmer = (req, res, next) =>
    registerAccount(req, res, next, "farmer");
