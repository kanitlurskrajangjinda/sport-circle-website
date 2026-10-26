const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.resolve(__dirname);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// ปรับเปลี่ยนโมเดลเป็น gemini-3.5-flash-lite เพื่อเน้นความเร็ว Latency ต่ำ ตอบสนองไวที่สุด
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

const MAX_BODY_BYTES = 8 * 1024 * 1024;        
const MAX_IMAGE_BASE64 = 7 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// ฟังก์ชันเรียก Gemini พร้อมระบบลองใหม่อัตโนมัติเมื่อเจอ 503 (High Demand)
async function fetchGeminiWithRetry(url, options, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 503 && i < retries - 1) {
      console.warn(`⚠️ เจอปัญหา 503 (High Demand) กำลังลองใหม่ครั้งที่ ${i + 1} ในอีก ${delay / 1000} วินาที...`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // เพิ่มเวลาคอยในรอบถัดไป (Exponential backoff)
      continue;
    }
    return res;
  }
}

async function handleVerifySlip(req, res) {
  console.log('\n--- ได้รับคำขอ /api/verify-slip ---');
  if (!GEMINI_API_KEY) {
    console.warn('❌ Server not configured: missing GEMINI_API_KEY');
    return sendJson(res, 500, { error: 'server not configured' });
  }

  let payload;
  try { 
    payload = JSON.parse(await readBody(req)); 
  } catch (e) { 
    console.warn('❌ Bad request payload');
    return sendJson(res, e.status || 400, { error: 'bad request' }); 
  }

  const { image_base64, mime_type, expected_amount } = payload || {};
  const amount = Number(expected_amount);
  if (typeof image_base64 !== 'string' || !image_base64 || image_base64.length > MAX_IMAGE_BASE64) {
    return sendJson(res, 400, { error: 'invalid or too large image' });
  }
  if (!ALLOWED_MIME.includes(mime_type)) return sendJson(res, 400, { error: 'unsupported image type' });
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) return sendJson(res, 400, { error: 'invalid amount' });

  const prompt = `ตรวจสอบสลิปการโอนเงินรูปนี้ แล้วตอบกลับมาเป็น JSON เท่านั้น (ไม่ต้องมีข้อความอื่น):
{
  "amount": <จำนวนเงินที่โอนตามสลิป ตัวเลข>,
  "has_slip": <true ถ้าเป็นรูปสลิปการโอนเงินจริง, false ถ้าไม่ใช่>,
  "approved": <true ถ้าจำนวนเงินที่โอน >= ${amount} และเป็นสลิปจริง, false ถ้าไม่ใช่>
}`;

  try {
    console.log(`-> กำลังส่งรูปไปที่ Gemini AI ( Model: ${GEMINI_MODEL} )...`);
    const g = await fetchGeminiWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type, data: image_base64 } }, { text: prompt }] }],
        generationConfig: { temperature: 0 }
      })
    });
    
    const errTxt = await g.text();
    console.log('<- Gemini Response Status:', g.status);
    if (!g.ok) { 
      console.warn('❌ Gemini API Error Details:', errTxt); 
      return sendJson(res, 502, { error: 'AI service error', details: errTxt }); 
    }

    let data;
    try { data = JSON.parse(errTxt); } catch (e) { return sendJson(res, 502, { error: 'invalid json from ai', details: errTxt }); }

    let text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    text = text.replace(/```json|```/g, '').trim();
    let verdict;
    try { verdict = JSON.parse(text); } catch { verdict = { approved: false }; }
    console.log('✅ ตรวจสอบสลิปสำเร็จ ผลลัพธ์:', verdict);
    return sendJson(res, 200, {
      approved: verdict.approved === true,
      has_slip: verdict.has_slip === true,
      amount: Number.isFinite(Number(verdict.amount)) ? Number(verdict.amount) : null
    });
  } catch (e) {
    console.warn('❌ verify-slip failed:', e.message);
    return sendJson(res, 502, { error: 'AI service unavailable', details: e.message });
  }
}

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  if (pathname === '/' || pathname.endsWith('/')) pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }

  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
    res.end(buf);
  });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url === '/api/verify-slip') {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }); return res.end(); }
    return handleVerifySlip(req, res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res);
}).listen(PORT, () => console.log('Sport Circle server on port ' + PORT));