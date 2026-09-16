import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR =
  '/home/mohammad-yasfiq/.gemini/antigravity-cli/brain/3ec39e05-3067-46b8-a7c9-03a3fd658a81';

async function main() {
  console.log('🚀 Memulai E2E Browser Testing Copywriting Generator...');

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
    // 1. Buka halaman /clips
    console.log('🌐 Membuka http://127.0.0.1:3000/clips...');
    await page.goto('http://127.0.0.1:3000/clips', { waitUntil: 'networkidle', timeout: 30000 });

    // Tunggu card klip muncul
    await page.waitForSelector('button[title*="Salin Caption"]', { timeout: 15000 });
    console.log('✅ Kartu klip dan tombol Salin Caption & SEO ditemukan.');

    // Screenshot tampilan galeri klip
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_01_card_button.png'),
    });
    console.log('📸 Screenshot 1 disimpan: copywriting_01_card_button.png');

    // 2. Klik tombol Salin Caption pada klip pertama
    const copyButton = page.locator('button[title*="Salin Caption"]').first();
    await copyButton.click();

    // Tunggu modal muncul
    await page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
    await page.waitForSelector('text=Copywriting & Caption SEO', { timeout: 10000 });
    console.log('✅ Modal Copywriting terbuka.');

    // Tunggu data ter-load (selesai loading skeleton)
    await page.waitForSelector('text=Pratinjau Format Siap Salin', { timeout: 10000 });
    console.log('✅ Data copywriting berhasil dimuat.');

    // Screenshot tab All-in-One
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_02_modal_all.png'),
    });
    console.log('📸 Screenshot 2 disimpan: copywriting_02_modal_all.png');

    // 3. Pindah ke tab YouTube Shorts
    console.log('🔄 Beralih ke tab YouTube Shorts...');
    const ytTab = page.locator('button:has-text("YouTube Shorts")');
    await ytTab.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_03_modal_youtube.png'),
    });
    console.log('📸 Screenshot 3 disimpan: copywriting_03_modal_youtube.png');

    // 4. Test tombol Salin Teks Lengkap (Copy to Clipboard)
    console.log('📋 Menguji tombol Salin Teks Lengkap...');
    const copyAllBtn = page.locator('button:has-text("Salin Teks Lengkap")');
    await copyAllBtn.click();

    // Tunggu feedback Tersalin! ✅
    await page.waitForSelector('text=Tersalin! ✅', { timeout: 5000 });
    console.log('✅ Tombol berhasil memberikan feedback visual: Tersalin! ✅');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_04_copied_feedback.png'),
    });
    console.log('📸 Screenshot 4 disimpan: copywriting_04_copied_feedback.png');

    // 5. Test Quick copy Judul
    const copyTitleBtn = page.locator('button:has-text("Salin Judul")');
    await copyTitleBtn.click();
    await page.waitForTimeout(300);
    console.log('✅ Quick-copy judul teruji.');

    // 6. Tutup modal
    const closeBtn = page.locator('button[aria-label="Tutup modal"]');
    await closeBtn.click();
    await page.waitForSelector('div[role="dialog"]', { state: 'detached', timeout: 5000 });
    console.log('✅ Modal berhasil ditutup.');

    console.log('🎉 SELURUH PENGUJIAN E2E BROWSER BERHASIL 100%!');
  } catch (err) {
    console.error('❌ Terjadi kesalahan saat pengujian browser:', err);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'copywriting_error.png'),
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
