require("dotenv").config();

const bcrypt = require("bcryptjs");
const db = require("../db");
const initializeDatabase = require("../database");

async function upsertUser({ name, email, phone, password, role, location, farmName, approvalStatus = "pending" }) {
    const passwordHash = await bcrypt.hash(password, 12);
    const [rows] = await db.execute(
        `SELECT id FROM users WHERE email = ? LIMIT 1`,
        [email.trim().toLowerCase()]
    );

    if (rows.length) {
        await db.execute(
            `UPDATE users SET name = ?, phone = ?, password = ?, role = ?, location = ?, farm_name = ?, approval_status = ?
             WHERE id = ?`,
            [name, phone, passwordHash, role, location, farmName || null, approvalStatus, rows[0].id]
        );
        return rows[0].id;
    }

    const [result] = await db.execute(
        `INSERT INTO users (name, email, phone, password, role, location, farm_name, approval_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, email.trim().toLowerCase(), phone, passwordHash, role, location, farmName || null, approvalStatus]
    );
    return result.insertId;
}

async function ensureCategory(name, description) {
    const [rows] = await db.execute("SELECT id FROM categories WHERE name = ? LIMIT 1", [name]);
    if (rows.length) return rows[0].id;
    const [result] = await db.execute(
        "INSERT INTO categories (name, description) VALUES (?, ?)",
        [name, description]
    );
    return result.insertId;
}

async function ensureProduct({ farmerId, category, name, description, price, unit, stock, organic, imageUrl }) {
    const [categoryRow] = await db.execute("SELECT id FROM categories WHERE name = ? LIMIT 1", [category]);
    if (!categoryRow.length) {
        throw new Error(`Category not found: ${category}`);
    }

    const [existing] = await db.execute(
        "SELECT id FROM products WHERE farmer_id = ? AND name = ? LIMIT 1",
        [farmerId, name]
    );

    if (existing.length) {
        await db.execute(
            `UPDATE products SET description = ?, price = ?, unit = ?, stock = ?, organic = ?, image_url = ?, category_id = ?
             WHERE id = ?`,
            [description, price, unit, stock, organic ? 1 : 0, imageUrl || null, categoryRow[0].id, existing[0].id]
        );
        return existing[0].id;
    }

    const [result] = await db.execute(
        `INSERT INTO products (farmer_id, category_id, name, description, price, unit, stock, organic, image_url, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [farmerId, categoryRow[0].id, name, description, price, unit, stock, organic ? 1 : 0, imageUrl || null]
    );
    return result.insertId;
}

async function seedDemoData() {
    await initializeDatabase();

    const adminId = await upsertUser({
        name: "Marketplace Admin",
        email: "admin@fieldfork.local",
        phone: "9999999999",
        password: "Admin@123456",
        role: "admin",
        location: "Head Office",
        approvalStatus: "approved"
    });

    const farmerId = await upsertUser({
        name: "Harish Farmer",
        email: "farmer@fieldfork.local",
        phone: "8888888888",
        password: "Farmer@123456",
        role: "farmer",
        location: "Bengaluru",
        farmName: "Green Valley Farms",
        approvalStatus: "approved"
    });

    const customerId = await upsertUser({
        name: "Asha Customer",
        email: "customer@fieldfork.local",
        phone: "7777777777",
        password: "Customer@123456",
        role: "customer",
        location: "Mysuru",
        approvalStatus: "approved"
    });

    const categoryMap = {
        Fruits: await ensureCategory("Fruits", "Fresh local fruit from trusted growers"),
        Vegetables: await ensureCategory("Vegetables", "Seasonal vegetables picked at peak freshness"),
        Seeds: await ensureCategory("Seeds", "Healthy seeds for kitchen and planting"),
        "Dry Fruits": await ensureCategory("Dry Fruits", "Nutritious dried fruit and nuts"),
        "Grains & Pulses": await ensureCategory("Grains & Pulses", "Organic grains and protein-rich pulses"),
        Herbs: await ensureCategory("Herbs", "Fresh aromatic herbs from local farms"),
        Dairy: await ensureCategory("Dairy", "Fresh farm dairy and wholesome staples")
    };

    const productCatalog = [
        { category: "Fruits", name: "Alphonso Mango", description: "Sweet, juicy, and aromatic mangoes picked at peak ripeness.", price: 180, unit: "kg", stock: 22, organic: true, imageUrl: "https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Kesar Mango", description: "Golden-yellow mangoes with rich flavor and premium sweetness.", price: 200, unit: "kg", stock: 20, organic: true, imageUrl: "https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Pomegranate", description: "Ruby-red fruit with juicy seeds and a naturally sweet taste.", price: 210, unit: "kg", stock: 18, organic: true, imageUrl: "https://images.unsplash.com/photo-1543846517-66a2a3b4f26c?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Banana Nendran", description: "Firm, rich, and slightly sweet bananas with a gourmet finish.", price: 65, unit: "dozen", stock: 48, organic: true, imageUrl: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Apple Shimla", description: "Crisp orchard apples with a fresh and naturally vibrant taste.", price: 150, unit: "kg", stock: 26, organic: true, imageUrl: "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Mosambi Orange", description: "Juicy citrus fruit packed with freshness and vitamin C.", price: 90, unit: "kg", stock: 32, organic: true, imageUrl: "https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Guava", description: "Fragrant tropical guavas with a perfect balance of sweetness and tang.", price: 80, unit: "kg", stock: 28, organic: true, imageUrl: "https://images.unsplash.com/photo-1587049352851-8d4e89133924?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Papaya", description: "Soft, sweet, and naturally ripe papaya from local farms.", price: 70, unit: "kg", stock: 24, organic: true, imageUrl: "https://images.unsplash.com/photo-1517282009859-f000ec3b26fe?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Green Grapes", description: "Crisp, sweet grapes picked fresh from the vine.", price: 110, unit: "kg", stock: 20, organic: true, imageUrl: "https://images.unsplash.com/photo-1537640538966-79f369143f8f?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Watermelon", description: "Refreshing, naturally sweet watermelon for sunny days.", price: 35, unit: "kg", stock: 18, organic: true, imageUrl: "" },
        { category: "Fruits", name: "Pineapple", description: "Aromatic pineapple with a bright, tropical sweetness.", price: 75, unit: "piece", stock: 16, organic: true, imageUrl: "https://images.unsplash.com/photo-1550258987-190a2d41a8ba?auto=format&fit=crop&w=900&q=80" },
        { category: "Fruits", name: "Fresh Lemon", description: "Fragrant, tangy lemons for drinks, dressings, and cooking.", price: 85, unit: "kg", stock: 24, organic: true, imageUrl: "https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Farm Tomatoes", description: "Bright, juicy tomatoes packed with sunlight and sweetness.", price: 60, unit: "kg", stock: 30, organic: true, imageUrl: "https://images.unsplash.com/photo-1546094096-0df4bcaaa337?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Organic Spinach", description: "Tender leaves cleaned and packed with leafy goodness.", price: 45, unit: "bundle", stock: 40, organic: true, imageUrl: "https://images.unsplash.com/photo-1576045057995-568f588f82fb?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Red Onion", description: "Fresh, pungent onions ideal for cooking and salads.", price: 50, unit: "kg", stock: 36, organic: true, imageUrl: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Potato", description: "White and earthy potatoes best for curries, fries, and soups.", price: 38, unit: "kg", stock: 42, organic: true, imageUrl: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Green Chili", description: "Fiery green chilies for curries, pickles, and home cooking.", price: 75, unit: "kg", stock: 18, organic: true, imageUrl: "https://images.unsplash.com/photo-1582515073490-39981397c445?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Cucumber", description: "Cool, crunchy cucumbers perfect for salads and juices.", price: 35, unit: "kg", stock: 33, organic: true, imageUrl: "https://images.unsplash.com/photo-1449300076626-285e2ac6b9c7?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Cauliflower", description: "Fresh, wholesome cauliflower heads grown with care.", price: 55, unit: "head", stock: 22, organic: true, imageUrl: "https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Carrot", description: "Sweet and crunchy carrots for salads, soups, and juices.", price: 52, unit: "kg", stock: 26, organic: true, imageUrl: "https://images.unsplash.com/photo-1447175008436-054170c2e979?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Green Beans", description: "Tender, crisp beans ready for stir-fries and home-cooked meals.", price: 70, unit: "kg", stock: 24, organic: true, imageUrl: "https://images.unsplash.com/photo-1567375698348-5d9d5ae99de0?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Brinjal", description: "Glossy farm-fresh brinjal, perfect for curries and roasting.", price: 48, unit: "kg", stock: 21, organic: true, imageUrl: "https://images.unsplash.com/photo-1659261200824-2d15d68d6fcf?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Okra", description: "Young tender okra harvested fresh for everyday cooking.", price: 65, unit: "kg", stock: 19, organic: true, imageUrl: "https://images.unsplash.com/photo-1425543103986-22abb7d7e8d2?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Beetroot", description: "Earthy, naturally sweet beetroots full of color and flavor.", price: 55, unit: "kg", stock: 20, organic: true, imageUrl: "https://images.unsplash.com/photo-1593024154953-9c4c0f5a1f2c?auto=format&fit=crop&w=900&q=80" },
        { category: "Vegetables", name: "Red Capsicum", description: "Bright, crunchy peppers for salads, grills, and stir-fries.", price: 95, unit: "kg", stock: 18, organic: true, imageUrl: "https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Sesame Seeds", description: "Nutty seeds for laddus, cooking, and healthy toppings.", price: 120, unit: "kg", stock: 16, organic: true, imageUrl: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Flax Seeds", description: "Rich in omega-3 and great for smoothies, porridge, and baking.", price: 140, unit: "kg", stock: 14, organic: true, imageUrl: "https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Pumpkin Seeds", description: "Crunchy and protein-rich seeds for healthy snacking.", price: 180, unit: "kg", stock: 12, organic: true, imageUrl: "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Sunflower Seeds", description: "Nutty seeds with a satisfying crunch and natural taste.", price: 130, unit: "kg", stock: 15, organic: true, imageUrl: "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Mustard Seeds", description: "Small but vibrant seeds used for tempering and flavoring dishes.", price: 95, unit: "kg", stock: 20, organic: true, imageUrl: "https://images.unsplash.com/photo-1557844352-761f2565b576?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Fenugreek Seeds", description: "Traditional seeds valued for taste and wellness benefits.", price: 110, unit: "kg", stock: 17, organic: true, imageUrl: "https://images.unsplash.com/photo-1461354464878-ad92f492a5a0?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Chia Seeds", description: "Tiny, versatile seeds for smoothies, puddings, and breakfast bowls.", price: 260, unit: "kg", stock: 12, organic: true, imageUrl: "https://images.unsplash.com/photo-1518843875459-f738682238a6?auto=format&fit=crop&w=900&q=80" },
        { category: "Seeds", name: "Ajwain Seeds", description: "Aromatic carom seeds for seasoning and traditional recipes.", price: 160, unit: "kg", stock: 11, organic: true, imageUrl: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Premium Almonds", description: "Crisp, wholesome almonds with a naturally rich flavor.", price: 320, unit: "kg", stock: 12, organic: true, imageUrl: "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Cashew Nuts", description: "Creamy, sweet cashews perfect for snacking and cooking.", price: 340, unit: "kg", stock: 10, organic: true, imageUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Walnuts", description: "Rich and earthy walnuts with a deep, satisfying taste.", price: 360, unit: "kg", stock: 9, organic: true, imageUrl: "https://images.unsplash.com/photo-1502741338009-cac2772e18bc?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Dates", description: "Naturally sweet and soft dates ideal for energy and desserts.", price: 240, unit: "kg", stock: 14, organic: true, imageUrl: "https://images.unsplash.com/photo-1600180758890-6d3d0a7f7b1c?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Pistachios", description: "Fresh, crunchy pistachios with a delicate and nutty finish.", price: 410, unit: "kg", stock: 11, organic: true, imageUrl: "https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Apricots", description: "Sweet dried apricots packed with natural flavor and goodness.", price: 295, unit: "kg", stock: 13, organic: true, imageUrl: "https://images.unsplash.com/photo-1471193945509-9ad0617afabf?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Dried Figs", description: "Soft, naturally sweet figs for snacks, desserts, and breakfast.", price: 280, unit: "kg", stock: 10, organic: true, imageUrl: "https://images.unsplash.com/photo-1519996529931-28324d7a630e?auto=format&fit=crop&w=900&q=80" },
        { category: "Dry Fruits", name: "Golden Raisins", description: "Sun-dried raisins with a sweet, chewy finish.", price: 190, unit: "kg", stock: 14, organic: true, imageUrl: "https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&w=900&q=80" },
        { category: "Grains & Pulses", name: "Organic Toor Dal", description: "Wholesome, protein-rich pulses for a comforting everyday dal.", price: 145, unit: "kg", stock: 25, organic: true, imageUrl: "https://images.unsplash.com/photo-1515543904379-3d757afe72e4?auto=format&fit=crop&w=900&q=80" },
        { category: "Grains & Pulses", name: "Brown Rice", description: "Naturally nourishing whole-grain rice with a nutty flavor.", price: 95, unit: "kg", stock: 30, organic: true, imageUrl: "https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=900&q=80" },
        { category: "Herbs", name: "Fresh Coriander", description: "Fragrant coriander leaves, freshly harvested for your kitchen.", price: 20, unit: "bunch", stock: 30, organic: true, imageUrl: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=900&q=80" },
        { category: "Herbs", name: "Fresh Mint", description: "Cool, aromatic mint leaves for chutneys, drinks, and salads.", price: 25, unit: "bunch", stock: 26, organic: true, imageUrl: "https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?auto=format&fit=crop&w=900&q=80" },
        { category: "Dairy", name: "Farm Fresh Milk", description: "Fresh, chilled milk delivered from a local dairy farm.", price: 60, unit: "litre", stock: 20, organic: true, imageUrl: "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&q=80" }
    ];

    for (const item of productCatalog) {
        await ensureProduct({
            farmerId,
            category: item.category,
            name: item.name,
            description: item.description,
            price: item.price,
            unit: item.unit,
            stock: item.stock,
            organic: item.organic,
            imageUrl: item.imageUrl
        });
    }

    console.log(`Seeded demo accounts: admin=${adminId}, farmer=${farmerId}, customer=${customerId}`);
    console.log("Demo products added for Green Valley Farms.");
    console.log("Use login: admin@fieldfork.local / Admin@123456");
    console.log("Use login: farmer@fieldfork.local / Farmer@123456");
    console.log("Use login: customer@fieldfork.local / Customer@123456");
}

seedDemoData()
    .catch((error) => {
        console.error("Demo seed failed:", error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
