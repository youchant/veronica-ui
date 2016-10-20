// 模板扩展
define([], function () {
    return function (app) {
        var _ = app.core._;
        var extend = app.core.$.extend;

        var parentGetMethod = app.providerBase.get;
        app.storeProvider = app.provider.create({
            create: function (name) {
                var backendApi = app.backendApi.get(name);

                if (typeof backendApi.options === 'string') {
                    backendApi.options =
                        app.optionsProvider.get('store.' + backendApi.options);
                }

                var options = extend(true, {}, backendApi.options, {
                    api: backendApi.api
                });

                var store;
                if(backendApi.type === 'multiple'){
                    store = app.store.backendApiSource(options);
                }
                if(backendApi.type === 'single'){
                    store = app.store.backendApiObject(options);
                }

                if (backendApi.reusable) {
                    this.add(name, store);
                }

                return store;
            },
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
                   store = me.create(name);
                }

                return store;
            }
        });

    };
});
