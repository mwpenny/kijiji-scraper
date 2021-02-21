// search.ts
/* Searches Kijiji for recent ads matching given criteria */

import { Ad } from "./ad";
import { APISearcher } from "./backends/api-searcher";
import { HTMLSearcher } from "./backends/html-searcher";
import { getScraperOptions, sleep, ScraperOptions, ScraperType } from "./helpers";

// Helper for location and category IDs
type KijijiIdTreeNode = { id: number };

/**
 * Kijiji ad search parameters
 */
export type SearchParameters = {
    /**
     * Id of the geographical location to search in
     */
    locationId?: number | KijijiIdTreeNode;

    /**
     * Id of the ad category to search in
     */
    categoryId?: number | KijijiIdTreeNode;

    /**
     * The minimum desired price of the results
     */
    minPrice?: number;

    /**
     * The maximum desired price of the results
     */
    maxPrice?: number;

    /**
     * Type of ad to return. Leave undefined for both
     */
    adType?: string;

    /**
     * Other parameters, specific to the category. Use browser developer
     * tools when performing a specific search to find more parameters.
     * After submitting your search on Kijiji or updating the filter being
     * applied, examine the request for https://www.kijiji.ca/b-search.html.
     * Any parameter used in the query string for that request is able to be
     * specified in here.
     */
    [paramName: string]: any;
};

export type ResolvedSearchParameters = {
    locationId: number;
    categoryId: number;
    [paramName: string]: any;
};

/**
 * Parameters that control the behavior of the scraper
 */
export type SearchOptions = {
    /**
     * Amount of time in milliseconds to wait between scraping each result page.
     * This is useful to avoid detection and bans from Kijiji. Defaults to 1000.
     */
    pageDelayMs?: number;

    /**
     * Minimum number of ads to fetch (if available). Note that Kijiji results
     * are returned in pages of up to `20` ads, so if you set this to something
     * like `29`, up to `40` results may be retrieved. A negative value indicates
     * no limit (retrieve as many ads as possible).
     */
    minResults?: number;

    /**
     * Maximum number of ads to return. This simply removes excess results from
     * the array that is returned (i.e., if `minResults` is `40` and `maxResults`
     * is `7`, `40` results will be fetched from Kijiji and the last `33` will be
     * discarded). A negative value indicates no limit.
     */
    maxResults?: number;

    /**
     * When using the HTML scraper, the details of each query result are scraped in
     * separate, subsequent requests by default. To suppress this behavior and return
     * only the data retrieved by the initial query, set this option to `false`. Note
     * that ads will lack some information if you do this and `Ad.isScraped()` will
     * will return `false` until `Ad.scrape()` is called to retrieve the missing
     * information. This option does nothing when using the API scraper (default)
     */
    scrapeResultDetails?: boolean;

    /**
     * When `scrapeResultDetails` is `true`, the amount of time in milliseconds to
     * wait in between each request for result details. A value of 0 will cause all
     * such requests to be made at the same time. This is useful to avoid detection
     * and bans from Kijiji. Defaults to 500.
     */
    resultDetailsDelayMs?: number;
};

/**
 * The search results for one page
 */
export type PageResults = {
    /**
     * Ads from the result page
     */
    pageResults: Ad[];

    /**
     * Whether or not this page is the last page of results
     */
    isLastPage: boolean;
};

/**
 * Generic interface for a Kijiji searcher
 */
export interface Searcher {
    /**
     * Retrieve one page of search results
     * @param params Search parameters
     * @param pageNum Page number to return results for
     * @returns The results for the specified page
     */
    getPageResults(params: ResolvedSearchParameters, pageNum: number): Promise<PageResults>;
};

/* Retrieves at least minResults search results from Kijiji using the passed parameters */
async function getSearchResults(searcher: Searcher, params: ResolvedSearchParameters, options: Required<SearchOptions>): Promise<Ad[]> {
    const results: Ad[] = [];
    let pageNum = 1;

    try {
        let needResults = options.minResults !== 0;
        while (needResults) {
            const { pageResults, isLastPage } = await searcher.getPageResults(params, pageNum++);
            results.push(...pageResults);

            needResults = pageResults.length > 0 &&
                !isLastPage &&
                (results.length < options.minResults || options.minResults < 0);

            if (needResults) {
                await sleep(options.pageDelayMs);
            }
        }
    } catch (err) {
        throw new Error(`Error parsing Kijiji search results: ${err.message}`);
    }
    return results;
}

/* Validates that obj.propName exists and is an integer */
function ensureIntProp(obj: any, propName: string): void {
    if (!obj.hasOwnProperty(propName) || !Number.isInteger(obj[propName])) {
        throw new Error(`Integer property '${propName}' must be specified`);
    }
}

