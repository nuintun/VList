/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import Item, { items, ResizeEvent } from './Item';
import { ResizeObserver } from '@juggle/resize-observer';
import { cancelTimeout, requestTimeout, supportsPassive, TimeoutID } from './utils';

type range = [number, number];
type overscan = number | 'auto';
type useCapture = { passive: boolean; capture: boolean } | boolean;

interface VListState {
  range: range;
  status: STATUS;
  scrolling: boolean;
}

interface DerivedState {
  range?: range;
  status?: STATUS;
  scrolling?: boolean;
}

interface Offset {
  top: number;
  bottom: number;
}

export interface VListProps {
  items: items;
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

export const SCROLLING_DEBOUNCE_INTERVAL: number = 150;

const useCapture: useCapture = supportsPassive ? { passive: true, capture: false } : false;

function getOverscan(overscan: overscan, fallback: number) {
  return overscan === 'auto' ? fallback : overscan;
}

function getScroller({ scroller }: VListProps, fallback: React.RefObject<HTMLElement>): HTMLElement {
  const node: HTMLElement = fallback.current as HTMLElement;

  return scroller ? scroller(node) : (node as HTMLElement);
}

function needLoadItems(items: items, [, end]: range): boolean {
  const { length: rows }: items = items;

  return !rows || end >= rows;
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
    range: [0, 0],
    scrolling: false,
    status: STATUS.NONE
  };

  public static getDerivedStateFromProps({ items }: VListProps, { range }: VListState): DerivedState | null {
    const [start, end]: range = range;
    const { length: rows }: items = items;

    if (rows) {
      if (rows && rows < end) {
        return { range: [Math.min(rows - 1, start), rows] };
      }
    } else if (start || end) {
      return { range: [0, 0] };
    }

    return null;
  }

  private updateRects = (): void => {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;
    const { length: rows }: items = this.props.items;

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
    const [, end]: range = this.state.range;

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
      const { scroller }: VList = this;
      const { height }: DOMRect = rect;
      const scrollerRect: DOMRect = scroller.getBoundingClientRect();
      const top: number = rect.top - scrollerRect.top + scroller.scrollTop;

      if (top !== rectangle.top || height !== rectangle.height) {
        const { index: anchorIndex }: Rectangle = this.anchor;

        // Update rect
        rectangle.update({ top, index, height });

        // Update anchor
        if (index === anchorIndex) {
          this.anchor = rectangle;
        }

        // Update rects after current
        this.updateRectsAfter(rectangle);
      }

      if (!this.state.scrolling && (top < rectangle.top || height < rectangle.height)) {
        this.update(this.scrollTop);
      }
    }
  };

  private getOffset([start, end]: range): Offset {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;

    return {
      top: rectRows > start ? rects[start].top : 0,
      bottom: rectRows && rectRows > end ? rects[rectRows - 1].bottom - rects[end].top : 0
    };
  }

  private getItems([start, end]: range): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const { scrolling }: VListState = this.state;
    const { items, children }: VListProps = this.props;

    for (; start < end; start++) {
      nodes.push(
        <Item key={start} index={start} items={items[start]} scrolling={scrolling} onResize={this.onItemResize}>
          {children}
        </Item>
      );
    }

    return nodes;
  }

  private getAnchor(scrollTop: number): Rectangle {
    const { rects }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;

    if (!rectRows) {
      return new Rectangle({ index: 0, height: this.props.defaultItemHeight });
    }

    let { anchor }: VList = this;

    if (anchor.index >= rectRows) {
      anchor = rects[rectRows - 1];
    }

    const anchorTop: number = anchor.top;

    if (anchorTop > scrollTop) {
      for (let index: number = anchor.index; index >= 0; index--) {
        const rect: Rectangle = rects[index];

        if (rect && rect.top <= scrollTop) return rect;
      }
    }

    const anchorBottom: number = anchor.bottom;

    if (anchorBottom < scrollTop) {
      for (let index: number = anchor.index; index < rectRows; index++) {
        const rect: Rectangle = rects[index];

        if (rect && rect.bottom >= scrollTop) return rect;
      }
    }

    return anchor;
  }

  private getRange(anchor: Rectangle): range {
    const { rects, visible }: VList = this;
    const { length: rectRows }: Rectangle[] = rects;
    const overscan: number = getOverscan(this.props.overscan as overscan, this.visible);

    return [
      Math.max(0, anchor.index - (overscan as number)),
      Math.min(rectRows, anchor.index + visible + (overscan as number) + 1)
    ];
  }

  private update(scrollTop: number): void {
    this.anchor = this.getAnchor(scrollTop);

    const { range }: VListState = this.state;
    const [prevStart, prevEnd]: range = range;
    const [start, end]: range = this.getRange(this.anchor);

    if (start !== prevStart || end !== prevEnd) {
      const nextRange: range = [start, end];

      this.setState({ range: nextRange });

      if (needLoadItems(this.props.items, nextRange)) {
        this.onLoadItems();
      }
    }
  }

  private onLoadItems(): void {
    const { hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (hasMore && !this.loading && onLoadItems) {
      this.loading = true;

      this.setState({ status: STATUS.LOADING });

      onLoadItems((): void => {
        this.loading = false;

        this.scroller.scrollTop = this.scrollTop;

        this.setState({ status: onEnded ? STATUS.ENDING : STATUS.NONE });
      });
    }
  }

  private scrollUp(scrollTop: number): void {
    const { items }: VListProps = this.props;
    const { range }: VListState = this.state;

    if (needLoadItems(items, range)) {
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
    const scroller: HTMLElement = getScroller(this.props, this.node);

    // Cache scroller
    this.scroller = scroller;

    // Update rects
    this.updateRects();

    // Load items on init if no items
    !this.props.items.length && this.onLoadItems();

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

  public componentDidUpdate({ items: prevItems }: VListProps): void {
    const { items }: VListProps = this.props;

    if (items !== prevItems) {
      this.updateRects();
      this.update(this.scrollTop);
    }
  }

  public componentWillUnmount(): void {
    cancelTimeout(this.timer);

    this.observer.disconnect();

    this.scroller.removeEventListener('scroll', this.onScroll, useCapture);
  }

  private renderLoading(status: STATUS): React.ReactNode {
    const [, end]: range = this.state.range;
    const { items, hasMore, onLoading, onEnded }: VListProps = this.props;

    if (end < items.length) return null;

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
    const { items, hasMore, placeholder }: VListProps = this.props;

    if (!hasMore && !items.length) return placeholder;

    return this.renderLoading(status);
  }

  public render(): React.ReactNode {
    const { range, status }: VListState = this.state;
    const { style, className }: VListProps = this.props;
    const { top: paddingTop, bottom: paddingBottom }: Offset = this.getOffset(range);

    return (
      <div style={style} ref={this.node} className={className}>
        <div style={{ paddingTop, paddingBottom }}>
          {this.getItems(range)}
          {this.renderStatus(status)}
        </div>
      </div>
    );
  }
}
