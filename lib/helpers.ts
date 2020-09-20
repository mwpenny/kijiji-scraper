// helpers.ts
/* Common functionality */

import cheerio from "cheerio";

const IMG_REGEX = /\/\$_\d+\.(?:JPG|PNG)$/;

/**
 * Kijiji scraping method
 */
export enum ScraperType {
    /**
     * Scrape using the Kijiji mobile API
     */
    API = "api",

    /**
     * Scrape by parsing the HTML of Kijiji.ca
     */
    HTML = "html"
};

/**
 * Options to pass to the scraper
 */
export type ScraperOptions = {
    /**
     * Which scraping method to use. Either "api" (default) or "html"
     */
    scraperType?: ScraperType;
};

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

export function isNumber(value: string): boolean {
    value = value.trim();
    return value.length > 0 && !Number.isNaN(Number(value)) && Number.isFinite(Number(value));
};

export function getLargeImageURL(url: string): string {
    // Kijiji/eBay image URLs typically end with "$_dd.JPG", where "dd" is a
    // number between 0 and 140 indicating the desired image size and
    // quality. "57" is up to 1024x1024, the largest I've found.
    return url.replace(IMG_REGEX, "/$_57.JPG");
}

export function cleanAdDescription(text: string): string {
    // Some descriptions contain HTML. Remove it so it is only text
    const $ = cheerio.load(text);
    $("label").remove();  // Remove kit-ref-id label
    return $.root().text().trim();
}

export function getScraperOptions(options: ScraperOptions): Required<ScraperOptions> {
    // Copy options so we don't modify what was passed
    const scraperOptions = { ...options };

    // Option defaults
    if (scraperOptions.scraperType === undefined) {
        scraperOptions.scraperType = ScraperType.API;
    }

    const validScraperTypes = Object.values(ScraperType);
    if (validScraperTypes.find(k => k === scraperOptions.scraperType) === undefined) {
        throw new Error(
            "Invalid value for scraper option 'scraperType'. Valid values are: " +
            validScraperTypes.join(", ")
        );
    }

    return scraperOptions as Required<ScraperOptions>;
}