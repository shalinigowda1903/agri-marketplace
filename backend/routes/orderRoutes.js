const express = require("express");
const db = require("../db");
const { authenticate, allowRoles } = require("../middleware/auth");

const router = express.Router();
const farmerTransitions = {
    placed: ["confirmed", "cancelled"],
    confirmed: ["out_for_delivery", "cancelled"],
    out_for_delivery: ["delivered"],
    delivered: [],
    cancelled: []
};

router.post("/", authenticate, allowRoles("customer"), async (req, res, next) => {
    const { items, deliveryAddress, deliverySlot } = req.body;
    if (
        !Array.isArray(items) || !items.length || items.length > 50 ||
        typeof deliveryAddress !== "string" || !deliveryAddress.trim() ||
        typeof deliverySlot !== "string" || !deliverySlot.trim()
    ) {
        return res.status(400).json({ message: "Add products, a delivery address, and a delivery slot." });
    }

    const quantities = new Map();
    for (const item of items) {
        const id = Number(item && item.productId);
        const quantity = Number(item && item.quantity);
        if (!Number.isInteger(id) || id < 1 || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ message: "Every cart item must have a valid product and quantity." });
        }
        quantities.set(id, (quantities.get(id) || 0) + quantity);
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const ids = [...quantities.keys()];
        const [products] = await connection.query(
            `SELECT p.id, p.name, p.unit, p.price, p.stock, p.farmer_id AS farmerId,
                    p.active, u.approval_status AS farmerStatus
             FROM products p JOIN users u ON u.id = p.farmer_id
             WHERE p.id IN (?) FOR UPDATE`,
            [ids]
        );
        if (products.length !== ids.length) {
            await connection.rollback();
            return res.status(400).json({ message: "One or more products are no longer available." });
        }
        for (const product of products) {
            if (!product.active || product.farmerStatus !== "approved") {
                await connection.rollback();
                return res.status(400).json({ message: `${product.name} is no longer available.` });
            }
            if (quantities.get(product.id) > Number(product.stock)) {
                await connection.rollback();
                return res.status(409).json({ message: `Only ${product.stock} ${product.unit} of ${product.name} remain.` });
            }
        }

        const byFarmer = new Map();
        for (const product of products) {
            if (!byFarmer.has(product.farmerId)) byFarmer.set(product.farmerId, []);
            byFarmer.get(product.farmerId).push(product);
        }

        const orderIds = [];
        for (const [farmerId, farmerProducts] of byFarmer) {
            const total = farmerProducts.reduce(
                (sum, product) => sum + Number(product.price) * quantities.get(product.id),
                0
            );
            const [orderResult] = await connection.execute(
                `INSERT INTO orders (customer_id, farmer_id, delivery_address, delivery_slot, total)
                 VALUES (?, ?, ?, ?, ?)`,
                [req.user.id, farmerId, deliveryAddress.trim(), deliverySlot.trim(), total]
            );
            orderIds.push(orderResult.insertId);
            for (const product of farmerProducts) {
                const quantity = quantities.get(product.id);
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, unit, quantity, unit_price)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [orderResult.insertId, product.id, product.name, product.unit, quantity, product.price]
                );
                await connection.execute(
                    "UPDATE products SET stock = stock - ? WHERE id = ?",
                    [quantity, product.id]
                );
            }
        }
        await connection.commit();
        res.status(201).json({ orderIds, message: "Your order has been placed." });
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.get("/mine", authenticate, async (req, res, next) => {
    const isFarmer = req.user.role === "farmer";
    if (!isFarmer && req.user.role !== "customer") {
        return res.status(403).json({ message: "Orders are not available for this account." });
    }

    try {
        const [orders] = await db.execute(
            `SELECT o.id, o.customer_id AS customerId, o.farmer_id AS farmerId,
                    o.delivery_address AS deliveryAddress, o.delivery_slot AS deliverySlot,
                    o.total, o.status, o.created_at AS createdAt,
                    customer.name AS customerName, farmer.farm_name AS farmName,
                    JSON_ARRAYAGG(JSON_OBJECT(
                        'productId', oi.product_id,
                        'name', oi.product_name,
                        'unit', oi.unit,
                        'quantity', oi.quantity,
                        'unitPrice', oi.unit_price
                    )) AS items
             FROM orders o
             JOIN users customer ON customer.id = o.customer_id
             JOIN users farmer ON farmer.id = o.farmer_id
             JOIN order_items oi ON oi.order_id = o.id
             WHERE o.${isFarmer ? "farmer_id" : "customer_id"} = ?
             GROUP BY o.id
             ORDER BY o.created_at DESC
             LIMIT 100`,
            [req.user.id]
        );
        res.json(orders);
    } catch (error) {
        next(error);
    }
});

