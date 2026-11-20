const state = {
    token: sessionStorage.getItem("fieldForkToken") || "",
    user: null,
    cart: new Map(),
    authMode: "login",
    products: [],
    categories: [],
    farmers: []
};

const API_BASE_URL = (() => {
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
    if (localHosts.has(window.location.hostname) && window.location.port !== "5000") {
        return `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    return "";
})();

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const money = (value) => new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
}).format(Number(value) || 0);

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

function toast(message) {
    const element = $("#toast");
    element.textContent = message;
    element.classList.add("visible");
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => element.classList.remove("visible"), 3200);
}

function setMessage(element, message, isError = false) {
    element.textContent = message;
    element.classList.toggle("message-error", isError);
}

async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const response = await fetch(`${API_BASE_URL}${url}`, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";
    const body = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
        if (response.status === 401 && state.token) signOut(false);
        throw new Error(body && body.message ? body.message : "Something went wrong. Please try again.");
    }
    return body;
}

function setUser(user, token) {
    state.user = user;
    state.token = token;
    if (token) sessionStorage.setItem("fieldForkToken", token);
    updateAccountUI();
}

function signOut(showNotice = true) {
    state.user = null;
    state.token = "";
    sessionStorage.removeItem("fieldForkToken");
    updateAccountUI();
    $("#dashboard").classList.add("hidden");
    if (showNotice) toast("You have signed out.");
}

function updateAccountUI() {
    const accountButton = $("#accountButton");
    accountButton.textContent = state.user ? `Hi, ${state.user.name.split(" ")[0]}` : "Sign in";
    $(".nav-dashboard").classList.toggle("hidden", !state.user);
    if (state.user) {
        $("#dashboard").classList.remove("hidden");
        $("#dashboardTitle").textContent = state.user.role === "admin"
            ? "Marketplace overview"
            : state.user.role === "farmer"
                ? `Hello, ${state.user.farmName || state.user.name}`
                : `Welcome, ${state.user.name.split(" ")[0]}`;
        $("#dashboardSubtitle").textContent = state.user.role === "farmer"
            ? "Your farm, your harvest, your community."
            : state.user.role === "admin"
                ? "A little care goes a long way."
                : "Your good food, all in one place.";
        $("#customerDashboard").classList.toggle("hidden", state.user.role !== "customer");
        $("#farmerDashboard").classList.toggle("hidden", state.user.role !== "farmer");
        $("#adminDashboard").classList.toggle("hidden", state.user.role !== "admin");
        loadDashboard().catch((error) => toast(error.message));
    }
}

function toggleAuthFields() {
    const registering = state.authMode === "register";
    const farmer = registering && $("#registerRole").value === "farmer";
    $$(".register-only").forEach((element) => element.classList.toggle("hidden", !registering));
    $$(".farmer-only").forEach((element) => element.classList.toggle("hidden", !farmer));
    $$("#authForm .register-only input, #authForm .register-only select").forEach((field) => {
        field.required = registering && (field.name !== "role");
    });
    $("#authForm [name=farmName]").required = farmer;
    $("#authSubmit").textContent = registering ? "Create your account" : "Sign in";
    $("#authTitle").textContent = registering ? "Come on in." : "Good to see you.";
    $("#authIntro").textContent = registering
        ? "A good thing grows better together."
        : "Sign in to find your local favorites.";
    $$(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authMode === state.authMode));
    $("#authMessage").textContent = "";
}

function showAuth(mode = "login") {
    state.authMode = mode;
    toggleAuthFields();
    $("#authDialog").showModal();
}

async function loadCategories() {
    state.categories = await api("/api/products/categories");
    const options = state.categories.map((category) =>
        `<option value="${category.id}">${escapeHtml(category.name)}</option>`
    ).join("");
    $("#categoryFilter").innerHTML = `<option value="">All categories</option>${options}`;
    $$(".category-options").forEach((select) => {
        select.innerHTML = `<option value="">Choose category</option>${options}`;
    });
}

function selectedFilters() {
    const params = new URLSearchParams();
    const search = $("#searchInput").value.trim();
    const category = $("#categoryFilter").value;
    const location = $("#locationFilter").value.trim();
    const farmer = $("#farmerFilter").value;
    if (search) params.set("q", search);
    if (category) params.set("category", category);
    if (location) params.set("location", location);
    if (farmer) params.set("farmer", farmer);
    if ($("#organicFilter").checked) params.set("organic", "true");
    return params.toString();
}

function filterByCategory(name) {
    const category = state.categories.find((item) =>
        item.name.toLowerCase() === name.toLowerCase()
    );
    if (!category) {
        toast(`The ${name} collection is not available yet.`);
        return;
    }

    $("#searchInput").value = "";
    $("#locationFilter").value = "";
    $("#farmerFilter").value = "";
    $("#categoryFilter").value = String(category.id);
    $("#organicFilter").checked = true;
    $("#shop").scrollIntoView({ behavior: "smooth" });
    loadProducts();
}

function productEmoji(name = "") {
    const word = name.toLowerCase();
    if (word.includes("tomato")) return "🍅";
    if (word.includes("carrot")) return "🥕";
    if (word.includes("apple")) return "🍎";
    if (word.includes("banana")) return "🍌";
    if (word.includes("potato")) return "🥔";
    if (word.includes("onion")) return "🧅";
    if (word.includes("seed") || word.includes("sesame") || word.includes("flax") || word.includes("chia") || word.includes("mustard") || word.includes("fenugreek") || word.includes("ajwain")) return "🌻";
    if (word.includes("almond") || word.includes("cashew") || word.includes("walnut") || word.includes("date") || word.includes("pistachio") || word.includes("apricot") || word.includes("fig") || word.includes("raisin")) return "🥜";
    if (word.includes("mango") || word.includes("fruit") || word.includes("orange") || word.includes("grape") || word.includes("papaya") || word.includes("guava") || word.includes("lemon") || word.includes("watermelon") || word.includes("pineapple") || word.includes("pomegranate")) return "🍎";
    if (word.includes("green") || word.includes("herb") || word.includes("spinach")) return "🌿";
    if (word.includes("milk") || word.includes("cheese")) return "🥛";
    if (word.includes("grain") || word.includes("rice")) return "🌾";
    return "🥬";
}
function categoryPhoto(category = "") {
    const photos = {
        fruits: "https://images.unsplash.com/photo-1610832958506-aa56309c6592?auto=format&fit=crop&w=900&q=85",
        vegetables: "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85",
        seeds: "https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=900&q=85",
        "dry fruits": "https://images.unsplash.com/photo-1596591606975-97ee5cef3a1e?auto=format&fit=crop&w=900&q=85"
    };
    return photos[String(category).toLowerCase()] || photos.vegetables;
}
function safeImage(url = "") {
    if (typeof url !== "string" || !url.trim()) return "";
    try {
        const parsed = new URL(url, window.location.origin);
        return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
        return "";
    }
}

function renderProducts(products) {
    const grid = $("#productGrid");
    if (!products.length) {
        grid.innerHTML = `<div class="empty-state"><span>🌱</span><h3>Nothing in the basket... yet.</h3><p>Try a different search, or check back when the next harvest comes in.</p></div>`;
        return;
    }
    grid.innerHTML = products.map((product) => {
        const image = safeImage(product.imageUrl) || categoryPhoto(product.category);
        const rating = Number(product.rating) > 0
            ? `<span class="rating">★ ${Number(product.rating).toFixed(1)} <small>(${product.reviewCount})</small></span>`
            : `<span class="rating rating-new">New harvest</span>`;
        return `
            <article class="product-card">
                <div class="product-photo ${image ? "has-image" : ""}">
                    <img src="${escapeHtml(image)}" data-fallback-url="${escapeHtml(categoryPhoto(product.category))}" alt="${escapeHtml(product.name)}" loading="lazy">
                    <span class="product-category">${escapeHtml(product.category)}</span>
                    ${product.organic ? '<span class="organic-badge">Organic</span>' : ""}
                </div>
                <div class="product-info">
                    <div class="product-title-row"><h3>${escapeHtml(product.name)}</h3>${rating}</div>
                    <p class="product-farm">From <button type="button" class="inline-link" data-farmer-filter="${product.farmerId}">${escapeHtml(product.farmName || product.farmerName)}</button> · ${escapeHtml(product.farmerLocation)}</p>
                    <p class="product-description">${escapeHtml(product.description || "A lovely seasonal pick, grown close to home.")}</p>
                    <div class="product-buy-row"><p class="product-price">${money(product.price)} <span>/ ${escapeHtml(product.unit)}</span></p><button class="add-button" type="button" data-add-product="${product.id}" aria-label="Add ${escapeHtml(product.name)} to basket">+</button></div>
                    <p class="stock-note">${Number(product.stock)} ${escapeHtml(product.unit)} available</p>
                </div>
            </article>`;
    }).join("");
}

let productSearchTimer;
async function loadProducts() {
    $("#productGrid").innerHTML = '<div class="loading-card">Gathering the harvest...</div>';
    try {
        const query = selectedFilters();
        const products = await api(`/api/products${query ? `?${query}` : ""}`);
        state.products = products;
        renderProducts(products);
    } catch (error) {
        $("#productGrid").innerHTML = `<div class="empty-state"><span>☁</span><h3>We couldn't load the harvest.</h3><p>${escapeHtml(error.message)} Check that the backend is running, then try again.</p><button class="button button-outline" id="retryProducts" type="button">Try again</button></div>`;
    }
}

async function loadFarmers() {
    try {
        state.farmers = await api("/api/farmers");
        $("#farmerFilter").innerHTML = `<option value="">All farmers</option>${state.farmers.map((farmer) =>
            `<option value="${farmer.id}">${escapeHtml(farmer.farmName || farmer.name)}</option>`
        ).join("")}`;
        $("#farmerGrid").innerHTML = state.farmers.length
            ? state.farmers.map((farmer) => `
                <article class="farmer-card">
                    <div class="farmer-avatar" aria-hidden="true">${escapeHtml((farmer.farmName || farmer.name).slice(0, 1).toUpperCase())}</div>
                    <div class="farmer-card-main"><p class="eyebrow">${escapeHtml(farmer.location)}</p><h3>${escapeHtml(farmer.farmName || farmer.name)}</h3><p class="farmer-owner">A farm by ${escapeHtml(farmer.name)}</p><p class="farmer-bio">${escapeHtml(farmer.bio || "Growing fresh, seasonal food for our local community.")}</p><div class="farmer-meta"><span>${Number(farmer.productCount)} products</span><span>${Number(farmer.rating) ? `★ ${Number(farmer.rating).toFixed(1)} · ${farmer.reviewCount} reviews` : "New to the market"}</span></div><button class="text-link" type="button" data-farmer-filter="${farmer.id}">Shop this farm <span aria-hidden="true">→</span></button></div>
                </article>`).join("")
            : '<div class="empty-state"><span>🌱</span><h3>Our farmers are getting ready.</h3><p>Check back soon for fresh local harvests.</p></div>';
    } catch (error) {
        $("#farmerGrid").innerHTML = `<div class="empty-state"><p>${escapeHtml(error.message)}</p></div>`;
    }
}

function cartItemCount() {
    return [...state.cart.values()].reduce((sum, item) => sum + item.quantity, 0);
}

function renderCart() {
    $("#cartCount").textContent = cartItemCount();
    const items = [...state.cart.values()];
    $("#cartItems").innerHTML = items.length
        ? items.map(({ product, quantity }) => `
            <div class="cart-row">
                <span class="cart-emoji">${productEmoji(product.name)}</span>
                <div class="cart-item-name"><strong>${escapeHtml(product.name)}</strong><small>${money(product.price)} / ${escapeHtml(product.unit)}</small></div>
                <div class="quantity-control"><button type="button" data-cart-change="${product.id}" data-change="-1" aria-label="Remove one">−</button><span>${quantity}</span><button type="button" data-cart-change="${product.id}" data-change="1" aria-label="Add one">+</button></div>
                <strong class="cart-item-total">${money(Number(product.price) * quantity)}</strong>
            </div>`).join("")
        : '<div class="empty-basket"><span>🧺</span><p>Your basket is waiting for something good.</p></div>';
    const total = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    $("#cartTotal").textContent = money(total);
    $("#checkoutButton").disabled = !items.length;
    $("#cartMessage").textContent = "";
}

function addToCart(id) {
    const product = state.products.find((item) => item.id === Number(id));
    if (!product) return;
    const current = state.cart.get(product.id);
    if ((current?.quantity || 0) >= Number(product.stock)) {
        toast("That's all the available stock for this harvest.");
        return;
    }
    state.cart.set(product.id, { product, quantity: (current?.quantity || 0) + 1 });
    renderCart();
    toast(`${product.name} added to your basket.`);
}

function normalizeOrderItems(items) {
    if (typeof items === "string") {
        try { return JSON.parse(items); } catch { return []; }
    }
    return Array.isArray(items) ? items : [];
}

function statusLabel(status) {
    return String(status).replaceAll("_", " ");
}

function renderOrders(orders, target, type) {
    target.innerHTML = orders.length ? orders.map((order) => {
        const items = normalizeOrderItems(order.items);
        let actions = "";
        if (type === "customer" && order.status === "placed") {
            actions += `<button class="button button-outline button-small" data-order-action="cancel" data-order-id="${order.id}">Cancel order</button>`;
        }
        if (type === "customer" && order.status === "delivered") {
            actions += items.map((item) => `<button class="button button-outline button-small" data-order-action="review" data-order-id="${order.id}" data-product-id="${item.productId}">Rate ${escapeHtml(item.name)}</button>`).join("");
        }
        if (type === "customer" && !["cancelled"].includes(order.status)) {
            actions += `<button class="text-link" data-order-action="dispute" data-order-id="${order.id}">Need help?</button>`;
        }
        if (type === "farmer") {
            const next = { placed: ["confirmed", "cancelled"], confirmed: ["out_for_delivery", "cancelled"], out_for_delivery: ["delivered"] }[order.status] || [];
            actions += next.map((status) => `<button class="button ${status === "cancelled" ? "button-outline" : "button-green"} button-small" data-order-action="${status}" data-order-id="${order.id}">${status === "out_for_delivery" ? "Mark on the way" : status === "confirmed" ? "Accept order" : status === "delivered" ? "Mark delivered" : "Cancel"}</button>`).join("");
        }
        const amount = `<span class="order-total">${money(order.total)}</span>`;
        return `<article class="order-card">
            <div class="order-topline"><div><p class="eyebrow">ORDER #${order.id} · ${new Date(order.createdAt).toLocaleDateString("en-IN")}</p><h4>${type === "farmer" ? `For ${escapeHtml(order.customerName)}` : `From ${escapeHtml(order.farmName || "local farm")}`}</h4></div><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span></div>
            <p class="order-items">${items.map((item) => `${escapeHtml(item.name)} × ${Number(item.quantity)} ${escapeHtml(item.unit)}`).join(" · ")}</p>
            <div class="order-meta"><span>${escapeHtml(order.deliverySlot)}</span>${amount}</div>
            ${type === "farmer" ? `<p class="order-address">Deliver to: ${escapeHtml(order.deliveryAddress)}</p>` : ""}
            ${actions ? `<div class="order-actions">${actions}</div>` : ""}
        </article>`;
    }).join("") : '<div class="empty-inline"><span>🌿</span><p>No orders to show yet. A good meal starts in the shop.</p><a class="text-link" href="#shop">Browse the harvest →</a></div>';
}

function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
}

