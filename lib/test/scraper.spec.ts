jest.mock("../backends/api-scraper");
jest.mock("../backends/html-scraper");

import { AdInfo, scrape } from "../scraper";
import * as helpers from "../helpers";
import * as apiScraper from "../backends/api-scraper";
import * as htmlScraper from "../backends/html-scraper";

const scrapeAPISpy = jest.spyOn(apiScraper, "scrapeAPI");
const scrapeHTMLSpy = jest.spyOn(htmlScraper, "scrapeHTML");

describe.each`
    scraperType
    ${helpers.ScraperType.API}
    ${helpers.ScraperType.HTML}
`("Ad scraper (scraperType=$scraperType)", ({ scraperType }) => {
    const activeScraper = scraperType === helpers.ScraperType.API ? scrapeAPISpy : scrapeHTMLSpy;
    const allScrapers = [
        scrapeAPISpy,
        scrapeHTMLSpy
    ];

    const getScraperOptionsSpy = jest.spyOn(helpers, "getScraperOptions");

    beforeEach(() => {
        getScraperOptionsSpy.mockReturnValue({ scraperType });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    it.each`
        url
        ${null}
        ${undefined}
        ${""}
    `("should throw error if URL is not passed (url=$url)", async ({ url }) => {
        try {
            await scrape(url);
            fail("Expected error for bad URL");
        } catch (err) {
            expect(err.message).toBe("URL must be specified");
            allScrapers.forEach(s => expect(s).not.toBeCalled());
        }
    });

    it("should throw error if no ad info is returned", async () => {
        const url = "http://example.com";

        try {
            await scrape(url);
            fail("Expected error for no ad info");
        } catch (err) {
            expect(err.message).toBe(
                "Ad not found or invalid response received from Kijiji for " +
                "ad at http://example.com. It is possible that Kijiji changed " +
                "their markup. If you believe this to be the case, please open " +
                "an issue at: https://github.com/mwpenny/kijiji-scraper/issues"
            );
            expect(activeScraper).not.toBeCalledWith(url)
            allScrapers.forEach(s => {
                if (s !== activeScraper) {
                    expect(s).not.toBeCalled();
                }
            });
        }
    });

    it("should not scrape if retrieving options throws error", async () => {
        getScraperOptionsSpy.mockImplementation(() => { throw new Error("Bad options"); });

        try {
            await scrape("http://example.com", {});
            fail("Expected error for bad scraper options");
        } catch (err) {
            expect(err.message).toBe("Bad options");
            allScrapers.forEach(s => expect(s).not.toBeCalled());
        }
    });

    it("should set ad URL", async () => {
        activeScraper.mockResolvedValue(new AdInfo());

        const url = "http://example.com";
        const adInfo = await scrape(url);

        expect(activeScraper).toBeCalledWith(url);
        allScrapers.forEach(s => {
            if (s !== activeScraper) {
                expect(s).not.toBeCalled();
            }
        });
        expect(adInfo.url).toBe(url);
    });
});