define([
    '../../keboacy/index'
], function (keboacy) {

    return function (app) {

        var $ = app.core.$;

        $.extend(app, keboacy);

        // kendo widget: widget



        app.uiKit.add('keboacy', {
            init: function (view, $el) {
                // kendo.init($el);
                // kendo.init($el, kendo.mobile.ui);
                view.$el.dynamicTab();
                view.$el.find('[data-ajax-form]').each(function (i, form) {
                    var options = $(form).data();
                    $(form).ajaxForm(options);
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
