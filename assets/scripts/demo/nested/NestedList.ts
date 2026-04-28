import { _decorator, Button, Component, EditBox, Label, Node, ScrollView, Toggle, UITransform } from 'cc';
import { VList } from '../../VList';
import { NestedItem } from './NestedItem';
import { NestedGrid } from './NestedGrid';
import { HorizontalItemFrame } from './HorizontalItemFrame';
const { ccclass, property } = _decorator;

@ccclass('NestedList')
export class NestedList extends Component {
    @property(VList)
    private vList: VList;

    onLoad() {
        this.vList.setItemRenderer(this, this.onVerticalRenderHandler);
        this.vList.numItems = 20;
    }


    private onVerticalRenderHandler(index: number, item: Node): void {
        item.getComponent(NestedItem).updateItem(index);
    }




}

