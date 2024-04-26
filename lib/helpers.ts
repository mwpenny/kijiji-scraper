// helpers.ts
/* Common functionality */

import cheerio from "cheerio";

const IMG_REGEX = /\?rule=kijijica-\d+-/;

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
    // Kijiji image URLs typically end with "?rule=kijijica-<num>-<format>",
    // where "<num>" is a number indicating the width. 1600px is the largest
    // I've found to work.
    return url.replace(IMG_REGEX, "?rule=kijijica-1600-");
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
        scraperOptions.scraperType = ScraperType.HTML;
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