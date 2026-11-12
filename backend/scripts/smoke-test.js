require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("../db");
const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const created = { users: [], products: [], orders: [], disputes: [], categories: [] };

async function request(path, options = {}) {
    const method = options.method || "GET";
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.token ? { Authorization: `Bearer ${options.token}` } : {})
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {})
    });
    const payload = await response.json();

    if (response.status !== options.expected) {
        throw new Error(
            `${method} ${path}: expected HTTP ${options.expected}, received ${response.status}: ${payload.message || ""}`
        );
    }
    return payload;
}

async function cleanup() {
    if (created.disputes.length) await db.query("DELETE FROM disputes WHERE id IN (?)", [created.disputes]);
    if (created.orders.length) await db.query("DELETE FROM order_items WHERE order_id IN (?)", [created.orders]);
    if (created.orders.length) await db.query("DELETE FROM orders WHERE id IN (?)", [created.orders]);
    if (created.products.length) await db.query("DELETE FROM reviews WHERE product_id IN (?)", [created.products]);
    if (created.products.length) await db.query("DELETE FROM products WHERE id IN (?)", [created.products]);
    if (created.users.length) await db.query("DELETE FROM users WHERE id IN (?)", [created.users]);
    if (created.categories.length) await db.query("DELETE FROM categories WHERE id IN (?)", [created.categories]);
}

