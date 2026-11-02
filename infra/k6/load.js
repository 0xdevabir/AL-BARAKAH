// Customer traffic mix: mostly browsing, with some orders. Run as described in docs/load-test.md.
import { check, sleep } from 'k6';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const orderFailed = new Rate('order_failed');
const BASE = __ENV.BASE ?? 'http://edge';
const PEAK = Number(__ENV.PEAK ?? 1000);
const HOLD = __ENV.HOLD ?? '3m';

export const options = {
  scenarios: {
    customers: {
      executor: 'ramping-vus',
      stages: [{ duration: '1m', target: PEAK }, { duration: HOLD, target: PEAK }, { duration: '20s', target: 0 }],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // Orders are a small share of traffic, so the overall rate above could hide them all failing.
    order_failed: ['rate<0.01'],
    'http_req_duration{kind:api}': ['p(95)<500'],
    'http_req_duration{kind:page}': ['p(95)<800'],
    'http_req_duration{kind:order}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function token() {
  const b64 = (s) => encoding.b64encode(s, 'rawurl');
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'HS256' }));
  const body = b64(JSON.stringify({ sub: __ENV.USER_ID, role: 'CUSTOMER', mfa: false, iss: 'albarakah', iat: now, exp: now + 900 }));
  const sig = crypto.hmac('sha256', __ENV.JWT_SECRET, `${head}.${body}`, 'base64rawurl');
  return `${head}.${body}.${sig}`;
}

function get(path, kind) {
  const res = http.get(`${BASE}${path}`, { tags: { kind, name: path.split('?')[0] } });
  check(res, { [`${kind} ok`]: (r) => r.status === 200 });
  return res;
}

export function setup() {
  const meds = http.get(`${BASE}/api/medicines?page=1`).json();
  const items = meds.items ?? meds.data ?? meds;
  return { medicine: items[0] };
}

export default function (data) {
  get('/', 'page');
  sleep(1 + Math.random() * 2);
  get(`/api/medicines?q=${['napa', 'seclo', 'fexo', 'para'][__ITER % 4]}`, 'api');
  sleep(1 + Math.random() * 2);
  get(`/medicine/${data.medicine.slug}`, 'page');
  sleep(1 + Math.random() * 2);
  get('/api/doctors', 'api');
  get('/api/delivery-slots', 'api');
  sleep(1 + Math.random() * 2);

  if (Math.random() < 0.1) {
    // Slots expire as the clock moves, so this must not be fetched once at the start of the run.
    const { slots } = get('/api/delivery-slots', 'api').json();
    const res = http.post(`${BASE}/api/orders`, JSON.stringify({
      idempotencyKey: encoding.b64encode(crypto.randomBytes(18), 'rawurl'),
      addressId: __ENV.ADDRESS_ID,
      type: 'NORMAL',
      slotStart: slots[0].start,
      paymentMethod: 'COD',
      items: [{ medicineId: data.medicine.id, qty: 1 }],
    }), {
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      tags: { kind: 'order', name: '/api/orders' },
    });
    const placed = res.status === 201;
    orderFailed.add(!placed);
    check(res, { 'order ok': () => placed });
    sleep(1);
  }
}