/* Parses search parameters, adds default values if required, and then performs validation */
function getSearchParams(params: SearchParameters): ResolvedSearchParameters {
    const getId = (id: any): number => {
        // If id is an id object, return the contained id
        let ret = id;
        if (typeof id === "object" && id.hasOwnProperty("id")) {
            ret = id.id;
        }
        return ret;
    };

    // Copy params so we don't modify what was passed
    const paramsForSearch = { ...params };

    // Parameter defaults
    if (paramsForSearch.locationId === undefined) {
        paramsForSearch.locationId = 0;
    }
    if (paramsForSearch.categoryId === undefined) {
        paramsForSearch.categoryId = 0;
    }

    // Tell Kijiji to redirect us to the URL used in the frontend as
    // this is the only URL I have gotten paging to work with
    paramsForSearch.formSubmit = true;

    // Date scraping relies on the page being in English
    paramsForSearch.siteLocale = "en_CA"

    // If id objects are being used, get the contained ids
    paramsForSearch.locationId = getId(paramsForSearch.locationId);
    paramsForSearch.categoryId = getId(paramsForSearch.categoryId);

    ensureIntProp(paramsForSearch, "locationId");
    ensureIntProp(paramsForSearch, "categoryId");
    return paramsForSearch as ResolvedSearchParameters;
}

/* Parses search options, adds default values if required, and then performs validation */
function getSearchOptions(options: SearchOptions): Required<SearchOptions> {
    // Copy options so we don't modify what was passed
    const optionsForSearch = { ...options };

    // Option defaults
    if (optionsForSearch.pageDelayMs === undefined) {
        optionsForSearch.pageDelayMs = 1000;
    }
    ensureIntProp(optionsForSearch, "pageDelayMs");

    if (optionsForSearch.scrapeResultDetails === undefined) {
        optionsForSearch.scrapeResultDetails = true;
    }
    if (optionsForSearch.resultDetailsDelayMs === undefined) {
        optionsForSearch.resultDetailsDelayMs = 500;
    }
    ensureIntProp(optionsForSearch, "resultDetailsDelayMs");

    if (optionsForSearch.maxResults === undefined) {
        optionsForSearch.maxResults = -1;
    }
    ensureIntProp(optionsForSearch, "maxResults");

    if (optionsForSearch.minResults === undefined) {
        if (optionsForSearch.maxResults > 0){
            optionsForSearch.minResults = optionsForSearch.maxResults;
        } else {
            optionsForSearch.minResults = 20;
        }
    } else if (optionsForSearch.minResults < 0) {
        optionsForSearch.minResults = optionsForSearch.maxResults;
    }
    ensureIntProp(optionsForSearch, "minResults");

    return optionsForSearch as Required<SearchOptions>;
}

/**
 * Searches Kijiji for ads matching the given criteria
 *
 * @param params Kijiji ad search parameters
 * @param options Search and scraper options
 * @param callback Called after the search results have been scraped. If an error
 *                 occurs during scraping, `err` will not be null. If everything
 *                 is successful, `results` will contain an array of `Ad` objects.
 * @returns `Promise` which resolves to an array of search result `Ad` objects
 */
export function search(params: SearchParameters, options: SearchOptions & ScraperOptions = {}, callback?: (err: Error | null, ads: Ad[]) => void): Promise<Ad[]> {
    const promise: Promise<Ad[]> = new Promise((resolve, reject) => {
        // Configure search
        const paramsForSearch = getSearchParams(params);
        const optionsForSearch = getSearchOptions(options);
        const scraperOptions = getScraperOptions(options);

        const searcher: Searcher = scraperOptions.scraperType === ScraperType.HTML
            ? new HTMLSearcher()
            : new APISearcher();

        // Perform search
        getSearchResults(searcher, paramsForSearch, optionsForSearch).then(async results => {
            if (optionsForSearch.maxResults >= 0) {
                results = results.slice(0, optionsForSearch.maxResults);
            }
            if (optionsForSearch.scrapeResultDetails) {
                if (optionsForSearch.resultDetailsDelayMs > 0) {
                    for (const ad of results) {
                        if (!ad.isScraped()) {
                            await ad.scrape();
                            await sleep(optionsForSearch.resultDetailsDelayMs);
                        }
                    }
                } else {
                    await Promise.all(results.map(ad => {
                        if (!ad.isScraped()) {
                            ad.scrape();
                        }
                    }));
                }
            }
            return results;
        }).then(resolve, reject);
    });

    if (callback) {
        promise.then(
            results => callback(null, results),
            err => callback(err, [])
        );
    }
    return promise;
}
