(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui', 'jSignature'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {

    var ui = kendo.ui;
    var Widget = ui.Widget;
    var DataBoundWidget = ui.DataBoundWidget;
    var CHANGE = 'change';

    var Signature = kendo.ui.DataBoundWidget.extend({
        options: {
            name: 'Signature',
            resetLabel: '重写',
            doneLabel: '完成',
            dataFormat: 'image'
        },
        init: function (element, options) {
            DataBoundWidget.fn.init.call(this, element, options);
            this._element();
            this.instance();
        },
        _element: function () {
            this.element.append('<div class="signature-canvas"></div>' +
                '<div class="btn-toolbar">' +
                '<button class="btn btn-default js-reset">' + this.options.resetLabel +
                '</button><button class="btn btn-primary js-done">' + this.options.doneLabel +
                '</button></div>');

            this.$canvas = this.element.find('.signature-canvas');

            this._bindEvents();
        },
        _bindEvents: function () {
            var me = this;
            this.element.find('.js-reset').on('click', function (e) {
                me.instance('reset');
            });
            this.element.find('.js-done').on('click', function (e) {
                me.trigger('change');
            });
        },
        instance: function () {
            return this.$canvas.jSignature.apply(this.$canvas, arguments);
        },
        value: function (value) {
            if (value === undefined) {
                return this.instance("getData", this.options.dataFormat);
            }

            if (value !== '') {
                if(value.join && value.length){
                    value = "data:" + value.join(",");
                }
                this.instance("setData", value);
            }
        }
    });

    kendo.ui.plugin(Signature);


}));
