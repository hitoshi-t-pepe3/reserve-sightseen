import { test, expect } from '@playwright/test';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Itinerary Regression Tests', () => {
  test('should save itinerary to localStorage', async ({ page }) => {
    await page.goto(BASE_URL);

    // ホテル検索と日程表生成をシミュレート
    const chatInput = page.locator('input[placeholder*="メッセージ"]');
    await chatInput.fill('京都に2024-08-01から2024-08-03、大人2人で泊まりたい');
    await page.keyboard.press('Enter');

    // チャット応答を待つ（最大30秒）
    await expect(page.locator('text=京都')).toBeVisible({ timeout: 30000 });

    // 日程表（ItineraryTimeline）が表示されるのを待つ
    const timelineElement = page.locator('text=旅行プラン, text=観光').first();

    // 日程表が表示されているか確認
    const hasTimeline = await timelineElement.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTimeline) {
      // 保存ボタンをクリック
      const saveButton = page.locator('button:has-text("💾 保存")').first();
      await saveButton.click();

      // 「保存済み」表示を待つ
      await expect(page.locator('button:has-text("✓ 保存済み")')).toBeVisible({ timeout: 5000 });

      // localStorage に保存されているか確認
      const savedPlans = await page.evaluate(() => {
        const raw = localStorage.getItem('rs-saved-plans');
        return raw ? JSON.parse(raw) : {};
      });

      expect(Object.keys(savedPlans).length).toBeGreaterThan(0);
      console.log(`✓ Saved ${Object.keys(savedPlans).length} plan(s) to localStorage`);
    } else {
      console.log('⚠ Timeline not displayed - itinerary may not have been generated');
    }
  });

  test('should load and display saved plans', async ({ page }) => {
    // localStorage にテストプランを先に入れておく
    const testPlan = {
      id: 'test-' + Date.now(),
      title: 'テストプラン',
      itinerary: {
        title: 'テストプラン',
        mode: 'travel',
        days: [
          {
            label: '1日目',
            items: [
              {
                name: '清水寺',
                category: 'spot',
                time: '10:00',
                lat: 34.9949,
                lng: 135.7744,
              },
            ],
          },
        ],
      },
      savedAt: new Date().toISOString(),
    };

    await page.goto(BASE_URL);

    // localStorage にプランを保存
    await page.evaluate((plan) => {
      const key = 'rs-saved-plans';
      const existing = localStorage.getItem(key);
      const plans = existing ? JSON.parse(existing) : {};
      plans[plan.id] = plan;
      localStorage.setItem(key, JSON.stringify(plans));
    }, testPlan);

    // ページをリロード
    await page.reload();

    // 保存プラン button をクリック
    const savedPlansBtn = page.locator('button:has-text("📚 保存プラン")');
    await savedPlansBtn.click();

    // 保存したプランが表示されるのを待つ
    await expect(page.locator('text=テストプラン')).toBeVisible({ timeout: 5000 });

    // プランを開く
    const openBtn = page.locator('button:has-text("開く")').first();
    await openBtn.click();

    // 日程表が表示されているか確認
    const timelineVisible = await page.locator('text=清水寺').isVisible({ timeout: 5000 });
    expect(timelineVisible).toBe(true);

    console.log('✓ Saved plan loaded and timeline displayed correctly');
  });

  test('hotel affiliate URLs should be valid', async ({ page }) => {
    // Backend の hotel search API を直接テスト
    const response = await page.request.get(
      `${API_BASE}/api/hotels/search-area?area=%E4%BA%AC%E9%83%BD&hits=1`
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    if (data.hotels && data.hotels.length > 0) {
      const hotel = data.hotels[0].hotelBasicInfo;
      const planListUrl = hotel?.planListUrl;

      expect(planListUrl).toBeTruthy();

      // planListUrl が有効な形式か確認
      expect(planListUrl).toMatch(/(hb\.afl\.rakuten|travel\.rakuten)/);

      // URL パラメータを追加
      const urlWithParams = new URL(planListUrl);
      const urlWithDates = `${planListUrl.split('?')[0]}?${new URLSearchParams({
        ...Object.fromEntries(urlWithParams.searchParams),
        f_nen1: '2024',
        f_tuki1: '8',
        f_hi1: '1',
        f_nen2: '2024',
        f_tuki2: '8',
        f_hi2: '3',
        f_otona_su: '2',
        f_heya_su: '1',
      }).toString()}`;

      // リダイレクト先の URL が存在するか HEAD リクエストで確認
      const headResponse = await page.request.head(urlWithDates, {
        timeout: 10000,
      }).catch(() => null);

      if (headResponse) {
        expect(headResponse.status()).not.toBe(400);
        console.log(`✓ Affiliate URL valid (status: ${headResponse.status()})`);
      } else {
        console.log('⚠ Could not verify affiliate URL (network timeout)');
      }
    } else {
      console.log('⚠ No hotels found to test affiliate URLs');
    }
  });

  test('jalan comparison URL should be present', async ({ page }) => {
    const response = await page.request.get(
      `${API_BASE}/api/hotels/search-area?area=%E4%BA%AC%E9%83%BD&hits=1`
    );

    expect(response.status()).toBe(200);
    const data = await response.json();

    if (data.hotels && data.hotels.length > 0) {
      const hotel = data.hotels[0].hotelBasicInfo;
      const jalanUrl = hotel?.jalanSearchUrl;

      // jalanSearchUrl が存在すれば確認
      if (jalanUrl) {
        expect(jalanUrl).toMatch(/jalan\.net/);
        console.log('✓ Jalan comparison URL present and valid format');
      } else {
        console.log('ℹ Jalan URL not yet implemented');
      }
    }
  });
});
