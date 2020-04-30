/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import Item, { ResizeEvent } from './Item';
import { ResizeObserver } from '@juggle/resize-observer';
import { cancelTimeout, requestTimeout, supportsPassive, TimeoutID } from './utils';

type overscan = number | 'auto';

export interface VListProps {
  data: any[];
  hasMore?: boolean;
  className?: string;
  overscan?: overscan;
  defaultItemHeight: number;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  onEnded?: () => React.ReactNode;
  onScroll?: (event: Event) => void;
  onLoading?: () => React.ReactNode;
  onLoadItems?: (resolve: () => void) => void;
  scroller?: (node: HTMLElement) => HTMLElement;
  children: (item: any, scrolling: boolean) => React.ReactNode;
}

const enum STATUS {
  NONE,
  LOADING,
  ENDING
}

interface VListState {
  start: number;
  end: number;
  status: STATUS;
  scrolling: boolean;
}

interface Offset {
  top: number;
  bottom: number;
}

interface VisibleRange {
  start: number;
  end: number;
}

export const SCROLLING_DEBOUNCE_INTERVAL: number = 150;

type useCapture = { passive: boolean; capture: boolean } | boolean;

const useCapture: useCapture = supportsPassive ? { passive: true, capture: false } : false;

function getOverscan(overscan: overscan, fallback: number) {
  return overscan === 'auto' ? fallback : overscan;
}

function getScroller({ scroller }: VListProps, fallback: React.RefObject<HTMLElement>): HTMLElement {
  const node: HTMLElement = fallback.current as HTMLElement;

  return scroller ? scroller(node) : (node as HTMLElement);
}

export default class VList extends React.PureComponent<VListProps, VListState> {
  static defaultProps = {
    hasMore: false,
    overscan: 'auto'
  };

  private timer: TimeoutID;

  private visible: number = 0;

  private scroller: HTMLElement;

  private scrollTop: number = 0;

  private loading: boolean = false;

  // Cache position info of item rendered
  private rects: Rectangle[] = [];

  private observer: ResizeObserver;

  private node: React.RefObject<HTMLDivElement> = React.createRef();

  // The info of anchor element
  // which is the first element in visible range
  private anchor: Rectangle = new Rectangle({ index: 0, height: this.props.defaultItemHeight });

  public state: VListState = {
    start: 0,
    end: 0,
    scrolling: false,
    status: STATUS.NONE
  };

