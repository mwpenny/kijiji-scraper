jest.mock("node-fetch");

import fetch from "node-fetch";
import qs from "querystring";
import { ResolvedSearchParameters, SearchParameters } from "../../search";
import { HTMLSearcher } from "../html-searcher";
import * as helpers from "../../helpers";

type MockListing = {
    seoUrl: string;
    id: string;
    title: string;
    description: string;
    imageUrls: string[];
    activationDate: string;
    adSource: string;
}

const createResultInfo = (listings: Partial<MockListing>[] = []) => {
    return {
        props: {
            pageProps: {
                __APOLLO_STATE__: Object.fromEntries(
                    listings.map((listing, i) => [`ListingV2:${i}`, listing])
                )
            }
        }
    };
};

const createResultHTML = (resultInfo: any = createResultInfo()) => {
    return `
        <html>
            <body>
                <script id="__NEXT_DATA__" type="application/json">
                    ${JSON.stringify(resultInfo)}
                </script>
            </body>
        </html>
    `;
};

describe("Search result HTML scraper", () => {
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
            expect(err).toBeInstanceOf(Error);
            expect((err as Error).message).toBe(
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
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML() });

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
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toBe(
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
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML() });
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML() });

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
        beforeEach(() => {
            fetchSpy.mockResolvedValueOnce({ status: 200, url: "http://example.com/search/results" });
        });

        it.each`
            test                                   | expectedError                        | html
            ${"Bad markup"}                        | ${"Kijiji result JSON not present"}  | ${"Bad markup"}
            ${"Missing __NEXT_DATA__"}             | ${"Kijiji result JSON not present"}  | ${"<html></html>"}
            ${"Empty __NEXT_DATA__"}               | ${"Result JSON could not be parsed"} | ${createResultHTML({})}
            ${"Missing props property"}            | ${"Result JSON could not be parsed"} | ${createResultHTML({ abc: 123 })}
            ${"Missing pageProps property"}        | ${"Result JSON could not be parsed"} | ${createResultHTML({ props: {} })}
            ${"Missing __APOLLO_STATE__ property"} | ${"Result JSON could not be parsed"} | ${createResultHTML({ props: { pageProps: {} } })}
            ${"Missing URL"}                       | ${"Result ad could not be parsed"}   | ${createResultHTML(createResultInfo([{ id: "123", title: "abc", activationDate: "2023-09-06T23:57:42.565Z", adSource: "ORGANIC" }]))}
            ${"Missing ID"}                        | ${"Result ad could not be parsed"}   | ${createResultHTML(createResultInfo([{ seoUrl: "/some-path", title: "abc", activationDate: "2023-09-06T23:57:42.565Z", adSource: "ORGANIC" }]))}
            ${"Missing title"}                     | ${"Result ad could not be parsed"}   | ${createResultHTML(createResultInfo([{ seoUrl: "/some-path", id: "123", activationDate: "2023-09-06T23:57:42.565Z", adSource: "ORGANIC" }]))}
            ${"Missing date"}                      | ${"Result ad could not be parsed"}   | ${createResultHTML(createResultInfo([{ seoUrl: "/some-path", id: "123", title: "abc", adSource: "ORGANIC" }]))}
        `("should throw error if results page is invalid ($test)", async ({ expectedError, html }) => {
            fetchSpy.mockResolvedValueOnce({ text: () => html });

            try {
                await search();
                fail("Expected error while scraping results page");
            } catch (err) {
                expect(err).toBeInstanceOf(Error);
                expect((err as Error).message).toBe(
                    `${expectedError}. It is possible that Kijiji changed their ` +
                    "markup. If you believe this to be the case, please open an " +
                    "issue at: https://github.com/mwpenny/kijiji-scraper/issues"
                );
                validateRequestHeaders();
            }
        });

        it("should scrape ID", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                activationDate: (new Date()).toISOString(),
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                id: "123",
            })]);
        });

        it("should scrape title", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: (new Date()).toISOString(),
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                title: "My ad title"
            })]);
        });

        it.each`
            test                 | urls                    | expectedURL
            ${"no images"}       | ${undefined}            | ${""}
            ${"empty images"}    | ${[]}                   | ${""}
            ${"one image"}       | ${["image1"]}           | ${"image1_large"}
            ${"multiple images"} | ${["image1", "image2"]} | ${"image1_large"}
        `("should scrape image ($test)", async ({ urls, expectedURL }) => {
            const getLargeImageURLSpy = jest.spyOn(helpers, "getLargeImageURL");
            getLargeImageURLSpy.mockImplementation(url => url ? url + "_large" : url);

            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: (new Date()).toISOString(),
                imageUrls: urls,
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                image: expectedURL
            })]);
            expect(pageResults[0].isScraped()).toBe(false);

            getLargeImageURLSpy.mockRestore();
        });

        it("should scrape date", async () => {
            const date = new Date();
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: date.toISOString(),
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();

            expect(pageResults.length).toBe(1);

            const result = pageResults[0];
            expect(result.date).toEqual(date);
            expect(result.isScraped()).toBe(false);
        });

        it("should scrape description", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: (new Date()).toISOString(),
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                description: "My ad description"
            })]);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should scrape url", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: (new Date()).toISOString(),
                adSource: "ORGANIC"
            }]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults).toEqual([expect.objectContaining({
                url: "https://www.kijiji.ca/some-path"
            })]);
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should only include non-featured ads", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([
                {
                    seoUrl: "/some-path-1",
                    id: "123",
                    title: "My ad title",
                    description: "My ad description",
                    activationDate: (new Date()).toISOString(),
                    adSource: "ORGANIC"
                },
                {
                    seoUrl: "/some-path-2",
                    id: "456",
                    title: "Non-organic ad",
                    description: "My ad description",
                    activationDate: (new Date()).toISOString(),
                    adSource: "MONSANTO"
                },
                {
                    adSource: null
                },
                null as any
            ]))});

            const { pageResults } = await search();
            validateRequestHeaders();
            expect(pageResults.length).toBe(1);
            expect(pageResults[0].id).toBe("123");
            expect(pageResults[0].isScraped()).toBe(false);
        });

        it("should scrape each result ad", async () => {
            fetchSpy.mockResolvedValueOnce({ text: () => createResultHTML(createResultInfo([
                {
                    seoUrl: "/some-path-1",
                    id: "1",
                    title: "Ad 1",
                    activationDate: (new Date(123)).toISOString(),
                    adSource: "ORGANIC"
                },
                {
                    seoUrl: "/some-path-2",
                    id: "2",
                    title: "Ad 2",
                    activationDate: (new Date(123)).toISOString(),
                    adSource: "ORGANIC"
                }
            ]))});

            const { pageResults } = await search();
            validateRequestHeaders();

            expect(pageResults).toEqual([
                expect.objectContaining({
                    id: "1",
                    title: "Ad 1"
                }),
                expect.objectContaining({
                    id: "2",
                    title: "Ad 2"
                })
            ]);

            expect(pageResults[0].isScraped()).toBe(false);
            expect(pageResults[1].isScraped()).toBe(false);
        });

        it.each`
            isLastPage
            ${true}
            ${false}
        `("should detect last page (isLastPage=$isLastPage)", async ({ isLastPage }) => {
            let mockResponse = createResultHTML(createResultInfo([{
                seoUrl: "/some-path",
                id: "123",
                title: "My ad title",
                description: "My ad description",
                activationDate: (new Date()).toISOString(),
                adSource: "ORGANIC"
            }]));

            if (!isLastPage) {
                mockResponse += "pagination-next-link";
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