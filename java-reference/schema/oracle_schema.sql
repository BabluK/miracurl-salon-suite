-- ============================================================
-- Miracurl Salon Management - Oracle Schema
-- Run with: sqlplus user/pass@db @oracle_schema.sql
-- ============================================================

-- Drop existing
BEGIN FOR r IN (
  SELECT table_name FROM user_tables
  WHERE table_name IN ('INVOICE_ITEMS','INVOICES','APPOINTMENTS','APPOINTMENT_SERVICES',
                       'PRODUCTS','STAFF','SERVICES','CUSTOMERS','USERS','LOGIN_ATTEMPTS','PASSWORD_RESET_TOKENS')
) LOOP EXECUTE IMMEDIATE 'DROP TABLE ' || r.table_name || ' CASCADE CONSTRAINTS'; END LOOP;
EXCEPTION WHEN OTHERS THEN NULL; END;
/

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id            VARCHAR2(36) PRIMARY KEY,
  email         VARCHAR2(200) NOT NULL UNIQUE,
  password_hash VARCHAR2(200) NOT NULL,
  name          VARCHAR2(150) NOT NULL,
  role          VARCHAR2(30)  DEFAULT 'staff',
  created_at    TIMESTAMP     DEFAULT SYSTIMESTAMP
);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE customers (
  id              VARCHAR2(36) PRIMARY KEY,
  name            VARCHAR2(150) NOT NULL,
  phone           VARCHAR2(20)  NOT NULL,
  email           VARCHAR2(200),
  gender          VARCHAR2(10)  DEFAULT 'Other',
  dob             DATE,
  address         VARCHAR2(500),
  loyalty_points  NUMBER(10,0) DEFAULT 0,
  total_spent     NUMBER(12,2) DEFAULT 0,
  visits          NUMBER(10,0) DEFAULT 0,
  notes           VARCHAR2(1000),
  created_at      TIMESTAMP    DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_customers_phone ON customers(phone);

-- ============================================================
-- SERVICES
-- ============================================================
CREATE TABLE services (
  id            VARCHAR2(36) PRIMARY KEY,
  name          VARCHAR2(150) NOT NULL,
  category      VARCHAR2(50)  NOT NULL,
  price         NUMBER(10,2)  NOT NULL,
  duration_min  NUMBER(5,0)   NOT NULL,
  description   VARCHAR2(1000),
  image_url     VARCHAR2(500),
  trending      NUMBER(1,0)   DEFAULT 0,
  active        NUMBER(1,0)   DEFAULT 1
);

-- ============================================================
-- STAFF
-- ============================================================
CREATE TABLE staff (
  id              VARCHAR2(36) PRIMARY KEY,
  name            VARCHAR2(150) NOT NULL,
  role            VARCHAR2(80)  NOT NULL,
  phone           VARCHAR2(20)  NOT NULL,
  email           VARCHAR2(200),
  specialties     VARCHAR2(500),
  commission_pct  NUMBER(5,2)   DEFAULT 10.0,
  active          NUMBER(1,0)   DEFAULT 1,
  image_url       VARCHAR2(500),
  joining_date    DATE          DEFAULT SYSDATE
);

-- ============================================================
-- PRODUCTS (Inventory)
-- ============================================================
CREATE TABLE products (
  id                   VARCHAR2(36) PRIMARY KEY,
  name                 VARCHAR2(200) NOT NULL,
  brand                VARCHAR2(100),
  category             VARCHAR2(80)  NOT NULL,
  sku                  VARCHAR2(80)  NOT NULL UNIQUE,
  price                NUMBER(10,2)  NOT NULL,
  cost                 NUMBER(10,2)  NOT NULL,
  stock                NUMBER(10,0)  NOT NULL,
  low_stock_threshold  NUMBER(10,0)  DEFAULT 5,
  image_url            VARCHAR2(500)
);

-- ============================================================
-- APPOINTMENTS
-- ============================================================
CREATE TABLE appointments (
  id            VARCHAR2(36) PRIMARY KEY,
  customer_id   VARCHAR2(36) REFERENCES customers(id),
  customer_name VARCHAR2(150),
  staff_id      VARCHAR2(36) REFERENCES staff(id),
  staff_name    VARCHAR2(150),
  service_ids   VARCHAR2(2000),  -- comma separated
  service_names VARCHAR2(2000),
  scheduled_at  TIMESTAMP NOT NULL,
  duration_min  NUMBER(5,0)  DEFAULT 30,
  status        VARCHAR2(20) DEFAULT 'scheduled',
  notes         VARCHAR2(1000),
  total         NUMBER(12,2) DEFAULT 0,
  created_at    TIMESTAMP    DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_appts_when ON appointments(scheduled_at);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE invoices (
  id            VARCHAR2(36) PRIMARY KEY,
  invoice_no    VARCHAR2(50) UNIQUE,
  customer_id   VARCHAR2(36) REFERENCES customers(id),
  customer_name VARCHAR2(150),
  staff_id      VARCHAR2(36) REFERENCES staff(id),
  staff_name    VARCHAR2(150),
  subtotal      NUMBER(12,2),
  discount      NUMBER(12,2) DEFAULT 0,
  tax           NUMBER(12,2) DEFAULT 0,
  total         NUMBER(12,2),
  payment_mode  VARCHAR2(20) DEFAULT 'cash',
  paid          NUMBER(1,0)  DEFAULT 1,
  created_at    TIMESTAMP    DEFAULT SYSTIMESTAMP
);
CREATE INDEX idx_invoices_when ON invoices(created_at);

CREATE TABLE invoice_items (
  id          NUMBER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  invoice_id  VARCHAR2(36) REFERENCES invoices(id) ON DELETE CASCADE,
  item_type   VARCHAR2(20),    -- service | product
  ref_id      VARCHAR2(36),
  name        VARCHAR2(200),
  qty         NUMBER(8,0) DEFAULT 1,
  price       NUMBER(10,2)
);

-- ============================================================
-- AUTH HELPER TABLES
-- ============================================================
CREATE TABLE login_attempts (
  identifier   VARCHAR2(300) PRIMARY KEY,
  attempt_cnt  NUMBER(5,0)  DEFAULT 0,
  locked_until TIMESTAMP,
  last_attempt TIMESTAMP
);
CREATE TABLE password_reset_tokens (
  token       VARCHAR2(120) PRIMARY KEY,
  user_id     VARCHAR2(36),
  expires_at  TIMESTAMP,
  used        NUMBER(1,0) DEFAULT 0
);

-- ============================================================
-- SEED ADMIN  (BCrypt hash of "Miracurl@123")
-- ============================================================
INSERT INTO users(id, email, password_hash, name, role)
VALUES (
  SYS_GUID(), 'admin@miracurl.com',
  '$2a$10$5XJqzZ9DqQpVxAr0bP1Yw.eu5oH4t.5jHj7CqDb1mB6f3a4o5Vu5q',
  'Salon Admin', 'admin'
);
COMMIT;
