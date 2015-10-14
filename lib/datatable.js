define([
    'kendo-ui'
], function () {

    return function (app) {
        var _ = app.core._;
        var kendo = app.core.kendo || window.kendo;
        var result = {};

        (function ($) {

            var kendo = window.kendo,
                ui = kendo.ui,
                Widget = ui.Widget;
            var ListView = kendo.ui.ListView;

            var DataTable = ListView.extend({
                options: {
                    name: 'DataTable',
                    header: null,
                    widths: []
                },
                init: function (element, options) {
                    var that = this;
                    ListView.fn.init.call(that, element, options);

                    this._bindEvents();
                },
                _bindEvents: function () {
                    var el = this.element;
                    var me = this;
                    el.on('click', '.k-hierarchy-cell', function (e) {
                        var $target = $(e.currentTarget);
                        var $row = $target.closest('tr');
                        me.switchRow($row);
                    });
                },
                switchRow: function ($row) {
                    var detailRow = $row.next('.k-detail-row');
                    var colSpan = $row.children('td').length;
                    var collapseCls = 'fn-collapse';
                    var expandCls = 'fn-expand';

                    if (detailRow.length === 0) {
                        detailRow = $('<tr class="k-detail-row"><td colspan="' + colSpan + '"></td></tr>');
                        detailRow.insertAfter($row);
                        this.trigger('detailInit', {
                            detailCell: detailRow.children('td'),
                            data: $row.data()
                        })
                    }
                    if (!$row.hasClass(expandCls)) {
                        $row.next('.k-detail-row').show();
                        $row.removeClass(collapseCls).addClass(expandCls);
                    } else {
                        $row.next('.k-detail-row').hide();
                        $row.addClass(collapseCls).removeClass(expandCls);
                    }
                },
                _element: function () {
                    ListView.fn._element.call(this);

                    if (this.options.header) {
                        var element = this.element;

                        var tableHtml = '<div class="datatable-header"><table class="table table-bordered no-margin"><colgroup></colgroup><thead></thead></table></div>' +
                            '<div class="datatable-content grow"><table class="table table-bordered no-margin"><colgroup></colgroup><tbody></tbody></table></div>';
                        element.html(tableHtml);

                        var headerHtml = $('#' + this.options.header).html();
                        element.find('.datatable-header thead').html(headerHtml);

                        var len = $(headerHtml).children('th').length;
                        element.find('.datatable-header colgroup').html(this._colgroup(this.options.widths, len));

                        element.find('.datatable-content colgroup').html(this._colgroup(this.options.widths, len));

                        this.element = this.element.find('.datatable-content tbody');
                    }
                },
                // ¼ÆËã colgroup µÄÖµ
                _colgroup: function (widths, len) {
                    len || (len = widths.length);

                    var cols = '';
                    for (var i = 0; i < len; i++) {
                        var $col = $('<col />');
                        var width = widths[i];
                        if (widths == null && width == null) {
                            width = (100 / len) + "%";
                        }
                        width != null && $col.width(width);
                        cols += $col.prop('outerHTML');
                    }
                    return cols;
                },
                _templates: function () {
                    ListView.fn._templates.call(this);

                    //  this.groupTemplate = kendo.template(options.groupTemplate || "");
                }
            });

            kendo.ui.plugin(DataTable);


        })($);

    };
});
