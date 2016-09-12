define([
], function () {
    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        base._extend({
            options: {
                uiKit: ''
            },
            methods: {
                _uiKit: function () {
                    return app.uiKit.get(this.options.uiKit);
                },
                /**
                 * 根据元素获取该元素上创建的界面控件的实例
                 * @type {function}
                 * @returns {object}
                 * @example
                 *   instance: function (el) {
                 *       return this.$(el).data('instance');
                 *   }
                 */
                instance: function (el) {
                    return this._uiKit().getInstance(this, this.$(el));
                }
            }
        });

        base._extendMethod('_rendered', function () {
            this._uiKit().init(this, this.$el);
        });

        base._extendMethod('_destroy', function () {
            this._uiKit().destroy(this);
        });
    }
});