router.patch("/:id/status", authenticate, async (req, res, next) => {
    const { status } = req.body;
    if (req.user.role !== "farmer" && req.user.role !== "customer") {
        return res.status(403).json({ message: "You cannot update this order." });
    }

    let connection;
    try {
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [orders] = await connection.execute(
            "SELECT id, customer_id AS customerId, farmer_id AS farmerId, status FROM orders WHERE id = ? FOR UPDATE",
            [req.params.id]
        );
        if (!orders.length) {
            await connection.rollback();
            return res.status(404).json({ message: "Order not found." });
        }
        const order = orders[0];
        let nextStatus = status;
        if (req.user.role === "customer") {
            if (order.customerId !== req.user.id || order.status !== "placed" || status !== "cancelled") {
                await connection.rollback();
                return res.status(403).json({ message: "Customers can cancel orders that are still placed." });
            }
        } else if (
            order.farmerId !== req.user.id ||
            typeof status !== "string" ||
            !farmerTransitions[order.status].includes(status)
        ) {
            await connection.rollback();
            return res.status(403).json({ message: "This order cannot be moved to that status." });
        }

        await connection.execute("UPDATE orders SET status = ? WHERE id = ?", [nextStatus, order.id]);
        if (nextStatus === "cancelled") {
            const [items] = await connection.execute(
                "SELECT product_id AS productId, quantity FROM order_items WHERE order_id = ?",
                [order.id]
            );
            for (const item of items) {
                await connection.execute("UPDATE products SET stock = stock + ? WHERE id = ?", [item.quantity, item.productId]);
            }
        }
        await connection.commit();
        res.json({ message: `Order ${nextStatus.replaceAll("_", " ")}.`, status: nextStatus });
    } catch (error) {
        if (connection) await connection.rollback();
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

router.post("/:id/disputes", authenticate, allowRoles("customer"), async (req, res, next) => {
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (!reason || reason.length > 1000) {
        return res.status(400).json({ message: "Describe the issue in 1,000 characters or fewer." });
    }
    try {
        const [orders] = await db.execute(
            "SELECT id FROM orders WHERE id = ? AND customer_id = ?",
            [req.params.id, req.user.id]
        );
        if (!orders.length) return res.status(404).json({ message: "Order not found." });
        const [result] = await db.execute(
            "INSERT INTO disputes (order_id, customer_id, reason) VALUES (?, ?, ?)",
            [req.params.id, req.user.id, reason]
        );
        res.status(201).json({ id: result.insertId, message: "Your support request has been sent." });
    } catch (error) {
        next(error);
    }
});

router.post("/:id/reviews", authenticate, allowRoles("customer"), async (req, res, next) => {
    const rating = Number(req.body.rating);
    const comment = typeof req.body.comment === "string" ? req.body.comment.trim() : "";
    try {
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Choose a rating from 1 to 5." });
        }
        const [items] = await db.execute(
            `SELECT oi.product_id AS productId, o.farmer_id AS farmerId
             FROM orders o JOIN order_items oi ON oi.order_id = o.id
             WHERE o.id = ? AND o.customer_id = ? AND o.status = 'delivered'
               AND oi.product_id = ?`,
            [req.params.id, req.user.id, req.body.productId]
        );
        if (!items.length) return res.status(403).json({ message: "Only products from your delivered orders can be rated." });
        await db.execute(
            `INSERT INTO reviews (customer_id, farmer_id, product_id, rating, comment)
             VALUES (?, ?, ?, ?, ?)`,
            [req.user.id, items[0].farmerId, items[0].productId, rating, comment || null]
        );
        res.status(201).json({ message: "Thank you for sharing your review." });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "You have already reviewed this product." });
        }
        next(error);
    }
});

module.exports = router;
