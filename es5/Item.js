"use strict";
/**
 * @module Item
 */
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var react_1 = tslib_1.__importDefault(require("react"));
var resize_observer_polyfill_1 = tslib_1.__importDefault(require("resize-observer-polyfill"));
var Item = /** @class */ (function (_super) {
    tslib_1.__extends(Item, _super);
    function Item() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.node = react_1.default.createRef();
        _this.cacheItemSize = function (entries) {
            var node = _this.node.current;
            if (node) {
                var rect = node.getBoundingClientRect();
                var _a = _this.props, index = _a.index, cachedHeights = _a.cachedHeights;
                if (cachedHeights[index] !== rect.height) {
                    _this.props.onResize({ rect: rect, index: index, entries: entries });
                }
            }
        };
        return _this;
    }
    Item.prototype.componentDidMount = function () {
        var node = this.node.current;
        var observer = new resize_observer_polyfill_1.default(this.cacheItemSize);
        observer.observe(node);
        this.observer = observer;
    };
    Item.prototype.componentWillUnmount = function () {
        this.observer.disconnect();
    };
    Item.prototype.render = function () {
        var _a = this.props, index = _a.index, height = _a.height, children = _a.children;
        return (react_1.default.createElement("div", { ref: this.node, style: { minHeight: height } }, children(index)));
    };
    Item.defaultProps = {
        height: 'auto'
    };
    return Item;
}(react_1.default.PureComponent));
exports.default = Item;
