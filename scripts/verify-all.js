/**
 * Lokrun Automated Verification Suite
 * Verifies all specifications across Backend, Citizen Portal, and Admin Portal.
 *
 * Runs strictly against an isolated temporary directory (LOKRUN_DATA_DIR / LOKRUN_UPLOADS_DIR)
 * so live data/db.json and live uploads/ are NEVER touched.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PIPE_PATH = process.platform === 'win32'
  ? `\\\\.\\pipe\\lokrun_verify_${process.pid}_${Date.now()}`
  : `/tmp/lokrun_verify_${process.pid}.sock`;

const TEST_ROOT = path.join(__dirname, '..', `.tmp_test_env_${process.pid}`);
const TEST_DATA_DIR = path.join(TEST_ROOT, 'data');
const TEST_UPLOADS_DIR = path.join(TEST_ROOT, 'uploads');

const PORT = 3000;
const USE_PIPE = true;

// Minimal valid PNG (1x1 pixel)
const VALID_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Fake image (plain text base64)
const FAKE_IMAGE_BASE64 = Buffer.from('This is a fake image text file posing as jpg').toString('base64');

// 6 MB image (exceeds 5 MB threshold)
const LARGE_IMAGE_BASE64 = Buffer.alloc(6 * 1024 * 1024, 0xAA).toString('base64');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      ...options,
      ...(USE_PIPE ? { socketPath: PIPE_PATH } : { hostname: 'localhost', port: PORT })
    };

    const req = http.request(reqOptions, res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {
          json = body;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
          rawBody: body
        });
      });
    });

    req.on('error', err => reject(err));
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function startServer(extraEnv = {}) {
  const env = {
    ...process.env,
    LOKRUN_PIPE: PIPE_PATH,
    LOKRUN_DATA_DIR: TEST_DATA_DIR,
    LOKRUN_UPLOADS_DIR: TEST_UPLOADS_DIR,
    ...extraEnv
  };
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', d => {});
  child.stderr.on('data', d => {});

  return child;
}

async function waitForServer(retries = 25) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await request({ path: '/', method: 'GET' });
      if (res.statusCode === 200) return true;
    } catch (e) {}
    await delay(150);
  }
  throw new Error('Server failed to start within timeout');
}

async function runTests() {
  console.log('\n=====================================================================');
  console.log('   LOKRUN COMPREHENSIVE VERIFICATION SUITE (LIVE DATA ONLY)');
  console.log('   Local Prototype (SNJB KBJ College of Engineering, Chandwad)');
  console.log('=====================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(` [PASS] ${message}`);
      passed++;
    } else {
      console.error(` [FAIL] ${message}`);
      failed++;
    }
  }

  // Ensure isolated test directory
  if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  if (!fs.existsSync(TEST_UPLOADS_DIR)) fs.mkdirSync(TEST_UPLOADS_DIR, { recursive: true });

  let serverProcess = startServer();
  await waitForServer();

  let createdReportId = null;
  let adminCookie = null;

  try {
    // ----------------------------------------------------
    // TEST 0: Fresh Start Seed Verification
    // ----------------------------------------------------
    const freshDbPath = path.join(TEST_DATA_DIR, 'db.json');
    if (fs.existsSync(freshDbPath)) {
      const freshDb = JSON.parse(fs.readFileSync(freshDbPath, 'utf-8'));
      assert(freshDb.admins.length === 1, 'Fresh start seeds exactly one admin account');
      assert(freshDb.admins[0].username === 'lokrun.admin', 'Seeded admin is lokrun.admin');
    }

    // ----------------------------------------------------
    // TEST 1: Static file server & security headers
    // ----------------------------------------------------
    const resStatic = await request({ path: '/', method: 'GET' });
    assert(resStatic.statusCode === 200, 'Static server serves public/index.html on / (HTTP 200)');
    assert(resStatic.rawBody.includes('Better roads begin with') && resStatic.rawBody.includes('being heard'), 'index.html contains hero headline "Better roads begin with being heard"');
    assert(resStatic.headers['x-content-type-options'] === 'nosniff', 'Security header X-Content-Type-Options: nosniff present');
    assert(resStatic.headers['x-frame-options'] === 'DENY', 'Security header X-Frame-Options: DENY present');

    // ----------------------------------------------------
    // TEST 2: Valid report saved with ID (LK-XXXXXX)
    // ----------------------------------------------------
    const payload = {
      title: 'Pothole on SNJB College Road Chandwad',
      category: 'Potholes / damaged roads',
      description: 'Major road depression near SNJB engineering hostel turn.',
      landmark: 'Near SNJB Boys Hostel, Chandwad',
      lat: 20.3282,
      lng: 74.2421,
      priority: 'High',
      contact: {
        name: 'Amit Sharma',
        phone: '9876543210',
        email: 'amit.sharma@snjb.org'
      },
      image: VALID_PNG_BASE64
    };

    const resReport = await request(
      {
        path: '/api/reports',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      payload
    );

    assert(resReport.statusCode === 201, 'Valid report creation returns HTTP 201 Created');
    assert(resReport.data && resReport.data.success === true, 'Response contains success: true');
    createdReportId = resReport.data?.report?.id;
    assert(/^LK-\d{6}$/.test(createdReportId), `Report ID matches collision-checked LK-XXXXXX format (${createdReportId})`);
    assert(resReport.data?.report?.mapUrl === 'https://www.google.com/maps?q=20.3282,74.2421', 'Google Maps URL correctly generated');

    // Check image file saved in isolated test uploads dir
    const uploadFiles = fs.readdirSync(TEST_UPLOADS_DIR);
    const expectedImg = `${createdReportId}.png`;
    assert(uploadFiles.includes(expectedImg), `Image saved as uploads/${expectedImg}`);

    // ----------------------------------------------------
    // TEST 3: 6 MB image rejected
    // ----------------------------------------------------
    const resLarge = await request(
      {
        path: '/api/reports',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        title: 'Test Large Image Rejection',
        category: 'Waterlogging',
        description: 'Attempting to send an oversized 6 MB image payload.',
        landmark: 'Subhash Chowk, Chandwad',
        lat: 20.325,
        lng: 74.245,
        image: LARGE_IMAGE_BASE64
      }
    );

    assert(resLarge.statusCode === 400, '6 MB image payload rejected with HTTP 400 Bad Request');
    const msgLarge = JSON.stringify(resLarge.data);
    assert(msgLarge.includes('exceeds') || msgLarge.includes('5 MB'), 'Error response explicitly cites 5 MB size limit');

    // ----------------------------------------------------
    // TEST 4: Fake .jpg rejected (magic bytes validation)
    // ----------------------------------------------------
    const resFake = await request(
      {
        path: '/api/reports',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        title: 'Test Fake Image Magic Bytes',
        category: 'Broken streetlights',
        description: 'Testing magic byte inspection on corrupted base64 data.',
        landmark: 'Vadner Road Junction, Chandwad',
        lat: 20.33,
        lng: 74.24,
        image: FAKE_IMAGE_BASE64
      }
    );

    assert(resFake.statusCode === 400, 'Fake image with invalid magic bytes rejected with HTTP 400 Bad Request');
    const msgFake = JSON.stringify(resFake.data);
    assert(msgFake.includes('signature') || msgFake.includes('Invalid image'), 'Error response cites invalid file signature');

    // ----------------------------------------------------
    // TEST 5: Track endpoint privacy and timeline
    // ----------------------------------------------------
    const resTrack = await request({
      path: `/api/track/${createdReportId}`,
      method: 'GET'
    });

    assert(resTrack.statusCode === 200, `Track endpoint /api/track/${createdReportId} returns HTTP 200`);
    const trackRep = resTrack.data?.report;
    assert(trackRep && trackRep.id === createdReportId, 'Track returns matching report ID');
    assert(trackRep.status === 'Submitted', 'Track shows status: Submitted');
    assert(trackRep.category === 'Potholes / damaged roads', 'Track shows correct category');
    assert(Array.isArray(trackRep.timeline) && trackRep.timeline.length >= 1, 'Track includes audit timeline array');
    assert(!trackRep.contact, 'Privacy check: track report DOES NOT expose contact object');
    assert(!trackRep.contactName && !trackRep.contactPhone && !trackRep.contactEmail, 'Privacy check: track report DOES NOT expose personal info');
    assert(!trackRep.imageFile, 'Privacy check: track report DOES NOT expose raw imageFile path');

    // ----------------------------------------------------
    // TEST 6: Admin routes return 401 when logged out
    // ----------------------------------------------------
    const unauthEndpoints = [
      '/api/admin/me',
      '/api/admin/reports',
      `/api/admin/reports/${createdReportId}`,
      '/api/admin/stats',
      '/api/admin/export.csv',
      '/api/admin/server-status'
    ];

    for (const ep of unauthEndpoints) {
      const res = await request({ path: ep, method: 'GET' });
      assert(res.statusCode === 401, `Unauthenticated ${ep} returns HTTP 401 Unauthorized`);
    }

    const unauthPatch = await request(
      {
        path: `/api/admin/reports/${createdReportId}`,
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      },
      { status: 'In Progress' }
    );
    assert(unauthPatch.statusCode === 401, 'Unauthenticated PATCH returns HTTP 401 Unauthorized');

    // ----------------------------------------------------
    // TEST 7: Login works with seeded admin credentials
    // ----------------------------------------------------
    const resLogin = await request(
      {
        path: '/api/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        username: 'lokrun.admin',
        password: 'Lokrun@2026'
      }
    );

    assert(resLogin.statusCode === 200, 'Admin login with lokrun.admin / Lokrun@2026 succeeds (HTTP 200)');
    assert(resLogin.data && resLogin.data.success === true, 'Login response confirms success: true');
    const setCookie = resLogin.headers['set-cookie'];
    assert(Boolean(setCookie && setCookie.length > 0), 'Login response sets Set-Cookie header');
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    assert(cookieStr.includes('HttpOnly'), 'Session cookie includes HttpOnly directive');
    assert(cookieStr.includes('session_id='), 'Session cookie sets session_id');

    adminCookie = cookieStr.split(';')[0];

    // Verify /api/admin/me with cookie
    const resMe = await request({
      path: '/api/admin/me',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert(resMe.statusCode === 200 && resMe.data?.admin?.username === 'lokrun.admin', 'Authenticated /api/admin/me returns admin profile');
    assert(resMe.data?.admin?.role === 'Administrator', 'Admin profile returns role "Administrator"');

    // Verify /api/admin/stats
    const resStats = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert(resStats.statusCode === 200 && resStats.data?.totalReports >= 1, '/api/admin/stats returns category, priority and status counts');

    // Verify /api/admin/server-status
    const resStatus = await request({
      path: '/api/admin/server-status',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert(resStatus.statusCode === 200 && resStatus.data?.status === 'healthy', '/api/admin/server-status returns server health and uptime');

    // Verify /api/admin/export.csv
    const resCsv = await request({
      path: '/api/admin/export.csv',
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert(resCsv.statusCode === 200 && resCsv.rawBody.includes(createdReportId), 'GET /api/admin/export.csv returns CSV including report ID');

    // Verify /api/admin/image/:id
    const resImage = await request({
      path: `/api/admin/image/${createdReportId}`,
      method: 'GET',
      headers: { Cookie: adminCookie }
    });
    assert(resImage.statusCode === 200 && resImage.headers['content-type'] === 'image/png', `/api/admin/image/${createdReportId} serves uploaded photo to admin`);

    // ----------------------------------------------------
    // TEST 8: PATCH writes an audit entry
    // ----------------------------------------------------
    const patchPayload = {
      status: 'In Progress',
      priority: 'Critical',
      note: 'Field inspection completed by junior engineer. Repair team dispatched.'
    };

    const resPatch = await request(
      {
        path: `/api/admin/reports/${createdReportId}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie
        }
      },
      patchPayload
    );

    assert(resPatch.statusCode === 200, 'PATCH /api/admin/reports/:id returns HTTP 200');
    assert(resPatch.data?.report?.status === 'In Progress', 'Report status successfully updated to In Progress');
    assert(resPatch.data?.report?.priority === 'Critical', 'Report priority successfully updated to Critical');

    // Check report details via admin endpoint
    const resGetReport = await request({
      path: `/api/admin/reports/${createdReportId}`,
      method: 'GET',
      headers: { Cookie: adminCookie }
    });

    assert(resGetReport.statusCode === 200, 'GET /api/admin/reports/:id returns full report with auditLog');
    const audits = resGetReport.data?.report?.auditLog;
    assert(Array.isArray(audits) && audits.length >= 2, 'Audit log contains multiple historical entries');

    const statusAudit = audits.find(a => a.field === 'status' && a.newValue === 'In Progress');
    assert(Boolean(statusAudit), 'Audit log contains entry for status change: Submitted -> In Progress');
    assert(statusAudit?.admin === 'lokrun.admin', 'Audit log identifies admin (lokrun.admin)');
    assert(Boolean(statusAudit?.timestamp), 'Audit log entry includes ISO timestamp');

    const priorityAudit = audits.find(a => a.field === 'priority' && a.newValue === 'Critical');
    assert(Boolean(priorityAudit), 'Audit log contains entry for priority change: High -> Critical');

    // ----------------------------------------------------
    // TEST 9: Data persists after restarting the server
    // ----------------------------------------------------
    console.log('\n[Restart Test] Stopping server and testing persistence across restart...');
    serverProcess.kill();
    await delay(500);

    // Verify test db.json directly on disk in isolated test data folder
    const dbRaw = fs.readFileSync(path.join(TEST_DATA_DIR, 'db.json'), 'utf-8');
    const diskDb = JSON.parse(dbRaw);
    const diskReport = diskDb.reports.find(r => r.id === createdReportId);
    assert(Boolean(diskReport), `Report ${createdReportId} exists in isolated test db.json on disk`);
    assert(diskReport?.status === 'In Progress', 'Status "In Progress" persisted atomically in db.json');
    assert(diskReport?.priority === 'Critical', 'Priority "Critical" persisted atomically in db.json');

    // Spawn server again with same isolated test environment
    serverProcess = startServer();
    await waitForServer();

    // Query track endpoint on restarted server
    const resRestartTrack = await request({
      path: `/api/track/${createdReportId}`,
      method: 'GET'
    });

    assert(resRestartTrack.statusCode === 200, 'Restarted server responds to /api/track/:id with HTTP 200');
    assert(resRestartTrack.data?.report?.status === 'In Progress', 'Restarted server serves persisted status "In Progress"');
    assert(resRestartTrack.data?.report?.timeline?.length >= 2, 'Restarted server serves persisted audit timeline');

    // ----------------------------------------------------
    // TEST 10: Admin Static Pages Load Check (HTTP 200)
    // ----------------------------------------------------
    console.log('\n[Admin Pages Test] Verifying all admin HTML pages serve HTTP 200...');
    const adminPages = [
      '/admin/login.html',
      '/admin/register.html',
      '/admin/dashboard.html',
      '/admin/reports.html',
      '/admin/profile.html',
      '/admin/status.html'
    ];

    for (const p of adminPages) {
      const pageRes = await request({ path: p, method: 'GET' });
      assert(pageRes.statusCode === 200, `Admin page ${p} serves HTTP 200`);
      assert(pageRes.rawBody.includes('Local prototype – not connected to any government department.'), `${p} includes prototype disclaimer in footer`);
    }

    // ----------------------------------------------------
    // TEST 11: Multi-Report Flow in Isolated Temp Environment
    // ----------------------------------------------------
    console.log('\n[Multi-Report Flow Test] Submitting 3 reports (GPS, Landmark-only, and XSS payload)...');

    // Report 1: With GPS
    const r1 = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'Road subsidence near Vadner overbridge',
      category: 'Potholes / damaged roads',
      description: 'Asphalt depressed by several inches across shoulder.',
      landmark: 'Vadner road overbridge bypass',
      lat: 20.331,
      lng: 74.239
    });
    assert(r1.statusCode === 201, 'Report 1 (with GPS) created with HTTP 201');
    const id1 = r1.data?.report?.id;

    // Report 2: With Landmark only (null lat/lng)
    const r2 = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: 'Stormwater culvert blocked by silt',
      category: 'Open or blocked drains',
      description: 'Channel blocked causing sewage overflow onto walking track.',
      landmark: 'Near Chandwad Bus Depot entrance',
      lat: null,
      lng: null
    });
    assert(r2.statusCode === 201, 'Report 2 (landmark-only with null lat/lng) created with HTTP 201');
    const id2 = r2.data?.report?.id;
    assert(r2.data?.report?.mapUrl === null, 'Report 2 mapUrl is null when GPS is omitted');

    // Report 3: With XSS payload title & valid image
    const r3 = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      title: '<script>alert(1)</script>',
      category: 'Broken streetlights',
      description: 'Streetlight pole dark. Testing XSS resistance in title.',
      landmark: 'Subhash Chowk, Chandwad',
      lat: 20.324,
      lng: 74.244,
      image: VALID_PNG_BASE64
    });
    assert(r3.statusCode === 201, 'Report 3 (with image and XSS title) created with HTTP 201');
    const id3 = r3.data?.report?.id;

    // ----------------------------------------------------
    // TEST 12: Verify Dashboard Stats & Analytics
    // ----------------------------------------------------
    // Re-login after server restart to obtain a fresh session token
    const reloginRes = await request(
      {
        path: '/api/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        username: 'lokrun.admin',
        password: 'Lokrun@2026'
      }
    );
    assert(reloginRes.statusCode === 200, 'Re-login after server restart succeeds (HTTP 200)');
    const reloginCookieStr = Array.isArray(reloginRes.headers['set-cookie'])
      ? reloginRes.headers['set-cookie'][0]
      : reloginRes.headers['set-cookie'];
    const activeAdminCookie = reloginCookieStr.split(';')[0];

    const statsRes2 = await request({
      path: '/api/admin/stats',
      method: 'GET',
      headers: { Cookie: activeAdminCookie }
    });
    assert(statsRes2.statusCode === 200, 'Stats endpoint responds to authenticated admin');
    assert(statsRes2.data?.totalReports >= 4, `Stats reflect total active reports count (${statsRes2.data?.totalReports})`);

    // ----------------------------------------------------
    // TEST 13: Search & Filter Verification
    // ----------------------------------------------------
    const searchRes = await request({
      path: `/api/admin/reports?search=${encodeURIComponent('Vadner')}`,
      method: 'GET',
      headers: { Cookie: activeAdminCookie }
    });
    assert(searchRes.statusCode === 200, 'Search query returns HTTP 200');
    assert(searchRes.data?.reports.some(r => r.id === id1), 'Search for "Vadner" correctly finds Report 1');

    // ----------------------------------------------------
    // TEST 14: XSS Safety Verification
    // ----------------------------------------------------
    const report3Res = await request({
      path: `/api/admin/reports/${id3}`,
      method: 'GET',
      headers: { Cookie: activeAdminCookie }
    });
    assert(report3Res.data?.report?.title === '<script>alert(1)</script>', 'XSS payload stored as pure string literal; textContent rendering ensures zero script execution');

    // ----------------------------------------------------
    // TEST 15: PATCH and Public Track Safe Timeline Verification
    // ----------------------------------------------------
    const patchRes3 = await request({
      path: `/api/admin/reports/${id3}`,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: activeAdminCookie
      }
    }, {
      status: 'Resolved',
      priority: 'Critical',
      note: 'Bulb and ballast replaced by line technician.'
    });
    assert(patchRes3.statusCode === 200, 'PATCH on Report 3 returns HTTP 200');

    const trackRes3 = await request({
      path: `/api/track/${id3}`,
      method: 'GET'
    });
    assert(trackRes3.statusCode === 200, 'Track endpoint responds with HTTP 200');
    assert(trackRes3.data?.report?.status === 'Resolved', 'Track reflects updated status: Resolved');
    const timelineItems = trackRes3.data?.report?.timeline || [];
    assert(timelineItems.length >= 2, 'Timeline has chronological entries');
    assert(typeof timelineItems[1].note === 'undefined', 'Track timeline strictly omits internal notes');

    // ----------------------------------------------------
    // TEST 16: Export CSV Includes All Reports
    // ----------------------------------------------------
    const csvRes2 = await request({
      path: '/api/admin/export.csv',
      method: 'GET',
      headers: { Cookie: activeAdminCookie }
    });
    assert(csvRes2.statusCode === 200, 'Export CSV returns HTTP 200');
    assert(csvRes2.rawBody.includes(id1) && csvRes2.rawBody.includes(id2) && csvRes2.rawBody.includes(id3), 'CSV includes all created test reports');

    // ----------------------------------------------------
    // TEST 16.5: ADMIN_PASSWORD Override and Registered Admin Protection
    // ----------------------------------------------------
    console.log('\n[ADMIN_PASSWORD Test] Verifying ADMIN_PASSWORD override & user-admin safety...');
    
    // Register a secondary admin as a user
    const regRes = await request(
      {
        path: '/api/admin/register',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        name: 'Field Engineer',
        username: 'engineer.chandwad',
        password: 'Engineer@Pass123'
      }
    );
    assert(regRes.statusCode === 201, 'User registration of secondary admin succeeds (HTTP 201)');

    // Stop server and restart with ADMIN_PASSWORD override
    serverProcess.kill();
    await delay(500);

    const OVERRIDE_PASS = 'CustomRoot@2026';
    serverProcess = startServer({ ADMIN_PASSWORD: OVERRIDE_PASS });
    await waitForServer();

    // Verify lokrun.admin logs in with the new ADMIN_PASSWORD
    const overrideLogin = await request(
      {
        path: '/api/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        username: 'lokrun.admin',
        password: OVERRIDE_PASS
      }
    );
    assert(overrideLogin.statusCode === 200, 'Seeded lokrun.admin logs in with ADMIN_PASSWORD override');

    // Verify lokrun.admin CANNOT log in with old password
    const oldLogin = await request(
      {
        path: '/api/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        username: 'lokrun.admin',
        password: 'Lokrun@2026'
      }
    );
    assert(oldLogin.statusCode === 401, 'Seeded lokrun.admin old password rejected after ADMIN_PASSWORD override');

    // Verify registered engineer password was untouched
    const userAdminLogin = await request(
      {
        path: '/api/admin/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      {
        username: 'engineer.chandwad',
        password: 'Engineer@Pass123'
      }
    );
    assert(userAdminLogin.statusCode === 200, 'Registered admin password preserved and untouched by ADMIN_PASSWORD override');

  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
    // Delete temporary test directory completely
    try {
      if (fs.existsSync(TEST_ROOT)) {
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
      }
    } catch (cleanupErr) {}
  }

  // ----------------------------------------------------
  // TEST 17: Live Database Pristine Verification
  // ----------------------------------------------------
  console.log('\n[Live Data Verification] Verifying live data/db.json and uploads/ are clean...');
  const liveDbPath = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(liveDbPath)) {
    const liveDb = JSON.parse(fs.readFileSync(liveDbPath, 'utf-8'));
    console.log(`Live reports count: ${liveDb.reports.length}`);
    assert(liveDb.reports.length === 0, 'Live data/db.json contains 0 reports (pristine live state)');
    assert(liveDb.auditLog.length === 0, 'Live data/db.json contains 0 audit logs (pristine live state)');
    assert(liveDb.admins.length === 1, 'Live data/db.json contains exactly 1 admin account');
    assert(liveDb.admins[0].username === 'lokrun.admin', 'Live admin account is lokrun.admin');
  }
  const liveUploadsDir = path.join(__dirname, '..', 'uploads');
  if (fs.existsSync(liveUploadsDir)) {
    const liveFiles = fs.readdirSync(liveUploadsDir).filter(f => !f.startsWith('.'));
    console.log(`Live uploads file count: ${liveFiles.length}`);
    assert(liveFiles.length === 0, 'Live uploads/ folder is empty (pristine live state)');
  }

  console.log('\n=====================================================================');
  console.log(`   TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
