/**
 * @module index
 */

import React from 'react';
import Rectangle from './Rectangle';
import Item, { items, ResizeEvent } from './Item';
import { ResizeObserver, ResizeObserverEntry } from '@juggle/resize-observer';
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
  infinite?: boolean;
  className?: string;
  overscan?: overscan;
  scrollspy?: boolean;
  defaultItemHeight: number;
  style?: React.CSSProperties;
  placeholder?: React.ReactNode;
  onEnded?: () => React.ReactNode;
  onScroll?: (event: Event) => void;
  onLoading?: () => React.ReactNode;
  onLoadItems?: (resolve: () => void) => void;
  viewport?: (node: HTMLElement) => HTMLElement;
  children: (item: any, scrolling: boolean) => React.ReactNode;
}

const enum STATUS {
  NONE,
  HIDDEN,
  LOADING,
  ENDED
}

export const SCROLLING_DEBOUNCE_INTERVAL: number = 150;

const useCapture: useCapture = supportsPassive ? { passive: true, capture: false } : false;

function getOverscan(overscan: overscan, fallback: number) {
  return overscan === 'auto' || overscan < 0 ? fallback : overscan;
}

function getViewport({ viewport }: VListProps, fallback: React.RefObject<HTMLElement>): HTMLElement {
  const node: HTMLElement = fallback.current as HTMLElement;

  return viewport ? viewport(node) : (node as HTMLElement);
}

export default class VList extends React.PureComponent<VListProps, VListState> {
  static defaultProps = {
    infinite: false,
    overscan: 'auto',
    scrollspy: false
  };

  private timer: TimeoutID;

  private index: number = -1;

  private extra: number = 0;

  private offset: number = 0;

  private visible: number = 0;

  private location: number = 0;

  private viewport: HTMLElement;

  // Cache position info of item rendered
  private rects: Rectangle[] = [];

  private loading: boolean = false;

  private observer: ResizeObserver;

  private window: React.RefObject<HTMLDivElement> = React.createRef();

  private status: React.RefObject<HTMLDivElement> = React.createRef();

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
    const { viewport }: VList = this;

    if (scrollTop !== viewport.scrollTop) {
      viewport.scrollTop = scrollTop;

      scrollTop = viewport.scrollTop;

      this.update(scrollTop);

      this.location = scrollTop;
    }
  }

  public get scrollTop(): number {
    return this.viewport.scrollTop;
  }

  public scrollToIndex(index: number): void {
    requestAnimationFrame((): void => {
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
      const { viewport }: VList = this;
      const { scrollTop }: HTMLElement = viewport;
      const scrollerRect: DOMRect = viewport.getBoundingClientRect();
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
      bottom: rows && rows > end ? rects[rows - 1].bottom - rects[end].top + this.extra : 0
    };
  }

  private getItems([start, end]: range): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    const { scrolling }: VListState = this.state;
    const { items, children, scrollspy }: VListProps = this.props;

    for (; start < end; ) {
      nodes.push(
        <Item
          key={start}
          index={start}
          scrolling={scrolling}
          items={items[start++]}
          onResize={this.onItemResize}
          scrollspy={scrollspy as boolean}
        >
          {children}
        </Item>
      );
    }

    return nodes;
  }

  private onLoadItems(): void {
    const { items, infinite, onLoadItems, onLoading }: VListProps = this.props;

    if (infinite && !this.loading && onLoadItems && this.anchor.index + this.visible >= items.length) {
      this.loading = true;

      this.setState({ status: onLoading ? STATUS.LOADING : STATUS.NONE });

      onLoadItems((): void => {
        this.loading = false;

        const { infinite, onEnded }: VListProps = this.props;

        this.setState({ status: onEnded ? (infinite ? STATUS.HIDDEN : STATUS.ENDED) : STATUS.NONE });
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
      const { scrollspy }: VListProps = this.props;

      // Use scrollspy
      if (scrollspy) {
        cancelTimeout(this.timer);

        // Set scrolling
        this.setState({ scrolling: true });
      }

      const { anchor, location }: VList = this;
      const scrollDown: boolean = scrollTop < location && scrollTop <= anchor.top;
      const scrollUp: boolean = scrollTop > location && scrollTop >= anchor.bottom;

      if (scrollUp || scrollDown) {
        this.update(scrollTop);
      }

      this.location = scrollTop;

      // Set a timer to judge scroll of element is stopped
      if (scrollspy) {
        this.timer = requestTimeout(this.scrollEnd, SCROLLING_DEBOUNCE_INTERVAL);
      }
    }

    // Trigger user scroll handle
    onScroll && onScroll(event);
  };

  public componentDidMount(): void {
    const { props }: VList = this;
    const viewport: HTMLElement = getViewport(props, this.window);

    // Cache viewport
    this.viewport = viewport;

    // Update rects
    this.updateRects();

    // Init items
    this.onLoadItems();

    // Resize observer
    this.observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
      for (const entry of entries) {
        const { height }: DOMRectReadOnly = entry.contentRect;

        switch (entry.target) {
          case viewport:
            const { top }: DOMRectReadOnly = entry.contentRect;
            const { defaultItemHeight }: VListProps = this.props;
            const itemHeight: number = Math.max(1, defaultItemHeight);
            const visible: number = Math.ceil(height / itemHeight) + 1;

            this.offset = top;

            if (visible !== this.visible) {
              this.visible = visible;

              this.update(this.scrollTop);
            }
            break;
          case this.status.current:
            if ((height || this.state.status === STATUS.NONE) && height !== this.extra) {
              this.extra = height;

              this.update(this.scrollTop);
            }
            break;
          default:
            break;
        }
      }
    });

    this.observer.observe(this.viewport, { box: 'border-box' });
    this.observer.observe(this.status.current as HTMLElement, { box: 'border-box' });

    viewport.addEventListener('scroll', this.onScroll, useCapture);
  }

  public componentDidUpdate({ items: prevItems }: VListProps): void {
    const { items }: VListProps = this.props;

    if (items !== prevItems) {
      this.updateRects();

      requestAnimationFrame((): void => {
        this.update(this.scrollTop);
      });
    }
  }

  public componentWillUnmount(): void {
    cancelTimeout(this.timer);

    this.observer.disconnect();

    this.viewport.removeEventListener('scroll', this.onScroll, useCapture);
  }

  private renderStatus(status: STATUS): React.ReactNode {
    const { items, infinite, placeholder }: VListProps = this.props;

    if (!infinite && !items.length) return placeholder;

    const { onLoading, onEnded }: VListProps = this.props;

    switch (status) {
      case STATUS.LOADING:
        return onLoading ? onLoading() : null;
      case STATUS.ENDED:
        const [, end]: range = this.state.range;

        return onEnded && end >= items.length ? onEnded() : null;
      default:
        return null;
    }
  }

  public render(): React.ReactNode {
    const { range, status }: VListState = this.state;
    const { style, className }: VListProps = this.props;
    const { top: paddingTop, bottom: paddingBottom }: Offset = this.getOffset(range);

    return (
      <div role="list" style={style} ref={this.window} className={className}>
        <div style={{ paddingTop, paddingBottom }}>
          {this.getItems(range)}
          <div role="status" ref={this.status}>
            {this.renderStatus(status)}
          </div>
        </div>
      </div>
    );
  }
}