  private updateRects = (): void => {
    const { rects }: VList = this;
    const { length: rows }: any[] = this.props.data;
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

  private updateRectsAfter(rect: Rectangle): void {
    const { rects }: VList = this;
    const { end }: VListState = this.state;

    // Only end item need update all rects after it
    if (rect.index + 1 === end) {
      let top: number = rect.bottom;

      const { length: rectRows }: Rectangle[] = rects;

      for (let index: number = rect.index + 1; index < rectRows; index++) {
        const rectangle: Rectangle = rects[index];

        rectangle.update({ top });

        top += rectangle.height;
      }
    }
  }

  private onItemResize = ({ index, rect }: ResizeEvent): void => {
    const rectangle: Rectangle = this.rects[index];

    if (rectangle) {
      const { height }: DOMRect = rect;
      const { scroller, anchor }: VList = this;
      const { index: anchorIndex }: Rectangle = anchor;
      const scrollerRect: DOMRect = scroller.getBoundingClientRect();
      const top: number = rect.top - scrollerRect.top + scroller.scrollTop;

      // Update rect
      rectangle.update({ top, index, height });

      // Update anchor
      if (index === anchorIndex) {
        this.anchor = rectangle;
      }

      // Update rects after current
      this.updateRectsAfter(rectangle);
    }
  };

  private getOffset(start: number, end: number): Offset {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;

    return {
      top: rectRows > start ? rects[start].top : 0,
      bottom: rectRows && rectRows > end ? rects[rectRows - 1].bottom - rects[end].top : 0
    };
  }

  private getItems(start: number, end: number): React.ReactNode[] {
    const { scrolling }: VListState = this.state;
    const { data, children }: VListProps = this.props;

    const items: React.ReactNode[] = [];
    const rows: number = Math.min(data.length, end);

    for (; start < rows; start++) {
      items.push(
        <Item key={start} index={start} data={data[start]} scrolling={scrolling} onResize={this.onItemResize}>
          {children}
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

  private getStart(anchor: Rectangle): number {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;
    const overscan = getOverscan(this.props.overscan as overscan, this.visible);

    return Math.max(0, Math.min(rectRows - 1, anchor.index) - (overscan as number));
  }

  private getEnd(anchor: Rectangle): number {
    const { rects, visible }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;
    const overscan = getOverscan(this.props.overscan as overscan, this.visible);

    return Math.min(rectRows, anchor.index + visible + (overscan as number) + 1);
  }

  private update(scrollTop: number): VisibleRange {
    this.anchor = this.getAnchor(scrollTop);

    const start: number = this.getStart(this.anchor);
    const end: number = this.getEnd(this.anchor);

    this.setState({ start, end });

    return { start, end };
  }

  private onLoadItems(): void {
    const { hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (!this.loading && onLoadItems) {
      if (hasMore) {
        this.loading = true;

        this.setState({ status: STATUS.LOADING });

        onLoadItems((): void => {
          this.loading = false;

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

    if (this.state.end >= rows) {
      this.onLoadItems();
    } else if (scrollTop > this.anchor.bottom) {
      this.update(scrollTop);
    }
  }

  private scrollDown(scrollTop: number): void {
    // Hand is scrolling down, scrollTop is decreasing
    if (scrollTop < this.anchor.top) {
      this.update(scrollTop);
    }
  }

  private scrollEnd = (): void => {
    // Do something, when scroll stop
    this.setState({ scrolling: false });
  };

  private onScroll = (event: Event): void => {
    const { onScroll }: VListProps = this.props;
    // Use the body element's scrollTop on iOS Safari/Webview
    // Because the documentElement element's scrollTop always is zero
    const { scrollTop }: HTMLElement = this.scroller;

    // On iOS, we can arrive at negative offsets by swiping past the start.
    // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
    if (scrollTop >= 0) {
      cancelTimeout(this.timer);

      this.setState({ scrolling: true });

      // Set a timer to judge scroll of element is stopped
      this.timer = requestTimeout(this.scrollEnd, SCROLLING_DEBOUNCE_INTERVAL);

      if (scrollTop > this.scrollTop) {
        this.scrollUp(scrollTop);
      } else if (scrollTop < this.scrollTop) {
        this.scrollDown(scrollTop);
      }

      this.scrollTop = scrollTop;
    }

    // Trigger user scroll handle
    onScroll && onScroll(event);
  };

  public componentDidMount(): void {
    const { data }: VListProps = this.props;
    const scroller: HTMLElement = getScroller(this.props, this.node);

    // Cache scroller
    this.scroller = scroller;

    // Update rects
    this.updateRects();

    // Load data while no data
    !data.length && this.onLoadItems();

    // Resize observer
    this.observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === scroller) {
          const { defaultItemHeight }: VListProps = this.props;
          const visible: number = Math.ceil(entry.contentRect.height / defaultItemHeight);

          this.visible = visible;

          this.update(this.scrollTop);

          break;
        }
      }
    });

    this.observer.observe(this.scroller);

    scroller.addEventListener('scroll', this.onScroll, useCapture);
  }

  public componentDidUpdate({ data: prevData }: VListProps): void {
    const { data }: VListProps = this.props;

    if (data !== prevData) {
      this.updateRects();

      this.update(this.scrollTop).end >= data.length && this.onLoadItems();
    }
  }

  public componentWillUnmount(): void {
    cancelTimeout(this.timer);

    this.observer.disconnect();

    this.scroller.removeEventListener('scroll', this.onScroll, useCapture);
  }

  private renderLoading(status: STATUS): React.ReactNode {
    const { data, hasMore, onLoading, onEnded }: VListProps = this.props;

    if (this.state.end < data.length) return null;

    switch (status) {
      case STATUS.LOADING:
        return hasMore && onLoading ? onLoading() : null;
      case STATUS.ENDING:
        return !hasMore && onEnded ? onEnded() : null;
      default:
        return null;
    }
  }

  private renderStatus(status: STATUS): React.ReactNode {
    const { data, hasMore, placeholder }: VListProps = this.props;

    if (!hasMore && !data.length) return placeholder;

    return this.renderLoading(status);
  }

  public render(): React.ReactNode {
    const { style, className }: VListProps = this.props;
    const { start, end, status }: VListState = this.state;
    const { top: paddingTop, bottom: paddingBottom }: Offset = this.getOffset(start, end);

    return (
      <div style={style} ref={this.node} className={className}>
        <div style={{ paddingTop, paddingBottom }}>
          {this.getItems(start, end)}
          {this.renderStatus(status)}
        </div>
      </div>
    );
  }
}
