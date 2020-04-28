/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import Item, { SizeInfo } from './Item';
import { supportsPassive } from './utils';

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
  scrollable?: (node: HTMLElement) => HTMLElement;
  children: (item: any, isScrolling: boolean) => React.ReactNode;
}

const enum LOADING_STATUS {
  NONE,
  LOADING,
  ENDING
}

interface VListState {
  rows: number;
  paddingTop: number;
  visibleItems: any[];
  isScrolling: boolean;
  paddingBottom: number;
  loading: LOADING_STATUS;
}

export default class VList extends React.PureComponent<VListProps> {
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

  private scrollableTop: number = 0;

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
    rows: this.props.data.length,
    loading: LOADING_STATUS.NONE
  };

  static getDerivedStateFromProps(props: VListProps, state: VListState): { rows: number } | null {
    const rows: number = props.data.length;

    return rows !== state.rows ? { rows } : null;
  }

  private updateRects = (): void => {
    const { rows }: VListState = this.state;
    const { length }: Rectangle[] = this.rects;

    if (rows < length) {
      this.rects = this.rects.slice(0, rows);
    } else if (rows > length) {
      const rectangle: Rectangle = this.rects[rows - 1];
      const { defaultItemHeight: height }: VListProps = this.props;

      let index: number = length;
      // If rectangle not exists, is first initialize
      let top: number = rectangle ? rectangle.getBottom() : this.scrollableTop;

      for (; index < rows; index++) {
        this.rects.push(new Rectangle({ top, index, height }));

        top += height;
      }
    }
  };

  private getScrollable(): HTMLElement {
    const { scrollable }: VListProps = this.props;
    const node: HTMLElement = this.node.current as HTMLDivElement;

    return scrollable ? scrollable(node) : (this.node.current as HTMLDivElement);
  }

  private updateRectsAfter(rect: Rectangle): void {
    const { rects }: VList = this;
    const { rows }: VListState = this.state;

    let top: number = rect.getBottom();
    let index: number = rect.getIndex() + 1;

    for (; index < rows; index++) {
      const rectangle: Rectangle = rects[index];

      rectangle.updateRect({ top });

      top += rectangle.getHeight();
    }
  }

  private onItemResize = (size: SizeInfo): void => {
    const { rect, index }: SizeInfo = size;
    const rectangle: Rectangle = this.rects[index];

    if (rectangle) {
      const { height }: DOMRect = rect;
      const anchorIndex: number = this.anchor.getIndex();
      // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
      // The value of top is relative to the top of the scroll container element
      const top: number = rect.top - this.scrollableTop + this.getScrollable().scrollTop;

      // Update rect
      rectangle.updateRect({ top, index, height });

      // Update rects after current
      this.updateRectsAfter(rectangle);

      // Update anchor
      if (index === anchorIndex) {
        this.setAnchor(rectangle);
      }

      // Update items
      if (index === anchorIndex || index === this.startIndex || index === this.endIndex) {
        this.updateVisibleItems();
      }
    }
  };

  private updateScrolling = (isScrolling: boolean): void => {
    this.setState({ isScrolling });
  };

  private updateOffset(): void {
    const { rects }: VList = this;
    const { rows }: VListState = this.state;
    const { defaultItemHeight }: VListProps = this.props;

    this.setState({
      paddingBottom: (rows - this.endIndex) * defaultItemHeight,
      paddingTop: rects.length ? rects[this.startIndex].getTop() - rects[0].getTop() : 0
    });
  }

  private getVisibleCount(): number {
    const { defaultItemHeight }: VListProps = this.props;
    const height: number = this.getScrollable().offsetHeight;

    return Math.ceil(height / defaultItemHeight);
  }

  private renderItem = (data: any): React.ReactNode => {
    const { children }: VListProps = this.props;
    const { isScrolling }: VListState = this.state;

    return children(data, isScrolling);
  };

  private getVisibleItems(): React.ReactNode[] {
    const items: React.ReactNode[] = [];
    const { data }: VListProps = this.props;

    for (let index: number = this.startIndex; index < this.endIndex; index++) {
      items.push(
        <Item key={index} data={data[index]} index={index} onResize={this.onItemResize}>
          {this.renderItem}
        </Item>
      );
    }

    return items;
  }

  private getAnchor(scrollTop: number): Rectangle {
    const { rects }: VList = this;
    const { length }: Rectangle[] = rects;

    for (let index: number = 0; index < length; index++) {
      const rect: Rectangle = rects[index];

      if (rect.getBottom() >= scrollTop) return rect;
    }

    return this.anchor;
  }

  private setAnchor(anchor: Rectangle): void {
    this.anchor = anchor;
  }

  private getStartIndex(anchor: Rectangle): number {
    const { overscan }: VListProps = this.props;

    return Math.max(0, anchor.getIndex() - (overscan as number));
  }

  private getEndIndex(anchor: Rectangle): number {
    const { rows }: VListState = this.state;
    const { overscan }: VListProps = this.props;

    return Math.min(anchor.getIndex() + this.getVisibleCount() + (overscan as number) + 1, rows);
  }

  private updateVisibleItems(): void {
    this.updateOffset();
    this.setState({ visibleItems: this.getVisibleItems() });
  }

  private scrollUpdate(scrollTop: number): void {
    const anchor: Rectangle = this.getAnchor(scrollTop);

    if (anchor !== this.anchor) {
      const startIndex: number = this.getStartIndex(anchor);
      const endIndex: number = this.getEndIndex(anchor);

      this.setAnchor(anchor);

      if (this.startIndex !== startIndex || this.endIndex !== endIndex) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;

        this.updateVisibleItems();
      }
    }
  }

  private onLoadItems(): void {
    const { onLoadItems, onEnded }: VListProps = this.props;

    if (!this.isLoadingItems && onLoadItems) {
      this.isLoadingItems = true;

      this.setState({ loading: LOADING_STATUS.LOADING });

      onLoadItems((): void => {
        this.isLoadingItems = false;

        this.setState({ loading: onEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
      });
    }
  }

  private scrollUp(scrollTop: number): void {
    const { rows }: VListState = this.state;
    const { hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (this.endIndex >= rows) {
      if (!this.isLoadingItems && onLoadItems) {
        if (hasMore) {
          this.onLoadItems();
        } else {
          this.setState({ loading: onEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
        }
      }
    } else if (scrollTop > this.anchor.getBottom()) {
      this.scrollUpdate(scrollTop);
    }
  }

  private scrollDown(scrollTop: number): void {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchor.getTop()) {
      this.scrollUpdate(scrollTop);
    }
  }

  private handleScrollEnd = (): void => {
    // Do something, when scroll stop
    this.updateScrolling(false);
  };

  private handleScroll = (): void => {
    const { onScroll }: VListProps = this.props;
    // Use the body element's scrollTop on iOS Safari/Webview
    // Because the documentElement element's scrollTop always is zero
    const { scrollTop }: HTMLElement = this.getScrollable();

    // On iOS, we can arrive at negative offsets by swiping past the start.
    // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
    if (scrollTop >= 0) {
      clearTimeout(this.timer);

      this.updateScrolling(true);

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
    const { rows }: VListState = this.state;
    const { hasMore }: VListProps = this.props;
    const scrollable: HTMLElement = this.getScrollable();

    this.scrollableTop = scrollable.getBoundingClientRect().top;

    this.updateRects();
    this.updateVisibleItems();

    hasMore && !rows && this.onLoadItems();

    scrollable.addEventListener('scroll', this.handleScroll, supportsPassive ? { passive: true, capture: false } : false);
  }

  public componentDidUpdate({ data: prevData }: VListProps, { rows: prevRows }: VListState): void {
    const { data }: VListProps = this.props;
    const { rows }: VListState = this.state;

    if (rows !== prevRows || data !== prevData) {
      this.updateRects();
      this.setAnchor(this.getAnchor(this.getScrollable().scrollTop));

      this.startIndex = this.getStartIndex(this.anchor);
      this.endIndex = this.getEndIndex(this.anchor);

      this.updateVisibleItems();
    }
  }

  public componentWillUnmount(): void {
    clearTimeout(this.timer);

    const scrollable: HTMLElement = this.getScrollable();

    scrollable.removeEventListener('scroll', this.handleScroll);
  }

  private renderLoading(): React.ReactNode {
    const { loading }: VListState = this.state;
    const { hasMore, onLoading, onEnded }: VListProps = this.props;

    switch (loading) {
      case LOADING_STATUS.LOADING:
        return hasMore && onLoading ? onLoading() : null;
      case LOADING_STATUS.ENDING:
        return !hasMore && onEnded ? onEnded() : null;
      default:
        return null;
    }
  }

  private renderStatus(): React.ReactNode {
    const { rows }: VListState = this.state;
    const { hasMore, placeholder }: VListProps = this.props;

    if (!hasMore && !rows) return placeholder;

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
