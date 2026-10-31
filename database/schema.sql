-- =========================================================
--  Pastelería Mafer · Esquema MySQL 8+
--  Uso: mysql -u root -p < database/schema.sql
-- =========================================================
CREATE DATABASE IF NOT EXISTS mafer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mafer;

CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80) NOT NULL,
  slug       VARCHAR(80) NOT NULL UNIQUE,
  emoji      VARCHAR(16) DEFAULT '🍰',
  sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category_id  INT NULL,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  price        DECIMAL(10,2) NOT NULL,
  image        VARCHAR(255) DEFAULT '/img/products/placeholder.svg',
  prep_minutes INT DEFAULT 30,
  featured     TINYINT(1) DEFAULT 0,
  available    TINYINT(1) DEFAULT 1,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  code              VARCHAR(12) NOT NULL UNIQUE,
  customer_name     VARCHAR(120) NOT NULL,
  customer_phone    VARCHAR(30)  NOT NULL,
  customer_email    VARCHAR(150),
  delivery_type     ENUM('delivery','pickup') NOT NULL DEFAULT 'delivery',
  address           VARCHAR(255),
  address_notes     VARCHAR(255),
  payment_method    ENUM('card','cash') NOT NULL DEFAULT 'card',
  payment_status    ENUM('pending','paid','failed','refunded') NOT NULL DEFAULT 'pending',
  status            ENUM('pending','received','preparing','on_the_way','ready','delivered','cancelled') NOT NULL DEFAULT 'pending',
  subtotal          DECIMAL(10,2) NOT NULL,
  delivery_fee      DECIMAL(10,2) NOT NULL DEFAULT 0,
  tip               DECIMAL(10,2) NOT NULL DEFAULT 0,
  total             DECIMAL(10,2) NOT NULL,
  stripe_session_id VARCHAR(255),
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_orders_status (status),
  INDEX idx_orders_session (stripe_session_id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  product_id   INT NULL,
  product_name VARCHAR(120) NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  quantity     INT NOT NULL,
  notes        VARCHAR(255),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   INT NOT NULL,
  status     VARCHAR(30) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- ---------- Datos de ejemplo ----------
INSERT IGNORE INTO categories (id, name, slug, emoji, sort_order) VALUES
  (1, 'Pasteles',   'pasteles',   '🎂', 1),
  (2, 'Cupcakes',   'cupcakes',   '🧁', 2),
  (3, 'Galletas',   'galletas',   '🍪', 3),
  (4, 'Postres',    'postres',    '🍮', 4),
  (5, 'Bebidas',    'bebidas',    '☕', 5);

-- Los productos se suben desde el panel de administrador (/admin/) con tus propias fotos.
