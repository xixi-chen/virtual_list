import { _decorator, Button, Component, EditBox, Node, Toggle } from 'cc';
import { VList } from '../../VList';
import { VerticalItemRow } from './VerticalItemRow';
import { HorizontalItemCols } from './HorizontalItemCols';
const { ccclass, property } = _decorator;

@ccclass('VirtualColsRows')
export class VirtualColsRows extends Component {
    @property(VList)
    private vList: VList;

    @property(VList)
    private hList: VList;

    @property(Button)
    private btnTop: Button;

    @property(Button)
    private btnBottom: Button;

    @property(Button)
    private btnTopAni: Button;

    @property(Button)
    private btnBottomAni: Button;

    @property(Button)
    private btnScroll: Button;

    @property(Button)
    private btnScrollAni: Button;

    @property(EditBox)
    private txtIndex: EditBox;

    @property(Button)
    private btnAdd: Button;

    @property(EditBox)
    private txtAdd: EditBox;

    @property(EditBox)
    private txtAddCounts: EditBox;

    @property(Button)
    private btnDelete: Button;

    @property(EditBox)
    private txtDelete: EditBox;

    @property(EditBox)
    private txtDelCounts: EditBox;

    @property(Toggle)
    private toggleStayPos: Toggle;

    @property(Toggle)
    private toggleScroll: Toggle;

    private _vDatas: { title: number, size: number }[];
    private _hDatas: { title: number, size: number }[];

    private getVerticalItemSize(index: number): { width: number, height: number } {
        const data = this._vDatas[index];
        return { width: 0, height: data ? data.size : 100 };
    }

    private getHorizontalItemSize(index: number): { width: number, height: number } {
        const data = this._hDatas[index];
        return { width: data ? data.size : 100, height: 0 };
    }

    onLoad() {
        this._vDatas = [];
        this._hDatas = [];
        let size = 100;
        for (let i = 0; i < 50; i++) {
            size = 100;
            if (i < 10) {
                size -= i;
            } else if (i == 20) {
                size = 200;
            } else if (i > 30) {
                size += i;
            }
            this._vDatas.push({ title: i, size });
            this._hDatas.push({ title: i, size });
        }

        this.vList.setItemRenderer(this, this.onVerticalRenderHandler);
        this.vList.setItemSizeProvider(this, this.getVerticalItemSize);
        this.vList.numItems = this._vDatas.length;

        this.hList.setItemRenderer(this, this.onHorizontalRenderHandler);
        this.hList.setItemSizeProvider(this, this.getHorizontalItemSize);
        this.hList.numItems = this._hDatas.length;

        this.btnTop.node.on(Button.EventType.CLICK, () => {
            this.scrollToTopOrLeft(false);
        }, this);

        this.btnBottom.node.on(Button.EventType.CLICK, () => {
            this.scrollToBottomOrRight(false);
        }, this);

        this.btnTopAni.node.on(Button.EventType.CLICK, () => {
            this.scrollToTopOrLeft(true);
        }, this);

        this.btnBottomAni.node.on(Button.EventType.CLICK, () => {
            this.scrollToBottomOrRight(true);
        }, this);

        this.btnScroll.node.on(Button.EventType.CLICK, () => {
            this.scrollToIndex(false);
        }, this);

        this.btnScrollAni.node.on(Button.EventType.CLICK, () => {
            this.scrollToIndex(true);
        }, this);

        this.btnAdd.node.on(Button.EventType.CLICK, () => {
            this.addItem();
        }, this);

        this.btnDelete.node.on(Button.EventType.CLICK, () => {
            this.deleteItem();
        }, this);

        this.toggleStayPos.node.on(Toggle.EventType.TOGGLE, () => {
            if (this.toggleStayPos.isChecked) {
                this.toggleScroll.isChecked = false;
            }
        }, this);

        this.toggleScroll.node.on(Toggle.EventType.TOGGLE, () => {
            if (this.toggleScroll.isChecked) {
                this.toggleStayPos.isChecked = false;
            }
        }, this);
    }

