import { _decorator, Button, Component, EditBox, Label, Node, ScrollView, Toggle, UITransform } from 'cc';
import { VList } from '../../VList';
import { ChatItem } from './ChatItem';
import { ChatItemTime } from './ChatItemTime';
const { ccclass, property } = _decorator;


export class Message {
    public msgId: number;
    public playerId: number;
    public content: string;
    public sendTime: number;
}

export class MsgData {

    public msg: Message;
    public msgTime: number;
}

@ccclass('ChatList')
export class ChatList extends Component {
    @property(VList)
    private vList: VList;


    @property(Button)
    private btnLeft: Button;

    @property(Button)
    private btnRight: Button;

    @property(Button)
    private btnScroll: Button;

    private _chatDatas: MsgData[] = [];


    onLoad() {

        this.btnRight.node.on(Button.EventType.CLICK, () => {
            this.addMessage(1);
        }, this);

        this.btnLeft.node.on(Button.EventType.CLICK, () => {
            this.addMessage(2);
        }, this);

        this.btnScroll.node.on(Button.EventType.CLICK, () => {
            this.vList.scrollToBottomIndex(true);
        }, this);

        this.vList.setItemProvider(this, this.onProviderHandler);
        this.vList.setItemRenderer(this, this.onRenderHandler);
        let firstMsgTime: number = 1772008876000;
        let data = new MsgData();
        data.msgTime = firstMsgTime;
        this._chatDatas.push(data);
        // this.vList.numItems = 20;
        for (let i = 0; i < 2; i++) {
            let msg = new Message();
            msg.playerId = i + 1;
            msg.sendTime = firstMsgTime + i * 1000;
            msg.content = this.generateRandomMessage();
            msg.msgId = i + 1;

            let msgData = new MsgData();
            msgData.msg = msg;
            this._chatDatas.push(msgData);
        }

        this.vList.numItems = this._chatDatas.length;
    }


    private onRenderHandler(index: number, item: Node): void {
        if (this._chatDatas[index].msgTime) {
            item.getComponent(ChatItemTime).updateItem(index, this._chatDatas[index].msgTime);
        } else {
            item.getComponent(ChatItem).updateItem(index, this._chatDatas[index]);
        }

    }

    private onProviderHandler(index: number): number {
        if (this._chatDatas[index].msgTime) {
            return 2;
        } else if (this._chatDatas[index].msg.playerId == 1) {
            return 1;
        } else {
            return 0;
        }
    }

    private addMessage(playerId: number): void {
        let isBottom: boolean = this.vList.isBottom();
        let msg = new Message();
        msg.playerId = playerId;
        msg.sendTime = new Date().getTime();
        msg.content = this.generateRandomMessage();
        msg.msgId = this._chatDatas[this._chatDatas.length - 1].msg.msgId + 1;

        let lastTime: number = this._chatDatas[this._chatDatas.length - 1].msg.sendTime;
        if (msg.sendTime - lastTime > 3600000) {
            let data = new MsgData();
            data.msgTime = msg.sendTime;
            this._chatDatas.push(data);
        }

        let msgData = new MsgData();
        msgData.msg = msg;
        this._chatDatas.push(msgData);

        this.vList.numItems = this._chatDatas.length;
        if (isBottom) {
            this.vList.scrollToBottomIndex(true);
        }

    }


