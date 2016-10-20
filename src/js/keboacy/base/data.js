(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {

    var DataSource = kendo.data.DataSource;
    var HierarchicalDataSource = kendo.data.HierarchicalDataSource;
    var extend = $.extend;
    var each = $.each;
    var ajax = $.ajax;
    var ObservableObject = kendo.data.ObservableObject;

    var BackendApiDataSource = HierarchicalDataSource.extend({
        init: function (options) {
            if (options.api != null && !$.isEmptyObject(options.api)) {
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

    kendo.data.BackendApiDataObject = ObservableObject.extend({
        init: function (options) {
            options || (options = {});
            options.data || (options.value = {});

            this._initDataSource(options);
            this._initData();
            this._bindEvents();
        },
        _initDataSource: function (options) {
            // 处理 options
            if (options.data != null && !$.isArray(options.data)) {
                options.data = [options.data];
            }

            if (options.schema == null) {
                options.schema = {};
            }

            var convertArray = function (resp, field) {
                var data = resp;
                if (field != null) {
                    data = resp[field];
                }
                if (!$.isArray(data)) {
                    return [data];
                }
                return data;
            };
            if (options.schema.data == null) {
                options.schema.data = convertArray;
            } else {
                if (typeof options.schema.data === 'string') {
                    var field = options.schema.data;
                    options.schema.data = function (resp) {
                        return convertArray.call(this, resp, field);
                    };
                } else {
                    var func = options.schema.data;
                    options.schema.data = function (resp) {
                        var origin = func.call(this, resp);
                        return convertArray.call(this, origin);
                    }
                }
            }

            this._dataSource = new BackendApiDataSource(options);
        },
        _bindEvents: function () {
            var me = this;
            var dataSource = this._dataSource;
            dataSource.bind('change', function (e) {
                if (!e.action) {
                    var data = dataSource.at(0).toJSON();
                    $.each(data, function (field, val) {
                        me.set(field, val);
                    });
                }
            });
        },
        _initData: function () {
            var data = this._dataSource.at(0);
            if (data == null) {
                data = {};
            }
            this.reset(data);
        },
        read: function (options) {
            return this._dataSource.read(options);
        },
        data: function (data) {
            return this._dataSource.data(data);
        },
        reset: function (value) {
            ObservableObject.fn.init.call(this, value);
            this.trigger('reset', {
                value: value
            });
        },
        shouldSerialize: function (field) {
            var rt = ObservableObject.fn.shouldSerialize.call(this, field);
            var noSerialize = ['_dataSource'];
            return rt && noSerialize.indexOf(field) < 0;
        },
        dataSource: function () {
            return this._dataSource;
        },
        _backOptions: function (options) {
            options = $.extend(true, {
                data: this.toJSON()
            }, options);
            return options;
        },
        create: function (options) {
            return this.dataSource().createApi(this._backOptions());
        },
        update: function (options) {
            return this.dataSource().updateApi(this._backOptions());
        },
        remove: function (options) {
            return this.dataSource().removeApi(this._backOptions());
        },

    });

    kendo.data.BackendApiDataSource = BackendApiDataSource;
}));