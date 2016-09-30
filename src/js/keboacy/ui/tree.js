(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {

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


}));
