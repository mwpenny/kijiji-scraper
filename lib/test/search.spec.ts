import { Ad } from "../ad";
import { search, SearchParameters } from "../search";
import { APISearcher } from "../backends/api-searcher";
import { HTMLSearcher } from "../backends/html-searcher";
import * as helpers from "../helpers";
import * as scraper from "../scraper";

const scraperSpy = jest.spyOn(scraper, "scrape");
const getAPIPageResultsSpy = jest.spyOn(APISearcher.prototype, "getPageResults");
const getHTMLPageResultsSpy = jest.spyOn(HTMLSearcher.prototype, "getPageResults");

describe.each`
    scraperType
    ${helpers.ScraperType.API}
    ${helpers.ScraperType.HTML}
`("Ad searcher (scraperType=$scraperType)", ({ scraperType }) => {
    const activeSearcher = scraperType === helpers.ScraperType.API
        ? getAPIPageResultsSpy
        : getHTMLPageResultsSpy;
    const allSearchers = [
        getAPIPageResultsSpy,
        getHTMLPageResultsSpy
    ];

    const getScraperOptionsSpy = jest.spyOn(helpers, "getScraperOptions");

    beforeEach(() => {
        getScraperOptionsSpy.mockReturnValue({ scraperType });
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    const defaultSearchParams: SearchParameters = {
        locationId: 0,
        categoryId: 0,
        formSubmit: true,
        siteLocale: "en_CA"
    };

    const expectSearcherCall = (expected: SearchParameters = defaultSearchParams) => {
        expect(activeSearcher).toBeCalledWith(expected, 1);
        allSearchers.forEach(s => {
            if (s !== activeSearcher) {
                expect(s).not.toBeCalled();
            }
        });
    };

    it("should catch search errors", async () => {
        activeSearcher.mockImplementationOnce(() => { throw new Error("Error searching"); });

        try {
            await search({});
            fail("Expected error while searching");
        } catch (err) {
            expect(err.message).toBe(
                "Error parsing Kijiji search results: Error searching"
            );
        }
    });

    describe("search parameters", () => {
        it("should use default values if none are specified", async () => {
            activeSearcher.mockResolvedValueOnce({
                pageResults: [],
                isLastPage: true
            });

            await search({});

            expectSearcherCall(defaultSearchParams);
        });

        describe.each`
            param           | useObject
            ${"locationId"} | ${false}
            ${"locationId"} | ${true}
            ${"categoryId"} | ${false}
            ${"categoryId"} | ${true}
        `("$param validation (with helper object=$useObject)", ({ param, useObject }) => {
            it.each`
                id
                ${123.456}
                ${"blah"}
                ${{}}
                ${NaN}
            `("should throw error for bad value ($id)", async ({ id }) => {
                try {
                    await search({ [param]: (useObject ? { id } : id) });
                    fail(`Expected error for bad ${param}`);
                } catch (err) {
                    expect(err.message).toBe(`Integer property '${param}' must be specified`);
                    allSearchers.forEach(s => expect(s).not.toBeCalled());
                }
            });

            it("should allow integers", async () => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [],
                    isLastPage: true
                });

                await search({ [param]: (useObject ? { id: 123 } : 123) });

                expectSearcherCall({
                    ...defaultSearchParams,
                    [param]: 123
                });
            });
        });

        it("should pass all defined params to searcher", async () => {
            const params = { ...defaultSearchParams };
            params.locationId = 123;
            params.categoryId = 456;
            params.someOtherParam = "hello";
            params.undef = undefined;

            activeSearcher.mockResolvedValueOnce({
                pageResults: [],
                isLastPage: true
            });

            await search(params);

            expectSearcherCall(params);
        });
    });

    describe("search options", () => {
        it("should not search if retrieving options throws error", async () => {
            getScraperOptionsSpy.mockImplementation(() => { throw new Error("Bad options"); });

            try {
                await search({});
                fail("Expected error for bad scraper options");
            } catch (err) {
                expect(err.message).toBe("Bad options");
                allSearchers.forEach(s => expect(s).not.toBeCalled());
            }
        });

        describe.each`
            option
            ${"minResults"}
            ${"maxResults"}
        `("$option validation", ({ option }) => {
            it.each`
                value
                ${123.456}
                ${"blah"}
                ${{}}
                ${NaN}
            `("should throw error for bad value ($value)", async ({ value }) => {
                try {
                    await search({}, { [option]: value });
                    fail(`Expected error for bad ${option}`);
                } catch (err) {
                    expect(err.message).toBe(`Integer property '${option}' must be specified`);
                    allSearchers.forEach(s => expect(s).not.toBeCalled());
                }
            });

            it("should allow integers", async () => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [],
                    isLastPage: true
                });

                await search({}, { [option]: 123 });

                expectSearcherCall();
            });
        });

        describe("scrapeResultDetails", () => {
            it.each`
                test                 | value
                ${"true by default"} | ${undefined}
                ${"explicitly true"} | ${true}
            `("should scrape result details if true ($test)", async ({ value }) => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [new Ad("http://example.com")],
                    isLastPage: true
                });

                scraperSpy.mockResolvedValueOnce({ title: "My title" } as scraper.AdInfo);

                const ads = await search({}, { scrapeResultDetails: value, scraperType });

                expectSearcherCall();
                expect(scraperSpy).toBeCalledWith("http://example.com", undefined);
                expect(ads).toEqual([expect.objectContaining({
                    title: "My title"
                })]);
            });

            it("should not scrape result details if false", async () => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [new Ad("")],
                    isLastPage: true
                });

                const ads = await search({}, { scrapeResultDetails: false, scraperType });

                expectSearcherCall();
                expect(scraperSpy).not.toBeCalled();
                expect(ads).toEqual([expect.objectContaining({
                    title: ""
                })]);
            });

            it("should not scrape result details if already scraped", async () => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [new Ad("", undefined, true)],
                    isLastPage: true
                });

                const ads = await search({}, { scrapeResultDetails: true, scraperType });

                expectSearcherCall();
                expect(scraperSpy).not.toBeCalled();
                expect(ads).toEqual([expect.objectContaining({
                    title: ""
                })]);
            });
        });

        it.each`
            test                      | value        | expectedRequestCount
            ${"default value of 20"}  | ${undefined} | ${20}
            ${"explicitly set to 5"}  | ${5}         | ${5}
            ${"explicitly set to 0"}  | ${0}         | ${0}
            ${"explicitly set to -1"} | ${-1}        | ${0}
        `("should stop scraping if minResults ads are found ($test)", async ({ value, expectedRequestCount }) => {
            activeSearcher.mockResolvedValue({
                pageResults: [new Ad("")],
                isLastPage: false
            });

            const ads = await search({}, { scrapeResultDetails: false, minResults: value });
            expect(ads.length).toBe(expectedRequestCount);
            expect(activeSearcher).toBeCalledTimes(expectedRequestCount);
            allSearchers.forEach(s => {
                if (s !== activeSearcher) {
                    expect(s).not.toBeCalled();
                }
            });
        });

        it.each`
            test                      | value        | expectedResultCount
            ${"default value of -1"}  | ${undefined} | ${5}
            ${"explicitly set to -1"} | ${5}         | ${5}
            ${"explicitly set to 3"}  | ${3}         | ${3}
        `("should truncate results based on maxResults ($test)", async ({ value, expectedResultCount }) => {
            activeSearcher.mockResolvedValueOnce({ pageResults: [new Ad("")], isLastPage: false });
            activeSearcher.mockResolvedValueOnce({ pageResults: [new Ad("")], isLastPage: false });
            activeSearcher.mockResolvedValueOnce({ pageResults: [new Ad("")], isLastPage: false });
            activeSearcher.mockResolvedValueOnce({ pageResults: [new Ad("")], isLastPage: false });
            activeSearcher.mockResolvedValueOnce({ pageResults: [new Ad("")], isLastPage: true });

            const ads = await search({}, { scrapeResultDetails: false, maxResults: value });

            expect(ads.length).toBe(expectedResultCount);
            for (let i = 1; i <= 5; ++i) {
                expect(activeSearcher).toHaveBeenNthCalledWith(i, defaultSearchParams, i);
            }
            allSearchers.forEach(s => {
                if (s !== activeSearcher) {
                    expect(s).not.toBeCalled();
                }
            });
        });
    });

    describe("callback", () => {
        it("should be called on success", async () => {
            activeSearcher.mockResolvedValueOnce({
                pageResults: [new Ad("")],
                isLastPage: true
            });

            const callback = jest.fn();
            const ads = await search({}, { scrapeResultDetails: false }, callback);

            expectSearcherCall();
            expect(callback).toBeCalledWith(null, ads);
        });

        it("should be called on error", async () => {
            activeSearcher.mockImplementationOnce(() => { throw new Error("Bad search"); });

            const callback = jest.fn();

            try {
                await search({}, {}, callback);
                fail("Expected error");
            } catch (error) {
                expect(callback).toBeCalledWith(expect.any(Error), []);
            }
        });
    });
});