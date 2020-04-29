/**
 * @module Rectangle
 */

export interface Rect {
  top?: number;
  index?: number;
  height?: number;
}

export default class Rectangle {
  private _top: number;

  private _index: number;

  private _height: number;

  constructor({ top = 0, index = 0, height = 0 }: Rect = {}) {
    this._top = top;
    this._index = index;
    this._height = height;
  }

  public get index(): number {
    return this._index;
  }

  public get top(): number {
    return this._top;
  }

  public get bottom(): number {
    return this._top + this._height;
  }

  public get height(): number {
    return this._height;
  }

  public update({ top, index, height }: Rect = {}): void {
    this._top = top != null ? top : this._top;
    this._index = index != null ? index : this._index;
    this._height = height != null ? height : this._height;
  }
}
