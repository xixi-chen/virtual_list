import { _decorator, CCFloat, CCInteger, Component, Director, director, Enum, Event, EventTouch, instantiate, Layout, Node, NodeEventType, PageView, PageViewIndicator, Prefab, Rect, ScrollView, Size, Touch, UITransform, Vec2, Vec3, ViewGroup, Widget } from 'cc';
import { VListItem } from './VListItem';
import { DEV } from 'cc/env';
const { ccclass, property, executionOrder } = _decorator;


export enum ListLayoutType {
    /**每行一个item，竖向排列。*/
    SingleColumn,

    /**每列一个item，横向排列。*/
    SingleRow,

    /**item横向依次排列，到底视口右侧边缘或到达指定的列数，自动换行继续排列。一般搭配垂直滚动*/
    FlowHorizontal,

    /**item竖向依次排列，到底视口底部边缘或到达指定的行数，返回顶部开启新的一列继续排列。一般搭配水平滚动*/
    FlowVertical,

    /**
     * 视口宽度x视口高度作为单页大小，横向排列各个页面。每页中，item横向依次排列，
     * 到底视口右侧边缘或到达指定的列数，自动换行继续排列。当新的一行超出视口高度或到达指定的行数，则进入下一页。
     */
    Pagination
}


export enum PageType {
    /**item横向依次排列，到底视口右侧边缘或到达指定的列数，自动换行继续排列。一般搭配垂直滚动*/
    PageFlowHorizontal,

    /**item竖向依次排列，到底视口底部边缘或到达指定的行数，返回顶部开启新的一列继续排列。一般搭配水平滚动*/
    PageFlowVertical,
}



export enum ListSelectionMode {
    Single,
    Multiple,
    Multiple_SingleClick,
    None
}

export enum AlignType {
    Left,
    Center,
    Right
}

export enum VertAlignType {
    Top,
    Middle,
    Bottom
}


export enum ChildrenRenderOrder {
    /**升序，这是默认值，按照对象在显示列表中的顺序，从小到大依次渲染，效果就是序号大的显示在较前面。*/
    Ascent,
    /**降序，按照对象在显示列表中的顺序，从大到小依次渲染，效果就是序号小的显示在较前面。*/
    Descent,
    /**拱形，需要指定一个顶峰的索引，从两端向这个索引位置依次渲染，效果就是这个位置的对象显示在最前面，两边的对象依次显示在后面*/
    Arch
}


export enum PullEventType {
    IDLE = "IDLE",
    PULLING = "PULLING",
    READY = "READY",
    LOADING = "LOADING",
}


export type ListItemRenderer = (index: number, item: Node, realIndex: number) => void;
export type ListItemSizeProvider = (index: number) => Size | { width: number, height: number };
type LinearAxis = 'vertical' | 'horizontal';
type LinearProcessFn = (
    fromFrame: boolean,
    forceUpdate: boolean,
    curIndex: number,
    curX: number,
    curY: number,
    startCross: number,
    max: number,
    maxMain: number,
    preMaxMain: number,
    afterMaxMain: number,
    deltaSize: number,
    firstItemDeltaSize: number,
    forward: boolean,
    oldFirstIndex: number,
    newFirstIndex: number,
    reuseIndex: number,
    lastIndex: number,
    firstRowOrLine: boolean
) => any[];

@ccclass('VList')
@executionOrder(-1000)
export class VList extends ScrollView {
    /**
     * File organization map:
     * 1) Selection / Pool / Child Operations
     * 2) Input & Selection Events
     * 3) Index Mapping & Virtual Toggle
     * 4) Virtual List Core (vertical/horizontal/page paths)
     * 5) Render Order / Initialization / Layout Internals
     * 6) Content Size Mutation & Boundary Helpers
     * 7) ScrollView Overrides & Lifecycle Hooks
     * 8) Public Scroll APIs & Position Utilities
     * 9) PageView Behaviors
     * 10) Pull Refresh State
     */
    @property({ type: Prefab, displayOrder: 11 })
    defaultItemPrefab: Prefab;

    @property({ type: [Prefab], displayOrder: 12 })
    tmpList: Prefab[] = [];

    @property({ visible: true, displayOrder: 13, tooltip: DEV && 'set virtual' })
    private _virtual: boolean = true;

    /**
     * 渲染回调
     */
    private _itemRenderer: ListItemRenderer;
    private _rendererTarget: Component;
    public setItemRenderer(target: Component, func: ListItemRenderer): void {
        this._rendererTarget = target;
        this._itemRenderer = func;
    }

    // Cache frequently used linear scroll callbacks to avoid per-scroll bind allocations.
    private readonly _handleScroll1ProcessFn: LinearProcessFn = this.handleScroll1Process.bind(this);
    private readonly _handleScroll2ProcessFn: LinearProcessFn = this.handleScroll2Process.bind(this);
    private readonly _handleScroll1LoopHandler: () => void = () => this.handleScroll1Loop();
    private readonly _handleScroll2LoopHandler: () => void = () => this.handleScroll2Loop();

    /**
     * item创建模版回调函数
     */
    private _itemProvider: (index: number) => string | number;
    private _providerTarget: Component;
    public setItemProvider(target: Component, func: (index: number) => string | number): void {
        this._providerTarget = target;
        this._itemProvider = func;
    }

    private _itemSizeProvider: ListItemSizeProvider;
    private _sizeProviderTarget: Component;
    public setItemSizeProvider(target: Component, func: ListItemSizeProvider): void {
        this._sizeProviderTarget = target;
        this._itemSizeProvider = func;
        if (this._virtual && this._initItems) {
            this.syncVirtualItemSizesFromProvider();
            this.refreshVirtualList();
        }
    }

    /**
     * item点击选中回调
     */
    private _itemSelectHandler: (index: number, item: Node) => void;
    private _selectTarget: Component;
    public setItemSelect(target: Component, func: (index: number, item: Node) => void): void {
        this._selectTarget = target;
        this._itemSelectHandler = func;
    }

    /**
     * 点击item后滚动到相应位置
     */
    public scrollItemToViewOnClick: boolean = false;

    @property({ visible: true, displayOrder: 16, tooltip: DEV && '开启循环模式' })
    private _loop: boolean = false;

    @property({
        type: CCInteger, displayOrder: 16, visible: function () {
            return this._loop == true;
        }, tooltip: DEV && '循环模式下_numItems的倍数 <br> _realItem = _numItems * _loopNums'
    })
    /**
     * 循环模式下_numItems的倍数, _realItem = _numItems * _loopNums
     * 实现首尾连接，最小需要2倍，当然_loopNums的值越小越好，
     */
    private _loopNums: number = 2;

    @property({ type: Enum(ListLayoutType), visible: true, displayOrder: 14 })
    private _layout: ListLayoutType = ListLayoutType.SingleColumn;

    @property({
        type: Enum(PageType), displayOrder: 14, visible: function () {
            return this._layout == ListLayoutType.Pagination;
        }
    })
    private _pageType: PageType = PageType.PageFlowHorizontal;



    @property({ type: Enum(AlignType), displayOrder: 15, visible: true, tooltip: DEV && '水平对齐' })
    private _align: AlignType = AlignType.Left;

    @property({ type: Enum(VertAlignType), displayOrder: 15, visible: true, tooltip: DEV && '垂直对齐' })
    private _verticalAlign: VertAlignType = VertAlignType.Top;

    @property({ displayOrder: 15, visible: true, tooltip: DEV && '在非滚动方向上是否对齐' })
    private _alignAllDirection: boolean = false;

    @property({ type: Enum(ChildrenRenderOrder), visible: true, tooltip: 'Ascent:升序;<br> Descent:降序;<br> Arch:拱形' })
    private _childrenRenderOrder = ChildrenRenderOrder.Ascent;

    @property({ type: CCInteger, visible: true, tooltip: DEV && '行数' })
    private _lineCount: number = 0;
    @property({ type: CCInteger, visible: true, tooltip: DEV && '列数' })
    private _columnCount: number = 0;

    @property({ type: CCFloat, visible: true, tooltip: DEV && '行距' })
    private _lineGap: number = 0;
    @property({ type: CCFloat, visible: true, tooltip: DEV && '列距' })
    private _columnGap: number = 0;

    @property({ type: CCFloat, visible: true, tooltip: DEV && 'padding_left' })
    protected _paddingLeft = 0;
    @property({ type: CCFloat, visible: true, tooltip: DEV && 'padding_right' })
    protected _paddingRight = 0;
    @property({ type: CCFloat, visible: true, tooltip: DEV && 'padding_top' })
    protected _paddingTop = 0;
    @property({ type: CCFloat, visible: true, tooltip: DEV && 'padding_bottom' })
    protected _paddingBottom = 0;

    private _defaultItem: Node;
    private _providerItems: Node[];
    private _selectionMode: ListSelectionMode;

    private _lastSelectedIndex: number = 0;
    private _pool: { [key: string]: Node[] };

    private _initItems: boolean = false;
    private _stayPosAfterRefresh: boolean = true;
    private _numItems: number = 0;
    private _realNumItems: number = 0;

    //Virtual List support
    private _firstIndex: number = 0;    //the top left index
    private _curLineItemCount: number = 0;   //item count in one line
    private _curLineItemCount2: number = 0;
    private _itemSize?: Size;
    private _virtualListChanged: number = 0; //1-content changed, 2-size changed
    private _virtualItems?: Array<ItemInfo>;
    private _eventLocked?: boolean;
    private itemInfoVer: number = 0; //用来标志item是否在本次处理中已经被重用了


    // frame-by-frame
    @property({
        type: CCFloat, visible: true, displayOrder: 17, tooltip: DEV && '分帧间隔'
    })
    /**
     * 分帧间隔
     */
    private frameInterval: number = 0;

    @property({
        type: CCInteger, visible: true, range: [0, 1000, 1], displayOrder: 17, tooltip: DEV && '每帧创建数量'
    })
    /**
     * 每帧创建item数量
     */
    private itemsPerFrame: number = 0;

    @property({
        displayOrder: 17, visible: function () {
            return this.updateInterval > 0 && this.itemsPerFrame > 0;
        }, tooltip: DEV && '分帧创建过程中，滚动立刻退出分帧，全部渲染'
    })
    private _quitFrameInScrolling: boolean = false;


    @property({
        displayOrder: 18, visible: true, tooltip: DEV && '下拉刷新<br>1 pull down <br>2 pull up'
    })
    private _pullRefresh: 0 | 1 | 2 = 0;

    @property({
        displayOrder: 19, visible: DEV, tooltip: DEV && 'debug log'
    })
    private _debugLog: boolean = false;

    public setDebugLog(enabled: boolean): void {
        this._debugLog = enabled;
    }

    public set pullRefresh(val: 0 | 1 | 2) {
        this._pullRefresh = val;
    }

    @property({
        displayOrder: 18, visible: function () { return this._pullRefresh > 0 }, tooltip: DEV && '下拉刷新阈值'
    })
    public pullRefreshThreshold: number = 50;

    private _pullRefreshState: PullEventType = PullEventType.IDLE;
    private _pullRealWidth: number;
    private _pullRealHeight: number

    private _initFillState: 0 | 1 | 2 = 0;
    private dynamicItemsPerFrame: number = 0;

    private _curIndexFrame: number = -1;
    private _maxFrame: number = 0;
    private _curXFrame: number = 0;
    private _curYFrame: number = 0;

    private _maxSizeFrame: number = 0;
    private _preMaxSizeFrame: number = 0;
    private _afterMaxSizeFrame: number = 0;

    private _reuseIndexFrame: number = 0;
    private _deltaSizeFrame: number = 0;
    private _firstItemDeltaSizeFrame: number = 0;
    private _endFrame: boolean;
    private _forwardFrame: boolean;

    private _newFirstIndexFrame: number = 0;
    private _oldFirstIndexFrame: number = 0;
    private _lastIndexFrame: number = 0;
    private _forceUpdate: boolean;
    private _childCountFrame: number;
    private _originSize: Map<number, number[]> = new Map()
    private _firstRowOrLineFrame: boolean;

    private _lastObjFrame: Node = null;
    private _insertIndexFrame: number = 0;



    private _startLoop: boolean;
    private _pendingScrollEndSettle: boolean = false;

    // not virtual
    private _cwFrame: number;
    private _chFrame: number;
    private _pageFrame: number;
    private _startIndexFrame: number;

    private _children: Node[]
    private _contentUITransform: UITransform;


    /** 显示在最前面的索引 */
    private _apexIndex: number;
    private _inited: boolean;
    private _tempInitNumItems: number;

    private _trackingIndex: number = -1;
    private _lastIndexPos: number = -1;
    private _scanPos: number = 0;
    private _modifyingContentSizeOnScrolling: boolean = false;
    private _pendingModifyDeltaWidth: number = 0;
    private _pendingModifyDeltaHeight: number = 0;
    private _pendingModifyDeltaPosX: number = 0;
    private _pendingModifyDeltaPosY: number = 0;

    public _alignOffset: Vec2;

    private _paddingNode: Node;

    /**
     * @en
     * The left padding of layout, it only effect the layout in one direction.
     *
     * @zh
     * 容器内左边距，只会在一个布局方向上生效。
     */
    get paddingLeft() {
        return this._paddingLeft;
    }
    set paddingLeft(value: number) {
        if (this._paddingLeft === value) {
            return;
        }

        this._paddingLeft = value;
        if (this._inited) {
            this.updatePaddingNode();
        }
        // this._doLayoutDirty();
    }

    /**
     * @en
     * The right padding of layout, it only effect the layout in one direction.
     *
     * @zh
     * 容器内右边距，只会在一个布局方向上生效。
     */
    get paddingRight() {
        return this._paddingRight;
    }
    set paddingRight(value: number) {
        if (this._paddingRight === value) {
            return;
        }

        this._paddingRight = value;
        if (this._inited) {
            this.updatePaddingNode();
        }
        // this._doLayoutDirty();
    }

    /**
     * @en
     * The top padding of layout, it only effect the layout in one direction.
     *
     * @zh
     * 容器内上边距，只会在一个布局方向上生效。
     */
    get paddingTop() {
        return this._paddingTop;
    }
    set paddingTop(value) {
        if (this._paddingTop === value) {
            return;
        }

        this._paddingTop = value;
        if (this._inited) {
            this.updatePaddingNode();
        }
        // this._doLayoutDirty();
    }

    /**
     * @en
     * The bottom padding of layout, it only effect the layout in one direction.
     *
     * @zh
     * 容器内下边距，只会在一个布局方向上生效。
     */
    get paddingBottom() {
        return this._paddingBottom;
    }
    set paddingBottom(value) {
        if (this._paddingBottom === value) {
            return;
        }

        this._paddingBottom = value;
        if (this._inited) {
            this.updatePaddingNode();
        }
    }


    get apexIndex() {
        return this._apexIndex;
    }
    setApexIndex(value: number, forceUpdate: boolean = false) {
        if (this._apexIndex === value && !forceUpdate) {
            return;
        }

        this._apexIndex = value;
        if (this._childrenRenderOrder == ChildrenRenderOrder.Arch)
            this.buildNativeDisplayList();
    }

    public constructor() {
        super();

        this._pool = {};
        this._lastSelectedIndex = -1;
        this._selectionMode = ListSelectionMode.Single;
        this._alignOffset = new Vec2(-1, -1)

    }

    private debugLog(...args: any[]): void {
        if (DEV && this._debugLog) {
            console.log(...args);
        }
    }

    private getContentUITransform(): UITransform {
        if (!this._contentUITransform) {
            this._contentUITransform = this._content.getComponent(UITransform);
        }
        return this._contentUITransform;
    }


    public get layout(): ListLayoutType {
        return this._layout;
    }

    public set layout(value: ListLayoutType) {
        if (this._layout != value) {
            this._layout = value;
            if (this._virtual) {
                this.setVirtualListChangedFlag(true);
            }
        }
    }

    public get columCount(): number {
        return this._columnCount;
    }

    public set columCount(value: number) {
        if (this._columnCount != value) {
            this._columnCount = value;
            if (this._virtual) {
                this.setVirtualListChangedFlag(true);
            }
        }
    }

    public get lineGap(): number {
        return this._lineGap;
    }

    public set lineGap(value: number) {
        if (this._lineGap != value) {
            this._lineGap = value;
            if (this._virtual) {
                this.setVirtualListChangedFlag(true);
            }
        }
    }

    public get columnGap(): number {
        return this._columnGap;
    }

    public set columnGap(value: number) {
        if (this._columnGap != value) {
            this._columnGap = value;
            if (this._virtual) {
                this.setVirtualListChangedFlag(true);
            }
        }
    }

    public get align(): number {
        return this._align;
    }

    public set align(value: number) {
        if (this._align != value) {
            this._align = value;
            this._calculateBoundary();
        }
    }

    public get verticalAlign(): number {
        return this._verticalAlign;
    }

    public set verticalAlign(value: number) {
        if (this._verticalAlign != value) {
            this._verticalAlign = value;
            this._calculateBoundary();
        }
    }

    public get virtualItemSize(): Size {
        return this._itemSize;
    }

    public set virtualItemSize(value: Size) {
        if (this._virtual) {
            if (this._itemSize == null)
                this._itemSize = new Size(0, 0);
            this._itemSize.width = value.width;
            this._itemSize.height = value.height;
            this.setVirtualListChangedFlag(true);
        }
    }

    public get defaultItem(): Node | null {
        return this._defaultItem;
    }

    public set defaultItem(val: Node | null) {
        this._defaultItem = val;
    }



    public get selectionMode(): ListSelectionMode {
        return this._selectionMode;
    }

    public set selectionMode(value: ListSelectionMode) {
        this._selectionMode = value;
    }

    // ====================================================================================================
    // Module: Selection / Pool / Child Operations
    // ====================================================================================================
    public get itemPool(): {} {
        return this._pool;
    }

    public getFromPool(url?: string): Node {
        if (!url && this._defaultItem)
            url = this._defaultItem.name;

        var obj: Node = this.getObject(url);
        if (obj)
            obj.active = true;
        return obj;
    }



    private getObject(url: string | number): Node {
        if (typeof (url) === "number") {
            let tmp = this._providerItems && this._providerItems[url]
            url = tmp ? tmp.name : this._defaultItem.name;
        }

        let arr: Node[] = this._pool[url];
        if (arr && arr.length > 0) {
            return arr.pop();
        } else {
            let node = this._defaultItem
            if (this._providerItems) {
                let providerNode = this._providerItems.find((value) => {
                    return value.name == url;
                })
                node = providerNode || node;


            }
            return instantiate(node);
        }
    }

    public returnToPool(obj: Node): void {
        const key = obj.name;
        if (key != "") {
            this.putPool(key, obj)
        }
    }

    private putPool(key: string, item: Node): void {
        item.removeFromParent();
        let arr: Node[] = this._pool[key];
        if (!arr) {
            this._pool[key] = [item];
        } else {
            arr.push(item);
        }
    }


    public addChildAt(child: Node, index: number): Node {
        let cnt: number = this._children.length;
        if (this._childrenRenderOrder == ChildrenRenderOrder.Ascent)
            this._content.insertChild(child, index);
        else if (this._childrenRenderOrder == ChildrenRenderOrder.Descent)
            this._content.insertChild(child, cnt - index);
        else //拱形，后面会调用buildNativeDisplayList
            this._content.addChild(child)

        child.on(NodeEventType.TOUCH_END, this.onClickItem, this);
        return child;


    }

    public addChild(child: Node): Node {
        return this.addChildAt(child, this._children.length)
    }

    public addItemFromPool(url?: string | number): Node {
        if (typeof (url) === "number") {
            let tmp = this._providerItems && this._providerItems[url]
            url = tmp ? tmp.name : undefined;
        }
        return this.addChild(this.getFromPool(url));
    }

    public removeChildAt(index: number, dispose?: boolean): Node {
        let child = this.getChildAt(index);
        if (child) {
            this._content.removeChild(child)
            child.off(NodeEventType.TOUCH_END, this.onClickItem, this);
        }
        return child;
    }

    public removeChild(child: Node): Node {
        if (child) {
            this._content.removeChild(child)
            child.off(NodeEventType.TOUCH_END, this.onClickItem, this);
        }
        return child;
    }

    public removeChildToPoolAt(index: number): void {
        var child: Node = this.removeChildAt(index);
        this.returnToPool(child);
    }

    public removeChildToPool(child: Node): void {
        this.removeChild(child);
        this.returnToPool(child);
    }

    public removeChildrenToPool(beginIndex?: number, endIndex?: number): void {
        if (beginIndex == undefined) beginIndex = 0;
        if (endIndex == undefined) endIndex = -1;
        if (endIndex < 0 || endIndex >= this._children.length)
            endIndex = this._children.length - 1;

        for (let i: number = endIndex; i >= beginIndex; i--) {
            this.removeChildToPoolAt(beginIndex);
        }

    }

    public get selectedIndex(): number {
        var i: number;
        let listItem: VListItem
        if (this._virtual) {
            for (i = 0; i < this._realNumItems; i++) {
                var ii: ItemInfo = this._virtualItems[i];
                listItem = ii.obj && ii.obj.getComponent(VListItem);
                if (listItem && listItem.selected || !ii.obj && ii.selected) {
                    if (this._loop)
                        return i % this._numItems;
                    else
                        return i;
                }
            }
        }
        else {
            var cnt: number = this._children.length;
            for (i = 0; i < cnt; i++) {
                var obj: Node = this._children[i];
                if (obj.getComponent(VListItem) && obj.getComponent(VListItem).selected)
                    return i;
            }
        }

        return -1;
    }

