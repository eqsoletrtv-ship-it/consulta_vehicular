const express = require("express");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "cambia-esta-contrasena";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));

const db = new sqlite3.Database(
  path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname, "vehiculos.db")
);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL UNIQUE,
    vehicle_type TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    year TEXT,
    color TEXT,
    service TEXT,
    issue_date TEXT,
    expiry_date TEXT,
    status TEXT NOT NULL DEFAULT 'Vigente',
    owner TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
});

function auth(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: "No autorizado" });
}

function cleanPlate(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: "Usuario o contraseña incorrectos" });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/session", (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.admin) });
});

app.get("/api/vehicles", auth, (req, res) => {
  db.all("SELECT * FROM vehicles ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/vehicles/:id", auth, (req, res) => {
  db.get("SELECT * FROM vehicles WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Registro no encontrado" });
    res.json(row);
  });
});

app.post("/api/vehicles", auth, (req, res) => {
  const v = req.body || {};
  const plate = cleanPlate(v.plate);
  if (!plate || !v.vehicle_type) {
    return res.status(400).json({ error: "Placa y tipo de vehículo son obligatorios" });
  }

  const sql = `INSERT INTO vehicles
    (plate, vehicle_type, brand, model, year, color, service, issue_date, expiry_date, status, owner, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(sql, [
    plate, v.vehicle_type, v.brand || "", v.model || "", v.year || "", v.color || "",
    v.service || "", v.issue_date || "", v.expiry_date || "", v.status || "Vigente",
    v.owner || "", v.notes || ""
  ], function(err) {
    if (err) {
      if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "Esa placa ya está registrada" });
      return res.status(500).json({ error: err.message });
    }
    res.json({ ok: true, id: this.lastID });
  });
});

app.put("/api/vehicles/:id", auth, (req, res) => {
  const v = req.body || {};
  const plate = cleanPlate(v.plate);
  if (!plate || !v.vehicle_type) {
    return res.status(400).json({ error: "Placa y tipo de vehículo son obligatorios" });
  }

  const sql = `UPDATE vehicles SET
    plate=?, vehicle_type=?, brand=?, model=?, year=?, color=?, service=?,
    issue_date=?, expiry_date=?, status=?, owner=?, notes=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?`;

  db.run(sql, [
    plate, v.vehicle_type, v.brand || "", v.model || "", v.year || "", v.color || "",
    v.service || "", v.issue_date || "", v.expiry_date || "", v.status || "Vigente",
    v.owner || "", v.notes || "", req.params.id
  ], function(err) {
    if (err) {
      if (String(err.message).includes("UNIQUE")) return res.status(409).json({ error: "Esa placa ya está registrada" });
      return res.status(500).json({ error: err.message });
    }
    if (!this.changes) return res.status(404).json({ error: "Registro no encontrado" });
    res.json({ ok: true });
  });
});

app.delete("/api/vehicles/:id", auth, (req, res) => {
  db.run("DELETE FROM vehicles WHERE id=?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (!this.changes) return res.status(404).json({ error: "Registro no encontrado" });
    res.json({ ok: true });
  });
});

app.get("/api/vehicles/:id/qr", auth, async (req, res) => {
  db.get("SELECT id, plate FROM vehicles WHERE id=?", [req.params.id], async (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Registro no encontrado" });

    const url = `${BASE_URL}/consulta/${row.id}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 700, margin: 2, errorCorrectionLevel: "H" });
      res.json({ url, dataUrl });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

app.get("/api/public/vehicles/:id", (req, res) => {
  db.get(`SELECT id, plate, vehicle_type, brand, model, year, color, service,
          issue_date, expiry_date, status, notes FROM vehicles WHERE id=?`,
    [req.params.id], (err, row) => {
      if (err) return res.status(500).json({ error: "Error del servidor" });
      if (!row) return res.status(404).json({ error: "Registro no encontrado" });
      res.json(row);
    });
});
app.get("/api/public/vehicles", (req, res) => {
  const plate = cleanPlate(req.query.plate);

  if (!plate) {
    return res.status(400).json({ error: "Debe ingresar una placa" });
  }

  db.get(
    `SELECT id, plate, vehicle_type, brand, model, year, color,
            service, issue_date, expiry_date, status, owner, notes
     FROM vehicles
     WHERE plate = ?`,
    [plate],
    (err, row) => {
      if (err) {
        return res.status(500).json({ error: "Error del servidor" });
      }

      if (!row) {
        return res.status(404).json({
          error: "No se encontró un vehículo con esa placa"
        });
      }

      res.json(row);
    }
  );
});
app.get("/consulta/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "consulta.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Sistema iniciado en ${BASE_URL}`);
});
