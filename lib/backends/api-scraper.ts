// api-scraper.ts
/* Scrapes a Kijiji ad using the mobile API */

import fetch from "node-fetch";
import cheerio from "cheerio";

import { API_REQUEST_HEADERS, BANNED } from "../constants";
import { cleanAdDescription, getLargeImageURL, isNumber } from "../helpers";
import { AdInfo } from "../scraper";

const AD_ID_REGEX = /\/(\d+)$/;
const API_ADS_ENDPOINT = "https://mingle.kijiji.ca/api/ads";

function castAttributeValue(item: cheerio.Cheerio): boolean | number | Date | string | undefined {
    const valueElem = item.find("attr\\:value");
    if (valueElem.length === 0) {
        return undefined;
    }

    const type = (item.attr("type") || "").toLowerCase();
    const value = valueElem.text().trim();
    const localizedValue = (valueElem.attr("localized-label") || "").toLowerCase();

    // Kijiji only returns strings for attributes. Convert to appropriate types
    if (localizedValue === "yes") {
        return true;
    } else if (localizedValue === "no") {
        return false;
    } else if (isNumber(value)) {
        // Numeric values are sometimes inaccurate. For example, numberbathrooms
        // is multipled by 10. Prefer localized version if it is also a number.
        if (isNumber(localizedValue)) {
            return Number(localizedValue);
        }
        return Number(value);
    } else if (type === "date") {
        return new Date(value);
    }
    return value;
}

/* Parses the XML of a Kijiji ad for its important information */
function parseResponseXML(xml: string): AdInfo | null {
    const $ = cheerio.load(xml);

    const apiError = $("api-error > message").text();
    if (apiError) {
        throw new Error(`Kijiji returned error: ${apiError}`);
    }

    const adElement = $("ad\\:ad").get();
    if (adElement.length !== 1) {
        return null;
    }
    return scrapeAdElement(adElement[0]);
}

export function scrapeAdElement(elem: cheerio.Element): AdInfo | null {
    const info = new AdInfo();

    const $ = cheerio.load(elem);
    const adId = $("ad\\:ad").attr("id");
    const titleElem = $("ad\\:title");
    const dateElem = $("ad\\:start-date-time");

    // We can reasonably expect these to be present
    if (adId === undefined || titleElem.length === 0 || dateElem.length === 0) {
        return null;
    }

    info.id = adId;
    info.title = titleElem.text();
    info.description = cleanAdDescription($("ad\\:description").html() || "");
    info.date = new Date(dateElem.text());

    $("pic\\:picture pic\\:link[rel='normal']").each((_i, item) => {
        const cheerioItem = $(item);
        const url = cheerioItem.attr("href");
        if (url) {
            info.images.push(getLargeImageURL(url));
        }
    });
    info.image = info.images.length > 0 ? info.images[0] : "";


    $("attr\\:attribute").each((_i, item) => {
        const cheerioItem = $(item);
        const name = cheerioItem.attr("name");
        const value = castAttributeValue(cheerioItem);
        if (name && value !== undefined) {
            info.attributes[name] = value;
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
    const parsedURL = new URL(url);
    const adIdMatch = parsedURL.pathname.match(AD_ID_REGEX);

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