    public getSelection(result?: number[]): number[] {
        if (!result)
            result = new Array<number>();
        var i: number;
        let listItem: VListItem
        if (this._virtual) {
            for (i = 0; i < this._realNumItems; i++) {
                var ii: ItemInfo = this._virtualItems[i];
                listItem = ii.obj && ii.obj.getComponent(VListItem);
                if (listItem && listItem.selected || !ii.obj && ii.selected) {
                    var j: number = i;
                    if (this._loop) {
                        j = i % this._numItems;
                        if (result.indexOf(j) != -1)
                            continue;
                    }
                    result.push(j);
                }
            }
        }
        else {
            var cnt: number = this._children.length;
            for (i = 0; i < cnt; i++) {
                var obj: Node = this._children[i];
                listItem = obj.getComponent(VListItem);
                if (listItem && listItem.selected)
                    result.push(i);
            }
        }
        return result;
    }


    public set selectedIndex(value: number) {
        if (value >= 0 && value < this.numItems) {
            if (this._selectionMode != ListSelectionMode.Single)
                this.clearSelection();
            this.addSelection(value);
        }
        else
            this.clearSelection();
    }

    public addSelection(index: number, scrollItToView?: boolean): void {
        if (this._selectionMode == ListSelectionMode.None)
            return;

        this.checkVirtualList();

        if (this._selectionMode == ListSelectionMode.Single)
            this.clearSelection();

        if (scrollItToView)
            this.scrollToIndex(index);

        this._lastSelectedIndex = index;
        this.updateSelectionState(index, true);
    }

    public removeSelection(index: number): void {
        if (this._selectionMode == ListSelectionMode.None)
            return;

        this.updateSelectionState(index, false);
    }

    public clearSelection(): void {
        var i: number;
        if (this._virtual) {
            for (i = 0; i < this._realNumItems; i++) {
                this.updateSelectionState(i, false);
            }
        }
        else {
            let listItem: VListItem;
            var cnt: number = this._children.length;
            for (i = 0; i < cnt; i++) {
                var obj = this._children[i];
                listItem = obj.getComponent(VListItem)
                if (listItem)
                    listItem.selected = false;
            }
        }
    }

    public selectAll(): void {
        this.checkVirtualList();

        var i: number;
        if (this._virtual) {
            for (i = 0; i < this._realNumItems; i++) {
                this.updateSelectionState(i, true);
            }
        }
        else {
            let listItem: VListItem;
            var cnt: number = this._children.length;
            for (i = 0; i < cnt; i++) {
                var obj: Node = this._children[i];
                listItem = obj.getComponent(VListItem);
                if (listItem && !listItem.selected) {
                    listItem.selected = true;
                }
            }
        }


    }

    public selectNone(): void {
        this.clearSelection();
    }

    private clearSelectionExcept(item: Node): void {
        var i: number;
        if (this._virtual) {
            for (i = 0; i < this._realNumItems; i++) {
                var ii: ItemInfo = this._virtualItems[i];
                if (ii.obj != item) {
                    this.updateSelectionState(i, false);
                }
            }
        }
        else {
            let listItem: VListItem;
            var cnt: number = this._children.length;
            for (i = 0; i < cnt; i++) {
                var obj: Node = this._children[i];
                listItem = obj.getComponent(VListItem)
                if (listItem && obj != item)
                    listItem.selected = false;
            }
        }
    }

    private updateSelectionState(index: number, selected: boolean): Node | null {
        let obj: Node | null = null;
        if (this._virtual) {
            const ii: ItemInfo = this._virtualItems?.[index];
            if (!ii) {
                return null;
            }
            ii.selected = selected;
            obj = ii.obj || null;
        } else {
            obj = this.getChildAt(index);
        }

        const listItem = obj?.getComponent(VListItem);
        if (listItem && listItem.selected !== selected) {
            listItem.selected = selected;
        }
        return obj;
    }


    // ====================================================================================================
    // Module: Input & Selection Events
    // ====================================================================================================
    public handleArrowKey(dir: number): void {
        var index: number = this.selectedIndex;
        if (index == -1)
            return;

        switch (dir) {
            case 1://up
                if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowVertical) {
                    index--;
                    if (index >= 0) {
                        this.clearSelection();
                        this.addSelection(index, true);
                    }
                }
                else if (this._layout == ListLayoutType.FlowHorizontal || this._layout == ListLayoutType.Pagination) {
                    var current: Node = this._children[index];
                    var k: number = 0;
                    for (var i: number = index - 1; i >= 0; i--) {
                        var obj: Node = this._children[i];
                        if (obj.y != current.y) {
                            current = obj;
                            break;
                        }
                        k++;
                    }
                    for (; i >= 0; i--) {
                        obj = this._children[i];
                        if (obj.y != current.y) {
                            this.clearSelection();
                            this.addSelection(i + k + 1, true);
                            break;
                        }
                    }
                }
                break;

            case 3://right
                if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowHorizontal || this._layout == ListLayoutType.Pagination) {
                    index++;
                    if (index < this._children.length) {
                        this.clearSelection();
                        this.addSelection(index, true);
                    }
                }
                else if (this._layout == ListLayoutType.FlowVertical) {
                    current = this._children[index];
                    k = 0;
                    var cnt: number = this._children.length;
                    for (i = index + 1; i < cnt; i++) {
                        obj = this._children[i];
                        if (obj.x != current.x) {
                            current = obj;
                            break;
                        }
                        k++;
                    }
                    for (; i < cnt; i++) {
                        obj = this._children[i];
                        if (obj.x != current.x) {
                            this.clearSelection();
                            this.addSelection(i - k - 1, true);
                            break;
                        }
                    }
                }
                break;

