/**
 * @module utils
 */
export var supportsPassive = (function () {
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
export function isWindow(node) {
    return node === document.defaultView;
}
export function getDocument() {
    var body = document.body;
    return body.scrollTop ? body : document.documentElement;
}
