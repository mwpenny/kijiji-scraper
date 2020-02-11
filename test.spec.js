const kijiji = require('./');
jest.setTimeout(30000);

describe('kijiji-scraper', () => {

    describe('categories', () => {

        it('should return you the kijiji category id for cars and vehicles', () => {
            expect(kijiji.categories.CARS_AND_VEHICLES.id).toBe(27);
        });

    });

    describe('locations', () => {

        it('should be able to return the kijiji location id of Ottawa', () => {
            expect(kijiji.locations.ONTARIO.OTTAWA_GATINEAU_AREA.OTTAWA.id).toBe(1700185);
        });

    });

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
