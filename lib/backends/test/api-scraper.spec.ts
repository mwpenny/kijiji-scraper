jest.mock("node-fetch");

import fetch from "node-fetch";
import { scrapeAPI as scraper } from "../api-scraper";
import * as helpers from "../../helpers";

const FAKE_VALID_AD_URL = "http://example.com/ad/123";

describe("Ad API scraper", () => {
    const fetchSpy = fetch as any as jest.Mock;

    afterEach(() => {
        jest.resetAllMocks();
    });

    const mockResponse = (body: string) => {
        fetchSpy.mockResolvedValue({
            text: () => body
        });
    };

    type MockAdAttribute = {
        value: any;
        localizedValue?: string;
    };

    type MockAdInfo = {
        title?: string;
        description?: string;
        date?: Date;
        images?: string[];
        attributes?: { [name: string]: MockAdAttribute };
        id?: string;
        price?: string;
        location?: string;
        type?: string;
        visits?: number;
    };

    const validateRequest = () => {
        expect(fetchSpy).toBeCalledWith(
            "https://mingle.kijiji.ca/api/ads/123",
            { compress: true, headers: {
                "User-Agent": "com.ebay.kijiji.ca 6.5.0 (samsung SM-G930U; Android 8.0.0; en_US)",
                "Accept-Language": "en-CA",
                Accept: "application/xml",
                Connection: "close",
                Pragma: "no-cache",
                Authorization: "Basic Y2FfYW5kcm9pZF9hcHA6YXBwQ2xAc3NpRmllZHMh",
                Host: "mingle.kijiji.ca",
                "Accept-Encoding": "gzip, deflate"
            }}
        );
    }

    const serializeAttribute = (name: string, attr: MockAdAttribute) => {
        const { value, localizedValue } = attr;

        return `
            <attr:attribute
                name="${name}"
                ${value instanceof Date ? 'type="DATE"' : ""}
            >
                ${value !== undefined ?
                    `
                        <attr:value
                            ${localizedValue ?
                                `localized-label=${localizedValue}`
                            : typeof value === "boolean" ?
                                `localized-label=${value ? "Yes" : "No"}`
                            : ""}
                        >
                        ${
                            value instanceof Date ? value.toISOString() :
                            typeof value === "string" ? value :
                            Number(value)
                        }
                        </attr:value>
                    `
                    : ""
                }
            </attr:attribute>
        `;
    };

    const createAdXML = (info: MockAdInfo) => {
        return `
            <ad:ad ${info.id ? `id="${info.id}"` : ""}>
                ${info.title ? `<ad:title>${info.title}</ad:title>` : ""}
                ${info.description ? `<ad:description>${info.description}</ad:description>` : ""}
                ${info.date ? `<ad:start-date-time>${info.date.toISOString()}</ad:start-date-time>` : ""}
                <pic:pictures>
                    ${(info.images ? info.images.map(url => `<pic:picture><pic:link rel="normal" href="${url}"></pic:picture>`) : []).join("\n")}
                </pic:pictures>
                ${info.price ? `<ad:price><types:amount>${info.price}</types:amount></ad:price>` : ""}
                ${info.location ? `<ad:ad-address><types:full-address>${info.location}</types:full-address></ad:ad-address>` : ""}
                ${info.type ? `<ad:ad-type><ad:value>${info.type}</ad:value></ad:ad-type>` : ""}
                ${info.visits ? `<ad:view-ad-count>${info.visits}</ad:view-ad-count>` : ""}
                <attr:attributes>
                    ${info.attributes ? Object.entries(info.attributes).map(e => serializeAttribute(e[0], e[1])) : ""}
                </attr:attributes>
            </ad:ad>
        `;
    };

    it("should detect ban", async () => {
        fetchSpy.mockResolvedValue({ status: 403 });

        try {
            await scraper(FAKE_VALID_AD_URL);
            fail("Expected error for ban");
        } catch (err) {
            expect(err.message).toBe(
                "Kijiji denied access. You are likely temporarily blocked. This " +
                "can happen if you scrape too aggressively. Try scraping again later, " +
                "and more slowly. If this happens even when scraping reasonably, please " +
                "open an issue at: https://github.com/mwpenny/kijiji-scraper/issues"
            )
            validateRequest();
        }
    });

    it.each`
        test                     | xml
        ${"Bad markup"}          | ${"Bad markup"}
        ${"Missing id"}          | ${createAdXML({})}
        ${"Missing title"}       | ${createAdXML({ id: "123" })}
        ${"Missing date"}        | ${createAdXML({ id: "123", title: "My ad title" })}
    `("should fail to scrape invalid XML ($test)", async ({ xml }) => {
        mockResponse(xml);

        const adInfo = await scraper(FAKE_VALID_AD_URL);
        validateRequest();
        expect(adInfo).toBeNull();
    });

    it("should report API error", async () => {
        mockResponse(`
            <api-errors>
                <api-error>
                    <message>Scraped knee!</message>
                </api-error>
            </api-errors>
        `);

        try {
            await scraper(FAKE_VALID_AD_URL);
            fail("Expected API error");
        } catch (error) {
            validateRequest();
            expect(error.message).toBe("Kijiji returned error: Scraped knee!");
        }
    });

    describe("URL parsing", () => {
        it("should fail with invalid URL", async () => {
            try {
                await scraper("not a URL")
                fail("Expected error for invalid URL");
            } catch (err) {
                expect(err.message).toBe("Invalid URL: not a URL");
            }
        });

        it("should fail with URL that does not end in ad ID", async () => {
            try {
                await scraper("http://example.com")
                fail("Expected error for invalid URL");
            } catch (err) {
                expect(err.message).toBe("Invalid Kijiji ad URL. Ad URLs must end in /some-ad-id.");
            }
        });

        it("should ignore query string", async () => {
            mockResponse(createAdXML({}));

            await scraper(`${FAKE_VALID_AD_URL}?key=value`);
            validateRequest();
        });
    });

    describe("valid markup", () => {
        it("should scrape ID", async () => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date()
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.id).toBe("123");
        });

        it("should scrape title", async () => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date()
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.title).toBe("My ad title");
        });

        it.each`
            test         | description            | expected
            ${"missing"} | ${undefined}           | ${""}
            ${"present"} | ${"My ad description"} | ${"My ad description"}
        `("should scrape description ($test)", async ({ description, expected }) => {
            const cleanAdDescriptionSpy = jest.spyOn(helpers, "cleanAdDescription");
            cleanAdDescriptionSpy.mockReturnValueOnce("Clean description");

            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description,
                date: new Date()
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(cleanAdDescriptionSpy).toBeCalledWith(expected);
            expect(adInfo).not.toBeNull();
            expect(adInfo!.description).toBe("Clean description");

            cleanAdDescriptionSpy.mockRestore();
        });

        it("should scrape date", async () => {
            const date = new Date();
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.date).toEqual(date);
        });

        it.each`
            test                 | urls                    | expectedURL
            ${"no images"}       | ${undefined}            | ${""}
            ${"empty images"}    | ${[]}                   | ${""}
            ${"one image"}       | ${["image1"]}           | ${"image1"}
            ${"multiple images"} | ${["image1", "image2"]} | ${"image1"}
        `("should scrape image ($test)", async ({ urls, expectedURL }) => {
            const getLargeImageURLSpy = jest.spyOn(helpers, "getLargeImageURL");
            getLargeImageURLSpy.mockImplementation(url => url + "_large");

            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                images: urls
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.image).toBe(expectedURL ? expectedURL + "_large" : expectedURL);

            getLargeImageURLSpy.mockRestore();
        });

        it("should scrape images", async () => {
            const getLargeImageURLSpy = jest.spyOn(helpers, "getLargeImageURL");
            getLargeImageURLSpy.mockImplementation(url => url + "_large");

            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                images: [
                    // Invalid,
                    "",

                    // Valid
                    "http://example.com/image",
                    "http://example.com/images/$_12.JPG",
                    "http://example.com/images/$_34.PNG"
                ]
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(getLargeImageURLSpy).toBeCalledTimes(3);
            expect(adInfo).not.toBeNull();
            expect(adInfo!.images).toEqual([
                "http://example.com/image_large",
                "http://example.com/images/$_12.JPG_large",
                "http://example.com/images/$_34.PNG_large"
            ]);

            getLargeImageURLSpy.mockRestore();
        });

        describe("attribute scraping", () => {
            it.each`
                test               | value
                ${"undefined"}     | ${undefined}
                ${"true boolean"}  | ${true}
                ${"false boolean"} | ${false}
                ${"integer"}       | ${123}
                ${"float"}         | ${1.21}
                ${"date"}          | ${new Date("2020-09-06T20:52:47.474Z")}
                ${"string"}        | ${"hello"}
                ${"empty string"}  | ${""}
            `("should scrape attribute ($test)", async ({ value }) => {
                mockResponse(createAdXML({
                    id: "123",
                    title: "My ad title",
                    description: "My ad description",
                    date: new Date(),
                    attributes: {
                        myAttr: { value }
                    }
                }));

                const adInfo = await scraper(FAKE_VALID_AD_URL);
                validateRequest();
                expect(adInfo).not.toBeNull();
                expect(adInfo!.attributes).toEqual({
                    myAttr: value
                });
            });

            it.each`
                test                               | attr                                      | expected
                ${"localized integer"}             | ${{ value: 15, localizedValue: "1.5" }}}  | ${1.5}
                ${"localized float"}               | ${{ value: 2.3, localizedValue: "23" }}}  | ${23}
                ${"non-numeric localized integer"} | ${{ value: 4, localizedValue: "hi" }}}    | ${4}
                ${"non-numeric localized float"}   | ${{ value: 8.1, localizedValue: "bye" }}} | ${8.1}
            `("should scrape numeric attributes with localization ($test)", async ({ attr, expected }) => {
                mockResponse(createAdXML({
                    id: "123",
                    title: "My ad title",
                    description: "My ad description",
                    date: new Date(),
                    attributes: {
                        myAttr: attr
                    }
                }));

                const adInfo = await scraper(FAKE_VALID_AD_URL);
                validateRequest();
                expect(adInfo).not.toBeNull();
                expect(adInfo!.attributes).toEqual({
                    myAttr: expected
                });
            });
        });

        it.each`
            test                    | value        | expected
            ${"no amount"}          | ${undefined} | ${undefined}
            ${"non-numeric amount"} | ${"abc"}     | ${undefined}
            ${"with amount"}        | ${1.23}      | ${1.23}
        `("should scrape price ($test)", async ({ value, expected }) => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                price: value
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.price).toBe(expected);
        });

        it("should scrape location", async () => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                location: "Some location"
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.location).toBe("Some location");
        });

        it("should scrape type", async () => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                type: "Some type"
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.type).toBe("Some type");
        });

        it("should scrape visits", async () => {
            mockResponse(createAdXML({
                id: "123",
                title: "My ad title",
                description: "My ad description",
                date: new Date(),
                visits: 12345
            }));

            const adInfo = await scraper(FAKE_VALID_AD_URL);
            validateRequest();
            expect(adInfo).not.toBeNull();
            expect(adInfo!.attributes.visits).toBe(12345);
        });
    });
});