async function loadDashboard() {
    if (!state.user) return;
    if (state.user.role === "customer") {
        const orders = await api("/api/orders/mine");
        renderOrders(orders, $("#customerOrders"), "customer");
    } else if (state.user.role === "farmer") {
        const user = state.user;
        const profile = $("#profileForm");
        for (const [field, value] of Object.entries({
            name: user.name, farmName: user.farmName || "", phone: user.phone,
            location: user.location, bio: user.bio || ""
        })) profile.elements[field].value = value || "";

        const notice = $("#approvalNotice");
        notice.classList.toggle("hidden", user.approvalStatus === "approved");
        notice.textContent = user.approvalStatus === "rejected"
            ? "Your farmer application was not approved. Please contact our team if you think this is a mistake."
            : "Your farm profile is in review. You can prepare your product listings now; customers will see them once an admin approves your farm.";
        $("#productForm").querySelectorAll("input, select, textarea, button").forEach((field) => {
            field.disabled = user.approvalStatus !== "approved";
        });
        const [products, orders] = await Promise.all([
            api("/api/products/mine"),
            api("/api/orders/mine")
        ]);
        $("#farmerProducts").innerHTML = products.length ? products.map((product) => `
            <article class="product-manage-row">
                <span class="manage-emoji">${productEmoji(product.name)}</span>
                <div class="manage-main"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category)} · ${money(product.price)} / ${escapeHtml(product.unit)}</small></div>
                <label class="stock-editor">Stock<input type="number" min="0" step="0.1" value="${Number(product.stock)}" data-stock-input="${product.id}"></label>
                <span class="status-pill ${product.active ? "status-approved" : "status-cancelled"}">${product.active ? "Listed" : "Hidden"}</span>
                <button class="button button-outline button-small" data-product-action="${product.active ? "hide" : "show"}" data-product-id="${product.id}">${product.active ? "Hide" : "Show"}</button>
                <button class="icon-button danger-icon" data-product-action="delete" data-product-id="${product.id}" aria-label="Remove product">×</button>
            </article>`).join("") : '<div class="empty-inline"><p>Your farm stand is waiting for its first listing.</p></div>';
        renderOrders(orders, $("#farmerOrders"), "farmer");
    } else if (state.user.role === "admin") {
        const [overview, farmers, categories, orders, disputes] = await Promise.all([
            api("/api/admin/overview"),
            api(`/api/admin/farmers?status=${$("#farmerStatusFilter").value}`),
            api("/api/admin/categories"),
            api("/api/admin/orders"),
            api("/api/admin/disputes")
        ]);
        $("#adminStats").innerHTML = [
            ["Local farmers", overview.farmers], ["Customers", overview.customers],
            ["Products", overview.products], ["Orders", overview.orders],
            ["Needs approval", overview.pendingFarmers], ["Sales in progress", money(overview.sales)]
        ].map(([label, value]) => `<article class="stat-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
        $("#adminFarmers").innerHTML = farmers.length ? farmers.map((farmer) => `
            <article class="admin-farmer-row"><div class="manage-main"><strong>${escapeHtml(farmer.farmName || farmer.name)}</strong><small>${escapeHtml(farmer.name)} · ${escapeHtml(farmer.email)} · ${escapeHtml(farmer.location)}</small></div><span class="status-pill status-${escapeHtml(farmer.approvalStatus)}">${escapeHtml(farmer.approvalStatus)}</span>${farmer.approvalStatus !== "approved" ? `<button class="button button-green button-small" data-farmer-action="approved" data-farmer-id="${farmer.id}">Approve</button>` : ""}${farmer.approvalStatus !== "rejected" ? `<button class="button button-outline button-small" data-farmer-action="rejected" data-farmer-id="${farmer.id}">Reject</button>` : ""}</article>`).join("") : '<div class="empty-inline"><p>No applications in this group.</p></div>';
        $("#adminCategories").innerHTML = categories.map((category) => `<article class="category-row"><span><strong>${escapeHtml(category.name)}</strong><small>${Number(category.productCount)} products</small></span><button class="icon-button danger-icon" data-category-delete="${category.id}" aria-label="Delete ${escapeHtml(category.name)}">×</button></article>`).join("");
        $("#adminOrders").innerHTML = orders.length ? orders.map((order) => `<article class="admin-order-row"><div class="manage-main"><strong>Order #${order.id} · ${money(order.total)}</strong><small>${escapeHtml(order.customerName)} → ${escapeHtml(order.farmName)}</small></div><span class="status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusLabel(order.status))}</span></article>`).join("") : '<div class="empty-inline"><p>No orders yet.</p></div>';
        $("#adminDisputes").innerHTML = disputes.length ? disputes.map((dispute) => `<article class="dispute-card"><div class="order-topline"><strong>Order #${dispute.orderId} · ${escapeHtml(dispute.customerName)}</strong><span class="status-pill status-${escapeHtml(dispute.status)}">${escapeHtml(dispute.status)}</span></div><p>${escapeHtml(dispute.reason)}</p>${dispute.adminNote ? `<small>Admin note: ${escapeHtml(dispute.adminNote)}</small>` : ""}${dispute.status === "open" ? `<div class="order-actions"><button class="button button-green button-small" data-dispute-action="resolved" data-dispute-id="${dispute.id}">Resolve</button><button class="button button-outline button-small" data-dispute-action="dismissed" data-dispute-id="${dispute.id}">Dismiss</button></div>` : ""}</article>`).join("") : '<div class="empty-inline"><p>No customer issues. Things are looking good.</p></div>';
    }
}

function openDashboard() {
    if (!state.user) return showAuth();
    $("#dashboard").classList.remove("hidden");
    $("#dashboard").scrollIntoView({ behavior: "smooth" });
    loadDashboard().catch((error) => toast(error.message));
}

async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = $("#authMessage");
    const values = formValues(form);
    const payload = state.authMode === "login"
        ? { email: values.email, password: values.password }
        : {
            name: values.name,
            email: values.email,
            phone: values.phone,
            password: values.password,
            location: values.location,
            role: values.role,
            farmName: values.farmName,
            bio: values.bio
        };
    $("#authSubmit").disabled = true;
    try {
        const result = await api(`/api/auth/${state.authMode === "login" ? "login" : "register"}`, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        setUser(result.user, result.token);
        $("#authDialog").close();
        form.reset();
        toast(result.message || "You're all set.");
        if (state.user.role === "customer") openDashboard();
    } catch (error) {
        setMessage(message, error.message, true);
    } finally {
        $("#authSubmit").disabled = false;
    }
}

async function checkout(event) {
    event.preventDefault();
    if (!state.user) {
        $("#cartDialog").close();
        showAuth("login");
        toast("Sign in as a customer to place your order.");
        return;
    }
    if (state.user.role !== "customer") {
        setMessage($("#cartMessage"), "Checkout is available with a customer account.", true);
        return;
    }
    const form = event.currentTarget;
    const fields = formValues(form);
    $("#checkoutButton").disabled = true;
    try {
        const result = await api("/api/orders", {
            method: "POST",
            body: JSON.stringify({
                items: [...state.cart.values()].map(({ product, quantity }) => ({ productId: product.id, quantity })),
                deliveryAddress: fields.deliveryAddress,
                deliverySlot: fields.deliverySlot
            })
        });
        state.cart.clear();
        renderCart();
        form.reset();
        $("#cartDialog").close();
        toast(result.message);
        openDashboard();
        await loadProducts();
    } catch (error) {
        setMessage($("#cartMessage"), error.message, true);
    } finally {
        $("#checkoutButton").disabled = false;
    }
}

async function handleDashboardClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    try {
        if (button.dataset.orderAction) {
            const action = button.dataset.orderAction;
            if (action === "dispute") {
                const reason = window.prompt("Tell us what went wrong with this order:");
                if (!reason) return;
                await api(`/api/orders/${button.dataset.orderId}/disputes`, {
                    method: "POST", body: JSON.stringify({ reason })
                });
            } else if (action === "review") {
                const rating = Number(window.prompt("Rate this product from 1 to 5 stars:"));
                if (!Number.isInteger(rating) || rating < 1 || rating > 5) return toast("Please enter a rating from 1 to 5.");
                const comment = window.prompt("Add a short note (optional):") || "";
                await api(`/api/orders/${button.dataset.orderId}/reviews`, {
                    method: "POST",
                    body: JSON.stringify({ productId: Number(button.dataset.productId), rating, comment })
                });
            } else {
                await api(`/api/orders/${button.dataset.orderId}/status`, {
                    method: "PATCH", body: JSON.stringify({ status: action })
                });
            }
            toast("All done. Thanks for keeping things growing.");
            await loadDashboard();
        } else if (button.dataset.productAction) {
            const id = button.dataset.productId;
            if (button.dataset.productAction === "delete") {
                if (!window.confirm("Remove this product from your farm stand?")) return;
                await api(`/api/products/${id}`, { method: "DELETE" });
            } else if (button.dataset.productAction === "stock") {
                const stock = Number($(`[data-stock-input="${id}"]`).value);
                await api(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify({ stock }) });
            } else {
                await api(`/api/products/${id}`, {
                    method: "PATCH", body: JSON.stringify({ active: button.dataset.productAction === "show" })
                });
            }
            toast("Your farm stand has been updated.");
            await loadDashboard();
            await loadProducts();
        } else if (button.dataset.farmerAction) {
            await api(`/api/admin/farmers/${button.dataset.farmerId}/approval`, {
                method: "PATCH", body: JSON.stringify({ status: button.dataset.farmerAction })
            });
            toast("Farmer application updated.");
            await loadDashboard();
            await loadFarmers();
        } else if (button.dataset.categoryDelete) {
            if (!window.confirm("Remove this category? Categories with products cannot be removed.")) return;
            await api(`/api/admin/categories/${button.dataset.categoryDelete}`, { method: "DELETE" });
            await loadDashboard();
            await loadCategories();
        } else if (button.dataset.disputeAction) {
            await api(`/api/admin/disputes/${button.dataset.disputeId}`, {
                method: "PATCH", body: JSON.stringify({ status: button.dataset.disputeAction })
            });
            await loadDashboard();
        }
    } catch (error) {
        toast(error.message);
    }
}

