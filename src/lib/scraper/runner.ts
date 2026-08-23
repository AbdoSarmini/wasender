import { EventEmitter } from "events";
import { prisma } from "@/lib/prisma";
import { scrapeGoogleMaps, type ScrapedPlace } from "@/lib/scraper/googleMapsScraper";

class ScraperRunner extends EventEmitter {
  private active = new Set<string>();
  private stopFlags = new Set<string>();

  private emitProgress(jobId: string, payload: Record<string, unknown>) {
    this.emit("progress", jobId, payload);
  }

  isActive(jobId: string) {
    return this.active.has(jobId);
  }

  isAnyActive() {
    return this.active.size > 0;
  }

  async start(jobId: string) {
    if (this.active.has(jobId)) return;
    if (this.isAnyActive()) {
      throw new Error("Another scrape job is already running. Wait for it to finish or stop it first.");
    }

    // Claim the lock synchronously (no await before this point) so two
    // near-simultaneous start() calls can't both pass the isAnyActive() check.
    this.active.add(jobId);
    this.stopFlags.delete(jobId);

    let job;
    try {
      job = await prisma.scrapeJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error("Scrape job not found");
    } catch (err) {
      this.active.delete(jobId);
      throw err;
    }

    await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { status: "running", startedAt: job.startedAt ?? new Date() },
    });
    this.emitProgress(jobId, { status: "running" });

    this.run(jobId, job.query, job.location, job.maxResults)
      .then(async () => {
        if (this.stopFlags.has(jobId)) {
          const updated = await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { status: "stopped", completedAt: new Date() },
          });
          this.emitProgress(jobId, { status: "stopped", resultCount: updated.resultCount });
        } else {
          const updated = await prisma.scrapeJob.update({
            where: { id: jobId },
            data: { status: "completed", completedAt: new Date() },
          });
          this.emitProgress(jobId, { status: "completed", resultCount: updated.resultCount });
        }
      })
      .catch(async (err) => {
        await prisma.scrapeJob
          .update({
            where: { id: jobId },
            data: { status: "failed", error: (err as Error).message?.slice(0, 500), completedAt: new Date() },
          })
          .catch(() => {});
        this.emitProgress(jobId, { status: "failed", error: (err as Error).message });
      })
      .finally(() => {
        this.active.delete(jobId);
        this.stopFlags.delete(jobId);
      });
  }

  stop(jobId: string) {
    if (this.active.has(jobId)) {
      this.stopFlags.add(jobId);
    }
  }

  private async run(jobId: string, query: string, location: string, maxResults: number) {
    await scrapeGoogleMaps(
      query,
      location,
      maxResults,
      async (place: ScrapedPlace) => {
        await this.saveResult(jobId, place);
      },
      () => this.stopFlags.has(jobId)
    );
  }

  private async saveResult(jobId: string, place: ScrapedPlace) {
    try {
      await prisma.scrapeResult.create({
        data: {
          scrapeJobId: jobId,
          name: place.name,
          phone: place.phone,
          address: place.address,
          category: place.category,
          website: place.website,
          rating: place.rating,
          reviewCount: place.reviewCount,
          googleMapsUrl: place.googleMapsUrl,
          latitude: place.latitude,
          longitude: place.longitude,
        },
      });
    } catch {
      // Unique constraint on [scrapeJobId, googleMapsUrl] — skip duplicates.
      return;
    }

    const updated = await prisma.scrapeJob.update({
      where: { id: jobId },
      data: { resultCount: { increment: 1 } },
    });
    this.emitProgress(jobId, {
      status: "running",
      resultCount: updated.resultCount,
      lastResult: { name: place.name, phone: place.phone },
    });
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __scraperRunner: ScraperRunner | undefined;
}

export const scraperRunner: ScraperRunner = globalThis.__scraperRunner ?? new ScraperRunner();
if (!globalThis.__scraperRunner) {
  globalThis.__scraperRunner = scraperRunner;
  scraperRunner.setMaxListeners(50);
}
