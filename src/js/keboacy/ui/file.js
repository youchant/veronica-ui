(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {

    var ui = kendo.ui;
    var Widget = ui.Widget;


    var File = Widget.extend({
        options: {
            name: 'File',
            label: 'Browse'
        },
        init: function (element, options) {
            var me = this;
            Widget.fn.init.call(me, element, options);

            me._wrapper();
            me._bindEvents();
        },
        _wrapper: function(){
            var me = this;
            var element = me.element;
            var elementDom = element[0];
            var wrapper;

            var parent = '<div class="input-group">' +
                '<label class="input-group-btn">' +
                '<span class="btn btn-default fileinput-button">' +
                me.options.label + '&hellip;' +

                '</span>' +
                '</label>' +
                '<input type="text" class="form-control" readonly>' +
            '</div>';

            me.wrapper = $(parent).addClass('k-widget k-file').addClass(elementDom.className);
            element.replaceWith(me.wrapper);
            me.wrapper.find('.btn').append(element);
        },
        _bindEvents: function(){
            var me = this;
            this.element.on('change', function(e){
                var files = $(e.target)[0].files;
                var name = files.length === 0 ? '' : files[0].name;
                me.wrapper.find('input:text').val(name);
            });
        }
    });

    kendo.ui.plugin(File);


}));
