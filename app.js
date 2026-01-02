const STORAGE_KEY = "budget-transactions";
const CREDIT_STORAGE_KEY = "budget-credits";
const USD_RATE_ENDPOINT =
  "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json";

const form = document.querySelector("#transaction-form");
const listEl = document.querySelector("#transaction-list");
const template = document.querySelector("#transaction-row-template");
const balanceUahEl = document.querySelector("#balance-uah");
const balanceUsdEl = document.querySelector("#balance-usd");
const rateNoteEl = document.querySelector("#nbu-rate");
const incomeEl = document.querySelector("#income");
const expenseEl = document.querySelector("#expense");
const creditTotalEl = document.querySelector("#credit-total");
const categoryListEl = document.querySelector("#category-breakdown");
const filterCategoryEl = document.querySelector("#filter-category");
const filterFromEl = document.querySelector("#filter-from");
const filterToEl = document.querySelector("#filter-to");
const clearAllBtn = document.querySelector("#clear-all");
const transactionDateInput = form.querySelector('input[name="date"]');
const creditForm = document.querySelector("#credit-form");
const creditListEl = document.querySelector("#credit-list");
const creditCategoryListEl = document.querySelector("#credit-category-list");
const clearCreditsBtn = document.querySelector("#clear-credits");

let transactions = loadTransactions();
let credits = loadCredits();
let usdRate = null;

render();
updateUsdRate();
setDefaultTransactionDate();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const type = data.get("type");
  const amount = Number(data.get("amount") || 0);

  const transaction = {
    id: crypto.randomUUID(),
    description: data.get("description").trim(),
    category: data.get("category").trim(),
    date: data.get("date"),
    type,
    amount: type === "expense" ? -Math.abs(amount) : Math.abs(amount),
  };

  if (!transaction.description || !transaction.category || !transaction.date) {
    return;
  }

  transactions = [transaction, ...transactions];
  saveTransactions(transactions);
  form.reset();
  setDefaultTransactionDate();
  render();
});

listEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete']");
  if (!button) return;
  const { id } = button.dataset;
  transactions = transactions.filter((t) => t.id !== id);
  saveTransactions(transactions);
  render();
});

filterCategoryEl.addEventListener("input", render);
filterFromEl.addEventListener("change", render);
filterToEl.addEventListener("change", render);

clearAllBtn.addEventListener("click", () => {
  if (transactions.length === 0) return;
  if (!confirm("Видалити всі транзакції?")) return;
  transactions = [];
  saveTransactions(transactions);
  render();
});

creditForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(creditForm);
  const category = data.get("category").trim();
  const description = (data.get("description") || "").trim();
  const date = data.get("date") || "";
  const amount = Number(data.get("amount") || 0);

  if (!category || amount <= 0) {
    return;
  }

  const credit = {
    id: crypto.randomUUID(),
    category,
    description,
    date,
    amount: Math.abs(amount),
  };

  credits = [credit, ...credits];
  saveCredits(credits);
  creditForm.reset();
  render();
});

creditListEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action='delete-credit']");
  if (!button) return;
  const { id } = button.dataset;
  credits = credits.filter((credit) => credit.id !== id);
  saveCredits(credits);
  render();
});

