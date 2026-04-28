import { _decorator, Component, Enum, Node, Sprite, SpriteFrame } from 'cc';
import { DEV } from 'cc/env';
const { ccclass, property } = _decorator;

enum SelectedType {
    NONE = 0,
    TOGGLE = 1,
    SWITCH = 2,
}

@ccclass('VListItem')
export class VListItem extends Component {

    //选择模式
    @property({
        type: Enum(SelectedType),
        tooltip: DEV && '选择模式'
    })
    selectedMode: SelectedType = SelectedType.NONE;
    //被选标志
    @property({
        type: Node, tooltip: DEV && '被选标识',
        visible() { return this.selectedMode > SelectedType.NONE }
    })
    selectedNode: Node = null;
    //被选择的SpriteFrame
    @property({
        type: SpriteFrame, tooltip: DEV && '被选择的SpriteFrame',
        visible() { return this.selectedMode == SelectedType.SWITCH }
    })
    selectedSpriteFrame: SpriteFrame = null;
    //未被选择的SpriteFrame
    _unselectedSpriteFrame: SpriteFrame = null;


    private _realIdx: number;
    public get realIdx(): number {
        return this._realIdx;
    }
    public set realIdx(value: number) {
        this._realIdx = value;
    }


    private _listIdx: number;
    public get listIdx(): number {
        return this._listIdx;
    }
    public set listIdx(value: number) {
        this._listIdx = value;
    }

    private _selected: boolean = false;
    public set selected(val: boolean) {
        this._selected = val;
        this.onSelectedHandler(val);
        if (!this.selectedNode) return;
        switch (this.selectedMode) {
            case SelectedType.TOGGLE:
                this.selectedNode.active = val;
                break;

            case SelectedType.SWITCH:
                let sp: Sprite = this.selectedNode.getComponent(Sprite);
                if (sp)
                    sp.spriteFrame = val ? this.selectedSpriteFrame : this._unselectedSpriteFrame;
                break;
        }
    }

    public get selected(): boolean {
        return this._selected
    }

    onLoad() {
        if (this.selectedMode == SelectedType.SWITCH) {
            const sp: Sprite = this.selectedNode.getComponent(Sprite);
            this._unselectedSpriteFrame = sp.spriteFrame;
        }

    }

    protected onSelectedHandler(val): void {

    }
}


