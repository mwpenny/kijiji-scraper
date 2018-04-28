// ad.js
/* Kijiji ad object definition */

const scraper = require("./scraper");
const apierr = require("./deprecation")

/* Nicely formats a date string */
function DateToString(date) {
    let m = ("0" + (date.getMonth()+1)).slice(-2);
    let d = ("0" + date.getDate()).slice(-2);
    let y = date.getFullYear();
    let hrs = ("0" + date.getHours()).slice(-2);
    let mins = ("0" + date.getMinutes()).slice(-2);
    return m + "/" + d + "/" + y + " @ " + hrs + ":" + mins;
}

function freeze(obj) {
    // Recursively freezes an object
    Object.getOwnPropertyNames(obj).forEach(function(name) {
        let prop = obj[name];
        if (prop !== null && typeof prop === "object")
            freeze(prop);
    });
    Object.freeze(obj);
};

class KijijiAd {
	constructor(url, info={}) {
		let adScraped = false;
		let defaults = {
			"title": null,
			"description": null,
			"date": null,
			"image": null,
			"images": [],
			"attributes": {},
			"url": url
		};

		/* Throw informative error messages to ease the transition to the new API */
		Object.defineProperty(this, "desc", {
			get: function() {
				throw new apierr("Ad.desc", "Ad.description");
			}
		});
		Object.defineProperty(this, "info", {
			get: function() {
				throw new apierr("Ad.info", "Ad.attributes");
			}
		});

        /* Overwrites default ad properties */
        let thisAd = this;
        function overwriteProps(info) {
            for (let prop in info) {
                if (defaults.hasOwnProperty(prop)) {
                    thisAd[prop] = info[prop];
                }
            }
        }

		// Copy ad defaults to this object, then overwrite with passed info
        overwriteProps(defaults);
        overwriteProps(info);

		/* Pulls the ad's information from Kijiji */
		this.scrape = function(callback) {
			scraper(url, function(err, newInfo) {
				if (!err) {
                    overwriteProps(newInfo);
					adScraped = true;
				}
				return callback(err);
			});
		};

		/* Returns whether or not the ad's information has been fetched from Kijiji.
		   The ad object may contain information but not be scraped if it was created
		   as a query search result, for example */
		this.isScraped = function() { return adScraped };
	}

	/* Returns a string representation of the ad */
	toString() {
		// Ad may be unscraped and missing some information
		let str = "";
		if (this.date instanceof Date)
			str += "[" + DateToString(this.date) + "] ";
		if (this.title)
			str += this.title + "\r\n";
		str += this.url + "\r\n";

        let attributeNames = Object.keys(this.attributes);
        for (let i = 0; i < attributeNames.length; ++i) {
            let attr = attributeNames[i];
            let val = this.attributes[attr];
            if (attr == "location")
                val = val.mapAddress;
            str += "* " + attr + ": " + val + "\r\n";
        }
        return str;
    }

	/* Creates a KijijiAd object by scraping the passed ad URL */
	static Get(url, callback) {
		scraper(url, function(err, info) {
			let ad = null;
			if (!err) {
				ad = new KijijiAd(url, info, true);
			}
			return callback(err, ad);
		});
	}
}

module.exports = KijijiAd;