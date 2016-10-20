(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui', 'jsplumb'], factory);
    } else {
        factory(jQuery, kendo, jsPlumb);
    }
}(function ($, kendo, jsPlumb) {

    var ui = kendo.ui;
    var Widget = ui.Widget;
    var DataBoundWidget = ui.DataBoundWidget;
    var CHANGE = 'change';

    var Flow = kendo.ui.DataBoundWidget.extend({
        options: {
            name: 'Flow',
            nodeTemplate: '<div class="#: cls #" id="#: domId #" ' +
            'data-id="#: id #" data-uid="#: uid #" style="top: #: top #px; left: #: left #px;"> ' +
            '<span class="wf-handle"> <i></i> #: index # </span>' +
            '<span class="wf-node_text"> #: text # </span>' +
            ' </div>',
            contextMenu: false,  // 指定一个选择器
            editable: false,
            draggable: false,
            selectable: false,
            onNodeClick: function () {
            },
            onConnection: function (info, wf) {
                // 设置 connection 状态
                var conn = info.connection;
                var $target = $(info.target);
                var data = wf.findNodeData(wf._getNodeId($target));
                if (data) {
                    if (data.state === 'done' || data.state === 'progress') {
                        conn.toggleType("done");
                    }
                    if (data.state === 'pending') {
                        conn.toggleType("pending");
                    }
                }
            },
            beginNodeId: '0',
            endNodeId: '-1',
            nodeIdPrefix: 'wf_node_',
            nodeOptions: {
                cls: "wf-node",
                prefix: 'wf_node_',
                startCls: 'wf-node wf-node-start',
                endCls: 'wf-node wf-node-end',
                activeCls: "wf-node-active",
                draggable: true,
                isSource: true,
                isTarget: true,
                detach: true,
                sourceOptions: {filter: ".wf-handle, .wf-handle i"},
                targetOptions: {dropOptions: {hoverClass: "wf-node-hover"}}
            },
            instanceOptions: {
                Endpoint: "Blank",
                Connector: ["Flowchart", {gap: 2}],
                ConnectionOverlays: [
                    ["Arrow", {
                        location: 1,
                        id: "arrow",
                        length: 14,
                        foldback: 0.6
                    }]
                ],
                ConnectionsDetachable: false,
                ReattachConnections: false,

                // LogEnabled: true, // 调试模式
                // 锚点自动调整位置
                Anchor: "Continuous",
                // Anchor: [[0, 0.5, 1, 0], [1, 0.5, 1, 0]],
                // 连接器样式
                PaintStyle: {
                    strokeStyle: "#ddd",
                    lineWidth: 3,
                    dashstyle: "0",
                    outlineWidth: 4,
                    outlineColor: "transparent"
                }
            }
        },
        init: function (element, options) {
            DataBoundWidget.fn.init.call(this, element, options);

            if (this.options.editable === false) {
                this.options.nodeOptions.isSource = false;
                this.options.nodeOptions.isTarget = false;
                this.options.nodeOptions.detach = false;
            }
            if (this.options.draggable !== this.options.nodeOptions.draggable) {
                this.options.nodeOptions.draggable = this.options.draggable;
            }

            // init properties
            // 数据缓存
            this._value = {
                nodes: [],
                connections: [],
                types: []
            };
            this._lockUI = false;

            this._template();
            this._bindEvents();

            this._initElements();
            this._bindDOMEvents();

            this._initToolbox();

            this._initInstance();
            this._bindInstanceEvents();

            this._initContextMenu();

        },
        _template: function () {
            this._nodeTemplate = kendo.template(this.options.nodeTemplate);
        },
        _initElements: function () {
            var me = this;
            this.element.addClass('k-wf');
            this.$toolbox = $('<div class="wf-toolbox"></div>').appendTo(this.element);
            this.$container = $('<div class="wf-container"></div>').appendTo(this.element);
            if (this.options.editable) {
                this.element.addClass('editable');
            }

            // this.selectable = new kendo.ui.Selectable(this.$container, {
            //     aria: true,
            //     multiple: true,
            //     filter: '>*:not(.k-loading-mask)',
            //     change: function() {
            //         me.trigger('select');
            //     }
            // });
        },
        _initToolbox: function () {
            var me = this;
            if (this.options.editable === false) {
                return;
            }
            this.$toolbox.kendoListView({
                template: '<div class="wf-node_type wf-node" data-type="#: type #">#: text #</div>',
                autoBind: false
            }).kendoDraggable({
                filter: ".wf-node_type",
                hint: function (element) {
                    return element.clone().css({
                        "opacity": 0.6,
                        "background-color": "#0cf"
                    });
                }
            });

            //create dropTarget
            this.$container.kendoDropTarget({
                // dragenter: addStyling, //add visual indication
                // dragleave: resetStyling, //remove the visual indication
                drop: function (e) {
                    var $target = $(e.target);
                    var myOffset = $target.offset();
                    var parentOffset = me.$container.offset();
                    var left = myOffset.left - parentOffset.left;
                    var top = myOffset.top - parentOffset.top;
                    var type = $target.data('type');
                    var data = me.findTypeData(type);
                    me.addNodeData($.extend({}, data, {
                        id: Date.now().toString(),
                        index: me._getMaxIndex() + 1,
                        top: top,
                        left: left
                    }));
                }
            });

        },
        _setToolboxData: function (data) {
            var listview = kendo.widgetInstance(this.$toolbox);
            if (listview != null) {
                listview.setDataSource(data);
                listview.dataSource.fetch();
            }
        },
        _initInstance: function () {
            var instanceOptions = this.options.instanceOptions;

            if (this.options.nodeOptions.detach) {
                instanceOptions.HoverPaintStyle = {
                    strokeStyle: "#B2C0D1",
                    lineWidth: 3,
                    dashstyle: "4 1"
                }
            }

            this.instance = jsPlumb.getInstance(instanceOptions);

            this._registerConnectionType();

            return this.instance;
        },
        _registerConnectionType: function () {
            var instance = this.instance;

            // 注册 type
            var doneType = {
                paintStyle: {
                    strokeStyle: "#ee8c0c"
                }
            };
            var pendingType = {
                paintStyle: {
                    strokeStyle: "#efefef"
                }
            };
            instance.registerConnectionType("done", doneType);
            instance.registerConnectionType("pending", pendingType);
        },
        // 判断连接器是否指向了自己
        _isConnectToSelf: function (param) {
            return param.sourceId === param.targetId;
        },
        // 判断连接器是否是直接从开始节点指向结束节点
        _isFromStartToEnd: function (param) {
            return param.sourceId === this._getNodeDomId(this.options.beginNodeId)
                && param.targetId === this._getNodeDomId(this.options.endNodeId);
        },
        // 判断连接步骤是否重复
        _stepIsRepeat: function (param) {
            var instance = this.instance;
            // 获取同一scope下的链接器，判断当前链接是否有重复
            var cnts = instance.getConnections(param.scope);
            if (cnts.length > 0) {
                for (var i = 0, len = cnts.length; i < len; i++) {
                    // 如果有链接器 sourceId 及 targetId 都相等，那大概也许可能就相等了。
                    if (param.sourceId === cnts[i].sourceId && param.targetId === cnts[i].targetId) {
                        return true;
                    }
                }
            }
            return false;
        },
        _bindInstanceEvents: function () {
            var onConnection = this.options.onConnection;
            var me = this;
            var instance = this.instance;


            instance.bind("beforeDrop", function (param) {
                // 禁止非法的连接，仅当手动拖动时才起作用，如果是通过视图模型添加，则需要自己手动去保证添加的数据逻辑正确
                if (me._isConnectToSelf(param)) {
                    return false;
                }
                if (me._stepIsRepeat(param)) {
                    return false;
                }
                if (me._isFromStartToEnd(param)) {
                    return false;
                }

                // TODO: 将数据添加到视图模型中，但不引起UI改变
                me._lockUIExec(function () {
                    me.addConnectionData({
                        source: me._getNodeIdFromDomId(param.sourceId),
                        target: me._getNodeIdFromDomId(param.targetId)
                    });
                });

                return true;
            });

            // 设置连接线的不同状态
            instance.bind("connection", function (info) {
                onConnection.call(this, info, me);
            });

            instance.bind("connectionDetached", function (con) {
                // if (con && con.connection) {
                //     me.removeConnectionDataByDomId(con.sourceId, con.targetId);
                // }
            });

            if (this.options.nodeOptions.detach) {
                // 删除连接线
                instance.bind('click', function (con) {
                    me.removeConnectionDataByDomId(con.sourceId, con.targetId);
                });
            }
        },
        _bindEvents: function () {
            var me = this;


            this.bind('change', function (e) {
                me.refresh();
            })
        },
        _bindModelEvents: function () {
            var value = this.value();
            var me = this;
            value.connections.bind('change', function (e) {
                if (me._lockUI) return;
                if (e.action === 'remove') {
                    _.each(e.items, function (item) {
                        me._removeConnection(item.source, item.target);
                    });
                    return;
                }
                if (e.action === 'add') {
                    _.each(e.items, function (item) {
                        me._addConnection(item);
                    });
                    return;
                }
                if (e.action === 'itemchange') {
                    _.each(e.items, function (item) {
                        me._addConnection(item);
                    });
                    return;
                }
                me.refresh();
            });
            value.nodes.bind('change', function (e) {
                if (me._lockUI) return;
                if (e.action === 'remove') {
                    _.each(e.items, function (item) {
                        var $node = me.$container.find('[data-id="' + item.id + '"]');
                        me._removeNode($node);
                    });
                    return;
                }
                if (e.action === 'add') {
                    _.each(e.items, function (item) {
                        me._addNode(item);
                    });
                    return;
                }

                // TODO: 这里直接更改 node，还需要更新所有相关的 connection
                // if (e.action === 'itemchange') {
                //     _.each(e.items, function (item) {
                //         var $oldNode = me.$container.find('[data-uid="' + item.uid + '"]');
                //         me._updateNode($oldNode, item);
                //     });
                //     return;
                // }

                me.refresh();
            });
        },
        _bindDOMEvents: function () {
            var options = this.options;
            var nodeCls = this.options.nodeOptions.cls;
            var activeCls = this.options.nodeOptions.activeCls;
            var $container = this.$container;
            var normalStepSelector = '.wf-node:not(.wf-node-start,.wf-node-end)';

            var me = this;

            $container.on('click', normalStepSelector, $.proxy(options.onNodeClick, this));

            // 设置点击时选中
            if (options.selectable) {
                $container.on('click', normalStepSelector, function (e) {
                    console.log('click!!');
                    var $node = $(e.currentTarget);
                    var id = $node.attr('data-id');

                    $.each($container.find('.' + nodeCls), function (i, node) {
                        if (me._isStartOrEndNode($(node))) {
                            return;
                        }
                        if ($(node).attr('data-id') === id) {
                            $(node).addClass(activeCls);
                        } else {
                            $(node).removeClass(activeCls);
                        }
                    });

                });
            }
        },
        _initContextMenu: function () {
            var me = this;
            var contextMenu = this.options.contextMenu;
            if (!contextMenu) {
                return;
            }
            this.$container.contextmenu({
                target: contextMenu,
                before: function (e, element, target) {
                    var $node = $(e.target).closest('.wf-node');
                    if ($node.hasClass('wf-node-end') || $node.hasClass('wf-node-start')) {
                        return false;
                    }
                    var menu = this.getMenu();
                    e.preventDefault();
                    if ($node.length > 0) {
                        $node.addClass('contextmenuhost');
                        menu.html($('#tpl-node-menu').html());
                    } else {
                        menu.html($('#tpl-canvas-menu').html());
                    }

                    return true;
                },
                onItem: function (context, e) {
                    var $node = context.find('.contextmenuhost').removeClass('contextmenuhost');
                    var action = $(e.currentTarget).find('[data-action]').attr('data-action');
                    var handlerName = '_' + action + 'Handler';
                    me[handlerName] && me[handlerName](e, $node);
                }
            });
        },
        _isStartOrEndNode: function ($el) {
            var nodeOptions = this.options.nodeOptions;
            return $el.hasClass(nodeOptions.startCls) || $el.hasClass(nodeOptions.endCls);
        },
        _createNodeEl: function (data) {
            return $(this._nodeTemplate(data));
        },
        _getMaxIndex: function () {
            var max = 0;
            var nodes = this._value.nodes;
            $.each(nodes, function (i, item) {
                max = Math.max(max, item.index);
            });

            return max;
        },
        _lockUIExec: function (callback) {
            this._lockUI = true;
            callback.call(this);
            this._lockUI = false;
        },
        _getNodeDomId: function (id) {
            return this.options.nodeIdPrefix + id;
        },
        _preprocessNodeData: function (data) {
            var defaults = this.options.nodeOptions;
            data = $.extend({}, defaults, data);

            data.state || (data.state = 'none');
            data.cls || (data.cls = '');
            data.domId || (data.domId = this._getNodeDomId(data.id));

            if (data.index == null) {
                data.index = this._getMaxIndex() + 1;
            }
            if (data.text == null) {
                data.text = '';
            }

            // 特殊步骤处理, (开始结束)

            if (data.index === 0) {
                data.cls += ' ' + data.startCls;
            }
            if (data.index === -1) {
                data.cls += ' ' + data.endCls;
            }

            // state 4种状态：'pending', 'progress', 'done', 'none'

            if (data.state) {
                data.cls += ' ' + data.state;
            }
            return data;
        },
        _updateNode: function ($node, data) {
            data = this._preprocessNodeData(data);
            var $newNode = this._createNodeEl(data);
            $node.replaceWith($newNode);
            this._attachNodeBehavior($newNode, data);
        },
        _addNode: function (data) {
            data = this._preprocessNodeData(data);

            var $node = this._createNodeEl(data);

            $node.appendTo(this.$container);

            this._attachNodeBehavior($node, data);

            return $node;
        },
        _attachNodeBehavior: function ($node, data) {
            var me = this;
            var instance = this.instance;
            // 初始化拖拽
            if (data.draggable !== false) {
                var drag = instance.draggable($node, {
                    containment: "parent",
                    stop: function (e) {

                        var id = me._getNodeId($(e.el));
                        var data = me.findNodeData(id);
                        me._lockUIExec(function () {
                            data.set('top', e.pos[1]);
                            data.set('left', e.pos[0]);
                        });
                    }
                });
            }
            // 初始化连接源
            if (data.isSource !== false) {
                instance.makeSource($node, data.sourceOptions);
            }

            // 初始化连接目标
            if (data.isTarget !== false) {
                instance.makeTarget($node, data.targetOptions);
            }
        },
        _addConnection: function (data) {
            var instance = this.instance;
            data = $.extend({}, data);
            var oldCon = this.findConnection(data.source, data.target);
            if (oldCon) {
                this.instance.detach(oldCon);
            }
            data.source = this._getNodeDomId(data.source);
            data.target = this._getNodeDomId(data.target);

            data.overlays = [];

            if (data.text) {
                data.overlays.push(["Label", {
                    location: 0.2,
                    id: "label",
                    cssClass: "wf-connection_label",
                    label: data.text
                    // ,
                    // events:{
                    //     tap:function() { alert("hey"); }
                    // }
                }]);
            }
            instance.connect(data);
        },
        _addNodes: function (nodes) {
            var me = this;
            $.each(nodes, function (index, node) {
                me._addNode(node);
            });
        },
        _addConnections: function (connects) {
            var me = this;
            $.each(connects, function (index, item) {
                me._addConnection(item);
            });
        },
        getNodes: function () {
            return this.value().nodes;
        },
        getConnections: function () {
            return this.value().connections;
        },
        // 根据序号找到 node data
        findNodeData: function (id) {
            var nodes = this.getNodes();
            return _.find(nodes, function (node) {
                return node.id === id;
            });
        },
        findConnection: function (sourceId, targetId) {
            var sourceDomId = this._getNodeDomId(sourceId);
            var targetDomId = this._getNodeDomId(targetId);
            var cons = this.instance.getConnections();
            return _.find(cons, function (con) {
                return con.sourceId === sourceDomId && con.targetId === targetDomId;
            });
        },
        findConnectionsData: function (id) {
            var connections = this.getConnections();
            return connections.filter(function (conn) {
                return conn.source === id || conn.target === id;
            });
        },
        findConnectionData: function (sourceId, targetId) {
            var connections = this.getConnections();
            return connections.find(function (conn) {
                return conn.source === sourceId && conn.target === targetId;
            });
        },
        findTypeData: function (type) {
            var list = this.value().types;
            return list.find(function (item) {
                return item.type === type;
            });
        },
        addConnectionData: function (data) {
            this.value().connections.push(data);
        },
        _removeConnection: function (sourceId, targetId) {
            var me = this;
            var con = me.findConnection(sourceId, targetId);
            me.instance.detach(con);
        },
        removeConnectionDataByDomId: function (sourceDomId, targetDomId) {
            var sourceId = this._getNodeIdFromDomId(sourceDomId);
            var targetId = this._getNodeIdFromDomId(targetDomId);
            this.removeConnectionData(sourceId, targetId);
        },
        removeConnectionData: function (sourceId, targetId) {
            var connections = this.getConnections();
            var item = this.findConnectionData(sourceId, targetId);
            if (item.delectable !== false) {
                connections.remove(item);
            }
        },
        removeNodeData: function (id) {
            var value = this.value();
            var nodes = this.getNodes();
            var i = _.findIndex(nodes, function (node) {
                return node.id === id;
            });
            nodes.splice(i, 1);
            value.nodes = nodes;
            this.value(value, true);
        },
        addNodeData: function (data) {
            this.value().nodes.push(data);
        },
        _removeNode: function ($node) {
            // 先删除边，不然边会被自动删除
            var id = this._getNodeId($node);
            var cons = this.getConnections();
            var deleteCons = this.findConnectionsData(id);
            $.each(deleteCons, function (i, con) {
                cons.remove(con);
            });

            // 后删除节点
            $node && this.instance.remove($node);

        },
        _addNodeHandler: function (e) {
            var containerOffset = this.$container.offset();
            var currentOffset = $(e.currentTarget).offset();
            this.addNode({
                top: currentOffset.top - containerOffset.top,
                left: currentOffset.left - containerOffset.left
            });
        },
        _deleteNodeHandler: function (e, $node) {
            if (window.confirm('确认删除该步骤？')) {
                this.removeNode($node);
            }
        },
        value: function (value) {
            var origin = this._value;
            if (value !== undefined && origin !== value) {
                this._value = value;
                this._bindModelEvents();
                this.trigger('change');
            }

            return this._value;
        },
        refresh: function () {
            if (this._lockUI === true) return;
            var me = this;
            var data = this.value();
            if (data == null) return;

            this.empty();

            this._setToolboxData(data.types);
            this.instance.batch(function () {
                me._addNodes(data.nodes);
                me._addConnections(data.connections);
            });
        },
        select: function ($node) {
            if ($node == null) {
                var $active = $(this.element).find('.wf-node-active');
                var id = this._getNodeId($active);
                return this.findNodeData(id);
            } else {
                this.element.find('.wf-node-active').removeClass('wf-node-active');
                $node.addClass('wf-node-active');
            }

        },
        _getNodeId: function ($node) {
            var id = $node.attr('data-id');
            if (id == null) return void 0;
            return id;
        },
        _getNodeIdFromDomId: function (domId) {
            return domId.replace(this.options.nodeIdPrefix, '');
        },
        save: function () {
            var value = this.value();
            // TODO: 将界面上的 top, left 存储到 value 中

            this.value(value, true);
        },
        empty: function () {
            this._lockUIExec(function () {
                this.instance.empty(this.$container);
            });
        },
        destroy: function () {

        }
    });

    kendo.ui.plugin(Flow);


}));
