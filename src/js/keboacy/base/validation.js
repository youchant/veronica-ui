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

    return $;
}));
