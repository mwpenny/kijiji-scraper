// index.js
/* Exports the kijiji-scraper modules */

module.exports.Ad = require("./lib/ad.js");
module.exports.search = require("./lib/search.js");
module.exports.locations = require("./lib/locations");
module.exports.categories = require("./lib/categories");

const apierr = require("./lib/deprecation");

/* Throw informative error messages to ease the transition to the new API */
module.exports.scrape = function() {
	throw new apierr("scrape()", "Ad.Get()");
};
module.exports.query = function() {
	throw new apierr("query()", "search()");
}
module.exports.parse = function(ad) {
	throw new apierr("parse()", "Ad.toString()");
}
