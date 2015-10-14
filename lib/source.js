define([
    'kendo-ui'
], function () {

    return function (app) {
        var _ = app.core._;
        var kendo = app.core.kendo || window.kendo;
        var result = {};

        app.data || (app.data = {});

        // 基础视图模型
        app.data.viewModel = function (obj) {
            return kendo.observable(obj);
        };

        // 基础模型
        app.data.model = function (options) {
            if (_.isString(options)) {
                options = {
                    id: options || app.data.model.IDFIELD
                };
            }
            return kendo.data.Model.define(options);
        };

        app.data.model.IDFIELD = 'ID';

        app.data.source = function (options) {
            return new kendo.data.DataSource(options);
        };

        app.data.remoteSource = function (url) {
            var param = {
                pageSize: 20,
                page: 1,
                schema: {
                    model: app.data.model(),
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
            return new app.data.source(param);
        };

        app.data.remoteComplexSource = function (url) {
            return app.data.source({
                pageSize: 20,
                page: 1,
                serverPaging: true,
                serverSorting: true,
                serverFiltering: true,
                schema: {
                    //type: 'json',
                    model: app.data.model(),
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


    };
});
