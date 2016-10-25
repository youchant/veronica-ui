/*! keboacy - v0.1.0 - 2016-10-25 */
(function (f, define) {
    define(['jquery', 'kendo-ui'], f);
})(function ($, kendo) {
    'use strict';
(function(){
    /**
     * kendo ui 普通 date 绑定
     * @example
     *  <span data-bind='date: startDate' data-format='yyyy-MM-dd'></span>
     */
    kendo.data.binders.date = kendo.data.Binder.extend({
        init: function (element, bindings, options) {
            kendo.data.Binder.fn.init.call(this, element, bindings, options);

            this._change = $.proxy(this.change, this);

            $(this.element).on('change', this._change);

        },

        refresh: function () {

            var date = this.bindings.date.get();
            var dateTxt;
            if (!date) {
                dateTxt = "";
            } else {
                if (typeof date === 'string') {
                    date = kendo.parseDate(date);
                }
                var format = $(this.element).data('format') ||
                    kendo._extractFormat('yyyy/MM/dd');
                dateTxt = kendo.toString(date, format);
            }
            if ('value' in this.element) {
                this.element.value = dateTxt;
            } else {
                this.element.innerHTML = dateTxt;
            }
        },
        change: function () {
            var value = this.element.value;
            this.bindings.date.set(value);
        }
    });
})();

(function(){
    var DataSource = kendo.data.DataSource;
    var HierarchicalDataSource = kendo.data.HierarchicalDataSource;
    var extend = $.extend;
    var each = $.each;
    var ajax = $.ajax;
    var ObservableObject = kendo.data.ObservableObject;

    var BackendApiDataSource = HierarchicalDataSource.extend({
        init: function (options) {
            if (options.api != null && !$.isEmptyObject(options.api)) {
                options.transport = extend(true, {}, options.transport, options.api);
            }

            DataSource.fn.init.call(this, extend(true, {}, options));

            this._customMethods();
        },
        options: {
            name: 'ApiDataSource'
        },
        _customMethods: function () {
            var me = this;
            each(this.options.api, function (key, api) {
                me[key + 'Api'] = function (options) {
                    return this._accessApi(key, options);
                }
            });
        },
        submitForm: function (name, $form, options) {
            var dfd = $.Deferred();
            var options = this.transport.setup(options, name);
            $form.ajaxSubmit($.extend({
                success: function (resp) {
                    dfd.resolve(resp);
                },
                error: function (resp) {
                    dfd.reject(resp);
                }
            }, options, {
                method: $form.prop('method') || 'post',
                contentType: $form.prop('enctype') || 'multipart/form-data'
            }));

            return dfd.promise();
        },
        _accessApi: function (name, options) {
            return ajax(this.transport.setup(options, name));
        }
    });

    kendo.data.BackendApiDataObject = ObservableObject.extend({
        init: function (options) {
            options || (options = {});
            options.data || (options.value = {});

            this._initDataSource(options);
            this._initData();
            this._bindEvents();
        },
        _initDataSource: function (options) {
            // 处理 options
            if (options.data != null && !$.isArray(options.data)) {
                options.data = [options.data];
            }

            if (options.schema == null) {
                options.schema = {};
            }

            var convertArray = function (resp, field) {
                var data = resp;
                if (field != null) {
                    data = resp[field];
                }
                if (!$.isArray(data)) {
                    return [data];
                }
                return data;
            };
            if (options.schema.data == null) {
                options.schema.data = convertArray;
            } else {
                if (typeof options.schema.data === 'string') {
                    var field = options.schema.data;
                    options.schema.data = function (resp) {
                        return convertArray.call(this, resp, field);
                    };
                } else {
                    var func = options.schema.data;
                    options.schema.data = function (resp) {
                        var origin = func.call(this, resp);
                        return convertArray.call(this, origin);
                    }
                }
            }

            this._dataSource = new BackendApiDataSource(options);
        },
        _bindEvents: function () {
            var me = this;
            var dataSource = this._dataSource;
            dataSource.bind('change', function (e) {
                if (!e.action) {
                    var data = dataSource.at(0).toJSON();
                    $.each(data, function (field, val) {
                        me.set(field, val);
                    });
                }
            });
        },
        _initData: function () {
            var data = this._dataSource.at(0);
            if (data == null) {
                data = {};
            }
            this.reset(data);
        },
        read: function (options) {
            return this._dataSource.read(options);
        },
        data: function (data) {
            return this._dataSource.data(data);
        },
        reset: function (value) {
            ObservableObject.fn.init.call(this, value);
            this.trigger('reset', {
                value: value
            });
        },
        shouldSerialize: function (field) {
            var rt = ObservableObject.fn.shouldSerialize.call(this, field);
            var noSerialize = ['_dataSource'];
            return rt && noSerialize.indexOf(field) < 0;
        },
        dataSource: function () {
            return this._dataSource;
        },
        _backOptions: function (options) {
            options = $.extend(true, {
                data: this.toJSON()
            }, options);
            return options;
        },
        create: function (options) {
            return this.dataSource().createApi(this._backOptions());
        },
        update: function (options) {
            return this.dataSource().updateApi(this._backOptions());
        },
        remove: function (options) {
            return this.dataSource().removeApi(this._backOptions());
        },

    });

    kendo.data.BackendApiDataSource = BackendApiDataSource;

})();
(function(){
    // widgets checked binder
    var Binder = kendo.data.Binder;
    var binders = kendo.data.binders;
    binders.widget.checkboxlist = {
        value: binders.widget.multiselect.value
    };

    var NS = ".kendoCheckBoxList";

    var CheckBoxList = kendo.ui.DataBoundWidget.extend({
        options: {
            name: "CheckBoxList",
            valuePrimitive: true,
            dataSource: null,
            dataTextField: "text",
            dataValueField: "value",
            dataValueType: "string",
            orientation: "vertical"
        },

        events: [
            "dataBound",
            "select"
        ],
        dataSource: null,

        init: function (element, options) {

            kendo.ui.Widget.fn.init.call(this, element, options);

            this._dataSource();
            this.dataSource.fetch();
            this.element.on("click" + NS, ".k-checkbox-label", { sender: this }, this._onCheckBoxSelected);

            //this.element.css({ "display": "inline-block" });
        },

        destroy: function () {
            $(this.element).off(NS);
            kendo.ui.Widget.fn.destroy.call(this);
        },

        _dataSource: function () {
            var dataSource = this.options.dataSource;
            dataSource = $.isArray(dataSource) ? { data: dataSource } : dataSource;

            if (this.dataSource && this._refreshHandler) {
                this.dataSource.unbind("change", this._refreshHandler);
            } else {
                this._refreshHandler = $.proxy(this.refresh, this);
            }

            this.dataSource = kendo.data.DataSource.create(dataSource).bind("change", this._refreshHandler);
        },

        _template: function () {

            var html = kendo.format(
                "<div class='k-ext-checkbox-item {2}' data-uid='#: uid #' data-value='#: {0} #' data-text='#: {1} #'>" +
                "<input type='checkbox' value='#: {0} #' class='k-checkbox' data-type='{3}' />" +
                "<label class='k-checkbox-label'>#: {1} #</label>" +
                "</div>",
                this.options.dataValueField,
                this.options.dataTextField,
                this.options.orientation === "vertical" ? "checkbox" : "checkbox-inline",
                this.options.dataValueType);

            return kendo.template(html);
        },

        _onCheckBoxSelected: function (e) {

            var $target = $(this),
                $checkBoxItem = $target.closest(".k-ext-checkbox-item"),
                that = e.data.sender,
                isChecked = $checkBoxItem.find(".k-checkbox").is(":checked");

            $target.prev(".k-checkbox").prop("checked", !isChecked).addClass("k-state-selected");

            var selectedUid = $checkBoxItem.attr("data-uid");
            that.trigger("change", { item: that.dataSource.getByUid(selectedUid), checked: !isChecked });
        },

        setDataSource: function (dataSource) {

            this.options.dataSource = dataSource;
            this._dataSource();
            this.dataSource.fetch();
        },

        refresh: function (e) {

            var template = this._template();
            var items = this.dataSource.view();
            var oldValue = this.value();
            this.element.empty();

            for (var idx = 0; idx < items.length; idx++) {
                this.element.append(template(items[idx]));
            }

            this.value(oldValue)
            //this.trigger("dataBound");
        },
        items: function () {
            return this.element.children();
        },
        dataItems: function () {

            var dataSource = this.dataSource,
                list = [],
                $items = this.element.find(".k-checkbox:checked").closest(".k-ext-checkbox-item");

            $.each($items, function () {
                var uid = $(this).attr("data-uid");
                list.push(dataSource.getByUid(uid));
            });

            return list;
        },

        value: function (value) {
            if (value == null) {
                var list = [];
                var $items = this.element.find(".k-checkbox:checked").closest(".k-ext-checkbox-item");

                $.each($items, function () {
                    var value = $(this).attr("data-value");
                    list.push(value);
                });
                return list;
            } else {
                // 更新 DOM
                var that = this,
                    list = $.isArray(value) ? value : (typeof value === "string" ? [value] : []);

                this.element.find(".k-checkbox").prop("checked", false).removeClass("k-state-selected");

                $.each(list, function (i, val) {
                    that.element.find(kendo.format(".k-ext-checkbox-item[data-value='{0}'] .k-checkbox", val)).click();
                });
            }
        }
    });
    kendo.ui.plugin(CheckBoxList);
})();
(function(){
    var ui = kendo.ui,
        Widget = ui.Widget;
    var ListView = kendo.ui.ListView;

    var DataTable = ListView.extend({
        options: {
            name: 'DataTable',
            header: null,
            widths: [],
            cls: 'flexbox',
            tableCls: ''
        },
        init: function (element, options) {
            var that = this;

            // 预设 options

            // 从元素内部获取模板(代码段)
            if (options.header == null) {
                options.header = $(element).find('.tpl-header').html();
            }
            if (options.template == null) {
                options.template = $(element).find('.tpl-row').html();
            }

            ListView.fn.init.call(that, element, options);

            this._bindEvents();
        },
        _bindEvents: function () {
            var el = this.element;
            var me = this;
            el.on('click', '.k-hierarchy-cell', function (e) {
                var $target = $(e.currentTarget);
                var $row = $target.closest('tr');
                me.switchRow($row);
            });
        },
        switchRow: function ($row) {
            var detailRow = $row.next('.k-detail-row');
            var colSpan = $row.children('td').length;
            var collapseCls = 'fn-collapse';
            var expandCls = 'fn-expand';

            if (detailRow.length === 0) {
                detailRow = $('<tr class="k-detail-row"><td colspan="' + colSpan + '"></td></tr>');
                detailRow.insertAfter($row);
                this.trigger('detailInit', {
                    detailCell: detailRow.children('td'),
                    data: $row.data()
                })
            }
            if (!$row.hasClass(expandCls)) {
                $row.next('.k-detail-row').show();
                $row.removeClass(collapseCls).addClass(expandCls);
            } else {
                $row.next('.k-detail-row').hide();
                $row.addClass(collapseCls).removeClass(expandCls);
            }
        },
        _element: function () {
            var me = this;
            ListView.fn._element.call(this);
            this.element.addClass('k-datatable').addClass(this.options.cls);

            if (this.options.header) {
                var element = this.element;

                var tableHtml =
                    '<div class="k-datatable-header k-data-inject">' +
                    '<table class="table no-margin">' +
                    '<colgroup></colgroup>' +
                    '<thead></thead>' +
                    '</table>' +
                    '</div>' +
                    '<div class="k-datatable-content grow k-data-inject">' +
                    '<table class="table no-margin">' +
                    '<colgroup></colgroup>' +
                    '<tbody></tbody>' +
                    '</table>' +
                    '</div>';
                element.find('.k-data-inject').remove();
                element.append(tableHtml);
                element.on('click', '.sortable', function (e) {

                    var $target = $(e.currentTarget);
                    var field = $target.attr('data-prop');
                    var dir = 'asc';
                    if ($target.hasClass('asc')) {
                        dir = 'desc';
                    }
                    me.dataSource.sort({
                        field: field,
                        dir: dir
                    });
                    $target.closest('tr').find('.asc, .desc').removeClass('asc desc');
                    $target.addClass(dir);
                })
                element.find('table').addClass(this.options.tableCls);

                var headerHtml = this.options.header.indexOf('<') > -1 ? this.options.header : $('#' + this.options.header).html();
                element.find('.k-datatable-header thead').html(headerHtml);

                var len = $(headerHtml).children('th').length;
                element.find('.k-datatable-header colgroup').html(this._colgroup(this.options.widths, len));

                element.find('.k-datatable-content colgroup').html(this._colgroup(this.options.widths, len));

                this.element = this.element.find('.k-datatable-content tbody');
            }
        },
        // 计算 colgroup 的值
        _colgroup: function (widths, len) {
            len || (len = widths.length);

            var cols = '';
            for (var i = 0; i < len; i++) {
                var $col = $('<col />');
                var width = widths && widths[i];
                if ((widths == null || widths.length === 0) && width == null) {
                    width = (100 / len) + "%";
                }
                width != null && $col.width(width);
                cols += $col.prop('outerHTML');
            }
            return cols;
        },
        _templates: function () {
            ListView.fn._templates.call(this);

            //  this.groupTemplate = kendo.template(options.groupTemplate || "");
        }
    });

    kendo.ui.plugin(DataTable);
})();

(function(){
    var ui = kendo.ui;
    var Widget = ui.Widget;


    var File = Widget.extend({
        options: {
            name: 'File',
            label: 'Browse'
        },
        init: function (element, options) {
            var me = this;
            Widget.fn.init.call(me, element, options);

            me._wrapper();
            me._bindEvents();
        },
        _wrapper: function(){
            var me = this;
            var element = me.element;
            var elementDom = element[0];
            var wrapper;

            var parent = '<div class="input-group">' +
                '<label class="input-group-btn">' +
                '<span class="btn btn-default fileinput-button">' +
                me.options.label + '&hellip;' +

                '</span>' +
                '</label>' +
                '<input type="text" class="form-control" readonly>' +
                '</div>';

            me.wrapper = $(parent).addClass('k-widget k-file').addClass(elementDom.className);
            element.replaceWith(me.wrapper);
            me.wrapper.find('.btn').append(element);
        },
        _bindEvents: function(){
            var me = this;
            this.element.on('change', function(e){
                var files = $(e.target)[0].files;
                var name = files.length === 0 ? '' : files[0].name;
                me.wrapper.find('input:text').val(name);
            });
        }
    });

    kendo.ui.plugin(File);
})();

(function(){
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

            this.options.nodeIdPrefix = _.uniqueId(this.options.nodeIdPrefix);

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
            var cons = this.value().connections;
            cons.push(data);
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
})();

(function(){
    // modal confirm

    var TPL_CONFIRM = '<div class="modal fade v-modal-confirm" id="v-modal-confirm" tabindex="-1">' +
        '    <div class="modal-dialog modal-sm" role="document">' +
        '        <div class="modal-content v-confirm-content">' +
        '            <div class="modal-body v-confirm-body">' +
        '                <span class="glyphicon glyphicon-question-sign v-confirm-icon"></span>' +
        '                <span class="v-confirm-msg"></span>' +
        '            </div>' +
        '            <div class="modal-footer v-confirm-footer">' +
        '                <button type="button" class="btn btn-default btn-sm" data-dismiss="modal">取 消</button>' +
        '                <button type="button" class="btn btn-primary btn-sm js-ok" data-dismiss="modal">确 认</button>' +
        '            </div>' +
        '        </div>' +
        '    </div>' +
        '</div>';


    var COMFIRM_KEY = '#v-modal-confirm';
    var NS = '.v-modal-confirm';

    $.modalConfirm = function (msg) {
        var deferred = $.Deferred();
        var $m = $(COMFIRM_KEY);
        if ($m.length === 0) {
            $(TPL_CONFIRM).appendTo($('body'));
        }
        $m = $(COMFIRM_KEY);
        var data = $m.data('bs.modal');
        if (data != null) {
            $m.off(NS);
        }
        // bind events
        var rt = false;
        $m.on('click' + NS, '.js-ok', function (e) {
            rt = true;
        })
        $m.on('hidden.bs.modal' + NS, function (e) {
            if (rt === true) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
        })

        if (msg != null) {
            $m.find('.v-confirm-msg').html(msg);
        }

        $m.modal();

        return deferred.promise();
    }

    // popover Confirm

    // $.popoverConfirm =
})();

(function(){
    "use strict";
    var coreUtil = {};

    coreUtil.randomString = function () {
        return Math.random().toString(36).substring(7);
    };

    coreUtil.isFalsy = function (o) {
        return o == null || o == false;
    };

    $.fn.dynamicTab = function () {
        var $parent = this;
        var $dynamicTabs = this.find('.nav[data-dynamic-tab]');
        var $allButtons = $parent.find('[data-tab-toggle]');

        $dynamicTabs.each(function (i, el) {
            var $nav = $(el);
            var group = $nav.attr('data-dynamic-tab');

            var $content = $parent.find('.tab-content[data-dynamic-tab=' + group + ']');
            var $buttons = $allButtons.filter('[data-for=' + group + ']');
            var $tabs = $nav.find('[data-toggle=tab]');
            var $panels = $content.find('.tab-pane');

            $tabs.on('shown.ver.tab', function (e) {
                var idx = $(e.target).closest('.nav-item').index();
                var $prev = $buttons.filter('[data-tab-toggle=prev]');
                var $next = $buttons.filter('[data-tab-toggle=next]');

                $prev.prop('diabled', false);
                $next.prop('diabled', false);
                if (idx === 0) {
                    $prev.prop('disabled', true);
                }
                if (idx === $tabs.length - 1) {
                    $next.prop('disabled', true);
                }
            });

            $tabs.each(function (i, tab) {
                var rstr = coreUtil.randomString();
                var $thePane = $($panels.get(i));
                var $theTab = $(tab);

                $theTab.attr('href', '#' + rstr);
                $thePane.attr('id', rstr);

                // 动态设置 form-invalid-tag

                var $form = $thePane.find('[data-validate-form]');
                var formName = $form.data('validate-form');
                if (coreUtil.isFalsy(formName)) {
                    $form.attr('data-validate-form', rstr);
                }

                var $formtag = $theTab.find('.form-invalid-tag');
                var formForName = $formtag.data('for');
                if (coreUtil.isFalsy(formForName)) {
                    $formtag.attr('data-for', rstr);
                }

            });
        });

        // toggle
        $allButtons.on('click.ver.tab.data-api', function (e) {
            var $target = $(this);
            var direction = $target.data('tab-toggle');
            var tabName = $target.data('for');
            var $tab = $('[data-dynamic-tab="' + tabName + '"]');

            $tab.find('.active')[direction]().find('[data-toggle=tab]').tab('show');
        });
    }
})();



(function(){
    "use strict";

    var pluginName = "submenu";
    var defaults = {};
    var MIN_CLASS = 'menu-vertical-min';

    function Plugin(element, options) {
        this.element = element;
        this.minimized = $(this.element).hasClass(MIN_CLASS);
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        this.toggleIcons = ['fa-angle-double-left', 'fa-angle-double-right'];
        this.submenuCls = '.menu-submenu';
        this.init();
    }

    $.extend(Plugin.prototype, {
        init: function () {
            var $navlist = $(this.element).find('.menu-nav');
            var $toggle = $(this.element).find('.menu-toggle');
            var me = this;

            // 初始化子级指示器
            $.each($navlist.find('li'), function (i, li) {
                var $li = $(li);
                var $submenu = $li.children(me.submenuCls);
                var $ddtoggle = $li.children('.dropdown-toggle');
                if ($submenu.length > 0) {
                    if ($ddtoggle.children('.menu-child_indicator').length === 0) {
                        $ddtoggle.append('<b class="menu-child_indicator fa"></b>');
                    }
                }
            });

            // 点击事件
            $navlist.on('click', 'a', function (e) {
                e.preventDefault();
                var $link = $(e.currentTarget);
                var $li = $link.parent();

                // 无子菜单则直接激活
                if ($li.children('.menu-submenu').length === 0) {
                    me.active($li);
                }

                // 有子菜单则视情况打开子菜单
                if ($link.hasClass('dropdown-toggle')) {
                    if (me.minimized || $li.hasClass('hover')) {
                        return;
                    }
                    me.toggleDisplay($li);
                }

            });

            // 切换显示模式
            $toggle.on('click', function (e) {
                e.preventDefault();
                if (me.minimized) {
                    $(me.element).removeClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[1]).addClass(me.toggleIcons[0]);
                } else {
                    $(me.element).addClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[0]).addClass(me.toggleIcons[1]);
                    // 隐藏所有submenu
                    //$(me.element).find('.submenu').hide();
                }
                me.minimized = !me.minimized;
            });
        },
        toggleDisplay: function ($li) {
            if ($li.hasClass('open')) {
                this._toggleSubmenu($li, 'hide');
            } else {
                this._toggleSubmenu($li, 'show');
                this._toggleSubmenu($li.siblings('.open'), 'hide');
            }
        },
        _toggleSubmenu: function ($item, mode, callback) {
            var me = this;
            var animate = 'slideDown';
            var openHd = 'addClass';
            callback || (callback = function () { });

            if (mode === 'hide') {
                animate = 'slideUp';
                openHd = 'removeClass';
            }

            $item.children(this.submenuCls)[animate]('fast', function () {
                $item[openHd]('open');

                callback();
            });
            return this;
        },
        active: function (selector) {
            $(this.element).find('.active').removeClass('active');
            $(selector).addClass('active')
                .parentsUntil(this.element, 'li').addClass('active');
        }
    });

    $.fn[pluginName] = function (options) {
        return this.each(function () {

            var $this = $(this);
            var data = $this.data('plugin_' + pluginName);

            if (!data) {
                $this.data('plugin_' + pluginName, (data = new Plugin(this, options)))
            }

            if (typeof options == 'string') {
                data[options]();
            }

        });
    };
})();

