import { Ad } from "../ad";
import { search, SearchParameters } from "../search";
import { APISearcher } from "../backends/api-searcher";
import { HTMLSearcher } from "../backends/html-searcher";
import * as helpers from "../helpers";
import * as scraper from "../scraper";

describe.each`
    scraperType
    ${helpers.ScraperType.API}
    ${helpers.ScraperType.HTML}
`("Ad searcher (scraperType=$scraperType)", ({ scraperType }) => {
    const scraperSpy = jest.spyOn(scraper, "scrape");
    const getAPIPageResultsSpy = jest.spyOn(APISearcher.prototype, "getPageResults");
    const getHTMLPageResultsSpy = jest.spyOn(HTMLSearcher.prototype, "getPageResults");
    const sleepSpy = jest.spyOn(helpers, "sleep");

    const activeSearcher = scraperType === helpers.ScraperType.API
        ? getAPIPageResultsSpy
        : getHTMLPageResultsSpy;
    const allSearchers = [
        getAPIPageResultsSpy,
        getHTMLPageResultsSpy
    ];

    const getScraperOptionsSpy = jest.spyOn(helpers, "getScraperOptions");

    beforeEach(() => {
        sleepSpy.mockResolvedValue();
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
            ${"pageDelayMs"}
            ${"resultDetailsDelayMs"}
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

        describe.each`
            resultDetailsDelayMs
            ${0}
            ${1000}
        `("scrapeResultDetails (resultDetailsDelayMs=$resultDetailsDelayMs)", ({ resultDetailsDelayMs }) => {
            it.each`
                test                 | value
                ${"true by default"} | ${undefined}
                ${"explicitly true"} | ${true}
            `("should scrape result details if true ($test)", async ({ value }) => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [
                        new Ad("http://example.com/1"),
                        new Ad("http://example.com/2")
                    ],
                    isLastPage: true
                });
                scraperSpy.mockResolvedValueOnce({ title: "My title" } as scraper.AdInfo);
                scraperSpy.mockResolvedValueOnce({ title: "My title2" } as scraper.AdInfo);

                let scraperCalls = 0;
                sleepSpy.mockImplementation(async () => {
                    expect(scraperSpy).toBeCalledTimes(++scraperCalls);
                });

                const ads = await search({}, {
                    scrapeResultDetails: value,
                    resultDetailsDelayMs,
                    scraperType
                });

                expectSearcherCall();
                expect(scraperSpy.mock.calls).toEqual([
                    ["http://example.com/1", undefined],
                    ["http://example.com/2", undefined]
                ]);
                expect(ads).toEqual([
                    expect.objectContaining({ title: "My title" }),
                    expect.objectContaining({ title: "My title2" })
                ]);

                if (resultDetailsDelayMs > 0) {
                    expect(sleepSpy.mock.calls).toEqual([
                        [resultDetailsDelayMs],
                        [resultDetailsDelayMs]
                    ]);
                } else {
                    expect(sleepSpy).not.toBeCalled();
                }
            });

            it("should not scrape result details if false", async () => {
                activeSearcher.mockResolvedValueOnce({
                    pageResults: [new Ad("")],
                    isLastPage: true
                });

                const ads = await search({}, {
                    scrapeResultDetails: false,
                    resultDetailsDelayMs,
                    scraperType
                });

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

                const ads = await search({}, {
                    scrapeResultDetails: true,
                    resultDetailsDelayMs,
                    scraperType
                });

                expectSearcherCall();
                expect(scraperSpy).not.toBeCalled();
                expect(ads).toEqual([expect.objectContaining({
                    title: ""
                })]);
            });
        });

        it.each`
            test                         | value        | expectedDelay
            ${"default value of 1000"}   | ${undefined} | ${1000}
            ${"explicitly set to 1000"}  | ${1000}      | ${1000}
            ${"explicitly set to 5000"}  | ${5000}      | ${5000}
            ${"explicitly set to 0"}     | ${0}         | ${0}
        `("should delay between pages based on pageDelayMs ($test)", async ({ value, expectedDelay }) => {
            activeSearcher.mockResolvedValueOnce({
                pageResults: [new Ad("")],
                isLastPage: false
            });
            activeSearcher.mockResolvedValueOnce({
                pageResults: [new Ad(""), new Ad("")],
                isLastPage: false
            });
            sleepSpy.mockImplementationOnce(async () => {
                expect(activeSearcher).toBeCalledTimes(1);
            });

            const ads = await search({}, {
                scrapeResultDetails: false,
                pageDelayMs: value,
                minResults: 2,
                scraperType
            });

            // We shouldn't delay after the last page
            expect(sleepSpy.mock.calls).toEqual([[expectedDelay]]);
            expect(ads.length).toBe(3);
            expect(activeSearcher).toBeCalledTimes(2);
            allSearchers.forEach(s => {
                if (s !== activeSearcher) {
                    expect(s).not.toBeCalled();
                }
            });
        });

        describe("minResults", () => {
            it.each`
                test                                                 | value        | maxResults | expectedRequestCount
                ${"default value of 20"}                             | ${undefined} | ${-1}      | ${20}
                ${"explicitly set to 5"}                             | ${5}         | ${-1}      | ${5}
                ${"explicitly set to 0"}                             | ${0}         | ${-1}      | ${0}
                ${"use value of maxResults when negative"}           | ${-1}        | ${123}     | ${123}
                ${"use positive value of maxResults when undefined"} | ${undefined} | ${123}     | ${123}
            `("should stop scraping if minResults ads are found ($test)", async ({ value, maxResults, expectedRequestCount }) => {
                activeSearcher.mockResolvedValue({
                    pageResults: [new Ad("")],
                    isLastPage: false
                });

                const ads = await search({}, { scrapeResultDetails: false, minResults: value, maxResults });
                expect(ads.length).toBe(expectedRequestCount);
                expect(activeSearcher).toBeCalledTimes(expectedRequestCount);
                allSearchers.forEach(s => {
                    if (s !== activeSearcher) {
                        expect(s).not.toBeCalled();
                    }
                });
            });

            it("should scrape until last page if minResults is negative", async () => {
                for (let i = 0; i < 200; ++i) {
                    activeSearcher.mockResolvedValueOnce({
                        pageResults: [new Ad("")],
                        isLastPage: i === 199
                    });
                }

                const ads = await search({}, { scrapeResultDetails: false, minResults: -1 });
                expect(ads.length).toBe(200);
                expect(activeSearcher).toBeCalledTimes(200);
                allSearchers.forEach(s => {
                    if (s !== activeSearcher) {
                        expect(s).not.toBeCalled();
                    }
                });
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

            const ads = await search({}, { scrapeResultDetails: false, minResults: 20, maxResults: value });

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