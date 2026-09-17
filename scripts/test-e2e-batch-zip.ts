import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { db } from '../src/server/db';

const BASE_URL = 'http://127.0.0.1:3000';
const ARTIFACT_PATH =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81/batch_zip_ui.png';

let serverProcess: ChildProcess | null = null;

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServerRunning() {
  if (await isServerRunning()) {
    console.log('✅ Next.js dev server sudah berjalan di', BASE_URL);
    return;
  }

  console.log('🚀 Menjalankan Next.js dev server pada', BASE_URL, '...');
  serverProcess = spawn('npx', ['next', 'dev', '-p', '3000', '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3000', HOSTNAME: '127.0.0.1' },
  });

  serverProcess.stderr?.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('ExperimentalWarning')) {
      // console.error('[server error]', msg);
    }
  });

  const startTime = Date.now();
  while (Date.now() - startTime < 45000) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await isServerRunning()) {
      console.log(
        '✅ Server berhasil aktif dalam',
        ((Date.now() - startTime) / 1000).toFixed(1),
        'detik',
      );
      return;
    }
  }

  throw new Error('Gagal memulai Next.js dev server dalam 45 detik');
}

async function runTest() {
  console.log('📦 Memulai Playwright E2E Test: Batch ZIP Export & WebUI Integration');

  await ensureServerRunning();

  // Pastikan direktori artefak ada
  const artifactDir = path.dirname(ARTIFACT_PATH);
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // Ambil sample job dan clip dari DB
  const completedJob = await db.job.findFirst({
    where: { status: 'COMPLETED' },
    include: { clips: { where: { isExported: true } } },
  });

  if (!completedJob || completedJob.clips.length === 0) {
    throw new Error('Tidak ada job COMPLETED dengan klip isExported: true di database');
  }

  console.log(
    `📌 Menggunakan Job ID: ${completedJob.id} (${completedJob.clips.length} klip terekspor)`,
  );

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });

  const page = await context.newPage();

  page.on('console', (msg) => console.log(`🖥️ [Browser Console ${msg.type()}]:`, msg.text()));
  page.on('pageerror', (err) => console.error(`🚨 [Browser Page Error]:`, err));
  page.on('request', (req) => {
    if (req.url().includes('/api/')) {
      console.log(`➡️ [API Request]: ${req.method()} ${req.url()}`);
    }
  });
  page.on('response', (res) => {
    if (res.url().includes('/api/')) {
      console.log(`⬅️ [API Response]: ${res.status()} ${res.url()}`);
    }
  });

  try {
    // ==========================================
    // 1. UJI HALAMAN GALERI KLIP (/clips)
    // ==========================================
    console.log('\n🌐 1. Membuka halaman galeri klip: http://127.0.0.1:3000/clips ...');
    await page.goto(`${BASE_URL}/clips`, { waitUntil: 'networkidle', timeout: 30000 });

    // Verifikasi tombol [📦 Unduh Semua Klip (ZIP)] muncul
    const batchZipBtn = page.locator('button:has-text("Unduh Semua Klip (ZIP)")');
    await batchZipBtn.waitFor({ state: 'visible', timeout: 30000 });
    console.log('✅ Tombol [📦 Unduh Semua Klip (ZIP)] ditemukan di header galeri klip.');

    // Verifikasi tombol dalam kondisi aktif (tidak disabled) karena terdapat klip isExported: true
    const isDisabled = await batchZipBtn.isDisabled();
    if (isDisabled) {
      throw new Error(
        'Tombol [📦 Unduh Semua Klip (ZIP)] harus aktif ketika terdapat klip yang diekspor!',
      );
    }
    console.log('✅ Tombol aktif dan dapat diklik (isExported: true terdeteksi).');

    // Screenshot tampilan UI galeri klip beserta tombol ZIP
    await page.screenshot({
      path: ARTIFACT_PATH,
      fullPage: false,
    });
    console.log(`📸 Screenshot berhasil disimpan ke: ${ARTIFACT_PATH}`);

    // Uji klik tombol dan verifikasi download / respons ZIP
    console.log('⬇️  Menguji klik tombol [📦 Unduh Semua Klip (ZIP)]...');

    const responsePromise = page.waitForResponse(
      (res) =>
        (res.url().includes('/download-all') || res.url().includes('/batch-download')) &&
        res.status() === 200,
      { timeout: 60000 },
    );

    const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);

    await batchZipBtn.click();

    // Verifikasi respons streaming ZIP
    const zipResponse = await responsePromise;
    const contentType = zipResponse.headers()['content-type'] || '';
    const contentDisposition = zipResponse.headers()['content-disposition'] || '';
    const contentLength = parseInt(zipResponse.headers()['content-length'] || '0', 10);

    console.log(`✅ Respons API ZIP diterima:`);
    console.log(`   - HTTP Status: ${zipResponse.status()}`);
    console.log(`   - Content-Type: ${contentType}`);
    console.log(`   - Content-Disposition: ${contentDisposition}`);
    console.log(
      `   - Content-Length: ${(contentLength / (1024 * 1024)).toFixed(2)} MB (${contentLength} bytes)`,
    );

    if (!contentType.includes('application/zip')) {
      throw new Error(
        `Content-Type tidak valid: diharapkan application/zip, diterima ${contentType}`,
      );
    }

    if (!contentDisposition.includes('.zip')) {
      throw new Error(`Content-Disposition tidak mengandung .zip: ${contentDisposition}`);
    }

    if (contentLength < 1000) {
      throw new Error(`Ukuran file ZIP terlalu kecil: ${contentLength} bytes`);
    }

    const downloadEvent = await downloadPromise;
    if (downloadEvent) {
      console.log(
        `✅ Event browser download terpicu otomatis: ${downloadEvent.suggestedFilename()}`,
      );
      const downloadPath = await downloadEvent.path();
      if (downloadPath && fs.existsSync(downloadPath)) {
        const stats = fs.statSync(downloadPath);
        console.log(
          `✅ File hasil unduhan browser berhasil disimpan ke disk: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`,
        );
      }
    }

    // ==========================================
    // 2. UJI DASBOR & JOB DETAIL
    // ==========================================
    console.log('\n🌐 2. Membuka dasbor: http://127.0.0.1:3000/ ...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });

    // Buka detail job yang selesai dengan mengklik baris job di tabel
    const jobRow = page.locator(`tr:has-text("${completedJob.id}")`).first();
    await jobRow.waitFor({ state: 'visible', timeout: 15000 });
    console.log(`✅ Baris job ${completedJob.id} ditemukan di tabel dasbor, membuka detail...`);
    await jobRow.click();
    await page.waitForTimeout(1000);

    // Verifikasi tombol [📦 Unduh Paket Klip (ZIP)] di JobDetail
    const jobZipBtn = page.locator('a:has-text("Unduh Paket Klip (ZIP)")').first();
    await jobZipBtn.waitFor({ state: 'visible', timeout: 10000 });
    const href = await jobZipBtn.getAttribute('href');
    console.log(
      `✅ Tombol [📦 Unduh Paket Klip (ZIP)] muncul pada header studio clips dengan href: ${href}`,
    );

    if (!href || !href.includes(`/api/jobs/${completedJob.id}/download-all`)) {
      throw new Error(`href tombol tidak sesuai: ${href}`);
    }

    // Uji direct API endpoint download-all
    console.log('⬇️  Menguji request langsung ke GET /api/jobs/[id]/download-all...');
    const apiRes = await page.request.get(`${BASE_URL}/api/jobs/${completedJob.id}/download-all`);
    if (!apiRes.ok()) {
      throw new Error(`GET download-all gagal dengan HTTP ${apiRes.status()}`);
    }
    const apiHeaders = apiRes.headers();
    console.log(`✅ Direct API Status 200 OK, Content-Type: ${apiHeaders['content-type']}`);

    // ==========================================
    // 3. UJI POST /api/clips/batch-download
    // ==========================================
    console.log('\n⬇️  3. Menguji request langsung ke POST /api/clips/batch-download...');
    const batchRes = await page.request.post(`${BASE_URL}/api/clips/batch-download`, {
      data: { clipIds: completedJob.clips.slice(0, 2).map((c) => c.id) },
    });
    if (!batchRes.ok()) {
      throw new Error(`POST /api/clips/batch-download gagal dengan HTTP ${batchRes.status()}`);
    }
    console.log(
      `✅ Batch Download API Status 200 OK, Ukuran: ${(await batchRes.body()).length} bytes`,
    );

    console.log('\n=============================================================');
    console.log('🎉 SEMUA PENGUJIAN PLAYWRIGHT E2E BATCH ZIP BERHASIL 100%! 🎉');
    console.log('=============================================================');
  } catch (error) {
    console.error('❌ E2E Test Gagal:', error);
    throw error;
  } finally {
    await browser.close();
    if (serverProcess) {
      console.log('🛑 Menghentikan server proses background...');
      serverProcess.kill();
    }
  }
}

runTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