(function(){
    var ui = kendo.ui;
    var Widget = ui.Widget;
    var DataBoundWidget = ui.DataBoundWidget;
    var CHANGE = 'change';

    var Signature = kendo.ui.DataBoundWidget.extend({
        options: {
            name: 'Signature',
            resetLabel: '重写',
            doneLabel: '完成',
            dataFormat: 'image'
        },
        init: function (element, options) {
            DataBoundWidget.fn.init.call(this, element, options);
            this._element();
            this.instance();
        },
        _element: function () {
            this.element.append('<div class="signature-canvas"></div>' +
                '<div class="btn-toolbar">' +
                '<button class="btn btn-default js-reset">' + this.options.resetLabel +
                '</button><button class="btn btn-primary js-done">' + this.options.doneLabel +
                '</button></div>');

            this.$canvas = this.element.find('.signature-canvas');

            this._bindEvents();
        },
        _bindEvents: function () {
            var me = this;
            this.element.find('.js-reset').on('click', function (e) {
                me.instance('reset');
            });
            this.element.find('.js-done').on('click', function (e) {
                me.trigger('change');
            });
        },
        instance: function () {
            return this.$canvas.jSignature.apply(this.$canvas, arguments);
        },
        value: function (value) {
            if (value === undefined) {
                return this.instance("getData", this.options.dataFormat);
            }

            if (value !== '') {
                if(value.join && value.length){
                    value = "data:" + value.join(",");
                }
                this.instance("setData", value);
            }
        }
    });

    kendo.ui.plugin(Signature);
})();

