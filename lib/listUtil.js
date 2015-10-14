define([
    'table-to-json'
], function (undefined) {
    return function (app) {

        app.listUtil = app.listUtil || {};

        app.listUtil.SELECTED_CLASS = 'selected';

        // 启用列表选择(简单方式)
        app.listUtil.enableSelectable = function (context, selector, eventName) {
            var $el = context.$el.find(selector);
            var selectedCls = app.listUtil.SELECTED_CLASS;
            eventName || (eventName = 'selected.list');
            $el.on('click', 'tbody tr', function (e) {
                var $tr = $(e.target).closest('tr');
                if ($tr.hasClass(selectedCls)) return;
                $tr.parent().find('.' + selectedCls).removeClass(selectedCls);
                $tr.addClass(selectedCls);
                context.trigger(eventName, $tr.data());
            })
        }

        // 启用列表选择(使用kendoui)
        app.listUtil.enableSelectable = function (context, selector, eventName) {
            var $el = context.$el.find(selector);
            new kendo.ui.Selectable($el, {
                aria: true,
                multiple: true,
                filter: ">*",
                change: function () {
                    context.trigger(eventName || (eventName = 'selected.list'));
                }
            });
        }

        // 获取 KendoUI Selectable 表格中的选中项，返回 jQuery 对象
        app.listUtil.getSelected = function ($list) {
            var $s = $list.find('tbody tr.k-state-selected');
            if ($s.length === 0) {
                return null;
            } else {
                return $s;
            }
        };

        // 获取选中的项（支持 kendoui 的 listview 和 grid）
        app.listUtil.getSelectedItem = function (list, toJSON) {
            if (toJSON == null) toJSON = false;
            var source = list.dataSource;
            var items = _.map(list.select(), function (el) {
                // grid 有 dataItem 方法
                if (list.dataItem) {
                    return list.dataItem($(el));
                } else {
                    var uid = $(el).data().uid;
                    if (source.getByUid) {
                        return source.getByUid(uid);
                    } else {
                        return _.find(source, function (item) {
                            return item.uid === uid;
                        });
                    }
                }
            });
            if (toJSON) {
                items = _.invoke(items, 'toJSON');
            }
            return items.length === 0 ? null : (items.length === 1 ? items[0] : items);
        };

        // 获取选中项的 id
        app.listUtil.getSelectedId = function (list) {
            var dataItem = app.listUtil.getSelectedItem(list);
            if (_.isArray(dataItem)) {
                return _.map(dataItem, function (item) {
                    return item.id;
                })
            }
            return dataItem === null ? dataItem : dataItem.id;
        };

        // 确定已选择
        app.listUtil.confirmSelected = function ($list, callback) {
            var item = app.listUtil.getSelected($list);
            if (item == null) {
                app.notify.warn('请选择一条数据！');
                // alert('请选择一条数据！');
            } else {
                callback.call(this, item);
            }
        }

        // 将列表数据转换成json对象
        app.listUtil.toJSON = function ($list) {
            if ($list.is('table')) {
                var options = $list.data();
                return $list.tableToJSON(options);
            } else {
                return $.map($list.children(), function (item) {
                    return $(item).data();
                });
            }
        }

        // 检查列表是否为空，为空则添加一个列表提示信息
        app.listUtil.checkNoData = function ($list) {
            var isTable = $list.is('table');
            if (isTable) {
                var colspan = $list.find('thead>tr').children().length;
                var datLen = $list.find('tbody').children().length;

                if (datLen > 0) {
                    $list.find('.nodata').remove();
                } else {
                    $list.find('tbody').append('<tr><td class="nodata" colspan=' + colspan + '>没有任何数据！</td></tr>');
                }
            } else {
                var datLen = $list.children().length;
                if (datLen > 0) {
                    $list.find('.nodata').remove();
                } else {
                    $list.append('<div class="nodata">没有任何数据！</div>');
                }
            }
        }



        function mergeCell($originTd, $td, idx, rowspan) {
            var nextTd = $td.parent().next().find('td.merge-cell')[idx];

            if (nextTd) {
                var $nextTd = $(nextTd);
                if ($nextTd.is(':visible') && $nextTd.text() === $td.text()) {
                    ++rowspan;
                    $nextTd.hide();

                    $originTd.attr('rowspan', rowspan);

                    mergeCell($originTd, $nextTd, idx, rowspan);
                }
            }
        };

        app.listUtil.mergeCells = function ($table) {
            var $tbody = $table.find('tbody');
            var $trs = $tbody.find('tr.k-master-row');

            $.each($trs, function (i, tr) {
                var $tr = $(tr);
                $.each($tr.find('td.merge-cell'), function (j, td) {
                    mergeCell($(td), $(td), j, 1);
                });
            });
        }
    };
});
