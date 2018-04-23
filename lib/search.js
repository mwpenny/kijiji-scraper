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
const MAX_RESULTS_PAGE_NUM = 100;  // Limit imposed by Kijiji

/* Scrapes each passed ad's link to get more information about it */
function ensureScraped(results, callback) {
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
    dateString = dateString.toLowerCase().replace('/', ' ');

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

/* Searches recent Kijiji ads using passed criteria */
function search(params, callback, options={}) {
    function ensureNumericProp(obj, propName) {
        let propType = (obj === params) ? "parameter" : "option";
        if (!obj.hasOwnProperty(propName) || typeof obj[propName] !== "number")
            return new Error("Numeric " + propType + " \'" + propName + "\' must be specified");
        return null;
    }

    // Verify required parameters
    let paramError = ensureNumericProp(params, "locationId") || ensureNumericProp(params, "categoryId");
    if (paramError)
        return callback(paramError);

    /* Tell Kijiji to redirect us to the URL used in the frontend as this is the only
       URL I have gotten paging to work with */
    params.formSubmit = true;

    // Date scraping assumes the page is in English
    params.siteLocale = "en_CA"

    // Option defaults
    if (options.scrapeResultDetails === undefined)
        options.scrapeResultDetails = true;
    if (options.minResults === undefined)
        options.minResults = 20;
    if (options.maxResults === undefined)
        options.maxResults = -1;

    // Verify required options
    let optionError = ensureNumericProp(options, "minResults") || ensureNumericProp(options, "maxResults");
    if (optionError)
        return callback(optionError);

    getSearchResults(params, options.minResults, function(err, results) {
        if (err)
            return callback(err);
        if (options.maxResults >= 0)
            results = results.slice(0, options.maxResults);

        if (options.scrapeResultDetails) {
            ensureScraped(results, function(err) {
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
