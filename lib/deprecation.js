// deprecation.js
/* Helper functions for notifying users about the recent changes in this
   module instead of just failing with no explanation */

const API_CHANGE_NOTICE = "kijiji-scraper has been refactored and improved, and its API has changed.";
const README_LINK_NOTICE = "See https://github.com/mwpenny/kijiji-scraper/blob/master/README.md for information on the new API.";

class APIChangeNotice extends Error {
    constructor(oldProp, newProp) {
        let message = `${API_CHANGE_NOTICE}\n'${oldProp}' has become '${newProp}'. Please use that instead.\n${README_LINK_NOTICE}\n`;
        super(message);
        this.name = "APIChangeNotice";
    }
}

module.exports = APIChangeNotice;
