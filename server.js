/**
 * Lokrun – A Citizen Civic-Infrastructure Reporting Platform
 * Local prototype backend for Second-Year AI & Data Science Community Engagement Project
 * SNJB's KBJ College of Engineering, Chandwad
 *
 * Rules: Node.js built-in modules only (http, fs, path, crypto, url). Zero npm dependencies.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// --- Configuration & Paths ---
const PORT = process.env.PORT || 3000;
const LISTEN_TARGET = process.env.LOKRUN_PIPE || PORT;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = process.env.LOKRUN_DATA_DIR || path.join(ROOT_DIR, 'data');
const UPLOADS_DIR = process.env.LOKRUN_UPLOADS_DIR || path.join(ROOT_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// --- Domain Constants ---
const VALID_CATEGORIES = [
  'Potholes / damaged roads',
  'Open or blocked drains',
  'Waterlogging',
  'Broken streetlights',
  'Traffic-signal problems',
  'Construction hazards / other'
];

const VALID_PRIORITIES = ['Medium', 'High', 'Critical'];

const VALID_STATUSES = [
  'Submitted',
  'Under Review',
  'In Progress',
  'Waiting for Citizen',
  'Resolved',
  'Closed',
  'Completed'
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

// In-memory active admin sessions: token -> { adminId, username, expiresAt }
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Directory & Database Initialization ---
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  if (!fs.existsSync(PUBLIC_DIR)) {
    fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  }
}

// Atomic file write using temporary file + rename
function atomicWriteFile(filePath, data) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.tmp_${path.basename(filePath)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  fs.writeFileSync(tempPath, data, 'utf-8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    // Windows fallback if destination cannot be directly replaced atomically
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {
        // ignore
      }
    }
    fs.renameSync(tempPath, filePath);
  }
}

function loadDatabase() {
  ensureDirectories();
  if (!fs.existsSync(DB_FILE)) {
    const initialDb = {
      admins: [],
      reports: [],
      auditLog: []
    };
    saveDatabase(initialDb);
    seedDefaultAdmin(initialDb);
    return initialDb;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const db = JSON.parse(raw);
    if (!Array.isArray(db.admins)) db.admins = [];
    if (!Array.isArray(db.reports)) db.reports = [];
    if (!Array.isArray(db.auditLog)) db.auditLog = [];
    seedDefaultAdmin(db);
    return db;
  } catch (err) {
    console.error('Error reading db.json, initializing fresh db:', err.message);
    const initialDb = { admins: [], reports: [], auditLog: [] };
    saveDatabase(initialDb);
    seedDefaultAdmin(initialDb);
    return initialDb;
  }
}

function saveDatabase(db) {
  ensureDirectories();
  const serialized = JSON.stringify(db, null, 2);
  atomicWriteFile(DB_FILE, serialized);
}

// Global in-memory DB reference
let db = loadDatabase();

// --- Crypto & Authentication Helpers ---
function hashPassword(password, saltHex = null) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex')
  };
}

function verifyPassword(password, saltHex, expectedHashHex) {
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const derivedHash = crypto.scryptSync(password, salt, 64);
    const expectedHash = Buffer.from(expectedHashHex, 'hex');
    return crypto.timingSafeEqual(derivedHash, expectedHash);
  } catch {
    return false;
  }
}

function seedDefaultAdmin(database) {
  const customPassword = process.env.ADMIN_PASSWORD;
  const adminPassword = customPassword || 'Lokrun@2026';

  const existingLokrun = database.admins.find(a => a.id === 'lokrun.admin' || a.username === 'lokrun.admin');
  if (!existingLokrun) {
    const { salt, hash } = hashPassword(adminPassword);
    const defaultAdmin = {
      id: 'lokrun.admin',
      username: 'lokrun.admin',
      name: 'Lokrun Default Administrator',
      salt,
      hash,
      createdAt: new Date().toISOString()
    };
    database.admins.push(defaultAdmin);
    saveDatabase(database);
    console.log(` [Auth] Seeded admin: lokrun.admin / ${customPassword ? '[CUSTOM ADMIN_PASSWORD]' : 'Lokrun@2026'}`);
  } else if (customPassword) {
    const { salt, hash } = hashPassword(customPassword);
    existingLokrun.salt = salt;
    existingLokrun.hash = hash;
    saveDatabase(database);
    console.log(' [Auth] Updated lokrun.admin password from ADMIN_PASSWORD on start');
  }
}

function parseCookies(req) {
  const cookies = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const parts = pair.split('=');
    const name = parts[0].trim();
    if (name) {
      cookies[name] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return cookies;
}

function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.session_id;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session;
}

// --- Image Magic Byte Validation ---
function detectAndValidateImage(base64Payload) {
  // Support both raw base64 and data URLs (data:image/jpeg;base64,...)
  let cleanBase64 = base64Payload;
  const commaIdx = base64Payload.indexOf(',');
  if (commaIdx !== -1 && base64Payload.substring(0, commaIdx).includes('base64')) {
    cleanBase64 = base64Payload.substring(commaIdx + 1);
  }
  cleanBase64 = cleanBase64.replace(/\s+/g, '');

  let buffer;
  try {
    buffer = Buffer.from(cleanBase64, 'base64');
  } catch (err) {
    throw new Error('Failed to decode base64 image data');
  }

  if (buffer.length === 0) {
    throw new Error('Image data is empty');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of 5 MB`);
  }

  // Check magic byte signatures
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { buffer, ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    return { buffer, ext: 'png', mime: 'image/png' };
  }

  // WEBP: RIFF at 0..3 and WEBP at 8..11
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { buffer, ext: 'webp', mime: 'image/webp' };
  }

  throw new Error('Invalid image file signature. Allowed formats: JPG, PNG, WEBP');
}

// --- Report Helpers ---
function generateReportId(existingReports) {
  const existingIds = new Set(existingReports.map(r => r.id));
  let id;
  let attempts = 0;
  do {
    const randNum = crypto.randomInt(100000, 1000000); // 6 digits: 100000 - 999999
    id = `LK-${randNum}`;
    attempts++;
    if (attempts > 1000) {
      throw new Error('Unable to generate unique report ID');
    }
  } while (existingIds.has(id));
  return id;
}

// --- Request Utilities ---
function sendJson(res, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-XSS-Protection': '1; mode=block',
    ...extraHeaders
  });
  res.end(body);
}

function sendError(res, statusCode, message, details = null) {
  const payload = { error: message };
  if (details) payload.details = details;
  sendJson(res, statusCode, payload);
}

function parseJsonBody(req, maxBytes = 12 * 1024 * 1024) { // allow 12MB buffer for base64
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        return resolve({});
      }
      try {
        const bodyStr = Buffer.concat(chunks).toString('utf-8');
        const json = JSON.parse(bodyStr);
        resolve(json);
      } catch (err) {
        reject(new Error('Malformed JSON payload: ' + err.message));
      }
    });
    req.on('error', err => reject(err));
  });
}

// --- Static File Server ---
function serveStaticFile(req, res, pathname) {
  // Map '/' to '/index.html' and '/admin' to '/admin/dashboard.html'
  let safePath = pathname === '/' ? '/index.html' : pathname;
  if (safePath === '/admin' || safePath === '/admin/') {
    safePath = '/admin/dashboard.html';
  }
  if (safePath.startsWith('/public/')) {
    safePath = safePath.replace('/public/', '/');
  }

  // Prevent path traversal
  const normalized = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);

  // Verification that target is strictly inside PUBLIC_DIR
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return sendError(res, 403, 'Forbidden: Path traversal blocked');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendError(res, 404, 'File Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'X-XSS-Protection': '1; mode=block'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// --- HTTP Request Router ---
const server = http.createServer(async (req, res) => {
  // Attach standard security headers to every response
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3000'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  try {
    // ----------------------------------------------------
    // Health check endpoint (for Render / cloud monitoring)
    // ----------------------------------------------------
    if (pathname === '/healthz' && method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': 2
      });
      res.end('ok');
      return;
    }

    // ----------------------------------------------------
    // Public instance configuration flags
    // ----------------------------------------------------
    if (pathname === '/api/config' && method === 'GET') {
      const allowRegistration = process.env.LOKRUN_ALLOW_REGISTRATION !== 'false';
      const hideDemoHint = process.env.LOKRUN_HIDE_DEMO_HINT === 'true';
      return sendJson(res, 200, {
        allowRegistration,
        hideDemoHint
      });
    }

    // ----------------------------------------------------
    // API: POST /api/reports (Public report submission)
    // ----------------------------------------------------
    if (pathname === '/api/reports' && method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        return sendError(res, 400, err.message);
      }

      const errors = [];

      // Validate title
      let title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length < 3 || title.length > 120) {
        errors.push('Title is required and must be between 3 and 120 characters');
      }

      // Validate category
      let category = typeof body.category === 'string' ? body.category.trim() : '';
      if (!category || !VALID_CATEGORIES.includes(category)) {
        errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`);
      }

      // Validate description
      let description = typeof body.description === 'string' ? body.description.trim() : '';
      if (!description || description.length < 5 || description.length > 2000) {
        errors.push('Description is required and must be between 5 and 2000 characters');
      }

      // Validate landmark
      let landmark = typeof body.landmark === 'string' ? body.landmark.trim() : '';
      if (!landmark || landmark.length < 2 || landmark.length > 150) {
        errors.push('Landmark is required and must be between 2 and 150 characters');
      }

      // Validate coordinates (lat, lng) - Optional: only validated if provided
      let lat = null;
      let lng = null;
      let mapUrl = null;
      const hasLat = body.lat !== undefined && body.lat !== null && body.lat !== '';
      const hasLng = body.lng !== undefined && body.lng !== null && body.lng !== '';

      if (hasLat || hasLng) {
        const parsedLat = Number(body.lat);
        const parsedLng = Number(body.lng);
        if (isNaN(parsedLat) || parsedLat < -90 || parsedLat > 90) {
          errors.push('Latitude must be a valid number between -90 and 90');
        } else {
          lat = parsedLat;
        }
        if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) {
          errors.push('Longitude must be a valid number between -180 and 180');
        } else {
          lng = parsedLng;
        }
        if (lat !== null && lng !== null) {
          mapUrl = `https://www.google.com/maps?q=${lat},${lng}`;
        }
      }

      // Validate priority (optional, defaults to Medium)
      let priority = 'Medium';
      if (body.priority) {
        if (!VALID_PRIORITIES.includes(body.priority)) {
          errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
        } else {
          priority = body.priority;
        }
      }

      // Validate optional contact info
      let contact = { name: null, phone: null, email: null };
      const rawContact = body.contact || {
        name: body.contactName,
        phone: body.contactPhone,
        email: body.contactEmail
      };

      if (rawContact) {
        if (rawContact.name && typeof rawContact.name === 'string') {
          const cName = rawContact.name.trim();
          if (cName.length > 80) errors.push('Contact name cannot exceed 80 characters');
          contact.name = cName || null;
        }
        if (rawContact.phone && typeof rawContact.phone === 'string') {
          const cPhone = rawContact.phone.trim();
          if (cPhone.length > 25) errors.push('Contact phone cannot exceed 25 characters');
          contact.phone = cPhone || null;
        }
        if (rawContact.email && typeof rawContact.email === 'string') {
          const cEmail = rawContact.email.trim();
          if (cEmail) {
            if (cEmail.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cEmail)) {
              errors.push('Contact email is not a valid email address');
            } else {
              contact.email = cEmail;
            }
          }
        }
      }

      // Validate and process image if provided
      let processedImage = null;
      if (body.image) {
        if (typeof body.image !== 'string') {
          errors.push('Image must be a base64 encoded string');
        } else {
          try {
            processedImage = detectAndValidateImage(body.image);
          } catch (imgErr) {
            errors.push(imgErr.message);
          }
        }
      }

      if (errors.length > 0) {
        return sendError(res, 400, 'Validation failed', errors);
      }

      // Generate report ID
      const reportId = generateReportId(db.reports);
      let imageFileName = null;

      if (processedImage) {
        imageFileName = `${reportId}.${processedImage.ext}`;
        const imagePath = path.join(UPLOADS_DIR, imageFileName);
        fs.writeFileSync(imagePath, processedImage.buffer);
      }

      const now = new Date().toISOString();
      const newReport = {
        id: reportId,
        title,
        category,
        description,
        landmark,
        lat,
        lng,
        mapUrl,
        imageFile: imageFileName,
        contact,
        priority,
        status: 'Submitted',
        createdAt: now,
        updatedAt: now
      };

      db.reports.push(newReport);

      // Record initial audit creation entry
      db.auditLog.push({
        id: crypto.randomUUID(),
        reportId,
        admin: 'system',
        field: 'status',
        oldValue: null,
        newValue: 'Submitted',
        note: 'Report submitted by citizen',
        timestamp: now
      });

      saveDatabase(db);

      return sendJson(res, 201, {
        success: true,
        message: 'Report submitted successfully',
        report: {
          id: newReport.id,
          title: newReport.title,
          category: newReport.category,
          landmark: newReport.landmark,
          priority: newReport.priority,
          status: newReport.status,
          mapUrl: newReport.mapUrl,
          createdAt: newReport.createdAt
        }
      });
    }

    // ----------------------------------------------------
    // API: GET /api/track/:id (Public tracking - NO personal info, NO image)
    // ----------------------------------------------------
    if (pathname.startsWith('/api/track/') && method === 'GET') {
      const id = pathname.substring('/api/track/'.length).trim();
      if (!id) {
        return sendError(res, 400, 'Report ID is required');
      }

      const report = db.reports.find(r => r.id.toLowerCase() === id.toLowerCase());
      if (!report) {
        return sendError(res, 404, `No report found with ID: ${id}`);
      }

      // Build timeline from auditLog: strictly status changes with timestamps only (no notes, no admin IDs, no personal data)
      const auditTrail = db.auditLog
        .filter(entry => entry.reportId.toLowerCase() === report.id.toLowerCase() && entry.field === 'status')
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .map(entry => ({
          status: entry.newValue,
          timestamp: entry.timestamp
        }));

      // Strictly return only public tracking attributes: NO contact details, NO image file
      return sendJson(res, 200, {
        success: true,
        report: {
          id: report.id,
          title: report.title,
          category: report.category,
          landmark: report.landmark,
          status: report.status,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
          timeline: auditTrail
        }
      });
    }

    // ----------------------------------------------------
    // API: POST /api/admin/login
    // ----------------------------------------------------
    if (pathname === '/api/admin/login' && method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        return sendError(res, 400, err.message);
      }

      const username = (body.username || body.id || '').trim();
      const password = body.password || '';

      if (!username || !password) {
        return sendError(res, 400, 'Username and password are required');
      }

      const admin = db.admins.find(a => a.username === username || a.id === username);
      if (!admin || !verifyPassword(password, admin.salt, admin.hash)) {
        return sendError(res, 401, 'Invalid credentials');
      }

      // Create session
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + SESSION_TTL_MS;
      sessions.set(token, {
        adminId: admin.id,
        username: admin.username,
        expiresAt
      });

      const cookieHeader = `session_id=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`;

      return sendJson(
        res,
        200,
        {
          success: true,
          message: 'Authentication successful',
          admin: {
            id: admin.id,
            username: admin.username,
            name: admin.name || admin.username
          }
        },
        { 'Set-Cookie': cookieHeader }
      );
    }

    // ----------------------------------------------------
    // API: POST /api/admin/logout
    // ----------------------------------------------------
    if (pathname === '/api/admin/logout' && method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies.session_id) {
        sessions.delete(cookies.session_id);
      }

      const clearCookie = `session_id=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      return sendJson(
        res,
        200,
        { success: true, message: 'Logged out successfully' },
        { 'Set-Cookie': clearCookie }
      );
    }

    // ----------------------------------------------------
    // API: POST /api/admin/register
    // ----------------------------------------------------
    if (pathname === '/api/admin/register' && method === 'POST') {
      const allowRegistration = process.env.LOKRUN_ALLOW_REGISTRATION !== 'false';
      if (!allowRegistration) {
        return sendError(res, 403, 'Registration is disabled');
      }

      let body;
      try {
        body = await parseJsonBody(req);
      } catch (err) {
        return sendError(res, 400, err.message);
      }

      const username = (body.username || body.id || '').trim();
      const password = body.password || '';
      const name = (body.name || username).trim();

      const errors = [];
      if (!username || username.length < 3 || username.length > 40) {
        errors.push('Username must be between 3 and 40 characters');
      }
      if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
        errors.push('Username can only contain alphanumeric characters, dots, hyphens, and underscores');
      }
      if (!password || password.length < 8) {
        errors.push('Password must be at least 8 characters in length');
      }

      if (db.admins.some(a => a.username.toLowerCase() === username.toLowerCase() || a.id.toLowerCase() === username.toLowerCase())) {
        errors.push('An admin with this username already exists');
      }

      if (errors.length > 0) {
        return sendError(res, 400, 'Registration failed', errors);
      }

      const { salt, hash } = hashPassword(password);
      const newAdmin = {
        id: username,
        username,
        name,
        salt,
        hash,
        createdAt: new Date().toISOString()
      };

      db.admins.push(newAdmin);
      saveDatabase(db);

      return sendJson(res, 201, {
        success: true,
        message: 'Admin account created successfully',
        admin: { id: newAdmin.id, username: newAdmin.username, name: newAdmin.name }
      });
    }

    // ----------------------------------------------------
    // Protected Admin Routes Guard
    // ----------------------------------------------------
    if (pathname.startsWith('/api/admin/')) {
      const session = getSession(req);
      if (!session) {
        return sendError(res, 401, 'Unauthorized: Admin authentication required');
      }

      // Attach current admin session to request
      req.adminSession = session;

      // GET /api/admin/me
      if (pathname === '/api/admin/me' && method === 'GET') {
        const admin = db.admins.find(a => a.id === session.adminId);
        return sendJson(res, 200, {
          success: true,
          admin: {
            id: session.adminId,
            username: session.username,
            name: admin ? admin.name : session.username,
            role: 'Administrator',
            createdAt: admin ? admin.createdAt : null
          }
        });
      }

      // GET /api/admin/reports
      if (pathname === '/api/admin/reports' && method === 'GET') {
        const search = parsedUrl.searchParams.get('search') || '';
        const status = parsedUrl.searchParams.get('status') || '';
        const category = parsedUrl.searchParams.get('category') || '';
        const priority = parsedUrl.searchParams.get('priority') || '';

        let results = [...db.reports];

        if (status) {
          results = results.filter(r => r.status.toLowerCase() === status.toLowerCase());
        }
        if (category) {
          results = results.filter(r => r.category.toLowerCase() === category.toLowerCase());
        }
        if (priority) {
          results = results.filter(r => r.priority.toLowerCase() === priority.toLowerCase());
        }
        if (search) {
          const s = search.toLowerCase();
          results = results.filter(
            r =>
              r.id.toLowerCase().includes(s) ||
              r.title.toLowerCase().includes(s) ||
              r.description.toLowerCase().includes(s) ||
              r.landmark.toLowerCase().includes(s) ||
              (r.contact?.name && r.contact.name.toLowerCase().includes(s)) ||
              (r.contact?.phone && r.contact.phone.toLowerCase().includes(s)) ||
              (r.contact?.email && r.contact.email.toLowerCase().includes(s))
          );
        }

        // Sort latest first
        results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return sendJson(res, 200, {
          success: true,
          count: results.length,
          reports: results
        });
      }

      // GET /api/admin/stats
      if (pathname === '/api/admin/stats' && method === 'GET') {
        const byCategory = {};
        VALID_CATEGORIES.forEach(c => (byCategory[c] = 0));
        const byPriority = {};
        VALID_PRIORITIES.forEach(p => (byPriority[p] = 0));
        const byStatus = {};
        VALID_STATUSES.forEach(s => (byStatus[s] = 0));

        db.reports.forEach(r => {
          if (byCategory[r.category] !== undefined) byCategory[r.category]++;
          else byCategory[r.category] = (byCategory[r.category] || 0) + 1;

          if (byPriority[r.priority] !== undefined) byPriority[r.priority]++;
          else byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;

          if (byStatus[r.status] !== undefined) byStatus[r.status]++;
          else byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        });

        return sendJson(res, 200, {
          success: true,
          totalReports: db.reports.length,
          byCategory,
          byPriority,
          byStatus
        });
      }

      // GET /api/admin/export.csv
      if (pathname === '/api/admin/export.csv' && method === 'GET') {
        const escapeCsv = val => {
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        };

        const headers = [
          'id',
          'title',
          'category',
          'status',
          'priority',
          'landmark',
          'lat',
          'lng',
          'mapUrl',
          'contactName',
          'contactPhone',
          'contactEmail',
          'imageFile',
          'createdAt',
          'updatedAt'
        ];

        const rows = [headers.join(',')];
        db.reports.forEach(r => {
          const row = [
            escapeCsv(r.id),
            escapeCsv(r.title),
            escapeCsv(r.category),
            escapeCsv(r.status),
            escapeCsv(r.priority),
            escapeCsv(r.landmark),
            escapeCsv(r.lat),
            escapeCsv(r.lng),
            escapeCsv(r.mapUrl),
            escapeCsv(r.contact?.name),
            escapeCsv(r.contact?.phone),
            escapeCsv(r.contact?.email),
            escapeCsv(r.imageFile),
            escapeCsv(r.createdAt),
            escapeCsv(r.updatedAt)
          ];
          rows.push(row.join(','));
        });

        const csvContent = rows.join('\r\n');
        res.writeHead(200, {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="lokrun-reports.csv"',
          'Content-Length': Buffer.byteLength(csvContent),
          'X-Content-Type-Options': 'nosniff'
        });
        return res.end(csvContent);
      }

      // GET /api/admin/server-status
      if (pathname === '/api/admin/server-status' && method === 'GET') {
        let uploadsCount = 0;
        let uploadsSizeBytes = 0;
        if (fs.existsSync(UPLOADS_DIR)) {
          const files = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
          uploadsCount = files.length;
          files.forEach(f => {
            try {
              const st = fs.statSync(path.join(UPLOADS_DIR, f));
              uploadsSizeBytes += st.size;
            } catch (e) {}
          });
        }

        return sendJson(res, 200, {
          success: true,
          status: 'healthy',
          uptimeSeconds: Math.floor(process.uptime()),
          nodeVersion: process.version,
          platform: process.platform,
          memoryUsage: process.memoryUsage(),
          database: {
            totalReports: db.reports.length,
            totalAdmins: db.admins.length,
            totalAuditEntries: db.auditLog.length
          },
          storage: {
            uploadsCount,
            uploadsSizeBytes,
            uploadsSizeFormatted: `${(uploadsSizeBytes / (1024 * 1024)).toFixed(2)} MB`
          },
          timestamp: new Date().toISOString()
        });
      }

      // GET /api/admin/image/:id
      if (pathname.startsWith('/api/admin/image/') && method === 'GET') {
        const id = pathname.substring('/api/admin/image/'.length).trim();
        const report = db.reports.find(r => r.id.toLowerCase() === id.toLowerCase() || r.imageFile === id);
        if (!report || !report.imageFile) {
          return sendError(res, 404, 'No image found for this report');
        }

        const safeFilename = path.basename(report.imageFile);
        const imagePath = path.join(UPLOADS_DIR, safeFilename);

        if (!imagePath.startsWith(UPLOADS_DIR) || !fs.existsSync(imagePath)) {
          return sendError(res, 404, 'Image file missing on server');
        }

        const ext = path.extname(imagePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        const stat = fs.statSync(imagePath);

        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'X-Content-Type-Options': 'nosniff'
        });
        return fs.createReadStream(imagePath).pipe(res);
      }

      // GET /api/admin/reports/:id
      if (pathname.startsWith('/api/admin/reports/') && method === 'GET') {
        const id = pathname.substring('/api/admin/reports/'.length).trim();
        const report = db.reports.find(r => r.id.toLowerCase() === id.toLowerCase());
        if (!report) {
          return sendError(res, 404, `No report found with ID: ${id}`);
        }

        const reportAudit = db.auditLog
          .filter(a => a.reportId.toLowerCase() === report.id.toLowerCase())
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return sendJson(res, 200, {
          success: true,
          report: {
            ...report,
            auditLog: reportAudit
          }
        });
      }

      // PATCH /api/admin/reports/:id
      if (pathname.startsWith('/api/admin/reports/') && method === 'PATCH') {
        const id = pathname.substring('/api/admin/reports/'.length).trim();
        const report = db.reports.find(r => r.id.toLowerCase() === id.toLowerCase());
        if (!report) {
          return sendError(res, 404, `No report found with ID: ${id}`);
        }

        let body;
        try {
          body = await parseJsonBody(req);
        } catch (err) {
          return sendError(res, 400, err.message);
        }

        const errors = [];
        let hasChanges = false;
        const now = new Date().toISOString();

        // Validate and update priority
        if (body.priority !== undefined) {
          if (!VALID_PRIORITIES.includes(body.priority)) {
            errors.push(`Priority must be one of: ${VALID_PRIORITIES.join(', ')}`);
          } else if (body.priority !== report.priority) {
            const oldPriority = report.priority;
            report.priority = body.priority;
            hasChanges = true;

            db.auditLog.push({
              id: crypto.randomUUID(),
              reportId: report.id,
              admin: session.username,
              field: 'priority',
              oldValue: oldPriority,
              newValue: report.priority,
              note: body.note ? String(body.note).trim() : null,
              timestamp: now
            });
          }
        }

        // Validate and update status
        if (body.status !== undefined) {
          if (!VALID_STATUSES.includes(body.status)) {
            errors.push(`Status must be one of: ${VALID_STATUSES.join(', ')}`);
          } else if (body.status !== report.status) {
            const oldStatus = report.status;
            report.status = body.status;
            hasChanges = true;

            db.auditLog.push({
              id: crypto.randomUUID(),
              reportId: report.id,
              admin: session.username,
              field: 'status',
              oldValue: oldStatus,
              newValue: report.status,
              note: body.note ? String(body.note).trim() : null,
              timestamp: now
            });
          }
        }

        // If only note was provided without changing status/priority
        if (!hasChanges && body.note && typeof body.note === 'string' && body.note.trim()) {
          db.auditLog.push({
            id: crypto.randomUUID(),
            reportId: report.id,
            admin: session.username,
            field: 'note',
            oldValue: null,
            newValue: body.note.trim(),
            note: body.note.trim(),
            timestamp: now
          });
          hasChanges = true;
        }

        if (errors.length > 0) {
          return sendError(res, 400, 'Update validation failed', errors);
        }

        if (!hasChanges) {
          return sendError(res, 400, 'No modifications detected or invalid update parameters');
        }

        report.updatedAt = now;
        saveDatabase(db);

        return sendJson(res, 200, {
          success: true,
          message: 'Report updated and audit trail recorded',
          report
        });
      }

      return sendError(res, 404, 'Admin API route not found');
    }

    // ----------------------------------------------------
    // Fallback: Static File Serving (from /public)
    // ----------------------------------------------------
    if (method === 'GET' || method === 'HEAD') {
      return serveStaticFile(req, res, pathname);
    }

    return sendError(res, 405, `Method ${method} Not Allowed`);
  } catch (fatalErr) {
    console.error('Unhandled server error:', fatalErr);
    return sendError(res, 500, 'Internal Server Error');
  }
});

// Start server
const HOST = '0.0.0.0';
const IS_PIPE = typeof LISTEN_TARGET === 'string' && (LISTEN_TARGET.startsWith('\\\\.\\pipe\\') || LISTEN_TARGET.startsWith('/'));

if (IS_PIPE) {
  server.listen(LISTEN_TARGET, () => {
    console.log(`=======================================================`);
    console.log(` Lokrun Civic-Infrastructure Backend running`);
    console.log(` Mode: Named pipe / socket`);
    console.log(` Address: ${LISTEN_TARGET}`);
    console.log(`=======================================================`);
  });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`=======================================================`);
    console.log(` Lokrun Civic-Infrastructure Backend running`);
    console.log(` Mode: Standalone Node.js built-ins only (zero npm deps)`);
    console.log(` Address: http://${HOST}:${PORT}`);
    console.log(` Academic Prototype: SNJB's KBJ CoE Chandwad (AI & DS)`);
    console.log(`=======================================================`);
  });
}

// Export server instance for testing or scripting
module.exports = server;
