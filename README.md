# Natura Market — Farmer-to-Consumer Marketplace

A local marketplace that connects customers to nearby farms. Customers can browse and filter harvests, place orders, follow delivery progress, and review delivered products. Farmers manage their profile, listings, stock, and orders. Admins approve farms, manage categories, review orders, and handle support disputes.

## Requirements

- Node.js 18 or newer
- MySQL 8.0 or newer, running on port 3306
- A MySQL account that can create tables in `agri_marketplace`

## Run locally

1. Start MySQL. Keep its credentials in `backend/.env`; do not commit that file.
2. Make sure `backend/.env` contains:

   ```env
   PORT=5000
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=agri_marketplace
   JWT_SECRET=a_random_secret_with_at_least_32_characters
   ```

   Generate a JWT secret in PowerShell with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. Install backend dependencies and create or update the database tables:

   ```powershell
   cd "C:\Users\Shalini B A\Desktop\Agri marketplace\backend"
   npm.cmd install
   npm.cmd run db:setup
   ```

   The setup is safe to rerun. It creates the marketplace tables, adds missing profile fields to an existing `users` table, and seeds starter categories. It does not erase existing data.

4. Create the first admin account. Use a unique email and a strong password of at least 12 characters:

   ```powershell
   npm.cmd run admin:create -- admin@example.com "Use-A-Unique-Password-Here" "Marketplace Admin"
   ```

5. Optional: load demo accounts and an organic sample catalog covering fruits, vegetables, seeds, dry fruits, grains, herbs, and dairy:

   ```powershell
   npm.cmd run demo:accounts
   ```

   Demo sign-ins:
   - Admin: `admin@fieldfork.local` / `Admin@123456`
   - Farmer: `farmer@fieldfork.local` / `Farmer@123456`
   - Customer: `customer@fieldfork.local` / `Customer@123456`

   These are public demo credentials. Use them only for local testing, never on a public deployment. The demo command resets these demo accounts' passwords when run again.

6. Start the website and API:

   ```powershell
   npm.cmd start
   ```

7. Open **http://localhost:5000**. Alternatively, start VS Code Live Server from the project root and open its URL (usually **http://localhost:5500**); the frontend automatically sends API requests to the backend on port 5000. Keep the backend running in either case. If you set `CORS_ORIGIN` in `backend/.env`, include the Live Server origin (for example, `http://localhost:5500`). Do not open the HTML file directly or visit an API registration URL to use the website. `GET /api/farmers/register` is not a page; registration accepts `POST`.

Check **http://localhost:5000/api/health** and **http://localhost:5000/api/test-db** if the app does not load.

Run the end-to-end API smoke test from a second terminal while the server is running:

```powershell
cd "C:\Users\Shalini B A\Desktop\Agri marketplace\backend"
npm.cmd run test:smoke
```

The test creates uniquely named temporary accounts, product, order, review, and support request records, then removes them. Do not run it against a production database.

## Publish a public website on Railway

`localhost` is only visible on your computer. To make this marketplace available on the internet, deploy it to a hosting provider. Railway is configured for this project, but the owner of the Railway account must authorize and start the upload. A hosting account and database may incur charges; review Railway's current plan and pricing before deploying.

The Railway CLI uploads project source code to Railway. The root `.gitignore`, `.railwayignore`, and `.dockerignore` files exclude the local `backend/.env` and `node_modules`. Never use `railway up --no-gitignore`, and never paste local database passwords into a public repository.

