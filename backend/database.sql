CREATE DATABASE IF NOT EXISTS agri_marketplace
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE agri_marketplace;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('customer', 'farmer', 'admin') NOT NULL DEFAULT 'customer',
    location VARCHAR(255) NOT NULL,
    farm_name VARCHAR(150) NULL,
    bio TEXT NULL,
    approval_status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY users_email_unique (email),
    KEY users_role_approval (role, approval_status)
);

CREATE TABLE IF NOT EXISTS categories (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(80) NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY categories_name_unique (name)
);

CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    farmer_id INT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT NULL,
    price DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(32) NOT NULL DEFAULT 'kg',
    stock DECIMAL(10, 2) NOT NULL DEFAULT 0,
    organic TINYINT(1) NOT NULL DEFAULT 0,
    image_url VARCHAR(1000) NULL,
    active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY products_browse (active, category_id, farmer_id),
    CONSTRAINT products_farmer_fk FOREIGN KEY (farmer_id) REFERENCES users (id),
    CONSTRAINT products_category_fk FOREIGN KEY (category_id) REFERENCES categories (id),
    CONSTRAINT products_price_check CHECK (price > 0),
    CONSTRAINT products_stock_check CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id INT UNSIGNED NOT NULL,
    farmer_id INT UNSIGNED NOT NULL,
    delivery_address VARCHAR(500) NOT NULL,
    delivery_slot VARCHAR(80) NOT NULL,
    total DECIMAL(10, 2) NOT NULL,
    status ENUM('placed', 'confirmed', 'out_for_delivery', 'delivered', 'cancelled')
        NOT NULL DEFAULT 'placed',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY orders_customer (customer_id, created_at),
    KEY orders_farmer (farmer_id, created_at),
    CONSTRAINT orders_customer_fk FOREIGN KEY (customer_id) REFERENCES users (id),
    CONSTRAINT orders_farmer_fk FOREIGN KEY (farmer_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS order_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    product_name VARCHAR(150) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    PRIMARY KEY (id),
    KEY order_items_order (order_id),
    CONSTRAINT order_items_order_fk FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT order_items_product_fk FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT order_items_quantity_check CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS reviews (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id INT UNSIGNED NOT NULL,
    farmer_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY reviews_customer_product_unique (customer_id, product_id),
    KEY reviews_farmer (farmer_id),
    CONSTRAINT reviews_customer_fk FOREIGN KEY (customer_id) REFERENCES users (id),
    CONSTRAINT reviews_farmer_fk FOREIGN KEY (farmer_id) REFERENCES users (id),
    CONSTRAINT reviews_product_fk FOREIGN KEY (product_id) REFERENCES products (id),
    CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS disputes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id INT UNSIGNED NOT NULL,
    customer_id INT UNSIGNED NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status ENUM('open', 'resolved', 'dismissed') NOT NULL DEFAULT 'open',
    admin_note VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    KEY disputes_status (status, created_at),
    CONSTRAINT disputes_order_fk FOREIGN KEY (order_id) REFERENCES orders (id),
    CONSTRAINT disputes_customer_fk FOREIGN KEY (customer_id) REFERENCES users (id)
);

INSERT IGNORE INTO categories (name, description) VALUES
    ('Vegetables', 'Fresh seasonal vegetables'),
    ('Fruits', 'Locally grown fresh fruit'),
    ('Seeds', 'Nutritious seed crops and planting seeds'),
    ('Dry Fruits', 'Healthy dried fruit and nuts'),
    ('Grains & Pulses', 'Staple grains and pulses'),
    ('Dairy', 'Farm-fresh dairy products'),
    ('Herbs', 'Fresh herbs and greens');
