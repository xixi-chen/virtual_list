import { _decorator, Button, Component, director, Label, Node, resources, Sprite, SpriteFrame, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
const { ccclass, property } = _decorator;

@ccclass('NestedGrid')
export class NestedGrid extends VListItem {


    @property(Sprite)
    private icon: Sprite;

    private _urls: string[] = [
        "cursorSword_bronze",
        "cursorSword_gold",
        "cursorSword_silver"
    ];

    public updateItem(index: number): void {
        let path: string = `res/PNG/${this._urls[index % 3]}/spriteFrame`;
        resources.load(path, SpriteFrame, (err, data) => {
            if (err) return;
            this.icon.spriteFrame = data;
        })


    }


}


