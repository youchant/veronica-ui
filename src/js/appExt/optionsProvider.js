define(function () {

    return function (app) {
        var $ = app.core.$;

        app.optionsProvider || (app.optionsProvider = app.provider.create());

        app.methodProvider || (app.methodProvider = app.provider.create());

    };
});
