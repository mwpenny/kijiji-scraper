// html-scraper.ts
/* Scrapes a Kijiji ad using the public-facing website */

import fetch from "node-fetch";
import cheerio from "cheerio";

import { BANNED, HTML_REQUEST_HEADERS } from "../constants";
import { cleanAdDescription, getLargeImageURL, isNumber } from "../helpers";
import { AdInfo } from "../scraper";

function castAttributeValue(attr: any): boolean | number | Date | string | undefined {
    let value = attr.machineValue;
    if (typeof value !== "string") {
        return undefined;
    }

    value = value.trim();
    const localizedValue = (attr.localeSpecificValues?.en?.value || "").toLowerCase();

    // Kijiji only returns strings. Convert to appropriate types
    if (value.toLowerCase() === "true") {
        return true;
    } else if (value.toLowerCase() === "false") {
        return false;
    } else if (isNumber(value)) {
        // Numeric values are sometimes inaccurate. For example, numberbathrooms
        // is multipled by 10. Prefer localized version if it is also a number.
        if (isNumber(localizedValue)) {
            return Number(localizedValue);
        }
        return Number(value);
    } else if (!isNaN(Date.parse(value))) {
        return new Date(value);
    } else {
        return value;
    }
}

/* Parses the HTML of a Kijiji ad for its important information */
function parseResponseHTML(html: string): AdInfo | null {
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

    const adId = adData.VIP.adId;
    const adTitle = adData.adInfo.title;
    const adDateMs = adData.VIP.sortingDate;

    // We can reasonably expect these to be present
    if (adId === undefined || adTitle === undefined || adDateMs === undefined) {
        return null;
    }

    info.id = adId.toString();
    info.title = adTitle;
    info.description = cleanAdDescription(adData.VIP.description || "");
    info.date = new Date(adDateMs);
    info.image = getLargeImageURL(adData.adInfo.sharingImageUrl || "");

    (adData.VIP.media || []).forEach((m: any) => {
        if (m.type === "image" && m.href && typeof m.href === "string") {
            info.images.push(getLargeImageURL(m.href));
        }
    });
    (adData.VIP.adAttributes || []).forEach((a: any) => {
        const name = a.machineKey;
        const value = castAttributeValue(a);
        if (typeof name === "string" && value !== undefined) {
            info.attributes[name] = value;
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

/* Scrapes the page at the passed Kijiji ad URL */
export function scrapeHTML(url: string): Promise<AdInfo | null> {
    return fetch(url, { headers: HTML_REQUEST_HEADERS })
            .then(res => {
                if (res.status === 403) {
                    throw new Error(BANNED);
                }
                return res.text();
            })
            .then(body => {
                return parseResponseHTML(body);
            });
}