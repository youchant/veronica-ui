define(function () {

    return function (app) {
        var $ = app.core.$;
        app.formValidation || (app.formValidation = app.provider.create());
        
        // html5 default data form validation
        app.formValidation.add('default', {
            init: function () { },
            getValidator: function () { },
            onValidate: function ($form, errors, e) {
                var formName = $form.attr('data-validate-form');
                if (formName === '' || formName == null) {
                    return;
                }
                var $tag = $('.form-invalid-tag[data-for=' + formName + ']');
                if (errors === 0) {
                    $tag.text(errors).removeClass('fadeInRight').addClass('animated fadeOutRight');
                } else {
                    $tag.text(errors).removeClass('fadeOutRight').addClass('animated fadeInRight');
                }
            },
            validate: function ($form) {
                var result = $form.get(0).checkValidity();
                var errors = $form.find(':invalid').length;
                this.onValidate($form, errors);
                return result;
            }
        });

        app.formValidation.add('jqv', {
            init: function ($form) {
                var me = this;
                //$.validator.unobtrusive.parse($form);

                $form.validate({
                    ignore: ".ignore",
                    onfocusout: function (element) {
                        $(element).valid();
                    },
                    invalidHandler: function (e, validator) {
                        var errors = validator.numberOfInvalids();
                        me.onValidate($form, errors, e);
                    }
                });
            },
            getValidator: function ($form) {
                return $form.data('validator');
            },
            validate: function ($form) {
                var validator = this.getValidator($form);
                if (validator == null) {
                    this.init($form);
                }
                var result = $form.valid();
                if (result === true) {
                    this.onValidate($form, 0, {});
                }
                return result;
            }
        });

        function widgetCssFix(elements) {

            function updateCssOnPropertyChange(e) {
                var element = $(e.target || e.srcElement);

                element.siblings(".k-dropdown-wrap")
                .add(element.parent(".k-numeric-wrap, .k-multiselect, .k-picker-wrap, .k-autocomplete, .k-slider-wrap"))
                .toggleClass("k-invalid", element.hasClass("k-invalid"));
            }

            //correct mutation event detection
            var hasMutationEvents = ("MutationEvent" in window),
                MutationObserver = window.WebKitMutationObserver || window.MutationObserver;

            if (MutationObserver) {
                var observer = new MutationObserver(function (mutations) {
                    var idx = 0,
                        mutation,
                        length = mutations.length;

                    for (; idx < length; idx++) {
                        mutation = mutations[idx];
                        if (mutation.attributeName === "class") {
                            updateCssOnPropertyChange(mutation);
                        }
                    }
                }),
                    config = { attributes: true, childList: false, characterData: false };

                elements.each(function () {
                    observer.observe(this, config);
                });
            } else if (hasMutationEvents) {
                elements.bind("DOMAttrModified", updateCssOnPropertyChange);
            } else {
                elements.each(function () {
                    this.attachEvent("onpropertychange", updateCssOnPropertyChange);
                });
            }

        }

        app.formValidation.add('kendo', {
            init: function ($form) {
                var me = this;
                var inputs = $form.find("[data-role=autocomplete],[data-role=combobox]," +
                    "[data-role=dropdownlist],[data-role=numerictextbox]," +
                    "[data-role=datepicker],[data-role=timepicker],[data-role=datetimepicker]," +
                    "[data-role=multiselect], [data-role=slider]");
                
                widgetCssFix(inputs);


                var errorTemplate = '<div class="k-widget k-tooltip k-tooltip-validation"' +
                    'style="margin:0.5em"><span class="k-icon k-warning"> </span>' +
                    '#=message#<div class="k-callout k-callout-n"></div></div>';

                var errorTemplate2 = '<span title="#=message#"><i class="fa fa-exclamation-circle"></i></span>';

                $form.kendoValidator({
                    errorTemplate: errorTemplate,
                    validate: function (e) {
                        var $form = e.sender.element;
                        var errors = $form.find('.k-invalid').length;
                        me.onValidate($form, errors, e);
                    }
                });
            },
            getValidator: function ($form) {
                return $form.data('kendoValidator');
            },
            validate: function ($form) {
                var validator = this.getValidator($form);
                var result = validator.validate();
                return result;
            }
        });
    };
});
