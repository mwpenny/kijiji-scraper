// search.js
/* Searches Kijiji for recent ads matching given criteria */

const cheerio = require("cheerio");
const request = require("request");

const KijijiAd = require("./ad");
const scraper = require("./scraper");

const KIJIJI_BASE_URL = "https://www.kijiji.ca";
const KIJIJI_SEARCH_URL = KIJIJI_BASE_URL + "/b-search.html";
const IMG_REGEX = /\/\$_\d+\.JPG$/;
const LOCATION_REGEX = /(.+)(\/.*)$/;
const MAX_RESULTS_PER_PAGE = 20;  // Limit imposed by Kijiji
const MAX_RESULTS_PAGE_NUM = 100;  // Limit imposed by Kijiji (theoretical max of 20*100=2000 results)

/* Scrapes each passed ad's link to get more information about it */
function scrapeDetails(results, callback) {
    let scraped = 0;

    if (results.length == 0)
        return callback();

    // Scrape each ad
    for (let i = 0; i < results.length; ++i) {
        results[i].scrape(function(err) {
            if (err)
                return callback(err);
            else if (++scraped == results.length)
                return callback();
        });
    }
};

/* Converts a date from a Kijiji ad result into a date object
   (e.g., "< x hours ago", "yesterday", "dd/mm/yyyy") */
function dateFromRelativeDateString(dateString) {
    if (!dateString)
        return null;
    dateString = dateString.toLowerCase().replace(/\//g, ' ');

    let split = dateString.split(' ');
    let d = new Date();

    if (split.length == 3) {
        // dd/mm/yyyy format
        d.setHours(0, 0, 0, 0);
        d.setDate(parseInt(split[0]));
        d.setMonth(parseInt(split[1]) - 1);
        d.setYear(parseInt(split[2]));
        return d;
    } else if (split.length == 4) {
        // "< x hours/minutes" ago format
        let num = parseInt(split[1]);
        let timeUnit = split[2];

        if (timeUnit == "minutes")
            d.setMinutes(d.getMinutes() - num);
        else if (timeUnit == "hours")
            d.setHours(d.getHours() - num);
        return d;
    } else if (dateString == "yesterday") {
        d.setDate(d.getDate() - 1);
        return d;
    }
    return null;
}

/* Parses the HTML of a Kijiji ad results page */
function parseHTML(html) {
    let adResults = null;
    let $ = cheerio.load(html);

    // Get info for each ad
    $(".regular-ad").each(function(i, item) {
        try {
            let url = KIJIJI_BASE_URL + $(item).find("a.title").attr("href");
            let info = {
                "title": $(item).find(".title > .title").text().trim(),
                "image": $(item).find(".image img").attr("src").replace(IMG_REGEX, "/$_57.JPG"),
                "date": dateFromRelativeDateString($(item).find(".date-posted").text()),
                "description": $(this).find(".description").text().trim(),
            };
            adResults = adResults || [];
            adResults.push(new KijijiAd(url, info));
        } catch(e) {
            // Invalid ad
            console.log(e);
        }
    });
    return adResults;
}

/* Retrieves one page of Kijiji search results (up to 20 results) */
function getPageResults(params, pageNum, callback) {
    /* When searching with formSubmit = true, Kijiji will redirect us to a URL
       that the UI uses to encode search parameters. It also allows us to specify
       the page number (the only reliable way I have found to do so) */
    request({"url": KIJIJI_SEARCH_URL, "qs": params, followRedirect: false}, function(err, res) {
        if (err)
            return callback(err);
        else if (res.statusCode != 301)
            return callback(new Error("Kijiji failed to redirect to search results"));

        // Specify page number. It must be the last path component of the URL
        let location = res.caseless.get("location").replace(LOCATION_REGEX, "$1/page-" + pageNum + "$2");

        // Search Kijiji
        request(KIJIJI_BASE_URL + location, function(err, res) {
            if (err)
                return callback(err);

            let results = parseHTML(res.body);
            if (!results)
                return callback(new Error("Invalid Kijiji HTML at URL"));
            callback(null, results);
        });
    });
}

/* Retrieves at least minResults search results from Kijiji using the passed parameters */
function getSearchResults(params, minResults, callback, results=[], pageNum=1) {
    getPageResults(params, pageNum, function(err, pageResults) {
        if (err)
            return callback(err);

        results.push(...pageResults);
        if (results.length >= minResults ||
            results.length < MAX_RESULTS_PER_PAGE ||
            pageNum == MAX_RESULTS_PAGE_NUM) {
            return callback(null, results);
        }
        getSearchResults(params, minResults, callback, results, pageNum + 1);
    });
}

/* Validates that obj.propName exists and is numeric */
function ensureNumericProp(obj, propName) {
    if (!obj.hasOwnProperty(propName) || typeof obj[propName] !== "number")
        return new Error("Numeric property \'" + propName + "\' must be specified");
    return null;
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
    let paramsForSearch = {};
    for (let prop in params) {
        if (params.hasOwnProperty(prop))
            paramsForSearch[prop] = params[prop];
    }

    // Parameter defaults
    if (paramsForSearch.locationId === undefined)
        paramsForSearch.locationId = 0;
    if (paramsForSearch.categoryId === undefined)
        paramsForSearch.categoryId = 0;

    /* Tell Kijiji to redirect us to the URL used in the frontend as this is the only
       URL I have gotten paging to work with */
    paramsForSearch.formSubmit = true;

    // Date scraping relies on the page being in English
    paramsForSearch.siteLocale = "en_CA"

    // If id objects are being used, get the contained ids
    paramsForSearch.locationId = getId(paramsForSearch.locationId);
    paramsForSearch.categoryId = getId(paramsForSearch.categoryId);

    let paramError = ensureNumericProp(paramsForSearch, "locationId") ||
                     ensureNumericProp(paramsForSearch, "categoryId");
    if (paramError)
        throw paramError;

    return paramsForSearch;
}

function getSearchOptions(options) {
    // Copy options so we don't modify what was passed
    let optionsForSearch = {};
    for (let prop in options) {
        if (options.hasOwnProperty(prop))
            optionsForSearch[prop] = options[prop];
    }

    // Option defaults
    if (optionsForSearch.scrapeResultDetails === undefined)
        optionsForSearch.scrapeResultDetails = true;
    if (optionsForSearch.minResults === undefined)
        optionsForSearch.minResults = 20;
    if (optionsForSearch.maxResults === undefined)
        optionsForSearch.maxResults = -1;

    // Verify required options
    let optionError = ensureNumericProp(optionsForSearch, "minResults") ||
                      ensureNumericProp(optionsForSearch, "maxResults");
    if (optionError)
        throw optionError;

    return optionsForSearch;
}

/* Searches recent Kijiji ads using passed criteria */
function search(params, callback, options={}) {
    let paramsForSearch = {};
    let optionsForSearch = {};
    try {
        paramsForSearch = getSearchParams(params);
        optionsForSearch = getSearchOptions(options);
    } catch (ex) {
        return callback(ex);
    }

    getSearchResults(paramsForSearch, optionsForSearch.minResults, function(err, results) {
        if (err)
            return callback(err);
        if (optionsForSearch.maxResults >= 0)
            results = results.slice(0, optionsForSearch.maxResults);

        if (optionsForSearch.scrapeResultDetails) {
            scrapeDetails(results, function(err) {
                if (err)
                    return callback(err);
                callback(null, results);
            });
        } else {
            callback(null, results);
        }
    });
}

module.exports = search;
