const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

// Add the stealth plugin to bypass basic bot detection
chromium.use(stealth);

async function extractProfileHeadless(profileUrl, platform) {
    console.log(`[HEADLESS] Launching browser for ${platform}...`);
    
    // Launch headless browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();
    let extractedText = "";

    try {
        await page.goto(profileUrl, { waitUntil: 'networkidle' });

        // TARGETING LOGIC: Extract ONLY the profile context based on the platform
        if (platform.toLowerCase() === 'github') {
            const profileContainer = page.locator('main'); 
            await profileContainer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            extractedText = await profileContainer.innerText();
        } 
        else if (platform.toLowerCase() === 'twitter' || platform.toLowerCase() === 'x') {
            const profileContainer = page.locator('[data-testid="primaryColumn"]');
            await profileContainer.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
            extractedText = await profileContainer.innerText();
        }
        else {
            // Fallback: Just grab the <main> tag or the body if main is missing
            const mainContent = page.locator('main');
            if (await mainContent.count() > 0) {
                extractedText = await mainContent.innerText();
            } else {
                extractedText = await page.locator('body').innerText();
            }
        }

        console.log(`[HEADLESS] Successfully extracted ${extractedText.length} characters.`);
        
    } catch (error) {
        console.error(`[HEADLESS] Failed to extract from ${profileUrl}:`, error.message);
    } finally {
        await browser.close();
    }

    return extractedText;
}

module.exports = { extractProfileHeadless };