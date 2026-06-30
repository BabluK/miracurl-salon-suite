# Miracurl — Java 8 + Spring Boot + Oracle Reference Backend

> Read-only reference code package. The **live preview** in this environment uses Python FastAPI + MongoDB (see `/app/backend`).
> This Java package is for you to **build and run on your own server** with an Oracle database.

## Stack
- **Java 8** (works with 11+)
- **Spring Boot 2.7.x** (last 2.x supporting Java 8)
- **Spring Security + JWT** (jjwt 0.11.5)
- **Spring Data JPA + Hibernate**
- **Oracle JDBC** (ojdbc8)
- **Maven**

## Layout
```
java-reference/
├── pom.xml
├── README.md
├── schema/
│   └── oracle_schema.sql       <- run on Oracle to create all tables
└── src/main/
    ├── java/com/miracurl/
    │   ├── MiracurlApplication.java
    │   ├── config/
    │   │   ├── SecurityConfig.java
    │   │   └── CorsConfig.java
    │   ├── security/
    │   │   ├── JwtUtil.java
    │   │   ├── JwtAuthFilter.java
    │   │   └── UserDetailsServiceImpl.java
    │   ├── entity/
    │   │   ├── User.java
    │   │   ├── Customer.java
    │   │   ├── Service.java
    │   │   ├── Staff.java
    │   │   ├── Product.java
    │   │   ├── Appointment.java
    │   │   └── Invoice.java
    │   ├── repo/                <- JpaRepository interfaces
    │   ├── controller/
    │   │   ├── AuthController.java
    │   │   ├── CustomerController.java
    │   │   ├── ServiceController.java
    │   │   ├── StaffController.java
    │   │   ├── ProductController.java
    │   │   ├── AppointmentController.java
    │   │   ├── InvoiceController.java
    │   │   └── ReportController.java
    │   └── dto/                  <- request / response DTOs
    └── resources/
        └── application.properties
```

## Setup

### 1. Oracle database
Connect to your Oracle instance and run:
```sql
@schema/oracle_schema.sql
```

This creates tables `users`, `customers`, `services`, `staff`, `products`, `appointments`, `invoices`, `invoice_items`, plus sequences for ID generation, and seeds an admin user.

Default admin (change in `application.properties`):
- **Email:** `admin@miracurl.com`
- **Password:** `Miracurl@123`

### 2. application.properties
Edit `src/main/resources/application.properties` and set:
```
spring.datasource.url=jdbc:oracle:thin:@//<host>:<port>/<service>
spring.datasource.username=<user>
spring.datasource.password=<password>
miracurl.jwt.secret=<random-64-char-hex>
```

### 3. Build & run
```
mvn clean package
java -jar target/miracurl-backend-1.0.0.jar
```

Server starts on **`http://localhost:8001`** with all routes under **`/api`** — matching the React frontend.

## Endpoints (same shape as Python backend)
- POST `/api/auth/login` `/api/auth/register` `/api/auth/logout` `/api/auth/me`
- CRUD `/api/customers` `/api/services` `/api/staff` `/api/products` `/api/appointments`
- POST `/api/invoices` (with auto invoice number, stock decrement, customer loyalty update)
- GET `/api/reports/dashboard` `/api/reports/sales`

All write endpoints require a `Bearer <jwt>` Authorization header.
