"use strict";
/**
 * @module index
 */
Object.defineProperty(exports, "__esModule", { value: true });
var tslib_1 = require("tslib");
var react_1 = tslib_1.__importDefault(require("react"));
var Rectangle_1 = tslib_1.__importDefault(require("./Rectangle"));
var Item_1 = tslib_1.__importDefault(require("./Item"));
var utils_1 = require("./utils");
var LOADING_STATUS;
(function (LOADING_STATUS) {
    LOADING_STATUS[LOADING_STATUS["NONE"] = 0] = "NONE";
    LOADING_STATUS[LOADING_STATUS["LOADING"] = 1] = "LOADING";
    LOADING_STATUS[LOADING_STATUS["ENDING"] = 2] = "ENDING";
})(LOADING_STATUS || (LOADING_STATUS = {}));
var VList = /** @class */ (function (_super) {
    tslib_1.__extends(VList, _super);
    function VList() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.startIndex = 0;
        _this.endIndex = 0;
        _this.scrollTop = 0;
        // Cache position info of item rendered
        _this.rects = [];
        // Cache height of item
        _this.cachedHeights = [];
        _this.containerTopValue = 0;
        _this.isLoadingMoreItems = false;
        // The info of anchor element
        // which is the first element in visible range
        _this.anchorItem = { top: 0, index: 0, bottom: 0 };
        _this.node = react_1.default.createRef();
        _this.state = {
            paddingTop: 0,
            visibleItems: [],
            paddingBottom: 0,
            isScrolling: false,
            loadingStatus: LOADING_STATUS.NONE
        };
        _this.updateRects = function () {
            var _a = _this.props, data = _a.data, defaultHeight = _a.defaultItemHeight;
            var length = data.length;
            var lastRect = _this.rects[length - 1];
            var startIndex = _this.rects.length;
            var top = lastRect ? lastRect.getBottom() : 0;
            for (var index = startIndex; index < length; index++) {
                _this.rects.push(new Rectangle_1.default({ top: top, index: index, defaultHeight: defaultHeight }));
                top += defaultHeight;
            }
        };
        _this.updateItemSize = function (args) {
            var rect = args.rect, index = args.index, entries = args.entries;
            var rectangle = _this.rects[index];
            if (!rectangle || rectangle.getHeight() === rect.height) {
                return;
            }
            if (!entries) {
                _this.cachedHeights[index] = rect.height;
            }
            // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
            // The value of top is relative to the top of the scroll container element
            var scrollable = _this.getScrollable();
            var scrollTop = utils_1.isWindow(scrollable) ? window.pageXOffset : scrollable.scrollTop;
            var top = rect.top - _this.containerTopValue + scrollTop;
            if (index === 0) {
                _this.anchorItem = { index: index, top: top, bottom: top + rect.height };
            }
            rectangle.updateRectInfo({ top: top, width: rect.width, height: rect.height, index: index });
        };
        _this.renderItem = function (index) {
            var isScrolling = _this.state.isScrolling;
            var _a = _this.props, data = _a.data, children = _a.children;
            return children(data[index], isScrolling);
        };
        _this.handleScrollEnd = function () {
            // Do something, when scroll stop
            _this.setState({ isScrolling: false });
        };
        _this.handleScroll = function () {
            var scrollable = _this.getScrollable();
            // Use the body element's scrollTop on iOS Safari/Webview
            // Because the documentElement element's scrollTop always is zero
            var scrollTop = (utils_1.isWindow(scrollable) ? utils_1.getDocument() : scrollable).scrollTop;
            // On iOS, we can arrive at negative offsets by swiping past the start.
            // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
            if (scrollTop < 0)
                return;
            var onScroll = _this.props.onScroll;
            onScroll && onScroll(scrollTop);
            // Set a timer to judge scroll of element is stopped
            _this.timer && clearTimeout(_this.timer);
            _this.timer = setTimeout(_this.handleScrollEnd);
            if (scrollTop > _this.scrollTop) {
                _this.scrollUp(scrollTop);
            }
            else if (scrollTop < _this.scrollTop) {
                _this.scrollDown(scrollTop);
            }
            _this.scrollTop = scrollTop;
        };
        return _this;
    }
    VList.prototype.getScrollable = function () {
        var scrollable = this.props.scrollable;
        return scrollable ? scrollable() : this.node.current;
    };
    VList.prototype.updateOffset = function (isScrolling) {
        if (isScrolling === void 0) { isScrolling = true; }
        var _a = this.props, defaultItemHeight = _a.defaultItemHeight, data = _a.data;
        this.setState({
            isScrolling: isScrolling,
            paddingBottom: (data.length - this.endIndex) * defaultItemHeight,
            paddingTop: this.rects[this.startIndex].getTop() - this.rects[0].getTop()
        });
    };
    VList.prototype.getVisibleCount = function () {
        var defaultItemHeight = this.props.defaultItemHeight;
        var scrollable = this.getScrollable();
        var height = utils_1.isWindow(scrollable) ? window.innerHeight : scrollable.offsetHeight;
        return Math.ceil(height / defaultItemHeight);
    };
    VList.prototype.getRenderedItemHeight = function (index) {
        var rectangle = this.rects[index];
        var height = rectangle && rectangle.getHeight();
        if (this.cachedHeights[index] !== height && height > 0) {
            return height;
        }
        // 对于 Viewport 内的数据返回高度一直是 auto,
        // 一是保持自适应，二是能触发element resize事件
        return 'auto';
    };
    VList.prototype.getVisibleItems = function () {
        var items = [];
        for (var index = this.startIndex; index < this.endIndex; index++) {
            items.push(react_1.default.createElement(Item_1.default, { key: index, index: index, onResize: this.updateItemSize, cachedHeights: this.cachedHeights, height: this.getRenderedItemHeight(index) }, this.renderItem));
        }
        return items;
    };
    VList.prototype.initVisibleItems = function () {
        var _a = this.props, data = _a.data, overscan = _a.overscan;
        this.endIndex = Math.min(this.anchorItem.index + this.getVisibleCount() + overscan, data.length);
        this.updateOffset(false);
        this.setState({ visibleItems: this.getVisibleItems() });
    };
    VList.prototype.updateVisibleItems = function (scrollTop) {
        var _a = this.props, overscan = _a.overscan, data = _a.data;
        var rect = this.rects.filter(function (rect) { return rect.getBottom() >= scrollTop; })[0];
        if (!rect)
            return;
        this.anchorItem = rect.getRectInfo();
        var startIndex = Math.max(0, this.anchorItem.index - overscan);
        if (this.startIndex === startIndex)
            return;
        this.startIndex = startIndex;
        this.isLoadingMoreItems = false;
        if (startIndex === 0) {
            this.endIndex = Math.min(this.anchorItem.index + this.getVisibleCount() + overscan, data.length);
        }
        else {
            this.endIndex = Math.min(this.endIndex + overscan, data.length);
        }
        this.updateOffset(false);
        this.setState({ visibleItems: this.getVisibleItems() });
    };
    VList.prototype.scrollUp = function (scrollTop) {
        var _this = this;
        var _a = this.props, data = _a.data, hasMore = _a.hasMore, onLoadItems = _a.onLoadItems, onEnded = _a.onEnded;
        // Hand is scrolling up, scrollTop is increasing
        scrollTop = scrollTop || 0;
        if (this.endIndex >= data.length) {
            if (!this.isLoadingMoreItems && hasMore) {
                this.isLoadingMoreItems = true;
                this.setState({ paddingBottom: 0, loadingStatus: LOADING_STATUS.LOADING });
                if (onLoadItems) {
                    onLoadItems(function () {
                        var isEnded = !hasMore && onEnded;
                        _this.setState({ loadingStatus: isEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
                    });
                }
            }
        }
        else if (scrollTop > this.anchorItem.bottom) {
            this.updateOffset(true);
            this.updateVisibleItems(scrollTop);
        }
    };
    VList.prototype.scrollDown = function (scrollTop) {
        // Hand is scrolling down, scrollTop is decreasing
        if (scrollTop < this.anchorItem.top) {
            this.updateOffset(true);
            this.updateVisibleItems(scrollTop);
        }
    };
    VList.prototype.componentDidMount = function () {
        var scrollable = this.getScrollable();
        if (!utils_1.isWindow(scrollable)) {
            this.containerTopValue = scrollable.getBoundingClientRect().top;
        }
        this.updateRects();
        this.initVisibleItems();
        scrollable.addEventListener('scroll', this.handleScroll, utils_1.supportsPassive ? { passive: true, capture: false } : false);
    };
    VList.prototype.componentWillUnmount = function () {
        var scrollable = this.getScrollable();
        clearTimeout(this.timer);
        scrollable.removeEventListener('scroll', this.handleScroll);
    };
    VList.prototype.renderLoading = function () {
        var loadingStatus = this.state.loadingStatus;
        var _a = this.props, onLoading = _a.onLoading, onEnded = _a.onEnded;
        if (onEnded && loadingStatus === LOADING_STATUS.ENDING) {
            return onEnded();
        }
        if (onLoading && loadingStatus === LOADING_STATUS.LOADING) {
            return onLoading();
        }
        return null;
    };
    VList.prototype.render = function () {
        var _a = this.state, paddingTop = _a.paddingTop, paddingBottom = _a.paddingBottom, visibleItems = _a.visibleItems;
        var _b = this.props, data = _b.data, style = _b.style, className = _b.className, hasMore = _b.hasMore, placeholder = _b.placeholder, onLoading = _b.onLoading;
        if (hasMore && !data.length) {
            return (react_1.default.createElement("div", { style: style, ref: this.node, className: className }, onLoading && onLoading()));
        }
        return (react_1.default.createElement("div", { style: style, ref: this.node, className: className }, visibleItems.length ? (react_1.default.createElement("div", { style: { paddingTop: paddingTop, paddingBottom: paddingBottom } },
            visibleItems,
            this.renderLoading(),
            ";")) : (placeholder)));
    };
    VList.defaultProps = {
        overscan: 6,
        hasMore: false
    };
    return VList;
}(react_1.default.PureComponent));
exports.default = VList;
