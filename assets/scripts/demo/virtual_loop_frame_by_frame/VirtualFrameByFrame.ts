import { _decorator, Button, Component, EditBox, Label, Node, ScrollView, Toggle, UITransform } from 'cc';
import { DEV } from 'cc/env';
import { VList } from '../../VList';
import { VerticalItemRowFrame } from './VerticalItemRowFrame';
import { PageItemFrame } from './PageItemFrame';
import { HorizontalItemFrame } from './HorizontalItemFrame';
const { ccclass, property } = _decorator;

@ccclass('VirtualFrameByFrame')
export class VirtualFrameByFrame extends Component {
    @property(VList)
    private vList: VList;

    @property(VList)
    private hList: VList;

    @property(VList)
    private pageList: VList;


    private _vDatas: { title: number, size: number }[];
    private _hDatas: { title: number, size: number }[];
    private _pageDatas: { title: number, size: number }[];
    private readonly _autoDevStressTest = false;

    private getVerticalItemSize(index: number): { width: number, height: number } {
        const data = this.getOrCreateData(this._vDatas, index);
        return { width: 0, height: data.size };
    }

    private getHorizontalItemSize(index: number): { width: number, height: number } {
        const data = this.getOrCreateData(this._hDatas, index);
        return { width: data.size, height: 0 };
    }


    onLoad() {

        this._vDatas = [];
        this._hDatas = [];
        this._pageDatas = [];
        let size: number = 100;
        for (let i: number = 0; i < 49; i++) {
            size = 100;
            if (i < 10) {
                size -= i + 5;
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
            this._hDatas.push({ title: i, size: size });
            this._pageDatas.push({ title: i, size: size });
        }


        this.vList.setItemRenderer(this, this.onVerticalRenderHandler);
        this.vList.setItemSizeProvider(this, this.getVerticalItemSize);
        this.vList.numItems = this._vDatas.length;



        this.pageList.setItemRenderer(this, this.onPageRenderHandler)
        this.pageList.numItems = this._pageDatas.length;

        this.hList.setItemRenderer(this, this.onHorizontalRenderHandler);
        this.hList.setItemSizeProvider(this, this.getHorizontalItemSize);
        this.hList.numItems = this._hDatas.length;
    }

    private calcSizeByIndex(i: number): number {
        let size = 100;
        if (i < 10) {
            size -= i + 5;
        } else if (i == 20) {
            size = 200;
        } else if (i > 30) {
            size += i;
        }
        return size;
    }

    private getOrCreateData(arr: { title: number, size: number }[], index: number): { title: number, size: number } {
        let data = arr[index];
        if (!data) {
            data = { title: index, size: this.calcSizeByIndex(index) };
            arr[index] = data;
        }
        return data;
    }

    start(): void {
        if (!DEV || !this._autoDevStressTest) {
            return;
        }

        this.scheduleOnce(() => {
            this.hList.scrollToBottomIndex(false);
        }, 0.2);

        this.scheduleOnce(() => {
            (this.hList as any).debugOverscrollMainAxis?.(360, true);
        }, 0.6);

        this.scheduleOnce(() => {
            this.hList.scrollToBottomIndex(true);
        }, 1.0);

        this.scheduleOnce(() => {
            (this.hList as any).debugOverscrollMainAxis?.(220, true);
        }, 1.6);
    }

    private onVerticalRenderHandler(index: number, item: Node): void {
        item.getComponent(VerticalItemRowFrame).updateItem(index, this.getOrCreateData(this._vDatas, index));
    }

    private onHorizontalRenderHandler(index: number, item: Node, realIndex: number): void {
        item.getComponent(HorizontalItemFrame).updateItem(index, this.getOrCreateData(this._hDatas, index));

    }

    private onPageRenderHandler(index: number, item: Node): void {
        item.getComponent(PageItemFrame).updateItem(index, this.getOrCreateData(this._pageDatas, index));
    }


}

