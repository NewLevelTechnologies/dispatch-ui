import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3001/login');
    await page.waitForLoadState('networkidle');

    // Login
    await page.fill('input[type="email"]', 'tenant1@test.com');
    await page.fill('input[type="password"]', 'TestPass123!');
    await page.click('button:has-text("Sign in")');

    // Wait for navigation or timeout
    try {
      await page.waitForURL('http://localhost:3001/dashboard', { timeout: 10000 });
    } catch (e) {
      console.log('Did not redirect to dashboard, waiting for page load...');
      await page.waitForLoadState('networkidle');
    }

    await page.waitForTimeout(1000);

    // Get the Financial header
    const financialHeader = await page.locator('text=Financial').first();
    const headerStyles = await financialHeader.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        fontWeight: computed.fontWeight,
      };
    });

    // Get Invoices menu item
    const invoicesItem = await page.locator('text=Invoices').first();
    const invoicesStyles = await invoicesItem.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        fontWeight: computed.fontWeight,
      };
    });

    // Get Quotes menu item
    const quotesItem = await page.locator('text=Quotes').first();
    const quotesStyles = await quotesItem.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        fontWeight: computed.fontWeight,
      };
    });

    console.log('\n=== MENU ITEM SIZES ===\n');
    console.log('Financial Header:');
    console.log('  Font Size:', headerStyles.fontSize);
    console.log('  Line Height:', headerStyles.lineHeight);
    console.log('  Font Weight:', headerStyles.fontWeight);
    console.log('');
    console.log('Invoices Menu Item:');
    console.log('  Font Size:', invoicesStyles.fontSize);
    console.log('  Line Height:', invoicesStyles.lineHeight);
    console.log('  Font Weight:', invoicesStyles.fontWeight);
    console.log('');
    console.log('Quotes Menu Item:');
    console.log('  Font Size:', quotesStyles.fontSize);
    console.log('  Line Height:', quotesStyles.lineHeight);
    console.log('  Font Weight:', quotesStyles.fontWeight);
    console.log('');

    // Compare
    const headerSize = parseFloat(headerStyles.fontSize);
    const invoicesSize = parseFloat(invoicesStyles.fontSize);

    if (headerSize < invoicesSize) {
      console.log(`❌ Header is SMALLER (${headerSize}px < ${invoicesSize}px)`);
    } else if (headerSize === invoicesSize) {
      console.log(`✓ Header matches menu items (${headerSize}px === ${invoicesSize}px)`);
    } else {
      console.log(`⚠ Header is LARGER (${headerSize}px > ${invoicesSize}px)`);
    }

    // Take screenshot
    await page.screenshot({ path: '/tmp/financial-menu.png', fullPage: false });
    console.log('\n✓ Screenshot saved to /tmp/financial-menu.png');

    await browser.close();
  } catch (error) {
    console.error('Error:', error.message);
    await browser.close();
    process.exit(1);
  }
})();
