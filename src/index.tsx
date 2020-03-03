/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import Item, { SizeInfo } from './Item';
import { getDocument, isWindow, supportsPassive } from './utils';

export interface VListProps {
  data: any[];
  hasMore?: boolean;
  overscan?: number;
  className?: string;
  defaultItemHeight: number;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  scrollable?: () => HTMLElement;
  onEnded?: () => React.ReactNode;
  onLoading?: () => React.ReactNode;
  onScroll?: (scrollTop: number) => void;
  onLoadItems?: (resolve: () => void) => void;
  children: (item: any, isScrolling: boolean) => React.ReactNode;
}

enum LOADING_STATUS {
  NONE,
  LOADING,
  ENDING
}

interface VListState {
  paddingTop: number;
  visibleItems: any[];
  isScrolling: boolean;
  paddingBottom: number;
  loadingStatus: LOADING_STATUS;
}

interface Anchor {
  top: number;
  index: number;
  bottom: number;
}

export default class VList extends React.PureComponent<VListProps> {
  static defaultProps = {
    overscan: 6,
    hasMore: false
  };

  private timer: number;

  private startIndex: number = 0;

  private endIndex: number = 0;

  private scrollTop: number = 0;

  // Cache position info of item rendered
  private rects: Rectangle[] = [];

  // Cache height of item
  private cachedHeights: number[] = [];

  private containerTopValue: number = 0;

  private isLoadingMoreItems: boolean = false;

  // The info of anchor element
  // which is the first element in visible range
  private anchorItem: Anchor = { top: 0, index: 0, bottom: 0 };

  private node: React.RefObject<HTMLDivElement> = React.createRef();

  public state: VListState = {
    paddingTop: 0,
    visibleItems: [],
    paddingBottom: 0,
    isScrolling: false,
    loadingStatus: LOADING_STATUS.NONE
  };

  updateRects = () => {
    const { data, defaultItemHeight: defaultHeight }: VListProps = this.props;

    const length: number = data.length;
    const lastRect: Rectangle = this.rects[length - 1];
    const { length: startIndex }: Rectangle[] = this.rects;

    let top = lastRect ? lastRect.getBottom() : 0;

    for (let index = startIndex; index < length; index++) {
      this.rects.push(new Rectangle({ top, index, defaultHeight }));

      top += defaultHeight;
    }
  };

  private getScrollable(): HTMLElement | Window {
    const { scrollable }: VListProps = this.props;

    return scrollable ? scrollable() : (this.node.current as HTMLDivElement);
  }

  private updateItemSize = (args: SizeInfo): void => {
    const { rect, index, entries }: SizeInfo = args;

    const rectangle = this.rects[index];

    if (!rectangle || rectangle.getHeight() === rect.height) {
      return;
    }

    if (!entries) {
      this.cachedHeights[index] = rect.height;
    }

    // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
    // The value of top is relative to the top of the scroll container element
    const scrollable: HTMLElement | Window = this.getScrollable();
    const scrollTop: number = isWindow(scrollable) ? window.pageXOffset : (scrollable as HTMLElement).scrollTop;
    const top: number = rect.top - this.containerTopValue + scrollTop;

    if (index === 0) {
      this.anchorItem = { index, top, bottom: top + rect.height };
    }

    rectangle.updateRectInfo({ top, width: rect.width, height: rect.height, index });
  };

  private updateOffset(isScrolling: boolean = true): void {
    const { defaultItemHeight, data }: VListProps = this.props;

    this.setState({
      isScrolling,
      paddingBottom: (data.length - this.endIndex) * defaultItemHeight,
      paddingTop: this.rects[this.startIndex].getTop() - this.rects[0].getTop()
    });
  }

  getVisibleCount(): number {
    const { defaultItemHeight }: VListProps = this.props;
    const scrollable: HTMLElement | Window = this.getScrollable();
    const height = isWindow(scrollable) ? window.innerHeight : (scrollable as HTMLElement).offsetHeight;

    return Math.ceil(height / defaultItemHeight);
  }

  renderItem = (index: number): React.ReactNode => {
    const { isScrolling }: VListState = this.state;
    const { data, children }: VListProps = this.props;

    return children(data[index], isScrolling);
  };

  getRenderedItemHeight(index: number): number | 'auto' {
    const rectangle: Rectangle = this.rects[index];
    const height: number = rectangle && rectangle.getHeight();

    if (this.cachedHeights[index] !== height && height > 0) {
      return height;
    }

    // 对于 Viewport 内的数据返回高度一直是 auto,
    // 一是保持自适应，二是能触发element resize事件
    return 'auto';
  }

  getVisibleItems(): React.ReactNode[] {
    const items: React.ReactNode[] = [];

    for (let index: number = this.startIndex; index < this.endIndex; index++) {
      items.push(
        <Item
          key={index}
          index={index}
          onResize={this.updateItemSize}
          cachedHeights={this.cachedHeights}
          height={this.getRenderedItemHeight(index)}
        >
          {this.renderItem}
        </Item>
      );
    }

    return items;
  }

