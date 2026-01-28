import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cors from 'cors';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 7000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'demo-driving-school-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const ADMIN_FILE = path.join(__dirname, 'admin.json');

// Default admin credentials
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'password'
};

// Read admin credentials from file or use defaults
function readAdmin() {
  try {
    if (fs.existsSync(ADMIN_FILE)) {
      const data = fs.readFileSync(ADMIN_FILE, 'utf8');
      return JSON.parse(data);
    }
    return DEFAULT_ADMIN;
  } catch (e) {
    return DEFAULT_ADMIN;
  }
}

// Write admin credentials to file
function writeAdmin(admin) {
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2));
}

// Reset codes storage (in-memory, expires after 15 minutes)
const resetCodes = new Map();

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    return [];
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const admin = readAdmin();
  if (username === admin.username && password === admin.password) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Invalid username or password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Generate random reset code
function generateResetCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Clean expired reset codes
function cleanExpiredCodes() {
  const now = Date.now();
  for (const [code, data] of resetCodes.entries()) {
    if (now > data.expires) {
      resetCodes.delete(code);
    }
  }
}

// Forgot password endpoint
app.post('/api/forgot-password', (req, res) => {
  const { username } = req.body;
  const admin = readAdmin();
  
  if (!username || username !== admin.username) {
    return res.status(400).json({ error: 'Username not found' });
  }
  
  // Clean expired codes
  cleanExpiredCodes();
  
  // Generate reset code (valid for 15 minutes)
  const resetCode = generateResetCode();
  const expires = Date.now() + 15 * 60 * 1000; // 15 minutes
  
  resetCodes.set(resetCode, {
    username: admin.username,
    expires: expires
  });
  
  // In a real application, you would send this code via email
  // For demo purposes, we return it in the response
  console.log(`Reset code for ${admin.username}: ${resetCode} (expires in 15 minutes)`);
  
  res.json({
    ok: true,
    message: 'Reset code generated successfully. Check the server console for the code (in production, this would be sent via email).',
    resetCode: resetCode // Only for demo - remove in production
  });
});

// Reset password endpoint
app.post('/api/reset-password', (req, res) => {
  const { resetCode, newPassword } = req.body;
  
  if (!resetCode || !newPassword) {
    return res.status(400).json({ error: 'Reset code and new password are required' });
  }
  
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  
  // Clean expired codes
  cleanExpiredCodes();
  
  const codeData = resetCodes.get(resetCode);
  
  if (!codeData) {
    return res.status(400).json({ error: 'Invalid or expired reset code' });
  }
  
  if (Date.now() > codeData.expires) {
    resetCodes.delete(resetCode);
    return res.status(400).json({ error: 'Reset code has expired. Please request a new one.' });
  }
  
  // Update admin password
  const admin = readAdmin();
  admin.password = newPassword;
  writeAdmin(admin);
  
  // Remove used reset code
  resetCodes.delete(resetCode);
  
  res.json({
    ok: true,
    message: 'Password reset successfully! You can now login with your new password.'
  });
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'unauthorized' });
}

app.post('/api/appointments', (req, res) => {
  const { name, email, phone, date, time, note, vehicleId, trainerId } = req.body;
  if (!name || !email || !date || !time) {
    return res.status(400).json({ error: 'missing fields' });
  }
  
  // Check availability if vehicle and trainer are provided
  if (vehicleId && trainerId) {
    const availability = checkAvailability(vehicleId, trainerId, date, time);
    if (!availability.available) {
      return res.status(400).json({ 
        error: 'Slot is full. This vehicle or trainer is already booked for the selected date and time.',
        conflicts: availability.conflicts
      });
    }
  }
  
  const list = readData();
  const id = Date.now().toString();
  const item = { 
    id, 
    name, 
    email, 
    phone: phone || '', 
    date, 
    time, 
    note: note || '', 
    vehicleId: vehicleId || null,
    trainerId: trainerId || null,
    status: 'pending', 
    createdAt: new Date().toISOString() 
  };
  list.push(item);
  writeData(list);
  res.json({ ok: true, appointment: item });
});

app.get('/api/appointments', requireAdmin, (req, res) => {
  const list = readData();
  res.json(list);
});

