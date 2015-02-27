//ad-parser.js
/*Helper functions for Kijiji ad objects*/

/*Nicely formats a date string*/
var parseDateString = function(dateStr) {
    var date = new Date(dateStr);
    var m = ("0" + (date.getMonth()+1)).slice(-2);
    var d = ("0" + date.getDate()).slice(-2);
    var y = date.getFullYear();
    var hrs = ("0" + date.getHours()).slice(-2);
    var mins = ("0" + date.getMinutes()).slice(-2);
    return m + "/" + d + "/" + y + " @ " + hrs + ":" + mins;
}

/*Converts a Kijiji innerAd object to a string*/
var innerAdToString = function(ad) {
    var str = "";
    
    //Add each inner ad property
    for (var prop in ad.info) {
        if (ad.info.hasOwnProperty(prop)) {
            str += "   >" + prop + ": " + ad.info[prop] + "\r\n";
        }
    }
    
    return str;
};

/*Converts a Kijiji ad object to a string*/
var adToString = function(ad) {
    //If this is an inner ad, just parse this
    if (!ad.hasOwnProperty("innerAd")) {
        return ad.title + "\r\n" + innerAdToString(ad);
        
    //Otherwise, parse the inner ad
    } else {
    
        var date = parseDateString(ad["dc:date"]);
        var str = "[" + date + "] " + ad.title + "\r\n" +
                  "   >Link: " + ad.link + "\r\n";
        str += innerAdToString(ad.innerAd);
        return str;    
    }
};

module.exports = adToString;
