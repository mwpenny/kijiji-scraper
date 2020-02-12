const kijiji = require('../');
jest.setTimeout(30000);

describe('kijiji-scraper', () => {

    describe('class search', () => {

        describe('method search', () => {

            let results;

            beforeAll(async () => {
                results = await kijiji.search({
                    categoryId: 27,
                    locationId: 1700185,
                });
            });

            it('should return results array', () => {
                expect(results.length).toBeGreaterThan(0);
            });

            it('should contain the url of an item', () => {
                expect(results[0].url).toContain('http');
            });

        });

    });

});
