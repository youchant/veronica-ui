(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        root.kb_store = factory(jQuery.kendo);
    }
}(function ($, kendo) {

    var store = {};
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
    store.model.IDFIELD = 'ID';

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

    return store;

}));
