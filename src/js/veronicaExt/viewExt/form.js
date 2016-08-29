define([
], function () {

    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        var ext = {
            options: {
                validateEngine: '',
                enableValidation: true
            },
            methods: {
                _validateEngine: function () {
                    return app.formValidation.get(this.options.validateEngine);
                },
                validate: function () {
                    var me = this;
                    var result = true;
                    var $ = this.options.sandbox.app.core.$;
                    var deferred = $.Deferred();
                    this.$('[data-validate-form]').each(function (i, el) {
                        result = me._validateEngine().validate($(el));
                    });
                    if (result) {
                        deferred.resolve();
                    } else {
                        deferred.reject();
                    }
                    return deferred.promise();
                },
                save: function (data) {
                    if (data == null) {
                        data = this.model('data');
                    }
                    if (data && data.toJSON) {
                        data = data.toJSON();
                    }
                    this.trigger('saved', data);
                }
            }
        }

        base._extend(ext);

        base._extendMethod('_rendered', function () {
            var me = this;
            if (this.options.enableValidation) {
                this.$('[data-validate-form]').each(function (i, form) {
                    me._validateEngine().init($(form));
                });
            }
        });

    };
});
