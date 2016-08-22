define([
], function () {

    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;
        var originalUrl = base.url;

        // helper
        function getProp(obj, desc) {
            var arr = desc.split(".");
            while (arr.length && (obj = obj[arr.shift()]));
            return obj;
        }

        var ext = {
            options: {
                autoLoadData: true, 
                dataLoadMap: null
            },
            methods: {
                url: function (url) {
                    this._call(originalUrl, arguments);
                    var result = originalUrl.call(this, url);
                    if (result.indexOf('g:') > -1) {
                        var prop = result.replace('g:', '').replace('[this]', this.options._source);
                        result = getProp(app.urlProvider, prop);
                    }
                    return result;
                },
                loadData: function (configs) {
                    var me = this;
                    if (configs == null) {
                        configs = this._invoke(this.options.dataLoadMap);
                    }
                    if(configs == null) return;
                    if (!_.isArray(configs)) {
                        configs = [configs];
                    }
                    var promises = _.map(configs, function (config) {
                        return app.request.getJSONCross(me.url(config.url), config.params);
                    });

                    var len = promises.length;
                    app.request.getBundle.apply(me, promises).done(function () {
                        var args = Array.prototype.slice.call(arguments, 0, len);
                        _.each(args, function (resp, i) {
                            var config = configs[i];
                            if (config.map) {
                                var map = config.map;
                                if (!_.isArray(map)) {
                                    map = [map];
                                }
                                _.each(map, function (m, i) {
                                    var val = app.core.util.getter(resp, m.from);
                                    if (m.parse) {
                                        var parse = _.bind(m.parse, me);
                                        val = parse(val);
                                    }
                                    me.model().set(m.to, val);
                                });

                            }

                        });
                    });
                }
            }
        }

        base._extendMethod('_listen', function () {
            if (this.options.autoLoadData) {
                this.listenTo(this, 'rendered', function () {
                    this.loadData();
                });
            }
        });

        base._extend(ext);
    };
});
