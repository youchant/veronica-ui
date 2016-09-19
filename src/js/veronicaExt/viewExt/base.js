define([], function () {
    return function (base, app) {
        var _ = app.core._;
        base._extend({
            methods: {
                app: function () {
                    return this.options.sandbox.app;
                }
            }
        })
    }
});
