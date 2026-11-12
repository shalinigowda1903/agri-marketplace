const express = require("express");
const db = require("../db");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
    const { q = "", category = "", location = "", farmer = "", organic = "" } = req.query;
    const filters = ["p.active = 1", "u.approval_status = 'approved'"];
    const values = [];

    if (typeof q === "string" && q.trim()) {
        filters.push("(p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?)");
        values.push(`%${q.trim()}%`, `%${q.trim()}%`, `%${q.trim()}%`);
    }
    if (category) {
        filters.push("c.id = ?");
        values.push(category);
    }
    if (typeof location === "string" && location.trim()) {
        filters.push("u.location LIKE ?");
        values.push(`%${location.trim()}%`);
    }
    if (farmer) {
        filters.push("u.id = ?");
        values.push(farmer);
    }
    if (organic === "true") filters.push("p.organic = 1");

    try {
        const [products] = await db.execute(
            `SELECT p.id, p.name, p.description, p.price, p.unit, p.stock, p.organic,
                    p.image_url AS imageUrl, c.id AS categoryId, c.name AS category,
                    u.id AS farmerId, u.name AS farmerName, u.farm_name AS farmName,
                    u.location AS farmerLocation,
                    COALESCE(AVG(r.rating), 0) AS rating,
                    COUNT(DISTINCT r.id) AS reviewCount
             FROM products p
             JOIN categories c ON c.id = p.category_id
             JOIN users u ON u.id = p.farmer_id
             LEFT JOIN reviews r ON r.product_id = p.id
             WHERE ${filters.join(" AND ")}
             GROUP BY p.id
             ORDER BY p.created_at DESC
             LIMIT 100`,
            values
        );
        res.json(products);
    } catch (error) {
        next(error);
    }
});

router.get("/categories", async (req, res, next) => {
    try {
        const [categories] = await db.execute("SELECT id, name, description FROM categories ORDER BY name");
        res.json(categories);
    } catch (error) {
        next(error);
    }
});

router.post("/", authenticate, allowRoles("farmer"), async (req, res, next) => {
    const { name, description = "", categoryId, price, unit = "kg", stock, organic = false, imageUrl = "" } = req.body;
    const numericPrice = Number(price);
    const numericStock = Number(stock);

    if (
        typeof name !== "string" || !name.trim() ||
        !Number.isInteger(Number(categoryId)) ||
        !Number.isFinite(numericPrice) || numericPrice <= 0 ||
        !Number.isFinite(numericStock) || numericStock < 0 ||
        typeof unit !== "string" || !unit.trim() ||
        typeof organic !== "boolean" ||
        (imageUrl && (typeof imageUrl !== "string" || imageUrl.length > 1000))
    ) {
        return res.status(400).json({ message: "Enter a product name, category, valid price, unit, stock, and optional image URL." });
    }

    try {
        const [farmers] = await db.execute(
            "SELECT approval_status FROM users WHERE id = ? AND role = 'farmer'",
            [req.user.id]
        );
        if (!farmers.length || farmers[0].approval_status !== "approved") {
            return res.status(403).json({ message: "Your farmer account must be approved before listing products." });
        }

        const [result] = await db.execute(
            `INSERT INTO products (farmer_id, category_id, name, description, price, unit, stock, organic, image_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.id, Number(categoryId), name.trim(),
                typeof description === "string" ? description.trim() : "",
                numericPrice, unit.trim(), numericStock, organic ? 1 : 0, imageUrl || null
            ]
        );
        res.status(201).json({ id: result.insertId, message: "Product listed." });
    } catch (error) {
        if (error.code === "ER_NO_REFERENCED_ROW_2") {
            return res.status(400).json({ message: "Choose an existing product category." });
        }
        next(error);
    }
});

router.get("/mine", authenticate, allowRoles("farmer"), async (req, res, next) => {
    try {
        const [products] = await db.execute(
            `SELECT p.id, p.name, p.description, p.price, p.unit, p.stock, p.organic,
                    p.image_url AS imageUrl, p.active, c.name AS category
             FROM products p JOIN categories c ON c.id = p.category_id
             WHERE p.farmer_id = ? ORDER BY p.created_at DESC`,
            [req.user.id]
        );
        res.json(products);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id", authenticate, allowRoles("farmer"), async (req, res, next) => {
    const allowed = ["name", "description", "price", "unit", "stock", "organic", "imageUrl", "active"];
    const changes = Object.keys(req.body).filter((key) => allowed.includes(key));
    if (!changes.length) {
        return res.status(400).json({ message: "Provide at least one product field to update." });
    }

    const columns = {
        name: "name", description: "description", price: "price", unit: "unit",
        stock: "stock", organic: "organic", imageUrl: "image_url", active: "active"
    };
    const values = [];

    for (const key of changes) {
        const value = req.body[key];
        if (key === "name" || key === "unit") {
            if (typeof value !== "string" || !value.trim()) {
                return res.status(400).json({ message: `${key} must not be empty.` });
            }
            values.push(value.trim());
        } else if (key === "description") {
            if (typeof value !== "string") return res.status(400).json({ message: "Description must be text." });
            values.push(value.trim());
        } else if (key === "price") {
            if (!Number.isFinite(Number(value)) || Number(value) <= 0) return res.status(400).json({ message: "Price must be greater than zero." });
            values.push(Number(value));
        } else if (key === "stock") {
            if (!Number.isFinite(Number(value)) || Number(value) < 0) return res.status(400).json({ message: "Stock cannot be negative." });
            values.push(Number(value));
        } else if (key === "organic" || key === "active") {
            if (typeof value !== "boolean") return res.status(400).json({ message: `${key} must be true or false.` });
            values.push(value ? 1 : 0);
        } else {
            if (typeof value !== "string" || value.length > 1000) return res.status(400).json({ message: "Image URL is invalid." });
            values.push(value || null);
        }
    }

    values.push(req.params.id, req.user.id);
    try {
        const [result] = await db.execute(
            `UPDATE products SET ${changes.map((key) => `\`${columns[key]}\` = ?`).join(", ")}
             WHERE id = ? AND farmer_id = ?`,
            values
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Product not found." });
        res.json({ message: "Product updated." });
    } catch (error) {
        next(error);
    }
});

router.delete("/:id", authenticate, allowRoles("farmer"), async (req, res, next) => {
    try {
        const [result] = await db.execute(
            "UPDATE products SET active = 0 WHERE id = ? AND farmer_id = ?",
            [req.params.id, req.user.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Product not found." });
        res.json({ message: "Product removed from the marketplace." });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
