define(function () {

    return function (app) {

        app.templateEngine.add('pug', {
            options: function (view) {
                return _.extend({}, {
                    options: view.options,
                    globalModel: view._modelProvider(),
                    contextModel: view.getContextModelDefine(),
                    model: view.getModelDefine()
                });
            },
            compile: function (text) {
                return text;
            }
        });
    };
});
