// ad-scraper.js
/* Scrapes a Kijiji ad and returns its information */

var request = require("request");
var cheerio = require("cheerio");

var IMG_REGEX = /\/\$_\d+\.JPG$/;

function cleanDesc(text) {
    // Some descriptions contain HTML. Remove it so it is only text
    $ = cheerio.load(text);
    $("label").remove();  // Remove kit-ref-id label
    return $.root().text().trim();
}

/* Parses the HTML of a Kijiji ad for its important information.
   Kijiji has changed their layout, but only for some ads. We will
   hope for the new, nicer format and fall back to the old */
function parseHTML(html) {
    var ad = {
        "title": undefined,
        "image": undefined,
        "images": [],
        "info": {},
        "desc": ""
    };

    // Kijiji is nice and gives us JS with some ad info
    var $ = cheerio.load(html);
    var adData = {};
    var json = $("#FesLoader > script").text().replace("window.__data=", "");
    json = json.substring(0, json.length - 1);  // Remove trailing semicolon

    if (json.length == 0 || (adData = JSON.parse(json)) == {} ||
        !adData.hasOwnProperty("config") || !adData.config.hasOwnProperty("adInfo")) {
        return ad;
    }
    adData = adData.config;
    ad.title = adData.adInfo.title;
    ad.image = adData.adInfo.sharingImageUrl

    if (adData && adData.hasOwnProperty("VIP")) {
        // New format is *really* nice and gives us all we could ask for (and more)
        ad.desc = cleanDesc(adData.VIP.description);
        adData.VIP.media.forEach(function(m) {
            if (m.type == "image") {
                ad.images.push(m.href.replace(IMG_REGEX, '/$_57.JPG'));
            }
        });
        adData.VIP.adAttributes.forEach(function(a) {
            var attr = a.localeSpecificValues.en;
            ad.info[attr.label] = a.machineValue;
        });

        // Other attributes of interest (I'm attempting to match the old output)
        // TODO: This VIP object contains much more. Worth a closer look.
        if (adData.VIP.sortingDate)
            ad.info['Date Listed'] = new Date(adData.VIP.sortingDate);
        if (adData.VIP.price)
            ad.info['Price'] = "$" + (adData.VIP.price.amount/100.0).toFixed(2);
        if (adData.VIP.adLocation) {
            ad.info['Address'] = adData.VIP.adLocation.mapAddress;
            ad.info['Latitude'] = adData.VIP.adLocation.latitude;
            ad.info['Longitude'] = adData.VIP.adLocation.longitude;
        }
        if (adData.VIP.adType)
            ad.info['Type'] = adData.VIP.adType;
        if (adData.VIP.visitCounter)
            ad.info['Visits'] = adData.VIP.visitCounter;
    } else {
        // Old format isn't so nice, so we still have to scrape some things from the HTML
        ad.desc = $("span[itemprop=description]").text().trim().replace("\r", "\n\n");
        ad.images = $("img[itemprop=image]").map(function (_, img) {
            /* Kijiji/eBay image URLs typically end with "$_dd.JPG", where "dd" is a
               number between 0 and 140 indicating the desired image size and
               quality. "57" is up to 1024x1024, the largest I've found. */
            return $(img).attr("src").replace(IMG_REGEX, '/$_57.JPG');
        }).get();

        // Remove link to map and dividers from info table
        $("#MapLink").remove();
        $(".divider").remove();

        // Get ad properties from info table
        $("table.ad-attributes tr").each(function(i, tr) {
            var field = $(tr).find("th").text().trim();
            var value = $(tr).find("td").text().trim();
            if (field == "Date Listed")
                value = new Date(value);
            ad.info[field] = value;
        });
    }
    return ad;
}

/* Scrapes the passed Kijiji ad URL */
function scrape(url, callback) {
    if (url === undefined)
	    return callback(new Error("URL must not be undefined"));

    request(url, function(err, res, body) {
        if (err) return callback(err, null);
        callback(null, parseHTML(body));
    });
}

module.exports = scrape;
