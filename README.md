# kijiji-scraper
A lightweight node.js module for retrieving and scraping ads from [Kijiji](http://www.kijiji.ca).


## Features
* Retrieve single ads as JavaScript objects given their URL
* Retrieve the latest ads matching given search criteria

## Dependencies
* [node.js](http://github.com/joyent/node) - evented I/O for the backend
* [cheerio](http://www.github.com/cheeriojs/cheerio) - jQuery-like API for the server
* [node-fetch](https://github.com/bitinn/node-fetch) - [Fetch](https://fetch.spec.whatwg.org) API implementation for Node.Js

## Installation
`npm install kijiji-scraper`

## Documentation

**Quick start:** Use `Ad.Get()` to scrape an ad given its URL. Use `search()` to scrape many ads given a set of search parameters. Read on (or CTRL+F) for more detailed information. Documentation can also be found in the TSDoc comments in this module's TypeScript type definition files (`.d.ts` files).

### `Ad` class
This class encapsulates a Kijiji ad and its properties. It also handles retrieving this information from Kijiji.

#### Properties
|Property      |Type    |Description                                          |
|--------------|--------|-----------------------------------------------------|
|`title`       |String  |Title of the ad                                      |
|`description` |String  |Ad description                                       |
|`date`        |Date    |Date the ad was posted                               |
|`image`       |String  |URL of the ad's primary image                        |
|`images`      |String[]|Array of URLs of the ad's images                     |
|`attributes`  |Object  |Properties specific to the category of the scraped ad|
|`url`         |String  |The ad's url                                         |
|`id`          |String  |Unique identifier of the ad                          |

The image URL given in `image` is the featured image for the ad. The image URLs given in `images` are all of the images associated with the ad.

> **Note:** If the ad has not been scraped automatically, some of these properties may be null or empty. This happens when an `Ad` object is created manually using the constructor or by performing a search with the `scrapeResultDetails` option set to `false`. See the [`Ad.isScraped()`](#adisscraped) and [`Ad.scrape()`](#adscrapeoptions-callback) method documentation below for more information on this.

#### Methods

##### `Ad.Get(url[, options, callback])`

Will scrape the Kijiji ad at `url` and construct an `Ad` object containing its information.

###### Arguments

* `url` - A Kijiji ad URL
* `options` (optional) - Options to pass to the scraper. See [Scraper Options](#scraper-options) for details
* `callback(err, ad)` (optional) - A callback called after the ad has been scraped. If an error occurs during scraping, `err` will not be null. If everything is successful, `ad` will contain an `Ad` object

###### Return value

Returns a `Promise` which resolves to an `Ad` object containing the ad's information.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

// Scrape using returned promise
kijiji.Ad.Get("<Kijiji ad URL>").then(ad => {
    // Use the ad object
    console.log(ad.title);
}).catch(console.error);

// Scrape using optional callback paramater
kijiji.Ad.Get("<Kijiji ad URL>", {}, (err, ad) => {
    if (!err) {
        // Use the ad object
        console.log(ad.title);
    }
});
```

##### `Ad(url[, info, scraped])`

`Ad` constructor. Manually constructs an ad object. You should generally not need to use this save for a few special cases (e.g., storing ad URLs entered by a user for delayed scraping). `Ad.isScraped()` returns false for `Ad` objects constructed in this way unless `scraped` is passed as `true` or they are subsequently scraped by calling `Ad.scrape()`, which causes the scraper to replace the ad's information with what is found at its URL.

###### Arguments

* `url` - Ad's URL
* `info` (optional) - Object containing the ad's properties. Only keys in the properties table (above) may be specified. May be omitted (if not specified then `images` will be an empty array, `attributes` will be an empty object, and all other properties will be null)
* `scraped` (optional) - If `true`, causes `Ad.IsScraped()` to return `true` regardless of whether or not `Ad.scrape()` has been called

###### Example usage
```js
const kijiji = require("kijiji-scraper");

const ad = kijiji.Ad("<Kijiji ad URL>", { date: new Date() });
console.log(ad.isScraped()); // false
console.log(ad.date); // current date

ad.scrape().then(() => {
    // Use the ad object
    console.log(ad.date); // date ad was posted (initial value is overwritten)
}).catch(console.error);
```

##### `Ad.isScraped()`

Determines whether or not the ad's information has been retrieved from Kijiji.

###### Return value

Returns a boolean indicating whether or not an ad's information has been scraped from the page at its URL. This can be false if the `Ad` object was manually created using the constructor or if it was retrieved from a search with the `scrapeResultDetails` option set to false. Call `Ad.scrape()` to retrieve the information for such ads.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

const ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false

ad.scrape().then(() => {
    console.log(ad.isScraped()); // true
}).catch(console.error);
```

##### `Ad.scrape([options, callback])`

Manually retrieves an `Ad`'s information from its URL. Useful if it was created in a way that does not do this automatically, such as using the constructor or performing a search with the `scrapeResultDetails` option set to false.

###### Arguments

* `options` (optional) - Options to pass to the scraper. See [Scraper Options](#scraper-options) for details
* `callback(err)` (optional) - A callback called after the ad has been scraped. If an error occurs during scraping, `err` will not be null

###### Return value

Returns a `Promise` which resolves once the ad has been scraped and the object has been updated.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

const ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false

// Scrape using returned promise
ad.scrape().then(() => {
    // Use the ad object
    console.log(ad.isScraped()); // true
    console.log(ad.title);
}).catch(console.error);

// Scrape using optional callback paramater
ad.scrape({}, err => {
    if (!err) {
        // Use the ad object
        console.log(ad.isScraped()); // true
        console.log(ad.title);
    }
});
```

##### `Ad.toString()`

Returns a string representation of the ad. This is just meant to be a summary and may omit information for brevity or change format in the future. Access the `Ad`'s properties directly if you need them for comparisons, etc. The current format is as follows:
```
[MM/dd/yyyy @ hh:mm] TITLE
URL
* property1: value1
* property2: value2
...
* propertyN: valueN
```
The date, title, and properties will be absent if the ad has not been scraped (`isScraped() == false`) unless they were manually specified when the object was constructed.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

kijiji.Ad.Get("<Kijiji ad URL>").then(ad => {
    console.log(ad.toString());
}).catch(console.error);
```

---
### Searching for ads

Searches are performed using the `search()` function:

#### search(params[, options, callback])

##### Arguments
* `params` - Object containing Kijiji ad search parameters.
    * **Mandatory parameters:**

        |Parameter   |Type          |Default Value       |Description                                                     |
        |------------|--------------|--------------------|----------------------------------------------------------------|
        |`locationId`|Integer/Object|`0` (all of Canada) |Id of the geographical location to search in                       |
        |`categoryId`|Integer/Object|`0` (all categories)|Id of the ad category to search in                                 |

        Values for `locationId` and `categoryId` can be found by performing a search on the Kijiji website and examining the URL that Kijiji redirects to. For example, after setting the location to Ottawa and selecting the "cars & vehicles" category, Kijiji redirects to http://www.kijiji.ca/b-cars-vehicles/ottawa/c27l1700185. The last part of the URL (c27l1700185) is formatted as c[categoryId]l[locationId]. So in this case, `categoryId` is 27 and `locationId` is 1700185.

        ###### Location and category objects
        For convenience, objects containing all `locationId` and `categoryId` values Kijiji accepts have been defined in `locations.ts` and `categories.ts`, respectively. These objects are nested in the same way as those in the location and category selectors on the Kijiji website (e.g., the city of Montreal is located under "Quebec > Greater Montreal > City of Montreal"; coffee tables are located under "Buy and Sell > Furniture > Coffee Tables"), so their contents should be familiar.

        For example, instead of setting `locationId` to `1700281` (Montreal) and `categoryId` to `241` (coffee tables), you can set `locationId` to `locations.QUEBEC.GREATER_MONTREAL.CITY_OF_MONTREAL` and `categoryId` to `categories.BUY_AND_SELL.FURNITURE.COFFEE_TABLES`. You no longer need to know the ids, and you have a quick reference available. Any location/category object along the hierarchy will also work (e.g., `locations.QUEBEC` for all of Quebec, not just Montreal; `categories.BUY_AND_SELL.FURNITURE` for all furniture, not just coffee tables). The root objects themselves specify all locations/categories (id of `0`). Location/category objects and `locationId`s/`categoryId`s are interchangeable - the search function will behave identically in either case. See [`locations.ts`](lib/locations.ts) and [`categories.ts`](lib/categories.ts) for all location and category objects.

    * **Optional parameters:**
        There are many different search parameters. Some of these can be used in any search (i.e., `minPrice`), but most are category-specific. Additionally, some parameters are specific to which `scraperType` is being used (see [Scraper Options](#scraper-options) for details on how to switch).

        * Some known parameters available when using _either_ the `"api"` (default) or `"html"` `scraperType`:

            |Parameter   |Type  |Description                                                  |
            |------------|------|-------------------------------------------------------------|
            |`minPrice`  |Number|Minimum price of returned items                              |
            |`maxPrice`  |Number|Maximum price of returned items                              |
            |`adType`    |String|Type of ad (`"OFFER"`, `"WANTED"`, or `undefined` - for both). If using the `"api"` `scraperType` then `"OFFERED"` must be used instead of `"OFFER"`.|

        * Some known parameters available when using the `"api"` (default) `scraperType`:

            |Parameter   |Type  |Description                                                                                                           |
            |------------|------|----------------------------------------------------------------------------------------------------------------------|
            |`q`         |String|Search string                                                                                                         |
            |`sortType`  |String|Search results ordering (e.g., `"DATE_DESCENDING"`, `"DISTANCE_ASCENDING"`, `"PRICE_ASCENDING"`, `"PRICE_DESCENDING"`)|
            |`distance`  |Number|Distance in kilometers                                                                                                |
            |`priceType` |String|Type of price (e.g., `"SPECIFIED_AMOUNT"`, `"PLEASE_CONTACT"`, `"FREE"`, `"SWAP_TRADE"`)                              |

        * Some known parameters available when using the `"html"` `scraperType`:

            Parameters to use with the `scraperType="html"` can be easily found by using your browser's developer tools and performing a custom search on the Kijiji website. After submitting your search on Kijiji or updating the filter being applied, use your browser's network monitoring tool to examine the request for `https://www.kijiji.ca/b-search.html`. Any parameter used in the query string for this request is able to be specified in `params`. A few examples include:

            |Parameter   |Type  |Description                                                                           |
            |------------|------|--------------------------------------------------------------------------------------|
            |`keywords`  |String|Search string                                                                         |
            |`sortByName`|String|Search results ordering (e.g., `"dateDesc"`, `"dateAsc"`, `"priceDesc"`, `"priceAsc"`)|

* `options` (optional) - Contains parameters that control the behavior of searching and scraping. Can be omitted. In addition to the options below, you can also specify everything in [Scraper Options](#scraper-options).

    |Option                |Type   |Default Value|Description|
    |----------------------|-------|-------------|-----------|
    |`pageDelayMs`         |Integer|`1000`       |Amount of time in milliseconds to wait between scraping each result page. This is useful to avoid detection and bans from Kijiji.|
    |`minResults`          |Integer|`20`         |Minimum number of ads to fetch (if available). Note that Kijiji results are returned in pages of up to 20 ads, so if you set this to something like 29, up to 40 results may be retrieved. A negative value indicates no limit (retrieve as many ads as possible). If negative or not specified and `maxResults > 0`, `minResults` will take on the value of `maxResults`.|
    |`maxResults`          |Integer|`-1`         |Maximum number of ads to return. This simply removes excess results from the array that is returned (i.e., if `minResults` is 40 and `maxResults` is 7, 40 results will be fetched from Kijiji and the last 33 will be discarded). A negative value indicates no limit. If greater than zero and `minResults` is unspecified, or if `minResults` is negative, this value will also be used for `minResults`.|
    |`scrapeResultDetails` |Boolean|`true`       |When using the HTML scraper, the details of each query result are scraped in separate, subsequent requests by default. To suppress this behavior and return only the data retrieved by the initial query, set this option to `false`. Note that ads will lack some information if you do this and `Ad.isScraped()` will return `false` until `Ad.scrape()` is called to retrieve the missing information. This option does nothing when using the API scraper (default).|
    |`resultDetailsDelayMs`|Integer|`500`        |When `scrapeResultDetails` is `true`, the amount of time in milliseconds to wait in between each request for result details. A value of 0 will cause all such requests to be made at the same time. This is useful to avoid detection and bans from Kijiji.|

* `callback(err, results)` (optional) - A callback called after the search results have been scraped. If an error occurs during scraping, `err` will not be null. If everything is successful, `results` will contain an array of `Ad` objects.

###### Return value

Returns a `Promise` which resolves to an array of search result `Ad` objects.

> **Note:** Ads may not appear in search results (or the Kijiji website, for that matter) for a short time after they are created (usually no more than 1 minute). This means that when searching, you are not guaranteed to receive extremely recent ads. Such ads will be returned in future searches but their `date` property will reflect the time that they were actually created.

##### Example usage
```js
const kijiji = require("kijiji-scraper");

const options = {
    minResults: 20
};

const params = {
    locationId: 1700185,  // Same as kijiji.locations.ONTARIO.OTTAWA_GATINEAU_AREA.OTTAWA
    categoryId: 27,  // Same as kijiji.categories.CARS_AND_VEHICLES
    sortByName: "priceAsc"  // Show the cheapest listings first
};

// Scrape using returned promise
kijiji.search(params, options).then(ads => {
    // Use the ads array
    for (let i = 0; i < ads.length; ++i) {
        console.log(ads[i].title);
    }
}).catch(console.error);

// Scrape using optional callback parameter
function callback(err, ads) {
    if (!err) {
        // Use the ads array
        for (let i = 0; i < ads.length; ++i) {
            console.log(ads[i].title);
        }
    }
}
kijiji.search(params, options, callback);
```

---
### Scraper options
Functions that involve retrieving data from Kijiji (`Ad.Get()`, `Ad.scrape()`, and `search()`) take an optional parameter for scraper options. The options are as follows:

|Option        |Type    |Default|Description                                  |
|--------------|--------|-------|---------------------------------------------|
|`scraperType` |String  |`"api"`|How to scrape Kijiji. `"api"` to use the mobile API (default) and `"html"` to scrape the website. If you have trouble with one, try the other. It seems that the mobile API doesn't have a rate limit or lockout mechanism (_yet_; please don't abuse this).
