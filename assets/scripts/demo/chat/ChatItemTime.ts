import { _decorator, Button, Event, Label, Node, RichText, Sprite, UITransform } from 'cc';
import { VListItem } from '../../VListItem';
const { ccclass, property } = _decorator;

@ccclass('ChatItemTime')
export class ChatItemTime extends VListItem {

    @property(Label)
    private lblTime: Label;




    public updateItem(index: number, time: number): void {
        let date: Date = new Date();
        let curTime: number = date.getTime();
        let str: string = "";
        // if (curTime - time > 3600000) {
        let sendDate: Date = new Date(time);
        if (date.getFullYear() != sendDate.getFullYear()) {
            str += `${sendDate.getFullYear()}年`;
        }

        if (date.getDate() != sendDate.getDate() || date.getMonth() != sendDate.getMonth()) {
            str += `${sendDate.getMonth() + 1}月${sendDate.getDate()}日 `;
        }

        str += `${sendDate.getHours()}:${sendDate.getMinutes()}`
        // } else {
        //     str = `${Math.floor((curTime - time) / 60000)}分钟前`
        // }

        this.lblTime.string = str;



    }


}


