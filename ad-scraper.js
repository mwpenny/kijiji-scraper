//ad-scraper.js
/*Scrapes a Kijiji ad and returns its information*/

var request = require("request");
var cheerio = require("cheerio");

/*Parses the HTML of a Kijiji ad for its important information*/
var parseHTML = function(html) {
    var ad = {"info": []};
    var $ = cheerio.load(html);

    //Get ad title and main image
    ad.title = $("span[itemprop=name]").text();
    ad.image = $("img[itemprop=image]").attr("src");
    
    //Remove link to map and dividers from info table
    $("#MapLink").remove();
    $(".divider").remove();
    
    //Get ad properties from info table
    $("table.ad-attributes tr").each(function(i,tr) {
        var field = $(tr).find("th").text().trim();
        var value = $(tr).find("td").text().trim();
                
        ad.info[field] = value;
    });
    
    //Get ad description
    ad.desc = $("span[itemprop=description]").text().trim();
    
    return ad;
}

/*Scrapes the passed Kijiji ad URL*/
var scrape = function(url, callback) {
    request(url, function(err, res, body) {
        if (err) return callback(err, null);
        callback(null, parseHTML(body));
    });
}

module.exports = scrape;
