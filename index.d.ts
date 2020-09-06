declare module "kijiji-scraper" {
    /**
     * Information about an ad from Kijiji
     */
    export class AdInfo {
        /**
         * Title of the ad
         */
        title: string;

        /**
         * Description of the ad
         */
        description: string;

        /**
         * Date the ad was posted
         */
        date: Date;

        /**
         * URL of the ad's primary (featured) image
         */
        image: string;

        /**
         * URLs of all images associated with the ad
         */
        images: string[];

        /**
         * Properties specific to the category of the scraped ad
         */
        attributes: { [attributeName: string]: any };

        /**
         * The ad's URL
         */
        url: string;
    }

    /**
     * This class encapsulates a Kijiji ad and its properties. It also
     * handles retrieving this information from Kijiji
     */
    export class Ad extends AdInfo {
        constructor(url: string, info?: Partial<AdInfo>, scraped?: boolean);

        /**
         * Creates an `Ad` by scraping the passed ad URL
         *
         * @param url Kijiji ad URL
         * @param callback Called after the ad has been scraped. If an
         *                 error occurs during scraping, `err` will not
         *                 be `null`. If everything is successful, `ad`
         *                 will be an `Ad` object.
         * @returns `Promise` which resolves to an `Ad` corresponding to `url`
         */
        static Get(url: string, callback?: ErrorAndValueCallback<Ad>): Promise<Ad>;

        /**
         * Whether or not the ad's information has been retrieved from Kijiji.
         *
         * @returns `false` if the ad was created in a way that does not scrape
         * automatically, such as using the constructor or performing a search
         * with the `scrapeResultDetails` option set to `false`. Otherwise `true`.
         */
        isScraped(): boolean;

        /**
         * Manually retrieves the ad's information from its URL. Useful if it
         * was created in a way that does not do this automatically, such as
         * using the constructor or performing a search with the
         * `scrapeResultDetails` option set to `false`.
         *
         * @param callback Called after the ad has been scraped. If an error
         *                 occurs during scraping, `err` will not be `null`.
         * @returns `Promise` that resolves once scraping has completed
         */
        scrape(callback?: ErrorCallback): Promise<void>;

        /**
         * Convert the ad to a string. This is just meant to be a summary and
         * may omit information for brevity or change format in the future.
         * Access the Ad's properties directly if you need them for comparisons.
         *
         * @returns A string representation of the ad
         */
        toString(): string;
    }

    /**
     * Helper objects for searching by ad location
     */
    export const locations: KijijiIdTreeNode;

    /**
     * Helper objects for searching by ad category
     */
    export const categories: KijijiIdTreeNode;

    /**
     * Kijiji ad search parameters
     */
    export type SearchParameters = {
        /**
         * Id of the geographical location to search in
         */
        locationId: number | KijijiIdTreeNode;

        /**
         * Id of the ad category to search in
         */
        categoryId: number | KijijiIdTreeNode;

        // TODO: add known (optional) parameters

        /**
         * Parameters specific to the category
         */
        [paramName: string]: any;
    };

    /**
     * Parameters that control the behavior of the scraper
     */
    export type SearchOptions = {
        /**
         * By default, the details of each query result are scraped in separate,
         * subsequent requests. To suppress this behavior and return only the
         * data retrieved by the initial query, set this option to `false`. Note
         * that ads will lack some information if you do this and `Ad.isScraped()`
         * will return `false` until `Ad.scrape()` is called to retrieve the
         * missing information.
         */
        scrapeResultDetails?: boolean;

        /**
         * Minimum number of ads to fetch (if available). Note that Kijiji results
         * are returned in pages of up to `40` ads, so if you set this to something
         * like `49`, up to `80` results may be retrieved.
         */
        minResults?: number;

        /**
         * Maximum number of ads to return. This simply removes excess results from
         * the array that is returned (i.e., if `minResults` is `40` and `maxResults`
         * is `7`, `40` results will be fetched from Kijiji and the last `33` will be
         * discarded). A negative value indicates no limit.
         */
        maxResults?: number;
    };

    /**
     * Searches Kijiji for ads matching the given criteria
     *
     * @param params Kijiji ad search parameters
     * @param options Scraper options
     * @param callback Called after the search results have been scraped. If an error
     *                 occurs during scraping, `err` will not be null. If everything
     *                 is successful, `results` will contain an array of `Ad` objects.
     * @returns `Promise` which resolves to an array of search result `Ad` objects
     */
    export function search(params: SearchParameters, options?: SearchOptions, callback?: ErrorAndValueCallback<Ad[]>): Promise<Ad[]>;

    // Helper for location and category IDs
    // TODO: better type definition for this. The recursion makes it tricky
    type KijijiIdTreeNode = any;

    // Helpers for callbacks
    type ErrorCallback = (err: Error | null) => void;
    interface ErrorAndValueCallback<T> {
        (err: Error | null, value: T): void;
    }
}