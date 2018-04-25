# kijiji-scraper
A lightweight node.js module for retrieving and scraping ads from [Kijiji](http://www.kijiji.ca).


## Features
* Retrieve single ads as JavaScript objects given their URL
* Retrieve the latest ads matching given search criteria

## Dependencies
* [node.js](http://github.com/joyent/node) - evented I/O for the backend
* [cheerio](http://www.github.com/cheeriojs/cheerio) - jQuery-like API for the server
* [request](http://github.com/request/request) - Simplified HTTP request client

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

**Note:** If the ad has not been scraped automatically, some of these properties may be null or empty. This happens when an `Ad` object is created manually using the constructor or by performing a search with the `scrapeResultDetails` option set to false. See the `Ad.isScraped()` and `Ad.scrape()` methods below for more information on this.

#### Methods

##### `Ad.Get(url, callback)`

Will scrape the Kijiji ad at `url` and call `callback` with an object containing its information.

###### Arguments
* `url` - A Kijiji ad URL.
* `callback(err, ad)` - A callback called after the ad has been scraped. If there is an error, `err` will not be null. If everything was successful, `ad` will contain an `Ad` object.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

kijiji.Ad.Get("<Kijiji ad URL>", function(err, ad) {
    if (!err) {
        // Use the ad object
        console.log(ad.title);
    }
});
```

##### `Ad.Ad(url, info)`

`Ad` constructor. Manually constructs an ad object. You should generally not need to use this save for a few special cases (e.g., storing ad URLs entered by a user for delayed scraping). `Ad.isScraped()` returns false for `Ad` objects constructed in this way until they are scraped by calling `Ad.scrape()`, which causes the scraper to replace the ad's information with what is found at its URL.

###### Arguments
* `url` - Ad's url.
* `info` (optional) - Object containing the ad's properties. Only keys in the properties table (above) may be specified. May be omitted (if not specified then `images` will be the empty array, `attributes` will be an empty object, and all other properties will be null).

###### Example usage
```js
const kijiji = require("kijiji-scraper");

let ad = kijiji.Ad("<Kijiji ad URL>", { date: new Date() });
console.log(ad.isScraped()); // false
console.log(ad.date); // current date

ad.scrape(function(err) {
    if (!err) {
        // Use the ad object
        console.log(ad.date); // date ad was posted
    }
});
```

##### `Ad.isScraped()`

Returns a boolean indicating whether or not an ad's information has been scraped from the page at its URL. This can be false if the `Ad` object was manually created using the constructor or if it was retrieved from a search with the `scrapeResultDetails` option set to false. Call `Ad.scrape()` to retrieve the information for such ads.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

let ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false
```

##### `Ad.scrape(callback)`

Manually retrieves an `Ad`'s information from its URL. Useful if it was created in a way that does not do this automatically, such as using the constructor or performing a search with the `scrapeResultDetails` option set to false.

* `callback(err)` - A callback called after the ad has been scraped. If there is an error, `err` will not be null.

###### Example usage
```js
const kijiji = require("kijiji-scraper");

let ad = kijiji.Ad("<Kijiji ad URL>");  // ad does not get scraped
console.log(ad.isScraped()); // false

ad.scrape(function(err) {
    if (!err) {
        // Use the ad object
        console.log(ad.isScraped()); // true
        console.log(ad.title);
    }
});
```

##### `Ad.toString()`

Returns a string representation of the ad. This is just meant to be a summary and may omit information for brevity or change in the future. Access the `Ad`'s properties directly if you need them for comparisons, etc. The format is as follows:
```
[mm/dd/yyyy @ hh:mm] TITLE
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

let ad = kijiji.Ad.Get("<Kijiji ad URL>", function(err, ad) {
    if (!err) {
        console.log(ad.toString());
    }
});
```

---
### Searching for ads

Searches can be performed by using the `search()` function:

#### search(params, callback, options)

##### Arguments
* `params` - Object containing Kijiji ad search parameters.
    * **Mandatory parameters:**

        |Parameter   |Type          |Default Value       |Description                                                     |
        |------------|--------------|--------------------|----------------------------------------------------------------|
        |`locationId`|Integer/Object|`0` (all of Canada) |Id of the geographical location to search                       |
        |`categoryId`|Integer/Object|`0` (all categories)|Id of the ad category to search                                 |

        Values for `locationId` and `categoryId` can be found by performing a search on the Kijiji website and examining the URL that Kijiji redirects to. For example, after setting the location to Ottawa and selecting the "cars & vehicles" category, Kijiji redirects to http://www.kijiji.ca/b-cars-vehicles/ottawa/c27l1700185. The last part of the URL (c27l1700185) is formatted as c[categoryId]l[locationId]. So in this case, `categoryId` is 27 and `locationId` is 1700185.

        ###### Location and category objects
        For convenience, objects containing all `locationId` and `categoryId` values Kijiji accepts have been defined in `locations.js` and `categories.js`, respectively. These objects are nested in the same way as those in the location and category selectors on the Kijiji website (e.g., the city of Montreal is located under "Quebec > Greater Montreal > City of Montreal"; coffee tables are located under "Buy and Sell > Furniture > Coffee Tables"), so their contents should be familiar.

        For example, instead of setting `locationId` to `1700281` (Montreal) and `categoryId` to `241` (coffee tables), you can set `locationId` to `locations.QUEBEC.GREATER_MONTREAL.CITY_OF_MONTREAL` and `categoryId` to `categories.BUY_AND_SELL.FURNITURE.COFFEE_TABLES`. You no longer need to know the ids, and you have a quick reference available. Any location/category object along the hierarchy will also work (e.g., `locations.QUEBEC` for all of Quebec, not just Montreal; `categories.BUY_AND_SELL.FURNITURE` for all furniture, not just coffee tables). Location/category objects and locationIds/categoryIds are interchangeable - the search function will behave identically in either case. See `locations.js` and `categories.js` for all location and category objects.

    * **Optional parameters:**
        Some of these can be used in any search (i.e., `keywords`), but most are category-specific. For example, set `params["attributeMap[petsallowed_s]"] = "[1]"` to exclude pet-unfriendly landlords when searching for apartments.

        There are many different search parameters, most of which vary by category type. They can be found by using your browser's developer tools and performing a custom search on the Kijiji website. After submitting your search on Kijiji or updating the filter being applied, use your browser's network monitoring capabilities to examine the request for `b-search.html`. The parameters used in the query string for this request are able to be specified in `params`. A few examples include:

        |Parameter   |Type  |Description                                                                   |
        |------------|------|------------------------------------------------------------------------------|
        |`keywords`  |String|Search string, with words separated by a '+'                                  |
        |`minPrice`  |Number|Minimum price of returned items                                               |
        |`maxPrice`  |Number|Maximum price of returned items                                               |
        |`sortByName`|String|Search results ordering (e.g., "dateDesc", "dateAsc", "priceDesc", "priceAsc")|

* `callback(err, results)` - A callback called after the search results have been scraped. If there is an error, `err` will not be null. If everything was successful, `results` will contain an array of `Ad` objects.

* `options` (optional) - Contains parameters that control the behavior of the scraper. Can be omitted.

    |Option               |Type   |Default Value|Description|
    |---------------------|-------|-------------|-----------|
    |`scrapeResultDetails`|Boolean|`true`      |By default, the details of each query result are scraped in separate, subsequent requests. To suppress this behavior and return only the data retrieved by the initial query, set this option to `false`. Note that ads will lack some information if you do this.|
    |`minResults`         |Integer|`20`         |Minimum number of ads to fetch (if available). Note that Kijiji results are returned in pages of up to 20 ads, so if you set this to something like 29, up to 40 results may be retrieved.|
    |`maxResults`         |Integer|`-1`         |Maximum number of ads to return via the callback function. This simply removes excess results from the array that is returnd (i.e., if `minResults` is 40 and `maxResults` is 7, 40 results will be fetched from Kijiji and the last 33 will be discarded). A value of -1 indicates no limit.|

##### Example usage
```js
const kijiji = require("kijiji-scraper");

let options = {
    minResults: 40
};

let params = {
    locationId: 1700185,  // Same as kijiji.locations.ONTARIO.OTTAWA_GATINEAU_AREA.OTTAWA
    categoryId: 27,  // Same as kijiji.categories.CARS_AND_VEHICLES
};

function callback(err, ads) {
    if (!err) {
        // Use the ads array
        for (let i = 0; i < ads.length; ++i) {
            console.log(ads[i].title);
        }
    }
}

kijiji.search(params, callback, options);
```
