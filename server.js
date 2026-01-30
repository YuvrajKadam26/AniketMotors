import mysql from 'mysql2/promise';
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cors from 'cors';

/* =======================
   BASIC SETUP
======================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

/* =======================
   MYSQL (XAMPP)
======================= */
const db = await mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'driving_school',
  port: 3307
});
console.log("Connected");

/* =======================
   EXPRESS
======================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'demo-driving-school-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 86400000 }
}));

/* =======================
   FILE-BASED (ONLY ADMIN + LOCATION)
======================= */
const ADMIN_FILE = path.join(__dirname, 'admin.json');
const LOCATION_FILE = path.join(__dirname, 'location.json');

const DEFAULT_ADMIN = { username: 'admin', password: 'password' };

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* =======================
   AUTH
======================= */
function requireAdmin(req, res, next) {
  if (req.session?.admin) return next();
  res.status(401).json({ error: 'unauthorized' });
}

app.post('/api/login', (req, res) => {
  const admin = readJSON(ADMIN_FILE, DEFAULT_ADMIN);
  if (
    req.body.username === admin.username &&
    req.body.password === admin.password
  ) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

/* =======================
   APPOINTMENTS (MYSQL)
======================= */
app.post('/api/appointments', async (req, res) => {
  const {
    name, email, phone, date, time, note, vehicleId, trainerId
  } = req.body;

  try {
    await db.query(
      `INSERT INTO appointments
       (name, email, phone, date, time, note, vehicleId, trainerId, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email,
        phone || '',
        date,
        time,
        note || '',
        vehicleId || null,
        trainerId || null,
        'pending'
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

app.get('/api/appointments', requireAdmin, async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM appointments ORDER BY createdAt DESC`
  );
  res.json(rows);
});

app.put('/api/appointments/:id', requireAdmin, async (req, res) => {
  await db.query(
    `UPDATE appointments SET status=? WHERE id=?`,
    [req.body.status, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/appointments/:id', requireAdmin, async (req, res) => {
  await db.query(
    `DELETE FROM appointments WHERE id=?`,
    [req.params.id]
  );
  res.json({ ok: true });
});


/* =======================
   VEHICLES (MYSQL)
======================= */
app.get('/api/vehicles', async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM vehicles WHERE status='active'`
  );
  res.json(rows);
});

app.get('/api/vehicles/all', requireAdmin, async (req, res) => {
  const [rows] = await db.query(`SELECT * FROM vehicles`);
  res.json(rows);
});

app.post('/api/vehicles', requireAdmin, async (req, res) => {
  const { name, number, type } = req.body;
  const id = 'v' + Date.now();

  await db.query(
    `INSERT INTO vehicles (id,name,number,type,status)
     VALUES (?,?,?,?,?)`,
    [id, name, number, type, 'active']
  );

  res.json({ ok: true });
});

app.put('/api/vehicles/:id', requireAdmin, async (req, res) => {
  await db.query(
    `UPDATE vehicles SET status=? WHERE id=?`,
    [req.body.status, req.params.id]
  );
  res.json({ ok: true });
});

/* =======================
   TRAINERS (MYSQL)
======================= */
app.get('/api/trainers', async (req, res) => {
  const [rows] = await db.query(
    `SELECT * FROM trainers WHERE status='active'`
  );
  res.json(rows);
});

app.get('/api/trainers/all', requireAdmin, async (req, res) => {
  const [rows] = await db.query(`SELECT * FROM trainers`);
  res.json(rows);
});

app.post('/api/trainers', requireAdmin, async (req, res) => {
  const { name, phone, experience } = req.body;
  const id = 't' + Date.now();

  await db.query(
    `INSERT INTO trainers (id,name,phone,experience,status)
     VALUES (?,?,?,?,?)`,
    [id, name, phone, experience || '', 'active']
  );

  res.json({ ok: true });
});

app.put('/api/trainers/:id', requireAdmin, async (req, res) => {
  await db.query(
    `UPDATE trainers SET status=? WHERE id=?`,
    [req.body.status, req.params.id]
  );
  res.json({ ok: true });
});

/* =======================
   LOCATION (FILE-BASED)
======================= */
app.get('/api/location', (req, res) => {
  res.json(readJSON(LOCATION_FILE, {}));
});

app.put('/api/location', requireAdmin, (req, res) => {
  writeJSON(LOCATION_FILE, req.body);
  res.json({ ok: true });
});

/* =======================
   FALLBACK
======================= */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* =======================
   START SERVER
======================= */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
