// api-searcher.ts
/* Provides implementation for searcher which retrieves
   results via the Kijiji mobile API */

import cheerio from "cheerio";
import qs from "querystring";
import fetch from "node-fetch"

import { Ad } from "../ad";
import { scrapeAdElement } from "./api-scraper";
import { API_REQUEST_HEADERS, BANNED, POSSIBLE_BAD_MARKUP } from "../constants";
import { PageResults, ResolvedSearchParameters } from "../search";

const API_SEARCH_ENDPOINT = "https://mingle.kijiji.ca/api/ads";

function parseResultsXML(xml: string): PageResults {
    const adResults: Ad[] = [];
    const $ = cheerio.load(xml);
    const isLastPage = $("types\\:paging types\\:link[rel='next']").length === 0;

    // Get info for each ad
    $("ad\\:ad").each((_i, item) => {
        const url = $(item).find("ad\\:link[rel='self-public-website']").attr("href");
        if (!url) {
            // Top and third-party ads have no Kijiji URL
            return;
        }

        const info = scrapeAdElement(item);
        if (info === null) {
            throw new Error(`Result ad could not be parsed. ${POSSIBLE_BAD_MARKUP}`);
        }
        adResults.push(new Ad(url, info, true));
    });

    return {
        pageResults: adResults,
        isLastPage
    };
}

/**
 * Searcher implementation
 */
export class APISearcher {
    /* Retrieves one page of Kijiji search results */
    getPageResults(params: ResolvedSearchParameters, pageNum: number): Promise<PageResults> {
        const url = `${API_SEARCH_ENDPOINT}?${qs.stringify({
            ...params,
            page: pageNum - 1,
            size: 20  // Results per page, just like the app
        })}`;

        // Search Kijiji
        return fetch(url, { headers: API_REQUEST_HEADERS, compress: true })
            .then(res => {
                if (res.status === 403) {
                    throw new Error(BANNED);
                }
                return res.text();
            })
            .then(parseResultsXML);
    }
}