  initVisibleItems(): void {
    const { data, overscan }: VListProps = this.props;

    this.endIndex = Math.min(this.anchorItem.index + this.getVisibleCount() + (overscan as number), data.length);

    this.updateOffset(false);
    this.setState({ visibleItems: this.getVisibleItems() });
  }

  updateVisibleItems(scrollTop: number): void {
    const { overscan, data }: VListProps = this.props;
    const rect: Rectangle = this.rects.filter(rect => rect.getBottom() >= scrollTop)[0];

    if (!rect) return;

    this.anchorItem = rect.getRectInfo();

    const startIndex = Math.max(0, this.anchorItem.index - (overscan as number));

    if (this.startIndex === startIndex) return;

    this.startIndex = startIndex;
    this.isLoadingMoreItems = false;

    if (startIndex === 0) {
      this.endIndex = Math.min(this.anchorItem.index + this.getVisibleCount() + (overscan as number), data.length);
    } else {
      this.endIndex = Math.min(this.endIndex + (overscan as number), data.length);
    }

    this.updateOffset(false);
    this.setState({ visibleItems: this.getVisibleItems() });
  }

  scrollUp(scrollTop: number) {
    const { data, hasMore, onLoadItems, onEnded }: VListProps = this.props;

    // Hand is scrolling up, scrollTop is increasing
    scrollTop = scrollTop || 0;

    if (this.endIndex >= data.length) {
      if (!this.isLoadingMoreItems && hasMore) {
        this.isLoadingMoreItems = true;

        this.setState({ paddingBottom: 0, loadingStatus: LOADING_STATUS.LOADING });

        if (onLoadItems) {
          onLoadItems(() => {
            const isEnded: boolean = !hasMore && onEnded;

            this.setState({ loadingStatus: isEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
          });
        }
      }
    } else if (scrollTop > this.anchorItem.bottom) {
      this.updateOffset(true);
      this.updateVisibleItems(scrollTop);
    }
  }

  scrollDown(scrollTop: number) {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchorItem.top) {
      this.updateOffset(true);
      this.updateVisibleItems(scrollTop);
    }
  }

  handleScrollEnd = (): void => {
    // Do something, when scroll stop
    this.setState({ isScrolling: false });
  };

  handleScroll = () => {
    const scrollable: HTMLElement | Window = this.getScrollable();
    // Use the body element's scrollTop on iOS Safari/Webview
    // Because the documentElement element's scrollTop always is zero
    const { scrollTop }: HTMLElement = isWindow(scrollable) ? getDocument() : (scrollable as HTMLElement);

    // On iOS, we can arrive at negative offsets by swiping past the start.
    // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
    if (scrollTop < 0) return;

    const { onScroll }: VListProps = this.props;

    onScroll && onScroll(scrollTop);

    // Set a timer to judge scroll of element is stopped
    this.timer && clearTimeout(this.timer);
    this.timer = setTimeout(this.handleScrollEnd);

    if (scrollTop > this.scrollTop) {
      this.scrollUp(scrollTop);
    } else if (scrollTop < this.scrollTop) {
      this.scrollDown(scrollTop);
    }

    this.scrollTop = scrollTop;
  };

  componentDidMount() {
    const scrollable: HTMLElement | Window = this.getScrollable();

    if (!isWindow(scrollable)) {
      this.containerTopValue = (scrollable as HTMLElement).getBoundingClientRect().top;
    }

    this.updateRects();
    this.initVisibleItems();

    scrollable.addEventListener('scroll', this.handleScroll, supportsPassive ? { passive: true, capture: false } : false);
  }

  componentWillUnmount() {
    const scrollable: HTMLElement | Window = this.getScrollable();

    clearTimeout(this.timer);

    scrollable.removeEventListener('scroll', this.handleScroll);
  }

  renderLoading() {
    const { loadingStatus }: VListState = this.state;
    const { onLoading, onEnded }: VListProps = this.props;

    if (onEnded && loadingStatus === LOADING_STATUS.ENDING) {
      return onEnded();
    }

    if (onLoading && loadingStatus === LOADING_STATUS.LOADING) {
      return onLoading();
    }

    return null;
  }

  render(): React.ReactNode {
    const { paddingTop, paddingBottom, visibleItems }: VListState = this.state;
    const { data, style, className, hasMore, placeholder, onLoading }: VListProps = this.props;

    if (hasMore && !data.length) {
      return (
        <div style={style} ref={this.node} className={className}>
          {onLoading && onLoading()}
        </div>
      );
    }

    return (
      <div style={style} ref={this.node} className={className}>
        {visibleItems.length ? (
          <div style={{ paddingTop, paddingBottom }}>
            {visibleItems}
            {this.renderLoading()};
          </div>
        ) : (
          placeholder
        )}
      </div>
    );
  }
}