app.put('/api/appointments/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  const list = readData();
  const idx = list.findIndex(it => it.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  
  const existing = list[idx];
  const newData = { ...existing, ...updates };
  
  // If confirming and vehicle/trainer are set, check availability
  if (updates.status === 'confirmed' && (newData.vehicleId || newData.trainerId)) {
    const availability = checkAvailability(
      newData.vehicleId, 
      newData.trainerId, 
      newData.date, 
      newData.time,
      id // Exclude current appointment from conflict check
    );
    if (!availability.available) {
      return res.status(400).json({ 
        error: 'Cannot confirm: Slot is full. This vehicle or trainer is already booked for the selected date and time.',
        conflicts: availability.conflicts
      });
    }
  }
  
  list[idx] = newData;
  writeData(list);
  res.json({ ok: true, appointment: list[idx] });
});

app.delete('/api/appointments/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  let list = readData();
  const before = list.length;
  list = list.filter(it => it.id !== id);
  writeData(list);
  res.json({ ok: true, removed: before - list.length });
});

// Vehicle and Trainer management
const VEHICLES_FILE = path.join(__dirname, 'vehicles.json');
const TRAINERS_FILE = path.join(__dirname, 'trainers.json');

// Default vehicles
const DEFAULT_VEHICLES = [
  { id: 'v1', name: 'Honda City', number: 'DL-01-AB-1234', type: 'Sedan', status: 'active' },
  { id: 'v2', name: 'Maruti Swift', number: 'DL-02-CD-5678', type: 'Hatchback', status: 'active' },
  { id: 'v3', name: 'Hyundai i20', number: 'DL-03-EF-9012', type: 'Hatchback', status: 'active' }
];

// Default trainers
const DEFAULT_TRAINERS = [
  { id: 't1', name: 'Rajesh Kumar', phone: '+91-98765-43210', experience: '10 years', status: 'active' },
  { id: 't2', name: 'Priya Sharma', phone: '+91-98765-43211', experience: '8 years', status: 'active' },
  { id: 't3', name: 'Amit Singh', phone: '+91-98765-43212', experience: '12 years', status: 'active' }
];

// Read vehicles from file
function readVehicles() {
  try {
    if (fs.existsSync(VEHICLES_FILE)) {
      const data = fs.readFileSync(VEHICLES_FILE, 'utf8');
      return JSON.parse(data);
    }
    return DEFAULT_VEHICLES;
  } catch (e) {
    return DEFAULT_VEHICLES;
  }
}

// Write vehicles to file
function writeVehicles(vehicles) {
  fs.writeFileSync(VEHICLES_FILE, JSON.stringify(vehicles, null, 2));
}

// Read trainers from file
function readTrainers() {
  try {
    if (fs.existsSync(TRAINERS_FILE)) {
      const data = fs.readFileSync(TRAINERS_FILE, 'utf8');
      return JSON.parse(data);
    }
    return DEFAULT_TRAINERS;
  } catch (e) {
    return DEFAULT_TRAINERS;
  }
}

// Write trainers to file
function writeTrainers(trainers) {
  fs.writeFileSync(TRAINERS_FILE, JSON.stringify(trainers, null, 2));
}

// Check availability for vehicle and trainer
function checkAvailability(vehicleId, trainerId, date, time, excludeAppointmentId = null) {
  const appointments = readData();
  const conflicting = appointments.filter(apt => {
    // Skip the appointment being updated
    if (excludeAppointmentId && apt.id === excludeAppointmentId) return false;
    
    // Only check confirmed appointments
    if (apt.status !== 'confirmed') return false;
    
    // Check if same date and time
    if (apt.date === date && apt.time === time) {
      // Check if same vehicle or trainer
      return (apt.vehicleId === vehicleId) || (apt.trainerId === trainerId);
    }
    return false;
  });
  
  return {
    available: conflicting.length === 0,
    conflicts: conflicting
  };
}

// Vehicle API endpoints
app.get('/api/vehicles', (req, res) => {
  const vehicles = readVehicles();
  res.json(vehicles.filter(v => v.status === 'active'));
});

app.get('/api/vehicles/all', requireAdmin, (req, res) => {
  const vehicles = readVehicles();
  res.json(vehicles);
});

app.post('/api/vehicles', requireAdmin, (req, res) => {
  const { name, number, type } = req.body;
  if (!name || !number || !type) {
    return res.status(400).json({ error: 'Name, number, and type are required' });
  }
  const vehicles = readVehicles();
  const id = 'v' + Date.now().toString();
  const vehicle = { id, name, number, type, status: 'active' };
  vehicles.push(vehicle);
  writeVehicles(vehicles);
  res.json({ ok: true, vehicle });
});

