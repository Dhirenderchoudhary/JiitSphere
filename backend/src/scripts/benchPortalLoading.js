// Measures how long the portal dashboard takes to load against a fake JIIT
// portal that answers every request after a fixed delay, replaying the request
// sequence the dashboard sent in production.
//   node src/scripts/benchPortalLoading.js [latencyMs] [label]
// Prints wall time and portal calls per step; writes <label>.json to the OS temp dir.
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const os = require('os');

const LAT = Number(process.argv[2] || 700);
const label = process.argv[3] || `portal-loading-${LAT}ms`;
const PORT = 46000 + Math.floor(Math.random() * 900);
Object.assign(process.env, {
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret-that-is-long-enough-for-zod',
  ADMIN_API_KEY: 'k',
  USER_PASSWORD_HASH: 'x',
  USER_ALLOWED_IDENTIFIERS: 'student1',
  MONGODB_URI: 'mongodb://localhost:27017/dummy',
  PORTAL_RELAY_BASE_URL: `http://127.0.0.1:${PORT}/studentportal`,
});
// Required after the env above: config reads it at load time.
const request = require('supertest');
const { buildPortalAesKey } = require('../utils/portalCrypto');
const app = require('../app');

const decrypt = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'string') return parsed;
    const d = crypto.createDecipheriv(
      'aes-128-cbc',
      Buffer.from(buildPortalAesKey(new Date(), 'Asia/Kolkata'), 'utf8'),
      Buffer.from('dcek9wb8frty1pnm', 'utf8')
    );
    return JSON.parse(Buffer.concat([d.update(parsed, 'base64'), d.final()]).toString('utf8'));
  } catch {
    return {};
  }
};

const ENR = '9921103001';
const SEMS = [
  { registrationid: 'R26', registrationcode: '2026ODDSEM', stynumber: '7' },
  { registrationid: 'R25', registrationcode: '2025EVESEM', stynumber: '6' },
];
const SUBJECTS = ['CN', 'AI', 'SE', 'TOC', 'DS', 'OS'].map((s, i) => ({
  subjectcode: `${s}(15B11CI${i}11)`,
  individualsubjectcode: `15B11CI${i}11`,
  subjectid: `S${i}`,
  subjectdesc: s,
  Lsubjectcomponentid: `L${i}`,
  Tsubjectcomponentid: `T${i}`,
  LTpercantage: 80 + i,
  Lpercentage: 80,
  Tpercentage: 85,
}));
const ok = (response) => ({ status: { responseStatus: 'Success' }, response });
const RESPONSES = {
  'getstudent-personalinformation': () =>
    ok({
      generalinformation: {
        registrationno: ENR,
        studentname: 'A Student',
        programcode: 'B.Tech',
        semester: '7',
        instituteemail: `${ENR}@mail.jiit.ac.in`,
        mobileno: '9999999999',
        fathersname: 'F',
        mothername: 'M',
      },
      'photo&signature': { photo: 'iVBORw0KGgo=' },
    }),
  getstudentInforegistrationforattendence: () =>
    ok({ semlist: SEMS, headerlist: [{ stynumber: '7', registrationid: 'R26' }] }),
  getstudentattendancedetail: () => ok({ studentattendancelist: SUBJECTS, currentSem: '7' }),
  getstudentsubjectpersentage: () =>
    ok({
      studentAttdsummarylist: [
        { datetime: '01/10/2026 (09:00:AM - 10:00:AM)', present: 'Present' },
        { datetime: '02/10/2026 (09:00:AM - 10:00:AM)', present: 'Absent' },
      ],
    }),
  getregistrationList: () => ok({ registrations: SEMS }),
  getstudentinfo: () => ok({ studentinfo: { studentname: 'A Student', enrollmentno: ENR } }),
  checkIfstudentmasterexist: () =>
    ok({ studentlov: { stynumber: '7', programid: 'P1', branchid: 'B1' } }),
};
const portalLog = [];
// Endpoints answered with an empty success because the fake portal has no
// realistic reply for them; timings that depend on them are less trustworthy.
const unmodelled = new Set();
let inFlight = 0;
let peak = 0;
const portal = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => {
    raw += c;
  });
  req.on('end', () => {
    const ep = req.url.split('?')[0].split('/').pop();
    portalLog.push({ ep, t: Date.now() });
    inFlight++;
    peak = Math.max(peak, inFlight);
    setTimeout(() => {
      inFlight--;
      const fn = RESPONSES[ep];
      if (!fn) unmodelled.add(ep);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(fn ? fn(decrypt(raw || '{}')) : ok({})));
    }, LAT);
  });
});

