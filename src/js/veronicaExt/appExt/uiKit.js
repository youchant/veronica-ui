define([
    '../../keboacy/index',
    'bootstrap-datetimepicker-cn'
], function (keboacy) {

    return function (app) {

        var $ = app.core.$;

        $.extend(app, keboacy);

        app.uiKit.add('keboacy', {
            init: function (view, $el) {
                // 日期
                view.$('input.date').datetimepicker({
                    format: 'yyyy/mm/dd',
                    todayBtn: 'linked',
                    startView: 'month',
                    language: 'zh-CN',
                    minView: 2,
                    autoclose: true
                });
            },
            destroy: function (view) {
                // 销毁该组件下的kendo控件
                if (window.kendo) {
                    _.each(view.$('[data-role]'), function (el) {
                        var inst = kendo.widgetInstance($(el));
                        inst && inst.destroy();
                    });
                }
            },
            getInstance: function (view, $el) {
                return kendo.widgetInstance($el);
            }
        });
    };
});
