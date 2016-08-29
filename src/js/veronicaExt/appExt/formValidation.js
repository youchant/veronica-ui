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

        app.formValidation.add('kendo', {
            init: function ($form) {
                var me = this;
                $form.kendoValidator({
                    errorTemplate: '<span title="#=message#"><i class="fa fa-exclamation-circle"></i></span>',
                    validate: function (e) {
                        var $form = e.sender.element;
                        var errors = $form.find('.k-invalid').length;
                        me.onValidate($form, errors, e);
                    }
                });
            },
            getValidator: function ($form) {
                return this.instance($form);
            },
            validate: function ($form) {
                var validator = this.getValidator($form);
                var result = validator.validate();
                return result;
            }
        });
    };
});
