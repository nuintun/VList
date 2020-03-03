"use strict";
/**
 * @module utils
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportsPassive = (function () {
    // Test via a getter in the options object to see
    // if the passive property is accessed
    var supportsPassive = false;
    // Start test
    try {
        var options = Object.defineProperty({}, 'passive', {
            get: function () { return (supportsPassive = true); }
        });
        window.addEventListener('test', function () { return true; }, options);
    }
    catch (_a) {
        // Not supports passive
    }
    return supportsPassive;
})();
function isWindow(node) {
    return node === document.defaultView;
}
exports.isWindow = isWindow;
function getDocument() {
    var body = document.body;
    return body.scrollTop ? body : document.documentElement;
}
exports.getDocument = getDocument;
