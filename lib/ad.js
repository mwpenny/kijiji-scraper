// ad.js
/* Kijiji ad object definition */

const scraper = require("./scraper");

/* Nicely formats a date string */
function DateToString(date) {
    let m = ("0" + (date.getMonth()+1)).slice(-2);
    let d = ("0" + date.getDate()).slice(-2);
    let y = date.getFullYear();
    let hrs = ("0" + date.getHours()).slice(-2);
    let mins = ("0" + date.getMinutes()).slice(-2);
    return `${m}/${d}/${y} @ ${hrs}:${mins}`;
}

class KijijiAd {
    constructor(url, info={}, scraped=false) {
        let adScraped = scraped;
        let defaults = {
            "title": "",
            "description": "",
            "date": new Date(NaN),
            "image": "",
            "images": [],
            "attributes": {},
            "url": url
        };

        /* Overwrites default ad properties */
        let overwriteProps = (info) => {
            for (let prop in info) {
                if (defaults.hasOwnProperty(prop)) {
                    this[prop] = info[prop];
                }
            }
        }

        // Copy ad defaults to this object, then overwrite with passed info
        overwriteProps(defaults);
        overwriteProps(info);

        /* Pulls the ad's information from Kijiji */
        this.scrape = function(callback) {
            let promise = scraper(url).then(function(newInfo) {
                overwriteProps(newInfo);
                adScraped = true;
            });

            if (callback)
                promise.then(() => callback(null), callback);
            return promise;
        };

        /* Returns whether or not the ad's information has been fetched from Kijiji.
           The ad object may contain information but not be scraped if it was created
           as a query search result, for example */
        this.isScraped = () => adScraped;
    }

    /* Returns a string representation of the ad */
    toString() {
        // Ad may be unscraped and missing some information
        let str = "";
        if (this.date instanceof Date && !Number.isNaN(this.date.getTime()))
            str += `[${DateToString(this.date)}] `;
        if (this.title)
            str += this.title + "\r\n";
        str += this.url + "\r\n";

        let attributeNames = Object.keys(this.attributes);
        for (let i = 0; i < attributeNames.length; ++i) {
            let attr = attributeNames[i];
            let val = this.attributes[attr];
            if (attr == "location" && val.mapAddress !== undefined)
                val = val.mapAddress;
            str += `* ${attr}: ${val}\r\n`;
        }
        return str;
    }

    /* Creates a KijijiAd object by scraping the passed ad URL */
    static Get(url, callback) {
        let promise = scraper(url).then(function(info) {
            return new KijijiAd(url, info, true);
        });

        if (callback)
            promise.then((ad) => callback(null, ad), callback);
        return promise;
    }
}

module.exports = KijijiAd;
