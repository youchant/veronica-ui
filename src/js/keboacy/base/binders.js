(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {


    /**
     * kendo ui 普通 date 绑定
     * @example
     *  <span data-bind='date: startDate' data-format='yyyy-MM-dd'></span>
     */
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
                if (typeof date === 'string') {
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

}));
