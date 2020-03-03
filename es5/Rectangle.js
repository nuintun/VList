"use strict";
/**
 * @module Rectangle
 */
Object.defineProperty(exports, "__esModule", { value: true });
var Rectangle = /** @class */ (function () {
    function Rectangle(_a) {
        var _b = _a.top, top = _b === void 0 ? 0 : _b, _c = _a.left, left = _c === void 0 ? 0 : _c, _d = _a.index, index = _d === void 0 ? 0 : _d, _e = _a.width, width = _e === void 0 ? 0 : _e, _f = _a.height, height = _f === void 0 ? 0 : _f, _g = _a.defaultHeight, defaultHeight = _g === void 0 ? 0 : _g;
        this.top = top;
        this.left = left;
        this.index = index;
        this.width = width;
        this.height = height;
        this.defaultHeight = defaultHeight;
    }
    Rectangle.prototype.getTop = function () {
        return this.top;
    };
    Rectangle.prototype.getHeight = function () {
        return this.height;
    };
    Rectangle.prototype.getBottom = function () {
        return this.top + (this.height || this.defaultHeight);
    };
    Rectangle.prototype.getIndex = function () {
        return this.index;
    };
    Rectangle.prototype.getRectInfo = function () {
        return {
            top: this.top,
            left: this.left,
            index: this.index,
            width: this.width,
            height: this.height,
            bottom: this.top + (this.height || this.defaultHeight)
        };
    };
    Rectangle.prototype.updateRectInfo = function (_a) {
        var _b = _a.top, top = _b === void 0 ? 0 : _b, _c = _a.left, left = _c === void 0 ? 0 : _c, _d = _a.index, index = _d === void 0 ? 0 : _d, _e = _a.width, width = _e === void 0 ? 0 : _e, _f = _a.height, height = _f === void 0 ? 0 : _f;
        this.top = top || this.top;
        this.left = left || this.left;
        this.index = index || this.index;
        this.width = width || this.width;
        this.height = height || this.height;
    };
    return Rectangle;
}());
exports.default = Rectangle;
