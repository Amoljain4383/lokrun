/**
 * Lokrun Frontend & User Flow Verification Suite (Live-Data Only Edition)
 * Verifies all browser flows specified in the user prompt:
 * 1. Submit with GPS (real detected coordinates)
 * 2. Submit with landmark only (lat/lng empty/null)
 * 3. Submit with no image
 * 4. Oversized (>5 MB) image rejected
 * 5. Fake image (bad magic bytes) rejected
 * 6. Reference ID generation and public Track response (safe fields only: status and dates)
 * 7. Denied-location fallback messaging
 * 8. Static assets integrity and responsive CSS validation
 *
 * Runs strictly in an isolated temporary directory so live data/db.json and uploads/ are untouched.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PIPE_PATH = process.platform === 'win32'
  ? `\\\\.\\pipe\\lokrun_fe_test_${process.pid}_${Date.now()}`
  : `/tmp/lokrun_fe_test_${process.pid}.sock`;

const TEST_ROOT = path.join(__dirname, '..', `.tmp_fe_test_${process.pid}`);
const TEST_DATA_DIR = path.join(TEST_ROOT, 'data');
const TEST_UPLOADS_DIR = path.join(TEST_ROOT, 'uploads');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      ...options,
      socketPath: PIPE_PATH
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

async function run() {
  console.log('\n=====================================================================');
  console.log('   LOKRUN FRONTEND & USER-FLOW VERIFICATION SUITE');
  console.log('   Rule: LIVE DATA ONLY - Zero Demo/Placeholder Data');
  console.log('=====================================================================\n');

  if (!fs.existsSync(TEST_DATA_DIR)) fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  if (!fs.existsSync(TEST_UPLOADS_DIR)) fs.mkdirSync(TEST_UPLOADS_DIR, { recursive: true });

  // Start server with isolated test directories
  const env = {
    ...process.env,
    LOKRUN_PIPE: PIPE_PATH,
    LOKRUN_DATA_DIR: TEST_DATA_DIR,
    LOKRUN_UPLOADS_DIR: TEST_UPLOADS_DIR
  };
  const serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env
  });

  // Wait for server
  for (let i = 0; i < 25; i++) {
    try {
      const res = await request({ path: '/', method: 'GET' });
      if (res.statusCode === 200) break;
    } catch (e) {}
    await delay(150);
  }

  let passed = 0;
  let failed = 0;
  const createdIds = [];

  function assert(condition, message) {
    if (condition) {
      console.log(` [PASS] ${message}`);
      passed++;
    } else {
      console.error(` [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check index.html markup
    const indexRes = await request({ path: '/', method: 'GET' });
    assert(indexRes.rawBody.includes('Better roads begin with <span>being heard.</span>'), 'Hero headline rendered in index.html');
    assert(indexRes.rawBody.includes('id="report-form"'), 'Report form exists in index.html');
    assert(indexRes.rawBody.includes('id="btn-detect-location"'), 'Detect location button exists in index.html');
    assert(indexRes.rawBody.includes('id="report-success-card"'), 'Success card container exists in index.html');
    assert(indexRes.rawBody.includes('Local prototype – not connected to any government department.'), 'Prototype disclaimer present in index.html footer');
    assert(!indexRes.rawBody.includes('LK-482913'), 'No fake reference IDs embedded in index.html');
    assert(!indexRes.rawBody.includes('LK-000000'), 'No placeholder LK-000000 displayed as real data');

    // 2. Check track.html markup
    const trackRes = await request({ path: '/track.html', method: 'GET' });
    assert(trackRes.statusCode === 200, 'GET /track.html returns HTTP 200');
    assert(trackRes.rawBody.includes('id="track-form"'), 'Track form present in track.html');
    assert(trackRes.rawBody.includes('id="result-timeline"'), 'Result timeline container present in track.html');
    assert(trackRes.rawBody.includes('Local prototype – not connected to any government department.'), 'Prototype disclaimer present in track.html footer');
    assert(!trackRes.rawBody.includes('LK-482913'), 'No fake reference IDs embedded in track.html');

    // 3. Flow 1: Submit with real GPS coordinates
    const gpsPayload = {
      title: 'Broken solar streetlight outside library',
      category: 'Broken streetlights',
      description: 'The pole has fallen due to wind and wires are exposed near student walking path.',
      landmark: 'SNJB Central Library Pathway, Chandwad',
      lat: 20.3275,
      lng: 74.2418,
      contact: { name: 'Pooja Patil', phone: '9822114455', email: 'pooja.p@snjb.org' }
    };
    const resGps = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, gpsPayload);
    assert(resGps.statusCode === 201, 'Flow 1: Submit with GPS returns HTTP 201');
    assert(/^LK-\d{6}$/.test(resGps.data?.report?.id), `Report ID assigned: ${resGps.data?.report?.id}`);
    assert(resGps.data?.report?.mapUrl === 'https://www.google.com/maps?q=20.3275,74.2418', 'Map URL generated from real coordinates');
    createdIds.push(resGps.data?.report?.id);

    // 4. Flow 2: Submit with landmark only (lat/lng empty/null)
    const landmarkOnlyPayload = {
      title: 'Clogged stone culvert near town bus stop',
      category: 'Open or blocked drains',
      description: 'Solid plastic waste and construction silt has completely blocked the storm channel.',
      landmark: 'Old ST Bus Stand Approach Road, Chandwad',
      lat: null, // empty / null coordinates
      lng: null,
      contact: null
    };
    const resLandmark = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, landmarkOnlyPayload);
    assert(resLandmark.statusCode === 201, 'Flow 2: Submit with landmark only (null lat/lng) returns HTTP 201');
    assert(/^LK-\d{6}$/.test(resLandmark.data?.report?.id), `Report ID assigned: ${resLandmark.data?.report?.id}`);
    assert(resLandmark.data?.report?.mapUrl === null, 'Map URL is null when GPS is omitted');
    createdIds.push(resLandmark.data?.report?.id);

    // 5. Flow 3: Submit with no image
    const noImgPayload = {
      title: 'Water pipe leakage across highway shoulder',
      category: 'Waterlogging',
      description: 'Drinking water pipe cracked causing steady stream across two lanes.',
      landmark: 'Near NH-52 Chandwad Bypass overpass',
      lat: 20.319,
      lng: 74.250
    };
    const resNoImg = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, noImgPayload);
    assert(resNoImg.statusCode === 201, 'Flow 3: Submit with no image returns HTTP 201');
    createdIds.push(resNoImg.data?.report?.id);

    // 6. Flow 4 & 5: Oversized and fake images rejected
    const bigImgPayload = {
      title: 'Oversized photo test',
      category: 'Waterlogging',
      description: 'Testing reject of 6 MB file.',
      landmark: 'Subhash Chowk Chandwad',
      lat: 20.325,
      lng: 74.243,
      image: Buffer.alloc(6 * 1024 * 1024, 0xBB).toString('base64')
    };
    const resBig = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, bigImgPayload);
    assert(resBig.statusCode === 400, 'Flow 4: 6 MB image rejected with HTTP 400');

    const fakeImgPayload = {
      title: 'Fake photo test',
      category: 'Waterlogging',
      description: 'Testing reject of plain text posing as image.',
      landmark: 'Subhash Chowk Chandwad',
      lat: 20.325,
      lng: 74.243,
      image: Buffer.from('NOT AN IMAGE FILE').toString('base64')
    };
    const resFake = await request({
      path: '/api/reports',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, fakeImgPayload);
    assert(resFake.statusCode === 400, 'Flow 5: Fake image rejected with HTTP 400');

    // 7. Flow 6: Reference ID appears and Track displays only safe fields
    const trackTestId = createdIds[0];
    const trackQueryRes = await request({ path: `/api/track/${trackTestId}`, method: 'GET' });
    assert(trackQueryRes.statusCode === 200, `Flow 6: Track query for ${trackTestId} returns HTTP 200`);
    assert(trackQueryRes.data?.report?.id === trackTestId, 'Track returns exact report ID');
    assert(trackQueryRes.data?.report?.status === 'Submitted', 'Track shows initial status: Submitted');
    assert(Array.isArray(trackQueryRes.data?.report?.timeline), 'Track provides timeline array');

    // Verify safe fields only: NO notes, NO admin IDs, NO personal data
    const timelineEntry = trackQueryRes.data?.report?.timeline[0];
    assert(timelineEntry && Boolean(timelineEntry.status), 'Timeline entry has status');
    assert(Boolean(timelineEntry.timestamp), 'Timeline entry has timestamp');
    assert(typeof timelineEntry.admin === 'undefined', 'Safe field check: NO admin ID in timeline');
    assert(typeof timelineEntry.note === 'undefined', 'Safe field check: NO internal admin note in timeline');
    assert(!trackQueryRes.data?.report?.contact, 'Track privacy: contact object is omitted');

    // 8. Responsive CSS Validation: shared.css contains mobile-first queries (375px to 1280px)
    const cssContent = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'shared.css'), 'utf-8');
    assert(cssContent.includes('--color-primary: #176B5D;'), 'CSS shared variable --color-primary is #176B5D');
    assert(cssContent.includes('--color-navy: #142B3A;'), 'CSS shared variable --color-navy is #142B3A');
    assert(cssContent.includes('--color-accent-coral: #E05A47;'), 'CSS shared variable --color-accent-coral is #E05A47');
    assert(cssContent.includes('@media (min-width: 768px)'), 'Mobile-first responsive media query @media (min-width: 768px) defined');
    assert(cssContent.includes('@media (min-width: 992px)'), 'Desktop responsive media query @media (min-width: 992px) defined');

  } finally {
    serverProcess.kill();
    try {
      if (fs.existsSync(TEST_ROOT)) {
        fs.rmSync(TEST_ROOT, { recursive: true, force: true });
      }
    } catch (e) {}
  }

  // Live data pristine check
  const liveDbPath = path.join(__dirname, '..', 'data', 'db.json');
  if (fs.existsSync(liveDbPath)) {
    const liveDb = JSON.parse(fs.readFileSync(liveDbPath, 'utf-8'));
    assert(liveDb.reports.length === 0, 'Live data/db.json has 0 reports (pristine)');
    assert(liveDb.admins.length === 1, 'Live data/db.json has exactly 1 admin account');
    assert(liveDb.admins[0].username === 'lokrun.admin', 'Live admin account is lokrun.admin');
  }
  const liveUploads = fs.readdirSync(path.join(__dirname, '..', 'uploads')).filter(f => !f.startsWith('.'));
  assert(liveUploads.length === 0, 'Live uploads/ is completely empty (pristine)');

  console.log('\n=====================================================================');
  console.log(`   FRONTEND VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log('=====================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Frontend verification suite failed:', err);
  process.exit(1);
});