    // private _index = 0;
    // 生成随机消息
    private generateRandomMessage(): string {
        // const tempMessages = [
        //     '<b>这是粗体文本</b>，<i>这是斜体文本</i>，<u>这是带下划线的文本</u>，可以组合使用。',
        //     '看到路边有只小猫在晒太阳，懒洋洋的，就像现在的我。',
        //     '收到一条消息，开心到转圈圈！💃🎉✨',
        //     '嘿，忙完没？记得抽空活动一下脖子，别一直盯着电脑。',
        //     '今天傍晚散步的时候，路过一家快要打烊的花店，店主正在把门口的鲜花搬回屋里，有一束白色的栀子花在夕阳下特别显眼，我突然觉得，生活里那些看似不起眼的瞬间，往往藏着最温柔的治愈力',
        // ]
        // return tempMessages[this._index++];

        const messages = [
            '早啊，今天阳光特别好',
            '嘿，忙完没？记得抽空活动一下脖子，别一直盯着电脑。',
            '晚安，早点休息，熬夜对身体不好哦。',
            '午饭吃的什么？我正纠结吃面还是吃饭，给个建议呗。',
            '周末有什么计划吗？我打算在家看看书，享受一下慢生活。',
            '最近天气变化大，出门记得带伞，小心别感冒了。',
            '刚听到一首好听的歌，突然就想起你了，分享给你。',
            '在干嘛呢？要是无聊的话，我可以陪你聊会儿天。',
            '看到路边有只小猫在晒太阳，懒洋洋的，就像现在的我。',
            '今天是周五！感觉这一周过得怎么样？',
            '今天傍晚散步的时候，路过一家快要打烊的花店，店主正在把门口的鲜花搬回屋里，有一束白色的栀子花在夕阳下特别显眼，我突然觉得，生活里那些看似不起眼的瞬间，往往藏着最温柔的治愈力',
            '你有没有过这样一种感觉？就是单曲循环一首老歌的时候，明明歌词写的不是自己的故事，可脑海里却像放电影一样，闪过很多模糊的画面，有小时候的夏天，有旧朋友的笑脸，还有那些回不去的时光',
            '最近在重读一本很久以前看过的书，发现同样的段落，现在读起来感受完全不一样了。也许不是书变了，而是我们经历了一些事，心里的那杆秤不一样了，这大概就是成长带来的副作用吧',
            '我常常在想，如果多年以后我们再回忆起今天，会是什么感觉？会不会像我们现在回忆童年一样，觉得那时候的烦恼其实都不算什么，那时候的快乐却特别简单纯粹',
            '刚才刷到一条关于北极光的视频，绿莹莹的光带在夜空中舞动，底下有句评论说：“看到极光的人，会幸福一辈子。”虽然知道是传说，但那一瞬间，还是忍不住对着屏幕许了个愿',
            '其实我觉得，人与人之间的相遇真的很奇妙，就像两列在不同轨道上行驶的火车，在某个特定的时间和地点，突然就有了交集，哪怕只是并肩走一小段路，也值得好好珍惜',
            '今天帮同事解决了一个技术难题，虽然花了整整一个下午，但当看到他紧皱的眉头舒展开，连声道谢的时候，心里那种满足感，比拿到奖金还要让人开心',
            '你有没有特别想回到过去的某个时刻？对我来说，是大学时那个夏夜，和室友们坐在操场的草坪上，一边喝着冰可乐，一边聊着不着边际的未来，那时候的星星，好像比现在亮得多',
            '早晨被窗外小鸟的叫声吵醒，本来还有点起床气，但推开窗，看到楼下绿化带的月季开得正艳，露珠在花瓣上闪闪发光，那一刻觉得，能活着看到这样的清晨，真好',
            '有时候觉得生活就像打游戏，我们都是新手玩家，没有攻略，只能一路摸索，会碰到很多难缠的BOSS，会掉血，会想放弃，但只要坚持住，总能看到下一关的风景',
            '刚看完一部老电影，片尾字幕滚动的时候，我一个人坐在沙发上愣了好久。好的电影就是这样吧，它讲完了故事，却在你的心里留下了回音，让你忍不住去思考一些平时不会想的问题',
            '今天路过一家琴行，里面传来钢琴声，是个小朋友在弹《致爱丽丝》，弹得断断续续的，但我却在门口听了很久。那种笨拙却认真的样子，让我想起了自己学骑车时的模样',
            '我发现随着年龄增长，时间好像越过越快。小时候一个下午可以玩很久很久，现在一年一年嗖地就过去了。大概是因为小时候我们在探索世界，而现在只是在重复生活吧',
            '深夜睡不着的时候，经常会想起外婆做的红烧肉，那不是什么山珍海味，但那种家的味道，是任何米其林餐厅都做不出来的，因为它里面加了一味特殊的调料，叫“爱”',
            '其实每天最放松的时刻，就是忙完所有事情，洗个热水澡，躺在床上的那几分钟。虽然知道明天醒来又要面对一堆琐事，但至少此刻，世界是安静的，我是属于自己的',
            '早呀～今天也要做一个快乐的打工人！💼☕️💪',
            '好想吃火锅啊啊啊！🍲🥩🥬 毛肚、黄喉、鸭肠，等我！🏃‍♂️💨',
            '今天天气真好，想变成一只猫，趴在窗台上晒太阳，什么都不想～☀️😸💤',
            '收到一条消息，开心到转圈圈！💃🎉✨',
            '熬夜冠军就是我，我就是熬夜冠军！🌙👑😴（说完就去睡）',
            '今天也是被生活暴击的一天呢...😭💔🤕 但没关系，我还能再战！💪😤',
            '准备开启周末模式：零食🍿，可乐🥤，沙发🛋️，追剧📺，谁也别叫我！🚫',
            '刚刚看到一只超可爱的小狗🐶，冲我摇尾巴，心都化了～🧊💕',
            '今天的晚饭：泡面🍜 + 火腿肠 + 综艺节目 📺 = 幸福到飞起 ✈️😋',
            '心情就像坐过山车🎢，忽高忽低的，需要一点甜食来稳定一下 🍰🧁🍬',
            '晚安啦～我要去梦里吃大餐了！🌙😴🍣🍤🍰 梦里啥都有！',
            '今天运动了吗？没有。🏃‍♂️❌ 那明天呢？明天再说。📅🤔',
            '突然好想去海边🌊，踩在软软的沙滩上，看日落🌅，听海浪的声音～🌊👂',
            '朋友问我最近在干嘛？我：发呆 🤔💭，玩手机 📱，想你 👉👈🥰',
            '今日份的快乐是奶茶给的！🧋😍 芋泥波波yyds！🙌✨',
            '收拾房间的时候翻出了旧照片 📸，那时候的我...怎么有点非主流？😱🤣🙈',
            '最近运气好像不错，买饮料居然中了“再来一瓶”！🍾🎉🥤',
            '下雨天🌧️，最适合躲在被窝里睡懒觉了～😴🛏️☔️ 舒服！',
            '新买的小包包到啦！🛍️🎁 虽然装不了什么东西，但好看就完事了！💅✨',
            '今天也要加油鸭！🦆💪 你是最棒的！🌟👍',
            '<color=#FF5733>今天天气真好，适合出去走走！</color>',
            '<size=40>特大号新闻：我养的多肉开花了！</size>',
            '<outline color=blue width=2>这段文字带有蓝色描边，是不是很显眼？</outline>',
            '<b>这是粗体文本</b>，<i>这是斜体文本</i>，<u>这是带下划线的文本</u>，可以组合使用。',
            '<color=green>绿色代表环保</color>，<color=#FFD700>金色代表富贵</color>，你喜欢哪种？',
            '<size=20>稍微放大一点</size>，<size=15>再小一点</size>，<size=30>还是这么大舒服</size>。',
            '<outline color=red width=3>警告：这条消息很重要！</outline>',
            '<b><i>粗体加斜体，强调加倍！</i></b>',
            '<u>下划线可以突出重点</u>，比如<u>这里</u>和<u>那里</u>。',
            '<color=#FF1493 click="likeHandler">点个赞吧！</color> 你的支持是我最大的动力。',
            '<size=25 click="enlarge">点击我可以放大</size>，<size=15 click="shrink">点击我可以缩小</size>，交互感满满。',
            '<outline color=purple>紫色描边，自带神秘感</outline>，<outline color=yellow width=5>黄色描边加粗，醒目！</outline>',
            '第一行文字<br/>第二行文字，这是用br标签换行的效果。',
            '<b>重要提醒：</b> <i>明天记得带伞，天气预报说有雨。</i>',
            '<color=#00FFFF>青色</color>和<color=#FFC0CB>粉色</color>搭配，少女心满满。',
            '<size=50>超大号字体，适合标题</size>，<size=10>超小号字体，适合备注</size>。',
            '<outline color=lime width=1>细描边，低调奢华</outline>，<outline color=black width=6>粗黑边，霸气外露</outline>。',
            '<b>加粗</b> + <i>斜体</i> + <u>下划线</u> = <b><i><u>三重效果</u></i></b>',
            '<color=maroon>栗色</color>，<color=olive>橄榄色</color>，<color=teal>鸭绿色</color>，这些内置颜色都可以用。',
            '<size=18>十八号字</size>，<size=24>二十四号字</size>，<size=36>三十六号字</size>，大小随意调。',
            '<outline color=gray width=2>灰色描边，百搭款</outline>，普通文本也可以搭配。',
            '普通文字中间夹杂<b>加粗部分</b>和<i>斜体部分</i>，还有<u>下划线部分</u>，让聊天不再单调。',
            '<color=orange click="buyHandler" param="apple">购买苹果</color>，<color=purple click="buyHandler" param="grape">购买葡萄</color>，点击不同水果触发不同参数。',
            '<size=28>稍微大点的字</size>后面跟着<size=12>小字注释</size>，形成对比。',
            '<outline color=cyan width=3>青色描边</outline>，<outline color=magenta width=3>品红描边</outline>，哪个更好看？',
            '<b><u>加粗加下划线</u></b>，<i><u>斜体加下划线</u></b>（注意标签闭合顺序要正确）'

        ];

        return messages[Math.floor(Math.random() * messages.length)];
    }


}

