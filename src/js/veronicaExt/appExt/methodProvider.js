define(function () {

    return function (app) {
        app.methodProvider || (app.methodProvider = app.provider.create());
    };
});
