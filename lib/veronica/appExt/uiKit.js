define(function () {

    return function (app) {
        app.uiKit.add('keboacy', {
            init: function (view, $el) {

            },
            destroy: function (view) {
                kendo.unbind(view.$el);
            },
            getInstance: function (view, $el) {
                return kendo.widgetInstance($el);
            }
        });
    };
});
