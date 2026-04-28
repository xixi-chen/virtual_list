import { _decorator, Button, Event, Label, Node, Sprite, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
const { ccclass, property } = _decorator;

@ccclass('HorizontalItemCols')
export class HorizontalItemCols extends VListItem {

 

    @property(Label)
    private txtTitle: Label;

    @property(Label)
    private txtContent: Label;

    @property(Label)
    private txtIndex: Label;





    public updateItem(index: number, data: { title: number, size: number }): void {
        let width: number = data.size;
        this.getComponent(UITransform).width = width;

        this.txtTitle.string = `标题 ${data.title}`;
        this.txtIndex.string = `idx=${index}`;
        this.txtContent.string = `width=\n${width}`;

    }



}


