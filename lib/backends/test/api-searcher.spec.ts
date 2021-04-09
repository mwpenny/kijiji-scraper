jest.mock("node-fetch");

import cheerio from "cheerio";
import fetch from "node-fetch";
import qs from "querystring";
import * as apiScraper from "../api-scraper";
import { ResolvedSearchParameters, SearchParameters } from "../../search";
import { APISearcher } from "../api-searcher";

describe("Search result API scraper", () => {
    const fetchSpy = fetch as any as jest.Mock;
    const scrapeSpy = jest.spyOn(apiScraper, "scrapeAdElement");

    afterEach(() => {
        jest.clearAllMocks();
    });

    type MockAdInfo = {
        url?: string;
        id?: string;
        title?: string;
        date?: Date;
    };

    const createAdXML = (info: MockAdInfo) => {
        return `
            <ad:ad ${info.id ? `id="${info.id}"` : ""}>
                ${info.url ? `<ad:link rel="self-public-website" href="${info.url}"></ad:link>` : ""}
                ${info.title ? `<ad:title>${info.title}</ad:title>` : ""}
                ${info.date ? `<ad:start-date-time>${info.date.toISOString()}</ad:start-date-time>` : ""}
            </ad:ad>
        `;
    };

    const search = (params: ResolvedSearchParameters = { locationId: 0, categoryId: 0}) => {
        return new APISearcher().getPageResults(params, 1);
    };

    const validateSearchUrl = (url: string, expectedParams: SearchParameters) => {
        const splitUrl = url.split("?");
        expect(splitUrl.length).toBe(2);
        expect(splitUrl[0]).toBe("https://mingle.kijiji.ca/api/ads")
        expect(qs.parse(splitUrl[1])).toEqual(qs.parse(qs.stringify(expectedParams)));
    };

    const validateRequestHeaders = () => {
        expect(fetchSpy).toBeCalled();
        for (const call of fetchSpy.mock.calls) {
            expect(call).toEqual([
                expect.any(String),
                {
                    headers: {
                        "User-Agent": "com.ebay.kijiji.ca 6.5.0 (samsung SM-G930U; Android 8.0.0; en_US)",
                        "Accept-Language": "en-CA",
                        Accept: "application/xml",
                        Connection: "close",
                        Pragma: "no-cache",
                        Authorization: "Basic Y2FfYW5kcm9pZF9hcHA6YXBwQ2xAc3NpRmllZHMh",
                        Host: "mingle.kijiji.ca",
                        "Accept-Encoding": "gzip, deflate"
                    },
                    compress: true
                }
            ]);
        };
    }

    const defaultSearchParams: SearchParameters = {
        locationId: 0,
        categoryId: 0,
        page: 0,
        size: 20
    };

    it("should detect ban", async () => {
        fetchSpy.mockResolvedValue({ status: 403 });

        try {
            await search();
            fail("Expected error for ban");
        } catch (err) {
            expect(err.message).toBe(
                "Kijiji denied access. You are likely temporarily blocked. This " +
                "can happen if you scrape too aggressively. Try scraping again later, " +
                "and more slowly. If this happens even when scraping reasonably, please " +
                "open an issue at: https://github.com/mwpenny/kijiji-scraper/issues"
            )
        }
    });

    describe("search parameters", () => {
        it("should pass all defined params in search URL", async () => {
            const params = {
                ...defaultSearchParams,
                locationId: 123,
                categoryId: 456,
                someOtherParam: "hello",
                undef: undefined
            };

            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            await search(params);

            validateRequestHeaders();
            validateSearchUrl(fetchSpy.mock.calls[0][0], params);
        });
    });

    describe("result page scraping", () => {
        it("should throw error if scraping fails", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createAdXML({ url: "http://example.com" }) });

            try {
                await search();
                fail("Expected error while scraping results page");
            } catch (err) {
                expect(err.message).toBe(
                    "Result ad could not be parsed. It is possible that Kijiji " +
                    "changed their markup. If you believe this to be the case, " +
                    "please open an issue at: https://github.com/mwpenny/kijiji-scraper/issues"
                );
                validateRequestHeaders();
                expect(scrapeSpy).toBeCalled();
            }
        });

        it("should scrape each result ad", async () => {
            const ad1Info = {
                url: "http://example.com/1",
                id: "1",
                title: "Ad 1",
                date: new Date(123)
            };
            const ad2Info = {
                url: "http://example.com/2",
                id: "2",
                title: "Ad 2",
                date: new Date(456)
            };
            const ad1 = createAdXML(ad1Info).trim();
            const ad2 = createAdXML(ad2Info).trim();

            fetchSpy.mockResolvedValueOnce({ text: () =>  ad1 + ad2 });

            const { pageResults } = await search();

            validateRequestHeaders();

            expect(scrapeSpy).toBeCalledTimes(2);
            expect(cheerio.load(scrapeSpy.mock.calls[0][0]).html()).toBe(ad1);
            expect(cheerio.load(scrapeSpy.mock.calls[1][0]).html()).toBe(ad2);

            expect(pageResults).toEqual([
                expect.objectContaining(ad1Info),
                expect.objectContaining(ad2Info)
            ]);
            expect(pageResults[0].isScraped()).toBe(true);
            expect(pageResults[1].isScraped()).toBe(true);
        });

        it.each`
            isLastPage
            ${true}
            ${false}
        `("should detect last page (isLastPage=$isLastPage)", async ({ isLastPage }) => {
            let mockResponse = createAdXML({
                url: "http://example.com",
                id: "123",
                title: "My ad",
                date: new Date()
            });
            if (!isLastPage) {
                mockResponse += '<types:paging><types:link rel="next" href="http://example.com/nextpage"/></types:paging>';
            }
            fetchSpy.mockResolvedValueOnce({ text: () => mockResponse });

            const result = await search();
            validateRequestHeaders();
            expect(result.pageResults.length).toBe(1);
            expect(result.isLastPage).toBe(isLastPage);
        });

        it("should handle empty response", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(0);
        });

        it("should skip ads with no URL", async () => {
            const adInfo = {
                url: "http://example.com/1",
                id: "1",
                title: "Ad 1",
                date: new Date(123)
            };
            const ad = createAdXML(adInfo).trim();

            fetchSpy.mockResolvedValueOnce({ text: () => createAdXML({}) + ad });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining(adInfo)]);
        });
    });
});