(function(){
    var ui = kendo.ui;
    var Widget = ui.Widget;
    var ListView = kendo.ui.ListView;
    var FOCUSSELECTOR = " .k-tree-item";
    var CHANGE = 'change';
    var ROOT = 'k-tree-root';
    var SWITCHER = 'k-tree-switcher';
    var SUBTREE = 'k-tree-subtree';

    var Selectable = kendo.ui.Selectable;

    // kendo ui selectable 会进行冒泡，导致行为不符合预期
    var TreeSelectable = Selectable.extend({
        _tap: function (e) {
            //if(e.stopPro)
            e.event.stopPropagation();
            Selectable.fn._tap.call(this, e);
        },
        _start: function (e) {
        },
        _move: function (e) { },
        _end: function (e) { }
    });

    var Tree = ListView.extend({
        options: {
            name: 'Tree',
            focusSelector: '.k-tree-item > .k-tree-inner',
            isSubtree: false,
            dataTextField: 'text'
        },
        init: function (element, options) {
            var that = this;

            // 预设 options

            // 从元素内部获取模板(代码段)
            options.template = options.template || $(element).find('.tpl-template').html()
                || this._defaultTemplate(options);

            var $root = $(element).addClass('k-tree').find('.' + ROOT);
            if ($root.length === 0) {
                $root = $(element);
            }
            ListView.fn.init.call(that, $root, options);
            if (!this.options.isSubtree) {
                this._bindEvents();
            }
        },
        _defaultTemplate: function (options) {

            return '<div class="k-tree-item">' +
                '<div class="k-tree-inner">' +
                '# for(var i = 0, len = level(); i < len; i++){ #' +
                '<span class="k-tree-indent"></span>' +
                '# } #' +
                '# if(hasChildren){ #' +
                '<a class="k-tree-switcher"></a>' +
                '# } else{ #' +
                '<span class="k-tree-switcher-noop"></span>' +
                '# } #' +
                '<span class="k-tree-text">' +
                '#: ' + options.dataTextField + ' #' +
                '</span>' +
                '</div>' +
                '# if(hasChildren){ #' +
                '<div class="k-tree-subtree"></div>' +
                '# } #' +
                '</div>';
        },
        _initRoot: function () {
        },
        _bindEvents: function () {
            var el = this.element;
            var me = this;
            el.on('click', '.' + SWITCHER, function (e) {
                var $target = $(e.target);
                var $item = $(e.target).closest('[data-uid]');
                if ($item.hasClass('open')) {
                    $item.removeClass('open');
                } else {
                    $item.addClass('open');
                    var node = me._getNode($item);
                    me._initSubtree(node, $item.find('.' + SUBTREE));

                }
            });

            this.dataSource.bind('change', function (e, ee) {
                // debugger;
            });
        },
        expand: function () {

        },
        collapse: function () {

        },
        _element: function () {
            ListView.fn._element.call(this);
        },
        _getNode: function ($el) {
            var dataSource = kendo.widgetInstance($el.closest('.k-listview')).dataSource;
            var node = dataSource.getByUid($el.data('uid'));
            return node;
        },
        _selectable: function () {
            var that = this;
            var multi;
            var selectable = that.options.selectable;

            if (selectable) {
                multi = Selectable.parseOptions(selectable).multiple;

                that.selectable = new TreeSelectable(that.element, {
                    aria: true,
                    multiple: multi,
                    filter: this.options.focusSelector,
                    change: function (e) {

                        // return false;
                        that.trigger(CHANGE);
                    }
                });

            }
        },
        _initSubtree: function (node, $el) {
            //var $sub = this.element
            //            .find("[" + kendo.attr("uid") + "=" + node.uid + "]").find('.' + SUBTREE);
            if (!kendo.widgetInstance($el)) {
                var options = $.extend({}, this.options, {
                    dataSource: node.children,
                    autoBind: true,
                    template: this.options.template,
                    selectable: false,
                    isSubtree: true
                });
                $el.kendoTree(options);
            }
        },
        _templates: function (e) {

            ListView.fn._templates.call(this);
        },
        refresh: function (e) {
            if (e.action === "itemloaded") {
                return;
            }

            ListView.fn.refresh.call(this, e);

        },
        select: function (items) {
            return ListView.fn.select.call(this, items);
        }
    });

    kendo.ui.plugin(Tree);
})();
(function(){
    var ui = kendo.ui,
        Widget = ui.Widget;
    var Validator = kendo.ui.Validator;

    function widgetCssFix(elements) {

        function updateCssOnPropertyChange(e) {
            var element = $(e.target || e.srcElement);

            element.siblings(".k-dropdown-wrap")
                .add(element.parent(".k-numeric-wrap, .k-multiselect, .k-picker-wrap, .k-autocomplete, .k-slider-wrap"))
                .toggleClass("k-invalid", element.hasClass("k-invalid"));
        }

        //correct mutation event detection
        var hasMutationEvents = ("MutationEvent" in window),
            MutationObserver = window.WebKitMutationObserver || window.MutationObserver;

        if (MutationObserver) {
            var observer = new MutationObserver(function (mutations) {
                    var idx = 0,
                        mutation,
                        length = mutations.length;

                    for (; idx < length; idx++) {
                        mutation = mutations[idx];
                        if (mutation.attributeName === "class") {
                            updateCssOnPropertyChange(mutation);
                        }
                    }
                }),
                config = { attributes: true, childList: false, characterData: false };

            elements.each(function () {
                observer.observe(this, config);
            });
        } else if (hasMutationEvents) {
            elements.bind("DOMAttrModified", updateCssOnPropertyChange);
        } else {
            elements.each(function () {
                this.attachEvent("onpropertychange", updateCssOnPropertyChange);
            });
        }

    }

    var Validator2 = Validator.extend({
        options: {
            name: 'Validator2',
            errorTemplate: '<div class="k-widget k-tooltip k-tooltip-validation">' +
            '<span class="k-icon k-i-warning"> </span>' +
            '#=message#<div class="k-callout k-callout-n"></div></div>'
        },
        init: function(element, options){
            var inputs = $(element).find("[data-role=autocomplete],[data-role=combobox]," +
                "[data-role=dropdownlist],[data-role=numerictextbox]," +
                "[data-role=datepicker],[data-role=timepicker],[data-role=datetimepicker]," +
                "[data-role=multiselect], [data-role=slider]");

            widgetCssFix(inputs);

            Validator.fn.init.call(this, element, options);
        }
    });

    kendo.ui.plugin(Validator2);

})();

}, typeof define == 'function' && define.amd ? define : function (_, f) { f(jQuery, window.kendo); });