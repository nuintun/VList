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

interface Offset {
  readonly top: number;
  readonly bottom: number;
}

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

interface ResizeObserverSize {
  readonly inlineSize: number;
  readonly blockSize: number;
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
  LOADING,
  LOADED,
  ENDED
}

const SCROLLING_DEBOUNCE_INTERVAL: number = 150;
const STATUS_HIDDEN_STYLE: React.CSSProperties = { opacity: 0, visibility: 'hidden' };
const USE_CAPTURE: useCapture = supportsPassive ? { passive: true, capture: false } : false;

function getOverscan(overscan: overscan, fallback: number) {
  return overscan === 'auto' || overscan < 0 ? fallback : overscan;
}

function getViewport({ viewport }: VListProps, fallback: React.RefObject<HTMLElement>): HTMLElement {
  const node: HTMLElement = fallback.current as HTMLElement;

  return viewport ? viewport(node) : (node as HTMLElement);
}

function getStatusStyle(items: items, [, end]: range): React.CSSProperties | undefined {
  if (end < items.length) return STATUS_HIDDEN_STYLE;
}

export default class VList extends React.PureComponent<VListProps, VListState> {
  static defaultProps = {
    infinite: false,
    overscan: 'auto',
    scrollspy: false
  };

  private timer: TimeoutID;

  private offset: number = -1;

  private visible: number = 0;

  private location: number = 0;

  private viewport: HTMLElement;

  // Cache position info of item rendered
  private rects: Rectangle[] = [];

  private loading: boolean = false;

  private observer: ResizeObserver;

  private window: React.RefObject<HTMLDivElement> = React.createRef();

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

    if (end <= rows) return null;

    return { range: [start < rows ? start : 0, Math.min(rows, end)] };
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
          this.offset = index;
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
    // Next index
    let top: number = rect.bottom;
    let next: number = rect.index + 1;

    const { rects }: VList = this;
    const [, end]: range = this.state.range;
    // Only end item need update all rects after it
    const max: number = next < end ? end : rects.length;

    for (; next < max; ) {
      const rectangle: Rectangle = rects[next++];

      rectangle.update({ top });

      top += rectangle.height;
    }
  }

  private onItemResize = ({ index, rect }: ResizeEvent): void => {
    const current: Rectangle = this.rects[index];
    const scrollNeeded: boolean = index === this.offset;

    // Reset scroll index
    if (scrollNeeded) {
      this.offset = -1;
    }

    // Update
    if (current) {
      const next: Rectangle = this.rects[index + 1];
      const { height: prevHeight }: Rectangle = current;
      const [borderBoxSize]: ResizeObserverSize[] = rect.borderBoxSize;
      const { blockSize: height }: ResizeObserverSize = borderBoxSize;

      if (height !== prevHeight) {
        // Update rect
        current.update({ height });

        // Update anchor
        if (index === this.anchor.index) {
          this.anchor = current;
        }

        // Update rects after current
        this.updateRectsAfter(current);

        // Need update if top or height decrease
        if (!this.state.scrolling && height < prevHeight) {
          this.update(this.viewport.scrollTop);
        }
      } else if (next && next.top !== current.top + prevHeight) {
        // Update rects after current
        this.updateRectsAfter(current);
      }

      // Scroll to index if scroll index equal current index
      if (scrollNeeded) {
        this.scrollTop = current.top;
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
    const { items, infinite, onLoadItems }: VListProps = this.props;

    if (infinite && !this.loading && onLoadItems && this.anchor.index + this.visible >= items.length) {
      this.loading = true;

      this.setState({ status: STATUS.LOADING });

      onLoadItems((): void => {
        this.loading = false;

        const { infinite }: VListProps = this.props;

        this.setState({ status: infinite ? STATUS.LOADED : STATUS.ENDED });
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
        const { target }: ResizeObserverEntry = entry;

        if (target === viewport) {
          const { defaultItemHeight }: VListProps = this.props;
          const [contentBoxSize]: ResizeObserverSize[] = entry.contentBoxSize;
          const { blockSize: viewHeight }: ResizeObserverSize = contentBoxSize;
          const visible: number = Math.ceil(viewHeight / Math.max(1, defaultItemHeight)) + 1;

          if (visible !== this.visible) {
            this.visible = visible;

            this.update(this.scrollTop);
          }
        }
      }
    });

    this.observer.observe(this.viewport, { box: 'border-box' });

    viewport.addEventListener('scroll', this.onScroll, USE_CAPTURE);
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

    this.viewport.removeEventListener('scroll', this.onScroll, USE_CAPTURE);
  }

  private renderStatus(status: STATUS): React.ReactNode {
    const { items, infinite, placeholder }: VListProps = this.props;

    if (!infinite && !items.length) return placeholder;

    const { onLoading, onEnded }: VListProps = this.props;

    switch (status) {
      case STATUS.LOADING:
      case STATUS.LOADED:
        return onLoading ? onLoading() : null;
      case STATUS.ENDED:
        return onEnded ? onEnded() : null;
      default:
        return null;
    }
  }

  public render(): React.ReactNode {
    const { range, status }: VListState = this.state;
    const { items, style, className }: VListProps = this.props;
    const { top: paddingTop, bottom: paddingBottom }: Offset = this.getOffset(range);

    return (
      <div ref={this.window} role="list" className={className} style={style}>
        <div style={{ paddingTop, paddingBottom }}>
          {this.getItems(range)}
          <div role="status" style={getStatusStyle(items, range)}>
            {this.renderStatus(status)}
          </div>
        </div>
      </div>
    );
  }
}