async function bootstrap() {
    $("#productGrid").addEventListener("error", (event) => {
        const image = event.target.closest("img");
        if (!image) return;
        if (!image.dataset.categoryFallbackTried && image.dataset.fallbackUrl && image.src !== image.dataset.fallbackUrl) {
            image.dataset.categoryFallbackTried = "true";
            image.src = image.dataset.fallbackUrl;
            return;
        }
        const photo = image.closest(".product-photo");
        const fallback = document.createElement("span");
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = productEmoji(image.alt);
        photo.classList.remove("has-image");
        image.replaceWith(fallback);
    }, true);
    $("#collections").addEventListener("click", (event) => {
        const categoryButton = event.target.closest("[data-category-name]");
        if (categoryButton) filterByCategory(categoryButton.dataset.categoryName);
    });
    $("#productGrid").addEventListener("click", (event) => {
        const addButton = event.target.closest("[data-add-product]");
        const farmerButton = event.target.closest("[data-farmer-filter]");
        if (addButton) addToCart(addButton.dataset.addProduct);
        if (farmerButton) {
            $("#farmerFilter").value = farmerButton.dataset.farmerFilter;
            $("#shop").scrollIntoView({ behavior: "smooth" });
            loadProducts();
        }
    });
    $("#farmerGrid").addEventListener("click", (event) => {
        const farmerButton = event.target.closest("[data-farmer-filter]");
        if (!farmerButton) return;
        $("#farmerFilter").value = farmerButton.dataset.farmerFilter;
        $("#shop").scrollIntoView({ behavior: "smooth" });
        loadProducts();
    });
    $("#productGrid").addEventListener("click", (event) => {
        if (event.target.closest("#retryProducts")) loadProducts();
    });
    $("#dashboard").addEventListener("click", handleDashboardClick);
    $("#cartItems").addEventListener("click", (event) => {
        const button = event.target.closest("[data-cart-change]");
        if (!button) return;
        const id = Number(button.dataset.cartChange);
        const item = state.cart.get(id);
        if (!item) return;
        const quantity = item.quantity + Number(button.dataset.change);
        if (quantity <= 0) state.cart.delete(id);
        else if (quantity <= Number(item.product.stock)) state.cart.set(id, { ...item, quantity });
        else return toast("That is more than the available harvest.");
        renderCart();
    });
    $("#searchInput").addEventListener("input", () => {
        window.clearTimeout(productSearchTimer);
        productSearchTimer = window.setTimeout(loadProducts, 250);
    });
    ["categoryFilter", "locationFilter", "farmerFilter", "organicFilter"].forEach((id) =>
        $(`#${id}`).addEventListener(id === "locationFilter" ? "input" : "change", loadProducts)
    );
    $("#accountButton").addEventListener("click", () => state.user ? openDashboard() : showAuth());
    $(".nav-dashboard").addEventListener("click", (event) => { event.preventDefault(); openDashboard(); });
    $("#signOutButton").addEventListener("click", () => signOut());
    $("#farmerJoinButton").addEventListener("click", () => {
        showAuth("register");
        $("#registerRole").value = "farmer";
        toggleAuthFields();
    });
    $("#headerFarmerJoinButton").addEventListener("click", () => {
        showAuth("register");
        $("#registerRole").value = "farmer";
        toggleAuthFields();
    });
    $$(".cart-open").forEach((button) => button.addEventListener("click", () => $("#cartDialog").showModal()));
    $("#authForm").addEventListener("submit", handleAuthSubmit);
    $("#checkoutForm").addEventListener("submit", checkout);
    $$(".auth-tab").forEach((tab) => tab.addEventListener("click", () => {
        state.authMode = tab.dataset.authMode;
        toggleAuthFields();
    }));
    $("#registerRole").addEventListener("change", toggleAuthFields);
    $("#profileForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            const result = await api("/api/farmers/profile/me", {
                method: "PATCH", body: JSON.stringify(formValues(event.currentTarget))
            });
            toast(result.message);
            const account = await api("/api/auth/me");
            setUser(account.user, state.token);
        } catch (error) {
            toast(error.message);
        }
    });
    $("#productForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = formValues(form);
        try {
            const result = await api("/api/products", {
                method: "POST",
                body: JSON.stringify({ ...values, categoryId: Number(values.categoryId), price: Number(values.price), stock: Number(values.stock), organic: form.elements.organic.checked })
            });
            toast(result.message);
            form.reset();
            form.elements.unit.value = "kg";
            await loadDashboard();
            await loadProducts();
        } catch (error) {
            toast(error.message);
        }
    });
    $("#farmerProducts").addEventListener("change", async (event) => {
        const input = event.target.closest("[data-stock-input]");
        if (!input) return;
        try {
            await api(`/api/products/${input.dataset.stockInput}`, {
                method: "PATCH", body: JSON.stringify({ stock: Number(input.value) })
            });
            toast("Stock updated.");
            await loadProducts();
        } catch (error) {
            toast(error.message);
        }
    });
    $("#farmerStatusFilter").addEventListener("change", () => loadDashboard().catch((error) => toast(error.message)));
    $("#categoryForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        try {
            await api("/api/admin/categories", { method: "POST", body: JSON.stringify(formValues(event.currentTarget)) });
            event.currentTarget.reset();
            await loadDashboard();
            await loadCategories();
            toast("Category added.");
        } catch (error) {
            toast(error.message);
        }
    });

    renderCart();
    await Promise.all([loadCategories(), loadFarmers()]);
    await loadProducts();
    if (state.token) {
        try {
            const result = await api("/api/auth/me");
            state.user = result.user;
            updateAccountUI();
        } catch {
            signOut(false);
        }
    }
}

bootstrap().catch((error) => toast(error.message));