async function run() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const health = await request("/api/health", { expected: 200 });
    if (!health.success) throw new Error("Health endpoint did not return success.");
    const getRegistration = await request("/api/farmers/register", { expected: 405 });
    if (!getRegistration.message.includes("POST")) throw new Error("Registration endpoint did not explain its HTTP method.");

    const customer = await request("/api/auth/register", {
        method: "POST",
        expected: 201,
        body: {
            name: "Smoke Test Customer",
            email: `customer-${suffix}@example.test`,
            phone: "5550000101",
            password: "Customer-Test-Password-12!",
            location: "Smoke Test",
            role: "customer"
        }
    });
    created.users.push(customer.user.id);

    await request("/api/auth/register", {
        method: "POST",
        expected: 409,
        body: {
            name: "Smoke Test Customer",
            email: customer.user.email,
            phone: "5550000101",
            password: "Customer-Test-Password-12!",
            location: "Smoke Test",
            role: "customer"
        }
    });

    const farmer = await request("/api/farmers/register", {
        method: "POST",
        expected: 201,
        body: {
            name: "Smoke Test Farmer",
            email: `farmer-${suffix}@example.test`,
            phone: "5550000102",
            password: "Farmer-Test-Password-12!",
            location: "Smoke Test",
            farmName: "Smoke Test Farm"
        }
    });
    created.users.push(farmer.user.id);
    if (farmer.user.approvalStatus !== "pending") throw new Error("New farmer was not marked pending.");

    const adminHash = await bcrypt.hash("Admin-Test-Password-12!", 12);
    const [adminResult] = await db.execute(
        `INSERT INTO users (name, email, phone, password, role, location, approval_status)
         VALUES (?, ?, ?, ?, 'admin', ?, 'approved')`,
        ["Smoke Test Admin", `admin-${suffix}@example.test`, "5550000103", adminHash, "Smoke Test"]
    );
    created.users.push(adminResult.insertId);
    const adminLogin = await request("/api/auth/login", {
        method: "POST",
        expected: 200,
        body: { email: `admin-${suffix}@example.test`, password: "Admin-Test-Password-12!" }
    });
    await request(`/api/admin/farmers/${farmer.user.id}/approval`, {
        method: "PATCH",
        expected: 200,
        token: adminLogin.token,
        body: { status: "approved" }
    });

    const farmerLogin = await request("/api/auth/login", {
        method: "POST",
        expected: 200,
        body: { email: farmer.user.email, password: "Farmer-Test-Password-12!" }
    });
    const [categories] = await db.execute("SELECT id FROM categories ORDER BY id LIMIT 1");
    if (!categories.length) throw new Error("Starter categories are missing. Run npm run db:setup.");
    const product = await request("/api/products", {
        method: "POST",
        expected: 201,
        token: farmerLogin.token,
        body: {
            name: "Smoke Test Sweet Carrots",
            description: "Temporary workflow test",
            categoryId: categories[0].id,
            price: 42,
            unit: "kg",
            stock: 10,
            organic: true
        }
    });
    created.products.push(product.id);

    const filtered = await request(
        `/api/products?q=Sweet&category=${categories[0].id}&location=Smoke&organic=true`,
        { expected: 200 }
    );
    if (!filtered.some((item) => item.id === product.id)) throw new Error("Product filters did not return the test product.");
    const farmerProfile = await request(`/api/farmers/${farmer.user.id}`, { expected: 200 });
    if (farmerProfile.products.length !== 1) throw new Error("Farmer profile did not return its product.");

    const checkout = await request("/api/orders", {
        method: "POST",
        expected: 201,
        token: customer.token,
        body: {
            items: [{ productId: product.id, quantity: 2 }],
            deliveryAddress: "Smoke Test address",
            deliverySlot: "Tomorrow morning"
        }
    });
    const orderId = checkout.orderIds[0];
    created.orders.push(orderId);
    const farmerOrders = await request("/api/orders/mine", { expected: 200, token: farmerLogin.token });
    if (!farmerOrders.some((order) => order.id === orderId)) throw new Error("Farmer order list did not include the new order.");
    await request(`/api/orders/${orderId}/status`, {
        method: "PATCH", expected: 200, token: farmerLogin.token, body: { status: "confirmed" }
    });
    await request(`/api/orders/${orderId}/status`, {
        method: "PATCH", expected: 200, token: farmerLogin.token, body: { status: "out_for_delivery" }
    });
    await request(`/api/orders/${orderId}/status`, {
        method: "PATCH", expected: 200, token: farmerLogin.token, body: { status: "delivered" }
    });
    await request(`/api/orders/${orderId}/reviews`, {
        method: "POST",
        expected: 201,
        token: customer.token,
        body: { productId: product.id, rating: 5, comment: "Smoke test review" }
    });
    const dispute = await request(`/api/orders/${orderId}/disputes`, {
        method: "POST", expected: 201, token: customer.token, body: { reason: "Smoke test support request" }
    });
    created.disputes.push(dispute.id);
    await request(`/api/admin/disputes/${dispute.id}`, {
        method: "PATCH",
        expected: 200,
        token: adminLogin.token,
        body: { status: "resolved", adminNote: "Smoke test complete" }
    });

    const secondCheckout = await request("/api/orders", {
        method: "POST",
        expected: 201,
        token: customer.token,
        body: {
            items: [{ productId: product.id, quantity: 1 }],
            deliveryAddress: "Smoke Test address",
            deliverySlot: "Tomorrow afternoon"
        }
    });
    const cancelledOrderId = secondCheckout.orderIds[0];
    created.orders.push(cancelledOrderId);
    await request(`/api/orders/${cancelledOrderId}/status`, {
        method: "PATCH", expected: 200, token: customer.token, body: { status: "cancelled" }
    });
    const [stockRows] = await db.execute("SELECT stock FROM products WHERE id = ?", [product.id]);
    if (Number(stockRows[0].stock) !== 8) throw new Error("Stock was not correctly restored after an order cancellation.");

    const category = await request("/api/admin/categories", {
        method: "POST",
        expected: 201,
        token: adminLogin.token,
        body: { name: `Smoke Test ${suffix}`, description: "Temporary test category" }
    });
    created.categories.push(category.id);
    await request(`/api/admin/categories/${category.id}`, {
        method: "DELETE", expected: 200, token: adminLogin.token
    });
    created.categories = [];

    const overview = await request("/api/admin/overview", { expected: 200, token: adminLogin.token });
    if (!("sales" in overview) || !("pendingFarmers" in overview)) {
        throw new Error("Admin overview is missing marketplace metrics.");
    }

    console.log("Marketplace smoke test passed: auth, farmer approval, product filtering, checkout, order tracking, ratings, disputes, admin tools, cancellation, and stock restoration.");
}

run()
    .catch((error) => {
        console.error("Marketplace smoke test failed:", error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await cleanup();
        } catch (error) {
            console.error("Smoke test cleanup failed:", error.message);
            process.exitCode = 1;
        }
        await db.end();
    });
