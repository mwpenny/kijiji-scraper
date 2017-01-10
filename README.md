# kijiji-scraper
A lightweight node.js module for retrieving and scraping ads from [Kijiji](http://www.kijiji.ca).


### Features
* Retrieve single ads as JSON objects given their URL
* Retrieve the 20 latest ads matching given search criteria

### Dependencies
* [node.js](http://github.com/joyent/node) - evented I/O for the backend
* [cheerio](http://www.github.com/cheeriojs/cheerio) - jQuery-like API for the server
* [request](http://github.com/request/request) - Simple HTTP request client

### Installation
`npm install kijiji-scraper`

### Documentation

#### scrape(url, callback)
Will call `callback` with an object representing the ad at `url`.
##### Arguments
* `url` - A Kijiji ad URL.
* `callback(err, ad)` - A callback called after the ad has been scraped. If there is an error, `err` will not be null. If everything was successful, `ad` will contain the ad's properties. The `ad` object is of the form
```js
{
    "title": "ad title",
    "image": "ad image URL",
    "desc": "ad description"
    "info": [<category-specific keys and values>]
}
```

##### Example usage
```js
var kijiji = require("kijiji-scraper");

kijiji.scrape("<Kijiji ad URL>", function(err, ad) {
    //Use the ad object
});
```
---
#### query(prefs, params, callback)
Will call `callback` with an array of detailed ad objects.
##### Arguments
* `prefs` - Contains Kijiji ad search category and location:
```js
{
    "locationId": <Kijiji location id>,
    "categoryId": <Kijiji ad category id>,
    "scrapeInnerAd": true/false (default true)
}
```

Values for `locationId` and `categoryId` can be found by performing a search and looking at the POST request parameters or the URL Kijiji redirects to. For example, after setting the location to Ottawa and selecting the "cars & vehicles" category, Kijiji redirects to http://www.kijiji.ca/b-cars-vehicles/ottawa/c27l1700185. The last part of the URL (c27l1700185) is formatted as c[categoryId]l[locationId]. So in this case, `categoryId` is 27 and `locationId` is 1700185.

By default, the details of each query result are scraped in separate, subsequent requests. To suppress this behavior and return only the data retrieved by the initial query, set the `scrapeInnerAd` preference to `false`.

* `params` - Contains Kijiji ad search criteria:
```js
{
    "minPrice": 0,
    "maxPrice": 100,
    "keywords": "keyword string with words separated by a '+'",
    "adType": "OFFER"
}
```

There are many different search parameters, most of which vary by category type. They can be found by using your browser's developer tools and performing a custom search on Kijiji.

* `callback(err, ads)` - A callback called after Kijiji has been searched. If there is an error, `err` will not be null. If everything was successful, `ads` will contain detailed ad objects. These are different from the ad objects returned by `scrape()`, since this function uses Kijiji's RSS functionality. They contain a key/value mapping for every field inside an ad's `<item>` tag in the RSS feed plus an `innerAd` property. This property will contain an object identical to the ad object returned by `scrape()` unless `scrapeInnerAd` was given as `false`, in which case the property will contain an empty object. These more detailed ads are of the form
```js
{
    "title": "ad title",
    "link": "ad URL",
    "description": "ad description",
    "pubDate": "date ad was published",
    "guid": "ad URL",
    "dc:date": "date ad was published",
    "innerAd": [regular ad object]
}
```

##### Example usage
```js
var kijiji = require("kijiji-scraper");

kijiji.query(prefs, params, function(err, ads) {
    //Use the ads array
});
```
---
#### parse(ad)
Will return a string representation of an ad object.
##### Arguments
* `ad` - Either an ad object returned by `scrape()` or a detailed ad object from the array returned by `query()`.

##### Example usage
```js
var kijiji = require("kijiji-scraper");

kijiji.scrape("<Kijiji ad URL>", function(err, ad) {
    console.log(kijiji.parse(ad)); //Converts ad to string
});
```
