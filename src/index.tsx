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
      const { defaultItemHeight: height }: VListProps = this.props;

      let top: number = lastRect ? lastRect.getBottom() : 0;

      for (let index: number = startIndex; index < rows; index++) {
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

  private onItemResize = (size: SizeInfo): void => {
    const { rect, index }: SizeInfo = size;
    const rectangle: Rectangle = this.rects[index];

    if (rectangle) {
      const { height }: DOMRect = rect;
      const anchorIndex: number = this.anchor.getIndex();
      // https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect
      // The value of top is relative to the top of the scroll container element
      const top: number = rect.top - this.scrollableTop + this.scrollTop;

      rectangle.updateRect({ top, index, height });

      if (index === anchorIndex) {
        this.anchor = new Rectangle({ top, index, height });
      }

      if (index === anchorIndex || index === this.startIndex || index === this.endIndex) {
        this.updateVisibleItems(this.scrollTop);
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

  private getEndIndex(anchor: Rectangle): number {
    const { rows }: VListState = this.state;
    const { overscan }: VListProps = this.props;

    return Math.min(anchor.getIndex() + this.getVisibleCount() + (overscan as number) + 1, rows);
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
    const anchor: Rectangle | null = this.getAnchorItem(scrollTop);

    if (anchor && anchor !== this.anchor) {
      this.anchor = anchor;

      const { overscan }: VListProps = this.props;
      const startIndex: number = Math.max(0, anchor.getIndex() - (overscan as number));
      const endIndex: number = this.getEndIndex(anchor);

      if (this.startIndex !== startIndex || this.endIndex !== endIndex) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;

        this.updateOffset();
        this.setState({ visibleItems: this.getVisibleItems() });
      }
    }
  }

  private onLoadItems(): void {
    const { onLoadItems, onEnded }: VListProps = this.props;

    if (!this.isLoadingItems && onLoadItems) {
      this.isLoadingItems = true;

      this.setState({ loadingStatus: LOADING_STATUS.LOADING });

      onLoadItems((): void => {
        this.isLoadingItems = false;

        this.setState({ loadingStatus: onEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
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
          this.setState({ loadingStatus: onEnded ? LOADING_STATUS.ENDING : LOADING_STATUS.NONE });
        }
      }
    } else if (scrollTop > this.anchor.getBottom()) {
      this.updateVisibleItems(scrollTop);
    }
  }

  private scrollDown(scrollTop: number): void {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchor.getTop()) {
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
    const { rows }: VListState = this.state;
    const { hasMore }: VListProps = this.props;
    const scrollable: HTMLElement = this.getScrollable();

    this.scrollableTop = scrollable.getBoundingClientRect().top;

    this.updateRects();
    this.updateVisibleItems(this.scrollTop);

    hasMore && !rows && this.onLoadItems();

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
        this.setState({ visibleItems: this.getVisibleItems() });
      } else {
        this.updateVisibleItems(this.scrollTop);
      }
    }
  }

  public componentWillUnmount(): void {
    clearTimeout(this.timer);

    const scrollable: HTMLElement = this.getScrollable();

    scrollable.removeEventListener('scroll', this.handleScroll);
  }

  private renderLoading(): React.ReactNode {
    const { loadingStatus }: VListState = this.state;
    const { hasMore, onLoading, onEnded }: VListProps = this.props;

    switch (loadingStatus) {
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
