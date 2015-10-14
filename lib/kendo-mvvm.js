define([
    'kendo-ui'
], function () {

    return function (app) {
        var _ = app.core._;
        var $ = app.core.$;
        var kendo = app.core.kendo || window.kendo;

        app.view.base._bind = function () {
            var me = this;
            // 重绑定视图模型
            kendo.unbind(this.$el);
            // 这里使用 data-role 的绑定，避免重复绑定

            kendo.bind(this.$el, me.viewModel);
            //$.each(this.$el.find('[data-role]'), function (i, el) {
            //    if ($(el).closest('.k-bind-block').length === 0) {
            //        kendo.bind($(el).parent(), me.viewModel);
            //    }
            //});
        }

        app.view.base.instance = function (el) {
            return kendo.widgetInstance(this.$(el));
        }

        app.view.base._customDestroy = function () {
            // 销毁该组件下的kendo控件
            if (window.kendo) {
                _.each(this.$('[data-role]'), function (el) {
                    var inst = kendo.widgetInstance($(el));
                    inst && inst.destroy();
                });
            }

            kendo.unbind(this.$el);
        }

        app.view.base._createViewModel = function (data) {
            return kendo.observable(data);
        };

        app.view.base.delegateModelEvents = function (vm) {
            var vm = this.model();
            var me = this;
            if (me.modelChanged) {
                vm.bind('change', function (e) {
                    var handler = me.modelChanged[e.field];
                    if (handler == null) {
                        handler = me.modelChanged['defaults'] || $.noop;
                    }

                    me._invoke(handler, vm, e);
                });
            }

        };
    };
});
