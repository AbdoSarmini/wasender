import { normalizePhone } from "@/lib/csv-contacts";

// puppeteer is CommonJS; require() keeps it out of the Next.js client/edge
// bundling graph (only ever used from the custom Node server / API routes).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require("puppeteer");

export interface ScrapedPlace {
  name: string;
  phone: string | null;
  address: string | null;
  category: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  googleMapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
}

const FEED_SELECTOR = 'div[role="feed"]';
const CARD_LINK_SELECTOR = 'a[href*="/maps/place/"]';
const SCROLL_PAUSE_MS = [900, 1700] as const;
const CARD_PAUSE_MS = [600, 1300] as const;
const MAX_STALE_SCROLLS = 4;

function randomDelay([min, max]: readonly [number, number]) {
  return min + Math.random() * (max - min);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeGoogleMaps(
  query: string,
  location: string,
  maxResults: number,
  onResult: (place: ScrapedPlace) => Promise<void> | void,
  shouldStop: () => boolean
): Promise<void> {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(`${query} in ${location}`)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 60000 });

    // Consent interstitial (EU) — best-effort dismiss.
    try {
      const consentButton = await page.waitForSelector('button[aria-label*="Accept"]', { timeout: 4000 });
      if (consentButton) await consentButton.click();
    } catch {
      // no consent dialog shown
    }

    await page.waitForSelector(FEED_SELECTOR, { timeout: 20000 }).catch(() => {});

    const seenHrefs = new Set<string>();
    let staleScrolls = 0;

    while (seenHrefs.size < maxResults && staleScrolls < MAX_STALE_SCROLLS) {
      if (shouldStop()) return;

      const hrefs: string[] = await page.$$eval(CARD_LINK_SELECTOR, (els: Element[]) =>
        els.map((el) => (el as HTMLAnchorElement).href)
      );
      const before = seenHrefs.size;
      for (const href of hrefs) seenHrefs.add(href);
      staleScrolls = seenHrefs.size > before ? 0 : staleScrolls + 1;

      await page.$eval(FEED_SELECTOR, (el: Element) => {
        el.scrollTop = el.scrollHeight;
      }).catch(() => {});
      await sleep(randomDelay(SCROLL_PAUSE_MS));
    }

    const targets = Array.from(seenHrefs).slice(0, maxResults);

    for (const href of targets) {
      if (shouldStop()) return;

      try {
        await page.goto(href, { waitUntil: "networkidle2", timeout: 30000 });
        await page.waitForSelector('div[role="main"] h1', { timeout: 15000 });

        const place = await page.evaluate(() => {
          const main = document.querySelector('div[role="main"]');
          const name = main?.querySelector("h1")?.textContent?.trim() || "";

          const phoneEl = main?.querySelector('[aria-label^="Phone:"]');
          const phone = phoneEl?.getAttribute("aria-label")?.replace(/^Phone:\s*/, "").trim() || null;

          const addressEl = main?.querySelector('[aria-label^="Address:"]');
          const address = addressEl?.getAttribute("aria-label")?.replace(/^Address:\s*/, "").trim() || null;

          const websiteEl = main?.querySelector('[aria-label^="Website:"]') as HTMLAnchorElement | null;
          const website = websiteEl?.href || null;

          const ratingEl = main?.querySelector('span[aria-label*="stars"]');
          const ratingLabel = ratingEl?.getAttribute("aria-label") || "";
          const ratingMatch = ratingLabel.match(/([\d.]+)\s+stars?/i);
          const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

          const reviewButton = main?.querySelector('button[aria-label*="reviews"]');
          const reviewLabel = reviewButton?.getAttribute("aria-label") || "";
          const reviewMatch = reviewLabel.match(/([\d,]+)\s+reviews?/i);
          const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, ""), 10) : null;

          const categoryButton = main?.querySelector('button[jsaction*="category"]');
          const category = categoryButton?.textContent?.trim() || null;

          return { name, phone, address, website, rating, reviewCount, category };
        });

        if (!place.name) continue;

        const urlMatch = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        const latitude = urlMatch ? parseFloat(urlMatch[1]) : null;
        const longitude = urlMatch ? parseFloat(urlMatch[2]) : null;

        await onResult({
          name: place.name,
          phone: place.phone ? normalizePhone(place.phone) : null,
          address: place.address,
          category: place.category,
          website: place.website,
          rating: place.rating,
          reviewCount: place.reviewCount,
          googleMapsUrl: href,
          latitude,
          longitude,
        });
      } catch {
        // Skip a card that fails to load/parse — keep the job moving.
        continue;
      }

      await sleep(randomDelay(CARD_PAUSE_MS));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}
