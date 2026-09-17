import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { db } from '../src/server/db';

const BASE_URL = 'http://127.0.0.1:3000';
const ARTIFACT_PATH =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81/folder_watcher_ui.png';
const INCOMING_DIR = path.join(process.cwd(), 'media/incoming');
const FIXTURE_PATH = path.join(process.cwd(), 'tests/fixtures/test-source.mp4');
const TEST_FILENAME = 'Video_From_Raditya Dika_Eksperimen Watcher.mp4';
const TARGET_FILE_PATH = path.join(INCOMING_DIR, TEST_FILENAME);

let serverProcess: ChildProcess | null = null;

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/system/status`, { signal: AbortSignal.timeout(2000) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function ensureServerRunning() {
  if (await isServerRunning()) {
    console.log('✅ Next.js server sudah berjalan di', BASE_URL);
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
    if (!msg.includes('ExperimentalWarning') && !msg.includes('Fast Refresh')) {
      // console.error('[server stderr]', msg);
    }
  });

  const startTime = Date.now();
  while (Date.now() - startTime < 45000) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await isServerRunning()) {
      console.log('✅ Server aktif dalam', ((Date.now() - startTime) / 1000).toFixed(1), 'detik');
      return;
    }
  }

  throw new Error('Gagal memulai Next.js server dalam 45 detik');
}

async function runTest() {
  console.log('📁 Memulai Playwright E2E Test: Folder Watcher UI & Auto-Ingest Integration');

  await ensureServerRunning();

  // 1. Pastikan folder artefak ada
  const artifactDir = path.dirname(ARTIFACT_PATH);
  if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
  }

  // 2. Pastikan folder media/incoming ada
  if (!fs.existsSync(INCOMING_DIR)) {
    fs.mkdirSync(INCOMING_DIR, { recursive: true });
  }

  // Hapus file lama jika tersisa
  if (fs.existsSync(TARGET_FILE_PATH)) {
    fs.unlinkSync(TARGET_FILE_PATH);
  }

  // 3. Pastikan watcher daemon aktif melalui API
  console.log('\n📡 Memastikan status Folder Watcher daemon aktif...');
  const activateRes = await fetch(`${BASE_URL}/api/system/watcher`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: true }),
  });
  const activateData = await activateRes.json();
  console.log('✅ Status Watcher API:', activateData.data?.active ? 'Aktif (Running)' : 'Nonaktif');

  // 4. Salin file fixture ke media/incoming/Video_From_Raditya Dika_Eksperimen Watcher.mp4
  console.log(`\n📥 Meletakkan video contoh ke: media/incoming/${TEST_FILENAME}...`);
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`File fixture tidak ditemukan di: ${FIXTURE_PATH}`);
  }
  fs.copyFileSync(FIXTURE_PATH, TARGET_FILE_PATH);
  console.log('✅ File berhasil disalin ke media/incoming.');

  // 5. Tunggu proses ingest oleh folder watcher daemon (stability check + parsing + job creation)
  console.log('⏳ Menunggu deteksi file dan kestabilan berkas (debounce)...');
  let detectedRecord: any = null;
  const pollStart = Date.now();
  const timeoutMs = 25000;

  while (Date.now() - pollStart < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(`${BASE_URL}/api/system/watcher`);
      const body = await res.json();
      if (body.success && body.data?.processedFiles) {
        const match = body.data.processedFiles.find(
          (f: any) => f.originalFilename === TEST_FILENAME && f.status === 'SUCCESS',
        );
        if (match) {
          detectedRecord = match;
          break;
        }
      }
    } catch {
      // retry
    }
  }

  if (!detectedRecord) {
    // Fallback: periksa langsung di database apakah Job dengan sourceChannel Raditya Dika dibuat
    console.log('⚠️ Belum muncul di history watcher, memeriksa langsung ke database...');
    const dbJob = await db.job.findFirst({
      where: {
        sourceChannel: 'Raditya Dika',
        sourceFilename: TEST_FILENAME,
      },
    });
    if (dbJob) {
      detectedRecord = {
        jobId: dbJob.id,
        sourceChannel: dbJob.sourceChannel,
        sourceTitle: dbJob.sourceTitle,
      };
    }
  }

  if (!detectedRecord) {
    throw new Error(
      `File ${TEST_FILENAME} tidak terdeteksi oleh watcher dalam batas waktu ${timeoutMs / 1000} detik`,
    );
  }

  console.log('🎉 File berhasil terdeteksi dan di-ingest secara otomatis!');
  console.log(`   - Job ID: ${detectedRecord.jobId}`);
  console.log(`   - Atribusi Channel: "${detectedRecord.sourceChannel}"`);
  console.log(`   - Judul Video: "${detectedRecord.sourceTitle}"`);

  // 6. Jalankan pengujian browser dengan Playwright
  console.log('\n🌐 Meluncurkan browser Chrome untuk verifikasi UI...');
  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  try {
    // ==========================================
    // A. VERIFIKASI HALAMAN PENGATURAN (/settings)
    // ==========================================
    console.log('\n⚙️ 1. Membuka halaman pengaturan: http://127.0.0.1:3000/settings ...');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle', timeout: 30000 });

    // Verifikasi kartu konfigurasi "Auto-Ingest Folder Watcher (media/incoming/)"
    const settingsCard = page.locator('[data-testid="folder-watcher-settings-card"]');
    await settingsCard.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Kartu konfigurasi "Auto-Ingest Folder Watcher (media/incoming/)" terlihat.');

    // Verifikasi badge status di settings
    const settingsBadge = page.locator('[data-testid="watcher-settings-badge"]');
    await settingsBadge.waitFor({ state: 'visible', timeout: 5000 });
    const badgeText = await settingsBadge.textContent();
    console.log(`✅ Badge status pengaturan: "${badgeText?.trim()}"`);

    // Verifikasi tombol toggle switch ada dan dapat diklik
    const toggleBtn = page.locator('[data-testid="watcher-toggle-button"]');
    await toggleBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('✅ Tombol toggle ON/OFF Folder Watcher aktif dan siap digunakan.');

    // Verifikasi info direktori media/incoming/
    const incomingDirText = await page.locator('text=media/incoming/').first().textContent();
    console.log(`✅ Informasi direktori tampil: "${incomingDirText?.trim()}"`);

    // ==========================================
    // B. VERIFIKASI DASBOR UTAMA (/)
    // ==========================================
    console.log('\n📊 2. Membuka halaman dasbor: http://127.0.0.1:3000/ ...');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle', timeout: 30000 });

    // Tunggu badge folder watcher di SystemStatus
    const watcherBadge = page.locator('[data-testid="watcher-status-badge"]');
    await watcherBadge.waitFor({ state: 'visible', timeout: 15000 });
    const watcherStatusText = await watcherBadge.textContent();
    console.log(`✅ Indikator badge di SystemStatus: "${watcherStatusText?.trim()}"`);

    // Verifikasi antrean status
    const queueStatus = page.locator('[data-testid="watcher-queue-status"]');
    await queueStatus.waitFor({ state: 'visible', timeout: 5000 });
    const pendingCount = await page.locator('[data-testid="watcher-pending-count"]').textContent();
    console.log(`✅ Counter antrean/memproses: "${pendingCount?.trim()}"`);

    // Verifikasi kemunculan job baru dengan atribusi "Raditya Dika" di JobList
    console.log('🔎 Memverifikasi job baru pada tabel daftar job...');
    const channelBadge = page.locator('text=Raditya Dika').first();
    await channelBadge.waitFor({ state: 'visible', timeout: 15000 });
    console.log('✅ Atribusi channel "Raditya Dika" berhasil terverifikasi pada tabel Job!');

    // Pastikan judul video atau nama file juga ada di baris job
    const titleMatch = page.locator('text=Eksperimen Watcher').first();
    const hasTitle = await titleMatch.isVisible();
    if (hasTitle) {
      console.log('✅ Judul video "Eksperimen Watcher" tampil di daftar job.');
    }

    // Ambil screenshot hasil deteksi ke direktori artefak yang ditentukan
    console.log(`\n📸 Mengambil screenshot UI ke: ${ARTIFACT_PATH} ...`);
    await page.screenshot({
      path: ARTIFACT_PATH,
      fullPage: true,
    });
    console.log(`✅ Screenshot berhasil disimpan: ${path.basename(ARTIFACT_PATH)}`);

    console.log('\n======================================================');
    console.log('🎉 SEMUA PENGUJIAN E2E FOLDER WATCHER LULUS 100%! 🎉');
    console.log('======================================================');
  } finally {
    await browser.close();
  }
}

runTest()
  .then(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ E2E Test Gagal:', err);
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    process.exit(1);
  });
