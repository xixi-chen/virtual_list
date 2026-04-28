import { _decorator, Button, Component, EditBox, Label, Node, ScrollView, Toggle, UITransform } from 'cc';
import { VList } from '../../VList';
import { VerticalItemRowLoop } from './VerticalItemRowLoop';
import { PageItemLoop } from './PageItemLoop';
const { ccclass, property } = _decorator;

@ccclass('VirtualLoop')
export class VirtualLoop extends Component {
    @property(VList)
    private vList: VList;

    @property(VList)
    private hList: VList;

    @property(VList)
    private pageList: VList;


    private _vDatas: { title: number, size: number }[];
    private _pageDatas: { title: number, size: number }[];


    onLoad() {

        this._vDatas = [];
        this._pageDatas = [];
        let size: number = 100;
        for (let i: number = 0; i < 49; i++) {
            size = 100;
            if (i < 10) {
                size -= i;
            } else if (i == 20) {
                size = 200;
            }
            // else if (index == 49) {
            //     height = 800;
            // }
            else if (i > 30) {
                size += i;
            }
            this._vDatas.push({ title: i, size: size });
            this._pageDatas.push({ title: i, size: size });
        }


        this.vList.setItemRenderer(this, this.onVerticalRenderHandler);
        this.vList.numItems = this._vDatas.length;



        this.pageList.setItemRenderer(this, this.onPageRenderHandler)
        this.pageList.numItems = this._pageDatas.length;

        this.hList.setItemRenderer(this, this.onHorizontalRenderHandler);
        this.hList.numItems = 5;
        this.hList.node.on(ScrollView.EventType.SCROLLING, this.onScrolling, this);
        this.onScrolling()
    }

    private onVerticalRenderHandler(index: number, item: Node): void {
        item.getComponent(VerticalItemRowLoop).updateItem(index, this._vDatas[index]);
    }

    private onHorizontalRenderHandler(index: number, item: Node, realIndex: number): void {
        item.getChildByName("lblIdx").getComponent(Label).string = `idx = ${index}`;
        item.getChildByName("lblReal").getComponent(Label).string = `real idx = ${realIndex}`;

    }

    private onPageRenderHandler(index: number, item: Node): void {
        item.getComponent(PageItemLoop).updateItem(index, this._vDatas[index]);
    }

    private onScrolling(): void {

        var midX: number = -this.hList.getScrollOffset().x + this.hList.viewWidth / 2;
        var cnt: number = this.hList.numChildren;
        for (var i: number = 0; i < cnt; i++) {
            var obj: Node = this.hList.getChildAt(i);
            var dist: number = Math.abs(midX - obj.x);
            if (dist > obj.getComponent(UITransform).width) //no intersection
                obj.setScale(1, 1);
            else {
                var ss: number = 1 + (1 - dist / obj.getComponent(UITransform).width) * 0.24;
                obj.setScale(ss, ss);
            }
        }
    }

}

