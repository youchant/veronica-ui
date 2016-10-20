
define([], function () {
    return function (app) {
        var _ = app.core._;
        var each = _.each;
        var extend = _.extend;
        var parentGet = app.providerBase.get;

        app.backendApi = app.provider.create({
            get: function (name) {  // name eg: 'dashboard.person:stat'
                var me = this;
                var groupName, item, result;
                var nameArr = name.split(':');

                name = nameArr[0];
                groupName = nameArr[1];
                item = parentGet.call(this, name);

                if (item != null) {
                    result = extend({}, item);

                    if (groupName != null) {
                        var group = item.groups[groupName];
                        if (group != null) {
                            if (group.api) {
                                result.api = me._getGroupApi(item, group.api);
                            }
                            if (group.reusable) {
                                result.reusable = group.reusable;
                            }
                            if (group.options) {
                                result.options = group.options;
                            }
                            if(group.type){
                                result.type = group.type;
                            }
                        }
                    }
                }
                
                return result;
            },
            /**
             * 获取组的 api
             * @example
             *  // this._getGrouopApi({ api: {} }, ['readAll=>read', 'test'])
             */
            _getGroupApi: function (parent, apiConfig) {
                var result = {};
                each(apiConfig, function (item) {
                    var apiArr = /([\w\-]*)(?:=>)?([\w\-]*)/.exec(item);
                    var apiName = apiArr[2] || apiArr[1];
                    var api = parent.api[apiArr[1]];
                    if (api == null) {
                        throw Error('The api does not exist: ' + apiArr[1])
                    }
                    result[apiName] = api;
                })
                return result;
            },
            _preprocess: function (data) {
                _.each(data.api, function (config, key) {
                    if (_.isString(config)) {
                        config = {
                            url: config
                        }
                    }
                    var r = /([\w\-\\\/]*)\s?([\w\-\\\/]*)\s?([\w\-\\\/]*)/.exec(config.url);
                    config.url = data.domain + r[1];
                    config.type = config.type || r[2] || 'get';
                    config.dataType = config.dataType || r[3] || 'json';

                    data.api[key] = config;
                })

                return data;
            }
        });

        app.backendApi.add('default', {
            domain: '',
            reusable: false,
            api: {},
            options: 'default',
            type: 'multiple'
        });

    };
});
