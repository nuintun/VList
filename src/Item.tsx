/**
 * @module Item
 */

import React from 'react';
import { ResizeObserver, ResizeObserverEntry } from '@juggle/resize-observer';

export type items = any[];

export interface ResizeEvent {
  index: number;
  rect: ResizeObserverEntry;
}

export interface ItemProps {
  items: items;
  index: number;
  scrollspy: boolean;
  scrolling: boolean;
  onResize: (size: ResizeEvent) => void;
  children: (data: any, scrolling?: boolean) => React.ReactNode;
}

export default class Item extends React.PureComponent<ItemProps> {
  private observer: ResizeObserver;

  private node: React.RefObject<HTMLDivElement> = React.createRef();

  private onResize = (entries: ResizeObserverEntry[]): void => {
    for (const entry of entries) {
      if (entry.target === this.node.current) {
        const { index }: ItemProps = this.props;

        this.props.onResize({ index, rect: entry });
      }
    }
  };

  public componentDidMount(): void {
    const node: HTMLDivElement | null = this.node.current;

    this.observer = new ResizeObserver(this.onResize);

    this.observer.observe(node as HTMLDivElement, { box: 'border-box' });
  }

  public componentWillUnmount(): void {
    this.observer.disconnect();
  }

  public render(): React.ReactNode {
    const { items, scrollspy, scrolling, children }: ItemProps = this.props;

    return (
      <div role="listitem" ref={this.node}>
        {scrollspy ? children(items, scrolling) : children(items)}
      </div>
    );
  }
}
