define([
], function () {
    return function (base, app) {
        var _ = app.core._;
        var extend = app.core._.extend;

        base._extend({
            options: {
                //store
            },
            configs: {
                stores: {
                }
            },
            methods: {
                _getStoreConfig: function () {
                    return this.stores;
                },
                _fillData: function (data) {
                    this.model('data', data);
                },
                store: function () {
                    var me = this;
                    var stores = {};
                    if (me._defaultStore == null) {
                        throw Error('Not any store in this view');
                    }
                    var names = Array.prototype.slice.call(arguments);
                    if (names.length === 0) {
                        names.push(this._defaultStore);
                    }
                    _.each(names, function (name) {
                        var m = me.model(name);
                        if (m != null) {
                            stores[name] = m;
                        }
                    })

                    var handler = app.store.createHandler(stores, me);
                    return handler;
                }
            }
        });

        base._extendMethod('_initProps', function(){
            this._defaultStore = null;
        })

        base._extendMethod('_listen', function () {
            this.listenTo(this, 'modelInit', function () {
                var me = this;
                var keys = _.keys(this.stores);

                if (keys.length === 0) { return; }

                me._defaultStore = keys[0];

                // 创建所有 store
                _.each(me.stores, function (config, name) {
                    var store = app.storeProvider.get(config.from, me._getContext());
                    store._config = config;
                    if (config.isDefault) {
                        me._defaultStore = name;
                    }
                    // 设置到模型
                    me.model(name, store);
                });
                
            });
            // this._store = {};
        })
    }
});
