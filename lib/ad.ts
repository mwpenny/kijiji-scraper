// ad.ts
/* Kijiji ad object definition */

import { scrape, AdInfo } from "./scraper";
import { ScraperOptions } from "./helpers";

/* Nicely formats a date string */
function DateToString(date: Date): string {
    const m = ("0" + (date.getMonth() + 1)).slice(-2);
    const d = ("0" + date.getDate()).slice(-2);
    const y = date.getFullYear();
    const hrs = ("0" + date.getHours()).slice(-2);
    const mins = ("0" + date.getMinutes()).slice(-2);
    return `${m}/${d}/${y} @ ${hrs}:${mins}`;
}

/**
 * This class encapsulates a Kijiji ad and its properties. It also
 * handles retrieving this information from Kijiji
 */
export class Ad extends AdInfo {
    /**
     * Manually constructs an `Ad` object
     *
     * You should generally not need to use this save for a few special cases
     * (e.g., storing ad URLs entered by a user for delayed scraping).
     *
     * `Ad.isScraped()` returns `false` for `Ad` objects constructed in this
     * way unless `scraped` is passed as `true` or they are subsequently scraped
     * by calling `Ad.scrape()`, which causes the scraper to replace the ad's
     * information with what is found at its URL.
     *
     * @param url Kijiji ad URL
     * @param info Ad properties to set manually
     * @param scraped Whether or not to consider the ad already scraped
     */
    constructor(url: string, info: Partial<AdInfo> = {}, scraped=false) {
        super();
        let isScraped = scraped;

        /* Updates ad properties with specified values */
        const updateInfo = (info: Partial<AdInfo>): void => {
            for (const [key, value] of Object.entries(info)) {
                // Don't trust info - it comes from the user
                if (super.hasOwnProperty(key)) {
                    (this as any)[key] = value;
                }
            }
        };
        updateInfo(info);
        this.url = url;

        this.scrape = (options?: ScraperOptions, callback?: (err: Error | null) => void): Promise<void> => {
            const promise = scrape(this.url, options).then(newInfo => {
                updateInfo(newInfo);
                isScraped = true;
            });

            if (callback) {
                promise.then(() => callback(null), callback);
            }
            return promise;
        };

        this.isScraped = () => isScraped;
    }

    /**
     * Creates an `Ad` by scraping the passed ad URL
     *
     * @param url Kijiji ad URL
     * @param options Options to pass to the scraper
     * @param callback Called after the ad has been scraped. If an
     *                 error occurs during scraping, `err` will not
     *                 be `null`. If everything is successful, `ad`
     *                 will be an `Ad` object corresponding to `url`.
     * @returns `Promise` which resolves to an `Ad` corresponding to `url`
     */
    static Get(url: string, options?: ScraperOptions, callback?: (err: Error | null, ad: Ad) => void): Promise<Ad> {
        const promise = scrape(url, options).then(info => {
            return new Ad(url, info, true);
        });

        if (callback) {
            promise.then(
                ad => callback(null, ad),
                err => callback(err, new Ad(""))
            );
        }
        return promise;
    }

    /**
     * Whether or not the ad's information has been retrieved from Kijiji.
     *
     * @returns `false` if the ad was created in a way that does not scrape
     * automatically, such as using the constructor or performing a search
     * with the `scrapeResultDetails` option set to `false`. Otherwise `true`.
     */
    isScraped: () => boolean;

    /**
     * Manually retrieves the ad's information from its URL
     *
     * Useful if the ad was created in a way that does not do this
     * automatically, such as using the constructor or performing a
     * search with the `scrapeResultDetails` option set to `false`.
     *
     * @param options Options to pass to the scraper
     * @param callback Called after the ad has been scraped. If an error
     *                 occurs during scraping, `err` will not be `null`.
     * @returns `Promise` that resolves once scraping has completed
     */
    scrape: (options?: ScraperOptions, callback?: (err: Error | null) => void) => Promise<void>;

    /**
     * Convert the ad to a string
     *
     * This is just meant to be a summary and
     * may omit information for brevity or change format in the future.
     * Access the Ad's properties directly if you need them for comparisons.
     *
     * @returns A string representation of the ad
     */
    toString(): string {
        // Ad may be unscraped and missing some information
        let str = "";
        if (this.date instanceof Date && !Number.isNaN(this.date.getTime())) {
            str += `[${DateToString(this.date)}] `;
        }
        if (this.title) {
            str += this.title + "\r\n";
        }
        str += this.url + "\r\n";

        for (const attr of Object.keys(this.attributes)) {
            let val = this.attributes[attr];
            if (attr === "location" && val.mapAddress !== undefined)
                val = val.mapAddress;
            str += `* ${attr}: ${val}\r\n`;
        }
        return str;
    }
};