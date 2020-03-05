/**
 * @module Rectangle
 */

export interface RectInfo {
  top?: number;
  index?: number;
  height?: number;
}

export default class Rectangle {
  private top: number;

  private index: number;

  private height: number;

  constructor({ top = 0, index = 0, height = 0 }: RectInfo = {}) {
    this.top = top;
    this.index = index;
    this.height = height;
  }

  public getIndex(): number {
    return this.index;
  }

  public getTop(): number {
    return this.top;
  }

  public getBottom(): number {
    return this.top + this.height;
  }

  public getHeight(): number {
    return this.height;
  }

  public updateRect({ top, index, height }: RectInfo): void {
    this.top = top != null ? top : this.top;
    this.index = index != null ? index : this.index;
    this.height = height != null ? height : this.height;
  }
}
