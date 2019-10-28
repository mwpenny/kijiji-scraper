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

**Quick start:** Use `Ad.Get()` to scrape an ad given its URL. Use `search()` to scrape many ads given a set of search parameters. Read on (or CTRL+F) for more detailed information.

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

The image URL given in `image` is the featured image for the ad and will be up to 300x300. The image URLs given in `images` are all of the images associated with the ad and each may be up to 1024x1024.

**Note:** If the ad has not been scraped automatically, some of these properties may be null or empty. This happens when an `Ad` object is created manually using the constructor or by performing a search with the `scrapeResultDetails` option set to `false`. See the `Ad.isScraped()` and `Ad.scrape()` method documentation below for more information on this.

#### Methods

##### `Ad.Get(url[, callback])`

Will scrape the Kijiji ad at `url` and construct an `Ad` object containing its information.

###### Arguments

* `url` - A Kijiji ad URL
* `callback(err, ad)` (optional) - A callback called after the ad has been scraped. If an error occurs during scraping, `err` will not be null. If everything is successful, `ad` will contain an `Ad` object

###### Return value

Returns a `Promise` which resolves to an `Ad` object containing the ad's information.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

// Scrape using returned promise
kijiji.Ad.Get("<Kijiji ad URL>").then(function(ad) {
    // Use the ad object
    console.log(ad.title);
}).catch(console.error);

