/**
 * @module Item
 */

import React from 'react';
import { ResizeObserver } from '@juggle/resize-observer';

export interface ResizeEvent {
  rect: DOMRect;
  index: number;
}

export interface ItemProps {
  data: any;
  index: number;
  onResize: (size: ResizeEvent) => void;
  children: (data: any) => React.ReactNode;
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
    const observer: ResizeObserver = new ResizeObserver(this.onResize);

    observer.observe(node as HTMLDivElement);

    this.observer = observer;
  }

  public componentWillUnmount(): void {
    this.observer.disconnect();
  }

  public render(): React.ReactNode {
    const { data, children }: ItemProps = this.props;

    return (
      <div ref={this.node} date-role="vlist-item">
        {children(data)}
      </div>
    );
  }
}
