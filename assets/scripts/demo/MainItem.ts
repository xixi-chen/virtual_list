import { _decorator, Component, director, Label, Node } from 'cc';
import { VListItem } from '../VListItem';
const { ccclass, property } = _decorator;

@ccclass('MainItem')
export class MainItem extends VListItem {
    @property(Label)
    private title: Label;

    private _data: any
    public updateItem(data: any): void {
        this._data = data;
        this.title.string = data.title;
    }

    protected onSelectedHandler(val: any): void {
        if (!this._data) return;
        director.loadScene(this._data.scene);
    }
}


