/**
 * @module Item
 */

import React from 'react';
import { ResizeObserver } from '@juggle/resize-observer';

export type items = any[];

export interface ResizeEvent {
  rect: DOMRect;
  index: number;
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

  private onResize = (): void => {
    const node: HTMLDivElement | null = this.node.current;

    if (node) {
      const { index }: ItemProps = this.props;
      const rect: DOMRect = node.getBoundingClientRect();

      this.props.onResize({ rect, index });
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
