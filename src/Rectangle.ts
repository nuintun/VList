/**
 * @module Rectangle
 */

export interface RectangleInfo {
  top?: number;
  left?: number;
  index?: number;
  width?: number;
  height?: number;
  defaultHeight?: number;
}

export interface RectInfo {
  top: number;
  left: number;
  index: number;
  width: number;
  height: number;
  bottom: number;
}

export default class Rectangle {
  private top: number;

  private left: number;

  private index: number;

  private width: number;

  private height: number;

  private defaultHeight: number;

  constructor({ top = 0, left = 0, index = 0, width = 0, height = 0, defaultHeight = 0 }: RectangleInfo) {
    this.top = top;
    this.left = left;
    this.index = index;
    this.width = width;
    this.height = height;
    this.defaultHeight = defaultHeight;
  }

  getTop(): number {
    return this.top;
  }

  getHeight(): number {
    return this.height;
  }

  getBottom(): number {
    return this.top + (this.height || this.defaultHeight);
  }

  getIndex(): number {
    return this.index;
  }

  getRectInfo(): RectInfo {
    return {
      top: this.top,
      left: this.left,
      index: this.index,
      width: this.width,
      height: this.height,
      bottom: this.top + (this.height || this.defaultHeight)
    };
  }

  updateRectInfo({ top = 0, left = 0, index = 0, width = 0, height = 0 }: RectangleInfo): void {
    this.top = top || this.top;
    this.left = left || this.left;
    this.index = index || this.index;
    this.width = width || this.width;
    this.height = height || this.height;
  }
}
