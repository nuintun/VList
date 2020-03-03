/**
 * @module Item
 */
import { __extends } from "tslib";
import React from 'react';
import ResizeObserver from 'resize-observer-polyfill';
var Item = /** @class */ (function (_super) {
    __extends(Item, _super);
    function Item() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.node = React.createRef();
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
        var observer = new ResizeObserver(this.cacheItemSize);
        observer.observe(node);
        this.observer = observer;
    };
    Item.prototype.componentWillUnmount = function () {
        this.observer.disconnect();
    };
    Item.prototype.render = function () {
        var _a = this.props, index = _a.index, height = _a.height, children = _a.children;
        return (React.createElement("div", { ref: this.node, style: { minHeight: height } }, children(index)));
    };
    Item.defaultProps = {
        height: 'auto'
    };
    return Item;
}(React.PureComponent));
export default Item;
