(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else {
        window.kendo.data.ApiDataSource = factory();
    }
}(function () {
    return function (app) {
        var _ = app.core._;
        var kendo = app.core.kendo || window.kendo;
        var DataSource = kendo.data.DataSource;
        var HierarchicalDataSource = kendo.data.HierarchicalDataSource;
        var $ = app.core.$;
        var extend = $.extend;
        var each = $.each;
        var ajax = $.ajax;

        var ApiDataSource = HierarchicalDataSource.extend({
            init: function (options) {
                if (options.transport != null && options.api != null && !$.isEmptyObject(options.api)) {
                    options.transport = extend(true, {}, options.transport, options.api);
                }

                DataSource.fn.init.call(this, extend(true, {}, options));

                this._customMethods();
            },
            options: {
                name: 'ApiDataSource'
            },
            _customMethods: function () {
                var me = this;
                each(this.options.api, function (key, api) {
                    me[key + 'Api'] = function (options) {
                        return this._accessApi(key, options);
                    }
                });
            },
            submitForm: function (name, $form, options) {
                var dfd = $.Deferred();
                var options = this.transport.setup(options, name);
                $form.ajaxSubmit($.extend({
                    success: function (resp) {
                        dfd.resolve(resp);
                    },
                    error: function (resp) {
                        dfd.reject(resp);
                    }
                }, options, {
                    method: $form.prop('method') || 'post',
                    contentType: $form.prop('enctype') || 'multipart/form-data'
                }));
                
                return dfd.promise();
            },
            _accessApi: function (name, options) {
                return ajax(this.transport.setup(options, name));
            }
        });

        kendo.data.ApiDataSource = ApiDataSource;

        return ApiDataSource;
    };
}));
