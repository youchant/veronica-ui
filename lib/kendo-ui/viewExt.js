define([
], function () {

    return function (app) {
        var _ = app.core._;
        var $ = app.core.$;
        var kendo = app.core.kendo || window.kendo;

        app.view.base._bind = function () {
            var me = this;

            if (this.options.bindBlock) {
                this.$el.find('.data-bind-block')
                    .not(this.$el.find('.ver-view .data-bind-block'))
                    .each(function (i, el) {
                        kendo.unbind($(el));
                        kendo.bind($(el), me.viewModel);
                    });
            } else {
                kendo.unbind(this.$el);
                kendo.bind(this.$el, me.viewModel);
            }
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
            vm || (vm = this.model());
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
