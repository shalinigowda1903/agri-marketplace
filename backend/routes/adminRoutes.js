const express = require("express");
const db = require("../db");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, allowRoles("admin"));

router.get("/overview", async (req, res, next) => {
    try {
        const [[counts]] = await db.execute(
            `SELECT
                (SELECT COUNT(*) FROM users WHERE role = 'customer') AS customers,
                (SELECT COUNT(*) FROM users WHERE role = 'farmer' AND approval_status = 'approved') AS farmers,
                (SELECT COUNT(*) FROM users WHERE role = 'farmer' AND approval_status = 'pending') AS pendingFarmers,
                (SELECT COUNT(*) FROM products WHERE active = 1) AS products,
                (SELECT COUNT(*) FROM orders) AS orders,
                (SELECT COUNT(*) FROM disputes WHERE status = 'open') AS openDisputes,
                (SELECT COALESCE(SUM(total), 0) FROM orders WHERE status != 'cancelled') AS sales`
        );
        const [recentOrders] = await db.execute(
            `SELECT o.id, o.total, o.status, o.created_at AS createdAt,
                    c.name AS customerName, f.farm_name AS farmName
             FROM orders o
             JOIN users c ON c.id = o.customer_id
             JOIN users f ON f.id = o.farmer_id
             ORDER BY o.created_at DESC LIMIT 8`
        );
        res.json({ ...counts, recentOrders });
    } catch (error) {
        next(error);
    }
});

router.get("/farmers", async (req, res, next) => {
    const status = ["pending", "approved", "rejected"].includes(req.query.status)
        ? req.query.status
        : "";
    try {
        const [farmers] = await db.execute(
            `SELECT id, name, email, phone, location, farm_name AS farmName, bio,
                    approval_status AS approvalStatus, created_at AS createdAt
             FROM users
             WHERE role = 'farmer' ${status ? "AND approval_status = ?" : ""}
             ORDER BY created_at DESC LIMIT 200`,
            status ? [status] : []
        );
        res.json(farmers);
    } catch (error) {
        next(error);
    }
});

router.patch("/farmers/:id/approval", async (req, res, next) => {
    const { status } = req.body;
    if (!["approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Approval status must be approved or rejected." });
    }
    try {
        const [result] = await db.execute(
            "UPDATE users SET approval_status = ? WHERE id = ? AND role = 'farmer'",
            [status, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Farmer not found." });
        res.json({ message: `Farmer ${status}.` });
    } catch (error) {
        next(error);
    }
});

router.get("/categories", async (req, res, next) => {
    try {
        const [categories] = await db.execute(
            `SELECT c.id, c.name, c.description, COUNT(p.id) AS productCount
             FROM categories c LEFT JOIN products p ON p.category_id = c.id
             GROUP BY c.id ORDER BY c.name`
        );
        res.json(categories);
    } catch (error) {
        next(error);
    }
});

router.post("/categories", async (req, res, next) => {
    const { name, description = "" } = req.body;
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
        return res.status(400).json({ message: "Category name must be between 1 and 80 characters." });
    }
    try {
        const [result] = await db.execute(
            "INSERT INTO categories (name, description) VALUES (?, ?)",
            [name.trim(), typeof description === "string" ? description.trim() || null : null]
        );
        res.status(201).json({ id: result.insertId, message: "Category created." });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "That category already exists." });
        next(error);
    }
});

router.delete("/categories/:id", async (req, res, next) => {
    try {
        const [result] = await db.execute("DELETE FROM categories WHERE id = ?", [req.params.id]);
        if (!result.affectedRows) return res.status(404).json({ message: "Category not found." });
        res.json({ message: "Category removed." });
    } catch (error) {
        if (error.code === "ER_ROW_IS_REFERENCED_2") {
            return res.status(409).json({ message: "This category is used by existing products and cannot be removed." });
        }
        next(error);
    }
});

router.get("/orders", async (req, res, next) => {
    try {
        const [orders] = await db.execute(
            `SELECT o.id, o.total, o.status, o.delivery_slot AS deliverySlot,
                    o.delivery_address AS deliveryAddress, o.created_at AS createdAt,
                    c.name AS customerName, f.farm_name AS farmName
             FROM orders o
             JOIN users c ON c.id = o.customer_id
             JOIN users f ON f.id = o.farmer_id
             ORDER BY o.created_at DESC LIMIT 200`
        );
        res.json(orders);
    } catch (error) {
        next(error);
    }
});

router.get("/disputes", async (req, res, next) => {
    try {
        const [disputes] = await db.execute(
            `SELECT d.id, d.order_id AS orderId, d.reason, d.status, d.admin_note AS adminNote,
                    d.created_at AS createdAt, u.name AS customerName
             FROM disputes d JOIN users u ON u.id = d.customer_id
             ORDER BY d.created_at DESC LIMIT 200`
        );
        res.json(disputes);
    } catch (error) {
        next(error);
    }
});

router.patch("/disputes/:id", async (req, res, next) => {
    const { status, adminNote = "" } = req.body;
    if (!["resolved", "dismissed", "open"].includes(status) || (typeof adminNote !== "string")) {
        return res.status(400).json({ message: "Choose a valid dispute status and note." });
    }
    try {
        const [result] = await db.execute(
            `UPDATE disputes SET status = ?, admin_note = ?,
                    resolved_at = IF(? = 'open', NULL, CURRENT_TIMESTAMP)
             WHERE id = ?`,
            [status, adminNote.trim() || null, status, req.params.id]
        );
        if (!result.affectedRows) return res.status(404).json({ message: "Dispute not found." });
        res.json({ message: "Dispute updated." });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