    private onVerticalRenderHandler(index: number, item: Node): void {
        item.getComponent(VerticalItemRow).updateItem(index, this._vDatas[index]);
    }

    private onHorizontalRenderHandler(index: number, item: Node): void {
        item.getComponent(HorizontalItemCols).updateItem(index, this._hDatas[index]);
    }

    private scrollToTopOrLeft(ani: boolean): void {
        this.vList.scrollToTopIndex(ani);
        this.hList.scrollToTopIndex(ani);
    }

    private scrollToBottomOrRight(ani: boolean): void {
        this.vList.scrollToBottomIndex(ani);
        this.hList.scrollToBottomIndex(ani);
    }

    private scrollToIndex(ani: boolean): void {
        const index = parseInt(this.txtIndex.string);
        if (isNaN(index)) return;
        this.vList.scrollToIndex(index, ani);
        this.hList.scrollToIndex(index, ani);
    }

    private addItem(): void {
        let index = parseInt(this.txtAdd.string);
        let counts = parseInt(this.txtAddCounts.string);
        if (isNaN(index)) index = this._vDatas.length;
        if (isNaN(counts)) counts = 1;

        const addDatas: { title: number, size: number }[] = [];
        for (let i = 0; i < counts; i++) {
            addDatas.push({ title: this._vDatas.length + i, size: 200 });
        }

        this._vDatas.splice(index, 0, ...addDatas);
        this._hDatas.splice(index, 0, ...addDatas);

        let firstIndex = 0;
        let deltaPos = 0;
        let firstIndexH = 0;
        let deltaPosH = 0;
        const keepBottomV = this.vList.isBottom();
        const keepBottomH = this.hList.isBottom();
        if (this.toggleStayPos.isChecked) {
            [firstIndex, deltaPos] = this.vList.getFirstIndexAndPos();
            [firstIndexH, deltaPosH] = this.hList.getFirstIndexAndPos();
        }

        this.vList.numItems = this._vDatas.length;
        this.hList.numItems = this._hDatas.length;
        if (this.toggleStayPos.isChecked) {
            if (keepBottomV) {
                this.vList.scrollToBottomIndex(false);
            } else {
                this.vList.stayOriginPos(index, counts, firstIndex, deltaPos);
            }

            if (keepBottomH) {
                this.hList.scrollToBottomIndex(false);
            } else {
                this.hList.stayOriginPos(index, counts, firstIndexH, deltaPosH);
            }
        } else if (this.toggleScroll.isChecked) {
            this.vList.scrollToIndex(index, true);
            this.hList.scrollToIndex(index, true);
        }
    }

    private deleteItem(): void {
        let index = parseInt(this.txtDelete.string);
        let counts = parseInt(this.txtDelCounts.string);
        if (isNaN(index)) index = this._vDatas.length;
        if (isNaN(counts)) counts = 1;

        this._vDatas.splice(index, counts);
        this._hDatas.splice(index, counts);

        let firstIndex = 0;
        let deltaPos = 0;
        let firstIndexH = 0;
        let deltaPosH = 0;
        const keepBottomV = this.vList.isBottom();
        const keepBottomH = this.hList.isBottom();
        if (this.toggleStayPos.isChecked) {
            [firstIndex, deltaPos] = this.vList.getFirstIndexAndPos();
            [firstIndexH, deltaPosH] = this.hList.getFirstIndexAndPos();
        }

        this.vList.numItems = this._vDatas.length;
        this.hList.numItems = this._hDatas.length;

        if (this.toggleStayPos.isChecked) {
            if (keepBottomV) {
                this.vList.scrollToBottomIndex(false);
            } else {
                this.vList.stayOriginPos(index, -counts, firstIndex, deltaPos);
            }

            if (keepBottomH) {
                this.hList.scrollToBottomIndex(false);
            } else {
                this.hList.stayOriginPos(index, -counts, firstIndexH, deltaPosH);
            }
        } else if (this.toggleScroll.isChecked) {
            this.vList.scrollToIndex(index, true);
            this.hList.scrollToIndex(index, true);
        }
    }
}
