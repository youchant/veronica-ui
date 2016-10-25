// 模板扩展
define([
    './storeHandler'
], function (storeHandler) {
    return function (app) {

        var extend = app.core.$.extend;
        var map = app.core.$.map;
        var _ = app.core._;
        var whenSingleResult = app.core.whenSingleResult;
        var StoreHandler = storeHandler(app);
        var store = app.store = {};


        // 基础视图模型
        store.viewModel = function (obj) {
            return kendo.observable(obj);
        };

        // 基础模型
        store.model = function (options) {
            if (typeof options === 'string') {
                options = {
                    id: options || store.model.IDFIELD
                };
            }
            return kendo.data.Model.define(options);
        };
        store.model.IDFIELD = 'id';

        store.source = function (options) {
            return new kendo.data.DataSource(options);
        };

        store.remoteSource = function (url) {
            var param = {
                pageSize: 20,
                page: 1,
                schema: {
                    model: store.model(),
                    // type: 'json',
                    data: 'data',
                    total: 'total'
                },
                transport: {
                    read: {
                        url: url,
                        dataType: 'json'
                    }
                }
            };
            return store.source(param);
        };

        store.remoteComplexSource = function (url) {
            return store.source({
                pageSize: 20,
                page: 1,
                serverPaging: true,
                serverSorting: true,
                serverFiltering: true,
                schema: {
                    //type: 'json',
                    model: store.model(),
                    data: 'data',
                    total: 'total'
                },
                transport: {
                    read: {
                        url: url,
                        type: 'POST',
                        dataType: "json",
                        contentType: "application/json; charset=utf-8"
                    },
                    parameterMap: function (data, type) {
                        if (type === "read") {
                            return JSON.stringify(data);
                        }
                        return data;
                    }
                }
            });
        };

        store.backendApiSource = function (options) {
            return new kendo.data.BackendApiDataSource(options);
        };

        store.backendApiObject = function (options) {
            return new kendo.data.BackendApiDataObject(options);
        };

        store.createHandler = function (stores, view) {
            return new StoreHandler(stores, view);
        };
    };
});
