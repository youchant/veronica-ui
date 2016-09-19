// 模板扩展
define([], function () {
    return function (app) {
        var _ = app.core._;
        var extend = app.core.$.extend;

        var parentGetMethod = app.providerBase.get;
        app.storeProvider = app.provider.create({
            get: function (name, context) {
                var me = this;

                // parse name
                if (/^@/.test(name)) {
                    var parent = context + '.';
                    name = name.substr(1).replace(/^@/, parent).replace('[this]', parent);
                }

                var store = parentGetMethod.call(me, name);

                // create it
                if (store == null) {

                    var backendApi = app.backendApi.get(name);

                    if (typeof backendApi.options === 'string') {
                        backendApi.options =
                            app.optionsProvider.get('store.' + backendApi.options);
                    }

                    store = app.store.backendApiSource(extend(true, {}, backendApi.options, {
                        api: backendApi.api
                    }));


                    if (backendApi.reusable) {
                        this.add(name, store);
                    }
                }

                return store;
            }
        });

    };
});
