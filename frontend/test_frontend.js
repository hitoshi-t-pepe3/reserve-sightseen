const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  const frontendUrl = 'https://reserve-frontend-aizhcwfypa-an.a.run.app';
  const backendUrl = 'https://reserve-backend-aizhcwfypa-an.a.run.app';
  
  console.log(`\n=== Testing Frontend: ${frontendUrl} ===`);
  
  try {
    await page.goto(frontendUrl, { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded');
    await page.waitForTimeout(2000);
    
    // Click search button to open panel
    const searchButton = await page.locator('button:has-text("宿泊検索")').first();
    if (await searchButton.isVisible()) {
      console.log('✓ Search button found');
      await searchButton.click();
      await page.waitForTimeout(2000);
      console.log('Clicked search button');
    }
    
    // Check if hotel search panel is open
    const panel = await page.locator('div:has(h2:has-text("宿泊施設を検索"))').first();
    if (await panel.isVisible()) {
      console.log('✓ Hotel search panel opened');
      
      // Fill search area
      const areaInput = await page.locator('input[placeholder*="エリア"], input[placeholder*="例:"]').first();
      if (await areaInput.isVisible()) {
        await areaInput.fill('京都');
        console.log('Filled area: 京都');
      }
      
      // Click search in panel using Enter key or force click
      const panelSearchBtn = await page.locator('form button[type="submit"]').first();
      if (await panelSearchBtn.isVisible()) {
        console.log('Found search submit button, pressing Enter instead...');
        await page.keyboard.press('Enter');
        console.log('Pressed Enter to submit');
        await page.waitForTimeout(5000);
      }
    }
    
    // Network request monitoring
    page.on('request', request => {
      if (request.url().includes('/api/hotels/') || request.url().includes('/api/chat') || request.url().includes('/api/places')) {
        console.log('API Request:', request.method(), request.url());
      }
    });
    
    page.on('response', response => {
      if (response.url().includes('/api/hotels/') || response.url().includes('/api/chat') || response.url().includes('/api/places')) {
        console.log('API Response:', response.status(), response.url());
      }
    });
    
    // Test chat after search
    await page.waitForTimeout(3000);
    const chatInput = await page.locator('textarea[placeholder*="メッセージ"]').first();
    if (await chatInput.isVisible()) {
      await chatInput.fill('京都 2泊3日 予算5万円');
      console.log('Filled chat input');
      
      const sendButton = await page.locator('button[type="submit"]').first();
      if (await sendButton.isVisible()) {
        await sendButton.click({ force: true });
        console.log('Clicked send with force');
        await page.waitForTimeout(8000);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  
  await browser.close();
  console.log('\n=== Test Complete ===');
})();