app.put('/api/vehicles/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  const vehicles = readVehicles();
  const idx = vehicles.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  vehicles[idx] = { ...vehicles[idx], ...updates };
  writeVehicles(vehicles);
  res.json({ ok: true, vehicle: vehicles[idx] });
});

app.delete('/api/vehicles/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const vehicles = readVehicles();
  const idx = vehicles.findIndex(v => v.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  vehicles[idx].status = 'inactive';
  writeVehicles(vehicles);
  res.json({ ok: true });
});

// Trainer API endpoints
app.get('/api/trainers', (req, res) => {
  const trainers = readTrainers();
  res.json(trainers.filter(t => t.status === 'active'));
});

app.get('/api/trainers/all', requireAdmin, (req, res) => {
  const trainers = readTrainers();
  res.json(trainers);
});

app.post('/api/trainers', requireAdmin, (req, res) => {
  const { name, phone, experience } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }
  const trainers = readTrainers();
  const id = 't' + Date.now().toString();
  const trainer = { id, name, phone, experience: experience || '', status: 'active' };
  trainers.push(trainer);
  writeTrainers(trainers);
  res.json({ ok: true, trainer });
});

app.put('/api/trainers/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const updates = req.body;
  const trainers = readTrainers();
  const idx = trainers.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  trainers[idx] = { ...trainers[idx], ...updates };
  writeTrainers(trainers);
  res.json({ ok: true, trainer: trainers[idx] });
});

app.delete('/api/trainers/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const trainers = readTrainers();
  const idx = trainers.findIndex(t => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  trainers[idx].status = 'inactive';
  writeTrainers(trainers);
  res.json({ ok: true });
});

// Get availability for a specific date/time
app.get('/api/availability', (req, res) => {
  const { date, time } = req.query;
  if (!date || !time) {
    return res.status(400).json({ error: 'Date and time are required' });
  }
  
  const appointments = readData();
  const confirmed = appointments.filter(apt => 
    apt.status === 'confirmed' && apt.date === date && apt.time === time
  );
  
  const vehicles = readVehicles().filter(v => v.status === 'active');
  const trainers = readTrainers().filter(t => t.status === 'active');
  
  const bookedVehicles = new Set(confirmed.map(apt => apt.vehicleId).filter(Boolean));
  const bookedTrainers = new Set(confirmed.map(apt => apt.trainerId).filter(Boolean));
  
  const availableVehicles = vehicles.filter(v => !bookedVehicles.has(v.id));
  const availableTrainers = trainers.filter(t => !bookedTrainers.has(t.id));
  
  res.json({
    availableVehicles,
    availableTrainers,
    bookedVehicles: Array.from(bookedVehicles),
    bookedTrainers: Array.from(bookedTrainers)
  });
});

// Location management
const LOCATION_FILE = path.join(__dirname, 'location.json');

// Default location (Delhi, India)
const DEFAULT_LOCATION = {
  address: '123 Main Street, City, State 12345',
  phone: '+1 (555) 123-4567',
  hours: 'Mon-Fri: 9AM-6PM, Sat: 10AM-4PM',
  latitude: 28.6139,
  longitude: 77.2090,
  zoom: 15
};

// Read location from file
function readLocation() {
  try {
    if (fs.existsSync(LOCATION_FILE)) {
      const data = fs.readFileSync(LOCATION_FILE, 'utf8');
      return JSON.parse(data);
    }
    return DEFAULT_LOCATION;
  } catch (e) {
    return DEFAULT_LOCATION;
  }
}

// Write location to file
function writeLocation(location) {
  fs.writeFileSync(LOCATION_FILE, JSON.stringify(location, null, 2));
}

// Get location (public endpoint)
app.get('/api/location', (req, res) => {
  const location = readLocation();
  res.json(location);
});

// Update location (admin only)
app.put('/api/location', requireAdmin, (req, res) => {
  const { address, phone, hours, latitude, longitude, zoom } = req.body;
  
  if (!address || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Address, latitude, and longitude are required' });
  }
  
  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  
  if (isNaN(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: 'Invalid latitude. Must be between -90 and 90.' });
  }
  
  if (isNaN(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid longitude. Must be between -180 and 180.' });
  }
  
  const location = {
    address: address,
    phone: phone || '',
    hours: hours || '',
    latitude: lat,
    longitude: lng,
    zoom: zoom || 15
  };
  
  writeLocation(location);
  res.json({ ok: true, location: location });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});