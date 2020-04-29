/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import { supportsPassive } from './utils';
import Item, { ResizeEvent } from './Item';

export interface VListProps {
  data: any[];
  hasMore?: boolean;
  overscan?: number;
  className?: string;
  defaultItemHeight: number;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  onEnded?: () => React.ReactNode;
  onLoading?: () => React.ReactNode;
  onScroll?: (scrollTop: number) => void;
  onLoadItems?: (resolve: () => void) => void;
  scroller?: (node: HTMLElement) => HTMLElement;
  children: (item: any, isScrolling: boolean) => React.ReactNode;
}

const enum STATUS {
  NONE,
  LOADING,
  ENDING
}

interface VListState {
  status: STATUS;
  paddingTop: number;
  visibleItems: any[];
  isScrolling: boolean;
  paddingBottom: number;
}

type useCapture = { passive: boolean; capture: boolean } | boolean;

export default class VList extends React.PureComponent<VListProps, VListState> {
  static defaultProps = {
    overscan: 1,
    hasMore: false
  };

  private timer: number;

  private startIndex: number = 0;

  private endIndex: number = 0;

  private scrollTop: number = 0;

  // Cache position info of item rendered
  private rects: Rectangle[] = [];

  private isLoadingItems: boolean = false;

  private node: React.RefObject<HTMLDivElement> = React.createRef();

  // The info of anchor element
  // which is the first element in visible range
  private anchor: Rectangle = new Rectangle({ index: 0, height: this.props.defaultItemHeight });

  public state: VListState = {
    paddingTop: 0,
    visibleItems: [],
    paddingBottom: 0,
    isScrolling: false,
    status: STATUS.NONE
  };

  private updateRects = (): void => {
    const { rects }: VList = this;
    const rows: number = this.props.data.length;
    const { length: rectRows }: Rectangle[] = rects;

    if (rows < rectRows) {
      this.rects = rects.slice(0, rows);
    } else if (rows > rectRows) {
      const rectangle: Rectangle = rects[rectRows - 1];
      const { defaultItemHeight: height }: VListProps = this.props;

      // If rectangle not exists, is first initialize
      let top: number = rectangle ? rectangle.bottom : 0;

      for (let index: number = rectRows; index < rows; index++) {
        rects.push(new Rectangle({ top, index, height }));

        // Cumulative height
        top += height;
      }
    }
  };

  private get scroller(): HTMLElement {
    const { scroller }: VListProps = this.props;
    const node: HTMLElement = this.node.current as HTMLDivElement;

    return scroller ? scroller(node) : (this.node.current as HTMLDivElement);
  }

  private updateRectsAfter(rect: Rectangle): void {
    const { rects }: VList = this;

    let top: number = rect.bottom;

    // Only need update to end index
    for (let index: number = rect.index + 1; index < this.endIndex; index++) {
      const rectangle: Rectangle = rects[index];

      rectangle.update({ top });

      top += rectangle.height;
    }
  }

  private onItemResize = ({ index, rect }: ResizeEvent): void => {
    const rectangle: Rectangle = this.rects[index];

    if (rectangle) {
      const { height }: DOMRect = rect;
      const { scroller }: VList = this;
      const anchorIndex: number = this.anchor.index;
      const scrollerRect: DOMRect = scroller.getBoundingClientRect();
      const top: number = rect.top - scrollerRect.top + scroller.scrollTop;

      // Update rect
      rectangle.update({ top, index, height });

      // Update rects after current
      this.updateRectsAfter(rectangle);

      // Update anchor
      if (index === anchorIndex) {
        this.anchor = rectangle;
      }

      // Update items
      if (index === anchorIndex || index === this.startIndex || index === this.endIndex) {
        this.updateVisibleItems();
      }
    }
  };

  private updateOffset(): void {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;

    this.setState({
      paddingTop: rectRows > this.startIndex ? rects[this.startIndex].top : 0,
      paddingBottom: rectRows && rectRows > this.endIndex ? rects[rectRows - 1].bottom - rects[this.endIndex].top : 0
    });
  }

  private getVisibleCount(): number {
    const height: number = this.scroller.offsetHeight;
    const { defaultItemHeight }: VListProps = this.props;

    return Math.ceil(height / defaultItemHeight);
  }

  private renderItem = (data: any): React.ReactNode => {
    const { children }: VListProps = this.props;
    const { isScrolling }: VListState = this.state;

    return children(data, isScrolling);
  };

  private getVisibleItems(): React.ReactNode[] {
    const { endIndex }: VList = this;
    const items: React.ReactNode[] = [];
    const { data }: VListProps = this.props;

    for (let index: number = this.startIndex; index < endIndex; index++) {
      items.push(
        <Item key={index} data={data[index]} index={index} onResize={this.onItemResize}>
          {this.renderItem}
        </Item>
      );
    }

    return items;
  }

  private getAnchor(scrollTop: number): Rectangle {
    const { rects, anchor }: VList = this;
    const anchorTop: number = anchor.top;

    if (anchorTop > scrollTop) {
      for (let index: number = anchor.index; index >= 0; index--) {
        const rect: Rectangle = rects[index];

        if (rect && rect.top <= scrollTop) return rect;
      }
    }

    const anchorBottom: number = anchor.bottom;

    if (anchorBottom < scrollTop) {
      const { length: rectRows }: Rectangle[] = rects;

      for (let index: number = anchor.index; index < rectRows; index++) {
        const rect: Rectangle = rects[index];

        if (rect && rect.bottom >= scrollTop) return rect;
      }
    }

    return anchor;
  }

