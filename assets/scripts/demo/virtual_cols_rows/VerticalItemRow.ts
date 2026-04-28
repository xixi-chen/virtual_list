import { _decorator, Button, Component, director, Label, Node, Sprite, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
const { ccclass, property } = _decorator;

@ccclass('VerticalItemRow')
export class VerticalItemRow extends VListItem {
    @property(Label)
    private txtTitle: Label;

    @property(Label)
    private txtContent: Label;

    @property(Label)
    private txtIndex: Label;

  

    

    public updateItem(index: number, data: { title: number, size: number }): void {
        let height: number = data.size;
        this.getComponent(UITransform).height = height;

        this.txtTitle.string = `标题 ${data.title}`;
        this.txtIndex.string = `idx=${index}`;
        this.txtContent.string = `height=${height}`;

    }



}


