define([
    'kendo-ui'
], function () {

    return function (app) {
        var _ = app.core._;
        var $ = app.core.$;
        var kendo = app.core.kendo || window.kendo;

        // date °ó¶¨
        kendo.data.binders.date = kendo.data.Binder.extend({
            init: function (element, bindings, options) {
                kendo.data.Binder.fn.init.call(this, element, bindings, options);

                this._change = $.proxy(this.change, this);

                $(this.element).on('change', this._change);

            },

            refresh: function () {

                var date = this.bindings.date.get();
                var dateTxt;
                if (!date) {
                    dateTxt = "";
                } else {
                    if (_.isString(date)) {
                        date = kendo.parseDate(date);
                    }
                    var format = $(this.element).data('format') ||
                     kendo._extractFormat('yyyy/MM/dd');
                    dateTxt = kendo.toString(date, format);
                }
                if ('value' in this.element) {
                    this.element.value = dateTxt;
                } else {
                    this.element.innerHTML = dateTxt;
                }
            },
            change: function () {
                var value = this.element.value;
                this.bindings.date.set(value);
            }
        });

    };
});
