import { _decorator, Button, Component, director, Label, Node, Sprite, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
import { VList } from '../../VList';
import { NestedGrid } from './NestedGrid';
const { ccclass, property } = _decorator;

@ccclass('NestedItem')
export class NestedItem extends VListItem {
    @property(VList)
    private itemList: VList;



    onLoad(): void {
        this.itemList.setItemRenderer(this, this.onRenderHandler);
    }


    public updateItem(index: number): void {
        this.itemList.scrollToLeft();
        this.itemList.numItems = index + 2;

        // const cancelEvent = new EventTouch(event.getTouches(), event.bubbles, SystemEventType.TOUCH_CANCEL);
        //         cancelEvent.touch = event.touch;
        //         cancelEvent.simulate = true;
        //         (event.target as Node).dispatchEvent(cancelEvent);

    }

    private onRenderHandler(index: number, node: Node): void {
        node.getComponent(NestedGrid).updateItem(index);
    }



}


