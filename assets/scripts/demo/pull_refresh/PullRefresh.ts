import { _decorator, Button, Component, EditBox, Label, Node, Toggle } from 'cc';
import { PullEventType, VList } from '../../VList';
import { PullRefreshItem } from './PullRefreshItem';
const { ccclass, property } = _decorator;

@ccclass('PullRefresh')
export class PullRefresh extends Component {
    @property(VList)
    private footerList: VList;

    @property(VList)
    private headerList: VList;


    @property(Label)
    private txtFooterTips: Label;

    @property(Label)
    private txtHeaderTips: Label;

    private _footerLength: number;

    
    private _headerLength: number;

    private _Datas: { title: number, size: number }[];

    private _footerDatas: { title: number, size: number }[];

    private _headerDatas: { title: number, size: number }[];

    onLoad() {

        this._Datas = [];
        this._footerDatas = [];
        this._headerDatas = []
        let size: number = 100;
        for (let i: number = 0; i < 50; i++) {
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


            this._Datas.push({ title: i, size: size });

        }


        this.footerList.setItemRenderer(this, this.onFooterRenderHandler);
        this._footerDatas = this._Datas.slice(0, 2);
        this._footerLength = 2;
        this.footerList.numItems = this._footerDatas.length;


        this.headerList.setItemRenderer(this, this.onHeaderRenderHandler);
        this._headerDatas = this._Datas.slice(0, 2).reverse();
        this._headerLength = 2;
        this.headerList.numItems = this._headerDatas.length;

        this.footerList.node.on(PullEventType.IDLE, this.onFooterPullRefreshHandle, this);
        this.footerList.node.on(PullEventType.PULLING, this.onFooterPullRefreshHandle, this);
        this.footerList.node.on(PullEventType.READY, this.onFooterPullRefreshHandle, this);
        this.footerList.node.on(PullEventType.LOADING, this.onFooterPullRefreshHandle, this);

        this.headerList.node.on(PullEventType.IDLE, this.onHeaderPullRefreshHandle, this);
        this.headerList.node.on(PullEventType.PULLING, this.onHeaderPullRefreshHandle, this);
        this.headerList.node.on(PullEventType.READY, this.onHeaderPullRefreshHandle, this);
        this.headerList.node.on(PullEventType.LOADING, this.onHeaderPullRefreshHandle, this);

    }

    private onFooterRenderHandler(index: number, item: Node): void {
        item.getComponent(PullRefreshItem).updateItem(index, this._footerDatas[index]);
    }

    private onHeaderRenderHandler(index: number, item: Node): void {
        item.getComponent(PullRefreshItem).updateItem(index, this._headerDatas[index]);
    }


    private onFooterPullRefreshHandle(pullEventType: string): void {
        switch (pullEventType) {
            case PullEventType.IDLE:
                this.txtFooterTips.node.active = false;
                break;

            case PullEventType.PULLING:
                this.txtFooterTips.node.active = true;
                this.txtFooterTips.string = "Pull up to load more";
                break;

            case PullEventType.READY:
                this.txtFooterTips.string = "Release to load more";
                break;

            case PullEventType.LOADING:
                this.txtFooterTips.string = "Loading";
                this.scheduleOnce(() => {
                    if (this._footerLength + 1 < this._Datas.length) {
                        this._footerDatas = this._Datas.slice(0, ++this._footerLength);
                    }
                    this.footerList.setPullRefreshComplete(this._footerDatas.length);

                }, 2)
                break;

            default:
                break;
        }
    }

    private onHeaderPullRefreshHandle(pullEventType: string): void {
        switch (pullEventType) {
            case PullEventType.IDLE:
                this.txtHeaderTips.node.active = false;
                break;

            case PullEventType.PULLING:
                this.txtHeaderTips.node.active = true;
                this.txtHeaderTips.string = "Pull down to load more";
                break;

            case PullEventType.READY:
                this.txtHeaderTips.string = "Release down load more";
                break;

            case PullEventType.LOADING:
                this.txtHeaderTips.string = "Loading";
                this.scheduleOnce(() => {
                    if (this._headerLength + 1 < this._Datas.length) {
                        this._headerDatas = this._Datas.slice(0, ++this._headerLength).reverse();
                    }
                    this.headerList.setPullRefreshComplete(this._headerDatas.length);

                }, 2)
                break;

            default:
                break;
        }
    }



}

