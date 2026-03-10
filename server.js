require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const { run, get, all } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

const CATEGORIES = [
  'Food',
  'Rent',
  'Transport',
  'Utilities',
  'Subscriptions',
  'School',
  'Other'
];

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function getMonthBounds(year, month) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const toIsoDate = (d) => d.toISOString().slice(0, 10);
  return {
    start: toIsoDate(start),
    end: toIsoDate(end)
  };
}

function getPrevMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

async function ensureRecurringForMonth(userId, year, month) {
  const recurring = await all(
    `SELECT * FROM recurring_expenses WHERE user_id = ? AND active = 1`,
    [userId]
  );

  const { start, end } = getMonthBounds(year, month);

  for (const r of recurring) {
    const alreadyGenerated =
      r.last_generated_year === year && r.last_generated_month === month;
    if (alreadyGenerated) continue;

    const day = Math.min(
      r.day_of_month,
      new Date(year, month, 0).getDate()
    );
    const dateStr = new Date(year, month - 1, day).toISOString().slice(0, 10);

    await run(
      `INSERT INTO expenses (user_id, amount, category, date, description)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, r.amount, r.category, dateStr, r.description]
    );

    await run(
      `UPDATE recurring_expenses
       SET last_generated_month = ?, last_generated_year = ?
       WHERE id = ?`,
      [month, year, r.id]
    );
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: 'Password must be at least 6 characters long' });
    }

    const existing = await get(`SELECT id FROM users WHERE email = ?`, [
      email.toLowerCase()
    ]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users (email, password_hash) VALUES (?, ?)`,
      [email.toLowerCase(), passwordHash]
    );

    const token = jwt.sign(
      { id: result.id, email: email.toLowerCase() },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await get(`SELECT * FROM users WHERE email = ?`, [
      email.toLowerCase()
    ]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;

    await ensureRecurringForMonth(req.user.id, year, month);

    const { start, end } = getMonthBounds(year, month);
    const rows = await all(
      `SELECT * FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?
       ORDER BY date DESC, created_at DESC`,
      [req.user.id, start, end]
    );

    res.json({ expenses: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load expenses' });
  }
});

app.post('/api/expenses', authMiddleware, async (req, res) => {
  try {
    const { amount, category, date, description } = req.body;
    if (
      amount == null ||
      isNaN(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const isoDate = new Date(date).toISOString().slice(0, 10);

    const result = await run(
      `INSERT INTO expenses (user_id, amount, category, date, description)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, Number(amount), category, isoDate, description || null]
    );

    const created = await get(`SELECT * FROM expenses WHERE id = ?`, [
      result.id
    ]);
    res.status(201).json({ expense: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
});

app.put('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, category, date, description } = req.body;

    const existing = await get(
      `SELECT * FROM expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const newAmount =
      amount != null ? Number(amount) : existing.amount;
    if (isNaN(newAmount) || newAmount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const newCategory = category || existing.category;
    if (!CATEGORIES.includes(newCategory)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const newDate = date
      ? new Date(date).toISOString().slice(0, 10)
      : existing.date;

    await run(
      `UPDATE expenses
       SET amount = ?, category = ?, date = ?, description = ?
       WHERE id = ? AND user_id = ?`,
      [
        newAmount,
        newCategory,
        newDate,
        description != null ? description : existing.description,
        id,
        req.user.id
      ]
    );

    const updated = await get(
      `SELECT * FROM expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    res.json({ expense: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update expense' });
  }
});

app.delete('/api/expenses/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(
      `SELECT * FROM expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await run(
      `DELETE FROM expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

app.get('/api/budgets', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;

    const budgets = await all(
      `SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ?`,
      [req.user.id, month, year]
    );

    res.json({ budgets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load budgets' });
  }
});

app.post('/api/budgets', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.body.year, 10) || now.getFullYear();
    const month = parseInt(req.body.month, 10) || now.getMonth() + 1;
    const { category, amount } = req.body;

    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (amount == null || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const existing = await get(
      `SELECT * FROM budgets
       WHERE user_id = ? AND category = ? AND month = ? AND year = ?`,
      [req.user.id, category, month, year]
    );

    if (existing) {
      await run(
        `UPDATE budgets SET amount = ? WHERE id = ?`,
        [Number(amount), existing.id]
      );
    } else {
      await run(
        `INSERT INTO budgets (user_id, category, month, year, amount)
         VALUES (?, ?, ?, ?, ?)`,
        [req.user.id, category, month, year, Number(amount)]
      );
    }

    const budgets = await all(
      `SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ?`,
      [req.user.id, month, year]
    );

    res.json({ budgets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save budget' });
  }
});

app.get('/api/summary/monthly', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;

    await ensureRecurringForMonth(req.user.id, year, month);

    const { start, end } = getMonthBounds(year, month);

    const totalRow = await get(
      `SELECT SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?`,
      [req.user.id, start, end]
    );
    const total = totalRow?.total || 0;

    const perCategory = await all(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?
       GROUP BY category`,
      [req.user.id, start, end]
    );

    const budgets = await all(
      `SELECT * FROM budgets WHERE user_id = ? AND month = ? AND year = ?`,
      [req.user.id, month, year]
    );

    const budgetMap = {};
    for (const b of budgets) {
      budgetMap[b.category] = b.amount;
    }

    const categories = CATEGORIES.map((cat) => {
      const row = perCategory.find((r) => r.category === cat);
      const spent = row ? row.total : 0;
      const budget = budgetMap[cat] || 0;
      const percentOfTotal = total > 0 ? (spent / total) * 100 : 0;
      const usedPercent = budget > 0 ? (spent / budget) * 100 : 0;
      const nearLimit = usedPercent >= 80 && usedPercent < 100;
      const overLimit = usedPercent >= 100;
      return {
        category: cat,
        spent,
        budget,
        percentOfTotal,
        usedPercent,
        nearLimit,
        overLimit
      };
    });

    res.json({
      year,
      month,
      total,
      categories
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load monthly summary' });
  }
});

app.post('/api/recurring', authMiddleware, async (req, res) => {
  try {
    const { amount, category, description, day_of_month } = req.body;
    if (
      amount == null ||
      isNaN(Number(amount)) ||
      Number(amount) <= 0
    ) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    const day = parseInt(day_of_month, 10);
    if (!day || day < 1 || day > 31) {
      return res.status(400).json({ error: 'day_of_month must be 1–31' });
    }

    const result = await run(
      `INSERT INTO recurring_expenses
       (user_id, amount, category, description, day_of_month, active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [req.user.id, Number(amount), category, description || null, day]
    );

    const created = await get(
      `SELECT * FROM recurring_expenses WHERE id = ?`,
      [result.id]
    );
    res.status(201).json({ recurring: created });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create recurring expense' });
  }
});

app.get('/api/recurring', authMiddleware, async (req, res) => {
  try {
    const rows = await all(
      `SELECT * FROM recurring_expenses WHERE user_id = ?`,
      [req.user.id]
    );
    res.json({ recurring: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load recurring expenses' });
  }
});

app.delete('/api/recurring/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await get(
      `SELECT * FROM recurring_expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Recurring expense not found' });
    }

    await run(
      `DELETE FROM recurring_expenses WHERE id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete recurring expense' });
  }
});

app.get('/api/analytics/overview', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;

    await ensureRecurringForMonth(req.user.id, year, month);

    const { start, end } = getMonthBounds(year, month);
    const currentTotals = await all(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?
       GROUP BY category`,
      [req.user.id, start, end]
    );

    const totalCurrentRow = await get(
      `SELECT SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?`,
      [req.user.id, start, end]
    );
    const totalCurrent = totalCurrentRow?.total || 0;

    const { year: prevYear, month: prevMonth } = getPrevMonth(year, month);
    const { start: prevStart, end: prevEnd } = getMonthBounds(
      prevYear,
      prevMonth
    );

    const prevTotals = await all(
      `SELECT category, SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?
       GROUP BY category`,
      [req.user.id, prevStart, prevEnd]
    );

    const totalPrevRow = await get(
      `SELECT SUM(amount) as total
       FROM expenses
       WHERE user_id = ? AND date >= ? AND date < ?`,
      [req.user.id, prevStart, prevEnd]
    );
    const totalPrev = totalPrevRow?.total || 0;

    const comparisonByCategory = CATEGORIES.map((cat) => {
      const cur = currentTotals.find((r) => r.category === cat)?.total || 0;
      const prev = prevTotals.find((r) => r.category === cat)?.total || 0;
      const diff = cur - prev;
      const percentChange = prev > 0 ? (diff / prev) * 100 : cur > 0 ? 100 : 0;
      return {
        category: cat,
        current: cur,
        previous: prev,
        diff,
        percentChange
      };
    });

    const daysInMonth = new Date(year, month, 0).getDate();
    const todayDay = now.getFullYear() === year && now.getMonth() + 1 === month
      ? now.getDate()
      : daysInMonth;
    const dailyAverage = todayDay > 0 ? totalCurrent / todayDay : 0;
    const forecastEndOfMonth = dailyAverage * daysInMonth;

    const insights = [];

    for (const c of comparisonByCategory) {
      if (c.previous > 0 && c.percentChange > 10) {
        insights.push(
          `You spent ${c.percentChange.toFixed(
            1
          )}% more on ${c.category.toLowerCase()} compared to last month.`
        );
      }
    }

    const subscriptions = comparisonByCategory.find(
      (c) => c.category === 'Subscriptions'
    );
    if (subscriptions && subscriptions.current > 0) {
      const yearlySavings = subscriptions.current * 0.1 * 12;
      insights.push(
        `Reducing subscription costs by 10% saves approximately $${yearlySavings.toFixed(
          2
        )} per year.`
      );
    }

    res.json({
      year,
      month,
      totalCurrent,
      totalPrev,
      comparisonByCategory,
      dailyAverage,
      forecastEndOfMonth,
      insights
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load analytics overview' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Student Expense Tracker API running on port ${PORT}`);
});

