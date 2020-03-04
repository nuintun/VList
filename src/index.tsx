/**
 * @module index
 */

import React from 'react';
import Item, { SizeInfo } from './Item';
import { supportsPassive } from './utils';
import Rectangle, { RectInfo } from './Rectangle';

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

enum LOADING_STATUS {
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
  loadingStatus: LOADING_STATUS;
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

  private containerTopValue: number = 0;

  private isLoadingItems: boolean = false;

  private node: React.RefObject<HTMLDivElement> = React.createRef();

  // The info of anchor element
  // which is the first element in visible range
  private anchor: RectInfo = { top: 0, left: 0, index: 0, width: 0, height: 0, bottom: 0 };

  public state: VListState = {
    paddingTop: 0,
    visibleItems: [],
    paddingBottom: 0,
    isScrolling: false,
    rows: this.props.data.length,
    loadingStatus: LOADING_STATUS.NONE
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
      const lastRect: Rectangle = this.rects[rows - 1];
      const { length: startIndex }: Rectangle[] = this.rects;
      const { defaultItemHeight: defaultHeight }: VListProps = this.props;

      let top: number = lastRect ? lastRect.getBottom() : 0;

      for (let index: number = startIndex; index < rows; index++) {
        this.rects.push(new Rectangle({ top, index, defaultHeight }));

        top += defaultHeight;
      }
    }
  };

  private getScrollable(): HTMLElement {
    const { scrollable }: VListProps = this.props;
    const node: HTMLElement = this.node.current as HTMLDivElement;

    return scrollable ? scrollable(node) : (this.node.current as HTMLDivElement);
  }

  private onItemResize = (size: SizeInfo): void => {
    const { rect, index }: SizeInfo = size;
    const rectangle: Rectangle = this.rects[index];

    if (rectangle) {
      // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
      // The value of top is relative to the top of the scroll container element
      const { scrollTop }: HTMLElement = this.getScrollable();
      const top: number = rect.top - this.containerTopValue + scrollTop;

      if (index === 0) {
        this.anchor = new Rectangle({ top, index, height: rect.height }).getRectInfo();
      }

      rectangle.updateRectInfo({ top, width: rect.width, height: rect.height, index });
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

  private renderItem = (index: number): React.ReactNode => {
    const { isScrolling }: VListState = this.state;
    const { data, children }: VListProps = this.props;

    return children(data[index], isScrolling);
  };

  private getVisibleItems(): React.ReactNode[] {
    const items: React.ReactNode[] = [];

    for (let index: number = this.startIndex; index < this.endIndex; index++) {
      items.push(
        <Item key={index} index={index} onResize={this.onItemResize}>
          {this.renderItem}
        </Item>
      );
    }

    return items;
  }

  private getEndIndex(anchor: RectInfo): number {
    const { rows }: VListState = this.state;
    const { overscan }: VListProps = this.props;

    return Math.min(anchor.index + this.getVisibleCount() + (overscan as number) + 1, rows);
  }

  private getAnchorItem(scrollTop: number): Rectangle | null {
    const { rects }: VList = this;
    const { length }: Rectangle[] = rects;

    for (let index: number = 0; index < length; index++) {
      const rect: Rectangle = rects[index];

      if (rect.getBottom() >= scrollTop) return rect;
    }

    return null;
  }

  private updateVisibleItems(scrollTop: number): void {
    const rect: Rectangle | null = this.getAnchorItem(scrollTop);
    const anchor: RectInfo | null = rect ? rect.getRectInfo() : null;

    if (anchor && this.anchor !== anchor) {
      const { overscan }: VListProps = this.props;
      const startIndex: number = Math.max(0, anchor.index - (overscan as number));
      const endIndex: number = this.getEndIndex(anchor);

      this.anchor = anchor;

      if (this.startIndex !== startIndex || this.endIndex !== endIndex) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;

        this.updateOffset();
        this.setState({ visibleItems: this.getVisibleItems() });
      }
    }
  }

  private scrollUp(scrollTop: number): void {
    const { rows }: VListState = this.state;
    const { hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (this.endIndex >= rows) {
      if (!this.isLoadingItems && onLoadItems) {
        if (hasMore) {
          this.isLoadingItems = true;

          this.setState({ loadingStatus: LOADING_STATUS.LOADING });

          onLoadItems((): void => {
            this.isLoadingItems = false;
          });
        } else {
          this.setState({ loadingStatus: onEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
        }
      } else {
      }
    } else if (scrollTop > this.anchor.bottom) {
      this.updateVisibleItems(scrollTop);
    }
  }

  private scrollDown(scrollTop: number): void {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchor.top) {
      this.updateVisibleItems(scrollTop);
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
      this.updateScrolling(true);

      // Set a timer to judge scroll of element is stopped
      this.timer && clearTimeout(this.timer);
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
    const scrollable: HTMLElement = this.getScrollable();

    this.containerTopValue = scrollable.getBoundingClientRect().top;

    this.updateRects();
    this.updateVisibleItems(this.scrollTop);

    scrollable.addEventListener('scroll', this.handleScroll, supportsPassive ? { passive: true, capture: false } : false);
  }

  public componentDidUpdate(props: VListProps, { rows: prevRows }: VListState): void {
    const { rows }: VListState = this.state;

    if (prevRows !== rows) {
      this.updateRects();

      if (prevRows > rows) {
        const diff: number = prevRows - rows;

        this.startIndex = Math.max(0, this.startIndex - diff);
        this.endIndex = Math.max(rows, this.endIndex - diff);

        this.updateOffset();
      }

      this.updateVisibleItems(this.scrollTop);
    }
  }

  public componentWillUnmount(): void {
    clearTimeout(this.timer);

    const scrollable: HTMLElement = this.getScrollable();

    scrollable.removeEventListener('scroll', this.handleScroll);
  }

  private renderLoading(): React.ReactNode {
    const { loadingStatus }: VListState = this.state;
    const { onLoading, onEnded }: VListProps = this.props;

    switch (loadingStatus) {
      case LOADING_STATUS.LOADING:
        return onLoading && onLoading();
      case LOADING_STATUS.ENDING:
        return onEnded && onEnded();
      default:
        return null;
    }
  }

  public renderStatus(): React.ReactNode {
    const { rows }: VListState = this.state;
    const { hasMore, onLoading, placeholder }: VListProps = this.props;

    if (hasMore && !rows) {
      return onLoading ? onLoading() : null;
    }

    return placeholder;
  }

  public renderItems(): React.ReactNode {
    const { paddingTop, paddingBottom, visibleItems }: VListState = this.state;

    return (
      <div style={{ paddingTop, paddingBottom }}>
        {visibleItems}
        {this.renderLoading()}
      </div>
    );
  }

  public render(): React.ReactNode {
    const { visibleItems }: VListState = this.state;
    const { style, className }: VListProps = this.props;

    return (
      <div style={style} ref={this.node} className={className}>
        {visibleItems.length ? this.renderItems() : this.renderStatus()}
      </div>
    );
  }
}
