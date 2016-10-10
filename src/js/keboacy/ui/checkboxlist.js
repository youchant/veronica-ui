(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {
    var NS = ".kendoCheckBoxList";

    var CheckBoxList = kendo.ui.DataBoundWidget.extend({
        options: {
            dataSource: null,
            dataValueBind: "",
            dataTextField: "",
            dataValueType: "string",
            dataValueField: "",
            name: "CheckBoxList",
            orientation: "vertical"
        },

        events: [
            "dataBound",
            "select"
        ],
        dataSource: null,

        init: function (element, options) {

            kendo.ui.Widget.fn.init.call(this, element, options);

            this._dataSource();
            this.dataSource.fetch();
            this.element.on("click" + NS, ".k-checkbox-label", { sender: this }, this._onCheckBoxSelected);

            this.element.css({ "display": "inline-block" });
        },

        destroy: function () {
            $(this.element).off(NS);
            kendo.ui.Widget.fn.destroy.call(this);
        },

        _dataSource: function () {
            var dataSource = this.options.dataSource;
            dataSource = $.isArray(dataSource) ? { data: dataSource } : dataSource;

            if (this.dataSource && this._refreshHandler) {
                this.dataSource.unbind("change", this._refreshHandler);
            } else {
                this._refreshHandler = $.proxy(this.refresh, this);
            }

            this.dataSource = kendo.data.DataSource.create(dataSource).bind("change", this._refreshHandler);
        },

        _template: function () {

            var html = kendo.format(
                "<div class='k-ext-checkbox-item {2}' data-uid='#: uid #' data-value='#: {0} #' data-text='#: {1} #'>" +
                '<label>' +
                "<input type='checkbox' value='#: {0} #' class='k-checkbox' data-type='{4}' data-bind='checked: {3}' />" +
                "<span class='k-checkbox-label'>#: {1} #</span>" +
                '</label>' +
                "</div>",
                this.options.dataValueField,
                this.options.dataTextField,
                this.options.orientation === "vertical" ? "checkbox" : "checkbox-inline",
                this.options.dataValueBind,
                this.options.dataValueType);

            return kendo.template(html);
        },

        _onCheckBoxSelected: function (e) {

            var $target = $(this),
                $checkBoxItem = $target.closest(".k-ext-checkbox-item"),
                that = e.data.sender,
                isChecked = $checkBoxItem.find(".k-checkbox").is(":checked");

            $target.prev(".k-checkbox").prop("checked", !isChecked).addClass("k-state-selected");

            var selectedUid = $checkBoxItem.attr("data-uid");
            that.trigger("select", { item: that.dataSource.getByUid(selectedUid), checked: !isChecked });
        },

        setDataSource: function (dataSource) {

            this.options.dataSource = dataSource;
            this._dataSource();
            this.dataSource.fetch();
        },

        refresh: function (e) {

            var template = this._template();

            this.element.empty();

            for (var idx = 0; idx < e.items.length; idx++) {
                this.element.append(template(e.items[idx]));
            }

            this.trigger("dataBound");
        },
        items: function () {
            return this.element.children();
        },
        dataItems: function () {

            var dataSource = this.dataSource,
                list = [],
                $items = this.element.find(".k-checkbox:checked").closest(".k-ext-checkbox-item");

            $.each($items, function () {
                var uid = $(this).attr("data-uid");
                list.push(dataSource.getByUid(uid));
            });

            return list;
        },

        value: function () {

            if (arguments.length === 0) {
                var list = [];
                var $items = this.element.find(".k-checkbox:checked").closest(".k-ext-checkbox-item");

                $.each($items, function () {
                    var value = $(this).attr("data-value");
                    list.push(value);
                });
                return list;
            } else {
                var that = this,
                    list = $.isArray(arguments[0]) ? arguments[0] : (typeof arguments[0] === "string" ? [arguments[0]] : []);

                this.element.find(".k-checkbox").prop("checked", false).removeClass("k-state-selected");

                $.each(list, function () {
                    var value = this;
                    that.element.find(kendo.format(".k-ext-checkbox-item[data-value='{0}'] .k-checkbox", value)).click();
                });
            }
        }
    });
    kendo.ui.plugin(CheckBoxList);
}));