(async () => {
  await new Promise((r) => portal.listen(PORT, '127.0.0.1', r));
  const results = [];
  const step = async (name, fn) => {
    const from = portalLog.length;
    const t0 = Date.now();
    const r = await fn();
    const ms = Date.now() - t0;
    if (r.status >= 400) throw new Error(`${name} returned HTTP ${r.status}`);
    const calls = portalLog.slice(from).map((h) => h.ep);
    results.push({ name, ms, status: r.status, portalCalls: calls.length, endpoints: calls });
    console.log(
      `${name.padEnd(46)} ${String(ms).padStart(6)} ms  portal calls=${String(calls.length).padStart(3)}  HTTP ${r.status}`
    );
    return r;
  };

  const g = await step('POST /auth/portal-google', () =>
    request(app)
      .post('/api/v1/auth/portal-google')
      .send({
        response: {
          token: 'PT',
          value: 'JAYPEE',
          label: 'JIIT',
          clientid: 'JAYPEE',
          enrollmentno: ENR,
          userid: ENR,
          name: 'A Student',
          membertype: 'S',
        },
      })
  );
  const { token, relaySessionId } = g.body.data;
  const auth = { Authorization: `Bearer ${token}` };
  const get = (u) => () => request(app).get(`/api/v1/portal${u}`).set(auth);
  await step('POST /portal/sdk/login', () =>
    request(app).post('/api/v1/portal/sdk/login').set(auth).send({ userId: ENR, relaySessionId })
  );
  const loginMs = results[0].ms + results[1].ms;

  // The dashboard sends refresh=1 on these when NEXT_PUBLIC_PORTAL_REALTIME=true.
  const t0 = Date.now();
  await step('GET sdk/session?refresh=1', get('/sdk/session?refresh=1'));
  await step('GET attendance/meta?refresh=1', get('/sdk/attendance/meta?refresh=1'));
  await step(
    'GET attendance?semester=R26&refresh=1',
    get('/sdk/attendance?semester=R26&refresh=1')
  );
  await step('GET attendance/counts?semester=R26', get('/sdk/attendance/counts?semester=R26'));
  const attendanceReadyMs = Date.now() - t0;
  await step(
    'GET attendance?semester=R25&refresh=1',
    get('/sdk/attendance?semester=R25&refresh=1')
  );
  await step('GET attendance/counts?semester=R25', get('/sdk/attendance/counts?semester=R25'));
  await step(
    'GET attendance/subject R26 CN',
    get('/sdk/attendance/subject?semester=R26&subject=CN(15B11CI011)')
  );
  await step('GET grades', get('/sdk/grades'));
  await step('GET grades?refresh=1', get('/sdk/grades?refresh=1'));
  await step('GET exams?refresh=1', get('/sdk/exams?refresh=1'));
  await step('GET subjects?semester=R26&refresh=1', get('/sdk/subjects?semester=R26&refresh=1'));
  await step('GET fees?refresh=1', get('/sdk/fees?refresh=1'));
  await step('GET profile', get('/sdk/profile'));
  await step('GET profile?refresh=1', get('/sdk/profile?refresh=1'));
  // Second visit to the attendance tab, as when switching tabs back.
  const t1 = Date.now();
  await step('REVISIT attendance/meta?refresh=1', get('/sdk/attendance/meta?refresh=1'));
  await step(
    'REVISIT attendance?semester=R26&refresh=1',
    get('/sdk/attendance?semester=R26&refresh=1')
  );
  await step('REVISIT attendance/counts?semester=R26', get('/sdk/attendance/counts?semester=R26'));
  const revisitMs = Date.now() - t1;

  const total = results.reduce((a, r) => a + r.ms, 0);
  const totalCalls = results.reduce((a, r) => a + r.portalCalls, 0);
  const summary = {
    label,
    latencyMs: LAT,
    loginMs,
    attendanceReadyMs,
    revisitMs,
    totalSequentialMs: total,
    totalPortalCalls: totalCalls,
    peakConcurrentPortalCalls: peak,
    unmodelledEndpoints: [...unmodelled].sort(),
  };
  console.log('\nSUMMARY', JSON.stringify(summary));
  fs.writeFileSync(
    path.join(os.tmpdir(), `${label}.json`),
    JSON.stringify({ summary, results }, null, 2)
  );
  portal.close();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