clearCreditsBtn.addEventListener("click", () => {
  if (credits.length === 0) return;
  if (!confirm("Видалити всі кредити?")) return;
  credits = [];
  saveCredits(credits);
  render();
});

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTransactions(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function loadCredits() {
  try {
    const raw = localStorage.getItem(CREDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCredits(items) {
  localStorage.setItem(CREDIT_STORAGE_KEY, JSON.stringify(items));
}

function render() {
  const filtered = applyFilters(transactions);
  renderSummary(filtered);
  renderList(filtered);
  renderCategories(filtered);
  renderCredits();
}

function applyFilters(items) {
  const categoryTerm = filterCategoryEl.value.trim().toLowerCase();
  const from = filterFromEl.value ? new Date(filterFromEl.value) : null;
  const to = filterToEl.value ? new Date(filterToEl.value) : null;

  return items.filter((item) => {
    const date = new Date(item.date);

    const matchesCategory = categoryTerm
      ? item.category.toLowerCase().includes(categoryTerm)
      : true;

    const afterFrom = from ? date >= from : true;
    const beforeTo = to ? date <= to : true;
    return matchesCategory && afterFrom && beforeTo;
  });
}

function renderSummary(items) {
  const totals = items.reduce(
    (acc, item) => {
      if (item.amount >= 0) {
        acc.income += item.amount;
      } else {
        acc.expense += Math.abs(item.amount);
      }
      acc.balance += item.amount;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );

  balanceUahEl.textContent = formatCurrency(totals.balance);
  updateUsdBalance(totals.balance);
  incomeEl.textContent = formatCurrency(totals.income);
  expenseEl.textContent = formatCurrency(totals.expense);
}

function renderList(items) {
  listEl.innerHTML = "";
  items.forEach((item) => {
    const row = template.content.cloneNode(true);
    row.querySelector("[data-field='date']").textContent = formatDate(item.date);
    row.querySelector("[data-field='description']").textContent =
      item.description;
    row.querySelector("[data-field='category']").textContent = item.category;
    const amountField = row.querySelector("[data-field='amount']");
    amountField.textContent = formatCurrency(item.amount);
    amountField.classList.toggle("expense", item.amount < 0);
    amountField.classList.toggle("income", item.amount >= 0);
    row.querySelector("button[data-action='delete']").dataset.id = item.id;
    listEl.appendChild(row);
  });
}

function renderCategories(items) {
  const data = items.reduce((acc, item) => {
    const key = item.category || "Без категорії";
    if (!acc[key]) acc[key] = { income: 0, expense: 0 };
    if (item.amount >= 0) {
      acc[key].income += item.amount;
    } else {
      acc[key].expense += Math.abs(item.amount);
    }
    return acc;
  }, {});

  categoryListEl.innerHTML = "";
  Object.entries(data).forEach(([category, totals]) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <span>${category}</span>
      <span>+${formatCurrency(totals.income)} / -${formatCurrency(
      totals.expense
    )}</span>`;
    categoryListEl.appendChild(li);
  });
}

function renderCredits() {
  creditListEl.innerHTML = "";
  credits.forEach((credit) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${credit.category}</td>
      <td>${credit.description || "—"}</td>
      <td>${credit.date ? formatDate(credit.date) : "—"}</td>
      <td>${formatCurrency(Math.abs(credit.amount))}</td>
      <td><button type="button" data-action="delete-credit" data-id="${
        credit.id
      }">×</button></td>
    `;
    creditListEl.appendChild(row);
  });

  const total = credits.reduce((sum, credit) => sum + credit.amount, 0);
  creditTotalEl.textContent = formatCurrency(total);

  const grouped = credits.reduce((acc, credit) => {
    const key = credit.category || "Без категорії";
    acc[key] = (acc[key] || 0) + credit.amount;
    return acc;
  }, {});
  creditCategoryListEl.innerHTML = "";
  Object.entries(grouped).forEach(([category, amount]) => {
    const li = document.createElement("li");
    li.innerHTML = `<span>${category}</span><span>${formatCurrency(
      amount
    )}</span>`;
    creditCategoryListEl.appendChild(li);
  });
}

async function updateUsdRate() {
  try {
    rateNoteEl.textContent = "Отримання курсу НБУ...";
    const response = await fetch(USD_RATE_ENDPOINT, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("NBU response error");
    }
    const data = await response.json();
    const rate = data?.[0]?.rate || data?.[0]?.Rate;
    if (typeof rate !== "number" || rate <= 0) {
      throw new Error("Invalid rate");
    }
    usdRate = rate;
    rateNoteEl.textContent = `Курс НБУ: 1 $ = ${formatCurrencyWithoutSign(
      usdRate
    )}`;
  } catch (error) {
    usdRate = null;
    rateNoteEl.textContent = "Не вдалося отримати курс НБУ.";
    console.error(error);
  } finally {
    const filtered = applyFilters(transactions);
    renderSummary(filtered);
  }
}

function updateUsdBalance(balance) {
  if (!balanceUsdEl) return;
  if (typeof usdRate === "number" && usdRate > 0) {
    const usdValue = balance / usdRate;
    balanceUsdEl.textContent = `≈ ${formatUsd(usdValue)}`;
  } else {
    balanceUsdEl.textContent = "Курс НБУ завантажується...";
  }
}

function setDefaultTransactionDate() {
  if (!transactionDateInput) return;
  const today = new Date().toISOString().slice(0, 10);
  transactionDateInput.value = today;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    signDisplay: "exceptZero",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCurrencyWithoutSign(value) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    signDisplay: "never",
    maximumFractionDigits: 4,
  }).format(value);
}

function formatUsd(value) {
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("uk-UA").format(new Date(value));
}