1. Sign in at [Railway](https://railway.com/), create an **Empty Project**, and add a **MySQL** service from the project canvas.
2. From the project canvas, add an **Empty Service** for the marketplace app and name it `marketplace-web`.
3. In PowerShell, install and sign in to the Railway CLI:

   ```powershell
   npm.cmd install --global @railway/cli
   railway login
   ```

4. Link this folder to the Railway project and `marketplace-web` service, then deploy the Dockerfile:

   ```powershell
   cd "C:\Users\Shalini B A\Desktop\Agri marketplace"
   railway link
   railway up
   ```

   In the prompts, choose the project, production environment, and `marketplace-web` service. When asked whether to deploy from the current folder, confirm only if that is your Railway project. The Dockerfile at the project root packages the app; the CLI follows `.gitignore` and `.railwayignore`, so the local `.env` is not uploaded.

5. In Railway, open the `marketplace-web` service's **Variables** tab and add these variables. Replace `MySQL` with the exact name of the database service on your project if you renamed it:

   ```text
   DB_HOST=${{MySQL.MYSQLHOST}}
   DB_PORT=${{MySQL.MYSQLPORT}}
   DB_USER=${{MySQL.MYSQLUSER}}
   DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DB_NAME=${{MySQL.MYSQLDATABASE}}
   JWT_SECRET=<a unique random secret of at least 32 characters>
   ```

   Generate a secret locally in PowerShell with:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

   Paste its output as the value of `JWT_SECRET`; do not commit it. The app creates or upgrades its tables when it starts. Apply and deploy the staged variable changes, then check the service logs for **MySQL Database Connected!**. If the first app deployment fails before you add these variables, that is expected; redeploy it after applying the variables.

6. In the app service, open **Settings → Networking → Generate Domain**. Open the generated `https://...up.railway.app` URL to visit the public website. Check the public URL followed by `/api/health` and `/api/test-db` if something is not loading.
7. (Optional) Create the admin account from the project folder after the web service is deployed and linked. Replace the sample email and choose your own strong password:

   ```powershell
   railway ssh -- node scripts/create-admin.js admin@example.com "Use-Your-Own-Strong-Password" "Marketplace Admin"
   ```

8. Create a farmer account on the public website and sign in as the admin to approve it. Approved farmers can then list products for customers.

Deployment is complete when the generated Railway domain opens the site and `/api/test-db` reports success. Keep the local server stopped if you only want to use the public website.

## Account walkthrough

1. Create a customer account, add products to the basket, choose an address and delivery slot, and place an order.
2. Create a separate farmer account with the join button. The farm is pending review until an admin approves it.
3. Sign in as the admin created above. Approve the farmer in the dashboard.
4. Sign in as the approved farmer, update the farm profile, list products, adjust stock, and move orders through confirmed, out-for-delivery, and delivered.
5. Sign back in as the customer to cancel a newly placed order, follow progress, contact support, or review products after delivery.

Farmer approval is intentional: only approved farms and their active products appear to customers.

## API overview

All request/response bodies are JSON. Authenticated requests use `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create customer or farmer account (`role` is `customer` or `farmer`) |
| POST | `/api/auth/login` | Public | Sign in |
| GET | `/api/auth/me` | Signed in | Read current account |
| POST | `/api/farmers/register` | Public | Farmer registration alias |
| GET | `/api/farmers` | Public | Browse approved farms |
| GET | `/api/farmers/:id` | Public | Read a farm profile and its products |
| PATCH | `/api/farmers/profile/me` | Farmer | Update own farm profile |
| GET | `/api/products` | Public | Browse products; filters: `q`, `category`, `location`, `farmer`, `organic=true` |
| GET | `/api/products/categories` | Public | List product categories |
| POST | `/api/products` | Approved farmer | Create a product |
| GET | `/api/products/mine` | Farmer | List own products |
| PATCH/DELETE | `/api/products/:id` | Owning farmer | Update, hide, or remove own listing |
| POST | `/api/orders` | Customer | Checkout basket into farmer orders |
| GET | `/api/orders/mine` | Customer/farmer | Read own orders |
| PATCH | `/api/orders/:id/status` | Order customer/farmer | Cancel or advance an allowed order status |
| POST | `/api/orders/:id/reviews` | Customer | Review a product from a delivered order |
| POST | `/api/orders/:id/disputes` | Customer | Contact admin about an order |
| GET | `/api/admin/overview` | Admin | Marketplace counts and sales total |
| GET/PATCH | `/api/admin/farmers` | Admin | Review farmer applications |
| GET/POST/DELETE | `/api/admin/categories` | Admin | Manage categories |
| GET | `/api/admin/orders` | Admin | Monitor orders |
| GET/PATCH | `/api/admin/disputes` | Admin | Review and resolve support requests |

## Notes before deployment

- Use a managed MySQL database and a dedicated least-privilege database user; do not use the MySQL root account in production.
- Set a unique secret `JWT_SECRET`, restrict `CORS_ORIGIN` to the deployed site, and serve the app over HTTPS.
- Configure backups, database migrations, logging, rate limits, and monitoring for the production environment.
- Checkout records delivery instructions and order status, but does not process payments or connect to a delivery provider. Add a verified payment gateway and logistics provider before accepting real payments or promising delivery.
- Product photos use an optional image URL. Host uploaded images with a trusted object-storage provider before using user uploads in production.
