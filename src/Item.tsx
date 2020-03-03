/**
 * @module Item
 */

import React from 'react';
import ResizeObserver from 'resize-observer-polyfill';

export interface SizeInfo {
  index: number;
  rect: DOMRect;
  entries: ResizeObserverEntry[];
}

export interface ItemProps {
  index: number;
  cachedHeights: number[];
  height?: number | 'auto';
  onResize: (size: SizeInfo) => void;
  children: (index: number) => React.ReactNode;
}

export default class Item extends React.PureComponent<ItemProps> {
  static defaultProps = {
    height: 'auto'
  };

  private observer: ResizeObserver;

  private readonly node: React.RefObject<HTMLDivElement> = React.createRef();

  private cacheItemSize = (entries: ResizeObserverEntry[]): void => {
    const node: HTMLDivElement | null = this.node.current;

    if (node) {
      const rect: DOMRect = node.getBoundingClientRect();
      const { index, cachedHeights }: ItemProps = this.props;

      if (cachedHeights[index] !== rect.height) {
        this.props.onResize({ rect, index, entries });
      }
    }
  };

  public componentDidMount(): void {
    const node: HTMLDivElement | null = this.node.current;
    const observer: ResizeObserver = new ResizeObserver(this.cacheItemSize);

    observer.observe(node as HTMLDivElement);

    this.observer = observer;
  }

  public componentWillUnmount(): void {
    this.observer.disconnect();
  }

  public render(): React.ReactNode {
    const { index, height, children }: ItemProps = this.props;

    return (
      <div ref={this.node} style={{ minHeight: height }}>
        {children(index)}
      </div>
    );
  }
}
