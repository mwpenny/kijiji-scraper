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

const KIJIJI_BASE_URL = "https://www.kijiji.ca";
const KIJIJI_SEARCH_URL = KIJIJI_BASE_URL + "/b-search.html";
const IMG_REGEX = /\/s\-l\d+\.jpg$/;
const LOCATION_REGEX = /(.+)(\/.*)$/;

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
function parseResultsHTML(html: string): Ad[] {
    const adResults: Ad[] = [];
    const $ = cheerio.load(html);

    // Get info for each ad
    const allAdElements = $(".regular-ad");
    const filteredAdElements = allAdElements.not(".third-party");

    filteredAdElements.each((_i, item) => {
        const path = $(item).find("a.title").attr("href");
        const url = KIJIJI_BASE_URL + path;
        const info: Partial<AdInfo> = {
            id: $(item).data("listing-id")?.toString() || "",

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

        if (!path) {
            throw new Error(`Result ad has no URL. ${POSSIBLE_BAD_MARKUP}`);
        }

        adResults.push(new Ad(url, info));
    });
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
                isLastPage: body.indexOf('"isLastPage":true') !== -1
            }));
    }
}