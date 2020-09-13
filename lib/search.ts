// search.ts
/* Searches Kijiji for recent ads matching given criteria */

import cheerio from "cheerio";
import qs from "querystring";
import fetch, { Response as FetchResponse } from "node-fetch";

import KijijiAd from "./ad";
import { AdInfo } from "./scraper";

const packageJson = require("../../package.json");

const KIJIJI_BASE_URL = "https://www.kijiji.ca";
const KIJIJI_SEARCH_URL = KIJIJI_BASE_URL + "/b-search.html";
const IMG_REGEX = /\/s\-l\d+\.jpg$/;
const LOCATION_REGEX = /(.+)(\/.*)$/;

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
     * Other parameters, specific to the category. Use browser developer
     * tools when performing a specific search to find more parameters.
     * After submitting your search on Kijiji or updating the filter being
     * applied, examine the request for https://www.kijiji.ca/b-search.html.
     * Any parameter used in the query string for that request is able to be
     * specified in here.
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

/* Converts a date from a Kijiji ad result into a date object
   (e.g., "< x hours ago", "yesterday", "dd/mm/yyyy") */
function dateFromRelativeDateString(dateString: string): Date {
    if (dateString) {
        dateString = dateString.toLowerCase().replace(/\//g, " ");

        const split = dateString.split(" ");
        const d = new Date();

        if (split.length === 3) {
            // dd/mm/yyyy format
            d.setHours(0, 0, 0, 0);
            d.setDate(parseInt(split[0]));
            d.setMonth(parseInt(split[1]) - 1);
            d.setFullYear(parseInt(split[2]));
            return d;
        } else if (split.length === 4) {
            // "< x hours/minutes ago" format
            const num = parseInt(split[1]);
            const timeUnit = split[2];

            if (timeUnit === "minutes") {
                d.setMinutes(d.getMinutes() - num);
                d.setSeconds(0, 0);
            } else if (timeUnit === "hours") {
                d.setHours(d.getHours() - num, 0, 0, 0);
            }
            return d;
        } else if (dateString == "yesterday") {
            d.setDate(d.getDate() - 1);
            d.setHours(0, 0, 0, 0);
            return d;
        }
    }
    return new Date(NaN);
}

/* Extracts ad information from the HTML of a Kijiji ad results page */
function parseResultsHTML(html: string): KijijiAd[] {
    const adResults: KijijiAd[] = [];
    const $ = cheerio.load(html);

    // Get info for each ad
    const allAdElements = $(".regular-ad");
    const filteredAdElements = allAdElements.not(".third-party");

    filteredAdElements.each((_i, item) => {
        const url = KIJIJI_BASE_URL + $(item).find("a.title").attr("href");
        const info: Partial<AdInfo> = {
            title: $(item).find("a.title").text().trim(),

            image: (
                // `data-src` contains the URL of the image to lazy load
                //
                // `src` starts off with a placeholder image and will
                // remain if the ad has no image
                $(item).find(".image img").data("src") || $(item).find(".image img").attr("src") || ""
            ).replace(IMG_REGEX, "/s-l2000.jpg"),

            date: dateFromRelativeDateString(
                // For some reason, some categories (like anything under
                // SERVICES) use different markup than usual
                //
                // The string split is needed to handle:
                //
                // <td class="posted">
                //    Some date
                //    <br>
                //    Some location
                // </td>
                //
                // AKA "Some date\nSome location"
                ($(item).find(".date-posted").text() || $(item).find(".posted").text()).trim().split("\n")[0]
            ),

            // Pick a format, Kijiji
            description: ($(item).find(".description > p").text() || $(item).find(".description").text()).trim()
        };
        adResults.push(new KijijiAd(url, info));
    });
    return adResults;
}

/* Retrieves the URL of the first page of search results */
async function getFirstResultPageURL(params: SearchParameters): Promise<string> {
    const res: FetchResponse = await fetch(`${KIJIJI_SEARCH_URL}?${qs.stringify(params)}`);

    // Kijiji will redirect to the rendered results
    // Grab the destination path so that it can be modified for pagination
    if (res.status !== 200 || !res.url) {
        // TODO: detect ban and show a different message
        const bugsUrl = packageJson.bugs.url;
        throw new Error(
            "Kijiji failed to return search results. " +
            "It is possible that Kijiji changed their results markup. " +
            `If you believe this to be the case, please open a bug at: ${bugsUrl}`
        );
    }
    return res.url;
}

/* Retrieves one page of Kijiji search results */
type PageResults = { pageResults: KijijiAd[], isLastPage: boolean };
async function getPageResults(pageNum: number, firstResultPageURL: string): Promise<PageResults> {
    // Specify page number. It must be the last path component of the URL
    const url = firstResultPageURL.replace(LOCATION_REGEX, `$1/page-${pageNum}$2`);

    // Search Kijiji
    const body = await fetch(url).then(res => res.text());
    try {
        return {
            pageResults: parseResultsHTML(body),
            isLastPage: body.indexOf('"isLastPage":true') !== -1
        };
    } catch (err) {
        // Invalid results page
        console.warn(`WARNING: Failed to parse search result: ${err}`);
        throw new Error(`Invalid Kijiji HTML on search results page (${url})`);
    }
}

/* Retrieves at least minResults search results from Kijiji using the passed parameters */
async function getSearchResults(params: SearchParameters, minResults: number): Promise<KijijiAd[]> {
    /* When searching with formSubmit = true, Kijiji will redirect us to a URL
       that the UI uses to encode search parameters. This URL can be modified to
       specify the page number (the only reliable way I have found to do so) */
    const firstResultPageURL = await getFirstResultPageURL(params);
    const results: KijijiAd[] = [];
    let pageNum = 1;

    while (results.length < minResults) {
        const { pageResults, isLastPage } = await getPageResults(pageNum++, firstResultPageURL);
        results.push(...pageResults);

        if (pageResults.length === 0 || isLastPage) {
            break;
        }
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
function getSearchParams(params: any): Required<SearchParameters> {
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
    return paramsForSearch;
}

function getSearchOptions(options: SearchOptions): Required<SearchOptions> {
    // Copy options so we don't modify what was passed
    const optionsForSearch = { ...options };

    // Option defaults
    if (optionsForSearch.scrapeResultDetails === undefined) {
        optionsForSearch.scrapeResultDetails = true;
    }
    if (optionsForSearch.minResults === undefined) {
        optionsForSearch.minResults = 40;
    }
    if (optionsForSearch.maxResults === undefined) {
        optionsForSearch.maxResults = -1;
    }

    ensureIntProp(optionsForSearch, "minResults");
    ensureIntProp(optionsForSearch, "maxResults");
    return optionsForSearch as Required<SearchOptions>;
}

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
export default function search(params: SearchParameters, options: SearchOptions = {}, callback?: (err: Error | null, ads: KijijiAd[]) => void): Promise<KijijiAd[]> {
    const promise: Promise<KijijiAd[]> = new Promise((resolve, reject) => {
        // Configure search
        const paramsForSearch = getSearchParams(params);
        const optionsForSearch = getSearchOptions(options);

        // Perform search
        getSearchResults(paramsForSearch, optionsForSearch.minResults).then(results => {
            if (optionsForSearch.maxResults >= 0) {
                results = results.slice(0, optionsForSearch.maxResults);
            }
            if (optionsForSearch.scrapeResultDetails) {
                return Promise.all(results.map(ad => ad.scrape())).then(() => results);
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
