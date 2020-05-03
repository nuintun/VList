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
  return overscan === 'auto' || overscan < 0 ? fallback : overscan;
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

  private index: number = -1;

  private offset: number = 0;

  private visible: number = 0;

  private location: number = 0;

  private scroller: HTMLElement;

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

  public set scrollTop(scrollTop: number) {
    const { scroller }: VList = this;

    if (scrollTop !== scroller.scrollTop) {
      scroller.scrollTop = scrollTop;

      scrollTop = scroller.scrollTop;

      this.update(scrollTop);

      this.location = scrollTop;
    }
  }

  public get scrollTop(): number {
    return this.scroller.scrollTop;
  }

  public scrollToIndex(index: number): void {
    requestAnimationFrame(() => {
      const { rects }: VList = this;
      const rect: Rectangle = rects[index];

      if (rect) {
        const [start, end]: range = this.state.range;

        if (index < start || index >= end) {
          this.index = index;
        }

        this.scrollTop = rect.top;
      }
    });
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

    // Next index
    let next: number = rect.index + 1;

    // Only end item need update all rects after it
    if (next === end) {
      let top: number = rect.bottom;

      const { length: rectRows }: Rectangle[] = rects;

      for (; next < rectRows; ) {
        const rectangle: Rectangle = rects[next++];

        rectangle.update({ top });

        top += rectangle.height;
      }
    }
  }

  private onItemResize = ({ index, rect }: ResizeEvent): void => {
    const toIndex: boolean = index === this.index;
    const rectangle: Rectangle = this.rects[index];

    // Reset scroll index
    if (toIndex) {
      this.index = -1;
    }

    // Update
    if (rectangle) {
      const { height }: DOMRect = rect;
      const { scroller }: VList = this;
      const { scrollTop }: HTMLElement = scroller;
      const scrollerRect: DOMRect = scroller.getBoundingClientRect();
      const top: number = rect.top - scrollerRect.top - this.offset + scrollTop;

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

      // Need update if top or height decrease
      if (!this.state.scrolling && (top < rectangle.top || height < rectangle.height)) {
        this.update(scrollTop);
      }

      // Scroll to index if scroll index equal current index
      if (toIndex) {
        this.scrollTop = top;
      }
    }
  };

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
      for (let index: number = anchor.index; index >= 0; ) {
        const rect: Rectangle = rects[index--];

        if (rect && rect.top <= scrollTop) return rect;
      }
    }

    const anchorBottom: number = anchor.bottom;

    if (anchorBottom < scrollTop) {
      for (let index: number = anchor.index; index < rectRows; ) {
        const rect: Rectangle = rects[index++];

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
      Math.min(rectRows, anchor.index + visible + (overscan as number))
    ];
  }

  private getOffset([start, end]: range): Offset {
    const { rects }: VList = this;
    const { items }: VListProps = this.props;
    const rows: number = Math.min(items.length, rects.length);

    return {
      top: rows > start ? rects[start].top : 0,
      bottom: rows && rows > end ? rects[rows - 1].bottom - rects[end].top : 0
    };
  }

  private getItems([start, end]: range): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const { scrolling }: VListState = this.state;
    const { items, children }: VListProps = this.props;

    for (; start < end; ) {
      nodes.push(
        <Item key={start} index={start} items={items[start++]} scrolling={scrolling} onResize={this.onItemResize}>
          {children}
        </Item>
      );
    }

    return nodes;
  }

  private onLoadItems(): void {
    const { items, hasMore, onLoadItems, onEnded }: VListProps = this.props;

    if (hasMore && !this.loading && onLoadItems && this.anchor.index + this.visible >= items.length) {
      this.loading = true;

      this.setState({ status: STATUS.LOADING });

      onLoadItems((): void => {
        this.loading = false;

        this.setState({ status: onEnded ? STATUS.ENDING : STATUS.NONE });
      });
    }
  }

  private update(scrollTop: number): void {
    this.anchor = this.getAnchor(scrollTop);

    const [prevStart, prevEnd]: range = this.state.range;
    const range: range = this.getRange(this.anchor);
    const [start, end]: range = range;

    if (start !== prevStart || end !== prevEnd) {
      this.setState({ range });
    }

    this.onLoadItems();
  }

  private scrollEnd = (): void => {
    // Do something, when scroll stop
    this.setState({ scrolling: false });
  };

  private onScroll = (event: Event): void => {
    const { scrollTop }: VList = this;
    const { onScroll }: VListProps = this.props;

    // On iOS, we can arrive at negative offsets by swiping past the start.
    // To prevent flicker here, we make playing in the negative offset zone cause nothing to happen.
    if (scrollTop >= 0) {
      cancelTimeout(this.timer);

      this.setState({ scrolling: true });

      const { anchor, location }: VList = this;
      const scrollDown: boolean = scrollTop < location && scrollTop <= anchor.top;
      const scrollUp: boolean = scrollTop > location && scrollTop >= anchor.bottom;

      if (scrollUp || scrollDown) {
        this.update(scrollTop);
      }

      this.location = scrollTop;

      // Set a timer to judge scroll of element is stopped
      this.timer = requestTimeout(this.scrollEnd, SCROLLING_DEBOUNCE_INTERVAL);
    }

    // Trigger user scroll handle
    onScroll && onScroll(event);
  };

  public componentDidMount(): void {
    const { props }: VList = this;
    const scroller: HTMLElement = getScroller(props, this.node);

    // Cache scroller
    this.scroller = scroller;

    // Update rects
    this.updateRects();

    // Init items
    this.onLoadItems();

    // Resize observer
    this.observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === scroller) {
          const { defaultItemHeight }: VListProps = this.props;
          const itemHeight: number = Math.max(1, defaultItemHeight);
          const { top, height }: DOMRectReadOnly = entry.contentRect;
          const visible: number = Math.ceil(height / itemHeight) + 1;

          this.offset = top;

          if (visible !== this.visible) {
            this.visible = visible;

            this.update(this.scrollTop);
          }
          break;
        }
      }
    });

    this.observer.observe(this.scroller, { box: 'border-box' });

    scroller.addEventListener('scroll', this.onScroll, useCapture);
  }

  public componentDidUpdate({ items: prevItems }: VListProps): void {
    const { items }: VListProps = this.props;

    if (items !== prevItems) {
      this.updateRects();

      requestAnimationFrame(() => {
        this.update(this.scrollTop);
      });
    }
  }

  public componentWillUnmount(): void {
    cancelTimeout(this.timer);

    this.observer.disconnect();

    this.scroller.removeEventListener('scroll', this.onScroll, useCapture);
  }

  private renderLoading(status: STATUS): React.ReactNode {
    const { items, onLoading, onEnded }: VListProps = this.props;

    switch (status) {
      case STATUS.LOADING:
        return onLoading ? onLoading() : null;
      case STATUS.ENDING:
        const [, end]: range = this.state.range;

        return onEnded && end >= items.length ? onEnded() : null;
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
