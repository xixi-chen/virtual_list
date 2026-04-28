import { _decorator, Button, Component, EditBox, Node, Toggle } from 'cc';
import { AlignType, VertAlignType, VList } from '../../VList';
import { AlignVerticalItem } from './AlignVerticalItem';
import { AlignHorizontalItem } from './AlignHorizontalItem';
const { ccclass, property } = _decorator;

@ccclass('AlignList')
export class AlignList extends Component {
    @property(VList)
    private vList: VList;

    @property(VList)
    private hList: VList;




    @property(Button)
    private btnLeft: Button;

    @property(Button)
    private btnCenter: Button;

    @property(Button)
    private btnRight: Button;


    @property(Button)
    private btnAdd: Button;

    @property(Button)
    private btnDelete: Button;

    private _vDatas: { title: number, size: number }[];
    private _hDatas: { title: number, size: number }[];

    onLoad() {

        this._vDatas = [];
        this._hDatas = [];
        let size: number = 100;
        for (let i: number = 0; i < 3; i++) {
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
            this._hDatas.push({ title: i, size: size });
        }


        this.vList.setItemRenderer(this, this.onVerticalRenderHandler);
        this.vList.numItems = this._vDatas.length;
        this.hList.setItemRenderer(this, this.onHorizontalRenderHandler)
        this.hList.numItems = this._hDatas.length;


        this.btnLeft.node.on(Button.EventType.CLICK, () => {
            this.vList.verticalAlign = VertAlignType.Top;
            this.hList.align = AlignType.Left;
        }, this);

        this.btnCenter.node.on(Button.EventType.CLICK, () => {
            this.vList.verticalAlign = VertAlignType.Middle;
            this.hList.align = AlignType.Center;
        }, this);

        this.btnRight.node.on(Button.EventType.CLICK, () => {
            this.vList.verticalAlign = VertAlignType.Bottom;
            this.hList.align = AlignType.Right;
        }, this);



        this.btnAdd.node.on(Button.EventType.CLICK, () => {
            this._vDatas.push({ title: this._vDatas.length, size: size });
            this._hDatas.push({ title: this._hDatas.length, size: size });
            this.vList.numItems = this._vDatas.length;
            this.hList.numItems = this._hDatas.length;
        }, this);

        this.btnDelete.node.on(Button.EventType.CLICK, () => {
            if (this._vDatas.length <= 0) return;
            this._vDatas.pop();
            this._hDatas.pop();
            this.vList.numItems = this._vDatas.length;
            this.hList.numItems = this._hDatas.length;
        }, this);

    }

    private onVerticalRenderHandler(index: number, item: Node): void {
        item.getComponent(AlignVerticalItem).updateItem(index, this._vDatas[index]);
    }

    private onHorizontalRenderHandler(index: number, item: Node): void {
        item.getComponent(AlignHorizontalItem).updateItem(index, this._hDatas[index]);
    }


}