// Scrape using optional callback paramater
kijiji.Ad.Get("<Kijiji ad URL>", function(err, ad) {
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

let ad = kijiji.Ad("<Kijiji ad URL>", { date: new Date() });
console.log(ad.isScraped()); // false
console.log(ad.date); // current date

ad.scrape().then(function() {
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

let ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false

ad.scrape().then(function() {
    console.log(ad.isScraped()); // true
}).catch(console.error);
```

##### `Ad.scrape([callback])`

Manually retrieves an `Ad`'s information from its URL. Useful if it was created in a way that does not do this automatically, such as using the constructor or performing a search with the `scrapeResultDetails` option set to false.

###### Arguments

* `callback(err)` (optional) - A callback called after the ad has been scraped. If an error occurs during scraping, `err` will not be null

###### Return value

Returns a `Promise` which resolves once the ad has been scraped and the object has been updated.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

let ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false

// Scrape using returned promise
ad.scrape().then(function() {
    // Use the ad object
    console.log(ad.isScraped()); // true
    console.log(ad.title);
}).catch(console.error);

// Scrape using optional callback paramater
ad.scrape(function(err) {
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

kijiji.Ad.Get("<Kijiji ad URL>").then(function(ad) {
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
        For convenience, objects containing all `locationId` and `categoryId` values Kijiji accepts have been defined in `locations.js` and `categories.js`, respectively. These objects are nested in the same way as those in the location and category selectors on the Kijiji website (e.g., the city of Montreal is located under "Quebec > Greater Montreal > City of Montreal"; coffee tables are located under "Buy and Sell > Furniture > Coffee Tables"), so their contents should be familiar.

        For example, instead of setting `locationId` to `1700281` (Montreal) and `categoryId` to `241` (coffee tables), you can set `locationId` to `locations.QUEBEC.GREATER_MONTREAL.CITY_OF_MONTREAL` and `categoryId` to `categories.BUY_AND_SELL.FURNITURE.COFFEE_TABLES`. You no longer need to know the ids, and you have a quick reference available. Any location/category object along the hierarchy will also work (e.g., `locations.QUEBEC` for all of Quebec, not just Montreal; `categories.BUY_AND_SELL.FURNITURE` for all furniture, not just coffee tables). Location/category objects and `locationId`s/`categoryId`s are interchangeable - the search function will behave identically in either case. See [locations.js](https://github.com/mwpenny/kijiji-scraper/blob/master/lib/locations.js) and [categories.js](https://github.com/mwpenny/kijiji-scraper/blob/master/lib/categories.js) for all location and category objects.

    * **Optional parameters:**
        There are many different search parameters. Some of these can be used in any search (i.e., `keywords`), but most are category-specific. For example, set `params["attributeMap[petsallowed_s]"] = "[1]"` to exclude pet-unfriendly landlords when searching for apartments.

        Parameters can be found by using your browser's developer tools on `https://www.kijiji.ca/b-search.html` and performing a custom search on the Kijiji website. After submitting your search on Kijiji or updating the filter being applied, use your browser's network monitoring tool to examine the request for `https://www.kijiji.ca/b-search.html`. You could also find some hidden info in the rendered HTML under the `<form>` tag with the search string `formSubmit`. Any parameter used in the query string for this request is able to be specified in `params`. A few examples include:

        |Parameter   |Type  |Description                                                                   |
        |------------|------|------------------------------------------------------------------------------|
        |`keywords`  |String|Search string, with words separated by a '+'                                  |
        |`minPrice`  |Number|Minimum price of returned items                                               |
        |`maxPrice`  |Number|Maximum price of returned items                                               |
        |`address`   |String|Postal code of the location to filter search (Use with double quotes)         |
        |`radius`    |Number|Maximum search radius (in kms) of returned items **Note: Avoid white or blank spaces as some parameters of search does not work well with spaces. Will be handled in the library with a fix soon (Issue # - TBD)** |
        |`adType`    |String|The Offer Types (Choices: `"OFFER"`, `"WANTED"` - Use with double quotes). By default, the Offer Type is any i.e. both Offering and Wanted Ads will be returned |
        |`hasImages` |Boolean|Return Ads with Images. Set it to `true`, to avoid returning Ads without Images as shown on Kijiji.ca |
        |`urgentOnly` |Boolean|Return Featured Ads only. Set it to `true`, to avoid returning All Ads as shown on Kijiji.ca. Default is All Ads |
        |`sortByName`|String|Search results ordering (e.g., `"dateDesc"`, `"dateAsc"`, `"priceDesc"`, `"priceAsc"`)|
        |`"attributeMap[furnished_s]"`|Object|Default is Any. Explicitly set it to `[1]` to return furnished listings when searching for apartments|
        |`"attributeMap[petsallowed_s]"`|Object|Default is Any. Explicitly set it to `[1]` to exclude pet-unfriendly landlords when searching for apartments|

* `options` (optional) - Contains parameters that control the behavior of the scraper. Can be omitted.

    |Option               |Type   |Default Value|Description|
    |---------------------|-------|-------------|-----------|
    |`scrapeResultDetails`|Boolean|`true`      |By default, the details of each query result are scraped in separate, subsequent requests. To suppress this behavior and return only the data retrieved by the initial query, set this option to `false`. Note that ads will lack some information if you do this and `Ad.isScraped()` will return `false` until `Ad.scrape()` is called to retrieve the missing information.|
    |`minResults`         |Integer|`20`         |Minimum number of ads to fetch (if available). Note that Kijiji results are returned in pages of up to 20 ads, so if you set this to something like 29, up to 40 results may be retrieved.|
    |`maxResults`         |Integer|`-1`         |Maximum number of ads to return. This simply removes excess results from the array that is returned (i.e., if `minResults` is 40 and `maxResults` is 7, 40 results will be fetched from Kijiji and the last 33 will be discarded). A negative value indicates no limit.|

* `callback(err, results)` (optional) - A callback called after the search results have been scraped. If an error occurs during scraping, `err` will not be null. If everything is successful, `results` will contain an array of `Ad` objects.

###### Return value

Returns a `Promise` which resolves to an array of search result `Ad` objects.

##### Example usage
```js
const kijiji = require("kijiji-scraper");

let options = {
    minResults: 40 // Use only multiples of 20 as Kijiji renders pages in units of 20 listings per page
};

let params = {
    locationId: 1700185,  // REQUIRED. Same as kijiji.locations.ONTARIO.OTTAWA_GATINEAU_AREA.OTTAWA
    categoryId: 27,  // REQUIRED. Same as kijiji.categories.CARS_AND_VEHICLES
    sortByName: "priceAsc",  // OPTIONAL. Show the cheapest listings first. Default is "dateDesc" i.e. Latest Ads First.
    maxPrice: 750, // OPTIONAL. Max price is $750 in this example
    address: "M5R1M3", // OPTIONAL. Postal code (Use without whitespaces)
    radius: 10, // OPTIONAL. Max distance from address to consider as filter while retrieving ads    
    adType: "OFFER", // OPTIONAL. Offer Type as provided on Kijiji.ca (Choices are: OFFER and WANTED). By default, it is any i.e. both OFFER and WANTED    
    hasImages: true, // OPTIONAL. Set it to 1 to avoid returning Ads without Images as shown on Kijiji.ca
    "attributeMap[furnished_s]": "[1]", // OPTIONAL. Used when looking for apartments. By default, it is any i.e. No preference.
    "attributeMap[petsallowed_s]": "[1]", // OPTIONAL. Used when looking for apartments. By default, it is any i.e. No preference.
    urgentOnly: true // OPTIONAL. Used to request featured or paid listings only. By default, it is All Ads.
};

// Scrape using returned promise
kijiji.search(params, options).then(function(ads) {
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
