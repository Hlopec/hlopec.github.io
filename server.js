const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = __dirname;
const DB_FILE = path.join(__dirname, "data", "db.json");

ensureDbFile();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    return respondOptions(res);
  }

  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url).catch((error) => {
      console.error(error);
      sendJson(res, 500, { error: "Внутрішня помилка сервера" });
    });
  }

  return serveStaticFile(url.pathname, res);
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

function respondOptions(res) {
  setCommonHeaders(res);
  res.writeHead(204);
  res.end();
}

async function handleApi(req, res, url) {
  setCommonHeaders(res);
  const { pathname } = url;

  if (pathname === "/api/state" && req.method === "GET") {
    const data = readDb();
    return sendJson(res, 200, data);
  }

  if (pathname === "/api/transactions") {
    if (req.method === "GET") {
      return sendJson(res, 200, { transactions: readDb().transactions });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const transaction = createTransaction(body);
      const db = readDb();
      db.transactions.unshift(transaction);
      writeDb(db);
      return sendJson(res, 201, { transaction });
    }
    if (req.method === "DELETE") {
      const db = readDb();
      db.transactions = [];
      writeDb(db);
      return sendJson(res, 200, { success: true });
    }
  }

  if (pathname.startsWith("/api/transactions/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    const db = readDb();
    const originalLength = db.transactions.length;
    db.transactions = db.transactions.filter((item) => item.id !== id);
    writeDb(db);
    return sendJson(res, 200, { removed: originalLength !== db.transactions.length });
  }

  if (pathname === "/api/credits") {
    if (req.method === "GET") {
      return sendJson(res, 200, { credits: readDb().credits });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      const credit = createCredit(body);
      const db = readDb();
      db.credits.unshift(credit);
      writeDb(db);
      return sendJson(res, 201, { credit });
    }
    if (req.method === "DELETE") {
      const db = readDb();
      db.credits = [];
      writeDb(db);
      return sendJson(res, 200, { success: true });
    }
  }

  if (pathname.startsWith("/api/credits/") && req.method === "DELETE") {
    const id = pathname.split("/").pop();
    const db = readDb();
    const originalLength = db.credits.length;
    db.credits = db.credits.filter((item) => item.id !== id);
    writeDb(db);
    return sendJson(res, 200, { removed: originalLength !== db.credits.length });
  }

  return sendJson(res, 404, { error: "Маршрут не знайдено" });
}

function setCommonHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function createTransaction(payload = {}) {
  const description = String(payload.description || "").trim();
  const category = String(payload.category || "").trim();
  const date = payload.date || new Date().toISOString().slice(0, 10);
  const type = payload.type === "expense" ? "expense" : "income";
  const amountValue = Number(payload.amount || 0);
  if (!description || !category || Number.isNaN(amountValue)) {
    throw new Error("Некоректні дані для транзакції");
  }
  const amount = type === "expense" ? -Math.abs(amountValue) : Math.abs(amountValue);
  return {
    id: payload.id || crypto.randomUUID(),
    description,
    category,
    date,
    type,
    amount,
    createdAt: new Date().toISOString(),
  };
}

function createCredit(payload = {}) {
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const date = payload.date || "";
  const amountValue = Number(payload.amount || 0);
  if (!category || !amountValue || Number.isNaN(amountValue)) {
    throw new Error("Некоректні дані для кредиту");
  }
  return {
    id: payload.id || crypto.randomUUID(),
    category,
    description,
    date,
    amount: Math.abs(amountValue),
    createdAt: new Date().toISOString(),
  };
}

function serveStaticFile(requestPath, res) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const decodedPath = decodeURIComponent(safePath);
  const filePath = path.join(PUBLIC_DIR, decodedPath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = getContentType(ext);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function getContentType(ext) {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "text/plain; charset=utf-8";
  }
}

function readDb() {
  const content = fs.readFileSync(DB_FILE, "utf-8");
  try {
    return JSON.parse(content);
  } catch (error) {
    console.error("DB parse error", error);
    return { transactions: [], credits: [] };
  }
}

function writeDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function ensureDbFile() {
  if (!fs.existsSync(DB_FILE)) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    writeDb({ transactions: [], credits: [] });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        req.connection.destroy();
        reject(new Error("Body too large"));
      }
    });
    req.on("end", () => {
      if (!data) {
        return resolve({});
      }
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(new Error("Невірний JSON"));
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  if (!res.headersSent) {
    res.statusCode = statusCode;
  }
  if (!res.getHeader("Content-Type")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  }
  res.end(JSON.stringify(payload));
}
