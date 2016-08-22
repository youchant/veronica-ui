define([
], function () {


    return function(base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        // model define

        var options = {
            modelContext: null,
            modelName: null
        }

        var methods = {
            _modelProvider: function () {
                return app.modelProvider;
            },
            getContextModelDefine: function () {
                return this._modelProvider()[this.options.modelContext || this.options._source];
            },
            getModelDefine: function () {
                var contextModel = this.getContextModelDefine();
                return contextModel && contextModel[this.options.modelName];
            }
        }

        base._extend({
            options: options,
            methods: methods
        });
    };
});