            case 5://down
                if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowVertical) {
                    index++;
                    if (index < this._children.length) {
                        this.clearSelection();
                        this.addSelection(index, true);
                    }
                }
                else if (this._layout == ListLayoutType.FlowHorizontal || this._layout == ListLayoutType.Pagination) {
                    current = this._children[index];
                    k = 0;
                    cnt = this._children.length;
                    for (i = index + 1; i < cnt; i++) {
                        obj = this._children[i];
                        if (obj.y != current.y) {
                            current = obj;
                            break;
                        }
                        k++;
                    }
                    for (; i < cnt; i++) {
                        obj = this._children[i];
                        if (obj.y != current.y) {
                            this.clearSelection();
                            this.addSelection(i - k - 1, true);
                            break;
                        }
                    }
                }
                break;

            case 7://left
                if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowHorizontal || this._layout == ListLayoutType.Pagination) {
                    index--;
                    if (index >= 0) {
                        this.clearSelection();
                        this.addSelection(index, true);
                    }
                }
                else if (this._layout == ListLayoutType.FlowVertical) {
                    current = this._children[index];
                    k = 0;
                    for (i = index - 1; i >= 0; i--) {
                        obj = this._children[i];
                        if (obj.x != current.x) {
                            current = obj;
                            break;
                        }
                        k++;
                    }
                    for (; i >= 0; i--) {
                        obj = this._children[i];
                        if (obj.x != current.x) {
                            this.clearSelection();
                            this.addSelection(i + k + 1, true);
                            break;
                        }
                    }
                }
                break;
        }
    }

    public getMaxItemWidth(): number {
        var cnt: number = this._children.length;
        var max: number = 0;
        for (var i: number = 0; i < cnt; i++) {
            var child: Node = this.getChildAt(i);
            const childTrans = child.getComponent(UITransform);
            if (childTrans.width > max) {
                max = childTrans.width;
            }
        }
        return max;
    }


    protected handleSizeChanged(): void {
        //TODO
        //super.handleSizeChanged();

        if (this._virtual)
            this.setVirtualListChangedFlag(true);
    }

    protected dispatchItemEvent(index: number, item: Node): void {
        // this.node.emit(ListEventType.CLICK_ITEM, item, evt);
        if (this._itemSelectHandler) this._itemSelectHandler.call(this._selectTarget, index, item);

    }

    private onClickItem(evt: EventTouch): void {
        if (this._isBouncing)
            return;

        var item: Node = evt.currentTarget
        let index: number = item.getComponent(VListItem).listIdx;



        this.setSelectionOnEvent(item, evt);
        if (this.scrollItemToViewOnClick && this._layout != ListLayoutType.Pagination)
            this.scrollToIndex(index, true);

        this.dispatchItemEvent(index, item);
    }

    private setSelectionOnEvent(item: Node, evt: EventTouch): void {
        if (!(item.getComponent(VListItem)) || this._selectionMode == ListSelectionMode.None)
            return;

        let dontChangeLastIndex: boolean = false;
        let index: number = this.childIndexToItemIndex(this.getChildIndex(item));
        let listItem = item.getComponent(VListItem)

        if (this._selectionMode == ListSelectionMode.Single) {
            if (!listItem.selected) {
                this.clearSelectionExcept(item);
                listItem.selected = true;
            }
        }
        else {
            let isShiftDown = false;
            let isCtrlDown = false;
            if (isShiftDown) {
                if (!listItem.selected) {
                    if (this._lastSelectedIndex != -1) {
                        var min: number = Math.min(this._lastSelectedIndex, index);
                        var max: number = Math.max(this._lastSelectedIndex, index);
                        max = Math.min(max, this.numItems - 1);
                        var i: number;
                        if (this._virtual) {
                            for (i = min; i <= max; i++) {
                                this.updateSelectionState(i, true);
                            }
                        }
                        else {
                            for (i = min; i <= max; i++) {
                                var obj: Node = this.getChildAt(i);
                                if (obj.getComponent(VListItem))
                                    obj.getComponent(VListItem).selected = true;
                            }
                        }

                        dontChangeLastIndex = true;
                    }
                    else {
                        listItem.selected = true;
                    }
                }
            }
            else if (isCtrlDown || this._selectionMode == ListSelectionMode.Multiple_SingleClick) {
                listItem.selected = !listItem.selected;
            }
            else {
                if (!listItem.selected) {
                    this.clearSelectionExcept(item);
                    listItem.selected = true;
                }
                else
                    this.clearSelectionExcept(item);
            }
        }

        if (!dontChangeLastIndex)
            this._lastSelectedIndex = index;

    }







    // ====================================================================================================
    // Module: Index Mapping & Virtual Toggle
    // ====================================================================================================
    public childIndexToItemIndex(index: number): number {
        if (!this._virtual)
            return index;

        if (this._layout == ListLayoutType.Pagination) {
            for (var i: number = this._firstIndex; i < this._realNumItems; i++) {
                if (this._virtualItems[i].obj) {
                    index--;
                    if (index < 0)
                        return i;
                }
            }

            return index;
        }
        else {
            index += this._firstIndex;
            if (this._loop && this._numItems > 0)
                index = index % this._numItems;

            return index;
        }
    }

    public itemIndexToChildIndex(index: number): number {
        if (!this._virtual)
            return index;

        if (this._layout == ListLayoutType.Pagination) {
            return this.getChildIndex(this._virtualItems[index].obj);
        }
        else {
            if (this._loop && this._numItems > 0) {
                var j: number = this._firstIndex % this._numItems;
                if (index >= j)
                    index = index - j;
                else
                    index = this._numItems - j + index;
            }
            else
                index -= this._firstIndex;

            return index;
        }
    }

    public setVirtual(bool: boolean): void {
        this._setVirtual(bool);
    }

    public setLoop(loop: boolean): void {
        if (this._loop === loop) {
            return;
        }
        this._loop = loop;
        if (this._inited && this._initItems) {
            this.numItems = this._numItems;
        }
    }

    public get numItems(): number {
        if (this._virtual)
            return this._numItems;
        else
            return this._children.length;
    }

    public set numItems(value: number) {
        if (!this._inited) {
            this._tempInitNumItems = value;
            return;
        }

        if (this._itemRenderer == null)
            throw new Error("Set itemRenderer first!");
        if (this.defaultItem == null)
            throw new Error("Set defaultItem first!");



        if (!this._initItems && this._layout == ListLayoutType.Pagination) {
            //初始化分页
            this.initPageView();
        }

        this._initItems = true;
        this._lastIndexPos = -1;
        this._numItems = value;
        this._realNumItems = this._loop ? value * this._loopNums : value;
        // Data shape changed (add/remove/reset): old per-index size deltas are no longer reliable.
        this._originSize.clear();

        if (this._virtual) {
            //_virtualItems的设计是只增不减的
            let i: number;
            var oldCount: number = this._virtualItems.length;
            if (this._realNumItems > oldCount) {
                for (i = oldCount; i < this._realNumItems; i++) {
                    var ii: ItemInfo = {
                        width: this._itemSize.width,
                        height: this._itemSize.height,
                        updateFlag: 0
                    };

                    this._virtualItems.push(ii);
                }
            }
            else {
                for (i = this._realNumItems; i < oldCount; i++)
                    this._virtualItems[i].selected = false;
            }

            if (this._virtualListChanged != 0)
                this.unschedule(this._refreshVirtualList);

            this.syncVirtualItemSizesFromProvider();

            //立即刷新
            this._refreshVirtualList();


        }
        else {
            this.refreshList();
        }
    }

    private _setVirtual(bool: boolean, init: boolean = false): void {
        if (!init && this._virtual == bool) return;
        this._virtual = bool;
        if (bool) {
            this._virtualItems = this._virtualItems || new Array<ItemInfo>();
            this.initItemSize();
            this.node.on(ScrollView.EventType.SCROLLING, this.__scrolled, this);
            this._virtualListChanged = 2;
        } else {
            this.node.off(ScrollView.EventType.SCROLLING, this.__scrolled, this);
        }

        if (!init && this._inited && this._initItems) {
            this.numItems = this._numItems;
        }
    }

    private refreshList(): void {

        this.initItemSize();
        this.initLineItemCount();

        let cnt: number = this._children.length;
        if (cnt > this._realNumItems) {
            this.removeChildrenToPool(this._realNumItems, cnt);
        }

        if (this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0) {
            this.refreshListInitFillStep(cnt);
            return;
        }

        let curX: number = 0;
        let curY: number = 0;

        let maxSize: number = 0;
        let cw: number = 0, ch: number = 0;

        let pageSize: number = this._curLineItemCount * this._curLineItemCount2;

        let pageWidth: number = this.getPageViewWidth();
        let pageHeight: number = this.getPageViewHeight();
        let page: number, startIndex: number;
        let itemSize: Size = this._itemSize;
        let i: number;



        for (i = 0; i < this._realNumItems; i++) {
            [curX, curY, cw, ch, maxSize, page, startIndex] = this.refreshListProcess(i, cnt, curX, curY, cw, ch, maxSize, pageSize, itemSize, pageWidth, pageHeight, page, startIndex);
        }

        if (this._layout == ListLayoutType.SingleColumn) {

            ch = curY - this._lineGap;
        }
        else if (this._layout == ListLayoutType.SingleRow) {

            cw = curX - this._columnGap;
        }
        else if (this._layout == ListLayoutType.FlowHorizontal) {

            ch = curY - this._lineGap;

        }
        else if (this._layout == ListLayoutType.FlowVertical) {

            cw = curX - this._columnGap;
        }
        else //pagination
        {
            [cw, ch] = this.initPageSize(this._numItems);
        }


        this.setContentSize(cw, ch);
    }

    private refreshListInitFillStep(childCounts: number): void {

        this.initContentSize(null, this._itemSize.width, this._itemSize.height);
        this._initFillState = 1;
        this._curXFrame = 0;
        this._curYFrame = 0;
        this._childCountFrame = childCounts;

        this._maxSizeFrame = 0;
        this._cwFrame = 0;
        this._chFrame = 0;
        this._pageFrame = 0;
        this._startIndexFrame = 0;
        this._curIndexFrame = 0;


        if (this._quitFrameInScrolling) {
            this.node.on(ScrollView.EventType.SCROLLING, this.__scrolled, this);
        } else {
            this.node.off(ScrollView.EventType.SCROLLING, this.__scrolled, this);
        }


        if (this.numChildren > 0) {
            this.dynamicItemsPerFrame = this.numChildren;
        }

        this.refreshListLoop();
        if (!this._startLoop) {
            this._startLoop = true;
            this.schedule(this.refreshListLoop, this.frameInterval);
        }

    }

    private refreshListLoop(): void {
        let curX: number = this._curXFrame;
        let curY: number = this._curYFrame;
        let maxSize: number = this._maxSizeFrame;
        let cw: number = this._cwFrame;
        let ch: number = this._chFrame;
        let page: number = this._pageFrame;
        let startIndex: number = this._startIndexFrame;
        let cnt: number = this._childCountFrame;
        let curIndex: number = this._curIndexFrame;

        let pageSize: number = this._curLineItemCount * this._curLineItemCount2;
        let pageWidth: number = this.getPageViewWidth();
        let pageHeight: number = this.getPageViewHeight();
        let itemSize: Size = this._itemSize;



        let created = 0;
        let maxCreate: number = this.itemsPerFrame;
        if (this.dynamicItemsPerFrame > this.itemsPerFrame) {
            maxCreate = this.dynamicItemsPerFrame;
            this.dynamicItemsPerFrame = 0;
            this.debugLog("----curIndex-changeContentSizeOnScrolling-dynamicItemsPerFrame----", maxCreate);
        }

        while (curIndex < this._realNumItems && created < maxCreate) {
            [curX, curY, cw, ch, maxSize, page, startIndex] = this.refreshListProcess(curIndex, cnt, curX, curY, cw, ch, maxSize, pageSize, itemSize, pageWidth, pageHeight, page, startIndex);
            curIndex++;
            created++;
            this._curIndexFrame = curIndex;
            this._curXFrame = curX;
            this._curYFrame = curY;
            this._maxSizeFrame = maxSize;
            this._cwFrame = cw;
            this._chFrame = ch;
            this._pageFrame = page;
            this._startIndexFrame = startIndex;



        }

        if (curIndex >= this._realNumItems) {
            this._initFillState = 2;
            this._startLoop = false;
            this.unschedule(this.refreshListLoop);


            if (this._layout == ListLayoutType.SingleColumn) {

                ch = curY - this._lineGap;
            }
            else if (this._layout == ListLayoutType.SingleRow) {

                cw = curX - this._columnGap;
            }
            else if (this._layout == ListLayoutType.FlowHorizontal) {

                ch = curY - this._lineGap;

            }
            else if (this._layout == ListLayoutType.FlowVertical) {

                cw = curX - this._columnGap;
                this.debugLog("----content-----", curIndex, curX, maxSize);
            }
            else //pagination
            {
                [cw, ch] = this.initPageSize(this._numItems);
            }


            this.setContentSize(cw, ch);

        }

    }

    private refreshListProcess(i: number, cnt: number, curX: number, curY: number, cw: number, ch: number, maxSize: number,
        pageSize: number, itemSize: Size, pageWidth: number, pageHeight: number, page: number, startIndex: number): number[] {
        let child: Node;
        let index: number;
        let uiTrans: UITransform;
        index = i % this._numItems;
        if (i >= cnt) {
            if (this._itemProvider == null)
                child = this.addItemFromPool();
            else
                child = this.addItemFromPool(this._itemProvider.call(this._providerTarget, index));
        } else {
            child = this.content.children[i];
        }



        let listItem = child.getComponent(VListItem);
        if (listItem) {
            listItem.listIdx = index;
            listItem.realIdx = i;
        }
        this._itemRenderer.call(this._rendererTarget, index, child, i);
        if (!child.active)
            return [curX, curY, cw, ch, maxSize, page, startIndex];
        uiTrans = child.getComponent(UITransform);
        if (this._layout == ListLayoutType.SingleColumn) {
            const posX = curX + uiTrans.anchorX * uiTrans.width;
            const posY = -curY - (1 - uiTrans.anchorY) * uiTrans.height;
            child.setPosition(posX, posY);
            curY += uiTrans.height + this._lineGap;
            cw = Math.max(cw, uiTrans.width);

        }
        else if (this._layout == ListLayoutType.SingleRow) {
            const posX = curX + uiTrans.anchorX * uiTrans.width;
            const posY = curY - (1 - uiTrans.anchorY) * uiTrans.height;

            child.setPosition(posX, posY);
            curX += uiTrans.width + this._columnGap;
            ch = Math.max(ch, uiTrans.height);

        }
        else if (this._layout == ListLayoutType.FlowHorizontal) {
            const posX = curX + uiTrans.anchorX * uiTrans.width;
            const posY = -curY - (1 - uiTrans.anchorY) * uiTrans.height;
            child.setPosition(posX, posY);

            curX += uiTrans.width + this._columnGap;
            maxSize = Math.max(maxSize, uiTrans.height);
            if (index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1) {
                // console.log('----curIndex--curY--', curIndex, ii.obj.position.y);
                cw = Math.max(cw, curX - this._columnGap)
                curX = 0;
                curY += maxSize + this._lineGap;
                maxSize = 0;

            }
        }
        else if (this._layout == ListLayoutType.FlowVertical) {
            const posX = curX + uiTrans.anchorX * uiTrans.width;
            const posY = -curY - (1 - uiTrans.anchorY) * uiTrans.height;
            child.setPosition(posX, posY);

            curY += uiTrans.height + this._lineGap;
            maxSize = Math.max(maxSize, uiTrans.width)
            if (index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1) {
                ch = Math.max(ch, curY - this._lineGap);
                curY = 0;
                curX += maxSize + this._columnGap;
                this.debugLog("----changeline-----", maxSize - 100);
                maxSize = 0;
            }
        }
        else //pagination
        {
            // let page: number, startIndex: number;
            if (i % this._numItems == 0 || i >= startIndex + pageSize - 1) {
                [page, startIndex] = this.getPageByIndex(i);
            }
            let position = this.getPosByIndexInPage(i, page, startIndex, itemSize, pageWidth, pageHeight);

            uiTrans = child.getComponent(UITransform);
            child.setPosition(position[0] + uiTrans.anchorX * uiTrans.width, -position[1] - (1 - uiTrans.anchorY) * uiTrans.height);
        }
        return [curX, curY, cw, ch, maxSize, page, startIndex];
    }



    private initItemSize(): void {
        if (this._itemSize == null) {
            this._itemSize = new Size(0, 0);
            var obj: Node = this.getFromPool(null);
            if (!obj) {
                throw new Error("Virtual List must have a default list item resource.");
            }
            else {
                const itemSize = obj.getComponent(UITransform);
                this._itemSize.width = itemSize.width;
                this._itemSize.height = itemSize.height;
            }
            this.returnToPool(obj);
        }
    }

    private initLineItemCount(): void {
        if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.SingleRow)
            this._curLineItemCount = 1;
        else if (this._layout == ListLayoutType.FlowHorizontal) {
            if (this._columnCount > 0)
                this._curLineItemCount = this._columnCount;
            else {
                this._curLineItemCount = Math.floor((this.viewWidth + this._columnGap) / (this._itemSize.width + this._columnGap));
                if (this._curLineItemCount <= 0)
                    this._curLineItemCount = 1;
            }
        }
        else if (this._layout == ListLayoutType.FlowVertical) {
            if (this._lineCount > 0)
                this._curLineItemCount = this._lineCount;
            else {
                this._curLineItemCount = Math.floor((this.viewHeight + this._lineGap) / (this._itemSize.height + this._lineGap));
                if (this._curLineItemCount <= 0)
                    this._curLineItemCount = 1;
            }
        }
        else //pagination
        {
            let curLineItemCount: number, curLineItemCount2: number;
            if (this._columnCount > 0)
                curLineItemCount = this._columnCount;
            else {
                curLineItemCount = Math.floor((this.viewWidth + this._columnGap) / (this._itemSize.width + this._columnGap));
                if (curLineItemCount <= 0)
                    curLineItemCount = 1;
            }

            if (this._lineCount > 0)
                curLineItemCount2 = this._lineCount;
            else {
                curLineItemCount2 = Math.floor((this.viewHeight + this._lineGap) / (this._itemSize.height + this._lineGap));
                if (curLineItemCount2 <= 0)
                    curLineItemCount2 = 1;
            }

            if (this._pageType == PageType.PageFlowHorizontal) {
                this._curLineItemCount = curLineItemCount;
                this._curLineItemCount2 = curLineItemCount2;
            } else {
                this._curLineItemCount = curLineItemCount2;
                this._curLineItemCount2 = curLineItemCount;
            }
        }
    }


    private initContentSize(items: ItemInfo[], width: number = 0, height: number = 0): void {
        var ch: number = 0, cw: number = 0;
        if (this._realNumItems > 0) {
            var i: number;
            let len: number = Math.ceil(this._numItems / this._curLineItemCount) * this._curLineItemCount;
            let len2: number = Math.min(this._curLineItemCount, this._realNumItems);
            if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
                let maxH: number = 0;
                let curHeight: number;
                for (i = 0; i < this._numItems; i++) {
                    curHeight = items ? items[i].height : height;
                    maxH = Math.max(curHeight, maxH);
                    if (i % this._curLineItemCount == this._curLineItemCount - 1 || i == this._numItems - 1) {
                        ch += maxH + this._lineGap;
                        maxH = 0;
                    }
                }

                this.debugLog("----deltapos-maxH--", maxH)

                if (this._loop) {
                    ch *= this._loopNums;
                }

                if (ch > 0)
                    ch -= this._lineGap;

                for (i = 0; i < len2; i++)
                    cw += (items ? items[i].width : width) + this._columnGap;
                if (cw > 0)
                    cw -= this._columnGap;
            }
            else if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
                let maxW: number = 0;
                let curWidth: number;
                for (i = 0; i < this._numItems; i++) {
                    curWidth = items ? items[i].width : width;
                    maxW = Math.max(curWidth, maxW);
                    if (i % this._curLineItemCount == this._curLineItemCount - 1 || i == this._numItems - 1) {
                        cw += maxW + this._columnGap;
                        maxW = 0;
                    }
                }
                    

                if (this._loop) {
                    cw *= this._loopNums;
                }
                if (cw > 0)
                    cw -= this._columnGap;

                for (i = 0; i < len2; i++)
                    ch += (items ? items[i].height : height) + this._lineGap;
                if (ch > 0)
                    ch -= this._lineGap;
            }
            else {
                len = this._numItems;
                [cw, ch] = this.initPageSize(len);

            }
        }
        this.debugLog("----deltapos-cw--", cw, ch)
        this.setContentSize(cw, ch);
    }

    private __scrolled(): void {
        if (this._virtual) {
            if (this._initFillState == 1 && this.frameInterval > 0 && this.itemsPerFrame > 0) {
                this.dynamicItemsPerFrame = Math.max(this.dynamicItemsPerFrame, this._realNumItems);
                if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
                    this.handleScroll1Loop();
                } else if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
                    this.handleScroll2Loop();
                } else {
                    this.handleScroll3Loop(false);
                }
            }
            this.handleScroll(false);
        } else {
            if (this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0) {
                this.dynamicItemsPerFrame = this._realNumItems - this._curIndexFrame;
                this.refreshListLoop();
            }
        }

    }

    // ====================================================================================================
    // Module: Virtual List Core
    // ====================================================================================================
    public refreshVirtualList(): void {
        this.setVirtualListChangedFlag(false);
    }

    private syncVirtualItemSizesFromProvider(): void {
        if (!this._virtual || !this._virtualItems || !this._itemSizeProvider || this._numItems <= 0) {
            return;
        }

        for (let i = 0; i < this._realNumItems; i++) {
            const index = i % this._numItems;
            const size = this._itemSizeProvider.call(this._sizeProviderTarget, index);
            if (!size) continue;
            if (size.width > 0) {
                this._virtualItems[i].width = Math.ceil(size.width);
            }
            if (size.height > 0) {
                this._virtualItems[i].height = Math.ceil(size.height);
            }
        }
    }

    private checkVirtualList(): void {
        if (this._virtualListChanged != 0) {
            this._refreshVirtualList();
            this.unschedule(this._refreshVirtualList);
        }
    }

    private setVirtualListChangedFlag(layoutChanged: boolean): void {
        if (layoutChanged)
            this._virtualListChanged = 2;
        else if (this._virtualListChanged == 0)
            this._virtualListChanged = 1;

        this.callLater(this._refreshVirtualList);
    }

    private _refreshVirtualList(dt?: number): void {
        if (!isNaN(dt)) {
            this._refreshVirtualList();
            return;
        }

        var layoutChanged: boolean = this._virtualListChanged == 2;
        this._virtualListChanged = 0;
        this._eventLocked = true;

        if (layoutChanged) {
            this.initLineItemCount()
        }

        this.initContentSize(this._virtualItems);
        this._eventLocked = false;

        this.handleScroll(true);
    }

    private getIndexOnPos1(forceUpdate: boolean): number {
        if (this._realNumItems < this._curLineItemCount) {
            this._scanPos = 0;
            return 0;
        }

        let i: number;
        let pos2: number = 0;
        let pos3: number;
        let maxH: number = 0;
        let index: number;

        let changeLine: boolean;
        let obj = this._virtualItems[this._firstIndex].obj;
        if (obj) {
            pos2 = obj.y + (1 - obj.getComponent(UITransform).anchorY) * Math.ceil(obj.getComponent(UITransform).height);
            pos2 = -pos2;
        }

        if (pos2 > this._scanPos) {
            let checkMax: boolean = true;
            for (i = this._firstIndex - 1; i >= 0; i--) {
                index = i % this._numItems;
                if (checkMax) maxH = Math.max(maxH, this._virtualItems[i].height);

                if (this._originSize.get(i)) {
                    this.debugLog("----curIndex-changeContentSizeOnScrolling------getIndexOnPos1-", i, maxH, this._originSize.get(i)[0], this._originSize.get(i)[1])
                    maxH = Math.max(maxH, this._originSize.get(i)[0]);
                    checkMax = false;
                }

                changeLine = index % this._curLineItemCount == 0; //|| index == this._numItems - 1
                if (changeLine) {
                    checkMax = true;
                    pos2 -= (maxH + this._lineGap);
                    maxH = 0;
                    if (pos2 <= this._scanPos) {
                        this._scanPos = pos2;
                        return i;
                    }

                }
            }
            this._scanPos = pos2;
            return this._firstIndex;
        }
        else {
            let curLineFirst: number = -1;
            for (i = this._firstIndex; i < this._realNumItems; i++) {
                if (curLineFirst == -1) {
                    curLineFirst = i;
                }
                index = i % this._numItems;

                if (this._originSize.get(i)) {
                    this.debugLog("----curIndex-changeContentSizeOnScrolling------getIndexOnPos1-11", i, maxH, this._originSize.get(i)[0], this._originSize.get(i)[1])
                    maxH = this._originSize.get(i)[0];

                }

                maxH = Math.max(maxH, this._virtualItems[i].height);
                changeLine = index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1;
                if (changeLine) {
                    pos3 = pos2 + maxH + this._lineGap;
                    if (pos3 > this._scanPos) {
                        this._scanPos = pos2;
                        return curLineFirst;
                    }
                    maxH = 0;
                    pos2 = pos3;
                    curLineFirst = -1;
                }
            }

            this._scanPos = pos2;
            return this._firstIndex;
        }
    }

    private getIndexOnPos2(forceUpdate: boolean): number {
        if (this._realNumItems < this._curLineItemCount) {
            this._scanPos = 0;
            return 0;
        }

        var i: number;
        var pos2: number = 0;
        var pos3: number;
        let maxW: number = 0;
        let index: number;
        let changeLine: boolean;
        let obj = this._virtualItems[this._firstIndex].obj;//this.getChildAt(0);
        if (obj) {
            pos2 = obj.x - obj.getComponent(UITransform).anchorX * Math.ceil(obj.getComponent(UITransform).width);
        }

        if (pos2 > this._scanPos) {
            let checkMax: boolean = true;
            for (i = this._firstIndex - 1; i >= 0; i--) {
                index = i % this._numItems;

                if (checkMax) maxW = Math.max(maxW, this._virtualItems[i].width);

                if (this._originSize.get(i)) {
                    this.debugLog("----curIndex-changeContentSizeOnScrolling------getIndexOnPos1-", i, maxW, this._originSize.get(i)[0], this._originSize.get(i)[1])
                    maxW = Math.max(maxW, this._originSize.get(i)[0]);
                    checkMax = false;
                }

                changeLine = index % this._curLineItemCount == 0; //|| index == this._numItems - 1;
                if (changeLine) {
                    checkMax = true;
                    pos2 -= (maxW + this._columnGap);
                    maxW = 0;
                    if (pos2 <= this._scanPos) {
                        this._scanPos = pos2;
                        return i;
                    }

                }
            }
            this._scanPos = pos2;
            return this._firstIndex;
        }
        else {
            let curLineFirst: number = -1;
            for (i = this._firstIndex; i < this._realNumItems; i++) {
                if (curLineFirst == -1) {
                    curLineFirst = i;
                }
                index = i % this._numItems;


                if (this._originSize.get(i)) {
                    this.debugLog("----curIndex-changeContentSizeOnScrolling------getIndexOnPos1-11", i, maxW, this._originSize.get(i)[0], this._originSize.get(i)[1])
                    maxW = this._originSize.get(i)[0];

                }

                maxW = Math.max(maxW, this._virtualItems[i].width);
                changeLine = index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1;
                if (changeLine) {
                    pos3 = pos2 + maxW + this._columnGap;
                    if (pos3 > this._scanPos) {
                        this._scanPos = pos2;
                        return curLineFirst;
                    }
                    maxW = 0;
                    pos2 = pos3;
                    curLineFirst = -1;
                }

            }

            this._scanPos = pos2;
            return this._firstIndex;
        }
    }

    private getIndexOnPos3(forceUpdate: boolean): number {
        if (this._realNumItems < this._curLineItemCount) {
            this._scanPos = 0;
            return 0;
        }

        const flowHorizontal: boolean = this._pageType == PageType.PageFlowHorizontal;
        const scrollHorizontal: boolean = this.horizontal == true;
        let [page, startIndex] = this.getPageByPos(this._scanPos);
        let pos2: number;
        let i: number;
        let pos3: number;
        let step: number;
        let end: number;
        let index: number;
        let pageSize: number = this._curLineItemCount * this._curLineItemCount2;


        let endIndex = startIndex + pageSize;
        if (this._loop) {
            let toOne = this._numItems - ((startIndex + 1) % this._numItems)
            endIndex = startIndex + Math.min(pageSize, toOne)
        }

        if (scrollHorizontal) {
            let viewWidth: number = this.getPageViewWidth();
            pos2 = page * viewWidth;
            step = flowHorizontal ? 1 : this._curLineItemCount;
            end = flowHorizontal ? this._curLineItemCount : this._curLineItemCount2;

        } else {

            let viewHeight: number = this.getPageViewHeight();
            pos2 = page * viewHeight;
            step = flowHorizontal ? this._curLineItemCount : 1;
            end = flowHorizontal ? this._curLineItemCount2 : this._curLineItemCount;
        }

        for (i = 0; i < end; i++) {
            index = startIndex + i * step;
            if (index > endIndex) {
                index = startIndex + (i - 1) * step;
                pos2 -= this.getItemSize();
                break;
            }
            pos3 = pos2 + this.getItemSize();
            if (pos3 > this._scanPos) {
                this._scanPos = pos2;
                return index;
            }
            pos2 = pos3;
        }
        this._scanPos = pos2;
        return index;
    }



    private handleScroll(forceUpdate: boolean): void {
        if (this._eventLocked)
            return;
        let oldFirstIndex = this._firstIndex;
        if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
            const skipFrameStep = this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && this.shouldInterruptFrameFill('vertical');
            if (this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && !skipFrameStep) {
                this.handleScroll1InitFillStep(forceUpdate);
                return;
            }
            var enterCounter: number = 0;
            while (this.handleScroll1(forceUpdate)) {
                enterCounter++;
                forceUpdate = false;
                if (enterCounter > 20) {
                    this.debugLog("list will never be filled as the item renderer function always returns a different size.");
                    break;
                }
            }
            this.handleArchOrder1(oldFirstIndex != this._firstIndex);
        }
        else if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
            const skipFrameStep = this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && this.shouldInterruptFrameFill('horizontal');
            if (this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && !skipFrameStep) {
                this.handleScroll2InitFillStep(forceUpdate);
                return;
            }
            enterCounter = 0;
            while (this.handleScroll2(forceUpdate)) {
                enterCounter++;
                forceUpdate = false;
                if (enterCounter > 20) {
                    this.debugLog("list will never be filled as the item renderer function always returns a different size.");
                    break;
                }
            }
            this.handleArchOrder2(oldFirstIndex != this._firstIndex);
        }
        else {
            const skipFrameStep = this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && this.shouldInterruptFrameFill('page');
            if (this._initFillState < 2 && this.frameInterval > 0 && this.itemsPerFrame > 0 && !skipFrameStep) {
                this.handleScroll3InitFillStep(forceUpdate);
                return
            }

            this.handleScroll3(forceUpdate);
        }

    }

    private getMaxCreatePerFrame(): number {
        let maxCreate = this.itemsPerFrame;
        if (this.dynamicItemsPerFrame > this.itemsPerFrame) {
            maxCreate = this.dynamicItemsPerFrame;
            this.dynamicItemsPerFrame = 0;
            this.debugLog("----curIndex-changeContentSizeOnScrolling-dynamicItemsPerFrame----", maxCreate);
        }
        return maxCreate;
    }

    // When user drags fast during frame-by-frame creation, interrupt incremental mode
    // and force immediate viewport refill to avoid temporary "holes".
    private shouldInterruptFrameFill(mode: LinearAxis | 'page'): boolean {
        if (this._quitFrameInScrolling) {
            return true;
        }
        if (this._lastIndexPos < 0) {
            return false;
        }

        let pos = 0;
        let viewMain = 0;
        if (mode == 'vertical' || mode == 'horizontal') {
            pos = this.getScrollMain(mode);
            viewMain = mode == 'vertical' ? this.viewHeight : this.viewWidth;
        } else {
            const offset = this.getScrollOffset();
            const scrollHorizontal = this.horizontal == true;
            pos = scrollHorizontal ? -offset.x : offset.y;
            viewMain = scrollHorizontal ? this.getPageViewWidth() : this.getPageViewHeight();
        }

        pos = Math.max(0, Math.round(pos + EPSILON));
        const delta = Math.abs(this._lastIndexPos - pos);
        const itemMain = Math.max(this.getItemSize(), 1);
        const threshold = Math.max(itemMain, viewMain * 0.25);
        return delta >= threshold;
    }

    private cleanupUnusedVirtualChildren(startIndex: number, childCount: number): void {
        if (this._loop) {
            for (let i = this.numChildren - 1; i >= 0; i--) {
                const child = this.getChildAt(i);
                const listItem = child.getComponent(VListItem);
                const realIdx = listItem ? listItem.realIdx : -1;
                if (realIdx < 0 || realIdx >= this._realNumItems) {
                    this.removeChildToPool(child);
                    continue;
                }
                const ii = this._virtualItems[realIdx];
                if (!ii || ii.obj != child || ii.updateFlag == this.itemInfoVer) {
                    continue;
                }
                ii.selected = listItem.selected;
                this.removeChildToPool(child);
                ii.obj = null;
            }
            return;
        }

        for (let i = 0; i < childCount; i++) {
            const itemIndex = startIndex + i;
            if (itemIndex < 0 || itemIndex >= this._virtualItems.length) {
                continue;
            }
            const ii = this._virtualItems[itemIndex];
            if (!ii) {
                continue;
            }
            if (ii.updateFlag != this.itemInfoVer && ii.obj) {
                const listItem = ii.obj.getComponent(VListItem);
                if (listItem) {
                    ii.selected = listItem.selected;
                }
                this.removeChildToPool(ii.obj);
                ii.obj = null;
            }
        }
    }

    private applyLinearContentSizeDelta(mainDelta: number, firstItemMainDelta: number, axis: LinearAxis): void {
        if (mainDelta == 0 && firstItemMainDelta == 0) {
            return;
        }
        if (axis == 'vertical') {
            this.modifyContentSizeOnScrolling(0, mainDelta, 0, firstItemMainDelta);
        } else {
            this.modifyContentSizeOnScrolling(mainDelta, 0, firstItemMainDelta, 0);
        }
    }

    private ensureVirtualItemInfo(index: number): ItemInfo | null {
        if (index < 0 || index >= this._realNumItems || !this._virtualItems) {
            return null;
        }
        let ii = this._virtualItems[index];
        if (ii) {
            return ii;
        }
        let width = 0;
        let height = 0;
        if (this._itemSize) {
            width = Math.ceil(this._itemSize.width);
            height = Math.ceil(this._itemSize.height);
        } else if (this._defaultItem) {
            const ui = this._defaultItem.getComponent(UITransform);
            if (ui) {
                width = Math.ceil(ui.width);
                height = Math.ceil(ui.height);
            }
        }
        ii = {
            width,
            height,
            updateFlag: 0,
            selected: false
        };
        this._virtualItems[index] = ii;
        return ii;
    }

    private handleLinearScrollProcess(axis: LinearAxis, fromFrame: boolean, forceUpdate: boolean, curIndex: number, curX: number, curY: number, startCross: number, max: number,
        maxMainSize: number, preMaxMainSize: number, afterMaxMainSize: number, deltaSize: number, firstItemDeltaSize: number,
        forward: boolean, oldFirstIndex: number, newFirstIndex: number, reuseIndex: number, lastIndex: number, firstRowOrLine: boolean): any[] {

        let needRender: boolean;
        let url: string | number = this._defaultItem.name;
        let ii: ItemInfo, ii2: ItemInfo;
        let j: number;
        let listItem: VListItem;
        const useRuntimeSizeDelta = !this._itemSizeProvider;

        const index = curIndex % this._numItems;
        const changeLine = index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1;
        ii = this.ensureVirtualItemInfo(curIndex);
        if (!ii) {
            curIndex++;
            return [curIndex, curX, curY, max, reuseIndex, maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize, firstRowOrLine];
        }

        if (!ii.obj || forceUpdate) {
            if (this._itemProvider != null) {
                url = this._itemProvider.call(this._providerTarget, index);
                if (url == null) {
                    url = this._defaultItem.name;
                }
            }

            if (ii.obj && ii.obj.name != url) {
                listItem = ii.obj.getComponent(VListItem);
                if (listItem) {
                    ii.selected = listItem.selected;
                }
                this.removeChildToPool(ii.obj);
                ii.obj = null;
            }
        }

        if (!ii.obj) {
            if (forward) {
                for (j = reuseIndex; j >= oldFirstIndex; j--) {
                    ii2 = this.ensureVirtualItemInfo(j);
                    if (!ii2) {
                        continue;
                    }
                    if (ii2.obj && ii2.updateFlag != this.itemInfoVer && ii2.obj.name == url) {
                        listItem = ii2.obj.getComponent(VListItem);
                        if (listItem) {
                            ii2.selected = listItem.selected;
                        }
                        ii.obj = ii2.obj;
                        ii.obj.getComponent(UITransform).setContentSize(ii.width, ii.height);
                        ii2.obj = null;
                        if (j == reuseIndex) {
                            reuseIndex--;
                        }
                        break;
                    }
                }
            } else {
                for (j = reuseIndex; j <= lastIndex; j++) {
                    ii2 = this.ensureVirtualItemInfo(j);
                    if (!ii2) {
                        continue;
                    }
                    if (ii2.obj && ii2.updateFlag != this.itemInfoVer && ii2.obj.name == url) {
                        listItem = ii2.obj.getComponent(VListItem);
                        if (listItem) {
                            ii2.selected = listItem.selected;
                        }
                        ii.obj = ii2.obj;
                        ii.obj.getComponent(UITransform).setContentSize(ii.width, ii.height);
                        ii2.obj = null;
                        if (j == reuseIndex) {
                            reuseIndex++;
                        }
                        break;
                    }
                }
            }

            if (ii.obj) {
                const backwardIndex = axis == 'vertical' ? this.numChildren - 1 : this.numChildren;
                this.setChildIndex(ii.obj, forward ? curIndex - newFirstIndex : backwardIndex);
            } else {
                ii.obj = this.getObject(url);
                if (forward) {
                    this.addChildAt(ii.obj, curIndex - newFirstIndex);
                } else {
                    this.addChild(ii.obj);
                }
            }

            listItem = ii.obj.getComponent(VListItem);
            if (listItem) {
                listItem.selected = ii.selected;
            }
            needRender = true;
        } else {
            needRender = forceUpdate;
        }

        const uiTrans = ii.obj.getComponent(UITransform);
        if (needRender) {
            listItem = ii.obj.getComponent(VListItem);
            if (listItem) {
                listItem.listIdx = index;
                listItem.realIdx = curIndex;
            }

            this._itemRenderer.call(this._rendererTarget, index, ii.obj, curIndex);

            if (useRuntimeSizeDelta && this._originSize.get(curIndex)) {
                [preMaxMainSize, afterMaxMainSize] = this._originSize.get(curIndex);
                this._originSize.delete(curIndex);
            }

            if (useRuntimeSizeDelta) {
                const oldMainSize = axis == 'vertical' ? ii.height : ii.width;
                const newMainSize = axis == 'vertical' ? Math.ceil(uiTrans.height) : Math.ceil(uiTrans.width);
                preMaxMainSize = Math.max(preMaxMainSize, oldMainSize);
                afterMaxMainSize = Math.max(afterMaxMainSize, newMainSize);
                if (changeLine) {
                    const deltaMain = afterMaxMainSize - preMaxMainSize;
                    preMaxMainSize = 0;
                    afterMaxMainSize = 0;
                    if (deltaMain != 0) {
                        deltaSize += this._loop ? deltaMain * this._loopNums : deltaMain;
                        if ((curIndex - (this._curLineItemCount - 1) == newFirstIndex || index == this._numItems - 1) && forward) {
                            firstItemDeltaSize = deltaMain;
                        }
                    }
                }

                ii.width = Math.ceil(uiTrans.width);
                ii.height = Math.ceil(uiTrans.height);
                if (this._loop) {
                    for (let i: number = index; i < this._realNumItems; i += this._numItems) {
                        this._virtualItems[i].width = ii.width;
                        this._virtualItems[i].height = ii.height;
                    }
                }
            } else {
                uiTrans.setContentSize(ii.width, ii.height);
            }
        }

        ii.updateFlag = this.itemInfoVer;

        const posX = curX + uiTrans.anchorX * ii.width;
        const posY = -curY - (1 - uiTrans.anchorY) * ii.height;
        ii.obj.setPosition(posX, posY);

        if (axis == 'vertical') {
            curX += ii.width + this._columnGap;
            maxMainSize = Math.max(maxMainSize, ii.height);
            if (changeLine) {
                curX = startCross;
                curY += maxMainSize + this._lineGap;
                if (firstRowOrLine) {
                    max += maxMainSize;
                    firstRowOrLine = false;
                }
                maxMainSize = 0;
            }
        } else {
            curY += ii.height + this._lineGap;
            maxMainSize = Math.max(maxMainSize, ii.width);
            if (changeLine) {
                curY = startCross;
                curX += maxMainSize + this._columnGap;
                if (firstRowOrLine) {
                    max += maxMainSize;
                    firstRowOrLine = false;
                }
                maxMainSize = 0;
            }
        }

        curIndex++;
        return [curIndex, curX, curY, max, reuseIndex, maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize, firstRowOrLine];
    }

    private settleTrackingAfterFrameFill(): void {
        if (this._trackingIndex == -1 || this._numItems <= 0) {
            return;
        }
        if (this._trackingIndex != this._numItems - 1) {
            return;
        }
        const maxOffset = this.getMaxScrollOffset();
        const curPos = this.getContentPosition();
        this.setContentPosition(new Vec3(-maxOffset.x, maxOffset.y, curPos.z));
        this._outOfBoundaryAmountDirty = true;
        if (this._virtual) {
            this.handleScroll(false);
        }
        this._trackingIndex = -1;
    }

    private getScrollMain(axis: LinearAxis): number {
        const offset = this.getScrollOffset();
        return axis == 'vertical' ? offset.y : -offset.x;
    }

    private getMaxScrollMain(axis: LinearAxis): number {
        const max = this.getMaxScrollOffset();
        return axis == 'vertical' ? max.y : max.x;
    }

    private isAtTailByOffset(axis: LinearAxis, scrollMain?: number, maxMain?: number): boolean {
        const tailTolerance = Math.max(EPSILON, 1);
        const curMain = scrollMain == null ? this.getScrollMain(axis) : scrollMain;
        const tailMain = maxMain == null ? this.getMaxScrollMain(axis) : maxMain;
        return curMain >= tailMain - tailTolerance;
    }

    private getLinearCrossStart(axis: LinearAxis): number {
        const contentTrans = this.getContentUITransform();
        if (axis == 'vertical') {
            return -contentTrans.anchorX * this.contentWidth;
        }
        return (1 - contentTrans.anchorY) * this.contentHeight;
    }

    private flushFramePendingDelta(axis: LinearAxis): void {
        if (this._deltaSizeFrame != 0 || this._firstItemDeltaSizeFrame != 0) {
            this.debugLog('--curIndex-changeContentSizeOnScrolling-', this._newFirstIndexFrame, this._curIndexFrame, this._deltaSizeFrame, this._firstItemDeltaSizeFrame);
            this.applyLinearContentSizeDelta(this._deltaSizeFrame, this._firstItemDeltaSizeFrame, axis);
            this._deltaSizeFrame = 0;
            this._firstItemDeltaSizeFrame = 0;
        }
    }

    private recordFrameOriginSizeIfNeeded(): void {
        if (!this._itemSizeProvider
            && this._preMaxSizeFrame
            && this._afterMaxSizeFrame
            && this._preMaxSizeFrame != this._afterMaxSizeFrame
            && !this._originSize.get(this._curIndexFrame)) {
            this.debugLog('---curIndex-changeContentSizeOnScrolling------set_originSize---', this._curIndexFrame, this._preMaxSizeFrame, this._afterMaxSizeFrame);
            this._originSize.set(this._curIndexFrame, [this._preMaxSizeFrame, this._afterMaxSizeFrame]);
            this._preMaxSizeFrame = 0;
            this._afterMaxSizeFrame = 0;
        }
    }

    private endInitFillStep(loopHandler: () => void): void {
        this._initFillState = 2;
        this._startLoop = false;
        this.unschedule(loopHandler);
        this.settleTrackingAfterFrameFill();
        this.handleScroll(true);
    }

    private startFrameLoop(loopHandler: () => void): void {
        loopHandler.call(this);
        if (!this._startLoop) {
            this._startLoop = true;
            this.schedule(loopHandler, this.frameInterval);
        }
    }

    private finishLinearFrameLoop(axis: LinearAxis, loopHandler: () => void, newFirstIndex: number, curIndex: number,
        deltaSize: number, firstItemDeltaSize: number, onStable?: () => void): void {
        this._initFillState = 2;
        this._startLoop = false;
        this.unschedule(loopHandler);
        this.settleTrackingAfterFrameFill();
        if (deltaSize == 0 && firstItemDeltaSize == 0) {
            return;
        }

        this.debugLog('--handleScrollLoop-curIndex-changeContentSizeOnScrolling---setContentSize', newFirstIndex, curIndex, deltaSize, firstItemDeltaSize);
        const preOffset = this.getScrollOffset();
        const preMain = axis == 'vertical' ? preOffset.y : preOffset.x;
        this.applyLinearContentSizeDelta(deltaSize, firstItemDeltaSize, axis);
        const postOffset = this.getScrollOffset();
        const postMain = axis == 'vertical' ? postOffset.y : postOffset.x;
        if (preMain != postMain) {
            this.handleScroll(false);
            return;
        }
        if (onStable) {
            onStable.call(this);
        }
    }

    private resolveLinearFirstIndex(axis: LinearAxis, forceUpdate: boolean, pos: number, tailByOffset: boolean): number {
        this._scanPos = pos;
        let newFirstIndex = axis == 'vertical' ? this.getIndexOnPos1(forceUpdate) : this.getIndexOnPos2(forceUpdate);
        newFirstIndex = this.alignIndexToLineStart(newFirstIndex);
        if (axis == 'vertical' && !this._loop) {
            newFirstIndex = this.adjustVerticalFirstIndexForTailFill(newFirstIndex);
        }
        if (tailByOffset) {
            newFirstIndex = axis == 'vertical' ? this.getVerticalTailFirstIndex() : this.getHorizontalTailFirstIndex();
        }
        newFirstIndex = this.alignIndexToLineStart(newFirstIndex);
        const firstPos = this.getPosByIndex(newFirstIndex);
        this._scanPos = axis == 'vertical' ? firstPos.y : firstPos.x;
        return newFirstIndex;
    }

    private alignIndexToLineStart(index: number): number {
        if (this._curLineItemCount <= 1 || index <= 0) {
            return Math.max(0, index);
        }
        if (this._loop && this._numItems > 0) {
            const displayIndex = index % this._numItems;
            return Math.max(0, index - (displayIndex % this._curLineItemCount));
        }
        return Math.max(0, index - (index % this._curLineItemCount));
    }

    private resolveLinearRenderWindow(axis: LinearAxis, pos: number, tailByOffset: boolean): { max: number, end: boolean } {
        const viewMain = axis == 'vertical' ? this.viewHeight : this.viewWidth;
        const contentMain = axis == 'vertical' ? this.contentHeight : this.contentWidth;
        const overscan = this._loop ? Math.max(this.getItemSize() * 1.5, 1) : 0;
        let max = Math.max(pos + viewMain + overscan, viewMain);
        const end = tailByOffset || max >= contentMain - EPSILON;
        if (end) {
            max = contentMain;
        }
        return { max, end };
    }

    private isLinearTailUnderfilled(axis: LinearAxis, curIndex: number): boolean {
        if (curIndex <= 0 || this.numChildren <= 0) {
            return false;
        }
        if (axis == 'vertical') {
            return this._content.position.y >= 0 && -this.getChildAt(0).y > this._content.position.y;
        }
        return this._content.position.x <= 0 && this.getChildAt(0).x > -this._content.position.x;
    }

    // More robust gap detection: checks whether rendered children really cover
    // the visible tail edge of viewport on current axis.
    private hasLinearViewportGap(axis: LinearAxis): boolean {
        if (this.numChildren <= 0) {
            return false;
        }

        if (axis == 'vertical') {
            const viewBottom = this._content.position.y + this.viewHeight;
            let maxBottom = -Infinity;
            for (let i = 0; i < this.numChildren; i++) {
                const child = this.getChildAt(i);
                const trans = child.getComponent(UITransform);
                if (!trans) continue;
                const bottom = -child.y - trans.anchorY * trans.height;
                if (bottom > maxBottom) {
                    maxBottom = bottom;
                }
            }
            if (!isFinite(maxBottom)) {
                return false;
            }
            return viewBottom > maxBottom + EPSILON;
        }

        const viewRight = -this._content.position.x + this.viewWidth;
        let maxRight = -Infinity;
        for (let i = 0; i < this.numChildren; i++) {
            const child = this.getChildAt(i);
            const trans = child.getComponent(UITransform);
            if (!trans) continue;
            const right = child.x + (1 - trans.anchorX) * trans.width;
            if (right > maxRight) {
                maxRight = right;
            }
        }
        if (!isFinite(maxRight)) {
            return false;
        }
        return viewRight > maxRight + EPSILON;
    }

    private syncDynamicItemsPerFrameFromChildren(): void {
        if (this.numChildren > 0) {
            this.dynamicItemsPerFrame = this.numChildren;
        }
    }

    private initLinearFrameState(axis: LinearAxis, newFirstIndex: number, pos: number): void {
        this._oldFirstIndexFrame = this._firstIndex;
        this._firstIndex = newFirstIndex;
        this._curIndexFrame = newFirstIndex;

        this._childCountFrame = this.numChildren;
        this._lastIndexFrame = this._oldFirstIndexFrame + this._childCountFrame - 1;
        this._reuseIndexFrame = this._forwardFrame ? this._lastIndexFrame : this._oldFirstIndexFrame;

        const startCross = this.getLinearCrossStart(axis);
        if (axis == 'vertical') {
            this._curXFrame = startCross;
            this._curYFrame = pos;
        } else {
            this._curXFrame = pos;
            this._curYFrame = startCross;
        }

        this._deltaSizeFrame = 0;
        this._firstItemDeltaSizeFrame = 0;
        this._maxSizeFrame = 0;
        this._preMaxSizeFrame = 0;
        this._afterMaxSizeFrame = 0;
        this._firstRowOrLineFrame = true;
        this.itemInfoVer++;
    }

    private persistLinearFrameState(curIndex: number, curX: number, curY: number, max: number, reuseIndex: number, maxMain: number,
        preMaxMain: number, afterMaxMain: number, deltaSize: number, firstItemDeltaSize: number, firstRowOrLine: boolean): void {
        this._curIndexFrame = curIndex;
        this._curXFrame = curX;
        this._curYFrame = curY;
        this._maxFrame = max;
        this._reuseIndexFrame = reuseIndex;
        this._maxSizeFrame = maxMain;
        this._preMaxSizeFrame = preMaxMain;
        this._afterMaxSizeFrame = afterMaxMain;
        this._deltaSizeFrame = deltaSize;
        this._firstItemDeltaSizeFrame = firstItemDeltaSize;
        this._firstRowOrLineFrame = firstRowOrLine;
    }

    private runLinearScroll(axis: LinearAxis, forceUpdate: boolean, processFn: LinearProcessFn): boolean {
        const scrollPos = this.getScrollMain(axis);
        const maxMain = this.getMaxScrollMain(axis);
        const tailByOffset = !this._loop && this.isAtTailByOffset(axis, scrollPos, maxMain);
        let pos = scrollPos;
        const prevPos = this._lastIndexPos;
        const movingTowardHead = prevPos > pos;
        const tailWindowLikelyTooSmall = !this._loop && this._firstIndex > 0 && (this._firstIndex + this.numChildren >= this._realNumItems);
        const effectiveForceUpdate = forceUpdate || (!tailByOffset && movingTowardHead && tailWindowLikelyTooSmall);

        let newFirstIndex = this.resolveLinearFirstIndex(axis, effectiveForceUpdate, pos, tailByOffset);
        if (this._loop && !effectiveForceUpdate && movingTowardHead && prevPos >= 0 && this._curLineItemCount > 0 && !this._autoScrolling) {
            const step = this._curLineItemCount;
            const jumpedOneLine = Math.abs(newFirstIndex - this._firstIndex) == step;
            const smallMove = Math.abs(pos - prevPos) < Math.max(this.getItemSize() * 0.5, 1);
            if (jumpedOneLine && smallMove) {
                newFirstIndex = this._firstIndex;
                const firstPos = this.getPosByIndex(newFirstIndex);
                this._scanPos = axis == 'vertical' ? firstPos.y : firstPos.x;
            }
        }
        pos = this._scanPos;
        if (newFirstIndex == this._firstIndex && !effectiveForceUpdate && this.numChildren > 0 && !this.hasLinearViewportGap(axis)) {
            return false;
        }

        const windowState = this.resolveLinearRenderWindow(axis, pos, tailByOffset);
        let max = windowState.max;
        const end = windowState.end;
        const forward = this._lastIndexPos > pos;
        this._lastIndexPos = pos;
        const oldFirstIndex = this._firstIndex;
        this._firstIndex = newFirstIndex;

        let curIndex = newFirstIndex;
        const childCount = this.numChildren;
        const lastIndex = oldFirstIndex + childCount - 1;
        let reuseIndex = forward ? lastIndex : oldFirstIndex;

        const startCross = this.getLinearCrossStart(axis);
        let curX = axis == 'vertical' ? startCross : pos;
        let curY = axis == 'vertical' ? pos : startCross;
        let deltaSize = 0;
        let firstItemDeltaSize = 0;
        let maxMainSize = 0;
        let preMaxMainSize = 0;
        let afterMaxMainSize = 0;
        let firstRowOrLine = true;
        this.itemInfoVer++;

        while (curIndex < this._realNumItems && (end || (axis == 'vertical' ? curY < max : curX < max))) {
            [curIndex, curX, curY, max, reuseIndex, maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize, firstRowOrLine] =
                processFn(
                    false, effectiveForceUpdate, curIndex, curX, curY, startCross, max,
                    maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize,
                    forward, oldFirstIndex, newFirstIndex, reuseIndex, lastIndex, firstRowOrLine
                );
        }

        // Safety net for variable-size/loop scenarios:
        // if viewport tail still has a gap, continue appending items even when the
        // initial render window calculation says we can stop.
        if (curIndex < this._realNumItems && this.hasLinearViewportGap(axis)) {
            let safety = 0;
            const maxExtra = Math.max(8, this._curLineItemCount * 6);
            while (curIndex < this._realNumItems && this.hasLinearViewportGap(axis) && safety < maxExtra) {
                [curIndex, curX, curY, max, reuseIndex, maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize, firstRowOrLine] =
                    processFn(
                        false, true, curIndex, curX, curY, startCross, max,
                        maxMainSize, preMaxMainSize, afterMaxMainSize, deltaSize, firstItemDeltaSize,
                        forward, oldFirstIndex, newFirstIndex, reuseIndex, lastIndex, firstRowOrLine
                    );
                safety++;
            }
        }

        this.cleanupUnusedVirtualChildren(oldFirstIndex, childCount);
        this.applyLinearContentSizeDelta(deltaSize, firstItemDeltaSize, axis);
        return this.isLinearTailUnderfilled(axis, curIndex) || this.hasLinearViewportGap(axis);
    }

    private initLinearFrameFill(axis: LinearAxis, forceUpdate: boolean, processFn: LinearProcessFn, loopHandler: () => void): void {
        if (this.shouldInterruptFrameFill(axis)) {
            let index = 0;
            let changeLine = false;
            if (this._initFillState != 0) {
                const startCross = this.getLinearCrossStart(axis);
                for (let i = this._curIndexFrame; i < this._realNumItems; i++) {
                    index = i % this._numItems;
                    changeLine = index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1;
                    [this._curIndexFrame, this._curXFrame, this._curYFrame, this._maxFrame, this._reuseIndexFrame, this._maxSizeFrame, this._preMaxSizeFrame,
                    this._afterMaxSizeFrame, this._deltaSizeFrame, this._firstItemDeltaSizeFrame, this._firstRowOrLineFrame]
                        = processFn(
                            true, this._forceUpdate, this._curIndexFrame, this._curXFrame, this._curYFrame, startCross, this._maxFrame,
                            this._maxSizeFrame, this._preMaxSizeFrame, this._afterMaxSizeFrame, this._deltaSizeFrame, this._firstItemDeltaSizeFrame,
                            this._forwardFrame, this._oldFirstIndexFrame, this._newFirstIndexFrame, this._reuseIndexFrame, this._lastIndexFrame, this._firstRowOrLineFrame
                        );
                    if (changeLine) {
                        break;
                    }
                }
                this._curIndexFrame = -1;
            }

            this.flushFramePendingDelta(axis);
            if (changeLine) {
                this.endInitFillStep(loopHandler);
                return;
            }
        } else {
            this.flushFramePendingDelta(axis);
            this.recordFrameOriginSizeIfNeeded();
        }

        this._initFillState = 1;
        this._forceUpdate = forceUpdate;

        let pos = this.getScrollMain(axis);
        const maxMain = this.getMaxScrollMain(axis);
        const tailByOffset = !this._loop && this.isAtTailByOffset(axis, pos, maxMain);
        const movingTowardHead = this._lastIndexPos > pos;
        const tailWindowLikelyTooSmall = !this._loop && this._firstIndex > 0 && (this._firstIndex + this.numChildren >= this._realNumItems);
        const effectiveForceUpdate = forceUpdate || (!tailByOffset && movingTowardHead && tailWindowLikelyTooSmall);
        const viewMain = axis == 'vertical' ? this.viewHeight : this.viewWidth;
        const contentMain = axis == 'vertical' ? this.contentHeight : this.contentWidth;
        this._maxFrame = pos + viewMain;
        this._endFrame = tailByOffset || this._maxFrame >= contentMain - EPSILON;
        this._forwardFrame = this._lastIndexPos > pos;
        this._lastIndexPos = pos;
        this._newFirstIndexFrame = this.resolveLinearFirstIndex(axis, effectiveForceUpdate, pos, tailByOffset);
        pos = this._scanPos;
        if (this._newFirstIndexFrame == this._firstIndex && !effectiveForceUpdate && this.numChildren > 0 && !this.hasLinearViewportGap(axis)) {
            return;
        }

        this.syncDynamicItemsPerFrameFromChildren();
        this.initLinearFrameState(axis, this._newFirstIndexFrame, pos);
        this.startFrameLoop(loopHandler);
    }

    private runLinearFrameLoop(axis: LinearAxis, processFn: LinearProcessFn, loopHandler: () => void, onStable?: () => void): void {
        let created = 0;
        const maxCreate = this.getMaxCreatePerFrame();
        const forceUpdate = this._forceUpdate;
        const forward = this._forwardFrame;
        let max = this._maxFrame;
        const end = this._endFrame;

        const newFirstIndex = this._newFirstIndexFrame;
        const oldFirstIndex = this._oldFirstIndexFrame;
        this._firstIndex = newFirstIndex;
        let curIndex = this._curIndexFrame;
        const lastIndex = this._lastIndexFrame;
        let reuseIndex = this._reuseIndexFrame;
        const startCross = this.getLinearCrossStart(axis);
        let curX = this._curXFrame;
        let curY = this._curYFrame;
        let maxMain = this._maxSizeFrame;
        let preMaxMain = this._preMaxSizeFrame;
        let afterMaxMain = this._afterMaxSizeFrame;
        let deltaSize = this._deltaSizeFrame;
        let firstItemDeltaSize = this._firstItemDeltaSizeFrame;
        let firstRowOrLine = this._firstRowOrLineFrame;

        while (curIndex < this._realNumItems && created < maxCreate && (end || (axis == 'vertical' ? curY < max : curX < max))) {
            [curIndex, curX, curY, max, reuseIndex, maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize, firstRowOrLine] =
                processFn(
                    true, forceUpdate, curIndex, curX, curY, startCross, max,
                    maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize,
                    forward, oldFirstIndex, newFirstIndex, reuseIndex, lastIndex, firstRowOrLine
                );

            this.persistLinearFrameState(curIndex, curX, curY, max, reuseIndex, maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize, firstRowOrLine);
            created++;
        }

        // Frame mode can stop early on variable-size data: even when the render
        // window is reached, the visible tail may still have a gap.
        while (curIndex < this._realNumItems && created < maxCreate && this.hasLinearViewportGap(axis)) {
            [curIndex, curX, curY, max, reuseIndex, maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize, firstRowOrLine] =
                processFn(
                    true, forceUpdate, curIndex, curX, curY, startCross, max,
                    maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize,
                    forward, oldFirstIndex, newFirstIndex, reuseIndex, lastIndex, firstRowOrLine
                );
            this.persistLinearFrameState(curIndex, curX, curY, max, reuseIndex, maxMain, preMaxMain, afterMaxMain, deltaSize, firstItemDeltaSize, firstRowOrLine);
            created++;
        }

        this.cleanupUnusedVirtualChildren(oldFirstIndex, this._childCountFrame);
        const reachedWindowEnd = axis == 'vertical' ? curY >= max : curX >= max;
        const noViewportGap = !this.hasLinearViewportGap(axis);
        if (curIndex >= this._realNumItems || (reachedWindowEnd && noViewportGap)) {
            this.finishLinearFrameLoop(axis, loopHandler, newFirstIndex, curIndex, deltaSize, firstItemDeltaSize, onStable);
        }
    }


    // -----------------------------------------------
    // Virtual Linear Scroll - Vertical Path
    // -----------------------------------------------
    private handleScroll1(forceUpdate: boolean): boolean {
        return this.runLinearScroll('vertical', forceUpdate, this._handleScroll1ProcessFn);
    }

    private handleScroll1InitFillStep(forceUpdate: boolean): void {
        this.initLinearFrameFill('vertical', forceUpdate, this._handleScroll1ProcessFn, this._handleScroll1LoopHandler);
    }

    private handleScroll1Loop(): void {
        this.runLinearFrameLoop('vertical', this._handleScroll1ProcessFn, this._handleScroll1LoopHandler);
    }

    private handleScroll1Process(fromFrame: boolean, forceUpdate: boolean, curIndex: number, curX: number, curY: number, startX: number, max: number,
        maxHeight: number, preMaxHeight: number, afterMaxHeight: number, deltaSize: number, firstItemDeltaSize: number,
        forward: boolean, oldFirstIndex: number, newFirstIndex: number, reuseIndex: number, lastIndex: number, firstRow: boolean): any[] {
        return this.handleLinearScrollProcess(
            'vertical',
            fromFrame,
            forceUpdate,
            curIndex,
            curX,
            curY,
            startX,
            max,
            maxHeight,
            preMaxHeight,
            afterMaxHeight,
            deltaSize,
            firstItemDeltaSize,
            forward,
            oldFirstIndex,
            newFirstIndex,
            reuseIndex,
            lastIndex,
            firstRow
        );
    }

    private adjustVerticalFirstIndexForTailFill(firstIndex: number): number {
        if (this._layout != ListLayoutType.SingleColumn && this._layout != ListLayoutType.FlowHorizontal) {
            return firstIndex;
        }
        if (this._realNumItems <= 0 || this._curLineItemCount <= 0) {
            return firstIndex;
        }

        let start = Math.max(0, firstIndex - (firstIndex % this._curLineItemCount));
        let remaining = this.calcVerticalRemainingHeightFrom(start);
        if (remaining >= this.viewHeight || start == 0) {
            return start;
        }

        while (start > 0 && remaining < this.viewHeight) {
            const prevStart = Math.max(0, start - this._curLineItemCount);
            const prevHeight = this.getVerticalRowMaxHeight(prevStart);
            remaining += prevHeight + this._lineGap;
            start = prevStart;
        }
        return start;
    }

    private calcRemainingMainFrom(start: number, axis: LinearAxis): number {
        let total = 0;
        let maxMain = 0;
        const gap = axis == 'vertical' ? this._lineGap : this._columnGap;
        for (let i = start; i < this._realNumItems; i++) {
            const index = i % this._numItems;
            const size = axis == 'vertical' ? this._virtualItems[i].height : this._virtualItems[i].width;
            maxMain = Math.max(maxMain, size);
            if (index % this._curLineItemCount == this._curLineItemCount - 1 || index == this._numItems - 1) {
                total += maxMain + gap;
                maxMain = 0;
            }
        }
        if (total > 0) {
            total -= gap;
        }
        return total;
    }

    private calcVerticalRemainingHeightFrom(start: number): number {
        return this.calcRemainingMainFrom(start, 'vertical');
    }

    private getVerticalRowMaxHeight(start: number): number {
        let maxH = 0;
        for (let i = start; i < start + this._curLineItemCount && i < this._realNumItems; i++) {
            maxH = Math.max(maxH, this._virtualItems[i].height);
            const index = i % this._numItems;
            if (index == this._numItems - 1) {
                break;
            }
        }
        return maxH;
    }

    private getTailFirstIndexByAxis(axis: LinearAxis): number {
        if (this._realNumItems <= 0 || this._curLineItemCount <= 0) {
            return 0;
        }

        let start = Math.max(0, this._realNumItems - 1);
        start -= start % this._curLineItemCount;
        let remaining = this.calcRemainingMainFrom(start, axis);
        const viewMain = axis == 'vertical' ? this.viewHeight : this.viewWidth;
        while (start > 0 && remaining < viewMain) {
            start = Math.max(0, start - this._curLineItemCount);
            remaining = this.calcRemainingMainFrom(start, axis);
        }

        return Math.max(0, start);
    }

    private getVerticalTailFirstIndex(): number {
        return this.getTailFirstIndexByAxis('vertical');
    }
    // -----------------------------------------------
    // Virtual Linear Scroll - Vertical Tail Helpers
    // -----------------------------------------------

    // -----------------------------------------------
    // Virtual Linear Scroll - Horizontal Path
    // -----------------------------------------------
    private handleScroll2(forceUpdate: boolean): boolean {
        return this.runLinearScroll('horizontal', forceUpdate, this._handleScroll2ProcessFn);
    }

    private handleScroll2InitFillStep(forceUpdate: boolean): void {
        this.initLinearFrameFill('horizontal', forceUpdate, this._handleScroll2ProcessFn, this._handleScroll2LoopHandler);
    }

    private handleScroll2Loop(): void {
        this.runLinearFrameLoop('horizontal', this._handleScroll2ProcessFn, this._handleScroll2LoopHandler, () => {
            this.handleArchOrder2(this._oldFirstIndexFrame != this._firstIndex);
        });
    }

    private handleScroll2Process(fromFrame: boolean, forceUpdate: boolean, curIndex: number, curX: number, curY: number, startY: number, max: number,
        maxWidth: number, preMaxWidth: number, afterMaxWidth: number, deltaSize: number, firstItemDeltaSize: number,
        forward: boolean, oldFirstIndex: number, newFirstIndex: number, reuseIndex: number, lastIndex: number, firstLine: boolean): any[] {
        return this.handleLinearScrollProcess(
            'horizontal',
            fromFrame,
            forceUpdate,
            curIndex,
            curX,
            curY,
            startY,
            max,
            maxWidth,
            preMaxWidth,
            afterMaxWidth,
            deltaSize,
            firstItemDeltaSize,
            forward,
            oldFirstIndex,
            newFirstIndex,
            reuseIndex,
            lastIndex,
            firstLine
        );
    }

    private getHorizontalTailFirstIndex(): number {
        return this.getTailFirstIndexByAxis('horizontal');
    }

    private calcHorizontalRemainingWidthFrom(start: number): number {
        return this.calcRemainingMainFrom(start, 'horizontal');
    }

    private getPageVirtualLastIndex(firstIndex: number): number {
        const pageSize = this._curLineItemCount * this._curLineItemCount2;
        return firstIndex + pageSize * 2;
    }

    private markPageVisibleFlags(firstIndex: number, lastIndex: number, pos: number, scrollHorizontal: boolean): { inViewCount: number, log: string } {
        let inViewCount = 0;
        const shouldBuildLog = this._debugLog;
        let log = '';
        let pageWidth = this.getPageViewWidth();
        let pageHeight = this.getPageViewHeight();
        let itemSize: Size = this._itemSize;
        const val1: number = pos - this.getItemSize();
        const edge1: number = (scrollHorizontal ? pageWidth : pageHeight) + this.getItemSize();
        const edge2: number = scrollHorizontal ? itemSize.width : itemSize.height;
        const pageSize: number = this._curLineItemCount * this._curLineItemCount2;
        let [page, startIndex] = this.getPageByIndex(firstIndex);

        for (let i = firstIndex; i < lastIndex; i++) {
            if (i >= this._realNumItems) {
                continue;
            }

            const ii = this._virtualItems[i];
            if (!ii.pos) {
                if (i % this._numItems == 0 || i >= startIndex + pageSize - 1) {
                    [page, startIndex] = this.getPageByIndex(i);
                }
                const position = this.getPosByIndexInPage(i, page, startIndex, itemSize, pageWidth, pageHeight);
                ii.pos = [position[0], position[1]];
            }

            const mainPos = scrollHorizontal ? ii.pos[0] : ii.pos[1];
            const inView = !this.checkOutView(val1, edge1, mainPos, edge2);
            if (shouldBuildLog) {
                log += `${i} = ${inView}, `;
            }
            if (inView) {
                ii.updateFlag = this.itemInfoVer;
                inViewCount++;
            }
        }

        return { inViewCount, log: shouldBuildLog ? log : '' };
    }

    private cleanupPageChildrenByUpdateFlag(): void {
        for (let i = this.numChildren - 1; i > -1; i--) {
            const listItem = this._children[i].getComponent(VListItem);
            if (!listItem) {
                continue;
            }
            const ii = this._virtualItems[listItem.realIdx];
            if (ii.updateFlag != this.itemInfoVer && ii.obj) {
                ii.selected = listItem.selected;
                this.removeChildToPool(ii.obj);
                ii.obj = null;
            }
        }
    }

    private tryReusePageItem(forward: boolean): Node | null {
        const count = this.numChildren;
        if (forward) {
            for (let j = count - 1; j > -1; j--) {
                const listItem = this._children[j].getComponent(VListItem);
                if (!listItem) {
                    continue;
                }
                const src = this._virtualItems[listItem.realIdx];
                if (src.updateFlag != this.itemInfoVer && src.obj) {
                    this.debugLog("--handleScroll3---reuseIndex----", listItem.realIdx);
                    src.selected = listItem.selected;
                    const reused = src.obj;
                    src.obj = null;
                    return reused;
                }
            }
            return null;
        }

        for (let j = 0; j < count; j++) {
            const listItem = this._children[j].getComponent(VListItem);
            if (!listItem) {
                continue;
            }
            const src = this._virtualItems[listItem.realIdx];
            if (src.updateFlag != this.itemInfoVer && src.obj) {
                this.debugLog("--handleScroll3---reuseIndex----", listItem.realIdx);
                src.selected = listItem.selected;
                const reused = src.obj;
                src.obj = null;
                return reused;
            }
        }
        return null;
    }
    // -----------------------------------------------
    // Virtual Page Helpers (shared)
    // -----------------------------------------------

    // -----------------------------------------------
    // Virtual Pagination Scroll Path
    // -----------------------------------------------
    private handleScroll3(forceUpdate: boolean): void {
        const offset = this.getScrollOffset();
        const scrollHorizontal: boolean = this.horizontal == true;
        var pos: number = scrollHorizontal ? -offset.x : offset.y;
        let pos1 = pos;
        pos = Math.max(0, pos);
        pos = Math.round(pos + EPSILON);

        //寻找当前位置的第一条项目
        this._scanPos = pos;
        var newFirstIndex: number = this.getIndexOnPos3(forceUpdate);

        this.debugLog("--newFirstIndex---", pos1, pos, ` lastIndex=${this._lastIndexPos}`, ` delta = ${Math.abs(this._lastIndexPos - pos)}`, "----", newFirstIndex, this._scanPos)
        const sameIndex = newFirstIndex == this._firstIndex;
        const sameIndexPos = this._loop ? Math.abs(this._lastIndexPos - pos) <= this.getItemSize() : true

        if (sameIndex && sameIndexPos && !forceUpdate)
            return;

        let forward: boolean = this._lastIndexPos > pos;
        this._lastIndexPos = pos;
        var oldFirstIndex: number = this._firstIndex;
        this._firstIndex = newFirstIndex;
        this.debugLog("--newFirstIndex-11--", pos, newFirstIndex)

        //分页模式不支持不等高，所以渲染满一页就好了
        var reuseIndex: number = oldFirstIndex;
        var virtualItemCount: number = this._virtualItems.length;
        var lastIndex: number = this.getPageVirtualLastIndex(newFirstIndex);
        var i: number;
        var ii: ItemInfo;
        let listItem: VListItem;
        this.itemInfoVer++;
        this.markPageVisibleFlags(newFirstIndex, lastIndex, pos, scrollHorizontal);

        var lastObj: Node = null;
        var insertIndex: number = 0;
        for (i = newFirstIndex; i < lastIndex; i++) {
            if (i >= this._realNumItems)
                continue;

            ii = this._virtualItems[i];
            if (ii.updateFlag != this.itemInfoVer)
                continue;

            [reuseIndex, lastObj, insertIndex] = this.handleScroll3Process(forceUpdate, i, reuseIndex, lastObj, insertIndex, forward);
        }

        //释放未使用的
        for (i = reuseIndex; i < virtualItemCount; i++) {
            ii = this._virtualItems[i];
            if (ii.updateFlag != this.itemInfoVer && ii.obj) {
                listItem = ii.obj.getComponent(VListItem);
                if (listItem)
                    ii.selected = listItem.selected;
                this.removeChildToPool(ii.obj);
                ii.obj = null;
            }
        }
    }

    private handleScroll3InitFillStep(forceUpdate: boolean): void {
        if (this.shouldInterruptFrameFill('page')) {
            if (this._initFillState != 0) {
                this._initFillState = 2;
                this._startLoop = false;
                this.unschedule(this.handleScroll3Loop);
                this.handleScroll(true);
                return;
            }
        }

        this._initFillState = 1;
        this._forceUpdate = forceUpdate;

        const offset = this.getScrollOffset();
        const scrollHorizontal: boolean = this.horizontal == true;
        var pos: number = scrollHorizontal ? -offset.x : offset.y;
        pos = Math.max(0, pos);
        pos = Math.round(pos + EPSILON);

        //寻找当前位置的第一条项目
        this._scanPos = pos;
        var newFirstIndex: number = this.getIndexOnPos3(forceUpdate);

        // console.log("--newFirstIndex---", pos1, pos, ` lastIndex=${lastIndexPos}`, ` delta = ${Math.abs(lastIndexPos - pos)}`, "----", newFirstIndex, s_n)
        const sameIndex = newFirstIndex == this._firstIndex;
        const sameIndexPos = this._loop ? Math.abs(this._lastIndexPos - pos) <= this.getItemSize() : true

        if (sameIndex && sameIndexPos && !forceUpdate)
            return;


        this._forwardFrame = this._lastIndexPos > pos;
        this._lastIndexPos = pos;

        this._newFirstIndexFrame = newFirstIndex;
        this._oldFirstIndexFrame = this._firstIndex;
        this._firstIndex = newFirstIndex;
        this.debugLog("--newFirstIndex-11--", pos, newFirstIndex, this.itemInfoVer + 1)

        //分页模式不支持不等高，所以渲染满一页就好了
        this._reuseIndexFrame = this._oldFirstIndexFrame;
        this._lastIndexFrame = this.getPageVirtualLastIndex(newFirstIndex);
        var i: number;
        var ii: ItemInfo;
        this.itemInfoVer++;

        this._lastObjFrame = null;
        this._insertIndexFrame = 0;

        this.syncDynamicItemsPerFrameFromChildren();
        const markResult = this.markPageVisibleFlags(newFirstIndex, this._lastIndexFrame, pos, scrollHorizontal);
        let visibleSeen = 0;
        for (i = newFirstIndex; i < this._lastIndexFrame; i++) {
            if (i >= this._realNumItems)
                continue;

            ii = this._virtualItems[i];

            const inView = ii.updateFlag == this.itemInfoVer;
            if (inView) {
                visibleSeen++;
            }
            if (ii.obj && (!inView || visibleSeen > this.dynamicItemsPerFrame)) {
                this.removeChildToPool(ii.obj);
                ii.obj = null;

                this.debugLog("----handleScroll3InitFillStep--remove--", i);
            }

        }

        this.debugLog("---inview--", markResult.log);


        this._curIndexFrame = newFirstIndex;
        this.handleScroll3Loop(true);
        if (!this._startLoop) {
            this._startLoop = true;
            this.schedule(this.handleScroll3Loop, this.frameInterval);
        }

    }

    private handleScroll3Loop(isExplicitly: boolean = false): void {
        const maxCreate = this.getMaxCreatePerFrame();

        let created = 0;
        let forceUpdate = this._forceUpdate;
        let lastIndex = this._lastIndexFrame;

        let reuseIndex: number = this._reuseIndexFrame;
        let lastObj = this._lastObjFrame;
        let insertIndex = this._insertIndexFrame;
        let forward = this._forwardFrame

        while (this._curIndexFrame < lastIndex) {
            if (this._curIndexFrame < this._realNumItems &&
                this._virtualItems[this._curIndexFrame].updateFlag == this.itemInfoVer
                // && !this._virtualItems[this._curIndexFrame].obj
            ) {
                [reuseIndex, lastObj, insertIndex] = this.handleScroll3Process(forceUpdate, this._curIndexFrame, reuseIndex, lastObj, insertIndex, forward)
                this._reuseIndexFrame = reuseIndex;
                this._lastObjFrame = lastObj;
                this._insertIndexFrame = insertIndex;
                created++;
            } else {
                this.debugLog("--handleScroll3---continue---", this._curIndexFrame);
            }
            this._curIndexFrame++

            if (created >= maxCreate) {
                break;
            }

        }


        //释放未使用的
        if (isExplicitly) {
            this.cleanupPageChildrenByUpdateFlag();
        }





        this.debugLog("----handleScroll3Loop-2222---", maxCreate);
        if (this._curIndexFrame >= lastIndex) {
            this._initFillState = 2;
            this._startLoop = false;
            this.unschedule(this.handleScroll3Loop);
            this.debugLog("----handleScroll3Loop-end---", maxCreate);
            // //释放未使用的
            // let ii: ItemInfo;
            // let virtualItemCount: number = this._virtualItems.length;
            // let listItem: VListItem;
            // for (let i = reuseIndex; i < virtualItemCount; i++) {
            //     ii = this._virtualItems[i];
            //     if (ii.updateFlag != this.itemInfoVer && ii.obj) {
            //         listItem = ii.obj.getComponent(VListItem);
            //         if (listItem)
            //             ii.selected = listItem.selected;
            //         this.removeChildToPool(ii.obj);
            //         ii.obj = null;
            //     }
            // }
        }

    }

    private handleScroll3Process(forceUpdate: boolean, i: number, reuseIndex: number, lastObj: Node, insertIndex: number, forward: boolean): any[] {
        let ii: ItemInfo = this._virtualItems[i];
        let url: string | number = this._defaultItem.name;
        let listItem: VListItem;
        let needRender: boolean;
        let uiTrans: UITransform;

        this.debugLog("----handleScroll3Process----", i)
        if (!ii.obj) {
            // 尝试从当前页未标记的节点中回收一个对象复用
            ii.obj = this.tryReusePageItem(forward);


            if (insertIndex == -1)
                insertIndex = this.getChildIndex(lastObj) + 1;

            if (!ii.obj) {
                if (this._itemProvider != null) {
                    url = this._itemProvider.call(this._providerTarget, i % this._numItems);
                    if (url == null)
                        url = this._defaultItem.name;
                    // url = UIPackage.normalizeURL(url);
                }

                ii.obj = this.getObject(url);
                this.addChildAt(ii.obj, insertIndex);
            }
            else {
                insertIndex = this.setChildIndexBefore(ii.obj, insertIndex);
            }
            insertIndex++;
            listItem = ii.obj.getComponent(VListItem);
            if (listItem)
                listItem.selected = ii.selected;

            needRender = true;
        }
        else {
            needRender = forceUpdate;
            insertIndex = -1;
            lastObj = ii.obj;
        }

        if (needRender) {

            listItem = ii.obj.getComponent(VListItem);
            if (listItem) {
                listItem.listIdx = i % this._numItems;
                listItem.realIdx = i;
            }

            this._itemRenderer.call(this._rendererTarget, i % this._numItems, ii.obj, i);
            // ii.width = Math.ceil(uiTrans.width);
            // ii.height = Math.ceil(uiTrans.height);
        }

        uiTrans = ii.obj.getComponent(UITransform);
        ii.obj.setPosition(ii.pos[0] + uiTrans.anchorX * ii.width, -ii.pos[1] - (1 - uiTrans.anchorY) * ii.height);
        return [reuseIndex, lastObj, insertIndex];
    }
    // ====================================================================================================
    // Module: Render Order / Initialization / Layout Internals
    // ====================================================================================================

    // ----------------------------------------
    // Init & Layout Setup
    // ----------------------------------------
    private _init(): void {
        if (this._inited) return;

        if (this._content.getComponent(Layout)) {
            this._content.getComponent(Layout).destroy();
        }
        this._inited = true;
        this._children = this._content.children;

        let child: Node;
        let widget: Widget;
        for (let i: number = this.numChildren - 1; i > -1; i--) {
            child = this._children[i];
            widget = child.getComponent(Widget)
            if (widget) widget.destroy();
            this.returnToPool(child);
        }

        this.updatePaddingNode();

        if (this.defaultItemPrefab)
            this.defaultItem = instantiate(this.defaultItemPrefab);

        if (this.tmpList && this.tmpList.length) {
            this._providerItems = [];
            for (let i: number = 0; i < this.tmpList.length; i++) {
                this._providerItems.push(instantiate(this.tmpList[i]));
            }
            if (!this.defaultItem) this.defaultItem = this._providerItems[0];
        }



        //set content anchor(0,1)
        let pos = this._content.getPosition();
        let x = pos.x;
        let y = pos.y;
        const uiTransform = this.getContentUITransform();
        let anchorX = uiTransform.anchorX;
        let anchorY = uiTransform.anchorY;
        if (anchorX != 0) {
            uiTransform.anchorX = 0;
            x += uiTransform.width * (uiTransform.anchorX - anchorX);
        }
        if (anchorY != 1) {
            uiTransform.anchorY = 1;
            y += uiTransform.height * (uiTransform.anchorY - anchorY);
        }

        //set content top or left
        x = this.horizontal ? -this.view.anchorX * this.viewWidth : x;
        y = this.vertical ? (1 - this.view.anchorY) * this.viewHeight : y;

        this._content.setPosition(x, y);

        // init virtual
        this._setVirtual(this._virtual, true);

        if (this._tempInitNumItems > 0) {
            this.numItems = this._tempInitNumItems;
            this._tempInitNumItems = 0;
        }



    }

    private initPaddingNode(): Node {
        if (this.paddingTop == 0 && this.paddingBottom == 0 && this.paddingLeft == 0 && this.paddingRight == 0) return null;
        if (this._paddingNode) return this._paddingNode;
        this._paddingNode = new Node();
        const trans = this._paddingNode.addComponent(UITransform);
        trans.anchorX = this.view.anchorX;
        trans.anchorY = this.view.anchorY;
        // this.updatePaddingNode();
        this.view.node.addChild(this._paddingNode);
        this._content.removeFromParent();
        this._paddingNode.addChild(this._content);
        return this._paddingNode;
    }

    private updatePaddingNode(): void {
        // if (!this._paddingNode && !this.initPaddingNode()) return;
        const trans = this.view;//this._paddingNode.getComponent(UITransform);
        const parentTrans = this.view.node.parent.getComponent(UITransform);
        trans.width = Math.max(1, parentTrans.width - (this.paddingLeft + this.paddingRight));
        trans.height = Math.max(1, parentTrans.height - (this.paddingTop + this.paddingBottom));
        let offsetX: number = this.paddingLeft;
        let offsetY: number = this.paddingTop;


        let targetX = -parentTrans.width * parentTrans.anchorX + offsetX + trans.width * trans.anchorX;
        let targetY = parentTrans.height * (1 - parentTrans.anchorY) - offsetY - trans.height * (1 - trans.anchorY);
        this.view.node.setPosition(targetX, targetY);

    }

    private callLater(callback: any, delay?: number): void {
        this.scheduleOnce(callback, delay)
    }

    // ----------------------------------------
    // Child & Content Accessors
    // ----------------------------------------

    public getChildAt(index: number): Node {
        return this._children[index];
    }

    private getChildIndex(item: Node): number {
        if (!this._content) return -1;
        return this._children.indexOf(item);
    }

    private setContentSize(width: number, height: number): void {
        if (this._pullRefresh > 0) {
            this._pullRealWidth = width;
            this._pullRealHeight = height;
            if (this.horizontal && width < this.viewWidth) {
                width = this.viewWidth;
            }

            if (this.vertical && height < this.viewHeight) {
                height = this.viewHeight;
            }

        }
        this.getContentUITransform().setContentSize(width, height);
    }


    private get contentWidth(): number {
        return this.getContentUITransform().width;
    }

    private get contentHeight(): number {
        return this.getContentUITransform().height;
    }


    public get viewHeight(): number {
        let height = this.view!.height;
        return height;
    }


    public get viewWidth(): number {
        let width = this.view!.width;
        return width;
    }

    public get numChildren(): number {
        return this._children.length;
    }

    private setChildIndex(child: Node, index: number): void {
        var oldIndex: number = this._children.indexOf(child);
        if (oldIndex == -1)
            throw new Error("Not a child of this container");

        this._setChildIndex(child, oldIndex, index);
    }

    public setChildIndexBefore(child: Node, index: number): number {

        var oldIndex: number = this._children.indexOf(child);
        if (oldIndex == -1)
            throw new Error("Not a child of this container");


        if (oldIndex < index)
            return this._setChildIndex(child, oldIndex, index - 1);
        else
            return this._setChildIndex(child, oldIndex, index);
    }

    private _setChildIndex(child: Node, oldIndex: number, index: number): number {

        // Arch在buildNativeDisplayList排序
        if (this._childrenRenderOrder == ChildrenRenderOrder.Arch)
            return index


        var cnt: number = this._children.length;
        if (index >= cnt)
            index = cnt - 1;

        let realIndex: number = index;
        if (this._childrenRenderOrder == ChildrenRenderOrder.Descent)
            realIndex = cnt - 1 - index;

        if (oldIndex == realIndex)
            return oldIndex;

        child.setSiblingIndex(realIndex);

        return realIndex;
    }

    private buildNativeDisplayList(dt?: number): void {
        if (!isNaN(dt)) {
            // let _t = <GComponent>GObject.cast(this.node);
            this.buildNativeDisplayList();
            return;
        }

        let cnt: number = this._children.length;
        if (cnt == 0)
            return;

        let child: Node;
        switch (this._childrenRenderOrder) {
            case ChildrenRenderOrder.Ascent:
                {
                    let j = 0;
                    for (let i = 0; i < cnt; i++) {
                        child = this._children[i];
                        child.setSiblingIndex(j++);
                    }
                }
                break;
            case ChildrenRenderOrder.Descent:
                {
                    let j = 0;
                    for (let i = cnt - 1; i >= 0; i--) {
                        child = this._children[i];
                        child.setSiblingIndex(j++);
                    }
                }
                break;

            case ChildrenRenderOrder.Arch:
                {
                    this.debugLog("---Arch--this._apexIndex---------Arch--1111---", this._apexIndex)
                    let j: number = 0;
                    let i: number = 0;
                    if (this._children[0].getComponent(VListItem)) {
                        let listIdx: number;
                        let minIndex: number = this._virtualItems[this._firstIndex].obj.getComponent(VListItem).listIdx;
                        let maxIndex: number = minIndex + cnt - 1;

                        for (i = this._firstIndex; i < this._firstIndex + cnt; i++) {
                            child = this._virtualItems[i].obj;
                            if (!child) continue;
                            listIdx = child.getComponent(VListItem).listIdx;
                            if (listIdx == this._apexIndex) {
                                j = cnt - 1;
                            } else if (listIdx < this._apexIndex) {
                                j = listIdx - minIndex;
                            } else {
                                j = (this._apexIndex - minIndex) + (maxIndex - listIdx);
                            }
                            child.setSiblingIndex(j);
                        }

                    } else {
                        for (i = 0; i < this._apexIndex; i++) {
                            child = this._children[i];
                            this.debugLog("---this._apexIndex-1-", child.getComponent(VListItem).listIdx, j)
                            child.setSiblingIndex(j++);
                        }
                        for (i = cnt - 1; i > this._apexIndex; i--) {
                            child = this._children[cnt - 1];
                            this.debugLog("---this._apexIndex-", child.getComponent(VListItem).listIdx, j)
                            child.setSiblingIndex(j++);
                        }
                    }
                }
                break;
        }
    }

    // ----------------------------------------
    // Render Order (Arch/Ascent/Descent)
    // ----------------------------------------
    private handleArchOrder1(forceUpdate: boolean = false): void {
        if (this._childrenRenderOrder == ChildrenRenderOrder.Arch) {
            var mid: number = this.getContentPosition().y + this.viewHeight / 2;
            var minDist: number = Number.POSITIVE_INFINITY;
            var dist: number = 0;
            var apexIndex: number = 0;
            var cnt: number = this.numChildren;
            let uiTrans: UITransform;
            for (var i: number = 0; i < cnt; i++) {
                var obj: Node = this.getChildAt(i);
                if (obj.active) {
                    uiTrans = obj.getComponent(UITransform);
                    dist = Math.abs(mid - (-obj.y - uiTrans.height * (0.5 - uiTrans.anchorY)));
                    if (dist < minDist) {
                        minDist = dist;
                        apexIndex = obj.getComponent(VListItem)?.listIdx;
                    }
                }
            }
            this.setApexIndex(apexIndex, forceUpdate);
        }
    }

    private handleArchOrder2(forceUpdate: boolean = false): void {
        if (this._childrenRenderOrder == ChildrenRenderOrder.Arch) {
            var mid: number = -this.getContentPosition().x + this.viewWidth / 2;
            var minDist: number = Number.POSITIVE_INFINITY;
            var dist: number = 0;
            var apexIndex: number = 0;
            var cnt: number = this.numChildren;
            let uiTrans: UITransform;
            for (var i: number = 0; i < cnt; i++) {
                var obj: Node = this.getChildAt(i);
                if (obj.active) {
                    uiTrans = obj.getComponent(UITransform);
                    dist = Math.abs(mid - (obj.x + uiTrans.width * (0.5 - uiTrans.anchorX)));
                    if (dist < minDist) {
                        minDist = dist;
                        apexIndex = obj.getComponent(VListItem)?.listIdx;
                    }
                }
            }
            this.setApexIndex(apexIndex, forceUpdate);
        }
    }


    // ====================================================================================================
    // Module: Content Size Mutation & Boundary Helpers
    // ====================================================================================================
    /**
     * modify content size on scrolling
     * @param deltaWidth 
     * @param deltaHeight 
     * @param deltaPosX 
     * @param deltaPosY 
     * @returns 
     */
    private modifyContentSizeOnScrolling(deltaWidth: number, deltaHeight: number, deltaPosX: number, deltaPosY: number): void {
        if (deltaWidth == 0 && deltaHeight == 0 && deltaPosX == 0 && deltaPosY == 0) {
            return;
        }

        if (this._modifyingContentSizeOnScrolling) {
            this._pendingModifyDeltaWidth += deltaWidth;
            this._pendingModifyDeltaHeight += deltaHeight;
            this._pendingModifyDeltaPosX += deltaPosX;
            this._pendingModifyDeltaPosY += deltaPosY;
            return;
        }

        this._modifyingContentSizeOnScrolling = true;
        try {
            let curDeltaWidth = deltaWidth;
            let curDeltaHeight = deltaHeight;
            let curDeltaPosX = deltaPosX;
            let curDeltaPosY = deltaPosY;

            let flushCount = 0;
            while (true) {
                const preOffset = this.getScrollOffset().clone();
                const preMaxOffset = this.getMaxScrollOffset().clone();
                const preContentPos = this.getContentPosition().clone();
                const stickToBottom = this.vertical
                    && preMaxOffset.y > 0
                    && preOffset.y >= preMaxOffset.y - 1;

                const width = this.contentWidth + curDeltaWidth;
                const height = this.contentHeight + curDeltaHeight;
                if (curDeltaWidth != 0 || curDeltaHeight != 0) {
                    this.setContentSize(width, height);
                    if (this.vertical && !this.horizontal) {
                        const curPos = this.getContentPosition();
                        if (curPos.x != preContentPos.x) {
                            this.setContentPosition(new Vec3(preContentPos.x, curPos.y, curPos.z));
                        }
                    }
                }

                if (stickToBottom && curDeltaHeight > 0) {
                    const newMaxY = this.getMaxScrollOffset().y;
                    const preAnchorY = Math.min(preOffset.y, preMaxOffset.y);
                    const needDeltaY = Math.max(0, newMaxY - preAnchorY);
                    curDeltaPosY += needDeltaY;
                }

                if (curDeltaPosX != 0 || curDeltaPosY != 0) {
                    curDeltaPosX = -curDeltaPosX;
                    //当内容向下滚动时(foward == true)，前面的item的动态宽高变化导致显示区域内item的坐标变化
                    //而此时scrollView的ScrollOffset还是之前的，会出现跳动的感觉，需要匹配现在item新坐标的位置，即加上变化前后的差值
                    const delta: Vec3 = new Vec3(curDeltaPosX, curDeltaPosY, 0);
                    const targetOffset = this.getContentPosition().clone();
                    targetOffset.add(delta);
                    this.setContentPosition(targetOffset);
                    if (this.isAutoScrolling()) {
                        //惯性滚动，_autoScrollStartPosition要跟着修改
                        const scrollPos = this._autoScrollStartPosition;
                        if (scrollPos) {
                            scrollPos.add(delta);
                        }
                    } else {
                        const deltaAmount = this._deltaAmount;
                        deltaAmount.add(new Vec3(delta.x, delta.y, 0));
                    }
                }

                this.correctScrollIfNeeded();

                this.clampScrollOffsetInBounds();

                if (this._pendingModifyDeltaWidth == 0 && this._pendingModifyDeltaHeight == 0
                    && this._pendingModifyDeltaPosX == 0 && this._pendingModifyDeltaPosY == 0) {
                    break;
                }

                curDeltaWidth = this._pendingModifyDeltaWidth;
                curDeltaHeight = this._pendingModifyDeltaHeight;
                curDeltaPosX = this._pendingModifyDeltaPosX;
                curDeltaPosY = this._pendingModifyDeltaPosY;
                this._pendingModifyDeltaWidth = 0;
                this._pendingModifyDeltaHeight = 0;
                this._pendingModifyDeltaPosX = 0;
                this._pendingModifyDeltaPosY = 0;

                flushCount++;
                if (flushCount > 8) {
                    this.debugLog("modifyContentSizeOnScrolling flush exceeded limit", curDeltaWidth, curDeltaHeight, curDeltaPosX, curDeltaPosY);
                    break;
                }
            }
        } finally {
            this._modifyingContentSizeOnScrolling = false;
            this._pendingModifyDeltaWidth = 0;
            this._pendingModifyDeltaHeight = 0;
            this._pendingModifyDeltaPosX = 0;
            this._pendingModifyDeltaPosY = 0;
        }

    }

    private clampScrollOffsetInBounds(): void {
        const offset = this.getScrollOffset();
        const max = this.getMaxScrollOffset();

        // Keep cross-axis untouched. Some horizontal/page lists use negative offset.x.
        let clampedX = offset.x;
        let clampedY = offset.y;

        if (this.vertical && !this.horizontal) {
            clampedX = offset.x;
            clampedY = Math.max(0, Math.min(offset.y, max.y));
        } else if (this.horizontal && !this.vertical) {
            clampedX = Math.max(-max.x, Math.min(offset.x, 0));
            clampedY = offset.y;
        } else {
            clampedX = Math.max(0, Math.min(offset.x, max.x));
            clampedY = Math.max(0, Math.min(offset.y, max.y));
        }

        if (clampedX != offset.x || clampedY != offset.y) {
            this.scrollToOffset(new Vec2(clampedX, clampedY), 0, false);
        }
    }

    private settleVirtualBoundaryAfterRelease(): void {
        // Disabled: previous aggressive settle introduced drag jitter and bottom reach regressions.
    }

    private trySnapTailBlankAfterRelease(): boolean {
        return false;
        /*
        if (!this.vertical || this.horizontal || this._realNumItems <= 0 || this._children.length <= 0) {
            return false;
        }
        const lastRealIdx = this._realNumItems - 1;
        const lineStart = Math.max(0, lastRealIdx - (lastRealIdx % this._curLineItemCount));
        let hasLastItem = false;
        let maxBottom = -Number.MAX_VALUE;
        for (let i = 0; i < this._children.length; i++) {
            const child = this._children[i];
            if (!child || !child.active) continue;
            const listItem = child.getComponent(VListItem);
            if (!listItem) continue;
            if (listItem.realIdx == lastRealIdx) {
                hasLastItem = true;
            }
            if (listItem.realIdx < lineStart || listItem.realIdx > lastRealIdx) {
                continue;
            }
            const ui = child.getComponent(UITransform);
            const childBottom = -(child.y + (1 - ui.anchorY) * ui.height);
            if (childBottom > maxBottom) {
                maxBottom = childBottom;
            }
        }
        if (!hasLastItem || maxBottom == -Number.MAX_VALUE) {
            return false;
        }
        const offset = this.getScrollOffset();
        const viewBottom = offset.y + this.viewHeight;
        const blank = viewBottom - maxBottom;
        if (blank <= 1) {
            return false;
        }
        const maxOffset = this.getMaxScrollOffset();
        // Only correct when we're already at/near bottom; otherwise it's a normal mid-list viewport gap.
        if (Math.abs(maxOffset.y - offset.y) > 2) {
            return false;
        }

        // If last line is visible but bottom gap remains at max offset, content height is overestimated.
        const newHeight = Math.max(this.viewHeight, this.contentHeight - blank);
        if (newHeight < this.contentHeight) {
            this.setContentSize(this.contentWidth, newHeight);
            const newMaxOffset = this.getMaxScrollOffset();
            const targetY = Math.max(0, Math.min(offset.y, newMaxOffset.y));
            this.scrollToOffset(new Vec2(offset.x, targetY), 0, false);
        }
        this.correctScrollIfNeeded();
        this.handleScroll(false);
        return true;
        */
    }


    /**
     * 检查content移动的值是否会超出边界，如果超出就设置到对称位置
     * 只在循环模式下工作
     * @param deltaAmount 即将滚动的差值
     * @returns 
     */
    public loopCheckingCurrent(deltaAmount: Vec3): boolean {
        if (!deltaAmount || (deltaAmount.x == 0 && deltaAmount.y == 0 && deltaAmount.z == 0)) return false;
        let pos = this.getContentPosition();
        let x: number = pos.x;
        let y: number = pos.y;
        let changed: boolean = false;
        const preX = x;
        const preY = y;
        const scrollHorizontal: boolean = this.horizontal == true;
        if (scrollHorizontal) {
            const tempLeftBoundary: number = this._getContentLeftBoundary();
            const tempRightBoundary: number = this._getContentRightBoundary();
            if (tempLeftBoundary + deltaAmount.x > this._leftBoundary) {
                x -= (this.contentWidth + this.columnGap) / this._loopNums;
                changed = true;
                this.debugLog("------loopCheckingCurrent-_topBou_leftBoundaryndary--", this.contentHeight, preX, x, deltaAmount.x)
            } else if (tempRightBoundary + deltaAmount.x < this._rightBoundary) {
                x += (this.contentWidth + this.columnGap) / this._loopNums;
                changed = true;
                this.debugLog("------loopCheckingCurrent-_rightBoundary--", this.contentHeight, preX, x, deltaAmount.x)
            }
            if (changed && this._layout == ListLayoutType.Pagination) {
                const page = (preX - x) / this.getPageViewWidth();
                this._curPageIdx = this.normalizePageIndex(this._curPageIdx + page);
            }

        } else {
            const tempTopBoundary: number = this._getContentTopBoundary();
            const tempBottomBoundary: number = this._getContentBottomBoundary();


            if (tempTopBoundary + deltaAmount.y < this._topBoundary) {
                y += (this.contentHeight + this.lineGap) / this._loopNums;
                changed = true;

                this.debugLog("------loopCheckingCurrent-_topBoundary--", this.contentHeight, preY, y, deltaAmount.y)

            } else if (tempBottomBoundary + deltaAmount.y > this._bottomBoundary) {
                y -= (this.contentHeight + this.lineGap) / this._loopNums;
                changed = true;
                this.debugLog("------loopCheckingCurrent-_bottomBoundary--", this.contentHeight, preY, y, deltaAmount.y)
            }
            if (changed && this._layout == ListLayoutType.Pagination) {
                const page = (y - preY) / this.getPageViewHeight();
                this._curPageIdx = this.normalizePageIndex(this._curPageIdx + page);
                this.debugLog("-----this._curPageIdx--loopCheckingCurrent---", this._curPageIdx)
            }
        }

        if (changed) {
            this.content.setPosition(x, y);
            this._lastIndexPos = scrollHorizontal ? -x : y;
            if (this.isAutoScrolling()) {
                this.debugLog("-----this._curPageIdx--loopCheckingCurrent--isAutoScrolling-", preX, preY, this._autoScrollStartPosition.x, this._autoScrollStartPosition.y)
                this._autoScrollStartPosition.add(new Vec3(x - preX, y - preY, 0))
                this.debugLog("-----this._curPageIdx--loopCheckingCurrent--isAutoScrolling--2222-", x, y, this._autoScrollStartPosition.x, this._autoScrollStartPosition.y)
            }
        }

        return changed;
    }




    // ====================================================================================================
    // Module: ScrollView Overrides & Lifecycle Hooks
    // ====================================================================================================

    // ----------------------------------------
    // Lifecycle Hooks
    // ----------------------------------------
    onLoad() {
        this._calculateBoundary();
        this._init();
        if (!this.node.hasEventListener(ScrollView.EventType.SCROLL_ENDED, this.onAnyScrollEnded, this)) {
            this.node.on(ScrollView.EventType.SCROLL_ENDED, this.onAnyScrollEnded, this);
        }
    }

    onDestroy() {
        this.node.off(ScrollView.EventType.SCROLL_ENDED, this.onAnyScrollEnded, this);
    }

    // ----------------------------------------
    // Scroll-End Settle
    // ----------------------------------------
    private onAnyScrollEnded(): void {
        if (!this._virtual || this._pendingScrollEndSettle) {
            return;
        }
        this._pendingScrollEndSettle = true;
        this.scheduleOnce(() => {
            this._pendingScrollEndSettle = false;
            if (!this._virtual) {
                return;
            }
            this.clampScrollOffsetInBounds();
            this.handleScroll(true);
            if (this.frameInterval > 0 && this.itemsPerFrame > 0) {
                this.scheduleOnce(() => {
                    this.handleScroll(true);
                }, 0.03);
            }
        }, 0);
    }

    start() {
        // Because widget component will adjust content position and scrollView position is correct after visit
        // So this event could make sure the content is on the correct position after loading.
        if (this._content) {
            director.once(Director.EVENT_BEFORE_DRAW, this._adjustContentOutOfBoundary, this);
        }
    }

    // ----------------------------------------
    // Content Move Overrides
    // ----------------------------------------

    protected _moveContentToTopLeft(scrollViewSize: Size): void {
        if (!this._inited) return;
        let bottomDelta = this._getContentBottomBoundary() - this._bottomBoundary;
        bottomDelta = -bottomDelta;
        const moveDelta = new Vec3();
        let totalScrollDelta = 0;

        let leftDelta = this._getContentLeftBoundary() - this._leftBoundary;
        leftDelta = -leftDelta;

        // 是否限制在上视区上边
        if (this._content) {
            const uiTrans = this._content._uiProps.uiTransformComp!;
            const contentSize = uiTrans.contentSize;
            if (contentSize.height < scrollViewSize.height) {
                totalScrollDelta = contentSize.height - scrollViewSize.height;
                moveDelta.y = bottomDelta - totalScrollDelta;

                let newOffsetY: number = 0;
                if (this._verticalAlign == VertAlignType.Middle)
                    newOffsetY = Math.floor((this.viewHeight - contentSize.height) / 2);
                else if (this._verticalAlign == VertAlignType.Bottom)
                    newOffsetY = this.viewHeight - contentSize.height;
                moveDelta.y -= newOffsetY;
            }

            // 是否限制在上视区左边
            if (contentSize.width < scrollViewSize.width) {
                totalScrollDelta = contentSize.width - scrollViewSize.width;
                moveDelta.x = leftDelta;

                let newOffsetX: number = 0;
                if (this._align == AlignType.Center)
                    newOffsetX = Math.floor((this.viewWidth - contentSize.width) / 2);
                else if (this._align == AlignType.Right)
                    newOffsetX = this.viewWidth - contentSize.width;
                moveDelta.x += newOffsetX;
            }
        }

        if (this._alignAllDirection) {
            const nowPos = this.content.getPosition();
            if (!this.horizontal && moveDelta.x != 0) this.content.setPosition(nowPos.x + moveDelta.x, nowPos.y);
            if (!this.vertical && moveDelta.y != 0) this.content.setPosition(nowPos.x, nowPos.y + moveDelta.y);
        }


        this._updateScrollBarState();
        this._moveContent(moveDelta);
        this._adjustContentOutOfBoundary();
    }

    protected _moveContent(deltaMove: Vec3, canStartBounceBack?: boolean): void {
        if (this._loop) {
            if (this.loopCheckingCurrent(deltaMove)) {
                canStartBounceBack = false;
            }
        }
        super._moveContent(deltaMove, canStartBounceBack);

        if (this._pullRefresh > 0) {
            const outOfBoundary = this._getHowMuchOutOfBoundary();
            let toReadyOrPulling: number = 0;
            let flag: boolean = false;
            if (this._pullRefresh == 2) {
                if (outOfBoundary.y < 0) {
                    if (outOfBoundary.y <= -this.pullRefreshThreshold) {
                        toReadyOrPulling = 1;
                        // if (this._pullRefreshState == PullEventType.PULLING) {
                        //     this._updatePullRefreshState(PullEventType.READY)
                        // }
                    } else {
                        toReadyOrPulling = 2;
                        let forward: boolean = deltaMove.y > 0;
                        flag = forward;
                        // console.log('------deltaMove.y--------', deltaMove.y)
                        // if ((forward && this._pullRefreshState == PullEventType.IDLE) || (!forward && this._pullRefreshState == PullEventType.READY)) {
                        //     this._updatePullRefreshState(PullEventType.PULLING)
                        // }
                    }
                }

                if (outOfBoundary.x > 0) {
                    if (outOfBoundary.x >= this.pullRefreshThreshold) {
                        toReadyOrPulling = 1;
                        // if (this._pullRefreshState == PullEventType.PULLING) {
                        //     this._updatePullRefreshState(PullEventType.READY)
                        // }


                    } else {
                        toReadyOrPulling = 2;
                        let forward: boolean = deltaMove.x > 0;
                        flag = !forward;
                        // if ((!forward && this._pullRefreshState == PullEventType.IDLE) || (forward && this._pullRefreshState == PullEventType.READY)) {
                        //     this._updatePullRefreshState(PullEventType.PULLING)
                        // }
                    }
                }


            } else {
                if (outOfBoundary.y > 0) {
                    if (outOfBoundary.y >= this.pullRefreshThreshold) {
                        toReadyOrPulling = 1;
                        // if (this._pullRefreshState == PullEventType.PULLING) {
                        //     this._updatePullRefreshState(PullEventType.READY)
                        // }


                    } else {
                        toReadyOrPulling = 2;
                        let forward: boolean = deltaMove.y > 0;
                        flag = !forward;
                        // console.log('------deltaMove.y--------', deltaMove.y)
                        // if ((!forward && this._pullRefreshState == PullEventType.IDLE) || (forward && this._pullRefreshState == PullEventType.READY)) {
                        //     this._updatePullRefreshState(PullEventType.PULLING)
                        // }
                    }
                }

                if (outOfBoundary.x < 0) {
                    if (outOfBoundary.x <= -this.pullRefreshThreshold) {
                        toReadyOrPulling = 1;
                        // if (this._pullRefreshState == PullEventType.PULLING) {
                        //     this._updatePullRefreshState(PullEventType.READY)
                        // }


                    } else {
                        toReadyOrPulling = 2;
                        let forward: boolean = deltaMove.x > 0;
                        flag = forward;
                        // console.log('------deltaMove.y--------', deltaMove.y)
                        // if ((forward && this._pullRefreshState == PullEventType.IDLE) || (!forward && this._pullRefreshState == PullEventType.READY)) {
                        //     this._updatePullRefreshState(PullEventType.PULLING)
                        // }
                    }
                }
            }

            if (toReadyOrPulling == 1) {
                if (this._pullRefreshState == PullEventType.PULLING) {
                    this._updatePullRefreshState(PullEventType.READY)
                }
            } else if (toReadyOrPulling == 2) {
                if ((flag && this._pullRefreshState == PullEventType.IDLE) || (!flag && this._pullRefreshState == PullEventType.READY)) {
                    this._updatePullRefreshState(PullEventType.PULLING)
                }
            }

        }

    }

    // ----------------------------------------
    // Touch / Nested Scroll Coordination
    // ----------------------------------------
    protected _onTouchEndedInScrollview(event: EventTouch, captureListeners?: Node[]): void {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const self = this;
        this.debugLog('------_handleReleaseLogic----_onTouchEndedInScrollview--')
        if (!self.enabledInHierarchy || !self._content || !event) {
            return;
        }
        if (self._hasNestedViewGroup(event, captureListeners)) {
            return;
        }

        self._dispatchEvent(ScrollView.EventType.TOUCH_UP);

        const touch = event.touch!;
        self._handleReleaseLogic(touch);

        if (self._touchMoved) {
            // event.propagationStopped = true;
        } else {
            self._stopPropagationIfTargetIsMe(event);
        }
    }

    protected _hasNestedViewGroup(event: EventTouch, captureListeners?: Node[]): boolean {

        if (!event || event.eventPhase !== Event.CAPTURING_PHASE) {
            return false;
        }

        if (event.type == NodeEventType.TOUCH_START) return false;
        if (this._layout == ListLayoutType.Pagination
            && (event.type == NodeEventType.TOUCH_END || event.type == NodeEventType.TOUCH_CANCEL)) {
            return false;
        }
        if (event.type == NodeEventType.TOUCH_END || event.type == NodeEventType.TOUCH_CANCEL) return !this._touchMoved;
        if (event.type != NodeEventType.TOUCH_MOVE) return super._hasNestedViewGroup(event, captureListeners);
        if (this._touchMoved) return false;
        if (captureListeners) {
            let diff: number, diff2: number;
            let deltaMove: Vec2, startPos, nowPos;
            let scroll: ScrollView;
            const touch = event.touch!;
            // captureListeners are arranged from child to parent
            for (let i = 0; i < captureListeners.length; i++) {
                const listener = captureListeners[i];

                if (this.node != listener && listener.getComponent(ViewGroup)) {
                    scroll = listener.getComponent(ScrollView);
                    if (!scroll) continue;
                    if (scroll["_touchMoved"]) return true;

                    if (!this._touchMoved) {
                        deltaMove = touch.getUILocation(_tempVec2);
                        startPos = touch.getUIStartLocation(_tempVec2_1);
                        nowPos = deltaMove.clone();
                        deltaMove.subtract(startPos);
                        if (deltaMove.length() <= 7) {
                            return true;

                        }

                        if (this.vertical) {
                            if (scroll.horizontal) {
                                diff = Math.abs(nowPos.y - startPos.y);
                                diff2 = Math.abs(nowPos.x - startPos.x);
                                if (diff < diff2) {
                                    return true;
                                }

                            }
                        } else if (this.horizontal) {
                            if (scroll.vertical) {
                                diff = Math.abs(nowPos.x - startPos.x);
                                diff2 = Math.abs(nowPos.y - startPos.y);
                                if (diff < diff2) {
                                    return true;
                                }

                            }
                        }

                    }
                }
            }
        }
        return false;
    }

    private _pullHeader: number = 0;
    private _pullFooter: number = 0;

    // ----------------------------------------
    // Boundary Calculation Override
    // ----------------------------------------
    protected _getHowMuchOutOfBoundary(addition?: Vec3): Vec3 {
        if (!addition) {
            addition = Vec3.ZERO;
        }
        if (addition.equals(Vec3.ZERO, EPSILON) && !this._outOfBoundaryAmountDirty) {
            return this._outOfBoundaryAmount;
        }

        const outOfBoundaryAmount = new Vec3();
        const tempLeftBoundary: number = this._getContentLeftBoundary();
        const tempRightBoundary: number = this._getContentRightBoundary();
        if (tempLeftBoundary + addition.x - this._pullHeader > this._leftBoundary) {
            outOfBoundaryAmount.x = this._leftBoundary - (tempLeftBoundary + addition.x - this._pullHeader);
        } else if (tempRightBoundary + addition.x + this._pullFooter < this._rightBoundary) {
            outOfBoundaryAmount.x = this._rightBoundary - (tempRightBoundary + addition.x + this._pullFooter);
        }

        const tempTopBoundary: number = this._getContentTopBoundary();
        const tempBottomBoundary: number = this._getContentBottomBoundary();
        if (tempTopBoundary + addition.y + this._pullHeader < this._topBoundary) {
            outOfBoundaryAmount.y = this._topBoundary - (tempTopBoundary + addition.y + this._pullHeader);
        } else if (tempBottomBoundary + addition.y - this._pullFooter > this._bottomBoundary) {
            outOfBoundaryAmount.y = this._bottomBoundary - (tempBottomBoundary + addition.y - this._pullFooter);
        }

        if (addition.equals(Vec3.ZERO, EPSILON)) {
            this._outOfBoundaryAmount = outOfBoundaryAmount;
            this._outOfBoundaryAmountDirty = false;
        }

        this._clampDelta(outOfBoundaryAmount);
        return outOfBoundaryAmount;
    }



    // ====================================================================================================
    // Module: Public Scroll APIs & Position Utilities
    // ====================================================================================================
    // ----------------------------------------
    // Public Scroll APIs
    // ----------------------------------------
    public scrollToIndex(index: number, ani?: boolean, timeInSecond?: number): void {
        if (this._virtual) {
            if (this._numItems == 0)
                return;
            this.checkVirtualList();


            if (isNaN(index) || index < 0) {
                index = 0;
            } else if (index >= this._numItems) {
                index = this._numItems - 1;
            }

            if (this.isAutoScrolling()) {
                this.stopAutoScroll();
            }

            if (this._loop)
                index = Math.floor(this._firstIndex / this._numItems) * this._numItems + index;

            var rect: Vec2;

            if (this._layout == ListLayoutType.Pagination) {
                rect = this.getScrollRectInPage(index);
            } else {
                index = index % this._numItems;
                rect = this.getPosByIndex(index);
            }

            if (ani) {
                if (!this.node.hasEventListener(ScrollView.EventType.SCROLL_ENDED, this.__scrollEnded, this)) {
                    this.node.on(ScrollView.EventType.SCROLL_ENDED, this.__scrollEnded, this);
                }

            }

            this._trackingIndex = index;
            this.panelScrollTo(rect, ani, timeInSecond);

            if (!ani) {
                this._trackingIndex = -1;
            }
        }
        else {
            const obj: Node = this.getChildAt(index);
            let target: Vec2 | null = null;
            if (this._layout == ListLayoutType.Pagination) {
                if (obj) {
                    target = this.getScrollRectInPage(index);
                }
            } else if (obj) {
                target = this.getNodeScrollRect(obj);
            }
            if (target) {
                this.panelScrollTo(target, ani, timeInSecond);
            }

        }
    }

    private getNodeScrollRect(target: Node): Vec2 {
        const uiTrans = target.getComponent(UITransform);
        return new Vec2(
            target.x - uiTrans.width * uiTrans.anchorX,
            -(target.y + uiTrans.height * (1 - uiTrans.anchorY))
        );
    }

    private panelScrollTo(rect: Vec2, ani?: boolean, timeInSecond?: number): void {

        if (ani)
            timeInSecond = timeInSecond || 0.5;
        else
            timeInSecond = 0;

        const { x, y } = this.getScrollOffset();
        s_scrollPos.x = x;
        s_scrollPos.y = y;
        if (this.vertical) {
            s_scrollPos.y = rect.y;
        }

        if (this.horizontal) {
            s_scrollPos.x = rect.x;
        }

        const maxScrollOffset = this.getMaxScrollOffset();
        if (s_scrollPos.x > maxScrollOffset.x) {
            s_scrollPos.x = maxScrollOffset.x;
        } else if (s_scrollPos.x < 0) {
            s_scrollPos.x = 0;
        }

        if (s_scrollPos.y > maxScrollOffset.y) {
            s_scrollPos.y = maxScrollOffset.y;
        } else if (s_scrollPos.y < 0) {
            s_scrollPos.y = 0;
        }

        this.debugLog('--scrollToOffset--', s_scrollPos.x, s_scrollPos.y, this.contentHeight);
        this.scrollToOffset(s_scrollPos, timeInSecond);
        if (!ani && this._virtual) {
            this.handleScroll(true);
        }
    }

    public scrollToTopIndex(ani?: boolean): void {
        this.scrollToIndex(0, ani);
    }

    // ----------------------------------------
    // Linear Axis Scroll Helpers
    // ----------------------------------------
    private getLinearMainAxis(): LinearAxis | null {
        if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
            return 'vertical';
        }
        if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
            return 'horizontal';
        }
        return null;
    }

    private getAxisTargetOffset(axis: LinearAxis, targetMain: number): Vec2 {
        const cur = this.getScrollOffset();
        if (axis == 'vertical') {
            return new Vec2(cur.x, targetMain);
        }
        return new Vec2(targetMain, cur.y);
    }

    private scrollToBottomStable(): void {
        if (!this._virtual || this._numItems <= 0) {
            return;
        }

        this.checkVirtualList();
        const axis = this.getLinearMainAxis();
        if (!axis) {
            return;
        }
        const targetMain = this.getMaxScrollMain(axis);
        this.panelScrollTo(this.getAxisTargetOffset(axis, targetMain), false);
        this.handleScroll(true);
        this.scheduleOnce(() => {
            this.clampScrollOffsetInBounds();
            this.handleScroll(true);
        }, 0);
    }

    public scrollToBottomIndex(ani?: boolean): void {
        const axis = this.getLinearMainAxis();
        if (!axis || this._loop) {
            this.scrollToIndex(this._numItems - 1, ani);
            return;
        }

        if (this._virtual) {
            if (this._numItems == 0) {
                return;
            }
            if (!ani) {
                this.scrollToBottomStable();
                return;
            }
            this.checkVirtualList();
        } else if (this.numChildren == 0) {
            return;
        }

        if (this.isAutoScrolling()) {
            this.stopAutoScroll();
        }

        const preContentPos = this.getContentPosition().clone();
        const targetMain = this.getMaxScrollMain(axis);
        this._trackingIndex = this._virtual ? this._numItems - 1 : Math.max(this.numChildren - 1, 0);
        this.panelScrollTo(this.getAxisTargetOffset(axis, targetMain), ani);
        if (!ani) {
            if (axis == 'vertical') {
                const curPos = this.getContentPosition();
                if (curPos.x != preContentPos.x) {
                    this.setContentPosition(new Vec3(preContentPos.x, curPos.y, curPos.z));
                    this._outOfBoundaryAmountDirty = true;
                }
            }
            this.scheduleOnce(() => {
                this.clampScrollOffsetInBounds();
            }, 0);
            this._trackingIndex = -1;
            if (this._virtual) {
                // Re-run shortly after settle to backfill tail rows near bottom.
                this.scheduleOnce(() => {
                    this.handleScroll(true);
                }, 0.02);
                this.scheduleOnce(() => {
                    this.handleScroll(true);
                }, 0.08);
            }
        }
    }

    private __scrollEnded(): void {
        // 当前位置可能和目标位置有0.几的误差，再调一次
        // 此时self._autoScrolling == false
        this.correctScrollIfNeeded();


        this._trackingIndex = -1;
        this.node.off(ScrollView.EventType.SCROLL_ENDED, this.__scrollEnded, this);
    }

    private correctScrollIfNeeded(): void {
        if (this._trackingIndex != -1) {
            const offset = this.getScrollOffset();
            const vertical: boolean = this.layout == ListLayoutType.SingleColumn || this.layout == ListLayoutType.FlowHorizontal;
            const targetOffset = this._layout == ListLayoutType.Pagination
                ? this.getScrollRectInPage(this._trackingIndex)
                : this.getPosByIndex(this._trackingIndex);
            const curPos = vertical ? offset.y : offset.x;
            const targetPos = vertical ? targetOffset.y : targetOffset.x;


            if (curPos != targetPos) {
                let targetVec = new Vec2();
                if (vertical) {
                    targetVec.y = targetPos;

                } else {
                    targetVec.x = targetPos;
                }

                const maxScrollOffset = this.getMaxScrollOffset();
                if (targetVec.x > maxScrollOffset.x) {
                    targetVec.x = maxScrollOffset.x;
                } else if (targetVec.x < 0) {
                    targetVec.x = 0;
                }

                if (targetVec.y > maxScrollOffset.y) {
                    targetVec.y = maxScrollOffset.y;
                } else if (targetVec.y < 0) {
                    targetVec.y = 0;
                }


                if (this.isAutoScrolling()) {
                    let curPos = this.getContentPosition();
                    let deltaMove = new Vec3(-targetVec.x - curPos.x, targetVec.y - curPos.y);
                    this._startAutoScroll(deltaMove, this._autoScrollTotalTime - this._autoScrollAccumulatedTime, this._autoScrollAttenuate);
                    this.debugLog('--------scrollToIndex---isAutoScrolling-afterPos---', this._autoScrollTargetDelta.x, this._autoScrollTargetDelta.y);
                } else {
                    this.scrollToOffset(targetVec);
                    this.handleScroll(false)
                    this.debugLog('--------scrollToIndex----afterPos---', this.getScrollOffset().x, this.getScrollOffset().y);
                }
            }
        }
    }

    public isBottom(): boolean {
        const axis = this.getLinearMainAxis();
        if (axis) {
            return this.isAtTailByOffset(axis);
        }
        if (this.vertical) return this._getContentBottomBoundary() - this._bottomBoundary >= EPSILON;
        return this._getContentRightBoundary() - this._rightBoundary >= EPSILON;
    }

    public addItems(startIndex: number, addCounts: number, stayPos?: boolean): void {
        if (addCounts <= 0) return;
        const keepBottomAnchor = stayPos ? this.isBottom() : false;
        let originFirstIndex: number = this._firstIndex;
        let originDeltaPos: number = 0;
        if (stayPos) {
            [originFirstIndex, originDeltaPos] = this.getFirstIndexAndPos();
        }

        this.numItems = this._numItems + addCounts;
        if (stayPos) {
            if (keepBottomAnchor) {
                this.scrollToBottomIndex(false);
            } else {
                this.stayOriginPos(startIndex, addCounts, originFirstIndex, originDeltaPos);
            }
        }
    }

    public getFirstIndexAndPos(): number[] {
        let firstIndex: number = this._firstIndex;
        let deltaPos: number = 0;
        if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
            let pos: number = this.getScrollOffset().y;
            this._scanPos = pos;
            firstIndex = this.getIndexOnPos1(false);
            deltaPos = pos - this._scanPos;
        }
        else if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
            let pos: number = -this.getScrollOffset().x;
            this._scanPos = pos;
            firstIndex = this.getIndexOnPos2(false);
            deltaPos = pos - this._scanPos;
        }

        return [firstIndex, deltaPos]


    }

    public stayOriginPos(startIndex: number, addCounts: number, originFirstIndex: number, originDeltaPos: number, keepBottomAnchor: boolean = false): void {
        if (addCounts == 0) return;
        else if (addCounts > 0 && startIndex > originFirstIndex) return;
        else if (addCounts < 0 && startIndex >= originFirstIndex) return;
        this.checkVirtualList();
        const isVerticalLayout = this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal;
        const isHorizontalLayout = this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical;
        const targetIndex = Math.max(0, Math.min(originFirstIndex + addCounts, this._numItems - 1));
        if (!isVerticalLayout && !isHorizontalLayout) {
            this.scrollToIndex(targetIndex);
            return;
        }

        this.scrollToIndex(targetIndex);
        const [, currentDeltaPos] = this.getFirstIndexAndPos();
        const deltaAdjust = originDeltaPos - currentDeltaPos;
        const contentPos = this.getContentPosition().clone();
        if (isVerticalLayout) {
            contentPos.y += deltaAdjust;
            const maxScrollOffset = this.getMaxScrollOffset();
            contentPos.y = Math.min(Math.max(contentPos.y, 0), maxScrollOffset.y);
        } else {
            contentPos.x -= deltaAdjust;
            const maxScrollOffset = this.getMaxScrollOffset();
            contentPos.x = Math.min(Math.max(contentPos.x, -maxScrollOffset.x), 0);
        }

        this.debugLog("-----stayOriginPos---111---", originFirstIndex, originDeltaPos, currentDeltaPos, deltaAdjust, contentPos.x, contentPos.y);
        this.content.setPosition(contentPos);
        this._outOfBoundaryAmountDirty = true;
        if (isVerticalLayout) {
            this._lastIndexPos = this.getScrollOffset().y;
        } else {
            this._lastIndexPos = -this.getScrollOffset().x;
        }

        if (this._virtual) {
            this.handleScroll(true);
        }

        if (keepBottomAnchor) {
            this.scrollToBottomIndex(false);
        }

    }

    // ----------------------------------------
    // Position Utilities
    // ----------------------------------------
    private getPosByIndex(index: number): Vec2 {
        var pos: number = 0;
        var i: number;
        let j: number;
        let ret: Vec2 = new Vec2();
        if (this._layout == ListLayoutType.SingleColumn || this._layout == ListLayoutType.FlowHorizontal) {
            let maxH: number = 0;
            i = 0;
            index = index - index % this._curLineItemCount
            while (i < index) {
                maxH = Math.max(this._virtualItems[i].height, maxH);
                if (i % this._curLineItemCount == this._curLineItemCount - 1 || i == this._numItems - 1) {
                    pos += maxH + this._lineGap;
                    maxH = 0;
                }
                i++;
            }
            ret.y = pos;

        }
        else if (this._layout == ListLayoutType.SingleRow || this._layout == ListLayoutType.FlowVertical) {
            let maxW: number;
            let end: number = index - index % this._curLineItemCount
            for (i = 0; i < end; i += this._curLineItemCount) {
                maxW = this._virtualItems[i].width;
                for (j = i + 1; j < i + this._curLineItemCount && j < end; j++)
                    maxW = Math.max(maxW, this._virtualItems[j].width);
                pos += maxW + this._columnGap;
            }

            ret.x = pos;
        }
        return ret;
    }

    // ====================================================================================================
    // Module: PageView Behaviors
    // ====================================================================================================

    // ----------------------------------------
    // PageView State & Config
    // ----------------------------------------
    private _curPageIdx: number = 0;
    private _pages: number[] = [];
    private _touchBeganPosition: Vec2;
    private _touchEndPosition: Vec2;
    private _scrollCenterOffsetX: number[] = []; // 每一个页面居中时需要的偏移量（X）
    private _scrollCenterOffsetY: number[] = []; // 每一个页面居中时需要的偏移量（Y）
    public pageTurningSpeed = 0.3;
    public autoPageTurningThreshold = 100;
    protected scrollThreshold = 0.5;

    // ----------------------------------------
    // PageView Basic Helpers
    // ----------------------------------------
    private normalizePageIndex(index: number): number {
        if (!Number.isFinite(index)) {
            return 0;
        }
        return Math.round(index);
    }

    @property({
        type: PageViewIndicator, visible: function () {
            return this._layout == ListLayoutType.Pagination;
        }, tooltip: DEV && 'layout.padding_left'
    })
    private _indicator: PageViewIndicator | null = null;



    get indicator(): PageViewIndicator | null {
        return this._indicator;
    }

    set indicator(value) {
        if (this._indicator === value) {
            return;
        }

        this._indicator = value;
        if (this.indicator) {
            this.indicator.setPageView.call(this.indicator, this);
        }
    }

    // ----------------------------------------
    // Page Init & Page Size
    // ----------------------------------------

    private initPageView(): void {
        this.inertia = false;
        this._touchBeganPosition = new Vec2();
        this._touchEndPosition = new Vec2();
    }

    private initPageSize(len: number): number[] {
        let cw: number, ch: number;
        var pageCount: number = Math.ceil(len / (this._curLineItemCount * this._curLineItemCount2));
        let curLineItemCount: number;
        if (this.horizontal == true) {
            curLineItemCount = this._pageType == PageType.PageFlowHorizontal ? this._curLineItemCount : this._curLineItemCount2;
            cw = Math.max(pageCount * (curLineItemCount * (this._columnGap + this._itemSize.width)) - this._columnGap, pageCount * this.viewWidth);
            ch = this.viewHeight;
            if (this._loop) {
                cw = cw * (this._loopNums) + this._columnGap * (this._loopNums - 1);
            }
        } else {
            curLineItemCount = this._pageType == PageType.PageFlowHorizontal ? this._curLineItemCount2 : this._curLineItemCount;
            cw = this.viewWidth;
            ch = Math.max(pageCount * (curLineItemCount * (this._lineGap + this._itemSize.height)) - this._lineGap, pageCount * this.viewHeight);
            if (this._loop) {
                ch = ch * (this._loopNums) + this._lineGap * (this._loopNums - 1);
            }
        }
        let nums = this._loop ? pageCount * this._loopNums : pageCount;
        this._pages = new Array(nums).fill(0);
        if (this.indicator) {
            this.indicator.setPageView.call(this.indicator, this);
        }
        return [cw, ch];
    }

    private getScrollRectInPage(index: number): Vec2 {
        var [page] = this.getPageByIndex(index);

        const offsetVal = this._moveOffsetValue(page);

        this._curPageIdx = page;
        if (this.indicator) {
            this.indicator._changedState();
        }
        return new Vec2(offsetVal.x, offsetVal.y);
    }

    // ----------------------------------------
    // Touch Flow Overrides (Pagination)
    // ----------------------------------------

    protected _onTouchBegan(event: EventTouch, captureListeners: Node[]): void {
        // User starts manual drag, stop index tracking to avoid snapping back.
        this._trackingIndex = -1;
        if (this._layout == ListLayoutType.Pagination) {
            event.touch!.getLocation(_tempVec2);
            Vec2.set(this._touchBeganPosition, _tempVec2.x, _tempVec2.y);
        }

        super._onTouchBegan(event, captureListeners);

    }

    protected _onTouchEnded(event: EventTouch, captureListeners: Node[]): void {
        if (this._layout == ListLayoutType.Pagination) {
            event.touch!.getLocation(_tempVec2);
            Vec2.set(this._touchEndPosition, _tempVec2.x, _tempVec2.y);
        }

        this._onTouchEndedInScrollview(event, captureListeners);
        // super._onTouchEnded(event, captureListeners);

    }

    protected _onTouchCancelled(event: EventTouch, captureListeners: Node[]): void {
        if (this._layout == ListLayoutType.Pagination) {
            event.touch!.getLocation(_tempVec2);
            Vec2.set(this._touchEndPosition, _tempVec2.x, _tempVec2.y);
        }

        super._onTouchCancelled(event, captureListeners);
        this.settleVirtualBoundaryAfterRelease();
    }


    protected _handleReleaseLogic(touch: Touch): void {
        if (this._layout == ListLayoutType.Pagination) {
            this.debugLog("----_autoScrollToPage--_handleReleaseLogic----")
            this._autoScrollToPage();
            if (this._scrolling) {
                this._scrolling = false;
                if (!this._autoScrolling) {
                    this._dispatchEvent(PageView.EventType.SCROLL_ENDED);
                }
            }

        } else {
            super._handleReleaseLogic(touch)
        }


    }

    // ----------------------------------------
    // Inertia / Auto Page Turn
    // ----------------------------------------
    protected _processInertiaScroll(): void {
        if (this._pullRefresh > 0) {
            const outOfBoundary = this._getHowMuchOutOfBoundary();
            let toLoadingOrIdle: number = 0;
            if (this._pullRefresh == 2) {
                if (this.vertical) {
                    toLoadingOrIdle = outOfBoundary.y <= -this.pullRefreshThreshold ? 1 : 2;
                }

                if (this.horizontal) {
                    toLoadingOrIdle = outOfBoundary.x >= this.pullRefreshThreshold ? 1 : 2;
                }


            } else {
                if (this.vertical) {
                    toLoadingOrIdle = outOfBoundary.y >= this.pullRefreshThreshold ? 1 : 2;
                }

                if (this.horizontal) {
                    toLoadingOrIdle = outOfBoundary.x <= -this.pullRefreshThreshold ? 1 : 2;
                }

            }

            if (toLoadingOrIdle == 1) {
                if (this._pullRefreshState == PullEventType.READY) {
                    this._updatePullRefreshState(PullEventType.LOADING)
                }
            } else if (toLoadingOrIdle == 2) {
                if (this._pullRefreshState != PullEventType.LOADING) {
                    this._updatePullRefreshState(PullEventType.IDLE)
                }
            }

        }
        this._outOfBoundaryAmountDirty = true;
        super._processInertiaScroll()
    }

    protected _autoScrollToPage(): void {
        const bounceBackStarted = this._startBounceBackIfNeeded();
        if (bounceBackStarted) {
            const bounceBackAmount = this._getHowMuchOutOfBoundary();
            this._clampDelta(bounceBackAmount);
            if (bounceBackAmount.x > 0 || bounceBackAmount.y < 0) {
                this._curPageIdx = this._pages.length === 0 ? 0 : this._pages.length - 1;
                this.debugLog("-----this._curPageIdx--_autoScrollToPage-111--", this._curPageIdx)
            }
            if (bounceBackAmount.x < 0 || bounceBackAmount.y > 0) {
                this._curPageIdx = 0;
                this.debugLog("-----this._curPageIdx--_autoScrollToPage-222--", this._curPageIdx)
            }

            if (this.indicator) {
                this.indicator._changedState();
            }
        } else {
            const moveOffset = new Vec2();
            Vec2.subtract(moveOffset, this._touchBeganPosition, this._touchEndPosition);
            const index = this.normalizePageIndex(this._curPageIdx);
            let nextIndex = this.normalizePageIndex(index + this._getDragDirection(moveOffset));
            if (this._loop && this._pages.length > 0) {
                if (nextIndex < 0) {
                    nextIndex = this._pages.length - 1;
                } else if (nextIndex >= this._pages.length) {
                    nextIndex = 0;
                }
            }
            this.debugLog("-----this._curPageIdx-_autoScrollToPage-nextIndex--", nextIndex)
            const timeInSecond = this.pageTurningSpeed * Math.abs(index - nextIndex);
            if (nextIndex >= 0 && nextIndex < this._pages.length) {
                if (this._isScrollable(moveOffset, index, nextIndex)) {
                    this.scrollToPage(nextIndex, timeInSecond);
                    return;
                } else {
                    const touchMoveVelocity = this._calculateTouchMoveVelocity();
                    if (this._isQuicklyScrollable(touchMoveVelocity)) {
                        this.scrollToPage(nextIndex, timeInSecond);
                        return;
                    } else {
                        this.debugLog("---_autoScrollToPage----else---");
                    }
                }
            }
            this.scrollToPage(index, timeInSecond);
        }
    }

    // ----------------------------------------
    // Page Turn Decision Helpers
    // ----------------------------------------
    protected _getDragDirection(moveOffset: Vec2): number {
        if (this.horizontal === true) {
            if (moveOffset.x === 0) {
                return 0;
            }

            return (moveOffset.x > 0 ? 1 : -1);
        } else {
            // 由于滚动 Y 轴的原点在在右上角所以应该是小于 0
            if (moveOffset.y === 0) {
                return 0;
            }

            return (moveOffset.y < 0 ? 1 : -1);
        }
    }

    // 是否超过自动滚动临界值
    protected _isScrollable(offset: Vec2, index: number, nextIndex: number): boolean {
        const viewTrans = this.view;
        if (!viewTrans) {
            return false;
        }
        if (this.horizontal === true) {
            return Math.abs(offset.x) >= viewTrans.width * this.scrollThreshold;
        } else if (this.vertical === true) {
            return Math.abs(offset.y) >= viewTrans.height * this.scrollThreshold;
        }
        return false;
    }

    /**
     * @en
     * Scroll PageView to index.
     *
     * @zh
     * 滚动到指定页面
     *
     * @param idx @en The index of page to be scroll to. @zh 希望滚动到的页面下标。
     * @param timeInSecond @en How long time to scroll to the page, in seconds. @zh 滚动到指定页面所需时间，单位：秒。
     */
    public scrollToPage(idx: number, timeInSecond = 0.3): void {
        idx = this.normalizePageIndex(idx);
        if (idx < 0 || idx >= this._pages.length) {
            return;
        }

        this._curPageIdx = idx;
        this.debugLog("-----this._curPageIdx--scrollToPage---", this._curPageIdx)
        this.scrollToOffset(this._moveOffsetValue(idx), timeInSecond, true);
        if (this.indicator) {
            this.indicator._changedState();
        }
    }

    // 快速滑动
    protected _isQuicklyScrollable(touchMoveVelocity: Vec3): boolean {
        if (this.horizontal === true) {
            if (Math.abs(touchMoveVelocity.x) > this.autoPageTurningThreshold) {
                return true;
            }
        } else if (this.vertical === true) {
            if (Math.abs(touchMoveVelocity.y) > this.autoPageTurningThreshold) {
                return true;
            }
        }
        return false;
    }

    // 通过 idx 获取偏移值数值
    protected _moveOffsetValue(idx: number): Vec2 {
        const offset = new Vec2();
        const scrollHorizontal: boolean = this.horizontal == true;
        if (scrollHorizontal) {
            let pageWidth = this.getPageViewWidth();
            offset.x = idx * pageWidth;
        } else if (this.vertical === true) {
            let pageHeight = this.getPageViewHeight();
            offset.y = idx * pageHeight;
        }
        this.debugLog("-----_moveOffsetValue-------", idx, offset.x, offset.y)
        return offset;
    }

    // ----------------------------------------
    // Page Coordinate & Mapping Utilities
    // ----------------------------------------
    getPosByIndexInPage(index: number, page: number = -1, startIndex: number = -1, itemSize?: Size, pageWidth: number = -1, pageHeight: number = -1): number[] {
        const scrollHorizontal: boolean = this.horizontal == true;
        const flowHorizontal: boolean = this._pageType == PageType.PageFlowHorizontal;

        if (page == -1 || startIndex == -1) {
            [page, startIndex] = this.getPageByIndex(index)
        }

        let x: number, y: number;

        let cols: number = flowHorizontal ? this._curLineItemCount : this._curLineItemCount2;
        let rows: number = flowHorizontal ? this._curLineItemCount2 : this._curLineItemCount;

        if (!itemSize) itemSize = this._defaultItem.getComponent(UITransform).contentSize;
        let idx = index - startIndex

        let c, r;

        if (flowHorizontal) {
            c = idx % cols
            r = Math.floor(idx / cols);
        } else {
            c = Math.floor(idx / rows);
            r = idx % rows

        }


        if (scrollHorizontal) {
            if (pageWidth == -1) pageWidth = this.getPageViewWidth();

            x = page * pageWidth + c * (itemSize.width + this.columnGap);
            y = r * (itemSize.height + this.lineGap);

        } else {
            if (pageHeight == -1) pageHeight = this.getPageViewHeight();

            x = c * (itemSize.width + this.columnGap);
            y = page * pageHeight + r * (itemSize.height + this.lineGap);
        }




        return [x, y];
    }

    getPageByPos(pos: number): number[] {
        const scrollHorizontal: boolean = this.horizontal == true;
        let pageSize: number = this._curLineItemCount * this._curLineItemCount2;
        let page: number, startIndex: number;
        if (scrollHorizontal) {
            let viewWidth: number = this.getPageViewWidth();
            page = Math.floor(pos / viewWidth);
            startIndex = page * pageSize;
            if (this._loop) {
                let singleWith = (this.contentWidth + this._columnGap) / this._loopNums;
                if (pos >= singleWith) {
                    let multiples = Math.floor(pos / singleWith);
                    pos = pos - multiples * singleWith;
                    page = Math.floor(pos / viewWidth);
                    startIndex = page * pageSize + (this._numItems * multiples);
                    page += Math.ceil(singleWith / viewWidth) * multiples;
                }
            }

        } else {
            let viewHeight: number = this.getPageViewHeight();
            page = Math.floor(pos / viewHeight);
            startIndex = page * pageSize;

            if (this._loop) {
                let singleHeight = (this.contentHeight + this._lineGap) / this._loopNums;
                if (pos >= singleHeight) {
                    let multiples = Math.floor(pos / singleHeight);
                    pos = pos - multiples * singleHeight;
                    page = Math.floor(pos / viewHeight);
                    startIndex = page * pageSize + (this._numItems * multiples);
                    page += Math.ceil(singleHeight / viewHeight) * multiples;
                }
            }

        }
        return [page, startIndex]
    }


    getPageByIndex(index: number): number[] {
        let pageSize: number = this._curLineItemCount * this._curLineItemCount2;
        let page: number, startIndex: number;

        if (this._loop) {
            const multiples = Math.floor(index / this._numItems);
            index = index - multiples * this._numItems;
            page = Math.floor(index / pageSize);
            startIndex = page * pageSize;
            page += Math.ceil(this._numItems / pageSize) * multiples;
            startIndex += this._numItems * multiples

        } else {
            page = Math.floor(index / pageSize);
            startIndex = page * pageSize;
        }

        return [page, startIndex]
    }

    getPageViewWidth(): number {
        let itemSize = this._defaultItem.getComponent(UITransform).contentSize;
        const flowHorizontal: boolean = this._pageType == PageType.PageFlowHorizontal;
        let cols: number = flowHorizontal ? this._curLineItemCount : this._curLineItemCount2;
        let viewWidth: number = Math.max(cols * (this._columnGap + itemSize.width), this.viewWidth);
        return viewWidth;
    }

    getPageViewHeight(): number {
        let itemSize = this._defaultItem.getComponent(UITransform).contentSize;
        const flowHorizontal: boolean = this._pageType == PageType.PageFlowHorizontal;
        let rows = flowHorizontal ? this._curLineItemCount2 : this._curLineItemCount;
        let viewHeight: number = Math.max(rows * (this._lineGap + itemSize.height), this.viewHeight);
        return viewHeight;
    }

    getItemSize(): number {
        const scrollHorizontal: boolean = this.horizontal == true;
        if (scrollHorizontal) {
            return this._itemSize.width + this._columnGap;
        } else {
            return this._itemSize.height + this._lineGap;
        }

    }


    private checkOutView(val1: number, edge1: number, val2: number, edge2: number): boolean {
        if (val2 + edge2 < val1 || val2 > val1 + edge1) return true;
        return false;
    }



    get curPageIdx(): number {
        if (this._loop) {
            return this.normalizePageIndex(this._curPageIdx % (this._pages.length / this._loopNums))
        }
        return this.normalizePageIndex(this._curPageIdx);
    }

    public getPages(): number[] {
        if (this._loop) {
            return this._pages.slice(0, this._pages.length / this._loopNums);
        }
        return this._pages;
    }

    // ----------------------------------------
    // Pull Refresh Integration Hooks
    // ----------------------------------------
    protected _updatePullRefreshState(event: PullEventType): void {
        if (this._pullRefreshState == event) {
            return;
        }

        switch (event) {
            case PullEventType.PULLING:
                // if (this._pullRefreshState == PullEventType.READY) {
                //     if (this._pullRefresh == 1) {
                //         this._pullHeader = 0;
                //     } else {
                //         this._pullFooter = 0;
                //     }
                // }

                break;
            case PullEventType.LOADING:
                // if (this._pullRefreshState == PullEventType.PULLING) {
                if (this._pullRefresh == 1) {
                    this._pullHeader = this.pullRefreshThreshold;
                } else {
                    this._pullFooter = this.pullRefreshThreshold;
                }
                // }


                break;

            default:
                break;
        }
        this.debugLog("----_updatePullRefreshState----", event)
        this._pullRefreshState = event;
        this.node.emit(event, event);
    }

    public setPullRefreshComplete(len: number): void {
        this._pullHeader = 0;
        this._pullFooter = 0;
        this._updatePullRefreshState(PullEventType.IDLE);

        let preWidth = this._pullRealWidth;
        let preHeight = this._pullRealHeight;

        this.numItems = len;
        let updatePos: boolean = false;

        if (this._pullRefresh == 1) {
            let pos = this.getScrollOffset().clone();
            if (this.horizontal) {
                if (this.contentWidth > preWidth) {
                    pos.x = this.contentWidth - (preWidth + this.pullRefreshThreshold);
                } else {
                    pos.x = 0;
                }
                updatePos = true;
            }

            if (this.vertical) {
                if (this.contentHeight > preHeight) {
                    pos.y = this.contentHeight - (preHeight + this.pullRefreshThreshold);
                } else {
                    pos.y = 0;
                }
                updatePos = true;

            }

            if (updatePos) {

                // console.log("----setPullRefreshComplete--_updatePullRefreshState--", pos.x, pos.y)

                this.scrollToOffset(pos)
                // const bounceBackTime = Math.max(this.bounceDuration, 0);
                // this.scrollToBottom(bounceBackTime, true)
            }
        } else {
            if (this.horizontal && this.contentWidth <= this.viewWidth) {
                updatePos = true;
            }

            if (this.vertical && this.contentHeight <= this.viewHeight) {
                updatePos = true;
            }

            if (updatePos) {
                const bounceBackTime = Math.max(this.bounceDuration, 0);
                this.scrollToBottom(bounceBackTime, true)
            }
        }


        // let pos = this.getScrollOffset().clone();
        // console.log("----setPullRefreshComplete--_updatePullRefreshState--", pos.x, pos.y)
        // const bounceBackTime = Math.max(this.bounceDuration, 0);
        // this.scrollTo(pos, bounceBackTime, true)
    }
    // ====================================================================================================
    // Module: Pull Refresh State
    // ====================================================================================================
}

interface ItemInfo {
    width: number;
    height: number;
    obj?: Node;
    updateFlag: number;
    selected?: boolean;
    pos?: number[];
}

export interface ViewAnchorInfo {
    index: number;
    offset: number;
}

var s_scrollPos: Vec2 = new Vec2();
const _tempVec2 = new Vec2();
const _tempVec2_1 = new Vec2();
const EPSILON = 1e-4;

