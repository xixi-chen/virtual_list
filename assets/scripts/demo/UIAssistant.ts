import { _decorator, Button, Canvas, Component, director, Node } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('UIAssistant')
export class UIAssistant extends Component {

    @property(Button)
    private btnClose: Button;


    onLoad() {
        this.btnClose.node.active = false;
        if (!director.isPersistRootNode(this.node)) {
            director.addPersistRootNode(this.node);
        }

        this.btnClose.node.on(Button.EventType.CLICK, () => {
            this.btnClose.node.active = false;
            director.loadScene("scene_main");
        });

        director.on("updateBtn", (visible) => {
            this.btnClose.node.active = visible;
        }, this)

    }

    protected onEnable(): void {
        const camera = director.getScene().getComponentInChildren(Canvas).cameraComponent;
        this.node.getComponent(Canvas).cameraComponent = camera;
    }


}

