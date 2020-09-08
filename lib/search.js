// search.js
/* Searches Kijiji for recent ads matching given criteria */

const cheerio = require("cheerio");
const qs = require("querystring");
const fetch = require("node-fetch");

const KijijiAd = require("./ad");
const packageJson = require("../package.json");

const KIJIJI_BASE_URL = "https://www.kijiji.ca";
const KIJIJI_SEARCH_URL = KIJIJI_BASE_URL + "/b-search.html";
const IMG_REGEX = /\/s\-l\d+\.jpg$/;
const LOCATION_REGEX = /(.+)(\/.*)$/;

/* Converts a date from a Kijiji ad result into a date object
   (e.g., "< x hours ago", "yesterday", "dd/mm/yyyy") */
function dateFromRelativeDateString(dateString) {
    if (dateString) {
        dateString = dateString.toLowerCase().replace(/\//g, " ");

        let split = dateString.split(" ");
        let d = new Date();

        if (split.length == 3) {
            // dd/mm/yyyy format
            d.setHours(0, 0, 0, 0);
            d.setDate(parseInt(split[0]));
            d.setMonth(parseInt(split[1]) - 1);
            d.setFullYear(parseInt(split[2]));
            return d;
        } else if (split.length == 4) {
            // "< x hours/minutes ago" format
            let num = parseInt(split[1]);
            let timeUnit = split[2];

            if (timeUnit == "minutes") {
                d.setMinutes(d.getMinutes() - num);
                d.setSeconds(0, 0);
            } else if (timeUnit == "hours") {
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
function parseResultsHTML(html) {
    let adResults = [];
    let $ = cheerio.load(html);

    // Get info for each ad
    let allAdElements = $(".regular-ad");
    let filteredAdElements = allAdElements.not(".third-party");

    filteredAdElements.each((_i, item) => {
        let url = KIJIJI_BASE_URL + $(item).find("a.title").attr("href");
        let info = {
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
                // <td class="posted">
                //    Some date
                //    <br>
                //    Some location
                // </td>
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
function getFirstResultPageURL(params) {
    return new Promise(function(resolve, reject) {
        fetch(`${KIJIJI_SEARCH_URL}?${qs.stringify(params)}`).then(function(res) {
            /* Kijiji will redirect to the rendered results. Grab the destination
               path so that it can be modified for pagination */
            if (res.status !== 200 || !res.url) {
                // TODO: detect ban and show a different message
                const bugsUrl = packageJson.bugs.url;
                reject(new Error("Kijiji failed to return search results. " +
                        "It is possible that Kijiji changed their results markup. " +
                        `If you believe this to be the case, please open a bug at: ${bugsUrl}`));
            }
            else {
                resolve(res.url);
            }
        }).catch(reject);
    });
}

/* Retrieves one page of Kijiji search results (up to 20 results) */
function getPageResults(pageNum, firstResultPageURL) {
    // Specify page number. It must be the last path component of the URL
    const url = firstResultPageURL.replace(LOCATION_REGEX, `$1/page-${pageNum}$2`);

    // Search Kijiji
    return fetch(url)
        .then(res => res.text())
        .then(body => {
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
        });
}

/* Retrieves at least minResults search results from Kijiji using the passed parameters */
async function getSearchResults(params, minResults) {
    /* When searching with formSubmit = true, Kijiji will redirect us to a URL
       that the UI uses to encode search parameters. This URL can be modified to
       specify the page number (the only reliable way I have found to do so) */
    const firstResultPageURL = await getFirstResultPageURL(params);
    const results = [];
    let pageNum = 1;

    while (true) {
        const { pageResults, isLastPage } = await getPageResults(pageNum, firstResultPageURL);
        results.push(...pageResults);

        if (results.length >= minResults || pageResults.length === 0 || isLastPage) {
            return results;
        }

        ++pageNum;
    }
}

/* Validates that obj.propName exists and is an integer */
function ensureIntProp(obj, propName) {
    if (!obj.hasOwnProperty(propName) || !Number.isInteger(obj[propName])) {
        throw new Error(`Integer property '${propName}' must be specified`);
    }
}

/* Parses search parameters, adds default values if required, and then performs validation */
function getSearchParams(params) {
    function getId(id) {
        // If id is an id object, return the contained id
        let ret = id;
        if (typeof id == "object" && id.hasOwnProperty("id"))
            ret = id.id;
        return ret;
    }

    // Copy params so we don't modify what was passed
    let paramsForSearch = {
        // Defaults
        locationId: 0,
        categoryId: 0,
    };

    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
            paramsForSearch[key] = value;
        }
    }

    /* Tell Kijiji to redirect us to the URL used in the frontend as this is the only
       URL I have gotten paging to work with */
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

function getSearchOptions(options) {
    // Copy options so we don't modify what was passed
    let optionsForSearch = {
        // Defaults
        scrapeResultDetails: true,
        minResults: 40,
        maxResults: -1
    };

    for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
            optionsForSearch[key] = value;
        }
    }

    // Verify required options
    ensureIntProp(optionsForSearch, "minResults");
    ensureIntProp(optionsForSearch, "maxResults");

    return optionsForSearch;
}

/* Searches recent Kijiji ads using passed criteria */
function search(params, options={}, callback=null) {
    let promise = new Promise(function(resolve, reject) {
        // Configure search
        let paramsForSearch = {};
        let optionsForSearch = {};
        try {
            paramsForSearch = getSearchParams(params);
            optionsForSearch = getSearchOptions(options);
        } catch (ex) {
            return reject(ex);
        }

        // Perform search
        getSearchResults(paramsForSearch, optionsForSearch.minResults).then(function(results) {
            if (optionsForSearch.maxResults >= 0)
                results = results.slice(0, optionsForSearch.maxResults);

            if (optionsForSearch.scrapeResultDetails)
                return Promise.all(results.map(ad => ad.scrape())).then(() => results);
            return results;
        }).then(resolve, reject);
    });

    if (callback)
        promise.then((results) => callback(null, results), callback);
    return promise;
}

module.exports = search;
