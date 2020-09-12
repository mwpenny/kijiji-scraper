jest.mock("node-fetch");

import cheerio from "cheerio";
import fetch from "node-fetch";
import qs from "querystring";
import search, { SearchParameters } from "../search";
import * as scraper from "../scraper";

const fetchSpy = fetch as any as jest.Mock;
const scraperSpy = jest.spyOn(scraper, "default");

type ResultInfo = {
    isFeatured: boolean;
    isThirdParty: boolean;
    title: string;
    path: string;
    description: string;
    imageAttributes: string;
    datePosted: string;
};

const defaultResultInfo: ResultInfo = {
    isFeatured: false,
    isThirdParty: false,
    title: "",
    path: "",
    description: "",
    imageAttributes: "",
    datePosted: ""
};

// Result pages in most categories use this markup
const createStandardResultHTML = (info: Partial<ResultInfo>): string => {
    info = { ...defaultResultInfo, ...info };

    return `
        <div class="search-item
            ${info.isFeatured ? "top-feature" : "regular-ad"}
            ${info.isThirdParty ? "third-party" : ""}">
            <div class="clearfix">
                <div class="left-col">
                    <div class="image">
                        <picture><img ${info.imageAttributes}></picture>
                    </div>

                    <div class="info">
                        <div class="info-container">
                            <div class="title">
                                <a class="title" href="${info.path}">${info.title}</a>
                            </div>

                            <div class="location">
                                <span class="">Some location</span>
                                <span class="date-posted">${info.datePosted}</span>
                            </div>

                            <div class="description">${info.description}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
};

// For some reason, some categories (like anything under
// SERVICES) use different markup classes than usual
const createServiceResultHTML = (info: Partial<ResultInfo>): string => {
    info = { ...defaultResultInfo, ...info };

    return `
        <table class="
            ${info.isFeatured ? "top-feature" : "regular-ad"}
            ${info.isThirdParty ? "third-party" : ""}">
            <tbody>
                <tr>
                    <td class="description">
                        <a class="title" href="${info.path}">${info.title}</a>
                        <p>${info.description}</p>
                    </td>

                    <td class="image">
                        <div class="multiple-images">
                            <picture><img ${info.imageAttributes}></picture>
                        </div>
                    </td>

                    <td class="posted">
                        ${info.datePosted}<br>
                        Some location
                    </td>
                </tr>
            </tbody>
        </table>
    `;
};

describe.each`
    markup                           | createResultHTML
    ${"standard result page markup"} | ${createStandardResultHTML}
    ${"service result page markup"}  | ${createServiceResultHTML}
`("Search result HTML scraper ($markup)", ({ createResultHTML }) => {
    afterEach(() => {
        jest.resetAllMocks();
    });

    const validateSearchUrl = (url: string, expectedParams: SearchParameters) => {
        const splitUrl = url.split("?");
        expect(splitUrl.length).toBe(2);
        expect(splitUrl[0]).toBe("https://www.kijiji.ca/b-search.html")
        expect(qs.parse(splitUrl[1])).toEqual(qs.parse(qs.stringify(expectedParams)));
    };

    const defaultSearchParams: SearchParameters = {
        locationId: 0,
        categoryId: 0,
        formSubmit: true,
        siteLocale: "en_CA"
    };
    describe("search parameters", () => {
        it("should use default values if none are specified", async () => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            await search({});

            expect(fetchSpy).toBeCalled();
            validateSearchUrl(fetchSpy.mock.calls[0][0], defaultSearchParams);
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
                    expect(fetchSpy).not.toBeCalled();
                }
            });

            it("should allow integers", async () => {
                fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
                fetchSpy.mockResolvedValueOnce({ text: () => "" });

                await search({ [param]: (useObject ? { id: 123 } : 123) });

                expect(fetchSpy).toBeCalled();
                validateSearchUrl(fetchSpy.mock.calls[0][0], {
                    ...defaultSearchParams,
                    [param]: 123
                });
            });
        });

        it("should pass all defined params in search URL", async () => {
            const params = { ...defaultSearchParams };
            params.locationId = 123;
            params.categoryId = 456;
            params.someOtherParam = "hello";
            params.undef = undefined;

            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            await search(params);

            expect(fetchSpy).toBeCalled();
            validateSearchUrl(fetchSpy.mock.calls[0][0], params);
        });
    });

    describe("search options", () => {
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
                    expect(fetchSpy).not.toBeCalled();
                }
            });

            it("should allow integers", async () => {
                fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
                fetchSpy.mockResolvedValueOnce({ text: () => "" });

                await search({}, { [option]: 123 });

                expect(fetchSpy).toBeCalledTimes(2);
            });
        });

        describe("scrapeResultDetails", () => {
            it.each`
                test                 | value
                ${"true by default"} | ${undefined}
                ${"explicitly true"} | ${true}
            `("should scrape result details if true ($test)", async ({ value }) => {
                fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
                fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ path: "/myad" }) });
                fetchSpy.mockResolvedValueOnce({ text: () => "" });
                scraperSpy.mockResolvedValueOnce({ title: "My title" } as scraper.AdInfo);

                const ads = await search({}, { scrapeResultDetails: value });

                expect(scraperSpy).toBeCalledWith("https://www.kijiji.ca/myad");
                expect(ads).toEqual([expect.objectContaining({
                    title: "My title"
                })]);
            });

            it("should not scrape result details if false", async () => {
                fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
                fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ path: "/myad" }) });
                fetchSpy.mockResolvedValueOnce({ text: () => "" });

                const ads = await search({}, { scrapeResultDetails: false });

                expect(scraperSpy).not.toBeCalled();
                expect(ads).toEqual([expect.objectContaining({
                    title: ""
                })]);
            });
        });

        it.each`
            test                      | value        | expectedRequestCount
            ${"default value of 40"}  | ${undefined} | ${40}
            ${"explicitly set to 5"}  | ${5}         | ${5}
            ${"explicitly set to 0"}  | ${0}         | ${0}
            ${"explicitly set to -1"} | ${-1}        | ${0}
        `("should stop scraping if minResults ads are found ($test)", async ({ value, expectedRequestCount }) => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValue({ text: () => createResultHTML({}) });

            const ads = await search({}, { scrapeResultDetails: false, minResults: value });
            expect(ads.length).toBe(expectedRequestCount);
            expect(fetchSpy).toBeCalledTimes(expectedRequestCount + 1);
        });

        it.each`
            test                      | value        | expectedResultCount
            ${"default value of -1"}  | ${undefined} | ${5}
            ${"explicitly set to -1"} | ${5}         | ${5}
            ${"explicitly set to 3"}  | ${3}         | ${3}
        `("should truncate results based on maxResults ($test)", async ({ value, expectedResultCount }) => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false, maxResults: value });
            expect(ads.length).toBe(expectedResultCount);
            expect(fetchSpy).toBeCalledTimes(7);
        });
    });

    describe("result page redirect", () => {
        it.each`
            test                       | response
            ${"non-200 response code"} | ${{ status: 418 }}
            ${"no redirect"}           | ${{ status: 200 }}
        `("should throw error for bad response ($test)", async ({ response }) => {
            fetchSpy.mockResolvedValue(response);

            try {
                await search({});
                fail("Expected error for non-200 response code");
            } catch (err) {
                expect(err.message).toBe(
                    "Kijiji failed to return search results. " +
                    "It is possible that Kijiji changed their " +
                    "results markup. If you believe this to be " +
                    "the case, please open a bug at: " +
                    "https://github.com/mwpenny/kijiji-scraper/issues"
                );
            }
        });

        it("should be used for pagination", async () => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            await search({}, { scrapeResultDetails: false });

            expect(fetchSpy).toBeCalledTimes(3);
            validateSearchUrl(fetchSpy.mock.calls[0][0], defaultSearchParams);
            expect(fetchSpy.mock.calls.slice(1)).toEqual([
                ["http://example.com/search/page-1/results"],
                ["http://example.com/search/page-2/results"]
            ]);
        });
    });

    describe("result page scraping", () => {
        // Helpers for date tests
        const nanDataValidator = (date: Date) => {
            expect(Number.isNaN(date.getTime())).toBe(true);
        };
        const makeSpecificDateValidator = (month: number, day: number, year: number) => {
            return (date: Date) => {
                const d = new Date();
                d.setMonth(month - 1);
                d.setDate(day);
                d.setFullYear(year);
                d.setHours(0, 0, 0, 0);

                expect(date).toEqual(d);
            }
        };
        const makeMinutesAgoValidator = (minutes: number) => {
            return (date: Date) => {
                const minutesAgo = new Date();
                minutesAgo.setMinutes(minutesAgo.getMinutes() - minutes, 0, 0);

                expect(date).toEqual(minutesAgo);
            }
        };
        const makeHoursAgoValidator = (hours: number) => {
            return (date: Date) => {
                const hoursAgo = new Date();
                hoursAgo.setHours(hoursAgo.getHours() - hours, 0, 0, 0);

                expect(date).toEqual(hoursAgo);
            }
        };
        const makeDaysAgoValidator = (days: number) => {
            return (date: Date) => {
                const daysAgo = new Date();
                daysAgo.setDate(daysAgo.getDate() - days);
                daysAgo.setHours(0, 0, 0, 0);

                expect(date).toEqual(daysAgo);
            }
        };
        const nowIshValidator = (date: Date) => {
            const nowIsh = new Date();
            nowIsh.setSeconds(date.getSeconds());
            nowIsh.setMilliseconds(date.getMilliseconds());

            expect(date).toEqual(nowIsh);
        };

        beforeEach(() => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
        });

        it("should throw error if scraping fails", async () => {
            const warnSpy = jest.spyOn(console, "warn").mockImplementationOnce(() => {});
            const loadSpy = jest.spyOn(cheerio, "load");
            loadSpy.mockImplementationOnce(() => { throw new Error("Catastrophe"); });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });

            try {
                await search({});
                fail("Expected error while scraping results page");
            } catch (err) {
                expect(err.message).toBe("Invalid Kijiji HTML on search results page (http://example.com/search/page-1/results)");
                expect(warnSpy).toBeCalledWith("WARNING: Failed to parse search result: Error: Catastrophe");
                loadSpy.mockRestore();
                warnSpy.mockRestore();
            }
        });

        it("should scrape title", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ title: "My title" }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads).toEqual([expect.objectContaining({
                title: "My title"
            })]);
        });

        it.each`
            test                    | imageAttributes                   | expectedValue
            ${"with data-src"}      | ${'data-src="/image" src="blah"'} | ${"/image"}
            ${"with src"}           | ${'data-src="" src="/image"'}     | ${"/image"}
            ${"with no attributes"} | ${""}                             | ${""}
            ${"upsize"}             | ${'src="/image/s-l123.jpg"'}      | ${"/image/s-l2000.jpg"}
        `("should scrape image ($test)", async ({ imageAttributes, expectedValue }) => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ imageAttributes }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads).toEqual([expect.objectContaining({
                image: expectedValue
            })]);
        });

        it.each`
            test             | datePosted           | validator
            ${"no date"}     | ${""}                | ${nanDataValidator}
            ${"invalid"}     | ${"invalid"}         | ${nanDataValidator}
            ${"dd/mm/yyyy"}  | ${"7/9/2020"}        | ${makeSpecificDateValidator(9, 7, 2020)}
            ${"minutes ago"} | ${"< 5 minutes ago"} | ${makeMinutesAgoValidator(5)}
            ${"hours ago"}   | ${"< 2 hours ago"}   | ${makeHoursAgoValidator(2)}
            ${"invalid ago"} | ${"< 1 parsec ago"}  | ${nowIshValidator}
            ${"yesterday"}   | ${"yesterday"}       | ${makeDaysAgoValidator(1)}
        `("should scrape date ($test)", async ({ datePosted, validator }) => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ datePosted }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads.length).toBe(1);
            validator(ads[0].date);
        });

        it("should scrape description", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ description: "My desc" }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads).toEqual([expect.objectContaining({
                description: "My desc"
            })]);
        });

        it("should scrape url", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ path: "/myad" }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads).toEqual([expect.objectContaining({
                url: "https://www.kijiji.ca/myad"
            })]);
        });

        it("should exclude featured ads", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) + createResultHTML({ isFeatured: true }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads.length).toBe(1);
        });

        it("should exclude third-party ads", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) + createResultHTML({ isThirdParty: true }) });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads.length).toBe(1);
        });

        it("should stop scraping on last page", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) + '"isLastPage":true' });

            const ads = await search({}, { scrapeResultDetails: false });
            expect(ads.length).toBe(2);
            expect(fetchSpy).toBeCalledTimes(3);
        });

        it("should stop scraping if no results are found", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const ads = await search({});
            expect(ads.length).toBe(0);
            expect(fetchSpy).toBeCalledTimes(2);
        });

        describe("callback", () => {
            it("should be called on success", async () => {
                fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ title: "My title" }) });
                fetchSpy.mockResolvedValueOnce({ text: () => "" });

                const callback = jest.fn();
                const ads = await search({}, { scrapeResultDetails: false }, callback);

                expect(callback).toBeCalledWith(null, ads);
            });

            it("should be called on error", async () => {
                fetchSpy.mockImplementationOnce(() => { throw new Error("Bad fetch"); });

                const callback = jest.fn();

                try {
                    await search({}, {}, callback);
                    fail("Expected error");
                } catch (error) {
                    expect(error.message).toBe("Bad fetch");
                    expect(callback).toBeCalledWith(expect.objectContaining({ message: "Bad fetch" }), []);
                }
            });
        });
    });
});