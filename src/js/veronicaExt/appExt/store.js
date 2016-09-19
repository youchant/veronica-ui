// 模板扩展
define([], function () {
    return function (app) {

        var extend = app.core.$.extend;
        var map = app.core.$.map;
        var _ = app.core._;
        var store = app.store;
        var whenSingleResult = app.core.whenSingleResult;

        store.model.IDFIELD = 'id';

        store.backendApiSource = function (options) {
            return new kendo.data.ApiDataSource(options);
        }

        function StoreHandler(stores, view) {
            this._pool = stores;
            this._view = view;
        }

        /**
         * StoreHandler
         * @example
         *  this.store().exec('read')
         */
        StoreHandler.prototype = {
            constructor: StoreHandler,
            /**
             * 获取内部的 store
             */
            get: function (name) {
                if (name == null) {
                    // 如果不传名称，获取第一个 store
                    return this._pool[_.keys(this._pool)[0]];
                } else {
                    return this._pool[name];
                }
            },
            /**
             * 获取所有内部 store
             */
            getAll: function () {
                return this._pool;
            },
            /**
             * 执行命令
             */
            exec: function (cmdName, options) {
                var me = this;
                var queue = map(me._pool, function (store, name) {
                    if (store._config.commands) {
                        var cmd = store._config.commands[cmdName];
                        if (typeof cmd === 'string') {
                            cmd = app.methodProvider.get('store.' + cmd);
                        }
                        if (cmd != null) {
                            return cmd.call(store, me._view, options);
                        }
                    }
                    // 如果未找到命令，则调用 store 本身的方法
                    return store[cmdName](options);
                });

                return whenSingleResult.apply(null, queue);
            }
        }

        store.createHandler = function (stores, view) {
            return new StoreHandler(stores, view);
        }
    };
});
