define([], function () {
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
                    var $el = el instanceof $ ? el : (el.tagName ? $(el) : this.$(el));
                    return this._uiKit().getInstance(this, $el);
                },
                $: function (selector) {
                    var r = this.$el.find(selector);
                    this._outerEl.each(function (i, el) {
                        var isThis = $(el).is(selector);
                        var r1;
                        if (isThis) {
                            r1 = $(el);
                        } else {
                            r1 = $(el).find(selector);
                        }
                        if (r1.length !== 0) {
                            $.merge(r, r1);
                        }
                    });

                    return r;
                }
            }
        });

        base._extendMethod('_rendered', function () {
            this._outerEl = this.$('[data-role=window]');
            this._uiKit().init(this, this.$el);

        });

        base._extendMethod('_initProps', function () {
            this._outerEl = $({});
        });

        base._extendMethod('_destroy', function () {
            this._uiKit().destroy(this);
        });
    }
});
