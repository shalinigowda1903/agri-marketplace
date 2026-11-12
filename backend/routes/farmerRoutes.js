const express = require("express");
const db = require("../db");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
    try {
        const [farmers] = await db.execute(
            `SELECT u.id, u.name, u.farm_name AS farmName, u.location, u.bio,
                    COALESCE(AVG(r.rating), 0) AS rating,
                    COUNT(DISTINCT r.id) AS reviewCount,
                    COUNT(DISTINCT p.id) AS productCount
             FROM users u
             LEFT JOIN reviews r ON r.farmer_id = u.id
             LEFT JOIN products p ON p.farmer_id = u.id AND p.active = 1
             WHERE u.role = 'farmer' AND u.approval_status = 'approved'
             GROUP BY u.id
             ORDER BY u.farm_name, u.name`
        );
        res.json(farmers);
    } catch (error) {
        next(error);
    }
});

router.get("/:id", async (req, res, next) => {
    try {
        const [farmers] = await db.execute(
            `SELECT u.id, u.name, u.farm_name AS farmName, u.location, u.bio,
                    COALESCE(AVG(r.rating), 0) AS rating,
                    COUNT(DISTINCT r.id) AS reviewCount
             FROM users u
             LEFT JOIN reviews r ON r.farmer_id = u.id
             WHERE u.id = ? AND u.role = 'farmer' AND u.approval_status = 'approved'
             GROUP BY u.id`,
            [req.params.id]
        );
        if (!farmers.length) return res.status(404).json({ message: "Farmer not found." });

        const [products] = await db.execute(
            `SELECT p.id, p.name, p.description, p.price, p.unit, p.stock, p.organic,
                    p.image_url AS imageUrl, c.name AS category
             FROM products p JOIN categories c ON c.id = p.category_id
             WHERE p.farmer_id = ? AND p.active = 1 AND p.stock > 0
             ORDER BY p.name`,
            [req.params.id]
        );
        res.json({ farmer: farmers[0], products });
    } catch (error) {
        next(error);
    }
});

router.patch("/profile/me", authenticate, allowRoles("farmer"), async (req, res, next) => {
    const { name, phone, location, farmName, bio } = req.body;
    if (
        typeof name !== "string" || !name.trim() ||
        typeof phone !== "string" || !phone.trim() ||
        typeof location !== "string" || !location.trim() ||
        typeof farmName !== "string" || !farmName.trim() ||
        (bio !== undefined && typeof bio !== "string")
    ) {
        return res.status(400).json({ message: "Name, phone, location, and farm name are required." });
    }

    try {
        await db.execute(
            `UPDATE users SET name = ?, phone = ?, location = ?, farm_name = ?, bio = ?
             WHERE id = ? AND role = 'farmer'`,
            [name.trim(), phone.trim(), location.trim(), farmName.trim(), (bio || "").trim() || null, req.user.id]
        );
        res.json({ message: "Farm profile updated." });
    } catch (error) {
        next(error);
    }
});

module.exports = router;