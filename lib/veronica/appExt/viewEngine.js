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
            get: function (model, prop) {
                return model.get(prop);
            },
            set: function (model, prop, value) {
                return model.set(prop, value);
            }
        });
    };
});
