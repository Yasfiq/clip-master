import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
  console.log('🚀 Memulai UI/UX & Browser QA Testing Copywriting Generator...');

  const browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });

  const page = await context.newPage();

  try {
    // ----------------------------------------------------
    // TEST 1: Membuka dari Halaman Galeri Klip (/clips)
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Buka dari Galeri Klip (/clips) ---');
    await page.goto('http://127.0.0.1:3000/clips', { waitUntil: 'networkidle', timeout: 30000 });
    const clipCardBtn = page.locator('button[title*="Salin Caption"]').first();
    await clipCardBtn.waitFor({ state: 'visible', timeout: 15000 });
    await clipCardBtn.click();

    // Tunggu modal
    const modal = page.locator('div[role="dialog"]');
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForSelector('text=Pratinjau Format Siap Salin', { timeout: 10000 });
    console.log('✅ Modal berhasil terbuka di /clips');

    // ----------------------------------------------------
    // TEST 2: Reaktivitas Form Input Kustom
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Reaktivitas Form Input ---');
    const titleInput = page.locator('input[placeholder="Judul klip..."]');
    const summaryInput = page.locator('textarea[placeholder="Ringkasan poin penting..."]');
    const hashtagInput = page.locator('input[placeholder="#topik #shorts..."]');
    const previewBox = page.locator('div.font-sans.text-xs.text-zinc-200');

    // Ketik judul kustom
    await titleInput.fill('Rahasia Sukses Anti Gagal 2026');
    await page.waitForTimeout(200);
    const previewTextAfterTitle = await previewBox.innerText();
    if (!previewTextAfterTitle.includes('Rahasia Sukses Anti Gagal 2026')) {
      throw new Error('❌ BUG: Perubahan input Judul tidak ter-render di pratinjau!');
    }
    console.log('✅ Input Judul reaktif dan langsung ter-update di pratinjau.');

    // Ketik ringkasan kustom
    await summaryInput.fill(
      'Kunci utama bisnis adalah konsistensi dan eksekusi cepat setiap hari.',
    );
    await page.waitForTimeout(200);
    const previewTextAfterSummary = await previewBox.innerText();
    if (!previewTextAfterSummary.includes('Kunci utama bisnis adalah konsistensi')) {
      throw new Error('❌ BUG: Perubahan input Ringkasan tidak ter-render di pratinjau!');
    }
    console.log('✅ Input Ringkasan reaktif dan langsung ter-update di pratinjau.');

    // Ketik hashtags kustom
    await hashtagInput.fill('#bisnissukses #mindsetjuara #viral2026');
    await page.waitForTimeout(200);
    const previewTextAfterTags = await previewBox.innerText();
    if (!previewTextAfterTags.includes('#bisnissukses #mindsetjuara #viral2026')) {
      throw new Error('❌ BUG: Perubahan input Hashtags tidak ter-render di pratinjau!');
    }
    console.log('✅ Input Hashtags reaktif dan langsung ter-update di pratinjau.');

    // ----------------------------------------------------
    // TEST 3: Pergantian Tab Platform (Preservasi Editan)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Preservasi Editan saat Ganti Tab ---');
    // Klik Tab YouTube Shorts
    await page.locator('button:has-text("YouTube Shorts")').click();
    await page.waitForTimeout(300);
    const ytPreview = await previewBox.innerText();
    if (!ytPreview.includes('Rahasia Sukses Anti Gagal 2026 #shorts')) {
      throw new Error('❌ BUG: Judul kustom hilang atau format YouTube Shorts salah!');
    }
    if (!ytPreview.includes('Kunci utama bisnis adalah konsistensi')) {
      throw new Error('❌ BUG: Ringkasan kustom hilang di YouTube Shorts!');
    }
    console.log('✅ YouTube Shorts mempertahankan nilai editan kustom.');

    // Klik Tab TikTok
    await page.locator('button:has-text("TikTok")').click();
    await page.waitForTimeout(300);
    const ttPreview = await previewBox.innerText();
    if (!ttPreview.includes('Rahasia Sukses Anti Gagal 2026!')) {
      throw new Error('❌ BUG: Judul kustom hilang di TikTok!');
    }
    console.log('✅ TikTok mempertahankan nilai editan kustom.');

    // Klik Tab Instagram Reels
    await page.locator('button:has-text("Instagram Reels")').click();
    await page.waitForTimeout(300);
    const igPreview = await previewBox.innerText();
    if (!igPreview.includes('RAHASIA SUKSES ANTI GAGAL 2026')) {
      throw new Error('❌ BUG: Judul kustom hilang di Instagram Reels!');
    }
    console.log('✅ Instagram Reels mempertahankan nilai editan kustom.');

    // Screenshot tab form editing
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_qa_01_form_edit.png'),
    });
    console.log('📸 Screenshot disimpan: copywriting_qa_01_form_edit.png');

    // ----------------------------------------------------
    // TEST 4: Clipboard Verification (Salin Teks Lengkap)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Clipboard Verification ---');
    const copyMainBtn = page.locator('button:has-text("Salin Teks Lengkap")');
    await copyMainBtn.click();

    // Verifikasi badge feedback
    await page.waitForSelector('text=Tersalin! ✅', { timeout: 5000 });
    console.log('✅ Visual feedback Tersalin! ✅ muncul.');

    // Baca clipboard aktual dari browser
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });
    console.log('📋 Isi Clipboard Terbaca:\n' + clipboardText);
    if (!clipboardText.includes('RAHASIA SUKSES ANTI GAGAL 2026')) {
      throw new Error('❌ BUG: Isi clipboard tidak cocok dengan teks pratinjau yang disalin!');
    }
    console.log('✅ Isi clipboard terverifikasi 100% akurat.');

    // ----------------------------------------------------
    // TEST 5: Modal Dismissal (Escape Key)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Modal Dismissal via ESC ---');
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'detached', timeout: 5000 });
    console.log('✅ Modal berhasil ditutup via tombol Escape.');

    // ----------------------------------------------------
    // TEST 6: Buka dari Halaman Job Detail via Dashboard
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Buka dari Halaman Job Detail ---');
    await page.goto('http://127.0.0.1:3000/', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    // Cari job dengan hasil klip di tabel job list dan klik untuk buka JobDetail
    const completedJobRow = page.locator('tr:has-text("COMPLETED")').first();
    await completedJobRow.waitFor({ state: 'visible', timeout: 10000 });
    await completedJobRow.click();

    // Tunggu JobDetail memuat kartu klip
    const jobCardBtn = page.locator('button[title*="Salin Caption"]').first();
    await jobCardBtn.waitFor({ state: 'visible', timeout: 15000 });
    await jobCardBtn.click();

    await modal.waitFor({ state: 'visible', timeout: 10000 });
    console.log('✅ Modal berhasil terbuka dari Halaman Job Detail.');

    // Screenshot di JobDetail
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_qa_03_jobdetail_modal.png'),
    });
    console.log('📸 Screenshot disimpan: copywriting_qa_03_jobdetail_modal.png');

    // Test tutup dengan tombol X
    const closeXBtn = page.locator('button[aria-label="Tutup modal"]');
    await closeXBtn.click();
    await modal.waitFor({ state: 'detached', timeout: 5000 });
    console.log('✅ Modal berhasil ditutup via tombol X.');

    // ----------------------------------------------------
    // TEST 7: Responsive Layout Testing (Mobile 375x667)
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Responsive Mobile (375x667) ---');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://127.0.0.1:3000/clips', { waitUntil: 'networkidle' });
    const mobileBtn = page.locator('button[title*="Salin Caption"]').first();
    await mobileBtn.click();
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_qa_02_mobile_layout.png'),
    });
    console.log('📸 Screenshot mobile disimpan: copywriting_qa_02_mobile_layout.png');

    // Test tutup dengan tombol Tutup di footer
    const footerCloseBtn = page.locator('button:has-text("Tutup")');
    await footerCloseBtn.click();
    await modal.waitFor({ state: 'detached', timeout: 5000 });
    console.log('✅ Modal berhasil ditutup via tombol Tutup footer di mobile.');

    console.log('\n🎉 SEMUA PENGUJIAN UI/UX & BROWSER EDGE-CASES SUKSES 100%!');
  } catch (err) {
    console.error('❌ Error saat pengujian UI:', err);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_qa_error.png'),
    });
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
