// html-searcher.ts
/* Provides implementation for searcher which retrieves
   results via the public-facing website */

import cheerio from "cheerio";
import qs from "querystring";
import fetch, { Response as FetchResponse } from "node-fetch";

import { Ad } from "../ad";
import { BANNED, HTML_REQUEST_HEADERS, POSSIBLE_BAD_MARKUP } from "../constants";
import { AdInfo } from "../scraper";
import { PageResults, ResolvedSearchParameters } from "../search";
import { getLargeImageURL } from "../helpers";

const KIJIJI_BASE_URL = "https://www.kijiji.ca";
const KIJIJI_SEARCH_URL = KIJIJI_BASE_URL + "/b-search.html";
const LOCATION_REGEX = /(.+)(\/.*)$/;

/* Extracts ad information from the HTML of a Kijiji ad results page */
function parseResultsHTML(html: string): Ad[] {
    const adResults: Ad[] = [];
    const $ = cheerio.load(html);

    if (html.trim().length === 0) {
        return adResults;
    }

    // Kijiji is nice and gives us an object containing ad info
    const resultJson = $("script#__NEXT_DATA__").text().trim();
    if (!resultJson) {
        throw new Error(`Kijiji result JSON not present. ${POSSIBLE_BAD_MARKUP}`);
    }

    const parsedResultJson: any | undefined = JSON.parse(resultJson)
        .props
        ?.pageProps
        ?.__APOLLO_STATE__;
    if (parsedResultJson === undefined) {
        throw new Error(`Result JSON could not be parsed. ${POSSIBLE_BAD_MARKUP}`);
    }

    // All non-sponsored ads
    const filteredAds = Object.entries(parsedResultJson).filter(entry => {
        return entry[0].toLowerCase().startsWith("listing") &&
               (entry[1] as any)?.adSource?.toLowerCase() === "organic";
    }).map(entry => entry[1] as any);

    for (const ad of filteredAds) {
        if (!ad.seoUrl || !ad.id || !ad.title || !ad.activationDate) {
            throw new Error(`Result ad could not be parsed. ${POSSIBLE_BAD_MARKUP}`);
        }

        const url = KIJIJI_BASE_URL + ad.seoUrl;
        const info: Partial<AdInfo> = {
            id: ad.id,
            title: ad.title.trim(),
            image: getLargeImageURL((ad.imageUrls || [])[0] || ""),
            date: new Date(ad.activationDate),
            description: (ad.description || "").trim()
        };

        adResults.push(new Ad(url, info));
    }

    return adResults;
}

/**
 * Searcher implementation
 */
export class HTMLSearcher {
    private firstResultPageURL: string | undefined = undefined;

    /* Retrieves the URL of the first page of search results */
    private async getFirstResultPageURL(params: ResolvedSearchParameters): Promise<string> {
        if (this.firstResultPageURL === undefined) {
            const res: FetchResponse = await fetch(
                `${KIJIJI_SEARCH_URL}?${qs.stringify(params)}`,
                { headers: HTML_REQUEST_HEADERS }
            );

            // Kijiji will redirect to the rendered results
            // Grab the destination path so that it can be modified for pagination
            if (res.status === 403) {
                throw new Error(BANNED);
            } else if (res.status !== 200 || !res.url) {
                throw new Error(`Kijiji failed to redirect to results page. ${POSSIBLE_BAD_MARKUP}`);
            }
            this.firstResultPageURL = res.url;
        }

        return this.firstResultPageURL;
    }

    /* Retrieves one page of Kijiji search results */
    async getPageResults(params: ResolvedSearchParameters, pageNum: number): Promise<PageResults> {
        /* When searching with formSubmit = true, Kijiji will redirect us to a URL
           that the UI uses to encode search parameters. This URL can be modified to
           specify the page number (the only reliable way I have found to do so) */
        const firstResultPageURL = await this.getFirstResultPageURL(params);

        // Specify page number. It must be the last path component of the URL
        const url = firstResultPageURL.replace(LOCATION_REGEX, `$1/page-${pageNum}$2`);

        // Search Kijiji
        return fetch(url, { headers: HTML_REQUEST_HEADERS })
            .then(res => {
                if (res.status === 403) {
                    throw new Error(BANNED);
                }
                return res.text();
            })
            .then(body => ({
                pageResults: parseResultsHTML(body),
                isLastPage: body.indexOf("pagination-next-link") === -1
            }));
    }
}