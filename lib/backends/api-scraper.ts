// api-scraper.ts
/* Scrapes a Kijiji ad using the mobile API */

import fetch from "node-fetch";
import cheerio from "cheerio";

import { API_REQUEST_HEADERS, BANNED } from "../constants";
import { cleanAdDescription, getLargeImageURL, isNumber } from "../helpers";
import { AdInfo } from "../scraper";

const AD_ID_REGEX = /\/(\d+)$/;
const API_ADS_ENDPOINT = "https://mingle.kijiji.ca/api/ads";

function castAttributeValue(item: cheerio.Element, value: string): boolean | number | Date | string {
    // Kijiji only returns strings for attributes. Convert to appropriate types
    const type = (item.attribs.type || "").toLowerCase();
    const localizedLabel = (item.attribs["localized-label"] || "").toLowerCase();
    value = value.trim();

    if (localizedLabel === "yes") {
        return true;
    } else if (localizedLabel === "no") {
        return false;
    } else if (isNumber(value)) {
        return Number(value);
    } else if (type === "date") {
        return new Date(value);
    }
    return value;
}

/* Parses the XML of a Kijiji ad for its important information */
function parseResponseXML(xml: string): AdInfo | null {
    const $ = cheerio.load(xml);
    const adElement = $("ad\\:ad").get();

    if (adElement.length !== 1) {
        return null;
    }
    return scrapeAdElement(adElement[0]);
}

export function scrapeAdElement(elem: cheerio.Element): AdInfo | null {
    const info = new AdInfo();

    const $ = cheerio.load(elem);
    const titleElem = $("ad\\:title");
    const dateElem = $("ad\\:creation-date-time");

    // We can reasonably expect these to be present
    if (titleElem.length === 0 || dateElem.length === 0) {
        return null;
    }

    info.title = titleElem.text();
    info.description = cleanAdDescription($("ad\\:description").html() || "");
    info.date = new Date(dateElem.text());

    $("pic\\:picture pic\\:link[rel='normal']").each((_i, item) => {
        const url = item.attribs.href;
        if (url) {
            info.images.push(getLargeImageURL(url));
        }
    });
    info.image = info.images.length > 0 ? info.images[0] : "";


    $("attr\\:attribute").each((_i, item) => {
        const name = item.attribs.name;
        const value = $(item).find("attr\\:value").text();
        if (name && value) {
            info.attributes[name] = castAttributeValue(item, value);
        }
    });

    // Add other attributes of interest
    // TODO: The API response contains much more. Worth a closer look.
    const adPrice = $("ad\\:price types\\:amount").text();
    if (isNumber(adPrice)) {
        info.attributes["price"] = Number(adPrice);
    }

    const adLocation = $("ad\\:ad-address types\\:full-address").text();
    if (adLocation) {
        info.attributes["location"] = adLocation;
    }

    const adType = $("ad\\:ad-type ad\\:value").text();
    if (adType) {
        info.attributes["type"] = adType;
    }

    const viewCount = $("ad\\:view-ad-count").text();
    if (viewCount) {
        info.attributes["visits"] = Number(viewCount);
    }
    return info;
}

/* Queries the Kijiji mobile API for the ad at the passed URL */
export function scrapeAPI(url: string): Promise<AdInfo | null> {
    const adIdMatch = url.match(AD_ID_REGEX);
    if (adIdMatch === null) {
        throw new Error("Invalid Kijiji ad URL. Ad URLs must end in /some-ad-id.");
    }

    url = `${API_ADS_ENDPOINT}/${adIdMatch[1]}`;
    return fetch(url, { headers: API_REQUEST_HEADERS, compress: true })
        .then(res => {
            if (res.status === 403) {
                throw new Error(BANNED);
            }
            return res.text();
        })
        .then(body => {
            return parseResponseXML(body);
        });
}