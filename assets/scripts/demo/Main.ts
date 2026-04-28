import { _decorator, assetManager, Component, director, Label, Node, resources } from 'cc';
import { VList } from '../VList';
const { ccclass, property } = _decorator;

@ccclass('Main')
export class Main extends Component {

    @property(VList)
    private vList: VList;

    private _datas = [
        { title: "虚拟列表", scene: "virtual_single" },
        { title: "多行列表", scene: "virtual_cols_rows" },
        { title: "page", scene: "virtual_page" },
        { title: "循环列表", scene: "virtual_loop" },
        { title: "分帧创建", scene: "virtual_frame_by_frame" },
        { title: "列表嵌套", scene: "nested" },
        { title: "聊天", scene: "chat" },
        { title: "下拉刷新", scene: "pull_refresh" },
        // { title: "下拉刷新", scene: "pull_refresh_horizontal" },
         { title: "对齐", scene: "align" },
    ];

    onLoad() {
        this.vList.setItemRenderer(this, this.onRenderHandler);
        this.vList.setItemSelect(this, this.onSelectHandler);
        this.vList.numItems = this._datas.length;

        assetManager.loadBundle("resources", (err, data) => {
            if (data) {
                console.log("load sucess");
            }
        })
    }



    update(deltaTime: number) {

    }

    private onRenderHandler(index: number, item: Node): void {
        item.getChildByName("Label").getComponent(Label).string = this._datas[index].title;
    }

    private onSelectHandler(index: number, item: Node): void {
        director.loadScene(this._datas[index].scene, () => {
            director.emit("updateBtn", true);
        });

    }
}


