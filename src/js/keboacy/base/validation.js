(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define(['jquery', 'jquery-validation-unobtrusive'], factory);
    } else {
        factory(jQuery);
    }
}(function ($) {

    // 自定义验证
    $.validator.addMethod('numberorfloat', function (value, element, parms) {
        if (value) {
            return /^\d+(\.\d{2})?$/.test(value);
        } else {
            return true;
        }
    });
    $.validator.unobtrusive.adapters.add('numberorfloat', function (options) {
        options.rules['numberorfloat'] = {};
        options.messages['numberorfloat'] = options.message;
    });

    $.validator.addMethod('notmorethan', function (value, element, param) { // 添加表单之间的不大于判断
        var target = $(param);
        if (this.settings.onfocusout) {
            target.unbind(".validate-notmorethan").bind("blur.validate-notmorethan", function () {
                $(element).valid();
            });
        }
        var targetVal = target.val();
        if (!value || !targetVal) { // 如果待判断输入框其中一个没有值，则不执行该验证
            return true;
        }
        return value <= targetVal;
    });
    $.validator.unobtrusive.adapters.add("notmorethan", ["other"], function (options) {
        var element = $(options.form).find(":input").filter("[name='" + options.params.other + "']")[0];
        options.rules['notmorethan'] = element;
        options.messages['notmorethan'] = options.message;
    });

    $.validator.addMethod("greaterthan",
        function (val, element, other) {
            var modelPrefix = element.name.substr(0, element.name.lastIndexOf(".") + 1);
            var otherVal = $("[name=" + modelPrefix + other + "]").val();
            if (val && otherVal) {
                if (val < otherVal) {
                    return false;
                }
            }
            return true;
        }
    );
    $.validator.unobtrusive.adapters.addSingleVal("greaterthan", "other");

    $.validator.addMethod('notlessthan', function (value, element, param) { // 添加表单之间的不小于判断
        var target = $(param);
        if (this.settings.onfocusout) {
            target.unbind(".validate-notlessthan").bind("blur.validate-notlessthan", function () {
                $(element).valid();
            });
        }
        var targetVal = target.val();
        if (!value || !targetVal) { // 如果待判断输入框其中一个没有值，则不执行该验证
            return true;
        }
        return value >= targetVal;
    });
    $.validator.unobtrusive.adapters.add("notlessthan", ["other"], function (options) {
        var element = $(options.form).find(":input").filter("[name='" + options.params.other + "']")[0];
        options.rules['notlessthan'] = element;
        options.messages['notlessthan'] = options.message;
    });

    $.validator.addMethod('notequalthan', function (value, element, param) { // 添加表单之间的不等于判断
        var target = $(param);
        if (this.settings.onfocusout) {
            target.unbind(".validate-notequalthan").bind("blur.validate-notequalthan", function () {
                $(element).valid();
            });
        }
        var targetVal = target.val();
        if (!value || !targetVal) { // 如果待判断输入框其中一个没有值，则不执行该验证
            return true;
        }
        return value != targetVal;
    });
    $.validator.unobtrusive.adapters.add("notequalthan", ["other"], function (options) {
        var element = $(options.form).find(":input").filter("[name='" + options.params.other + "']")[0];
        options.rules['notequalthan'] = element;
        options.messages['notequalthan'] = options.message;
    });


    // zh

    $.extend($.validator.messages, {
        required: "这是必填字段",
        remote: "请修正此字段",
        email: "请输入有效的电子邮件地址",
        url: "请输入有效的网址",
        date: "请输入有效的日期",
        dateISO: "请输入有效的日期 (YYYY-MM-DD)",
        number: "请输入有效的数字",
        digits: "只能输入数字",
        creditcard: "请输入有效的信用卡号码",
        equalTo: "你的输入不相同",
        extension: "请输入有效的后缀",
        maxlength: $.validator.format("最多可以输入 {0} 个字符"),
        minlength: $.validator.format("最少要输入 {0} 个字符"),
        rangelength: $.validator.format("请输入长度在 {0} 到 {1} 之间的字符串"),
        range: $.validator.format("请输入范围在 {0} 到 {1} 之间的数值"),
        max: $.validator.format("请输入不大于 {0} 的数值"),
        min: $.validator.format("请输入不小于 {0} 的数值")
    });

    return $;
}));
