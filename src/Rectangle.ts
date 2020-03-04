/**
 * @module Rectangle
 */

export interface RectangleInfo {
  top?: number;
  index?: number;
  width?: number;
  height?: number;
}

export interface RectInfo {
  top: number;
  index: number;
  width: number;
  height: number;
  bottom: number;
}

export default class Rectangle {
  private top: number;

  private index: number;

  private width: number;

  private height: number;

  constructor({ top = 0, index = 0, width = 0, height = 0 }: RectangleInfo) {
    this.top = top;
    this.index = index;
    this.width = width;
    this.height = height;
  }

  getIndex(): number {
    return this.index;
  }

  getTop(): number {
    return this.top;
  }

  getBottom(): number {
    return this.top + this.height;
  }

  getHeight(): number {
    return this.height;
  }

  getRectInfo(): RectInfo {
    return {
      top: this.top,
      index: this.index,
      width: this.width,
      height: this.height,
      bottom: this.top + this.height
    };
  }

  updateRectInfo({ top, index, width, height }: RectangleInfo): void {
    this.top = top != null ? top : this.top;
    this.index = index != null ? index : this.index;
    this.width = width != null ? width : this.width;
    this.height = height != null ? height : this.height;
  }
}
