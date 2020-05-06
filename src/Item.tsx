/**
 * @module Item
 */

import React from 'react';
import { ResizeObserver, ResizeObserverEntry } from '@juggle/resize-observer';

export type items = any[];

type callback = (rect: DOMRect) => void;

export interface ResizeEvent {
  index: number;
  rect: DOMRect;
}

export interface ItemProps {
  items: items;
  index: number;
  scrollspy: boolean;
  scrolling: boolean;
  onResize: (size: ResizeEvent) => void;
  children: (data: any, scrolling?: boolean) => React.ReactNode;
}

const callbacks: WeakMap<Element, callback> = new WeakMap<Element, callback>();

const observer = new ResizeObserver((entries: ResizeObserverEntry[]): void => {
  for (const entry of entries) {
    const { target }: ResizeObserverEntry = entry;

    if (callbacks.has(target)) {
      (callbacks.get(target) as callback)(target.getBoundingClientRect());
    }
  }
});

export default class Item extends React.PureComponent<ItemProps> {
  private node: React.RefObject<HTMLDivElement> = React.createRef();

  private onResize = (rect: DOMRect): void => {
    const { index }: ItemProps = this.props;

    this.props.onResize({ index, rect });
  };

  public componentDidMount(): void {
    const node: HTMLDivElement = this.node.current as HTMLDivElement;

    callbacks.set(node, this.onResize);
    observer.observe(node, { box: 'border-box' });
  }

  public componentWillUnmount(): void {
    const node: HTMLDivElement = this.node.current as HTMLDivElement;

    callbacks.delete(node);
    observer.unobserve(node);
  }

  public render(): React.ReactNode {
    const { items, scrollspy, scrolling, children }: ItemProps = this.props;

    return (
      <div ref={this.node} role="listitem">
        {scrollspy ? children(items, scrolling) : children(items)}
      </div>
    );
  }
}
