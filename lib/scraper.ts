// scraper.ts
/* Generic interface to scrape Kijiji ad information */

import { scrapeAPI } from "./backends/api-scraper";
import { scrapeHTML } from "./backends/html-scraper";
import { POSSIBLE_BAD_MARKUP } from "./constants";
import { getScraperOptions, ScraperOptions, ScraperType } from "./helpers";

/**
 * Information about an ad from Kijiji
 */
export class AdInfo {
    /**
     * Title of the ad
     */
    title: string = "";

    /**
     * Description of the ad
     */
    description: string = "";

    /**
     * Date the ad was posted
     */
    date: Date = new Date(NaN);

    /**
     * URL of the ad's primary (featured) image
     */
    image: string = "";

    /**
     * URLs of all images associated with the ad
     */
    images: string[] = [];

    /**
     * Properties specific to the category of the scraped ad
     */
    attributes: { [attributeName: string]: any } = {};

    /**
     * The ad's URL
     */
    url: string = "";

    /**
     * Unique identifier of the ad
     */
    id: string = "";
};

/* Scrapes the passed Kijiji ad URL */
type Scraper = (adUrl: string) => Promise<AdInfo | null>;
export async function scrape(url: string, options: ScraperOptions = {}): Promise<AdInfo> {
    if (!url) {
        throw new Error("URL must be specified");
    }

    const scraperOptions = getScraperOptions(options);
    const scraper: Scraper = scraperOptions.scraperType === ScraperType.HTML ? scrapeHTML : scrapeAPI;

    const adInfo = await scraper(url);
    if (!adInfo) {
        throw new Error(
            `Ad not found or invalid response received from Kijiji for ad at ${url}. ${POSSIBLE_BAD_MARKUP}`
        );
    }
    adInfo.url = url;
    return adInfo;
}