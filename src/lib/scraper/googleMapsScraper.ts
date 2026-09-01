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
const SCROLL_PAUSE_MS = [300, 600] as const;
const CARD_PAUSE_MS = [80, 200] as const;
// Google Maps lazy-loads more cards on scroll, and that fetch can take a
// couple of seconds. If we give up after a fixed short pause, a scroll that
// simply hasn't finished loading yet looks identical to "reached the end of
// the list" and we stop far short of what's actually available. So each
// consecutive stale scroll (no new card appeared) waits progressively
// longer before the next check — ~15s of total grace by the last attempt —
// and only then do we conclude the list is truly exhausted.
const MAX_STALE_SCROLLS = 6;
const STALE_BACKOFF_STEP_MS = 700;
const DETAIL_CONCURRENCY = 10;

function randomDelay([min, max]: readonly [number, number]) {
  return min + Math.random() * (max - min);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BLOCKED_RESOURCE_TYPES = new Set(["image", "media", "font"]);

// Photos/fonts/video are a large share of page-load time on Maps but play no
// part in the data we extract (all pulled from DOM attributes), so dropping
// them cuts per-page load time substantially without touching correctness.
async function blockHeavyResources(page: import("puppeteer").Page) {
  await page.setRequestInterception(true);
  page.on("request", (req: import("puppeteer").HTTPRequest) => {
    if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) {
      req.abort().catch(() => {});
    } else {
      req.continue().catch(() => {});
    }
  });
}

export async function scrapeGoogleMaps(
  query: string,
  language: string,
  maxResults: number,
  onResult: (place: ScrapedPlace) => Promise<void> | void,
  shouldStop: () => boolean
): Promise<void> {
  const hl = language === "ar" ? "ar" : "en";
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
    await blockHeavyResources(page);

    // hl controls the UI/display language the user picked (affects how place
    // names, categories etc. are shown). The detail-page field selectors below
    // use language-independent data-item-id attributes rather than aria-label
    // text, so they keep working no matter which hl is chosen.
    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=${hl}`;
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
      const discoveredNew = seenHrefs.size > before;
      staleScrolls = discoveredNew ? 0 : staleScrolls + 1;

      await page.$eval(FEED_SELECTOR, (el: Element) => {
        el.scrollTop = el.scrollHeight;
      }).catch(() => {});
      const backoff = discoveredNew ? 0 : staleScrolls * STALE_BACKOFF_STEP_MS;
      await sleep(randomDelay(SCROLL_PAUSE_MS) + backoff);
    }

    const targets = Array.from(seenHrefs).slice(0, maxResults);
    let nextIndex = 0;

    async function visitOne(detailPage: import("puppeteer").Page, href: string) {
      const detailUrl = href.includes("?") ? `${href}&hl=${hl}` : `${href}?hl=${hl}`;
      await detailPage.goto(detailUrl, { waitUntil: "networkidle2", timeout: 30000 });
      await detailPage.waitForSelector('div[role="main"] h1', { timeout: 15000 });

      const place = await detailPage.evaluate(() => {
        const main = document.querySelector('div[role="main"]');
        const name = main?.querySelector("h1")?.textContent?.trim() || "";

        // data-item-id attributes carry the raw place data and are stable
        // regardless of the UI display language (hl), unlike aria-label text.
        const phoneEl = main?.querySelector('button[data-item-id^="phone:tel:"]');
        const phoneItemId = phoneEl?.getAttribute("data-item-id") || "";
        const phone = phoneItemId.replace(/^phone:tel:/, "").trim() || phoneEl?.textContent?.trim() || null;

        const addressEl = main?.querySelector('button[data-item-id="address"]');
        const address = addressEl?.textContent?.trim() || null;

        const websiteEl = main?.querySelector('a[data-item-id="authority"]') as HTMLAnchorElement | null;
        const website = websiteEl?.href || null;

        // The rating/review widget is an aria-label like "4.5 stars 1,234 Reviews"
        // (localized wording, but the digits themselves stay Latin numerals),
        // so pull the numbers out positionally instead of matching English words.
        const ratingImg = main?.querySelector('span[role="img"][aria-label]');
        const ratingLabel = ratingImg?.getAttribute("aria-label") || "";
        const ratingNumbers = ratingLabel.match(/[\d.,]+/g) || [];
        const rating = ratingNumbers[0] ? parseFloat(ratingNumbers[0].replace(",", ".")) || null : null;
        const reviewCount = ratingNumbers[1] ? parseInt(ratingNumbers[1].replace(/[.,]/g, ""), 10) : null;

        const categoryButton = main?.querySelector('button[jsaction*="category"]');
        const category = categoryButton?.textContent?.trim() || null;

        return { name, phone, address, website, rating, reviewCount, category };
      });

      if (!place.name) return;

      const urlMatch = detailPage.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
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
    }

    // Visit detail pages with a small pool of tabs in parallel instead of one
    // at a time — this is the dominant cost for large result counts.
    async function worker() {
      const workerPage = await browser.newPage();
      try {
        await workerPage.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        );
        await blockHeavyResources(workerPage);
        while (true) {
          if (shouldStop()) return;
          const i = nextIndex++;
          if (i >= targets.length) return;
          try {
            await visitOne(workerPage, targets[i]);
          } catch {
            // Skip a card that fails to load/parse — keep the job moving.
          }
          await sleep(randomDelay(CARD_PAUSE_MS));
        }
      } finally {
        await workerPage.close().catch(() => {});
      }
    }

    const workerCount = Math.min(DETAIL_CONCURRENCY, targets.length) || 1;
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  } finally {
    await browser.close().catch(() => {});
  }
}
