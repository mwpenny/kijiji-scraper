jest.mock("node-fetch");

import fetch from "node-fetch";
import qs from "querystring";
import { ResolvedSearchParameters, SearchParameters } from "../../search";
import { HTMLSearcher } from "../html-searcher";

type ResultInfo = {
    isFeatured: boolean;
    isThirdParty: boolean;
    title: string;
    path: string;
    description: string;
    imageAttributes: string;
    datePosted: string;
    id: string;
};

const defaultResultInfo: ResultInfo = {
    isFeatured: false,
    isThirdParty: false,
    title: "",
    path: "/someAd",
    description: "",
    imageAttributes: "",
    datePosted: "",
    id: ""
};

// Result pages in most categories use this markup
const createStandardResultHTML = (info: Partial<ResultInfo>): string => {
    info = { ...defaultResultInfo, ...info };

    return `
        <div class="search-item
            ${info.isFeatured ? "top-feature" : "regular-ad"}
            ${info.isThirdParty ? "third-party" : ""}"
            ${info.id ? `data-listing-id="${info.id}"` : ""}>
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
            ${info.isThirdParty ? "third-party" : ""}"
            ${info.id ? `data-listing-id="${info.id}"` : ""}>
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
    const fetchSpy = fetch as any as jest.Mock;

    afterEach(() => {
        jest.resetAllMocks();
    });

    const validateSearchUrl = (url: string, expectedParams: SearchParameters) => {
        const splitUrl = url.split("?");
        expect(splitUrl.length).toBe(2);
        expect(splitUrl[0]).toBe("https://www.kijiji.ca/b-search.html")
        expect(qs.parse(splitUrl[1])).toEqual(qs.parse(qs.stringify(expectedParams)));
    };

    const validateRequestHeaders = () => {
        expect(fetchSpy).toBeCalled();
        for (const call of fetchSpy.mock.calls) {
            expect(call).toEqual([
                expect.any(String),
                {
                    headers: {
                        "Accept-Language": "en-CA",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:79.0) Gecko/20100101 Firefox/79.0"
                    }
                }
            ]);
        };
    }

    const search = (params: ResolvedSearchParameters = { locationId: 0, categoryId: 0}) => {
        return new HTMLSearcher().getPageResults(params, 1);
    };

    const defaultSearchParams: SearchParameters = {
        locationId: 0,
        categoryId: 0,
        formSubmit: true,
        siteLocale: "en_CA"
    };

    it.each`
        test                            | firstRequestStatus
        ${"fail on initial request"}    | ${200}
        ${"fail on redirected request"} | ${403}
    `("should detect ban ($test)", async ({ firstRequestStatus }) => {
        fetchSpy.mockResolvedValueOnce({ status: firstRequestStatus, url: "http://example.com/search/results" });
        fetchSpy.mockResolvedValueOnce({ status: 403 });

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
            validateRequestHeaders();
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

            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            await search(params);

            validateRequestHeaders();
            validateSearchUrl(fetchSpy.mock.calls[0][0], params);
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
                await search();
                fail("Expected error for non-200 response code");
            } catch (err) {
                expect(err.message).toBe(
                    "Kijiji failed to redirect to results page. It is possible " +
                    "that Kijiji changed their markup. If you believe this to be " +
                    "the case, please open an issue at: " +
                    "https://github.com/mwpenny/kijiji-scraper/issues"
                );
                validateRequestHeaders();
            }
        });

        it("should be used for pagination", async () => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) });

            const searcher = new HTMLSearcher();
            await searcher.getPageResults({ locationId: 0, categoryId: 0 }, 1);
            await searcher.getPageResults({ locationId: 0, categoryId: 0 }, 2);

            expect(fetchSpy).toBeCalledTimes(3);
            validateRequestHeaders();

            // Only the first request should include the paramaters since
            // the searcher instance is re-used for subsequent requests
            validateSearchUrl(fetchSpy.mock.calls[0][0], { locationId: 0, categoryId: 0});
            expect(fetchSpy.mock.calls[1][0]).toBe("http://example.com/search/page-1/results");
            expect(fetchSpy.mock.calls[2][0]).toBe("http://example.com/search/page-2/results");
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

        it("should throw error if results page is invalid", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ path: "" }) });

            try {
                await search();
                fail("Expected error while scraping results page");
            } catch (err) {
                expect(err.message).toBe(
                    "Result ad has no URL. It is possible that Kijiji changed their " +
                    "markup. If you believe this to be the case, please open an issue " +
                    "at: https://github.com/mwpenny/kijiji-scraper/issues"
                );
                validateRequestHeaders();
            }
        });

        it("should scrape ID", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ id: "123" }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                id: "123",
            })]);
        });

        it("should scrape title", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ title: "My title" }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
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

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                image: expectedValue
            })]);
            expect(pageResults[0].isScraped()).toBe(false);
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

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(1);
            validator(pageResults[0].date);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should scrape description", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ description: "My desc" }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                description: "My desc"
            })]);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should scrape url", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({ path: "/myad" }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                url: "https://www.kijiji.ca/myad"
            })]);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should exclude featured ads", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) + createResultHTML({ isFeatured: true }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(1);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should exclude third-party ads", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML({}) + createResultHTML({ isThirdParty: true }) });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(1);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it.each`
            isLastPage
            ${true}
            ${false}
        `("should detect last page (isLastPage=$isLastPage)", async ({ isLastPage }) => {
            let mockResponse = createResultHTML({});
            if (isLastPage) {
                mockResponse += '"isLastPage":true';
            }
            fetchSpy.mockResolvedValueOnce({ text: () => mockResponse });

            const result = await search();
            validateRequestHeaders();
            expect(result.pageResults.length).toBe(1);
            expect(result.pageResults[0].isScraped()).toBe(false);
            expect(result.isLastPage).toBe(isLastPage);
        });

        it("should handle empty response", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => "" });

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(0);
        });
    });
});