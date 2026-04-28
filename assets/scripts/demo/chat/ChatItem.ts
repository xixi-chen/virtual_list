import { _decorator, Button, Event, Label, Node, RichText, Sprite, UITransform, v2 } from 'cc';
import { VListItem } from '../../VListItem';
import { Message, MsgData } from './ChatList';
const { ccclass, property } = _decorator;

@ccclass('ChatItem')
export class ChatItem extends VListItem {

    @property(RichText)
    private lblMsg: RichText;

    @property(Node)
    private bgContent: Node;

    public updateItem(index: number, msg: MsgData): void {
        this.lblMsg.string = msg.msg.content;


        let linesWidth = this.lblMsg["_linesWidth"];


        // this.lblTime.updateRenderData();
        const msgTrans = this.lblMsg.getComponent(UITransform);
        const bgTrans = this.bgContent.getComponent(UITransform);

        if (linesWidth.length == 1) {
            bgTrans.width = linesWidth[0] + 30;
            if (msg.msg.playerId == 1) {
                let x = this.bgContent.x - 15 + msgTrans.width - linesWidth[0];
                this.lblMsg.node.setPosition(x, this.lblMsg.node.y);
            }

        } else {
            bgTrans.width = 690;
            if (msg.msg.playerId == 1) {
                this.lblMsg.node.setPosition(this.bgContent.x - 15, this.lblMsg.node.y);
            }

        }



        bgTrans.height = msgTrans.height + 20;
        this.node.getComponent(UITransform).height = Math.max(-this.bgContent.y + bgTrans.height, 90);

    }


}


