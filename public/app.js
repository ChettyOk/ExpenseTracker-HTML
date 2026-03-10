const API_BASE = '';

let authMode = 'login';
let authToken = localStorage.getItem('student_expense_token') || null;

let currentMonth;
let currentYear;

let pieChart;
let lineChart;

function formatCurrency(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return '$0';
  return `$${num.toFixed(2)}`;
}

function monthName(monthIndex) {
  return [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ][monthIndex - 1];
}

function setAuthToken(token) {
  authToken = token;
  if (token) {
    localStorage.setItem('student_expense_token', token);
  } else {
    localStorage.removeItem('student_expense_token');
  }
}

async function apiRequest(path, options = {}) {
  const headers = options.headers || {};
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const resp = await fetch(API_BASE + path, {
    ...options,
    headers,
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

function showAuthView() {
  document.getElementById('authView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('logoutButton').classList.add('hidden');
}

function showAppView() {
  document.getElementById('authView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('logoutButton').classList.remove('hidden');
}

function initMonthYearSelectors() {
  const now = new Date();
  currentMonth = now.getMonth() + 1;
  currentYear = now.getFullYear();

  const monthSelect = document.getElementById('monthSelect');
  const yearSelect = document.getElementById('yearSelect');

  monthSelect.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = monthName(m).slice(0, 3);
    if (m === currentMonth) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  yearSelect.innerHTML = '';
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  monthSelect.addEventListener('change', () => {
    currentMonth = Number(monthSelect.value);
    refreshAll();
  });
  yearSelect.addEventListener('change', () => {
    currentYear = Number(yearSelect.value);
    refreshAll();
  });

  document.getElementById('summaryMonthLabel').textContent = `${
    monthName(currentMonth)
  } ${currentYear}`;
}

function openModal(title, bodyHtml, onSubmit) {
  const overlay = document.getElementById('modalOverlay');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  overlay.classList.remove('hidden');

  const close = () => overlay.classList.add('hidden');
  document.getElementById('modalClose').onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const form = modalBody.querySelector('form');
  if (form && onSubmit) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        await onSubmit(form);
        close();
      } catch (err) {
        const errEl = form.querySelector('[data-error]');
        if (errEl) {
          errEl.textContent = err.message || 'Something went wrong';
          errEl.classList.remove('hidden');
        } else {
          alert(err.message || 'Something went wrong');
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }
}

async function loadExpenses() {
  const params = new URLSearchParams({
    month: currentMonth,
    year: currentYear
  });
  const data = await apiRequest(`/api/expenses?${params.toString()}`);
  const tbody = document.getElementById('expensesTableBody');
  const empty = document.getElementById('expensesEmpty');
  tbody.innerHTML = '';

  if (!data.expenses || data.expenses.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  data.expenses.forEach((exp) => {
    const tr = document.createElement('tr');
    tr.className =
      'bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 rounded-lg';
    tr.innerHTML = `
      <td class="py-2 pr-2 whitespace-nowrap">${exp.date}</td>
      <td class="py-2 pr-2">${exp.category}</td>
      <td class="py-2 pr-2 text-right font-medium text-emerald-400">
        ${formatCurrency(exp.amount)}
      </td>
      <td class="py-2 pr-2 max-w-[200px] truncate">${
        exp.description || ''
      }</td>
      <td class="py-2 text-right whitespace-nowrap">
        <button data-edit="${exp.id}" class="text-[11px] text-emerald-400 hover:text-emerald-300 mr-2">
          Edit
        </button>
        <button data-delete="${exp.id}" class="text-[11px] text-rose-400 hover:text-rose-300">
          Delete
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-edit');
      const expense = data.expenses.find((e) => String(e.id) === String(id));
      openExpenseModal(expense);
    });
  });

  tbody.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-delete');
      if (!confirm('Delete this expense?')) return;
      try {
        await apiRequest(`/api/expenses/${id}`, { method: 'DELETE' });
        await refreshAll();
      } catch (err) {
        alert(err.message || 'Failed to delete expense');
      }
    });
  });
}

async function loadBudgets() {
  const params = new URLSearchParams({
    month: currentMonth,
    year: currentYear
  });
  const [summary, budgetsRes] = await Promise.all([
    apiRequest(`/api/summary/monthly?${params.toString()}`),
    apiRequest(`/api/budgets?${params.toString()}`)
  ]);

  const total = summary.total || 0;
  document.getElementById('summaryTotal').textContent =
    formatCurrency(total);
  document.getElementById(
    'summaryMonthLabel'
  ).textContent = `${monthName(summary.month)} ${summary.year}`;

  const budgetMap = {};
  (budgetsRes.budgets || []).forEach((b) => {
    budgetMap[b.category] = b.amount;
  });

  const budgetsList = document.getElementById('budgetsList');
  budgetsList.innerHTML = '';

  summary.categories.forEach((cat) => {
    const spent = cat.spent || 0;
    const budget = budgetMap[cat.category] || 0;
    const used = budget > 0 ? (spent / budget) * 100 : 0;
    const clamped = Math.min(used, 120);

    const barColor =
      used >= 100
        ? 'bg-rose-500'
        : used >= 80
        ? 'bg-amber-400'
        : 'bg-emerald-500';

    const warnLabel =
      used >= 100
        ? '<span class="text-rose-400 ml-1">(Over)</span>'
        : used >= 80
        ? '<span class="text-amber-300 ml-1">(80%+)</span>'
        : '';

    const div = document.createElement('div');
    div.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <p class="font-medium text-slate-200">${cat.category}</p>
        <button data-set-budget="${
          cat.category
        }" class="text-[11px] text-slate-400 hover:text-slate-100">
          Set budget
        </button>
      </div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 mb-1">
        <span>Spent: <span class="text-slate-100">${formatCurrency(
          spent
        )}</span></span>
        <span>Budget: <span class="text-slate-100">${
          budget ? formatCurrency(budget) : '—'
        }</span>${warnLabel}</span>
      </div>
      <div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
        <div class="h-full ${barColor}" style="width: ${clamped}%;"></div>
      </div>
    `;
    budgetsList.appendChild(div);
  });

  budgetsList.querySelectorAll('[data-set-budget]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const category = btn.getAttribute('data-set-budget');
      openBudgetModal(category, budgetMap[category] || '');
    });
  });

  updateCharts(summary);
}

async function loadAnalytics() {
  const params = new URLSearchParams({
    month: currentMonth,
    year: currentYear
  });
  const data = await apiRequest(`/api/analytics/overview?${params.toString()}`);

  document.getElementById('summaryDailyAverage').textContent =
    formatCurrency(data.dailyAverage || 0);
  document.getElementById('summaryForecast').textContent =
    formatCurrency(data.forecastEndOfMonth || 0);

  let comparisonText = '';
  if (data.totalPrev > 0) {
    const diff = data.totalCurrent - data.totalPrev;
    const percent = (diff / data.totalPrev) * 100;
    if (Math.abs(percent) < 5) {
      comparisonText = 'Spending is similar to last month.';
    } else if (percent > 0) {
      comparisonText = `Up ${percent.toFixed(
        1
      )}% compared to last month overall.`;
    } else {
      comparisonText = `Down ${Math.abs(percent).toFixed(
        1
      )}% compared to last month overall.`;
    }
  } else if (data.totalCurrent > 0) {
    comparisonText = 'No spending recorded last month for comparison.';
  } else {
    comparisonText = 'No spending data yet.';
  }
  document.getElementById('summaryComparison').textContent = comparisonText;

  const insightsList = document.getElementById('insightsList');
  insightsList.innerHTML = '';
  (data.insights || []).forEach((text) => {
    const li = document.createElement('li');
    li.textContent = `• ${text}`;
    insightsList.appendChild(li);
  });
  if (!data.insights || data.insights.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Insights will appear here as you record more expenses.';
    li.className = 'text-slate-500';
    insightsList.appendChild(li);
  }
}

async function loadRecurring() {
  const data = await apiRequest('/api/recurring');
  const container = document.getElementById('recurringList');
  container.innerHTML = '';

  if (!data.recurring || data.recurring.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-xs text-slate-500';
    p.textContent =
      'No recurring expenses yet. Add rent, subscriptions, or other repeating costs.';
    container.appendChild(p);
    return;
  }

  data.recurring.forEach((r) => {
    const div = document.createElement('div');
    div.className =
      'flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2';
    div.innerHTML = `
      <div>
        <p class="text-xs font-medium text-slate-100">
          ${r.category} • ${formatCurrency(r.amount)}
        </p>
        <p class="text-[11px] text-slate-400">
          Day ${r.day_of_month}${
            r.description ? ' • ' + r.description : ''
          }
        </p>
      </div>
      <button data-remove="${
        r.id
      }" class="text-[11px] text-rose-400 hover:text-rose-300">
        Remove
      </button>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-remove');
      if (!confirm('Remove this recurring expense?')) return;
      try {
        await apiRequest(`/api/recurring/${id}`, { method: 'DELETE' });
        await loadRecurring();
        await refreshAll();
      } catch (err) {
        alert(err.message || 'Failed to remove recurring expense');
      }
    });
  });
}

function updateCharts(summary) {
  const pieCtx = document.getElementById('pieChart').getContext('2d');
  const lineCtx = document.getElementById('lineChart').getContext('2d');

  const labels = summary.categories.map((c) => c.category);
  const values = summary.categories.map((c) => c.spent || 0);

  if (pieChart) pieChart.destroy();
  pieChart = new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: [
            '#22c55e',
            '#f97316',
            '#06b6d4',
            '#a855f7',
            '#eab308',
            '#3b82f6',
            '#f97373'
          ]
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      }
    }
  });

  const now = new Date(summary.year, summary.month - 1, 1);
  const lineLabels = [];
  const lineValues = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    lineLabels.push(
      `${d.toLocaleString('default', {
        month: 'short'
      })} ${String(d.getFullYear()).slice(-2)}`
    );
    lineValues.push(0);
  }

  if (lineChart) lineChart.destroy();
  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: lineLabels,
      datasets: [
        {
          label: 'Total spending',
          data: lineValues,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.12)',
          fill: true,
          tension: 0.4
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          ticks: {
            callback: (v) => `$${v}`
          }
        }
      }
    }
  });
}

function openExpenseModal(expense) {
  const isEdit = !!expense;
  const title = isEdit ? 'Edit expense' : 'Add expense';
  const body = `
    <form class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] text-slate-400 mb-1">Amount</label>
          <input name="amount" type="number" step="0.01" min="0"
            value="${expense ? expense.amount : ''}"
            required
            class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70" />
        </div>
        <div>
          <label class="block text-[11px] text-slate-400 mb-1">Date</label>
          <input name="date" type="date"
            value="${
              expense
                ? expense.date
                : new Date().toISOString().slice(0, 10)
            }"
            required
            class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70" />
        </div>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Category</label>
        <select name="category" required
          class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70">
          ${
            [
              'Food',
              'Rent',
              'Transport',
              'Utilities',
              'Subscriptions',
              'School',
              'Other'
            ]
              .map((cat) => {
                const selected =
                  expense && expense.category === cat ? 'selected' : '';
                return `<option value="${cat}" ${selected}>${cat}</option>`;
              })
              .join('')
          }
        </select>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Description (optional)</label>
        <textarea name="description" rows="2"
          class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70">${
            expense?.description || ''
          }</textarea>
      </div>
      <p data-error class="hidden text-[11px] text-rose-400"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="submit"
          class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-medium hover:bg-emerald-400">
          ${isEdit ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </form>
  `;

  openModal(title, body, async (form) => {
    const formData = new FormData(form);
    const payload = {
      amount: formData.get('amount'),
      date: formData.get('date'),
      category: formData.get('category'),
      description: formData.get('description')
    };
    if (isEdit) {
      await apiRequest(`/api/expenses/${expense.id}`, {
        method: 'PUT',
        body: payload
      });
    } else {
      await apiRequest('/api/expenses', { method: 'POST', body: payload });
    }
    await refreshAll();
  });
}

function openBudgetModal(category, currentAmount) {
  const body = `
    <form class="space-y-3">
      <p class="text-xs text-slate-300">
        Set a monthly budget for <span class="font-semibold">${category}</span> in
        ${monthName(currentMonth)} ${currentYear}.
      </p>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Budget amount</label>
        <input name="amount" type="number" step="0.01" min="0"
          value="${currentAmount || ''}"
          required
          class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70" />
      </div>
      <p data-error class="hidden text-[11px] text-rose-400"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="submit"
          class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-medium hover:bg-emerald-400">
          Save budget
        </button>
      </div>
    </form>
  `;

  openModal(`Budget for ${category}`, body, async (form) => {
    const formData = new FormData(form);
    const payload = {
      category,
      amount: formData.get('amount'),
      month: currentMonth,
      year: currentYear
    };
    await apiRequest('/api/budgets', { method: 'POST', body: payload });
    await refreshAll();
  });
}

function openRecurringModal() {
  const body = `
    <form class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-[11px] text-slate-400 mb-1">Amount</label>
          <input name="amount" type="number" step="0.01" min="0"
            required
            class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70" />
        </div>
        <div>
          <label class="block text-[11px] text-slate-400 mb-1">Day of month</label>
          <input name="day_of_month" type="number" min="1" max="31"
            required
            class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70" />
        </div>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Category</label>
        <select name="category" required
          class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70">
          <option value="Rent">Rent</option>
          <option value="Subscriptions">Subscriptions</option>
          <option value="Utilities">Utilities</option>
          <option value="Food">Food</option>
          <option value="Transport">Transport</option>
          <option value="School">School</option>
          <option value="Other">Other</option>
        </select>
      </div>
      <div>
        <label class="block text-[11px] text-slate-400 mb-1">Description (optional)</label>
        <textarea name="description" rows="2"
          class="w-full px-2.5 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/70"></textarea>
      </div>
      <p data-error class="hidden text-[11px] text-rose-400"></p>
      <div class="flex justify-end gap-2 pt-1">
        <button type="submit"
          class="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-medium hover:bg-emerald-400">
          Save recurring
        </button>
      </div>
    </form>
  `;

  openModal('Add recurring expense', body, async (form) => {
    const formData = new FormData(form);
    const payload = {
      amount: formData.get('amount'),
      day_of_month: formData.get('day_of_month'),
      category: formData.get('category'),
      description: formData.get('description')
    };
    await apiRequest('/api/recurring', { method: 'POST', body: payload });
    await loadRecurring();
    await refreshAll();
  });
}

async function refreshAll() {
  try {
    await Promise.all([loadExpenses(), loadBudgets(), loadAnalytics()]);
  } catch (err) {
    console.error(err);
  }
}

function initAuth() {
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const form = document.getElementById('authForm');
  const errorEl = document.getElementById('authError');

  function updateTabs() {
    if (authMode === 'login') {
      tabLogin.classList.add('bg-slate-900', 'text-slate-100');
      tabRegister.classList.remove('bg-slate-900', 'text-slate-100');
      tabRegister.classList.add('text-slate-400');
    } else {
      tabRegister.classList.add('bg-slate-900', 'text-slate-100');
      tabLogin.classList.remove('bg-slate-900', 'text-slate-100');
      tabLogin.classList.add('text-slate-400');
    }
  }

  tabLogin.addEventListener('click', () => {
    authMode = 'login';
    updateTabs();
    errorEl.classList.add('hidden');
  });
  tabRegister.addEventListener('click', () => {
    authMode = 'register';
    updateTabs();
    errorEl.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    errorEl.classList.add('hidden');
    errorEl.textContent = '';

    try {
      const path =
        authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const data = await apiRequest(path, {
        method: 'POST',
        body: { email, password }
      });
      if (data.token) {
        setAuthToken(data.token);
        showAppView();
        initMonthYearSelectors();
        await refreshAll();
        await loadRecurring();
      }
    } catch (err) {
      errorEl.textContent = err.message || 'Authentication failed';
      errorEl.classList.remove('hidden');
    }
  });
}

function initGlobalActions() {
  document.getElementById('logoutButton').addEventListener('click', () => {
    setAuthToken(null);
    showAuthView();
  });
  document
    .getElementById('addExpenseButton')
    .addEventListener('click', () => openExpenseModal(null));
  document
    .getElementById('refreshButton')
    .addEventListener('click', () => refreshAll());
  document
    .getElementById('addRecurringButton')
    .addEventListener('click', () => openRecurringModal());
}

async function bootstrap() {
  initAuth();
  initGlobalActions();

  if (authToken) {
    try {
      showAppView();
      initMonthYearSelectors();
      await refreshAll();
      await loadRecurring();
    } catch (err) {
      console.error(err);
      setAuthToken(null);
      showAuthView();
    }
  } else {
    showAuthView();
  }
}

bootstrap();