  private getStartIndex(anchor: Rectangle): number {
    const { rects }: VList = this;
    const { overscan }: VListProps = this.props;
    const { length: rectRows }: Rectangle[] = rects;

    if (!rectRows) return 0;

    return Math.max(0, Math.min(rectRows - 1, anchor.index) - (overscan as number));
  }

  private getEndIndex(anchor: Rectangle): number {
    const { rects }: VList = this;
    const { overscan }: VListProps = this.props;
    const { length: rectRows }: Rectangle[] = rects;

    return Math.min(rectRows, anchor.index + this.getVisibleCount() + (overscan as number) + 1);
  }

  private updateVisibleItems(): void {
    // Update offset
    this.updateOffset();

    // Update items
    this.setState({ visibleItems: this.getVisibleItems() });
  }

  private scrollUpdate(scrollTop: number): void {
    const anchor: Rectangle = this.getAnchor(scrollTop);

    if (anchor !== this.anchor) {
      this.anchor = anchor;

      const startIndex: number = this.getStartIndex(anchor);
      const endIndex: number = this.getEndIndex(anchor);

      if (this.startIndex !== startIndex || this.endIndex !== endIndex) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;

        this.updateVisibleItems();
      }
    }
  }

  private onLoadItems(): void {
    const { hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (!this.isLoadingItems && onLoadItems) {
      if (hasMore) {
        this.isLoadingItems = true;

        this.setState({ status: STATUS.LOADING });

        onLoadItems((): void => {
          this.isLoadingItems = false;

          this.scroller.scrollTop = this.scrollTop;

          this.setState({ status: onEnded ? STATUS.ENDING : STATUS.NONE });
        });
      } else {
        this.setState({ status: onEnded ? STATUS.ENDING : STATUS.NONE });
      }
    }
  }

  private scrollUp(scrollTop: number): void {
    const rows: number = this.props.data.length;

    if (this.endIndex >= rows) {
      this.onLoadItems();
    } else if (scrollTop > this.anchor.bottom) {
      this.scrollUpdate(scrollTop);
    }
  }

  private scrollDown(scrollTop: number): void {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchor.top) {
      this.scrollUpdate(scrollTop);
    }
  }

  private handleScrollEnd = (): void => {
    // Do something, when scroll stop
    this.setState({ isScrolling: false });
  };

  private handleScroll = (): void => {
    const { onScroll }: VListProps = this.props;
    // Use the body element's scrollTop on iOS Safari/Webview
    // Because the documentElement element's scrollTop always is zero
    const { scrollTop }: HTMLElement = this.scroller;

    // On iOS, we can arrive at negative offsets by swiping past the start.
    // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
    if (scrollTop >= 0) {
      clearTimeout(this.timer);

      this.setState({ isScrolling: true });

      // Set a timer to judge scroll of element is stopped
      this.timer = setTimeout(this.handleScrollEnd, 150);

      if (scrollTop > this.scrollTop) {
        this.scrollUp(scrollTop);
      } else if (scrollTop < this.scrollTop) {
        this.scrollDown(scrollTop);
      }

      this.scrollTop = scrollTop;
    }

    // Trigger user scroll handle
    onScroll && onScroll(scrollTop);
  };

  public componentDidMount(): void {
    const scroller: HTMLElement = this.scroller;
    const rows: number = this.props.data.length;
    const capture: useCapture = supportsPassive ? { passive: true, capture: false } : false;

    this.updateRects();
    this.updateVisibleItems();

    !rows && this.onLoadItems();

    scroller.addEventListener('scroll', this.handleScroll, capture);
  }

  public componentDidUpdate({ data: prevData }: VListProps): void {
    const { data }: VListProps = this.props;

    if (data !== prevData) {
      this.updateRects();

      this.anchor = this.getAnchor(this.scrollTop);

      this.startIndex = this.getStartIndex(this.anchor);
      this.endIndex = this.getEndIndex(this.anchor);

      this.updateVisibleItems();
    }
  }

  public componentWillUnmount(): void {
    clearTimeout(this.timer);

    const scroller: HTMLElement = this.scroller;
    const capture: useCapture = supportsPassive ? { passive: true, capture: false } : false;

    scroller.removeEventListener('scroll', this.handleScroll, capture);
  }

  private renderLoading(): React.ReactNode {
    const { status }: VListState = this.state;
    const { data, hasMore, onLoading, onEnded }: VListProps = this.props;

    if (this.endIndex < data.length) return null;

    switch (status) {
      case STATUS.LOADING:
        return hasMore && onLoading ? onLoading() : null;
      case STATUS.ENDING:
        return !hasMore && onEnded ? onEnded() : null;
      default:
        return null;
    }
  }

  private renderStatus(): React.ReactNode {
    const { data, hasMore, placeholder }: VListProps = this.props;

    if (!hasMore && !data.length) return placeholder;

    return this.renderLoading();
  }

  public render(): React.ReactNode {
    const { style, className }: VListProps = this.props;
    const { paddingTop, paddingBottom, visibleItems }: VListState = this.state;

    return (
      <div style={style} ref={this.node} className={className}>
        <div style={{ paddingTop, paddingBottom }}>
          {visibleItems}
          {this.renderStatus()}
        </div>
      </div>
    );
  }
}
