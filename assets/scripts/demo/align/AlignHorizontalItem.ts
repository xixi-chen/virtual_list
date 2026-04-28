import { _decorator, Button, Event, Label, Node, Sprite, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
const { ccclass, property } = _decorator;

@ccclass('AlignHorizontalItem')
export class AlignHorizontalItem extends VListItem {

    @property(Sprite)
    private head: Sprite;

    @property(Label)
    private txtTitle: Label;

    @property(Label)
    private txtContent: Label;

    @property(Label)
    private txtIndex: Label;

    @property(Button)
    private btn: Button;

    onLoad(): void {
        this.btn.node.on(Button.EventType.CLICK, this.onClickHandler, this);
    }

    public updateItem(index: number, data: { title: number, size: number }): void {
        let width: number = data.size;
        this.getComponent(UITransform).width = width;

        this.txtTitle.string = `标题 ${data.title}`;
        this.txtIndex.string = `idx=${index}`;
        this.txtContent.string = `width=\n${width}`;

    }

    private onClickHandler(evt: Event): void {
        this.head.node.setScale(1, 1);
        this.scheduleOnce(() => {
            this.head.node.setScale(1.5, 1.5);
        }, 0.1);
    }

}


