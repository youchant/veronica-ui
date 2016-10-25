define(function () {

    return function (app) {

        app.viewEngine.add('kendo', {
            bind: function (view, $dom, model) {
                kendo.unbind($dom);
                kendo.bind($dom, model);
            },
            unbind: function (view) {
                kendo.unbind(view.$el);
            },
            create: function (data) {
                return kendo.observable(data);
            },
            bindEvents: function (vm, view) {
                if (view.modelChanged) {
                    vm.bind('change', function (e) {
                        var handler = view.modelChanged[e.field];
                        if (handler == null) {
                            handler = view.modelChanged['defaults'] || $.noop;
                        }

                        view._invoke(handler, vm, e);
                    });
                }
            },
            get: function (model, prop) {
                return model.get(prop);
            },
            set: function (model, prop, value) {
                return model.set(prop, value);
            }
        });
    };
});
