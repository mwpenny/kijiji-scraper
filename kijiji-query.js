//kijiji-query.js
/*Searches Kijiji for recend ads matching given criteria*/

var request = require("request");
var cheerio = require("cheerio");
var scraper = require("./ad-scraper.js");

/*Scrapes a Kijiji ad's link*/
var scrapeAdLink = function(rssAd, callback) {
    scraper(rssAd.link, function(err, ad) {
        if (!err) rssAd.innerAd = ad;
        callback(err);
    });
};

/*Scrapes each passed ad's link to get more information about it*/
var scrapeAdLinks = function(ads, callback) {
    var scraped = 0;

    if (ads.length === 0) return callback(null, ads);

    //Scrape each ad
    for (var i=0; i < ads.length; i++) {
        scrapeAdLink(ads[i], function(err) {
            if (err) return callback(err, null);

            //Call callback once everything is scraped
            if (++scraped === ads.length) {
                return callback(null, ads);
            }
        });
    }
};

/*Parses the XML of a Kijiji RSS feed for ads*/
var parseXML = function(xml) {
    var ads = [];
    var $ = cheerio.load(xml, {xmlMode: true});

    //Get info for each ad
    $("item").each(function(i,item) {
        var ad = {};
        $(item).children().each(function(i, child) {
            ad[child.name] = $(child).text();
        });

        ad.innerAd = {};
        ads.push(ad);
    });

    return ads;
}

/*Searches recent Kijiji ads using passed criteria*/
var query = function(prefs, params, callback) {
    var url = "http://www.kijiji.ca/rss-srp/c" + prefs.categoryId +
              "l" + prefs.locationId;

    //Search Kijiji
    request({"url": url, "qs": params}, function(err, res, body) {
        if (err) return callback(err, null);

        var ads = parseXML(body);
        if (prefs.scrapeInnerAd !== false) {
            scrapeAdLinks(ads, callback);
        } else {
            callback(null, ads);
        }
    });
}

module.exports = query;
