# Student Expense Tracker

Student Expense Tracker is a full‑stack web application for university students to **track, analyze, and optimize their spending habits**.

It provides secure authentication, recurring expenses, category budgets with warnings, and analytics/insights powered by charts.

## Features

- **User authentication**
  - Registration and login with **hashed passwords** (bcrypt + JWT auth)
- **Expense management**
  - Add, edit, delete expenses
  - Fields: amount, category, date, optional description
  - Categories: Food, Rent, Transport, Utilities, Subscriptions, School, Other
  - Stored in a **relational SQLite database**
- **Monthly view & summary**
  - View expenses for a selected month/year in a **sortable table**
  - Monthly totals and per‑category breakdowns
  - Percentage breakdown per category (pie chart)
- **Budgeting**
  - Set **monthly budgets per category**
  - Visual progress bars (with color‑coded usage)
  - Warnings when spending exceeds **80%** of budget
- **Recurring expenses**
  - Create recurring monthly expenses (rent, subscriptions, etc.)
  - Automatically generates expenses for each month when you view that month
- **Analytics & insights**
  - Spending trends over time with charts
  - Compare current month to previous month
  - Percentage increase/decrease per category
  - Forecast end‑of‑month spending based on daily average
  - Auto insights (e.g. “You spent X% more on food than last month”)
  - “Reducing subscription costs by 10% saves $X per year”
- **Dashboard**
  - Category distribution pie chart
  - Monthly trend line chart
  - Budget progress bars
  - Key summary metrics and insights
- **Technical**
  - REST API backend (Node.js + Express)
  - SQLite relational database
  - JWT‑based auth, password hashing with bcrypt
  - Responsive Tailwind‑based UI

## Tech stack

- **Backend**
  - Node.js, Express
  - SQLite (via `sqlite3`)
  - JWT (`jsonwebtoken`) for authentication
  - `bcryptjs` for password hashing
  - `cors`, `dotenv`
- **Frontend**
  - Static SPA served by Express from `public/`
  - Tailwind CSS CDN for styling
  - Chart.js for charts
  - Vanilla JavaScript for UI + API calls

## Getting started (local development)

### 1. Install dependencies

In the project root (`ExpenseTracker`):

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file:

```bash
cp .env.example .env
```

Then edit `.env` and set a strong JWT secret:

```env
PORT=4000
JWT_SECRET=replace_with_a_long_random_secret
```

### 3. Run the app

```bash
npm start
```

Then open `http://localhost:4000` in your browser.

The Express server will:

- Expose the REST API under `/api/*`
- Serve the frontend dashboard from `public/index.html`

### 4. Database

- SQLite database file: `database.sqlite` created automatically on first run.
- Tables:
  - `users`
  - `expenses`
  - `budgets`
  - `recurring_expenses`

If you delete `database.sqlite`, it will be recreated with an empty schema.

## REST API overview

All authenticated endpoints require `Authorization: Bearer <token>` header.

- **Auth**
  - `POST /api/auth/register` – `{ email, password }` → `{ token }`
  - `POST /api/auth/login` – `{ email, password }` → `{ token }`
- **Expenses**
  - `GET /api/expenses?month=&year=` – list expenses for selected month
  - `POST /api/expenses` – create expense
  - `PUT /api/expenses/:id` – update expense
  - `DELETE /api/expenses/:id` – delete expense
- **Budgets**
  - `GET /api/budgets?month=&year=` – list budgets for month
  - `POST /api/budgets` – create/update budget for category/month
- **Recurring expenses**
  - `GET /api/recurring` – list recurring rules
  - `POST /api/recurring` – create recurring rule
  - `DELETE /api/recurring/:id` – delete recurring rule
- **Summary & analytics**
  - `GET /api/summary/monthly?month=&year=` – per‑category totals, budget usage, percentages
  - `GET /api/analytics/overview?month=&year=` – comparison vs previous month, forecast, insights

## Deployment

You can deploy this app to any platform that supports a Node.js server, for example:

- Render
- Railway
- Fly.io
- Heroku‑style Node hosting

High‑level steps:

1. **Create a new Node app** on your chosen platform.
2. Set the **Node version** (if required by platform) and **environment variables**:
   - `PORT` (the platform often sets this automatically; use `process.env.PORT`)
   - `JWT_SECRET`
3. Ensure the **start command** is:

   ```bash
   npm start
   ```

4. Optionally:
   - Mount persistent storage for `database.sqlite`, or
   - Swap SQLite for Postgres/MySQL and update `db.js` accordingly if you need multi‑instance scaling.

Once deployed, the app will be available at your service URL; all assets and API are served from the same origin.

## Notes & next steps

- This implementation is intentionally compact and focused on the requested features.
- You can extend it with:
  - Export to CSV
  - Tags or notes per expense
  - Multi‑currency support
  - More advanced forecasting/ML‑based insights

