// ad-scraper.js
/* Scrapes a Kijiji ad and returns its information */

const fetch = require("node-fetch");
const cheerio = require("cheerio");

const IMG_REGEX = /\/\$_\d+\.(?:JPG|PNG)$/;

function cleanDesc(text) {
    // Some descriptions contain HTML. Remove it so it is only text
    let $ = cheerio.load(text);
    $("label").remove();  // Remove kit-ref-id label
    return $.root().text().trim();
}

function castVal(val) {
    // Kijiji only returns strings. Convert to appropriate types */
    if (val === "true")
        return true;
    else if (val === "false")
        return false;
    else if (!Number.isNaN(Number(val)) && Number.isFinite(Number(val)))
        return Number(val);
    else if (!isNaN(Date.parse(val)))
        return new Date(val);
    else
        return val;
}

/* Parses the HTML of a Kijiji ad for its important information */
function parseHTML(html) {
    let info = {
        "title": "",
        "image": "",
        "date": null,
        "images": [],
        "description": "",
        "attributes": {}
    };

    // Kijiji is nice and gives us an object containing ad info
    let $ = cheerio.load(html);
    let adData = {};
    let json = $("#FesLoader > script").text().replace("window.__data=", "");
    json = json.substring(0, json.length - 1);  // Remove trailing semicolon

    if (json.length == 0 || (adData = JSON.parse(json)) == {} ||
        !adData.hasOwnProperty("config") || !adData.config.hasOwnProperty("adInfo") ||
        !adData.config.hasOwnProperty("VIP")) {
        return null;
    }

    adData = adData.config;
    info.title = adData.adInfo.title;
    info.description = cleanDesc(adData.VIP.description);
    info.date = new Date(adData.VIP.sortingDate);

    /* Kijiji/eBay image URLs typically end with "$_dd.JPG", where "dd" is a
       number between 0 and 140 indicating the desired image size and
       quality. "57" is up to 1024x1024, the largest I've found. */
    info.image = (adData.adInfo.sharingImageUrl || "").replace(IMG_REGEX, "/$_57.JPG");

    adData.VIP.media.forEach(function(m) {
        if (m.type == "image") {
            info.images.push(m.href.replace(IMG_REGEX, "/$_57.JPG"));
        }
    });
    adData.VIP.adAttributes.forEach(function(a) {
        info.attributes[a.machineKey] = castVal(a.machineValue);
    });

    // Add other attributes of interest
    // TODO: This VIP object contains much more. Worth a closer look.
    if (adData.VIP.price) {
        info.attributes["price"] = adData.VIP.price.amount/100.0;
    }
    if (adData.VIP.adLocation) {
        info.attributes["location"] = adData.VIP.adLocation;
    }
    if (adData.VIP.adType) {
        info.attributes["type"] = adData.VIP.adType;
    }
    if (adData.VIP.visitCounter) {
        info.attributes["visits"] = adData.VIP.visitCounter;
    }
    return info;
}

/* Scrapes the passed Kijiji ad URL */
function scrape(url) {
    return new Promise(function(resolve, reject) {
        if (!url) {
            return reject(new Error("URL must be specified"));
        }

        fetch(url)
            .then(res => res.text())
            .then(function(body) {
                let adInfo = parseHTML(body);
                if (!adInfo)
                    return reject(new Error(`Ad not found or invalid Kijiji HTML at ${url}`));
                adInfo.url = url;
                resolve(adInfo);
            }).catch(reject);
    });
}

module.exports = scrape;
