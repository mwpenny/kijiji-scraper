# kijiji-parser
A lightweight node.js module for retrieving and scraping ads from [Kijiji](http://www.kijiji.ca).


### Features
* Retrieve single ads as JSON objects given their URL
* Retrieve the 20 latest ads matching given search criteria

### Dependencies
* [node.js](http://github.com/joyent/node) - evented I/O for the backend
* [cheerio](http://www.github.com/cheeriojs/cheerio) - jQuery-like API for the server
* [request](http://github.com/request/request) - Simple HTTP reqsest client

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
    "categoryId": <Kijiji ad category id>
}
```
* `params` - Contains Kijiji ad search criteria:
```js
{
    "minPrice": 0,
    "maxPrice": 100,
    "keywords": "keyword string with words separated by a '+'",
    "adType": "OFFER"
}
```
 
 There are many different search parameters, most of which vary by category type. You can find them by using your browser's developer tools and performing a custom search on Kijiji.
* `callback(err, ads)` - A callback called after Kijiji has been searched. If there is an error, `err` will not be null. If everything was successful, `ads` will contain detailed ad objects. These are different from the ad objects returned by `scrape()`, since this function uses Kijiji's RSS functionality. They contain a key/value mapping for every field iniside an ad's `<item>` tag in the RSS feed, as well as an `innerAd` object, which is identical to the ad object returned by `scrape()`. These more detailed ads are of the form
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
