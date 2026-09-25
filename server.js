const express = require("express");
const session = require("express-session");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const BASE_URL = (
  process.env.BASE_URL ||
  `http://localhost:${PORT}`
).replace(/\/$/, "");

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "cambia-esta-contrasena";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "dev-secret-change-me";

/*
 * CONEXIÓN A POSTGRESQL
 *
 * Primero intenta DATABASE_URL.
 * También acepta la variable que tienes actualmente
 * llamada "URL DE LA BASE DE DATOS".
 */
const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env["URL DE LA BASE DE DATOS"];

if (!DATABASE_URL) {
  console.error("ERROR: No existe DATABASE_URL");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL
});

/* =========================
   CONFIGURACIÓN EXPRESS
========================= */

app.set("trust proxy", 1);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

/* =========================
   CREAR TABLA
========================= */

async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id SERIAL PRIMARY KEY,
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
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("PostgreSQL conectado correctamente");
    console.log("Tabla vehicles verificada correctamente");
  } catch (error) {
    console.error("ERROR conectando a PostgreSQL:");
    console.error(error);
    process.exit(1);
  }
}

/* =========================
   AUTENTICACIÓN
========================= */

function auth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  res.status(401).json({
    error: "No autorizado"
  });
}

/* =========================
   LIMPIAR PLACA
========================= */

function cleanPlate(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/* =========================
   LOGIN
========================= */

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    req.session.admin = true;

    return res.json({
      ok: true
    });
  }

  res.status(401).json({
    error: "Usuario o contraseña incorrectos"
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      ok: true
    });
  });
});

/* =========================
   SESIÓN
========================= */

app.get("/api/session", (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.admin)
  });
});

/* =========================
   LISTAR VEHÍCULOS
========================= */

app.get("/api/vehicles", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM vehicles ORDER BY id DESC"
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   OBTENER VEHÍCULO
========================= */

app.get("/api/vehicles/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM vehicles WHERE id = $1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   CREAR VEHÍCULO
========================= */

app.post("/api/vehicles", auth, async (req, res) => {
  const v = req.body || {};

  const plate = cleanPlate(v.plate);

  if (!plate || !v.vehicle_type) {
    return res.status(400).json({
      error: "Placa y tipo de vehículo son obligatorios"
    });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO vehicles
      (
        plate,
        vehicle_type,
        brand,
        model,
        year,
        color,
        service,
        issue_date,
        expiry_date,
        status,
        owner,
        notes
      )
      VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING id
      `,
      [
        plate,
        v.vehicle_type,
        v.brand || "",
        v.model || "",
        v.year || "",
        v.color || "",
        v.service || "",
        v.issue_date || "",
        v.expiry_date || "",
        v.status || "Vigente",
        v.owner || "",
        v.notes || ""
      ]
    );

    res.json({
      ok: true,
      id: result.rows[0].id
    });
  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Esa placa ya está registrada"
      });
    }

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   EDITAR VEHÍCULO
========================= */

app.put("/api/vehicles/:id", auth, async (req, res) => {
  const v = req.body || {};

  const plate = cleanPlate(v.plate);

  if (!plate || !v.vehicle_type) {
    return res.status(400).json({
      error: "Placa y tipo de vehículo son obligatorios"
    });
  }

  try {
    const result = await pool.query(
      `
      UPDATE vehicles SET
        plate = $1,
        vehicle_type = $2,
        brand = $3,
        model = $4,
        year = $5,
        color = $6,
        service = $7,
        issue_date = $8,
        expiry_date = $9,
        status = $10,
        owner = $11,
        notes = $12,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      `,
      [
        plate,
        v.vehicle_type,
        v.brand || "",
        v.model || "",
        v.year || "",
        v.color || "",
        v.service || "",
        v.issue_date || "",
        v.expiry_date || "",
        v.status || "Vigente",
        v.owner || "",
        v.notes || "",
        req.params.id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Registro no encontrado"
      });
    }

    res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(409).json({
        error: "Esa placa ya está registrada"
      });
    }

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   ELIMINAR VEHÍCULO
========================= */

app.delete("/api/vehicles/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM vehicles WHERE id = $1",
      [req.params.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Registro no encontrado"
      });
    }

    res.json({
      ok: true
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   GENERAR QR
========================= */

app.get("/api/vehicles/:id/qr", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, plate FROM vehicles WHERE id = $1",
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado"
      });
    }

    const row = result.rows[0];

    const url = `${BASE_URL}/consulta/${row.id}`;

    const dataUrl = await QRCode.toDataURL(url, {
      width: 700,
      margin: 2,
      errorCorrectionLevel: "H"
    });

    res.json({
      url,
      dataUrl
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: error.message
    });
  }
});

/* =========================
   CONSULTA PÚBLICA POR ID
========================= */

app.get("/api/public/vehicles/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        plate,
        vehicle_type,
        brand,
        model,
        year,
        color,
        service,
        issue_date,
        expiry_date,
        status,
        notes
      FROM vehicles
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Registro no encontrado"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Error del servidor"
    });
  }
});

/* =========================
   CONSULTA PÚBLICA POR PLACA
========================= */

app.get("/api/public/vehicles", async (req, res) => {
  const plate = cleanPlate(req.query.plate);

  if (!plate) {
    return res.status(400).json({
      error: "Debe ingresar una placa"
    });
  }

  try {
    const result = await pool.query(
      `
      SELECT
        id,
        plate,
        vehicle_type,
        brand,
        model,
        year,
        color,
        service,
        issue_date,
        expiry_date,
        status,
        owner,
        notes
      FROM vehicles
      WHERE plate = $1
      `,
      [plate]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "No se encontró un vehículo con esa placa"
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Error del servidor"
    });
  }
});

/* =========================
   PÁGINA DE CONSULTA QR
========================= */

app.get("/consulta/:id", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "consulta.html")
  );
});

/* =========================
   PÁGINA PRINCIPAL
========================= */

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================
   INICIAR SERVIDOR
========================= */

async function startServer() {
  await initDatabase();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sistema iniciado en ${BASE_URL}`);
    console.log(`Puerto: ${PORT}`);
  });
}

startServer();
