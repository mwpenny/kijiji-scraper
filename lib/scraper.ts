// ad-scraper.ts
/* Scrapes a Kijiji ad and returns its information */

import fetch from "node-fetch";
import cheerio from "cheerio";

const IMG_REGEX = /\/\$_\d+\.(?:JPG|PNG)$/;

/**
 * Information about an ad from Kijiji
 */
export class AdInfo {
    /**
     * Title of the ad
     */
    title: string = "";

    /**
     * Description of the ad
     */
    description: string = "";

    /**
     * Date the ad was posted
     */
    date: Date = new Date(NaN);

    /**
     * URL of the ad's primary (featured) image
     */
    image: string = "";

    /**
     * URLs of all images associated with the ad
     */
    images: string[] = [];

    /**
     * Properties specific to the category of the scraped ad
     */
    attributes: { [attributeName: string]: any } = {};

    /**
     * The ad's URL
     */
    url: string = "";
}

function cleanDesc(text: string): string {
    // Some descriptions contain HTML. Remove it so it is only text
    let $ = cheerio.load(text);
    $("label").remove();  // Remove kit-ref-id label
    return $.root().text().trim();
}

function castVal(val: string): boolean | number | Date | string {
    // Kijiji only returns strings. Convert to appropriate types
    if (val === "true") {
        return true;
    } else if (val === "false") {
        return false;
    } else if (!Number.isNaN(Number(val)) && Number.isFinite(Number(val))) {
        return Number(val);
    } else if (!isNaN(Date.parse(val))) {
        return new Date(val);
    } else {
        return val;
    }
}

/* Parses the HTML of a Kijiji ad for its important information */
function parseHTML(html: string): AdInfo | null {
    const info = new AdInfo();

    // Kijiji is nice and gives us an object containing ad info
    const $ = cheerio.load(html);
    let adData: any = {};
    let json = $("#FesLoader > script").text().replace("window.__data=", "");
    json = json.substring(0, json.length - 1);  // Remove trailing semicolon

    if (json.length === 0 || Object.keys(adData = JSON.parse(json)).length === 0 ||
        !adData.hasOwnProperty("config") || !adData.config.hasOwnProperty("adInfo") ||
        !adData.config.hasOwnProperty("VIP")) {
        return null;
    }

    adData = adData.config;
    info.title = adData.adInfo.title;
    info.description = cleanDesc(adData.VIP.description || "");
    info.date = new Date(adData.VIP.sortingDate);

    /* Kijiji/eBay image URLs typically end with "$_dd.JPG", where "dd" is a
       number between 0 and 140 indicating the desired image size and
       quality. "57" is up to 1024x1024, the largest I've found. */
    info.image = (adData.adInfo.sharingImageUrl || "").replace(IMG_REGEX, "/$_57.JPG");

    (adData.VIP.media || []).forEach((m: any) => {
        if (m.type === "image" && m.href && typeof m.href === "string") {
            info.images.push(m.href.replace(IMG_REGEX, "/$_57.JPG"));
        }
    });
    (adData.VIP.adAttributes || []).forEach((a: any) => {
        if (typeof a.machineKey === "string" && typeof a.machineValue === "string") {
            info.attributes[a.machineKey] = castVal(a.machineValue);
        }
    });

    // Add other attributes of interest
    // TODO: This VIP object contains much more. Worth a closer look.
    if (adData.VIP.price && typeof adData.VIP.price.amount === "number") {
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
export default function scrape(url: string): Promise<AdInfo> {
    if (!url) {
        throw new Error("URL must be specified");
    }

    return fetch(url)
            .then(res => res.text())
            .then(body => {
                const adInfo = parseHTML(body);
                if (!adInfo)
                    throw new Error(`Ad not found or invalid Kijiji HTML at ${url}`);
                adInfo.url = url;
                return adInfo
            });
}