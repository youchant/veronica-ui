//Copyright 2012, etc.

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD.
        define(['jquery'], factory);
    } else {
        // Browser globals
        root.veronicaui = factory(root.$);
    }
}(this, function ($) {


/**
 * @license almond 0.3.3 Copyright jQuery Foundation and other contributors.
 * Released under MIT license, http://github.com/requirejs/almond/LICENSE
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part, normalizedBaseParts,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name) {
            name = name.split('/');
            lastIndex = name.length - 1;

            // If wanting node ID compatibility, strip .js from end
            // of IDs. Have to do this here, and not in nameToUrl
            // because node allows either .js or non .js to map
            // to same file.
            if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
            }

            // Starts with a '.' so need the baseName
            if (name[0].charAt(0) === '.' && baseParts) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that 'directory' and not name of the baseName's
                //module. For instance, baseName of 'one/two/three', maps to
                //'one/two/three.js', but we want the directory, 'one/two' for
                //this normalization.
                normalizedBaseParts = baseParts.slice(0, baseParts.length - 1);
                name = normalizedBaseParts.concat(name);
            }

            //start trimDots
            for (i = 0; i < name.length; i++) {
                part = name[i];
                if (part === '.') {
                    name.splice(i, 1);
                    i -= 1;
                } else if (part === '..') {
                    // If at the start, or previous value is still ..,
                    // keep them so that when converted to a path it may
                    // still work when converted to a path, even though
                    // as an ID it is less than ideal. In larger point
                    // releases, may be better to just kick out an error.
                    if (i === 0 || (i === 1 && name[2] === '..') || name[i - 1] === '..') {
                        continue;
                    } else if (i > 0) {
                        name.splice(i - 1, 2);
                        i -= 2;
                    }
                }
            }
            //end trimDots

            name = name.join('/');
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    //Creates a parts array for a relName where first part is plugin ID,
    //second part is resource ID. Assumes relName has already been normalized.
    function makeRelParts(relName) {
        return relName ? splitPrefix(relName) : [];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relParts) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0],
            relResourceName = relParts[1];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relResourceName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relResourceName));
            } else {
                name = normalize(name, relResourceName);
            }
        } else {
            name = normalize(name, relResourceName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i, relParts,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;
        relParts = makeRelParts(relName);

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relParts);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, makeRelParts(callback)).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("../../node_modules/almond/almond", function(){});

define('veronicaExt/appExt/formValidation',[],function () {

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

define('veronicaExt/appExt/templateEngine',[],function () {

    return function (app) {

        app.templateEngine.add('pug', {
            options: function (view) {
                return _.extend({}, {
                    options: view.options,
                    globalModel: view._modelProvider(),
                    contextModel: view.getContextModelDefine(),
                    model: view.getModelDefine()
                });
            },
            compile: function (text) {
                return text;
            }
        });
    };
});

/**
 * Copyright 2015 Telerik AD
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
(function(f,define){define('kendo-ui',[],f)})(function(){!function(){!function(e,t,n){function i(){}function r(e,t){if(t)return"'"+e.split("'").join("\\'").split('\\"').join('\\\\\\"').replace(/\n/g,"\\n").replace(/\r/g,"\\r").replace(/\t/g,"\\t")+"'";var n=e.charAt(0),i=e.substring(1);return"="===n?"+("+i+")+":":"===n?"+$kendoHtmlEncode("+i+")+":";"+e+";$kendoOutput+="}function o(e,t,n){return e+="",t=t||2,n=t-e.length,n?U[t].substring(0,n)+e:e}function a(e){var t=e.css(ve.support.transitions.css+"box-shadow")||e.css("box-shadow"),n=t?t.match(De)||[0,0,0,0,0]:[0,0,0,0,0],i=ke.max(+n[3],+(n[4]||0));return{left:-n[1]+i,right:+n[1]+i,bottom:+n[2]+i}}function s(t,n){var i,r,o,s,l,c,u,d,h=Se.browser,f="rtl"==t.css("direction");return t.parent().hasClass("k-animation-container")?(u=t.parent(".k-animation-container"),d=u[0].style,u.is(":hidden")&&u.show(),i=Te.test(d.width)||Te.test(d.height),i||u.css({width:t.outerWidth(),height:t.outerHeight(),boxSizing:"content-box",mozBoxSizing:"content-box",webkitBoxSizing:"content-box"})):(r=a(t),o=t[0].style.width,s=t[0].style.height,l=Te.test(o),c=Te.test(s),h.opera&&(r.left=r.right=r.bottom=5),i=l||c,!l&&(!n||n&&o)&&(o=t.outerWidth()),!c&&(!n||n&&s)&&(s=t.outerHeight()),t.wrap(e("<div/>").addClass("k-animation-container").css({width:o,height:s,marginLeft:r.left*(f?1:-1),paddingLeft:r.left,paddingRight:r.right,paddingBottom:r.bottom})),i&&t.css({width:"100%",height:"100%",boxSizing:"border-box",mozBoxSizing:"border-box",webkitBoxSizing:"border-box"})),h.msie&&ke.floor(h.version)<=7&&(t.css({zoom:1}),t.children(".k-menu").width(t.width())),t.parent()}function l(e){var t=1,n=arguments.length;for(t=1;n>t;t++)c(e,arguments[t]);return e}function c(e,t){var n,i,r,o,a,s=ve.data.ObservableArray,l=ve.data.LazyObservableArray,u=ve.data.DataSource,d=ve.data.HierarchicalDataSource;for(n in t)i=t[n],r=typeof i,o=r===ze&&null!==i?i.constructor:null,o&&o!==Array&&o!==s&&o!==l&&o!==u&&o!==d?i instanceof Date?e[n]=new Date(i.getTime()):I(i.clone)?e[n]=i.clone():(a=e[n],e[n]=typeof a===ze?a||{}:{},c(e[n],i)):r!==Be&&(e[n]=i);return e}function u(e,t,i){for(var r in t)if(t.hasOwnProperty(r)&&t[r].test(e))return r;return i!==n?i:e}function d(e){return e.replace(/([a-z][A-Z])/g,function(e){return e.charAt(0)+"-"+e.charAt(1).toLowerCase()})}function h(e){return e.replace(/\-(\w)/g,function(e,t){return t.toUpperCase()})}function f(t,n){var i,r={};return document.defaultView&&document.defaultView.getComputedStyle?(i=document.defaultView.getComputedStyle(t,""),n&&e.each(n,function(e,t){r[t]=i.getPropertyValue(t)})):(i=t.currentStyle,n&&e.each(n,function(e,t){r[t]=i[h(t)]})),ve.size(r)||(r=i),r}function p(e){if(e&&e.className&&"string"==typeof e.className&&e.className.indexOf("k-auto-scrollable")>-1)return!0;var t=f(e,["overflow"]).overflow;return"auto"==t||"scroll"==t}function g(t,i){var r=t instanceof e?t[0]:t,o=Se.isRtl(t),a=Se.browser.webkit,s=Se.browser.mozilla;return i===n?o&&a?r.scrollWidth-r.clientWidth-r.scrollLeft:Math.abs(r.scrollLeft):(r.scrollLeft=o&&a?r.scrollWidth-r.clientWidth-i:o&&s?-i:i,n)}function m(e){var t,n=0;for(t in e)e.hasOwnProperty(t)&&"toJSON"!=t&&n++;return n}function v(e,n,i){n||(n="offset");var r=e[n]();return Se.browser.msie&&(Se.pointers||Se.msPointers)&&!i&&(r.top-=t.pageYOffset-document.documentElement.scrollTop,r.left-=t.pageXOffset-document.documentElement.scrollLeft),r}function _(e){var t={};return ye("string"==typeof e?e.split(" "):e,function(e){t[e]=this}),t}function y(e){return new ve.effects.Element(e)}function b(e,t,n,i){return typeof e===Pe&&(I(t)&&(i=t,t=400,n=!1),I(n)&&(i=n,n=!1),typeof t===Fe&&(n=t,t=400),e={effects:e,duration:t,reverse:n,complete:i}),_e({effects:{},duration:400,reverse:!1,init:xe,teardown:xe,hide:!1},e,{completeCallback:e.complete,complete:xe})}function w(t,n,i,r,o){for(var a,s=0,l=t.length;l>s;s++)a=e(t[s]),a.queue(function(){j.promise(a,b(n,i,r,o))});return t}function x(e,t,n,i){return t&&(t=t.split(" "),ye(t,function(t,n){e.toggleClass(n,i)})),e}function k(e){return(""+e).replace(G,"&amp;").replace(q,"&lt;").replace(K,"&gt;").replace($,"&quot;").replace(Y,"&#39;")}function C(e,t){var i;return 0===t.indexOf("data")&&(t=t.substring(4),t=t.charAt(0).toLowerCase()+t.substring(1)),t=t.replace(re,"-$1"),i=e.getAttribute("data-"+ve.ns+t),null===i?i=n:"null"===i?i=null:"true"===i?i=!0:"false"===i?i=!1:Me.test(i)?i=parseFloat(i):ne.test(i)&&!ie.test(i)&&(i=Function("return ("+i+")")()),i}function S(t,i){var r,o,a={};for(r in i)o=C(t,r),o!==n&&(te.test(r)&&(o=ve.template(e("#"+o).html())),a[r]=o);return a}function T(t,n){return e.contains(t,n)?-1:1}function A(){var t=e(this);return e.inArray(t.attr("data-"+ve.ns+"role"),["slider","rangeslider"])>-1||t.is(":visible")}function D(e,t){var n=e.nodeName.toLowerCase();return(/input|select|textarea|button|object/.test(n)?!e.disabled:"a"===n?e.href||t:t)&&M(e)}function M(t){return e.expr.filters.visible(t)&&!e(t).parents().addBack().filter(function(){return"hidden"===e.css(this,"visibility")}).length}function E(e,t){return new E.fn.init(e,t)}var P,I,z,R,F,B,L,O,H,N,V,U,W,j,G,q,$,Y,K,Q,X,J,Z,ee,te,ne,ie,re,oe,ae,se,le,ce,ue,de,he,fe,pe,ge,me,ve=t.kendo=t.kendo||{cultures:{}},_e=e.extend,ye=e.each,be=e.isArray,we=e.proxy,xe=e.noop,ke=Math,Ce=t.JSON||{},Se={},Te=/%/,Ae=/\{(\d+)(:[^\}]+)?\}/g,De=/(\d+(?:\.?)\d*)px\s*(\d+(?:\.?)\d*)px\s*(\d+(?:\.?)\d*)px\s*(\d+)?/i,Me=/^(\+|-?)\d+(\.?)\d*$/,Ee="function",Pe="string",Ie="number",ze="object",Re="null",Fe="boolean",Be="undefined",Le={},Oe={},He=[].slice,Ne=t.Globalize;ve.version="2015.3.1111".replace(/^\s+|\s+$/g,""),i.extend=function(e){var t,n,i=function(){},r=this,o=e&&e.init?e.init:function(){r.apply(this,arguments)};i.prototype=r.prototype,n=o.fn=o.prototype=new i;for(t in e)n[t]=null!=e[t]&&e[t].constructor===Object?_e(!0,{},i.prototype[t],e[t]):e[t];return n.constructor=o,o.extend=r.extend,o},i.prototype._initOptions=function(e){this.options=l({},this.options,e)},I=ve.isFunction=function(e){return"function"==typeof e},z=function(){this._defaultPrevented=!0},R=function(){return this._defaultPrevented===!0},F=i.extend({init:function(){this._events={}},bind:function(e,t,i){var r,o,a,s,l,c=this,u=typeof e===Pe?[e]:e,d=typeof t===Ee;if(t===n){for(r in e)c.bind(r,e[r]);return c}for(r=0,o=u.length;o>r;r++)e=u[r],s=d?t:t[e],s&&(i&&(a=s,s=function(){c.unbind(e,s),a.apply(c,arguments)},s.original=a),l=c._events[e]=c._events[e]||[],l.push(s));return c},one:function(e,t){return this.bind(e,t,!0)},first:function(e,t){var n,i,r,o,a=this,s=typeof e===Pe?[e]:e,l=typeof t===Ee;for(n=0,i=s.length;i>n;n++)e=s[n],r=l?t:t[e],r&&(o=a._events[e]=a._events[e]||[],o.unshift(r));return a},trigger:function(e,t){var n,i,r=this,o=r._events[e];if(o){for(t=t||{},t.sender=r,t._defaultPrevented=!1,t.preventDefault=z,t.isDefaultPrevented=R,o=o.slice(),n=0,i=o.length;i>n;n++)o[n].call(r,t);return t._defaultPrevented===!0}return!1},unbind:function(e,t){var i,r=this,o=r._events[e];if(e===n)r._events={};else if(o)if(t)for(i=o.length-1;i>=0;i--)(o[i]===t||o[i].original===t)&&o.splice(i,1);else r._events[e]=[];return r}}),B=/^\w+/,L=/\$\{([^}]*)\}/g,O=/\\\}/g,H=/__CURLY__/g,N=/\\#/g,V=/__SHARP__/g,U=["","0","00","000","0000"],P={paramName:"data",useWithBlock:!0,render:function(e,t){var n,i,r="";for(n=0,i=t.length;i>n;n++)r+=e(t[n]);return r},compile:function(e,t){var n,i,o,a=_e({},this,t),s=a.paramName,l=s.match(B)[0],c=a.useWithBlock,u="var $kendoOutput, $kendoHtmlEncode = kendo.htmlEncode;";if(I(e))return e;for(u+=c?"with("+s+"){":"",u+="$kendoOutput=",i=e.replace(O,"__CURLY__").replace(L,"#=$kendoHtmlEncode($1)#").replace(H,"}").replace(N,"__SHARP__").split("#"),o=0;i.length>o;o++)u+=r(i[o],o%2===0);u+=c?";}":";",u+="return $kendoOutput;",u=u.replace(V,"#");try{return n=Function(l,u),n._slotCount=Math.floor(i.length/2),n}catch(d){throw Error(ve.format("Invalid template:'{0}' Generated code:'{1}'",e,u))}}},function(){function e(e){return a.lastIndex=0,a.test(e)?'"'+e.replace(a,function(e){var t=s[e];return typeof t===Pe?t:"\\u"+("0000"+e.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+e+'"'}function t(o,a){var s,c,u,d,h,f,p=n,g=a[o];if(g&&typeof g===ze&&typeof g.toJSON===Ee&&(g=g.toJSON(o)),typeof r===Ee&&(g=r.call(a,o,g)),f=typeof g,f===Pe)return e(g);if(f===Ie)return isFinite(g)?g+"":Re;if(f===Fe||f===Re)return g+"";if(f===ze){if(!g)return Re;if(n+=i,h=[],"[object Array]"===l.apply(g)){for(d=g.length,s=0;d>s;s++)h[s]=t(s,g)||Re;return u=0===h.length?"[]":n?"[\n"+n+h.join(",\n"+n)+"\n"+p+"]":"["+h.join(",")+"]",n=p,u}if(r&&typeof r===ze)for(d=r.length,s=0;d>s;s++)typeof r[s]===Pe&&(c=r[s],u=t(c,g),u&&h.push(e(c)+(n?": ":":")+u));else for(c in g)Object.hasOwnProperty.call(g,c)&&(u=t(c,g),u&&h.push(e(c)+(n?": ":":")+u));return u=0===h.length?"{}":n?"{\n"+n+h.join(",\n"+n)+"\n"+p+"}":"{"+h.join(",")+"}",n=p,u}}var n,i,r,a=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,s={"\b":"\\b","	":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},l={}.toString;typeof Date.prototype.toJSON!==Ee&&(Date.prototype.toJSON=function(){var e=this;return isFinite(e.valueOf())?o(e.getUTCFullYear(),4)+"-"+o(e.getUTCMonth()+1)+"-"+o(e.getUTCDate())+"T"+o(e.getUTCHours())+":"+o(e.getUTCMinutes())+":"+o(e.getUTCSeconds())+"Z":null},String.prototype.toJSON=Number.prototype.toJSON=Boolean.prototype.toJSON=function(){return this.valueOf()}),typeof Ce.stringify!==Ee&&(Ce.stringify=function(e,o,a){var s;if(n="",i="",typeof a===Ie)for(s=0;a>s;s+=1)i+=" ";else typeof a===Pe&&(i=a);if(r=o,o&&typeof o!==Ee&&(typeof o!==ze||typeof o.length!==Ie))throw Error("JSON.stringify");return t("",{"":e})})}(),function(){function t(e){if(e){if(e.numberFormat)return e;if(typeof e===Pe){var t=ve.cultures;return t[e]||t[e.split("-")[0]]||null}return null}return null}function i(e){return e&&(e=t(e)),e||ve.cultures.current}function r(e){e.groupSizes=e.groupSize,e.percent.groupSizes=e.percent.groupSize,e.currency.groupSizes=e.currency.groupSize}function a(e,t,r){r=i(r);var a=r.calendars.standard,s=a.days,l=a.months;return t=a.patterns[t]||t,t.replace(u,function(t){var i,r,c;return"d"===t?r=e.getDate():"dd"===t?r=o(e.getDate()):"ddd"===t?r=s.namesAbbr[e.getDay()]:"dddd"===t?r=s.names[e.getDay()]:"M"===t?r=e.getMonth()+1:"MM"===t?r=o(e.getMonth()+1):"MMM"===t?r=l.namesAbbr[e.getMonth()]:"MMMM"===t?r=l.names[e.getMonth()]:"yy"===t?r=o(e.getFullYear()%100):"yyyy"===t?r=o(e.getFullYear(),4):"h"===t?r=e.getHours()%12||12:"hh"===t?r=o(e.getHours()%12||12):"H"===t?r=e.getHours():"HH"===t?r=o(e.getHours()):"m"===t?r=e.getMinutes():"mm"===t?r=o(e.getMinutes()):"s"===t?r=e.getSeconds():"ss"===t?r=o(e.getSeconds()):"f"===t?r=ke.floor(e.getMilliseconds()/100):"ff"===t?(r=e.getMilliseconds(),r>99&&(r=ke.floor(r/10)),r=o(r)):"fff"===t?r=o(e.getMilliseconds(),3):"tt"===t?r=e.getHours()<12?a.AM[0]:a.PM[0]:"zzz"===t?(i=e.getTimezoneOffset(),c=0>i,r=(""+ke.abs(i/60)).split(".")[0],i=ke.abs(i)-60*r,r=(c?"+":"-")+o(r),r+=":"+o(i)):("zz"===t||"z"===t)&&(r=e.getTimezoneOffset()/60,c=0>r,r=(""+ke.abs(r)).split(".")[0],r=(c?"+":"-")+("zz"===t?o(r):r)),r!==n?r:t.slice(1,t.length-1)})}function s(e,t,r){r=i(r);var o,a,s,c,u,b,w,x,k,C,S,T,A,D,M,E,P,I,z,R,F,B,L,O=r.numberFormat,H=O.groupSize[0],N=O[m],V=O[g],U=O.decimals,W=O.pattern[0],j=[],G=0>e,q=p,$=p,Y=-1;if(e===n)return p;if(!isFinite(e))return e;if(!t)return r.name.length?e.toLocaleString():""+e;if(u=d.exec(t)){if(t=u[1].toLowerCase(),a="c"===t,s="p"===t,(a||s)&&(O=a?O.currency:O.percent,H=O.groupSize[0],N=O[m],V=O[g],U=O.decimals,o=O.symbol,W=O.pattern[G?0:1]),c=u[2],c&&(U=+c),"e"===t)return c?e.toExponential(U):e.toExponential();if(s&&(e*=100),e=l(e,U),G=0>e,e=e.split(g),b=e[0],w=e[1],G&&(b=b.substring(1)),$=b,x=b.length,x>=H)for($=p,C=0;x>C;C++)C>0&&(x-C)%H===0&&($+=N),$+=b.charAt(C);if(w&&($+=V+w),"n"===t&&!G)return $;for(e=p,C=0,S=W.length;S>C;C++)T=W.charAt(C),e+="n"===T?$:"$"===T||"%"===T?o:T;return e}if(G&&(e=-e),(t.indexOf("'")>-1||t.indexOf('"')>-1||t.indexOf("\\")>-1)&&(t=t.replace(h,function(e){var t=e.charAt(0).replace("\\",""),n=e.slice(1).replace(t,"");return j.push(n),y})),t=t.split(";"),G&&t[1])t=t[1],D=!0;else if(0===e){if(t=t[2]||t[0],-1==t.indexOf(v)&&-1==t.indexOf(_))return t}else t=t[0];if(R=t.indexOf("%"),F=t.indexOf("$"),s=-1!=R,a=-1!=F,s&&(e*=100),a&&"\\"===t[F-1]&&(t=t.split("\\").join(""),a=!1),(a||s)&&(O=a?O.currency:O.percent,H=O.groupSize[0],N=O[m],V=O[g],U=O.decimals,o=O.symbol),A=t.indexOf(m)>-1,A&&(t=t.replace(f,p)),M=t.indexOf(g),S=t.length,-1!=M?(w=(""+e).split("e"),w=w[1]?l(e,Math.abs(w[1])):w[0],w=w.split(g)[1]||p,P=t.lastIndexOf(_)-M,E=t.lastIndexOf(v)-M,I=P>-1,z=E>-1,C=w.length,I||z||(t=t.substring(0,M)+t.substring(M+1),S=t.length,M=-1,C=0),I&&P>E?C=P:E>P&&(z&&C>E?C=E:I&&P>C&&(C=P)),C>-1&&(e=l(e,C))):e=l(e),E=t.indexOf(v),B=P=t.indexOf(_),Y=-1==E&&-1!=P?P:-1!=E&&-1==P?E:E>P?P:E,E=t.lastIndexOf(v),P=t.lastIndexOf(_),L=-1==E&&-1!=P?P:-1!=E&&-1==P?E:E>P?E:P,Y==S&&(L=Y),-1!=Y){if($=(""+e).split(g),b=$[0],w=$[1]||p,x=b.length,k=w.length,G&&-1*e>=0&&(G=!1),A)if(x===H&&M-B>x)b=N+b;else if(x>H){for($=p,C=0;x>C;C++)C>0&&(x-C)%H===0&&($+=N),$+=b.charAt(C);b=$}for(e=t.substring(0,Y),G&&!D&&(e+="-"),C=Y;S>C;C++){if(T=t.charAt(C),-1==M){if(x>L-C){e+=b;break}}else if(-1!=P&&C>P&&(q=p),x>=M-C&&M-C>-1&&(e+=b,C=M),M===C){e+=(w?V:p)+w,C+=L-M+1;continue}T===_?(e+=T,q=T):T===v&&(e+=q)}if(L>=Y&&(e+=t.substring(L+1)),a||s){for($=p,C=0,S=e.length;S>C;C++)T=e.charAt(C),$+="$"===T||"%"===T?o:T;e=$}if(S=j.length)for(C=0;S>C;C++)e=e.replace(y,j[C])}return e}var l,c,u=/dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|fff|ff|f|tt|ss|s|zzz|zz|z|"[^"]*"|'[^']*'/g,d=/^(n|c|p|e)(\d*)$/i,h=/(\\.)|(['][^']*[']?)|(["][^"]*["]?)/g,f=/\,/g,p="",g=".",m=",",v="#",_="0",y="??",b="en-US",w={}.toString;ve.cultures["en-US"]={name:b,numberFormat:{pattern:["-n"],decimals:2,",":",",".":".",groupSize:[3],percent:{pattern:["-n %","n %"],decimals:2,",":",",".":".",groupSize:[3],symbol:"%"},currency:{name:"US Dollar",abbr:"USD",pattern:["($n)","$n"],decimals:2,",":",",".":".",groupSize:[3],symbol:"$"}},calendars:{standard:{days:{names:["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],namesAbbr:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],namesShort:["Su","Mo","Tu","We","Th","Fr","Sa"]},months:{names:["January","February","March","April","May","June","July","August","September","October","November","December"],namesAbbr:["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]},AM:["AM","am","AM"],PM:["PM","pm","PM"],patterns:{d:"M/d/yyyy",D:"dddd, MMMM dd, yyyy",F:"dddd, MMMM dd, yyyy h:mm:ss tt",g:"M/d/yyyy h:mm tt",G:"M/d/yyyy h:mm:ss tt",m:"MMMM dd",M:"MMMM dd",s:"yyyy'-'MM'-'ddTHH':'mm':'ss",t:"h:mm tt",T:"h:mm:ss tt",u:"yyyy'-'MM'-'dd HH':'mm':'ss'Z'",y:"MMMM, yyyy",Y:"MMMM, yyyy"},"/":"/",":":":",firstDay:0,twoDigitYearMax:2029}}},ve.culture=function(e){var i,o=ve.cultures;return e===n?o.current:(i=t(e)||o[b],i.calendar=i.calendars.standard,o.current=i,Ne&&!Ne.load&&r(i.numberFormat),n)},ve.findCulture=t,ve.getCulture=i,ve.culture(b),l=function(e,t){return t=t||0,e=(""+e).split("e"),e=Math.round(+(e[0]+"e"+(e[1]?+e[1]+t:t))),e=(""+e).split("e"),e=+(e[0]+"e"+(e[1]?+e[1]-t:-t)),e.toFixed(t)},c=function(e,t,i){if(t){if("[object Date]"===w.call(e))return a(e,t,i);if(typeof e===Ie)return s(e,t,i)}return e!==n?e:""},Ne&&!Ne.load&&(c=function(t,n,i){return e.isPlainObject(i)&&(i=i.name),Ne.format(t,n,i)}),ve.format=function(e){var t=arguments;return e.replace(Ae,function(e,n,i){var r=t[parseInt(n,10)+1];return c(r,i?i.substring(1):"")})},ve._extractFormat=function(e){return"{0:"===e.slice(0,3)&&(e=e.slice(3,e.length-1)),e},ve._activeElement=function(){try{return document.activeElement}catch(e){return document.documentElement.activeElement}},ve._round=l,ve.toString=c}(),function(){function t(e,t,n){return!(e>=t&&n>=e)}function i(e){return e.charAt(0)}function r(t){return e.map(t,i)}function o(e,t){t||23!==e.getHours()||e.setHours(e.getHours()+2)}function a(e){for(var t=0,n=e.length,i=[];n>t;t++)i[t]=(e[t]+"").toLowerCase();return i}function s(e){var t,n={};for(t in e)n[t]=a(e[t]);return n}function l(e,i,a){if(!e)return null;var l,c,u,d,p,g,m,_,y,b,w,x,k,C=function(e){for(var t=0;i[B]===e;)t++,B++;return t>0&&(B-=1),t},S=function(t){var n=v[t]||RegExp("^\\d{1,"+t+"}"),i=e.substr(L,t).match(n);return i?(i=i[0],L+=i.length,parseInt(i,10)):null},T=function(t,n){for(var i,r,o,a=0,s=t.length,l=0,c=0;s>a;a++)i=t[a],r=i.length,o=e.substr(L,r),n&&(o=o.toLowerCase()),o==i&&r>l&&(l=r,c=a);return l?(L+=l,c+1):null},A=function(){var t=!1;return e.charAt(L)===i[B]&&(L++,t=!0),t},D=a.calendars.standard,M=null,E=null,P=null,I=null,z=null,R=null,F=null,B=0,L=0,O=!1,H=new Date,N=D.twoDigitYearMax||2029,V=H.getFullYear();for(i||(i="d"),d=D.patterns[i],d&&(i=d),i=i.split(""),u=i.length;u>B;B++)if(l=i[B],O)"'"===l?O=!1:A();else if("d"===l){if(c=C("d"),D._lowerDays||(D._lowerDays=s(D.days)),null!==P&&c>2)continue;if(P=3>c?S(2):T(D._lowerDays[3==c?"namesAbbr":"names"],!0),null===P||t(P,1,31))return null}else if("M"===l){if(c=C("M"),D._lowerMonths||(D._lowerMonths=s(D.months)),E=3>c?S(2):T(D._lowerMonths[3==c?"namesAbbr":"names"],!0),null===E||t(E,1,12))return null;E-=1}else if("y"===l){if(c=C("y"),M=S(c),null===M)return null;2==c&&("string"==typeof N&&(N=V+parseInt(N,10)),M=V-V%100+M,M>N&&(M-=100))}else if("h"===l){if(C("h"),I=S(2),12==I&&(I=0),null===I||t(I,0,11))return null}else if("H"===l){if(C("H"),I=S(2),null===I||t(I,0,23))return null}else if("m"===l){if(C("m"),z=S(2),null===z||t(z,0,59))return null}else if("s"===l){if(C("s"),R=S(2),null===R||t(R,0,59))return null}else if("f"===l){if(c=C("f"),k=e.substr(L,c).match(v[3]),F=S(c),null!==F&&(k=k[0].length,3>k&&(F*=Math.pow(10,3-k)),c>3&&(F=parseInt((""+F).substring(0,3),10))),null===F||t(F,0,999))return null}else if("t"===l){if(c=C("t"),_=D.AM,y=D.PM,1===c&&(_=r(_),y=r(y)),p=T(y),!p&&!T(_))return null}else if("z"===l){if(g=!0,c=C("z"),"Z"===e.substr(L,1)){A();continue}if(m=e.substr(L,6).match(c>2?f:h),!m)return null;if(m=m[0].split(":"),b=m[0],w=m[1],!w&&b.length>3&&(L=b.length-2,w=b.substring(L),b=b.substring(0,L)),b=parseInt(b,10),t(b,-12,13))return null;if(c>2&&(w=parseInt(w,10),isNaN(w)||t(w,0,59)))return null}else if("'"===l)O=!0,A();else if(!A())return null;return x=null!==I||null!==z||R||null,null===M&&null===E&&null===P&&x?(M=V,E=H.getMonth(),P=H.getDate()):(null===M&&(M=V),null===P&&(P=1)),p&&12>I&&(I+=12),g?(b&&(I+=-b),w&&(z+=-w),e=new Date(Date.UTC(M,E,P,I,z,R,F))):(e=new Date(M,E,P,I,z,R,F),o(e,I)),100>M&&e.setFullYear(M),e.getDate()!==P&&g===n?null:e}function c(e){var t="-"===e.substr(0,1)?-1:1;return e=e.substring(1),e=60*parseInt(e.substr(0,2),10)+parseInt(e.substring(2),10),t*e}var u=/\u00A0/g,d=/[eE][\-+]?[0-9]+/,h=/[+|\-]\d{1,2}/,f=/[+|\-]\d{1,2}:?\d{2}/,p=/^\/Date\((.*?)\)\/$/,g=/[+-]\d*/,m=["G","g","d","F","D","y","m","T","t"],v={2:/^\d{1,2}/,3:/^\d{1,3}/,4:/^\d{4}/},_={}.toString;ve.parseDate=function(e,t,n){var i,r,o,a,s;if("[object Date]"===_.call(e))return e;if(i=0,r=null,e&&0===e.indexOf("/D")&&(r=p.exec(e)))return r=r[1],s=g.exec(r.substring(1)),r=new Date(parseInt(r,10)),s&&(s=c(s[0]),r=ve.timezone.apply(r,0),r=ve.timezone.convert(r,0,-1*s)),r;if(n=ve.getCulture(n),!t){for(t=[],a=n.calendar.patterns,o=m.length;o>i;i++)t[i]=a[m[i]];i=0,t=["yyyy/MM/dd HH:mm:ss","yyyy/MM/dd HH:mm","yyyy/MM/dd","ddd MMM dd yyyy HH:mm:ss","yyyy-MM-ddTHH:mm:ss.fffffffzzz","yyyy-MM-ddTHH:mm:ss.fffzzz","yyyy-MM-ddTHH:mm:sszzz","yyyy-MM-ddTHH:mm:ss.fffffff","yyyy-MM-ddTHH:mm:ss.fff","yyyy-MM-ddTHH:mmzzz","yyyy-MM-ddTHH:mmzz","yyyy-MM-ddTHH:mm:ss","yyyy-MM-ddTHH:mm","yyyy-MM-dd HH:mm:ss","yyyy-MM-dd HH:mm","yyyy-MM-dd","HH:mm:ss","HH:mm"].concat(t)}for(t=be(t)?t:[t],o=t.length;o>i;i++)if(r=l(e,t[i],n))return r;return r},ve.parseInt=function(e,t){var n=ve.parseFloat(e,t);return n&&(n=0|n),n},ve.parseFloat=function(e,t,n){if(!e&&0!==e)return null;if(typeof e===Ie)return e;e=""+e,t=ve.getCulture(t);var i,r,o=t.numberFormat,a=o.percent,s=o.currency,l=s.symbol,c=a.symbol,h=e.indexOf("-");return d.test(e)?(e=parseFloat(e.replace(o["."],".")),isNaN(e)&&(e=null),e):h>0?null:(h=h>-1,e.indexOf(l)>-1||n&&n.toLowerCase().indexOf("c")>-1?(o=s,i=o.pattern[0].replace("$",l).split("n"),e.indexOf(i[0])>-1&&e.indexOf(i[1])>-1&&(e=e.replace(i[0],"").replace(i[1],""),h=!0)):e.indexOf(c)>-1&&(r=!0,o=a,l=c),e=e.replace("-","").replace(l,"").replace(u," ").split(o[","].replace(u," ")).join("").replace(o["."],"."),e=parseFloat(e),isNaN(e)?e=null:h&&(e*=-1),e&&r&&(e/=100),e)},Ne&&!Ne.load&&(ve.parseDate=function(e,t,n){return"[object Date]"===_.call(e)?e:Ne.parseDate(e,t,n)},ve.parseFloat=function(t,i){return typeof t===Ie?t:t===n||null===t?null:(e.isPlainObject(i)&&(i=i.name),t=Ne.parseFloat(t,i),isNaN(t)?null:t)})}(),function(){var i,r,o,a,s,l,c;Se._scrollbar=n,Se.scrollbar=function(e){if(isNaN(Se._scrollbar)||e){var t,n=document.createElement("div");return n.style.cssText="overflow:scroll;overflow-x:hidden;zoom:1;clear:both;display:block",n.innerHTML="&nbsp;",document.body.appendChild(n),Se._scrollbar=t=n.offsetWidth-n.scrollWidth,document.body.removeChild(n),t}return Se._scrollbar},Se.isRtl=function(t){return e(t).closest(".k-rtl").length>0},i=document.createElement("table");try{i.innerHTML="<tr><td></td></tr>",Se.tbodyInnerHtml=!0}catch(d){Se.tbodyInnerHtml=!1}Se.touch="ontouchstart"in t,Se.msPointers=t.MSPointerEvent,Se.pointers=t.PointerEvent,r=Se.transitions=!1,o=Se.transforms=!1,a="HTMLElement"in t?HTMLElement.prototype:[],Se.hasHW3D="WebKitCSSMatrix"in t&&"m11"in new t.WebKitCSSMatrix||"MozPerspective"in document.documentElement.style||"msPerspective"in document.documentElement.style,ye(["Moz","webkit","O","ms"],function(){var e,t=""+this,a=typeof i.style[t+"Transition"]===Pe;return a||typeof i.style[t+"Transform"]===Pe?(e=t.toLowerCase(),o={css:"ms"!=e?"-"+e+"-":"",prefix:t,event:"o"===e||"webkit"===e?e:""},a&&(r=o,r.event=r.event?r.event+"TransitionEnd":"transitionend"),!1):n}),i=null,Se.transforms=o,Se.transitions=r,Se.devicePixelRatio=t.devicePixelRatio===n?1:t.devicePixelRatio;try{Se.screenWidth=t.outerWidth||t.screen?t.screen.availWidth:t.innerWidth,Se.screenHeight=t.outerHeight||t.screen?t.screen.availHeight:t.innerHeight}catch(d){Se.screenWidth=t.screen.availWidth,Se.screenHeight=t.screen.availHeight}Se.detectOS=function(e){var n,i,r=!1,o=[],a=!/mobile safari/i.test(e),s={wp:/(Windows Phone(?: OS)?)\s(\d+)\.(\d+(\.\d+)?)/,fire:/(Silk)\/(\d+)\.(\d+(\.\d+)?)/,android:/(Android|Android.*(?:Opera|Firefox).*?\/)\s*(\d+)\.(\d+(\.\d+)?)/,iphone:/(iPhone|iPod).*OS\s+(\d+)[\._]([\d\._]+)/,ipad:/(iPad).*OS\s+(\d+)[\._]([\d_]+)/,meego:/(MeeGo).+NokiaBrowser\/(\d+)\.([\d\._]+)/,webos:/(webOS)\/(\d+)\.(\d+(\.\d+)?)/,blackberry:/(BlackBerry|BB10).*?Version\/(\d+)\.(\d+(\.\d+)?)/,playbook:/(PlayBook).*?Tablet\s*OS\s*(\d+)\.(\d+(\.\d+)?)/,windows:/(MSIE)\s+(\d+)\.(\d+(\.\d+)?)/,tizen:/(tizen).*?Version\/(\d+)\.(\d+(\.\d+)?)/i,sailfish:/(sailfish).*rv:(\d+)\.(\d+(\.\d+)?).*firefox/i,ffos:/(Mobile).*rv:(\d+)\.(\d+(\.\d+)?).*Firefox/},l={ios:/^i(phone|pad|pod)$/i,android:/^android|fire$/i,blackberry:/^blackberry|playbook/i,windows:/windows/,wp:/wp/,flat:/sailfish|ffos|tizen/i,meego:/meego/},c={tablet:/playbook|ipad|fire/i},d={omini:/Opera\sMini/i,omobile:/Opera\sMobi/i,firefox:/Firefox|Fennec/i,mobilesafari:/version\/.*safari/i,ie:/MSIE|Windows\sPhone/i,chrome:/chrome|crios/i,webkit:/webkit/i};for(i in s)if(s.hasOwnProperty(i)&&(o=e.match(s[i]))){if("windows"==i&&"plugins"in navigator)return!1;r={},r.device=i,r.tablet=u(i,c,!1),r.browser=u(e,d,"default"),r.name=u(i,l),r[r.name]=!0,r.majorVersion=o[2],r.minorVersion=o[3].replace("_","."),n=r.minorVersion.replace(".","").substr(0,2),r.flatVersion=r.majorVersion+n+Array(3-(3>n.length?n.length:2)).join("0"),r.cordova=typeof t.PhoneGap!==Be||typeof t.cordova!==Be,r.appMode=t.navigator.standalone||/file|local|wmapp/.test(t.location.protocol)||r.cordova,r.android&&(1.5>Se.devicePixelRatio&&400>r.flatVersion||a)&&(Se.screenWidth>800||Se.screenHeight>800)&&(r.tablet=i);break}return r},s=Se.mobileOS=Se.detectOS(navigator.userAgent),Se.wpDevicePixelRatio=s.wp?screen.width/320:0,Se.kineticScrollNeeded=s&&(Se.touch||Se.msPointers||Se.pointers),Se.hasNativeScrolling=!1,(s.ios||s.android&&s.majorVersion>2||s.wp)&&(Se.hasNativeScrolling=s),Se.mouseAndTouchPresent=Se.touch&&!(Se.mobileOS.ios||Se.mobileOS.android),Se.detectBrowser=function(e){var t,n=!1,i=[],r={edge:/(edge)[ \/]([\w.]+)/i,webkit:/(chrome)[ \/]([\w.]+)/i,safari:/(webkit)[ \/]([\w.]+)/i,opera:/(opera)(?:.*version|)[ \/]([\w.]+)/i,msie:/(msie\s|trident.*? rv:)([\w.]+)/i,mozilla:/(mozilla)(?:.*? rv:([\w.]+)|)/i};for(t in r)if(r.hasOwnProperty(t)&&(i=e.match(r[t]))){n={},n[t]=!0,n[i[1].toLowerCase().split(" ")[0].split("/")[0]]=!0,n.version=parseInt(document.documentMode||i[2],10);break}return n},Se.browser=Se.detectBrowser(navigator.userAgent),Se.detectClipboardAccess=function(){var e={copy:document.queryCommandSupported?document.queryCommandSupported("copy"):!1,cut:document.queryCommandSupported?document.queryCommandSupported("cut"):!1,paste:document.queryCommandSupported?document.queryCommandSupported("paste"):!1};return Se.browser.chrome&&Se.browser.version>=43&&(e.copy=!0,e.cut=!0),e},Se.clipboard=Se.detectClipboardAccess(),Se.zoomLevel=function(){var e,n,i;try{return e=Se.browser,n=0,i=document.documentElement,e.msie&&11==e.version&&i.scrollHeight>i.clientHeight&&!Se.touch&&(n=Se.scrollbar()),Se.touch?i.clientWidth/t.innerWidth:e.msie&&e.version>=10?((top||t).document.documentElement.offsetWidth+n)/(top||t).innerWidth:1}catch(r){return 1}},Se.cssBorderSpacing=n!==document.documentElement.style.borderSpacing&&!(Se.browser.msie&&8>Se.browser.version),function(t){var n="",i=e(document.documentElement),r=parseInt(t.version,10);t.msie?n="ie":t.mozilla?n="ff":t.safari?n="safari":t.webkit?n="webkit":t.opera?n="opera":t.edge&&(n="edge"),n&&(n="k-"+n+" k-"+n+r),Se.mobileOS&&(n+=" k-mobile"),i.addClass(n)}(Se.browser),Se.eventCapture=document.documentElement.addEventListener,l=document.createElement("input"),Se.placeholder="placeholder"in l,Se.propertyChangeEvent="onpropertychange"in l,Se.input=function(){for(var e,t=["number","date","time","month","week","datetime","datetime-local"],n=t.length,i="test",r={},o=0;n>o;o++)e=t[o],l.setAttribute("type",e),l.value=i,r[e.replace("-","")]="text"!==l.type&&l.value!==i;return r}(),l.style.cssText="float:left;",Se.cssFloat=!!l.style.cssFloat,l=null,Se.stableSort=function(){var e,t=513,n=[{index:0,field:"b"}];for(e=1;t>e;e++)n.push({index:e,field:"a"});return n.sort(function(e,t){return e.field>t.field?1:t.field>e.field?-1:0}),1===n[0].index}(),Se.matchesSelector=a.webkitMatchesSelector||a.mozMatchesSelector||a.msMatchesSelector||a.oMatchesSelector||a.matchesSelector||a.matches||function(t){for(var n=document.querySelectorAll?(this.parentNode||document).querySelectorAll(t)||[]:e(t),i=n.length;i--;)if(n[i]==this)return!0;return!1},Se.pushState=t.history&&t.history.pushState,c=document.documentMode,Se.hashChange="onhashchange"in t&&!(Se.browser.msie&&(!c||8>=c)),Se.customElements="registerElement"in t.document}(),W={left:{reverse:"right"},right:{reverse:"left"},down:{reverse:"up"},up:{reverse:"down"},top:{reverse:"bottom"},bottom:{reverse:"top"},"in":{reverse:"out"},out:{reverse:"in"}},j={},e.extend(j,{enabled:!0,Element:function(t){this.element=e(t)},promise:function(e,t){e.is(":visible")||e.css({display:e.data("olddisplay")||"block"}).css("display"),t.hide&&e.data("olddisplay",e.css("display")).hide(),t.init&&t.init(),t.completeCallback&&t.completeCallback(e),e.dequeue()},disable:function(){this.enabled=!1,this.promise=this.promiseShim},enable:function(){this.enabled=!0,this.promise=this.animatedPromise}}),j.promiseShim=j.promise,"kendoAnimate"in e.fn||_e(e.fn,{kendoStop:function(e,t){return this.stop(e,t)},kendoAnimate:function(e,t,n,i){return w(this,e,t,n,i)},kendoAddClass:function(e,t){return ve.toggleClass(this,e,t,!0)},kendoRemoveClass:function(e,t){return ve.toggleClass(this,e,t,!1)},kendoToggleClass:function(e,t,n){return ve.toggleClass(this,e,t,n)}}),G=/&/g,q=/</g,$=/"/g,Y=/'/g,K=/>/g,Q=function(e){return e.target},Se.touch&&(Q=function(e){var t="originalEvent"in e?e.originalEvent.changedTouches:"changedTouches"in e?e.changedTouches:null;return t?document.elementFromPoint(t[0].clientX,t[0].clientY):e.target},ye(["swipe","swipeLeft","swipeRight","swipeUp","swipeDown","doubleTap","tap"],function(t,n){e.fn[n]=function(e){return this.bind(n,e)}})),Se.touch?Se.mobileOS?(Se.mousedown="touchstart",Se.mouseup="touchend",Se.mousemove="touchmove",Se.mousecancel="touchcancel",Se.click="touchend",Se.resize="orientationchange"):(Se.mousedown="mousedown touchstart",Se.mouseup="mouseup touchend",Se.mousemove="mousemove touchmove",Se.mousecancel="mouseleave touchcancel",Se.click="click",Se.resize="resize"):Se.pointers?(Se.mousemove="pointermove",Se.mousedown="pointerdown",Se.mouseup="pointerup",Se.mousecancel="pointercancel",Se.click="pointerup",Se.resize="orientationchange resize"):Se.msPointers?(Se.mousemove="MSPointerMove",Se.mousedown="MSPointerDown",Se.mouseup="MSPointerUp",Se.mousecancel="MSPointerCancel",Se.click="MSPointerUp",Se.resize="orientationchange resize"):(Se.mousemove="mousemove",Se.mousedown="mousedown",Se.mouseup="mouseup",Se.mousecancel="mouseleave",Se.click="click",Se.resize="resize"),X=function(e,t){var n,i,r,o,a=t||"d",s=1;for(i=0,r=e.length;r>i;i++)o=e[i],""!==o&&(n=o.indexOf("["),0!==n&&(-1==n?o="."+o:(s++,o="."+o.substring(0,n)+" || {})"+o.substring(n))),s++,a+=o+(r-1>i?" || {})":")"));return Array(s).join("(")+a},J=/^([a-z]+:)?\/\//i,_e(ve,{widgets:[],_widgetRegisteredCallbacks:[],ui:ve.ui||{},fx:ve.fx||y,effects:ve.effects||j,mobile:ve.mobile||{},data:ve.data||{},dataviz:ve.dataviz||{},drawing:ve.drawing||{},spreadsheet:{messages:{}},keys:{INSERT:45,DELETE:46,BACKSPACE:8,TAB:9,ENTER:13,ESC:27,LEFT:37,UP:38,RIGHT:39,DOWN:40,END:35,HOME:36,SPACEBAR:32,PAGEUP:33,PAGEDOWN:34,F2:113,F10:121,F12:123,NUMPAD_PLUS:107,NUMPAD_MINUS:109,NUMPAD_DOT:110},support:ve.support||Se,animate:ve.animate||w,ns:"",attr:function(e){return"data-"+ve.ns+e},getShadows:a,wrap:s,deepExtend:l,getComputedStyles:f,webComponents:ve.webComponents||[],isScrollable:p,scrollLeft:g,size:m,toCamelCase:h,toHyphens:d,getOffset:ve.getOffset||v,parseEffects:ve.parseEffects||_,toggleClass:ve.toggleClass||x,directions:ve.directions||W,Observable:F,Class:i,Template:P,template:we(P.compile,P),render:we(P.render,P),stringify:we(Ce.stringify,Ce),eventTarget:Q,htmlEncode:k,isLocalUrl:function(e){return e&&!J.test(e)},expr:function(e,t,n){return e=e||"",typeof t==Pe&&(n=t,t=!1),n=n||"d",e&&"["!==e.charAt(0)&&(e="."+e),t?(e=e.replace(/"([^.]*)\.([^"]*)"/g,'"$1_$DOT$_$2"'),e=e.replace(/'([^.]*)\.([^']*)'/g,"'$1_$DOT$_$2'"),e=X(e.split("."),n),e=e.replace(/_\$DOT\$_/g,".")):e=n+e,e},getter:function(e,t){var n=e+t;return Le[n]=Le[n]||Function("d","return "+ve.expr(e,t))},setter:function(e){return Oe[e]=Oe[e]||Function("d,value",ve.expr(e)+"=value")},accessor:function(e){return{get:ve.getter(e),set:ve.setter(e)}},guid:function(){var e,t,n="";for(e=0;32>e;e++)t=16*ke.random()|0,(8==e||12==e||16==e||20==e)&&(n+="-"),n+=(12==e?4:16==e?3&t|8:t).toString(16);return n},roleSelector:function(e){return e.replace(/(\S+)/g,"["+ve.attr("role")+"=$1],").slice(0,-1)},directiveSelector:function(e){var t,n=e.split(" ");if(n)for(t=0;n.length>t;t++)"view"!=n[t]&&(n[t]=n[t].replace(/(\w*)(view|bar|strip|over)$/,"$1-$2"));return n.join(" ").replace(/(\S+)/g,"kendo-mobile-$1,").slice(0,-1)},triggeredByInput:function(e){return/^(label|input|textarea|select)$/i.test(e.target.tagName)},onWidgetRegistered:function(e){for(var t=0,n=ve.widgets.length;n>t;t++)e(ve.widgets[t]);ve._widgetRegisteredCallbacks.push(e)},logToConsole:function(e){var i=t.console;!ve.suppressLog&&n!==i&&i.log&&i.log(e)}}),Z=F.extend({init:function(e,t){var n,i=this;i.element=ve.jQuery(e).handler(i),i.angular("init",t),F.fn.init.call(i),n=t?t.dataSource:null,n&&(t=_e({},t,{dataSource:{}})),t=i.options=_e(!0,{},i.options,t),n&&(t.dataSource=n),
i.element.attr(ve.attr("role"))||i.element.attr(ve.attr("role"),(t.name||"").toLowerCase()),i.element.data("kendo"+t.prefix+t.name,i),i.bind(i.events,t)},events:[],options:{prefix:""},_hasBindingTarget:function(){return!!this.element[0].kendoBindingTarget},_tabindex:function(e){e=e||this.wrapper;var t=this.element,n="tabindex",i=e.attr(n)||t.attr(n);t.removeAttr(n),e.attr(n,isNaN(i)?0:i)},setOptions:function(t){this._setEvents(t),e.extend(this.options,t)},_setEvents:function(e){for(var t,n=this,i=0,r=n.events.length;r>i;i++)t=n.events[i],n.options[t]&&e[t]&&n.unbind(t,n.options[t]);n.bind(n.events,e)},resize:function(e){var t=this.getSize(),n=this._size;(e||(t.width>0||t.height>0)&&(!n||t.width!==n.width||t.height!==n.height))&&(this._size=t,this._resize(t,e),this.trigger("resize",t))},getSize:function(){return ve.dimensions(this.element)},size:function(e){return e?(this.setSize(e),n):this.getSize()},setSize:e.noop,_resize:e.noop,destroy:function(){var e=this;e.element.removeData("kendo"+e.options.prefix+e.options.name),e.element.removeData("handler"),e.unbind()},_destroy:function(){this.destroy()},angular:function(){},_muteAngularRebind:function(e){this._muteRebind=!0,e.call(this),this._muteRebind=!1}}),ee=Z.extend({dataItems:function(){return this.dataSource.flatView()},_angularItems:function(t){var n=this;n.angular(t,function(){return{elements:n.items(),data:e.map(n.dataItems(),function(e){return{dataItem:e}})}})}}),ve.dimensions=function(e,t){var n=e[0];return t&&e.css(t),{width:n.offsetWidth,height:n.offsetHeight}},ve.notify=xe,te=/template$/i,ne=/^\s*(?:\{(?:.|\r\n|\n)*\}|\[(?:.|\r\n|\n)*\])\s*$/,ie=/^\{(\d+)(:[^\}]+)?\}|^\[[A-Za-z_]*\]$/,re=/([A-Z])/g,ve.initWidget=function(i,r,o){var a,s,l,c,u,d,h,f,p,g,m,v,_;if(o?o.roles&&(o=o.roles):o=ve.ui.roles,i=i.nodeType?i:i[0],d=i.getAttribute("data-"+ve.ns+"role")){p=-1===d.indexOf("."),l=p?o[d]:ve.getter(d)(t),m=e(i).data(),v=l?"kendo"+l.fn.options.prefix+l.fn.options.name:"",g=p?RegExp("^kendo.*"+d+"$","i"):RegExp("^"+v+"$","i");for(_ in m)if(_.match(g)){if(_!==v)return m[_];a=m[_]}if(l){for(f=C(i,"dataSource"),r=e.extend({},S(i,l.fn.options),r),f&&(r.dataSource=typeof f===Pe?ve.getter(f)(t):f),c=0,u=l.fn.events.length;u>c;c++)s=l.fn.events[c],h=C(i,s),h!==n&&(r[s]=ve.getter(h)(t));return a?e.isEmptyObject(r)||a.setOptions(r):a=new l(i,r),a}}},ve.rolesFromNamespaces=function(e){var t,n,i=[];for(e[0]||(e=[ve.ui,ve.dataviz.ui]),t=0,n=e.length;n>t;t++)i[t]=e[t].roles;return _e.apply(null,[{}].concat(i.reverse()))},ve.init=function(t){var n=ve.rolesFromNamespaces(He.call(arguments,1));e(t).find("[data-"+ve.ns+"role]").addBack().each(function(){ve.initWidget(this,{},n)})},ve.destroy=function(t){e(t).find("[data-"+ve.ns+"role]").addBack().each(function(){var t,n=e(this).data();for(t in n)0===t.indexOf("kendo")&&typeof n[t].destroy===Ee&&n[t].destroy()})},ve.resize=function(t,n){var i,r=e(t).find("[data-"+ve.ns+"role]").addBack().filter(A);r.length&&(i=e.makeArray(r),i.sort(T),e.each(i,function(){var t=ve.widgetInstance(e(this));t&&t.resize(n)}))},ve.parseOptions=S,_e(ve.ui,{Widget:Z,DataBoundWidget:ee,roles:{},progress:function(t,n){var i,r,o,a,s=t.find(".k-loading-mask"),l=ve.support,c=l.browser;n?s.length||(i=l.isRtl(t),r=i?"right":"left",a=t.scrollLeft(),o=c.webkit&&i?t[0].scrollWidth-t.width()-2*a:0,s=e("<div class='k-loading-mask'><span class='k-loading-text'>Loading...</span><div class='k-loading-image'/><div class='k-loading-color'/></div>").width("100%").height("100%").css("top",t.scrollTop()).css(r,Math.abs(a)+o).prependTo(t)):s&&s.remove()},plugin:function(t,i,r){var o,a,s,l,c=t.fn.options.name;for(i=i||ve.ui,r=r||"",i[c]=t,i.roles[c.toLowerCase()]=t,o="getKendo"+r+c,c="kendo"+r+c,a={name:c,widget:t,prefix:r||""},ve.widgets.push(a),s=0,l=ve._widgetRegisteredCallbacks.length;l>s;s++)ve._widgetRegisteredCallbacks[s](a);e.fn[c]=function(i){var r,o=this;return typeof i===Pe?(r=He.call(arguments,1),this.each(function(){var t,a,s=e.data(this,c);if(!s)throw Error(ve.format("Cannot call method '{0}' of {1} before it is initialized",i,c));if(t=s[i],typeof t!==Ee)throw Error(ve.format("Cannot find method '{0}' of {1}",i,c));return a=t.apply(s,r),a!==n?(o=a,!1):n})):this.each(function(){return new t(this,i)}),o},e.fn[c].widget=t,e.fn[o]=function(){return this.data(c)}}}),oe={bind:function(){return this},nullObject:!0,options:{}},ae=Z.extend({init:function(e,t){Z.fn.init.call(this,e,t),this.element.autoApplyNS(),this.wrapper=this.element,this.element.addClass("km-widget")},destroy:function(){Z.fn.destroy.call(this),this.element.kendoDestroy()},options:{prefix:"Mobile"},events:[],view:function(){var e=this.element.closest(ve.roleSelector("view splitview modalview drawer"));return ve.widgetInstance(e,ve.mobile.ui)||oe},viewHasNativeScrolling:function(){var e=this.view();return e&&e.options.useNativeScrolling},container:function(){var e=this.element.closest(ve.roleSelector("view layout modalview drawer splitview"));return ve.widgetInstance(e.eq(0),ve.mobile.ui)||oe}}),_e(ve.mobile,{init:function(e){ve.init(e,ve.mobile.ui,ve.ui,ve.dataviz.ui)},appLevelNativeScrolling:function(){return ve.mobile.application&&ve.mobile.application.options&&ve.mobile.application.options.useNativeScrolling},roles:{},ui:{Widget:ae,DataBoundWidget:ee.extend(ae.prototype),roles:{},plugin:function(e){ve.ui.plugin(e,ve.mobile.ui,"Mobile")}}}),l(ve.dataviz,{init:function(e){ve.init(e,ve.dataviz.ui)},ui:{roles:{},themes:{},views:[],plugin:function(e){ve.ui.plugin(e,ve.dataviz.ui)}},roles:{}}),ve.touchScroller=function(t,n){return n||(n={}),n.useNative=!0,e(t).map(function(t,i){return i=e(i),Se.kineticScrollNeeded&&ve.mobile.ui.Scroller&&!i.data("kendoMobileScroller")?(i.kendoMobileScroller(n),i.data("kendoMobileScroller")):!1})[0]},ve.preventDefault=function(e){e.preventDefault()},ve.widgetInstance=function(e,n){var i,r,o,a,s=e.data(ve.ns+"role"),l=[];if(s){if("content"===s&&(s="scroller"),n)if(n[0])for(i=0,r=n.length;r>i;i++)l.push(n[i].roles[s]);else l.push(n.roles[s]);else l=[ve.ui.roles[s],ve.dataviz.ui.roles[s],ve.mobile.ui.roles[s]];for(s.indexOf(".")>=0&&(l=[ve.getter(s)(t)]),i=0,r=l.length;r>i;i++)if(o=l[i],o&&(a=e.data("kendo"+o.fn.options.prefix+o.fn.options.name)))return a}},ve.onResize=function(n){var i=n;return Se.mobileOS.android&&(i=function(){setTimeout(n,600)}),e(t).on(Se.resize,i),i},ve.unbindResize=function(n){e(t).off(Se.resize,n)},ve.attrValue=function(e,t){return e.data(ve.ns+t)},ve.days={Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6},e.extend(e.expr[":"],{kendoFocusable:function(t){var n=e.attr(t,"tabindex");return D(t,!isNaN(n)&&n>-1)}}),se=["mousedown","mousemove","mouseenter","mouseleave","mouseover","mouseout","mouseup","click"],le="label, input, [data-rel=external]",ce={setupMouseMute:function(){var t,n=0,i=se.length,r=document.documentElement;if(!ce.mouseTrap&&Se.eventCapture)for(ce.mouseTrap=!0,ce.bustClick=!1,ce.captureMouse=!1,t=function(t){ce.captureMouse&&("click"===t.type?ce.bustClick&&!e(t.target).is(le)&&(t.preventDefault(),t.stopPropagation()):t.stopPropagation())};i>n;n++)r.addEventListener(se[n],t,!0)},muteMouse:function(e){ce.captureMouse=!0,e.data.bustClick&&(ce.bustClick=!0),clearTimeout(ce.mouseTrapTimeoutID)},unMuteMouse:function(){clearTimeout(ce.mouseTrapTimeoutID),ce.mouseTrapTimeoutID=setTimeout(function(){ce.captureMouse=!1,ce.bustClick=!1},400)}},ue={down:"touchstart mousedown",move:"mousemove touchmove",up:"mouseup touchend touchcancel",cancel:"mouseleave touchcancel"},Se.touch&&(Se.mobileOS.ios||Se.mobileOS.android)?ue={down:"touchstart",move:"touchmove",up:"touchend touchcancel",cancel:"touchcancel"}:Se.pointers?ue={down:"pointerdown",move:"pointermove",up:"pointerup",cancel:"pointercancel pointerleave"}:Se.msPointers&&(ue={down:"MSPointerDown",move:"MSPointerMove",up:"MSPointerUp",cancel:"MSPointerCancel MSPointerLeave"}),!Se.msPointers||"onmspointerenter"in t||e.each({MSPointerEnter:"MSPointerOver",MSPointerLeave:"MSPointerOut"},function(t,n){e.event.special[t]={delegateType:n,bindType:n,handle:function(t){var i,r=this,o=t.relatedTarget,a=t.handleObj;return(!o||o!==r&&!e.contains(r,o))&&(t.type=a.origType,i=a.handler.apply(this,arguments),t.type=n),i}}}),de=function(e){return ue[e]||e},he=/([^ ]+)/g,ve.applyEventMap=function(e,t){return e=e.replace(he,de),t&&(e=e.replace(he,"$1."+t)),e},fe=e.fn.on,_e(!0,E,e),E.fn=E.prototype=new e,E.fn.constructor=E,E.fn.init=function(t,n){return n&&n instanceof e&&!(n instanceof E)&&(n=E(n)),e.fn.init.call(this,t,n,pe)},E.fn.init.prototype=E.fn,pe=E(document),_e(E.fn,{handler:function(e){return this.data("handler",e),this},autoApplyNS:function(e){return this.data("kendoNS",e||ve.guid()),this},on:function(){var e,t,n,i,r,o,a=this,s=a.data("kendoNS");return 1===arguments.length?fe.call(a,arguments[0]):(e=a,t=He.call(arguments),typeof t[t.length-1]===Be&&t.pop(),n=t[t.length-1],i=ve.applyEventMap(t[0],s),Se.mouseAndTouchPresent&&i.search(/mouse|click/)>-1&&this[0]!==document.documentElement&&(ce.setupMouseMute(),r=2===t.length?null:t[1],o=i.indexOf("click")>-1&&i.indexOf("touchend")>-1,fe.call(this,{touchstart:ce.muteMouse,touchend:ce.unMuteMouse},r,{bustClick:o})),typeof n===Pe&&(e=a.data("handler"),n=e[n],t[t.length-1]=function(t){n.call(e,t)}),t[0]=i,fe.apply(a,t),a)},kendoDestroy:function(e){return e=e||this.data("kendoNS"),e&&this.off("."+e),this}}),ve.jQuery=E,ve.eventMap=ue,ve.timezone=function(){function e(e,t){var n,i,r,o=t[3],a=t[4],s=t[5],l=t[8];return l||(t[8]=l={}),l[e]?l[e]:(isNaN(a)?0===a.indexOf("last")?(n=new Date(Date.UTC(e,u[o]+1,1,s[0]-24,s[1],s[2],0)),i=d[a.substr(4,3)],r=n.getUTCDay(),n.setUTCDate(n.getUTCDate()+i-r-(i>r?7:0))):a.indexOf(">=")>=0&&(n=new Date(Date.UTC(e,u[o],a.substr(5),s[0],s[1],s[2],0)),i=d[a.substr(0,3)],r=n.getUTCDay(),n.setUTCDate(n.getUTCDate()+i-r+(r>i?7:0))):n=new Date(Date.UTC(e,u[o],a,s[0],s[1],s[2],0)),l[e]=n)}function t(t,n,i){var r,o,a,s;return(n=n[i])?(a=new Date(t).getUTCFullYear(),n=jQuery.grep(n,function(e){var t=e[0],n=e[1];return a>=t&&(n>=a||t==a&&"only"==n||"max"==n)}),n.push(t),n.sort(function(t,n){return"number"!=typeof t&&(t=+e(a,t)),"number"!=typeof n&&(n=+e(a,n)),t-n}),s=n[jQuery.inArray(t,n)-1]||n[n.length-1],isNaN(s)?s:null):(r=i.split(":"),o=0,r.length>1&&(o=60*r[0]+ +r[1]),[-1e6,"max","-","Jan",1,[0,0,0],o,"-"])}function n(e,t,n){var i,r,o,a=t[n];if("string"==typeof a&&(a=t[a]),!a)throw Error('Timezone "'+n+'" is either incorrect, or kendo.timezones.min.js is not included.');for(i=a.length-1;i>=0&&(r=a[i][3],!(r&&e>r));i--);if(o=a[i+1],!o)throw Error('Timezone "'+n+'" not found on '+e+".");return o}function i(e,i,r,o){typeof e!=Ie&&(e=Date.UTC(e.getFullYear(),e.getMonth(),e.getDate(),e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds()));var a=n(e,i,o);return{zone:a,rule:t(e,r,a[1])}}function r(e,t){var n,r,o;return"Etc/UTC"==t||"Etc/GMT"==t?0:(n=i(e,this.zones,this.rules,t),r=n.zone,o=n.rule,ve.parseFloat(o?r[0]-o[6]:r[0]))}function o(e,t){var n=i(e,this.zones,this.rules,t),r=n.zone,o=n.rule,a=r[2];return a.indexOf("/")>=0?a.split("/")[o&&+o[6]?1:0]:a.indexOf("%s")>=0?a.replace("%s",o&&"-"!=o[7]?o[7]:""):a}function a(e,t,n){var i,r;return typeof t==Pe&&(t=this.offset(e,t)),typeof n==Pe&&(n=this.offset(e,n)),i=e.getTimezoneOffset(),e=new Date(e.getTime()+6e4*(t-n)),r=e.getTimezoneOffset(),new Date(e.getTime()+6e4*(r-i))}function s(e,t){return this.convert(e,e.getTimezoneOffset(),t)}function l(e,t){return this.convert(e,t,e.getTimezoneOffset())}function c(e){return this.apply(new Date(e),"Etc/UTC")}var u={Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11},d={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};return{zones:{},rules:{},offset:r,convert:a,apply:s,remove:l,abbr:o,toLocalDate:c}}(),ve.date=function(){function e(e,t){return 0===t&&23===e.getHours()?(e.setHours(e.getHours()+2),!0):!1}function t(t,n,i){var r=t.getHours();i=i||1,n=(n-t.getDay()+7*i)%7,t.setDate(t.getDate()+n),e(t,r)}function n(e,n,i){return e=new Date(e),t(e,n,i),e}function i(e){return new Date(e.getFullYear(),e.getMonth(),1)}function r(e){var t=new Date(e.getFullYear(),e.getMonth()+1,0),n=i(e),r=Math.abs(t.getTimezoneOffset()-n.getTimezoneOffset());return r&&t.setHours(n.getHours()+r/60),t}function o(t){return t=new Date(t.getFullYear(),t.getMonth(),t.getDate(),0,0,0),e(t,0),t}function a(e){return Date.UTC(e.getFullYear(),e.getMonth(),e.getDate(),e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds())}function s(e){return e.getTime()-o(e)}function l(e,t,n){var i,r=s(t),o=s(n);return e&&r!=o?(t>=n&&(n+=m),i=s(e),r>i&&(i+=m),r>o&&(o+=m),i>=r&&o>=i):!0}function c(e,t,n){var i,r=t.getTime(),o=n.getTime();return r>=o&&(o+=m),i=e.getTime(),i>=r&&o>=i}function u(t,n){var i=t.getHours();return t=new Date(t),d(t,n*m),e(t,i),t}function d(e,t,n){var i,r=e.getTimezoneOffset();e.setTime(e.getTime()+t),n||(i=e.getTimezoneOffset()-r,e.setTime(e.getTime()+i*g))}function h(){return o(new Date)}function f(e){return o(e).getTime()==h().getTime()}function p(e){var t=new Date(1980,1,1,0,0,0);return e&&t.setHours(e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds()),t}var g=6e4,m=864e5;return{adjustDST:e,dayOfWeek:n,setDayOfWeek:t,getDate:o,isInDateRange:c,isInTimeRange:l,isToday:f,nextDay:function(e){return u(e,1)},previousDay:function(e){return u(e,-1)},toUtcTime:a,MS_PER_DAY:m,MS_PER_HOUR:60*g,MS_PER_MINUTE:g,setTime:d,addDays:u,today:h,toInvariantTime:p,firstDayOfMonth:i,lastDayOfMonth:r,getMilliseconds:s}}(),ve.stripWhitespace=function(e){var t,n,i;if(document.createNodeIterator)for(t=document.createNodeIterator(e,NodeFilter.SHOW_TEXT,function(t){return t.parentNode==e?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT},!1);t.nextNode();)t.referenceNode&&!t.referenceNode.textContent.trim()&&t.referenceNode.parentNode.removeChild(t.referenceNode);else for(n=0;e.childNodes.length>n;n++)i=e.childNodes[n],3!=i.nodeType||/\S/.test(i.nodeValue)||(e.removeChild(i),n--),1==i.nodeType&&ve.stripWhitespace(i)},ge=t.requestAnimationFrame||t.webkitRequestAnimationFrame||t.mozRequestAnimationFrame||t.oRequestAnimationFrame||t.msRequestAnimationFrame||function(e){setTimeout(e,1e3/60)},ve.animationFrame=function(e){ge.call(t,e)},me=[],ve.queueAnimation=function(e){me[me.length]=e,1===me.length&&ve.runNextAnimation()},ve.runNextAnimation=function(){ve.animationFrame(function(){me[0]&&(me.shift()(),me[0]&&ve.runNextAnimation())})},ve.parseQueryStringParams=function(e){for(var t=e.split("?")[1]||"",n={},i=t.split(/&|=/),r=i.length,o=0;r>o;o+=2)""!==i[o]&&(n[decodeURIComponent(i[o])]=decodeURIComponent(i[o+1]));return n},ve.elementUnderCursor=function(e){return n!==e.x.client?document.elementFromPoint(e.x.client,e.y.client):n},ve.wheelDeltaY=function(e){var t,i=e.originalEvent,r=i.wheelDeltaY;return i.wheelDelta?(r===n||r)&&(t=i.wheelDelta):i.detail&&i.axis===i.VERTICAL_AXIS&&(t=10*-i.detail),t},ve.throttle=function(e,t){var i,r,o=0;return!t||0>=t?e:(r=function(){function r(){e.apply(a,l),o=+new Date}var a=this,s=+new Date-o,l=arguments;return o?(i&&clearTimeout(i),s>t?r():i=setTimeout(r,t-s),n):r()},r.cancel=function(){clearTimeout(i)},r)},ve.caret=function(t,i,r){var o,a,s,l,c=i!==n;if(r===n&&(r=i),t[0]&&(t=t[0]),!c||!t.disabled){try{t.selectionStart!==n?c?(t.focus(),t.setSelectionRange(i,r)):i=[t.selectionStart,t.selectionEnd]:document.selection&&(e(t).is(":visible")&&t.focus(),o=t.createTextRange(),c?(o.collapse(!0),o.moveStart("character",i),o.moveEnd("character",r-i),o.select()):(a=o.duplicate(),o.moveToBookmark(document.selection.createRange().getBookmark()),a.setEndPoint("EndToStart",o),s=a.text.length,l=s+o.text.length,i=[s,l]))}catch(u){i=[]}return i}},ve.compileMobileDirective=function(e,n){var i=t.angular;return e.attr("data-"+ve.ns+"role",e[0].tagName.toLowerCase().replace("kendo-mobile-","").replace("-","")),i.element(e).injector().invoke(["$compile",function(t){t(e)(n),/^\$(digest|apply)$/.test(n.$$phase)||n.$digest()}]),ve.widgetInstance(e,ve.mobile.ui)},ve.antiForgeryTokens=function(){var t={},i=e("meta[name=csrf-token],meta[name=_csrf]").attr("content"),r=e("meta[name=csrf-param],meta[name=_csrf_header]").attr("content");return e("input[name^='__RequestVerificationToken']").each(function(){t[this.name]=this.value}),r!==n&&i!==n&&(t[r]=i),t},ve.cycleForm=function(e){function t(e){var t=ve.widgetInstance(e);t&&t.focus?t.focus():e.focus()}var n=e.find("input, .k-widget").first(),i=e.find("button, .k-button").last();i.on("keydown",function(e){e.keyCode!=ve.keys.TAB||e.shiftKey||(e.preventDefault(),t(n))}),n.on("keydown",function(e){e.keyCode==ve.keys.TAB&&e.shiftKey&&(e.preventDefault(),t(i))})},function(){function n(t,n,i,r){var o,a,s=e("<form>").attr({action:i,method:"POST",target:r}),l=ve.antiForgeryTokens();l.fileName=n,o=t.split(";base64,"),l.contentType=o[0].replace("data:",""),l.base64=o[1];for(a in l)l.hasOwnProperty(a)&&e("<input>").attr({value:l[a],name:a,type:"hidden"}).appendTo(s);s.appendTo("body").submit().remove()}function i(e,t){var n,i,r,o,a,s=e;if("string"==typeof e){for(n=e.split(";base64,"),i=n[0],r=atob(n[1]),o=new Uint8Array(r.length),a=0;r.length>a;a++)o[a]=r.charCodeAt(a);s=new Blob([o.buffer],{type:i})}navigator.msSaveBlob(s,t)}function r(e,n){t.Blob&&e instanceof Blob&&(e=URL.createObjectURL(e)),o.download=n,o.href=e;var i=document.createEvent("MouseEvents");i.initMouseEvent("click",!0,!1,t,0,0,0,0,0,!1,!1,!1,!1,0,null),o.dispatchEvent(i)}var o=document.createElement("a"),a="download"in o;ve.saveAs=function(e){var t=n;e.forceProxy||(a?t=r:navigator.msSaveBlob&&(t=i)),t(e.dataURI,e.fileName,e.proxyURL,e.proxyTarget)}}()}(jQuery,window)}(),function(){!function(e,t){function n(e,t){if(!t)return e;e+"/"===t&&(e=t);var n=RegExp("^"+t,"i");return n.test(e)||(e=t+"/"+e),f.protocol+"//"+(f.host+"/"+e).replace(/\/\/+/g,"/")}function i(e){return e?"#!":"#"}function r(e){var t=f.href;return"#!"===e&&t.indexOf("#")>-1&&t.indexOf("#!")<0?null:t.split(e)[1]||""}function o(e,t){return 0===t.indexOf(e)?t.substr(e.length).replace(/\/\//g,"/"):t}function a(e){return e.replace(/^(#)?/,"#")}function s(e){return e.replace(/^(#(!)?)?/,"#!")}var l=window.kendo,c="change",u="back",d="same",h=l.support,f=window.location,p=window.history,g=50,m=l.support.browser.msie,v=/^#*/,_=window.document,y=l.Class.extend({back:function(){m?setTimeout(function(){p.back()}):p.back()},forward:function(){m?setTimeout(function(){p.forward()}):p.forward()},length:function(){return p.length},replaceLocation:function(e){f.replace(e)}}),b=y.extend({init:function(e){this.root=e},navigate:function(e){p.pushState({},_.title,n(e,this.root))},replace:function(e){p.replaceState({},_.title,n(e,this.root))},normalize:function(e){return o(this.root,e)},current:function(){var e=f.pathname;return f.search&&(e+=f.search),o(this.root,e)},change:function(t){e(window).bind("popstate.kendo",t)},stop:function(){e(window).unbind("popstate.kendo")},normalizeCurrent:function(e){var t,o=e.root,a=f.pathname,s=r(i(e.hashBang));o===a+"/"&&(t=o),o===a&&s&&(t=n(s.replace(v,""),o)),t&&p.pushState({},_.title,t)}}),w=y.extend({init:function(e){this._id=l.guid(),this.prefix=i(e),this.fix=e?s:a},navigate:function(e){f.hash=this.fix(e)},replace:function(e){this.replaceLocation(this.fix(e))},normalize:function(e){return e.indexOf(this.prefix)<0?e:e.split(this.prefix)[1]},change:function(t){h.hashChange?e(window).on("hashchange."+this._id,t):this._interval=setInterval(t,g)},stop:function(){e(window).off("hashchange."+this._id),clearInterval(this._interval)},current:function(){return r(this.prefix)},normalizeCurrent:function(e){var t=f.pathname,n=e.root;return e.pushState&&n!==t?(this.replaceLocation(n+this.prefix+o(n,t)),!0):!1}}),x=l.Observable.extend({start:function(t){if(t=t||{},this.bind([c,u,d],t),!this._started){this._started=!0,t.root=t.root||"/";var n,i=this.createAdapter(t);i.normalizeCurrent(t)||(n=i.current(),e.extend(this,{adapter:i,root:t.root,historyLength:i.length(),current:n,locations:[n]}),i.change(e.proxy(this,"_checkUrl")))}},createAdapter:function(e){return h.pushState&&e.pushState?new b(e.root):new w(e.hashBang)},stop:function(){this._started&&(this.adapter.stop(),this.unbind(c),this._started=!1)},change:function(e){this.bind(c,e)},replace:function(e,t){this._navigate(e,t,function(t){t.replace(e),this.locations[this.locations.length-1]=this.current})},navigate:function(e,n){return"#:back"===e?(this.backCalled=!0,this.adapter.back(),t):(this._navigate(e,n,function(t){t.navigate(e),this.locations.push(this.current)}),t)},_navigate:function(e,n,i){var r=this.adapter;return e=r.normalize(e),this.current===e||this.current===decodeURIComponent(e)?(this.trigger(d),t):((n||!this.trigger(c,{url:e}))&&(this.current=e,i.call(this,r),this.historyLength=r.length()),t)},_checkUrl:function(){var e=this.adapter,n=e.current(),i=e.length(),r=this.historyLength===i,o=n===this.locations[this.locations.length-2]&&r,a=this.backCalled,s=this.current;return null===n||this.current===n||this.current===decodeURIComponent(n)?!0:(this.historyLength=i,this.backCalled=!1,this.current=n,o&&this.trigger("back",{url:s,to:n})?(e.forward(),this.current=s,t):this.trigger(c,{url:n,backButtonPressed:!a})?(o?e.forward():(e.back(),this.historyLength--),this.current=s,t):(o?this.locations.pop():this.locations.push(n),t))}});l.History=x,l.History.HistoryAdapter=y,l.History.HashAdapter=w,l.History.PushStateAdapter=b,l.absoluteURL=n,l.history=new x}(window.kendo.jQuery),function(){function e(e,t){return t?e:"([^/]+)"}function t(t,n){return RegExp("^"+t.replace(p,"\\$&").replace(d,"(?:$1)?").replace(h,e).replace(f,"(.*?)")+"$",n?"i":"")}function n(e){return e.replace(/(\?.*)|(#.*)/g,"")}var i=window.kendo,r=i.history,o=i.Observable,a="init",s="routeMissing",l="change",c="back",u="same",d=/\((.*?)\)/g,h=/(\(\?)?:\w+/g,f=/\*\w+/g,p=/[\-{}\[\]+?.,\\\^$|#\s]/g,g=i.Class.extend({init:function(e,n,i){e instanceof RegExp||(e=t(e,i)),this.route=e,this._callback=n},callback:function(e,t){var r,o,a=0,s=i.parseQueryStringParams(e);for(s._back=t,e=n(e),r=this.route.exec(e).slice(1),o=r.length;o>a;a++)void 0!==r[a]&&(r[a]=decodeURIComponent(r[a]));r.push(s),this._callback.apply(null,r)},worksWith:function(e,t){return this.route.test(n(e))?(this.callback(e,t),!0):!1}}),m=o.extend({init:function(e){e||(e={}),o.fn.init.call(this),this.routes=[],this.pushState=e.pushState,this.hashBang=e.hashBang,this.root=e.root,this.ignoreCase=e.ignoreCase!==!1,this.bind([a,s,l,u],e)},destroy:function(){r.unbind(l,this._urlChangedProxy),r.unbind(u,this._sameProxy),r.unbind(c,this._backProxy),this.unbind()},start:function(){var e,t=this,n=function(){t._same()},i=function(e){t._back(e)},o=function(e){t._urlChanged(e)};r.start({same:n,change:o,back:i,pushState:t.pushState,hashBang:t.hashBang,root:t.root}),e={url:r.current||"/",preventDefault:$.noop},t.trigger(a,e)||t._urlChanged(e),this._urlChangedProxy=o,this._backProxy=i},route:function(e,t){this.routes.push(new g(e,t,this.ignoreCase))},navigate:function(e,t){i.history.navigate(e,t)},replace:function(e,t){i.history.replace(e,t)},_back:function(e){this.trigger(c,{url:e.url,to:e.to})&&e.preventDefault()},_same:function(){this.trigger(u)},_urlChanged:function(e){var t,n,r,o,a=e.url,c=e.backButtonPressed;if(a||(a="/"),this.trigger(l,{url:e.url,params:i.parseQueryStringParams(e.url),backButtonPressed:c}))return void e.preventDefault();for(t=0,n=this.routes,o=n.length;o>t;t++)if(r=n[t],r.worksWith(a,c))return;this.trigger(s,{url:a,params:i.parseQueryStringParams(a),backButtonPressed:c})&&e.preventDefault()}});i.Router=m}()}(),function(){!function(e){function t(e,t){var n=e.x.location,i=e.y.location,r=t.x.location,o=t.y.location,a=n-r,s=i-o;return{center:{x:(n+r)/2,y:(i+o)/2},distance:Math.sqrt(a*a+s*s)}}function n(e){var t,n,i,r=[],a=e.originalEvent,s=e.currentTarget,l=0;if(e.api)r.push({id:2,event:e,target:e.target,currentTarget:e.target,location:e,type:"api"});else if(e.type.match(/touch/))for(n=a?a.changedTouches:[],t=n.length;t>l;l++)i=n[l],r.push({location:i,event:e,target:i.target,currentTarget:s,id:i.identifier,type:"touch"});else r.push(o.pointers||o.msPointers?{location:a,event:e,target:e.target,currentTarget:s,id:a.pointerId,type:"pointer"}:{id:1,event:e,target:e.target,currentTarget:s,location:e,type:"mouse"});return r}function i(e){for(var t=r.eventMap.up.split(" "),n=0,i=t.length;i>n;n++)e(t[n])}var r=window.kendo,o=r.support,a=window.document,s=r.Class,l=r.Observable,c=e.now,u=e.extend,d=o.mobileOS,h=d&&d.android,f=800,p=o.browser.msie?5:0,g="press",m="hold",v="select",_="start",y="move",b="end",w="cancel",x="tap",k="release",C="gesturestart",S="gesturechange",T="gestureend",A="gesturetap",D={api:0,touch:0,mouse:9,pointer:9},M=!o.touch||o.mouseAndTouchPresent,E=s.extend({init:function(e,t){var n=this;n.axis=e,n._updateLocationData(t),n.startLocation=n.location,n.velocity=n.delta=0,n.timeStamp=c()},move:function(e){var t=this,n=e["page"+t.axis],i=c(),r=i-t.timeStamp||1;(n||!h)&&(t.delta=n-t.location,t._updateLocationData(e),t.initialDelta=n-t.startLocation,t.velocity=t.delta/r,t.timeStamp=i)},_updateLocationData:function(e){var t=this,n=t.axis;t.location=e["page"+n],t.client=e["client"+n],t.screen=e["screen"+n]}}),P=s.extend({init:function(e,t,n){u(this,{x:new E("X",n.location),y:new E("Y",n.location),type:n.type,threshold:e.threshold||D[n.type],userEvents:e,target:t,currentTarget:n.currentTarget,initialTouch:n.target,id:n.id,pressEvent:n,_moved:!1,_finished:!1})},press:function(){this._holdTimeout=setTimeout(e.proxy(this,"_hold"),this.userEvents.minHold),this._trigger(g,this.pressEvent)},_hold:function(){this._trigger(m,this.pressEvent)},move:function(e){var t=this;if(!t._finished){if(t.x.move(e.location),t.y.move(e.location),!t._moved){if(t._withinIgnoreThreshold())return;if(I.current&&I.current!==t.userEvents)return t.dispose();t._start(e)}t._finished||t._trigger(y,e)}},end:function(e){var t=this;t.endTime=c(),t._finished||(t._finished=!0,t._trigger(k,e),t._moved?t._trigger(b,e):t._trigger(x,e),clearTimeout(t._holdTimeout),t.dispose())},dispose:function(){var t=this.userEvents,n=t.touches;this._finished=!0,this.pressEvent=null,clearTimeout(this._holdTimeout),n.splice(e.inArray(this,n),1)},skip:function(){this.dispose()},cancel:function(){this.dispose()},isMoved:function(){return this._moved},_start:function(e){clearTimeout(this._holdTimeout),this.startTime=c(),this._moved=!0,this._trigger(_,e)},_trigger:function(e,t){var n=this,i=t.event,r={touch:n,x:n.x,y:n.y,target:n.target,event:i};n.userEvents.notify(e,r)&&i.preventDefault()},_withinIgnoreThreshold:function(){var e=this.x.initialDelta,t=this.y.initialDelta;return Math.sqrt(e*e+t*t)<=this.threshold}}),I=l.extend({init:function(t,n){var s,c,d,h=this,D=r.guid();n=n||{},s=h.filter=n.filter,h.threshold=n.threshold||p,h.minHold=n.minHold||f,h.touches=[],h._maxTouches=n.multiTouch?2:1,h.allowSelection=n.allowSelection,h.captureUpIfMoved=n.captureUpIfMoved,h.eventNS=D,t=e(t).handler(h),l.fn.init.call(h),u(h,{element:t,surface:e(n.global&&M?a.documentElement:n.surface||t),stopPropagation:n.stopPropagation,pressed:!1}),h.surface.handler(h).on(r.applyEventMap("move",D),"_move").on(r.applyEventMap("up cancel",D),"_end"),t.on(r.applyEventMap("down",D),s,"_start"),(o.pointers||o.msPointers)&&(11>o.browser.version?t.css("-ms-touch-action","pinch-zoom double-tap-zoom"):t.css("touch-action","none")),n.preventDragEvent&&t.on(r.applyEventMap("dragstart",D),r.preventDefault),t.on(r.applyEventMap("mousedown",D),s,{root:t},"_select"),h.captureUpIfMoved&&o.eventCapture&&(c=h.surface[0],d=e.proxy(h.preventIfMoving,h),i(function(e){c.addEventListener(e,d,!0)})),h.bind([g,m,x,_,y,b,k,w,C,S,T,A,v],n)},preventIfMoving:function(e){this._isMoved()&&e.preventDefault()},destroy:function(){var e,t=this;t._destroyed||(t._destroyed=!0,t.captureUpIfMoved&&o.eventCapture&&(e=t.surface[0],i(function(n){e.removeEventListener(n,t.preventIfMoving)})),t.element.kendoDestroy(t.eventNS),t.surface.kendoDestroy(t.eventNS),t.element.removeData("handler"),t.surface.removeData("handler"),t._disposeAll(),t.unbind(),delete t.surface,delete t.element,delete t.currentTarget)},capture:function(){I.current=this},cancel:function(){this._disposeAll(),this.trigger(w)},notify:function(e,n){var i=this,r=i.touches;if(this._isMultiTouch()){switch(e){case y:e=S;break;case b:e=T;break;case x:e=A}u(n,{touches:r},t(r[0],r[1]))}return this.trigger(e,u(n,{type:e}))},press:function(e,t,n){this._apiCall("_start",e,t,n)},move:function(e,t){this._apiCall("_move",e,t)},end:function(e,t){this._apiCall("_end",e,t)},_isMultiTouch:function(){return this.touches.length>1},_maxTouchesReached:function(){return this.touches.length>=this._maxTouches},_disposeAll:function(){for(var e=this.touches;e.length>0;)e.pop().dispose()},_isMoved:function(){return e.grep(this.touches,function(e){return e.isMoved()}).length},_select:function(e){(!this.allowSelection||this.trigger(v,{event:e}))&&e.preventDefault()},_start:function(t){var i,r,o=this,a=0,s=o.filter,l=n(t),c=l.length,u=t.which;if(!(u&&u>1||o._maxTouchesReached()))for(I.current=null,o.currentTarget=t.currentTarget,o.stopPropagation&&t.stopPropagation();c>a&&!o._maxTouchesReached();a++)r=l[a],i=s?e(r.currentTarget):o.element,i.length&&(r=new P(o,i,r),o.touches.push(r),r.press(),o._isMultiTouch()&&o.notify("gesturestart",{}))},_move:function(e){this._eachTouch("move",e)},_end:function(e){this._eachTouch("end",e)},_eachTouch:function(e,t){var i,r,o,a,s=this,l={},c=n(t),u=s.touches;for(i=0;u.length>i;i++)r=u[i],l[r.id]=r;for(i=0;c.length>i;i++)o=c[i],a=l[o.id],a&&a[e](o)},_apiCall:function(t,n,i,r){this[t]({api:!0,pageX:n,pageY:i,clientX:n,clientY:i,target:e(r||this.element)[0],stopPropagation:e.noop,preventDefault:e.noop})}});I.defaultThreshold=function(e){p=e},I.minHold=function(e){f=e},r.getTouches=n,r.touchDelta=t,r.UserEvents=I}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.ui.Widget,i=e.proxy,r=Math.abs,o=20,a=n.extend({init:function(e,r){function o(e){return function(t){s._triggerTouch(e,t)}}function a(e){return function(t){s.trigger(e,{touches:t.touches,distance:t.distance,center:t.center,event:t.event})}}var s=this;n.fn.init.call(s,e,r),r=s.options,e=s.element,s.wrapper=e,s.events=new t.UserEvents(e,{filter:r.filter,surface:r.surface,minHold:r.minHold,multiTouch:r.multiTouch,allowSelection:!0,press:o("touchstart"),hold:o("hold"),tap:i(s,"_tap"),gesturestart:a("gesturestart"),gesturechange:a("gesturechange"),gestureend:a("gestureend")}),r.enableSwipe?(s.events.bind("start",i(s,"_swipestart")),s.events.bind("move",i(s,"_swipemove"))):(s.events.bind("start",i(s,"_dragstart")),s.events.bind("move",o("drag")),s.events.bind("end",o("dragend"))),t.notify(s)},events:["touchstart","dragstart","drag","dragend","tap","doubletap","hold","swipe","gesturestart","gesturechange","gestureend"],options:{name:"Touch",surface:null,global:!1,multiTouch:!1,enableSwipe:!1,minXDelta:30,maxYDelta:20,maxDuration:1e3,minHold:800,doubleTapTimeout:800},cancel:function(){this.events.cancel()},_triggerTouch:function(e,t){this.trigger(e,{touch:t.touch,event:t.event})&&t.preventDefault()},_tap:function(e){var n=this,i=n.lastTap,r=e.touch;i&&n.options.doubleTapTimeout>r.endTime-i.endTime&&t.touchDelta(r,i).distance<o?(n._triggerTouch("doubletap",e),n.lastTap=null):(n._triggerTouch("tap",e),n.lastTap=r)},_dragstart:function(e){this._triggerTouch("dragstart",e)},_swipestart:function(e){2*r(e.x.velocity)>=r(e.y.velocity)&&e.sender.capture()},_swipemove:function(e){var t=this,n=t.options,i=e.touch,o=e.event.timeStamp-i.startTime,a=i.x.initialDelta>0?"right":"left";r(i.x.initialDelta)>=n.minXDelta&&r(i.y.initialDelta)<n.maxYDelta&&n.maxDuration>o&&(t.trigger("swipe",{direction:a,touch:e.touch}),i.cancel())}});t.ui.plugin(a)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(i,o){var l,c,u,d,h,f,p,g,m=[],v=i.logic||"and",_=i.filters;for(l=0,c=_.length;c>l;l++)i=_[l],u=i.field,p=i.value,f=i.operator,i.filters?i=n(i,o):(g=i.ignoreCase,u=u.replace(/\./g,"/"),i=a[f],o&&(i=s[f]),i&&p!==t&&(d=e.type(p),"string"===d?(h="'{1}'",p=p.replace(/'/g,"''"),
g===!0&&(u="tolower("+u+")")):h="date"===d?o?"{1:yyyy-MM-ddTHH:mm:ss+00:00}":"datetime'{1:yyyy-MM-ddTHH:mm:ss}'":"{1}",i.length>3?"substringof"!==i?h="{0}({2},"+h+")":(h="{0}("+h+",{2})","doesnotcontain"===f&&(o?(h="{0}({2},'{1}') eq -1",i="indexof"):h+=" eq false")):h="{2} {0} "+h,i=r.format(h,i,p,u))),m.push(i);return i=m.join(" "+v+" "),m.length>1&&(i="("+i+")"),i}function i(e){for(var t in e)0===t.indexOf("@odata")&&delete e[t]}var r=window.kendo,o=e.extend,a={eq:"eq",neq:"ne",gt:"gt",gte:"ge",lt:"lt",lte:"le",contains:"substringof",doesnotcontain:"substringof",endswith:"endswith",startswith:"startswith"},s=o({},a,{contains:"contains"}),l={pageSize:e.noop,page:e.noop,filter:function(e,t,i){t&&(t=n(t,i),t&&(e.$filter=t))},sort:function(t,n){var i=e.map(n,function(e){var t=e.field.replace(/\./g,"/");return"desc"===e.dir&&(t+=" desc"),t}).join(",");i&&(t.$orderby=i)},skip:function(e,t){t&&(e.$skip=t)},take:function(e,t){t&&(e.$top=t)}},c={read:{dataType:"jsonp"}};o(!0,r.data,{schemas:{odata:{type:"json",data:function(e){return e.d.results||[e.d]},total:"d.__count"}},transports:{odata:{read:{cache:!0,dataType:"jsonp",jsonp:"$callback"},update:{cache:!0,dataType:"json",contentType:"application/json",type:"PUT"},create:{cache:!0,dataType:"json",contentType:"application/json",type:"POST"},destroy:{cache:!0,dataType:"json",type:"DELETE"},parameterMap:function(e,t,n){var i,o,a,s;if(e=e||{},t=t||"read",s=(this.options||c)[t],s=s?s.dataType:"json","read"===t){i={$inlinecount:"allpages"},"json"!=s&&(i.$format="json");for(a in e)l[a]?l[a](i,e[a],n):i[a]=e[a]}else{if("json"!==s)throw Error("Only json dataType can be used for "+t+" operation.");if("destroy"!==t){for(a in e)o=e[a],"number"==typeof o&&(e[a]=o+"");i=r.stringify(e)}}return i}}}}),o(!0,r.data,{schemas:{"odata-v4":{type:"json",data:function(t){return t=e.extend({},t),i(t),t.value?t.value:[t]},total:function(e){return e["@odata.count"]}}},transports:{"odata-v4":{read:{cache:!0,dataType:"json"},update:{cache:!0,dataType:"json",contentType:"application/json;IEEE754Compatible=true",type:"PUT"},create:{cache:!0,dataType:"json",contentType:"application/json;IEEE754Compatible=true",type:"POST"},destroy:{cache:!0,dataType:"json",type:"DELETE"},parameterMap:function(e,t){var n=r.data.transports.odata.parameterMap(e,t,!0);return"read"==t&&(n.$count=!0,delete n.$inlinecount),n}}}})}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=e.isArray,r=e.isPlainObject,o=e.map,a=e.each,s=e.extend,l=n.getter,c=n.Class,u=c.extend({init:function(t){var l,c,u,d,h=this,f=t.total,p=t.model,g=t.parse,m=t.errors,v=t.serialize,_=t.data;p&&(r(p)&&(l=t.modelBase||n.data.Model,p.fields&&a(p.fields,function(t,n){r(n)&&n.field?e.isFunction(n.field)||(n=s(n,{field:h.getter(n.field)})):n={field:h.getter(n)},p.fields[t]=n}),c=p.id,c&&(u={},u[h.xpathToMember(c,!0)]={field:h.getter(c)},p.fields=s(u,p.fields),p.id=h.xpathToMember(c)),p=l.define(p)),h.model=p),f&&("string"==typeof f?(f=h.getter(f),h.total=function(e){return parseInt(f(e),10)}):"function"==typeof f&&(h.total=f)),m&&("string"==typeof m?(m=h.getter(m),h.errors=function(e){return m(e)||null}):"function"==typeof m&&(h.errors=m)),_&&("string"==typeof _?(_=h.xpathToMember(_),h.data=function(e){var t,n=h.evaluate(e,_);return n=i(n)?n:[n],h.model&&p.fields?(t=new h.model,o(n,function(e){if(e){var n,i={};for(n in p.fields)i[n]=t._parse(n,p.fields[n].field(e));return i}})):n}):"function"==typeof _&&(h.data=_)),"function"==typeof g&&(d=h.parse,h.parse=function(e){var t=g.call(h,e);return d.call(h,t)}),"function"==typeof v&&(h.serialize=v)},total:function(e){return this.data(e).length},errors:function(e){return e?e.errors:null},serialize:function(e){return e},parseDOM:function(e){var n,r,o,a,s,l,c,u={},d=e.attributes,h=d.length;for(c=0;h>c;c++)l=d[c],u["@"+l.nodeName]=l.nodeValue;for(r=e.firstChild;r;r=r.nextSibling)o=r.nodeType,3===o||4===o?u["#text"]=r.nodeValue:1===o&&(n=this.parseDOM(r),a=r.nodeName,s=u[a],i(s)?s.push(n):s=s!==t?[s,n]:n,u[a]=s);return u},evaluate:function(e,t){for(var n,r,o,a,s,l=t.split(".");n=l.shift();)if(e=e[n],i(e)){for(r=[],t=l.join("."),s=0,o=e.length;o>s;s++)a=this.evaluate(e[s],t),a=i(a)?a:[a],r.push.apply(r,a);return r}return e},parse:function(t){var n,i,r={};return n=t.documentElement||e.parseXML(t).documentElement,i=this.parseDOM(n),r[n.nodeName]=i,r},xpathToMember:function(e,t){return e?(e=e.replace(/^\//,"").replace(/\//g,"."),e.indexOf("@")>=0?e.replace(/\.?(@.*)/,t?"$1":'["$1"]'):e.indexOf("text()")>=0?e.replace(/(\.?text\(\))/,t?"#text":'["#text"]'):e):""},getter:function(e){return l(this.xpathToMember(e),!0)}});e.extend(!0,n.data,{XmlDataReader:u,readers:{xml:u}})}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n,i){return function(r){var o,a={};for(o in r)a[o]=r[o];a.field=i?n+"."+r.field:n,t==ye&&e._notifyChange&&e._notifyChange(a),e.trigger(t,a)}}function i(t,n){if(t===n)return!0;var r,o=e.type(t),a=e.type(n);if(o!==a)return!1;if("date"===o)return t.getTime()===n.getTime();if("object"!==o&&"array"!==o)return!1;for(r in t)if(!i(t[r],n[r]))return!1;return!0}function r(e,t){var n,i;for(i in e){if(n=e[i],ne(n)&&n.field&&n.field===t)return n;if(n===t)return n}return null}function o(e){this.data=e||[]}function a(e,n){if(e){var i=typeof e===fe?{field:e,dir:n}:e,r=re(i)?i:i!==t?[i]:[];return oe(r,function(e){return!!e.dir})}}function s(e){var t,n,i,r,o=e.filters;if(o)for(t=0,n=o.length;n>t;t++)i=o[t],r=i.operator,r&&typeof r===fe&&(i.operator=U[r.toLowerCase()]||r),s(i)}function l(e){return e&&!ie(e)?((re(e)||!e.filters)&&(e={logic:"and",filters:re(e)?e:[e]}),s(e),e):t}function c(e){return re(e)?e:[e]}function u(e,n){var i=typeof e===fe?{field:e,dir:n}:e,r=re(i)?i:i!==t?[i]:[];return O(r,function(e){return{field:e.field,dir:e.dir||"asc",aggregates:e.aggregates}})}function d(e,t){return e&&e.getTime&&t&&t.getTime?e.getTime()===t.getTime():e===t}function h(e,t,n,i,r,o){var a,s,l,c,u;for(t=t||[],c=t.length,a=0;c>a;a++)s=t[a],l=s.aggregate,u=s.field,e[u]=e[u]||{},o[u]=o[u]||{},o[u][l]=o[u][l]||{},e[u][l]=W[l.toLowerCase()](e[u][l],n,ce.accessor(u),i,r,o[u][l])}function f(e){return"number"==typeof e&&!isNaN(e)}function p(e){return e&&e.getTime}function g(e){var t,n=e.length,i=Array(n);for(t=0;n>t;t++)i[t]=e[t].toJSON();return i}function m(e,t,n,i,r){var o,a,s,l,c,u={};for(l=0,c=e.length;c>l;l++){o=e[l];for(a in t)s=r[a],s&&s!==a&&(u[s]||(u[s]=ce.setter(s)),u[s](o,t[a](o)),delete o[a])}}function v(e,t,n,i,r){var o,a,s,l,c;for(l=0,c=e.length;c>l;l++){o=e[l];for(a in t)o[a]=n._parse(a,t[a](o)),s=r[a],s&&s!==a&&delete o[s]}}function _(e,t,n,i,r){var o,a,s,l;for(a=0,l=e.length;l>a;a++)o=e[a],s=i[o.field],s&&s!=o.field&&(o.field=s),o.value=n._parse(o.field,o.value),o.hasSubgroups?_(o.items,t,n,i,r):v(o.items,t,n,i,r)}function y(e,t,n,i,r,o){return function(a){return a=e(a),a&&!ie(i)&&("[object Array]"===Oe.call(a)||a instanceof We||(a=[a]),n(a,i,new t,r,o)),a||[]}}function b(e,t,n,i){for(var r,o,a,s=0;t.length&&i&&(r=t[s],o=r.items,a=o.length,e&&e.field===r.field&&e.value===r.value?(e.hasSubgroups&&e.items.length?b(e.items[e.items.length-1],r.items,n,i):(o=o.slice(n,n+i),e.items=e.items.concat(o)),t.splice(s--,1)):r.hasSubgroups&&o.length?(b(r,o,n,i),r.items.length||t.splice(s--,1)):(o=o.slice(n,n+i),r.items=o,r.items.length||t.splice(s--,1)),0===o.length?n-=a:(n=0,i-=o.length),!(++s>=t.length)););t.length>s&&t.splice(s,t.length-s)}function w(e){var t,n,i,r,o,a=[];for(t=0,n=e.length;n>t;t++)if(o=e.at(t),o.hasSubgroups)a=a.concat(w(o.items));else for(i=o.items,r=0;i.length>r;r++)a.push(i.at(r));return a}function x(e,t){var n,i,r;if(t)for(n=0,i=e.length;i>n;n++)r=e.at(n),r.hasSubgroups?x(r.items,t):r.items=new je(r.items,t)}function k(e,t){for(var n=0,i=e.length;i>n;n++)if(e[n].hasSubgroups){if(k(e[n].items,t))return!0}else if(t(e[n].items,e[n]))return!0}function C(e,t,n,i){for(var r=0;e.length>r&&e[r].data!==t&&!S(e[r].data,n,i);r++);}function S(e,t,n){for(var i=0,r=e.length;r>i;i++){if(e[i]&&e[i].hasSubgroups)return S(e[i].items,t,n);if(e[i]===t||e[i]===n)return e[i]=n,!0}}function T(e,n,i,r,o){var a,s,l,c;for(a=0,s=e.length;s>a;a++)if(l=e[a],l&&!(l instanceof r))if(l.hasSubgroups===t||o){for(c=0;n.length>c;c++)if(n[c]===l){e[a]=n.at(c),C(i,n,l,e[a]);break}}else T(l.items,n,i,r,o)}function A(e,t){var n,i,r;for(n=0,i=e.length;i>n;n++)if(r=e.at(n),r.uid==t.uid)return e.splice(n,1),r}function D(e,t){return t?E(e,function(e){return e.uid&&e.uid==t.uid||e[t.idField]===t.id&&t.id!==t._defaultId}):-1}function M(e,t){return t?E(e,function(e){return e.uid==t.uid}):-1}function E(e,t){var n,i;for(n=0,i=e.length;i>n;n++)if(t(e[n]))return n;return-1}function P(e,t){var n,i;return e&&!ie(e)?(n=e[t],i=ne(n)?n.from||n.field||t:e[t]||t,ue(i)?t:i):t}function I(e,t){var n,i,r,o={};for(r in e)"filters"!==r&&(o[r]=e[r]);if(e.filters)for(o.filters=[],n=0,i=e.filters.length;i>n;n++)o.filters[n]=I(e.filters[n],t);else o.field=P(t.fields,o.field);return o}function z(e,t){var n,i,r,o,a,s=[];for(n=0,i=e.length;i>n;n++){r={},o=e[n];for(a in o)r[a]=o[a];r.field=P(t.fields,r.field),r.aggregates&&re(r.aggregates)&&(r.aggregates=z(r.aggregates,t)),s.push(r)}return s}function R(t,n){var i,r,o,a,s,l,c,u,d,h;for(t=e(t)[0],i=t.options,r=n[0],o=n[1],a=[],s=0,l=i.length;l>s;s++)d={},u=i[s],c=u.parentNode,c===t&&(c=null),u.disabled||c&&c.disabled||(c&&(d.optgroup=c.label),d[r.field]=u.text,h=u.attributes.value,h=h&&h.specified?u.value:u.text,d[o.field]=h,a.push(d));return a}function F(t,n){var i,r,o,a,s,l,c,u=e(t)[0].tBodies[0],d=u?u.rows:[],h=n.length,f=[];for(i=0,r=d.length;r>i;i++){for(s={},c=!0,a=d[i].cells,o=0;h>o;o++)l=a[o],"th"!==l.nodeName.toLowerCase()&&(c=!1,s[n[o].field]=l.innerHTML);c||f.push(s)}return f}function B(e){return function(){var t=this._data,n=Y.fn[e].apply(this,Be.call(arguments));return this._data!=t&&this._attachBubbleHandlers(),n}}function L(t,n){function i(e,t){return e.filter(t).add(e.find(t))}var r,o,a,s,l,c,u,d,h=e(t).children(),f=[],p=n[0].field,g=n[1]&&n[1].field,m=n[2]&&n[2].field,v=n[3]&&n[3].field;for(r=0,o=h.length;o>r;r++)a={_loaded:!0},s=h.eq(r),c=s[0].firstChild,d=s.children(),t=d.filter("ul"),d=d.filter(":not(ul)"),l=s.attr("data-id"),l&&(a.id=l),c&&(a[p]=3==c.nodeType?c.nodeValue:d.text()),g&&(a[g]=i(d,"a").attr("href")),v&&(a[v]=i(d,"img").attr("src")),m&&(u=i(d,".k-sprite").prop("className"),a[m]=u&&e.trim(u.replace("k-sprite",""))),t.length&&(a.items=L(t.eq(0),n)),"true"==s.attr("data-hasChildren")&&(a.hasChildren=!0),f.push(a);return f}var O,H,N,V,U,W,j,G,q,$,Y,K,Q,X,J,Z,ee=e.extend,te=e.proxy,ne=e.isPlainObject,ie=e.isEmptyObject,re=e.isArray,oe=e.grep,ae=e.ajax,se=e.each,le=e.noop,ce=window.kendo,ue=ce.isFunction,de=ce.Observable,he=ce.Class,fe="string",pe="function",ge="create",me="read",ve="update",_e="destroy",ye="change",be="sync",we="get",xe="error",ke="requestStart",Ce="progress",Se="requestEnd",Te=[ge,me,ve,_e],Ae=function(e){return e},De=ce.getter,Me=ce.stringify,Ee=Math,Pe=[].push,Ie=[].join,ze=[].pop,Re=[].splice,Fe=[].shift,Be=[].slice,Le=[].unshift,Oe={}.toString,He=ce.support.stableSort,Ne=/^\/Date\((.*?)\)\/$/,Ve=/(\r+|\n+)/g,Ue=/(?=['\\])/g,We=de.extend({init:function(e,t){var n=this;n.type=t||Ge,de.fn.init.call(n),n.length=e.length,n.wrapAll(e,n)},at:function(e){return this[e]},toJSON:function(){var e,t,n=this.length,i=Array(n);for(e=0;n>e;e++)t=this[e],t instanceof Ge&&(t=t.toJSON()),i[e]=t;return i},parent:le,wrapAll:function(e,t){var n,i,r=this,o=function(){return r};for(t=t||[],n=0,i=e.length;i>n;n++)t[n]=r.wrap(e[n],o);return t},wrap:function(e,t){var n,i=this;return null!==e&&"[object Object]"===Oe.call(e)&&(n=e instanceof i.type||e instanceof Ye,n||(e=e instanceof Ge?e.toJSON():e,e=new i.type(e)),e.parent=t,e.bind(ye,function(e){i.trigger(ye,{field:e.field,node:e.node,index:e.index,items:e.items||[this],action:e.node?e.action||"itemloaded":"itemchange"})})),e},push:function(){var e,t=this.length,n=this.wrapAll(arguments);return e=Pe.apply(this,n),this.trigger(ye,{action:"add",index:t,items:n}),e},slice:Be,sort:[].sort,join:Ie,pop:function(){var e=this.length,t=ze.apply(this);return e&&this.trigger(ye,{action:"remove",index:e-1,items:[t]}),t},splice:function(e,t,n){var i,r,o,a=this.wrapAll(Be.call(arguments,2));if(i=Re.apply(this,[e,t].concat(a)),i.length)for(this.trigger(ye,{action:"remove",index:e,items:i}),r=0,o=i.length;o>r;r++)i[r]&&i[r].children&&i[r].unbind(ye);return n&&this.trigger(ye,{action:"add",index:e,items:a}),i},shift:function(){var e=this.length,t=Fe.apply(this);return e&&this.trigger(ye,{action:"remove",index:0,items:[t]}),t},unshift:function(){var e,t=this.wrapAll(arguments);return e=Le.apply(this,t),this.trigger(ye,{action:"add",index:0,items:t}),e},indexOf:function(e){var t,n,i=this;for(t=0,n=i.length;n>t;t++)if(i[t]===e)return t;return-1},forEach:function(e){for(var t=0,n=this.length;n>t;t++)e(this[t],t,this)},map:function(e){for(var t=0,n=[],i=this.length;i>t;t++)n[t]=e(this[t],t,this);return n},reduce:function(e){var t,n=0,i=this.length;for(2==arguments.length?t=arguments[1]:i>n&&(t=this[n++]);i>n;n++)t=e(t,this[n],n,this);return t},reduceRight:function(e){var t,n=this.length-1;for(2==arguments.length?t=arguments[1]:n>0&&(t=this[n--]);n>=0;n--)t=e(t,this[n],n,this);return t},filter:function(e){for(var t,n=0,i=[],r=this.length;r>n;n++)t=this[n],e(t,n,this)&&(i[i.length]=t);return i},find:function(e){for(var t,n=0,i=this.length;i>n;n++)if(t=this[n],e(t,n,this))return t},every:function(e){for(var t,n=0,i=this.length;i>n;n++)if(t=this[n],!e(t,n,this))return!1;return!0},some:function(e){for(var t,n=0,i=this.length;i>n;n++)if(t=this[n],e(t,n,this))return!0;return!1},remove:function(e){var t=this.indexOf(e);-1!==t&&this.splice(t,1)},empty:function(){this.splice(0,this.length)}}),je=We.extend({init:function(e,t){de.fn.init.call(this),this.type=t||Ge;for(var n=0;e.length>n;n++)this[n]=e[n];this.length=n,this._parent=te(function(){return this},this)},at:function(e){var t=this[e];return t instanceof this.type?t.parent=this._parent:t=this[e]=this.wrap(t,this._parent),t}}),Ge=de.extend({init:function(e){var t,n,i=this,r=function(){return i};de.fn.init.call(this),this._handlers={};for(n in e)t=e[n],"object"==typeof t&&t&&!t.getTime&&"_"!=n.charAt(0)&&(t=i.wrap(t,n,r)),i[n]=t;i.uid=ce.guid()},shouldSerialize:function(e){return this.hasOwnProperty(e)&&"_handlers"!==e&&"_events"!==e&&typeof this[e]!==pe&&"uid"!==e},forEach:function(e){for(var t in this)this.shouldSerialize(t)&&e(this[t],t)},toJSON:function(){var e,t,n={};for(t in this)this.shouldSerialize(t)&&(e=this[t],(e instanceof Ge||e instanceof We)&&(e=e.toJSON()),n[t]=e);return n},get:function(e){var t,n=this;return n.trigger(we,{field:e}),t="this"===e?n:ce.getter(e,!0)(n)},_set:function(e,t){var n,i,r,o=this,a=e.indexOf(".")>=0;if(a)for(n=e.split("."),i="";n.length>1;){if(i+=n.shift(),r=ce.getter(i,!0)(o),r instanceof Ge)return r.set(n.join("."),t),a;i+="."}return ce.setter(e)(o,t),a},set:function(e,t){var n=this,i=e.indexOf(".")>=0,r=ce.getter(e,!0)(n);r!==t&&(r instanceof de&&this._handlers[e]&&(this._handlers[e].get&&r.unbind(we,this._handlers[e].get),r.unbind(ye,this._handlers[e].change)),n.trigger("set",{field:e,value:t})||(i||(t=n.wrap(t,e,function(){return n})),(!n._set(e,t)||e.indexOf("(")>=0||e.indexOf("[")>=0)&&n.trigger(ye,{field:e})))},parent:le,wrap:function(e,t,i){var r,o,a,s,l=this,c=Oe.call(e);return null==e||"[object Object]"!==c&&"[object Array]"!==c||(a=e instanceof We,s=e instanceof Y,"[object Object]"!==c||s||a?("[object Array]"===c||a||s)&&(a||s||(e=new We(e)),o=n(l,ye,t,!1),e.bind(ye,o),l._handlers[t]={change:o}):(e instanceof Ge||(e=new Ge(e)),r=n(l,we,t,!0),e.bind(we,r),o=n(l,ye,t,!0),e.bind(ye,o),l._handlers[t]={get:r,change:o}),e.parent=i),e}}),qe={number:function(e){return ce.parseFloat(e)},date:function(e){return ce.parseDate(e)},"boolean":function(e){return typeof e===fe?"true"===e.toLowerCase():null!=e?!!e:e},string:function(e){return null!=e?e+"":e},"default":function(e){return e}},$e={string:"",number:0,date:new Date,"boolean":!1,"default":""},Ye=Ge.extend({init:function(n){var i,r,o=this;if((!n||e.isEmptyObject(n))&&(n=e.extend({},o.defaults,n),o._initializers))for(i=0;o._initializers.length>i;i++)r=o._initializers[i],n[r]=o.defaults[r]();Ge.fn.init.call(o,n),o.dirty=!1,o.idField&&(o.id=o.get(o.idField),o.id===t&&(o.id=o._defaultId))},shouldSerialize:function(e){return Ge.fn.shouldSerialize.call(this,e)&&"uid"!==e&&!("id"!==this.idField&&"id"===e)&&"dirty"!==e&&"_accessors"!==e},_parse:function(e,t){var n,i=this,o=e,a=i.fields||{};return e=a[e],e||(e=r(a,o)),e&&(n=e.parse,!n&&e.type&&(n=qe[e.type.toLowerCase()])),n?n(t):t},_notifyChange:function(e){var t=e.action;("add"==t||"remove"==t)&&(this.dirty=!0)},editable:function(e){return e=(this.fields||{})[e],e?e.editable!==!1:!0},set:function(e,t,n){var r=this;r.editable(e)&&(t=r._parse(e,t),i(t,r.get(e))||(r.dirty=!0,Ge.fn.set.call(r,e,t,n)))},accept:function(e){var t,n,i=this,r=function(){return i};for(t in e)n=e[t],"_"!=t.charAt(0)&&(n=i.wrap(e[t],t,r)),i._set(t,n);i.idField&&(i.id=i.get(i.idField)),i.dirty=!1},isNew:function(){return this.id===this._defaultId}});Ye.define=function(e,n){n===t&&(n=e,e=Ye);var i,r,o,a,s,l,c,u,d=ee({defaults:{}},n),h={},f=d.id,p=[];if(f&&(d.idField=f),d.id&&delete d.id,f&&(d.defaults[f]=d._defaultId=""),"[object Array]"===Oe.call(d.fields)){for(l=0,c=d.fields.length;c>l;l++)o=d.fields[l],typeof o===fe?h[o]={}:o.field&&(h[o.field]=o);d.fields=h}for(r in d.fields)o=d.fields[r],a=o.type||"default",s=null,u=r,r=typeof o.field===fe?o.field:r,o.nullable||(s=d.defaults[u!==r?u:r]=o.defaultValue!==t?o.defaultValue:$e[a.toLowerCase()],"function"==typeof s&&p.push(r)),n.id===r&&(d._defaultId=s),d.defaults[u!==r?u:r]=s,o.parse=o.parse||qe[a];return p.length>0&&(d._initializers=p),i=e.extend(d),i.define=function(e){return Ye.define(i,e)},d.fields&&(i.fields=d.fields,i.idField=d.idField),i},H={selector:function(e){return ue(e)?e:De(e)},compare:function(e){var t=this.selector(e);return function(e,n){return e=t(e),n=t(n),null==e&&null==n?0:null==e?-1:null==n?1:e.localeCompare?e.localeCompare(n):e>n?1:n>e?-1:0}},create:function(e){var t=e.compare||this.compare(e.field);return"desc"==e.dir?function(e,n){return t(n,e,!0)}:t},combine:function(e){return function(t,n){var i,r,o=e[0](t,n);for(i=1,r=e.length;r>i;i++)o=o||e[i](t,n);return o}}},N=ee({},H,{asc:function(e){var t=this.selector(e);return function(e,n){var i=t(e),r=t(n);return i&&i.getTime&&r&&r.getTime&&(i=i.getTime(),r=r.getTime()),i===r?e.__position-n.__position:null==i?-1:null==r?1:i.localeCompare?i.localeCompare(r):i>r?1:-1}},desc:function(e){var t=this.selector(e);return function(e,n){var i=t(e),r=t(n);return i&&i.getTime&&r&&r.getTime&&(i=i.getTime(),r=r.getTime()),i===r?e.__position-n.__position:null==i?1:null==r?-1:r.localeCompare?r.localeCompare(i):r>i?1:-1}},create:function(e){return this[e.dir](e.field)}}),O=function(e,t){var n,i=e.length,r=Array(i);for(n=0;i>n;n++)r[n]=t(e[n],n,e);return r},V=function(){function e(e){return e.replace(Ue,"\\").replace(Ve,"")}function t(t,n,i,r){var o;return null!=i&&(typeof i===fe&&(i=e(i),o=Ne.exec(i),o?i=new Date(+o[1]):r?(i="'"+i.toLowerCase()+"'",n="("+n+" || '').toLowerCase()"):i="'"+i+"'"),i.getTime&&(n="("+n+"?"+n+".getTime():"+n+")",i=i.getTime())),n+" "+t+" "+i}return{quote:function(t){return t&&t.getTime?"new Date("+t.getTime()+")":"string"==typeof t?"'"+e(t)+"'":""+t},eq:function(e,n,i){return t("==",e,n,i)},neq:function(e,n,i){return t("!=",e,n,i)},gt:function(e,n,i){return t(">",e,n,i)},gte:function(e,n,i){return t(">=",e,n,i)},lt:function(e,n,i){return t("<",e,n,i)},lte:function(e,n,i){return t("<=",e,n,i)},startswith:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".lastIndexOf('"+n+"', 0) == 0"},doesnotstartwith:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".lastIndexOf('"+n+"', 0) == -1"},endswith:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".indexOf('"+n+"', "+t+".length - "+(n||"").length+") >= 0"},doesnotendwith:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".indexOf('"+n+"', "+t+".length - "+(n||"").length+") < 0"},contains:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".indexOf('"+n+"') >= 0"},doesnotcontain:function(t,n,i){return i&&(t="("+t+" || '').toLowerCase()",n&&(n=n.toLowerCase())),n&&(n=e(n)),t+".indexOf('"+n+"') == -1"}}}(),o.filterExpr=function(e){var n,i,r,a,s,l,c=[],u={and:" && ",or:" || "},d=[],h=[],f=e.filters;for(n=0,i=f.length;i>n;n++)r=f[n],s=r.field,l=r.operator,r.filters?(a=o.filterExpr(r),r=a.expression.replace(/__o\[(\d+)\]/g,function(e,t){return t=+t,"__o["+(h.length+t)+"]"}).replace(/__f\[(\d+)\]/g,function(e,t){return t=+t,"__f["+(d.length+t)+"]"}),h.push.apply(h,a.operators),d.push.apply(d,a.fields)):(typeof s===pe?(a="__f["+d.length+"](d)",d.push(s)):a=ce.expr(s),typeof l===pe?(r="__o["+h.length+"]("+a+", "+V.quote(r.value)+")",h.push(l)):r=V[(l||"eq").toLowerCase()](a,r.value,r.ignoreCase!==t?r.ignoreCase:!0)),c.push(r);return{expression:"("+c.join(u[e.logic])+")",fields:d,operators:h}},U={"==":"eq",equals:"eq",isequalto:"eq",equalto:"eq",equal:"eq","!=":"neq",ne:"neq",notequals:"neq",isnotequalto:"neq",notequalto:"neq",notequal:"neq","<":"lt",islessthan:"lt",lessthan:"lt",less:"lt","<=":"lte",le:"lte",islessthanorequalto:"lte",lessthanequal:"lte",">":"gt",isgreaterthan:"gt",greaterthan:"gt",greater:"gt",">=":"gte",isgreaterthanorequalto:"gte",greaterthanequal:"gte",ge:"gte",notsubstringof:"doesnotcontain"},o.normalizeFilter=l,o.prototype={toArray:function(){return this.data},range:function(e,t){return new o(this.data.slice(e,e+t))},skip:function(e){return new o(this.data.slice(e))},take:function(e){return new o(this.data.slice(0,e))},select:function(e){return new o(O(this.data,e))},order:function(e,t){var n={dir:t};return e&&(e.compare?n.compare=e.compare:n.field=e),new o(this.data.slice(0).sort(H.create(n)))},orderBy:function(e){return this.order(e,"asc")},orderByDescending:function(e){return this.order(e,"desc")},sort:function(e,t,n){var i,r,o=a(e,t),s=[];if(n=n||H,o.length){for(i=0,r=o.length;r>i;i++)s.push(n.create(o[i]));return this.orderBy({compare:n.combine(s)})}return this},filter:function(e){var t,n,i,r,a,s,c,u,d=this.data,h=[];if(e=l(e),!e||0===e.filters.length)return this;for(r=o.filterExpr(e),s=r.fields,c=r.operators,a=u=Function("d, __f, __o","return "+r.expression),(s.length||c.length)&&(u=function(e){return a(e,s,c)}),t=0,i=d.length;i>t;t++)n=d[t],u(n)&&h.push(n);return new o(h)},group:function(e,t){e=u(e||[]),t=t||this.data;var n,i=this,r=new o(i.data);return e.length>0&&(n=e[0],r=r.groupBy(n).select(function(i){var r=new o(t).filter([{field:i.field,operator:"eq",value:i.value,ignoreCase:!1}]);return{field:i.field,value:i.value,items:e.length>1?new o(i.items).group(e.slice(1),r.toArray()).toArray():i.items,hasSubgroups:e.length>1,aggregates:r.aggregate(n.aggregates)}})),r},groupBy:function(e){if(ie(e)||!this.data.length)return new o([]);var t,n,i,r,a=e.field,s=this._sortForGrouping(a,e.dir||"asc"),l=ce.accessor(a),c=l.get(s[0],a),u={field:a,value:c,items:[]},h=[u];for(i=0,r=s.length;r>i;i++)t=s[i],n=l.get(t,a),d(c,n)||(c=n,u={field:a,value:c,items:[]},h.push(u)),u.items.push(t);return new o(h)},_sortForGrouping:function(e,t){var n,i,r=this.data;if(!He){for(n=0,i=r.length;i>n;n++)r[n].__position=n;for(r=new o(r).sort(e,t,N).toArray(),n=0,i=r.length;i>n;n++)delete r[n].__position;return r}return this.sort(e,t).toArray()},aggregate:function(e){var t,n,i={},r={};if(e&&e.length)for(t=0,n=this.data.length;n>t;t++)h(i,e,this.data[t],t,n,r);return i}},W={sum:function(e,t,n){var i=n.get(t);return f(e)?f(i)&&(e+=i):e=i,e},count:function(e){return(e||0)+1},average:function(e,n,i,r,o,a){var s=i.get(n);return a.count===t&&(a.count=0),f(e)?f(s)&&(e+=s):e=s,f(s)&&a.count++,r==o-1&&f(e)&&(e/=a.count),e},max:function(e,t,n){var i=n.get(t);return f(e)||p(e)||(e=i),i>e&&(f(i)||p(i))&&(e=i),e},min:function(e,t,n){var i=n.get(t);return f(e)||p(e)||(e=i),e>i&&(f(i)||p(i))&&(e=i),e}},o.process=function(e,n){n=n||{};var i,r=new o(e),s=n.group,l=u(s||[]).concat(a(n.sort||[])),c=n.filterCallback,d=n.filter,h=n.skip,f=n.take;return d&&(r=r.filter(d),c&&(r=c(r)),i=r.toArray().length),l&&(r=r.sort(l),s&&(e=r.toArray())),h!==t&&f!==t&&(r=r.range(h,f)),s&&(r=r.group(s,e)),{total:i,data:r.toArray()}},j=he.extend({init:function(e){this.data=e.data},read:function(e){e.success(this.data)},update:function(e){e.success(e.data)},create:function(e){e.success(e.data)},destroy:function(e){e.success(e.data)}}),G=he.extend({init:function(e){var t,n=this;e=n.options=ee({},n.options,e),se(Te,function(t,n){typeof e[n]===fe&&(e[n]={url:e[n]})}),n.cache=e.cache?q.create(e.cache):{find:le,add:le},t=e.parameterMap,ue(e.push)&&(n.push=e.push),n.push||(n.push=Ae),n.parameterMap=ue(t)?t:function(e){var n={};return se(e,function(e,i){e in t&&(e=t[e],ne(e)&&(i=e.value(i),e=e.key)),n[e]=i}),n}},options:{parameterMap:Ae},create:function(e){return ae(this.setup(e,ge))},read:function(n){var i,r,o,a=this,s=a.cache;n=a.setup(n,me),i=n.success||le,r=n.error||le,o=s.find(n.data),o!==t?i(o):(n.success=function(e){s.add(n.data,e),i(e)},e.ajax(n))},update:function(e){return ae(this.setup(e,ve))},destroy:function(e){return ae(this.setup(e,_e))},setup:function(e,t){e=e||{};var n,i=this,r=i.options[t],o=ue(r.data)?r.data(e.data):r.data;return e=ee(!0,{},r,e),n=ee(!0,{},o,e.data),e.data=i.parameterMap(n,t),ue(e.url)&&(e.url=e.url(n)),e}}),q=he.extend({init:function(){this._store={}},add:function(e,n){e!==t&&(this._store[Me(e)]=n)},find:function(e){return this._store[Me(e)]},clear:function(){this._store={}},remove:function(e){delete this._store[Me(e)]}}),q.create=function(e){var t={inmemory:function(){return new q}};return ne(e)&&ue(e.find)?e:e===!0?new q:t[e]()},$=he.extend({init:function(e){var t,n,i,r,o,a,s,l,c,u,d,h,f,p=this;e=e||{};for(t in e)n=e[t],p[t]=typeof n===fe?De(n):n;r=e.modelBase||Ye,ne(p.model)&&(p.model=i=r.define(p.model)),o=te(p.data,p),p._dataAccessFunction=o,p.model&&(a=te(p.groups,p),s=te(p.serialize,p),l={},c={},u={},d={},h=!1,i=p.model,i.fields&&(se(i.fields,function(e,t){var n;f=e,ne(t)&&t.field?f=t.field:typeof t===fe&&(f=t),ne(t)&&t.from&&(n=t.from),h=h||n&&n!==e||f!==e,c[e]=De(n||f),u[e]=De(e),l[n||f]=e,d[e]=n||f}),!e.serialize&&h&&(p.serialize=y(s,i,m,u,l,d))),p._dataAccessFunction=o,p.data=y(o,i,v,c,l,d),p.groups=y(a,i,_,c,l,d))},errors:function(e){return e?e.errors:null},parse:Ae,data:Ae,total:function(e){return e.length},groups:Ae,aggregates:function(){return{}},serialize:function(e){return e}}),Y=de.extend({init:function(e){var n,i,r,o=this;e&&(i=e.data),e=o.options=ee({},o.options,e),o._map={},o._prefetch={},o._data=[],o._pristineData=[],o._ranges=[],o._view=[],o._pristineTotal=0,o._destroyed=[],o._pageSize=e.pageSize,o._page=e.page||(e.pageSize?1:t),o._sort=a(e.sort),o._filter=l(e.filter),o._group=u(e.group),o._aggregate=e.aggregate,o._total=e.total,o._shouldDetachObservableParents=!0,de.fn.init.call(o),o.transport=K.create(e,i,o),ue(o.transport.push)&&o.transport.push({pushCreate:te(o._pushCreate,o),pushUpdate:te(o._pushUpdate,o),pushDestroy:te(o._pushDestroy,o)}),null!=e.offlineStorage&&("string"==typeof e.offlineStorage?(r=e.offlineStorage,o._storage={getItem:function(){return JSON.parse(localStorage.getItem(r))},setItem:function(e){localStorage.setItem(r,Me(o.reader.serialize(e)))}}):o._storage=e.offlineStorage),o.reader=new ce.data.readers[e.schema.type||"json"](e.schema),n=o.reader.model||{},o._detachObservableParents(),o._data=o._observe(o._data),o._online=!0,o.bind(["push",xe,ye,ke,be,Se,Ce],e)},options:{data:null,schema:{modelBase:Ye},offlineStorage:null,serverSorting:!1,serverPaging:!1,serverFiltering:!1,serverGrouping:!1,serverAggregates:!1,batch:!1},clone:function(){return this},online:function(n){return n!==t?this._online!=n&&(this._online=n,n)?this.sync():e.Deferred().resolve().promise():this._online},offlineData:function(e){return null==this.options.offlineStorage?null:e!==t?this._storage.setItem(e):this._storage.getItem()||[]},_isServerGrouped:function(){var e=this.group()||[];return this.options.serverGrouping&&e.length},_pushCreate:function(e){this._push(e,"pushCreate")},_pushUpdate:function(e){this._push(e,"pushUpdate")},_pushDestroy:function(e){this._push(e,"pushDestroy")},_push:function(e,t){var n=this._readData(e);n||(n=e),this[t](n)},_flatData:function(e,t){if(e){if(this._isServerGrouped())return w(e);if(!t)for(var n=0;e.length>n;n++)e.at(n)}return e},parent:le,get:function(e){var t,n,i=this._flatData(this._data);for(t=0,n=i.length;n>t;t++)if(i[t].id==e)return i[t]},getByUid:function(e){var t,n,i=this._flatData(this._data);if(i)for(t=0,n=i.length;n>t;t++)if(i[t].uid==e)return i[t]},indexOf:function(e){return M(this._data,e)},at:function(e){return this._data.at(e)},data:function(e){var n,i=this;if(e===t){if(i._data)for(n=0;i._data.length>n;n++)i._data.at(n);return i._data}i._detachObservableParents(),i._data=this._observe(e),i._pristineData=e.slice(0),i._storeData(),i._ranges=[],i.trigger("reset"),i._addRange(i._data),i._total=i._data.length,i._pristineTotal=i._total,i._process(i._data)},view:function(e){return e===t?this._view:(this._view=this._observeView(e),t)},_observeView:function(e){var t,n=this;return T(e,n._data,n._ranges,n.reader.model||Ge,n._isServerGrouped()),t=new je(e,n.reader.model),t.parent=function(){return n.parent()},t},flatView:function(){var e=this.group()||[];return e.length?w(this._view):this._view},add:function(e){return this.insert(this._data.length,e)},_createNewModel:function(e){return this.reader.model?new this.reader.model(e):e instanceof Ge?e:new Ge(e)},insert:function(e,t){return t||(t=e,e=0),t instanceof Ye||(t=this._createNewModel(t)),this._isServerGrouped()?this._data.splice(e,0,this._wrapInEmptyGroup(t)):this._data.splice(e,0,t),t},pushCreate:function(e){var t,n,i,r,o,a;re(e)||(e=[e]),t=[],n=this.options.autoSync,this.options.autoSync=!1;try{for(i=0;e.length>i;i++)r=e[i],o=this.add(r),t.push(o),a=o.toJSON(),this._isServerGrouped()&&(a=this._wrapInEmptyGroup(a)),this._pristineData.push(a)}finally{this.options.autoSync=n}t.length&&this.trigger("push",{type:"create",items:t})},pushUpdate:function(e){var t,n,i,r,o;for(re(e)||(e=[e]),t=[],n=0;e.length>n;n++)i=e[n],r=this._createNewModel(i),o=this.get(r.id),o?(t.push(o),o.accept(i),o.trigger(ye),this._updatePristineForModel(o,i)):this.pushCreate(i);t.length&&this.trigger("push",{type:"update",items:t})},pushDestroy:function(e){var t=this._removeItems(e);t.length&&this.trigger("push",{type:"destroy",items:t})},_removeItems:function(e){var t,n,i,r,o,a;re(e)||(e=[e]),t=[],n=this.options.autoSync,this.options.autoSync=!1;try{for(i=0;e.length>i;i++)r=e[i],o=this._createNewModel(r),a=!1,this._eachItem(this._data,function(e){var n,i;for(n=0;e.length>n;n++)if(i=e.at(n),i.id===o.id){t.push(i),e.splice(n,1),a=!0;break}}),a&&(this._removePristineForModel(o),this._destroyed.pop())}finally{this.options.autoSync=n}return t},remove:function(e){var n,i=this,r=i._isServerGrouped();return this._eachItem(i._data,function(o){return n=A(o,e),n&&r?(n.isNew&&n.isNew()||i._destroyed.push(n),!0):t}),this._removeModelFromRanges(e),this._updateRangesLength(),e},destroyed:function(){return this._destroyed},created:function(){var e,t,n=[],i=this._flatData(this._data);for(e=0,t=i.length;t>e;e++)i[e].isNew&&i[e].isNew()&&n.push(i[e]);return n},updated:function(){var e,t,n=[],i=this._flatData(this._data);for(e=0,t=i.length;t>e;e++)i[e].isNew&&!i[e].isNew()&&i[e].dirty&&n.push(i[e]);return n},sync:function(){var t,n=this,i=[],r=[],o=n._destroyed,a=e.Deferred().resolve().promise();if(n.online()){if(!n.reader.model)return a;i=n.created(),r=n.updated(),t=[],n.options.batch&&n.transport.submit?t=n._sendSubmit(i,r,o):(t.push.apply(t,n._send("create",i)),t.push.apply(t,n._send("update",r)),t.push.apply(t,n._send("destroy",o))),
a=e.when.apply(null,t).then(function(){var e,t;for(e=0,t=arguments.length;t>e;e++)n._accept(arguments[e]);n._storeData(!0),n._change({action:"sync"}),n.trigger(be)})}else n._storeData(!0),n._change({action:"sync"});return a},cancelChanges:function(e){var t=this;e instanceof ce.data.Model?t._cancelModel(e):(t._destroyed=[],t._detachObservableParents(),t._data=t._observe(t._pristineData),t.options.serverPaging&&(t._total=t._pristineTotal),t._ranges=[],t._addRange(t._data),t._change())},hasChanges:function(){var e,t,n=this._flatData(this._data);if(this._destroyed.length)return!0;for(e=0,t=n.length;t>e;e++)if(n[e].isNew&&n[e].isNew()||n[e].dirty)return!0;return!1},_accept:function(t){var n,i=this,r=t.models,o=t.response,a=0,s=i._isServerGrouped(),l=i._pristineData,c=t.type;if(i.trigger(Se,{response:o,type:c}),o&&!ie(o)){if(o=i.reader.parse(o),i._handleCustomErrors(o))return;o=i.reader.data(o),re(o)||(o=[o])}else o=e.map(r,function(e){return e.toJSON()});for("destroy"===c&&(i._destroyed=[]),a=0,n=r.length;n>a;a++)"destroy"!==c?(r[a].accept(o[a]),"create"===c?l.push(s?i._wrapInEmptyGroup(r[a]):o[a]):"update"===c&&i._updatePristineForModel(r[a],o[a])):i._removePristineForModel(r[a])},_updatePristineForModel:function(e,t){this._executeOnPristineForModel(e,function(e,n){ce.deepExtend(n[e],t)})},_executeOnPristineForModel:function(e,n){this._eachPristineItem(function(i){var r=D(i,e);return r>-1?(n(r,i),!0):t})},_removePristineForModel:function(e){this._executeOnPristineForModel(e,function(e,t){t.splice(e,1)})},_readData:function(e){var t=this._isServerGrouped()?this.reader.groups:this.reader.data;return t.call(this.reader,e)},_eachPristineItem:function(e){this._eachItem(this._pristineData,e)},_eachItem:function(e,t){e&&e.length&&(this._isServerGrouped()?k(e,t):t(e))},_pristineForModel:function(e){var n,i,r=function(r){return i=D(r,e),i>-1?(n=r[i],!0):t};return this._eachPristineItem(r),n},_cancelModel:function(e){var t=this._pristineForModel(e);this._eachItem(this._data,function(n){var i=M(n,e);i>=0&&(!t||e.isNew()&&!t.__state__?n.splice(i,1):n[i].accept(t))})},_submit:function(t,n){var i=this;i.trigger(ke,{type:"submit"}),i.transport.submit(ee({success:function(n,i){var r=e.grep(t,function(e){return e.type==i})[0];r&&r.resolve({response:n,models:r.models,type:i})},error:function(e,n,r){for(var o=0;t.length>o;o++)t[o].reject(e);i.error(e,n,r)}},n))},_sendSubmit:function(t,n,i){var r=this,o=[];return r.options.batch&&(t.length&&o.push(e.Deferred(function(e){e.type="create",e.models=t})),n.length&&o.push(e.Deferred(function(e){e.type="update",e.models=n})),i.length&&o.push(e.Deferred(function(e){e.type="destroy",e.models=i})),r._submit(o,{data:{created:r.reader.serialize(g(t)),updated:r.reader.serialize(g(n)),destroyed:r.reader.serialize(g(i))}})),o},_promise:function(t,n,i){var r=this;return e.Deferred(function(e){r.trigger(ke,{type:i}),r.transport[i].call(r.transport,ee({success:function(t){e.resolve({response:t,models:n,type:i})},error:function(t,n,i){e.reject(t),r.error(t,n,i)}},t))}).promise()},_send:function(e,t){var n,i,r=this,o=[],a=r.reader.serialize(g(t));if(r.options.batch)t.length&&o.push(r._promise({data:{models:a}},t,e));else for(n=0,i=t.length;i>n;n++)o.push(r._promise({data:a[n]},[t[n]],e));return o},read:function(t){var n=this,i=n._params(t),r=e.Deferred();return n._queueRequest(i,function(){var e=n.trigger(ke,{type:"read"});e?(n._dequeueRequest(),r.resolve(e)):(n.trigger(Ce),n._ranges=[],n.trigger("reset"),n.online()?n.transport.read({data:i,success:function(e){n.success(e,i),r.resolve()},error:function(){var e=Be.call(arguments);n.error.apply(n,e),r.reject.apply(r,e)}}):null!=n.options.offlineStorage&&(n.success(n.offlineData(),i),r.resolve()))}),r.promise()},_readAggregates:function(e){return this.reader.aggregates(e)},success:function(e){var n,i,r,o,a,s,l,c,u=this,d=u.options;if(u.trigger(Se,{response:e,type:"read"}),u.online()){if(e=u.reader.parse(e),u._handleCustomErrors(e))return u._dequeueRequest(),t;u._total=u.reader.total(e),u._aggregate&&d.serverAggregates&&(u._aggregateResult=u._readAggregates(e)),e=u._readData(e)}else{for(e=u._readData(e),n=[],i={},r=u.reader.model,o=r?r.idField:"id",a=0;this._destroyed.length>a;a++)s=this._destroyed[a][o],i[s]=s;for(a=0;e.length>a;a++)l=e[a],c=l.__state__,"destroy"==c?i[l[o]]||this._destroyed.push(this._createNewModel(l)):n.push(l);e=n,u._total=e.length}u._pristineTotal=u._total,u._pristineData=e.slice(0),u._detachObservableParents(),u._data=u._observe(e),null!=u.options.offlineStorage&&u._eachItem(u._data,function(e){var t,n;for(t=0;e.length>t;t++)n=e.at(t),"update"==n.__state__&&(n.dirty=!0)}),u._storeData(),u._addRange(u._data),u._process(u._data),u._dequeueRequest()},_detachObservableParents:function(){if(this._data&&this._shouldDetachObservableParents)for(var e=0;this._data.length>e;e++)this._data[e].parent&&(this._data[e].parent=le)},_storeData:function(e){function t(e){var n,i,r,o=[];for(n=0;e.length>n;n++)i=e.at(n),r=i.toJSON(),a&&i.items?r.items=t(i.items):(r.uid=i.uid,s&&(i.isNew()?r.__state__="create":i.dirty&&(r.__state__="update"))),o.push(r);return o}var n,i,r,o,a=this._isServerGrouped(),s=this.reader.model;if(null!=this.options.offlineStorage){for(n=t(this._data),i=[],r=0;this._destroyed.length>r;r++)o=this._destroyed[r].toJSON(),o.__state__="destroy",i.push(o);this.offlineData(n.concat(i)),e&&(this._pristineData=n)}},_addRange:function(e){var t=this,n=t._skip||0,i=n+t._flatData(e,!0).length;t._ranges.push({start:n,end:i,data:e,timestamp:(new Date).getTime()}),t._ranges.sort(function(e,t){return e.start-t.start})},error:function(e,t,n){this._dequeueRequest(),this.trigger(Se,{}),this.trigger(xe,{xhr:e,status:t,errorThrown:n})},_params:function(e){var t=this,n=ee({take:t.take(),skip:t.skip(),page:t.page(),pageSize:t.pageSize(),sort:t._sort,filter:t._filter,group:t._group,aggregate:t._aggregate},e);return t.options.serverPaging||(delete n.take,delete n.skip,delete n.page,delete n.pageSize),t.options.serverGrouping?t.reader.model&&n.group&&(n.group=z(n.group,t.reader.model)):delete n.group,t.options.serverFiltering?t.reader.model&&n.filter&&(n.filter=I(n.filter,t.reader.model)):delete n.filter,t.options.serverSorting?t.reader.model&&n.sort&&(n.sort=z(n.sort,t.reader.model)):delete n.sort,t.options.serverAggregates?t.reader.model&&n.aggregate&&(n.aggregate=z(n.aggregate,t.reader.model)):delete n.aggregate,n},_queueRequest:function(e,n){var i=this;i._requestInProgress?i._pending={callback:te(n,i),options:e}:(i._requestInProgress=!0,i._pending=t,n())},_dequeueRequest:function(){var e=this;e._requestInProgress=!1,e._pending&&e._queueRequest(e._pending.options,e._pending.callback)},_handleCustomErrors:function(e){if(this.reader.errors){var t=this.reader.errors(e);if(t)return this.trigger(xe,{xhr:null,status:"customerror",errorThrown:"custom error",errors:t}),!0}return!1},_shouldWrap:function(e){var t=this.reader.model;return t&&e.length?!(e[0]instanceof t):!1},_observe:function(e){var t,n=this,i=n.reader.model;return n._shouldDetachObservableParents=!0,e instanceof We?(n._shouldDetachObservableParents=!1,n._shouldWrap(e)&&(e.type=n.reader.model,e.wrapAll(e,e))):(t=n.pageSize()&&!n.options.serverPaging?je:We,e=new t(e,n.reader.model),e.parent=function(){return n.parent()}),n._isServerGrouped()&&x(e,i),n._changeHandler&&n._data&&n._data instanceof We?n._data.unbind(ye,n._changeHandler):n._changeHandler=te(n._change,n),e.bind(ye,n._changeHandler)},_updateTotalForAction:function(e,t){var n=this,i=parseInt(n._total,10);f(n._total)||(i=parseInt(n._pristineTotal,10)),"add"===e?i+=t.length:"remove"===e?i-=t.length:"itemchange"===e||"sync"===e||n.options.serverPaging?"sync"===e&&(i=n._pristineTotal=parseInt(n._total,10)):i=n._pristineTotal,n._total=i},_change:function(e){var t,n,i,r=this,o=e?e.action:"";if("remove"===o)for(t=0,n=e.items.length;n>t;t++)e.items[t].isNew&&e.items[t].isNew()||r._destroyed.push(e.items[t]);!r.options.autoSync||"add"!==o&&"remove"!==o&&"itemchange"!==o?(r._updateTotalForAction(o,e?e.items:[]),r._process(r._data,e)):(i=function(t){"sync"===t.action&&(r.unbind("change",i),r._updateTotalForAction(o,e.items))},r.first("change",i),r.sync())},_calculateAggregates:function(e,t){t=t||{};var n=new o(e),i=t.aggregate,r=t.filter;return r&&(n=n.filter(r)),n.aggregate(i)},_process:function(e,n){var i,r=this,o={};r.options.serverPaging!==!0&&(o.skip=r._skip,o.take=r._take||r._pageSize,o.skip===t&&r._page!==t&&r._pageSize!==t&&(o.skip=(r._page-1)*r._pageSize)),r.options.serverSorting!==!0&&(o.sort=r._sort),r.options.serverFiltering!==!0&&(o.filter=r._filter),r.options.serverGrouping!==!0&&(o.group=r._group),r.options.serverAggregates!==!0&&(o.aggregate=r._aggregate,r._aggregateResult=r._calculateAggregates(e,o)),i=r._queryProcess(e,o),r.view(i.data),i.total===t||r.options.serverFiltering||(r._total=i.total),n=n||{},n.items=n.items||r._view,r.trigger(ye,n)},_queryProcess:function(e,t){return o.process(e,t)},_mergeState:function(e){var n=this;return e!==t&&(n._pageSize=e.pageSize,n._page=e.page,n._sort=e.sort,n._filter=e.filter,n._group=e.group,n._aggregate=e.aggregate,n._skip=e.skip,n._take=e.take,n._skip===t&&(n._skip=n.skip(),e.skip=n.skip()),n._take===t&&n._pageSize!==t&&(n._take=n._pageSize,e.take=n._take),e.sort&&(n._sort=e.sort=a(e.sort)),e.filter&&(n._filter=e.filter=l(e.filter)),e.group&&(n._group=e.group=u(e.group)),e.aggregate&&(n._aggregate=e.aggregate=c(e.aggregate))),e},query:function(n){var i,r,o=this.options.serverSorting||this.options.serverPaging||this.options.serverFiltering||this.options.serverGrouping||this.options.serverAggregates;return o||(this._data===t||0===this._data.length)&&!this._destroyed.length?this.read(this._mergeState(n)):(r=this.trigger(ke,{type:"read"}),r||(this.trigger(Ce),i=this._queryProcess(this._data,this._mergeState(n)),this.options.serverFiltering||(this._total=i.total!==t?i.total:this._data.length),this._aggregateResult=this._calculateAggregates(this._data,n),this.view(i.data),this.trigger(Se,{type:"read"}),this.trigger(ye,{items:i.data})),e.Deferred().resolve(r).promise())},fetch:function(e){var t=this,n=function(n){n!==!0&&ue(e)&&e.call(t)};return this._query().then(n)},_query:function(e){var t=this;return t.query(ee({},{page:t.page(),pageSize:t.pageSize(),sort:t.sort(),filter:t.filter(),group:t.group(),aggregate:t.aggregate()},e))},next:function(e){var n=this,i=n.page(),r=n.total();return e=e||{},!i||r&&i+1>n.totalPages()?t:(n._skip=i*n.take(),i+=1,e.page=i,n._query(e),i)},prev:function(e){var n=this,i=n.page();return e=e||{},i&&1!==i?(n._skip=n._skip-n.take(),i-=1,e.page=i,n._query(e),i):t},page:function(e){var n,i=this;return e!==t?(e=Ee.max(Ee.min(Ee.max(e,1),i.totalPages()),1),i._query({page:e}),t):(n=i.skip(),n!==t?Ee.round((n||0)/(i.take()||1))+1:t)},pageSize:function(e){var n=this;return e!==t?(n._query({pageSize:e,page:1}),t):n.take()},sort:function(e){var n=this;return e!==t?(n._query({sort:e}),t):n._sort},filter:function(e){var n=this;return e===t?n._filter:(n.trigger("reset"),n._query({filter:e,page:1}),t)},group:function(e){var n=this;return e!==t?(n._query({group:e}),t):n._group},total:function(){return parseInt(this._total||0,10)},aggregate:function(e){var n=this;return e!==t?(n._query({aggregate:e}),t):n._aggregate},aggregates:function(){var e=this._aggregateResult;return ie(e)&&(e=this._emptyAggregates(this.aggregate())),e},_emptyAggregates:function(e){var t,n,i={};if(!ie(e))for(t={},re(e)||(e=[e]),n=0;e.length>n;n++)t[e[n].aggregate]=0,i[e[n].field]=t;return i},_wrapInEmptyGroup:function(e){var t,n,i,r,o=this.group();for(i=o.length-1,r=0;i>=r;i--)n=o[i],t={value:e.get(n.field),field:n.field,items:t?[t]:[e],hasSubgroups:!!t,aggregates:this._emptyAggregates(n.aggregates)};return t},totalPages:function(){var e=this,t=e.pageSize()||e.total();return Ee.ceil((e.total()||0)/t)},inRange:function(e,t){var n=this,i=Ee.min(e+t,n.total());return!n.options.serverPaging&&n._data.length>0?!0:n._findRange(e,i).length>0},lastRange:function(){var e=this._ranges;return e[e.length-1]||{start:0,end:0,data:[]}},firstItemUid:function(){var e=this._ranges;return e.length&&e[0].data.length&&e[0].data[0].uid},enableRequestsInProgress:function(){this._skipRequestsInProgress=!1},_timeStamp:function(){return(new Date).getTime()},range:function(e,n){var i,r,o,a,s,l,c,u;if(this._currentRequestTimeStamp=this._timeStamp(),this._skipRequestsInProgress=!0,e=Ee.min(e||0,this.total()),i=this,r=Ee.max(Ee.floor(e/n),0)*n,o=Ee.min(r+n,i.total()),a=i._findRange(e,Ee.min(e+n,i.total())),a.length){i._pending=t,i._skip=e>i.skip()?Ee.min(o,(i.totalPages()-1)*i.take()):r,i._take=n,s=i.options.serverPaging,l=i.options.serverSorting,c=i.options.serverFiltering,u=i.options.serverAggregates;try{i.options.serverPaging=!0,i._isServerGrouped()||i.group()&&i.group().length||(i.options.serverSorting=!0),i.options.serverFiltering=!0,i.options.serverPaging=!0,i.options.serverAggregates=!0,s&&(i._detachObservableParents(),i._data=a=i._observe(a)),i._process(a)}finally{i.options.serverPaging=s,i.options.serverSorting=l,i.options.serverFiltering=c,i.options.serverAggregates=u}}else n!==t&&(i._rangeExists(r,o)?e>r&&i.prefetch(o,n,function(){i.range(e,n)}):i.prefetch(r,n,function(){e>r&&o<i.total()&&!i._rangeExists(o,Ee.min(o+n,i.total()))?i.prefetch(o,n,function(){i.range(e,n)}):i.range(e,n)}))},_findRange:function(e,n){var i,r,o,s,l,c,d,h,f,p,g,m,v=this,_=v._ranges,y=[],b=v.options,w=b.serverSorting||b.serverPaging||b.serverFiltering||b.serverGrouping||b.serverAggregates;for(r=0,g=_.length;g>r;r++)if(i=_[r],e>=i.start&&i.end>=e){for(p=0,o=r;g>o;o++)if(i=_[o],f=v._flatData(i.data,!0),f.length&&e+p>=i.start&&(c=i.data,d=i.end,w||(m=u(v.group()||[]).concat(a(v.sort()||[])),h=v._queryProcess(i.data,{sort:m,filter:v.filter()}),f=c=h.data,h.total!==t&&(d=h.total)),s=0,e+p>i.start&&(s=e+p-i.start),l=f.length,d>n&&(l-=d-n),p+=l-s,y=v._mergeGroups(y,c,s,l),i.end>=n&&p==n-e))return y;break}return[]},_mergeGroups:function(e,t,n,i){if(this._isServerGrouped()){var r,o=t.toJSON();return e.length&&(r=e[e.length-1]),b(r,o,n,i),e.concat(o)}return e.concat(t.slice(n,i))},skip:function(){var e=this;return e._skip===t?e._page!==t?(e._page-1)*(e.take()||1):t:e._skip},take:function(){return this._take||this._pageSize},_prefetchSuccessHandler:function(e,t,n,i){var r=this,o=r._timeStamp();return function(a){var s,l,c,u=!1,d={start:e,end:t,data:[],timestamp:r._timeStamp()};if(r._dequeueRequest(),r.trigger(Se,{response:a,type:"read"}),a=r.reader.parse(a),c=r._readData(a),c.length){for(s=0,l=r._ranges.length;l>s;s++)if(r._ranges[s].start===e){u=!0,d=r._ranges[s];break}u||r._ranges.push(d)}d.data=r._observe(c),d.end=d.start+r._flatData(d.data,!0).length,r._ranges.sort(function(e,t){return e.start-t.start}),r._total=r.reader.total(a),(i||o>=r._currentRequestTimeStamp||!r._skipRequestsInProgress)&&(n&&c.length?n():r.trigger(ye,{}))}},prefetch:function(e,t,n){var i=this,r=Ee.min(e+t,i.total()),o={take:t,skip:e,page:e/t+1,pageSize:t,sort:i._sort,filter:i._filter,group:i._group,aggregate:i._aggregate};i._rangeExists(e,r)?n&&n():(clearTimeout(i._timeout),i._timeout=setTimeout(function(){i._queueRequest(o,function(){i.trigger(ke,{type:"read"})?i._dequeueRequest():i.transport.read({data:i._params(o),success:i._prefetchSuccessHandler(e,r,n),error:function(){var e=Be.call(arguments);i.error.apply(i,e)}})})},100))},_multiplePrefetch:function(e,t,n){var i=this,r=Ee.min(e+t,i.total()),o={take:t,skip:e,page:e/t+1,pageSize:t,sort:i._sort,filter:i._filter,group:i._group,aggregate:i._aggregate};i._rangeExists(e,r)?n&&n():i.trigger(ke,{type:"read"})||i.transport.read({data:i._params(o),success:i._prefetchSuccessHandler(e,r,n,!0)})},_rangeExists:function(e,t){var n,i,r=this,o=r._ranges;for(n=0,i=o.length;i>n;n++)if(e>=o[n].start&&o[n].end>=t)return!0;return!1},_removeModelFromRanges:function(e){var t,n,i,r,o;for(r=0,o=this._ranges.length;o>r&&(i=this._ranges[r],this._eachItem(i.data,function(i){t=A(i,e),t&&(n=!0)}),!n);r++);},_updateRangesLength:function(){var e,t,n,i,r=0;for(n=0,i=this._ranges.length;i>n;n++)e=this._ranges[n],e.start=e.start-r,t=this._flatData(e.data,!0).length,r=e.end-t,e.end=e.start+t}}),K={},K.create=function(t,n,i){var r,o=t.transport?e.extend({},t.transport):null;return o?(o.read=typeof o.read===fe?{url:o.read}:o.read,"jsdo"===t.type&&(o.dataSource=i),t.type&&(ce.data.transports=ce.data.transports||{},ce.data.schemas=ce.data.schemas||{},ce.data.transports[t.type]&&!ne(ce.data.transports[t.type])?r=new ce.data.transports[t.type](ee(o,{data:n})):o=ee(!0,{},ce.data.transports[t.type],o),t.schema=ee(!0,{},ce.data.schemas[t.type],t.schema)),r||(r=ue(o.read)?o:new G(o))):r=new j({data:t.data||[]}),r},Y.create=function(e){(re(e)||e instanceof We)&&(e={data:e});var n,i,r,o=e||{},a=o.data,s=o.fields,l=o.table,c=o.select,u={};if(a||!s||o.transport||(l?a=F(l,s):c&&(a=R(c,s),o.group===t&&a[0]&&a[0].optgroup!==t&&(o.group="optgroup"))),ce.data.Model&&s&&(!o.schema||!o.schema.model)){for(n=0,i=s.length;i>n;n++)r=s[n],r.type&&(u[r.field]=r);ie(u)||(o.schema=ee(!0,o.schema,{model:{fields:u}}))}return o.data=a,c=null,o.select=null,l=null,o.table=null,o instanceof Y?o:new Y(o)},Q=Ye.define({idField:"id",init:function(e){var t=this,n=t.hasChildren||e&&e.hasChildren,i="items",r={};ce.data.Model.fn.init.call(t,e),typeof t.children===fe&&(i=t.children),r={schema:{data:i,model:{hasChildren:n,id:t.idField,fields:t.fields}}},typeof t.children!==fe&&ee(r,t.children),r.data=e,n||(n=r.schema.data),typeof n===fe&&(n=ce.getter(n)),ue(n)&&(t.hasChildren=!!n.call(t,t)),t._childrenOptions=r,t.hasChildren&&t._initChildren(),t._loaded=!(!e||!e._loaded)},_initChildren:function(){var e,t,n,i=this;i.children instanceof X||(e=i.children=new X(i._childrenOptions),t=e.transport,n=t.parameterMap,t.parameterMap=function(e,t){return e[i.idField||"id"]=i.id,n&&(e=n(e,t)),e},e.parent=function(){return i},e.bind(ye,function(e){e.node=e.node||i,i.trigger(ye,e)}),e.bind(xe,function(e){var t=i.parent();t&&(e.node=e.node||i,t.trigger(xe,e))}),i._updateChildrenField())},append:function(e){this._initChildren(),this.loaded(!0),this.children.add(e)},hasChildren:!1,level:function(){for(var e=this.parentNode(),t=0;e&&e.parentNode;)t++,e=e.parentNode?e.parentNode():null;return t},_updateChildrenField:function(){var e=this._childrenOptions.schema.data;this[e||"items"]=this.children.data()},_childrenLoaded:function(){this._loaded=!0,this._updateChildrenField()},load:function(){var n,i,r={},o="_query";return this.hasChildren?(this._initChildren(),n=this.children,r[this.idField||"id"]=this.id,this._loaded||(n._data=t,o="read"),n.one(ye,te(this._childrenLoaded,this)),i=n[o](r)):this.loaded(!0),i||e.Deferred().resolve().promise()},parentNode:function(){var e=this.parent();return e.parent()},loaded:function(e){return e===t?this._loaded:(this._loaded=e,t)},shouldSerialize:function(e){return Ye.fn.shouldSerialize.call(this,e)&&"children"!==e&&"_loaded"!==e&&"hasChildren"!==e&&"_childrenOptions"!==e}}),X=Y.extend({init:function(e){var t=Q.define({children:e});Y.fn.init.call(this,ee(!0,{},{schema:{modelBase:t,model:t}},e)),this._attachBubbleHandlers()},_attachBubbleHandlers:function(){var e=this;e._data.bind(xe,function(t){e.trigger(xe,t)})},remove:function(e){var t,n=e.parentNode(),i=this;return n&&n._initChildren&&(i=n.children),t=Y.fn.remove.call(i,e),n&&!i.data().length&&(n.hasChildren=!1),t},success:B("success"),data:B("data"),insert:function(e,t){var n=this.parent();return n&&n._initChildren&&(n.hasChildren=!0,n._initChildren()),Y.fn.insert.call(this,e,t)},_find:function(e,t){var n,i,r,o,a=this._data;if(a){if(r=Y.fn[e].call(this,t))return r;for(a=this._flatData(this._data),n=0,i=a.length;i>n;n++)if(o=a[n].children,o instanceof X&&(r=o[e](t)))return r}},get:function(e){return this._find("get",e)},getByUid:function(e){return this._find("getByUid",e)}}),X.create=function(e){e=e&&e.push?{data:e}:e;var t=e||{},n=t.data,i=t.fields,r=t.list;return n&&n._dataSource?n._dataSource:(n||!i||t.transport||r&&(n=L(r,i)),t.data=n,t instanceof X?t:new X(t))},J=ce.Observable.extend({init:function(e,t,n){ce.Observable.fn.init.call(this),this._prefetching=!1,this.dataSource=e,this.prefetch=!n;var i=this;e.bind("change",function(){i._change()}),e.bind("reset",function(){i._reset()}),this._syncWithDataSource(),this.setViewSize(t)},setViewSize:function(e){this.viewSize=e,this._recalculate()},at:function(e){var n=this.pageSize,i=!0;return e>=this.total()?(this.trigger("endreached",{index:e}),null):this.useRanges?this.useRanges?((this.dataOffset>e||e>=this.skip+n)&&(i=this.range(Math.floor(e/n)*n)),e===this.prefetchThreshold&&this._prefetch(),e===this.midPageThreshold?this.range(this.nextMidRange,!0):e===this.nextPageThreshold?this.range(this.nextFullRange):e===this.pullBackThreshold&&this.range(this.offset===this.skip?this.previousMidRange:this.previousFullRange),i?this.dataSource.at(e-this.dataOffset):(this.trigger("endreached",{index:e}),null)):t:this.dataSource.view()[e]},indexOf:function(e){return this.dataSource.data().indexOf(e)+this.dataOffset},total:function(){return parseInt(this.dataSource.total(),10)},next:function(){var e=this,t=e.pageSize,n=e.skip-e.viewSize+t,i=Ee.max(Ee.floor(n/t),0)*t;this.offset=n,this.dataSource.prefetch(i,t,function(){e._goToRange(n,!0)})},range:function(e,t){if(this.offset===e)return!0;var n=this,i=this.pageSize,r=Ee.max(Ee.floor(e/i),0)*i,o=this.dataSource;return t&&(r+=i),o.inRange(e,i)?(this.offset=e,this._recalculate(),this._goToRange(e),!0):this.prefetch?(o.prefetch(r,i,function(){n.offset=e,n._recalculate(),n._goToRange(e,!0)}),!1):!0},syncDataSource:function(){var e=this.offset;this.offset=null,this.range(e)},destroy:function(){this.unbind()},_prefetch:function(){var e=this,t=this.pageSize,n=this.skip+t,i=this.dataSource;i.inRange(n,t)||this._prefetching||!this.prefetch||(this._prefetching=!0,this.trigger("prefetching",{skip:n,take:t}),i.prefetch(n,t,function(){e._prefetching=!1,e.trigger("prefetched",{skip:n,take:t})}))},_goToRange:function(e,t){this.offset===e&&(this.dataOffset=e,this._expanding=t,this.dataSource.range(e,this.pageSize),this.dataSource.enableRequestsInProgress())},_reset:function(){this._syncPending=!0},_change:function(){var e=this.dataSource;this.length=this.useRanges?e.lastRange().end:e.view().length,this._syncPending&&(this._syncWithDataSource(),this._recalculate(),this._syncPending=!1,this.trigger("reset",{offset:this.offset})),this.trigger("resize"),this._expanding&&this.trigger("expand"),delete this._expanding},_syncWithDataSource:function(){var e=this.dataSource;this._firstItemUid=e.firstItemUid(),this.dataOffset=this.offset=e.skip()||0,this.pageSize=e.pageSize(),this.useRanges=e.options.serverPaging},_recalculate:function(){var e=this.pageSize,t=this.offset,n=this.viewSize,i=Math.ceil(t/e)*e;this.skip=i,this.midPageThreshold=i+e-1,this.nextPageThreshold=i+n-1,this.prefetchThreshold=i+Math.floor(e/3*2),this.pullBackThreshold=this.offset-1,this.nextMidRange=i+e-n,this.nextFullRange=i,this.previousMidRange=t-n,this.previousFullRange=i-e}}),Z=ce.Observable.extend({init:function(e,t){var n=this;ce.Observable.fn.init.call(n),this.dataSource=e,this.batchSize=t,this._total=0,this.buffer=new J(e,3*t),this.buffer.bind({endreached:function(e){n.trigger("endreached",{index:e.index})},prefetching:function(e){n.trigger("prefetching",{skip:e.skip,take:e.take})},prefetched:function(e){n.trigger("prefetched",{skip:e.skip,take:e.take})},reset:function(){n._total=0,n.trigger("reset")},resize:function(){n._total=Math.ceil(this.length/n.batchSize),n.trigger("resize",{total:n.total(),offset:this.offset})}})},syncDataSource:function(){this.buffer.syncDataSource()},at:function(e){var t,n,i=this.buffer,r=e*this.batchSize,o=this.batchSize,a=[];for(i.offset>r&&i.at(i.offset-1),n=0;o>n&&(t=i.at(r+n),null!==t);n++)a.push(t);return a},total:function(){return this._total},destroy:function(){this.buffer.destroy(),this.unbind()}}),ee(!0,ce.data,{readers:{json:$},Query:o,DataSource:Y,HierarchicalDataSource:X,Node:Q,ObservableObject:Ge,ObservableArray:We,LazyObservableArray:je,LocalTransport:j,RemoteTransport:G,Cache:q,DataReader:$,Model:Ye,Buffer:J,BatchBuffer:Z})}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t,n,i){return v.extend({init:function(e,t,n){var i=this;v.fn.init.call(i,e.element[0],t,n),i.widget=e,i._dataBinding=P(i.dataBinding,i),i._dataBound=P(i.dataBound,i),i._itemChange=P(i.itemChange,i)},itemChange:function(e){a(e.item[0],e.data,this._ns(e.ns),[e.data].concat(this.bindings[t]._parents()))},dataBinding:function(e){var t,n,i=this.widget,r=e.removedItems||i.items();for(t=0,n=r.length;n>t;t++)c(r[t],!1)},_ns:function(t){t=t||C.ui;var n=[C.ui,C.dataviz.ui,C.mobile.ui];return n.splice(e.inArray(t,n),1),n.unshift(t),C.rolesFromNamespaces(n)},dataBound:function(e){var i,r,o,s,l=this.widget,c=e.addedItems||l.items(),u=l[n],d=C.data.HierarchicalDataSource;if(!(d&&u instanceof d)&&c.length)for(o=e.addedDataItems||u.flatView(),s=this.bindings[t]._parents(),i=0,r=o.length;r>i;i++)a(c[i],o[i],this._ns(e.ns),[o[i]].concat(s))},refresh:function(e){var r,o,a,s=this,l=s.widget;e=e||{},e.action||(s.destroy(),l.bind("dataBinding",s._dataBinding),l.bind("dataBound",s._dataBound),l.bind("itemChange",s._itemChange),r=s.bindings[t].get(),l[n]instanceof C.data.DataSource&&l[n]!=r&&(r instanceof C.data.DataSource?l[i](r):r&&r._dataSource?l[i](r._dataSource):(l[n].data(r),o=C.ui.Select&&l instanceof C.ui.Select,a=C.ui.MultiSelect&&l instanceof C.ui.MultiSelect,s.bindings.value&&(o||a)&&l.value(f(s.bindings.value.get(),l.options.dataValueField)))))},destroy:function(){var e=this.widget;e.unbind("dataBinding",this._dataBinding),e.unbind("dataBound",this._dataBound),e.unbind("itemChange",this._itemChange)}})}function i(e,n){var i=C.initWidget(e,{},n);return i?new w(i):t}function r(e){var t,n,i,o,a,s,l,c={};for(l=e.match(x),t=0,n=l.length;n>t;t++)i=l[t],o=i.indexOf(":"),a=i.substring(0,o),s=i.substring(o+1),"{"==s.charAt(0)&&(s=r(s)),c[a]=s;return c}function o(e,t,n){var i,r={};for(i in e)r[i]=new n(t,e[i]);return r}function a(e,t,n,s){var c,u,d,h=e.getAttribute("data-"+C.ns+"role"),f=e.getAttribute("data-"+C.ns+"bind"),v=e.children,_=[],y=!0,w={};if(s=s||[t],(h||f)&&l(e,!1),h&&(d=i(e,n)),f&&(f=r(f.replace(k,"")),d||(w=C.parseOptions(e,{textField:"",valueField:"",template:"",valueUpdate:H,valuePrimitive:!1,autoBind:!0}),w.roles=n,d=new b(e,w)),d.source=t,u=o(f,s,p),w.template&&(u.template=new m(s,"",w.template)),u.click&&(f.events=f.events||{},f.events.click=f.click,u.click.destroy(),delete u.click),u.source&&(y=!1),f.attr&&(u.attr=o(f.attr,s,p)),f.style&&(u.style=o(f.style,s,p)),f.events&&(u.events=o(f.events,s,g)),f.css&&(u.css=o(f.css,s,p)),d.bind(u)),d&&(e.kendoBindingTarget=d),y&&v){for(c=0;v.length>c;c++)_[c]=v[c];for(c=0;_.length>c;c++)a(_[c],t,n,s)}}function s(t,n){var i,r,o,s=C.rolesFromNamespaces([].slice.call(arguments,2));for(n=C.observable(n),t=e(t),i=0,r=t.length;r>i;i++)o=t[i],1===o.nodeType&&a(o,n,s)}function l(t,n){var i,r=t.kendoBindingTarget;r&&(r.destroy(),L?delete t.kendoBindingTarget:t.removeAttribute?t.removeAttribute("kendoBindingTarget"):t.kendoBindingTarget=null),n&&(i=C.widgetInstance(e(t)),i&&typeof i.destroy===O&&i.destroy())}function c(e,t){l(e,t),u(e,t)}function u(e,t){var n,i,r=e.children;if(r)for(n=0,i=r.length;i>n;n++)c(r[n],t)}function d(t){var n,i;for(t=e(t),n=0,i=t.length;i>n;n++)c(t[n],!1)}function h(e,t){var n=e.element,i=n[0].kendoBindingTarget;i&&s(n,i.source,t)}function f(e,t){var n,i,r=[],o=0;if(!t)return e;if(e instanceof A){for(n=e.length;n>o;o++)i=e[o],r[o]=i.get?i.get(t):i[t];e=r}else e instanceof T&&(e=e.get(t));return e}var p,g,m,v,_,y,b,w,x,k,C=window.kendo,S=C.Observable,T=C.data.ObservableObject,A=C.data.ObservableArray,D={}.toString,M={},E=C.Class,P=e.proxy,I="value",z="source",R="events",F="checked",B="css",L=!0,O="function",H="change";!function(){var e=document.createElement("a");try{delete e.test}catch(t){L=!1}}(),p=S.extend({init:function(e,t){var n=this;S.fn.init.call(n),n.source=e[0],n.parents=e,n.path=t,n.dependencies={},n.dependencies[t]=!0,n.observable=n.source instanceof S,n._access=function(e){n.dependencies[e.field]=!0},n.observable&&(n._change=function(e){n.change(e)},n.source.bind(H,n._change))},_parents:function(){var t,n=this.parents,i=this.get();return i&&"function"==typeof i.parent&&(t=i.parent(),e.inArray(t,n)<0&&(n=[t].concat(n))),n},change:function(e){var t,n,i=e.field,r=this;if("this"===r.path)r.trigger(H,e);else for(t in r.dependencies)if(0===t.indexOf(i)&&(n=t.charAt(i.length),!n||"."===n||"["===n)){r.trigger(H,e);break}},start:function(e){e.bind("get",this._access)},stop:function(e){e.unbind("get",this._access)},get:function(){var e=this,n=e.source,i=0,r=e.path,o=n;if(!e.observable)return o;for(e.start(e.source),o=n.get(r);o===t&&n;)n=e.parents[++i],n instanceof T&&(o=n.get(r));if(o===t)for(n=e.source;o===t&&n;)n=n.parent(),n instanceof T&&(o=n.get(r));return"function"==typeof o&&(i=r.lastIndexOf("."),i>0&&(n=n.get(r.substring(0,i))),e.start(n),o=n!==e.source?o.call(n,e.source):o.call(n),e.stop(n)),n&&n!==e.source&&(e.currentSource=n,n.unbind(H,e._change).bind(H,e._change)),e.stop(e.source),o},set:function(e){var t=this.currentSource||this.source,n=C.getter(this.path)(t);"function"==typeof n?t!==this.source?n.call(t,this.source,e):n.call(t,e):t.set(this.path,e)},destroy:function(){this.observable&&(this.source.unbind(H,this._change),this.currentSource&&this.currentSource.unbind(H,this._change)),this.unbind()}}),g=p.extend({get:function(){var e,t=this.source,n=this.path,i=0;for(e=t.get(n);!e&&t;)t=this.parents[++i],t instanceof T&&(e=t.get(n));return P(e,t)}}),m=p.extend({init:function(e,t,n){var i=this;p.fn.init.call(i,e,t),i.template=n},render:function(e){var t;return this.start(this.source),t=C.render(this.template,e),this.stop(this.source),t}}),v=E.extend({init:function(e,t,n){this.element=e,this.bindings=t,this.options=n},bind:function(e,t){var n=this;e=t?e[t]:e,e.bind(H,function(e){n.refresh(t||e)}),n.refresh(t)},destroy:function(){}}),_=v.extend({dataType:function(){var e=this.element.getAttribute("data-type")||this.element.type||"text";return e.toLowerCase()},parsedValue:function(){return this._parseValue(this.element.value,this.dataType())},_parseValue:function(e,t){return"date"==t?e=C.parseDate(e,"yyyy-MM-dd"):"datetime-local"==t?e=C.parseDate(e,["yyyy-MM-ddTHH:mm:ss","yyyy-MM-ddTHH:mm"]):"number"==t?e=C.parseFloat(e):"boolean"==t&&(e=e.toLowerCase(),e=null!==C.parseFloat(e)?!!C.parseFloat(e):"true"===e.toLowerCase()),e}}),M.attr=v.extend({refresh:function(e){this.element.setAttribute(e,this.bindings.attr[e].get())}}),M.css=v.extend({init:function(e,t,n){v.fn.init.call(this,e,t,n),this.classes={}},refresh:function(t){var n=e(this.element),i=this.bindings.css[t],r=this.classes[t]=i.get();r?n.addClass(t):n.removeClass(t)}}),M.style=v.extend({refresh:function(e){this.element.style[e]=this.bindings.style[e].get()||""}}),M.enabled=v.extend({refresh:function(){this.bindings.enabled.get()?this.element.removeAttribute("disabled"):this.element.setAttribute("disabled","disabled")}}),M.readonly=v.extend({refresh:function(){this.bindings.readonly.get()?this.element.setAttribute("readonly","readonly"):this.element.removeAttribute("readonly")}}),M.disabled=v.extend({refresh:function(){this.bindings.disabled.get()?this.element.setAttribute("disabled","disabled"):this.element.removeAttribute("disabled")}}),M.events=v.extend({init:function(e,t,n){v.fn.init.call(this,e,t,n),this.handlers={}},refresh:function(t){var n=e(this.element),i=this.bindings.events[t],r=this.handlers[t];r&&n.off(t,r),r=this.handlers[t]=i.get(),n.on(t,i.source,r)},destroy:function(){var t,n=e(this.element);for(t in this.handlers)n.off(t,this.handlers[t])}}),M.text=v.extend({refresh:function(){var t=this.bindings.text.get(),n=this.element.getAttribute("data-format")||"";null==t&&(t=""),e(this.element).text(C.toString(t,n))}}),M.visible=v.extend({refresh:function(){this.element.style.display=this.bindings.visible.get()?"":"none"}}),M.invisible=v.extend({
refresh:function(){this.element.style.display=this.bindings.invisible.get()?"none":""}}),M.html=v.extend({refresh:function(){this.element.innerHTML=this.bindings.html.get()}}),M.value=_.extend({init:function(t,n,i){_.fn.init.call(this,t,n,i),this._change=P(this.change,this),this.eventName=i.valueUpdate||H,e(this.element).on(this.eventName,this._change),this._initChange=!1},change:function(){this._initChange=this.eventName!=H,this.bindings[I].set(this.parsedValue()),this._initChange=!1},refresh:function(){var e,t;this._initChange||(e=this.bindings[I].get(),null==e&&(e=""),t=this.dataType(),"date"==t?e=C.toString(e,"yyyy-MM-dd"):"datetime-local"==t&&(e=C.toString(e,"yyyy-MM-ddTHH:mm:ss")),this.element.value=e),this._initChange=!1},destroy:function(){e(this.element).off(this.eventName,this._change)}}),M.source=v.extend({init:function(e,t,n){v.fn.init.call(this,e,t,n);var i=this.bindings.source.get();i instanceof C.data.DataSource&&n.autoBind!==!1&&i.fetch()},refresh:function(e){var t=this,n=t.bindings.source.get();n instanceof A||n instanceof C.data.DataSource?(e=e||{},"add"==e.action?t.add(e.index,e.items):"remove"==e.action?t.remove(e.index,e.items):"itemchange"!=e.action&&t.render()):t.render()},container:function(){var e=this.element;return"table"==e.nodeName.toLowerCase()&&(e.tBodies[0]||e.appendChild(document.createElement("tbody")),e=e.tBodies[0]),e},template:function(){var e=this.options,t=e.template,n=this.container().nodeName.toLowerCase();return t||(t="select"==n?e.valueField||e.textField?C.format('<option value="#:{0}#">#:{1}#</option>',e.valueField||e.textField,e.textField||e.valueField):"<option>#:data#</option>":"tbody"==n?"<tr><td>#:data#</td></tr>":"ul"==n||"ol"==n?"<li>#:data#</li>":"#:data#",t=C.template(t)),t},add:function(t,n){var i,r,o,s,l=this.container(),c=l.cloneNode(!1),u=l.children[t];if(e(c).html(C.render(this.template(),n)),c.children.length)for(i=this.bindings.source._parents(),r=0,o=n.length;o>r;r++)s=c.children[0],l.insertBefore(s,u||null),a(s,n[r],this.options.roles,[n[r]].concat(i))},remove:function(e,t){var n,i,r=this.container();for(n=0;t.length>n;n++)i=r.children[e],c(i,!0),r.removeChild(i)},render:function(){var t,n,i,r=this.bindings.source.get(),o=this.container(),s=this.template();if(r instanceof C.data.DataSource&&(r=r.view()),r instanceof A||"[object Array]"===D.call(r)||(r=[r]),this.bindings.template){if(u(o,!0),e(o).html(this.bindings.template.render(r)),o.children.length)for(t=this.bindings.source._parents(),n=0,i=r.length;i>n;n++)a(o.children[n],r[n],this.options.roles,[r[n]].concat(t))}else e(o).html(C.render(s,r))}}),M.input={checked:_.extend({init:function(t,n,i){_.fn.init.call(this,t,n,i),this._change=P(this.change,this),e(this.element).change(this._change)},change:function(){var e,t,n,i=this.element,r=this.value();if("radio"==i.type)r=this.parsedValue(),this.bindings[F].set(r);else if("checkbox"==i.type)if(e=this.bindings[F].get(),e instanceof A){if(r=this.parsedValue(),r instanceof Date){for(n=0;e.length>n;n++)if(e[n]instanceof Date&&+e[n]===+r){t=n;break}}else t=e.indexOf(r);t>-1?e.splice(t,1):e.push(r)}else this.bindings[F].set(r)},refresh:function(){var e,t,n=this.bindings[F].get(),i=n,r=this.dataType(),o=this.element;if("checkbox"==o.type)if(i instanceof A){if(e=-1,n=this.parsedValue(),n instanceof Date){for(t=0;i.length>t;t++)if(i[t]instanceof Date&&+i[t]===+n){e=t;break}}else e=i.indexOf(n);o.checked=e>=0}else o.checked=i;else"radio"==o.type&&null!=n&&("date"==r?n=C.toString(n,"yyyy-MM-dd"):"datetime-local"==r&&(n=C.toString(n,"yyyy-MM-ddTHH:mm:ss")),o.checked=o.value===""+n?!0:!1)},value:function(){var e=this.element,t=e.value;return"checkbox"==e.type&&(t=e.checked),t},destroy:function(){e(this.element).off(H,this._change)}})},M.select={source:M.source.extend({refresh:function(n){var i,r=this,o=r.bindings.source.get();o instanceof A||o instanceof C.data.DataSource?(n=n||{},"add"==n.action?r.add(n.index,n.items):"remove"==n.action?r.remove(n.index,n.items):("itemchange"==n.action||n.action===t)&&(r.render(),r.bindings.value&&r.bindings.value&&(i=f(r.bindings.value.get(),e(r.element).data("valueField")),null===i?r.element.selectedIndex=-1:r.element.value=i))):r.render()}}),value:_.extend({init:function(t,n,i){_.fn.init.call(this,t,n,i),this._change=P(this.change,this),e(this.element).change(this._change)},parsedValue:function(){var e,t,n,i,r=this.dataType(),o=[];for(n=0,i=this.element.options.length;i>n;n++)t=this.element.options[n],t.selected&&(e=t.attributes.value,e=e&&e.specified?t.value:t.text,o.push(this._parseValue(e,r)));return o},change:function(){var e,n,i,r,o,a,s,l,c=[],u=this.element,d=this.options.valueField||this.options.textField,h=this.options.valuePrimitive;for(o=0,a=u.options.length;a>o;o++)n=u.options[o],n.selected&&(r=n.attributes.value,r=r&&r.specified?n.value:n.text,c.push(this._parseValue(r,this.dataType())));if(d)for(e=this.bindings.source.get(),e instanceof C.data.DataSource&&(e=e.view()),i=0;c.length>i;i++)for(o=0,a=e.length;a>o;o++)if(s=this._parseValue(e[o].get(d),this.dataType()),l=s+""===c[i]){c[i]=e[o];break}r=this.bindings[I].get(),r instanceof A?r.splice.apply(r,[0,r.length].concat(c)):this.bindings[I].set(h||!(r instanceof T||null===r||r===t)&&d?c[0].get(d):c[0])},refresh:function(){var e,t,n,i=this.element,r=i.options,o=this.bindings[I].get(),a=o,s=this.options.valueField||this.options.textField,l=!1,c=this.dataType();for(a instanceof A||(a=new A([o])),i.selectedIndex=-1,n=0;a.length>n;n++)for(o=a[n],s&&o instanceof T&&(o=o.get(s)),"date"==c?o=C.toString(a[n],"yyyy-MM-dd"):"datetime-local"==c&&(o=C.toString(a[n],"yyyy-MM-ddTHH:mm:ss")),e=0;r.length>e;e++)t=r[e].value,""===t&&""!==o&&(t=r[e].text),null!=o&&t==""+o&&(r[e].selected=!0,l=!0)},destroy:function(){e(this.element).off(H,this._change)}})},M.widget={events:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e,this.handlers={}},refresh:function(e){var t=this.bindings.events[e],n=this.handlers[e];n&&this.widget.unbind(e,n),n=t.get(),this.handlers[e]=function(e){e.data=t.source,n(e),e.data===t.source&&delete e.data},this.widget.bind(e,this.handlers[e])},destroy:function(){var e;for(e in this.handlers)this.widget.unbind(e,this.handlers[e])}}),checked:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e,this._change=P(this.change,this),this.widget.bind(H,this._change)},change:function(){this.bindings[F].set(this.value())},refresh:function(){this.widget.check(this.bindings[F].get()===!0)},value:function(){var e=this.element,t=e.value;return("on"==t||"off"==t)&&(t=e.checked),t},destroy:function(){this.widget.unbind(H,this._change)}}),visible:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e},refresh:function(){var e=this.bindings.visible.get();this.widget.wrapper[0].style.display=e?"":"none"}}),invisible:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e},refresh:function(){var e=this.bindings.invisible.get();this.widget.wrapper[0].style.display=e?"none":""}}),enabled:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e},refresh:function(){this.widget.enable&&this.widget.enable(this.bindings.enabled.get())}}),disabled:v.extend({init:function(e,t,n){v.fn.init.call(this,e.element[0],t,n),this.widget=e},refresh:function(){this.widget.enable&&this.widget.enable(!this.bindings.disabled.get())}}),source:n("source","dataSource","setDataSource"),value:v.extend({init:function(t,n,i){v.fn.init.call(this,t.element[0],n,i),this.widget=t,this._change=e.proxy(this.change,this),this.widget.first(H,this._change);var r=this.bindings.value.get();this._valueIsObservableObject=!i.valuePrimitive&&(null==r||r instanceof T),this._valueIsObservableArray=r instanceof A,this._initChange=!1},change:function(){var e,t,n,i,r,o,a,s=this.widget.value(),l=this.options.dataValueField||this.options.dataTextField,c="[object Array]"===D.call(s),u=this._valueIsObservableObject,d=[];if(this._initChange=!0,l)if(this.bindings.source&&(a=this.bindings.source.get()),""===s&&(u||this.options.valuePrimitive))s=null;else{for((!a||a instanceof C.data.DataSource)&&(a=this.widget.dataSource.flatView()),c&&(t=s.length,d=s.slice(0)),r=0,o=a.length;o>r;r++)if(n=a[r],i=n.get(l),c){for(e=0;t>e;e++)if(i==d[e]){d[e]=n;break}}else if(i==s){s=u?n:i;break}d[0]&&(s=this._valueIsObservableArray?d:u||!l?d[0]:d[0].get(l))}this.bindings.value.set(s),this._initChange=!1},refresh:function(){var e,n,i,r,o,a,s,l,c;if(!this._initChange){if(e=this.widget,n=e.options,i=n.dataTextField,r=n.dataValueField||i,o=this.bindings.value.get(),a=n.text||"",s=0,c=[],o===t&&(o=null),r)if(o instanceof A){for(l=o.length;l>s;s++)c[s]=o[s].get(r);o=c}else o instanceof T&&(a=o.get(i),o=o.get(r));n.autoBind!==!1||n.cascadeFrom||!e.listView||e.listView.isBound()?e.value(o):(i!==r||a||(a=o),a||!o&&0!==o||!n.valuePrimitive?e._preselect(o,a):e.value(o))}this._initChange=!1},destroy:function(){this.widget.unbind(H,this._change)}}),gantt:{dependencies:n("dependencies","dependencies","setDependenciesDataSource")},multiselect:{value:v.extend({init:function(t,n,i){v.fn.init.call(this,t.element[0],n,i),this.widget=t,this._change=e.proxy(this.change,this),this.widget.first(H,this._change),this._initChange=!1},change:function(){var e,n,i,r,o,a,s,l,c,u=this,d=u.bindings[I].get(),h=u.options.valuePrimitive,f=h?u.widget.value():u.widget.dataItems(),p=this.options.dataValueField||this.options.dataTextField;if(f=f.slice(0),u._initChange=!0,d instanceof A){for(e=[],n=f.length,i=0,r=0,o=d[i],a=!1;o!==t;){for(c=!1,r=0;n>r;r++)if(h?a=f[r]==o:(l=f[r],l=l.get?l.get(p):l,a=l==(o.get?o.get(p):o)),a){f.splice(r,1),n-=1,c=!0;break}c?i+=1:(e.push(o),y(d,i,1),s=i),o=d[i]}y(d,d.length,0,f),e.length&&d.trigger("change",{action:"remove",items:e,index:s}),f.length&&d.trigger("change",{action:"add",items:f,index:d.length-1})}else u.bindings[I].set(f);u._initChange=!1},refresh:function(){if(!this._initChange){var e,n,i=this.options,r=this.widget,o=i.dataValueField||i.dataTextField,a=this.bindings.value.get(),s=a,l=0,c=[];if(a===t&&(a=null),o)if(a instanceof A){for(e=a.length;e>l;l++)n=a[l],c[l]=n.get?n.get(o):n;a=c}else a instanceof T&&(a=a.get(o));i.autoBind!==!1||i.valuePrimitive===!0||r.listView.isBound()?r.value(a):r._preselect(s,a)}},destroy:function(){this.widget.unbind(H,this._change)}})},scheduler:{source:n("source","dataSource","setDataSource").extend({dataBound:function(e){var t,n,i,r,o=this.widget,s=e.addedItems||o.items();if(s.length)for(i=e.addedDataItems||o.dataItems(),r=this.bindings.source._parents(),t=0,n=i.length;n>t;t++)a(s[t],i[t],this._ns(e.ns),[i[t]].concat(r))}})}},y=function(e,t,n,i){var r,o,a,s,l;if(i=i||[],n=n||0,r=i.length,o=e.length,a=[].slice.call(e,t+n),s=a.length,r){for(r=t+r,l=0;r>t;t++)e[t]=i[l],l++;e.length=r}else if(n)for(e.length=t,n+=t;n>t;)delete e[--n];if(s){for(s=t+s,l=0;s>t;t++)e[t]=a[l],l++;e.length=s}for(t=e.length;o>t;)delete e[t],t++},b=E.extend({init:function(e,t){this.target=e,this.options=t,this.toDestroy=[]},bind:function(e){var t,n,i,r,o,a,s=this instanceof w,l=this.binders();for(t in e)t==I?n=!0:t==z?i=!0:t!=R||s?t==F?o=!0:t==B?a=!0:this.applyBinding(t,e,l):r=!0;i&&this.applyBinding(z,e,l),n&&this.applyBinding(I,e,l),o&&this.applyBinding(F,e,l),r&&!s&&this.applyBinding(R,e,l),a&&!s&&this.applyBinding(B,e,l)},binders:function(){return M[this.target.nodeName.toLowerCase()]||{}},applyBinding:function(e,t,n){var i,r=n[e]||M[e],o=this.toDestroy,a=t[e];if(r)if(r=new r(this.target,t,this.options),o.push(r),a instanceof p)r.bind(a),o.push(a);else for(i in a)r.bind(a,i),o.push(a[i]);else if("template"!==e)throw Error("The "+e+" binding is not supported by the "+this.target.nodeName.toLowerCase()+" element")},destroy:function(){var e,t,n=this.toDestroy;for(e=0,t=n.length;t>e;e++)n[e].destroy()}}),w=b.extend({binders:function(){return M.widget[this.target.options.name.toLowerCase()]||{}},applyBinding:function(e,t,n){var i,r=n[e]||M.widget[e],o=this.toDestroy,a=t[e];if(!r)throw Error("The "+e+" binding is not supported by the "+this.target.options.name+" widget");if(r=new r(this.target,t,this.target.options),o.push(r),a instanceof p)r.bind(a),o.push(a);else for(i in a)r.bind(a,i),o.push(a[i])}}),x=/[A-Za-z0-9_\-]+:(\{([^}]*)\}|[^,}]+)/g,k=/\s/g,C.unbind=d,C.bind=s,C.data.binders=M,C.data.Binder=v,C.notify=h,C.observable=function(e){return e instanceof T||(e=new T(e)),e},C.observableHierarchy=function(e){function t(e){var n,i;for(n=0;e.length>n;n++)e[n]._initChildren(),i=e[n].children,i.fetch(),e[n].items=i.data(),t(e[n].items)}var n=C.data.HierarchicalDataSource.create(e);return n.fetch(),t(n.data()),n._data._dataSource=n,n._data}}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){return parseInt(e,10)}function i(e,t){return n(e.css(t))}function r(e){var t,n=[];for(t in e)n.push(t);return n}function o(e){for(var t in e)-1!=U.indexOf(t)&&-1==W.indexOf(t)&&delete e[t];return e}function a(e,t){var n,i,r,o,a=[],s={};for(i in t)n=i.toLowerCase(),o=P&&-1!=U.indexOf(n),!M.hasHW3D&&o&&-1==W.indexOf(n)?delete t[i]:(r=t[i],o?a.push(i+"("+r+")"):s[i]=r);return a.length&&(s[se]=a.join(" ")),s}function s(e,t){var i,r,o;return P?(i=e.css(se),i==K?"scale"==t?1:0:(r=i.match(RegExp(t+"\\s*\\(([\\d\\w\\.]+)")),o=0,r?o=n(r[1]):(r=i.match(B)||[0,0,0,0,0],t=t.toLowerCase(),O.test(t)?o=parseFloat(r[3]/r[2]):"translatey"==t?o=parseFloat(r[4]/r[2]):"scale"==t?o=parseFloat(r[2]):"rotate"==t&&(o=parseFloat(Math.atan2(r[2],r[1])))),o)):parseFloat(e.css(t))}function l(e){return e.charAt(0).toUpperCase()+e.substring(1)}function c(e,t){var n=p.extend(t),i=n.prototype.directions;S[l(e)]=n,S.Element.prototype[e]=function(e,t,i,r){return new n(this.element,e,t,i,r)},T(i,function(t,i){S.Element.prototype[e+l(i)]=function(e,t,r){return new n(this.element,i,e,t,r)}})}function u(e,n,i,r){c(e,{directions:m,startValue:function(e){return this._startValue=e,this},endValue:function(e){return this._endValue=e,this},shouldHide:function(){return this._shouldHide},prepare:function(e,o){var a,s,l=this,c="out"===this._direction,u=l.element.data(n),d=!(isNaN(u)||u==i);a=d?u:t!==this._startValue?this._startValue:c?i:r,s=t!==this._endValue?this._endValue:c?r:i,this._reverse?(e[n]=s,o[n]=a):(e[n]=a,o[n]=s),l._shouldHide=o[n]===r}})}function d(e,t){var n=C.directions[t].vertical,i=e[n?J:X]()/2+"px";return _[t].replace("$size",i)}var h,f,p,g,m,v,_,y,b,w,x,k,C=window.kendo,S=C.effects,T=e.each,A=e.extend,D=e.proxy,M=C.support,E=M.browser,P=M.transforms,I=M.transitions,z={scale:0,scalex:0,scaley:0,scale3d:0},R={translate:0,translatex:0,translatey:0,translate3d:0},F=t!==document.documentElement.style.zoom&&!P,B=/matrix3?d?\s*\(.*,\s*([\d\.\-]+)\w*?,\s*([\d\.\-]+)\w*?,\s*([\d\.\-]+)\w*?,\s*([\d\.\-]+)\w*?/i,L=/^(-?[\d\.\-]+)?[\w\s]*,?\s*(-?[\d\.\-]+)?[\w\s]*/i,O=/translatex?$/i,H=/(zoom|fade|expand)(\w+)/,N=/(zoom|fade|expand)/,V=/[xy]$/i,U=["perspective","rotate","rotatex","rotatey","rotatez","rotate3d","scale","scalex","scaley","scalez","scale3d","skew","skewx","skewy","translate","translatex","translatey","translatez","translate3d","matrix","matrix3d"],W=["rotate","scale","scalex","scaley","skew","skewx","skewy","translate","translatex","translatey","matrix"],j={rotate:"deg",scale:"",skew:"px",translate:"px"},G=P.css,q=Math.round,$="",Y="px",K="none",Q="auto",X="width",J="height",Z="hidden",ee="origin",te="abortId",ne="overflow",ie="translate",re="position",oe="completeCallback",ae=G+"transition",se=G+"transform",le=G+"backface-visibility",ce=G+"perspective",ue="1500px",de="perspective("+ue+")",he={left:{reverse:"right",property:"left",transition:"translatex",vertical:!1,modifier:-1},right:{reverse:"left",property:"left",transition:"translatex",vertical:!1,modifier:1},down:{reverse:"up",property:"top",transition:"translatey",vertical:!0,modifier:1},up:{reverse:"down",property:"top",transition:"translatey",vertical:!0,modifier:-1},top:{reverse:"bottom"},bottom:{reverse:"top"},"in":{reverse:"out",modifier:-1},out:{reverse:"in",modifier:1},vertical:{reverse:"vertical"},horizontal:{reverse:"horizontal"}};C.directions=he,A(e.fn,{kendoStop:function(e,t){return I?S.stopQueue(this,e||!1,t||!1):this.stop(e,t)}}),P&&!I&&(T(W,function(n,i){e.fn[i]=function(n){if(t===n)return s(this,i);var r=e(this)[0],o=i+"("+n+j[i.replace(V,"")]+")";return-1==r.style.cssText.indexOf(se)?e(this).css(se,o):r.style.cssText=r.style.cssText.replace(RegExp(i+"\\(.*?\\)","i"),o),this},e.fx.step[i]=function(t){e(t.elem)[i](t.now)}}),h=e.fx.prototype.cur,e.fx.prototype.cur=function(){return-1!=W.indexOf(this.prop)?parseFloat(e(this.elem)[this.prop]()):h.apply(this,arguments)}),C.toggleClass=function(e,t,n,i){return t&&(t=t.split(" "),I&&(n=A({exclusive:"all",duration:400,ease:"ease-out"},n),e.css(ae,n.exclusive+" "+n.duration+"ms "+n.ease),setTimeout(function(){e.css(ae,"").css(J)},n.duration)),T(t,function(t,n){e.toggleClass(n,i)})),e},C.parseEffects=function(e,t){var n={};return"string"==typeof e?T(e.split(" "),function(e,i){var r=!N.test(i),o=i.replace(H,function(e,t,n){return t+":"+n.toLowerCase()}),a=o.split(":"),s=a[1],l={};a.length>1&&(l.direction=t&&r?he[s].reverse:s),n[a[0]]=l}):T(e,function(e){var i=this.direction;i&&t&&!N.test(e)&&(this.direction=he[i].reverse),n[e]=this}),n},I&&A(S,{transition:function(t,n,i){var o,s,l,c,u=0,d=t.data("keys")||[];i=A({duration:200,ease:"ease-out",complete:null,exclusive:"all"},i),l=!1,c=function(){l||(l=!0,s&&(clearTimeout(s),s=null),t.removeData(te).dequeue().css(ae,"").css(ae),i.complete.call(t))},i.duration=e.fx?e.fx.speeds[i.duration]||i.duration:i.duration,o=a(t,n),e.merge(d,r(o)),t.data("keys",e.unique(d)).height(),t.css(ae,i.exclusive+" "+i.duration+"ms "+i.ease).css(ae),t.css(o).css(se),I.event&&(t.one(I.event,c),0!==i.duration&&(u=500)),s=setTimeout(c,i.duration+u),t.data(te,s),t.data(oe,c)},stopQueue:function(e,t,n){var i,r=e.data("keys"),o=!n&&r,a=e.data(oe);return o&&(i=C.getComputedStyles(e[0],r)),a&&a(),o&&e.css(i),e.removeData("keys").stop(t)}}),f=C.Class.extend({init:function(e,t){var n=this;n.element=e,n.effects=[],n.options=t,n.restore=[]},run:function(t){var n,i,r,s,l,c,u,d=this,h=t.length,f=d.element,p=d.options,g=e.Deferred(),m={},v={};for(d.effects=t,g.then(e.proxy(d,"complete")),f.data("animating",!0),i=0;h>i;i++)for(n=t[i],n.setReverse(p.reverse),n.setOptions(p),d.addRestoreProperties(n.restore),n.prepare(m,v),l=n.children(),r=0,c=l.length;c>r;r++)l[r].duration(p.duration).run();for(u in p.effects)A(v,p.effects[u].properties);for(f.is(":visible")||A(m,{display:f.data("olddisplay")||"block"}),P&&!p.reset&&(s=f.data("targetTransform"),s&&(m=A(s,m))),m=a(f,m),P&&!I&&(m=o(m)),f.css(m).css(se),i=0;h>i;i++)t[i].setup();return p.init&&p.init(),f.data("targetTransform",v),S.animate(f,v,A({},p,{complete:g.resolve})),g.promise()},stop:function(){e(this.element).kendoStop(!0,!0)},addRestoreProperties:function(e){for(var t,n=this.element,i=0,r=e.length;r>i;i++)t=e[i],this.restore.push(t),n.data(t)||n.data(t,n.css(t))},restoreCallback:function(){var e,t,n,i=this.element;for(e=0,t=this.restore.length;t>e;e++)n=this.restore[e],i.css(n,i.data(n))},complete:function(){var t=this,n=0,i=t.element,r=t.options,o=t.effects,a=o.length;for(i.removeData("animating").dequeue(),r.hide&&i.data("olddisplay",i.css("display")).hide(),this.restoreCallback(),F&&!P&&setTimeout(e.proxy(this,"restoreCallback"),0);a>n;n++)o[n].teardown();r.completeCallback&&r.completeCallback(i)}}),S.promise=function(e,t){var n,i,r,o=[],a=new f(e,t),s=C.parseEffects(t.effects);t.effects=s;for(r in s)n=S[l(r)],n&&(i=new n(e,s[r].direction),o.push(i));o[0]?a.run(o):(e.is(":visible")||e.css({display:e.data("olddisplay")||"block"}).css("display"),t.init&&t.init(),e.dequeue(),a.complete())},A(S,{animate:function(n,r,a){var s=a.transition!==!1;delete a.transition,I&&"transition"in S&&s?S.transition(n,r,a):P?n.animate(o(r),{queue:!1,show:!1,hide:!1,duration:a.duration,complete:a.complete}):n.each(function(){var n=e(this),o={};T(U,function(e,a){var s,l,c,u,d,h,f,p=r?r[a]+" ":null;p&&(l=r,a in z&&r[a]!==t?(s=p.match(L),P&&A(l,{scale:+s[0]})):a in R&&r[a]!==t&&(c=n.css(re),u="absolute"==c||"fixed"==c,n.data(ie)||(u?n.data(ie,{top:i(n,"top")||0,left:i(n,"left")||0,bottom:i(n,"bottom"),right:i(n,"right")}):n.data(ie,{top:i(n,"marginTop")||0,left:i(n,"marginLeft")||0})),d=n.data(ie),s=p.match(L),s&&(h=a==ie+"y"?0:+s[1],f=a==ie+"y"?+s[1]:+s[2],u?(isNaN(d.right)?isNaN(h)||A(l,{left:d.left+h}):isNaN(h)||A(l,{right:d.right-h}),isNaN(d.bottom)?isNaN(f)||A(l,{top:d.top+f}):isNaN(f)||A(l,{bottom:d.bottom-f})):(isNaN(h)||A(l,{marginLeft:d.left+h}),isNaN(f)||A(l,{marginTop:d.top+f})))),!P&&"scale"!=a&&a in l&&delete l[a],l&&A(o,l))}),E.msie&&delete o.scale,n.animate(o,{queue:!1,show:!1,hide:!1,duration:a.duration,complete:a.complete})})}}),S.animatedPromise=S.promise,p=C.Class.extend({init:function(e,t){var n=this;n.element=e,n._direction=t,n.options={},n._additionalEffects=[],n.restore||(n.restore=[])},reverse:function(){return this._reverse=!0,this.run()},play:function(){return this._reverse=!1,this.run()},add:function(e){return this._additionalEffects.push(e),this},direction:function(e){return this._direction=e,this},duration:function(e){return this._duration=e,this},compositeRun:function(){var e=this,t=new f(e.element,{reverse:e._reverse,duration:e._duration}),n=e._additionalEffects.concat([e]);return t.run(n)},run:function(){if(this._additionalEffects&&this._additionalEffects[0])return this.compositeRun();var t,n,i=this,r=i.element,s=0,l=i.restore,c=l.length,u=e.Deferred(),d={},h={},f=i.children(),p=f.length;for(u.then(e.proxy(i,"_complete")),r.data("animating",!0),s=0;c>s;s++)t=l[s],r.data(t)||r.data(t,r.css(t));for(s=0;p>s;s++)f[s].duration(i._duration).run();return i.prepare(d,h),r.is(":visible")||A(d,{display:r.data("olddisplay")||"block"}),P&&(n=r.data("targetTransform"),n&&(d=A(n,d))),d=a(r,d),P&&!I&&(d=o(d)),r.css(d).css(se),i.setup(),r.data("targetTransform",h),S.animate(r,h,{duration:i._duration,complete:u.resolve}),u.promise()},stop:function(){var t=0,n=this.children(),i=n.length;for(t=0;i>t;t++)n[t].stop();return e(this.element).kendoStop(!0,!0),this},restoreCallback:function(){var e,t,n,i=this.element;for(e=0,t=this.restore.length;t>e;e++)n=this.restore[e],i.css(n,i.data(n))},_complete:function(){var t=this,n=t.element;n.removeData("animating").dequeue(),t.restoreCallback(),t.shouldHide()&&n.data("olddisplay",n.css("display")).hide(),F&&!P&&setTimeout(e.proxy(t,"restoreCallback"),0),t.teardown()},setOptions:function(e){A(!0,this.options,e)},children:function(){return[]},shouldHide:e.noop,setup:e.noop,prepare:e.noop,teardown:e.noop,directions:[],setReverse:function(e){return this._reverse=e,this}}),g=["left","right","up","down"],m=["in","out"],c("slideIn",{directions:g,divisor:function(e){return this.options.divisor=e,this},prepare:function(e,t){var n,i=this,r=i.element,o=he[i._direction],a=-o.modifier*(o.vertical?r.outerHeight():r.outerWidth()),s=a/(i.options&&i.options.divisor||1)+Y,l="0px";i._reverse&&(n=e,e=t,t=n),P?(e[o.transition]=s,t[o.transition]=l):(e[o.property]=s,t[o.property]=l)}}),c("tile",{directions:g,init:function(e,t,n){p.prototype.init.call(this,e,t),this.options={previous:n}},previousDivisor:function(e){return this.options.previousDivisor=e,this},children:function(){var e=this,t=e._reverse,n=e.options.previous,i=e.options.previousDivisor||1,r=e._direction,o=[C.fx(e.element).slideIn(r).setReverse(t)];return n&&o.push(C.fx(n).slideIn(he[r].reverse).divisor(i).setReverse(!t)),o}}),u("fade","opacity",1,0),u("zoom","scale",1,.01),c("slideMargin",{prepare:function(e,t){var n,i=this,r=i.element,o=i.options,a=r.data(ee),s=o.offset,l=i._reverse;l||null!==a||r.data(ee,parseFloat(r.css("margin-"+o.axis))),n=r.data(ee)||0,t["margin-"+o.axis]=l?n:n+s}}),c("slideTo",{prepare:function(e,t){var n=this,i=n.element,r=n.options,o=r.offset.split(","),a=n._reverse;P?(t.translatex=a?0:o[0],t.translatey=a?0:o[1]):(t.left=a?0:o[0],t.top=a?0:o[1]),i.css("left")}}),c("expand",{directions:["horizontal","vertical"],restore:[ne],prepare:function(e,n){var i=this,r=i.element,o=i.options,a=i._reverse,s="vertical"===i._direction?J:X,l=r[0].style[s],c=r.data(s),u=parseFloat(c||l),d=q(r.css(s,Q)[s]());e.overflow=Z,u=o&&o.reset?d||u:u||d,n[s]=(a?0:u)+Y,e[s]=(a?u:0)+Y,c===t&&r.data(s,l)},shouldHide:function(){return this._reverse},teardown:function(){var e=this,t=e.element,n="vertical"===e._direction?J:X,i=t.data(n);(i==Q||i===$)&&setTimeout(function(){t.css(n,Q).css(n)},0)}}),v={position:"absolute",marginLeft:0,marginTop:0,scale:1},c("transfer",{init:function(e,t){this.element=e,this.options={target:t},this.restore=[]},setup:function(){this.element.appendTo(document.body)},prepare:function(e,t){var n=this,i=n.element,r=S.box(i),o=S.box(n.options.target),a=s(i,"scale"),l=S.fillScale(o,r),c=S.transformOrigin(o,r);A(e,v),t.scale=1,i.css(se,"scale(1)").css(se),i.css(se,"scale("+a+")"),e.top=r.top,e.left=r.left,e.transformOrigin=c.x+Y+" "+c.y+Y,n._reverse?e.scale=l:t.scale=l}}),_={top:"rect(auto auto $size auto)",bottom:"rect($size auto auto auto)",left:"rect(auto $size auto auto)",right:"rect(auto auto auto $size)"},y={top:{start:"rotatex(0deg)",end:"rotatex(180deg)"},bottom:{start:"rotatex(-180deg)",end:"rotatex(0deg)"},left:{start:"rotatey(0deg)",end:"rotatey(-180deg)"},right:{start:"rotatey(180deg)",end:"rotatey(0deg)"}},c("turningPage",{directions:g,init:function(e,t,n){p.prototype.init.call(this,e,t),this._container=n},prepare:function(e,t){var n=this,i=n._reverse,r=i?he[n._direction].reverse:n._direction,o=y[r];e.zIndex=1,n._clipInHalf&&(e.clip=d(n._container,C.directions[r].reverse)),e[le]=Z,t[se]=de+(i?o.start:o.end),e[se]=de+(i?o.end:o.start)},setup:function(){this._container.append(this.element)},face:function(e){return this._face=e,this},shouldHide:function(){var e=this,t=e._reverse,n=e._face;return t&&!n||!t&&n},clipInHalf:function(e){return this._clipInHalf=e,this},temporary:function(){return this.element.addClass("temp-page"),this}}),c("staticPage",{directions:g,init:function(e,t,n){p.prototype.init.call(this,e,t),this._container=n},restore:["clip"],prepare:function(e,t){var n=this,i=n._reverse?he[n._direction].reverse:n._direction;e.clip=d(n._container,i),e.opacity=.999,t.opacity=1},shouldHide:function(){var e=this,t=e._reverse,n=e._face;return t&&!n||!t&&n},face:function(e){return this._face=e,this}}),c("pageturn",{directions:["horizontal","vertical"],init:function(e,t,n,i){p.prototype.init.call(this,e,t),this.options={},this.options.face=n,this.options.back=i},children:function(){var e,t=this,n=t.options,i="horizontal"===t._direction?"left":"top",r=C.directions[i].reverse,o=t._reverse,a=n.face.clone(!0).removeAttr("id"),s=n.back.clone(!0).removeAttr("id"),l=t.element;return o&&(e=i,i=r,r=e),[C.fx(n.face).staticPage(i,l).face(!0).setReverse(o),C.fx(n.back).staticPage(r,l).setReverse(o),C.fx(a).turningPage(i,l).face(!0).clipInHalf(!0).temporary().setReverse(o),C.fx(s).turningPage(r,l).clipInHalf(!0).temporary().setReverse(o)]},prepare:function(e,t){e[ce]=ue,e.transformStyle="preserve-3d",e.opacity=.999,t.opacity=1},teardown:function(){this.element.find(".temp-page").remove()}}),c("flip",{directions:["horizontal","vertical"],init:function(e,t,n,i){p.prototype.init.call(this,e,t),this.options={},this.options.face=n,this.options.back=i},children:function(){var e,t=this,n=t.options,i="horizontal"===t._direction?"left":"top",r=C.directions[i].reverse,o=t._reverse,a=t.element;return o&&(e=i,i=r,r=e),[C.fx(n.face).turningPage(i,a).face(!0).setReverse(o),C.fx(n.back).turningPage(r,a).setReverse(o)]},prepare:function(e){e[ce]=ue,e.transformStyle="preserve-3d"}}),b=!M.mobileOS.android,w=".km-touch-scrollbar, .km-actionsheet-wrapper",c("replace",{_before:e.noop,_after:e.noop,init:function(t,n,i){p.prototype.init.call(this,t),this._previous=e(n),this._transitionClass=i},duration:function(){throw Error("The replace effect does not support duration setting; the effect duration may be customized through the transition class rule")},beforeTransition:function(e){return this._before=e,this},afterTransition:function(e){return this._after=e,this},_both:function(){return e().add(this._element).add(this._previous)},_containerClass:function(){var e=this._direction,t="k-fx k-fx-start k-fx-"+this._transitionClass;return e&&(t+=" k-fx-"+e),this._reverse&&(t+=" k-fx-reverse"),t},complete:function(t){if(!(!this.deferred||t&&e(t.target).is(w))){var n=this.container;n.removeClass("k-fx-end").removeClass(this._containerClass()).off(I.event,this.completeProxy),this._previous.hide().removeClass("k-fx-current"),this.element.removeClass("k-fx-next"),b&&n.css(ne,""),this.isAbsolute||this._both().css(re,""),this.deferred.resolve(),delete this.deferred}},run:function(){if(this._additionalEffects&&this._additionalEffects[0])return this.compositeRun();var t,n=this,i=n.element,r=n._previous,o=i.parents().filter(r.parents()).first(),a=n._both(),s=e.Deferred(),l=i.css(re);return o.length||(o=i.parent()),this.container=o,this.deferred=s,this.isAbsolute="absolute"==l,this.isAbsolute||a.css(re,"absolute"),b&&(t=o.css(ne),o.css(ne,"hidden")),I?(i.addClass("k-fx-hidden"),o.addClass(this._containerClass()),this.completeProxy=e.proxy(this,"complete"),o.on(I.event,this.completeProxy),C.animationFrame(function(){i.removeClass("k-fx-hidden").addClass("k-fx-next"),r.css("display","").addClass("k-fx-current"),n._before(r,i),C.animationFrame(function(){o.removeClass("k-fx-start").addClass("k-fx-end"),n._after(r,i)})})):this.complete(),s.promise()},stop:function(){this.complete()}}),x=C.Class.extend({init:function(){var e=this;e._tickProxy=D(e._tick,e),e._started=!1},tick:e.noop,done:e.noop,onEnd:e.noop,onCancel:e.noop,start:function(){this.enabled()&&(this.done()?this.onEnd():(this._started=!0,C.animationFrame(this._tickProxy)))},enabled:function(){return!0},cancel:function(){this._started=!1,this.onCancel()},_tick:function(){var e=this;e._started&&(e.tick(),e.done()?(e._started=!1,e.onEnd()):C.animationFrame(e._tickProxy))}}),k=x.extend({init:function(e){var t=this;A(t,e),x.fn.init.call(t)},done:function(){return this.timePassed()>=this.duration},timePassed:function(){return Math.min(this.duration,new Date-this.startDate)},moveTo:function(e){var t=this,n=t.movable;t.initial=n[t.axis],t.delta=e.location-t.initial,t.duration="number"==typeof e.duration?e.duration:300,t.tick=t._easeProxy(e.ease),t.startDate=new Date,t.start()},_easeProxy:function(e){var t=this;return function(){t.movable.moveAxis(t.axis,e(t.timePassed(),t.initial,t.delta,t.duration))}}}),A(k,{easeOutExpo:function(e,t,n,i){return e==i?t+n:n*(-Math.pow(2,-10*e/i)+1)+t},easeOutBack:function(e,t,n,i,r){return r=1.70158,n*((e=e/i-1)*e*((r+1)*e+r)+1)+t}}),S.Animation=x,S.Transition=k,S.createEffect=c,S.box=function(t){t=e(t);var n=t.offset();return n.width=t.outerWidth(),n.height=t.outerHeight(),n},S.transformOrigin=function(e,t){var n=(e.left-t.left)*t.width/(t.width-e.width),i=(e.top-t.top)*t.height/(t.height-e.height);return{x:isNaN(n)?0:n,y:isNaN(i)?0:i}},S.fillScale=function(e,t){return Math.min(e.width/t.width,e.height/t.height)},S.fitScale=function(e,t){return Math.max(e.width/t.width,e.height/t.height)}}(window.kendo.jQuery)}(),function(){!function(e){function t(e){if(!e)return{};var t=e.match(v)||[];return{type:t[1],direction:t[3],reverse:"reverse"===t[5]}}var n=window.kendo,i=n.Observable,r="SCRIPT",o="init",a="show",s="hide",l="transitionStart",c="transitionEnd",u="attach",d="detach",h=/unrecognized expression/,f=i.extend({init:function(e,t){var r=this;t=t||{},i.fn.init.call(r),r.content=e,r.id=n.guid(),r.tagName=t.tagName||"div",r.model=t.model,r._wrap=t.wrap!==!1,this._evalTemplate=t.evalTemplate||!1,r._fragments={},r.bind([o,a,s,l,c],t)},render:function(t){var i=this,r=!i.element;return r&&(i.element=i._createElement()),t&&e(t).append(i.element),r&&(n.bind(i.element,i.model),i.trigger(o)),t&&(i._eachFragment(u),i.trigger(a)),i.element},clone:function(){return new p(this)},triggerBeforeShow:function(){return!0},triggerBeforeHide:function(){
return!0},showStart:function(){this.element.css("display","")},showEnd:function(){},hideEnd:function(){this.hide()},beforeTransition:function(e){this.trigger(l,{type:e})},afterTransition:function(e){this.trigger(c,{type:e})},hide:function(){this._eachFragment(d),this.element.detach(),this.trigger(s)},destroy:function(){var e=this.element;e&&(n.unbind(e),n.destroy(e),e.remove())},fragments:function(t){e.extend(this._fragments,t)},_eachFragment:function(e){for(var t in this._fragments)this._fragments[t][e](this,t)},_createElement:function(){var t,i,o,a=this,s="<"+a.tagName+" />";try{i=e(document.getElementById(a.content)||a.content),i[0].tagName===r&&(i=i.html())}catch(l){h.test(l.message)&&(i=a.content)}return"string"==typeof i?(i=i.replace(/^\s+|\s+$/g,""),a._evalTemplate&&(i=n.template(i)(a.model||{})),t=e(s).append(i),a._wrap||(t=t.contents())):(t=i,a._evalTemplate&&(o=e(n.template(e("<div />").append(t.clone(!0)).html())(a.model||{})),e.contains(document,t[0])&&t.replaceWith(o),t=o),a._wrap&&(t=t.wrapAll(s).parent())),t}}),p=n.Class.extend({init:function(t){e.extend(this,{element:t.element.clone(!0),transition:t.transition,id:t.id}),t.element.parent().append(this.element)},hideEnd:function(){this.element.remove()},beforeTransition:e.noop,afterTransition:e.noop}),g=f.extend({init:function(e,t){f.fn.init.call(this,e,t),this.containers={}},container:function(e){var t=this.containers[e];return t||(t=this._createContainer(e),this.containers[e]=t),t},showIn:function(e,t,n){this.container(e).show(t,n)},_createContainer:function(e){var t,n=this.render(),i=n.find(e);if(!i.length&&n.is(e)){if(!n.is(e))throw Error("can't find a container with the specified "+e+" selector");i=n}return t=new _(i),t.bind("accepted",function(e){e.view.render(i)}),t}}),m=f.extend({attach:function(e,t){e.element.find(t).replaceWith(this.render())},detach:function(){}}),v=/^(\w+)(:(\w+))?( (\w+))?$/,_=i.extend({init:function(e){i.fn.init.call(this),this.container=e,this.history=[],this.view=null,this.running=!1},after:function(){this.running=!1,this.trigger("complete",{view:this.view}),this.trigger("after")},end:function(){this.view.showEnd(),this.previous.hideEnd(),this.after()},show:function(e,i,r){if(!e.triggerBeforeShow()||this.view&&!this.view.triggerBeforeHide())return this.trigger("after"),!1;r=r||e.id;var o=this,a=e===o.view?e.clone():o.view,s=o.history,l=s[s.length-2]||{},c=l.id===r,u=i||(c?s[s.length-1].transition:e.transition),d=t(u);return o.running&&o.effect.stop(),"none"===u&&(u=null),o.trigger("accepted",{view:e}),o.view=e,o.previous=a,o.running=!0,c?s.pop():s.push({id:r,transition:u}),a?(u&&n.effects.enabled?(e.element.addClass("k-fx-hidden"),e.showStart(),c&&!i&&(d.reverse=!d.reverse),o.effect=n.fx(e.element).replace(a.element,d.type).beforeTransition(function(){e.beforeTransition("show"),a.beforeTransition("hide")}).afterTransition(function(){e.afterTransition("show"),a.afterTransition("hide")}).direction(d.direction).setReverse(d.reverse),o.effect.run().then(function(){o.end()})):(e.showStart(),o.end()),!0):(e.showStart(),e.showEnd(),o.after(),!0)}});n.ViewContainer=_,n.Fragment=m,n.Layout=g,n.View=f,n.ViewClone=p}(window.kendo.jQuery)}(),function(){!function(e){var t=kendo.data.RemoteTransport.extend({init:function(e){var t,n=e&&e.signalr?e.signalr:{},i=n.promise;if(!i)throw Error('The "promise" option must be set.');if("function"!=typeof i.done||"function"!=typeof i.fail)throw Error('The "promise" option must be a Promise.');if(this.promise=i,t=n.hub,!t)throw Error('The "hub" option must be set.');if("function"!=typeof t.on||"function"!=typeof t.invoke)throw Error('The "hub" option is not a valid SignalR hub proxy.');this.hub=t,kendo.data.RemoteTransport.fn.init.call(this,e)},push:function(e){var t=this.options.signalr.client||{};t.create&&this.hub.on(t.create,e.pushCreate),t.update&&this.hub.on(t.update,e.pushUpdate),t.destroy&&this.hub.on(t.destroy,e.pushDestroy)},_crud:function(t,n){var i,r,o=this.hub,a=this.options.signalr.server;if(!a||!a[n])throw Error(kendo.format('The "server.{0}" option must be set.',n));i=[a[n]],r=this.parameterMap(t.data,n),e.isEmptyObject(r)||i.push(r),this.promise.done(function(){o.invoke.apply(o,i).done(t.success).fail(t.error)})},read:function(e){this._crud(e,"read")},create:function(e){this._crud(e,"create")},update:function(e){this._crud(e,"update")},destroy:function(e){this._crud(e,"destroy")}});e.extend(!0,kendo.data,{transports:{signalr:t}})}(window.kendo.jQuery)}(),function(){!function(e){function t(t){var n,i=s.ui.validator.ruleResolvers||{},r={};for(n in i)e.extend(!0,r,i[n].resolve(t));return r}function n(e){return e.replace(/&amp/g,"&amp;").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">")}function i(e){return e=(e+"").split("."),e.length>1?e[1].length:0}function r(t){return e(e.parseHTML?e.parseHTML(t):t)}function o(t,n){var i,r,o,a,l=e();for(o=0,a=t.length;a>o;o++)i=t[o],d.test(i.className)&&(r=i.getAttribute(s.attr("for")),r===n&&(l=l.add(i)));return l}var a,s=window.kendo,l=s.ui.Widget,c=".kendoValidator",u="k-invalid-msg",d=RegExp(u,"i"),h="k-invalid",f="k-valid",p=/^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i,g=/^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i,m=":input:not(:button,[type=submit],[type=reset],[disabled],[readonly])",v=":checkbox:not([disabled],[readonly])",_="[type=number],[type=range]",y="blur",b="name",w="form",x="novalidate",k=e.proxy,C=function(e,t){return"string"==typeof t&&(t=RegExp("^(?:"+t+")$")),t.test(e)},S=function(e,t,n){var i=e.val();return e.filter(t).length&&""!==i?C(i,n):!0},T=function(e,t){return e.length?null!=e[0].attributes[t]:!1};s.ui.validator||(s.ui.validator={rules:{},messages:{}}),a=l.extend({init:function(n,i){var r=this,o=t(n),a="["+s.attr("validate")+"!=false]";i=i||{},i.rules=e.extend({},s.ui.validator.rules,o.rules,i.rules),i.messages=e.extend({},s.ui.validator.messages,o.messages,i.messages),l.fn.init.call(r,n,i),r._errorTemplate=s.template(r.options.errorTemplate),r.element.is(w)&&r.element.attr(x,x),r._inputSelector=m+a,r._checkboxSelector=v+a,r._errors={},r._attachEvents(),r._isValidated=!1},events:["validate","change"],options:{name:"Validator",errorTemplate:'<span class="k-widget k-tooltip k-tooltip-validation"><span class="k-icon k-warning"> </span> #=message#</span>',messages:{required:"{0} is required",pattern:"{0} is not valid",min:"{0} should be greater than or equal to {1}",max:"{0} should be smaller than or equal to {1}",step:"{0} is not valid",email:"{0} is not valid email",url:"{0} is not valid URL",date:"{0} is not valid date",dateCompare:"End date should be greater than or equal to the start date"},rules:{required:function(e){var t=e.filter("[type=checkbox]").length&&!e.is(":checked"),n=e.val();return!(T(e,"required")&&(""===n||!n||t))},pattern:function(e){return e.filter("[type=text],[type=email],[type=url],[type=tel],[type=search],[type=password]").filter("[pattern]").length&&""!==e.val()?C(e.val(),e.attr("pattern")):!0},min:function(e){if(e.filter(_+",["+s.attr("type")+"=number]").filter("[min]").length&&""!==e.val()){var t=parseFloat(e.attr("min"))||0,n=s.parseFloat(e.val());return n>=t}return!0},max:function(e){if(e.filter(_+",["+s.attr("type")+"=number]").filter("[max]").length&&""!==e.val()){var t=parseFloat(e.attr("max"))||0,n=s.parseFloat(e.val());return t>=n}return!0},step:function(e){if(e.filter(_+",["+s.attr("type")+"=number]").filter("[step]").length&&""!==e.val()){var t,n=parseFloat(e.attr("min"))||0,r=parseFloat(e.attr("step"))||1,o=parseFloat(e.val()),a=i(r);return a?(t=Math.pow(10,a),Math.floor((o-n)*t)%(r*t)/Math.pow(100,a)===0):(o-n)%r===0}return!0},email:function(e){return S(e,"[type=email],["+s.attr("type")+"=email]",p)},url:function(e){return S(e,"[type=url],["+s.attr("type")+"=url]",g)},date:function(e){return e.filter("[type^=date],["+s.attr("type")+"=date]").length&&""!==e.val()?null!==s.parseDate(e.val(),e.attr(s.attr("format"))):!0}},validateOnBlur:!0},destroy:function(){l.fn.destroy.call(this),this.element.off(c)},value:function(){return this._isValidated?0===this.errors().length:!1},_submit:function(e){return this.validate()?!0:(e.stopPropagation(),e.stopImmediatePropagation(),e.preventDefault(),!1)},_checkElement:function(e){var t=this.value();this.validateInput(e),this.value()!==t&&this.trigger("change")},_attachEvents:function(){var t=this;t.element.is(w)&&t.element.on("submit"+c,k(t._submit,t)),t.options.validateOnBlur&&(t.element.is(m)?(t.element.on(y+c,function(){t._checkElement(t.element)}),t.element.is(v)&&t.element.on("click"+c,function(){t._checkElement(t.element)})):(t.element.on(y+c,t._inputSelector,function(){t._checkElement(e(this))}),t.element.on("click"+c,t._checkboxSelector,function(){t._checkElement(e(this))})))},validate:function(){var e,t,n,i,r=!1,o=this.value();if(this._errors={},this.element.is(m))r=this.validateInput(this.element);else{for(i=!1,e=this.element.find(this._inputSelector),t=0,n=e.length;n>t;t++)this.validateInput(e.eq(t))||(i=!0);r=!i}return this.trigger("validate",{valid:r}),o!==r&&this.trigger("change"),r},validateInput:function(t){var i,o,a,l,c,d,p,g,m,v;return t=e(t),this._isValidated=!0,i=this,o=i._errorTemplate,a=i._checkValidity(t),l=a.valid,c="."+u,d=t.attr(b)||"",p=i._findMessageContainer(d).add(t.next(c).filter(function(){var t=e(this);return t.filter("["+s.attr("for")+"]").length?t.attr(s.attr("for"))===d:!0})).hide(),t.removeAttr("aria-invalid"),l?delete i._errors[d]:(g=i._extractMessage(t,a.key),i._errors[d]=g,m=r(o({message:n(g)})),v=p.attr("id"),i._decorateMessageContainer(m,d),v&&m.attr("id",v),p.replaceWith(m).length||m.insertAfter(t),m.show(),t.attr("aria-invalid",!0)),t.toggleClass(h,!l),t.toggleClass(f,l),l},hideMessages:function(){var e=this,t="."+u,n=e.element;n.is(m)?n.next(t).hide():n.find(t).hide()},_findMessageContainer:function(t){var n,i,r,a=s.ui.validator.messageLocators,l=e();for(i=0,r=this.element.length;r>i;i++)l=l.add(o(this.element[i].getElementsByTagName("*"),t));for(n in a)l=l.add(a[n].locate(this.element,t));return l},_decorateMessageContainer:function(e,t){var n,i=s.ui.validator.messageLocators;e.addClass(u).attr(s.attr("for"),t||"");for(n in i)i[n].decorate(e,t);e.attr("role","alert")},_extractMessage:function(e,t){var n=this,i=n.options.messages[t],r=e.attr(b);return i=s.isFunction(i)?i(e):i,s.format(e.attr(s.attr(t+"-msg"))||e.attr("validationMessage")||e.attr("title")||i||"",r,e.attr(t))},_checkValidity:function(e){var t,n=this.options.rules;for(t in n)if(!n[t].call(this,e))return{valid:!1,key:t};return{valid:!0}},errors:function(){var e,t=[],n=this._errors;for(e in n)t.push(n[e]);return t}}),s.ui.plugin(a)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t,n){try{return e.contains(t,n)||t==n}catch(i){return!1}}function i(e,t){return parseInt(e.css(t),10)||0}function r(e,t){return Math.min(Math.max(e,t.min),t.max)}function o(e,t){var n=D(e),r=n.left+i(e,"borderLeftWidth")+i(e,"paddingLeft"),o=n.top+i(e,"borderTopWidth")+i(e,"paddingTop"),a=r+e.width()-t.outerWidth(!0),s=o+e.height()-t.outerHeight(!0);return{x:{min:r,max:a},y:{min:o,max:s}}}function a(n,i,r){for(var o,a,s=0,l=i&&i.length,c=r&&r.length;n&&n.parentNode;){for(s=0;l>s;s++)if(o=i[s],o.element[0]===n)return{target:o,targetElement:n};for(s=0;c>s;s++)if(a=r[s],e.contains(a.element[0],n)&&y.matchesSelector.call(n,a.options.filter))return{target:a,targetElement:n};n=n.parentNode}return t}function s(e,t){var n,i=t.options.group,r=e[i];if(k.fn.destroy.call(t),r.length>1){for(n=0;r.length>n;n++)if(r[n]==t){r.splice(n,1);break}}else r.length=0,delete e[i]}function l(e){var t,n,i,r=c()[0];return e[0]===r?(n=r.scrollTop,i=r.scrollLeft,{top:n,left:i,bottom:n+w.height(),right:i+w.width()}):(t=e.offset(),t.bottom=t.top+e.height(),t.right=t.left+e.width(),t)}function c(){return e(_.support.browser.chrome?b.body:b.documentElement)}function u(t){var n,i=c();if(!t||t===b.body||t===b.documentElement)return i;for(n=e(t)[0];!_.isScrollable(n)&&n!==b.body;)n=n.parentNode;return n===b.body?i:e(n)}function d(e,t,n){var i={x:0,y:0},r=50;return r>e-n.left?i.x=-(r-(e-n.left)):r>n.right-e&&(i.x=r-(n.right-e)),r>t-n.top?i.y=-(r-(t-n.top)):r>n.bottom-t&&(i.y=r-(n.bottom-t)),i}var h,f,p,g,m,v,_=window.kendo,y=_.support,b=window.document,w=e(window),x=_.Class,k=_.ui.Widget,C=_.Observable,S=_.UserEvents,T=e.proxy,A=e.extend,D=_.getOffset,M={},E={},P={},I=_.elementUnderCursor,z="keyup",R="change",F="dragstart",B="hold",L="drag",O="dragend",H="dragcancel",N="hintDestroyed",V="dragenter",U="dragleave",W="drop",j=C.extend({init:function(t,n){var i=this,r=t[0];i.capture=!1,r.addEventListener?(e.each(_.eventMap.down.split(" "),function(){r.addEventListener(this,T(i._press,i),!0)}),e.each(_.eventMap.up.split(" "),function(){r.addEventListener(this,T(i._release,i),!0)})):(e.each(_.eventMap.down.split(" "),function(){r.attachEvent(this,T(i._press,i))}),e.each(_.eventMap.up.split(" "),function(){r.attachEvent(this,T(i._release,i))})),C.fn.init.call(i),i.bind(["press","release"],n||{})},captureNext:function(){this.capture=!0},cancelCapture:function(){this.capture=!1},_press:function(e){var t=this;t.trigger("press"),t.capture&&e.preventDefault()},_release:function(e){var t=this;t.trigger("release"),t.capture&&(e.preventDefault(),t.cancelCapture())}}),G=C.extend({init:function(t){var n=this;C.fn.init.call(n),n.forcedEnabled=!1,e.extend(n,t),n.scale=1,n.horizontal?(n.measure="offsetWidth",n.scrollSize="scrollWidth",n.axis="x"):(n.measure="offsetHeight",n.scrollSize="scrollHeight",n.axis="y")},makeVirtual:function(){e.extend(this,{virtual:!0,forcedEnabled:!0,_virtualMin:0,_virtualMax:0})},virtualSize:function(e,t){(this._virtualMin!==e||this._virtualMax!==t)&&(this._virtualMin=e,this._virtualMax=t,this.update())},outOfBounds:function(e){return e>this.max||this.min>e},forceEnabled:function(){this.forcedEnabled=!0},getSize:function(){return this.container[0][this.measure]},getTotal:function(){return this.element[0][this.scrollSize]},rescale:function(e){this.scale=e},update:function(e){var t=this,n=t.virtual?t._virtualMax:t.getTotal(),i=n*t.scale,r=t.getSize();(0!==n||t.forcedEnabled)&&(t.max=t.virtual?-t._virtualMin:0,t.size=r,t.total=i,t.min=Math.min(t.max,r-i),t.minScale=r/n,t.centerOffset=(i-r)/2,t.enabled=t.forcedEnabled||i>r,e||t.trigger(R,t))}}),q=C.extend({init:function(e){var t=this;C.fn.init.call(t),t.x=new G(A({horizontal:!0},e)),t.y=new G(A({horizontal:!1},e)),t.container=e.container,t.forcedMinScale=e.minScale,t.maxScale=e.maxScale||100,t.bind(R,e)},rescale:function(e){this.x.rescale(e),this.y.rescale(e),this.refresh()},centerCoordinates:function(){return{x:Math.min(0,-this.x.centerOffset),y:Math.min(0,-this.y.centerOffset)}},refresh:function(){var e=this;e.x.update(),e.y.update(),e.enabled=e.x.enabled||e.y.enabled,e.minScale=e.forcedMinScale||Math.min(e.x.minScale,e.y.minScale),e.fitScale=Math.max(e.x.minScale,e.y.minScale),e.trigger(R)}}),$=C.extend({init:function(e){var t=this;A(t,e),C.fn.init.call(t)},outOfBounds:function(){return this.dimension.outOfBounds(this.movable[this.axis])},dragMove:function(e){var t=this,n=t.dimension,i=t.axis,r=t.movable,o=r[i]+e;n.enabled&&((n.min>o&&0>e||o>n.max&&e>0)&&(e*=t.resistance),r.translateAxis(i,e),t.trigger(R,t))}}),Y=x.extend({init:function(t){var n,i,r,o,a=this;A(a,{elastic:!0},t),r=a.elastic?.5:0,o=a.movable,a.x=n=new $({axis:"x",dimension:a.dimensions.x,resistance:r,movable:o}),a.y=i=new $({axis:"y",dimension:a.dimensions.y,resistance:r,movable:o}),a.userEvents.bind(["press","move","end","gesturestart","gesturechange"],{gesturestart:function(e){a.gesture=e,a.offset=a.dimensions.container.offset()},press:function(t){e(t.event.target).closest("a").is("[data-navigate-on-press=true]")&&t.sender.cancel()},gesturechange:function(e){var t,r,s,l=a.gesture,c=l.center,u=e.center,d=e.distance/l.distance,h=a.dimensions.minScale,f=a.dimensions.maxScale;h>=o.scale&&1>d&&(d+=.8*(1-d)),o.scale*d>=f&&(d=f/o.scale),r=o.x+a.offset.left,s=o.y+a.offset.top,t={x:(r-c.x)*d+u.x-r,y:(s-c.y)*d+u.y-s},o.scaleWith(d),n.dragMove(t.x),i.dragMove(t.y),a.dimensions.rescale(o.scale),a.gesture=e,e.preventDefault()},move:function(e){e.event.target.tagName.match(/textarea|input/i)||(n.dimension.enabled||i.dimension.enabled?(n.dragMove(e.x.delta),i.dragMove(e.y.delta),e.preventDefault()):e.touch.skip())},end:function(e){e.preventDefault()}})}}),K=y.transitions.prefix+"Transform";f=y.hasHW3D?function(e,t,n){return"translate3d("+e+"px,"+t+"px,0) scale("+n+")"}:function(e,t,n){return"translate("+e+"px,"+t+"px) scale("+n+")"},p=C.extend({init:function(t){var n=this;C.fn.init.call(n),n.element=e(t),n.element[0].style.webkitTransformOrigin="left top",n.x=0,n.y=0,n.scale=1,n._saveCoordinates(f(n.x,n.y,n.scale))},translateAxis:function(e,t){this[e]+=t,this.refresh()},scaleTo:function(e){this.scale=e,this.refresh()},scaleWith:function(e){this.scale*=e,this.refresh()},translate:function(e){this.x+=e.x,this.y+=e.y,this.refresh()},moveAxis:function(e,t){this[e]=t,this.refresh()},moveTo:function(e){A(this,e),this.refresh()},refresh:function(){var e,t=this,n=t.x,i=t.y;t.round&&(n=Math.round(n),i=Math.round(i)),e=f(n,i,t.scale),e!=t.coordinates&&(_.support.browser.msie&&10>_.support.browser.version?(t.element[0].style.position="absolute",t.element[0].style.left=t.x+"px",t.element[0].style.top=t.y+"px"):t.element[0].style[K]=e,t._saveCoordinates(e),t.trigger(R))},_saveCoordinates:function(e){this.coordinates=e}}),g=k.extend({init:function(e,t){var n,i=this;k.fn.init.call(i,e,t),n=i.options.group,n in E?E[n].push(i):E[n]=[i]},events:[V,U,W],options:{name:"DropTarget",group:"default"},destroy:function(){s(E,this)},_trigger:function(e,n){var i=this,r=M[i.options.group];return r?i.trigger(e,A({},n.event,{draggable:r,dropTarget:n.dropTarget})):t},_over:function(e){this._trigger(V,e)},_out:function(e){this._trigger(U,e)},_drop:function(e){var t=this,n=M[t.options.group];n&&(n.dropped=!t._trigger(W,e))}}),g.destroyGroup=function(e){var t,n=E[e]||P[e];if(n){for(t=0;n.length>t;t++)k.fn.destroy.call(n[t]);n.length=0,delete E[e],delete P[e]}},g._cache=E,m=g.extend({init:function(e,t){var n,i=this;k.fn.init.call(i,e,t),n=i.options.group,n in P?P[n].push(i):P[n]=[i]},destroy:function(){s(P,this)},options:{name:"DropTargetArea",group:"default",filter:null}}),v=k.extend({init:function(e,t){var n=this;k.fn.init.call(n,e,t),n._activated=!1,n.userEvents=new S(n.element,{global:!0,allowSelection:!0,filter:n.options.filter,threshold:n.options.distance,start:T(n._start,n),hold:T(n._hold,n),move:T(n._drag,n),end:T(n._end,n),cancel:T(n._cancel,n),select:T(n._select,n)}),n._afterEndHandler=T(n._afterEnd,n),n._captureEscape=T(n._captureEscape,n)},events:[B,F,L,O,H,N],options:{name:"Draggable",distance:_.support.touch?0:5,group:"default",cursorOffset:null,axis:null,container:null,filter:null,ignore:null,holdToDrag:!1,autoScroll:!1,dropped:!1},cancelHold:function(){this._activated=!1},_captureEscape:function(e){var t=this;e.keyCode===_.keys.ESC&&(t._trigger(H,{event:e}),t.userEvents.cancel())},_updateHint:function(t){var n,i=this,o=i.options,a=i.boundaries,s=o.axis,l=i.options.cursorOffset;l?n={left:t.x.location+l.left,top:t.y.location+l.top}:(i.hintOffset.left+=t.x.delta,i.hintOffset.top+=t.y.delta,n=e.extend({},i.hintOffset)),a&&(n.top=r(n.top,a.y),n.left=r(n.left,a.x)),"x"===s?delete n.top:"y"===s&&delete n.left,i.hint.css(n)},_shouldIgnoreTarget:function(t){var n=this.options.ignore;return n&&e(t).is(n)},_select:function(e){this._shouldIgnoreTarget(e.event.target)||e.preventDefault()},_start:function(n){var i,r=this,a=r.options,s=a.container,l=a.hint;return this._shouldIgnoreTarget(n.touch.initialTouch)||a.holdToDrag&&!r._activated?(r.userEvents.cancel(),t):(r.currentTarget=n.target,r.currentTargetOffset=D(r.currentTarget),l&&(r.hint&&r.hint.stop(!0,!0).remove(),r.hint=_.isFunction(l)?e(l.call(r,r.currentTarget)):l,i=D(r.currentTarget),r.hintOffset=i,r.hint.css({position:"absolute",zIndex:2e4,left:i.left,top:i.top}).appendTo(b.body),r.angular("compile",function(){r.hint.removeAttr("ng-repeat");for(var t=e(n.target);!t.data("$$kendoScope")&&t.length;)t=t.parent();return{elements:r.hint.get(),scopeFrom:t.data("$$kendoScope")}})),M[a.group]=r,r.dropped=!1,s&&(r.boundaries=o(s,r.hint)),e(b).on(z,r._captureEscape),r._trigger(F,n)&&(r.userEvents.cancel(),r._afterEnd()),r.userEvents.capture(),t)},_hold:function(e){this.currentTarget=e.target,this._trigger(B,e)?this.userEvents.cancel():this._activated=!0},_drag:function(n){var i,r,o=this;n.preventDefault(),i=this._elementUnderCursor(n),o._withDropTarget(i,function(i,r){if(!i)return h&&(h._trigger(U,A(n,{dropTarget:e(h.targetElement)})),h=null),t;if(h){if(r===h.targetElement)return;h._trigger(U,A(n,{dropTarget:e(h.targetElement)}))}i._trigger(V,A(n,{dropTarget:e(r)})),h=A(i,{targetElement:r})}),o._trigger(L,A(n,{dropTarget:h,elementUnderCursor:i})),this.options.autoScroll&&(this._cursorElement!==i&&(this._scrollableParent=u(i),this._cursorElement=i),this._scrollableParent[0]&&(r=d(n.x.location,n.y.location,l(this._scrollableParent)),this._scrollCompenstation=e.extend({},this.hintOffset),this._scrollVelocity=r,0===r.y&&0===r.x?(clearInterval(this._scrollInterval),this._scrollInterval=null):this._scrollInterval||(this._scrollInterval=setInterval(e.proxy(this,"_autoScroll"),50)))),o.hint&&o._updateHint(n)},_autoScroll:function(){var e,t,n,i,r,o,a,s=this._scrollableParent[0],l=this._scrollVelocity,u=this._scrollCompenstation;s&&(n=s===c()[0],n?(e=b.body.scrollHeight>w.height(),t=b.body.scrollWidth>w.width()):(e=s.scrollHeight>=s.offsetHeight,t=s.scrollWidth>=s.offsetWidth),i=s.scrollTop+l.y,r=e&&i>0&&s.scrollHeight>i,o=s.scrollLeft+l.x,a=t&&o>0&&s.scrollWidth>o,r&&(s.scrollTop+=l.y),a&&(s.scrollLeft+=l.x),n&&(a||r)&&(r&&(u.top+=l.y),a&&(u.left+=l.x),this.hint.css(u)))},_end:function(t){this._withDropTarget(this._elementUnderCursor(t),function(n,i){n&&(n._drop(A({},t,{dropTarget:e(i)})),h=null)}),this._cancel(this._trigger(O,t))},_cancel:function(e){var t=this;t._scrollableParent=null,this._cursorElement=null,clearInterval(this._scrollInterval),t._activated=!1,t.hint&&!t.dropped?setTimeout(function(){t.hint.stop(!0,!0),e?t._afterEndHandler():t.hint.animate(t.currentTargetOffset,"fast",t._afterEndHandler)},0):t._afterEnd()},_trigger:function(e,t){var n=this;return n.trigger(e,A({},t.event,{x:t.x,y:t.y,currentTarget:n.currentTarget,initialTarget:t.touch?t.touch.initialTouch:null,dropTarget:t.dropTarget,elementUnderCursor:t.elementUnderCursor}))},_elementUnderCursor:function(e){var t=I(e),i=this.hint;return i&&n(i[0],t)&&(i.hide(),t=I(e),t||(t=I(e)),i.show()),t},_withDropTarget:function(e,t){var n,i=this.options.group,r=E[i],o=P[i];(r&&r.length||o&&o.length)&&(n=a(e,r,o),n?t(n.target,n.targetElement):t())},destroy:function(){var e=this;k.fn.destroy.call(e),e._afterEnd(),e.userEvents.destroy(),this._scrollableParent=null,this._cursorElement=null,clearInterval(this._scrollInterval),e.currentTarget=null},_afterEnd:function(){var t=this;t.hint&&t.hint.remove(),delete M[t.options.group],t.trigger("destroy"),t.trigger(N),e(b).off(z,t._captureEscape)}}),_.ui.plugin(g),_.ui.plugin(m),_.ui.plugin(v),_.TapCapture=j,_.containerBoundaries=o,A(_.ui,{Pane:Y,PaneDimensions:q,Movable:p}),_.ui.Draggable.utils={autoScrollVelocity:d,scrollableViewPort:l,findScrollableParent:u}}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.mobile,r=n.effects,o=i.ui,a=e.proxy,s=e.extend,l=o.Widget,c=n.Class,u=n.ui.Movable,d=n.ui.Pane,h=n.ui.PaneDimensions,f=r.Transition,p=r.Animation,g=Math.abs,m=500,v=.7,_=.96,y=10,b=55,w=.5,x=5,k="km-scroller-release",C="km-scroller-refresh",S="pull",T="change",A="resize",D="scroll",M=2,E=p.extend({init:function(e){var t=this;p.fn.init.call(t),s(t,e),t.userEvents.bind("gestureend",a(t.start,t)),t.tapCapture.bind("press",a(t.cancel,t))},enabled:function(){return this.dimensions.minScale>this.movable.scale},done:function(){return.01>this.dimensions.minScale-this.movable.scale},tick:function(){var e=this.movable;e.scaleWith(1.1),this.dimensions.rescale(e.scale)},onEnd:function(){var e=this.movable;e.scaleTo(this.dimensions.minScale),this.dimensions.rescale(e.scale)}}),P=p.extend({init:function(e){var t=this;p.fn.init.call(t),s(t,e,{transition:new f({axis:e.axis,movable:e.movable,onEnd:function(){t._end()}})}),t.tapCapture.bind("press",function(){t.cancel()}),t.userEvents.bind("end",a(t.start,t)),t.userEvents.bind("gestureend",a(t.start,t)),t.userEvents.bind("tap",a(t.onEnd,t))},onCancel:function(){this.transition.cancel()},freeze:function(e){var t=this;t.cancel(),t._moveTo(e)},onEnd:function(){var e=this;e.paneAxis.outOfBounds()?e._snapBack():e._end()},done:function(){return g(this.velocity)<1},start:function(e){var t,n=this;n.dimension.enabled&&(n.paneAxis.outOfBounds()?n._snapBack():(t=e.touch.id===M?0:e.touch[n.axis].velocity,n.velocity=Math.max(Math.min(t*n.velocityMultiplier,b),-b),n.tapCapture.captureNext(),p.fn.start.call(n)))},tick:function(){var e=this,t=e.dimension,n=e.paneAxis.outOfBounds()?w:e.friction,i=e.velocity*=n,r=e.movable[e.axis]+i;!e.elastic&&t.outOfBounds(r)&&(r=Math.max(Math.min(r,t.max),t.min),e.velocity=0),e.movable.moveAxis(e.axis,r)},_end:function(){this.tapCapture.cancelCapture(),this.end()},_snapBack:function(){var e=this,t=e.dimension,n=e.movable[e.axis]>t.max?t.max:t.min;e._moveTo(n)},_moveTo:function(e){this.transition.moveTo({location:e,duration:m,ease:f.easeOutExpo})}}),I=p.extend({init:function(e){var t=this;n.effects.Animation.fn.init.call(this),s(t,e,{origin:{},destination:{},offset:{}})},tick:function(){this._updateCoordinates(),this.moveTo(this.origin)},done:function(){return g(this.offset.y)<x&&g(this.offset.x)<x},onEnd:function(){this.moveTo(this.destination),this.callback&&this.callback.call()},setCoordinates:function(e,t){this.offset={},this.origin=e,this.destination=t},setCallback:function(e){e&&n.isFunction(e)?this.callback=e:e=t},_updateCoordinates:function(){this.offset={x:(this.destination.x-this.origin.x)/4,y:(this.destination.y-this.origin.y)/4},this.origin={y:this.origin.y+this.offset.y,x:this.origin.x+this.offset.x}}}),z=c.extend({init:function(t){var n=this,i="x"===t.axis,r=e('<div class="km-touch-scrollbar km-'+(i?"horizontal":"vertical")+'-scrollbar" />');s(n,t,{element:r,elementSize:0,movable:new u(r),scrollMovable:t.movable,alwaysVisible:t.alwaysVisible,size:i?"width":"height"}),n.scrollMovable.bind(T,a(n.refresh,n)),n.container.append(r),t.alwaysVisible&&n.show()},refresh:function(){var e=this,t=e.axis,n=e.dimension,i=n.size,r=e.scrollMovable,o=i/n.total,a=Math.round(-r[t]*o),s=Math.round(i*o);o>=1?this.element.css("display","none"):this.element.css("display",""),a+s>i?s=i-a:0>a&&(s+=a,a=0),e.elementSize!=s&&(e.element.css(e.size,s+"px"),e.elementSize=s),e.movable.moveAxis(t,a)},show:function(){this.element.css({opacity:v,visibility:"visible"})},hide:function(){this.alwaysVisible||this.element.css({opacity:0})}}),R=l.extend({init:function(i,r){var o,c,f,p,m,v,_,y,b,w=this;return l.fn.init.call(w,i,r),i=w.element,(w._native=w.options.useNative&&n.support.hasNativeScrolling)?(i.addClass("km-native-scroller").prepend('<div class="km-scroll-header"/>'),s(w,{scrollElement:i,fixedContainer:i.children().first()}),t):(i.css("overflow","hidden").addClass("km-scroll-wrapper").wrapInner('<div class="km-scroll-container"/>').prepend('<div class="km-scroll-header"/>'),o=i.children().eq(1),c=new n.TapCapture(i),f=new u(o),p=new h({element:o,container:i,forcedEnabled:w.options.zoom}),m=this.options.avoidScrolling,v=new n.UserEvents(i,{allowSelection:!0,preventDragEvent:!0,captureUpIfMoved:!0,multiTouch:w.options.zoom,start:function(t){p.refresh();var n=g(t.x.velocity),i=g(t.y.velocity),r=2*n>=i,o=e.contains(w.fixedContainer[0],t.event.target),a=2*i>=n;!o&&!m(t)&&w.enabled&&(p.x.enabled&&r||p.y.enabled&&a)?v.capture():v.cancel()}}),_=new d({movable:f,dimensions:p,userEvents:v,elastic:w.options.elastic}),y=new E({movable:f,dimensions:p,userEvents:v,tapCapture:c}),b=new I({moveTo:function(e){w.scrollTo(e.x,e.y)}}),f.bind(T,function(){w.scrollTop=-f.y,w.scrollLeft=-f.x,w.trigger(D,{scrollTop:w.scrollTop,scrollLeft:w.scrollLeft})}),w.options.mousewheelScrolling&&i.on("DOMMouseScroll mousewheel",a(this,"_wheelScroll")),s(w,{movable:f,dimensions:p,zoomSnapBack:y,animatedScroller:b,userEvents:v,pane:_,tapCapture:c,pulled:!1,enabled:!0,scrollElement:o,scrollTop:0,scrollLeft:0,fixedContainer:i.children().first()}),w._initAxis("x"),w._initAxis("y"),w._wheelEnd=function(){w._wheel=!1,w.userEvents.end(0,w._wheelY)},p.refresh(),w.options.pullToRefresh&&w._initPullToRefresh(),t)},_wheelScroll:function(e){this._wheel||(this._wheel=!0,this._wheelY=0,this.userEvents.press(0,this._wheelY)),clearTimeout(this._wheelTimeout),this._wheelTimeout=setTimeout(this._wheelEnd,50);var t=n.wheelDeltaY(e);t&&(this._wheelY+=t,this.userEvents.move(0,this._wheelY)),e.preventDefault()},makeVirtual:function(){this.dimensions.y.makeVirtual()},virtualSize:function(e,t){this.dimensions.y.virtualSize(e,t)},height:function(){return this.dimensions.y.size},scrollHeight:function(){return this.scrollElement[0].scrollHeight},scrollWidth:function(){return this.scrollElement[0].scrollWidth},options:{name:"Scroller",zoom:!1,pullOffset:140,visibleScrollHints:!1,elastic:!0,useNative:!1,mousewheelScrolling:!0,avoidScrolling:function(){return!1},pullToRefresh:!1,messages:{pullTemplate:"Pull to refresh",releaseTemplate:"Release to refresh",refreshTemplate:"Refreshing"}},events:[S,D,A],_resize:function(){this._native||this.contentResized()},setOptions:function(e){var t=this;l.fn.setOptions.call(t,e),e.pullToRefresh&&t._initPullToRefresh()},reset:function(){this._native?this.scrollElement.scrollTop(0):(this.movable.moveTo({x:0,y:0}),this._scale(1))},contentResized:function(){this.dimensions.refresh(),this.pane.x.outOfBounds()&&this.movable.moveAxis("x",this.dimensions.x.min),this.pane.y.outOfBounds()&&this.movable.moveAxis("y",this.dimensions.y.min)},zoomOut:function(){var e=this.dimensions;e.refresh(),this._scale(e.fitScale),
this.movable.moveTo(e.centerCoordinates())},enable:function(){this.enabled=!0},disable:function(){this.enabled=!1},scrollTo:function(e,t){this._native?(this.scrollElement.scrollLeft(g(e)),this.scrollElement.scrollTop(g(t))):(this.dimensions.refresh(),this.movable.moveTo({x:e,y:t}))},animatedScrollTo:function(e,t,n){var i,r;this._native?this.scrollTo(e,t):(i={x:this.movable.x,y:this.movable.y},r={x:e,y:t},this.animatedScroller.setCoordinates(i,r),this.animatedScroller.setCallback(n),this.animatedScroller.start())},pullHandled:function(){var e=this;e.refreshHint.removeClass(C),e.hintContainer.html(e.pullTemplate({})),e.yinertia.onEnd(),e.xinertia.onEnd(),e.userEvents.cancel()},destroy:function(){l.fn.destroy.call(this),this.userEvents&&this.userEvents.destroy()},_scale:function(e){this.dimensions.rescale(e),this.movable.scaleTo(e)},_initPullToRefresh:function(){var e=this;e.dimensions.y.forceEnabled(),e.pullTemplate=n.template(e.options.messages.pullTemplate),e.releaseTemplate=n.template(e.options.messages.releaseTemplate),e.refreshTemplate=n.template(e.options.messages.refreshTemplate),e.scrollElement.prepend('<span class="km-scroller-pull"><span class="km-icon"></span><span class="km-loading-left"></span><span class="km-loading-right"></span><span class="km-template">'+e.pullTemplate({})+"</span></span>"),e.refreshHint=e.scrollElement.children().first(),e.hintContainer=e.refreshHint.children(".km-template"),e.pane.y.bind("change",a(e._paneChange,e)),e.userEvents.bind("end",a(e._dragEnd,e))},_dragEnd:function(){var e=this;e.pulled&&(e.pulled=!1,e.refreshHint.removeClass(k).addClass(C),e.hintContainer.html(e.refreshTemplate({})),e.yinertia.freeze(e.options.pullOffset/2),e.trigger("pull"))},_paneChange:function(){var e=this;e.movable.y/w>e.options.pullOffset?e.pulled||(e.pulled=!0,e.refreshHint.removeClass(C).addClass(k),e.hintContainer.html(e.releaseTemplate({}))):e.pulled&&(e.pulled=!1,e.refreshHint.removeClass(k),e.hintContainer.html(e.pullTemplate({})))},_initAxis:function(e){var t=this,n=t.movable,i=t.dimensions[e],r=t.tapCapture,o=t.pane[e],a=new z({axis:e,movable:n,dimension:i,container:t.element,alwaysVisible:t.options.visibleScrollHints});i.bind(T,function(){a.refresh()}),o.bind(T,function(){a.show()}),t[e+"inertia"]=new P({axis:e,paneAxis:o,movable:n,tapCapture:r,userEvents:t.userEvents,dimension:i,elastic:t.options.elastic,friction:t.options.friction||_,velocityMultiplier:t.options.velocityMultiplier||y,end:function(){a.hide(),t.trigger("scrollEnd",{axis:e,scrollTop:t.scrollTop,scrollLeft:t.scrollLeft})}})}});o.plugin(R)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.ui,r=i.Widget,o=e.proxy,a=n.isFunction,s=e.extend,l="horizontal",c="vertical",u="start",d="resize",h="resizeend",f=r.extend({init:function(e,t){var n=this;r.fn.init.call(n,e,t),n.orientation=n.options.orientation.toLowerCase()!=c?l:c,n._positionMouse=n.orientation==l?"x":"y",n._position=n.orientation==l?"left":"top",n._sizingDom=n.orientation==l?"outerWidth":"outerHeight",n.draggable=new i.Draggable(e,{distance:1,filter:t.handle,drag:o(n._resize,n),dragcancel:o(n._cancel,n),dragstart:o(n._start,n),dragend:o(n._stop,n)}),n.userEvents=n.draggable.userEvents},events:[d,h,u],options:{name:"Resizable",orientation:l},resize:function(){},_max:function(e){var n=this,i=n.hint?n.hint[n._sizingDom]():0,r=n.options.max;return a(r)?r(e):r!==t?n._initialElementPosition+r-i:r},_min:function(e){var n=this,i=n.options.min;return a(i)?i(e):i!==t?n._initialElementPosition+i:i},_start:function(t){var n=this,i=n.options.hint,r=e(t.currentTarget);n._initialElementPosition=r.position()[n._position],n._initialMousePosition=t[n._positionMouse].startLocation,i&&(n.hint=a(i)?e(i(r)):i,n.hint.css({position:"absolute"}).css(n._position,n._initialElementPosition).appendTo(n.element)),n.trigger(u,t),n._maxPosition=n._max(t),n._minPosition=n._min(t),e(document.body).css("cursor",r.css("cursor"))},_resize:function(e){var n,i=this,r=i._maxPosition,o=i._minPosition,a=i._initialElementPosition+(e[i._positionMouse].location-i._initialMousePosition);n=o!==t?Math.max(o,a):a,i.position=n=r!==t?Math.min(r,n):n,i.hint&&i.hint.toggleClass(i.options.invalidClass||"",n==r||n==o).css(i._position,n),i.resizing=!0,i.trigger(d,s(e,{position:n}))},_stop:function(t){var n=this;n.hint&&n.hint.remove(),n.resizing=!1,n.trigger(h,s(t,{position:n.position})),e(document.body).css("cursor","")},_cancel:function(e){var n=this;n.hint&&(n.position=t,n.hint.css(n._position,n._initialElementPosition),n._stop(e))},destroy:function(){var e=this;r.fn.destroy.call(e),e.draggable&&e.draggable.destroy()},press:function(e){if(e){var t=e.position(),n=this;n.userEvents.press(t.left,t.top,e[0]),n.targetPosition=t,n.target=e}},move:function(e){var n=this,i=n._position,r=n.targetPosition,o=n.position;o===t&&(o=r[i]),r[i]=o+e,n.userEvents.move(r.left,r.top)},end:function(){this.userEvents.end(),this.target=this.position=t}});n.ui.plugin(f)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t,n){try{return e.contains(t,n)||t==n}catch(i){return!1}}function i(e){return e.clone()}function r(e){return e.clone().removeAttr("id").css("visibility","hidden")}var o=window.kendo,a=o.ui.Widget,s="start",l="beforeMove",c="move",u="end",d="change",h="cancel",f="sort",p="remove",g="receive",m=">*",v=-1,_=a.extend({init:function(e,t){var n=this;a.fn.init.call(n,e,t),n.options.placeholder||(n.options.placeholder=r),n.options.hint||(n.options.hint=i),n.draggable=n._createDraggable()},events:[s,l,c,u,d,h],options:{name:"Sortable",hint:null,placeholder:null,filter:m,holdToDrag:!1,disabled:null,container:null,connectWith:null,handler:null,cursorOffset:null,axis:null,ignore:null,autoScroll:!1,cursor:"auto",moveOnDragEnter:!1},destroy:function(){this.draggable.destroy(),a.fn.destroy.call(this)},_createDraggable:function(){var t=this,n=t.element,i=t.options;return new o.ui.Draggable(n,{filter:i.filter,hint:o.isFunction(i.hint)?i.hint:e(i.hint),holdToDrag:i.holdToDrag,container:i.container?e(i.container):null,cursorOffset:i.cursorOffset,axis:i.axis,ignore:i.ignore,autoScroll:i.autoScroll,dragstart:e.proxy(t._dragstart,t),dragcancel:e.proxy(t._dragcancel,t),drag:e.proxy(t._drag,t),dragend:e.proxy(t._dragend,t)})},_dragstart:function(t){var n=this.draggedElement=t.currentTarget,i=this.options.disabled,r=this.options.handler,a=this.options.placeholder,l=this.placeholder=e(o.isFunction(a)?a.call(this,n):a);i&&n.is(i)?t.preventDefault():r&&!e(t.initialTarget).is(r)?t.preventDefault():this.trigger(s,{item:n,draggableEvent:t})?t.preventDefault():(n.css("display","none"),n.before(l),this._setCursor())},_dragcancel:function(){this._cancel(),this.trigger(h,{item:this.draggedElement}),this._resetCursor()},_drag:function(n){var i,r,o,a,s,l=this.draggedElement,c=this._findTarget(n),u={left:n.x.location,top:n.y.location},d={x:n.x.delta,y:n.y.delta},h=this.options.axis,f=this.options.moveOnDragEnter,p={item:l,list:this,draggableEvent:n};if("x"===h||"y"===h)return this._movementByAxis(h,u,d[h],p),t;if(c){if(i=this._getElementCenter(c.element),r={left:Math.round(u.left-i.left),top:Math.round(u.top-i.top)},e.extend(p,{target:c.element}),c.appendToBottom)return this._movePlaceholder(c,null,p),t;if(c.appendAfterHidden&&this._movePlaceholder(c,"next",p),this._isFloating(c.element)?0>d.x&&(f||0>r.left)?o="prev":d.x>0&&(f||r.left>0)&&(o="next"):0>d.y&&(f||0>r.top)?o="prev":d.y>0&&(f||r.top>0)&&(o="next"),o){for(s="prev"===o?jQuery.fn.prev:jQuery.fn.next,a=s.call(c.element);a.length&&!a.is(":visible");)a=s.call(a);a[0]!=this.placeholder[0]&&this._movePlaceholder(c,o,p)}}},_dragend:function(n){var i,r,o,a,s=this.placeholder,l=this.draggedElement,c=this.indexOf(l),h=this.indexOf(s),m=this.options.connectWith;return this._resetCursor(),o={action:f,item:l,oldIndex:c,newIndex:h,draggableEvent:n},h>=0?r=this.trigger(u,o):(i=s.parents(m).getKendoSortable(),o.action=p,a=e.extend({},o,{action:g,oldIndex:v,newIndex:i.indexOf(s)}),r=!(!this.trigger(u,o)&&!i.trigger(u,a))),r||h===c?(this._cancel(),t):(s.replaceWith(l),l.show(),this.draggable.dropped=!0,o={action:this.indexOf(l)!=v?f:p,item:l,oldIndex:c,newIndex:this.indexOf(l),draggableEvent:n},this.trigger(d,o),i&&(a=e.extend({},o,{action:g,oldIndex:v,newIndex:i.indexOf(l)}),i.trigger(d,a)),t)},_findTarget:function(n){var i,r,o=this._findElementUnderCursor(n),a=this.options.connectWith;return e.contains(this.element[0],o)?(i=this.items(),r=i.filter(o)[0]||i.has(o)[0],r?{element:e(r),sortable:this}:null):this.element[0]==o&&this._isEmpty()?{element:this.element,sortable:this,appendToBottom:!0}:this.element[0]==o&&this._isLastHidden()?(r=this.items().eq(0),{element:r,sortable:this,appendAfterHidden:!0}):a?this._searchConnectedTargets(o,n):t},_findElementUnderCursor:function(e){var t=o.elementUnderCursor(e),i=e.sender;return n(i.hint[0],t)&&(i.hint.hide(),t=o.elementUnderCursor(e),t||(t=o.elementUnderCursor(e)),i.hint.show()),t},_searchConnectedTargets:function(t,n){var i,r,o,a,s=e(this.options.connectWith);for(a=0;s.length>a;a++)if(i=s.eq(a).getKendoSortable(),e.contains(s[a],t)){if(i)return r=i.items(),o=r.filter(t)[0]||r.has(t)[0],o?(i.placeholder=this.placeholder,{element:e(o),sortable:i}):null}else if(s[a]==t){if(i&&i._isEmpty())return{element:s.eq(a),sortable:i,appendToBottom:!0};if(this._isCursorAfterLast(i,n))return o=i.items().last(),{element:o,sortable:i}}},_isCursorAfterLast:function(e,t){var n,i,r=e.items().last(),a={left:t.x.location,top:t.y.location};return n=o.getOffset(r),n.top+=r.outerHeight(),n.left+=r.outerWidth(),i=this._isFloating(r)?n.left-a.left:n.top-a.top,0>i?!0:!1},_movementByAxis:function(t,n,i,r){var o,a="x"===t?n.left:n.top,s=0>i?this.placeholder.prev():this.placeholder.next();s.length&&!s.is(":visible")&&(s=0>i?s.prev():s.next()),e.extend(r,{target:s}),o=this._getElementCenter(s),o&&(o="x"===t?o.left:o.top),s.length&&0>i&&0>a-o?this._movePlaceholder({element:s,sortable:this},"prev",r):s.length&&i>0&&a-o>0&&this._movePlaceholder({element:s,sortable:this},"next",r)},_movePlaceholder:function(e,t,n){var i=this.placeholder;e.sortable.trigger(l,n)||(t?"prev"===t?e.element.before(i):"next"===t&&e.element.after(i):e.element.append(i),e.sortable.trigger(c,n))},_setCursor:function(){var t,n=this.options.cursor;n&&"auto"!==n&&(t=e(document.body),this._originalCursorType=t.css("cursor"),t.css({cursor:n}),this._cursorStylesheet||(this._cursorStylesheet=e("<style>* { cursor: "+n+" !important; }</style>")),this._cursorStylesheet.appendTo(t))},_resetCursor:function(){this._originalCursorType&&(e(document.body).css("cursor",this._originalCursorType),this._originalCursorType=null,this._cursorStylesheet.remove())},_getElementCenter:function(e){var t=e.length?o.getOffset(e):null;return t&&(t.top+=e.outerHeight()/2,t.left+=e.outerWidth()/2),t},_isFloating:function(e){return/left|right/.test(e.css("float"))||/inline|table-cell/.test(e.css("display"))},_cancel:function(){this.draggedElement.show(),this.placeholder.remove()},_items:function(){var e,t=this.options.filter;return e=t?this.element.find(t):this.element.children()},indexOf:function(e){var t=this._items(),n=this.placeholder,i=this.draggedElement;return n&&e[0]==n[0]?t.not(i).index(e):t.not(n).index(e)},items:function(){var e=this.placeholder,t=this._items();return e&&(t=t.not(e)),t},_isEmpty:function(){return!this.items().length},_isLastHidden:function(){return 1===this.items().length&&this.items().is(":hidden")}});o.ui.plugin(_)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t){if(!e.is(":visible"))return!1;var n=r.getOffset(e),i=t.left+t.width,o=t.top+t.height;return n.right=n.left+e.outerWidth(),n.bottom=n.top+e.outerHeight(),!(n.left>i||t.left>n.right||n.top>o||t.top>n.bottom)}var i,r=window.kendo,o=r.ui.Widget,a=e.proxy,s=Math.abs,l="aria-selected",c="k-state-selected",u="k-state-selecting",d="k-selectable",h="change",f=".kendoSelectable",p="k-state-unselecting",g="input,a,textarea,.k-multiselect-wrap,select,button,a.k-button>.k-icon,button.k-button>.k-icon,span.k-icon.k-i-expand,span.k-icon.k-i-collapse",m=r.support.browser.msie,v=!1;!function(e){!function(){e('<div class="parent"><span /></div>').on("click",">*",function(){v=!0}).find("span").click().end().off()}()}(e),i=o.extend({init:function(t,n){var i,s=this;o.fn.init.call(s,t,n),s._marquee=e("<div class='k-marquee'><div class='k-marquee-color'></div></div>"),s._lastActive=null,s.element.addClass(d),s.relatedTarget=s.options.relatedTarget,i=s.options.multiple,this.options.aria&&i&&s.element.attr("aria-multiselectable",!0),s.userEvents=new r.UserEvents(s.element,{global:!0,allowSelection:!0,filter:(v?"":"."+d+" ")+s.options.filter,tap:a(s._tap,s)}),i&&s.userEvents.bind("start",a(s._start,s)).bind("move",a(s._move,s)).bind("end",a(s._end,s)).bind("select",a(s._select,s))},events:[h],options:{name:"Selectable",filter:">*",multiple:!1,relatedTarget:e.noop},_isElement:function(e){var t,n=this.element,i=n.length,r=!1;for(e=e[0],t=0;i>t;t++)if(n[t]===e){r=!0;break}return r},_tap:function(t){var n,i=e(t.target),r=this,o=t.event.ctrlKey||t.event.metaKey,a=r.options.multiple,s=a&&t.event.shiftKey,l=t.event.which,u=t.event.button;!r._isElement(i.closest("."+d))||l&&3==l||u&&2==u||this._allowSelection(t.event.target)&&(n=i.hasClass(c),a&&o||r.clear(),i=i.add(r.relatedTarget(i)),s?r.selectRange(r._firstSelectee(),i):(n&&o?(r._unselect(i),r._notify(h)):r.value(i),r._lastActive=r._downTarget=i))},_start:function(n){var i,r=this,o=e(n.target),a=o.hasClass(c),s=n.event.ctrlKey||n.event.metaKey;if(this._allowSelection(n.event.target)){if(r._downTarget=o,!r._isElement(o.closest("."+d)))return r.userEvents.cancel(),t;r.options.useAllItems?r._items=r.element.find(r.options.filter):(i=o.closest(r.element),r._items=i.find(r.options.filter)),n.sender.capture(),r._marquee.appendTo(document.body).css({left:n.x.client+1,top:n.y.client+1,width:0,height:0}),s||r.clear(),o=o.add(r.relatedTarget(o)),a&&(r._selectElement(o,!0),s&&o.addClass(p))}},_move:function(e){var t=this,n={left:e.x.startLocation>e.x.location?e.x.location:e.x.startLocation,top:e.y.startLocation>e.y.location?e.y.location:e.y.startLocation,width:s(e.x.initialDelta),height:s(e.y.initialDelta)};t._marquee.css(n),t._invalidateSelectables(n,e.event.ctrlKey||e.event.metaKey),e.preventDefault()},_end:function(){var e,t=this;t._marquee.remove(),t._unselect(t.element.find(t.options.filter+"."+p)).removeClass(p),e=t.element.find(t.options.filter+"."+u),e=e.add(t.relatedTarget(e)),t.value(e),t._lastActive=t._downTarget,t._items=null},_invalidateSelectables:function(e,t){var i,r,o,a,s=this._downTarget[0],l=this._items;for(i=0,r=l.length;r>i;i++)a=l.eq(i),o=a.add(this.relatedTarget(a)),n(a,e)?a.hasClass(c)?t&&s!==a[0]&&o.removeClass(c).addClass(p):a.hasClass(u)||a.hasClass(p)||o.addClass(u):a.hasClass(u)?o.removeClass(u):t&&a.hasClass(p)&&o.removeClass(p).addClass(c)},value:function(e){var n=this,i=a(n._selectElement,n);return e?(e.each(function(){i(this)}),n._notify(h),t):n.element.find(n.options.filter+"."+c)},_firstSelectee:function(){var e,t=this;return null!==t._lastActive?t._lastActive:(e=t.value(),e.length>0?e[0]:t.element.find(t.options.filter)[0])},_selectElement:function(t,n){var i=e(t),r=!n&&this._notify("select",{element:t});i.removeClass(u),r||(i.addClass(c),this.options.aria&&i.attr(l,!0))},_notify:function(e,t){return t=t||{},this.trigger(e,t)},_unselect:function(e){return e.removeClass(c),this.options.aria&&e.attr(l,!1),e},_select:function(t){this._allowSelection(t.event.target)&&(!m||m&&!e(r._activeElement()).is(g))&&t.preventDefault()},_allowSelection:function(t){return e(t).is(g)?(this.userEvents.cancel(),this._downTarget=null,!1):!0},resetTouchEvents:function(){this.userEvents.cancel()},clear:function(){var e=this.element.find(this.options.filter+"."+c);this._unselect(e)},selectRange:function(t,n){var i,r,o,a=this;for(a.clear(),a.element.length>1&&(o=a.options.continuousItems()),o&&o.length||(o=a.element.find(a.options.filter)),t=e.inArray(e(t)[0],o),n=e.inArray(e(n)[0],o),t>n&&(r=t,t=n,n=r),a.options.useAllItems||(n+=a.element.length-1),i=t;n>=i;i++)a._selectElement(o[i]);a._notify(h)},destroy:function(){var e=this;o.fn.destroy.call(e),e.element.off(f),e.userEvents.destroy(),e._marquee=e._lastActive=e.element=e.userEvents=null}}),i.parseOptions=function(e){var t="string"==typeof e&&e.toLowerCase();return{multiple:t&&t.indexOf("multiple")>-1,cell:t&&t.indexOf("cell")>-1}},r.ui.plugin(i)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.ui.Widget,r=e.proxy,o=n.keys,a="click",s="k-button",l="k-button-icon",c="k-button-icontext",u=".kendoButton",d="disabled",h="k-state-disabled",f="k-state-focused",p="k-state-selected",g=i.extend({init:function(e,t){var o=this;i.fn.init.call(o,e,t),e=o.wrapper=o.element,t=o.options,e.addClass(s).attr("role","button"),t.enable=t.enable&&!e.attr(d),o.enable(t.enable),o._tabindex(),o._graphics(),e.on(a+u,r(o._click,o)).on("focus"+u,r(o._focus,o)).on("blur"+u,r(o._blur,o)).on("keydown"+u,r(o._keydown,o)).on("keyup"+u,r(o._keyup,o)),n.notify(o)},destroy:function(){var e=this;e.wrapper.off(u),i.fn.destroy.call(e)},events:[a],options:{name:"Button",icon:"",spriteCssClass:"",imageUrl:"",enable:!0},_isNativeButton:function(){return"button"==this.element.prop("tagName").toLowerCase()},_click:function(e){this.options.enable&&this.trigger(a,{event:e})&&e.preventDefault()},_focus:function(){this.options.enable&&this.element.addClass(f)},_blur:function(){this.element.removeClass(f)},_keydown:function(e){var t=this;t._isNativeButton()||(e.keyCode==o.ENTER||e.keyCode==o.SPACEBAR)&&(e.keyCode==o.SPACEBAR&&(e.preventDefault(),t.options.enable&&t.element.addClass(p)),t._click(e))},_keyup:function(){this.element.removeClass(p)},_graphics:function(){var t,n,i,r=this,o=r.element,a=r.options,s=a.icon,u=a.spriteCssClass,d=a.imageUrl;(u||d||s)&&(i=!0,o.contents().not("span.k-sprite").not("span.k-icon").not("img.k-image").each(function(t,n){(1==n.nodeType||3==n.nodeType&&e.trim(n.nodeValue).length>0)&&(i=!1)}),o.addClass(i?l:c)),s?(t=o.children("span.k-icon").first(),t[0]||(t=e('<span class="k-icon"></span>').prependTo(o)),t.addClass("k-i-"+s)):u?(t=o.children("span.k-sprite").first(),t[0]||(t=e('<span class="k-sprite"></span>').prependTo(o)),t.addClass(u)):d&&(n=o.children("img.k-image").first(),n[0]||(n=e('<img alt="icon" class="k-image" />').prependTo(o)),n.attr("src",d))},enable:function(e){var n=this,i=n.element;e===t&&(e=!0),e=!!e,n.options.enable=e,i.toggleClass(h,!e).attr("aria-disabled",!e).attr(d,!e);try{i.blur()}catch(r){}}});n.ui.plugin(g)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n,i,r){return e({idx:t,text:n,ns:c.ns,numeric:i,title:r||""})}function i(e,t,n){return x({className:e.substring(1),text:t,wrapClassName:n||""})}function r(e,t,n,i){e.find(t).parent().attr(c.attr("page"),n).attr("tabindex",-1).toggleClass("k-state-disabled",i)}function o(e,t){r(e,f,1,1>=t)}function a(e,t){r(e,g,Math.max(1,t-1),1>=t)}function s(e,t,n){r(e,m,Math.min(n,t+1),t>=n)}function l(e,t,n){r(e,p,n,t>=n)}var c=window.kendo,u=c.ui,d=u.Widget,h=e.proxy,f=".k-i-seek-w",p=".k-i-seek-e",g=".k-i-arrow-w",m=".k-i-arrow-e",v="change",_=".kendoPager",y="click",b="keydown",w="disabled",x=c.template('<a href="\\#" title="#=text#" class="k-link k-pager-nav #= wrapClassName #"><span class="k-icon #= className #">#=text#</span></a>'),k=d.extend({init:function(t,n){var r,u,w,x,k=this;d.fn.init.call(k,t,n),n=k.options,k.dataSource=c.data.DataSource.create(n.dataSource),k.linkTemplate=c.template(k.options.linkTemplate),k.selectTemplate=c.template(k.options.selectTemplate),k.currentPageTemplate=c.template(k.options.currentPageTemplate),r=k.page(),u=k.totalPages(),k._refreshHandler=h(k.refresh,k),k.dataSource.bind(v,k._refreshHandler),n.previousNext&&(k.element.find(f).length||(k.element.append(i(f,n.messages.first,"k-pager-first")),o(k.element,r,u)),k.element.find(g).length||(k.element.append(i(g,n.messages.previous)),a(k.element,r,u))),n.numeric&&(k.list=k.element.find(".k-pager-numbers"),k.list.length||(k.list=e('<ul class="k-pager-numbers k-reset" />').appendTo(k.element))),n.input&&(k.element.find(".k-pager-input").length||k.element.append('<span class="k-pager-input k-label">'+n.messages.page+'<input class="k-textbox">'+c.format(n.messages.of,u)+"</span>"),k.element.on(b+_,".k-pager-input input",h(k._keydown,k))),n.previousNext&&(k.element.find(m).length||(k.element.append(i(m,n.messages.next)),s(k.element,r,u)),k.element.find(p).length||(k.element.append(i(p,n.messages.last,"k-pager-last")),l(k.element,r,u))),n.pageSizes&&(k.element.find(".k-pager-sizes").length||(w=n.pageSizes.length?n.pageSizes:["all",5,10,20],x=e.map(w,function(e){return e.toLowerCase&&"all"===e.toLowerCase()?"<option value='all'>"+n.messages.allPages+"</option>":"<option>"+e+"</option>"}),e('<span class="k-pager-sizes k-label"><select/>'+n.messages.itemsPerPage+"</span>").appendTo(k.element).find("select").html(x.join("")).end().appendTo(k.element)),k.element.find(".k-pager-sizes select").val(k.pageSize()),c.ui.DropDownList&&k.element.find(".k-pager-sizes select").show().kendoDropDownList(),k.element.on(v+_,".k-pager-sizes select",h(k._change,k))),n.refresh&&(k.element.find(".k-pager-refresh").length||k.element.append('<a href="#" class="k-pager-refresh k-link" title="'+n.messages.refresh+'"><span class="k-icon k-i-refresh">'+n.messages.refresh+"</span></a>"),k.element.on(y+_,".k-pager-refresh",h(k._refreshClick,k))),n.info&&(k.element.find(".k-pager-info").length||k.element.append('<span class="k-pager-info k-label" />')),k.element.on(y+_,"a",h(k._click,k)).addClass("k-pager-wrap k-widget k-floatwrap"),k.element.on(y+_,".k-current-page",h(k._toggleActive,k)),n.autoBind&&k.refresh(),c.notify(k)},destroy:function(){var e=this;d.fn.destroy.call(e),e.element.off(_),e.dataSource.unbind(v,e._refreshHandler),e._refreshHandler=null,c.destroy(e.element),e.element=e.list=null},events:[v],options:{name:"Pager",selectTemplate:'<li><span class="k-state-selected">#=text#</span></li>',currentPageTemplate:'<li class="k-current-page"><span class="k-link k-pager-nav">#=text#</span></li>',linkTemplate:'<li><a tabindex="-1" href="\\#" class="k-link" data-#=ns#page="#=idx#" #if (title !== "") {# title="#=title#" #}#>#=text#</a></li>',buttonCount:10,autoBind:!0,numeric:!0,info:!0,input:!1,previousNext:!0,pageSizes:!1,refresh:!1,messages:{allPages:"All",display:"{0} - {1} of {2} items",empty:"No items to display",page:"Page",of:"of {0}",itemsPerPage:"items per page",first:"Go to the first page",previous:"Go to the previous page",next:"Go to the next page",last:"Go to the last page",refresh:"Refresh",morePages:"More pages"}},setDataSource:function(e){var t=this;t.dataSource.unbind(v,t._refreshHandler),t.dataSource=t.options.dataSource=e,e.bind(v,t._refreshHandler),t.options.autoBind&&e.fetch()},refresh:function(e){var t,i,r,u,d,h,f=this,p=1,g=f.page(),m="",v=f.options,_=f.pageSize(),y=f.dataSource.total(),b=f.totalPages(),x=f.linkTemplate,k=v.buttonCount;if(!e||"itemchange"!=e.action){if(v.numeric){for(g>k&&(r=g%k,p=0===r?g-k+1:g-r+1),i=Math.min(p+k-1,b),p>1&&(m+=n(x,p-1,"...",!1,v.messages.morePages)),t=p;i>=t;t++)m+=n(t==g?f.selectTemplate:x,t,t,!0);b>i&&(m+=n(x,t,"...",!1,v.messages.morePages)),""===m&&(m=f.selectTemplate({text:0})),m=this.currentPageTemplate({text:g})+m,f.list.removeClass("k-state-expanded").html(m)}v.info&&(m=y>0?c.format(v.messages.display,(g-1)*_+1,Math.min(g*_,y),y):v.messages.empty,f.element.find(".k-pager-info").html(m)),v.input&&f.element.find(".k-pager-input").html(f.options.messages.page+'<input class="k-textbox">'+c.format(v.messages.of,b)).find("input").val(g).attr(w,1>y).toggleClass("k-state-disabled",1>y),v.previousNext&&(o(f.element,g,b),a(f.element,g,b),s(f.element,g,b),l(f.element,g,b)),v.pageSizes&&(u=f.element.find(".k-pager-sizes option[value='all']").length>0,d=u&&_===this.dataSource.total(),h=_,d&&(_="all",h=v.messages.allPages),f.element.find(".k-pager-sizes select").val(_).filter("["+c.attr("role")+"=dropdownlist]").kendoDropDownList("value",_).kendoDropDownList("text",h))}},_keydown:function(e){if(e.keyCode===c.keys.ENTER){var t=this.element.find(".k-pager-input").find("input"),n=parseInt(t.val(),10);(isNaN(n)||1>n||n>this.totalPages())&&(n=this.page()),t.val(n),this.page(n)}},_refreshClick:function(e){e.preventDefault(),this.dataSource.read()},_change:function(e){var t=e.currentTarget.value,n=parseInt(t,10),i=this.dataSource;isNaN(n)?"all"==(t+"").toLowerCase()&&i.pageSize(i.total()):i.pageSize(n)},_toggleActive:function(){this.list.toggleClass("k-state-expanded")},_click:function(t){var n=e(t.currentTarget);t.preventDefault(),n.is(".k-state-disabled")||this.page(n.attr(c.attr("page")))},totalPages:function(){return Math.ceil((this.dataSource.total()||0)/(this.pageSize()||1))},pageSize:function(){return this.dataSource.pageSize()||this.dataSource.total()},page:function(e){return e===t?this.dataSource.total()>0?this.dataSource.page():0:(this.dataSource.page(e),this.trigger(v,{index:e}),t)}});u.plugin(k)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t,n){return t===n||e.contains(t,n)}var i=window.kendo,r=i.ui,o=r.Widget,a=i.support,s=i.getOffset,l="open",c="close",u="deactivate",d="activate",h="center",f="left",p="right",g="top",m="bottom",v="absolute",_="hidden",y="body",b="location",w="position",x="visible",k="effects",C="k-state-active",S="k-state-border",T=/k-state-border-(\w+)/,A=".k-picker-wrap, .k-dropdown-wrap, .k-link",D="down",M=e(document.documentElement),E=e(window),P="scroll",I="resize scroll",z=a.transitions.css,R=z+"transform",F=e.extend,B=".kendoPopup",L=["font-size","font-family","font-stretch","font-style","font-weight","line-height"],O=o.extend({init:function(t,n){var r,a=this;n=n||{},n.isRtl&&(n.origin=n.origin||m+" "+p,n.position=n.position||g+" "+p),o.fn.init.call(a,t,n),t=a.element,n=a.options,a.collisions=n.collision?n.collision.split(" "):[],a.downEvent=i.applyEventMap(D,i.guid()),1===a.collisions.length&&a.collisions.push(a.collisions[0]),r=e(a.options.anchor).closest(".k-popup,.k-group").filter(":not([class^=km-])"),n.appendTo=e(e(n.appendTo)[0]||r[0]||y),a.element.hide().addClass("k-popup k-group k-reset").toggleClass("k-rtl",!!n.isRtl).css({position:v}).appendTo(n.appendTo).on("mouseenter"+B,function(){a._hovered=!0}).on("mouseleave"+B,function(){a._hovered=!1}),a.wrapper=e(),n.animation===!1&&(n.animation={open:{effects:{}},close:{hide:!0,effects:{}}}),F(n.animation.open,{complete:function(){a.wrapper.css({overflow:x}),a._activated=!0,a._trigger(d)}}),F(n.animation.close,{complete:function(){a._animationClose()}}),a._mousedownProxy=function(e){a._mousedown(e)},a._resizeProxy=function(e){a._resize(e)},n.toggleTarget&&e(n.toggleTarget).on(n.toggleEvent+B,e.proxy(a.toggle,a))},events:[l,d,c,u],options:{name:"Popup",toggleEvent:"click",origin:m+" "+f,position:g+" "+f,anchor:y,appendTo:null,collision:"flip fit",viewport:window,copyAnchorStyles:!0,autosize:!1,modal:!1,adjustSize:{width:0,height:0},animation:{open:{effects:"slideIn:down",transition:!0,duration:200},close:{duration:100,hide:!0}}},_animationClose:function(){var t,n,r,o,a=this,s=a.options;a.wrapper.hide(),t=a.wrapper.data(b),n=e(s.anchor),t&&a.wrapper.css(t),s.anchor!=y&&(r=((n.attr("class")||"").match(T)||["","down"])[1],o=S+"-"+r,n.removeClass(o).children(A).removeClass(C).removeClass(o),a.element.removeClass(S+"-"+i.directions[r].reverse)),a._closing=!1,a._trigger(u)},destroy:function(){var t,n=this,r=n.options,a=n.element.off(B);o.fn.destroy.call(n),r.toggleTarget&&e(r.toggleTarget).off(B),r.modal||(M.unbind(n.downEvent,n._mousedownProxy),n._toggleResize(!1)),i.destroy(n.element.children()),a.removeData(),r.appendTo[0]===document.body&&(t=a.parent(".k-animation-container"),t[0]?t.remove():a.remove())},open:function(t,n){var r,o,s,c=this,u={isFixed:!isNaN(parseInt(n,10)),x:t,y:n},d=c.element,h=c.options,f="down",p=e(h.anchor),m=d[0]&&d.hasClass("km-widget");if(!c.visible()){if(h.copyAnchorStyles&&(m&&"font-size"==L[0]&&L.shift(),d.css(i.getComputedStyles(p[0],L))),d.data("animating")||c._trigger(l))return;c._activated=!1,h.modal||(M.unbind(c.downEvent,c._mousedownProxy).bind(c.downEvent,c._mousedownProxy),a.mobileOS.ios||a.mobileOS.android||(c._toggleResize(!1),c._toggleResize(!0))),c.wrapper=o=i.wrap(d,h.autosize).css({overflow:_,display:"block",position:v}),a.mobileOS.android&&o.css(R,"translatez(0)"),o.css(w),e(h.appendTo)[0]==document.body&&o.css(g,"-10000px"),r=F(!0,{},h.animation.open),c.flipped=c._position(u),r.effects=i.parseEffects(r.effects,c.flipped),f=r.effects.slideIn?r.effects.slideIn.direction:f,h.anchor!=y&&(s=S+"-"+f,d.addClass(S+"-"+i.directions[f].reverse),p.addClass(s).children(A).addClass(C).addClass(s)),d.data(k,r.effects).kendoStop(!0).kendoAnimate(r)}},position:function(){this.visible()&&this._position()},toggle:function(){var e=this;e[e.visible()?c:l]()},visible:function(){return this.element.is(":"+x)},close:function(n){var r,o,a,s,l=this,u=l.options;if(l.visible()){if(r=l.wrapper[0]?l.wrapper:i.wrap(l.element).hide(),l._toggleResize(!1),l._closing||l._trigger(c))return l._toggleResize(!0),t;l.element.find(".k-popup").each(function(){var t=e(this),i=t.data("kendoPopup");i&&i.close(n)}),M.unbind(l.downEvent,l._mousedownProxy),n?o={hide:!0,effects:{}}:(o=F(!0,{},u.animation.close),a=l.element.data(k),s=o.effects,!s&&!i.size(s)&&a&&i.size(a)&&(o.effects=a,o.reverse=!0),l._closing=!0),l.element.kendoStop(!0),r.css({overflow:_}),l.element.kendoAnimate(o)}},_trigger:function(e){return this.trigger(e,{type:e})},_resize:function(e){var t=this;"resize"===e.type?(clearTimeout(t._resizeTimeout),t._resizeTimeout=setTimeout(function(){t._position(),t._resizeTimeout=null},50)):(!t._hovered||t._activated&&t.element.hasClass("k-list-container"))&&t.close()},_toggleResize:function(e){var t=e?"on":"off";this._scrollableParents()[t](P,this._resizeProxy),E[t](I,this._resizeProxy)},_mousedown:function(t){var r=this,o=r.element[0],a=r.options,s=e(a.anchor)[0],l=a.toggleTarget,c=i.eventTarget(t),u=e(c).closest(".k-popup"),d=u.parent().parent(".km-shim").length;u=u[0],(d||!u||u===r.element[0])&&"popover"!==e(t.target).closest("a").data("rel")&&(n(o,c)||n(s,c)||l&&n(e(l)[0],c)||r.close())},_fit:function(e,t,n){var i=0;return e+t>n&&(i=n-(e+t)),0>e&&(i=-e),i},_flip:function(e,t,n,i,r,o,a){var s=0;return a=a||t,o!==r&&o!==h&&r!==h&&(e+a>i&&(s+=-(n+t)),0>e+s&&(s+=n+t)),s},_scrollableParents:function(){return e(this.options.anchor).parentsUntil("body").filter(function(e,t){return i.isScrollable(t)})},_position:function(t){var n,r,o,l,c,u,d,h,f,p,g,m=this,_=m.element,y=m.wrapper,x=m.options,k=e(x.viewport),C=k.offset(),S=e(x.anchor),T=x.origin.toLowerCase().split(" "),A=x.position.toLowerCase().split(" "),D=m.collisions,M=a.zoomLevel(),E=10002,P=!!(k[0]==window&&window.innerWidth&&1.02>=M),I=0,z=document.documentElement,R=P?window.innerWidth:k.width(),B=P?window.innerHeight:k.height();if(P&&z.scrollHeight-z.clientHeight>0&&(R-=i.support.scrollbar()),n=S.parents().filter(y.siblings()),n[0])if(o=Math.max(+n.css("zIndex"),0))E=o+10;else for(r=S.parentsUntil(n),l=r.length;l>I;I++)o=+e(r[I]).css("zIndex"),o&&o>E&&(E=o+10);return y.css("zIndex",E),y.css(t&&t.isFixed?{left:t.x,top:t.y}:m._align(T,A)),c=s(y,w,S[0]===y.offsetParent()[0]),u=s(y),d=S.offsetParent().parent(".k-animation-container,.k-popup,.k-group"),d.length&&(c=s(y,w,!0),u=s(y)),k[0]===window?(u.top-=window.pageYOffset||document.documentElement.scrollTop||0,u.left-=window.pageXOffset||document.documentElement.scrollLeft||0):(u.top-=C.top,u.left-=C.left),m.wrapper.data(b)||y.data(b,F({},c)),h=F({},u),f=F({},c),p=x.adjustSize,"fit"===D[0]&&(f.top+=m._fit(h.top,y.outerHeight()+p.height,B/M)),"fit"===D[1]&&(f.left+=m._fit(h.left,y.outerWidth()+p.width,R/M)),g=F({},f),"flip"===D[0]&&(f.top+=m._flip(h.top,_.outerHeight(),S.outerHeight(),B/M,T[0],A[0],y.outerHeight())),"flip"===D[1]&&(f.left+=m._flip(h.left,_.outerWidth(),S.outerWidth(),R/M,T[1],A[1],y.outerWidth())),_.css(w,v),y.css(f),f.left!=g.left||f.top!=g.top;
},_align:function(t,n){var i,r=this,o=r.wrapper,a=e(r.options.anchor),l=t[0],c=t[1],u=n[0],d=n[1],f=s(a),g=e(r.options.appendTo),v=o.outerWidth(),_=o.outerHeight(),y=a.outerWidth(),b=a.outerHeight(),w=f.top,x=f.left,k=Math.round;return g[0]!=document.body&&(i=s(g),w-=i.top,x-=i.left),l===m&&(w+=b),l===h&&(w+=k(b/2)),u===m&&(w-=_),u===h&&(w-=k(_/2)),c===p&&(x+=y),c===h&&(x+=k(y/2)),d===p&&(x-=v),d===h&&(x-=k(v/2)),{top:w,left:x}}});r.plugin(O)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.ui.Widget,r=e.proxy,o=e.extend,a=window.setTimeout,s="click",l="show",c="hide",u="k-notification",d=".k-notification-wrap .k-i-close",h="info",f="success",p="warning",g="error",m="top",v="left",_="bottom",y="right",b="up",w=".kendoNotification",x='<div class="k-widget k-notification"></div>',k='<div class="k-notification-wrap"><span class="k-icon k-i-note">#=typeIcon#</span>#=content#<span class="k-icon k-i-close">Hide</span></div>',C=i.extend({init:function(t,r){var o=this;i.fn.init.call(o,t,r),r=o.options,r.appendTo&&e(r.appendTo).is(t)||o.element.hide(),o._compileTemplates(r.templates),o._guid="_"+n.guid(),o._isRtl=n.support.isRtl(t),o._compileStacking(r.stacking,r.position.top,r.position.left),n.notify(o)},events:[l,c],options:{name:"Notification",position:{pinned:!0,top:null,left:null,bottom:20,right:20},stacking:"default",hideOnClick:!0,button:!1,allowHideAfter:0,autoHideAfter:5e3,appendTo:null,width:null,height:null,templates:[],animation:{open:{effects:"fade:in",duration:300},close:{effects:"fade:out",duration:600,hide:!0}}},_compileTemplates:function(t){var i=this,r=n.template;i._compiled={},e.each(t,function(t,n){i._compiled[n.type]=r(n.template||e("#"+n.templateId).html())}),i._defaultCompiled=r(k)},_getCompiled:function(e){var t=this,n=t._defaultCompiled;return e?t._compiled[e]||n:n},_compileStacking:function(e,t,n){var i,r,o=this,a={paddingTop:0,paddingRight:0,paddingBottom:0,paddingLeft:0},s=null!==n?v:y;switch(e){case"down":i=_+" "+s,r=m+" "+s,delete a.paddingBottom;break;case y:i=m+" "+y,r=m+" "+v,delete a.paddingRight;break;case v:i=m+" "+v,r=m+" "+y,delete a.paddingLeft;break;case b:i=m+" "+s,r=_+" "+s,delete a.paddingTop;break;default:null!==t?(i=_+" "+s,r=m+" "+s,delete a.paddingBottom):(i=m+" "+s,r=_+" "+s,delete a.paddingTop)}o._popupOrigin=i,o._popupPosition=r,o._popupPaddings=a},_attachPopupEvents:function(e,t){function i(e){e.on(s+w,function(){o._hidePopup(t)})}var r,o=this,l=e.allowHideAfter,c=!isNaN(l)&&l>0;t.options.anchor!==document.body&&t.options.origin.indexOf(y)>0&&t.bind("open",function(){var e=n.getShadows(t.element);a(function(){t.wrapper.css("left",parseFloat(t.wrapper.css("left"))+e.left+e.right)})}),e.hideOnClick?t.bind("activate",function(){c?a(function(){i(t.element)},l):i(t.element)}):e.button&&(r=t.element.find(d),c?a(function(){i(r)},l):i(r))},_showPopup:function(t,i){var r,s,l=this,c=i.autoHideAfter,u=i.position.left,h=i.position.top;s=e("."+l._guid+":not(.k-hiding)").last(),r=new n.ui.Popup(t,{anchor:s[0]?s:document.body,origin:l._popupOrigin,position:l._popupPosition,animation:i.animation,modal:!0,collision:"",isRtl:l._isRtl,close:function(){l._triggerHide(this.element)},deactivate:function(e){e.sender.element.off(w),e.sender.element.find(d).off(w),e.sender.destroy()}}),l._attachPopupEvents(i,r),s[0]?r.open():(null===u&&(u=e(window).width()-t.width()-i.position.right),null===h&&(h=e(window).height()-t.height()-i.position.bottom),r.open(u,h)),r.wrapper.addClass(l._guid).css(o({margin:0},l._popupPaddings)),i.position.pinned?(r.wrapper.css("position","fixed"),s[0]&&l._togglePin(r.wrapper,!0)):s[0]||l._togglePin(r.wrapper,!1),c>0&&a(function(){l._hidePopup(r)},c)},_hidePopup:function(e){e.wrapper.addClass("k-hiding"),e.close()},_togglePin:function(t,n){var i=e(window),r=n?-1:1;t.css({top:parseInt(t.css(m),10)+r*i.scrollTop(),left:parseInt(t.css(v),10)+r*i.scrollLeft()})},_attachStaticEvents:function(e,t){function n(e){e.on(s+w,r(i._hideStatic,i,t))}var i=this,o=e.allowHideAfter,l=!isNaN(o)&&o>0;e.hideOnClick?l?a(function(){n(t)},o):n(t):e.button&&(l?a(function(){n(t.find(d))},o):n(t.find(d)))},_showStatic:function(e,t){var n=this,i=t.autoHideAfter,r=t.animation,o=t.stacking==b||t.stacking==v?"prependTo":"appendTo";e.addClass(n._guid)[o](t.appendTo).hide().kendoAnimate(r.open||!1),n._attachStaticEvents(t,e),i>0&&a(function(){n._hideStatic(e)},i)},_hideStatic:function(e){e.kendoAnimate(o(this.options.animation.close||!1,{complete:function(){e.off(w).find(d).off(w),e.remove()}})),this._triggerHide(e)},_triggerHide:function(e){this.trigger(c,{element:e}),this.angular("cleanup",function(){return{elements:e}})},show:function(i,r){var a,s,c=this,d=c.options,f=e(x);return r||(r=h),null!==i&&i!==t&&""!==i&&(n.isFunction(i)&&(i=i()),s={typeIcon:r,content:""},a=e.isPlainObject(i)?o(s,i):o(s,{content:i}),f.addClass(u+"-"+r).toggleClass(u+"-button",d.button).attr("data-role","alert").css({width:d.width,height:d.height}).append(c._getCompiled(r)(a)),c.angular("compile",function(){return{elements:f,data:[{dataItem:a}]}}),e(d.appendTo)[0]?c._showStatic(f,d):c._showPopup(f,d),c.trigger(l,{element:f})),c},info:function(e){return this.show(e,h)},success:function(e){return this.show(e,f)},warning:function(e){return this.show(e,p)},error:function(e){return this.show(e,g)},hide:function(){var t=this,n=t.getNotifications();return n.each(t.options.appendTo?function(n,i){t._hideStatic(e(i))}:function(n,i){var r=e(i).data("kendoPopup");r&&t._hidePopup(r)}),t},getNotifications:function(){var t=this,n=e("."+t._guid);return t.options.appendTo?n:n.children("."+u)},setOptions:function(e){var n,r=this;i.fn.setOptions.call(r,e),n=r.options,e.templates!==t&&r._compileTemplates(n.templates),(e.stacking!==t||e.position!==t)&&r._compileStacking(n.stacking,n.position.top,n.position.left)},destroy:function(){i.fn.destroy.call(this),this.getNotifications().off(w).find(d).off(w)}});n.ui.plugin(C)}(window.kendo.jQuery)}(),function(){!function(e){function t(e){for(;e.length;)n(e),e=e.parent()}function n(e){var t=e.data(o.ns+"title");t&&(e.attr("title",t),e.removeData(o.ns+"title"))}function i(e){var t=e.attr("title");t&&(e.data(o.ns+"title",t),e.attr("title",""))}function r(e){for(;e.length&&!e.is("body");)i(e),e=e.parent()}var o=window.kendo,a=o.ui.Widget,s=o.ui.Popup,l=o.isFunction,c=e.isPlainObject,u=e.extend,d=e.proxy,h=e(document),f=o.isLocalUrl,p="_tt_active",g="aria-describedby",m="show",v="hide",_="error",y="contentLoad",b="requestStart",w="k-content-frame",x='<div role="tooltip" class="k-widget k-tooltip#if (!autoHide) {# k-tooltip-closable#}#">#if (!autoHide) {# <div class="k-tooltip-button"><a href="\\#" class="k-icon k-i-close">close</a></div> #}#<div class="k-tooltip-content"></div>#if (callout){ #<div class="k-callout k-callout-#=dir#"></div>#}#</div>',k=o.template("<iframe frameborder='0' class='"+w+"' src='#= content.url #'>This page requires frames in order to show content</iframe>"),C=".kendoTooltip",S={bottom:{origin:"bottom center",position:"top center"},top:{origin:"top center",position:"bottom center"},left:{origin:"center left",position:"center right",collision:"fit flip"},right:{origin:"center right",position:"center left",collision:"fit flip"},center:{position:"center center",origin:"center center"}},T={top:"bottom",bottom:"top",left:"right",right:"left",center:"center"},A={bottom:"n",top:"s",left:"e",right:"w",center:"n"},D={horizontal:{offset:"top",size:"outerHeight"},vertical:{offset:"left",size:"outerWidth"}},M=function(e){return e.target.data(o.ns+"title")},E=a.extend({init:function(e,t){var n,i=this;a.fn.init.call(i,e,t),n=i.options.position.match(/left|right/)?"horizontal":"vertical",i.dimensions=D[n],i._documentKeyDownHandler=d(i._documentKeyDown,i),i.element.on(i.options.showOn+C,i.options.filter,d(i._showOn,i)).on("mouseenter"+C,i.options.filter,d(i._mouseenter,i)),this.options.autoHide&&i.element.on("mouseleave"+C,i.options.filter,d(i._mouseleave,i))},options:{name:"Tooltip",filter:"",content:M,showAfter:100,callout:!0,position:"bottom",showOn:"mouseenter",autoHide:!0,width:null,height:null,animation:{open:{effects:"fade:in",duration:0},close:{effects:"fade:out",duration:40,hide:!0}}},events:[m,v,y,_,b],_mouseenter:function(t){r(e(t.currentTarget))},_showOn:function(t){var n=this,i=e(t.currentTarget);n.options.showOn&&n.options.showOn.match(/click|focus/)?n._show(i):(clearTimeout(n.timeout),n.timeout=setTimeout(function(){n._show(i)},n.options.showAfter))},_appendContent:function(e){var t,n=this,i=n.options.content,r=n.content,a=n.options.iframe;c(i)&&i.url?("iframe"in n.options||(a=!f(i.url)),n.trigger(b,{options:i,target:e}),a?(r.hide(),t=r.find("."+w)[0],t?t.src=i.url||t.src:r.html(k({content:i})),r.find("."+w).off("load"+C).on("load"+C,function(){n.trigger(y),r.show()})):(r.empty(),o.ui.progress(r,!0),n._ajaxRequest(i))):i&&l(i)?(i=i({sender:this,target:e}),r.html(i||"")):r.html(i),n.angular("compile",function(){return{elements:r}})},_ajaxRequest:function(e){var t=this;jQuery.ajax(u({type:"GET",dataType:"html",cache:!1,error:function(e,n){o.ui.progress(t.content,!1),t.trigger(_,{status:n,xhr:e})},success:d(function(e){o.ui.progress(t.content,!1),t.content.html(e),t.trigger(y)},t)},e))},_documentKeyDown:function(e){e.keyCode===o.keys.ESC&&this.hide()},refresh:function(){var e=this,t=e.popup;t&&t.options.anchor&&e._appendContent(t.options.anchor)},hide:function(){this.popup&&this.popup.close()},show:function(e){e=e||this.element,r(e),this._show(e)},_show:function(e){var n=this,i=n.target();n.popup||n._initPopup(),i&&i[0]!=e[0]&&(n.popup.close(),n.popup.element.kendoStop(!0,!0)),i&&i[0]==e[0]||(n._appendContent(e),n.popup.options.anchor=e),n.popup.one("deactivate",function(){t(e),e.removeAttr(g),this.element.removeAttr("id").attr("aria-hidden",!0),h.off("keydown"+C,n._documentKeyDownHandler)}),n.popup.open()},_initPopup:function(){var t=this,n=t.options,i=e(o.template(x)({callout:n.callout&&"center"!==n.position,dir:A[n.position],autoHide:n.autoHide}));t.popup=new s(i,u({activate:function(){var e=this.options.anchor,i=e[0].id||t.element[0].id;i&&(e.attr(g,i+p),this.element.attr("id",i+p)),n.callout&&t._positionCallout(),this.element.removeAttr("aria-hidden"),h.on("keydown"+C,t._documentKeyDownHandler),t.trigger(m)},close:function(){t.trigger(v)},copyAnchorStyles:!1,animation:n.animation},S[n.position])),i.css({width:n.width,height:n.height}),t.content=i.find(".k-tooltip-content"),t.arrow=i.find(".k-callout"),n.autoHide?i.on("mouseleave"+C,d(t._mouseleave,t)):i.on("click"+C,".k-tooltip-button",d(t._closeButtonClick,t))},_closeButtonClick:function(e){e.preventDefault(),this.hide()},_mouseleave:function(n){if(this.popup){var i=e(n.currentTarget),r=i.offset(),o=n.pageX,a=n.pageY;if(r.right=r.left+i.outerWidth(),r.bottom=r.top+i.outerHeight(),o>r.left&&r.right>o&&a>r.top&&r.bottom>a)return;this.popup.close()}else t(e(n.currentTarget));clearTimeout(this.timeout)},_positionCallout:function(){var t=this,n=t.options.position,i=t.dimensions,r=i.offset,o=t.popup,a=o.options.anchor,s=e(a).offset(),l=parseInt(t.arrow.css("border-top-width"),10),c=e(o.element).offset(),u=A[o.flipped?T[n]:n],d=s[r]-c[r]+e(a)[i.size]()/2-l;t.arrow.removeClass("k-callout-n k-callout-s k-callout-w k-callout-e").addClass("k-callout-"+u).css(r,d)},target:function(){return this.popup?this.popup.options.anchor:null},destroy:function(){var e=this.popup;e&&(e.element.off(C),e.destroy()),clearTimeout(this.timeout),this.element.off(C),h.off("keydown"+C,this._documentKeyDownHandler),a.fn.destroy.call(this)}});o.ui.plugin(E)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(){var e,t=this.options.anchor,n=t.outerWidth();k.wrap(this.element).addClass("k-split-wrapper"),e="border-box"!==this.element.css("box-sizing")?n-(this.element.outerWidth()-this.element.width()):n,this.element.css({fontFamily:t.css("font-family"),"min-width":e})}function i(e){e.target.is(".k-toggle-button")||e.target.toggleClass(O,"press"==e.type)}function r(t){return t=e(t),t.hasClass("km-actionsheet")?t.closest(".km-popup-wrapper"):t.addClass("km-widget km-actionsheet").wrap('<div class="km-actionsheet-wrapper km-actionsheet-tablet km-widget km-popup"></div>').parent().wrap('<div class="km-popup-wrapper k-popup"></div>').parent()}function o(e){e.preventDefault()}function a(t,n){var i="next"===n?e.fn.next:e.fn.prev,r="next"===n?e.fn.first:e.fn.last,o=i.call(t);return o.is(":kendoFocusable")||!o.length?o:o.find(":kendoFocusable").length?r.call(o.find(":kendoFocusable")):a(o,n)}var s,l,c,u,d,h,f,p,g,m,v,_,y,b,w,x,k=window.kendo,C=k.Class,S=k.ui.Widget,T=e.proxy,A=k.isFunction,D=k.keys,M="k-toolbar",E="k-button",P="k-overflow-button",I="k-toggle-button",z="k-button-group",R="k-split-button",F="k-separator",B="k-popup",L="k-toolbar-resizable",O="k-state-active",H="k-state-disabled",N="k-state-hidden",V="k-group-start",U="k-group-end",W="k-primary",j="k-icon",G="k-i-",q="k-button-icon",$="k-button-icontext",Y="k-list-container k-split-container",K="k-split-button-arrow",Q="k-overflow-anchor",X="k-overflow-container",J="k-toolbar-first-visible",Z="k-toolbar-last-visible",ee="click",te="toggle",ne="open",ie="close",re="overflowOpen",oe="overflowClose",ae="never",se="auto",le="always",ce="k-overflow-hidden",ue=k.attr("uid");k.toolbar={},s={overflowAnchor:'<div tabindex="0" class="k-overflow-anchor"></div>',overflowContainer:'<ul class="k-overflow-container k-list-container"></ul>'},k.toolbar.registerComponent=function(e,t,n){s[e]={toolbar:t,overflow:n}},l=k.Class.extend({addOverflowAttr:function(){this.element.attr(k.attr("overflow"),this.options.overflow||se)},addUidAttr:function(){this.element.attr(ue,this.options.uid)},addIdAttr:function(){this.options.id&&this.element.attr("id",this.options.id)},addOverflowIdAttr:function(){this.options.id&&this.element.attr("id",this.options.id+"_overflow")},attributes:function(){this.options.attributes&&this.element.attr(this.options.attributes)},show:function(){this.element.removeClass(N).show(),this.options.hidden=!1},hide:function(){this.element.addClass(N).hide(),this.options.hidden=!0},remove:function(){this.element.remove()},enable:function(e){e===t&&(e=!0),this.element.toggleClass(H,!e),this.options.enable=e},twin:function(){var e=this.element.attr(ue);return this.overflow?this.toolbar.element.find("["+ue+"='"+e+"']").data(this.options.type):this.toolbar.options.resizable?this.toolbar.popup.element.find("["+ue+"='"+e+"']").data(this.options.type):t}}),k.toolbar.Item=l,c=l.extend({init:function(n,i){var r=e(n.useButtonTag?'<button tabindex="0"></button>':'<a href tabindex="0"></a>');this.element=r,this.options=n,this.toolbar=i,this.attributes(),n.primary&&r.addClass(W),n.togglable&&(r.addClass(I),this.toggle(n.selected)),n.url===t||n.useButtonTag||(r.attr("href",n.url),n.mobile&&r.attr(k.attr("role"),"button")),n.group&&(r.attr(k.attr("group"),n.group),(this.overflow&&this.options.overflow===le||!this.overflow)&&(this.group=this.toolbar.addToGroup(this,n.group))),!n.togglable&&n.click&&A(n.click)&&(this.clickHandler=n.click),n.togglable&&n.toggle&&A(n.toggle)&&(this.toggleHandler=n.toggle)},toggle:function(e,t){e=!!e,this.group&&e?this.group.select(this):this.group||this.select(e),t&&this.twin()&&this.twin().toggle(e)},getParentGroup:function(){return this.options.isChild?this.element.closest("."+z).data("buttonGroup"):t},_addGraphics:function(){var t,n,i,r=this.element,o=this.options.icon,a=this.options.spriteCssClass,s=this.options.imageUrl;(a||s||o)&&(t=!0,r.contents().not("span.k-sprite,span."+j+",img.k-image").each(function(n,i){(1==i.nodeType||3==i.nodeType&&e.trim(i.nodeValue).length>0)&&(t=!1)}),r.addClass(t?q:$)),o?(n=r.children("span."+j).first(),n[0]||(n=e('<span class="'+j+'"></span>').prependTo(r)),n.addClass(G+o)):a?(n=r.children("span.k-sprite").first(),n[0]||(n=e('<span class="k-sprite"></span>').prependTo(r)),n.addClass(a)):s&&(i=r.children("img.k-image").first(),i[0]||(i=e('<img alt="icon" class="k-image" />').prependTo(r)),i.attr("src",s))}}),k.toolbar.Button=c,u=c.extend({init:function(e,t){c.fn.init.call(this,e,t);var n=this.element;n.addClass(E),this.addIdAttr(),e.align&&n.addClass("k-align-"+e.align),"overflow"!=e.showText&&e.text&&n.html(e.mobile?'<span class="km-text">'+e.text+"</span>":e.text),e.hasIcon="overflow"!=e.showIcon&&(e.icon||e.spriteCssClass||e.imageUrl),e.hasIcon&&this._addGraphics(),this.addUidAttr(),this.addOverflowAttr(),this.enable(e.enable),e.hidden&&this.hide(),this.element.data({type:"button",button:this})},select:function(e){e===t&&(e=!1),this.element.toggleClass(O,e),this.options.selected=e}}),k.toolbar.ToolBarButton=u,d=c.extend({init:function(e,t){this.overflow=!0,c.fn.init.call(this,e,t);var n=this.element;"toolbar"!=e.showText&&e.text&&n.html(e.mobile?'<span class="km-text">'+e.text+"</span>":'<span class="k-text">'+e.text+"</span>"),e.hasIcon="toolbar"!=e.showIcon&&(e.icon||e.spriteCssClass||e.imageUrl),e.hasIcon&&this._addGraphics(),e.isChild||this._wrap(),this.addOverflowIdAttr(),this.attributes(),this.addUidAttr(),this.addOverflowAttr(),this.enable(e.enable),n.addClass(P+" "+E),e.hidden&&this.hide(),this.element.data({type:"button",button:this})},_wrap:function(){this.element=this.element.wrap("<li></li>").parent()},overflowHidden:function(){this.element.addClass(ce)},select:function(e){e===t&&(e=!1),this.options.isChild?this.element.toggleClass(O,e):this.element.find(".k-button").toggleClass(O,e),this.options.selected=e}}),k.toolbar.OverflowButton=d,k.toolbar.registerComponent("button",u,d),h=l.extend({createButtons:function(t){var n,i,r=this.options,o=r.buttons||[];for(i=0;o.length>i;i++)o[i].uid||(o[i].uid=k.guid()),n=new t(e.extend({mobile:r.mobile,isChild:!0,type:"button"},o[i]),this.toolbar),n.element.appendTo(this.element)},refresh:function(){this.element.children().filter(":not('."+N+"'):first").addClass(V),this.element.children().filter(":not('."+N+"'):last").addClass(U)}}),k.toolbar.ButtonGroup=h,f=h.extend({init:function(t,n){var i=this.element=e("<div></div>");this.options=t,this.toolbar=n,this.addIdAttr(),t.align&&i.addClass("k-align-"+t.align),this.createButtons(u),this.attributes(),this.addUidAttr(),this.addOverflowAttr(),this.refresh(),i.addClass(z),this.element.data({type:"buttonGroup",buttonGroup:this})}}),k.toolbar.ToolBarButtonGroup=f,p=h.extend({init:function(t,n){var i=this.element=e("<li></li>");this.options=t,this.toolbar=n,this.overflow=!0,this.addOverflowIdAttr(),this.createButtons(d),this.attributes(),this.addUidAttr(),this.addOverflowAttr(),this.refresh(),i.addClass((t.mobile?"":z)+" k-overflow-group"),this.element.data({type:"buttonGroup",buttonGroup:this})},overflowHidden:function(){this.element.addClass(ce)}}),k.toolbar.OverflowButtonGroup=p,k.toolbar.registerComponent("buttonGroup",f,p),g=l.extend({init:function(t,n){var i=this.element=e('<div class="'+R+'" tabindex="0"></div>');this.options=t,this.toolbar=n,this.mainButton=new u(t,n),this.arrowButton=e('<a class="'+E+" "+K+'"><span class="'+(t.mobile?"km-icon km-arrowdown":"k-icon k-i-arrow-s")+'"></span></a>'),this.popupElement=e('<ul class="'+Y+'"></ul>'),this.mainButton.element.removeAttr("href tabindex").appendTo(i),this.arrowButton.appendTo(i),this.popupElement.appendTo(i),t.align&&i.addClass("k-align-"+t.align),t.id||(t.id=t.uid),i.attr("id",t.id+"_wrapper"),this.addOverflowAttr(),this.addUidAttr(),this.createMenuButtons(),this.createPopup(),this._navigatable(),this.mainButton.main=!0,i.data({type:"splitButton",splitButton:this,kendoPopup:this.popup})},_navigatable:function(){var t=this;t.popupElement.on("keydown","."+E,function(n){var i=e(n.target).parent();n.preventDefault(),n.keyCode===D.ESC||n.keyCode===D.TAB||n.altKey&&n.keyCode===D.UP?(t.toggle(),t.focus()):n.keyCode===D.DOWN?a(i,"next").focus():n.keyCode===D.UP?a(i,"prev").focus():(n.keyCode===D.SPACEBAR||n.keyCode===D.ENTER)&&t.toolbar.userEvents.trigger("tap",{target:e(n.target)})})},createMenuButtons:function(){var t,n,i=this.options,r=i.menuButtons;for(n=0;r.length>n;n++)t=new u(e.extend({mobile:i.mobile,type:"button",click:i.click},r[n]),this.toolbar),t.element.wrap("<li></li>").parent().appendTo(this.popupElement)},createPopup:function(){var t=this.options,i=this.element;this.popupElement.attr("id",t.id+"_optionlist").attr(ue,t.rootUid),t.mobile&&(this.popupElement=r(this.popupElement)),this.popup=this.popupElement.kendoPopup({appendTo:t.mobile?e(t.mobile).children(".km-pane"):null,anchor:i,isRtl:this.toolbar._isRtl,copyAnchorStyles:!1,animation:t.animation,open:n,activate:function(){this.element.find(":kendoFocusable").first().focus()},close:function(){i.focus()}}).data("kendoPopup"),this.popup.element.on(ee,"a.k-button",o)},remove:function(){this.popup.element.off(ee,"a.k-button"),this.popup.destroy(),this.element.remove()},toggle:function(){this.popup.toggle()},enable:function(e){e===t&&(e=!0),this.mainButton.enable(e),this.options.enable=e},focus:function(){this.element.focus()}}),k.toolbar.ToolBarSplitButton=g,m=l.extend({init:function(t,n){var i,r,o=this.element=e('<li class="'+R+'"></li>'),a=t.menuButtons;for(this.options=t,this.toolbar=n,this.overflow=!0,this.mainButton=new d(e.extend({isChild:!0},t)),this.mainButton.element.appendTo(o),r=0;a.length>r;r++)i=new d(e.extend({mobile:t.mobile,isChild:!0},a[r]),this.toolbar),i.element.appendTo(o);this.addUidAttr(),this.addOverflowAttr(),this.mainButton.main=!0,o.data({type:"splitButton",splitButton:this})},overflowHidden:function(){this.element.addClass(ce)}}),k.toolbar.OverflowSplitButton=m,k.toolbar.registerComponent("splitButton",g,m),v=l.extend({init:function(t,n){var i=this.element=e("<div>&nbsp;</div>");this.element=i,this.options=t,this.toolbar=n,this.attributes(),this.addIdAttr(),this.addUidAttr(),this.addOverflowAttr(),i.addClass(F),i.data({type:"separator",separator:this})}}),_=l.extend({init:function(t,n){var i=this.element=e("<li>&nbsp;</li>");this.element=i,this.options=t,this.toolbar=n,this.overflow=!0,this.attributes(),this.addUidAttr(),this.addOverflowIdAttr(),i.addClass(F),i.data({type:"separator",separator:this})},overflowHidden:function(){this.element.addClass(ce)}}),k.toolbar.registerComponent("separator",v,_),y=l.extend({init:function(t,n,i){var r=A(t)?t(n):t;r=r instanceof jQuery?r.wrap("<div></div>").parent():e("<div></div>").html(r),this.element=r,this.options=n,this.options.type="template",this.toolbar=i,this.attributes(),this.addUidAttr(),this.addIdAttr(),this.addOverflowAttr(),r.data({type:"template",template:this})}}),k.toolbar.TemplateItem=y,b=l.extend({init:function(t,n,i){var r=e(A(t)?t(n):t);r=r instanceof jQuery?r.wrap("<li></li>").parent():e("<li></li>").html(r),this.element=r,this.options=n,this.options.type="template",this.toolbar=i,this.overflow=!0,this.attributes(),this.addUidAttr(),this.addOverflowIdAttr(),this.addOverflowAttr(),r.data({type:"template",template:this})},overflowHidden:function(){this.element.addClass(ce)}}),k.toolbar.OverflowTemplateItem=b,w=C.extend({init:function(e){this.name=e,this.buttons=[]},add:function(e){this.buttons[this.buttons.length]=e},remove:function(t){var n=e.inArray(t,this.buttons);this.buttons.splice(n,1)},select:function(e){var t,n;for(n=0;this.buttons.length>n;n++)t=this.buttons[n],t.select(!1),t.twin()&&t.twin().select(!1);e.select(!0)}}),x=S.extend({init:function(t,n){var r,a=this;if(S.fn.init.call(a,t,n),n=a.options,t=a.wrapper=a.element,t.addClass(M+" k-widget"),this.uid=k.guid(),this._isRtl=k.support.isRtl(t),this._groups={},t.attr(ue,this.uid),a.isMobile="boolean"==typeof n.mobile?n.mobile:a.element.closest(".km-root")[0],a.animation=a.isMobile?{open:{effects:"fade"}}:{},a.isMobile&&(t.addClass("km-widget"),j="km-icon",G="km-",E="km-button",z="km-buttongroup km-widget",O="km-state-active",H="km-state-disabled"),n.resizable?(a._renderOverflow(),t.addClass(L),a.overflowUserEvents=new k.UserEvents(a.element,{threshold:5,allowSelection:!0,filter:"."+Q,tap:T(a._toggleOverflow,a)}),a._resizeHandler=k.onResize(function(){a.resize()})):a.popup={element:e([])},n.items&&n.items.length)for(r=0;n.items.length>r;r++)a.add(n.items[r]);a.userEvents=new k.UserEvents(document,{threshold:5,allowSelection:!0,filter:"["+ue+"="+this.uid+"] ."+E+", ["+ue+"="+this.uid+"] ."+P,tap:T(a._buttonClick,a),press:i,release:i}),a.element.on(ee,"a.k-button",o),a._navigatable(),n.resizable&&a.popup.element.on(ee,NaN,o),n.resizable&&this._toggleOverflowAnchor(),k.notify(a)},events:[ee,te,ne,ie,re,oe],options:{name:"ToolBar",items:[],resizable:!0,mobile:null},addToGroup:function(e,t){var n;return n=this._groups[t]?this._groups[t]:this._groups[t]=new w,n.add(e),n},destroy:function(){var t=this;t.element.find("."+R).each(function(t,n){e(n).data("kendoPopup").destroy()}),t.element.off(ee,"a.k-button"),t.userEvents.destroy(),t.options.resizable&&(k.unbindResize(t._resizeHandler),t.overflowUserEvents.destroy(),t.popup.element.off(ee,"a.k-button"),t.popup.destroy()),S.fn.destroy.call(t)},add:function(t){var n,i,r=s[t.type],o=t.template,a=this,l=a.isMobile?"":"k-item k-state-default",c=t.overflowTemplate;e.extend(t,{uid:k.guid(),animation:a.animation,mobile:a.isMobile,rootUid:a.uid}),o&&!c?t.overflow=ae:t.overflow||(t.overflow=se),t.overflow!==ae&&a.options.resizable&&(c?i=new b(c,t,a):r&&(i=new r.overflow(t,a),i.element.addClass(l)),i&&(t.overflow===se&&i.overflowHidden(),i.element.appendTo(a.popup.container),a.angular("compile",function(){return{elements:i.element.get()}}))),t.overflow!==le&&(o?n=new y(o,t,a):r&&(n=new r.toolbar(t,a)),n&&(a.options.resizable?(n.element.appendTo(a.element).css("visibility","hidden"),a._shrink(a.element.innerWidth()),n.element.css("visibility","visible")):n.element.appendTo(a.element),a.angular("compile",function(){return{elements:n.element.get()}})))},_getItem:function(e){var t,n,i,r,o=this.options.resizable;return t=this.element.find(e),r=t.length?t.data("type"):"",n=t.data(r),n&&n.main&&(t=t.parent("."+R),r="splitButton",n=t.data(r)),!t.length&&o&&(t=this.popup.element.find(e),r=t.data("type"),i=t.data(r)),i&&i.main&&(t=t.parent("."+R),r="splitButton",i=t.data(r)),n&&o&&(i=n.twin()),{type:r,toolbar:n,overflow:i}},remove:function(e){var t=this._getItem(e);t.toolbar&&t.toolbar.remove(),t.overflow&&t.overflow.remove(),this.resize(!0)},hide:function(e){var t=this._getItem(e);t.toolbar&&(t.toolbar.hide(),"button"===t.toolbar.options.type&&t.toolbar.options.isChild&&t.toolbar.getParentGroup().refresh()),t.overflow&&(t.overflow.hide(),"button"===t.overflow.options.type&&t.overflow.options.isChild&&t.overflow.getParentGroup().refresh()),this.resize(!0)},show:function(e){var t=this._getItem(e);t.toolbar&&(t.toolbar.show(),"button"===t.toolbar.options.type&&t.toolbar.options.isChild&&t.toolbar.getParentGroup().refresh()),t.overflow&&(t.overflow.show(),"button"===t.overflow.options.type&&t.overflow.options.isChild&&t.overflow.getParentGroup().refresh()),this.resize(!0)},enable:function(e,n){var i=this._getItem(e);t===n&&(n=!0),i.toolbar&&i.toolbar.enable(n),i.overflow&&i.overflow.enable(n)},getSelectedFromGroup:function(e){return this.element.find("."+I+"[data-group='"+e+"']").filter("."+O)},toggle:function(n,i){var r=e(n),o=r.data("button");o.options.togglable&&(i===t&&(i=!0),o.toggle(i,!0))},_renderOverflow:function(){var t=this,n=s.overflowContainer,i=t._isRtl,o=i?"left":"right";t.overflowAnchor=e(s.overflowAnchor).addClass(E),t.element.append(t.overflowAnchor),t.isMobile?(t.overflowAnchor.append('<span class="km-icon km-more"></span>'),n=r(n)):t.overflowAnchor.append('<span class="k-icon k-i-arrow-s"></span>'),t.popup=new k.ui.Popup(n,{origin:"bottom "+o,position:"top "+o,anchor:t.overflowAnchor,isRtl:i,animation:t.animation,appendTo:t.isMobile?e(t.isMobile).children(".km-pane"):null,copyAnchorStyles:!1,open:function(n){var r=k.wrap(t.popup.element).addClass("k-overflow-wrapper");t.isMobile?t.popup.container.css("max-height",parseFloat(e(".km-content:visible").innerHeight())-15+"px"):r.css("margin-left",(i?-1:1)*((r.outerWidth()-r.width())/2+1)),t.trigger(re)&&n.preventDefault()},activate:function(){this.element.find(":kendoFocusable").first().focus()},close:function(e){t.trigger(oe)&&e.preventDefault(),this.element.focus()}}),t.popup.element.on("keydown","."+E,function(n){var i,r=e(n.target),o=r.parent(),s=o.is("."+z)||o.is("."+R);n.preventDefault(),n.keyCode===D.ESC||n.keyCode===D.TAB||n.altKey&&n.keyCode===D.UP?(t._toggleOverflow(),t.overflowAnchor.focus()):n.keyCode===D.DOWN?(i=!s||s&&r.is(":last-child")?o:r,a(i,"next").focus()):n.keyCode===D.UP?(i=!s||s&&r.is(":first-child")?o:r,a(i,"prev").focus()):(n.keyCode===D.SPACEBAR||n.keyCode===D.ENTER)&&t.userEvents.trigger("tap",{target:e(n.target)})}),t.popup.container=t.isMobile?t.popup.element.find("."+X):t.popup.element,t.popup.container.attr(ue,this.uid)},_toggleOverflowAnchor:function(){this.overflowAnchor.css(this.popup.element.children(":not(."+ce+", ."+B+")").length>0?{visibility:"visible",width:""}:{visibility:"hidden",width:"1px"})},_buttonClick:function(n){var i,r,o,a,s,l,c=this,u=n.target.closest("."+K).length;return n.preventDefault(),u?(c._toggle(n),t):(r=e(n.target).closest("."+E,c.element),r.hasClass(Q)||(o=r.data("button"),!o&&c.popup&&(r=e(n.target).closest("."+P,c.popup.container),o=r.parent("li").data("button")),o&&o.options.enable&&(o.options.togglable?(s=A(o.toggleHandler)?o.toggleHandler:null,o.toggle(!o.options.selected,!0),l={target:r,group:o.options.group,checked:o.options.selected,id:o.options.id},s&&s.call(c,l),c.trigger(te,l)):(s=A(o.clickHandler)?o.clickHandler:null,l={sender:c,target:r,id:o.options.id},s&&s.call(c,l),c.trigger(ee,l)),o.options.url&&(window.location.href=o.options.url),r.hasClass(P)&&c.popup.close(),a=r.closest(".k-split-container"),a[0]&&(i=a.data("kendoPopup"),(i?i:a.parents(".km-popup-wrapper").data("kendoPopup")).close()))),t)},_navigatable:function(){var t=this;t.element.attr("tabindex",0).focus(function(){var t=e(this).find(":kendoFocusable:first");t.is("."+Q)&&(t=a(t,"next")),t[0].focus()}).on("keydown",T(t._keydown,t))},_keydown:function(n){var i,r,o,a,s=e(n.target),l=n.keyCode,c=this.element.children(":not(.k-separator):visible");return l===D.TAB&&(i=s.parentsUntil(this.element).last(),r=!1,i.length||(i=s),i.is("."+Q)&&(n.shiftKey&&n.preventDefault(),c.last().is(":kendoFocusable")?c.last().focus():c.last().find(":kendoFocusable").last().focus()),n.shiftKey||c.index(i)!==c.length-1||(r=i.is("."+z)?s.is(":last-child"):!0),r&&(n.preventDefault(),this.overflowAnchor.focus())),n.altKey&&l===D.DOWN?(o=e(document.activeElement).data("splitButton"),a=e(document.activeElement).is("."+Q),o?o.toggle():a&&this._toggleOverflow(),t):l===D.SPACEBAR||l===D.ENTER?(n.preventDefault(),s.is("."+R)&&(s=s.children().first()),this.userEvents.trigger("tap",{target:s}),t):t},_toggle:function(t){var n,i=e(t.target).closest("."+R).data("splitButton");t.preventDefault(),i.options.enable&&(n=i.popup.element.is(":visible")?this.trigger(ie,{target:i.element}):this.trigger(ne,{target:i.element}),n||i.toggle())},_toggleOverflow:function(){this.popup.toggle()},_resize:function(e){var t=e.width;this.options.resizable&&(this.popup.close(),this._shrink(t),this._stretch(t),this._markVisibles(),this._toggleOverflowAnchor())},_childrenWidth:function(){var t=0;return this.element.children(":visible:not('."+N+"')").each(function(){t+=e(this).outerWidth(!0)}),Math.ceil(t)},_shrink:function(e){var t,n,i;if(e<this._childrenWidth())for(n=this.element.children(":visible:not([data-overflow='never'], ."+Q+")"),i=n.length-1;i>=0&&(t=n.eq(i),!(e>this._childrenWidth()));i--)this._hideItem(t)},_stretch:function(e){var t,n,i;if(e>this._childrenWidth())for(n=this.element.children(":hidden:not('."+N+"')"),i=0;n.length>i&&(t=n.eq(i),!(e<this._childrenWidth())&&this._showItem(t,e));i++);},_hideItem:function(e){e.hide(),this.popup&&this.popup.container.find(">li[data-uid='"+e.data("uid")+"']").removeClass(ce)},_showItem:function(e,t){return e.length&&t>this._childrenWidth()+e.outerWidth(!0)?(e.show(),this.popup&&this.popup.container.find(">li[data-uid='"+e.data("uid")+"']").addClass(ce),
!0):!1},_markVisibles:function(){var e=this.popup.container.children(),t=this.element.children(":not(.k-overflow-anchor)"),n=e.filter(":not(.k-overflow-hidden)"),i=t.filter(":visible");e.add(t).removeClass(J+" "+Z),n.first().add(i.first()).addClass(J),n.last().add(i.last()).addClass(Z)}}),k.ui.plugin(x)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t){var n,i,r,o=t.length,a=[];for(i=0;e.length>i;i++)for(n=e[i],r=0;o>r;r++)n===t[r]&&a.push({index:i,item:n});return a}function i(t,n){var r,o=!1;return t.filters&&(r=e.grep(t.filters,function(e){return o=i(e,n),e.filters?e.filters.length:e.field!=n}),o||t.filters.length===r.length||(o=!0),t.filters=r),o}var r,o,a=window.kendo,s=a.ui,l=s.Widget,c=a.keys,u=a.support,d=a.htmlEncode,h=a._activeElement,f=a.data.ObservableArray,p="id",g="change",m="k-state-focused",v="k-state-hover",_="k-loading",y="open",b="close",w="select",x="selected",k="requestStart",C="requestEnd",S="width",T=e.extend,A=e.proxy,D=e.isArray,M=u.browser,E=M.msie&&9>M.version,P=/"/g,I={ComboBox:"DropDownList",DropDownList:"ComboBox"},z=a.ui.DataBoundWidget.extend({init:function(t,n){var i,r=this,o=r.ns;l.fn.init.call(r,t,n),t=r.element,n=r.options,r._isSelect=t.is(w),r._isSelect&&r.element[0].length&&(n.dataSource||(n.dataTextField=n.dataTextField||"text",n.dataValueField=n.dataValueField||"value")),r.ul=e('<ul unselectable="on" class="k-list k-reset"/>').attr({tabIndex:-1,"aria-hidden":!0}),r.list=e("<div class='k-list-container'/>").append(r.ul).on("mousedown"+o,A(r._listMousedown,r)),i=t.attr(p),i&&(r.list.attr(p,i+"-list"),r.ul.attr(p,i+"_listbox")),r._header(),r._accessors(),r._initValue()},options:{valuePrimitive:!1,headerTemplate:""},setOptions:function(e){l.fn.setOptions.call(this,e),e&&e.enable!==t&&(e.enabled=e.enable)},focus:function(){this._focused.focus()},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},_listOptions:function(e){var t=this.options;return e=e||{},e={height:e.height||t.height,dataValueField:e.dataValueField||t.dataValueField,dataTextField:e.dataTextField||t.dataTextField,groupTemplate:e.groupTemplate||t.groupTemplate,fixedGroupTemplate:e.fixedGroupTemplate||t.fixedGroupTemplate,template:e.template||t.template},e.template||(e.template="#:"+a.expr(e.dataTextField,"data")+"#"),e},_initList:function(){var n=this,i=n.options,r=i.virtual,o=!!r,s=i.value,l=A(n._listBound,n),c={autoBind:!1,selectable:!0,dataSource:n.dataSource,click:A(n._click,n),change:A(n._listChange,n),activate:A(n._activateItem,n),deactivate:A(n._deactivateItem,n),dataBinding:function(){n.trigger("dataBinding"),n._angularItems("cleanup")},dataBound:l,listBound:l,selectedItemChange:A(n._listChange,n)};c=e.extend(n._listOptions(),c,"object"==typeof r?r:{}),n.listView=o?new a.ui.VirtualList(n.ul,c):new a.ui.StaticList(n.ul,c),s!==t&&n.listView.value(s).done(function(){var e=i.text;!n.listView.filter()&&n.input&&(-1===n.selectedIndex?((e===t||null===e)&&(e=s),n._accessor(s),n.input.val(e),n._placeholder()):-1===n._oldIndex&&(n._oldIndex=n.selectedIndex))})},_listMousedown:function(e){this.filterInput&&this.filterInput[0]===e.target||e.preventDefault()},_filterSource:function(e,t){var n=this,r=n.options,o=n.dataSource,a=T({},o.filter()||{}),s=i(a,r.dataTextField);(e||s)&&n.trigger("filtering",{filter:e})||(a={filters:a.filters||[],logic:"and"},e&&a.filters.push(e),t?o.read({filter:a}):o.filter(a))},_header:function(){var t,n=this,i=n.options.headerTemplate;e.isFunction(i)&&(i=i({})),i&&(n.list.prepend(i),t=n.ul.prev(),n.header=t[0]?t:null,n.header&&n.angular("compile",function(){return{elements:n.header}}))},_initValue:function(){var e=this,t=e.options.value;null!==t?e.element.val(t):(t=e._accessor(),e.options.value=t),e._old=t},_ignoreCase:function(){var e,t=this,n=t.dataSource.reader.model;n&&n.fields&&(e=n.fields[t.options.dataTextField],e&&e.type&&"string"!==e.type&&(t.options.ignoreCase=!1))},_focus:function(e){return this.listView.focus(e)},current:function(e){return this._focus(e)},items:function(){return this.ul[0].children},destroy:function(){var e=this,t=e.ns;l.fn.destroy.call(e),e._unbindDataSource(),e.listView.destroy(),e.list.off(t),e.popup.destroy(),e._form&&e._form.off("reset",e._resetHandler)},dataItem:function(n){var i=this;if(n===t)return i.listView.selectedDataItems()[0];if("number"!=typeof n){if(i.options.virtual)return i.dataSource.getByUid(e(n).data("uid"));n=e(i.items()).index(n)}return i.dataSource.flatView()[n]},_activateItem:function(){var e=this.listView.focus();e&&this._focused.add(this.filterInput).attr("aria-activedescendant",e.attr("id"))},_deactivateItem:function(){this._focused.add(this.filterInput).removeAttr("aria-activedescendant")},_accessors:function(){var e=this,t=e.element,n=e.options,i=a.getter,r=t.attr(a.attr("text-field")),o=t.attr(a.attr("value-field"));!n.dataTextField&&r&&(n.dataTextField=r),!n.dataValueField&&o&&(n.dataValueField=o),e._text=i(n.dataTextField),e._value=i(n.dataValueField)},_aria:function(e){var n=this,i=n.options,r=n._focused.add(n.filterInput);i.suggest!==t&&r.attr("aria-autocomplete",i.suggest?"both":"list"),e=e?e+" "+n.ul[0].id:n.ul[0].id,r.attr("aria-owns",e),n.ul.attr("aria-live",i.filter&&"none"!==i.filter?"polite":"off")},_blur:function(){var e=this;e._change(),e.close()},_change:function(){var e,n=this,i=n.selectedIndex,r=n.options.value,o=n.value();n._isSelect&&!n.listView.isBound()&&r&&(o=r),o!==n._old?e=!0:i!==t&&i!==n._oldIndex&&(e=!0),e&&(n._old=o,n._oldIndex=i,n._typing||n.element.trigger(g),n.trigger(g)),n.typing=!1},_data:function(){return this.dataSource.view()},_enable:function(){var e=this,n=e.options,i=e.element.is("[disabled]");n.enable!==t&&(n.enabled=n.enable),!n.enabled||i?e.enable(!1):e.readonly(e.element.is("[readonly]"))},_dataValue:function(e){var n=this._value(e);return n===t&&(n=this._text(e)),n},_offsetHeight:function(){var t=0,n=this.listView.content.prevAll(":visible");return n.each(function(){var n=e(this);t+=n.hasClass("k-list-filter")?n.children().outerHeight():n.outerHeight()}),t},_height:function(e){var t,n,i=this,r=i.list,o=i.options.height,a=i.popup.visible();return e&&(n=r.add(r.parent(".k-animation-container")).show(),o=i.listView.content[0].scrollHeight>o?o:"auto",n.height(o),"auto"!==o&&(t=i._offsetHeight(),t&&(o-=t)),i.listView.content.height(o),a||n.hide()),o},_adjustListWidth:function(){var e,t,n=this.list,i=n[0].style.width,r=this.wrapper;if(n.data(S)||!i)return e=window.getComputedStyle?window.getComputedStyle(r[0],null):0,t=e?parseFloat(e.width):r.outerWidth(),e&&M.msie&&(t+=parseFloat(e.paddingLeft)+parseFloat(e.paddingRight)+parseFloat(e.borderLeftWidth)+parseFloat(e.borderRightWidth)),i="border-box"!==n.css("box-sizing")?t-(n.outerWidth()-n.width()):t,n.css({fontFamily:r.css("font-family"),width:i}).data(S,i),!0},_openHandler:function(e){this._adjustListWidth(),this.trigger(y)?e.preventDefault():(this._focused.attr("aria-expanded",!0),this.ul.attr("aria-hidden",!1))},_closeHandler:function(e){this.trigger(b)?e.preventDefault():(this._focused.attr("aria-expanded",!1),this.ul.attr("aria-hidden",!0))},_focusItem:function(){var e=this.listView,n=e.focus(),i=e.select();i=i[i.length-1],i===t&&this.options.highlightFirst&&!n&&(i=0),i!==t?e.focus(i):e.scrollToIndex(0)},_calculateGroupPadding:function(e){var t=this.ul.children(".k-first:first"),n=this.listView.content.prev(".k-group-header"),i=0;n[0]&&"none"!==n[0].style.display&&("auto"!==e&&(i=a.support.scrollbar()),i+=parseFloat(t.css("border-right-width"),10)+parseFloat(t.children(".k-group").css("padding-right"),10),n.css("padding-right",i))},_firstOpen:function(){var e=this._height(this.dataSource.flatView().length);this._calculateGroupPadding(e)},_popup:function(){var e=this;e.popup=new s.Popup(e.list,T({},e.options.popup,{anchor:e.wrapper,open:A(e._openHandler,e),close:A(e._closeHandler,e),animation:e.options.animation,isRtl:u.isRtl(e.wrapper)})),e.options.virtual||e.popup.one(y,A(e._firstOpen,e))},_makeUnselectable:function(){E&&this.list.find("*").not(".k-textbox").attr("unselectable","on")},_toggleHover:function(t){e(t.currentTarget).toggleClass(v,"mouseenter"===t.type)},_toggle:function(e,n){var i=this,r=u.mobileOS&&(u.touch||u.MSPointers||u.pointers);e=e!==t?e:!i.popup.visible(),n||r||i._focused[0]===h()||(i._prevent=!0,i._focused.focus(),i._prevent=!1),i[e?y:b]()},_triggerCascade:function(){var e=this;e._cascadeTriggered&&e._old===e.value()&&e._oldIndex===e.selectedIndex||(e._cascadeTriggered=!0,e.trigger("cascade",{userTriggered:e._userTriggered}))},_unbindDataSource:function(){var e=this;e.dataSource.unbind(k,e._requestStartHandler).unbind(C,e._requestEndHandler).unbind("error",e._errorHandler)}});T(z,{inArray:function(e,t){var n,i,r=t.children;if(!e||e.parentNode!==t)return-1;for(n=0,i=r.length;i>n;n++)if(e===r[n])return n;return-1}}),a.ui.List=z,s.Select=z.extend({init:function(e,t){z.fn.init.call(this,e,t),this._initial=this.element.val()},setDataSource:function(e){var t,n=this;n.options.dataSource=e,n._dataSource(),n.listView.setDataSource(n.dataSource),n.options.autoBind&&n.dataSource.fetch(),t=n._parentWidget(),t&&n._cascadeSelect(t)},close:function(){this.popup.close()},select:function(e){var n=this;return e===t?n.selectedIndex:(n._select(e),n._old=n._accessor(),n._oldIndex=n.selectedIndex,t)},search:function(e){var t,n,i,r,o,a;e="string"==typeof e?e:this.text(),t=this,n=e.length,i=t.options,r=i.ignoreCase,o=i.filter,a=i.dataTextField,clearTimeout(t._typingTimeout),(!n||n>=i.minLength)&&(t._state="filter",t.listView.filter(!0),"none"===o?t._filter(e):(t._open=!0,t._filterSource({value:r?e.toLowerCase():e,field:a,operator:o,ignoreCase:r})))},_accessor:function(e,t){return this[this._isSelect?"_accessorSelect":"_accessorInput"](e,t)},_accessorInput:function(e){var n=this.element[0];return e===t?n.value:(null===e&&(e=""),n.value=e,t)},_accessorSelect:function(e,n){var i,r=this.element[0],o=r.selectedIndex;return e===t?(o>-1&&(i=r.options[o]),i&&(e=i.value),e||""):(o>-1&&r.options[o].removeAttribute(x),n===t&&(n=-1),null!==e&&""!==e&&-1==n?this._custom(e):(e?r.value=e:r.selectedIndex=n,r.selectedIndex>-1&&(i=r.options[r.selectedIndex]),i&&i.setAttribute(x,x)),t)},_custom:function(t){var n=this,i=n.element,r=n._customOption;r||(r=e("<option/>"),n._customOption=r,i.append(r)),r.text(t),r[0].setAttribute(x,x),r[0].selected=!0},_hideBusy:function(){var e=this;clearTimeout(e._busy),e._arrow.removeClass(_),e._focused.attr("aria-busy",!1),e._busy=null},_showBusy:function(){var e=this;e._request=!0,e._busy||(e._busy=setTimeout(function(){e._arrow&&(e._focused.attr("aria-busy",!0),e._arrow.addClass(_))},100))},_requestEnd:function(){this._request=!1,this._hideBusy()},_dataSource:function(){var t,n=this,i=n.element,r=n.options,o=r.dataSource||{};o=e.isArray(o)?{data:o}:o,n._isSelect&&(t=i[0].selectedIndex,t>-1&&(r.index=t),o.select=i,o.fields=[{field:r.dataTextField},{field:r.dataValueField}]),n.dataSource?n._unbindDataSource():(n._requestStartHandler=A(n._showBusy,n),n._requestEndHandler=A(n._requestEnd,n),n._errorHandler=A(n._hideBusy,n)),n.dataSource=a.data.DataSource.create(o).bind(k,n._requestStartHandler).bind(C,n._requestEndHandler).bind("error",n._errorHandler)},_firstItem:function(){this.listView.focusFirst()},_lastItem:function(){this.listView.focusLast()},_nextItem:function(){this.listView.focusNext()},_prevItem:function(){this.listView.focusPrev()},_move:function(e){var n,i,r,o,a=this,s=e.keyCode,l=s===c.DOWN;if(s===c.UP||l){if(e.altKey)a.toggle(l);else{if(!a.listView.isBound())return a._fetch||(a.dataSource.one(g,function(){a._fetch=!1,a._move(e)}),a._fetch=!0,a._filterSource()),e.preventDefault(),!0;if(r=a._focus(),a._fetch||r&&!r.hasClass("k-state-selected")||(l?(a._nextItem(),a._focus()||a._lastItem()):(a._prevItem(),a._focus()||a._firstItem())),a.trigger(w,{item:a.listView.focus()}))return a._focus(r),t;a._select(a._focus(),!0),a.popup.visible()||a._blur()}e.preventDefault(),i=!0}else if(s===c.ENTER||s===c.TAB){if(a.popup.visible()&&e.preventDefault(),r=a._focus(),n=a.dataItem(),a.popup.visible()||n&&a.text()===a._text(n)||(r=null),o=a.filterInput&&a.filterInput[0]===h(),r){if(a.trigger(w,{item:r}))return;a._select(r)}else a.input&&(a._accessor(a.input.val()),a.listView.value(a.input.val()));a._focusElement&&a._focusElement(a.wrapper),o&&s===c.TAB?a.wrapper.focusout():a._blur(),a.close(),i=!0}else s===c.ESC&&(a.popup.visible()&&e.preventDefault(),a.close(),i=!0);return i},_fetchData:function(){var e=this,t=!!e.dataSource.view().length;e._request||e.options.cascadeFrom||e.listView.isBound()||e._fetch||t||(e._fetch=!0,e.dataSource.fetch().done(function(){e._fetch=!1}))},_options:function(e,n,i){var r,o,a,s,l=this,c=l.element,u=e.length,h="",f=0;for(n&&(h=n);u>f;f++)r="<option",o=e[f],a=l._text(o),s=l._value(o),s!==t&&(s+="",-1!==s.indexOf('"')&&(s=s.replace(P,"&quot;")),r+=' value="'+s+'"'),r+=">",a!==t&&(r+=d(a)),r+="</option>",h+=r;c.html(h),i!==t&&(c[0].value=i,c[0].value&&!i&&(c[0].selectedIndex=-1))},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){setTimeout(function(){t.value(t._initial)})},t._form=r.on("reset",t._resetHandler))},_parentWidget:function(){var t=this.options.name,n=e("#"+this.options.cascadeFrom),i=n.data("kendo"+t);return i||(i=n.data("kendo"+I[t])),i},_cascade:function(){var e,t=this,n=t.options,i=n.cascadeFrom;if(i){if(e=t._parentWidget(),!e)return;n.autoBind=!1,e.first("cascade",function(n){t._userTriggered=n.userTriggered,t.listView.isBound()&&t._clearSelection(e,!0),t._cascadeSelect(e)}),e.listView.isBound()?t._cascadeSelect(e):e.value()||t.enable(!1)}},_cascadeChange:function(e){var t=this,n=t._accessor();t._userTriggered?t._clearSelection(e,!0):n?(n!==t.listView.value()[0]&&t.value(n),t.dataSource.view()[0]&&-1!==t.selectedIndex||t._clearSelection(e,!0)):t.dataSource.flatView().length&&t.select(t.options.index),t.enable(),t._triggerCascade(),t._userTriggered=!1},_cascadeSelect:function(e){var t,n,r,o=this,a=e.dataItem(),s=a?e._value(a):null,l=o.options.cascadeFromField||e.options.dataValueField;s||0===s?(t=o.dataSource.filter()||{},i(t,l),n=t.filters||[],n.push({field:l,operator:"eq",value:s}),r=function(){o.unbind("dataBound",r),o._cascadeChange(e)},o.first("dataBound",r),o.dataSource.filter(n)):(o.enable(!1),o._clearSelection(e),o._triggerCascade(),o._userTriggered=!1)}}),r=".StaticList",o=a.ui.DataBoundWidget.extend({init:function(t,n){l.fn.init.call(this,t,n),this.element.attr("role","listbox").on("click"+r,"li",A(this._click,this)).on("mouseenter"+r,"li",function(){e(this).addClass(v)}).on("mouseleave"+r,"li",function(){e(this).removeClass(v)}),this.content=this.element.wrap("<div unselectable='on'></div>").parent().css({overflow:"auto",position:"relative"}),this.header=this.content.before('<div class="k-group-header" style="display:none"></div>').prev(),this._bound=!1,this._optionID=a.guid(),this._selectedIndices=[],this._view=[],this._dataItems=[],this._values=[];var i=this.options.value;i&&(this._values=e.isArray(i)?i.slice(0):[i]),this._getter(),this._templates(),this.setDataSource(this.options.dataSource),this._onScroll=A(function(){var e=this;clearTimeout(e._scrollId),e._scrollId=setTimeout(function(){e._renderHeader()},50)},this)},options:{name:"StaticList",dataValueField:null,valuePrimitive:!1,selectable:!0,template:null,groupTemplate:null,fixedGroupTemplate:null},events:["click","change","activate","deactivate","dataBinding","dataBound","selectedItemChange"],setDataSource:function(t){var n,i=this,r=t||{};r=e.isArray(r)?{data:r}:r,r=a.data.DataSource.create(r),i.dataSource?(i.dataSource.unbind(g,i._refreshHandler),n=i.value(),i.value([]),i._bound=!1,i.value(n)):i._refreshHandler=A(i.refresh,i),i.dataSource=r.bind(g,i._refreshHandler),i._fixedHeader()},setOptions:function(e){l.fn.setOptions.call(this,e),this._getter(),this._templates(),this._render()},destroy:function(){this.element.off(r),this._refreshHandler&&this.dataSource.unbind(g,this._refreshHandler),clearTimeout(this._scrollId),l.fn.destroy.call(this)},scrollToIndex:function(e){var t=this.element[0].children[e];t&&this.scroll(t)},scroll:function(e){if(e){e[0]&&(e=e[0]);var t=this.content[0],n=e.offsetTop,i=e.offsetHeight,r=t.scrollTop,o=t.clientHeight,a=n+i;r>n?r=n:a>r+o&&(r=a-o),t.scrollTop=r}},selectedDataItems:function(n){var i=this._valueGetter;return n===t?this._dataItems.slice():(this._dataItems=n,this._values=e.map(n,function(e){return i(e)}),t)},focusNext:function(){var e=this.focus();e=e?e.next():0,this.focus(e)},focusPrev:function(){var e=this.focus();e=e?e.prev():this.element[0].children.length-1,this.focus(e)},focusFirst:function(){this.focus(this.element[0].children[0])},focusLast:function(){this.focus(this.element[0].children[this.element[0].children.length-1])},focus:function(n){var i,r=this,o=r._optionID;return n===t?r._current:(n=r._get(n),n=n[n.length-1],n=e(this.element[0].children[n]),r._current&&(r._current.removeClass(m).removeAttr("aria-selected").removeAttr(p),r.trigger("deactivate")),i=!!n[0],i&&(n.addClass(m),r.scroll(n),n.attr("id",o)),r._current=i?n:null,r.trigger("activate"),t)},focusIndex:function(){return this.focus()?this.focus().index():t},filter:function(e){return e===t?this._filtered:(this._filtered=e,t)},skipUpdate:function(e){this._skipUpdate=e},select:function(n){var i,r=this,o=r.options.selectable,a="multiple"!==o&&o!==!1,s=r._selectedIndices,l=[],c=[];if(n===t)return s.slice();if(n=r._get(n),1===n.length&&-1===n[0]&&(n=[]),!r._filtered||a||!r._deselectFiltered(n)){if(a&&!r._filtered&&-1!==e.inArray(n[n.length-1],s))return r._dataItems.length&&r._view.length&&(r._dataItems=[r._view[s[0]].item]),t;i=r._deselect(n),c=i.removed,n=i.indices,n.length&&(a&&(n=[n[n.length-1]]),l=r._select(n)),(l.length||c.length)&&(r._valueComparer=null,r.trigger("change",{added:l,removed:c}))}},removeAt:function(e){return this._selectedIndices.splice(e,1),this._values.splice(e,1),this._valueComparer=null,{position:e,dataItem:this._dataItems.splice(e,1)[0]}},setValue:function(t){t=e.isArray(t)||t instanceof f?t.slice(0):[t],this._values=t,this._valueComparer=null},value:function(n){var i,r=this,o=r._valueDeferred;return n===t?r._values.slice():(r.setValue(n),o&&"resolved"!==o.state()||(r._valueDeferred=o=e.Deferred()),r.isBound()&&(i=r._valueIndices(r._values),"multiple"===r.options.selectable&&r.select(-1),r.select(i),o.resolve()),r._skipUpdate=!1,o)},items:function(){return this.element.children(".k-item")},_click:function(t){t.isDefaultPrevented()||this.trigger("click",{item:e(t.currentTarget)})||this.select(t.currentTarget)},_valueExpr:function(e,n){var i,r,o,a=this,s=0,l=[];if(!a._valueComparer||a._valueType!==e){for(a._valueType=e;n.length>s;s++)i=n[s],i!==t&&""!==i&&null!==i&&("boolean"===e?i=!!i:"number"===e?i=+i:"string"===e&&(i=""+i)),l.push(i);r="for (var idx = 0; idx < "+l.length+"; idx++) { if (current === values[idx]) {   return idx; }} return -1;",o=Function(["current","values"],r),a._valueComparer=function(e){return o(e,l)}}return a._valueComparer},_dataItemPosition:function(e,t){var n=this._valueGetter(e),i=this._valueExpr(typeof n,t);return i(n)},_getter:function(){this._valueGetter=a.getter(this.options.dataValueField)},_deselect:function(t){var n,i,r,o=this,a=o.element[0].children,s=o.options.selectable,l=o._selectedIndices,c=o._dataItems,u=o._values,d=[],h=0,f=0;if(t=t.slice(),s!==!0&&t.length){if("multiple"===s)for(;t.length>h;h++)if(i=t[h],e(a[i]).hasClass("k-state-selected"))for(n=0;l.length>n;n++)if(r=l[n],r===i){e(a[r]).removeClass("k-state-selected"),d.push({position:n+f,dataItem:c.splice(n,1)[0]}),l.splice(n,1),t.splice(h,1),u.splice(n,1),f+=1,h-=1,n-=1;break}}else{for(;l.length>h;h++)e(a[l[h]]).removeClass("k-state-selected"),d.push({position:h,dataItem:c[h]});o._values=[],o._dataItems=[],o._selectedIndices=[]}return{indices:t,removed:d}},_deselectFiltered:function(t){for(var n,i,r,o=this.element[0].children,a=[],s=0;t.length>s;s++)i=t[s],n=this._view[i].item,r=this._dataItemPosition(n,this._values),r>-1&&(a.push(this.removeAt(r)),e(o[i]).removeClass("k-state-selected"));return a.length?(this.trigger("change",{added:[],removed:a}),!0):!1},_select:function(t){var n,i,r=this,o=r.element[0].children,a=r._view,s=[],l=0;for(-1!==t[t.length-1]&&r.focus(t);t.length>l;l++)i=t[l],n=a[i],-1!==i&&n&&(n=n.item,r._selectedIndices.push(i),r._dataItems.push(n),r._values.push(r._valueGetter(n)),e(o[i]).addClass("k-state-selected").attr("aria-selected",!0),s.push({dataItem:n}));return s},_get:function(n){return"number"==typeof n?n=[n]:D(n)||(n=e(n).data("offset-index"),n===t&&(n=-1),n=[n]),n},_template:function(){var e=this,t=e.options,n=t.template;return n?(n=a.template(n),n=function(e){return'<li tabindex="-1" role="option" unselectable="on" class="k-item">'+n(e)+"</li>"}):n=a.template('<li tabindex="-1" role="option" unselectable="on" class="k-item">${'+a.expr(t.dataTextField,"data")+"}</li>",{useWithBlock:!1}),n},_templates:function(){var e,t,n={template:this.options.template,groupTemplate:this.options.groupTemplate,fixedGroupTemplate:this.options.fixedGroupTemplate};for(t in n)e=n[t],e&&"function"!=typeof e&&(n[t]=a.template(e));this.templates=n},_normalizeIndices:function(e){for(var n=[],i=0;e.length>i;i++)e[i]!==t&&n.push(e[i]);return n},_valueIndices:function(e,t){var n,i=this._view,r=0;if(t=t?t.slice():[],!e.length)return[];for(;i.length>r;r++)n=this._dataItemPosition(i[r].item,e),-1!==n&&(t[n]=r);return this._normalizeIndices(t)},_firstVisibleItem:function(){for(var t=this.element[0],n=this.content[0],i=n.scrollTop,r=e(t.children[0]).height(),o=Math.floor(i/r)||0,a=t.children[o]||t.lastChild,s=i>a.offsetTop;a;)if(s){if(a.offsetTop+r>i||!a.nextSibling)break;a=a.nextSibling}else{if(i>=a.offsetTop||!a.previousSibling)break;a=a.previousSibling}return this._view[e(a).data("offset-index")]},_fixedHeader:function(){this.isGrouped()&&this.templates.fixedGroupTemplate?(this.header.show(),this.content.scroll(this._onScroll)):(this.header.hide(),this.content.off("scroll",this._onScroll))},_renderHeader:function(){var e,t=this.templates.fixedGroupTemplate;t&&(e=this._firstVisibleItem(),e&&this.header.html(t(e.group)))},_renderItem:function(e){var t='<li tabindex="-1" role="option" unselectable="on" class="k-item',n=e.item,i=0!==e.index,r=e.selected;return i&&e.newGroup&&(t+=" k-first"),r&&(t+=" k-state-selected"),t+='"'+(r?' aria-selected="true"':"")+' data-offset-index="'+e.index+'">',t+=this.templates.template(n),i&&e.newGroup&&(t+='<div class="k-group">'+this.templates.groupTemplate(e.group)+"</div>"),t+"</li>"},_render:function(){var e,t,n,i,r="",o=0,a=0,s=[],l=this.dataSource.view(),c=this.value(),u=this.isGrouped();if(u)for(o=0;l.length>o;o++)for(t=l[o],n=!0,i=0;t.items.length>i;i++)e={selected:this._selected(t.items[i],c),item:t.items[i],group:t.value,newGroup:n,index:a},s[a]=e,a+=1,r+=this._renderItem(e),n=!1;else for(o=0;l.length>o;o++)e={selected:this._selected(l[o],c),item:l[o],index:o},s[o]=e,r+=this._renderItem(e);this._view=s,this.element[0].innerHTML=r,u&&s.length&&this._renderHeader()},_selected:function(e,t){var n=!this._filtered||"multiple"===this.options.selectable;return n&&-1!==this._dataItemPosition(e,t)},refresh:function(e){var t,i=this,r=e&&e.action;i.trigger("dataBinding"),i._fixedHeader(),i._render(),i._bound=!0,"itemchange"===r?(t=n(i._dataItems,e.items),t.length&&i.trigger("selectedItemChange",{items:t})):i._filtered||i._skipUpdate?(i.focus(0),i._skipUpdate&&(i._skipUpdate=!1,i._selectedIndices=i._valueIndices(i._values,i._selectedIndices))):i.options.skipUpdateOnBind||r&&"add"!==r||i.value(i._values),i._valueDeferred&&i._valueDeferred.resolve(),i.trigger("dataBound")},isBound:function(){return this._bound},isGrouped:function(){return(this.dataSource.group()||[]).length}}),s.plugin(o)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n,i){var r,o=e.getFullYear(),a=t.getFullYear(),s=n.getFullYear();return o-=o%i,r=o+(i-1),a>o&&(o=a),r>s&&(r=s),o+"-"+r}function i(e){for(var t,n=0,i=e.min,r=e.max,o=e.start,a=e.setter,l=e.build,c=e.cells||12,u=e.perRow||4,d=e.content||P,h=e.empty||I,f=e.html||'<table tabindex="0" role="grid" class="k-content k-meta-view" cellspacing="0"><tbody><tr role="row">';c>n;n++)n>0&&n%u===0&&(f+='</tr><tr role="row">'),o=new pe(o.getFullYear(),o.getMonth(),o.getDate(),0,0,0),S(o,0),t=l(o,n),f+=s(o,i,r)?d(t):h(t),a(o,1);return f+"</tr></tbody></table>"}function r(e,t,n){var i=e.getFullYear(),r=t.getFullYear(),o=r,a=0;return n&&(r-=r%n,o=r-r%n+n-1),i>o?a=1:r>i&&(a=-1),a}function o(){var e=new pe;return new pe(e.getFullYear(),e.getMonth(),e.getDate())}function a(e,t,n){var i=o();return e&&(i=new pe(+e)),t>i?i=new pe(+t):i>n&&(i=new pe(+n)),i}function s(e,t,n){return+e>=+t&&+n>=+e}function l(e,t){return e.slice(t).concat(e.slice(0,t))}function c(e,t,n){t=t instanceof pe?t.getFullYear():e.getFullYear()+n*t,e.setFullYear(t)}function u(t){e(this).toggleClass($,ie.indexOf(t.type)>-1||t.type==te)}function d(e){e.preventDefault()}function h(e){return D(e).calendars.standard}function f(e){var n=ge[e.start],i=ge[e.depth],r=D(e.culture);e.format=T(e.format||r.calendars.standard.patterns.d),isNaN(n)&&(n=0,e.start=U),(i===t||i>n)&&(e.depth=U),e.dates||(e.dates=[])}function p(e){R&&e.find("*").attr("unselectable","on")}function g(e,t){for(var n=0,i=t.length;i>n;n++)if(e===+t[n])return!0;return!1}function m(e,t){return e?e.getFullYear()===t.getFullYear()&&e.getMonth()===t.getMonth()&&e.getDate()===t.getDate():!1}function v(e,t){return e?e.getFullYear()===t.getFullYear()&&e.getMonth()===t.getMonth():!1}var _,y=window.kendo,b=y.support,w=y.ui,x=w.Widget,k=y.keys,C=y.parseDate,S=y.date.adjustDST,T=y._extractFormat,A=y.template,D=y.getCulture,M=y.support.transitions,E=M?M.css+"transform-origin":"",P=A('<td#=data.cssClass# role="gridcell"><a tabindex="-1" class="k-link" href="\\#" data-#=data.ns#value="#=data.dateString#">#=data.value#</a></td>',{useWithBlock:!1}),I=A('<td role="gridcell">&nbsp;</td>',{useWithBlock:!1}),z=y.support.browser,R=z.msie&&9>z.version,F=".kendoCalendar",B="click"+F,L="keydown"+F,O="id",H="min",N="left",V="slideIn",U="month",W="century",j="change",G="navigate",q="value",$="k-state-hover",Y="k-state-disabled",K="k-state-focused",Q="k-other-month",X=' class="'+Q+'"',J="k-nav-today",Z="td:has(.k-link)",ee="blur"+F,te="focus",ne=te+F,ie=b.touch?"touchstart":"mouseenter",re=b.touch?"touchstart"+F:"mouseenter"+F,oe=b.touch?"touchend"+F+" touchmove"+F:"mouseleave"+F,ae=6e4,se=864e5,le="_prevArrow",ce="_nextArrow",ue="aria-disabled",de="aria-selected",he=e.proxy,fe=e.extend,pe=Date,ge={month:0,year:1,decade:2,century:3},me=x.extend({init:function(t,n){var i,r,o=this;x.fn.init.call(o,t,n),t=o.wrapper=o.element,n=o.options,n.url=window.unescape(n.url),o._templates(),o._header(),o._footer(o.footer),r=t.addClass("k-widget k-calendar").on(re+" "+oe,Z,u).on(L,"table.k-content",he(o._move,o)).on(B,Z,function(t){var n=t.currentTarget.firstChild;-1!=n.href.indexOf("#")&&t.preventDefault(),o._click(e(n))}).on("mouseup"+F,"table.k-content, .k-footer",function(){o._focusView(o.options.focusOnNav!==!1)}).attr(O),r&&(o._cellID=r+"_cell_selected"),f(n),i=C(n.value,n.format,n.culture),o._index=ge[n.start],o._current=new pe(+a(i,n.min,n.max)),o._addClassProxy=function(){o._active=!0,o._cell.addClass(K)},o._removeClassProxy=function(){o._active=!1,o._cell.removeClass(K)},o.value(i),y.notify(o)},options:{name:"Calendar",value:null,min:new pe(1900,0,1),max:new pe(2099,11,31),dates:[],url:"",culture:"",footer:"",format:"",month:{},start:U,depth:U,animation:{horizontal:{effects:V,reverse:!0,duration:500,divisor:2},vertical:{effects:"zoomIn",duration:400}}},events:[j,G],setOptions:function(e){var t=this;f(e),e.dates[0]||(e.dates=t.options.dates),x.fn.setOptions.call(t,e),t._templates(),t._footer(t.footer),t._index=ge[t.options.start],t.navigate()},destroy:function(){var e=this,t=e._today;e.element.off(F),e._title.off(F),e[le].off(F),e[ce].off(F),y.destroy(e._table),t&&y.destroy(t.off(F)),x.fn.destroy.call(e)},current:function(){return this._current},view:function(){return this._view},focus:function(e){e=e||this._table,this._bindTable(e),e.focus()},min:function(e){return this._option(H,e)},max:function(e){return this._option("max",e)},navigateToPast:function(){this._navigate(le,-1)},navigateToFuture:function(){this._navigate(ce,1)},navigateUp:function(){var e=this,t=e._index;e._title.hasClass(Y)||e.navigate(e._current,++t)},navigateDown:function(e){var n=this,i=n._index,r=n.options.depth;if(e)return i===ge[r]?(+n._value!=+e&&(n.value(e),n.trigger(j)),t):(n.navigate(e,--i),t)},navigate:function(n,i){i=isNaN(i)?ge[i]:i;var r,o,s,l,c=this,u=c.options,d=u.culture,h=u.min,f=u.max,g=c._title,m=c._table,v=c._oldTable,y=c._value,b=c._current,w=n&&+n>+b,x=i!==t&&i!==c._index;n||(n=b),c._current=n=new pe(+a(n,h,f)),i===t?i=c._index:c._index=i,c._view=o=_.views[i],s=o.compare,l=i===ge[W],g.toggleClass(Y,l).attr(ue,l),l=s(n,h)<1,c[le].toggleClass(Y,l).attr(ue,l),l=s(n,f)>-1,c[ce].toggleClass(Y,l).attr(ue,l),m&&v&&v.data("animating")&&(v.kendoStop(!0,!0),m.kendoStop(!0,!0)),c._oldTable=m,(!m||c._changeView)&&(g.html(o.title(n,h,f,d)),c._table=r=e(o.content(fe({min:h,max:f,date:n,url:u.url,dates:u.dates,format:u.format,culture:d},c[o.name]))),p(r),c._animate({from:m,to:r,vertical:x,future:w}),c._focus(n),c.trigger(G)),i===ge[u.depth]&&y&&c._class("k-state-selected",o.toDateString(y)),c._class(K,o.toDateString(n)),!m&&c._cell&&c._cell.removeClass(K),c._changeView=!0},value:function(e){var n=this,i=n._view,r=n.options,o=n._view,a=r.min,l=r.max;return e===t?n._value:(e=C(e,r.format,r.culture),null!==e&&(e=new pe(+e),s(e,a,l)||(e=null)),n._value=e,o&&null===e&&n._cell?n._cell.removeClass("k-state-selected"):(n._changeView=!e||i&&0!==i.compare(e,n._current),n.navigate(e)),t)},_move:function(t){var n,i,r,o,s=this,l=s.options,c=t.keyCode,u=s._view,d=s._index,h=new pe(+s._current),f=y.support.isRtl(s.wrapper);return t.target===s._table[0]&&(s._active=!0),t.ctrlKey?c==k.RIGHT&&!f||c==k.LEFT&&f?(s.navigateToFuture(),i=!0):c==k.LEFT&&!f||c==k.RIGHT&&f?(s.navigateToPast(),i=!0):c==k.UP?(s.navigateUp(),i=!0):c==k.DOWN&&(s._click(e(s._cell[0].firstChild)),i=!0):(c==k.RIGHT&&!f||c==k.LEFT&&f?(n=1,i=!0):c==k.LEFT&&!f||c==k.RIGHT&&f?(n=-1,i=!0):c==k.UP?(n=0===d?-7:-4,i=!0):c==k.DOWN?(n=0===d?7:4,i=!0):c==k.ENTER?(s._click(e(s._cell[0].firstChild)),i=!0):c==k.HOME||c==k.END?(r=c==k.HOME?"first":"last",o=u[r](h),h=new pe(o.getFullYear(),o.getMonth(),o.getDate(),h.getHours(),h.getMinutes(),h.getSeconds(),h.getMilliseconds()),i=!0):c==k.PAGEUP?(i=!0,s.navigateToPast()):c==k.PAGEDOWN&&(i=!0,s.navigateToFuture()),(n||r)&&(r||u.setDate(h,n),s._focus(a(h,l.min,l.max)))),i&&t.preventDefault(),s._current},_animate:function(e){var t=this,n=e.from,i=e.to,r=t._active;n?n.parent().data("animating")?(n.off(F),n.parent().kendoStop(!0,!0).remove(),n.remove(),i.insertAfter(t.element[0].firstChild),t._focusView(r)):n.is(":visible")&&t.options.animation!==!1?t[e.vertical?"_vertical":"_horizontal"](n,i,e.future):(i.insertAfter(n),n.off(F).remove(),t._focusView(r)):(i.insertAfter(t.element[0].firstChild),t._bindTable(i))},_horizontal:function(e,t,n){var i=this,r=i._active,o=i.options.animation.horizontal,a=o.effects,s=e.outerWidth();a&&-1!=a.indexOf(V)&&(e.add(t).css({width:s}),e.wrap("<div/>"),i._focusView(r,e),e.parent().css({position:"relative",width:2*s,"float":N,"margin-left":n?0:-s}),t[n?"insertAfter":"insertBefore"](e),fe(o,{effects:V+":"+(n?"right":N),complete:function(){e.off(F).remove(),i._oldTable=null,t.unwrap(),i._focusView(r)}}),e.parent().kendoStop(!0,!0).kendoAnimate(o))},_vertical:function(e,t){var n,i,r=this,o=r.options.animation.vertical,a=o.effects,s=r._active;a&&-1!=a.indexOf("zoom")&&(t.css({position:"absolute",top:e.prev().outerHeight(),left:0}).insertBefore(e),E&&(n=r._cellByDate(r._view.toDateString(r._current)),i=n.position(),i=i.left+parseInt(n.width()/2,10)+"px "+(i.top+parseInt(n.height()/2,10)+"px"),
t.css(E,i)),e.kendoStop(!0,!0).kendoAnimate({effects:"fadeOut",duration:600,complete:function(){e.off(F).remove(),r._oldTable=null,t.css({position:"static",top:0,left:0}),r._focusView(s)}}),t.kendoStop(!0,!0).kendoAnimate(o))},_cellByDate:function(t){return this._table.find("td:not(."+Q+")").filter(function(){return e(this.firstChild).attr(y.attr(q))===t})},_class:function(t,n){var i=this,r=i._cellID,o=i._cell;o&&o.removeAttr(de).removeAttr("aria-label").removeAttr(O),o=i._table.find("td:not(."+Q+")").removeClass(t).filter(function(){return e(this.firstChild).attr(y.attr(q))===n}).attr(de,!0),t!==K||i._active||i.options.focusOnNav===!1||(t=""),o.addClass(t),o[0]&&(i._cell=o),r&&(o.attr(O,r),i._table.removeAttr("aria-activedescendant").attr("aria-activedescendant",r))},_bindTable:function(e){e.on(ne,this._addClassProxy).on(ee,this._removeClassProxy)},_click:function(e){var t=this,n=t.options,i=new Date(+t._current),r=e.attr(y.attr(q)).split("/");r=new pe(r[0],r[1],r[2]),S(r,0),t._view.setDate(i,r),t.navigateDown(a(i,n.min,n.max))},_focus:function(e){var t=this,n=t._view;0!==n.compare(e,t._current)?t.navigate(e):(t._current=e,t._class(K,n.toDateString(e)))},_focusView:function(e,t){e&&this.focus(t)},_footer:function(n){var i=this,r=o(),a=i.element,s=a.find(".k-footer");return n?(s[0]||(s=e('<div class="k-footer"><a href="#" class="k-link k-nav-today"></a></div>').appendTo(a)),i._today=s.show().find(".k-link").html(n(r)).attr("title",y.toString(r,"D",i.options.culture)),i._toggle(),t):(i._toggle(!1),s.hide(),t)},_header:function(){var e,t=this,n=t.element;n.find(".k-header")[0]||n.html('<div class="k-header"><a href="#" role="button" class="k-link k-nav-prev"><span class="k-icon k-i-arrow-w"></span></a><a href="#" role="button" aria-live="assertive" aria-atomic="true" class="k-link k-nav-fast"></a><a href="#" role="button" class="k-link k-nav-next"><span class="k-icon k-i-arrow-e"></span></a></div>'),e=n.find(".k-link").on(re+" "+oe+" "+ne+" "+ee,u).click(!1),t._title=e.eq(1).on(B,function(){t._active=t.options.focusOnNav!==!1,t.navigateUp()}),t[le]=e.eq(0).on(B,function(){t._active=t.options.focusOnNav!==!1,t.navigateToPast()}),t[ce]=e.eq(2).on(B,function(){t._active=t.options.focusOnNav!==!1,t.navigateToFuture()})},_navigate:function(e,t){var n=this,i=n._index+1,r=new pe(+n._current);e=n[e],e.hasClass(Y)||(i>3?r.setFullYear(r.getFullYear()+100*t):_.views[i].setDate(r,t),n.navigate(r))},_option:function(e,n){var i,r=this,o=r.options,a=r._value||r._current;return n===t?o[e]:(n=C(n,o.format,o.culture),n&&(o[e]=new pe(+n),i=e===H?n>a:a>n,(i||v(a,n))&&(i&&(r._value=null),r._changeView=!0),r._changeView||(r._changeView=!(!o.month.content&&!o.month.empty)),r.navigate(r._value),r._toggle()),t)},_toggle:function(e){var n=this,i=n.options,r=n._today;e===t&&(e=s(o(),i.min,i.max)),r&&(r.off(B),e?r.addClass(J).removeClass(Y).on(B,he(n._todayClick,n)):r.removeClass(J).addClass(Y).on(B,d))},_todayClick:function(e){var t=this,n=ge[t.options.depth],i=o();e.preventDefault(),0===t._view.compare(t._current,i)&&t._index==n&&(t._changeView=!1),t._value=i,t.navigate(i,n),t.trigger(j)},_templates:function(){var e=this,t=e.options,n=t.footer,i=t.month,r=i.content,o=i.empty;e.month={content:A('<td#=data.cssClass# role="gridcell"><a tabindex="-1" class="k-link#=data.linkClass#" href="#=data.url#" '+y.attr("value")+'="#=data.dateString#" title="#=data.title#">'+(r||"#=data.value#")+"</a></td>",{useWithBlock:!!r}),empty:A('<td role="gridcell">'+(o||"&nbsp;")+"</td>",{useWithBlock:!!o})},e.footer=n!==!1?A(n||'#= kendo.toString(data,"D","'+t.culture+'") #',{useWithBlock:!1}):null}});w.plugin(me),_={firstDayOfMonth:function(e){return new pe(e.getFullYear(),e.getMonth(),1)},firstVisibleDay:function(e,t){t=t||y.culture().calendar;for(var n=t.firstDay,i=new pe(e.getFullYear(),e.getMonth(),0,e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds());i.getDay()!=n;)_.setTime(i,-1*se);return i},setTime:function(e,t){var n=e.getTimezoneOffset(),i=new pe(e.getTime()+t),r=i.getTimezoneOffset()-n;e.setTime(i.getTime()+r*ae)},views:[{name:U,title:function(e,t,n,i){return h(i).months.names[e.getMonth()]+" "+e.getFullYear()},content:function(e){for(var t=this,n=0,r=e.min,o=e.max,a=e.date,s=e.dates,c=e.format,u=e.culture,d=e.url,f=d&&s[0],p=h(u),m=p.firstDay,v=p.days,b=l(v.names,m),w=l(v.namesShort,m),x=_.firstVisibleDay(a,p),k=t.first(a),C=t.last(a),T=t.toDateString,A=new pe,D='<table tabindex="0" role="grid" class="k-content" cellspacing="0"><thead><tr role="row">';7>n;n++)D+='<th scope="col" title="'+b[n]+'">'+w[n]+"</th>";return A=new pe(A.getFullYear(),A.getMonth(),A.getDate()),S(A,0),A=+A,i({cells:42,perRow:7,html:D+='</tr></thead><tbody><tr role="row">',start:x,min:new pe(r.getFullYear(),r.getMonth(),r.getDate()),max:new pe(o.getFullYear(),o.getMonth(),o.getDate()),content:e.content,empty:e.empty,setter:t.setDate,build:function(e){var t=[],n=e.getDay(),i="",r="#";return(k>e||e>C)&&t.push(Q),+e===A&&t.push("k-today"),(0===n||6===n)&&t.push("k-weekend"),f&&g(+e,s)&&(r=d.replace("{0}",y.toString(e,c,u)),i=" k-action-link"),{date:e,dates:s,ns:y.ns,title:y.toString(e,"D",u),value:e.getDate(),dateString:T(e),cssClass:t[0]?' class="'+t.join(" ")+'"':"",linkClass:i,url:r}}})},first:function(e){return _.firstDayOfMonth(e)},last:function(e){var t=new pe(e.getFullYear(),e.getMonth()+1,0),n=_.firstDayOfMonth(e),i=Math.abs(t.getTimezoneOffset()-n.getTimezoneOffset());return i&&t.setHours(n.getHours()+i/60),t},compare:function(e,t){var n,i=e.getMonth(),r=e.getFullYear(),o=t.getMonth(),a=t.getFullYear();return n=r>a?1:a>r?-1:i==o?0:i>o?1:-1},setDate:function(e,t){var n=e.getHours();t instanceof pe?e.setFullYear(t.getFullYear(),t.getMonth(),t.getDate()):_.setTime(e,t*se),S(e,n)},toDateString:function(e){return e.getFullYear()+"/"+e.getMonth()+"/"+e.getDate()}},{name:"year",title:function(e){return e.getFullYear()},content:function(e){var t=h(e.culture).months.namesAbbr,n=this.toDateString,r=e.min,o=e.max;return i({min:new pe(r.getFullYear(),r.getMonth(),1),max:new pe(o.getFullYear(),o.getMonth(),1),start:new pe(e.date.getFullYear(),0,1),setter:this.setDate,build:function(e){return{value:t[e.getMonth()],ns:y.ns,dateString:n(e),cssClass:""}}})},first:function(e){return new pe(e.getFullYear(),0,e.getDate())},last:function(e){return new pe(e.getFullYear(),11,e.getDate())},compare:function(e,t){return r(e,t)},setDate:function(e,t){var n,i=e.getHours();t instanceof pe?(n=t.getMonth(),e.setFullYear(t.getFullYear(),n,e.getDate()),n!==e.getMonth()&&e.setDate(0)):(n=e.getMonth()+t,e.setMonth(n),n>11&&(n-=12),n>0&&e.getMonth()!=n&&e.setDate(0)),S(e,i)},toDateString:function(e){return e.getFullYear()+"/"+e.getMonth()+"/1"}},{name:"decade",title:function(e,t,i){return n(e,t,i,10)},content:function(e){var t=e.date.getFullYear(),n=this.toDateString;return i({start:new pe(t-t%10-1,0,1),min:new pe(e.min.getFullYear(),0,1),max:new pe(e.max.getFullYear(),0,1),setter:this.setDate,build:function(e,t){return{value:e.getFullYear(),ns:y.ns,dateString:n(e),cssClass:0===t||11==t?X:""}}})},first:function(e){var t=e.getFullYear();return new pe(t-t%10,e.getMonth(),e.getDate())},last:function(e){var t=e.getFullYear();return new pe(t-t%10+9,e.getMonth(),e.getDate())},compare:function(e,t){return r(e,t,10)},setDate:function(e,t){c(e,t,1)},toDateString:function(e){return e.getFullYear()+"/0/1"}},{name:W,title:function(e,t,i){return n(e,t,i,100)},content:function(e){var t=e.date.getFullYear(),n=e.min.getFullYear(),r=e.max.getFullYear(),o=this.toDateString,a=n,s=r;return a-=a%10,s-=s%10,10>s-a&&(s=a+9),i({start:new pe(t-t%100-10,0,1),min:new pe(a,0,1),max:new pe(s,0,1),setter:this.setDate,build:function(e,t){var i=e.getFullYear(),a=i+9;return n>i&&(i=n),a>r&&(a=r),{ns:y.ns,value:i+" - "+a,dateString:o(e),cssClass:0===t||11==t?X:""}}})},first:function(e){var t=e.getFullYear();return new pe(t-t%100,e.getMonth(),e.getDate())},last:function(e){var t=e.getFullYear();return new pe(t-t%100+99,e.getMonth(),e.getDate())},compare:function(e,t){return r(e,t,100)},setDate:function(e,t){c(e,t,10)},toDateString:function(e){var t=e.getFullYear();return t-t%10+"/0/1"}}]},_.isEqualDatePart=m,_.makeUnselectable=p,_.restrictValue=a,_.isInRange=s,_.normalize=f,_.viewsEnum=ge,y.calendar=_}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t){var n=t.parseFormats,i=t.format;B.normalize(t),n=e.isArray(n)?n:[n],n.length||n.push("yyyy-MM-dd"),-1===e.inArray(i,n)&&n.splice(0,0,t.format),t.parseFormats=n}function i(e){e.preventDefault()}var r,o=window.kendo,a=o.ui,s=a.Widget,l=o.parseDate,c=o.keys,u=o.template,d=o._activeElement,h="<div />",f="<span />",p=".kendoDatePicker",g="click"+p,m="open",v="close",_="change",y="disabled",b="readonly",w="k-state-default",x="k-state-focused",k="k-state-selected",C="k-state-disabled",S="k-state-hover",T="mouseenter"+p+" mouseleave"+p,A="mousedown"+p,D="id",M="min",E="max",P="month",I="aria-disabled",z="aria-expanded",R="aria-hidden",F="aria-readonly",B=o.calendar,L=B.isInRange,O=B.restrictValue,H=B.isEqualDatePart,N=e.extend,V=e.proxy,U=Date,W=function(t){var n,i=this,r=document.body,s=e(h).attr(R,"true").addClass("k-calendar-container").appendTo(r);i.options=t=t||{},n=t.id,n&&(n+="_dateview",s.attr(D,n),i._dateViewID=n),i.popup=new a.Popup(s,N(t.popup,t,{name:"Popup",isRtl:o.support.isRtl(t.anchor)})),i.div=s,i.value(t.value)};W.prototype={_calendar:function(){var t,n=this,r=n.calendar,s=n.options;r||(t=e(h).attr(D,o.guid()).appendTo(n.popup.element).on(A,i).on(g,"td:has(.k-link)",V(n._click,n)),n.calendar=r=new a.Calendar(t),n._setOptions(s),o.calendar.makeUnselectable(r.element),r.navigate(n._value||n._current,s.start),n.value(n._value))},_setOptions:function(e){this.calendar.setOptions({focusOnNav:!1,change:e.change,culture:e.culture,dates:e.dates,depth:e.depth,footer:e.footer,format:e.format,max:e.max,min:e.min,month:e.month,start:e.start})},setOptions:function(e){var t=this.options;this.options=N(t,e,{change:t.change,close:t.close,open:t.open}),this.calendar&&this._setOptions(this.options)},destroy:function(){this.popup.destroy()},open:function(){var e=this;e._calendar(),e.popup.open()},close:function(){this.popup.close()},min:function(e){this._option(M,e)},max:function(e){this._option(E,e)},toggle:function(){var e=this;e[e.popup.visible()?v:m]()},move:function(e){var t=this,n=e.keyCode,i=t.calendar,r=e.ctrlKey&&n==c.DOWN||n==c.ENTER,o=!1;if(e.altKey)n==c.DOWN?(t.open(),e.preventDefault(),o=!0):n==c.UP&&(t.close(),e.preventDefault(),o=!0);else if(t.popup.visible()){if(n==c.ESC||r&&i._cell.hasClass(k))return t.close(),e.preventDefault(),!0;t._current=i._move(e),o=!0}return o},current:function(e){this._current=e,this.calendar._focus(e)},value:function(e){var t=this,n=t.calendar,i=t.options;t._value=e,t._current=new U(+O(e,i.min,i.max)),n&&n.value(e)},_click:function(e){-1!==e.currentTarget.className.indexOf(k)&&this.close()},_option:function(e,t){var n=this,i=n.calendar;n.options[e]=t,i&&i[e](t)}},W.normalize=n,o.DateView=W,r=s.extend({init:function(t,i){var r,a,c=this;s.fn.init.call(c,t,i),t=c.element,i=c.options,i.min=l(t.attr("min"))||l(i.min),i.max=l(t.attr("max"))||l(i.max),n(i),c._initialOptions=N({},i),c._wrapper(),c.dateView=new W(N({},i,{id:t.attr(D),anchor:c.wrapper,change:function(){c._change(this.value()),c.close()},close:function(e){c.trigger(v)?e.preventDefault():(t.attr(z,!1),a.attr(R,!0))},open:function(e){var n,i=c.options;c.trigger(m)?e.preventDefault():(c.element.val()!==c._oldText&&(n=l(t.val(),i.parseFormats,i.culture),c.dateView[n?"current":"value"](n)),t.attr(z,!0),a.attr(R,!1),c._updateARIA(n))}})),a=c.dateView.div,c._icon();try{t[0].setAttribute("type","text")}catch(u){t[0].type="text"}t.addClass("k-input").attr({role:"combobox","aria-expanded":!1,"aria-owns":c.dateView._dateViewID}),c._reset(),c._template(),r=t.is("[disabled]")||e(c.element).parents("fieldset").is(":disabled"),r?c.enable(!1):c.readonly(t.is("[readonly]")),c._old=c._update(i.value||c.element.val()),c._oldText=t.val(),o.notify(c)},events:[m,v,_],options:{name:"DatePicker",value:null,footer:"",format:"",culture:"",parseFormats:[],min:new Date(1900,0,1),max:new Date(2099,11,31),start:P,depth:P,animation:{},month:{},dates:[],ARIATemplate:'Current focused date is #=kendo.toString(data.current, "D")#'},setOptions:function(e){var t=this,i=t._value;s.fn.setOptions.call(t,e),e=t.options,e.min=l(e.min),e.max=l(e.max),n(e),t.dateView.setOptions(e),i&&(t.element.val(o.toString(i,e.format,e.culture)),t._updateARIA(i))},_editable:function(e){var t=this,n=t._dateIcon.off(p),r=t.element.off(p),o=t._inputWrapper.off(p),a=e.readonly,s=e.disable;a||s?(o.addClass(s?C:w).removeClass(s?w:C),r.attr(y,s).attr(b,a).attr(I,s).attr(F,a)):(o.addClass(w).removeClass(C).on(T,t._toggleHover),r.removeAttr(y).removeAttr(b).attr(I,!1).attr(F,!1).on("keydown"+p,V(t._keydown,t)).on("focusout"+p,V(t._blur,t)).on("focus"+p,function(){t._inputWrapper.addClass(x)}),n.on(g,V(t._click,t)).on(A,i))},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},destroy:function(){var e=this;s.fn.destroy.call(e),e.dateView.destroy(),e.element.off(p),e._dateIcon.off(p),e._inputWrapper.off(p),e._form&&e._form.off("reset",e._resetHandler)},open:function(){this.dateView.open()},close:function(){this.dateView.close()},min:function(e){return this._option(M,e)},max:function(e){return this._option(E,e)},value:function(e){var n=this;return e===t?n._value:(n._old=n._update(e),null===n._old&&n.element.val(""),n._oldText=n.element.val(),t)},_toggleHover:function(t){e(t.currentTarget).toggleClass(S,"mouseenter"===t.type)},_blur:function(){var e=this,t=e.element.val();e.close(),t!==e._oldText&&e._change(t),e._inputWrapper.removeClass(x)},_click:function(){var e=this,t=e.element;e.dateView.toggle(),o.support.touch||t[0]===d()||t.focus()},_change:function(e){var t=this;e=t._update(e),+t._old!=+e&&(t._old=e,t._oldText=t.element.val(),t._typing||t.element.trigger(_),t.trigger(_)),t._typing=!1},_keydown:function(e){var t=this,n=t.dateView,i=t.element.val(),r=!1;n.popup.visible()||e.keyCode!=c.ENTER||i===t._oldText?(r=n.move(e),t._updateARIA(n._current),r||(t._typing=!0)):t._change(i)},_icon:function(){var t,n=this,i=n.element;t=i.next("span.k-select"),t[0]||(t=e('<span unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-calendar">select</span></span>').insertAfter(i)),n._dateIcon=t.attr({role:"button","aria-controls":n.dateView._dateViewID})},_option:function(e,n){var i=this,r=i.options;return n===t?r[e]:(n=l(n,r.parseFormats,r.culture),n&&(r[e]=new U(+n),i.dateView[e](n)),t)},_update:function(e){var t,n=this,i=n.options,r=i.min,a=i.max,s=n._value,c=l(e,i.parseFormats,i.culture),u=null===c&&null===s||c instanceof Date&&s instanceof Date;return+c===+s&&u?(t=o.toString(c,i.format,i.culture),t!==e&&n.element.val(null===c?e:t),c):(null!==c&&H(c,r)?c=O(c,r,a):L(c,r,a)||(c=null),n._value=c,n.dateView.value(c),n.element.val(c?o.toString(c,i.format,i.culture):e),n._updateARIA(c),c)},_wrapper:function(){var t,n=this,i=n.element;t=i.parents(".k-datepicker"),t[0]||(t=i.wrap(f).parent().addClass("k-picker-wrap k-state-default"),t=t.wrap(f).parent()),t[0].style.cssText=i[0].style.cssText,i.css({width:"100%",height:i[0].style.height}),n.wrapper=t.addClass("k-widget k-datepicker k-header").addClass(i[0].className),n._inputWrapper=e(t[0].firstChild)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){t.value(n[0].defaultValue),t.max(t._initialOptions.max),t.min(t._initialOptions.min)},t._form=r.on("reset",t._resetHandler))},_template:function(){this._ariaTemplate=u(this.options.ARIATemplate)},_updateARIA:function(e){var t,n=this,i=n.dateView.calendar;n.element.removeAttr("aria-activedescendant"),i&&(t=i._cell,t.attr("aria-label",n._ariaTemplate({current:e||i.current()})),n.element.attr("aria-activedescendant",t.attr("id")))}}),a.plugin(r)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n){return n?t.substring(0,e).split(n).length-1:0}function i(e,t,i){return t.split(i)[n(e,t,i)]}function r(e,t,i,r){var o=t.split(r);return o.splice(n(e,t,r),1,i),r&&""!==o[o.length-1]&&o.push(""),o.join(r)}var o=window.kendo,a=o.support,s=o.caret,l=o._activeElement,c=a.placeholder,u=o.ui,d=u.List,h=o.keys,f=o.data.DataSource,p="aria-disabled",g="aria-readonly",m="k-state-default",v="disabled",_="readonly",y="k-state-focused",b="k-state-selected",w="k-state-disabled",x="k-state-hover",k=".kendoAutoComplete",C="mouseenter"+k+" mouseleave"+k,S=e.proxy,T=d.extend({init:function(t,n){var i,r,a=this;a.ns=k,n=e.isArray(n)?{dataSource:n}:n,d.fn.init.call(a,t,n),t=a.element,n=a.options,n.placeholder=n.placeholder||t.attr("placeholder"),c&&t.attr("placeholder",n.placeholder),a._wrapper(),a._loader(),a._dataSource(),a._ignoreCase(),t[0].type="text",i=a.wrapper,a._popup(),t.addClass("k-input").on("keydown"+k,S(a._keydown,a)).on("paste"+k,S(a._search,a)).on("focus"+k,function(){a._active=!0,a._prev=a._accessor(),a._placeholder(!1),i.addClass(y)}).on("focusout"+k,function(){a._change(),a._placeholder(),a._active=!1,i.removeClass(y)}).attr({autocomplete:"off",role:"textbox","aria-haspopup":!0}),a._enable(),a._old=a._accessor(),t[0].id&&t.attr("aria-owns",a.ul[0].id),a._aria(),a._placeholder(),a._initList(),r=e(a.element).parents("fieldset").is(":disabled"),r&&a.enable(!1),a.listView.bind("click",function(e){e.preventDefault()}),a._resetFocusItemHandler=e.proxy(a._resetFocusItem,a),o.notify(a)},options:{name:"AutoComplete",enabled:!0,suggest:!1,template:"",groupTemplate:"#:data#",fixedGroupTemplate:"#:data#",dataTextField:"",minLength:1,delay:200,height:200,filter:"startswith",ignoreCase:!0,highlightFirst:!1,separator:null,placeholder:"",animation:{},virtual:!1,value:null},_dataSource:function(){var e=this;e.dataSource&&e._refreshHandler?e._unbindDataSource():e._progressHandler=S(e._showBusy,e),e.dataSource=f.create(e.options.dataSource).bind("progress",e._progressHandler)},setDataSource:function(e){this.options.dataSource=e,this._dataSource(),this.listView.setDataSource(this.dataSource)},events:["open","close","change","select","filtering","dataBinding","dataBound"],setOptions:function(e){var t=this._listOptions(e);d.fn.setOptions.call(this,e),t.dataValueField=t.dataTextField,this.listView.setOptions(t),this._accessors(),this._aria()},_editable:function(e){var t=this,n=t.element,i=t.wrapper.off(k),r=e.readonly,o=e.disable;r||o?(i.addClass(o?w:m).removeClass(o?m:w),n.attr(v,o).attr(_,r).attr(p,o).attr(g,r)):(i.addClass(m).removeClass(w).on(C,t._toggleHover),n.removeAttr(v).removeAttr(_).attr(p,!1).attr(g,!1))},close:function(){var e=this,t=e.listView.focus();t&&t.removeClass(b),e.popup.close()},destroy:function(){var e=this;e.element.off(k),e.wrapper.off(k),d.fn.destroy.call(e)},refresh:function(){this.listView.refresh()},select:function(e){this._select(e)},search:function(e){var t,n=this,r=n.options,o=r.ignoreCase,a=r.separator;e=e||n._accessor(),clearTimeout(n._typingTimeout),a&&(e=i(s(n.element)[0],e,a)),t=e.length,(!t||t>=r.minLength)&&(n._open=!0,n.listView.filter(!0),n.listView.value([]),n._filterSource({value:o?e.toLowerCase():e,operator:r.filter,field:r.dataTextField,ignoreCase:o}))},suggest:function(e){var i,r=this,o=r._last,a=r._accessor(),c=r.element[0],u=s(c)[0],f=r.options.separator,p=a.split(f),g=n(u,a,f),m=u;return o==h.BACKSPACE||o==h.DELETE?(r._last=t,t):(e=e||"","string"!=typeof e&&(e[0]&&(e=r.dataSource.view()[d.inArray(e[0],r.ul[0])]),e=e?r._text(e):""),0>=u&&(u=a.toLowerCase().indexOf(e.toLowerCase())+1),i=a.substring(0,u).lastIndexOf(f),i=i>-1?u-(i+f.length):u,a=p[g].substring(0,i),e&&(e=""+e,i=e.toLowerCase().indexOf(a.toLowerCase()),i>-1&&(e=e.substring(i+a.length),m=u+e.length,a+=e),f&&""!==p[p.length-1]&&p.push("")),p[g]=a,r._accessor(p.join(f||"")),c===l()&&s(c,u,m),t)},value:function(e){return e===t?this._accessor():(this.listView.value(e),this._accessor(e),this._old=this._accessor(),t)},_click:function(e){var n=e.item,i=this.element;return this._active=!0,this.trigger("select",{item:n})?(this.close(),t):(this._select(n),this._blur(),s(i,i.val().length),t)},_initList:function(){var t=this,n=t.options.virtual,i=!!n,r=S(t._listBound,t),a={autoBind:!1,selectable:!0,dataSource:t.dataSource,click:e.proxy(t._click,this),change:e.proxy(t._listChange,this),activate:S(t._activateItem,t),deactivate:S(t._deactivateItem,t),dataBinding:function(){t.trigger("dataBinding"),t._angularItems("cleanup")},dataBound:r,listBound:r,skipUpdateOnBind:!0};a=e.extend(t._listOptions(),a,"object"==typeof n?n:{}),a.dataValueField=a.dataTextField,t.listView=i?new o.ui.VirtualList(t.ul,a):new o.ui.StaticList(t.ul,a),t.listView.value(t.options.value)},_resetFocusItem:function(){var e=this.options.highlightFirst?0:-1;this.options.virtual&&this.listView.scrollTo(0),this.listView.focus(e)},_listBound:function(){var e,n=this,i=n.popup,r=n.options,o=n.dataSource.flatView(),a=o.length,s=n.element[0]===l();n._angularItems("compile"),n._calculateGroupPadding(n._height(a)),i.position(),a&&r.suggest&&s&&n.suggest(o[0]),n._open&&(n._open=!1,e=a?"open":"close",n._typingTimeout&&!s&&(e="close"),a&&(r.virtual?n.popup.unbind("activate",n._resetFocusItemHandler).one("activate",n._resetFocusItemHandler):n._resetFocusItem()),i[e](),n._typingTimeout=t),n.listView.filter(!1),n._touchScroller&&n._touchScroller.reset(),n._hideBusy(),n._makeUnselectable(),n.trigger("dataBound")},_listChange:function(){!this.listView.filter()&&this._active&&this._selectValue(this.listView.selectedDataItems()[0])},_selectValue:function(e){var t=this.options.separator,n="";e&&(n=this._text(e)),null===n&&(n=""),t&&(n=r(s(this.element)[0],this._accessor(),n,t)),this._prev=n,this._accessor(n),this._placeholder()},_accessor:function(e){var n=this,i=n.element[0];return e===t?(e=i.value,i.className.indexOf("k-readonly")>-1&&e===n.options.placeholder?"":e):(i.value=null===e?"":e,n._placeholder(),t)},_keydown:function(e){var t=this,n=e.keyCode,i=t.popup.visible(),r=this.listView.focus();if(t._last=n,n===h.DOWN)i&&this._move(r?"focusNext":"focusFirst"),e.preventDefault();else if(n===h.UP)i&&this._move(r?"focusPrev":"focusLast"),e.preventDefault();else if(n===h.ENTER||n===h.TAB){if(n===h.ENTER&&i&&e.preventDefault(),i&&r){if(t.trigger("select",{item:r}))return;this._select(r)}this._blur()}else n===h.ESC?(i&&e.preventDefault(),t.close()):(t._search(),t._typing=!0)},_move:function(e){this.listView[e](),this.options.suggest&&this.suggest(this.listView.focus())},_hideBusy:function(){var e=this;clearTimeout(e._busy),e._loading.hide(),e.element.attr("aria-busy",!1),e._busy=null},_showBusy:function(){var e=this;e._busy||(e._busy=setTimeout(function(){e.element.attr("aria-busy",!0),e._loading.show()},100))},_placeholder:function(e){if(!c){var n,i=this,r=i.element,o=i.options.placeholder;if(o){if(n=r.val(),e===t&&(e=!n),e||(o=n!==o?n:""),n===i._old&&!e)return;r.toggleClass("k-readonly",e).val(o),o||r[0]!==document.activeElement||s(r[0],0,0)}}},_search:function(){var e=this;clearTimeout(e._typingTimeout),e._typingTimeout=setTimeout(function(){e._prev!==e._accessor()&&(e._prev=e._accessor(),e.search())},e.options.delay)},_select:function(e){this.listView.select(e)},_loader:function(){this._loading=e('<span class="k-icon k-loading" style="display:none"></span>').insertAfter(this.element)},_toggleHover:function(t){e(t.currentTarget).toggleClass(x,"mouseenter"===t.type)},_wrapper:function(){var e,t=this,n=t.element,i=n[0];e=n.parent(),e.is("span.k-widget")||(e=n.wrap("<span />").parent()),e.attr("tabindex",-1),e.attr("role","presentation"),e[0].style.cssText=i.style.cssText,n.css({width:"100%",height:i.style.height}),t._focused=t.element,t.wrapper=e.addClass("k-widget k-autocomplete k-header").addClass(i.className)}});u.plugin(T)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n){for(var i,r=0,o=t.length-1;o>r;++r)i=t[r],i in e||(e[i]={}),e=e[i];e[t[o]]=n}var i=window.kendo,r=i.ui,o=r.Select,a=i.support,s=i._activeElement,l=i.data.ObservableObject,c=i.keys,u=".kendoDropDownList",d="disabled",h="readonly",f="change",p="k-state-focused",g="k-state-default",m="k-state-disabled",v="aria-disabled",_="aria-readonly",y="mouseenter"+u+" mouseleave"+u,b="tabindex",w="filter",x="accept",k=e.proxy,C=o.extend({init:function(n,r){var a,s,l,c=this,d=r&&r.index;c.ns=u,r=e.isArray(r)?{dataSource:r}:r,o.fn.init.call(c,n,r),r=c.options,n=c.element.on("focus"+u,k(c._focusHandler,c)),c._focusInputHandler=e.proxy(c._focusInput,c),c._inputTemplate(),c._reset(),c._prev="",c._word="",c.optionLabel=e(),c._wrapper(),c._tabindex(),c.wrapper.data(b,c.wrapper.attr(b)),c._span(),c._popup(),c._mobile(),c._dataSource(),c._ignoreCase(),c._filterHeader(),c._aria(),c._enable(),c._oldIndex=c.selectedIndex=-1,d!==t&&(r.index=d),c._initialIndex=r.index,c._optionLabel(),c._initList(),c._cascade(),r.autoBind?c.dataSource.fetch():-1===c.selectedIndex&&(s=r.text||"",s||(a=r.optionLabel,a&&0===r.index?s=a:c._isSelect&&(s=n.children(":selected").text())),c._textAccessor(s)),l=e(c.element).parents("fieldset").is(":disabled"),l&&c.enable(!1),c.listView.bind("click",function(e){e.preventDefault()}),i.notify(c)},options:{name:"DropDownList",enabled:!0,autoBind:!0,index:0,text:null,value:null,delay:500,height:200,dataTextField:"",dataValueField:"",optionLabel:"",cascadeFrom:"",cascadeFromField:"",ignoreCase:!0,animation:{},filter:"none",minLength:1,virtual:!1,template:null,valueTemplate:null,optionLabelTemplate:null,groupTemplate:"#:data#",fixedGroupTemplate:"#:data#"},events:["open","close",f,"select","filtering","dataBinding","dataBound","cascade"],setOptions:function(e){o.fn.setOptions.call(this,e),this.listView.setOptions(this._listOptions(e)),this._optionLabel(),this._inputTemplate(),this._accessors(),this._filterHeader(),this._enable(),this._aria(),!this.value()&&this.optionLabel[0]&&this.select(0)},destroy:function(){var e=this;e.wrapper.off(u),e.element.off(u),e._inputWrapper.off(u),e._arrow.off(),e._arrow=null,e.optionLabel.off(),o.fn.destroy.call(e)},open:function(){var e=this;e.popup.visible()||(e.listView.isBound()&&e._state!==x?e._allowOpening()&&(e.popup.one("activate",e._focusInputHandler),e.popup.open(),e._focusItem()):(e._open=!0,e._state="rebind",e.filterInput&&(e.filterInput.val(""),e._prev=""),e._filterSource()))},_focusInput:function(){this._focusElement(this.filterInput)},_allowOpening:function(){return this.optionLabel[0]||this.filterInput||this.dataSource.view().length},toggle:function(e){this._toggle(e,!0)},current:function(e){var n;return e===t?(n=this.listView.focus(),!n&&0===this.selectedIndex&&this.optionLabel[0]?this.optionLabel:n):(this._focus(e),t)},dataItem:function(n){var i=this,r=null,o=!!i.optionLabel[0],a=i.options.optionLabel;if(n===t)r=i.listView.selectedDataItems()[0];else{if("number"!=typeof n){if(i.options.virtual)return i.dataSource.getByUid(e(n).data("uid"));n=n.hasClass("k-list-optionlabel")?-1:e(i.items()).index(n)}else o&&(n-=1);r=i.dataSource.flatView()[n]}return!r&&o&&(r=e.isPlainObject(a)?new l(a):i._assignInstance(i._optionLabelText(),"")),r},refresh:function(){this.listView.refresh()},text:function(e){var n,i,r=this,o=r.options.ignoreCase;return e=null===e?"":e,e===t?r._textAccessor():("string"==typeof e&&(i=o?e.toLowerCase():e,r._select(function(e){return e=r._text(e),o&&(e=(e+"").toLowerCase()),e===i}),n=r.dataItem(),n&&(e=n)),r._textAccessor(e),t)},value:function(e){var n=this,i=n.dataSource;return e===t?(e=n._accessor()||n.listView.value()[0],e===t||null===e?"":e):(e&&(n._initialIndex=null),n._request&&n.options.cascadeFrom&&n.listView.isBound()?(n._valueSetter&&i.unbind(f,n._valueSetter),n._valueSetter=k(function(){n.value(e)},n),i.one(f,n._valueSetter),t):(n.listView.value(e).done(function(){-1===n.selectedIndex&&n.text()&&(n.text(""),n._accessor("",-1)),n._old=n._accessor(),n._oldIndex=n.selectedIndex}),n._fetchData(),t))},_optionLabel:function(){var n=this,r=n.options,o=r.optionLabel,a=r.optionLabelTemplate;return o?(a||(a="#:",a+="string"==typeof o?"data":i.expr(r.dataTextField,"data"),a+="#"),"function"!=typeof a&&(a=i.template(a)),n.optionLabelTemplate=a,n.optionLabel[0]||(n.optionLabel=e('<div class="k-list-optionlabel"></div>').prependTo(n.list)),n.optionLabel.html(a(o)).off().click(k(n._click,n)).on(y,n._toggleHover),n.angular("compile",function(){return{elements:n.optionLabel}}),t):(n.optionLabel.off().remove(),n.optionLabel=e(),t)},_optionLabelText:function(){var e=this.options.optionLabel;return"string"==typeof e?e:this._text(e)},_listBound:function(){var e,t,n,i=this,r=i._initialIndex,o=i.options.optionLabel,a=i._state===w,s=i.dataSource.flatView(),l=s.length;i._angularItems("compile"),i._presetValue=!1,i.options.virtual||(t=i._height(a?l||1:l),i._calculateGroupPadding(t)),i.popup.position(),i._isSelect&&(n=i.value(),l?o&&(o=i._option("",i._optionLabelText())):n&&(o=i._option(n,i.text())),i._options(s,o,n)),i._makeUnselectable(),a||(i._open&&i.toggle(i._allowOpening()),i._open=!1,i._fetch||(l?(!i.listView.value().length&&r>-1&&null!==r&&i.select(r),i._initialIndex=null,e=i.listView.selectedDataItems()[0],e&&i.text()!==i._text(e)&&i._selectValue(e)):i._textAccessor()!==i._optionLabelText()&&(i.listView.value(""),i._selectValue(null),i._oldIndex=i.selectedIndex))),i._hideBusy(),i.trigger("dataBound")},_listChange:function(){this._selectValue(this.listView.selectedDataItems()[0]),(this._presetValue||this._old&&-1===this._oldIndex)&&(this._oldIndex=this.selectedIndex)},_focusHandler:function(){this.wrapper.focus()},_focusinHandler:function(){this._inputWrapper.addClass(p),this._prevent=!1},_focusoutHandler:function(){var e=this,t=e._state===w,n=window.self!==window.top,i=e._focus();e._prevent||(clearTimeout(e._typingTimeout),t&&i&&!e.trigger("select",{item:i})&&e._select(i,!e.dataSource.view().length),a.mobileOS.ios&&n?e._change():e._blur(),e._inputWrapper.removeClass(p),e._prevent=!0,e._open=!1,e.element.blur())},_wrapperMousedown:function(){this._prevent=!!this.filterInput},_wrapperClick:function(e){e.preventDefault(),this.popup.unbind("activate",this._focusInputHandler),this._focused=this.wrapper,this._toggle()},_editable:function(e){var t=this,n=t.element,i=e.disable,r=e.readonly,o=t.wrapper.add(t.filterInput).off(u),a=t._inputWrapper.off(y);r||i?i?(o.removeAttr(b),a.addClass(m).removeClass(g)):(a.addClass(g).removeClass(m),o.on("focusin"+u,k(t._focusinHandler,t)).on("focusout"+u,k(t._focusoutHandler,t))):(n.removeAttr(d).removeAttr(h),a.addClass(g).removeClass(m).on(y,t._toggleHover),o.attr(b,o.data(b)).attr(v,!1).attr(_,!1).on("keydown"+u,k(t._keydown,t)).on("focusin"+u,k(t._focusinHandler,t)).on("focusout"+u,k(t._focusoutHandler,t)).on("mousedown"+u,k(t._wrapperMousedown,t)),t.wrapper.on("click"+u,k(t._wrapperClick,t)),t.filterInput||o.on("keypress"+u,k(t._keypress,t))),n.attr(d,i).attr(h,r),o.attr(v,i).attr(_,r)},_option:function(e,t){return'<option value="'+e+'">'+t+"</option>"},_keydown:function(e){var n,i,r=this,o=e.keyCode,a=e.altKey,l=r.popup.visible();if(r.filterInput&&(n=r.filterInput[0]===s()),o===c.LEFT?(o=c.UP,i=!0):o===c.RIGHT&&(o=c.DOWN,i=!0),!i||!n){if(e.keyCode=o,a&&o===c.UP&&r._focusElement(r.wrapper),o===c.ENTER&&r._typingTimeout&&r.filterInput&&l)return e.preventDefault(),t;i=r._move(e),i||(l&&r.filterInput||(o===c.HOME?(i=!0,r._firstItem()):o===c.END&&(i=!0,r._lastItem()),i&&(r._select(r._focus()),e.preventDefault())),a||i||!r.filterInput||r._search())}},_matchText:function(e,t){var n=this,i=n.options.ignoreCase,r=!1;return e+="",i&&(e=e.toLowerCase()),0===e.indexOf(n._word)&&(n.optionLabel[0]&&(t+=1),n._select(t),n.popup.visible()||n._change(),r=!0),r},_selectNext:function(e){for(var t,n=this,i=e,r=n.dataSource.flatView(),o=r.length;o>e;e++)if(t=n._text(r[e]),t&&n._matchText(t,e)&&(1!==n._word.length||i!==n.selectedIndex))return!0;if(i>0&&o>i)for(e=0;i>=e;e++)if(t=n._text(r[e]),t&&n._matchText(t,e))return!0;return!1},_keypress:function(e){var t,n,r,o=this;0!==e.which&&e.keyCode!==i.keys.ENTER&&(t=String.fromCharCode(e.charCode||e.keyCode),
n=o.selectedIndex,r=o._word.length,o.options.ignoreCase&&(t=t.toLowerCase())," "===t&&e.preventDefault(),r||(o._word=t),o._last===t&&1>=r&&n>-1&&o._selectNext(n)||(r&&(o._word+=t),o._last=t,o._search()))},_popupOpen:function(){var e=this.popup;e.wrapper=i.wrap(e.element),e.element.closest(".km-root")[0]&&(e.wrapper.addClass("km-popup km-widget"),this.wrapper.addClass("km-widget"))},_popup:function(){o.fn._popup.call(this),this.popup.one("open",k(this._popupOpen,this))},_click:function(n){var i=n.item||e(n.currentTarget);return this.trigger("select",{item:i})?(this.close(),t):(this._userTriggered=!0,this._select(i),this._focusElement(this.wrapper),this._blur(),t)},_focusElement:function(e){var t=s(),n=this.wrapper,i=this.filterInput,r=e===i?n:i,o=a.mobileOS&&(a.touch||a.MSPointers||a.pointers);i&&i[0]===e[0]&&o||i&&r[0]===t&&(this._prevent=!0,this._focused=e.focus())},_filter:function(e){var n,i;e&&(n=this,i=n.options.ignoreCase,i&&(e=e.toLowerCase()),n._select(function(r){var o=n._text(r);return o!==t?(o+="",i&&(o=o.toLowerCase()),0===o.indexOf(e)):t}))},_search:function(){var e=this,n=e.dataSource,i=e.selectedIndex;if(clearTimeout(e._typingTimeout),"none"!==e.options.filter)e._typingTimeout=setTimeout(function(){var t=e.filterInput.val();e._prev!==t&&(e._prev=t,e.search(t)),e._typingTimeout=null},e.options.delay);else{if(e._typingTimeout=setTimeout(function(){e._word=""},e.options.delay),-1===i&&(i=0),!e.ul[0].firstChild)return n.fetch().done(function(){n.data()[0]&&i>-1&&e._selectNext(i)}),t;e._selectNext(i)}},_get:function(t){var n,i,r,o="function"==typeof t,a=o?e():e(t);if(this.optionLabel[0]&&("number"==typeof t?t>-1&&(t-=1):a.hasClass("k-list-optionlabel")&&(t=-1)),o){for(n=this.dataSource.flatView(),r=0;n.length>r;r++)if(t(n[r])){t=r,i=!0;break}i||(t=-1)}return t},_firstItem:function(){this.optionLabel[0]?this._focus(this.optionLabel):this.listView.focusFirst()},_lastItem:function(){this.optionLabel.removeClass("k-state-focused"),this.listView.focusLast()},_nextItem:function(){this.optionLabel.hasClass("k-state-focused")?(this.optionLabel.removeClass("k-state-focused"),this.listView.focusFirst()):this.listView.focusNext()},_prevItem:function(){this.optionLabel.hasClass("k-state-focused")||(this.listView.focusPrev(),this.listView.focus()||this.optionLabel.addClass("k-state-focused"))},_focusItem:function(){var e=this.listView,n=e.focus(),i=e.select();i=i[i.length-1],i===t&&this.options.highlightFirst&&!n&&(i=0),i!==t?e.focus(i):this.options.optionLabel?(this._focus(this.optionLabel),this._select(this.optionLabel)):e.scrollToIndex(0)},_focus:function(e){var n=this.listView,i=this.optionLabel;return e===t?(e=n.focus(),!e&&i.hasClass("k-state-focused")&&(e=i),e):(i.removeClass("k-state-focused"),e=this._get(e),n.focus(e),-1===e&&i.addClass("k-state-focused"),t)},_select:function(e,t){var n=this;e=n._get(e),n.listView.select(e),t||n._state!==w||(n.listView.filter(!1),n._state=x),-1===e&&n._selectValue(null)},_selectValue:function(e){var n=this,i=n.options.optionLabel,r=n.optionLabel,o=n.listView.select(),a="",s="";o=o[o.length-1],o===t&&(o=-1),r.removeClass("k-state-focused k-state-selected"),e?(s=e,a=n._dataValue(e),i&&(o+=1)):i&&(n._focus(r.addClass("k-state-selected")),s=n._optionLabelText(),a="string"==typeof i?"":n._value(i),o=0),n.selectedIndex=o,null===a&&(a=""),n._textAccessor(s),n._accessor(a,o),n._triggerCascade()},_mobile:function(){var e=this,t=e.popup,n=a.mobileOS,i=t.element.parents(".km-root").eq(0);i.length&&n&&(t.options.animation.open.effects=n.android||n.meego?"fadeIn":n.ios||n.wp?"slideIn:up":t.options.animation.open.effects)},_filterHeader:function(){var t,n=this.options,i="none"!==n.filter;this.filterInput&&(this.filterInput.off(u).parent().remove(),this.filterInput=null),i&&(t='<span unselectable="on" class="k-icon k-i-search">select</span>',this.filterInput=e('<input class="k-textbox"/>').attr({role:"listbox","aria-haspopup":!0,"aria-expanded":!1}),this.list.prepend(e('<span class="k-list-filter" />').append(this.filterInput.add(t))))},_span:function(){var t,n=this,i=n.wrapper,r="span.k-input";t=i.find(r),t[0]||(i.append('<span unselectable="on" class="k-dropdown-wrap k-state-default"><span unselectable="on" class="k-input">&nbsp;</span><span unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-arrow-s">select</span></span></span>').append(n.element),t=i.find(r)),n.span=t,n._inputWrapper=e(i[0].firstChild),n._arrow=i.find(".k-icon")},_wrapper:function(){var e,t=this,n=t.element,i=n[0];e=n.parent(),e.is("span.k-widget")||(e=n.wrap("<span />").parent(),e[0].style.cssText=i.style.cssText,e[0].title=i.title),n.hide(),t._focused=t.wrapper=e.addClass("k-widget k-dropdown k-header").addClass(i.className).css("display","").attr({unselectable:"on",role:"listbox","aria-haspopup":!0,"aria-expanded":!1})},_clearSelection:function(e){this.select(e.value()?0:-1)},_inputTemplate:function(){var t=this,n=t.options.valueTemplate;n=n?i.template(n):e.proxy(i.template("#:this._text(data)#",{useWithBlock:!1}),t),t.valueTemplate=n},_textAccessor:function(n){var i,r=null,o=this.valueTemplate,a=this.options,s=a.optionLabel,c=this.span;return n===t?c.text():(e.isPlainObject(n)||n instanceof l?r=n:s&&this._optionLabelText()===n&&(r=s,o=this.optionLabelTemplate),r||(r=this._assignInstance(n,this._accessor())),i=function(){return{elements:c.get(),data:[{dataItem:r}]}},this.angular("cleanup",i),c.html(o(r)),this.angular("compile",i),t)},_preselect:function(e,t){e||t||(t=this._optionLabelText()),this._accessor(e),this._textAccessor(t),this._old=this._accessor(),this._oldIndex=this.selectedIndex,this.listView.setValue(e),this._initialIndex=null,this._presetValue=!0},_assignInstance:function(e,t){var i=this.options.dataTextField,r={};return i?(n(r,i.split("."),e),n(r,this.options.dataValueField.split("."),t),r=new l(r)):r=e,r}});r.plugin(C)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.ui,r=i.List,o=i.Select,a=n.caret,s=n.support,l=s.placeholder,c=n._activeElement,u=n.keys,d=".kendoComboBox",h="click"+d,f="mousedown"+d,p="disabled",g="readonly",m="change",v="k-state-default",_="k-state-focused",y="k-state-disabled",b="aria-disabled",w="aria-readonly",x="filter",k="accept",C="rebind",S="mouseenter"+d+" mouseleave"+d,T=e.proxy,A=o.extend({init:function(t,i){var r,a,s=this;s.ns=d,i=e.isArray(i)?{dataSource:i}:i,o.fn.init.call(s,t,i),i=s.options,t=s.element.on("focus"+d,T(s._focusHandler,s)),i.placeholder=i.placeholder||t.attr("placeholder"),s._reset(),s._wrapper(),s._input(),s._tabindex(s.input),s._popup(),s._dataSource(),s._ignoreCase(),s._enable(),s._oldIndex=s.selectedIndex=-1,s._aria(),s._initialIndex=i.index,s._initList(),s._cascade(),i.autoBind?s._filterSource():(r=i.text,!r&&s._isSelect&&(r=t.children(":selected").text()),r&&(s.input.val(r),s._prev=r)),r||s._placeholder(),a=e(s.element).parents("fieldset").is(":disabled"),a&&s.enable(!1),n.notify(s)},options:{name:"ComboBox",enabled:!0,index:-1,text:null,value:null,autoBind:!0,delay:200,dataTextField:"",dataValueField:"",minLength:0,height:200,highlightFirst:!0,filter:"none",placeholder:"",suggest:!1,cascadeFrom:"",cascadeFromField:"",ignoreCase:!0,animation:{},virtual:!1,template:null,groupTemplate:"#:data#",fixedGroupTemplate:"#:data#"},events:["open","close",m,"select","filtering","dataBinding","dataBound","cascade"],setOptions:function(e){o.fn.setOptions.call(this,e),this.listView.setOptions(e),this._accessors(),this._aria()},destroy:function(){var e=this;e.input.off(d),e.element.off(d),e._inputWrapper.off(d),e._arrow.parent().off(h+" "+f),o.fn.destroy.call(e)},_focusHandler:function(){this.input.focus()},_arrowClick:function(){this._toggle()},_inputFocus:function(){this._inputWrapper.addClass(_),this._placeholder(!1)},_inputFocusout:function(){var e=this;e._inputWrapper.removeClass(_),clearTimeout(e._typingTimeout),e._typingTimeout=null,e.options.text!==e.input.val()&&e.text(e.text()),e._placeholder(),e._blur(),e.element.blur()},_editable:function(e){var t=this,n=e.disable,i=e.readonly,r=t._inputWrapper.off(d),o=t.element.add(t.input.off(d)),a=t._arrow.parent().off(h+" "+f);i||n?(r.addClass(n?y:v).removeClass(n?v:y),o.attr(p,n).attr(g,i).attr(b,n).attr(w,i)):(r.addClass(v).removeClass(y).on(S,t._toggleHover),o.removeAttr(p).removeAttr(g).attr(b,!1).attr(w,!1),a.on(h,T(t._arrowClick,t)).on(f,function(e){e.preventDefault()}),t.input.on("keydown"+d,T(t._keydown,t)).on("focus"+d,T(t._inputFocus,t)).on("focusout"+d,T(t._inputFocusout,t)))},open:function(){var e=this,t=e._state;e.popup.visible()||(!e.listView.isBound()&&t!==x||t===k?(e._open=!0,e._state=C,e.listView.filter(!1),e._filterSource()):(e.popup.open(),e._focusItem()))},_listBound:function(){var e,n,i,r,o=this,a=o.options,s=o._initialIndex,l=o._state===x,u=o.input[0]===c(),d=o.listView,h=d.focus(),f=this.dataSource.flatView(),p=this.dataSource.page(),g=f.length;o._angularItems("compile"),o._presetValue=!1,a.virtual||o._calculateGroupPadding(o._height(g)),o.popup.position(),o._isSelect&&(n=o.element[0].children[0],o._state===C&&(o._state=""),i=!0,r=o._customOption,o._customOption=t,o._options(f,"",o.value()),r&&r[0].selected?o._custom(r.val(),i):n||o._custom("",i)),o._makeUnselectable(),l||o._fetch?l&&h&&h.removeClass("k-state-selected"):(d.value().length||(null!==s&&s>-1?(o.select(s),h=d.focus()):o._accessor()&&d.value(o._accessor())),o._initialIndex=null,e=o.listView.selectedDataItems()[0],e&&o.text()&&o.text()!==o._text(e)&&o._selectValue(e)),!g||p!==t&&1!==p||(a.highlightFirst?h||d.focusIndex()||d.focus(0):d.focus(-1),a.suggest&&u&&o.input.val()&&o.suggest(f[0])),o._open&&(o._open=!1,o._typingTimeout&&!u?o.popup.close():o.toggle(!!g),o._typingTimeout=null),o._touchScroller&&o._touchScroller.reset(),o._hideBusy(),o.trigger("dataBound")},_listChange:function(){this._selectValue(this.listView.selectedDataItems()[0]),this._presetValue&&(this._oldIndex=this.selectedIndex)},_get:function(e){var t,n,i;if("function"==typeof e){for(t=this.dataSource.flatView(),i=0;t.length>i;i++)if(e(t[i])){e=i,n=!0;break}n||(e=-1)}return e},_select:function(e,t){e=this._get(e),-1===e&&(this.input[0].value="",this._accessor("")),this.listView.select(e),t||this._state!==x||(this.listView.filter(!1),this._state=k)},_selectValue:function(e){var n=this.listView.select(),i="",r="";n=n[n.length-1],n===t&&(n=-1),this.selectedIndex=n,-1===n?(i=r=this.input[0].value,this.listView.focus(-1)):(e&&(i=this._dataValue(e),r=this._text(e)),null===i&&(i="")),this._prev=this.input[0].value=r,this._accessor(i!==t?i:r,n),this._placeholder(),this._triggerCascade()},refresh:function(){this.listView.refresh()},suggest:function(e){var n,i=this,o=i.input[0],s=i.text(),l=a(o)[0],d=i._last;return d==u.BACKSPACE||d==u.DELETE?(i._last=t,t):(e=e||"","string"!=typeof e&&(e[0]&&(e=i.dataSource.view()[r.inArray(e[0],i.ul[0])]),e=e?i._text(e):""),0>=l&&(l=s.toLowerCase().indexOf(e.toLowerCase())+1),e?(e=""+e,n=e.toLowerCase().indexOf(s.toLowerCase()),n>-1&&(s+=e.substring(n+s.length))):s=s.substring(0,l),s.length===l&&e||(o.value=s,o===c()&&a(o,l,s.length)),t)},text:function(e){var n,i,r,o,a,s;if(e=null===e?"":e,n=this,i=n.input[0],r=n.options.ignoreCase,o=e,e===t)return i.value;if(a=n.dataItem(),n.options.autoBind!==!1||n.listView.isBound()){if(a&&n._text(a)===e&&(s=n._value(a),null===s?s="":s+="",s===n._old))return n._triggerCascade(),t;r&&(o=o.toLowerCase()),n._select(function(e){return e=n._text(e),r&&(e=(e+"").toLowerCase()),e===o}),0>n.selectedIndex&&(n._accessor(e),i.value=e,n._triggerCascade()),n._prev=i.value}},toggle:function(e){this._toggle(e,!0)},value:function(e){var n=this,i=n.options;return e===t?(e=n._accessor()||n.listView.value()[0],e===t||null===e?"":e):((e!==i.value||n.input.val()!==i.text)&&(n._accessor(e),n.listView.value(e).done(function(){n._selectValue(n.listView.selectedDataItems()[0]),-1===n.selectedIndex&&(n._accessor(e),n.input.val(e),n._placeholder(!0)),n._old=n._accessor(),n._oldIndex=n.selectedIndex,n._prev=n.input.val(),n._state===x&&(n._state=k)}),n._fetchData()),t)},_click:function(e){var n=e.item;return this.trigger("select",{item:n})?(this.close(),t):(this._userTriggered=!0,this._select(n),this._blur(),t)},_filter:function(e){var n,i=this,r=i.options,o=i.dataSource,a=r.ignoreCase,s=function(n){var r=i._text(n);return r!==t?(r+="",""!==r&&""===e?!1:(a&&(r=r.toLowerCase()),0===r.indexOf(e))):t};return a&&(e=e.toLowerCase()),i.ul[0].firstChild?(this.listView.focus(this._get(s)),n=this.listView.focus(),n&&(r.suggest&&i.suggest(n),this.open()),this.options.highlightFirst&&!e&&this.listView.focusFirst(),t):(o.one(m,function(){o.view()[0]&&i.search(e)}).fetch(),t)},_input:function(){var t,n=this,i=n.element.removeClass("k-input")[0],r=i.accessKey,o=n.wrapper,a="input.k-input",s=i.name||"";s&&(s='name="'+s+'_input" '),t=o.find(a),t[0]||(o.append('<span tabindex="-1" unselectable="on" class="k-dropdown-wrap k-state-default"><input '+s+'class="k-input" type="text" autocomplete="off"/><span tabindex="-1" unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-arrow-s">select</span></span></span>').append(n.element),t=o.find(a)),t[0].style.cssText=i.style.cssText,t[0].title=i.title,i.maxLength>-1&&(t[0].maxLength=i.maxLength),t.addClass(i.className).val(this.options.text||i.value).css({width:"100%",height:i.style.height}).attr({role:"combobox","aria-expanded":!1}).show(),l&&t.attr("placeholder",n.options.placeholder),r&&(i.accessKey="",t[0].accessKey=r),n._focused=n.input=t,n._inputWrapper=e(o[0].firstChild),n._arrow=o.find(".k-icon").attr({role:"button",tabIndex:-1}),i.id&&n._arrow.attr("aria-controls",n.ul[0].id)},_keydown:function(e){var t=this,n=e.keyCode;t._last=n,clearTimeout(t._typingTimeout),t._typingTimeout=null,n==u.TAB||t._move(e)||t._search()},_placeholder:function(e){if(!l){var n,i=this,r=i.input,o=i.options.placeholder;if(o){if(n=i.value(),e===t&&(e=!n),r.toggleClass("k-readonly",e),!e){if(n)return;o=""}r.val(o),o||r[0]!==c()||a(r[0],0,0)}}},_search:function(){var e=this;e._typingTimeout=setTimeout(function(){var t=e.text();e._prev!==t&&(e._prev=t,e.search(t)),e._typingTimeout=null},e.options.delay)},_wrapper:function(){var e=this,t=e.element,n=t.parent();n.is("span.k-widget")||(n=t.hide().wrap("<span />").parent(),n[0].style.cssText=t[0].style.cssText),e.wrapper=n.addClass("k-widget k-combobox k-header").addClass(t[0].className).css("display","")},_clearSelection:function(e,t){var n=this,i=e.value(),r=i&&-1===e.selectedIndex;(t||!i||r)&&(n.options.value="",n.value(""))},_preselect:function(e,t){this.input.val(t),this._accessor(e),this._old=this._accessor(),this._oldIndex=this.selectedIndex,this.listView.setValue(e),this._placeholder(),this._initialIndex=null,this._presetValue=!0}});i.plugin(A)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t){var n;if(null===e&&null!==t||null!==e&&null===t)return!1;if(n=e.length,n!==t.length)return!1;for(;n--;)if(e[n]!==t[n])return!1;return!0}var i=window.kendo,r=i.ui,o=r.List,a=i.keys,s=i._activeElement,l=i.data.ObservableArray,c=e.proxy,u="id",d="li",h="accept",f="filter",p="rebind",g="open",m="close",v="change",_="progress",y="select",b="aria-disabled",w="aria-readonly",x="k-state-focused",k="k-loading-hidden",C="k-state-hover",S="k-state-disabled",T="disabled",A="readonly",D=".kendoMultiSelect",M="click"+D,E="keydown"+D,P="mouseenter"+D,I="mouseleave"+D,z=P+" "+I,R=/"/g,F=e.isArray,B=["font-family","font-size","font-stretch","font-style","font-weight","letter-spacing","text-transform","line-height"],L=o.extend({init:function(t,n){var r,a,s=this;s.ns=D,o.fn.init.call(s,t,n),s._optionsMap={},s._customOptions={},s._wrapper(),s._tagList(),s._input(),s._textContainer(),s._loader(),s._tabindex(s.input),t=s.element.attr("multiple","multiple").hide(),n=s.options,n.placeholder||(n.placeholder=t.data("placeholder")),r=t.attr(u),r&&(s._tagID=r+"_tag_active",r+="_taglist",s.tagList.attr(u,r)),s._aria(r),s._dataSource(),s._ignoreCase(),s._popup(),s._tagTemplate(),s._initList(),s._reset(),s._enable(),s._placeholder(),n.autoBind?s.dataSource.fetch():n.value&&s._preselect(n.value),a=e(s.element).parents("fieldset").is(":disabled"),a&&s.enable(!1),i.notify(s)},_preselect:function(t,n){var r=this;F(t)||t instanceof i.data.ObservableArray||(t=[t]),(e.isPlainObject(t[0])||t[0]instanceof i.data.ObservableObject||!r.options.dataValueField)&&(r.dataSource.data(t),r.value(n||r._initialValues),r._retrieveData=!0)},options:{name:"MultiSelect",tagMode:"multiple",enabled:!0,autoBind:!0,autoClose:!0,highlightFirst:!0,dataTextField:"",dataValueField:"",filter:"startswith",ignoreCase:!0,minLength:0,delay:100,value:null,maxSelectedItems:null,placeholder:"",height:200,animation:{},virtual:!1,itemTemplate:"",tagTemplate:"",groupTemplate:"#:data#",fixedGroupTemplate:"#:data#"},events:[g,m,v,y,"filtering","dataBinding","dataBound"],setDataSource:function(e){this.options.dataSource=e,this._dataSource(),this.listView.setDataSource(this.dataSource),this.options.autoBind&&this.dataSource.fetch()},setOptions:function(e){var t=this._listOptions(e);o.fn.setOptions.call(this,e),this._normalizeOptions(t),this.listView.setOptions(t),this._accessors(),this._aria(this.tagList.attr(u)),this._tagTemplate()},currentTag:function(e){var n=this;return e===t?n._currentTag:(n._currentTag&&(n._currentTag.removeClass(x).removeAttr(u),n.input.removeAttr("aria-activedescendant")),e&&(e.addClass(x).attr(u,n._tagID),n.input.attr("aria-activedescendant",n._tagID)),n._currentTag=e,t)},dataItems:function(){return this.listView.selectedDataItems()},destroy:function(){var e=this,t=e.ns;clearTimeout(e._busy),clearTimeout(e._typingTimeout),e.wrapper.off(t),e.tagList.off(t),e.input.off(t),o.fn.destroy.call(e)},_activateItem:function(){o.fn._activateItem.call(this),this.currentTag(null)},_normalizeOptions:function(e){var t=this.options.itemTemplate||this.options.template,n=e.itemTemplate||t||e.template;n||(n="#:"+i.expr(e.dataTextField,"data")+"#"),e.template=n},_initList:function(){var t=this,n=t.options.virtual,r=!!n,o=c(t._listBound,t),a={autoBind:!1,selectable:"multiple",dataSource:t.dataSource,click:c(t._click,t),change:c(t._listChange,t),activate:c(t._activateItem,t),deactivate:c(t._deactivateItem,t),dataBinding:function(){t.trigger("dataBinding"),t._angularItems("cleanup")},dataBound:o,listBound:o,selectedItemChange:c(t._selectedItemChange,t)};a=e.extend(t._listOptions(),a,"object"==typeof n?n:{}),t._normalizeOptions(a),t.listView=r?new i.ui.VirtualList(t.ul,a):new i.ui.StaticList(t.ul,a),t.listView.bind("click",function(e){e.preventDefault()}),t.listView.value(t._initialValues||t.options.value)},_listChange:function(e){this._state===p&&(this._state="",e.added=[]),this._selectValue(e.added,e.removed)},_selectedItemChange:function(e){var t,n,i=e.items;for(n=0;i.length>n;n++)t=i[n],this.tagList.children().eq(t.index).children("span:first").html(this.tagTextTemplate(t.item))},_wrapperMousedown:function(t){var n=this,r="input"!==t.target.nodeName.toLowerCase(),o=e(t.target),a=o.hasClass("k-select")||o.hasClass("k-icon");a&&(a=!o.closest(".k-select").children(".k-i-arrow-s").length),!r||a&&i.support.mobileOS||t.preventDefault(),a||(n.input[0]!==s()&&r&&n.input.focus(),0===n.options.minLength&&n.open())},_inputFocus:function(){this._placeholder(!1),this.wrapper.addClass(x)},_inputFocusout:function(){var e=this;clearTimeout(e._typingTimeout),e.wrapper.removeClass(x),e._placeholder(!e.listView.selectedDataItems()[0],!0),e.close(),e._state===f&&(e._state=h,e.listView.filter(!1),e.listView.skipUpdate(!0)),e.element.blur()},_removeTag:function(e){var n,i=this,r=i._state,o=e.index(),a=i.listView,s=a.value()[o],l=i._customOptions[s];l!==t||r!==h&&r!==f||(l=i._optionsMap[s]),l!==t?(n=i.element[0].children[l],n.removeAttribute("selected"),n.selected=!1,a.removeAt(o),e.remove()):a.select(a.select()[o]),i.currentTag(null),i._change(),i._close()},_tagListClick:function(t){var n=e(t.currentTarget);n.children(".k-i-arrow-s").length||this._removeTag(n.closest(d))},_editable:function(t){var n=this,i=t.disable,r=t.readonly,o=n.wrapper.off(D),a=n.tagList.off(D),s=n.element.add(n.input.off(D));r||i?(i?o.addClass(S):o.removeClass(S),s.attr(T,i).attr(A,r).attr(b,i).attr(w,r)):(o.removeClass(S).on(z,n._toggleHover).on("mousedown"+D+" touchend"+D,c(n._wrapperMousedown,n)),n.input.on(E,c(n._keydown,n)).on("paste"+D,c(n._search,n)).on("focus"+D,c(n._inputFocus,n)).on("focusout"+D,c(n._inputFocusout,n)),s.removeAttr(T).removeAttr(A).attr(b,!1).attr(w,!1),a.on(P,d,function(){e(this).addClass(C)}).on(I,d,function(){e(this).removeClass(C)}).on(M,"li.k-button .k-select",c(n._tagListClick,n)))},_close:function(){var e=this;e.options.autoClose?e.close():e.popup.position()},_filterSource:function(e,t){t||(t=this._retrieveData),this._retrieveData=!1,o.fn._filterSource.call(this,e,t)},close:function(){this.popup.close()},open:function(){var e=this;e._request&&(e._retrieveData=!1),e._retrieveData||!e.listView.isBound()||e._state===h?(e._open=!0,e._state=p,e.listView.filter(!1),e.listView.skipUpdate(!0),e._filterSource()):e._allowSelection()&&(e.popup.open(),e._focusItem())},toggle:function(e){e=e!==t?e:!this.popup.visible(),this[e?g:m]()},refresh:function(){this.listView.refresh()},_listBound:function(){var e=this,n=e.dataSource.flatView(),i=e.dataSource.page(),r=n.length;e._angularItems("compile"),e._render(n),e._calculateGroupPadding(e._height(r)),e._open&&(e._open=!1,e.toggle(r)),e.popup.position(),!e.options.highlightFirst||i!==t&&1!==i||e.listView.focusFirst(),e._touchScroller&&e._touchScroller.reset(),e._hideBusy(),e._makeUnselectable(),e.trigger("dataBound")},search:function(e){var t,n,i=this,r=i.options,o=r.ignoreCase,a=r.filter,s=r.dataTextField,l=i.input.val();r.placeholder===l&&(l=""),clearTimeout(i._typingTimeout),e="string"==typeof e?e:l,n=e.length,(!n||n>=r.minLength)&&(i.listView.filter(!0),i._state=f,i._open=!0,t={value:o?e.toLowerCase():e,field:s,operator:a,ignoreCase:o},i._filterSource(t))},value:function(e){var n=this,i=n.listView.value().slice(),r=n.options.maxSelectedItems;return e===t?i:(e=n._normalizeValues(e),null!==r&&e.length>r&&(e=e.slice(0,r)),n.listView.value(e),n._old=e,n._fetchData(),t)},_setOption:function(e,t){var n=this.element[0].children[this._optionsMap[e]];n&&(t?n.setAttribute("selected","selected"):n.removeAttribute("selected"),n.selected=t)},_fetchData:function(){var e=this,t=!!e.dataSource.view().length,n=0===e.listView.value().length;n||e._request||(e._retrieveData||!e._fetch&&!t)&&(e._fetch=!0,e._retrieveData=!1,e.dataSource.read().done(function(){e._fetch=!1}))},_dataSource:function(){var e=this,t=e.element,n=e.options,r=n.dataSource||{};r=F(r)?{data:r}:r,r.select=t,r.fields=[{field:n.dataTextField},{field:n.dataValueField}],e.dataSource&&e._refreshHandler?e._unbindDataSource():e._progressHandler=c(e._showBusy,e),e.dataSource=i.data.DataSource.create(r).bind(_,e._progressHandler)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){setTimeout(function(){t.value(t._initialValues),t._placeholder()})},t._form=r.on("reset",t._resetHandler))},_initValue:function(){var e=this.options.value||this.element.val();this._old=this._initialValues=this._normalizeValues(e)},_normalizeValues:function(t){var n=this;return null===t?t=[]:t&&e.isPlainObject(t)?t=[n._value(t)]:t&&e.isPlainObject(t[0])?t=e.map(t,function(e){return n._value(e)}):F(t)||t instanceof l||(t=[t]),t},_change:function(){var e=this,t=e.value();n(t,e._old)||(e._old=t.slice(),e.trigger(v),e.element.trigger(v))},_click:function(e){var n=e.item;return this.trigger(y,{item:n})?(this._close(),t):(this._select(n),this._change(),this._close(),t)},_keydown:function(n){var r=this,o=n.keyCode,s=r._currentTag,l=r.listView.focus(),c=r.input.val(),u=i.support.isRtl(r.wrapper),d=r.popup.visible();if(o===a.DOWN){if(n.preventDefault(),!d)return r.open(),l||this.listView.focusFirst(),t;l?(this.listView.focusNext(),this.listView.focus()||this.listView.focusLast()):this.listView.focusFirst()}else if(o===a.UP)d&&(l&&this.listView.focusPrev(),this.listView.focus()||r.close()),n.preventDefault();else if(o===a.LEFT&&!u||o===a.RIGHT&&u)c||(s=s?s.prev():e(r.tagList[0].lastChild),s[0]&&r.currentTag(s));else if(o===a.RIGHT&&!u||o===a.LEFT&&u)!c&&s&&(s=s.next(),r.currentTag(s[0]?s:null));else if(o===a.ENTER&&d){if(l){if(r.trigger(y,{item:l}))return r._close(),t;r._select(l)}r._change(),r._close(),n.preventDefault()}else o===a.ESC?(d?n.preventDefault():r.currentTag(null),r.close()):o===a.HOME?d?this.listView.focusFirst():c||(s=r.tagList[0].firstChild,s&&r.currentTag(e(s))):o===a.END?d?this.listView.focusLast():c||(s=r.tagList[0].lastChild,s&&r.currentTag(e(s))):o!==a.DELETE&&o!==a.BACKSPACE||c?(clearTimeout(r._typingTimeout),setTimeout(function(){r._scale()}),r._search()):(o!==a.BACKSPACE||s||(s=e(r.tagList[0].lastChild)),s&&s[0]&&r._removeTag(s))},_hideBusy:function(){var e=this;clearTimeout(e._busy),e.input.attr("aria-busy",!1),e._loading.addClass(k),e._request=!1,e._busy=null},_showBusyHandler:function(){this.input.attr("aria-busy",!0),this._loading.removeClass(k)},_showBusy:function(){var e=this;e._request=!0,e._busy||(e._busy=setTimeout(c(e._showBusyHandler,e),100))},_placeholder:function(e,n){var r=this,o=r.input,a=s();e===t&&(e=!1,o[0]!==a&&(e=!r.listView.selectedDataItems()[0])),r._prev="",o.toggleClass("k-readonly",e).val(e?r.options.placeholder:""),o[0]!==a||n||i.caret(o[0],0,0),r._scale()},_scale:function(){var e,t=this,n=t.wrapper,i=n.width(),r=t._span.text(t.input.val());n.is(":visible")?e=r.width()+25:(r.appendTo(document.documentElement),i=e=r.width()+25,r.appendTo(n)),t.input.width(e>i?i:e)},_option:function(e,n,r){var o="<option";return e!==t&&(e+="",-1!==e.indexOf('"')&&(e=e.replace(R,"&quot;")),o+=' value="'+e+'"'),r&&(o+=" selected"),o+=">",n!==t&&(o+=i.htmlEncode(n)),o+="</option>"},_render:function(e){var t,n,i,r,o,a,s=this.listView.selectedDataItems(),l=this.listView.value(),c=e.length,u="";for(l.length!==s.length&&(s=this._buildSelectedItems(l)),o={},a={},r=0;c>r;r++)n=e[r],i=this._value(n),t=this._selectedItemIndex(i,s),-1!==t&&s.splice(t,1),a[i]=r,u+=this._option(i,this._text(n),-1!==t);if(s.length)for(r=0;s.length>r;r++)n=s[r],i=this._value(n),o[i]=c,a[i]=c,c+=1,u+=this._option(i,this._text(n),!0);this._customOptions=o,this._optionsMap=a,this.element.html(u)},_buildSelectedItems:function(e){var t,n,i=this.options.dataValueField,r=this.options.dataTextField,o=[];for(n=0;e.length>n;n++)t={},t[i]=e[n],t[r]=e[n],o.push(t);return o},_selectedItemIndex:function(e,t){for(var n=this._value,i=0;t.length>i;i++)if(e===n(t[i]))return i;return-1},_search:function(){var e=this;e._typingTimeout=setTimeout(function(){var t=e.input.val();e._prev!==t&&(e._prev=t,e.search(t))},e.options.delay)},_allowSelection:function(){var e=this.options.maxSelectedItems;return null===e||e>this.listView.value().length},_angularTagItems:function(t){var n=this;n.angular(t,function(){return{elements:n.tagList[0].children,data:e.map(n.dataItems(),function(e){return{dataItem:e}})}})},_selectValue:function(e,t){var n,i,r,o=this,a=o.value(),s=o.dataSource.total(),l=o.tagList,c=o._value;if(o._angularTagItems("cleanup"),"multiple"===o.options.tagMode){for(r=t.length-1;r>-1;r--)n=t[r],l[0].removeChild(l[0].children[n.position]),o._setOption(c(n.dataItem),!1);for(r=0;e.length>r;r++)i=e[r],l.append(o.tagTemplate(i.dataItem)),o._setOption(c(i.dataItem),!0)}else{for((!o._maxTotal||s>o._maxTotal)&&(o._maxTotal=s),l.html(""),a.length&&l.append(o.tagTemplate({values:a,dataItems:o.dataItems(),maxTotal:o._maxTotal,currentTotal:s})),r=t.length-1;r>-1;r--)o._setOption(c(t[r].dataItem),!1);for(r=0;e.length>r;r++)o._setOption(c(e[r].dataItem),!0)}o._angularTagItems("compile"),o._placeholder()},_select:function(e){var t=this;t._state===p&&(t._state=""),t._allowSelection()&&(this.listView.select(e),t._placeholder(),t._state===f&&(t._state=h,t.listView.filter(!1),t.listView.skipUpdate(!0)))},_input:function(){var t=this,n=t.element[0].accessKey,i=t._innerWrapper.children("input.k-input");i[0]||(i=e('<input class="k-input" style="width: 25px" />').appendTo(t._innerWrapper)),t.element.removeAttr("accesskey"),t._focused=t.input=i.attr({accesskey:n,autocomplete:"off",role:"listbox","aria-expanded":!1})},_tagList:function(){var t=this,n=t._innerWrapper.children("ul");n[0]||(n=e('<ul role="listbox" unselectable="on" class="k-reset"/>').appendTo(t._innerWrapper)),t.tagList=n},_tagTemplate:function(){var e,t=this,n=t.options,r=n.tagTemplate,o=n.dataSource,a="multiple"===n.tagMode;t.element[0].length&&!o&&(n.dataTextField=n.dataTextField||"text",n.dataValueField=n.dataValueField||"value"),e=a?i.template("#:"+i.expr(n.dataTextField,"data")+"#",{useWithBlock:!1}):i.template("#:values.length# item(s) selected"),t.tagTextTemplate=r=r?i.template(r):e,t.tagTemplate=function(e){return'<li class="k-button" unselectable="on"><span unselectable="on">'+r(e)+'</span><span unselectable="on" class="k-select"><span unselectable="on" class="k-icon '+(a?"k-i-close":"k-i-arrow-s")+'">'+(a?"delete":"open")+"</span></span></li>"}},_loader:function(){this._loading=e('<span class="k-icon k-loading '+k+'"></span>').insertAfter(this.input)},_textContainer:function(){var t=i.getComputedStyles(this.input[0],B);t.position="absolute",t.visibility="hidden",t.top=-3333,t.left=-3333,this._span=e("<span/>").css(t).appendTo(this.wrapper)},_wrapper:function(){var t=this,n=t.element,i=n.parent("span.k-multiselect");i[0]||(i=n.wrap('<div class="k-widget k-multiselect k-header" unselectable="on" />').parent(),i[0].style.cssText=n[0].style.cssText,i[0].title=n[0].title,e('<div class="k-multiselect-wrap k-floatwrap" unselectable="on" />').insertBefore(n)),t.wrapper=i.addClass(n[0].className).css("display",""),t._innerWrapper=e(i[0].firstChild)}});r.plugin(L)}(window.kendo.jQuery)}(),function(){!function(e,t,n){function i(e,r){var a,u;if(null==e||"none"==e)return null;if(e instanceof s)return e;if(e=e.toLowerCase(),a=o.exec(e))return e="transparent"==a[1]?new l(1,1,1,0):i(d.namedColors[a[1]],r),e.match=[a[1]],e;if((a=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})\b/i.exec(e))?u=new c(n(a[1],16),n(a[2],16),n(a[3],16),1):(a=/^#?([0-9a-f])([0-9a-f])([0-9a-f])\b/i.exec(e))?u=new c(n(a[1]+a[1],16),n(a[2]+a[2],16),n(a[3]+a[3],16),1):(a=/^rgb\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*\)/.exec(e))?u=new c(n(a[1],10),n(a[2],10),n(a[3],10),1):(a=/^rgba\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9.]+)\s*\)/.exec(e))?u=new c(n(a[1],10),n(a[2],10),n(a[3],10),t(a[4])):(a=/^rgb\(\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9]*\.?[0-9]+)%\s*\)/.exec(e))?u=new l(t(a[1])/100,t(a[2])/100,t(a[3])/100,1):(a=/^rgba\(\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9]*\.?[0-9]+)%\s*,\s*([0-9.]+)\s*\)/.exec(e))&&(u=new l(t(a[1])/100,t(a[2])/100,t(a[3])/100,t(a[4]))),u)u.match=a;else if(!r)throw Error("Cannot parse color: "+e);return u}function r(e,t,n){for(n||(n="0"),e=e.toString(16);t>e.length;)e="0"+e;return e}var o,a,s,l,c,u,d=function(e){var t,n,i,r,o,a=this,s=d.formats;if(1===arguments.length)for(e=a.resolveColor(e),r=0;s.length>r;r++)t=s[r].re,n=s[r].process,i=t.exec(e),i&&(o=n(i),a.r=o[0],a.g=o[1],a.b=o[2]);else a.r=arguments[0],a.g=arguments[1],a.b=arguments[2];a.r=a.normalizeByte(a.r),a.g=a.normalizeByte(a.g),a.b=a.normalizeByte(a.b)};d.prototype={toHex:function(){var e=this,t=e.padDigit,n=e.r.toString(16),i=e.g.toString(16),r=e.b.toString(16);return"#"+t(n)+t(i)+t(r)},resolveColor:function(e){return e=e||"black","#"==e.charAt(0)&&(e=e.substr(1,6)),e=e.replace(/ /g,""),e=e.toLowerCase(),e=d.namedColors[e]||e},normalizeByte:function(e){return 0>e||isNaN(e)?0:e>255?255:e},padDigit:function(e){return 1===e.length?"0"+e:e},brightness:function(e){var t=this,n=Math.round;return t.r=n(t.normalizeByte(t.r*e)),t.g=n(t.normalizeByte(t.g*e)),t.b=n(t.normalizeByte(t.b*e)),t},percBrightness:function(){var e=this;return Math.sqrt(.241*e.r*e.r+.691*e.g*e.g+.068*e.b*e.b)}},d.formats=[{re:/^rgb\((\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\)$/,
process:function(e){return[n(e[1],10),n(e[2],10),n(e[3],10)]}},{re:/^(\w{2})(\w{2})(\w{2})$/,process:function(e){return[n(e[1],16),n(e[2],16),n(e[3],16)]}},{re:/^(\w{1})(\w{1})(\w{1})$/,process:function(e){return[n(e[1]+e[1],16),n(e[2]+e[2],16),n(e[3]+e[3],16)]}}],d.namedColors={aliceblue:"f0f8ff",antiquewhite:"faebd7",aqua:"00ffff",aquamarine:"7fffd4",azure:"f0ffff",beige:"f5f5dc",bisque:"ffe4c4",black:"000000",blanchedalmond:"ffebcd",blue:"0000ff",blueviolet:"8a2be2",brown:"a52a2a",burlywood:"deb887",cadetblue:"5f9ea0",chartreuse:"7fff00",chocolate:"d2691e",coral:"ff7f50",cornflowerblue:"6495ed",cornsilk:"fff8dc",crimson:"dc143c",cyan:"00ffff",darkblue:"00008b",darkcyan:"008b8b",darkgoldenrod:"b8860b",darkgray:"a9a9a9",darkgrey:"a9a9a9",darkgreen:"006400",darkkhaki:"bdb76b",darkmagenta:"8b008b",darkolivegreen:"556b2f",darkorange:"ff8c00",darkorchid:"9932cc",darkred:"8b0000",darksalmon:"e9967a",darkseagreen:"8fbc8f",darkslateblue:"483d8b",darkslategray:"2f4f4f",darkslategrey:"2f4f4f",darkturquoise:"00ced1",darkviolet:"9400d3",deeppink:"ff1493",deepskyblue:"00bfff",dimgray:"696969",dimgrey:"696969",dodgerblue:"1e90ff",firebrick:"b22222",floralwhite:"fffaf0",forestgreen:"228b22",fuchsia:"ff00ff",gainsboro:"dcdcdc",ghostwhite:"f8f8ff",gold:"ffd700",goldenrod:"daa520",gray:"808080",grey:"808080",green:"008000",greenyellow:"adff2f",honeydew:"f0fff0",hotpink:"ff69b4",indianred:"cd5c5c",indigo:"4b0082",ivory:"fffff0",khaki:"f0e68c",lavender:"e6e6fa",lavenderblush:"fff0f5",lawngreen:"7cfc00",lemonchiffon:"fffacd",lightblue:"add8e6",lightcoral:"f08080",lightcyan:"e0ffff",lightgoldenrodyellow:"fafad2",lightgray:"d3d3d3",lightgrey:"d3d3d3",lightgreen:"90ee90",lightpink:"ffb6c1",lightsalmon:"ffa07a",lightseagreen:"20b2aa",lightskyblue:"87cefa",lightslategray:"778899",lightslategrey:"778899",lightsteelblue:"b0c4de",lightyellow:"ffffe0",lime:"00ff00",limegreen:"32cd32",linen:"faf0e6",magenta:"ff00ff",maroon:"800000",mediumaquamarine:"66cdaa",mediumblue:"0000cd",mediumorchid:"ba55d3",mediumpurple:"9370d8",mediumseagreen:"3cb371",mediumslateblue:"7b68ee",mediumspringgreen:"00fa9a",mediumturquoise:"48d1cc",mediumvioletred:"c71585",midnightblue:"191970",mintcream:"f5fffa",mistyrose:"ffe4e1",moccasin:"ffe4b5",navajowhite:"ffdead",navy:"000080",oldlace:"fdf5e6",olive:"808000",olivedrab:"6b8e23",orange:"ffa500",orangered:"ff4500",orchid:"da70d6",palegoldenrod:"eee8aa",palegreen:"98fb98",paleturquoise:"afeeee",palevioletred:"d87093",papayawhip:"ffefd5",peachpuff:"ffdab9",peru:"cd853f",pink:"ffc0cb",plum:"dda0dd",powderblue:"b0e0e6",purple:"800080",red:"ff0000",rosybrown:"bc8f8f",royalblue:"4169e1",saddlebrown:"8b4513",salmon:"fa8072",sandybrown:"f4a460",seagreen:"2e8b57",seashell:"fff5ee",sienna:"a0522d",silver:"c0c0c0",skyblue:"87ceeb",slateblue:"6a5acd",slategray:"708090",slategrey:"708090",snow:"fffafa",springgreen:"00ff7f",steelblue:"4682b4",tan:"d2b48c",teal:"008080",thistle:"d8bfd8",tomato:"ff6347",turquoise:"40e0d0",violet:"ee82ee",wheat:"f5deb3",white:"ffffff",whitesmoke:"f5f5f5",yellow:"ffff00",yellowgreen:"9acd32"},o=["transparent"];for(a in d.namedColors)d.namedColors.hasOwnProperty(a)&&o.push(a);o=RegExp("^("+o.join("|")+")(\\W|$)","i"),s=kendo.Class.extend({toHSV:function(){return this},toRGB:function(){return this},toHex:function(){return this.toBytes().toHex()},toBytes:function(){return this},toCss:function(){return"#"+this.toHex()},toCssRgba:function(){var e=this.toBytes();return"rgba("+e.r+", "+e.g+", "+e.b+", "+t((+this.a).toFixed(3))+")"},toDisplay:function(){return kendo.support.browser.msie&&kendo.support.browser.version<9?this.toCss():this.toCssRgba()},equals:function(e){return e===this||null!==e&&this.toCssRgba()==i(e).toCssRgba()},diff:function(e){if(null==e)return NaN;var t=this.toBytes();return e=e.toBytes(),Math.sqrt(Math.pow(.3*(t.r-e.r),2)+Math.pow(.59*(t.g-e.g),2)+Math.pow(.11*(t.b-e.b),2))},clone:function(){var e=this.toBytes();return e===this&&(e=new c(e.r,e.g,e.b,e.a)),e}}),l=s.extend({init:function(e,t,n,i){this.r=e,this.g=t,this.b=n,this.a=i},toHSV:function(){var e,t,n=this.r,i=this.g,r=this.b,o=Math.min(n,i,r),a=Math.max(n,i,r),s=a,l=a-o;return 0===l?new u(0,0,s,this.a):(0!==a?(t=l/a,e=n==a?(i-r)/l:i==a?2+(r-n)/l:4+(n-i)/l,e*=60,0>e&&(e+=360)):(t=0,e=-1),new u(e,t,s,this.a))},toBytes:function(){return new c(255*this.r,255*this.g,255*this.b,this.a)}}),c=l.extend({init:function(e,t,n,i){this.r=Math.round(e),this.g=Math.round(t),this.b=Math.round(n),this.a=i},toRGB:function(){return new l(this.r/255,this.g/255,this.b/255,this.a)},toHSV:function(){return this.toRGB().toHSV()},toHex:function(){return r(this.r,2)+r(this.g,2)+r(this.b,2)},toBytes:function(){return this}}),u=s.extend({init:function(e,t,n,i){this.h=e,this.s=t,this.v=n,this.a=i},toRGB:function(){var e,t,n,i,r,o,a,s,c=this.h,u=this.s,d=this.v;if(0===u)t=n=i=d;else switch(c/=60,e=Math.floor(c),r=c-e,o=d*(1-u),a=d*(1-u*r),s=d*(1-u*(1-r)),e){case 0:t=d,n=s,i=o;break;case 1:t=a,n=d,i=o;break;case 2:t=o,n=d,i=s;break;case 3:t=o,n=a,i=d;break;case 4:t=s,n=o,i=d;break;default:t=d,n=o,i=a}return new l(t,n,i,this.a)},toBytes:function(){return this.toRGB().toBytes()}}),d.fromBytes=function(e,t,n,i){return new c(e,t,n,null!=i?i:1)},d.fromRGB=function(e,t,n,i){return new l(e,t,n,null!=i?i:1)},d.fromHSV=function(e,t,n,i){return new u(e,t,n,null!=i?i:1)},kendo.Color=d,kendo.parseColor=i}(window.kendo.jQuery,parseFloat,parseInt)}(),function(){!function(e,t){function n(e,t,n){var i=n?" k-slider-horizontal":" k-slider-vertical",r=e.style?e.style:t.attr("style"),o=t.attr("class")?" "+t.attr("class"):"",a="";return"bottomRight"==e.tickPlacement?a=" k-slider-bottomright":"topLeft"==e.tickPlacement&&(a=" k-slider-topleft"),r=r?" style='"+r+"'":"","<div class='k-widget k-slider"+i+o+"'"+r+"><div class='k-slider-wrap"+(e.showButtons?" k-slider-buttons":"")+a+"'></div></div>"}function i(e,t,n){var i="";return i="increase"==t?n?"k-i-arrow-e":"k-i-arrow-n":n?"k-i-arrow-w":"k-i-arrow-s","<a class='k-button k-button-"+t+"'><span class='k-icon "+i+"' title='"+e[t+"ButtonTitle"]+"'>"+e[t+"ButtonTitle"]+"</span></a>"}function r(e,t){var n,i="<ul class='k-reset k-slider-items'>",r=k.floor(u(t/e.smallStep))+1;for(n=0;r>n;n++)i+="<li class='k-tick' role='presentation'>&nbsp;</li>";return i+="</ul>"}function o(e,t){var n=t.is("input")?1:2,i=2==n?e.leftDragHandleTitle:e.dragHandleTitle;return"<div class='k-slider-track'><div class='k-slider-selection'><!-- --></div><a href='#' class='k-draghandle' title='"+i+"' role='slider' aria-valuemin='"+e.min+"' aria-valuemax='"+e.max+"' aria-valuenow='"+(n>1?e.selectionStart||e.min:e.value||e.min)+"'>Drag</a>"+(n>1?"<a href='#' class='k-draghandle' title='"+e.rightDragHandleTitle+"'role='slider' aria-valuemin='"+e.min+"' aria-valuemax='"+e.max+"' aria-valuenow='"+(e.selectionEnd||e.max)+"'>Drag</a>":"")+"</div>"}function a(e){return function(t){return t+e}}function s(e){return function(){return e}}function l(e){return(e+"").replace(".",g.cultures.current.numberFormat["."])}function c(e){var t=""+e,n=0;return t=t.split("."),t[1]&&(n=t[1].length),n=n>10?10:n}function u(e){var t,n;return e=parseFloat(e,10),t=c(e),n=k.pow(10,t||0),k.round(e*n)/n}function d(e,n){var i=b(e.getAttribute(n));return null===i&&(i=t),i}function h(e){return typeof e!==Y}function f(e){return 1e4*e}var p,g=window.kendo,m=g.ui.Widget,v=g.ui.Draggable,_=e.extend,y=g.format,b=g.parseFloat,w=e.proxy,x=e.isArray,k=Math,C=g.support,S=C.pointers,T=C.msPointers,A="change",D="slide",M=".slider",E="touchstart"+M+" mousedown"+M,P=S?"pointerdown"+M:T?"MSPointerDown"+M:E,I="touchend"+M+" mouseup"+M,z=S?"pointerup":T?"MSPointerUp"+M:I,R="moveSelection",F="keydown"+M,B="click"+M,L="mouseover"+M,O="focus"+M,H="blur"+M,N=".k-draghandle",V=".k-slider-track",U=".k-tick",W="k-state-selected",j="k-state-focused",G="k-state-default",q="k-state-disabled",$="disabled",Y="undefined",K="tabindex",Q=g.getTouches,X=m.extend({init:function(e,t){var n,i=this;if(m.fn.init.call(i,e,t),t=i.options,i._distance=u(t.max-t.min),i._isHorizontal="horizontal"==t.orientation,i._isRtl=i._isHorizontal&&g.support.isRtl(e),i._position=i._isHorizontal?"left":"bottom",i._sizeFn=i._isHorizontal?"width":"height",i._outerSize=i._isHorizontal?"outerWidth":"outerHeight",t.tooltip.format=t.tooltip.enabled?t.tooltip.format||"{0}":"{0}",0>=t.smallStep)throw Error("Kendo UI Slider smallStep must be a positive number.");i._createHtml(),i.wrapper=i.element.closest(".k-slider"),i._trackDiv=i.wrapper.find(V),i._setTrackDivWidth(),i._maxSelection=i._trackDiv[i._sizeFn](),i._sliderItemsInit(),i._reset(),i._tabindex(i.wrapper.find(N)),i[t.enabled?"enable":"disable"](),n=g.support.isRtl(i.wrapper)?-1:1,i._keyMap={37:a(-1*n*t.smallStep),40:a(-t.smallStep),39:a(1*n*t.smallStep),38:a(+t.smallStep),35:s(t.max),36:s(t.min),33:a(+t.largeStep),34:a(-t.largeStep)},g.notify(i)},events:[A,D],options:{enabled:!0,min:0,max:10,smallStep:1,largeStep:5,orientation:"horizontal",tickPlacement:"both",tooltip:{enabled:!0,format:"{0}"}},_resize:function(){this._setTrackDivWidth(),this.wrapper.find(".k-slider-items").remove(),this._maxSelection=this._trackDiv[this._sizeFn](),this._sliderItemsInit(),this._refresh(),this.options.enabled&&this.enable(!0)},_sliderItemsInit:function(){var e=this,t=e.options,n=e._maxSelection/((t.max-t.min)/t.smallStep),i=e._calculateItemsWidth(k.floor(e._distance/t.smallStep));"none"!=t.tickPlacement&&n>=2&&(e._trackDiv.before(r(t,e._distance)),e._setItemsWidth(i),e._setItemsTitle()),e._calculateSteps(i),"none"!=t.tickPlacement&&n>=2&&t.largeStep>=t.smallStep&&e._setItemsLargeTick()},getSize:function(){return g.dimensions(this.wrapper)},_setTrackDivWidth:function(){var e=this,t=2*parseFloat(e._trackDiv.css(e._isRtl?"right":e._position),10);e._trackDiv[e._sizeFn](e.wrapper[e._sizeFn]()-2-t)},_setItemsWidth:function(t){var n,i=this,r=i.options,o=0,a=t.length-1,s=i.wrapper.find(U),l=0,c=2,u=s.length,d=0;for(n=0;u-2>n;n++)e(s[n+1])[i._sizeFn](t[n]);if(i._isHorizontal?(e(s[o]).addClass("k-first")[i._sizeFn](t[a-1]),e(s[a]).addClass("k-last")[i._sizeFn](t[a])):(e(s[a]).addClass("k-first")[i._sizeFn](t[a]),e(s[o]).addClass("k-last")[i._sizeFn](t[a-1])),i._distance%r.smallStep!==0&&!i._isHorizontal){for(n=0;t.length>n;n++)d+=t[n];l=i._maxSelection-d,l+=parseFloat(i._trackDiv.css(i._position),10)+c,i.wrapper.find(".k-slider-items").css("padding-top",l)}},_setItemsTitle:function(){for(var t=this,n=t.options,i=t.wrapper.find(U),r=n.min,o=i.length,a=t._isHorizontal&&!t._isRtl?0:o-1,s=t._isHorizontal&&!t._isRtl?o:-1,l=t._isHorizontal&&!t._isRtl?1:-1;a-s!==0;a+=l)e(i[a]).attr("title",y(n.tooltip.format,u(r))),r+=n.smallStep},_setItemsLargeTick:function(){var t,n,i,r=this,o=r.options,a=r.wrapper.find(U),s=0;if(f(o.largeStep)%f(o.smallStep)===0||r._distance/o.largeStep>=3)for(r._isHorizontal||r._isRtl||(a=e.makeArray(a).reverse()),s=0;a.length>s;s++)t=e(a[s]),n=r._values[s],i=u(f(n-this.options.min)),i%f(o.smallStep)===0&&i%f(o.largeStep)===0&&(t.addClass("k-tick-large").html("<span class='k-label'>"+t.attr("title")+"</span>"),0!==s&&s!==a.length-1&&t.css("line-height",t[r._sizeFn]()+"px"))},_calculateItemsWidth:function(e){var t,n,i,r=this,o=r.options,a=parseFloat(r._trackDiv.css(r._sizeFn))+1,s=a/r._distance;for(r._distance/o.smallStep-k.floor(r._distance/o.smallStep)>0&&(a-=r._distance%o.smallStep*s),t=a/e,n=[],i=0;e-1>i;i++)n[i]=t;return n[e-1]=n[e]=t/2,r._roundWidths(n)},_roundWidths:function(e){var t,n=0,i=e.length;for(t=0;i>t;t++)n+=e[t]-k.floor(e[t]),e[t]=k.floor(e[t]);return n=k.round(n),this._addAdditionalSize(n,e)},_addAdditionalSize:function(e,t){if(0===e)return t;var n,i=parseFloat(t.length-1)/parseFloat(1==e?e:e-1);for(n=0;e>n;n++)t[parseInt(k.round(i*n),10)]+=1;return t},_calculateSteps:function(e){var t,n=this,i=n.options,r=i.min,o=0,a=k.ceil(n._distance/i.smallStep),s=1;if(a+=n._distance/i.smallStep%1===0?1:0,e.splice(0,0,2*e[a-2]),e.splice(a-1,1,2*e.pop()),n._pixelSteps=[o],n._values=[r],0!==a){for(;a>s;)o+=(e[s-1]+e[s])/2,n._pixelSteps[s]=o,r+=i.smallStep,n._values[s]=u(r),s++;t=n._distance%i.smallStep===0?a-1:a,n._pixelSteps[t]=n._maxSelection,n._values[t]=i.max,n._isRtl&&(n._pixelSteps.reverse(),n._values.reverse())}},_getValueFromPosition:function(e,t){var n,i=this,r=i.options,o=k.max(r.smallStep*(i._maxSelection/i._distance),0),a=0,s=o/2;if(i._isHorizontal?(a=e-t.startPoint,i._isRtl&&(a=i._maxSelection-a)):a=t.startPoint-e,i._maxSelection-(parseInt(i._maxSelection%o,10)-3)/2<a)return r.max;for(n=0;i._pixelSteps.length>n;n++)if(k.abs(i._pixelSteps[n]-a)-1<=s)return u(i._values[n])},_getFormattedValue:function(e,t){var n,i,r,o=this,a="",s=o.options.tooltip;return x(e)?(i=e[0],r=e[1]):t&&t.type&&(i=t.selectionStart,r=t.selectionEnd),t&&(n=t.tooltipTemplate),!n&&s.template&&(n=g.template(s.template)),x(e)||t&&t.type?n?a=n({selectionStart:i,selectionEnd:r}):(i=y(s.format,i),r=y(s.format,r),a=i+" - "+r):(t&&(t.val=e),a=n?n({value:e}):y(s.format,e)),a},_getDraggableArea:function(){var e=this,t=g.getOffset(e._trackDiv);return{startPoint:e._isHorizontal?t.left:t.top+e._maxSelection,endPoint:e._isHorizontal?t.left+e._maxSelection:t.top}},_createHtml:function(){var e=this,t=e.element,r=e.options,a=t.find("input");2==a.length?(a.eq(0).prop("value",l(r.selectionStart)),a.eq(1).prop("value",l(r.selectionEnd))):t.prop("value",l(r.value)),t.wrap(n(r,t,e._isHorizontal)).hide(),r.showButtons&&t.before(i(r,"increase",e._isHorizontal)).before(i(r,"decrease",e._isHorizontal)),t.before(o(r,t))},_focus:function(t){var n=this,i=t.target,r=n.value(),o=n._drag;o||(i==n.wrapper.find(N).eq(0)[0]?(o=n._firstHandleDrag,n._activeHandle=0):(o=n._lastHandleDrag,n._activeHandle=1),r=r[n._activeHandle]),e(i).addClass(j+" "+W),o&&(n._activeHandleDrag=o,o.selectionStart=n.options.selectionStart,o.selectionEnd=n.options.selectionEnd,o._updateTooltip(r))},_focusWithMouse:function(t){t=e(t);var n=this,i=t.is(N)?t.index():0;window.setTimeout(function(){n.wrapper.find(N)[2==i?1:0].focus()},1),n._setTooltipTimeout()},_blur:function(t){var n=this,i=n._activeHandleDrag;e(t.target).removeClass(j+" "+W),i&&(i._removeTooltip(),delete n._activeHandleDrag,delete n._activeHandle)},_setTooltipTimeout:function(){var e=this;e._tooltipTimeout=window.setTimeout(function(){var t=e._drag||e._activeHandleDrag;t&&t._removeTooltip()},300)},_clearTooltipTimeout:function(){var e,t=this;window.clearTimeout(this._tooltipTimeout),e=t._drag||t._activeHandleDrag,e&&e.tooltipDiv&&e.tooltipDiv.stop(!0,!1).css("opacity",1)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._form=r.on("reset",w(t._formResetHandler,t)))},destroy:function(){this._form&&this._form.off("reset",this._formResetHandler),m.fn.destroy.call(this)}}),J=X.extend({init:function(n,i){var r,o=this;n.type="text",i=_({},{value:d(n,"value"),min:d(n,"min"),max:d(n,"max"),smallStep:d(n,"step")},i),n=e(n),i&&i.enabled===t&&(i.enabled=!n.is("[disabled]")),X.fn.init.call(o,n,i),i=o.options,h(i.value)&&null!==i.value||(i.value=i.min,n.prop("value",l(i.min))),i.value=k.max(k.min(i.value,i.max),i.min),r=o.wrapper.find(N),this._selection=new J.Selection(r,o,i),o._drag=new J.Drag(r,"",o,i)},options:{name:"Slider",showButtons:!0,increaseButtonTitle:"Increase",decreaseButtonTitle:"Decrease",dragHandleTitle:"drag",tooltip:{format:"{0:#,#.##}"},value:null},enable:function(n){var i,r,o,a=this,s=a.options;a.disable(),n!==!1&&(a.wrapper.removeClass(q).addClass(G),a.wrapper.find("input").removeAttr($),i=function(n){var i,r,o,s=Q(n)[0];if(s){if(i=a._isHorizontal?s.location.pageX:s.location.pageY,r=a._getDraggableArea(),o=e(n.target),o.hasClass("k-draghandle"))return o.addClass(j+" "+W),t;a._update(a._getValueFromPosition(i,r)),a._focusWithMouse(n.target),a._drag.dragstart(n),n.preventDefault()}},a.wrapper.find(U+", "+V).on(P,i).end().on(P,function(){e(document.documentElement).one("selectstart",g.preventDefault)}).on(z,function(){a._drag._end()}),a.wrapper.find(N).attr(K,0).on(I,function(){a._drag.draggable.userEvents.cancel(),a._setTooltipTimeout()}).on(B,function(e){a._focusWithMouse(e.target),e.preventDefault()}).on(O,w(a._focus,a)).on(H,w(a._blur,a)),r=w(function(e){var t=a._nextValueByIndex(a._valueIndex+1*e);a._setValueInRange(t),a._drag._updateTooltip(t)},a),s.showButtons&&(o=w(function(e,t){this._clearTooltipTimeout(),(1===e.which||C.touch&&0===e.which)&&(r(t),this.timeout=setTimeout(w(function(){this.timer=setInterval(function(){r(t)},60)},this),200))},a),a.wrapper.find(".k-button").on(I,w(function(e){this._clearTimer(),a._focusWithMouse(e.target)},a)).on(L,function(t){e(t.currentTarget).addClass("k-state-hover")}).on("mouseout"+M,w(function(t){e(t.currentTarget).removeClass("k-state-hover"),this._clearTimer()},a)).eq(0).on(E,w(function(e){o(e,1)},a)).click(!1).end().eq(1).on(E,w(function(e){o(e,-1)},a)).click(g.preventDefault)),a.wrapper.find(N).off(F,!1).on(F,w(this._keydown,a)),s.enabled=!0)},disable:function(){var t=this;t.wrapper.removeClass(G).addClass(q),e(t.element).prop($,$),t.wrapper.find(".k-button").off(E).on(E,g.preventDefault).off(I).on(I,g.preventDefault).off("mouseleave"+M).on("mouseleave"+M,g.preventDefault).off(L).on(L,g.preventDefault),t.wrapper.find(U+", "+V).off(P).off(z),t.wrapper.find(N).attr(K,-1).off(I).off(F).off(B).off(O).off(H),t.options.enabled=!1},_update:function(e){var t=this,n=t.value()!=e;t.value(e),n&&t.trigger(A,{value:t.options.value})},value:function(e){var n=this,i=n.options;return e=u(e),isNaN(e)?i.value:(e>=i.min&&i.max>=e&&i.value!=e&&(n.element.prop("value",l(e)),i.value=e,n._refreshAriaAttr(e),n._refresh()),t)},_refresh:function(){this.trigger(R,{value:this.options.value})},_refreshAriaAttr:function(e){var t,n=this,i=n._drag;t=i&&i._tooltipDiv?i._tooltipDiv.text():n._getFormattedValue(e,null),this.wrapper.find(N).attr("aria-valuenow",e).attr("aria-valuetext",t)},_clearTimer:function(){clearTimeout(this.timeout),clearInterval(this.timer)},_keydown:function(e){var t=this;e.keyCode in t._keyMap&&(t._clearTooltipTimeout(),t._setValueInRange(t._keyMap[e.keyCode](t.options.value)),t._drag._updateTooltip(t.value()),e.preventDefault())},_setValueInRange:function(e){var n=this,i=n.options;return e=u(e),isNaN(e)?(n._update(i.min),t):(e=k.max(k.min(e,i.max),i.min),n._update(e),t)},_nextValueByIndex:function(e){var t=this._values.length;return this._isRtl&&(e=t-1-e),this._values[k.max(0,k.min(e,t-1))]},_formResetHandler:function(){var e=this,t=e.options.min;setTimeout(function(){var n=e.element[0].value;e.value(""===n||isNaN(n)?t:n)})},destroy:function(){var e=this;X.fn.destroy.call(e),e.wrapper.off(M).find(".k-button").off(M).end().find(N).off(M).end().find(U+", "+V).off(M).end(),e._drag.draggable.destroy(),e._drag._removeTooltip(!0)}});J.Selection=function(e,t,n){function i(i){var r=i-n.min,o=t._valueIndex=k.ceil(u(r/n.smallStep)),a=parseInt(t._pixelSteps[o],10),s=t._trackDiv.find(".k-slider-selection"),l=parseInt(e[t._outerSize]()/2,10),c=t._isRtl?2:0;s[t._sizeFn](t._isRtl?t._maxSelection-a:a),e.css(t._position,a-l-c)}i(n.value),t.bind([A,D,R],function(e){i(parseFloat(e.value,10))})},J.Drag=function(e,t,n,i){var r=this;r.owner=n,r.options=i,r.element=e,r.type=t,r.draggable=new v(e,{distance:0,dragstart:w(r._dragstart,r),drag:w(r.drag,r),dragend:w(r.dragend,r),dragcancel:w(r.dragcancel,r)}),e.click(!1)},J.Drag.prototype={dragstart:function(e){this.owner._activeDragHandle=this,this.draggable.userEvents.cancel(),this.draggable.userEvents._start(e)},_dragstart:function(n){var i=this,r=i.owner,o=i.options;return o.enabled?(this.owner._activeDragHandle=this,r.element.off(L),r.wrapper.find("."+j).removeClass(j+" "+W),i.element.addClass(j+" "+W),e(document.documentElement).css("cursor","pointer"),i.dragableArea=r._getDraggableArea(),i.step=k.max(o.smallStep*(r._maxSelection/r._distance),0),i.type?(i.selectionStart=o.selectionStart,i.selectionEnd=o.selectionEnd,r._setZIndex(i.type)):i.oldVal=i.val=o.value,i._removeTooltip(!0),i._createTooltip(),t):(n.preventDefault(),t)},_createTooltip:function(){var t,n,i=this,r=i.owner,o=i.options.tooltip,a="",s=e(window);o.enabled&&(o.template&&(t=i.tooltipTemplate=g.template(o.template)),e(".k-slider-tooltip").remove(),i.tooltipDiv=e("<div class='k-widget k-tooltip k-slider-tooltip'><!-- --></div>").appendTo(document.body),a=r._getFormattedValue(i.val||r.value(),i),i.type||(n="k-callout-"+(r._isHorizontal?"s":"e"),i.tooltipInnerDiv="<div class='k-callout "+n+"'><!-- --></div>",a+=i.tooltipInnerDiv),i.tooltipDiv.html(a),i._scrollOffset={top:s.scrollTop(),left:s.scrollLeft()},i.moveTooltip())},drag:function(e){var t,n=this,i=n.owner,r=e.x.location,o=e.y.location,a=n.dragableArea.startPoint,s=n.dragableArea.endPoint;e.preventDefault(),n.val=i._isHorizontal?i._isRtl?n.constrainValue(r,a,s,s>r):n.constrainValue(r,a,s,r>=s):n.constrainValue(o,s,a,s>=o),n.oldVal!=n.val&&(n.oldVal=n.val,n.type?("firstHandle"==n.type?n.selectionStart=n.selectionEnd>n.val?n.val:n.selectionEnd=n.val:n.val>n.selectionStart?n.selectionEnd=n.val:n.selectionStart=n.selectionEnd=n.val,t={values:[n.selectionStart,n.selectionEnd],value:[n.selectionStart,n.selectionEnd]}):t={value:n.val},i.trigger(D,t)),n._updateTooltip(n.val)},_updateTooltip:function(e){var t=this,n=t.options,i=n.tooltip,r="";t.val&&(e=t.val),i.enabled&&(t.tooltipDiv||t._createTooltip(),r=t.owner._getFormattedValue(u(e),t),t.type||(r+=t.tooltipInnerDiv),t.tooltipDiv.html(r),t.moveTooltip())},dragcancel:function(){return this.owner._refresh(),e(document.documentElement).css("cursor",""),this._end()},dragend:function(){var t=this,n=t.owner;return e(document.documentElement).css("cursor",""),t.type?n._update(t.selectionStart,t.selectionEnd):(n._update(t.val),t.draggable.userEvents._disposeAll()),t._end()},_end:function(){var e=this,t=e.owner;return t._focusWithMouse(e.element),t.element.on(L),!1},_removeTooltip:function(t){var n=this,i=n.owner;n.tooltipDiv&&i.options.tooltip.enabled&&i.options.enabled&&(t?(n.tooltipDiv.remove(),n.tooltipDiv=null):n.tooltipDiv.fadeOut("slow",function(){e(this).remove(),n.tooltipDiv=null}))},moveTooltip:function(){var t,n,i,r,o=this,a=o.owner,s=0,l=0,c=o.element,u=g.getOffset(c),d=8,h=e(window),f=o.tooltipDiv.find(".k-callout"),p=o.tooltipDiv.outerWidth(),m=o.tooltipDiv.outerHeight();o.type?(t=a.wrapper.find(N),u=g.getOffset(t.eq(0)),n=g.getOffset(t.eq(1)),a._isHorizontal?(s=n.top,l=u.left+(n.left-u.left)/2):(s=u.top+(n.top-u.top)/2,l=n.left),r=t.eq(0).outerWidth()+2*d):(s=u.top,l=u.left,r=c.outerWidth()+2*d),a._isHorizontal?(l-=parseInt((p-c[a._outerSize]())/2,10),s-=m+f.height()+d):(s-=parseInt((m-c[a._outerSize]())/2,10),l-=p+f.width()+d),a._isHorizontal?(i=o._flip(s,m,r,h.outerHeight()+o._scrollOffset.top),s+=i,l+=o._fit(l,p,h.outerWidth()+o._scrollOffset.left)):(i=o._flip(l,p,r,h.outerWidth()+o._scrollOffset.left),s+=o._fit(s,m,h.outerHeight()+o._scrollOffset.top),l+=i),i>0&&f&&(f.removeClass(),f.addClass("k-callout k-callout-"+(a._isHorizontal?"n":"w"))),o.tooltipDiv.css({top:s,left:l})},_fit:function(e,t,n){var i=0;return e+t>n&&(i=n-(e+t)),0>e&&(i=-e),i},_flip:function(e,t,n,i){var r=0;return e+t>i&&(r+=-(n+t)),0>e+r&&(r+=n+t),r},constrainValue:function(e,t,n,i){var r=this,o=0;return o=e>t&&n>e?r.owner._getValueFromPosition(e,r.dragableArea):i?r.options.max:r.options.min}},g.ui.plugin(J),p=X.extend({init:function(n,i){var r,o=this,a=e(n).find("input"),s=a.eq(0)[0],c=a.eq(1)[0];s.type="text",c.type="text",i&&i.showButtons&&(window.console&&window.console.warn("showbuttons option is not supported for the range slider, ignoring"),i.showButtons=!1),i=_({},{selectionStart:d(s,"value"),min:d(s,"min"),max:d(s,"max"),smallStep:d(s,"step")},{selectionEnd:d(c,"value"),min:d(c,"min"),max:d(c,"max"),smallStep:d(c,"step")},i),i&&i.enabled===t&&(i.enabled=!a.is("[disabled]")),X.fn.init.call(o,n,i),i=o.options,h(i.selectionStart)&&null!==i.selectionStart||(i.selectionStart=i.min,a.eq(0).prop("value",l(i.min))),h(i.selectionEnd)&&null!==i.selectionEnd||(i.selectionEnd=i.max,a.eq(1).prop("value",l(i.max))),r=o.wrapper.find(N),this._selection=new p.Selection(r,o,i),o._firstHandleDrag=new J.Drag(r.eq(0),"firstHandle",o,i),o._lastHandleDrag=new J.Drag(r.eq(1),"lastHandle",o,i)},options:{name:"RangeSlider",leftDragHandleTitle:"drag",rightDragHandleTitle:"drag",tooltip:{format:"{0:#,#.##}"},selectionStart:null,selectionEnd:null},enable:function(n){var i,r=this,o=r.options;r.disable(),n!==!1&&(r.wrapper.removeClass(q).addClass(G),r.wrapper.find("input").removeAttr($),i=function(n){var i,a,s,l,c,u,d,h=Q(n)[0];if(h){if(i=r._isHorizontal?h.location.pageX:h.location.pageY,a=r._getDraggableArea(),s=r._getValueFromPosition(i,a),l=e(n.target),l.hasClass("k-draghandle"))return r.wrapper.find("."+j).removeClass(j+" "+W),l.addClass(j+" "+W),t;o.selectionStart>s?(c=s,u=o.selectionEnd,d=r._firstHandleDrag):s>r.selectionEnd?(c=o.selectionStart,u=s,d=r._lastHandleDrag):o.selectionEnd-s>=s-o.selectionStart?(c=s,u=o.selectionEnd,d=r._firstHandleDrag):(c=o.selectionStart,u=s,d=r._lastHandleDrag),d.dragstart(n),r._setValueInRange(c,u),r._focusWithMouse(d.element)}},r.wrapper.find(U+", "+V).on(P,i).end().on(P,function(){e(document.documentElement).one("selectstart",g.preventDefault)}).on(z,function(){r._activeDragHandle&&r._activeDragHandle._end()}),r.wrapper.find(N).attr(K,0).on(I,function(){r._setTooltipTimeout(),r._drag.draggable.userEvents.cancel()}).on(B,function(e){r._focusWithMouse(e.target),e.preventDefault()}).on(O,w(r._focus,r)).on(H,w(r._blur,r)),r.wrapper.find(N).off(F,g.preventDefault).eq(0).on(F,w(function(e){this._keydown(e,"firstHandle")},r)).end().eq(1).on(F,w(function(e){this._keydown(e,"lastHandle")},r)),r.options.enabled=!0)},disable:function(){var e=this;e.wrapper.removeClass(G).addClass(q),e.wrapper.find("input").prop($,$),e.wrapper.find(U+", "+V).off(P).off(z),e.wrapper.find(N).attr(K,-1).off(I).off(F).off(B).off(O).off(H),e.options.enabled=!1},_keydown:function(e,t){var n,i,r,o=this,a=o.options.selectionStart,s=o.options.selectionEnd;e.keyCode in o._keyMap&&(o._clearTooltipTimeout(),"firstHandle"==t?(r=o._activeHandleDrag=o._firstHandleDrag,a=o._keyMap[e.keyCode](a),a>s&&(s=a)):(r=o._activeHandleDrag=o._lastHandleDrag,s=o._keyMap[e.keyCode](s),a>s&&(a=s)),o._setValueInRange(u(a),u(s)),n=Math.max(a,o.options.selectionStart),i=Math.min(s,o.options.selectionEnd),r.selectionEnd=Math.max(i,o.options.selectionStart),r.selectionStart=Math.min(n,o.options.selectionEnd),r._updateTooltip(o.value()[o._activeHandle]),e.preventDefault())},_update:function(e,t){var n=this,i=n.value(),r=i[0]!=e||i[1]!=t;n.value([e,t]),r&&n.trigger(A,{values:[e,t],value:[e,t]})},value:function(e){return e&&e.length?this._value(e[0],e[1]):this._value()},_value:function(e,n){var i=this,r=i.options,o=r.selectionStart,a=r.selectionEnd;return isNaN(e)&&isNaN(n)?[o,a]:(e=u(e),n=u(n),e>=r.min&&r.max>=e&&n>=r.min&&r.max>=n&&n>=e&&(o!=e||a!=n)&&(i.element.find("input").eq(0).prop("value",l(e)).end().eq(1).prop("value",l(n)),r.selectionStart=e,r.selectionEnd=n,i._refresh(),i._refreshAriaAttr(e,n)),t)},values:function(e,t){return x(e)?this._value(e[0],e[1]):this._value(e,t)},_refresh:function(){var e=this,t=e.options;e.trigger(R,{values:[t.selectionStart,t.selectionEnd],value:[t.selectionStart,t.selectionEnd]}),t.selectionStart==t.max&&t.selectionEnd==t.max&&e._setZIndex("firstHandle")},_refreshAriaAttr:function(e,t){var n,i=this,r=i.wrapper.find(N),o=i._activeHandleDrag;n=i._getFormattedValue([e,t],o),r.eq(0).attr("aria-valuenow",e),r.eq(1).attr("aria-valuenow",t),r.attr("aria-valuetext",n)},_setValueInRange:function(e,t){var n=this.options;e=k.max(k.min(e,n.max),n.min),t=k.max(k.min(t,n.max),n.min),e==n.max&&t==n.max&&this._setZIndex("firstHandle"),this._update(k.min(e,t),k.max(e,t))},_setZIndex:function(t){this.wrapper.find(N).each(function(n){e(this).css("z-index","firstHandle"==t?1-n:n)})},_formResetHandler:function(){var e=this,t=e.options;setTimeout(function(){var n=e.element.find("input"),i=n[0].value,r=n[1].value;e.values(""===i||isNaN(i)?t.min:i,""===r||isNaN(r)?t.max:r)})},destroy:function(){var e=this;X.fn.destroy.call(e),e.wrapper.off(M).find(U+", "+V).off(M).end().find(N).off(M),e._firstHandleDrag.draggable.destroy(),e._lastHandleDrag.draggable.destroy()}}),p.Selection=function(e,t,n){function i(i){i=i||[];var o=i[0]-n.min,a=i[1]-n.min,s=k.ceil(u(o/n.smallStep)),l=k.ceil(u(a/n.smallStep)),c=t._pixelSteps[s],d=t._pixelSteps[l],h=parseInt(e.eq(0)[t._outerSize]()/2,10),f=t._isRtl?2:0;e.eq(0).css(t._position,c-h-f).end().eq(1).css(t._position,d-h-f),r(c,d)}function r(e,n){var i,r,o=t._trackDiv.find(".k-slider-selection");i=k.abs(e-n),o[t._sizeFn](i),t._isRtl?(r=k.max(e,n),o.css("right",t._maxSelection-r-1)):(r=k.min(e,n),o.css(t._position,r-1))}i(t.value()),t.bind([A,D,R],function(e){i(e.values)})},g.ui.plugin(p)}(window.kendo.jQuery)}(),function(){!function(e,t,n){function i(e,t,n){n=u(n),n&&!n.equals(e.color())&&("change"==t&&(e._value=n),n=1!=n.a?n.toCssRgba():n.toCss(),e.trigger(t,{value:n}))}function r(e,t,n){var i,r;return e=Array.prototype.slice.call(e),i=e.length,r=e.indexOf(t),0>r?0>n?e[i-1]:e[0]:(r+=n,0>r?r+=i:r%=i,e[r])}function o(e){e.preventDefault()}function a(e,t){return function(){return e.apply(t,arguments)}}var s=window.kendo,l=s.ui,c=l.Widget,u=s.parseColor,d=s.Color,h=s.keys,f="background-color",p="k-state-selected",g="000000,7f7f7f,880015,ed1c24,ff7f27,fff200,22b14c,00a2e8,3f48cc,a349a4,ffffff,c3c3c3,b97a57,ffaec9,ffc90e,efe4b0,b5e61d,99d9ea,7092be,c8bfe7",m="FFFFFF,FFCCFF,FF99FF,FF66FF,FF33FF,FF00FF,CCFFFF,CCCCFF,CC99FF,CC66FF,CC33FF,CC00FF,99FFFF,99CCFF,9999FF,9966FF,9933FF,9900FF,FFFFCC,FFCCCC,FF99CC,FF66CC,FF33CC,FF00CC,CCFFCC,CCCCCC,CC99CC,CC66CC,CC33CC,CC00CC,99FFCC,99CCCC,9999CC,9966CC,9933CC,9900CC,FFFF99,FFCC99,FF9999,FF6699,FF3399,FF0099,CCFF99,CCCC99,CC9999,CC6699,CC3399,CC0099,99FF99,99CC99,999999,996699,993399,990099,FFFF66,FFCC66,FF9966,FF6666,FF3366,FF0066,CCFF66,CCCC66,CC9966,CC6666,CC3366,CC0066,99FF66,99CC66,999966,996666,993366,990066,FFFF33,FFCC33,FF9933,FF6633,FF3333,FF0033,CCFF33,CCCC33,CC9933,CC6633,CC3333,CC0033,99FF33,99CC33,999933,996633,993333,990033,FFFF00,FFCC00,FF9900,FF6600,FF3300,FF0000,CCFF00,CCCC00,CC9900,CC6600,CC3300,CC0000,99FF00,99CC00,999900,996600,993300,990000,66FFFF,66CCFF,6699FF,6666FF,6633FF,6600FF,33FFFF,33CCFF,3399FF,3366FF,3333FF,3300FF,00FFFF,00CCFF,0099FF,0066FF,0033FF,0000FF,66FFCC,66CCCC,6699CC,6666CC,6633CC,6600CC,33FFCC,33CCCC,3399CC,3366CC,3333CC,3300CC,00FFCC,00CCCC,0099CC,0066CC,0033CC,0000CC,66FF99,66CC99,669999,666699,663399,660099,33FF99,33CC99,339999,336699,333399,330099,00FF99,00CC99,009999,006699,003399,000099,66FF66,66CC66,669966,666666,663366,660066,33FF66,33CC66,339966,336666,333366,330066,00FF66,00CC66,009966,006666,003366,000066,66FF33,66CC33,669933,666633,663333,660033,33FF33,33CC33,339933,336633,333333,330033,00FF33,00CC33,009933,006633,003333,000033,66FF00,66CC00,669900,666600,663300,660000,33FF00,33CC00,339900,336600,333300,330000,00FF00,00CC00,009900,006600,003300,000000",v={apply:"Apply",cancel:"Cancel"},_=".kendoColorTools",y="click"+_,b="keydown"+_,w=s.support.browser,x=w.msie&&9>w.version,k=c.extend({init:function(e,t){var n,i=this;c.fn.init.call(i,e,t),e=i.element,t=i.options,i._value=t.value=u(t.value),i._tabIndex=e.attr("tabIndex")||0,n=i._ariaId=t.ariaId,n&&e.attr("aria-labelledby",n),t._standalone&&(i._triggerSelect=i._triggerChange)},options:{name:"ColorSelector",value:null,_standalone:!0},events:["change","select","cancel"],color:function(e){return e!==n&&(this._value=u(e),this._updateUI(this._value)),this._value},value:function(e){return e=this.color(e),e&&(e=this.options.opacity?e.toCssRgba():e.toCss()),e||null},enable:function(t){0===arguments.length&&(t=!0),e(".k-disabled-overlay",this.wrapper).remove(),t||this.wrapper.append("<div class='k-disabled-overlay'></div>"),this._onEnable(t)},_select:function(e,t){var n=this._value;e=this.color(e),t||(this.element.trigger("change"),e.equals(n)?this._standalone||this.trigger("cancel"):this.trigger("change",{value:this.value()}))},_triggerSelect:function(e){i(this,"select",e)},_triggerChange:function(e){i(this,"change",e)},
destroy:function(){this.element&&this.element.off(_),this.wrapper&&this.wrapper.off(_).find("*").off(_),this.wrapper=null,c.fn.destroy.call(this)},_updateUI:e.noop,_selectOnHide:function(){return null},_cancel:function(){this.trigger("cancel")}}),C=k.extend({init:function(t,n){var i,r,o,l,c=this;if(k.fn.init.call(c,t,n),t=c.wrapper=c.element,n=c.options,i=n.palette,"websafe"==i?(i=m,n.columns=18):"basic"==i&&(i=g),"string"==typeof i&&(i=i.split(",")),e.isArray(i)&&(i=e.map(i,function(e){return u(e)})),c._selectedID=(n.ariaId||s.guid())+"_selected",t.addClass("k-widget k-colorpalette").attr("role","grid").attr("aria-readonly","true").append(e(c._template({colors:i,columns:n.columns,tileSize:n.tileSize,value:c._value,id:n.ariaId}))).on(y,".k-item",function(t){c._select(e(t.currentTarget).css(f))}).attr("tabIndex",c._tabIndex).on(b,a(c._keydown,c)),r=n.tileSize){if(/number|string/.test(typeof r))o=l=parseFloat(r);else{if("object"!=typeof r)throw Error("Unsupported value for the 'tileSize' argument");o=parseFloat(r.width),l=parseFloat(r.height)}t.find(".k-item").css({width:o,height:l})}},focus:function(){this.wrapper.focus()},options:{name:"ColorPalette",columns:10,tileSize:null,palette:"basic"},_onEnable:function(e){e?this.wrapper.attr("tabIndex",this._tabIndex):this.wrapper.removeAttr("tabIndex")},_keydown:function(t){var n,i,a=this.wrapper,s=a.find(".k-item"),l=s.filter("."+p).get(0),c=t.keyCode;if(c==h.LEFT?n=r(s,l,-1):c==h.RIGHT?n=r(s,l,1):c==h.DOWN?n=r(s,l,this.options.columns):c==h.UP?n=r(s,l,-this.options.columns):c==h.ENTER?(o(t),l&&this._select(e(l).css(f))):c==h.ESC&&this._cancel(),n){o(t),this._current(n);try{i=u(n.css(f)),this._triggerSelect(i)}catch(d){}}},_current:function(t){this.wrapper.find("."+p).removeClass(p).attr("aria-selected",!1).removeAttr("id"),e(t).addClass(p).attr("aria-selected",!0).attr("id",this._selectedID),this.element.removeAttr("aria-activedescendant").attr("aria-activedescendant",this._selectedID)},_updateUI:function(t){var i=null;this.wrapper.find(".k-item").each(function(){var r=u(e(this).css(f));return r&&r.equals(t)?(i=this,!1):n}),this._current(i)},_template:s.template('<table class="k-palette k-reset" role="presentation"><tr role="row"># for (var i = 0; i < colors.length; ++i) { ## var selected = colors[i].equals(value); ## if (i && i % columns == 0) { # </tr><tr role="row"> # } #<td role="gridcell" unselectable="on" style="background-color:#= colors[i].toCss() #"#= selected ? " aria-selected=true" : "" # #=(id && i === 0) ? "id=\\""+id+"\\" " : "" # class="k-item#= selected ? " '+p+'" : "" #" aria-label="#= colors[i].toCss() #"></td># } #</tr></table>')}),S=k.extend({init:function(t,n){var i=this;k.fn.init.call(i,t,n),n=i.options,t=i.element,i.wrapper=t.addClass("k-widget k-flatcolorpicker").append(i._template(n)),i._hueElements=e(".k-hsv-rectangle, .k-transparency-slider .k-slider-track",t),i._selectedColor=e(".k-selected-color-display",t),i._colorAsText=e("input.k-color-value",t),i._sliders(),i._hsvArea(),i._updateUI(i._value||u("#f00")),t.find("input.k-color-value").on(b,function(t){var n,r,o=this;if(t.keyCode==h.ENTER)try{n=u(o.value),r=i.color(),i._select(n,n.equals(r))}catch(a){e(o).addClass("k-state-error")}else i.options.autoupdate&&setTimeout(function(){var e=u(o.value,!0);e&&i._updateUI(e,!0)},10)}).end().on(y,".k-controls button.apply",function(){i._select(i._getHSV())}).on(y,".k-controls button.cancel",function(){i._updateUI(i.color()),i._cancel()}),x&&i._applyIEFilter()},destroy:function(){this._hueSlider.destroy(),this._opacitySlider&&this._opacitySlider.destroy(),this._hueSlider=this._opacitySlider=this._hsvRect=this._hsvHandle=this._hueElements=this._selectedColor=this._colorAsText=null,k.fn.destroy.call(this)},options:{name:"FlatColorPicker",opacity:!1,buttons:!1,input:!0,preview:!0,autoupdate:!0,messages:v},_applyIEFilter:function(){var e=this.element.find(".k-hue-slider .k-slider-track")[0],t=e.currentStyle.backgroundImage;t=t.replace(/^url\([\'\"]?|[\'\"]?\)$/g,""),e.style.filter="progid:DXImageTransform.Microsoft.AlphaImageLoader(src='"+t+"', sizingMethod='scale')"},_sliders:function(){function e(e){n._updateUI(n._getHSV(e.value,null,null,null))}function t(e){n._updateUI(n._getHSV(null,null,null,e.value/100))}var n=this,i=n.element;n._hueSlider=i.find(".k-hue-slider").kendoSlider({min:0,max:359,tickPlacement:"none",showButtons:!1,slide:e,change:e}).data("kendoSlider"),n._opacitySlider=i.find(".k-transparency-slider").kendoSlider({min:0,max:100,tickPlacement:"none",showButtons:!1,slide:t,change:t}).data("kendoSlider")},_hsvArea:function(){function e(e,n){var i=this.offset,r=e-i.left,o=n-i.top,a=this.width,s=this.height;r=0>r?0:r>a?a:r,o=0>o?0:o>s?s:o,t._svChange(r/a,1-o/s)}var t=this,n=t.element,i=n.find(".k-hsv-rectangle"),r=i.find(".k-draghandle").attr("tabIndex",0).on(b,a(t._keydown,t));t._hsvEvents=new s.UserEvents(i,{global:!0,press:function(t){this.offset=s.getOffset(i),this.width=i.width(),this.height=i.height(),r.focus(),e.call(this,t.x.location,t.y.location)},start:function(){i.addClass("k-dragging"),r.focus()},move:function(t){t.preventDefault(),e.call(this,t.x.location,t.y.location)},end:function(){i.removeClass("k-dragging")}}),t._hsvRect=i,t._hsvHandle=r},_onEnable:function(e){this._hueSlider.enable(e),this._opacitySlider&&this._opacitySlider.enable(e),this.wrapper.find("input").attr("disabled",!e);var t=this._hsvRect.find(".k-draghandle");e?t.attr("tabIndex",this._tabIndex):t.removeAttr("tabIndex")},_keydown:function(e){function t(t,n){var r=i._getHSV();r[t]+=n*(e.shiftKey?.01:.05),0>r[t]&&(r[t]=0),r[t]>1&&(r[t]=1),i._updateUI(r),o(e)}function n(t){var n=i._getHSV();n.h+=t*(e.shiftKey?1:5),0>n.h&&(n.h=0),n.h>359&&(n.h=359),i._updateUI(n),o(e)}var i=this;switch(e.keyCode){case h.LEFT:e.ctrlKey?n(-1):t("s",-1);break;case h.RIGHT:e.ctrlKey?n(1):t("s",1);break;case h.UP:t(e.ctrlKey&&i._opacitySlider?"a":"v",1);break;case h.DOWN:t(e.ctrlKey&&i._opacitySlider?"a":"v",-1);break;case h.ENTER:i._select(i._getHSV());break;case h.F2:i.wrapper.find("input.k-color-value").focus().select();break;case h.ESC:i._cancel()}},focus:function(){this._hsvHandle.focus()},_getHSV:function(e,t,n,i){var r=this._hsvRect,o=r.width(),a=r.height(),s=this._hsvHandle.position();return null==e&&(e=this._hueSlider.value()),null==t&&(t=s.left/o),null==n&&(n=1-s.top/a),null==i&&(i=this._opacitySlider?this._opacitySlider.value()/100:1),d.fromHSV(e,t,n,i)},_svChange:function(e,t){var n=this._getHSV(null,e,t,null);this._updateUI(n)},_updateUI:function(e,t){var n=this,i=n._hsvRect;e&&(this._colorAsText.removeClass("k-state-error"),n._selectedColor.css(f,e.toDisplay()),t||n._colorAsText.val(n._opacitySlider?e.toCssRgba():e.toCss()),n._triggerSelect(e),e=e.toHSV(),n._hsvHandle.css({left:e.s*i.width()+"px",top:(1-e.v)*i.height()+"px"}),n._hueElements.css(f,d.fromHSV(e.h,1,1,1).toCss()),n._hueSlider.value(e.h),n._opacitySlider&&n._opacitySlider.value(100*e.a))},_selectOnHide:function(){return this.options.buttons?null:this._getHSV()},_template:s.template('# if (preview) { #<div class="k-selected-color"><div class="k-selected-color-display"><input class="k-color-value" #= !data.input ? \'style="visibility: hidden;"\' : "" #></div></div># } #<div class="k-hsv-rectangle"><div class="k-hsv-gradient"></div><div class="k-draghandle"></div></div><input class="k-hue-slider" /># if (opacity) { #<input class="k-transparency-slider" /># } ## if (buttons) { #<div unselectable="on" class="k-controls"><button class="k-button k-primary apply">#: messages.apply #</button> <button class="k-button cancel">#: messages.cancel #</button></div># } #')}),T=c.extend({init:function(t,n){var i,r,o,a,s,l=this;c.fn.init.call(l,t,n),n=l.options,t=l.element,i=t.attr("value")||t.val(),i=i?u(i,!0):u(n.value,!0),l._value=n.value=i,r=l.wrapper=e(l._template(n)),t.hide().after(r),t.is("input")&&(t.appendTo(r),o=t.closest("label"),a=t.attr("id"),a&&(o=o.add('label[for="'+a+'"]')),o.click(function(e){l.open(),e.preventDefault()})),l._tabIndex=t.attr("tabIndex")||0,l.enable(!t.attr("disabled")),s=t.attr("accesskey"),s&&(t.attr("accesskey",null),r.attr("accesskey",s)),l.bind("activate",function(e){e.isDefaultPrevented()||l.toggle()}),l._updateUI(i)},destroy:function(){this.wrapper.off(_).find("*").off(_),this._popup&&(this._selector.destroy(),this._popup.destroy()),this._selector=this._popup=this.wrapper=null,c.fn.destroy.call(this)},enable:function(e){var t=this,n=t.wrapper,i=n.children(".k-picker-wrap"),r=i.find(".k-select");0===arguments.length&&(e=!0),t.element.attr("disabled",!e),n.attr("aria-disabled",!e),r.off(_).on("mousedown"+_,o),n.addClass("k-state-disabled").removeAttr("tabIndex").add("*",n).off(_),e&&n.removeClass("k-state-disabled").attr("tabIndex",t._tabIndex).on("mouseenter"+_,function(){i.addClass("k-state-hover")}).on("mouseleave"+_,function(){i.removeClass("k-state-hover")}).on("focus"+_,function(){i.addClass("k-state-focused")}).on("blur"+_,function(){i.removeClass("k-state-focused")}).on(b,a(t._keydown,t)).on(y,".k-select",a(t.toggle,t)).on(y,t.options.toolIcon?".k-tool-icon":".k-selected-color",function(){t.trigger("activate")})},_template:s.template('<span role="textbox" aria-haspopup="true" class="k-widget k-colorpicker k-header"><span class="k-picker-wrap k-state-default"># if (toolIcon) { #<span class="k-tool-icon #= toolIcon #"><span class="k-selected-color"></span></span># } else { #<span class="k-selected-color"></span># } #<span class="k-select" unselectable="on"><span class="k-icon k-i-arrow-s" unselectable="on"></span></span></span></span>'),options:{name:"ColorPicker",palette:null,columns:10,toolIcon:null,value:null,messages:v,opacity:!1,buttons:!0,preview:!0,ARIATemplate:'Current selected color is #=data || ""#'},events:["activate","change","select","open","close"],open:function(){this._getPopup().open()},close:function(){this._getPopup().close()},toggle:function(){this._getPopup().toggle()},color:k.fn.color,value:k.fn.value,_select:k.fn._select,_triggerSelect:k.fn._triggerSelect,_isInputTypeColor:function(){var e=this.element[0];return/^input$/i.test(e.tagName)&&/^color$/i.test(e.type)},_updateUI:function(e){var t="";e&&(t=this._isInputTypeColor()||1==e.a?e.toCss():e.toCssRgba(),this.element.val(t)),this._ariaTemplate||(this._ariaTemplate=s.template(this.options.ARIATemplate)),this.wrapper.attr("aria-label",this._ariaTemplate(t)),this._triggerSelect(e),this.wrapper.find(".k-selected-color").css(f,e?e.toDisplay():"transparent")},_keydown:function(e){var t=e.keyCode;this._getPopup().visible()?(t==h.ESC?this._selector._cancel():this._selector._keydown(e),o(e)):(t==h.ENTER||t==h.DOWN)&&(this.open(),o(e))},_getPopup:function(){var t,i,r,o,a=this,l=a._popup;return l||(t=a.options,i=t.palette?C:S,t._standalone=!1,delete t.select,delete t.change,delete t.cancel,r=s.guid(),o=a._selector=new i(e('<div id="'+r+'"/>').appendTo(document.body),t),a.wrapper.attr("aria-owns",r),a._popup=l=o.wrapper.kendoPopup({anchor:a.wrapper,adjustSize:{width:5,height:0}}).data("kendoPopup"),o.bind({select:function(e){a._updateUI(u(e.value))},change:function(){a._select(o.color()),a.close()},cancel:function(){a.close()}}),l.bind({close:function(e){if(a.trigger("close"))return e.preventDefault(),n;a.wrapper.children(".k-picker-wrap").removeClass("k-state-focused");var t=o._selectOnHide();t?a._select(t):(a.wrapper.focus(),a._updateUI(a.color()))},open:function(e){a.trigger("open")?e.preventDefault():a.wrapper.children(".k-picker-wrap").addClass("k-state-focused")},activate:function(){o._select(a.color(),!0),o.focus(),a.wrapper.children(".k-picker-wrap").addClass("k-state-focused")}})),l}});l.plugin(C),l.plugin(S),l.plugin(T)}(jQuery,parseInt)}(),function(){!function(e,t){function n(e,t){return'<span unselectable="on" class="k-link"><span unselectable="on" class="k-icon k-i-arrow-'+e+'" title="'+t+'">'+t+"</span></span>"}var i=window.kendo,r=i.caret,o=i.keys,a=i.ui,s=a.Widget,l=i._activeElement,c=i._extractFormat,u=i.parseFloat,d=i.support.placeholder,h=i.getCulture,f=i._round,p="change",g="disabled",m="readonly",v="k-input",_="spin",y=".kendoNumericTextBox",b="touchend",w="mouseleave"+y,x="mouseenter"+y+" "+w,k="k-state-default",C="k-state-focused",S="k-state-hover",T="focus",A=".",D="k-state-selected",M="k-state-disabled",E="aria-disabled",P="aria-readonly",I=/^(-)?(\d*)$/,z=null,R=e.proxy,F=e.extend,B=s.extend({init:function(n,r){var o,a,l,u,d,h=this,f=r&&r.step!==t;s.fn.init.call(h,n,r),r=h.options,n=h.element.on("focusout"+y,R(h._focusout,h)).attr("role","spinbutton"),r.placeholder=r.placeholder||n.attr("placeholder"),h._initialOptions=F({},r),h._reset(),h._wrapper(),h._arrows(),h._input(),i.support.mobileOS?h._text.on(b+y+" "+T+y,function(){h._toggleText(!1),n.focus()}):h._text.on(T+y,R(h._click,h)),o=h.min(n.attr("min")),a=h.max(n.attr("max")),l=h._parse(n.attr("step")),r.min===z&&o!==z&&(r.min=o),r.max===z&&a!==z&&(r.max=a),f||l===z||(r.step=l),n.attr("aria-valuemin",r.min).attr("aria-valuemax",r.max),r.format=c(r.format),u=r.value,h.value(u!==z?u:n.val()),d=n.is("[disabled]")||e(h.element).parents("fieldset").is(":disabled"),d?h.enable(!1):h.readonly(n.is("[readonly]")),i.notify(h)},options:{name:"NumericTextBox",decimals:z,min:z,max:z,value:z,step:1,culture:"",format:"n",spinners:!0,placeholder:"",upArrowText:"Increase value",downArrowText:"Decrease value"},events:[p,_],_editable:function(e){var t=this,n=t.element,i=e.disable,r=e.readonly,o=t._text.add(n),a=t._inputWrapper.off(x);t._toggleText(!0),t._upArrowEventHandler.unbind("press"),t._downArrowEventHandler.unbind("press"),n.off("keydown"+y).off("keypress"+y).off("paste"+y),r||i?(a.addClass(i?M:k).removeClass(i?k:M),o.attr(g,i).attr(m,r).attr(E,i).attr(P,r)):(a.addClass(k).removeClass(M).on(x,t._toggleHover),o.removeAttr(g).removeAttr(m).attr(E,!1).attr(P,!1),t._upArrowEventHandler.bind("press",function(e){e.preventDefault(),t._spin(1),t._upArrow.addClass(D)}),t._downArrowEventHandler.bind("press",function(e){e.preventDefault(),t._spin(-1),t._downArrow.addClass(D)}),t.element.on("keydown"+y,R(t._keydown,t)).on("keypress"+y,R(t._keypress,t)).on("paste"+y,R(t._paste,t)))},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},destroy:function(){var e=this;e.element.add(e._text).add(e._upArrow).add(e._downArrow).add(e._inputWrapper).off(y),e._upArrowEventHandler.destroy(),e._downArrowEventHandler.destroy(),e._form&&e._form.off("reset",e._resetHandler),s.fn.destroy.call(e)},min:function(e){return this._option("min",e)},max:function(e){return this._option("max",e)},step:function(e){return this._option("step",e)},value:function(e){var n,i=this;return e===t?i._value:(e=i._parse(e),n=i._adjust(e),e===n&&(i._update(e),i._old=i._value),t)},focus:function(){this._focusin()},_adjust:function(e){var t=this,n=t.options,i=n.min,r=n.max;return e===z?e:(i!==z&&i>e?e=i:r!==z&&e>r&&(e=r),e)},_arrows:function(){var t,r=this,o=function(){clearTimeout(r._spinning),t.removeClass(D)},a=r.options,s=a.spinners,l=r.element;t=l.siblings(".k-icon"),t[0]||(t=e(n("n",a.upArrowText)+n("s",a.downArrowText)).insertAfter(l),t.wrapAll('<span class="k-select"/>')),s||(t.parent().toggle(s),r._inputWrapper.addClass("k-expand-padding")),r._upArrow=t.eq(0),r._upArrowEventHandler=new i.UserEvents(r._upArrow,{release:o}),r._downArrow=t.eq(1),r._downArrowEventHandler=new i.UserEvents(r._downArrow,{release:o})},_blur:function(){var e=this;e._toggleText(!0),e._change(e.element.val())},_click:function(e){var t=this;clearTimeout(t._focusing),t._focusing=setTimeout(function(){var n,i,o,a=e.target,s=r(a)[0],l=a.value.substring(0,s),c=t._format(t.options.format),u=c[","],d=0;u&&(i=RegExp("\\"+u,"g"),o=RegExp("([\\d\\"+u+"]+)(\\"+c[A]+")?(\\d+)?")),o&&(n=o.exec(l)),n&&(d=n[0].replace(i,"").length,-1!=l.indexOf("(")&&0>t._value&&d++),t._focusin(),r(t.element[0],d)})},_change:function(e){var t=this;t._update(e),e=t._value,t._old!=e&&(t._old=e,t._typing||t.element.trigger(p),t.trigger(p)),t._typing=!1},_culture:function(e){return e||h(this.options.culture)},_focusin:function(){var e=this;e._inputWrapper.addClass(C),e._toggleText(!1),e.element[0].focus()},_focusout:function(){var e=this;clearTimeout(e._focusing),e._inputWrapper.removeClass(C).removeClass(S),e._blur()},_format:function(e,t){var n=this._culture(t).numberFormat;return e=e.toLowerCase(),e.indexOf("c")>-1?n=n.currency:e.indexOf("p")>-1&&(n=n.percent),n},_input:function(){var t,n=this,i="k-formatted-value",r=n.element.addClass(v).show()[0],o=r.accessKey,a=n.wrapper;t=a.find(A+i),t[0]||(t=e('<input type="text"/>').insertBefore(r).addClass(i));try{r.setAttribute("type","text")}catch(s){r.type="text"}t[0].tabIndex=r.tabIndex,t[0].style.cssText=r.style.cssText,t[0].title=r.title,t.prop("placeholder",n.options.placeholder),o&&(t.attr("accesskey",o),r.accessKey=""),n._text=t.addClass(r.className)},_keydown:function(e){var t=this,n=e.keyCode;t._key=n,n==o.DOWN?t._step(-1):n==o.UP?t._step(1):n==o.ENTER?t._change(t.element.val()):t._typing=!0},_keypress:function(e){var t,n,i,a,s,l,c,u,d,h,f;0===e.which||e.metaKey||e.ctrlKey||e.keyCode===o.BACKSPACE||e.keyCode===o.ENTER||(t=this,n=t.options.min,i=t.element,a=r(i),s=a[0],l=a[1],c=String.fromCharCode(e.which),u=t._format(t.options.format),d=t._key===o.NUMPAD_DOT,h=i.val(),d&&(c=u[A]),h=h.substring(0,s)+c+h.substring(l),f=t._numericRegex(u).test(h),f&&d?(i.val(h),r(i,s+c.length),e.preventDefault()):(null!==n&&n>=0&&"-"===h.charAt(0)||!f)&&e.preventDefault(),t._key=0)},_numericRegex:function(e){var t=this,n=e[A],i=t.options.decimals;return n===A&&(n="\\"+n),i===z&&(i=e.decimals),0===i?I:(t._separator!==n&&(t._separator=n,t._floatRegExp=RegExp("^(-)?(((\\d+("+n+"\\d*)?)|("+n+"\\d*)))?$")),t._floatRegExp)},_paste:function(e){var t=this,n=e.target,i=n.value;setTimeout(function(){t._parse(n.value)===z&&t._update(i)})},_option:function(e,n){var i=this,r=i.options;return n===t?r[e]:(n=i._parse(n),(n||"step"!==e)&&(r[e]=n,i.element.attr("aria-value"+e,n).attr(e,n)),t)},_spin:function(e,t){var n=this;t=t||500,clearTimeout(n._spinning),n._spinning=setTimeout(function(){n._spin(e,50)},t),n._step(e)},_step:function(e){var t=this,n=t.element,i=t._parse(n.val())||0;l()!=n[0]&&t._focusin(),i+=t.options.step*e,t._update(t._adjust(i)),t._typing=!1,t.trigger(_)},_toggleHover:function(t){e(t.currentTarget).toggleClass(S,"mouseenter"===t.type)},_toggleText:function(e){var t=this;t._text.toggle(e),t.element.toggle(!e)},_parse:function(e,t){return u(e,this._culture(t),this.options.format)},_update:function(e){var t,n=this,r=n.options,o=r.format,a=r.decimals,s=n._culture(),l=n._format(o,s);a===z&&(a=l.decimals),e=n._parse(e,s),t=e!==z,t&&(e=parseFloat(f(e,a))),n._value=e=n._adjust(e),n._placeholder(i.toString(e,o,s)),t?(e=""+e,-1!==e.indexOf("e")&&(e=f(+e,a)),e=e.replace(A,l[A])):e="",n.element.val(e).attr("aria-valuenow",e)},_placeholder:function(e){this._text.val(e),d||e||this._text.val(this.options.placeholder)},_wrapper:function(){var t,n=this,i=n.element,r=i[0];t=i.parents(".k-numerictextbox"),t.is("span.k-numerictextbox")||(t=i.hide().wrap('<span class="k-numeric-wrap k-state-default" />').parent(),t=t.wrap("<span/>").parent()),t[0].style.cssText=r.style.cssText,r.style.width="",n.wrapper=t.addClass("k-widget k-numerictextbox").addClass(r.className).css("display",""),n._inputWrapper=e(t[0].firstChild)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){setTimeout(function(){t.value(n[0].value),t.max(t._initialOptions.max),t.min(t._initialOptions.min)})},t._form=r.on("reset",t._resetHandler))}});a.plugin(B)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t){return t=null!=t?t:"",t.type||e.type(t)||"string"}function i(t){t.find(":input:not(:button, ["+s.attr("role")+"=upload], ["+s.attr("skip")+"], [type=file]), select").each(function(){var t=s.attr("bind"),n=this.getAttribute(t)||"",i="checkbox"===this.type||"radio"===this.type?"checked:":"value:",r=this.name;-1===n.indexOf(i)&&r&&(n+=(n.length?",":"")+i+r,e(this).attr(t,n))})}function r(e){var t,i,r=(e.model.fields||e.model)[e.field],o=n(r),a=r?r.validation:{},l=s.attr("type"),c=s.attr("bind"),u={name:e.field};for(t in a)i=a[t],p(t,_)>=0?u[l]=t:h(i)||(u[t]=f(i)?i.value||t:i),u[s.attr(t+"-msg")]=i.message;return p(o,_)>=0&&(u[l]=o),u[c]=("boolean"===o?"checked:":"value:")+e.field,u}function o(e){var t,n,i,r,o,a;if(e&&e.length)for(a=[],t=0,n=e.length;n>t;t++)i=e[t],o=i.text||i.value||i,r=null==i.value?i.text||i:i.value,a[t]={text:o,value:r};return a}function a(e,t){var n,i,r=e?e.validation||{}:{};for(n in r)i=r[n],f(i)&&i.value&&(i=i.value),h(i)&&(t[n]=i)}var s=window.kendo,l=s.ui,c=l.Widget,u=e.extend,d=s.support.browser.msie&&9>s.support.browser.version,h=s.isFunction,f=e.isPlainObject,p=e.inArray,g=/("|\%|'|\[|\]|\$|\.|\,|\:|\;|\+|\*|\&|\!|\#|\(|\)|<|>|\=|\?|\@|\^|\{|\}|\~|\/|\||`)/g,m='<div class="k-widget k-tooltip k-tooltip-validation" style="margin:0.5em"><span class="k-icon k-warning"> </span>#=message#<div class="k-callout k-callout-n"></div></div>',v="change",_=["url","email","number","date","boolean"],y={number:function(t,n){var i=r(n);e('<input type="text"/>').attr(i).appendTo(t).kendoNumericTextBox({format:n.format}),e("<span "+s.attr("for")+'="'+n.field+'" class="k-invalid-msg"/>').hide().appendTo(t)},date:function(t,n){var i=r(n),o=n.format;o&&(o=s._extractFormat(o)),i[s.attr("format")]=o,e('<input type="text"/>').attr(i).appendTo(t).kendoDatePicker({format:n.format}),e("<span "+s.attr("for")+'="'+n.field+'" class="k-invalid-msg"/>').hide().appendTo(t)},string:function(t,n){var i=r(n);e('<input type="text" class="k-input k-textbox"/>').attr(i).appendTo(t)},"boolean":function(t,n){var i=r(n);e('<input type="checkbox" />').attr(i).appendTo(t)},values:function(t,n){var i=r(n),a=s.stringify(o(n.values));e("<select "+s.attr("text-field")+'="text"'+s.attr("value-field")+'="value"'+s.attr("source")+"='"+(a?a.replace(/\'/g,"&apos;"):a)+"'"+s.attr("role")+'="dropdownlist"/>').attr(i).appendTo(t),e("<span "+s.attr("for")+'="'+n.field+'" class="k-invalid-msg"/>').hide().appendTo(t)}},b=c.extend({init:function(t,n){var i=this;n.target&&(n.$angular=n.target.options.$angular),c.fn.init.call(i,t,n),i._validateProxy=e.proxy(i._validate,i),i.refresh()},events:[v],options:{name:"Editable",editors:y,clearContainer:!0,errorTemplate:m},editor:function(e,t){var i=this,r=i.options.editors,o=f(e),a=o?e.field:e,l=i.options.model||{},c=o&&e.values,d=c?"values":n(t),h=o&&e.editor,p=h?e.editor:r[d],m=i.element.find("["+s.attr("container-for")+"="+a.replace(g,"\\$1")+"]");p=p?p:r.string,h&&"string"==typeof e.editor&&(p=function(t){t.append(e.editor)}),m=m.length?m:i.element,p(m,u(!0,{},o?e:{field:a},{model:l}))},_validate:function(t){var n,i=this,r=t.value,o=i._validationEventInProgress,a={},l=s.attr("bind"),c=t.field.replace(g,"\\$1"),u=RegExp("(value|checked)\\s*:\\s*"+c+"\\s*(,|$)");a[t.field]=t.value,n=e(":input["+l+'*="'+c+'"]',i.element).filter("["+s.attr("validate")+"!='false']").filter(function(){return u.test(e(this).attr(l))}),n.length>1&&(n=n.filter(function(){var t=e(this);return!t.is(":radio")||t.val()==r}));try{i._validationEventInProgress=!0,(!i.validatable.validateInput(n)||!o&&i.trigger(v,{values:a}))&&t.preventDefault()}finally{i._validationEventInProgress=!1}},end:function(){return this.validatable.validate()},destroy:function(){var e=this;e.angular("cleanup",function(){return{elements:e.element}}),c.fn.destroy.call(e),e.options.model.unbind("set",e._validateProxy),s.unbind(e.element),e.validatable&&e.validatable.destroy(),s.destroy(e.element),e.element.removeData("kendoValidator"),e.element.is("["+s.attr("role")+"=editable]")&&e.element.removeAttr(s.attr("role"))},refresh:function(){var n,r,o,l,c,u,h,p,g=this,m=g.options.fields||[],v=g.options.clearContainer?g.element.empty():g.element,_=g.options.model||{},y={};for(e.isArray(m)||(m=[m]),n=0,r=m.length;r>n;n++)o=m[n],l=f(o),c=l?o.field:o,u=(_.fields||_)[c],a(u,y),g.editor(o,u);if(g.options.target&&g.angular("compile",function(){return{elements:v,data:v.map(function(){return{dataItem:_}})}}),!r){h=_.fields||_;for(c in h)a(h[c],y)}i(v),g.validatable&&g.validatable.destroy(),s.bind(v,g.options.model),g.options.model.unbind("set",g._validateProxy),g.options.model.bind("set",g._validateProxy),g.validatable=new s.ui.Validator(v,{validateOnBlur:!1,errorTemplate:g.options.errorTemplate||t,rules:y}),p=v.find(":kendoFocusable").eq(0).focus(),d&&p.focus()}});l.plugin(b)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i="change",r="cancel",o="dataBound",a="dataBinding",s=n.ui.Widget,l=n.keys,c=">*",u="progress",d="error",h="k-state-focused",f="k-state-selected",p="k-edit-item",g="edit",m="remove",v="save",_="click",y=".kendoListView",b=e.proxy,w=n._activeElement,x=n.ui.progress,k=n.data.DataSource,C=n.ui.DataBoundWidget.extend({init:function(t,i){var r=this;i=e.isArray(i)?{dataSource:i}:i,s.fn.init.call(r,t,i),i=r.options,r.wrapper=t=r.element,t[0].id&&(r._itemId=t[0].id+"_lv_active"),r._element(),r._dataSource(),r._templates(),r._navigatable(),r._selectable(),r._pageable(),r._crudHandlers(),r.options.autoBind&&r.dataSource.fetch(),n.notify(r)},events:[i,r,a,o,g,m,v],options:{name:"ListView",autoBind:!0,selectable:!1,navigatable:!1,template:"",altTemplate:"",editTemplate:""},setOptions:function(e){s.fn.setOptions.call(this,e),this._templates(),this.selectable&&(this.selectable.destroy(),this.selectable=null),this._selectable()},_templates:function(){var e=this.options;this.template=n.template(e.template||""),this.altTemplate=n.template(e.altTemplate||e.template),this.editTemplate=n.template(e.editTemplate||"")},_item:function(e){return this.element.children()[e]()},items:function(){return this.element.children()},dataItem:function(t){var i=n.attr("uid"),r=e(t).closest("["+i+"]").attr(i);return this.dataSource.getByUid(r)},setDataSource:function(e){this.options.dataSource=e,this._dataSource(),this.options.autoBind&&e.fetch()},_unbindDataSource:function(){var e=this;e.dataSource.unbind(i,e._refreshHandler).unbind(u,e._progressHandler).unbind(d,e._errorHandler)},_dataSource:function(){var e=this;e.dataSource&&e._refreshHandler?e._unbindDataSource():(e._refreshHandler=b(e.refresh,e),e._progressHandler=b(e._progress,e),e._errorHandler=b(e._error,e)),e.dataSource=k.create(e.options.dataSource).bind(i,e._refreshHandler).bind(u,e._progressHandler).bind(d,e._errorHandler)},_progress:function(){x(this.element,!0)},_error:function(){x(this.element,!1)},_element:function(){this.element.addClass("k-widget k-listview").attr("role","listbox")},refresh:function(e){var i,r,s,l,c,u=this,d=u.dataSource.view(),h="",f=u.template,p=u.altTemplate,g=w();if(e=e||{},"itemchange"===e.action)return u._hasBindingTarget()||u.editable||(i=e.items[0],s=u.items().filter("["+n.attr("uid")+"="+i.uid+"]"),s.length>0&&(l=s.index(),u.angular("cleanup",function(){return{elements:[s]}}),s.replaceWith(f(i)),s=u.items().eq(l),s.attr(n.attr("uid"),i.uid),u.angular("compile",function(){return{elements:[s],data:[{dataItem:i}]}}),u.trigger("itemChange",{item:s,data:i}))),t;if(!u.trigger(a,{action:e.action||"rebind",items:e.items,index:e.index})){for(u._angularItems("cleanup"),u._destroyEditable(),l=0,c=d.length;c>l;l++)h+=l%2?p(d[l]):f(d[l]);for(u.element.html(h),r=u.items(),l=0,c=d.length;c>l;l++)r.eq(l).attr(n.attr("uid"),d[l].uid).attr("role","option").attr("aria-selected","false");u.element[0]===g&&u.options.navigatable&&u.current(r.eq(0)),u._angularItems("compile"),u.trigger(o)}},_pageable:function(){var t,i,r=this,o=r.options.pageable;e.isPlainObject(o)&&(i=o.pagerId,t=e.extend({},o,{dataSource:r.dataSource,pagerId:null}),r.pager=new n.ui.Pager(e("#"+i),t))},_selectable:function(){var e,r,o=this,a=o.options.selectable,s=o.options.navigatable;a&&(e=n.ui.Selectable.parseOptions(a).multiple,o.selectable=new n.ui.Selectable(o.element,{aria:!0,multiple:e,filter:c,change:function(){o.trigger(i)}}),s&&o.element.on("keydown"+y,function(n){if(n.keyCode===l.SPACEBAR){if(r=o.current(),n.target==n.currentTarget&&n.preventDefault(),e)if(n.ctrlKey){if(r&&r.hasClass(f))return r.removeClass(f),t}else o.selectable.clear();else o.selectable.clear();o.selectable.value(r)}}))},current:function(e){var n=this,i=n.element,r=n._current,o=n._itemId;return e===t?r:(r&&r[0]&&(r[0].id===o&&r.removeAttr("id"),r.removeClass(h),i.removeAttr("aria-activedescendant")),e&&e[0]&&(o=e[0].id||o,n._scrollTo(e[0]),i.attr("aria-activedescendant",o),e.addClass(h).attr("id",o)),n._current=e,t)},_scrollTo:function(t){var n,i,r=this,o=!1,a="scroll";"auto"==r.wrapper.css("overflow")||r.wrapper.css("overflow")==a?n=r.wrapper[0]:(n=window,o=!0),i=function(i,r){var s=o?e(t).offset()[i.toLowerCase()]:t["offset"+i],l=t["client"+r],c=e(n)[a+i](),u=e(n)[r.toLowerCase()]();s+l>c+u?e(n)[a+i](s+l-u):c>s&&e(n)[a+i](s)},i("Top","Height"),i("Left","Width")},_navigatable:function(){var t=this,i=t.options.navigatable,r=t.element,o=function(n){t.current(e(n.currentTarget)),e(n.target).is(":button,a,:input,a>.k-icon,textarea")||r.focus()};i&&(t._tabindex(),r.on("focus"+y,function(){var e=t._current;e&&e.is(":visible")||(e=t._item("first")),t.current(e)}).on("focusout"+y,function(){t._current&&t._current.removeClass(h)}).on("keydown"+y,function(i){var o,a,s=i.keyCode,c=t.current(),u=e(i.target),d=!u.is(":button,textarea,a,a>.t-icon,input"),h=u.is(":text"),f=n.preventDefault,g=r.find("."+p),m=w();if(!(!d&&!h&&l.ESC!=s||h&&l.ESC!=s&&l.ENTER!=s))if(l.UP===s||l.LEFT===s)c&&(c=c.prev()),t.current(c&&c[0]?c:t._item("last")),f(i);else if(l.DOWN===s||l.RIGHT===s)c&&(c=c.next()),t.current(c&&c[0]?c:t._item("first")),f(i);else if(l.PAGEUP===s)t.current(null),t.dataSource.page(t.dataSource.page()-1),f(i);else if(l.PAGEDOWN===s)t.current(null),t.dataSource.page(t.dataSource.page()+1),f(i);else if(l.HOME===s)t.current(t._item("first")),f(i);else if(l.END===s)t.current(t._item("last")),f(i);else if(l.ENTER===s)0!==g.length&&(d||h)?(o=t.items().index(g),m&&m.blur(),t.save(),a=function(){t.element.trigger("focus"),t.current(t.items().eq(o))},t.one("dataBound",a)):""!==t.options.editTemplate&&t.edit(c);else if(l.ESC===s){if(g=r.find("."+p),0===g.length)return;o=t.items().index(g),t.cancel(),t.element.trigger("focus"),t.current(t.items().eq(o))}}),r.on("mousedown"+y+" touchstart"+y,c,b(o,t)))},clearSelection:function(){var e=this;e.selectable.clear(),e.trigger(i)},select:function(n){var i=this,r=i.selectable;return n=e(n),n.length?(r.options.multiple||(r.clear(),n=n.first()),r.value(n),t):r.value()},_destroyEditable:function(){var e=this;e.editable&&(e.editable.destroy(),delete e.editable)},_modelFromElement:function(e){var t=e.attr(n.attr("uid"));return this.dataSource.getByUid(t)},_closeEditable:function(){var e,t,i,r=this,o=r.editable,a=r.template;return o&&(o.element.index()%2&&(a=r.altTemplate),r.angular("cleanup",function(){return{elements:[o.element]}}),e=r._modelFromElement(o.element),r._destroyEditable(),i=o.element.index(),o.element.replaceWith(a(e)),t=r.items().eq(i),t.attr(n.attr("uid"),e.uid),r._hasBindingTarget()&&n.bind(t,e),r.angular("compile",function(){return{elements:[t],data:[{dataItem:e}]}})),!0},edit:function(e){var t,i,r=this,o=r._modelFromElement(e),a=o.uid;r.cancel(),e=r.items().filter("["+n.attr("uid")+"="+a+"]"),i=e.index(),e.replaceWith(r.editTemplate(o)),t=r.items().eq(i).addClass(p).attr(n.attr("uid"),o.uid),r.editable=t.kendoEditable({model:o,clearContainer:!1,errorTemplate:!1,target:r}).data("kendoEditable"),r.trigger(g,{model:o,item:t})},save:function(){var e,t,n=this,i=n.editable;i&&(t=i.element,e=n._modelFromElement(t),i.end()&&!n.trigger(v,{model:e,item:t})&&(n._closeEditable(),n.dataSource.sync()))},remove:function(e){var t=this,n=t.dataSource,i=t._modelFromElement(e);t.editable&&(n.cancelChanges(t._modelFromElement(t.editable.element)),t._closeEditable()),t.trigger(m,{model:i,item:e})||(e.hide(),n.remove(i),n.sync())},add:function(){var e,t=this,n=t.dataSource,i=n.indexOf((n.view()||[])[0]);0>i&&(i=0),
t.cancel(),e=n.insert(i,{}),t.edit(t.element.find("[data-uid='"+e.uid+"']"))},cancel:function(){var e,t,n=this,i=n.dataSource;n.editable&&(e=n.editable.element,t=n._modelFromElement(e),n.trigger(r,{model:t,container:e})||(i.cancelChanges(t),n._closeEditable()))},_crudHandlers:function(){var t=this,i=_+y;t.element.on(i,".k-edit-button",function(i){var r=e(this).closest("["+n.attr("uid")+"]");t.edit(r),i.preventDefault()}),t.element.on(i,".k-delete-button",function(i){var r=e(this).closest("["+n.attr("uid")+"]");t.remove(r),i.preventDefault()}),t.element.on(i,".k-update-button",function(e){t.save(),e.preventDefault()}),t.element.on(i,".k-cancel-button",function(e){t.cancel(),e.preventDefault()})},destroy:function(){var e=this;s.fn.destroy.call(e),e._unbindDataSource(),e._destroyEditable(),e.element.off(y),e.pager&&e.pager.destroy(),n.destroy(e.element)}});n.ui.plugin(C)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.caret,r=n.keys,o=n.ui,a=o.Widget,s=".kendoMaskedTextBox",l=e.proxy,c=(n.support.propertyChangeEvent?"propertychange":"input")+s,u="k-state-disabled",d="disabled",h="readonly",f="change",p=a.extend({init:function(t,r){var o,l,c=this;a.fn.init.call(c,t,r),c._rules=e.extend({},c.rules,c.options.rules),t=c.element,o=t[0],c.wrapper=t,c._tokenize(),c._form(),c.element.addClass("k-textbox").attr("autocomplete","off").on("focus"+s,function(){var e=o.value;e?c._togglePrompt(!0):o.value=c._old=c._emptyMask,c._oldValue=e,c._timeoutId=setTimeout(function(){i(t,0,e?c._maskLength:0)})}).on("focusout"+s,function(){var e=t.val();clearTimeout(c._timeoutId),o.value=c._old="",e!==c._emptyMask&&(o.value=c._old=e),c._change(),c._togglePrompt()}),l=t.is("[disabled]")||e(c.element).parents("fieldset").is(":disabled"),l?c.enable(!1):c.readonly(t.is("[readonly]")),c.value(c.options.value||t.val()),n.notify(c)},options:{name:"MaskedTextBox",clearPromptChar:!1,unmaskOnPost:!1,promptChar:"_",culture:"",rules:{},value:"",mask:""},events:[f],rules:{0:/\d/,9:/\d|\s/,"#":/\d|\s|\+|\-/,L:/[a-zA-Z]/,"?":/[a-zA-Z]|\s/,"&":/\S/,C:/./,A:/[a-zA-Z0-9]/,a:/[a-zA-Z0-9]|\s/},setOptions:function(t){var n=this;a.fn.setOptions.call(n,t),n._rules=e.extend({},n.rules,n.options.rules),n._tokenize(),this._unbindInput(),this._bindInput(),n.value(n.element.val())},destroy:function(){var e=this;e.element.off(s),e._formElement&&(e._formElement.off("reset",e._resetHandler),e._formElement.off("submit",e._submitHandler)),a.fn.destroy.call(e)},raw:function(){var e=this._unmask(this.element.val(),0);return e.replace(RegExp(this.options.promptChar,"g"),"")},value:function(e){var i=this.element,r=this._emptyMask;return e===t?this.element.val():(null===e&&(e=""),r?(e=this._unmask(e+""),i.val(e?r:""),this._mask(0,this._maskLength,e),e=i.val(),this._oldValue=e,n._activeElement()!==i&&(e===r?i.val(""):this._togglePrompt()),t):(i.val(e),t))},_togglePrompt:function(e){var t=this.element[0],n=t.value;this.options.clearPromptChar&&(n=e?this._oldValue:n.replace(RegExp(this.options.promptChar,"g")," "),t.value=this._old=n)},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},_bindInput:function(){var e=this;e._maskLength&&e.element.on("keydown"+s,l(e._keydown,e)).on("keypress"+s,l(e._keypress,e)).on("paste"+s,l(e._paste,e)).on(c,l(e._propertyChange,e))},_unbindInput:function(){this.element.off("keydown"+s).off("keypress"+s).off("paste"+s).off(c)},_editable:function(e){var t=this,n=t.element,i=e.disable,r=e.readonly;t._unbindInput(),r||i?n.attr(d,i).attr(h,r).toggleClass(u,i):(n.removeAttr(d).removeAttr(h).removeClass(u),t._bindInput())},_change:function(){var e=this,t=e.value();t!==e._oldValue&&(e._oldValue=t,e.trigger(f),e.element.trigger(f))},_propertyChange:function(){var e,t,r=this,o=r.element[0],a=o.value;n._activeElement()===o&&(a===r._old||r._pasting||(t=i(o)[0],e=r._unmask(a.substring(t),t),o.value=r._old=a.substring(0,t)+r._emptyMask.substring(t),r._mask(t,t,e),i(o,t)))},_paste:function(e){var t=this,n=e.target,r=i(n),o=r[0],a=r[1],s=t._unmask(n.value.substring(a),a);t._pasting=!0,setTimeout(function(){var e=n.value,r=e.substring(o,i(n)[0]);n.value=t._old=e.substring(0,o)+t._emptyMask.substring(o),t._mask(o,o,r),o=i(n)[0],t._mask(o,o,s),i(n,o),t._pasting=!1})},_form:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){setTimeout(function(){t.value(n[0].value)})},t._submitHandler=function(){t.element[0].value=t._old=t.raw()},t.options.unmaskOnPost&&r.on("submit",t._submitHandler),t._formElement=r.on("reset",t._resetHandler))},_keydown:function(e){var n,o=e.keyCode,a=this.element[0],s=i(a),l=s[0],c=s[1],u=o===r.BACKSPACE;u||o===r.DELETE?(l===c&&(u?l-=1:c+=1,n=this._find(l,u)),n!==t&&n!==l?(u&&(n+=1),i(a,n)):l>-1&&this._mask(l,c,"",u),e.preventDefault()):o===r.ENTER&&this._change()},_keypress:function(e){var t,n;0===e.which||e.metaKey||e.ctrlKey||e.keyCode===r.ENTER||(t=String.fromCharCode(e.which),n=i(this.element),this._mask(n[0],n[1],t),(e.keyCode===r.BACKSPACE||t)&&e.preventDefault())},_find:function(e,t){var n=this.element.val()||this._emptyMask,i=1;for(t===!0&&(i=-1);e>-1||this._maskLength>=e;){if(n.charAt(e)!==this.tokens[e])return e;e+=i}return-1},_mask:function(e,r,o,a){var s,l,c,u,d=this.element[0],h=d.value||this._emptyMask,f=this.options.promptChar,p=0;for(e=this._find(e,a),e>r&&(r=e),l=this._unmask(h.substring(r),r),o=this._unmask(o,e),s=o.length,o&&(l=l.replace(RegExp("^_{0,"+s+"}"),"")),o+=l,h=h.split(""),c=o.charAt(p);this._maskLength>e;)h[e]=c||f,c=o.charAt(++p),u===t&&p>s&&(u=e),e=this._find(e+1);d.value=this._old=h.join(""),n._activeElement()===d&&(u===t&&(u=this._maskLength),i(d,u))},_unmask:function(t,n){var i,r,o,a,s,l,c,u;if(!t)return"";for(t=(t+"").split(""),o=0,a=n||0,s=this.options.promptChar,l=t.length,c=this.tokens.length,u="";c>a&&(i=t[o],r=this.tokens[a],i===r||i===s?(u+=i===s?s:"",o+=1,a+=1):"string"!=typeof r?((r.test&&r.test(i)||e.isFunction(r)&&r(i))&&(u+=i,a+=1),o+=1):a+=1,!(o>=l)););return u},_tokenize:function(){for(var e,t,i,r,o=[],a=0,s=this.options.mask||"",l=s.split(""),c=l.length,u=0,d="",h=this.options.promptChar,f=n.getCulture(this.options.culture).numberFormat,p=this._rules;c>u;u++)if(e=l[u],t=p[e])o[a]=t,d+=h,a+=1;else for("."===e||","===e?e=f[e]:"$"===e?e=f.currency.symbol:"\\"===e&&(u+=1,e=l[u]),e=e.split(""),i=0,r=e.length;r>i;i++)o[a]=e[i],d+=e[i],a+=1;this.tokens=o,this._emptyMask=d,this._maskLength=d.length}});o.plugin(p)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t){return e=e.split(" ")[!t+0]||e,e.replace("top","up").replace("bottom","down")}function i(e,t,n){e=e.split(" ")[!t+0]||e;var i={origin:["bottom",n?"right":"left"],position:["top",n?"right":"left"]},r=/left|right/.test(e);return r?(i.origin=["top",e],i.position[1]=c.directions[e].reverse):(i.origin[0]=e,i.position[0]=c.directions[e].reverse),i.origin=i.origin.join(" "),i.position=i.position.join(" "),i}function r(t,n){try{return e.contains(t,n)}catch(i){return!1}}function o(t){t=e(t),t.addClass("k-item").children(k).addClass(P),t.children("a").addClass(T).children(k).addClass(P),t.filter(":not([disabled])").addClass(G),t.filter(".k-separator:empty").append("&nbsp;"),t.filter("li[disabled]").addClass(Y).removeAttr("disabled").attr("aria-disabled",!0),t.filter("[role]").length||t.attr("role","menuitem"),t.children("."+T).length||t.contents().filter(function(){return!(this.nodeName.match(w)||3==this.nodeType&&!e.trim(this.nodeValue))}).wrapAll("<span class='"+T+"'/>"),a(t),s(t)}function a(t){t=e(t),t.find("> .k-link > [class*=k-i-arrow]:not(.k-sprite)").remove(),t.filter(":has(.k-menu-group)").children(".k-link:not(:has([class*=k-i-arrow]:not(.k-sprite)))").each(function(){var t=e(this),n=t.parent().parent();t.append("<span class='k-icon "+(n.hasClass(S+"-horizontal")?"k-i-arrow-s":"k-i-arrow-e")+"'/>")})}function s(t){t=e(t),t.filter(".k-first:not(:first-child)").removeClass(E),t.filter(".k-last:not(:last-child)").removeClass(A),t.filter(":first-child").addClass(E),t.filter(":last-child").addClass(A)}var l,c=window.kendo,u=c.ui,d=c._activeElement,h=c.support.touch&&c.support.mobileOS,f="mousedown",p="click",g=e.extend,m=e.proxy,v=e.each,_=c.template,y=c.keys,b=u.Widget,w=/^(ul|a|div)$/i,x=".kendoMenu",k="img",C="open",S="k-menu",T="k-link",A="k-last",D="close",M="timer",E="k-first",P="k-image",I="select",z="zIndex",R="activate",F="deactivate",B="touchstart"+x+" MSPointerDown"+x+" pointerdown"+x,L=c.support.pointers,O=c.support.msPointers,H=O||L,N=L?"pointerover":O?"MSPointerOver":"mouseenter",V=L?"pointerout":O?"MSPointerOut":"mouseleave",U=h||H,W=e(document.documentElement),j="kendoPopup",G="k-state-default",q="k-state-hover",$="k-state-focused",Y="k-state-disabled",K=".k-menu",Q=".k-menu-group",X=Q+",.k-animation-container",J=":not(.k-list) > .k-item",Z=".k-item.k-state-disabled",ee=".k-item:not(.k-state-disabled)",te=".k-item:not(.k-state-disabled) > .k-link",ne=":not(.k-item.k-separator)",ie=ne+":eq(0)",re=ne+":last",oe="> div:not(.k-animation-container,.k-list-container)",ae={2:1,touch:1},se={content:_("<div class='k-content #= groupCssClass() #' tabindex='-1'>#= content(item) #</div>"),group:_("<ul class='#= groupCssClass(group) #'#= groupAttributes(group) # role='menu' aria-hidden='true'>#= renderItems(data) #</ul>"),itemWrapper:_("<#= tag(item) # class='#= textClass(item) #'#= textAttributes(item) #>#= image(item) ##= sprite(item) ##= text(item) ##= arrow(data) #</#= tag(item) #>"),item:_("<li class='#= wrapperCssClass(group, item) #' role='menuitem' #=item.items ? \"aria-haspopup='true'\": \"\"##=item.enabled === false ? \"aria-disabled='true'\" : ''#>#= itemWrapper(data) ## if (item.items) { ##= subGroup({ items: item.items, menu: menu, group: { expanded: item.expanded } }) ## } else if (item.content || item.contentUrl) { ##= renderContent(data) ## } #</li>"),image:_("<img class='k-image' alt='' src='#= imageUrl #' />"),arrow:_("<span class='#= arrowClass(item, group) #'></span>"),sprite:_("<span class='k-sprite #= spriteCssClass #'></span>"),empty:_("")},le={wrapperCssClass:function(e,t){var n="k-item",i=t.index;return n+=t.enabled===!1?" k-state-disabled":" k-state-default",e.firstLevel&&0===i&&(n+=" k-first"),i==e.length-1&&(n+=" k-last"),t.cssClass&&(n+=" "+t.cssClass),n},textClass:function(){return T},textAttributes:function(e){return e.url?" href='"+e.url+"'":""},arrowClass:function(e,t){var n="k-icon";return n+=t.horizontal?" k-i-arrow-s":" k-i-arrow-e"},text:function(e){return e.encoded===!1?e.text:c.htmlEncode(e.text)},tag:function(e){return e.url?"a":"span"},groupAttributes:function(e){return e.expanded!==!0?" style='display:none'":""},groupCssClass:function(){return"k-group k-menu-group"},content:function(e){return e.content?e.content:"&nbsp;"}},ce=b.extend({init:function(t,n){var i=this;b.fn.init.call(i,t,n),t=i.wrapper=i.element,n=i.options,i._initData(n),i._updateClasses(),i._animations(n),i.nextItemZIndex=100,i._tabindex(),i._focusProxy=m(i._focusHandler,i),t.on(B,ee,i._focusProxy).on(p+x,Z,!1).on(p+x,ee,m(i._click,i)).on("keydown"+x,m(i._keydown,i)).on("focus"+x,m(i._focus,i)).on("focus"+x,".k-content",m(i._focus,i)).on(B+" "+f+x,".k-content",m(i._preventClose,i)).on("blur"+x,m(i._removeHoverItem,i)).on("blur"+x,"[tabindex]",m(i._checkActiveElement,i)).on(N+x,ee,m(i._mouseenter,i)).on(V+x,ee,m(i._mouseleave,i)).on(N+x+" "+V+x+" "+f+x+" "+p+x,te,m(i._toggleHover,i)),n.openOnClick&&(i.clicked=!1,i._documentClickHandler=m(i._documentClick,i),e(document).click(i._documentClickHandler)),t.attr("role","menubar"),t[0].id&&(i._ariaId=c.format("{0}_mn_active",t[0].id)),c.notify(i)},events:[C,D,R,F,I],options:{name:"Menu",animation:{open:{duration:200},close:{duration:100}},orientation:"horizontal",direction:"default",openOnClick:!1,closeOnClick:!0,hoverDelay:100,popupCollision:t},_initData:function(e){var t=this;e.dataSource&&(t.angular("cleanup",function(){return{elements:t.element.children()}}),t.element.empty(),t.append(e.dataSource,t.element),t.angular("compile",function(){return{elements:t.element.children()}}))},setOptions:function(e){var t=this.options.animation;this._animations(e),e.animation=g(!0,t,e.animation),"dataSource"in e&&this._initData(e),this._updateClasses(),b.fn.setOptions.call(this,e)},destroy:function(){var t=this;b.fn.destroy.call(t),t.element.off(x),t._documentClickHandler&&e(document).unbind("click",t._documentClickHandler),c.destroy(t.element)},enable:function(e,t){return this._toggleDisabled(e,t!==!1),this},disable:function(e){return this._toggleDisabled(e,!1),this},append:function(e,t){t=this.element.find(t);var n=this._insert(e,t,t.length?t.find("> .k-menu-group, > .k-animation-container > .k-menu-group"):null);return v(n.items,function(){n.group.append(this),a(this)}),a(t),s(n.group.find(".k-first, .k-last").add(n.items)),this},insertBefore:function(e,t){t=this.element.find(t);var n=this._insert(e,t,t.parent());return v(n.items,function(){t.before(this),a(this),s(this)}),s(t),this},insertAfter:function(e,t){t=this.element.find(t);var n=this._insert(e,t,t.parent());return v(n.items,function(){t.after(this),a(this),s(this)}),s(t),this},_insert:function(t,n,i){var r,a,s,l,c=this;return n&&n.length||(i=c.element),s=e.isPlainObject(t),l={firstLevel:i.hasClass(S),horizontal:i.hasClass(S+"-horizontal"),expanded:!0,length:i.children().length},n&&!i.length&&(i=e(ce.renderGroup({group:l})).appendTo(n)),s||e.isArray(t)?r=e(e.map(s?[t]:t,function(t,n){return"string"==typeof t?e(t).get():e(ce.renderItem({group:l,item:g(t,{index:n})})).get()})):(r="string"==typeof t&&"<"!=t.charAt(0)?c.element.find(t):e(t),a=r.find("> ul").addClass("k-menu-group").attr("role","menu"),r=r.filter("li"),r.add(a.find("> li")).each(function(){o(this)})),{items:r,group:i}},remove:function(e){var t,n,i,r;return e=this.element.find(e),t=this,n=e.parentsUntil(t.element,J),i=e.parent("ul:not(.k-menu)"),e.remove(),i&&!i.children(J).length&&(r=i.parent(".k-animation-container"),r.length?r.remove():i.remove()),n.length&&(n=n.eq(0),a(n),s(n)),t},open:function(r){var o=this,a=o.options,s="horizontal"==a.orientation,l=a.direction,u=c.support.isRtl(o.wrapper);return r=o.element.find(r),/^(top|bottom|default)$/.test(l)&&(l=u?s?(l+" left").replace("default","bottom"):"left":s?(l+" right").replace("default","bottom"):"right"),r.siblings().find(">.k-popup:visible,>.k-animation-container>.k-popup:visible").each(function(){var t=e(this).data("kendoPopup");t&&t.close()}),r.each(function(){var r=e(this);clearTimeout(r.data(M)),r.data(M,setTimeout(function(){var d,f,p,m,v,_,y,b,w=r.find(".k-menu-group:first:hidden");w[0]&&o._triggerEvent({item:r[0],type:C})===!1&&(!w.find(".k-menu-group")[0]&&w.children(".k-item").length>1?(f=e(window).height(),p=function(){w.css({maxHeight:f-(w.outerHeight()-w.height())-c.getShadows(w).bottom,overflow:"auto"})},c.support.browser.msie&&7>=c.support.browser.version?setTimeout(p,0):p()):w.css({maxHeight:"",overflow:""}),r.data(z,r.css(z)),r.css(z,o.nextItemZIndex++),d=w.data(j),m=r.parent().hasClass(S),v=m&&s,_=i(l,m,u),y=a.animation.open.effects,b=y!==t?y:"slideIn:"+n(l,m),d?(d=w.data(j),d.options.origin=_.origin,d.options.position=_.position,d.options.animation.open.effects=b):d=w.kendoPopup({activate:function(){o._triggerEvent({item:this.wrapper.parent(),type:R})},deactivate:function(e){e.sender.element.removeData("targetTransform").css({opacity:""}),o._triggerEvent({item:this.wrapper.parent(),type:F})},origin:_.origin,position:_.position,collision:a.popupCollision!==t?a.popupCollision:v?"fit":"fit flip",anchor:r,appendTo:r,animation:{open:g(!0,{effects:b},a.animation.open),close:a.animation.close},close:function(e){var t=e.sender.wrapper.parent();o._triggerEvent({item:t[0],type:D})?e.preventDefault():(t.css(z,t.data(z)),t.removeData(z),h&&(t.removeClass(q),o._removeHoverItem()))}}).data(j),w.removeAttr("aria-hidden"),d.open())},o.options.hoverDelay))}),o},close:function(t,n){var i=this,r=i.element;return t=r.find(t),t.length||(t=r.find(">.k-item")),t.each(function(){var t=e(this);!n&&i._isRootItem(t)&&(i.clicked=!1),clearTimeout(t.data(M)),t.data(M,setTimeout(function(){var e=t.find(".k-menu-group:not(.k-list-container):not(.k-calendar-container):first:visible").data(j);e&&(e.close(),e.element.attr("aria-hidden",!0))},i.options.hoverDelay))}),i},_toggleDisabled:function(t,n){this.element.find(t).each(function(){e(this).toggleClass(G,n).toggleClass(Y,!n).attr("aria-disabled",!n)})},_toggleHover:function(t){var n=e(c.eventTarget(t)||t.target).closest(J),i=t.type==N||-1!==f.indexOf(t.type);n.parents("li."+Y).length||n.toggleClass(q,i||"mousedown"==t.type||"click"==t.type),this._removeHoverItem()},_preventClose:function(){this.options.closeOnClick||(this._closurePrevented=!0)},_checkActiveElement:function(t){var n=this,i=e(t?t.currentTarget:this._hoverItem()),o=n._findRootParent(i)[0];this._closurePrevented||setTimeout(function(){(!document.hasFocus()||!r(o,c._activeElement())&&t&&!r(o,t.currentTarget))&&n.close(o)},0),this._closurePrevented=!1},_removeHoverItem:function(){var e=this._hoverItem();e&&e.hasClass($)&&(e.removeClass($),this._oldHoverItem=null)},_updateClasses:function(){var e,t=this.element,n=".k-menu-init div ul";t.removeClass("k-menu-horizontal k-menu-vertical"),t.addClass("k-widget k-reset k-header k-menu-init "+S).addClass(S+"-"+this.options.orientation),t.find("li > ul").filter(function(){return!c.support.matchesSelector.call(this,n)}).addClass("k-group k-menu-group").attr("role","menu").attr("aria-hidden",t.is(":visible")).end().find("li > div").addClass("k-content").attr("tabindex","-1"),e=t.find("> li,.k-menu-group > li"),t.removeClass("k-menu-init"),e.each(function(){o(this)})},_mouseenter:function(t){var n=this,i=e(t.currentTarget),o=i.children(".k-animation-container").length||i.children(Q).length;t.delegateTarget==i.parents(K)[0]&&(n.options.openOnClick&&!n.clicked||h||(L||O)&&t.originalEvent.pointerType in ae&&n._isRootItem(i.closest(J))||!r(t.currentTarget,t.relatedTarget)&&o&&n.open(i),(n.options.openOnClick&&n.clicked||U)&&i.siblings().each(m(function(e,t){n.close(t,!0)},n)))},_mouseleave:function(n){var i=this,o=e(n.currentTarget),a=o.children(".k-animation-container").length||o.children(Q).length;return o.parentsUntil(".k-animation-container",".k-list-container,.k-calendar-container")[0]?(n.stopImmediatePropagation(),t):(i.options.openOnClick||h||(L||O)&&n.originalEvent.pointerType in ae||r(n.currentTarget,n.relatedTarget||n.target)||!a||r(n.currentTarget,c._activeElement())||i.close(o),t)},_click:function(n){var i,r,o,a=this,s=a.options,l=e(c.eventTarget(n)),u=l[0]?l[0].nodeName.toUpperCase():"",d="INPUT"==u||"SELECT"==u||"BUTTON"==u||"LABEL"==u,h=l.closest("."+T),f=l.closest(J),p=h.attr("href"),g=l.attr("href"),m=e("<a href='#' />").attr("href"),v=!!p&&p!==m,_=v&&!!p.match(/^#/),y=!!g&&g!==m,b=s.openOnClick&&o&&a._isRootItem(f);if(!l.closest(oe,f[0]).length){if(f.hasClass(Y))return n.preventDefault(),t;if(n.handled||!a._triggerEvent({item:f[0],type:I})||d||n.preventDefault(),n.handled=!0,r=f.children(X),o=r.is(":visible"),s.closeOnClick&&(!v||_)&&(!r.length||b))return f.removeClass(q).css("height"),a._oldHoverItem=a._findRootParent(f),a.close(h.parentsUntil(a.element,J)),a.clicked=!1,-1!="MSPointerUp".indexOf(n.type)&&n.preventDefault(),t;v&&n.enterKey&&h[0].click(),(a._isRootItem(f)&&s.openOnClick||c.support.touch||(L||O)&&a._isRootItem(f.closest(J)))&&(v||d||y||n.preventDefault(),a.clicked=!0,i=r.is(":visible")?D:C,(s.closeOnClick||i!=D)&&a[i](f))}},_documentClick:function(e){r(this.element[0],e.target)||(this.clicked=!1)},_focus:function(n){var i=this,r=n.target,o=i._hoverItem(),a=d();return r==i.wrapper[0]||e(r).is(":kendoFocusable")?(a===n.currentTarget&&(o.length?i._moveHover([],o):i._oldHoverItem||i._moveHover([],i.wrapper.children().first())),t):(n.stopPropagation(),e(r).closest(".k-content").closest(".k-menu-group").closest(".k-item").addClass($),i.wrapper.focus(),t)},_keydown:function(e){var n,i,r,o=this,a=e.keyCode,s=o._oldHoverItem,l=c.support.isRtl(o.wrapper);if(e.target==e.currentTarget||a==y.ESC){if(s||(s=o._oldHoverItem=o._hoverItem()),i=o._itemBelongsToVertival(s),r=o._itemHasChildren(s),a==y.RIGHT)n=o[l?"_itemLeft":"_itemRight"](s,i,r);else if(a==y.LEFT)n=o[l?"_itemRight":"_itemLeft"](s,i,r);else if(a==y.DOWN)n=o._itemDown(s,i,r);else if(a==y.UP)n=o._itemUp(s,i,r);else if(a==y.ESC)n=o._itemEsc(s,i);else if(a==y.ENTER||a==y.SPACEBAR)n=s.children(".k-link"),n.length>0&&(o._click({target:n[0],preventDefault:function(){},enterKey:!0}),o._moveHover(s,o._findRootParent(s)));else if(a==y.TAB)return n=o._findRootParent(s),o._moveHover(s,n),o._checkActiveElement(),t;n&&n[0]&&(e.preventDefault(),e.stopPropagation())}},_hoverItem:function(){return this.wrapper.find(".k-item.k-state-hover,.k-item.k-state-focused").filter(":visible")},_itemBelongsToVertival:function(e){var t=this.wrapper.hasClass("k-menu-vertical");return e.length?e.parent().hasClass("k-menu-group")||t:t},_itemHasChildren:function(e){return e.length?e.children("ul.k-menu-group, div.k-animation-container").length>0:!1},_moveHover:function(t,n){var i=this,r=i._ariaId;t.length&&n.length&&t.removeClass($),n.length&&(n[0].id&&(r=n[0].id),n.addClass($),i._oldHoverItem=n,r&&(i.element.removeAttr("aria-activedescendant"),e("#"+r).removeAttr("id"),n.attr("id",r),i.element.attr("aria-activedescendant",r)))},_findRootParent:function(e){return this._isRootItem(e)?e:e.parentsUntil(K,"li.k-item").last()},_isRootItem:function(e){return e.parent().hasClass(S)},_itemRight:function(e,t,n){var i,r,o=this;if(!e.hasClass(Y))return t?n?(o.open(e),i=e.find(".k-menu-group").children().first()):"horizontal"==o.options.orientation&&(r=o._findRootParent(e),o.close(r),i=r.nextAll(ie)):(i=e.nextAll(ie),i.length||(i=e.prevAll(re))),i&&!i.length?i=o.wrapper.children(".k-item").first():i||(i=[]),o._moveHover(e,i),i},_itemLeft:function(e,t){var n,i=this;return t?(n=e.parent().closest(".k-item"),i.close(n),i._isRootItem(n)&&"horizontal"==i.options.orientation&&(n=n.prevAll(ie))):(n=e.prevAll(ie),n.length||(n=e.nextAll(re))),n.length||(n=i.wrapper.children(".k-item").last()),i._moveHover(e,n),n},_itemDown:function(e,t,n){var i,r=this;if(t)i=e.nextAll(ie);else{if(!n||e.hasClass(Y))return;r.open(e),i=e.find(".k-menu-group").children().first()}return!i.length&&e.length?i=e.parent().children().first():e.length||(i=r.wrapper.children(".k-item").first()),r._moveHover(e,i),i},_itemUp:function(e,t){var n,i=this;if(t)return n=e.prevAll(ie),!n.length&&e.length?n=e.parent().children().last():e.length||(n=i.wrapper.children(".k-item").last()),i._moveHover(e,n),n},_itemEsc:function(e,t){var n,i=this;return t?(n=e.parent().closest(".k-item"),i.close(n),i._moveHover(e,n),n):e},_triggerEvent:function(e){var t=this;return t.trigger(e.type,{type:e.type,item:e.item})},_focusHandler:function(t){var n=this,i=e(c.eventTarget(t)).closest(J);setTimeout(function(){n._moveHover([],i),i.children(".k-content")[0]&&i.parent().closest(".k-item").removeClass($)},200)},_animations:function(e){e&&"animation"in e&&!e.animation&&(e.animation={open:{effects:{}},close:{hide:!0,effects:{}}})}});g(ce,{renderItem:function(e){e=g({menu:{},group:{}},e);var t=se.empty,n=e.item;return se.item(g(e,{image:n.imageUrl?se.image:t,sprite:n.spriteCssClass?se.sprite:t,itemWrapper:se.itemWrapper,renderContent:ce.renderContent,arrow:n.items||n.content?se.arrow:t,subGroup:ce.renderGroup},le))},renderGroup:function(e){return se.group(g({renderItems:function(e){for(var t="",n=0,i=e.items,r=i?i.length:0,o=g({length:r},e.group);r>n;n++)t+=ce.renderItem(g(e,{group:o,item:g({index:n},i[n])}));return t}},e,le))},renderContent:function(e){return se.content(g(e,le))}}),l=ce.extend({init:function(t,n){var i=this;ce.fn.init.call(i,t,n),i.target=e(i.options.target),i._popup(),i._wire()},options:{name:"ContextMenu",filter:null,showOn:"contextmenu",orientation:"vertical",alignToAnchor:!1,target:"body"},events:[C,D,R,F,I],setOptions:function(t){var n=this;ce.fn.setOptions.call(n,t),n.target.off(n.showOn+x,n._showProxy),n.userEvents&&n.userEvents.destroy(),n.target=e(n.options.target),t.orientation&&n.popup.wrapper[0]&&n.popup.element.unwrap(),n._wire(),ce.fn.setOptions.call(this,t)},destroy:function(){var e=this;e.target.off(e.options.showOn+x),W.off(c.support.mousedown+x,e._closeProxy),e.userEvents&&e.userEvents.destroy(),ce.fn.destroy.call(e)},open:function(n,i){var o=this;return n=e(n)[0],r(o.element[0],e(n)[0])?ce.fn.open.call(o,n):o._triggerEvent({item:o.element,type:C})===!1&&(o.popup.visible()&&o.options.filter&&(o.popup.close(!0),o.popup.element.kendoStop(!0)),i!==t?(o.popup.wrapper.hide(),o.popup.open(n,i)):(o.popup.options.anchor=(n?n:o.popup.anchor)||o.target,o.popup.element.kendoStop(!0),o.popup.open()),W.off(o.popup.downEvent,o.popup._mousedownProxy),W.on(c.support.mousedown+x,o._closeProxy)),o},close:function(){var t=this;r(t.element[0],e(arguments[0])[0])?ce.fn.close.call(t,arguments[0]):t.popup.visible()&&t._triggerEvent({item:t.element,type:D})===!1&&(t.popup.close(),W.off(c.support.mousedown+x,t._closeProxy),t.unbind(I,t._closeTimeoutProxy))},_showHandler:function(e){var t,n=e,i=this,o=i.options;e.event&&(n=e.event,n.pageX=e.x.location,n.pageY=e.y.location),r(i.element[0],e.relatedTarget||e.target)||(i._eventOrigin=n,n.preventDefault(),n.stopImmediatePropagation(),i.element.find("."+$).removeClass($),(o.filter&&c.support.matchesSelector.call(n.currentTarget,o.filter)||!o.filter)&&(o.alignToAnchor?(i.popup.options.anchor=n.currentTarget,i.open(n.currentTarget)):(i.popup.options.anchor=n.currentTarget,i._targetChild?(t=i.target.offset(),i.open(n.pageX-t.left,n.pageY-t.top)):i.open(n.pageX,n.pageY))))},_closeHandler:function(t){var n,i=this,o=e(t.relatedTarget||t.target),a=o.closest(i.target.selector)[0]==i.target[0],s=o.closest(ee).children(X),l=r(i.element[0],o[0]);i._eventOrigin=t,n=3!==t.which,i.popup.visible()&&(n&&a||!a)&&(i.options.closeOnClick&&!s[0]&&l||!l)&&(l?(this.unbind(I,this._closeTimeoutProxy),i.bind(I,i._closeTimeoutProxy)):i.close())},_wire:function(){var e=this,t=e.options,n=e.target;e._showProxy=m(e._showHandler,e),e._closeProxy=m(e._closeHandler,e),e._closeTimeoutProxy=m(e.close,e),n[0]&&(c.support.mobileOS&&"contextmenu"==t.showOn?(e.userEvents=new c.UserEvents(n,{filter:t.filter,allowSelection:!1}),n.on(t.showOn+x,!1),e.userEvents.bind("hold",e._showProxy)):t.filter?n.on(t.showOn+x,t.filter,e._showProxy):n.on(t.showOn+x,e._showProxy))},_triggerEvent:function(n){var i=this,r=e(i.popup.options.anchor)[0],o=i._eventOrigin;return i._eventOrigin=t,i.trigger(n.type,g({type:n.type,item:n.item||this.element[0],target:r},o?{event:o}:{}))},_popup:function(){var e=this;e._triggerProxy=m(e._triggerEvent,e),e.popup=e.element.addClass("k-context-menu").kendoPopup({anchor:e.target||"body",copyAnchorStyles:e.options.copyAnchorStyles,collision:e.options.popupCollision||"fit",animation:e.options.animation,activate:e._triggerProxy,deactivate:e._triggerProxy}).data("kendoPopup"),e._targetChild=r(e.target[0],e.popup.element[0])}}),u.plugin(ce),u.plugin(l)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t){t=e(t),t.children(v).children(".k-icon").remove(),t.filter(":has(.k-panel),:has(.k-content)").children(".k-link:not(:has([class*=k-i-arrow]))").each(function(){var t=e(this),n=t.parent();t.append("<span class='k-icon "+(n.hasClass(I)?"k-i-arrow-n k-panelbar-collapse":"k-i-arrow-s k-panelbar-expand")+"'/>")})}function i(t){t=e(t),t.filter(".k-first:not(:first-child)").removeClass(k),t.filter(".k-last:not(:last-child)").removeClass(g),t.filter(":first-child").addClass(k),t.filter(":last-child").addClass(g)}var r=window.kendo,o=r.ui,a=r.keys,s=e.extend,l=e.each,c=r.template,u=o.Widget,d=/^(ul|a|div)$/i,h=".kendoPanelBar",f="img",p="href",g="k-last",m="k-link",v="."+m,_="error",y=".k-item",b=".k-group",w=b+":visible",x="k-image",k="k-first",C="expand",S="select",T="k-content",A="activate",D="collapse",M="mouseenter",E="mouseleave",P="contentLoad",I="k-state-active",z="> .k-panel",R="> .k-content",F="k-state-focused",B="k-state-disabled",L="k-state-selected",O="."+L,H="k-state-highlight",N=y+":not(.k-state-disabled)",V="> "+N+" > "+v+", .k-panel > "+N+" > "+v,U=y+".k-state-disabled > .k-link",W="> li > "+O+", .k-panel > li > "+O,j="k-state-default",G="aria-disabled",q="aria-expanded",$="aria-hidden",Y="aria-selected",K=":visible",Q=":empty",X="single",J={content:c("<div role='region' class='k-content'#= contentAttributes(data) #>#= content(item) #</div>"),group:c("<ul role='group' aria-hidden='true' class='#= groupCssClass(group) #'#= groupAttributes(group) #>#= renderItems(data) #</ul>"),itemWrapper:c("<#= tag(item) # class='#= textClass(item, group) #' #= contentUrl(item) ##= textAttributes(item) #>#= image(item) ##= sprite(item) ##= text(item) ##= arrow(data) #</#= tag(item) #>"),item:c("<li role='menuitem' #=aria(item)#class='#= wrapperCssClass(group, item) #'>#= itemWrapper(data) ## if (item.items) { ##= subGroup({ items: item.items, panelBar: panelBar, group: { expanded: item.expanded } }) ## } else if (item.content || item.contentUrl) { ##= renderContent(data) ## } #</li>"),image:c("<img class='k-image' alt='' src='#= imageUrl #' />"),arrow:c("<span class='#= arrowClass(item) #'></span>"),sprite:c("<span class='k-sprite #= spriteCssClass #'></span>"),empty:c("")},Z={aria:function(e){var t="";return(e.items||e.content||e.contentUrl)&&(t+=q+"='"+(e.expanded?"true":"false")+"' "),e.enabled===!1&&(t+=G+"='true'"),t},wrapperCssClass:function(e,t){var n="k-item",i=t.index;return n+=t.enabled===!1?" "+B:t.expanded===!0?" "+I:" k-state-default",0===i&&(n+=" k-first"),i==e.length-1&&(n+=" k-last"),t.cssClass&&(n+=" "+t.cssClass),n},textClass:function(e,t){var n=m;return t.firstLevel&&(n+=" k-header"),n},textAttributes:function(e){return e.url?" href='"+e.url+"'":""},arrowClass:function(e){var t="k-icon";return t+=e.expanded?" k-i-arrow-n k-panelbar-collapse":" k-i-arrow-s k-panelbar-expand"},text:function(e){return e.encoded===!1?e.text:r.htmlEncode(e.text)},tag:function(e){return e.url||e.contentUrl?"a":"span"},groupAttributes:function(e){return e.expanded!==!0?" style='display:none'":""},groupCssClass:function(){return"k-group k-panel"},contentAttributes:function(e){return e.item.expanded!==!0?" style='display:none'":""},content:function(e){return e.content?e.content:e.contentUrl?"":"&nbsp;"},contentUrl:function(e){return e.contentUrl?'href="'+e.contentUrl+'"':""}},ee=u.extend({init:function(t,n){var i,o=this;u.fn.init.call(o,t,n),t=o.wrapper=o.element.addClass("k-widget k-reset k-header k-panelbar"),n=o.options,t[0].id&&(o._itemId=t[0].id+"_pb_active"),o._tabindex(),o._initData(n),o._updateClasses(),o._animations(n),t.on("click"+h,V,function(t){o._click(e(t.currentTarget))&&t.preventDefault()}).on(M+h+" "+E+h,V,o._toggleHover).on("click"+h,U,!1).on("keydown"+h,e.proxy(o._keydown,o)).on("focus"+h,function(){var e=o.select();o._current(e[0]?e:o._first())}).on("blur"+h,function(){o._current(null)}).attr("role","menu"),i=t.find("li."+I+" > ."+T),i[0]&&o.expand(i.parent(),!1),o._angularCompile(),r.notify(o)},events:[C,D,S,A,_,P],options:{name:"PanelBar",animation:{expand:{effects:"expand:vertical",duration:200},collapse:{duration:200}},expandMode:"multiple"},_angularCompile:function(){var e=this;e.angular("compile",function(){return{elements:e.element.children("li"),data:[{dataItem:e.options.$angular}]}})},_angularCleanup:function(){var e=this;e.angular("cleanup",function(){return{elements:e.element.children("li")}})},destroy:function(){u.fn.destroy.call(this),this.element.off(h),this._angularCleanup(),r.destroy(this.element)},_initData:function(e){var t=this;e.dataSource&&(t.element.empty(),t.append(e.dataSource,t.element))},setOptions:function(e){var t=this.options.animation;this._animations(e),e.animation=s(!0,t,e.animation),"dataSource"in e&&this._initData(e),u.fn.setOptions.call(this,e)},expand:function(n,i){var r=this,o={};return r._animating&&n.find("ul").is(":visible")?(r.one("complete",function(){
setTimeout(function(){r.expand(n)})}),t):(r._animating=!0,i=i!==!1,n=this.element.find(n),n.each(function(t,a){a=e(a);var s=a.find(z).add(a.find(R));if(!a.hasClass(B)&&s.length>0){if(r.options.expandMode==X&&r._collapseAllExpanded(a))return r;n.find("."+H).removeClass(H),a.addClass(H),i||(o=r.options.animation,r.options.animation={expand:{effects:{}},collapse:{hide:!0,effects:{}}}),r._triggerEvent(C,a)||r._toggleItem(a,!1),i||(r.options.animation=o)}}),r)},collapse:function(t,n){var i=this,r={};return i._animating=!0,n=n!==!1,t=i.element.find(t),t.each(function(t,o){o=e(o);var a=o.find(z).add(o.find(R));!o.hasClass(B)&&a.is(K)&&(o.removeClass(H),n||(r=i.options.animation,i.options.animation={expand:{effects:{}},collapse:{hide:!0,effects:{}}}),i._triggerEvent(D,o)||i._toggleItem(o,!0),n||(i.options.animation=r))}),i},_toggleDisabled:function(e,t){e=this.element.find(e),e.toggleClass(j,t).toggleClass(B,!t).attr(G,!t)},select:function(n){var i=this;return n===t?i.element.find(W).parent():(n=i.element.find(n),n.length?n.each(function(){var n=e(this),r=n.children(v);return n.hasClass(B)?i:(i._triggerEvent(S,n)||i._updateSelected(r),t)}):this._updateSelected(n),i)},clearSelection:function(){this.select(e())},enable:function(e,t){return this._toggleDisabled(e,t!==!1),this},disable:function(e){return this._toggleDisabled(e,!1),this},append:function(e,t){t=this.element.find(t);var r=this._insert(e,t,t.length?t.find(z):null);return l(r.items,function(){r.group.append(this),i(this)}),n(t),i(r.group.find(".k-first, .k-last")),r.group.height("auto"),this},insertBefore:function(e,t){t=this.element.find(t);var n=this._insert(e,t,t.parent());return l(n.items,function(){t.before(this),i(this)}),i(t),n.group.height("auto"),this},insertAfter:function(e,t){t=this.element.find(t);var n=this._insert(e,t,t.parent());return l(n.items,function(){t.after(this),i(this)}),i(t),n.group.height("auto"),this},remove:function(e){e=this.element.find(e);var t=this,r=e.parentsUntil(t.element,y),o=e.parent("ul");return e.remove(),!o||o.hasClass("k-panelbar")||o.children(y).length||o.remove(),r.length&&(r=r.eq(0),n(r),i(r)),t},reload:function(t){var n=this;t=n.element.find(t),t.each(function(){var t=e(this);n._ajaxRequest(t,t.children("."+T),!t.is(K))})},_first:function(){return this.element.children(N).first()},_last:function(){var e=this.element.children(N).last(),t=e.children(w);return t[0]?t.children(N).last():e},_current:function(n){var i=this,r=i._focused,o=i._itemId;return n===t?r:(i.element.removeAttr("aria-activedescendant"),r&&r.length&&(r[0].id===o&&r.removeAttr("id"),r.children(v).removeClass(F)),e(n).length&&(o=n[0].id||o,n.attr("id",o).children(v).addClass(F),i.element.attr("aria-activedescendant",o)),i._focused=n,t)},_keydown:function(e){var t=this,n=e.keyCode,i=t._current();e.target==e.currentTarget&&(n==a.DOWN||n==a.RIGHT?(t._current(t._nextItem(i)),e.preventDefault()):n==a.UP||n==a.LEFT?(t._current(t._prevItem(i)),e.preventDefault()):n==a.ENTER||n==a.SPACEBAR?(t._click(i.children(v)),e.preventDefault()):n==a.HOME?(t._current(t._first()),e.preventDefault()):n==a.END&&(t._current(t._last()),e.preventDefault()))},_nextItem:function(e){if(!e)return this._first();var t=e.children(w),n=e.nextAll(":visible").first();return t[0]&&(n=t.children("."+k)),n[0]||(n=e.parent(w).parent(y).next()),n[0]||(n=this._first()),n.hasClass(B)&&(n=this._nextItem(n)),n},_prevItem:function(e){if(!e)return this._last();var t,n=e.prevAll(":visible").first();if(n[0])for(t=n;t[0];)t=t.children(w).children("."+g),t[0]&&(n=t);else n=e.parent(w).parent(y),n[0]||(n=this._last());return n.hasClass(B)&&(n=this._prevItem(n)),n},_insert:function(t,n,i){var o,a,l=this,c=e.isPlainObject(t),u=n&&n[0];return u||(i=l.element),a={firstLevel:i.hasClass("k-panelbar"),expanded:i.parent().hasClass(I),length:i.children().length},u&&!i.length&&(i=e(ee.renderGroup({group:a})).appendTo(n)),t instanceof r.Observable&&(t=t.toJSON()),c||e.isArray(t)?(o=e.map(c?[t]:t,function(t,n){return e("string"==typeof t?t:ee.renderItem({group:a,item:s(t,{index:n})}))}),u&&n.attr(q,!1)):(o="string"==typeof t&&"<"!=t.charAt(0)?l.element.find(t):e(t),l._updateItemsClasses(o)),{items:o,group:i}},_toggleHover:function(t){var n=e(t.currentTarget);n.parents("li."+B).length||n.toggleClass("k-state-hover",t.type==M)},_updateClasses:function(){var t,r,o=this;t=o.element.find("li > ul").not(function(){return e(this).parentsUntil(".k-panelbar","div").length}).addClass("k-group k-panel").attr("role","group"),t.parent().attr(q,!1).not("."+I).children("ul").attr($,!0).hide(),r=o.element.add(t).children(),o._updateItemsClasses(r),n(r),i(r)},_updateItemsClasses:function(e){for(var t=e.length,n=0;t>n;n++)this._updateItemClasses(e[n],n)},_updateItemClasses:function(t,n){var i,o,a=this._selected,s=this.options.contentUrls,l=s&&s[n],c=this.element[0];t=e(t).addClass("k-item").attr("role","menuitem"),r.support.browser.msie&&t.css("list-style-position","inside").css("list-style-position",""),t.children(f).addClass(x),o=t.children("a").addClass(m),o[0]&&(o.attr("href",l),o.children(f).addClass(x)),t.filter(":not([disabled]):not([class*=k-state])").addClass("k-state-default"),t.filter("li[disabled]").addClass("k-state-disabled").attr(G,!0).removeAttr("disabled"),t.children("div").addClass(T).attr("role","region").attr($,!0).hide().parent().attr(q,!1),o=t.children(O),o[0]&&(a&&a.removeAttr(Y).children(O).removeClass(L),o.addClass(L),this._selected=t.attr(Y,!0)),t.children(v)[0]||(i="<span class='"+m+"'/>",s&&s[n]&&t[0].parentNode==c&&(i='<a class="k-link k-header" href="'+s[n]+'"/>'),t.contents().filter(function(){return!(this.nodeName.match(d)||3==this.nodeType&&!e.trim(this.nodeValue))}).wrapAll(i)),t.parent(".k-panelbar")[0]&&t.children(v).addClass("k-header")},_click:function(e){var t,n,i,r,o,a,s,l=this,c=l.element;if(!e.parents("li."+B).length&&e.closest(".k-widget")[0]==c[0]){if(o=e.closest(v),a=o.closest(y),l._updateSelected(o),n=a.find(z).add(a.find(R)),i=o.attr(p),r=i&&("#"==i.charAt(i.length-1)||-1!=i.indexOf("#"+l.element[0].id+"-")),t=!(!r&&!n.length),n.data("animating"))return t;if(l._triggerEvent(S,a)&&(t=!0),t!==!1)return l.options.expandMode==X&&l._collapseAllExpanded(a)?t:(n.length&&(s=n.is(K),l._triggerEvent(s?D:C,a)||(t=l._toggleItem(a,s))),t)}},_toggleItem:function(e,n){var i,r,o=this,a=e.find(z),s=e.find(v),l=s.attr(p);return a.length?(this._toggleGroup(a,n),i=!0):(r=e.children("."+T),r.length&&(i=!0,r.is(Q)&&l!==t?o._ajaxRequest(e,r,n):o._toggleGroup(r,n))),i},_toggleGroup:function(e,n){var i=this,r=i.options.animation,o=r.expand,a=s({},r.collapse),l=a&&"effects"in a;return e.is(K)!=n?(i._animating=!1,t):(e.parent().attr(q,!n).attr($,n).toggleClass(I,!n).find("> .k-link > .k-icon").toggleClass("k-i-arrow-n",!n).toggleClass("k-panelbar-collapse",!n).toggleClass("k-i-arrow-s",n).toggleClass("k-panelbar-expand",n),n?(o=s(l?a:s({reverse:!0},o),{hide:!0}),o.complete=function(){i._animationCallback()}):o=s({complete:function(e){i._triggerEvent(A,e.closest(y)),i._animationCallback()}},o),e.kendoStop(!0,!0).kendoAnimate(o),t)},_animationCallback:function(){var e=this;e.trigger("complete"),e._animating=!1},_collapseAllExpanded:function(t){var n,i=this,r=!1,o=t.find(z).add(t.find(R));return o.is(K)&&(r=!0),o.is(K)||0===o.length||(n=t.siblings(),n.find(z).add(n.find(R)).filter(function(){return e(this).is(K)}).each(function(t,n){n=e(n),r=i._triggerEvent(D,n.closest(y)),r||i._toggleGroup(n,!0)})),r},_ajaxRequest:function(t,n,i){var r=this,o=t.find(".k-panelbar-collapse, .k-panelbar-expand"),a=t.find(v),s=setTimeout(function(){o.addClass("k-loading")},100),l={},c=a.attr(p);e.ajax({type:"GET",cache:!1,url:c,dataType:"html",data:l,error:function(e,t){o.removeClass("k-loading"),r.trigger(_,{xhr:e,status:t})&&this.complete()},complete:function(){clearTimeout(s),o.removeClass("k-loading")},success:function(e){function o(){return{elements:n.get()}}try{r.angular("cleanup",o),n.html(e),r.angular("compile",o)}catch(a){var s=window.console;s&&s.error&&s.error(a.name+": "+a.message+" in "+c),this.error(this.xhr,"error")}r._toggleGroup(n,i),r.trigger(P,{item:t[0],contentElement:n[0]})}})},_triggerEvent:function(e,t){var n=this;return n.trigger(e,{item:t[0]})},_updateSelected:function(e){var t=this,n=t.element,i=e.parent(y),r=t._selected;r&&r.removeAttr(Y),t._selected=i.attr(Y,!0),n.find(W).removeClass(L),n.find("> ."+H+", .k-panel > ."+H).removeClass(H),e.addClass(L),e.parentsUntil(n,y).filter(":has(.k-header)").addClass(H),t._current(i[0]?i:null)},_animations:function(e){e&&"animation"in e&&!e.animation&&(e.animation={expand:{effects:{}},collapse:{hide:!0,effects:{}}})}});s(ee,{renderItem:function(e){e=s({panelBar:{},group:{}},e);var t=J.empty,n=e.item;return J.item(s(e,{image:n.imageUrl?J.image:t,sprite:n.spriteCssClass?J.sprite:t,itemWrapper:J.itemWrapper,renderContent:ee.renderContent,arrow:n.items||n.content||n.contentUrl?J.arrow:t,subGroup:ee.renderGroup},Z))},renderGroup:function(e){return J.group(s({renderItems:function(e){for(var t="",n=0,i=e.items,r=i?i.length:0,o=s({length:r},e.group);r>n;n++)t+=ee.renderItem(s(e,{group:o,item:s({index:n},i[n])}));return t}},e,Z))},renderContent:function(e){return J.content(s(e,Z))}}),r.ui.plugin(ee)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.ui,r=i.Widget,o="horizontal",a="vertical",s=0,l=100,c=0,u=5,d="k-progressbar",h="k-progressbar-reverse",f="k-progressbar-indeterminate",p="k-complete",g="k-state-selected",m="k-progress-status",v="k-state-selected",_="k-state-default",y="k-state-disabled",b={VALUE:"value",PERCENT:"percent",CHUNK:"chunk"},w="change",x="complete",k="boolean",C=Math,S=e.extend,T=e.proxy,A=100,D=400,M=3,E={progressStatus:"<span class='k-progress-status-wrap'><span class='k-progress-status'></span></span>"},P=r.extend({init:function(e,t){var n=this;r.fn.init.call(this,e,t),t=n.options,n._progressProperty=t.orientation===o?"width":"height",n._fields(),t.value=n._validateValue(t.value),n._validateType(t.type),n._wrapper(),n._progressAnimation(),t.value!==t.min&&t.value!==!1&&n._updateProgress()},setOptions:function(e){var t=this;r.fn.setOptions.call(t,e),e.hasOwnProperty("reverse")&&t.wrapper.toggleClass("k-progressbar-reverse",e.reverse),e.hasOwnProperty("enable")&&t.enable(e.enable),t._progressAnimation(),t._validateValue(),t._updateProgress()},events:[w,x],options:{name:"ProgressBar",orientation:o,reverse:!1,min:s,max:l,value:c,enable:!0,type:b.VALUE,chunkCount:u,showStatus:!0,animation:{}},_fields:function(){var t=this;t._isStarted=!1,t.progressWrapper=t.progressStatus=e()},_validateType:function(i){var r=!1;if(e.each(b,function(e,n){return n===i?(r=!0,!1):t}),!r)throw Error(n.format("Invalid ProgressBar type '{0}'",i))},_wrapper:function(){var e,t=this,n=t.wrapper=t.element,i=t.options,r=i.orientation;n.addClass("k-widget "+d),n.addClass(d+"-"+(r===o?o:a)),i.enable===!1&&n.addClass(y),i.reverse&&n.addClass(h),i.value===!1&&n.addClass(f),i.type===b.CHUNK?t._addChunkProgressWrapper():i.showStatus&&(t.progressStatus=t.wrapper.prepend(E.progressStatus).find("."+m),e=i.value!==!1?i.value:i.min,t.progressStatus.text(i.type===b.VALUE?e:t._calculatePercentage(e).toFixed()+"%"))},value:function(e){return this._value(e)},_value:function(e){var n,i=this,r=i.options;return e===t?r.value:(typeof e!==k?(e=i._roundValue(e),isNaN(e)||(n=i._validateValue(e),n!==r.value&&(i.wrapper.removeClass(f),r.value=n,i._isStarted=!0,i._updateProgress()))):e||(i.wrapper.addClass(f),r.value=!1),t)},_roundValue:function(e){e=parseFloat(e);var t=C.pow(10,M);return C.floor(e*t)/t},_validateValue:function(e){var t=this,n=t.options;if(e!==!1){if(n.min>=e||e===!0)return n.min;if(e>=n.max)return n.max}else if(e===!1)return!1;return isNaN(t._roundValue(e))?n.min:e},_updateProgress:function(){var e=this,t=e.options,n=e._calculatePercentage();t.type===b.CHUNK?(e._updateChunks(n),e._onProgressUpdateAlways(t.value)):e._updateProgressWrapper(n)},_updateChunks:function(e){var t,n=this,i=n.options,r=i.chunkCount,s=parseInt(A/r*100,10)/100,l=parseInt(100*e,10)/100,c=C.floor(l/s);t=n.wrapper.find(i.orientation===o&&!i.reverse||i.orientation===a&&i.reverse?"li.k-item:lt("+c+")":"li.k-item:gt(-"+(c+1)+")"),n.wrapper.find("."+v).removeClass(v).addClass(_),t.removeClass(_).addClass(v)},_updateProgressWrapper:function(e){var t=this,n=t.options,i=t.wrapper.find("."+g),r=t._isStarted?t._animation.duration:0,o={};0===i.length&&t._addRegularProgressWrapper(),o[t._progressProperty]=e+"%",t.progressWrapper.animate(o,{duration:r,start:T(t._onProgressAnimateStart,t),progress:T(t._onProgressAnimate,t),complete:T(t._onProgressAnimateComplete,t,n.value),always:T(t._onProgressUpdateAlways,t,n.value)})},_onProgressAnimateStart:function(){this.progressWrapper.show()},_onProgressAnimate:function(e){var t,n=this,i=n.options,r=parseFloat(e.elem.style[n._progressProperty],10);i.showStatus&&(t=1e4/parseFloat(n.progressWrapper[0].style[n._progressProperty]),n.progressWrapper.find(".k-progress-status-wrap").css(n._progressProperty,t+"%")),i.type!==b.CHUNK&&98>=r&&n.progressWrapper.removeClass(p)},_onProgressAnimateComplete:function(e){var t,n=this,i=n.options,r=parseFloat(n.progressWrapper[0].style[n._progressProperty]);i.type!==b.CHUNK&&r>98&&n.progressWrapper.addClass(p),i.showStatus&&(t=i.type===b.VALUE?e:i.type==b.PERCENT?n._calculatePercentage(e).toFixed()+"%":C.floor(n._calculatePercentage(e))+"%",n.progressStatus.text(t)),e===i.min&&n.progressWrapper.hide()},_onProgressUpdateAlways:function(e){var t=this,n=t.options;t._isStarted&&t.trigger(w,{value:e}),e===n.max&&t._isStarted&&t.trigger(x,{value:n.max})},enable:function(e){var n=this,i=n.options;i.enable=t===e?!0:e,n.wrapper.toggleClass(y,!i.enable)},destroy:function(){var e=this;r.fn.destroy.call(e)},_addChunkProgressWrapper:function(){var e,t=this,n=t.options,i=t.wrapper,r=A/n.chunkCount,o="";for(1>=n.chunkCount&&(n.chunkCount=1),o+="<ul class='k-reset'>",e=n.chunkCount-1;e>=0;e--)o+="<li class='k-item k-state-default'></li>";o+="</ul>",i.append(o).find(".k-item").css(t._progressProperty,r+"%").first().addClass("k-first").end().last().addClass("k-last"),t._normalizeChunkSize()},_normalizeChunkSize:function(){var e=this,t=e.options,n=e.wrapper.find(".k-item:last"),i=parseFloat(n[0].style[e._progressProperty]),r=A-t.chunkCount*i;r>0&&n.css(e._progressProperty,i+r+"%")},_addRegularProgressWrapper:function(){var t=this;t.progressWrapper=e("<div class='"+g+"'></div>").appendTo(t.wrapper),t.options.showStatus&&(t.progressWrapper.append(E.progressStatus),t.progressStatus=t.wrapper.find("."+m))},_calculateChunkSize:function(){var e=this,t=e.options.chunkCount,n=e.wrapper.find("ul.k-reset");return(parseInt(n.css(e._progressProperty),10)-(t-1))/t},_calculatePercentage:function(e){var n=this,i=n.options,r=e!==t?e:i.value,o=i.min,a=i.max;return n._onePercent=C.abs((a-o)/100),C.abs((r-o)/n._onePercent)},_progressAnimation:function(){var e=this,t=e.options,n=t.animation;e._animation=n===!1?{duration:0}:S({duration:D},t.animation)}});n.ui.plugin(P)}(window.kendo.jQuery)}(),function(){!function(e){var t=e.proxy,n=".kendoResponsivePanel",i="open",r="close",o="click"+n+" touchstart"+n,a=kendo.ui.Widget,s=a.extend({init:function(i,r){a.fn.init.call(this,i,r),this._guid="_"+kendo.guid(),this._toggleHandler=t(this._toggleButtonClick,this),this._closeHandler=t(this._close,this),e(document.documentElement).on(o,this.options.toggleButton,this._toggleHandler),this._registerBreakpoint(),this.element.addClass("k-rpanel k-rpanel-"+this.options.orientation+" "+this._guid),this._resizeHandler=t(this.resize,this,!1),e(window).on("resize"+n,this._resizeHandler)},_mediaQuery:"@media (max-width: #= breakpoint-1 #px) {.#= guid #.k-rpanel-animate.k-rpanel-left,.#= guid #.k-rpanel-animate.k-rpanel-right {-webkit-transition: -webkit-transform .2s ease-out;-ms-transition: -ms-transform .2s ease-out;transition: transform .2s ease-out;} .#= guid #.k-rpanel-top {overflow: hidden;}.#= guid #.k-rpanel-animate.k-rpanel-top {-webkit-transition: max-height .2s linear;-ms-transition: max-height .2s linear;transition: max-height .2s linear;}} @media (min-width: #= breakpoint #px) {#= toggleButton # { display: none; } .#= guid #.k-rpanel-left { float: left; } .#= guid #.k-rpanel-right { float: right; } .#= guid #.k-rpanel-left, .#= guid #.k-rpanel-right {position: relative;-webkit-transform: translateX(0);-ms-transform: translateX(0);transform: translateX(0);-webkit-transform: translateX(0) translateZ(0);-ms-transform: translateX(0) translateZ(0);transform: translateX(0) translateZ(0);} .#= guid #.k-rpanel-top { max-height: none; }}",_registerBreakpoint:function(){var e=this.options;this._registerStyle(kendo.template(this._mediaQuery)({breakpoint:e.breakpoint,toggleButton:e.toggleButton,guid:this._guid}))},_registerStyle:function(t){var n=e("head,body")[0],i=document.createElement("style");n.appendChild(i),i.styleSheet?i.styleSheet.cssText=t:i.appendChild(document.createTextNode(t))},options:{name:"ResponsivePanel",orientation:"left",toggleButton:".k-rpanel-toggle",breakpoint:640,autoClose:!0},events:[i,r],_resize:function(){this.element.removeClass("k-rpanel-animate")},_toggleButtonClick:function(e){e.preventDefault(),this.element.hasClass("k-rpanel-expanded")?this.close():this.open()},open:function(){this.trigger(i)||(this.element.addClass("k-rpanel-animate k-rpanel-expanded"),this.options.autoClose&&e(document.documentElement).on(o,this._closeHandler))},close:function(){this.trigger(r)||(this.element.addClass("k-rpanel-animate").removeClass("k-rpanel-expanded"),e(document.documentElement).off(o,this._closeHandler))},_close:function(t){var n=t.isDefaultPrevented(),i=e(t.target).closest(this.options.toggleButton+",.k-rpanel");i.length||n||this.close()},destroy:function(){a.fn.destroy.call(this),e(window).off("resize"+n,this._resizeHandler),e(document.documentElement).off(o,this._closeHandler)}});kendo.ui.plugin(s)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t){t.children(m).addClass(S),t.children("a").addClass(b).children(m).addClass(S),t.filter(":not([disabled]):not([class*=k-state-disabled])").addClass(F),t.filter("li[disabled]").addClass(R).removeAttr("disabled"),t.filter(":not([class*=k-state])").children("a").filter(":focus").parent().addClass(B+" "+H),t.attr("role","tab"),t.filter("."+B).attr("aria-selected",!0),t.each(function(){var t=e(this);t.children("."+b).length||t.contents().filter(function(){return!(this.nodeName.match(p)||3==this.nodeType&&!u(this.nodeValue))}).wrapAll("<span class='"+b+"'/>")})}function i(e){var t=e.children(".k-item");t.filter(".k-first:not(:first-child)").removeClass(T),t.filter(".k-last:not(:last-child)").removeClass(w),t.filter(":first-child").addClass(T),t.filter(":last-child").addClass(w)}function r(e,t){return"<span class='k-button k-button-icon k-button-bare k-tabstrip-"+e+"' unselectable='on'><span class='k-icon "+t+"'></span></span>"}var o=window.kendo,a=o.ui,s=o.keys,l=e.map,c=e.each,u=e.trim,d=e.extend,h=o.template,f=a.Widget,p=/^(a|div)$/i,g=".kendoTabStrip",m="img",v="href",_="prev",y="show",b="k-link",w="k-last",x="click",k="error",C=":empty",S="k-image",T="k-first",A="select",D="activate",M="k-content",E="contentUrl",P="mouseenter",I="mouseleave",z="contentLoad",R="k-state-disabled",F="k-state-default",B="k-state-active",L="k-state-focused",O="k-state-hover",H="k-tab-on-top",N=".k-item:not(."+R+")",V=".k-tabstrip-items > "+N+":not(."+B+")",U={content:h("<div class='k-content'#= contentAttributes(data) # role='tabpanel'>#= content(item) #</div>"),itemWrapper:h("<#= tag(item) # class='k-link'#= contentUrl(item) ##= textAttributes(item) #>#= image(item) ##= sprite(item) ##= text(item) #</#= tag(item) #>"),item:h("<li class='#= wrapperCssClass(group, item) #' role='tab' #=item.active ? \"aria-selected='true'\" : ''#>#= itemWrapper(data) #</li>"),image:h("<img class='k-image' alt='' src='#= imageUrl #' />"),sprite:h("<span class='k-sprite #= spriteCssClass #'></span>"),empty:h("")},W={wrapperCssClass:function(e,t){var n="k-item",i=t.index;return n+=t.enabled===!1?" k-state-disabled":" k-state-default",0===i&&(n+=" k-first"),i==e.length-1&&(n+=" k-last"),n},textAttributes:function(e){return e.url?" href='"+e.url+"'":""},text:function(e){return e.encoded===!1?e.text:o.htmlEncode(e.text)},tag:function(e){return e.url?"a":"span"},contentAttributes:function(e){return e.active!==!0?" style='display:none' aria-hidden='true' aria-expanded='false'":""},content:function(e){return e.content?e.content:e.contentUrl?"":"&nbsp;"},contentUrl:function(e){return e.contentUrl?o.attr("content-url")+'="'+e.contentUrl+'"':""}},j=f.extend({init:function(t,n){var i,r,a,s=this;f.fn.init.call(s,t,n),s._animations(s.options),n=s.options,s._wrapper(),s._isRtl=o.support.isRtl(s.wrapper),s._tabindex(),s._updateClasses(),s._dataSource(),n.dataSource&&s.dataSource.fetch(),s._tabPosition(),s._scrollable(),s.options.contentUrls&&s.wrapper.find(".k-tabstrip-items > .k-item").each(function(t,n){e(n).find(">."+b).data(E,s.options.contentUrls[t])}),s.wrapper.on(P+g+" "+I+g,V,s._toggleHover).on("focus"+g,e.proxy(s._active,s)).on("blur"+g,function(){s._current(null)}),s._keyDownProxy=e.proxy(s._keydown,s),n.navigatable&&s.wrapper.on("keydown"+g,s._keyDownProxy),s.options.value&&(i=s.options.value),s.wrapper.children(".k-tabstrip-items").on(x+g,".k-state-disabled .k-link",!1).on(x+g," > "+N,function(t){var n,i=s.wrapper[0];if(i!==document.activeElement)if(n=o.support.browser.msie)try{i.setActive()}catch(r){i.focus()}else i.focus();s._click(e(t.currentTarget))&&t.preventDefault()}),r=s.tabGroup.children("li."+B),a=s.contentHolder(r.index()),r[0]&&a.length>0&&0===a[0].childNodes.length&&s.activateTab(r.eq(0)),s.element.attr("role","tablist"),s.element[0].id&&(s._ariaId=s.element[0].id+"_ts_active"),s.value(i),o.notify(s)},_active:function(){var e=this.tabGroup.children().filter("."+B);e=e[0]?e:this._endItem("first"),e[0]&&this._current(e)},_endItem:function(e){return this.tabGroup.children(N)[e]()},_item:function(e,t){var n;return n=t===_?"last":"first",e?(e=e[t](),e[0]||(e=this._endItem(n)),e.hasClass(R)&&(e=this._item(e,t)),e):this._endItem(n)},_current:function(e){var n=this,i=n._focused,r=n._ariaId;return e===t?i:(i&&(i[0].id===r&&i.removeAttr("id"),i.removeClass(L)),e&&(e.hasClass(B)||e.addClass(L),n.element.removeAttr("aria-activedescendant"),r=e[0].id||r,r&&(e.attr("id",r),n.element.attr("aria-activedescendant",r))),n._focused=e,t)},_keydown:function(e){var n,i=this,r=e.keyCode,o=i._current(),a=i._isRtl;if(e.target==e.currentTarget){if(r==s.DOWN||r==s.RIGHT)n=a?_:"next";else if(r==s.UP||r==s.LEFT)n=a?"next":_;else if(r==s.ENTER||r==s.SPACEBAR)i._click(o),e.preventDefault();else{if(r==s.HOME)return i._click(i._endItem("first")),e.preventDefault(),t;if(r==s.END)return i._click(i._endItem("last")),e.preventDefault(),t}n&&(i._click(i._item(o,n)),e.preventDefault())}},_dataSource:function(){var t=this;t.dataSource&&t._refreshHandler?t.dataSource.unbind("change",t._refreshHandler):t._refreshHandler=e.proxy(t.refresh,t),t.dataSource=o.data.DataSource.create(t.options.dataSource).bind("change",t._refreshHandler)},setDataSource:function(e){var t=this;t.options.dataSource=e,t._dataSource(),t.dataSource.fetch()},_animations:function(e){e&&"animation"in e&&!e.animation&&(e.animation={open:{effects:{}},close:{effects:{}}})},refresh:function(e){var t,n,i,r,a=this,s=a.options,l=o.getter(s.dataTextField),c=o.getter(s.dataContentField),u=o.getter(s.dataContentUrlField),d=o.getter(s.dataImageUrlField),h=o.getter(s.dataUrlField),f=o.getter(s.dataSpriteCssClass),p=[],g=a.dataSource.view();for(e=e||{},i=e.action,i&&(g=e.items),t=0,r=g.length;r>t;t++)n={text:l(g[t])},s.dataContentField&&(n.content=c(g[t])),s.dataContentUrlField&&(n.contentUrl=u(g[t])),s.dataUrlField&&(n.url=h(g[t])),s.dataImageUrlField&&(n.imageUrl=d(g[t])),s.dataSpriteCssClass&&(n.spriteCssClass=f(g[t])),p[t]=n;if("add"==e.action)e.index<a.tabGroup.children().length?a.insertBefore(p,a.tabGroup.children().eq(e.index)):a.append(p);else if("remove"==e.action)for(t=0;g.length>t;t++)a.remove(e.index);else"itemchange"==e.action?(t=a.dataSource.view().indexOf(g[0]),e.field===s.dataTextField&&a.tabGroup.children().eq(t).find(".k-link").text(g[0].get(e.field))):(a.trigger("dataBinding"),a.remove("li"),a.append(p),a.trigger("dataBound"))},value:function(n){var i=this;return n===t?i.select().text():(n!=i.value()&&i.tabGroup.children().each(function(){e.trim(e(this).text())==n&&i.select(this)}),t)},items:function(){return this.tabGroup[0].children},setOptions:function(e){var t=this,n=t.options.animation;t._animations(e),e.animation=d(!0,n,e.animation),e.navigatable?t.wrapper.on("keydown"+g,t._keyDownProxy):t.wrapper.off("keydown"+g,t._keyDownProxy),f.fn.setOptions.call(t,e)},events:[A,D,y,k,z,"change","dataBinding","dataBound"],options:{name:"TabStrip",dataTextField:"",dataContentField:"",dataImageUrlField:"",dataUrlField:"",dataSpriteCssClass:"",dataContentUrlField:"",tabPosition:"top",animation:{open:{effects:"expand:vertical fadeIn",duration:200},close:{duration:200}},collapsible:!1,navigatable:!0,contentUrls:!1,scrollable:{distance:200}},destroy:function(){var e=this;f.fn.destroy.call(e),e._refreshHandler&&e.dataSource.unbind("change",e._refreshHandler),e.wrapper.off(g),e.wrapper.children(".k-tabstrip-items").off(g),e._scrollableModeActive&&(e._scrollPrevButton.off().remove(),e._scrollNextButton.off().remove()),e.scrollWrap.children(".k-tabstrip").unwrap(),o.destroy(e.wrapper)},select:function(t){var n=this;return 0===arguments.length?n.tabGroup.children("li."+B):(isNaN(t)||(t=n.tabGroup.children().get(t)),t=n.tabGroup.find(t),e(t).each(function(t,i){i=e(i),i.hasClass(B)||n.trigger(A,{item:i[0],contentElement:n.contentHolder(i.index())[0]})||n.activateTab(i)}),n)},enable:function(e,t){return this._toggleDisabled(e,t!==!1),this},disable:function(e){return this._toggleDisabled(e,!1),this},reload:function(t){t=this.tabGroup.find(t);var n=this;return t.each(function(){var t=e(this),i=t.find("."+b).data(E),r=n.contentHolder(t.index());i&&n.ajaxRequest(t,r,null,i)}),n},append:function(e){var t=this,n=t._create(e);return c(n.tabs,function(e){var i=n.contents[e];t.tabGroup.append(this),"bottom"==t.options.tabPosition?t.tabGroup.before(i):t._scrollableModeActive?t._scrollPrevButton.before(i):t.wrapper.append(i),t.angular("compile",function(){return{elements:[i]}})}),i(t.tabGroup),t._updateContentElements(),t.resize(!0),t},insertBefore:function(t,n){n=this.tabGroup.find(n);var r=this,o=r._create(t),a=e(r.contentElement(n.index()));return c(o.tabs,function(e){var t=o.contents[e];n.before(this),a.before(t),r.angular("compile",function(){return{elements:[t]}})}),i(r.tabGroup),r._updateContentElements(),r.resize(!0),r},insertAfter:function(t,n){n=this.tabGroup.find(n);var r=this,o=r._create(t),a=e(r.contentElement(n.index()));return c(o.tabs,function(e){var t=o.contents[e];n.after(this),a.after(t),r.angular("compile",function(){return{elements:[t]}})}),i(r.tabGroup),r._updateContentElements(),r.resize(!0),r},remove:function(t){var n,i=this,r=typeof t;return"string"===r?t=i.tabGroup.find(t):"number"===r&&(t=i.tabGroup.children().eq(t)),n=t.map(function(){var t=i.contentElement(e(this).index());return o.destroy(t),t}),t.remove(),n.remove(),i._updateContentElements(),i.resize(!0),i},_create:function(i){var r,o,a,s=e.isPlainObject(i),c=this;return s||e.isArray(i)?(i=e.isArray(i)?i:[i],r=l(i,function(t,n){return e(j.renderItem({group:c.tabGroup,item:d(t,{index:n})}))}),o=l(i,function(n,i){return"string"==typeof n.content||n.contentUrl?e(j.renderContent({item:d(n,{index:i})})):t})):(r="string"==typeof i&&"<"!=i[0]?c.element.find(i):e(i),o=e(),r.each(function(){if(a=e("<div class='"+M+"'/>"),/k-tabstrip-items/.test(this.parentNode.className)){var t=parseInt(this.getAttribute("aria-controls").replace(/^.*-/,""),10)-1;a=e(c.contentElement(t))}o=o.add(a)}),n(r)),{tabs:r,contents:o}},_toggleDisabled:function(t,n){t=this.tabGroup.find(t),t.each(function(){e(this).toggleClass(F,n).toggleClass(R,!n)})},_updateClasses:function(){var r,o,a,s=this;s.wrapper.addClass("k-widget k-header k-tabstrip"),s.tabGroup=s.wrapper.children("ul").addClass("k-tabstrip-items k-reset"),s.tabGroup[0]||(s.tabGroup=e("<ul class='k-tabstrip-items k-reset'/>").appendTo(s.wrapper)),r=s.tabGroup.find("li").addClass("k-item"),r.length&&(o=r.filter("."+B).index(),a=o>=0?o:t,s.tabGroup.contents().filter(function(){return 3==this.nodeType&&!u(this.nodeValue)}).remove()),o>=0&&r.eq(o).addClass(H),s.contentElements=s.wrapper.children("div"),s.contentElements.addClass(M).eq(a).addClass(B).css({display:"block"}),r.length&&(n(r),i(s.tabGroup),s._updateContentElements())},_updateContentElements:function(){var t=this,n=t.options.contentUrls||[],i=t.tabGroup.find(".k-item"),r=(t.element.attr("id")||o.guid())+"-",a=t.wrapper.children("div");a.length&&i.length>a.length?(a.each(function(e){var t=parseInt(this.id.replace(r,""),10),n=i.filter("[aria-controls="+r+t+"]"),o=r+(e+1);n.data("aria",o),this.setAttribute("id",o)}),i.each(function(){var t=e(this);this.setAttribute("aria-controls",t.data("aria")),t.removeData("aria")})):i.each(function(i){var o=a.eq(i),s=r+(i+1);this.setAttribute("aria-controls",s),!o.length&&n[i]?e("<div class='"+M+"'/>").appendTo(t.wrapper).attr("id",s):(o.attr("id",s),e(this).children(".k-loading")[0]||n[i]||e("<span class='k-loading k-complete'/>").prependTo(this)),o.attr("role","tabpanel"),o.filter(":not(."+B+")").attr("aria-hidden",!0).attr("aria-expanded",!1),o.filter("."+B).attr("aria-expanded",!0)}),t.contentElements=t.contentAnimators=t.wrapper.children("div"),t.tabsHeight=t.tabGroup.outerHeight()+parseInt(t.wrapper.css("border-top-width"),10)+parseInt(t.wrapper.css("border-bottom-width"),10),o.kineticScrollNeeded&&o.mobile.ui.Scroller&&(o.touchScroller(t.contentElements),t.contentElements=t.contentElements.children(".km-scroll-container"))},_wrapper:function(){var e=this;e.wrapper=e.element.is("ul")?e.element.wrapAll("<div />").parent():e.element,e.scrollWrap=e.wrapper.parent(".k-tabstrip-wrapper"),e.scrollWrap[0]||(e.scrollWrap=e.wrapper.wrapAll("<div class='k-tabstrip-wrapper' />").parent())},_tabPosition:function(){var e=this,t=e.options.tabPosition;e.wrapper.addClass("k-floatwrap k-tabstrip-"+t),"bottom"==t&&e.tabGroup.appendTo(e.wrapper),e.resize(!0)},_setContentElementsDimensions:function(){var e,t,n,i,r,o,a=this,s=a.options.tabPosition;("left"==s||"right"==s)&&(e=a.wrapper.children(".k-content"),t=e.filter(":visible"),n="margin-"+s,i=a.tabGroup,r=i.outerWidth(),o=Math.ceil(i.height())-parseInt(t.css("padding-top"),10)-parseInt(t.css("padding-bottom"),10)-parseInt(t.css("border-top-width"),10)-parseInt(t.css("border-bottom-width"),10),setTimeout(function(){e.css(n,r).css("min-height",o)}))},_resize:function(){this._setContentElementsDimensions(),this._scrollable()},_sizeScrollWrap:function(e){var t,n;e.is(":visible")&&(t=this.options.tabPosition,n=Math.floor(e.outerHeight(!0))+("left"===t||"right"===t?2:this.tabsHeight),this.scrollWrap.css("height",n).css("height"))},_toggleHover:function(t){e(t.currentTarget).toggleClass(O,t.type==P)},_click:function(e){var t,n,i=this,r=e.find("."+b),o=r.attr(v),a=i.options.collapsible,s=i.contentHolder(e.index());if(e.closest(".k-widget")[0]==i.wrapper[0]){if(e.is("."+R+(a?"":",."+B)))return!0;if(n=r.data(E)||o&&("#"==o.charAt(o.length-1)||-1!=o.indexOf("#"+i.element[0].id+"-")),t=!o||n,i.tabGroup.children("[data-animating]").length)return t;if(i.trigger(A,{item:e[0],contentElement:s[0]}))return!0;if(t!==!1)return a&&e.is("."+B)?(i.deactivateTab(e),!0):(i.activateTab(e)&&(t=!0),t)}},_scrollable:function(){var e,t,n,i,a=this,s=a.options;a._scrollableAllowed()&&(a.wrapper.addClass("k-tabstrip-scrollable"),e=a.wrapper[0].offsetWidth,t=a.tabGroup[0].scrollWidth,t>e&&!a._scrollableModeActive?(a._nowScrollingTabs=!1,a._isRtl=o.support.isRtl(a.element),a.wrapper.append(r("prev","k-i-arrow-w")+r("next","k-i-arrow-e")),n=a._scrollPrevButton=a.wrapper.children(".k-tabstrip-prev"),i=a._scrollNextButton=a.wrapper.children(".k-tabstrip-next"),
a.tabGroup.css({marginLeft:n.outerWidth()+9,marginRight:i.outerWidth()+12}),n.on("mousedown"+g,function(){a._nowScrollingTabs=!0,a._scrollTabsByDelta(s.scrollable.distance*(a._isRtl?1:-1))}),i.on("mousedown"+g,function(){a._nowScrollingTabs=!0,a._scrollTabsByDelta(s.scrollable.distance*(a._isRtl?-1:1))}),n.add(i).on("mouseup"+g,function(){a._nowScrollingTabs=!1}),a._scrollableModeActive=!0,a._toggleScrollButtons()):a._scrollableModeActive&&e>=t?(a._scrollableModeActive=!1,a.wrapper.removeClass("k-tabstrip-scrollable"),a._scrollPrevButton.off().remove(),a._scrollNextButton.off().remove(),a.tabGroup.css({marginLeft:"",marginRight:""})):a._scrollableModeActive?a._toggleScrollButtons():a.wrapper.removeClass("k-tabstrip-scrollable"))},_scrollableAllowed:function(){var e=this.options;return e.scrollable&&!isNaN(e.scrollable.distance)&&("top"==e.tabPosition||"bottom"==e.tabPosition)},_scrollTabsToItem:function(e){var t,n=this,i=n.tabGroup,r=i.scrollLeft(),o=e.outerWidth(),a=n._isRtl?e.position().left:e.position().left-i.children().first().position().left,s=i[0].offsetWidth,l=Math.ceil(parseFloat(i.css("padding-left")));n._isRtl?0>a?t=r+a-(s-r)-l:a+o>s&&(t=r+a-o+2*l):a+o>r+s?t=a+o-s+2*l:r>a&&(t=a-l),i.finish().animate({scrollLeft:t},"fast","linear",function(){n._toggleScrollButtons()})},_scrollTabsByDelta:function(e){var t=this,n=t.tabGroup,i=n.scrollLeft();n.finish().animate({scrollLeft:i+e},"fast","linear",function(){t._nowScrollingTabs?t._scrollTabsByDelta(e):t._toggleScrollButtons()})},_toggleScrollButtons:function(){var e=this,t=e.tabGroup,n=t.scrollLeft();e._scrollPrevButton.toggle(e._isRtl?t[0].scrollWidth-t[0].offsetWidth-1>n:0!==n),e._scrollNextButton.toggle(e._isRtl?0!==n:t[0].scrollWidth-t[0].offsetWidth-1>n)},deactivateTab:function(e){var t=this,n=t.options.animation,i=n.open,r=d({},n.close),a=r&&"effects"in r;e=t.tabGroup.find(e),r=d(a?r:d({reverse:!0},i),{hide:!0}),o.size(i.effects)?(e.kendoAddClass(F,{duration:i.duration}),e.kendoRemoveClass(B,{duration:i.duration})):(e.addClass(F),e.removeClass(B)),e.removeAttr("aria-selected"),t.contentAnimators.filter("."+B).kendoStop(!0,!0).kendoAnimate(r).removeClass(B).attr("aria-hidden",!0)},activateTab:function(e){var t,n,i,r,a,s,l,c,u,h,f,p,g,m,v;if(!this.tabGroup.children("[data-animating]").length)return e=this.tabGroup.find(e),t=this,n=t.options.animation,i=n.open,r=d({},n.close),a=r&&"effects"in r,s=e.parent().children(),l=s.filter("."+B),c=s.index(e),r=d(a?r:d({reverse:!0},i),{hide:!0}),o.size(i.effects)?(l.kendoRemoveClass(B,{duration:r.duration}),e.kendoRemoveClass(O,{duration:r.duration})):(l.removeClass(B),e.removeClass(O)),u=t.contentAnimators,t.inRequest&&(t.xhr.abort(),t.inRequest=!1),0===u.length?(t.tabGroup.find("."+H).removeClass(H),e.addClass(H).css("z-index"),e.addClass(B),t._current(e),t.trigger("change"),t._scrollableModeActive&&t._scrollTabsToItem(e),!1):(h=u.filter("."+B),f=t.contentHolder(c),p=f.closest(".k-content"),t.tabsHeight=t.tabGroup.outerHeight()+parseInt(t.wrapper.css("border-top-width"),10)+parseInt(t.wrapper.css("border-bottom-width"),10),t._sizeScrollWrap(h),0===f.length?(h.removeClass(B).attr("aria-hidden",!0).kendoStop(!0,!0).kendoAnimate(r),!1):(e.attr("data-animating",!0),g=(e.children("."+b).data(E)||!1)&&f.is(C),m=function(){t.tabGroup.find("."+H).removeClass(H),e.addClass(H).css("z-index"),o.size(i.effects)?(l.kendoAddClass(F,{duration:i.duration}),e.kendoAddClass(B,{duration:i.duration})):(l.addClass(F),e.addClass(B)),l.removeAttr("aria-selected"),e.attr("aria-selected",!0),t._current(e),t._sizeScrollWrap(p),p.addClass(B).removeAttr("aria-hidden").kendoStop(!0,!0).attr("aria-expanded",!0).kendoAnimate(d({init:function(){t.trigger(y,{item:e[0],contentElement:f[0]}),o.resize(f)}},i,{complete:function(){e.removeAttr("data-animating"),t.trigger(D,{item:e[0],contentElement:f[0]}),o.resize(f),t.scrollWrap.css("height","").css("height")}}))},v=function(){g?(e.removeAttr("data-animating"),t.ajaxRequest(e,f,function(){e.attr("data-animating",!0),m(),t.trigger("change")})):(m(),t.trigger("change")),t._scrollableModeActive&&t._scrollTabsToItem(e)},h.removeClass(B),h.attr("aria-hidden",!0),h.attr("aria-expanded",!1),h.length?h.kendoStop(!0,!0).kendoAnimate(d({complete:v},r)):v(),!0))},contentElement:function(e){var n,i,r,a;if(isNaN(e-0))return t;if(n=this.contentElements&&this.contentElements[0]&&!o.kineticScrollNeeded?this.contentElements:this.contentAnimators,e=n&&0>e?n.length+e:e,i=RegExp("-"+(e+1)+"$"),n)for(r=0,a=n.length;a>r;r++)if(i.test(n.eq(r).closest(".k-content")[0].id))return n[r];return t},contentHolder:function(t){var n=e(this.contentElement(t)),i=n.children(".km-scroll-container");return o.support.touch&&i[0]?i:n},ajaxRequest:function(t,n,i,r){var a,s,l,c,u,d,h,f,p;t=this.tabGroup.find(t),a=this,s=e.ajaxSettings.xhr,l=t.find("."+b),c={},u=t.width()/2,d=!1,h=t.find(".k-loading").removeClass("k-complete"),h[0]||(h=e("<span class='k-loading'/>").prependTo(t)),f=2*u-h.width(),p=function(){h.animate({marginLeft:(parseInt(h.css("marginLeft"),10)||0)<u?f:0},500,p)},o.support.browser.msie&&10>o.support.browser.version&&setTimeout(p,40),r=r||l.data(E)||l.attr(v),a.inRequest=!0,a.xhr=e.ajax({type:"GET",cache:!1,url:r,dataType:"html",data:c,xhr:function(){var t=this,n=s(),i=t.progressUpload?"progressUpload":t.progress?"progress":!1;return n&&e.each([n,n.upload],function(){this.addEventListener&&this.addEventListener("progress",function(e){i&&t[i](e)},!1)}),t.noProgress=!(window.XMLHttpRequest&&"upload"in new XMLHttpRequest),n},progress:function(e){if(e.lengthComputable){var t=parseInt(e.loaded/e.total*100,10)+"%";h.stop(!0).addClass("k-progress").css({width:t,marginLeft:0})}},error:function(e,t){a.trigger("error",{xhr:e,status:t})&&this.complete()},stopProgress:function(){clearInterval(d),h.stop(!0).addClass("k-progress")[0].style.cssText=""},complete:function(e){a.inRequest=!1,this.noProgress?setTimeout(this.stopProgress,500):this.stopProgress(),"abort"==e.statusText&&h.remove()},success:function(e){var s,l,c;h.addClass("k-complete");try{s=this,l=10,s.noProgress&&(h.width(l+"%"),d=setInterval(function(){s.progress({lengthComputable:!0,loaded:Math.min(l,100),total:100}),l+=10},40)),a.angular("cleanup",function(){return{elements:n.get()}}),o.destroy(n),n.html(e)}catch(u){c=window.console,c&&c.error&&c.error(u.name+": "+u.message+" in "+r),this.error(this.xhr,"error")}i&&i.call(a,n),a.angular("compile",function(){return{elements:n.get()}}),a.trigger(z,{item:t[0],contentElement:n[0]})}})}});d(j,{renderItem:function(e){e=d({tabStrip:{},group:{}},e);var t=U.empty,n=e.item;return U.item(d(e,{image:n.imageUrl?U.image:t,sprite:n.spriteCssClass?U.sprite:t,itemWrapper:U.itemWrapper},W))},renderContent:function(e){return U.content(d(e,W))}}),o.ui.plugin(j)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n){var i,r=e.getTimezoneOffset();e.setTime(e.getTime()+t),n||(i=e.getTimezoneOffset()-r,e.setTime(e.getTime()+i*z))}function i(){var e=new $,t=new $(e.getFullYear(),e.getMonth(),e.getDate(),0,0,0),n=new $(e.getFullYear(),e.getMonth(),e.getDate(),12,0,0);return-1*(t.getTimezoneOffset()-n.getTimezoneOffset())}function r(e){return 60*e.getHours()*z+e.getMinutes()*z+1e3*e.getSeconds()+e.getMilliseconds()}function o(e,t,n){var i,o=r(t),a=r(n);return e&&o!=a?(i=r(e),o>i&&(i+=R),o>a&&(a+=R),i>=o&&a>=i):!0}function a(e){var t=e.parseFormats;e.format=p(e.format||u.getCulture(e.culture).calendars.standard.patterns.t),t=j(t)?t:[t],t.splice(0,0,e.format),e.parseFormats=t}function s(e){e.preventDefault()}var l,c,u=window.kendo,d=u.keys,h=u.parseDate,f=u._activeElement,p=u._extractFormat,g=u.support,m=g.browser,v=u.ui,_=v.Widget,y="open",b="close",w="change",x=".kendoTimePicker",k="click"+x,C="k-state-default",S="disabled",T="readonly",A="li",D="<span/>",M="k-state-focused",E="k-state-hover",P="mouseenter"+x+" mouseleave"+x,I="mousedown"+x,z=6e4,R=864e5,F="k-state-selected",B="k-state-disabled",L="aria-selected",O="aria-expanded",H="aria-hidden",N="aria-disabled",V="aria-readonly",U="aria-activedescendant",W="id",j=e.isArray,G=e.extend,q=e.proxy,$=Date,Y=new $;Y=new $(Y.getFullYear(),Y.getMonth(),Y.getDate(),0,0,0),l=function(t){var n=this,i=t.id;n.options=t,n._dates=[],n.ul=e('<ul tabindex="-1" role="listbox" aria-hidden="true" unselectable="on" class="k-list k-reset"/>').css({overflow:g.kineticScrollNeeded?"":"auto"}).on(k,A,q(n._click,n)).on("mouseenter"+x,A,function(){e(this).addClass(E)}).on("mouseleave"+x,A,function(){e(this).removeClass(E)}),n.list=e("<div class='k-list-container'/>").append(n.ul).on(I,s),i&&(n._timeViewID=i+"_timeview",n._optionID=i+"_option_selected",n.ul.attr(W,n._timeViewID)),n._popup(),n._heightHandler=q(n._height,n),n.template=u.template('<li tabindex="-1" role="option" class="k-item" unselectable="on">#=data#</li>',{useWithBlock:!1})},l.prototype={current:function(n){var i=this,r=i.options.active;return n===t?i._current:(i._current&&i._current.removeClass(F).removeAttr(L).removeAttr(W),n&&(n=e(n).addClass(F).attr(W,i._optionID).attr(L,!0),i.scroll(n[0])),i._current=n,r&&r(n),t)},close:function(){this.popup.close()},destroy:function(){var e=this;e.ul.off(x),e.list.off(x),e._touchScroller&&e._touchScroller.destroy(),e.popup.destroy()},open:function(){var e=this;e.ul[0].firstChild||e.bind(),e.popup.open(),e._current&&e.scroll(e._current[0])},dataBind:function(e){for(var t,n=this,i=n.options,r=i.format,a=u.toString,s=n.template,l=e.length,c=0,d="";l>c;c++)t=e[c],o(t,i.min,i.max)&&(d+=s(a(t,r,i.culture)));n._html(d)},refresh:function(){var e,t,o,a=this,s=a.options,l=s.format,c=i(),d=0>c,h=s.min,f=s.max,p=r(h),g=r(f),m=s.interval*z,v=u.toString,_=a.template,y=new $(+h),b=y.getDate(),w=0,x="";for(o=d?(R+c*z)/m:R/m,p!=g&&(p>g&&(g+=R),o=(g-p)/m+1),t=parseInt(o,10);o>w;w++)w&&n(y,m,d),g&&t==w&&(e=r(y),b<y.getDate()&&(e+=R),e>g&&(y=new $(+f))),a._dates.push(r(y)),x+=_(v(y,l,s.culture));a._html(x)},bind:function(){var e=this,t=e.options.dates;t&&t[0]?e.dataBind(t):e.refresh()},_html:function(e){var t=this;t.ul[0].innerHTML=e,t.popup.unbind(y,t._heightHandler),t.popup.one(y,t._heightHandler),t.current(null),t.select(t._value)},scroll:function(e){if(e){var t,n=this.ul[0],i=e.offsetTop,r=e.offsetHeight,o=n.scrollTop,a=n.clientHeight,s=i+r,l=this._touchScroller;l?(t=this.list.height(),i>t&&(i=i-t+r),l.scrollTo(0,-i)):n.scrollTop=o>i?i:s>o+a?s-a:o}},select:function(t){var n,i=this,r=i.options,o=i._current;t instanceof Date&&(t=u.toString(t,r.format,r.culture)),"string"==typeof t&&(o&&o.text()===t?t=o:(t=e.grep(i.ul[0].childNodes,function(e){return(e.textContent||e.innerText)==t}),t=t[0]?t:null)),n=i._distinctSelection(t),i.current(n)},_distinctSelection:function(t){var n,i,o=this;return t&&t.length>1&&(n=r(o._value),i=e.inArray(n,o._dates),t=o.ul.children()[i]),t},setOptions:function(e){var t=this.options;e.min=h(e.min),e.max=h(e.max),this.options=G(t,e,{active:t.active,change:t.change,close:t.close,open:t.open}),this.bind()},toggle:function(){var e=this;e.popup.visible()?e.close():e.open()},value:function(e){var t=this;t._value=e,t.ul[0].firstChild&&t.select(e)},_click:function(t){var n=this,i=e(t.currentTarget),r=i.text(),o=n.options.dates;o&&o.length>0&&(r=o[i.index()]),t.isDefaultPrevented()||(n.select(i),n.options.change(r,!0),n.close())},_height:function(){var e=this,t=e.list,n=t.parent(".k-animation-container"),i=e.options.height;e.ul[0].children.length&&t.add(n).show().height(e.ul[0].scrollHeight>i?i:"auto").hide()},_parse:function(e){var t=this,n=t.options,i=t._value||Y;return e instanceof $?e:(e=h(e,n.parseFormats,n.culture),e&&(e=new $(i.getFullYear(),i.getMonth(),i.getDate(),e.getHours(),e.getMinutes(),e.getSeconds(),e.getMilliseconds())),e)},_adjustListWidth:function(){var e,t,n=this.list,i=n[0].style.width,r=this.options.anchor;(n.data("width")||!i)&&(e=window.getComputedStyle?window.getComputedStyle(r[0],null):0,t=e?parseFloat(e.width):r.outerWidth(),e&&(m.mozilla||m.msie)&&(t+=parseFloat(e.paddingLeft)+parseFloat(e.paddingRight)+parseFloat(e.borderLeftWidth)+parseFloat(e.borderRightWidth)),i=t-(n.outerWidth()-n.width()),n.css({fontFamily:r.css("font-family"),width:i}).data("width",i))},_popup:function(){var e=this,t=e.list,n=e.options,i=n.anchor;e.popup=new v.Popup(t,G(n.popup,{anchor:i,open:n.open,close:n.close,animation:n.animation,isRtl:g.isRtl(n.anchor)})),e._touchScroller=u.touchScroller(e.popup.element)},move:function(e){var n=this,i=e.keyCode,r=n.ul[0],o=n._current,a=i===d.DOWN;if(i===d.UP||a){if(e.altKey)return n.toggle(a),t;o=a?o?o[0].nextSibling:r.firstChild:o?o[0].previousSibling:r.lastChild,o&&n.select(o),n.options.change(n._current.text()),e.preventDefault()}else(i===d.ENTER||i===d.TAB||i===d.ESC)&&(e.preventDefault(),o&&n.options.change(o.text(),!0),n.close())}},l.getMilliseconds=r,u.TimeView=l,c=_.extend({init:function(t,n){var i,r,o,s=this;_.fn.init.call(s,t,n),t=s.element,n=s.options,n.min=h(t.attr("min"))||h(n.min),n.max=h(t.attr("max"))||h(n.max),a(n),s._initialOptions=G({},n),s._wrapper(),s.timeView=r=new l(G({},n,{id:t.attr(W),anchor:s.wrapper,format:n.format,change:function(e,n){n?s._change(e):t.val(e)},open:function(e){s.timeView._adjustListWidth(),s.trigger(y)?e.preventDefault():(t.attr(O,!0),i.attr(H,!1))},close:function(e){s.trigger(b)?e.preventDefault():(t.attr(O,!1),i.attr(H,!0))},active:function(e){t.removeAttr(U),e&&t.attr(U,r._optionID)}})),i=r.ul,s._icon(),s._reset();try{t[0].setAttribute("type","text")}catch(c){t[0].type="text"}t.addClass("k-input").attr({role:"combobox","aria-expanded":!1,"aria-owns":r._timeViewID}),o=t.is("[disabled]")||e(s.element).parents("fieldset").is(":disabled"),o?s.enable(!1):s.readonly(t.is("[readonly]")),s._old=s._update(n.value||s.element.val()),s._oldText=t.val(),u.notify(s)},options:{name:"TimePicker",min:Y,max:Y,format:"",dates:[],parseFormats:[],value:null,interval:30,height:200,animation:{}},events:[y,b,w],setOptions:function(e){var t=this,n=t._value;_.fn.setOptions.call(t,e),e=t.options,a(e),t.timeView.setOptions(e),n&&t.element.val(u.toString(n,e.format,e.culture))},dataBind:function(e){j(e)&&this.timeView.dataBind(e)},_editable:function(e){var t=this,n=e.disable,i=e.readonly,r=t._arrow.off(x),o=t.element.off(x),a=t._inputWrapper.off(x);i||n?(a.addClass(n?B:C).removeClass(n?C:B),o.attr(S,n).attr(T,i).attr(N,n).attr(V,i)):(a.addClass(C).removeClass(B).on(P,t._toggleHover),o.removeAttr(S).removeAttr(T).attr(N,!1).attr(V,!1).on("keydown"+x,q(t._keydown,t)).on("focusout"+x,q(t._blur,t)).on("focus"+x,function(){t._inputWrapper.addClass(M)}),r.on(k,q(t._click,t)).on(I,s))},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},destroy:function(){var e=this;_.fn.destroy.call(e),e.timeView.destroy(),e.element.off(x),e._arrow.off(x),e._inputWrapper.off(x),e._form&&e._form.off("reset",e._resetHandler)},close:function(){this.timeView.close()},open:function(){this.timeView.open()},min:function(e){return this._option("min",e)},max:function(e){return this._option("max",e)},value:function(e){var n=this;return e===t?n._value:(n._old=n._update(e),null===n._old&&n.element.val(""),n._oldText=n.element.val(),t)},_blur:function(){var e=this,t=e.element.val();e.close(),t!==e._oldText&&e._change(t),e._inputWrapper.removeClass(M)},_click:function(){var e=this,t=e.element;e.timeView.toggle(),g.touch||t[0]===f()||t.focus()},_change:function(e){var t=this;e=t._update(e),+t._old!=+e&&(t._old=e,t._oldText=t.element.val(),t._typing||t.element.trigger(w),t.trigger(w)),t._typing=!1},_icon:function(){var t,n=this,i=n.element;t=i.next("span.k-select"),t[0]||(t=e('<span unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-clock">select</span></span>').insertAfter(i)),n._arrow=t.attr({role:"button","aria-controls":n.timeView._timeViewID})},_keydown:function(e){var t=this,n=e.keyCode,i=t.timeView,r=t.element.val();i.popup.visible()||e.altKey?i.move(e):n===d.ENTER&&r!==t._oldText?t._change(r):t._typing=!0},_option:function(e,n){var i=this,r=i.options;return n===t?r[e]:(n=i.timeView._parse(n),n&&(n=new $(+n),r[e]=n,i.timeView.options[e]=n,i.timeView.bind()),t)},_toggleHover:function(t){e(t.currentTarget).toggleClass(E,"mouseenter"===t.type)},_update:function(e){var t=this,n=t.options,i=t.timeView,r=i._parse(e);return o(r,n.min,n.max)||(r=null),t._value=r,t.element.val(r?u.toString(r,n.format,n.culture):e),i.value(r),r},_wrapper:function(){var t,n=this,i=n.element;t=i.parents(".k-timepicker"),t[0]||(t=i.wrap(D).parent().addClass("k-picker-wrap k-state-default"),t=t.wrap(D).parent()),t[0].style.cssText=i[0].style.cssText,n.wrapper=t.addClass("k-widget k-timepicker k-header").addClass(i[0].className),i.css({width:"100%",height:i[0].style.height}),n._inputWrapper=e(t[0].firstChild)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){t.value(n[0].defaultValue),t.max(t._initialOptions.max),t.min(t._initialOptions.min)},t._form=r.on("reset",t._resetHandler))}}),v.plugin(c)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){var t=new Date(2100,0,1);return t.setMinutes(-e),t}function i(e){e.preventDefault()}function r(t){var n,i=o.getCulture(t.culture).calendars.standard.patterns,r=!t.parseFormats.length;t.format=c(t.format||i.g),t.timeFormat=n=c(t.timeFormat||i.t),o.DateView.normalize(t),r&&t.parseFormats.unshift("yyyy-MM-ddTHH:mm:ss"),-1===e.inArray(n,t.parseFormats)&&t.parseFormats.splice(1,0,n)}var o=window.kendo,a=o.TimeView,s=o.parseDate,l=o._activeElement,c=o._extractFormat,u=o.calendar,d=u.isInRange,h=u.restrictValue,f=u.isEqualDatePart,p=a.getMilliseconds,g=o.ui,m=g.Widget,v="open",_="close",y="change",b=".kendoDateTimePicker",w="click"+b,x="disabled",k="readonly",C="k-state-default",S="k-state-focused",T="k-state-hover",A="k-state-disabled",D="mouseenter"+b+" mouseleave"+b,M="mousedown"+b,E="month",P="<span/>",I="aria-activedescendant",z="aria-expanded",R="aria-hidden",F="aria-owns",B="aria-disabled",L="aria-readonly",O=Date,H=new O(1800,0,1),N=new O(2099,11,31),V={view:"date"},U={view:"time"},W=e.extend,j=m.extend({init:function(t,n){var i,a=this;m.fn.init.call(a,t,n),t=a.element,n=a.options,n.min=s(t.attr("min"))||s(n.min),n.max=s(t.attr("max"))||s(n.max),r(n),a._initialOptions=W({},n),a._wrapper(),a._views(),a._icons(),a._reset(),a._template();try{t[0].setAttribute("type","text")}catch(l){t[0].type="text"}t.addClass("k-input").attr({role:"combobox","aria-expanded":!1}),a._midnight=a._calculateMidnight(n.min,n.max),i=t.is("[disabled]")||e(a.element).parents("fieldset").is(":disabled"),i?a.enable(!1):a.readonly(t.is("[readonly]")),a._old=a._update(n.value||a.element.val()),a._oldText=t.val(),o.notify(a)},options:{name:"DateTimePicker",value:null,format:"",timeFormat:"",culture:"",parseFormats:[],dates:[],min:new O(H),max:new O(N),interval:30,height:200,footer:"",start:E,depth:E,animation:{},month:{},ARIATemplate:'Current focused date is #=kendo.toString(data.current, "d")#'},events:[v,_,y],setOptions:function(e){var t,n,i,a=this,l=a._value;m.fn.setOptions.call(a,e),e=a.options,e.min=t=s(e.min),e.max=n=s(e.max),r(e),a._midnight=a._calculateMidnight(e.min,e.max),i=e.value||a._value||a.dateView._current,t&&!f(t,i)&&(t=new O(H)),n&&!f(n,i)&&(n=new O(N)),a.dateView.setOptions(e),a.timeView.setOptions(W({},e,{format:e.timeFormat,min:t,max:n})),l&&(a.element.val(o.toString(l,e.format,e.culture)),a._updateARIA(l))},_editable:function(t){var n=this,r=n.element.off(b),a=n._dateIcon.off(b),s=n._timeIcon.off(b),c=n._inputWrapper.off(b),u=t.readonly,d=t.disable;u||d?(c.addClass(d?A:C).removeClass(d?C:A),r.attr(x,d).attr(k,u).attr(B,d).attr(L,u)):(c.addClass(C).removeClass(A).on(D,n._toggleHover),r.removeAttr(x).removeAttr(k).attr(B,!1).attr(L,!1).on("keydown"+b,e.proxy(n._keydown,n)).on("focus"+b,function(){n._inputWrapper.addClass(S)}).on("focusout"+b,function(){n._inputWrapper.removeClass(S),r.val()!==n._oldText&&n._change(r.val()),n.close("date"),n.close("time")}),a.on(M,i).on(w,function(){n.toggle("date"),o.support.touch||r[0]===l()||r.focus()}),s.on(M,i).on(w,function(){n.toggle("time"),o.support.touch||r[0]===l()||r.focus()}))},readonly:function(e){this._editable({readonly:e===t?!0:e,disable:!1})},enable:function(e){this._editable({readonly:!1,disable:!(e=e===t?!0:e)})},destroy:function(){var e=this;m.fn.destroy.call(e),e.dateView.destroy(),e.timeView.destroy(),e.element.off(b),e._dateIcon.off(b),e._timeIcon.off(b),e._inputWrapper.off(b),e._form&&e._form.off("reset",e._resetHandler)},close:function(e){"time"!==e&&(e="date"),this[e+"View"].close()},open:function(e){"time"!==e&&(e="date"),this[e+"View"].open()},min:function(e){return this._option("min",e)},max:function(e){return this._option("max",e)},toggle:function(e){var t="timeView";"time"!==e?e="date":t="dateView",this[e+"View"].toggle(),this[t].close()},value:function(e){var n=this;return e===t?n._value:(n._old=n._update(e),null===n._old&&n.element.val(""),n._oldText=n.element.val(),t)},_change:function(e){var t=this;e=t._update(e),+t._old!=+e&&(t._old=e,t._oldText=t.element.val(),t.trigger(y),t._typing||t.element.trigger(y))},_option:function(e,i){var r,o,a=this,l=a.options,c=a.timeView,u=c.options,d=a._value||a._old;if(i===t)return l[e];if(i=s(i,l.parseFormats,l.culture)){if(l.min.getTime()===l.max.getTime()&&(u.dates=[]),l[e]=new O(i.getTime()),a.dateView[e](i),a._midnight=a._calculateMidnight(l.min,l.max),d&&(r=f(l.min,d),o=f(l.max,d)),r||o){if(u[e]=i,r&&!o&&(u.max=n(l.interval)),o){if(a._midnight)return c.dataBind([N]),t;r||(u.min=H)}}else u.max=N,u.min=H;c.bind()}},_toggleHover:function(t){e(t.currentTarget).toggleClass(T,"mouseenter"===t.type)},_update:function(t){var i,r,a,l,c,u=this,p=u.options,g=p.min,m=p.max,v=p.dates,_=u.timeView,b=u._value,w=s(t,p.parseFormats,p.culture),x=null===w&&null===b||w instanceof Date&&b instanceof Date;return+w===+b&&x?(c=o.toString(w,p.format,p.culture),c!==t&&(u.element.val(null===w?t:c),u.element.trigger(y)),w):(null!==w&&f(w,g)?w=h(w,g,m):d(w,g,m)||(w=null),u._value=w,_.value(w),u.dateView.value(w),w&&(a=u._old,r=_.options,v[0]&&(v=e.grep(v,function(e){return f(w,e)}),v[0]&&(_.dataBind(v),l=!0)),l||(f(w,g)&&(r.min=g,r.max=n(p.interval),i=!0),f(w,m)&&(u._midnight?(_.dataBind([N]),l=!0):(r.max=m,i||(r.min=H),i=!0))),!l&&(!a&&i||a&&!f(a,w))&&(i||(r.max=N,r.min=H),_.bind())),u.element.val(w?o.toString(w,p.format,p.culture):t),u._updateARIA(w),w)},_keydown:function(e){var t=this,n=t.dateView,i=t.timeView,r=t.element.val(),a=n.popup.visible();e.altKey&&e.keyCode===o.keys.DOWN?t.toggle(a?"time":"date"):a?(n.move(e),t._updateARIA(n._current)):i.popup.visible()?i.move(e):e.keyCode===o.keys.ENTER&&r!==t._oldText?t._change(r):t._typing=!0},_views:function(){var e,t,n,i,r,l,c=this,u=c.element,h=c.options,f=u.attr("id");c.dateView=e=new o.DateView(W({},h,{id:f,anchor:c.wrapper,change:function(){var t,n=e.calendar.value(),i=+n,r=+h.min,o=+h.max;(i===r||i===o)&&(t=new O(+c._value),t.setFullYear(n.getFullYear(),n.getMonth(),n.getDate()),d(t,r,o)&&(n=t)),c._change(n),c.close("date")},close:function(e){c.trigger(_,V)?e.preventDefault():(u.attr(z,!1),n.attr(R,!0),t.popup.visible()||u.removeAttr(F))},open:function(t){c.trigger(v,V)?t.preventDefault():(u.val()!==c._oldText&&(l=s(u.val(),h.parseFormats,h.culture),c.dateView[l?"current":"value"](l)),n.attr(R,!1),u.attr(z,!0).attr(F,e._dateViewID),c._updateARIA(l))}})),n=e.div,r=h.min.getTime(),c.timeView=t=new a({id:f,value:h.value,anchor:c.wrapper,animation:h.animation,format:h.timeFormat,culture:h.culture,height:h.height,interval:h.interval,min:new O(H),max:new O(N),dates:r===h.max.getTime()?[new Date(r)]:[],parseFormats:h.parseFormats,change:function(n,i){n=t._parse(n),h.min>n?(n=new O(+h.min),t.options.min=n):n>h.max&&(n=new O(+h.max),t.options.max=n),i?(c._timeSelected=!0,c._change(n)):(u.val(o.toString(n,h.format,h.culture)),e.value(n),c._updateARIA(n))},close:function(t){c.trigger(_,U)?t.preventDefault():(i.attr(R,!0),u.attr(z,!1),e.popup.visible()||u.removeAttr(F))},open:function(e){t._adjustListWidth(),c.trigger(v,U)?e.preventDefault():(u.val()!==c._oldText&&(l=s(u.val(),h.parseFormats,h.culture),c.timeView.value(l)),i.attr(R,!1),u.attr(z,!0).attr(F,t._timeViewID),t.options.active(t.current()))},active:function(e){u.removeAttr(I),e&&u.attr(I,t._optionID)}}),i=t.ul},_icons:function(){var t,n=this,i=n.element;t=i.next("span.k-select"),t[0]||(t=e('<span unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-calendar">select</span><span unselectable="on" class="k-icon k-i-clock">select</span></span>').insertAfter(i)),t=t.children(),n._dateIcon=t.eq(0).attr({role:"button","aria-controls":n.dateView._dateViewID}),n._timeIcon=t.eq(1).attr({role:"button","aria-controls":n.timeView._timeViewID})},_wrapper:function(){var t,n=this,i=n.element;t=i.parents(".k-datetimepicker"),t[0]||(t=i.wrap(P).parent().addClass("k-picker-wrap k-state-default"),t=t.wrap(P).parent()),t[0].style.cssText=i[0].style.cssText,i.css({width:"100%",height:i[0].style.height}),n.wrapper=t.addClass("k-widget k-datetimepicker k-header").addClass(i[0].className),n._inputWrapper=e(t[0].firstChild)},_reset:function(){var t=this,n=t.element,i=n.attr("form"),r=i?e("#"+i):n.closest("form");r[0]&&(t._resetHandler=function(){t.value(n[0].defaultValue),t.max(t._initialOptions.max),t.min(t._initialOptions.min)},t._form=r.on("reset",t._resetHandler))},_template:function(){this._ariaTemplate=o.template(this.options.ARIATemplate)},_calculateMidnight:function(e,t){return p(e)+p(t)===0},_updateARIA:function(e){var t,n=this,i=n.dateView.calendar;n.element.removeAttr(I),i&&(t=i._cell,t.attr("aria-label",n._ariaTemplate({current:e||i.current()})),n.element.attr(I,t.attr("id")))}});g.plugin(j)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){return v.test(e)}function i(e){return m.test(e)||/^\d+$/.test(e)}function r(e){return!n(e)&&!i(e)}function o(e,t){var i=parseInt(e,10);return n(e)&&(i=Math.floor(i*t/100)),i}function a(e,n){return function(i,r){var o,a=this.element.find(i).data(M);return 1==arguments.length?a[e]:(a[e]=r,n&&(o=this.element.data("kendo"+this.options.name),o.resize(!0)),t)}}function s(e){var t=this,n=e.orientation;t.owner=e,t._element=e.element,t.orientation=n,f(t,n===S?c:l),t._resizable=new u.ui.Resizable(e.element,{orientation:n,handle:".k-splitbar-draggable-"+n+"[data-marker="+e._marker+"]",hint:p(t._createHint,t),start:p(t._start,t),max:p(t._max,t),min:p(t._min,t),invalidClass:"k-restricted-size-"+n,resizeend:p(t._stop,t)})}var l,c,u=window.kendo,d=u.ui,h=u.keys,f=e.extend,p=e.proxy,g=d.Widget,m=/^\d+(\.\d+)?px$/i,v=/^\d+(\.\d+)?%$/i,_=".kendoSplitter",y="expand",b="collapse",w="contentLoad",x="error",k="resize",C="layoutChange",S="horizontal",T="vertical",A="mouseenter",D="click",M="pane",E="mouseleave",P="k-state-focused",I="k-"+M,z="."+I,R=g.extend({init:function(e,t){var n,i=this;g.fn.init.call(i,e,t),i.wrapper=i.element,n=i.options.orientation.toLowerCase()!=T,i.orientation=n?S:T,i._dimension=n?"width":"height",i._keys={decrease:n?h.LEFT:h.UP,increase:n?h.RIGHT:h.DOWN},i._resizeStep=10,i._marker=u.guid().substring(0,8),i._initPanes(),i.resizing=new s(i),i.element.triggerHandler("init"+_)},events:[y,b,w,x,k,C],_addOverlays:function(){this._panes().append("<div class='k-splitter-overlay k-overlay' />")},_removeOverlays:function(){this._panes().children(".k-splitter-overlay").remove()},_attachEvents:function(){var t=this,n=t.options.orientation;t.element.children(".k-splitbar-draggable-"+n).on("keydown"+_,p(t._keydown,t)).on("mousedown"+_,function(e){e.currentTarget.focus()}).on("focus"+_,function(t){e(t.currentTarget).addClass(P)}).on("blur"+_,function(n){e(n.currentTarget).removeClass(P),t.resizing&&t.resizing.end()}).on(A+_,function(){e(this).addClass("k-splitbar-"+t.orientation+"-hover")}).on(E+_,function(){e(this).removeClass("k-splitbar-"+t.orientation+"-hover")}).on("mousedown"+_,p(t._addOverlays,t)).end().children(".k-splitbar").on("dblclick"+_,p(t._togglePane,t)).children(".k-collapse-next, .k-collapse-prev").on(D+_,t._arrowClick(b)).end().children(".k-expand-next, .k-expand-prev").on(D+_,t._arrowClick(y)).end().end(),e(window).on("resize"+_+t._marker,p(t.resize,t,!1)),e(document).on("mouseup"+_+t._marker,p(t._removeOverlays,t))},_detachEvents:function(){var t=this;t.element.children(".k-splitbar-draggable-"+t.orientation).off(_).end().children(".k-splitbar").off("dblclick"+_).children(".k-collapse-next, .k-collapse-prev, .k-expand-next, .k-expand-prev").off(_),e(window).off(_+t._marker),e(document).off(_+t._marker)},options:{name:"Splitter",orientation:S,panes:[]},destroy:function(){g.fn.destroy.call(this),this._detachEvents(),this.resizing&&this.resizing.destroy(),u.destroy(this.element),this.wrapper=this.element=null},_keydown:function(t){var n,i=this,r=t.keyCode,o=i.resizing,a=e(t.currentTarget),s=i._keys,l=r===s.increase,c=r===s.decrease;l||c?(t.ctrlKey?(n=a[c?"next":"prev"](),o&&o.isResizing()&&o.end(),n[i._dimension]()?i._triggerAction(b,a[c?"prev":"next"]()):i._triggerAction(y,n)):o&&o.move((c?-1:1)*i._resizeStep,a),t.preventDefault()):r===h.ENTER&&o&&(o.end(),t.preventDefault())},_initPanes:function(){var e=this.options.panes||[],t=this;this.element.addClass("k-widget").addClass("k-splitter").children().each(function(n,i){"script"!=i.nodeName.toLowerCase()&&t._initPane(i,e[n])}),this.resize()},_initPane:function(t,n){t=e(t).attr("role","group").addClass(I),t.data(M,n?n:{}).toggleClass("k-scrollable",n?n.scrollable!==!1:!0),this.ajaxRequest(t)},ajaxRequest:function(e,t,n){var i,r=this;e=r.element.find(e),i=e.data(M),t=t||i.contentUrl,t&&(e.append("<span class='k-icon k-loading k-pane-loading' />"),u.isLocalUrl(t)?jQuery.ajax({url:t,data:n||{},type:"GET",dataType:"html",success:function(t){r.angular("cleanup",function(){return{elements:e.get()}}),e.html(t),r.angular("compile",function(){return{elements:e.get()}}),r.trigger(w,{pane:e[0]})},error:function(t,n){r.trigger(x,{pane:e[0],status:n,xhr:t})}}):e.removeClass("k-scrollable").html("<iframe src='"+t+"' frameborder='0' class='k-content-frame'>This page requires frames in order to show content</iframe>"))},_triggerAction:function(e,t){this.trigger(e,{pane:t[0]})||this[e](t[0])},_togglePane:function(t){var n,i=this,r=e(t.target);r.closest(".k-splitter")[0]==i.element[0]&&(n=r.children(".k-icon:not(.k-resize-handle)"),1===n.length&&(n.is(".k-collapse-prev")?i._triggerAction(b,r.prev()):n.is(".k-collapse-next")?i._triggerAction(b,r.next()):n.is(".k-expand-prev")?i._triggerAction(y,r.prev()):n.is(".k-expand-next")&&i._triggerAction(y,r.next())))},_arrowClick:function(t){var n=this;return function(i){var r,o=e(i.target);o.closest(".k-splitter")[0]==n.element[0]&&(r=o.is(".k-"+t+"-prev")?o.parent().prev():o.parent().next(),n._triggerAction(t,r))}},_updateSplitBar:function(e,t,n){var i=function(e,t){return t?"<div class='k-icon "+e+"' />":""},r=this.orientation,o=t.resizable!==!1&&n.resizable!==!1,a=t.collapsible,s=t.collapsed,l=n.collapsible,c=n.collapsed;e.addClass("k-splitbar k-state-default k-splitbar-"+r).attr("role","separator").attr("aria-expanded",!(s||c)).removeClass("k-splitbar-"+r+"-hover").toggleClass("k-splitbar-draggable-"+r,o&&!s&&!c).toggleClass("k-splitbar-static-"+r,!o&&!a&&!l).html(i("k-collapse-prev",a&&!s&&!c)+i("k-expand-prev",a&&s&&!c)+i("k-resize-handle",o)+i("k-collapse-next",l&&!c&&!s)+i("k-expand-next",l&&c&&!s)),o||a||l||e.removeAttr("tabindex")},_updateSplitBars:function(){var t=this;this.element.children(".k-splitbar").each(function(){var n=e(this),i=n.prevAll(z).first().data(M),r=n.nextAll(z).first().data(M);r&&t._updateSplitBar(n,i,r)})},_removeSplitBars:function(){this.element.children(".k-splitbar").remove()},_panes:function(){return this.element?this.element.children(z):e()},_resize:function(){var n,i,a,s,l,c,d,h,f,p,g=this,m=g.element,v=m.children(z),_=g.orientation==S,y=m.children(".k-splitbar"),b=y.length,w=_?"width":"height",x=m[w]();g.wrapper.addClass("k-splitter-resizing"),0===b?(b=v.length-1,v.slice(0,b).after("<div tabindex='0' class='k-splitbar' data-marker='"+g._marker+"' />"),
g._updateSplitBars(),y=m.children(".k-splitbar")):g._updateSplitBars(),y.each(function(){x-=this[_?"offsetWidth":"offsetHeight"]}),n=0,i=0,a=e(),v.css({position:"absolute",top:0})[w](function(){var s,l=e(this),c=l.data(M)||{};if(l.removeClass("k-state-collapsed"),c.collapsed)s=c.collapsedSize?o(c.collapsedSize,x):0,l.css("overflow","hidden").addClass("k-state-collapsed");else{if(r(c.size))return a=a.add(this),t;s=o(c.size,x)}return i++,n+=s,s}),x-=n,s=a.length,l=Math.floor(x/s),a.slice(0,s-1).css(w,l).end().eq(s-1).css(w,x-(s-1)*l),c=0,d=_?"height":"width",h=_?"left":"top",f=_?"offsetWidth":"offsetHeight",0===s&&(p=v.filter(function(){return!(e(this).data(M)||{}).collapsed}).last(),p[w](x+p[0][f])),m.children().css(d,m[d]()).each(function(e,t){"script"!=t.tagName.toLowerCase()&&(t.style[h]=Math.floor(c)+"px",c+=t[f])}),g._detachEvents(),g._attachEvents(),g.wrapper.removeClass("k-splitter-resizing"),u.resize(v),g.trigger(C)},toggle:function(e,n){var i,r=this;e=r.element.find(e),i=e.data(M),(n||i.collapsible)&&(1==arguments.length&&(n=i.collapsed===t?!1:i.collapsed),i.collapsed=!n,i.collapsed?e.css("overflow","hidden"):e.css("overflow",""),r.resize(!0))},collapse:function(e){this.toggle(e,!1)},expand:function(e){this.toggle(e,!0)},_addPane:function(e,t,n){var i=this;return n.length&&(i.options.panes.splice(t,0,e),i._initPane(n,e),i._removeSplitBars(),i.resize(!0)),n},append:function(t){t=t||{};var n=this,i=e("<div />").appendTo(n.element);return n._addPane(t,n.options.panes.length,i)},insertBefore:function(t,n){n=e(n),t=t||{};var i=this,r=i.wrapper.children(".k-pane").index(n),o=e("<div />").insertBefore(e(n));return i._addPane(t,r,o)},insertAfter:function(t,n){n=e(n),t=t||{};var i=this,r=i.wrapper.children(".k-pane").index(n),o=e("<div />").insertAfter(e(n));return i._addPane(t,r+1,o)},remove:function(t){t=e(t);var n=this;return t.length&&(u.destroy(t),t.each(function(t,i){n.options.panes.splice(n.wrapper.children(".k-pane").index(i),1),e(i).remove()}),n._removeSplitBars(),n.options.panes.length&&n.resize(!0)),n},size:a("size",!0),min:a("min"),max:a("max")});d.plugin(R),l={sizingProperty:"height",sizingDomProperty:"offsetHeight",alternateSizingProperty:"width",positioningProperty:"top",mousePositioningProperty:"pageY"},c={sizingProperty:"width",sizingDomProperty:"offsetWidth",alternateSizingProperty:"height",positioningProperty:"left",mousePositioningProperty:"pageX"},s.prototype={press:function(e){this._resizable.press(e)},move:function(e,t){this.pressed||(this.press(t),this.pressed=!0),this._resizable.target||this._resizable.press(t),this._resizable.move(e)},end:function(){this._resizable.end(),this.pressed=!1},destroy:function(){this._resizable.destroy(),this._resizable=this._element=this.owner=null},isResizing:function(){return this._resizable.resizing},_createHint:function(t){var n=this;return e("<div class='k-ghost-splitbar k-ghost-splitbar-"+n.orientation+" k-state-default' />").css(n.alternateSizingProperty,t[n.alternateSizingProperty]())},_start:function(t){var n=this,r=e(t.currentTarget),o=r.prev(),a=r.next(),s=o.data(M),l=a.data(M),c=parseInt(o[0].style[n.positioningProperty],10),u=parseInt(a[0].style[n.positioningProperty],10)+a[0][n.sizingDomProperty]-r[0][n.sizingDomProperty],d=parseInt(n._element.css(n.sizingProperty),10),h=function(e){var t=parseInt(e,10);return(i(e)?t:d*t/100)||0},f=h(s.min),p=h(s.max)||u-c,g=h(l.min),m=h(l.max)||u-c;n.previousPane=o,n.nextPane=a,n._maxPosition=Math.min(u-g,c+p),n._minPosition=Math.max(c+f,u-m)},_max:function(){return this._maxPosition},_min:function(){return this._minPosition},_stop:function(t){var n,i,o,a,s,l,c,d,h=this,f=e(t.currentTarget),p=h.owner;return p._panes().children(".k-splitter-overlay").remove(),t.keyCode!==u.keys.ESC&&(n=t.position,i=f.prev(),o=f.next(),a=i.data(M),s=o.data(M),l=n-parseInt(i[0].style[h.positioningProperty],10),c=parseInt(o[0].style[h.positioningProperty],10)+o[0][h.sizingDomProperty]-n-f[0][h.sizingDomProperty],d=h._element.children(z).filter(function(){return r(e(this).data(M).size)}).length,(!r(a.size)||d>1)&&(r(a.size)&&d--,a.size=l+"px"),(!r(s.size)||d>1)&&(s.size=c+"px"),p.resize(!0)),!1}}}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){return t!==e}function i(e,t,n){return Math.max(Math.min(parseInt(e,10),n===1/0?n:parseInt(n,10)),parseInt(t,10))}function r(e,t){return function(){var n=this,i=n.wrapper,r=i[0].style,o=n.options;return o.isMaximized||o.isMinimized?n:(n.restoreOptions={width:r.width,height:r.height},i.children(k).hide().end().children(w).find(G).parent().hide().eq(0).before(Z.action({name:"Restore"})),t.call(n),"maximize"==e?n.wrapper.children(w).find(Y).parent().hide():n.wrapper.children(w).find(Y).parent().show(),n)}}function o(){return!this.type||this.type.toLowerCase().indexOf("script")>=0}function a(e){var t=this;t.owner=e,t._draggable=new u(e.wrapper,{filter:">"+k,group:e.wrapper.id+"-resizing",dragstart:f(t.dragstart,t),drag:f(t.drag,t),dragend:f(t.dragend,t)}),t._draggable.userEvents.bind("press",f(t.addOverlay,t)),t._draggable.userEvents.bind("release",f(t.removeOverlay,t))}function s(e,t){var n=this;n.owner=e,n._draggable=new u(e.wrapper,{filter:t,group:e.wrapper.id+"-moving",dragstart:f(n.dragstart,n),drag:f(n.drag,n),dragend:f(n.dragend,n),dragcancel:f(n.dragcancel,n)}),n._draggable.userEvents.stopPropagation=!1}var l=window.kendo,c=l.ui.Widget,u=l.ui.Draggable,d=e.isPlainObject,h=l._activeElement,f=e.proxy,p=e.extend,g=e.each,m=l.template,v="body",_=".kendoWindow",y=".k-window",b=".k-window-title",w=b+"bar",x=".k-window-content",k=".k-resize-handle",C=".k-overlay",S="k-content-frame",T="k-loading",A="k-state-hover",D="k-state-focused",M="k-window-maximized",E=":visible",P="hidden",I="cursor",z="open",R="activate",F="deactivate",B="close",L="refresh",O="resize",H="resizeEnd",N="dragstart",V="dragend",U="error",W="overflow",j="zIndex",G=".k-window-actions .k-i-minimize,.k-window-actions .k-i-maximize",q=".k-i-pin",$=".k-i-unpin",Y=q+","+$,K=".k-window-titlebar .k-window-action",Q=".k-window-titlebar .k-i-refresh",X=l.isLocalUrl,J=c.extend({init:function(i,r){var a,s,u,h,p,g,m,v=this,k={},C=!1,S=r&&r.actions&&!r.actions.length;c.fn.init.call(v,i,r),r=v.options,h=r.position,i=v.element,p=r.content,S&&(r.actions=[]),v.appendTo=e(r.appendTo),p&&!d(p)&&(p=r.content={url:p}),i.find("script").filter(o).remove(),i.parent().is(v.appendTo)||h.top!==t&&h.left!==t||(i.is(E)?(k=i.offset(),C=!0):(s=i.css("visibility"),u=i.css("display"),i.css({visibility:P,display:""}),k=i.offset(),i.css({visibility:s,display:u})),h.top===t&&(h.top=k.top),h.left===t&&(h.left=k.left)),n(r.visible)&&null!==r.visible||(r.visible=i.is(E)),a=v.wrapper=i.closest(y),i.is(".k-content")&&a[0]||(i.addClass("k-window-content k-content"),v._createWindow(i,r),a=v.wrapper=i.closest(y),v._dimensions()),v._position(),r.pinned&&v.pin(!0),p&&v.refresh(p),r.visible&&v.toFront(),g=a.children(x),v._tabindex(g),r.visible&&r.modal&&v._overlay(a.is(E)).css({opacity:.5}),a.on("mouseenter"+_,K,f(v._buttonEnter,v)).on("mouseleave"+_,K,f(v._buttonLeave,v)).on("click"+_,"> "+K,f(v._windowActionHandler,v)),g.on("keydown"+_,f(v._keydown,v)).on("focus"+_,f(v._focus,v)).on("blur"+_,f(v._blur,v)),this._resizable(),this._draggable(),m=i.attr("id"),m&&(m+="_wnd_title",a.children(w).children(b).attr("id",m),g.attr({role:"dialog","aria-labelledby":m})),a.add(a.children(".k-resize-handle,"+w)).on("mousedown"+_,f(v.toFront,v)),v.touchScroller=l.touchScroller(i),v._resizeHandler=f(v._onDocumentResize,v),v._marker=l.guid().substring(0,8),e(window).on("resize"+_+v._marker,v._resizeHandler),r.visible&&(v.trigger(z),v.trigger(R)),l.notify(v)},_buttonEnter:function(t){e(t.currentTarget).addClass(A)},_buttonLeave:function(t){e(t.currentTarget).removeClass(A)},_focus:function(){this.wrapper.addClass(D)},_blur:function(){this.wrapper.removeClass(D)},_dimensions:function(){var e,t,n=this.wrapper,r=this.options,o=r.width,a=r.height,s=r.maxHeight,l=["minWidth","minHeight","maxWidth","maxHeight"];for(this.title(r.title),e=0;l.length>e;e++)t=r[l[e]],t&&t!=1/0&&n.css(l[e],t);s&&s!=1/0&&this.element.css("maxHeight",s),o&&n.width((""+o).indexOf("%")>0?o:i(o,r.minWidth,r.maxWidth)),a&&n.height((""+a).indexOf("%")>0?a:i(a,r.minHeight,r.maxHeight)),r.visible||n.hide()},_position:function(){var e=this.wrapper,t=this.options.position;0===t.top&&(t.top=""+t.top),0===t.left&&(t.left=""+t.left),e.css({top:t.top||"",left:t.left||""})},_animationOptions:function(e){var t=this.options.animation,n={open:{effects:{}},close:{hide:!0,effects:{}}};return t&&t[e]||n[e]},_resize:function(){l.resize(this.element.children())},_resizable:function(){var t=this.options.resizable,n=this.wrapper;this.resizing&&(n.off("dblclick"+_).children(k).remove(),this.resizing.destroy(),this.resizing=null),t&&(n.on("dblclick"+_,w,f(function(t){e(t.target).closest(".k-window-action").length||this.toggleMaximization()},this)),g("n e s w se sw ne nw".split(" "),function(e,t){n.append(Z.resizeHandle(t))}),this.resizing=new a(this)),n=null},_draggable:function(){var e=this.options.draggable;this.dragging&&(this.dragging.destroy(),this.dragging=null),e&&(this.dragging=new s(this,e.dragHandle||w))},_actions:function(){var t=this.options.actions,n=this.wrapper.children(w),i=n.find(".k-window-actions");t=e.map(t,function(e){return{name:e}}),i.html(l.render(Z.action,t))},setOptions:function(e){var n,i;c.fn.setOptions.call(this,e),n=this.options.scrollable!==!1,this.restore(),this._dimensions(),this._position(),this._resizable(),this._draggable(),this._actions(),t!==e.modal&&(i=this.options.visible!==!1,this._overlay(e.modal&&i)),this.element.css(W,n?"":"hidden")},events:[z,R,F,B,L,O,H,N,V,U],options:{name:"Window",animation:{open:{effects:{zoom:{direction:"in"},fade:{direction:"in"}},duration:350},close:{effects:{zoom:{direction:"out",properties:{scale:.7}},fade:{direction:"out"}},duration:350,hide:!0}},title:"",actions:["Close"],autoFocus:!0,modal:!1,resizable:!0,draggable:!0,minWidth:90,minHeight:50,maxWidth:1/0,maxHeight:1/0,pinned:!1,scrollable:!0,position:{},content:null,visible:null,height:null,width:null,appendTo:"body"},_closable:function(){return e.inArray("close",e.map(this.options.actions,function(e){return e.toLowerCase()}))>-1},_keydown:function(e){var t,n,r,o,a,s,c=this,u=c.options,d=l.keys,h=e.keyCode,f=c.wrapper,p=10,g=c.options.isMaximized;e.target!=e.currentTarget||c._closing||(h==d.ESC&&c._closable()&&c._close(!1),!u.draggable||e.ctrlKey||g||(t=l.getOffset(f),h==d.UP?n=f.css("top",t.top-p):h==d.DOWN?n=f.css("top",t.top+p):h==d.LEFT?n=f.css("left",t.left-p):h==d.RIGHT&&(n=f.css("left",t.left+p))),u.resizable&&e.ctrlKey&&!g&&(h==d.UP?(n=!0,o=f.height()-p):h==d.DOWN&&(n=!0,o=f.height()+p),h==d.LEFT?(n=!0,r=f.width()-p):h==d.RIGHT&&(n=!0,r=f.width()+p),n&&(a=i(r,u.minWidth,u.maxWidth),s=i(o,u.minHeight,u.maxHeight),isNaN(a)||(f.width(a),c.options.width=a+"px"),isNaN(s)||(f.height(s),c.options.height=s+"px"),c.resize())),n&&e.preventDefault())},_overlay:function(t){var n=this.appendTo.children(C),i=this.wrapper;return n.length||(n=e("<div class='k-overlay' />")),n.insertBefore(i[0]).toggle(t).css(j,parseInt(i.css(j),10)-1),n},_actionForIcon:function(e){var t=/\bk-i-\w+\b/.exec(e[0].className)[0];return{"k-i-close":"_close","k-i-maximize":"maximize","k-i-minimize":"minimize","k-i-restore":"restore","k-i-refresh":"refresh","k-i-pin":"pin","k-i-unpin":"unpin"}[t]},_windowActionHandler:function(n){var i,r;if(!this._closing)return i=e(n.target).closest(".k-window-action").find(".k-icon"),r=this._actionForIcon(i),r?(n.preventDefault(),this[r](),!1):t},_modals:function(){var t=this,n=e(y).filter(function(){var n=e(this),i=t._object(n),r=i&&i.options;return r&&r.modal&&r.visible&&r.appendTo===t.options.appendTo&&n.is(E)}).sort(function(t,n){return+e(t).css("zIndex")-+e(n).css("zIndex")});return t=null,n},_object:function(e){var n=e.children(x),i=l.widgetInstance(n);return i instanceof J?i:t},center:function(){var t,n,i=this,r=i.options.position,o=i.wrapper,a=e(window),s=0,l=0;return i.options.isMaximized?i:(i.options.pinned||(s=a.scrollTop(),l=a.scrollLeft()),n=l+Math.max(0,(a.width()-o.width())/2),t=s+Math.max(0,(a.height()-o.height()-parseInt(o.css("paddingTop"),10))/2),o.css({left:n,top:t}),r.top=t,r.left=n,i)},title:function(e){var t,n=this,i=n.wrapper,r=n.options,o=i.children(w),a=o.children(b);return arguments.length?(e===!1?(i.addClass("k-window-titleless"),o.remove()):(o.length?a.html(e):(i.prepend(Z.titlebar(r)),n._actions(),o=i.children(w)),t=o.outerHeight(),i.css("padding-top",t),o.css("margin-top",-t)),n.options.title=e,n):a.text()},content:function(e,t){var i=this.wrapper.children(x),r=i.children(".km-scroll-container");return i=r[0]?r:i,n(e)?(this.angular("cleanup",function(){return{elements:i.children()}}),l.destroy(this.element.children()),i.empty().html(e),this.angular("compile",function(){var e,n=[];for(e=i.length;--e>=0;)n.push({dataItem:t});return{elements:i.children(),data:n}}),this):i.html()},open:function(){var t,n,i=this,r=i.wrapper,o=i.options,a=this._animationOptions("open"),s=r.children(x),c=e(document);return i.trigger(z)||(i._closing&&r.kendoStop(!0,!0),i._closing=!1,i.toFront(),o.autoFocus&&i.element.focus(),o.visible=!0,o.modal&&(t=i._overlay(!1),t.kendoStop(!0,!0),a.duration&&l.effects.Fade?(n=l.fx(t).fadeIn(),n.duration(a.duration||0),n.endValue(.5),n.play()):t.css("opacity",.5),t.show()),r.is(E)||(s.css(W,P),r.show().kendoStop().kendoAnimate({effects:a.effects,duration:a.duration,complete:f(this._activate,this)}))),o.isMaximized&&(i._documentScrollTop=c.scrollTop(),i._documentScrollLeft=c.scrollLeft(),e("html, body").css(W,P)),i},_activate:function(){var e=this.options.scrollable!==!1;this.options.autoFocus&&this.element.focus(),this.element.css(W,e?"":"hidden"),this.trigger(R)},_removeOverlay:function(n){var i,r=this._modals(),o=this.options,a=o.modal&&!r.length,s=o.modal?this._overlay(!0):e(t),c=this._animationOptions("close");a?!n&&c.duration&&l.effects.Fade?(i=l.fx(s).fadeOut(),i.duration(c.duration||0),i.startValue(.5),i.play()):this._overlay(!1).remove():r.length&&this._object(r.last())._overlay(!0)},_close:function(t){var n=this,i=n.wrapper,r=n.options,o=this._animationOptions("open"),a=this._animationOptions("close"),s=e(document);if(i.is(E)&&!n.trigger(B,{userTriggered:!t})){if(n._closing)return;n._closing=!0,r.visible=!1,e(y).each(function(t,n){var r=e(n).children(x);n!=i&&r.find("> ."+S).length>0&&r.children(C).remove()}),this._removeOverlay(),i.kendoStop().kendoAnimate({effects:a.effects||o.effects,reverse:a.reverse===!0,duration:a.duration,complete:f(this._deactivate,this)})}n.options.isMaximized&&(e("html, body").css(W,""),n._documentScrollTop&&n._documentScrollTop>0&&s.scrollTop(n._documentScrollTop),n._documentScrollLeft&&n._documentScrollLeft>0&&s.scrollLeft(n._documentScrollLeft))},_deactivate:function(){var e,t=this;t.wrapper.hide().css("opacity",""),t.trigger(F),t.options.modal&&(e=t._object(t._modals().last()),e&&e.toFront())},close:function(){return this._close(!0),this},_actionable:function(t){return e(t).is(K+","+K+" .k-icon,:input,a")},_shouldFocus:function(t){var n=h(),i=this.element;return this.options.autoFocus&&!e(n).is(i)&&!this._actionable(t)&&(!i.find(n).length||!i.find(t).length)},toFront:function(t){var n,i,r=this,o=r.wrapper,a=o[0],s=+o.css(j),l=s,c=t&&t.target||null;return e(y).each(function(t,n){var i=e(n),r=i.css(j),o=i.children(x);isNaN(r)||(s=Math.max(+r,s)),n!=a&&o.find("> ."+S).length>0&&o.append(Z.overlay)}),(!o[0].style.zIndex||s>l)&&o.css(j,s+2),r.element.find("> .k-overlay").remove(),r._shouldFocus(c)&&(r.element.focus(),n=e(window).scrollTop(),i=parseInt(o.position().top,10),i>0&&n>i&&(n>0?e(window).scrollTop(i):o.css("top",n))),o=null,r},toggleMaximization:function(){return this._closing?this:this[this.options.isMaximized?"restore":"maximize"]()},restore:function(){var t=this,n=t.options,i=n.minHeight,r=t.restoreOptions,o=e(document);return n.isMaximized||n.isMinimized?(i&&i!=1/0&&t.wrapper.css("min-height",i),t.wrapper.css({position:n.pinned?"fixed":"absolute",left:r.left,top:r.top,width:r.width,height:r.height}).removeClass(M).find(".k-window-content,.k-resize-handle").show().end().find(".k-window-titlebar .k-i-restore").parent().remove().end().end().find(G).parent().show().end().end().find(Y).parent().show(),t.options.width=r.width,t.options.height=r.height,e("html, body").css(W,""),this._documentScrollTop&&this._documentScrollTop>0&&o.scrollTop(this._documentScrollTop),this._documentScrollLeft&&this._documentScrollLeft>0&&o.scrollLeft(this._documentScrollLeft),n.isMaximized=n.isMinimized=!1,t.resize(),t):t},maximize:r("maximize",function(){var t=this,n=t.wrapper,i=n.position(),r=e(document);p(t.restoreOptions,{left:i.left,top:i.top}),n.css({left:0,top:0,position:"fixed"}).addClass(M),this._documentScrollTop=r.scrollTop(),this._documentScrollLeft=r.scrollLeft(),e("html, body").css(W,P),t.options.isMaximized=!0,t._onDocumentResize()}),minimize:r("minimize",function(){var e=this;e.wrapper.css({height:"",minHeight:""}),e.element.hide(),e.options.isMinimized=!0}),pin:function(t){var n=this,i=e(window),r=n.wrapper,o=parseInt(r.css("top"),10),a=parseInt(r.css("left"),10);(t||!n.options.pinned&&!n.options.isMaximized)&&(r.css({position:"fixed",top:o-i.scrollTop(),left:a-i.scrollLeft()}),r.children(w).find(q).addClass("k-i-unpin").removeClass("k-i-pin"),n.options.pinned=!0)},unpin:function(){var t=this,n=e(window),i=t.wrapper,r=parseInt(i.css("top"),10),o=parseInt(i.css("left"),10);t.options.pinned&&!t.options.isMaximized&&(i.css({position:"",top:r+n.scrollTop(),left:o+n.scrollLeft()}),i.children(w).find($).addClass("k-i-pin").removeClass("k-i-unpin"),t.options.pinned=!1)},_onDocumentResize:function(){var t,n,i=this,r=i.wrapper,o=e(window),a=l.support.zoomLevel();i.options.isMaximized&&(t=o.width()/a,n=o.height()/a-parseInt(r.css("padding-top"),10),r.css({width:t,height:n}),i.options.width=t,i.options.height=n,i.resize())},refresh:function(t){var i,r,o,a=this,s=a.options,l=e(a.element);return d(t)||(t={url:t}),t=p({},s.content,t),r=n(s.iframe)?s.iframe:t.iframe,o=t.url,o?(n(r)||(r=!X(o)),r?(i=l.find("."+S)[0],i?i.src=o||i.src:l.html(Z.contentFrame(p({},s,{content:t}))),l.find("."+S).unbind("load"+_).on("load"+_,f(this._triggerRefresh,this))):a._ajaxRequest(t)):(t.template&&a.content(m(t.template)({})),a.trigger(L)),l.toggleClass("k-window-iframecontent",!!r),a},_triggerRefresh:function(){this.trigger(L)},_ajaxComplete:function(){clearTimeout(this._loadingIconTimeout),this.wrapper.find(Q).removeClass(T)},_ajaxError:function(e,t){this.trigger(U,{status:t,xhr:e})},_ajaxSuccess:function(e){return function(t){var n=t;e&&(n=m(e)(t||{})),this.content(n,t),this.element.prop("scrollTop",0),this.trigger(L)}},_showLoading:function(){this.wrapper.find(Q).addClass(T)},_ajaxRequest:function(t){this._loadingIconTimeout=setTimeout(f(this._showLoading,this),100),e.ajax(p({type:"GET",dataType:"html",cache:!1,error:f(this._ajaxError,this),complete:f(this._ajaxComplete,this),success:f(this._ajaxSuccess(t.template),this)},t))},_destroy:function(){this.resizing&&this.resizing.destroy(),this.dragging&&this.dragging.destroy(),this.wrapper.off(_).children(x).off(_).end().find(".k-resize-handle,.k-window-titlebar").off(_),e(window).off("resize"+_+this._marker),clearTimeout(this._loadingIconTimeout),c.fn.destroy.call(this),this.unbind(t),l.destroy(this.wrapper),this._removeOverlay(!0)},destroy:function(){this._destroy(),this.wrapper.empty().remove(),this.wrapper=this.appendTo=this.element=e()},_createWindow:function(){var t,n,i=this.element,r=this.options,o=l.support.isRtl(i);r.scrollable===!1&&i.attr("style","overflow:hidden;"),n=e(Z.wrapper(r)),t=i.find("iframe:not(.k-content)").map(function(){var e=this.getAttribute("src");return this.src="",e}),n.toggleClass("k-rtl",o).appendTo(this.appendTo).append(i).find("iframe:not(.k-content)").each(function(e){this.src=t[e]}),n.find(".k-window-title").css(o?"left":"right",n.find(".k-window-actions").outerWidth()+10),i.css("visibility","").show(),i.find("[data-role=editor]").each(function(){var t=e(this).data("kendoEditor");t&&t.refresh()}),n=i=null}}),Z={wrapper:m("<div class='k-widget k-window' />"),action:m("<a role='button' href='\\#' class='k-window-action k-link'><span role='presentation' class='k-icon k-i-#= name.toLowerCase() #'>#= name #</span></a>"),titlebar:m("<div class='k-window-titlebar k-header'>&nbsp;<span class='k-window-title'>#= title #</span><div class='k-window-actions' /></div>"),overlay:"<div class='k-overlay' />",contentFrame:m("<iframe frameborder='0' title='#= title #' class='"+S+"' src='#= content.url #'>This page requires frames in order to show content</iframe>"),resizeHandle:m("<div class='k-resize-handle k-resize-#= data #'></div>")};a.prototype={addOverlay:function(){this.owner.wrapper.append(Z.overlay)},removeOverlay:function(){this.owner.wrapper.find(C).remove()},dragstart:function(t){var n=this,i=n.owner,r=i.wrapper;n.elementPadding=parseInt(r.css("padding-top"),10),n.initialPosition=l.getOffset(r,"position"),n.resizeDirection=t.currentTarget.prop("className").replace("k-resize-handle k-resize-",""),n.initialSize={width:r.width(),height:r.height()},n.containerOffset=l.getOffset(i.appendTo,"position"),r.children(k).not(t.currentTarget).hide(),e(v).css(I,t.currentTarget.css(I))},drag:function(e){var t,n,r,o,a=this,s=a.owner,l=s.wrapper,c=s.options,u=a.resizeDirection,d=a.containerOffset,h=a.initialPosition,f=a.initialSize,p=Math.max(e.x.location,d.left),g=Math.max(e.y.location,d.top);u.indexOf("e")>=0?(t=p-h.left,l.width(i(t,c.minWidth,c.maxWidth))):u.indexOf("w")>=0&&(o=h.left+f.width,t=i(o-p,c.minWidth,c.maxWidth),l.css({left:o-t-d.left,width:t})),u.indexOf("s")>=0?(n=g-h.top-a.elementPadding,l.height(i(n,c.minHeight,c.maxHeight))):u.indexOf("n")>=0&&(r=h.top+f.height,n=i(r-g,c.minHeight,c.maxHeight),l.css({top:r-n-d.top,height:n})),t&&(s.options.width=t+"px"),n&&(s.options.height=n+"px"),s.resize()},dragend:function(t){var n=this,i=n.owner,r=i.wrapper;return r.children(k).not(t.currentTarget).show(),e(v).css(I,""),i.touchScroller&&i.touchScroller.reset(),27==t.keyCode&&r.css(n.initialPosition).css(n.initialSize),i.trigger(H),!1},destroy:function(){this._draggable&&this._draggable.destroy(),this._draggable=this.owner=null}},s.prototype={dragstart:function(t){var n=this.owner,i=n.element,r=i.find(".k-window-actions"),o=l.getOffset(n.appendTo);n.trigger(N),n.initialWindowPosition=l.getOffset(n.wrapper,"position"),n.startPosition={left:t.x.client-n.initialWindowPosition.left,top:t.y.client-n.initialWindowPosition.top},n.minLeftPosition=r.length>0?r.outerWidth()+parseInt(r.css("right"),10)-i.outerWidth():20-i.outerWidth(),n.minLeftPosition-=o.left,n.minTopPosition=-o.top,n.wrapper.append(Z.overlay).children(k).hide(),e(v).css(I,t.currentTarget.css(I))},drag:function(t){var n=this.owner,i=n.options.position,r=Math.max(t.y.client-n.startPosition.top,n.minTopPosition),o=Math.max(t.x.client-n.startPosition.left,n.minLeftPosition),a={left:o,top:r};e(n.wrapper).css(a),i.top=r,i.left=o},_finishDrag:function(){var t=this.owner;t.wrapper.children(k).toggle(!t.options.isMinimized).end().find(C).remove(),e(v).css(I,"")},dragcancel:function(e){this._finishDrag(),e.currentTarget.closest(y).css(this.owner.initialWindowPosition)},dragend:function(){return this._finishDrag(),this.owner.trigger(V),!1},destroy:function(){this._draggable&&this._draggable.destroy(),this._draggable=this.owner=null}},l.ui.plugin(J)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){return e[e.length-1]}function i(e){return e instanceof Array?e:[e]}function r(e){return"string"==typeof e||"number"==typeof e||"boolean"==typeof e}function o(e,t,n){return Math.ceil(e*t/n)}function a(e,t,n){var i=document.createElement(n||"div");return t&&(i.className=t),e.appendChild(i),i}function s(){var t,n=e('<div class="k-popup"><ul class="k-list"><li class="k-item"><li></ul></div>');return n.css({position:"absolute",left:"-200000px",visibility:"hidden"}),n.appendTo(document.body),t=parseFloat(v.getComputedStyles(n.find(".k-item")[0],["line-height"])["line-height"]),n.remove(),t}function l(e,t,n){return{down:e*n,up:e*(t-1-n)}}function c(e,t){var n=(e.listScreens-1-e.threshold)*t,i=e.threshold*t;return function(e,t,r){return t>r?n>t-e.top:0===e.top||t-e.top>i}}function u(e,t){return function(n){return t(e.scrollTop,n)}}function d(e){return function(t,n){return e(t.items,t.index,n),t}}function h(e,t){v.support.browser.msie&&10>v.support.browser.version?e.style.top=t+"px":(e.style.webkitTransform="translateY("+t+"px)",e.style.transform="translateY("+t+"px)")}function f(t,n){return function(i,r){for(var o=0,a=i.length;a>o;o++)t(i[o],r[o],n),r[o].item&&(this.trigger(L,{item:e(i[o]),data:r[o].item,ns:v.ui}),r[o].index===this._selectedIndex&&this.select(this._selectedIndex))}}function p(e,t){var n;return t>0?(n=e.splice(0,t),e.push.apply(e,n)):(n=e.splice(t,-t),e.unshift.apply(e,n)),n}function g(n,i,r){var o=r.template;n=e(n),i.item||(o=r.placeholderTemplate),this.angular("cleanup",function(){return{elements:[n]}}),n.attr("data-uid",i.item?i.item.uid:"").attr("data-offset-index",i.index).html(o(i.item||{})),n.toggleClass(I,i.current),n.toggleClass(P,i.selected),n.toggleClass("k-first",i.newGroup),n.toggleClass("k-loading-item",!i.item),0!==i.index&&i.newGroup&&e("<div class="+E+"></div>").appendTo(n).html(r.groupTemplate(i.group)),i.top!==t&&h(n[0],i.top),this.angular("compile",function(){return{elements:[n],data:[{dataItem:i.item,group:i.group,newGroup:i.newGroup}]}})}function m(e,t){var n,i,r,o=t.length,a=[];for(i=0;e.length>i;i++)for(n=e[i],r=0;o>r;r++)n===t[r]&&a.push({index:i,item:n});return a}var v=window.kendo,_=v.ui,y=_.Widget,b=_.DataBoundWidget,w=e.proxy,x="k-virtual-wrap",k="k-virtual-list",C="k-virtual-content",S="k-list",T="k-group-header",A="k-virtual-item",D="k-item",M="k-height-container",E="k-group",P="k-state-selected",I="k-state-focused",z="k-state-hover",R="change",F="click",B="listBound",L="itemChange",O="activate",H="deactivate",N=".VirtualList",V=b.extend({init:function(t,n){var r=this;r._listCreated=!1,r._fetching=!1,r._filter=!1,y.fn.init.call(r,t,n),r.options.itemHeight||(r.options.itemHeight=s()),n=r.options,r.element.addClass(S+" "+k).attr("role","listbox"),r.content=r.element.wrap("<div unselectable='on' class='"+C+"'></div>").parent(),r.wrapper=r.content.wrap("<div class='"+x+"'></div>").parent(),r.header=r.content.before("<div class='"+T+"'></div>").prev(),r.element.on("mouseenter"+N,"li:not(.k-loading-item)",function(){e(this).addClass(z)}).on("mouseleave"+N,"li",function(){e(this).removeClass(z)}),r._values=i(r.options.value),r._selectedDataItems=[],r._selectedIndexes=[],r._rangesList={},r._activeDeferred=null,r._promisesList=[],r._optionID=v.guid(),r.setDataSource(n.dataSource),r.content.on("scroll"+N,v.throttle(function(){r._renderItems()},n.delay)),r._selectable()},options:{name:"VirtualList",autoBind:!0,delay:100,height:null,listScreens:4,threshold:.5,itemHeight:null,oppositeBuffer:1,type:"flat",selectable:!1,value:[],dataValueField:null,template:"#:data#",placeholderTemplate:"loading...",groupTemplate:"#:data#",fixedGroupTemplate:"fixed header template",valueMapper:null},events:[R,F,B,L,O,H],setOptions:function(e){y.fn.setOptions.call(this,e),this._selectProxy&&this.options.selectable===!1?this.element.off(F,"."+A,this._selectProxy):!this._selectProxy&&this.options.selectable&&this._selectable(),this.refresh()},items:function(){return e(this._items)},destroy:function(){this.wrapper.off(N),this.dataSource.unbind(R,this._refreshHandler),y.fn.destroy.call(this)},setDataSource:function(t){var n,i=this,r=t||{};r=e.isArray(r)?{data:r}:r,r=v.data.DataSource.create(r),i.dataSource?(i.dataSource.unbind(R,i._refreshHandler),i.dataSource.unbind(R,i._rangeChangeHandler),n=i.value(),i.value([]),i.mute(function(){i.value(n)})):(i._refreshHandler=e.proxy(i.refresh,i),i._rangeChangeHandler=e.proxy(i.rangeChange,i)),i.dataSource=r.bind(R,i._refreshHandler).bind(R,i._rangeChangeHandler),0!==i.dataSource.view().length?i.refresh():i.options.autoBind&&i.dataSource.fetch()},rangeChange:function(){var e=this,t=e.dataSource.page();e.isBound()&&e._rangeChange===!0&&e._lastPage!==t&&(e._lastPage=t,e.trigger(B))},refresh:function(e){var t,n=this,i=e&&e.action;n._mute||(n._fetching?n._renderItems&&n._renderItems(!0):(n._filter&&n.focus(0),n._createList(),i||!n._values.length||n._filter||n.options.skipUpdateOnBind?(n._lastPage=n.dataSource.page(),n._listCreated=!0,n.trigger(B)):n.value(n._values,!0).done(function(){n._lastPage=n.dataSource.page(),n._listCreated=!0,n.trigger(B)})),"itemchange"===i&&(t=m(n._selectedDataItems,e.items),t.length&&n.trigger("selectedItemChange",{items:t})),n._fetching=!1)},removeAt:function(e){return this._selectedIndexes.splice(e,1),this._values.splice(e,1),{position:e,dataItem:this._selectedDataItems.splice(e,1)[0]}},setValue:function(e){this._values=i(e)},value:function(n,r){var o=this;return n===t?o._values.slice():(null===n&&(n=[]),n=i(n),"multiple"===o.options.selectable&&o.select().length&&n.length&&o.select(-1),o._valueDeferred&&"resolved"!==o._valueDeferred.state()||(o._valueDeferred=e.Deferred()),n.length||o.select(-1),o._values=n,(o.isBound()&&!o._mute||r)&&o._prefetchByValue(n),o._valueDeferred)},_prefetchByValue:function(e){var n,o,a,s=this,l=s._dataView,c=s._valueGetter,u=!1,d=[];for(o=0;e.length>o;o++)for(a=0;l.length>a;a++)n=l[a].item,n&&(u=r(n)?e[o]===n:e[o]===c(n),u&&d.push(a));if(d.length===e.length)return s._values=[],s.select(d),t;if("function"!=typeof s.options.valueMapper)throw Error("valueMapper is not provided");s.options.valueMapper({value:"multiple"===this.options.selectable?e:e[0],success:function(e){s._values=[],s._selectedIndexes=[],s._selectedDataItems=[],e=i(e),e.length||(e=[-1]),s.select(e)}})},deferredRange:function(t){var n=this.dataSource,i=this.itemCount,r=this._rangesList,o=e.Deferred(),a=[],s=Math.floor(t/i)*i,l=Math.ceil(t/i)*i,c=l===s?[l]:[s,l];return e.each(c,function(t,o){var s,l=o+i,c=r[o];c&&c.end===l?s=c.deferred:(s=e.Deferred(),r[o]={end:l,deferred:s},n._multiplePrefetch(o,i,function(){s.resolve()})),a.push(s)}),e.when.apply(e,a).then(function(){o.resolve()}),o},prefetch:function(t){var n=this,i=this.itemCount,r=!n._promisesList.length;return n._activeDeferred||(n._activeDeferred=e.Deferred(),n._promisesList=[]),e.each(t,function(e,t){var r=Math.floor(t/i)*i;n._promisesList.push(n.deferredRange(r))}),r&&e.when.apply(e,n._promisesList).done(function(){n._activeDeferred.resolve(),n._activeDeferred=null,n._promisesList=[]}),n._activeDeferred},_findDataItem:function(e){var t,n,i=this.dataSource.view();if("group"===this.options.type)for(n=0;i.length>n;n++){if(t=i[n].items,!(e>=t.length))return t[e];e-=t.length}return i[e]},selectedDataItems:function(){return this._selectedDataItems.slice()},scrollTo:function(e){this.content.scrollTop(e)},scrollToIndex:function(e){this.scrollTo(e*this.options.itemHeight)},focus:function(i){var r,o,a,s,l,c,u=this.options.itemHeight,d=this._optionID,h=!0;if(i===t)return s=this.element.find("."+I),s.length?s:null;if("function"==typeof i)for(a=this.dataSource.flatView(),l=0;a.length>l;l++)if(i(a[l])){i=l;break}return i instanceof Array&&(i=n(i)),isNaN(i)?(r=e(i),o=parseInt(e(r).attr("data-offset-index"),10)):(o=i,r=this._getElementByIndex(o)),-1===o?(this.element.find("."+I).removeClass(I),this._focusedIndex=t,t):(r.length?(r.hasClass(I)&&(h=!1),this._focusedIndex!==t&&(s=this._getElementByIndex(this._focusedIndex),s.removeClass(I).removeAttr("id"),h&&this.trigger(H)),this._focusedIndex=o,r.addClass(I).attr("id",d),c=this._getElementLocation(o),"top"===c?this.scrollTo(o*u):"bottom"===c?this.scrollTo(o*u+u-this.screenHeight):"outScreen"===c&&this.scrollTo(o*u),h&&this.trigger(O)):(this._focusedIndex=o,this.items().removeClass(I),this.scrollToIndex(o)),t)},focusIndex:function(){return this._focusedIndex},focusFirst:function(){this.scrollTo(0),this.focus(0)},focusLast:function(){var e=this.dataSource.total();
this.scrollTo(this.heightContainer.offsetHeight),this.focus(e)},focusPrev:function(){var e,t=this._focusedIndex;return!isNaN(t)&&t>0?(t-=1,this.focus(t),e=this.focus(),e&&e.hasClass("k-loading-item")&&(t+=1,this.focus(t)),t):(t=this.dataSource.total()-1,this.focus(t),t)},focusNext:function(){var e,t=this._focusedIndex,n=this.dataSource.total()-1;return!isNaN(t)&&n>t?(t+=1,this.focus(t),e=this.focus(),e&&e.hasClass("k-loading-item")&&(t-=1,this.focus(t)),t):(t=0,this.focus(t),t)},select:function(e){var i,r,o,a=this,s="multiple"!==a.options.selectable,l=!!a._activeDeferred,c=[];return e===t?a._selectedIndexes.slice():(i=a._getIndecies(e),a._filter&&!s&&a._deselectFiltered(i)||!i.length||s&&!a._filter&&n(i)===n(this._selectedIndexes)||(c=a._deselect(i),s&&(a._activeDeferred=null,l=!1,i.length&&(i=[n(i)])),o=function(){var e=a._select(i);a.focus(i),(e.length||c.length)&&a.trigger(R,{added:e,removed:c}),a._valueDeferred&&a._valueDeferred.resolve()},r=a.prefetch(i),l||(r?r.done(o):o())),t)},isBound:function(){return this._listCreated},mute:function(e){this._mute=!0,w(e(),this),this._mute=!1},filter:function(e){return e===t?this._filter:(this._filter=e,this._rangeChange=!0,t)},skipUpdate:e.noop,_getElementByIndex:function(t){return this.items().filter(function(n,i){return t===parseInt(e(i).attr("data-offset-index"),10)})},_clean:function(){this.result=t,this._lastScrollTop=t,this._lastPage=t,e(this.heightContainer).remove(),this.heightContainer=t,this.element.empty()},_height:function(){var e=!!this.dataSource.view().length,t=this.options.height,n=this.options.itemHeight,i=this.dataSource.total();return e?t/n>i&&(t=i*n):t=0,t},_screenHeight:function(){var e=this._height(),t=this.content;t.height(e),this.screenHeight=e},_getElementLocation:function(e){var t,n=this.content.scrollTop(),i=this.screenHeight,r=this.options.itemHeight,o=e*r,a=o+r,s=n+i;return t=o===n-r||a>n&&n>o?"top":o===s||s>o&&a>s?"bottom":o>=n&&n+(i-r)>=o?"inScreen":"outScreen"},_templates:function(){var e,t={template:this.options.template,placeholderTemplate:this.options.placeholderTemplate,groupTemplate:this.options.groupTemplate,fixedGroupTemplate:this.options.fixedGroupTemplate};for(e in t)"function"!=typeof t[e]&&(t[e]=v.template(t[e]));this.templates=t},_generateItems:function(e,t){for(var n,i=[],r=this.options.itemHeight+"px";t-->0;)n=document.createElement("li"),n.tabIndex=-1,n.className=A+" "+D,n.setAttribute("role","option"),n.style.height=r,n.style.minHeight=r,e.appendChild(n),i.push(n);return i},_saveInitialRanges:function(){var t,n=this.dataSource._ranges,i=e.Deferred();for(i.resolve(),this._rangesList={},t=0;n.length>t;t++)this._rangesList[n[t].start]={end:n[t].end,deferred:i}},_createList:function(){var t=this,n=t.content.get(0),i=t.options,r=t.dataSource;t._listCreated&&t._clean(),t._saveInitialRanges(),t._screenHeight(),t._buildValueGetter(),t.itemCount=o(t.screenHeight,i.listScreens,i.itemHeight),t.itemCount>r.total()&&(t.itemCount=r.total()),t._templates(),t._items=t._generateItems(t.element[0],t.itemCount),t._setHeight(i.itemHeight*r.total()),t.options.type=(r.group()||[]).length?"group":"flat","flat"===t.options.type?t.header.hide():t.header.show(),t.getter=t._getter(function(){t._renderItems(!0)}),t._onScroll=function(e,n){var i=t._listItems(t.getter);return t._fixedHeader(e,i(e,n))},t._renderItems=t._whenChanged(u(n,t._onScroll),d(t._reorderList(t._items,e.proxy(g,t)))),t._renderItems(),t._calculateGroupPadding(t.screenHeight)},_setHeight:function(e){var t,n,i=this.heightContainer;if(i?t=i.offsetHeight:i=this.heightContainer=a(this.content[0],M),e!==t)for(i.innerHTML="";e>0;)n=Math.min(e,25e4),a(i).style.height=n+"px",e-=n},_getter:function(){var e=null,t=this.dataSource,n=t.skip(),i=this.options.type,r=this.itemCount,o={};return t.pageSize()<r&&t.pageSize(r),function(a,s){var l,c,u,d,h,f,p,g,m=this;if(t.inRange(s,r)){if(n!==s&&(m._mute=!0,m._fetching=!0,m._rangeChange=!0,t.range(s,r),n=s,m._rangeChange=!1,m._fetching=!1,m._mute=!1),"group"===i){if(!o[s])for(c=o[s]=[],u=t.view(),d=0,h=u.length;h>d;d++)for(f=u[d],p=0,g=f.items.length;g>p;p++)c.push({item:f.items[p],group:f.value});l=o[s][a-s]}else l=t.view()[a-s];return l}return e!==s&&(e=s,n=s,m._fetching=!0,m._getterDeferred&&m._getterDeferred.reject(),m._getterDeferred=m.deferredRange(s),m._getterDeferred.then(function(){var e=m._indexConstraint(m.content[0].scrollTop);m._getterDeferred=null,e>=s&&s+r>=e&&(m._fetching=!0,m._rangeChange=!0,t.range(s,r),m._rangeChange=!1)})),null}},_fixedHeader:function(e,t){var n,i=this.currentVisibleGroup,r=this.options.itemHeight,o=Math.floor((e-t.top)/r),a=t.items[o];return a&&a.item&&(n=a.group,n!==i&&(this.header[0].innerHTML=n||"",this.currentVisibleGroup=n)),t},_itemMapper:function(e,t,n){var i,o=this.options.type,a=this.options.itemHeight,s=this._focusedIndex,l=!1,c=!1,u=!1,d=null,h=!1,f=this._valueGetter;if("group"===o&&(e&&(u=0===t||this._currentGroup&&this._currentGroup!==e.group,this._currentGroup=e.group),d=e?e.group:null,e=e?e.item:null),n.length&&e)for(i=0;n.length>i;i++)if(h=r(e)?n[i]===e:n[i]===f(e)){n.splice(i,1),l=!0;break}return s===t&&(c=!0),{item:e?e:null,group:d,newGroup:u,selected:l,current:c,index:t,top:t*a}},_range:function(e){var t,n,i,r=this.itemCount,o=this._values.slice(),a=[];for(this._view={},this._currentGroup=null,n=e,i=e+r;i>n;n++)t=this._itemMapper(this.getter(n,e),n,o),a.push(t),this._view[t.index]=t;return this._dataView=a,a},_getDataItemsCollection:function(e,t){var n=this._range(this._listIndex(e,t));return{index:n.length?n[0].index:0,top:n.length?n[0].top:0,items:n}},_listItems:function(){var t=this.screenHeight,n=this.options,i=c(n,t);return e.proxy(function(e,t){var n=this.result,r=this._lastScrollTop;return!t&&n&&i(n,e,r)||(n=this._getDataItemsCollection(e,r)),this._lastScrollTop=e,this.result=n,n},this)},_whenChanged:function(e,t){var n;return function(i){var r=e(i);r!==n&&(n=r,t(r,i))}},_reorderList:function(t,n){var i=this,r=t.length,o=-(1/0);return n=e.proxy(f(n,this.templates),this),function(e,a,s){var l,c,u=a-o;s||Math.abs(u)>=r?(l=t,c=e):(l=p(t,u),c=u>0?e.slice(-u):e.slice(0,-u)),n(l,c,i._listCreated),o=a}},_bufferSizes:function(){var e=this.options;return l(this.screenHeight,e.listScreens,e.oppositeBuffer)},_indexConstraint:function(e){var t=this.itemCount,n=this.options.itemHeight,i=this.dataSource.total();return Math.min(Math.max(i-t,0),Math.max(0,Math.floor(e/n)))},_listIndex:function(e,t){var n,i=this._bufferSizes();return n=e-(e>t?i.down:i.up),this._indexConstraint(n)},_selectable:function(){this.options.selectable&&(this._selectProxy=e.proxy(this,"_clickHandler"),this.element.on(F+N,"."+A,this._selectProxy))},_getIndecies:function(e){var t,n,i=[];if("function"==typeof e)for(t=this.dataSource.flatView(),n=0;t.length>n;n++)if(e(t[n])){i.push(n);break}return"number"==typeof e&&i.push(e),e instanceof jQuery&&(e=parseInt(e.attr("data-offset-index"),10),isNaN(e)||i.push(e)),e instanceof Array&&(i=e),i},_deselect:function(n){var i,r,o,a,s,l,c=[],u=this._selectedIndexes,d=0,h=this.options.selectable,f=0;if(-1===n[d]){for(s=0;u.length>s;s++)r=u[s],this._getElementByIndex(r).removeClass(P),c.push({index:r,position:s,dataItem:this._selectedDataItems[s]});return this._values=[],this._selectedDataItems=[],this._selectedIndexes=[],n.splice(0,n.length),c}if(h===!0)i=n[d],r=u[d],r!==t&&i!==r&&(this._getElementByIndex(r).removeClass(P),c.push({index:r,position:d,dataItem:this._selectedDataItems[d]}),this._values=[],this._selectedDataItems=[],this._selectedIndexes=[]);else if("multiple"===h)for(l=0;n.length>l;l++)if(d=e.inArray(n[l],u),r=u[d],r!==t){if(a=this._getElementByIndex(r),!a.hasClass("k-state-selected"))continue;a.removeClass(P),this._values.splice(d,1),this._selectedIndexes.splice(d,1),o=this._selectedDataItems.splice(d,1)[0],n.splice(l,1),c.push({index:r,position:d+f,dataItem:o}),f++,l--}return c},_deselectFiltered:function(t){for(var n,i,r,o,a=this.element[0].children,s=this._values,l=[],c=0;t.length>c;c++){for(r=-1,i=t[c],n=this._valueGetter(this._view[i].item),o=0;s.length>o;o++)if(n==s[o]){r=o;break}r>-1&&(l.push(this.removeAt(r)),e(a[i]).removeClass("k-state-selected"))}return l.length?(this.trigger("change",{added:[],removed:l}),!0):!1},_select:function(t){var n,i,o=this,a="multiple"!==this.options.selectable,s=this.dataSource,l=this.itemCount,c=this._valueGetter,u=[];return a&&(o._selectedIndexes=[],o._selectedDataItems=[],o._values=[]),i=s.skip(),e.each(t,function(e,t){var a=l>t?1:Math.floor(t/l)+1,d=(a-1)*l;o.mute(function(){s.range(d,l),n=o._findDataItem([t-d]),o._selectedIndexes.push(t),o._selectedDataItems.push(n),o._values.push(r(n)?n:c(n)),u.push({index:t,dataItem:n}),o._getElementByIndex(t).addClass(P),s.range(i,l)})}),u},_clickHandler:function(t){var n=e(t.currentTarget);!t.isDefaultPrevented()&&n.attr("data-uid")&&this.trigger(F,{item:n})},_buildValueGetter:function(){this._valueGetter=v.getter(this.options.dataValueField)},_calculateGroupPadding:function(e){var t=this.items().first(),n=this.header,i=0;n[0]&&"none"!==n[0].style.display&&("auto"!==e&&(i=v.support.scrollbar()),i+=parseFloat(t.css("border-right-width"),10)+parseFloat(t.children(".k-group").css("right"),10),n.css("padding-right",i))}});v.ui.VirtualList=V,v.ui.plugin(V)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e){var t,n,i=e.find(x("popover")),r=s.roles;for(t=0,n=i.length;n>t;t++)o.initWidget(i[t],{},r)}function i(e){o.triggeredByInput(e)||e.preventDefault()}function r(t){t.each(function(){o.initWidget(e(this),{},s.roles)})}var o=window.kendo,a=o.mobile,s=a.ui,l=o.attr,c=s.Widget,u=o.ViewClone,d="init",h='<div style="height: 100%; width: 100%; position: absolute; top: 0; left: 0; z-index: 20000; display: none" />',f="beforeShow",p="show",g="afterShow",m="beforeHide",v="transitionEnd",_="transitionStart",y="hide",b="destroy",w=o.attrValue,x=o.roleSelector,k=o.directiveSelector,C=o.compileMobileDirective,S=c.extend({init:function(t,n){c.fn.init.call(this,t,n),this.params={},e.extend(this,n),this.transition=this.transition||this.defaultTransition,this._id(),this.options.$angular?this._overlay():(this._layout(),this._overlay(),this._scroller(),this._model())},events:[d,f,p,g,m,y,b,_,v],options:{name:"View",title:"",layout:null,getLayout:e.noop,reload:!1,transition:"",defaultTransition:"",useNativeScrolling:!1,stretch:!1,zoom:!1,model:null,modelScope:window,scroller:{},initWidgets:!0},enable:function(e){t===e&&(e=!0),e?this.overlay.hide():this.overlay.show()},destroy:function(){this.layout&&this.layout.detach(this),this.trigger(b),c.fn.destroy.call(this),this.scroller&&this.scroller.destroy(),this.options.$angular&&this.element.scope().$destroy(),o.destroy(this.element)},purge:function(){this.destroy(),this.element.remove()},triggerBeforeShow:function(){return this.trigger(f,{view:this})?!1:!0},triggerBeforeHide:function(){return this.trigger(m,{view:this})?!1:!0},showStart:function(){var e=this.element;e.css("display",""),this.inited?this._invokeNgController():(this.inited=!0,this.trigger(d,{view:this})),this.layout&&this.layout.attach(this),this._padIfNativeScrolling(),this.trigger(p,{view:this}),o.resize(e)},showEnd:function(){this.trigger(g,{view:this}),this._padIfNativeScrolling()},hideEnd:function(){var e=this;e.element.hide(),e.trigger(y,{view:e}),e.layout&&e.layout.trigger(y,{view:e,layout:e.layout})},beforeTransition:function(e){this.trigger(_,{type:e})},afterTransition:function(e){this.trigger(v,{type:e})},_padIfNativeScrolling:function(){if(a.appLevelNativeScrolling()){var e=o.support.mobileOS&&o.support.mobileOS.android,t=a.application.skin()||"",n=a.application.os.android||t.indexOf("android")>-1,i="flat"===t||t.indexOf("material")>-1,r=!e&&!n||i?"header":"footer",s=!e&&!n||i?"footer":"header";this.content.css({paddingTop:this[r].height(),paddingBottom:this[s].height()})}},contentElement:function(){var e=this;return e.options.stretch?e.content:e.scrollerContent},clone:function(){return new u(this)},_scroller:function(){var t=this;a.appLevelNativeScrolling()||(t.options.stretch?t.content.addClass("km-stretched-view"):(t.content.kendoMobileScroller(e.extend(t.options.scroller,{zoom:t.options.zoom,useNative:t.options.useNativeScrolling})),t.scroller=t.content.data("kendoMobileScroller"),t.scrollerContent=t.scroller.scrollElement),o.support.kineticScrollNeeded&&(e(t.element).on("touchmove",".km-header",i),t.options.useNativeScrolling||t.options.stretch||e(t.element).on("touchmove",".km-content",i)))},_model:function(){var e=this,t=e.element,i=e.options.model;"string"==typeof i&&(i=o.getter(i)(e.options.modelScope)),e.model=i,n(t),e.element.css("display",""),e.options.initWidgets&&(i?o.bind(t,i,s,o.ui,o.dataviz.ui):a.init(t.children())),e.element.css("display","none")},_id:function(){var e=this.element,t=e.attr("id")||"";this.id=w(e,"url")||"#"+t,"#"==this.id&&(this.id=o.guid(),e.attr("id",this.id))},_layout:function(){var e=x("content"),t=this.element;t.addClass("km-view"),this.header=t.children(x("header")).addClass("km-header"),this.footer=t.children(x("footer")).addClass("km-footer"),t.children(e)[0]||t.wrapInner("<div "+l("role")+'="content"></div>'),this.content=t.children(x("content")).addClass("km-content"),this.element.prepend(this.header).append(this.footer),this.layout=this.options.getLayout(this.layout),this.layout&&this.layout.setup(this)},_overlay:function(){this.overlay=e(h).appendTo(this.element)},_invokeNgController:function(){var t,n,i;this.options.$angular&&(t=this.element.controller(),n=this.options.$angular[0],t&&(i=e.proxy(this,"_callController",t,n),/^\$(digest|apply)$/.test(n.$$phase)?i():n.$apply(i)))},_callController:function(e,t){this.element.injector().invoke(e.constructor,e,{$scope:t})}}),T=c.extend({init:function(e,t){c.fn.init.call(this,e,t),e=this.element,this.header=e.children(this._locate("header")).addClass("km-header"),this.footer=e.children(this._locate("footer")).addClass("km-footer"),this.elements=this.header.add(this.footer),n(e),this.options.$angular||o.mobile.init(this.element.children()),this.element.detach(),this.trigger(d,{layout:this})},_locate:function(e){return this.options.$angular?k(e):x(e)},options:{name:"Layout",id:null,platform:null},events:[d,p,y],setup:function(e){e.header[0]||(e.header=this.header),e.footer[0]||(e.footer=this.footer)},detach:function(e){var t=this;e.header===t.header&&t.header[0]&&e.element.prepend(t.header.detach()[0].cloneNode(!0)),e.footer===t.footer&&t.footer.length&&e.element.append(t.footer.detach()[0].cloneNode(!0))},attach:function(e){var t=this,n=t.currentView;n&&t.detach(n),e.header===t.header&&(t.header.detach(),e.element.children(x("header")).remove(),e.element.prepend(t.header)),e.footer===t.footer&&(t.footer.detach(),e.element.children(x("footer")).remove(),e.element.append(t.footer)),t.trigger(p,{layout:t,view:e}),t.currentView=e}}),A=o.Observable,D=/<body[^>]*>(([\u000a\u000d\u2028\u2029]|.)*)<\/body>/i,M="loadStart",E="loadComplete",P="showStart",I="sameViewRequested",z="viewShow",R="viewTypeDetermined",F="after",B=A.extend({init:function(t){var n,i,a,s,l=this;if(A.fn.init.call(l),e.extend(l,t),l.sandbox=e("<div />"),a=l.container,n=l._hideViews(a),l.rootView=n.first(),!l.rootView[0]&&t.rootNeeded)throw i=a[0]==o.mobile.application.element[0]?'Your kendo mobile application element does not contain any direct child elements with data-role="view" attribute set. Make sure that you instantiate the mobile application using the correct container.':'Your pane element does not contain any direct child elements with data-role="view" attribute set.',Error(i);l.layouts={},l.viewContainer=new o.ViewContainer(l.container),l.viewContainer.bind("accepted",function(e){e.view.params=l.params}),l.viewContainer.bind("complete",function(e){l.trigger(z,{view:e.view})}),l.viewContainer.bind(F,function(){l.trigger(F)}),this.getLayoutProxy=e.proxy(this,"_getLayout"),l._setupLayouts(a),s=a.children(l._locate("modalview drawer")),l.$angular?(l.$angular[0].viewOptions={defaultTransition:l.transition,loader:l.loader,container:l.container,getLayout:l.getLayoutProxy},s.each(function(n,i){C(e(i),t.$angular[0])})):r(s),this.bind(this.events,t)},events:[P,F,z,M,E,I,R],destroy:function(){o.destroy(this.container);for(var e in this.layouts)this.layouts[e].destroy()},view:function(){return this.viewContainer.view},showView:function(e,t,n){if(e=e.replace(RegExp("^"+this.remoteViewURLPrefix),""),""===e&&this.remoteViewURLPrefix&&(e="/"),e.replace(/^#/,"")===this.url)return this.trigger(I),!1;this.trigger(P);var i=this,r=function(n){return i.viewContainer.show(n,t,e)},a=i._findViewElement(e),s=o.widgetInstance(a);return i.url=e.replace(/^#/,""),i.params=n,s&&s.reload&&(s.purge(),a=[]),this.trigger(R,{remote:0===a.length,url:e}),a[0]?(s||(s=i._createView(a)),r(s)):(this.serverNavigation?location.href=e:i._loadView(e,r),!0)},append:function(e,t){var n,i,o,a=this.sandbox,s=(t||"").split("?")[0],c=this.container;return D.test(e)&&(e=RegExp.$1),a[0].innerHTML=e,c.append(a.children("script, style")),n=this._hideViews(a),o=n.first(),o.length||(n=o=a.wrapInner("<div data-role=view />").children()),s&&o.hide().attr(l("url"),s),this._setupLayouts(a),i=a.children(this._locate("modalview drawer")),c.append(a.children(this._locate("layout modalview drawer")).add(n)),r(i),this._createView(o)},_locate:function(e){return this.$angular?k(e):x(e)},_findViewElement:function(e){var t,n=e.split("?")[0];return n?(t=this.container.children("["+l("url")+"='"+n+"']"),t[0]||-1!==n.indexOf("/")||(t=this.container.children("#"===n.charAt(0)?n:"#"+n)),t):this.rootView},_createView:function(e){return this.$angular?C(e,this.$angular[0]):o.initWidget(e,{defaultTransition:this.transition,loader:this.loader,container:this.container,getLayout:this.getLayoutProxy,modelScope:this.modelScope,reload:w(e,"reload")},s.roles)},_getLayout:function(e){return""===e?null:e?this.layouts[e]:this.layouts[this.layout]},_loadView:function(t,n){this._xhr&&this._xhr.abort(),this.trigger(M),this._xhr=e.get(o.absoluteURL(t,this.remoteViewURLPrefix),"html").always(e.proxy(this,"_xhrComplete",n,t))},_xhrComplete:function(e,t,n){var i=!0;if("object"==typeof n&&0===n.status){if(!(n.responseText&&n.responseText.length>0))return;i=!0,n=n.responseText}this.trigger(E),i&&e(this.append(n,t))},_hideViews:function(e){return e.children(this._locate("view splitview")).hide()},_setupLayouts:function(t){var n,i=this;t.children(i._locate("layout")).each(function(){n=i.$angular?C(e(this),i.$angular[0]):o.initWidget(e(this),{},s.roles);var t=n.options.platform;t&&t!==a.application.os.name?n.destroy():i.layouts[n.options.id]=n})}});o.mobile.ViewEngine=B,s.plugin(S),s.plugin(T)}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.mobile.ui,i=n.Widget,r=e.map(t.eventMap,function(e){return e}).join(" ").split(" "),o=i.extend({init:function(t,n){var r=this,o=e('<div class="km-loader"><span class="km-loading km-spin"></span><span class="km-loading-left"></span><span class="km-loading-right"></span></div>');i.fn.init.call(r,o,n),r.container=t,r.captureEvents=!1,r._attachCapture(),o.append(r.options.loading).hide().appendTo(t)},options:{name:"Loader",loading:"<h1>Loading...</h1>",timeout:100},show:function(){var e=this;clearTimeout(e._loading),e.options.loading!==!1&&(e.captureEvents=!0,e._loading=setTimeout(function(){e.element.show()},e.options.timeout))},hide:function(){this.captureEvents=!1,clearTimeout(this._loading),this.element.hide()},changeMessage:function(e){this.options.loading=e,this.element.find(">h1").html(e)},transition:function(){this.captureEvents=!0,this.container.css("pointer-events","none")},transitionDone:function(){this.captureEvents=!1,this.container.css("pointer-events","")},_attachCapture:function(){function e(e){n.captureEvents&&e.preventDefault()}var t,n=this;for(n.captureEvents=!1,t=0;r.length>t;t++)n.container[0].addEventListener(r[t],e,!0)}});n.plugin(o)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.mobile,r=n.roleSelector,o=i.ui,a=o.Widget,s=i.ViewEngine,l=o.View,c=i.ui.Loader,u="external",d="href",h="#!",f="navigate",p="viewShow",g="sameViewRequested",m=n.support.mobileOS,v=m.ios&&!m.appMode&&m.flatVersion>=700,_=/popover|actionsheet|modalview|drawer/,y="#:back",b=n.attrValue,w=a.extend({init:function(e,t){var i=this;a.fn.init.call(i,e,t),t=i.options,e=i.element,e.addClass("km-pane"),i.options.collapsible&&e.addClass("km-collapsible-pane"),this.history=[],this.historyCallback=function(e,t,n){var r=i.transition;return i.transition=null,v&&n&&(r="none"),i.viewEngine.showView(e,r,t)},this._historyNavigate=function(e){if(e===y){if(1===i.history.length)return;i.history.pop(),e=i.history[i.history.length-1]}else i.history.push(e);i.historyCallback(e,n.parseQueryStringParams(e))},this._historyReplace=function(e){var t=n.parseQueryStringParams(e);i.history[i.history.length-1]=e,i.historyCallback(e,t)},i.loader=new c(e,{loading:i.options.loading}),i.viewEngine=new s({container:e,transition:t.transition,modelScope:t.modelScope,rootNeeded:!t.initial,serverNavigation:t.serverNavigation,remoteViewURLPrefix:t.root||"",layout:t.layout,$angular:t.$angular,loader:i.loader,showStart:function(){i.loader.transition(),i.closeActiveDialogs()},after:function(){i.loader.transitionDone()},viewShow:function(e){i.trigger(p,e)},loadStart:function(){i.loader.show()},loadComplete:function(){i.loader.hide()},sameViewRequested:function(){i.trigger(g)},viewTypeDetermined:function(e){e.remote&&i.options.serverNavigation||i.trigger(f,{url:e.url})}}),this._setPortraitWidth(),n.onResize(function(){i._setPortraitWidth()}),i._setupAppLinks()},closeActiveDialogs:function(){var t=this.element.find(r("actionsheet popover modalview")).filter(":visible");t.each(function(){n.widgetInstance(e(this),o).close()})},navigateToInitial:function(){var e=this.options.initial;return e&&this.navigate(e),e},options:{name:"Pane",portraitWidth:"",transition:"",layout:"",collapsible:!1,initial:null,modelScope:window,loading:"<h1>Loading...</h1>"},events:[f,p,g],append:function(e){return this.viewEngine.append(e)},destroy:function(){a.fn.destroy.call(this),this.viewEngine.destroy(),this.userEvents.destroy()},navigate:function(e,t){e instanceof l&&(e=e.id),this.transition=t,this._historyNavigate(e)},replace:function(e,t){e instanceof l&&(e=e.id),this.transition=t,this._historyReplace(e)},bindToRouter:function(e){var t=this,i=this.history,r=this.viewEngine;e.bind("init",function(t){var o,a=t.url,s=e.pushState?a:"/";r.rootView.attr(n.attr("url"),s),o=i.length,"/"===a&&o&&(e.navigate(i[o-1],!0),t.preventDefault())}),e.bind("routeMissing",function(e){t.historyCallback(e.url,e.params,e.backButtonPressed)||e.preventDefault()}),e.bind("same",function(){t.trigger(g)}),t._historyNavigate=function(t){e.navigate(t)},t._historyReplace=function(t){e.replace(t)}},hideLoading:function(){this.loader.hide()},showLoading:function(){this.loader.show()},changeLoadingMessage:function(e){this.loader.changeMessage(e)},view:function(){return this.viewEngine.view()},_setPortraitWidth:function(){var e,t=this.options.portraitWidth;t&&(e=n.mobile.application.element.is(".km-vertical")?t:"auto",this.element.css("width",e))},_setupAppLinks:function(){var t=this,i="tab",o="[data-"+n.ns+"navigate-on-press]",a=e.map(["button","backbutton","detailbutton","listview-link"],function(e){return r(e)+":not("+o+")"}).join(",");this.element.handler(this).on("down",r(i)+","+o,"_mouseup").on("click",r(i)+","+a+","+o,"_appLinkClick"),this.userEvents=new n.UserEvents(this.element,{filter:a,tap:function(e){e.event.currentTarget=e.touch.currentTarget,t._mouseup(e.event)}}),this.element.css("-ms-touch-action","")},_appLinkClick:function(t){var n=e(t.currentTarget).attr("href"),i=n&&"#"!==n[0]&&this.options.serverNavigation;i||b(e(t.currentTarget),"rel")==u||t.preventDefault()},_mouseup:function(r){if(!(r.which>1||r.isDefaultPrevented())){var a=this,s=e(r.currentTarget),l=b(s,"transition"),c=b(s,"rel")||"",f=b(s,"target"),p=s.attr(d),g=v&&0===s[0].offsetHeight,m=p&&"#"!==p[0]&&this.options.serverNavigation;g||m||c===u||t===p||p===h||(s.attr(d,h),setTimeout(function(){s.attr(d,p)}),c.match(_)?(n.widgetInstance(e(p),o).openFor(s),("actionsheet"===c||"drawer"===c)&&r.stopPropagation()):("_top"===f?a=i.application.pane:f&&(a=e("#"+f).data("kendoMobilePane")),a.navigate(p,l)),r.preventDefault())}}});w.wrap=function(e){e.is(r("view"))||(e=e.wrap("<div data-"+n.ns+'role="view" data-stretch="true"></div>').parent());var t=e.wrap('<div class="km-pane-wrapper"><div></div></div>').parent(),i=new w(t);return i.navigate(""),i},o.plugin(w)}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.mobile,i=n.ui,r="hide",o="open",a="close",s='<div class="km-popup-wrapper" />',l='<div class="km-popup-arrow" />',c='<div class="km-popup-overlay" />',u="km-up km-down km-left km-right",d=i.Widget,h={down:{origin:"bottom center",position:"top center"},up:{origin:"top center",position:"bottom center"},left:{origin:"center left",position:"center right",collision:"fit flip"},right:{origin:"center right",position:"center left",collision:"fit flip"}},f={animation:{open:{effects:"fade:in",duration:0},close:{effects:"fade:out",duration:400}}},p={horizontal:{offset:"top",size:"height"},vertical:{offset:"left",size:"width"}},g={up:"down",down:"up",left:"right",right:"left"},m=d.extend({init:function(n,i){var o,a,u=this,g=n.closest(".km-modalview-wrapper"),m=n.closest(".km-root").children(".km-pane").first(),v=g[0]?g:m;i.viewport?m=i.viewport:m[0]||(m=window),i.container?v=i.container:v[0]||(v=document.body),o={viewport:m,copyAnchorStyles:!1,autosize:!0,open:function(){u.overlay.show()},activate:e.proxy(u._activate,u),deactivate:function(){u.overlay.hide(),u._apiCall||u.trigger(r),u._apiCall=!1}},d.fn.init.call(u,n,i),n=u.element,i=u.options,n.wrap(s).addClass("km-popup").show(),a=u.options.direction.match(/left|right/)?"horizontal":"vertical",u.dimensions=p[a],u.wrapper=n.parent().css({width:i.width,height:i.height}).addClass("km-popup-wrapper km-"+i.direction).hide(),u.arrow=e(l).prependTo(u.wrapper).hide(),u.overlay=e(c).appendTo(v).hide(),o.appendTo=u.overlay,i.className&&u.overlay.addClass(i.className),u.popup=new t.ui.Popup(u.wrapper,e.extend(!0,o,f,h[i.direction]))},options:{name:"Popup",width:240,height:"",direction:"down",container:null,viewport:null},events:[r],show:function(t){this.popup.options.anchor=e(t),this.popup.open()},hide:function(){this._apiCall=!0,this.popup.close()},destroy:function(){d.fn.destroy.call(this),this.popup.destroy(),this.overlay.remove()},target:function(){return this.popup.options.anchor},_activate:function(){var t=this,n=t.options.direction,i=t.dimensions,r=i.offset,o=t.popup,a=o.options.anchor,s=e(a).offset(),l=e(o.element).offset(),c=o.flipped?g[n]:n,d=2*t.arrow[i.size](),h=t.element[i.size]()-t.arrow[i.size](),f=e(a)[i.size](),p=s[r]-l[r]+f/2;d>p&&(p=d),p>h&&(p=h),t.wrapper.removeClass(u).addClass("km-"+c),t.arrow.css(r,p).show()}}),v=d.extend({init:function(n,r){var o,s=this;s.initialOpen=!1,d.fn.init.call(s,n,r),o=e.extend({className:"km-popover-root",hide:function(){s.trigger(a)}},this.options.popup),s.popup=new m(s.element,o),s.popup.overlay.on("move",function(e){e.target==s.popup.overlay[0]&&e.preventDefault()}),s.pane=new i.Pane(s.element,e.extend(this.options.pane,{$angular:this.options.$angular})),t.notify(s,i)},options:{name:"PopOver",popup:{},pane:{}},events:[o,a],open:function(e){this.popup.show(e),this.initialOpen?this.pane.view()._invokeNgController():(this.pane.navigateToInitial()||this.pane.navigate(""),this.popup.popup._position(),this.initialOpen=!0)},openFor:function(e){this.open(e),this.trigger(o,{target:this.popup.target()})},close:function(){this.popup.hide()},destroy:function(){d.fn.destroy.call(this),this.pane.destroy(),this.popup.destroy(),t.destroy(this.element)}});i.plugin(m),i.plugin(v)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.mobile.ui,r=n.ui.Popup,o='<div class="km-shim"/>',a="hide",s=i.Widget,l=s.extend({init:function(t,i){var l=this,c=n.mobile.application,u=n.support.mobileOS,d=c?c.os.name:u?u.name:"ios",h="ios"===d||"wp"===d||(c?c.os.skin:!1),f="blackberry"===d,p=i.align||(h?"bottom center":f?"center right":"center center"),g=i.position||(h?"bottom center":f?"center right":"center center"),m=i.effect||(h?"slideIn:up":f?"slideIn:left":"fade:in"),v=e(o).handler(l).hide();s.fn.init.call(l,t,i),l.shim=v,t=l.element,i=l.options,i.className&&l.shim.addClass(i.className),i.modal||l.shim.on("down","_hide"),(c?c.element:e(document.body)).append(v),l.popup=new r(l.element,{anchor:v,modal:!0,appendTo:v,origin:p,position:g,animation:{open:{effects:m,duration:i.duration},close:{duration:i.duration}},close:function(e){var t=!1;l._apiCall||(t=l.trigger(a)),t&&e.preventDefault(),l._apiCall=!1},deactivate:function(){v.hide()},open:function(){v.show()}}),n.notify(l)},events:[a],options:{name:"Shim",modal:!1,align:t,position:t,effect:t,duration:200},show:function(){this.popup.open()},hide:function(){this._apiCall=!0,this.popup.close()},destroy:function(){s.fn.destroy.call(this),this.shim.kendoDestroy(),this.popup.destroy(),this.shim.remove()},_hide:function(t){t&&e.contains(this.shim.children().children(".k-popup")[0],t.target)||this.popup.close()}});i.plugin(l)}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.mobile.ui,i=n.Shim,r=n.Widget,o="beforeOpen",a="open",s="close",l="init",c='<div class="km-modalview-wrapper" />',u=n.View.extend({init:function(e,t){var n=this;r.fn.init.call(n,e,t),n._id(),n._wrap(),n._shim(),this.options.$angular||(n._layout(),n._scroller(),n._model()),n.element.css("display",""),n.trigger(l)},events:[l,o,a,s],options:{name:"ModalView",modal:!0,width:null,height:null},destroy:function(){r.fn.destroy.call(this),this.shim.destroy()},open:function(t){var n=this;n.target=e(t),n.shim.show(),n._invokeNgController(),n.trigger("show",{view:n})},openFor:function(e){this.trigger(o,{target:e})||(this.open(e),this.trigger(a,{target:e}))},close:function(){this.element.is(":visible")&&!this.trigger(s)&&this.shim.hide()},_wrap:function(){var e,t,n=this,i=n.element,r=n.options;e=i[0].style.width||"auto",t=i[0].style.height||"auto",i.addClass("km-modalview").wrap(c),n.wrapper=i.parent().css({width:r.width||e||300,height:r.height||t||300}).addClass("auto"==t?" km-auto-height":""),i.css({width:"",height:""})},_shim:function(){var e=this;e.shim=new i(e.wrapper,{modal:e.options.modal,position:"center center",align:"center center",effect:"fade:in",className:"km-modalview-root",hide:function(t){e.trigger(s)&&t.preventDefault()}})}});n.plugin(u)}(window.kendo.jQuery)}(),function(){!function(e,t){var n=window.kendo,i=n.mobile,r=n.support.mobileOS,o=n.effects.Transition,a=n.roleSelector,s="x",l=i.ui,c=!(r.ios&&7==r.majorVersion&&!r.appMode),u="beforeShow",d="init",h="show",f="hide",p="afterHide",g={enable:e.noop},m=l.View.extend({init:function(t,r){var o,s,l,u,h;if(e(t).parent().prepend(t),i.ui.Widget.fn.init.call(this,t,r),this.options.$angular||(this._layout(),this._scroller()),this._model(),o=this.element.closest(a("pane")).data("kendoMobilePane"))this.pane=o,this.pane.bind("viewShow",function(e){u._viewShow(e)}),this.pane.bind("sameViewRequested",function(){u.hide()}),s=this.userEvents=new n.UserEvents(o.element,{filter:a("view splitview"),allowSelection:!0});else{if(this.currentView=g,l=e(this.options.container),!l)throw Error("The drawer needs a container configuration option set.");s=this.userEvents=new n.UserEvents(l,{allowSelection:!0}),this._attachTransition(l)}u=this,h=function(e){u.visible&&(u.hide(),e.preventDefault())},this.options.swipeToOpen&&c?(s.bind("press",function(){u.transition.cancel()}),s.bind("start",function(e){u._start(e)}),s.bind("move",function(e){u._update(e)}),s.bind("end",function(e){u._end(e)}),s.bind("tap",h)):s.bind("press",h),this.leftPositioned="left"===this.options.position,this.visible=!1,this.element.hide().addClass("km-drawer").addClass(this.leftPositioned?"km-left-drawer":"km-right-drawer"),this.trigger(d);
},options:{name:"Drawer",position:"left",views:[],swipeToOpenViews:[],swipeToOpen:!0,title:"",container:null},events:[u,f,p,d,h],show:function(){this._activate()&&this._show()},hide:function(){this.currentView&&(this.currentView.enable(),m.current=null,this._moveViewTo(0),this.trigger(f,{view:this}))},openFor:function(){this.visible?this.hide():this.show()},destroy:function(){l.View.fn.destroy.call(this),this.userEvents.destroy()},_activate:function(){if(this.visible)return!0;var e=this._currentViewIncludedIn(this.options.views);return!e||this.trigger(u,{view:this})?!1:(this._setAsCurrent(),this.element.show(),this.trigger(h,{view:this}),this._invokeNgController(),!0)},_currentViewIncludedIn:function(t){if(!this.pane||!t.length)return!0;var n=this.pane.view();return e.inArray(n.id.replace("#",""),t)>-1||e.inArray(n.element.attr("id"),t)>-1},_show:function(){this.currentView.enable(!1),this.visible=!0;var e=this.element.width();this.leftPositioned||(e=-e),this._moveViewTo(e)},_setAsCurrent:function(){m.last!==this&&(m.last&&m.last.element.hide(),this.element.show()),m.last=this,m.current=this},_moveViewTo:function(e){this.userEvents.cancel(),this.transition.moveTo({location:e,duration:400,ease:o.easeOutExpo})},_viewShow:function(e){return this.currentView&&this.currentView.enable(),this.currentView===e.view?(this.hide(),t):(this.currentView=e.view,this._attachTransition(e.view.element),t)},_attachTransition:function(e){var t=this,i=this.movable,r=i&&i.x;this.transition&&(this.transition.cancel(),this.movable.moveAxis("x",0)),i=this.movable=new n.ui.Movable(e),this.transition=new o({axis:s,movable:this.movable,onEnd:function(){0===i[s]&&(e[0].style.cssText="",t.element.hide(),t.trigger(p),t.visible=!1)}}),r&&(e.addClass("k-fx-hidden"),n.animationFrame(function(){e.removeClass("k-fx-hidden"),t.movable.moveAxis(s,r),t.hide()}))},_start:function(e){var i,r,o,a,s,l=e.sender;return Math.abs(e.x.velocity)<Math.abs(e.y.velocity)||n.triggeredByInput(e.event)||!this._currentViewIncludedIn(this.options.swipeToOpenViews)?(l.cancel(),t):(i=this.leftPositioned,r=this.visible,o=i&&r||!i&&!m.current,a=!i&&r||i&&!m.current,s=0>e.x.velocity,(o&&s||a&&!s)&&this._activate()?(l.capture(),t):(l.cancel(),t))},_update:function(e){var t,n=this.movable,i=n.x+e.x.delta;t=this.leftPositioned?Math.min(Math.max(0,i),this.element.width()):Math.max(Math.min(0,i),-this.element.width()),this.movable.moveAxis(s,t),e.event.preventDefault(),e.event.stopPropagation()},_end:function(e){var t,n=e.x.velocity,i=Math.abs(this.movable.x)>this.element.width()/2,r=.8;t=this.leftPositioned?n>-r&&(n>r||i):r>n&&(-r>n||i),t?this._show():this.hide()}});l.plugin(m)}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.mobile.ui,i=n.Widget,r="<div class='km-expanded-pane-shim' />",o=n.View,a=o.extend({init:function(o,a){var s,l,c=this;i.fn.init.call(c,o,a),o=c.element,e.extend(c,a),c._id(),c.options.$angular?c._overlay():(c._layout(),c._overlay()),c._style(),l=o.children(c._locate("modalview")),c.options.$angular?l.each(function(n,i){t.compileMobileDirective(e(i),a.$angular[0])}):t.mobile.init(l),c.panes=[],c._paramsHistory=[],c.options.$angular?(c.element.children(t.directiveSelector("pane")).each(function(){s=t.compileMobileDirective(e(this),a.$angular[0]),c.panes.push(s)}),c.element.children(t.directiveSelector("header footer")).each(function(){t.compileMobileDirective(e(this),a.$angular[0])})):c.content.children(t.roleSelector("pane")).each(function(){s=t.initWidget(this,{},n.roles),c.panes.push(s)}),c.expandedPaneShim=e(r).appendTo(c.element),c._shimUserEvents=new t.UserEvents(c.expandedPaneShim,{tap:function(){c.collapsePanes()}})},_locate:function(e){return this.options.$angular?t.directiveSelector(e):t.roleSelector(e)},options:{name:"SplitView",style:"horizontal"},expandPanes:function(){this.element.addClass("km-expanded-splitview")},collapsePanes:function(){this.element.removeClass("km-expanded-splitview")},_layout:function(){var e=this,n=e.element;e.transition=t.attrValue(n,"transition"),t.mobile.ui.View.prototype._layout.call(this),t.mobile.init(this.header.add(this.footer)),e.element.addClass("km-splitview"),e.content.addClass("km-split-content")},_style:function(){var t,n=this.options.style,i=this.element;n&&(t=n.split(" "),e.each(t,function(){i.addClass("km-split-"+this)}))},showStart:function(){var t=this;t.element.css("display",""),t.inited?this._invokeNgController():(t.inited=!0,e.each(t.panes,function(){this.options.initial?this.navigateToInitial():this.navigate("")}),t.trigger("init",{view:t})),t.trigger("show",{view:t})}});n.plugin(a)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t){var n=[];return p&&n.push("km-on-"+p.name),n.push(e.skin?"km-"+e.skin:"ios"==e.name&&e.majorVersion>6?"km-ios7":"km-"+e.name),("ios"==e.name&&7>e.majorVersion||"ios"!=e.name)&&n.push("km-"+e.name+e.majorVersion),n.push("km-"+e.majorVersion),n.push("km-m"+(e.minorVersion?e.minorVersion[0]:0)),e.variant&&(e.skin&&e.skin===e.name||!e.skin||e.setDefaultPlatform===!1)&&n.push("km-"+(e.skin?e.skin:e.name)+"-"+e.variant),e.cordova&&n.push("km-cordova"),n.push(e.appMode?"km-app":"km-web"),t&&t.statusBarStyle&&n.push("km-"+t.statusBarStyle+"-status-bar"),n.join(" ")}function i(t){return"km-wp-"+(t.noVariantSet?0===parseInt(e("<div style='background: Background' />").css("background-color").split(",")[1],10)?"dark":"light":t.variant+" km-wp-"+t.variant+"-force")}function r(e){return p.wp?"-kendo-landscape"==e.css("animation-name"):Math.abs(window.orientation)/90==1}function o(e){return r(e)?w:v}function a(e){e.parent().addBack().css("min-height",window.innerHeight)}function s(){e("meta[name=viewport]").remove(),F.append(k({height:", width=device-width"+(r()?", height="+window.innerHeight+"px":u.mobileOS.flatVersion>=600&&700>u.mobileOS.flatVersion?", height="+window.innerWidth+"px":", height=device-height")}))}var l=window.kendo,c=l.mobile,u=l.support,d=c.ui.Widget,h=c.ui.Pane,f="ios7",p=u.mobileOS,g="blackberry"==p.device&&p.flatVersion>=600&&1e3>p.flatVersion&&p.appMode,m=.93,v="km-vertical",_="chrome"===p.browser,y=p.ios&&p.flatVersion>=700&&800>p.flatVersion&&(p.appMode||_),b=Math.abs(window.orientation)/90==1,w="km-horizontal",x={ios7:{ios:!0,browser:"default",device:"iphone",flatVersion:"700",majorVersion:"7",minorVersion:"0.0",name:"ios",tablet:!1},ios:{ios:!0,browser:"default",device:"iphone",flatVersion:"612",majorVersion:"6",minorVersion:"1.2",name:"ios",tablet:!1},android:{android:!0,browser:"default",device:"android",flatVersion:"442",majorVersion:"4",minorVersion:"4.2",name:"android",tablet:!1},blackberry:{blackberry:!0,browser:"default",device:"blackberry",flatVersion:"710",majorVersion:"7",minorVersion:"1.0",name:"blackberry",tablet:!1},meego:{meego:!0,browser:"default",device:"meego",flatVersion:"850",majorVersion:"8",minorVersion:"5.0",name:"meego",tablet:!1},wp:{wp:!0,browser:"default",device:"wp",flatVersion:"800",majorVersion:"8",minorVersion:"0.0",name:"wp",tablet:!1}},k=l.template('<meta content="initial-scale=#: data.scale #, maximum-scale=#: data.scale #, user-scalable=no#=data.height#" name="viewport" />',{usedWithBlock:!1}),C=l.template('<meta name="apple-mobile-web-app-capable" content="#= data.webAppCapable === false ? \'no\' : \'yes\' #" /> <meta name="apple-mobile-web-app-status-bar-style" content="#=data.statusBarStyle#" /> <meta name="msapplication-tap-highlight" content="no" /> ',{usedWithBlock:!1}),S=l.template("<style>.km-view { clip: rect(0 #= data.width #px #= data.height #px 0); }</style>",{usedWithBlock:!1}),T=p.android&&"chrome"!=p.browser||p.blackberry,A=l.template('<link rel="apple-touch-icon'+(p.android?"-precomposed":"")+'" # if(data.size) { # sizes="#=data.size#" #}# href="#=data.icon#" />',{usedWithBlock:!1}),D=("iphone"==p.device||"ipod"==p.device)&&7>p.majorVersion,M=("iphone"==p.device||"ipod"==p.device)&&p.majorVersion>=7,E=M?"none":null,P="mobilesafari"==p.browser?60:0,I=20,z=e(window),R=window.screen,F=e("head"),B="init",L=e.proxy,O=d.extend({init:function(t,n){c.application=this,e(e.proxy(this,"bootstrap",t,n))},bootstrap:function(t,n){var i,r,o;t=e(t),t[0]||(t=e(document.body)),d.fn.init.call(this,t,n),this.element.removeAttr("data-"+l.ns+"role"),this._setupPlatform(),this._attachMeta(),this._setupElementClass(),this._attachHideBarHandlers(),i=e.extend({},this.options),delete i.name,r=this,o=function(){r.pane=new h(r.element,i),r.pane.navigateToInitial(),r.options.updateDocumentTitle&&r._setupDocumentTitle(),r._startHistory(),r.trigger(B)},this.options.$angular?setTimeout(o):o()},options:{name:"Application",hideAddressBar:!0,browserHistory:!0,historyTransition:E,modelScope:window,statusBarStyle:"black",transition:"",retina:!1,platform:null,skin:null,updateDocumentTitle:!0,useNativeScrolling:!1},events:[B],navigate:function(e,t){this.pane.navigate(e,t)},replace:function(e,t){this.pane.replace(e,t)},scroller:function(){return this.view().scroller},hideLoading:function(){if(!this.pane)throw Error("The mobile application instance is not fully instantiated. Please consider activating loading in the application init event handler.");this.pane.hideLoading()},showLoading:function(){if(!this.pane)throw Error("The mobile application instance is not fully instantiated. Please consider activating loading in the application init event handler.");this.pane.showLoading()},changeLoadingMessage:function(e){if(!this.pane)throw Error("The mobile application instance is not fully instantiated. Please consider changing the message in the application init event handler.");this.pane.changeLoadingMessage(e)},view:function(){return this.pane.view()},skin:function(e){var t=this;return arguments.length?(t.options.skin=e||"",t.element[0].className="km-pane",t._setupPlatform(),t._setupElementClass(),t.options.skin):t.options.skin},destroy:function(){d.fn.destroy.call(this),this.pane.destroy(),this.router.destroy()},_setupPlatform:function(){var t=this,r=t.options.platform,o=t.options.skin,a=[],s=p||x[f];r&&(s.setDefaultPlatform=!0,"string"==typeof r?(a=r.split("-"),s=e.extend({variant:a[1]},s,x[a[0]])):s=r),o&&(a=o.split("-"),p||(s.setDefaultPlatform=!1),s=e.extend({},s,{skin:a[0],variant:a[1]})),s.variant||(s.noVariantSet=!0,s.variant="dark"),t.os=s,t.osCssClass=n(t.os,t.options),"wp"==s.name&&(t.refreshBackgroundColorProxy||(t.refreshBackgroundColorProxy=e.proxy(function(){(t.os.variant&&t.os.skin&&t.os.skin===t.os.name||!t.os.skin)&&t.element.removeClass("km-wp-dark km-wp-light km-wp-dark-force km-wp-light-force").addClass(i(t.os))},t)),e(document).off("visibilitychange",t.refreshBackgroundColorProxy),e(document).off("resume",t.refreshBackgroundColorProxy),s.skin||(t.element.parent().css("overflow","hidden"),e(document).on("visibilitychange",t.refreshBackgroundColorProxy),e(document).on("resume",t.refreshBackgroundColorProxy),t.refreshBackgroundColorProxy()))},_startHistory:function(){this.options.browserHistory?(this.router=new l.Router({pushState:this.options.pushState,root:this.options.root,hashBang:this.options.hashBang}),this.pane.bindToRouter(this.router),this.router.start()):this.options.initial||this.pane.navigate("")},_resizeToScreenHeight:function(){var t,n=e("meta[name=apple-mobile-web-app-status-bar-style]").attr("content").match(/black-translucent|hidden/),i=this.element;t=_?window.innerHeight:r(i)?n?b?R.availWidth+I:R.availWidth:b?R.availWidth:R.availWidth-I:n?b?R.availHeight:R.availHeight+I:b?R.availHeight-I:R.availHeight,i.height(t)},_setupElementClass:function(){var t,n=this,i=n.element;i.parent().addClass("km-root km-"+(n.os.tablet?"tablet":"phone")),i.addClass(n.osCssClass+" "+o(i)),this.options.useNativeScrolling&&i.parent().addClass("km-native-scrolling"),_&&i.addClass("km-ios-chrome"),u.wpDevicePixelRatio&&i.parent().css("font-size",u.wpDevicePixelRatio+"em"),this.options.retina&&(i.parent().addClass("km-retina"),i.parent().css("font-size",u.devicePixelRatio*m+"em")),g&&s(),n.options.useNativeScrolling?i.parent().addClass("km-native-scrolling"):T&&(t=(screen.availWidth>screen.availHeight?screen.availWidth:screen.availHeight)+200,e(S({width:t,height:t})).appendTo(F)),y&&n._resizeToScreenHeight(),l.onResize(function(){i.removeClass("km-horizontal km-vertical").addClass(o(i)),n.options.useNativeScrolling&&a(i),y&&n._resizeToScreenHeight(),g&&s(),l.resize(i)})},_clearExistingMeta:function(){F.find("meta").filter("[name|='apple-mobile-web-app'],[name|='msapplication-tap'],[name='viewport']").remove()},_attachMeta:function(){var e,t=this.options,n=t.icon;if(this._clearExistingMeta(),g||F.prepend(k({height:"",scale:this.options.retina?1/u.devicePixelRatio:"1.0"})),F.prepend(C(t)),n){"string"==typeof n&&(n={"":n});for(e in n)F.prepend(A({icon:n[e],size:e}))}t.useNativeScrolling&&a(this.element)},_attachHideBarHandlers:function(){var e=this,t=L(e,"_hideBar");!u.mobileOS.appMode&&e.options.hideAddressBar&&D&&!e.options.useNativeScrolling&&(e._initialHeight={},z.on("load",t),l.onResize(function(){setTimeout(window.scrollTo,0,0,1)}))},_setupDocumentTitle:function(){var e=this,n=document.title;e.pane.bind("viewShow",function(e){var i=e.view.title;document.title=i!==t?i:n})},_hideBar:function(){var t=this,n=t.element;n.height(l.support.transforms.css+"calc(100% + "+P+"px)"),e(window).trigger(l.support.resize)}});l.mobile.Application=O,l.ui.plugin(O,l.mobile,"Mobile")}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.support,i=t.mobile.ui,r=i.Shim,o=i.Popup,a=i.Widget,s="open",l="close",c="command",u="li>a",d="actionsheetContext",h='<div class="km-actionsheet-wrapper" />',f=t.template('<li class="km-actionsheet-cancel"><a href="\\#">#:cancel#</a></li>'),p=a.extend({init:function(s,l){var c,d,p,g=this,m=n.mobileOS;a.fn.init.call(g,s,l),l=g.options,p=l.type,s=g.element,d="auto"===p?m&&m.tablet:"tablet"===p,c=d?o:r,l.cancelTemplate&&(f=t.template(l.cancelTemplate)),s.addClass("km-actionsheet").append(f({cancel:g.options.cancel})).wrap(h).on("up",u,"_click").on("click",u,t.preventDefault),g.view().bind("destroy",function(){g.destroy()}),g.wrapper=s.parent().addClass(p?" km-actionsheet-"+p:""),g.shim=new c(g.wrapper,e.extend({modal:m.ios&&7>m.majorVersion,className:"km-actionsheet-root"},g.options.popup)),g._closeProxy=e.proxy(g,"_close"),g._shimHideProxy=e.proxy(g,"_shimHide"),g.shim.bind("hide",g._shimHideProxy),d&&t.onResize(g._closeProxy),t.notify(g,i)},events:[s,l,c],options:{name:"ActionSheet",cancel:"Cancel",type:"auto",popup:{height:"auto"}},open:function(t,n){var i=this;i.target=e(t),i.context=n,i.shim.show(t)},close:function(){this.context=this.target=null,this.shim.hide()},openFor:function(e){var t=this,n=e.data(d);t.open(e,n),t.trigger(s,{target:e,context:n})},destroy:function(){a.fn.destroy.call(this),t.unbindResize(this._closeProxy),this.shim.destroy()},_click:function(n){var i,r,o,a;n.isDefaultPrevented()||(i=e(n.currentTarget),r=i.data("action"),r&&(o={target:this.target,context:this.context},a=this.options.$angular,a?this.element.injector().get("$parse")(r)(a[0])(o):t.getter(r)(window)(o)),this.trigger(c,{target:this.target,context:this.context,currentTarget:i}),n.preventDefault(),this._close())},_shimHide:function(e){this.trigger(l)?e.preventDefault():this.context=this.target=null},_close:function(e){this.trigger(l)?e.preventDefault():this.close()}});i.plugin(p)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t,n,i){e(n.target).closest(".km-button,.km-detail").toggleClass("km-state-active",i),u&&t.deactivateTimeoutID&&(clearTimeout(t.deactivateTimeoutID),t.deactivateTimeoutID=0)}function i(t){return e('<span class="km-badge">'+t+"</span>")}var r=window.kendo,o=r.mobile,a=o.ui,s=a.Widget,l=r.support,c=l.mobileOS,u=c.android&&c.flatVersion>=300,d="click",h="disabled",f="km-state-disabled",p=s.extend({init:function(e,t){var i,o=this;s.fn.init.call(o,e,t),i="up"===o.options.clickOn,o._wrap(),o._style(),i||o.element.attr("data-navigate-on-press",!0),o.options.enable=o.options.enable&&!o.element.attr(h),o.enable(o.options.enable),o._userEvents=new r.UserEvents(o.element,{allowSelection:!i,press:function(e){o._activate(e)},release:function(e){n(o,e,!1),i||e.event.stopPropagation()}}),o._userEvents.bind(i?"tap":"press",function(e){o._release(e)}),u&&o.element.on("move",function(e){o._timeoutDeactivate(e)})},destroy:function(){s.fn.destroy.call(this),this._userEvents.destroy()},events:[d],options:{name:"Button",icon:"",style:"",badge:"",clickOn:"up",enable:!0},badge:function(e){var t=this.badgeElement=this.badgeElement||i(e).appendTo(this.element);return e||0===e?(t.html(e),this):e===!1?(t.empty().remove(),this.badgeElement=!1,this):t.html()},enable:function(e){var n=this.element;t===e&&(e=!0),this.options.enable=e,e?n.removeAttr(h):n.attr(h,h),n.toggleClass(f,!e)},_timeoutDeactivate:function(e){this.deactivateTimeoutID||(this.deactivateTimeoutID=setTimeout(n,500,this,e,!1))},_activate:function(e){var t=document.activeElement,i=t?t.nodeName:"";this.options.enable&&(n(this,e,!0),("INPUT"==i||"TEXTAREA"==i)&&t.blur())},_release:function(n){var i=this;if(!(n.which>1))return i.options.enable?(i.trigger(d,{target:e(n.target),button:i.element})&&n.preventDefault(),t):(n.preventDefault(),t)},_style:function(){var t,n=this.options.style,i=this.element;n&&(t=n.split(" "),e.each(t,function(){i.addClass("km-"+this)}))},_wrap:function(){var t=this,n=t.options.icon,r=t.options.badge,o='<span class="km-icon km-'+n,a=t.element.addClass("km-button"),s=a.children("span:not(.km-icon)").addClass("km-text"),l=a.find("img").addClass("km-image");!s[0]&&a.html()&&(s=a.wrapInner('<span class="km-text" />').children("span.km-text")),!l[0]&&n&&(s[0]||(o+=" km-notext"),t.iconElement=a.prepend(e(o+'" />'))),(r||0===r)&&(t.badgeElement=i(r).appendTo(a))}}),g=p.extend({options:{name:"BackButton",style:"back"},init:function(e,n){var i=this;p.fn.init.call(i,e,n),t===i.element.attr("href")&&i.element.attr("href","#:back")}}),m=p.extend({options:{name:"DetailButton",style:""},init:function(e,t){p.fn.init.call(this,e,t)},_style:function(){var t,n=this.options.style+" detail",i=this.element;n&&(t=n.split(" "),e.each(t,function(){i.addClass("km-"+this)}))},_wrap:function(){var t=this,n=t.options.icon,i='<span class="km-icon km-'+n,r=t.element,o=r.children("span"),a=r.find("img").addClass("km-image");!a[0]&&n&&(o[0]||(i+=" km-notext"),r.prepend(e(i+'" />')))}});a.plugin(p),a.plugin(g),a.plugin(m)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(t){return e('<span class="km-badge">'+t+"</span>")}var i=window.kendo,r=i.mobile.ui,o=r.Widget,a="km-state-active",s="km-state-disabled",l="select",c="li:not(."+a+")",u=o.extend({init:function(e,t){var n=this;o.fn.init.call(n,e,t),n.element.addClass("km-buttongroup").find("li").each(n._button),n.element.on(n.options.selectOn,c,"_select"),n._enable=!0,n.select(n.options.index),n.options.enable||(n._enable=!1,n.wrapper.addClass(s))},events:[l],options:{name:"ButtonGroup",selectOn:"down",index:-1,enable:!0},current:function(){return this.element.find("."+a)},select:function(n){var i=this,r=-1;n!==t&&-1!==n&&i._enable&&!e(n).is("."+s)&&(i.current().removeClass(a),"number"==typeof n?(r=n,n=e(i.element[0].children[n])):n.nodeType&&(n=e(n),r=n.index()),n.addClass(a),i.selectedIndex=r)},badge:function(t,i){var r,o=this.element;return isNaN(t)||(t=o.children().get(t)),t=o.find(t),r=e(t.children(".km-badge")[0]||n(i).appendTo(t)),i||0===i?(r.html(i),this):i===!1?(r.empty().remove(),this):r.html()},enable:function(e){var n=this.wrapper;t===e&&(e=!0),e?n.removeClass(s):n.addClass(s),this._enable=this.options.enable=e},_button:function(){var t=e(this).addClass("km-button"),r=i.attrValue(t,"icon"),o=i.attrValue(t,"badge"),a=t.children("span"),s=t.find("img").addClass("km-image");a[0]||(a=t.wrapInner("<span/>").children("span")),a.addClass("km-text"),!s[0]&&r&&t.prepend(e('<span class="km-icon km-'+r+'"/>')),(o||0===o)&&n(o).appendTo(t)},_select:function(e){e.which>1||e.isDefaultPrevented()||!this._enable||(this.select(e.currentTarget),this.trigger(l,{index:this.selectedIndex}))}});r.plugin(u)}(window.kendo.jQuery)}(),function(){!function(e){var t=window.kendo,n=t.mobile.ui,i=n.Widget,r="km-collapsible",o="km-collapsible-header",a="km-collapsible-content",s="km-collapsibleinset",l="<div data-role='collapsible-header' class='"+o+"'></div>",c="<div data-role='collapsible-content' class='"+a+"'></div>",u="km-collapsed",d="km-expanded",h="km-animated",f="left",p="expand",g="collapse",m=i.extend({init:function(n,o){var a=this,l=e(n);i.fn.init.call(a,l,o),l.addClass(r),a._buildHeader(),a.content=l.children().not(a.header).wrapAll(c).parent(),a._userEvents=new t.UserEvents(a.header,{tap:function(){a.toggle()}}),l.addClass(a.options.collapsed?u:d),a.options.inset&&l.addClass(s),a.options.animation?(a.content.addClass(h),a.content.height(0),a.options.collapsed&&a.content.hide()):a.options.collapsed&&a.content.hide()},events:[p,g],options:{name:"Collapsible",collapsed:!0,collapseIcon:"arrow-n",expandIcon:"arrow-s",iconPosition:f,animation:!0,inset:!1},destroy:function(){i.fn.destroy.call(this),this._userEvents.destroy()},expand:function(e){var n=this.options.collapseIcon,i=this.content,r=t.support.mobileOS.ios;this.trigger(p)||(n&&this.header.find(".km-icon").removeClass().addClass("km-icon km-"+n),this.element.removeClass(u).addClass(d),this.options.animation&&!e?(i.off("transitionend"),i.show(),r&&i.removeClass(h),i.height(this._getContentHeight()),r&&i.addClass(h),t.resize(i)):i.show())},collapse:function(e){var t=this.options.expandIcon,n=this.content;this.trigger(g)||(t&&this.header.find(".km-icon").removeClass().addClass("km-icon km-"+t),this.element.removeClass(d).addClass(u),this.options.animation&&!e?(n.one("transitionend",function(){n.hide()}),n.height(0)):n.hide())},toggle:function(e){this.isCollapsed()?this.expand(e):this.collapse(e)},isCollapsed:function(){return this.element.hasClass(u)},resize:function(){!this.isCollapsed()&&this.options.animation&&this.content.height(this._getContentHeight())},_buildHeader:function(){var t=this.element.children(":header").wrapAll(l),n=e('<span class="km-icon"/>'),i=this.options.collapsed?this.options.expandIcon:this.options.collapseIcon,r=this.options.iconPosition;i&&(t.prepend(n),n.addClass("km-"+i)),this.header=t.parent(),this.header.addClass("km-icon-"+r)},_getContentHeight:function(){var e,t=this.content.attr("style");return this.content.css({position:"absolute",visibility:"hidden",height:"auto"}),e=this.content.height(),this.content.attr("style",t?t:""),e}});n.plugin(m)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(){return this.nodeType===v.TEXT_NODE&&this.nodeValue.match(U)}function i(e,t){t&&!e[0].querySelector(".km-icon")&&e.prepend('<span class="km-icon km-'+t+'"/>')}function r(e){i(e,T(e,"icon")),i(e,T(e.children(C),"icon"))}function o(e){var t=e.parent(),r=e.add(t.children(m.roleSelector("detailbutton"))),o=t.contents().not(r).not(n);o.length||(e.addClass("km-listview-link").attr(m.attr("role"),"listview-link"),i(e,T(t,"icon")),i(e,T(e,"icon")))}function a(e){if(e[0].querySelector("input[type=checkbox],input[type=radio]")){var t=e.parent();t.contents().not(e).not(function(){return 3==this.nodeType})[0]||(e.addClass("km-listview-label"),e.children("[type=checkbox],[type=radio]").addClass("km-widget km-icon km-check"))}}function s(t,n){e(t).css("transform","translate3d(0px, "+n+"px, 0px)")}var l,c,u,d,h,f,p,g,m=window.kendo,v=window.Node,_=m.mobile,y=_.ui,b=m.data.DataSource,w=y.DataBoundWidget,x=".km-list > li, > li:not(.km-group-container)",k=".km-listview-link, .km-listview-label",C="["+m.attr("icon")+"]",S=e.proxy,T=m.attrValue,A="km-group-title",D="km-state-active",M='<div class="'+A+'"><div class="km-text"></div></div>',E=m.template('<li><div class="'+A+'"><div class="km-text">#= this.headerTemplate(data) #</div></div><ul>#= kendo.render(this.template, data.items)#</ul></li>'),P='<div class="km-listview-wrapper" />',I=m.template('<form class="km-filter-form"><div class="km-filter-wrap"><input type="search" placeholder="#=placeholder#"/><a href="\\#" class="km-filter-reset" title="Clear"><span class="km-icon km-clear"></span><span class="km-text">Clear</span></a></div></form>'),z=".kendoMobileListView",R="styled",F="dataBound",B="dataBinding",L="itemChange",O="click",H="change",N="progress",V="function",U=/^\s+$/,W=/button/,j=m.Class.extend({init:function(e){var t,n,i=e.scroller();i&&(this.options=e.options,this.element=e.element,this.scroller=e.scroller(),this._shouldFixHeaders(),t=this,n=function(){t._cacheHeaders()},e.bind("resize",n),e.bind(R,n),e.bind(F,n),i.bind("scroll",function(e){t._fixHeader(e)}))},_fixHeader:function(t){if(this.fixedHeaders){var n,i,r,o=0,a=this.scroller,s=this.headers,l=t.scrollTop;do{if(n=s[o++],!n){r=e("<div />");break}i=n.offset,r=n.header}while(i+1>l);this.currentHeader!=o&&(a.fixedContainer.html(r.clone()),this.currentHeader=o)}},_shouldFixHeaders:function(){this.fixedHeaders="group"===this.options.type&&this.options.fixedHeaders},_cacheHeaders:function(){if(this._shouldFixHeaders(),this.fixedHeaders){var t=[],n=this.scroller.scrollTop;this.element.find("."+A).each(function(i,r){r=e(r),t.unshift({offset:r.position().top+n,header:r})}),this.headers=t,this._fixHeader({scrollTop:n})}}}),G=function(){return{page:1}},q=m.Class.extend({init:function(e){var t=this,n=e.options,i=e.scroller(),r=n.pullParameters||G;this.listView=e,this.scroller=i,e.bind("_dataSource",function(e){t.setDataSource(e.dataSource)}),i.setOptions({pullToRefresh:!0,pull:function(){t._pulled||(t._pulled=!0,t.dataSource.read(r.call(e,t._first)))},messages:{pullTemplate:n.messages.pullTemplate,releaseTemplate:n.messages.releaseTemplate,refreshTemplate:n.messages.refreshTemplate}})},setDataSource:function(e){var t=this;this._first=e.view()[0],this.dataSource=e,e.bind("change",function(){t._change()}),e.bind("error",function(){t._change()})},_change:function(){var e,t=this.scroller,n=this.dataSource;this._pulled&&t.pullHandled(),(this._pulled||!this._first)&&(e=n.view(),e[0]&&(this._first=e[0])),this._pulled=!1}}),$=m.Observable.extend({init:function(e){var t=this;m.Observable.fn.init.call(t),t.buffer=e.buffer,t.height=e.height,t.item=e.item,t.items=[],t.footer=e.footer,t.buffer.bind("reset",function(){t.refresh()})},refresh:function(){for(var e,t,n,i,r=this.buffer,o=this.items,a=!1;o.length;)o.pop().destroy();for(this.offset=r.offset,e=this.item,i=0;r.viewSize>i;i++){if(i===r.total()){a=!0;break}n=e(this.content(this.offset+o.length)),n.below(t),t=n,o.push(n)}this.itemCount=o.length,this.trigger("reset"),this._resize(),a&&this.trigger("endReached")},totalHeight:function(){if(!this.items[0])return 0;var e=this,t=e.items,n=t[0].top,i=t[t.length-1].bottom,r=(i-n)/e.itemCount,o=e.buffer.length-e.offset-e.itemCount;return(this.footer?this.footer.height:0)+i+o*r},batchUpdate:function(e){var t,n,i=this.height(),r=this.items,o=this.offset;if(r[0]){if(this.lastDirection)for(;r[r.length-1].bottom>e+2*i&&0!==this.offset;)this.offset--,t=r.pop(),t.update(this.content(this.offset)),t.above(r[0]),r.unshift(t);else for(;e-i>r[0].top;){if(n=this.offset+this.itemCount,n===this.buffer.total()){this.trigger("endReached");break}if(n===this.buffer.length)break;t=r.shift(),t.update(this.content(this.offset+this.itemCount)),t.below(r[r.length-1]),r.push(t),this.offset++}o!==this.offset&&this._resize()}},update:function(e){var t,n,i,r,o=this,a=this.items,s=this.height(),l=this.itemCount,c=s/2,u=(this.lastTop||0)>e,d=e-c,h=e+s+c;a[0]&&(this.lastTop=e,this.lastDirection=u,u?a[0].top>d&&a[a.length-1].bottom>h+c&&this.offset>0&&(this.offset--,t=a.pop(),n=a[0],t.update(this.content(this.offset)),a.unshift(t),t.above(n),o._resize()):h>a[a.length-1].bottom&&d-c>a[0].top&&(r=this.offset+l,r===this.buffer.total()?this.trigger("endReached"):r!==this.buffer.length&&(t=a.shift(),i=a[a.length-1],a.push(t),t.update(this.content(this.offset+this.itemCount)),o.offset++,t.below(i),o._resize())))},content:function(e){return this.buffer.at(e)},destroy:function(){this.unbind()},_resize:function(){var e=this.items,t=0,n=0,i=e[0],r=e[e.length-1];i&&(t=i.top,n=r.bottom),this.trigger("resize",{top:t,bottom:n}),this.footer&&this.footer.below(r)}});m.mobile.ui.VirtualList=$,l=m.Class.extend({init:function(t,n){var i=t.append([n],!0)[0],r=i.offsetHeight;e.extend(this,{top:0,element:i,listView:t,height:r,bottom:r})},update:function(e){this.element=this.listView.setDataItem(this.element,e)},above:function(e){e&&(this.height=this.element.offsetHeight,this.top=e.top-this.height,this.bottom=e.top,s(this.element,this.top))},below:function(e){e&&(this.height=this.element.offsetHeight,this.top=e.bottom,this.bottom=this.top+this.height,s(this.element,this.top))},destroy:function(){m.destroy(this.element),e(this.element).remove()}}),c='<div><span class="km-icon"></span><span class="km-loading-left"></span><span class="km-loading-right"></span></div>',u=m.Class.extend({init:function(t){this.element=e('<li class="km-load-more km-scroller-refresh" style="display: none"></li>').appendTo(t.element),this._loadIcon=e(c).appendTo(this.element)},enable:function(){this.element.show(),this.height=this.element.outerHeight(!0)},disable:function(){this.element.hide(),this.height=0},below:function(e){e&&(this.top=e.bottom,this.bottom=this.height+this.top,s(this.element,this.top))}}),d=u.extend({init:function(t,n){this._loadIcon=e(c).hide(),this._loadButton=e('<a class="km-load">'+t.options.messages.loadMoreText+"</a>").hide(),this.element=e('<li class="km-load-more" style="display: none"></li>').append(this._loadIcon).append(this._loadButton).appendTo(t.element);var i=this;this._loadButton.kendoMobileButton().data("kendoMobileButton").bind("click",function(){i._hideShowButton(),n.next()}),n.bind("resize",function(){i._showLoadButton()}),this.height=this.element.outerHeight(!0),this.disable()},_hideShowButton:function(){this._loadButton.hide(),this.element.addClass("km-scroller-refresh"),this._loadIcon.css("display","block")},_showLoadButton:function(){this._loadButton.show(),this.element.removeClass("km-scroller-refresh"),this._loadIcon.hide()}}),h=m.Class.extend({init:function(e){var t=this;this.chromeHeight=e.wrapper.children().not(e.element).outerHeight()||0,this.listView=e,this.scroller=e.scroller(),this.options=e.options,e.bind("_dataSource",function(e){t.setDataSource(e.dataSource,e.empty)}),e.bind("resize",function(){t.list.items.length&&(t.scroller.reset(),t.buffer.range(0),t.list.refresh())}),this.scroller.makeVirtual(),this.scroller.bind("scroll",function(e){t.list.update(e.scrollTop)}),this.scroller.bind("scrollEnd",function(e){t.list.batchUpdate(e.scrollTop)})},destroy:function(){this.list.unbind(),this.buffer.unbind()},setDataSource:function(t,n){var i,r,o,a,s=this,c=this.options,h=this.listView,f=h.scroller(),p=c.loadMore;if(this.dataSource=t,i=t.pageSize()||c.virtualViewSize,!i&&!n)throw Error("the DataSource does not have page size configured. Page Size setting is mandatory for the mobile listview virtual scrolling to work as expected.");this.buffer&&this.buffer.destroy(),r=new m.data.Buffer(t,Math.floor(i/2),p),o=p?new d(h,r):new u(h),this.list&&this.list.destroy(),a=new $({buffer:r,footer:o,item:function(e){return new l(h,e)},height:function(){return f.height()}}),a.bind("resize",function(){s.updateScrollerSize(),h.updateSize()}),a.bind("reset",function(){s.footer.enable()}),a.bind("endReached",function(){o.disable(),s.updateScrollerSize()}),r.bind("expand",function(){a.lastDirection=!1,a.batchUpdate(f.scrollTop)}),e.extend(this,{buffer:r,scroller:f,list:a,footer:o})},updateScrollerSize:function(){this.scroller.virtualSize(0,this.list.totalHeight()+this.chromeHeight)},refresh:function(){this.list.refresh()},reset:function(){this.buffer.range(0),this.list.refresh()}}),f=m.Class.extend({init:function(e){var t,n=this;this.listView=e,this.options=e.options,t=this,this._refreshHandler=function(e){t.refresh(e)},this._progressHandler=function(){e.showLoading()},e.bind("_dataSource",function(e){n.setDataSource(e.dataSource)})},destroy:function(){
this._unbindDataSource()},reset:function(){},refresh:function(e){var n,i,r,o,a,s,l,c=e&&e.action,u=e&&e.items,d=this.listView,h=this.dataSource,f=this.options.appendOnRefresh,p=h.view(),g=h.group(),m=g&&g[0];return"itemchange"===c?(d._hasBindingTarget()||(n=d.findByDataItem(u)[0],n&&d.setDataItem(n,u[0])),t):(a="add"===c&&!m||f&&!d._filter,s="remove"===c&&!m,a?i=[]:s&&(i=d.findByDataItem(u)),d.trigger(B,{action:c||"rebind",items:u,removedItems:i,index:e&&e.index})?(this._shouldShowLoading()&&d.hideLoading(),t):("add"!==c||m?"remove"!==c||m?m?d.replaceGrouped(p):f&&!d._filter?(r=d.prepend(p),o=p):d.replace(p):(r=[],d.remove(u)):(l=p.indexOf(u[0]),l>-1&&(r=d.insertAt(u,l),o=u)),this._shouldShowLoading()&&d.hideLoading(),d.trigger(F,{ns:y,addedItems:r,addedDataItems:o}),t))},setDataSource:function(e){this.dataSource&&this._unbindDataSource(),this.dataSource=e,e.bind(H,this._refreshHandler),this._shouldShowLoading()&&this.dataSource.bind(N,this._progressHandler)},_unbindDataSource:function(){this.dataSource.unbind(H,this._refreshHandler).unbind(N,this._progressHandler)},_shouldShowLoading:function(){var e=this.options;return!e.pullToRefresh&&!e.loadMore&&!e.endlessScroll}}),p=m.Class.extend({init:function(t){var n=this,i=t.options.filterable,r="change paste",o=this;this.listView=t,this.options=i,t.element.before(I({placeholder:i.placeholder||"Search..."})),i.autoFilter!==!1&&(r+=" keyup"),this.element=t.wrapper.find(".km-search-form"),this.searchInput=t.wrapper.find("input[type=search]").closest("form").on("submit"+z,function(e){e.preventDefault()}).end().on("focus"+z,function(){n._oldFilter=n.searchInput.val()}).on(r.split(" ").join(z+" ")+z,S(this._filterChange,this)),this.clearButton=t.wrapper.find(".km-filter-reset").on(O,S(this,"_clearFilter")).hide(),this._dataSourceChange=e.proxy(this._refreshInput,this),t.bind("_dataSource",function(e){e.dataSource.bind("change",o._dataSourceChange)})},_refreshInput:function(){var e=this.listView.dataSource.filter(),t=this.listView._filter.searchInput;t.val(e&&e.filters[0].field===this.listView.options.filterable.field?e.filters[0].value:"")},_search:function(e){this._filter=!0,this.clearButton[e?"show":"hide"](),this.listView.dataSource.filter(e)},_filterChange:function(e){var t=this;"paste"==e.type&&this.options.autoFilter!==!1?setTimeout(function(){t._applyFilter()},1):this._applyFilter()},_applyFilter:function(){var e=this.options,t=this.searchInput.val(),n=t.length?{field:e.field,operator:e.operator||"startswith",ignoreCase:e.ignoreCase,value:t}:null;t!==this._oldFilter&&(this._oldFilter=t,this._search(n))},_clearFilter:function(e){this.searchInput.val(""),this._search(null),e.preventDefault()}}),g=w.extend({init:function(t,n){var i=this;w.fn.init.call(this,t,n),t=this.element,n=this.options,n.scrollTreshold&&(n.scrollThreshold=n.scrollTreshold),t.on("down",k,"_highlight").on("move up cancel",k,"_dim"),this._userEvents=new m.UserEvents(t,{filter:x,allowSelection:!0,tap:function(e){i._click(e)}}),t.css("-ms-touch-action","auto"),t.wrap(P),this.wrapper=this.element.parent(),this._headerFixer=new j(this),this._itemsCache={},this._templates(),this.virtual=n.endlessScroll||n.loadMore,this._style(),this.options.$angular&&(this.virtual||this.options.pullToRefresh)?setTimeout(e.proxy(this,"_start")):this._start()},_start:function(){var e=this.options;this.options.filterable&&(this._filter=new p(this)),this._itemBinder=this.virtual?new h(this):new f(this),this.options.pullToRefresh&&(this._pullToRefreshHandler=new q(this)),this.setDataSource(e.dataSource),this._enhanceItems(this.items()),m.notify(this,y)},events:[O,B,F,L],options:{name:"ListView",style:"",type:"flat",autoBind:!0,fixedHeaders:!1,template:"#:data#",headerTemplate:'<span class="km-text">#:value#</span>',appendOnRefresh:!1,loadMore:!1,endlessScroll:!1,scrollThreshold:30,pullToRefresh:!1,messages:{loadMoreText:"Press to load more",pullTemplate:"Pull to refresh",releaseTemplate:"Release to refresh",refreshTemplate:"Refreshing"},pullOffset:140,filterable:!1,virtualViewSize:null},refresh:function(){this._itemBinder.refresh()},reset:function(){this._itemBinder.reset()},setDataSource:function(e){var t=!e;this.dataSource=b.create(e),this.trigger("_dataSource",{dataSource:this.dataSource,empty:t}),this.options.autoBind&&!t&&(this.items().remove(),this.dataSource.fetch())},destroy:function(){w.fn.destroy.call(this),m.destroy(this.element),this._userEvents.destroy(),this._itemBinder&&this._itemBinder.destroy(),this.element.unwrap(),delete this.element,delete this.wrapper,delete this._userEvents},items:function(){return"group"===this.options.type?this.element.find(".km-list").children():this.element.children().not(".km-load-more")},scroller:function(){return this._scrollerInstance||(this._scrollerInstance=this.element.closest(".km-scroll-wrapper").data("kendoMobileScroller")),this._scrollerInstance},showLoading:function(){var e=this.view();e&&e.loader&&e.loader.show()},hideLoading:function(){var e=this.view();e&&e.loader&&e.loader.hide()},insertAt:function(e,t,n){var i=this;return i._renderItems(e,function(r){if(0===t?i.element.prepend(r):-1===t?i.element.append(r):i.items().eq(t-1).after(r),n)for(var o=0;r.length>o;o++)i.trigger(L,{item:r.eq(o),data:e[o],ns:y})})},append:function(e,t){return this.insertAt(e,-1,t)},prepend:function(e,t){return this.insertAt(e,0,t)},replace:function(e){return this.options.type="flat",this._angularItems("cleanup"),this.element.empty(),this._userEvents.cancel(),this._style(),this.insertAt(e,0)},replaceGrouped:function(t){this.options.type="group",this._angularItems("cleanup"),this.element.empty();var n=e(m.render(this.groupTemplate,t));this._enhanceItems(n.children("ul").children("li")),this.element.append(n),_.init(n),this._style(),this._angularItems("compile")},remove:function(e){var t=this.findByDataItem(e);this.angular("cleanup",function(){return{elements:t}}),m.destroy(t),t.remove()},findByDataItem:function(e){var t,n,i=[];for(t=0,n=e.length;n>t;t++)i[t]="[data-"+m.ns+"uid="+e[t].uid+"]";return this.element.find(i.join(","))},setDataItem:function(t,n){var i=this,r=function(r){var o=e(r[0]);m.destroy(t),i.angular("cleanup",function(){return{elements:[e(t)]}}),e(t).replaceWith(o),i.trigger(L,{item:o,data:n,ns:y})};return this._renderItems([n],r)[0]},updateSize:function(){this._size=this.getSize()},_renderItems:function(t,n){var i=e(m.render(this.template,t));return n(i),this.angular("compile",function(){return{elements:i,data:t.map(function(e){return{dataItem:e}})}}),_.init(i),this._enhanceItems(i),i},_dim:function(e){this._toggle(e,!1)},_highlight:function(e){this._toggle(e,!0)},_toggle:function(t,n){if(!(t.which>1)){var i=e(t.currentTarget),r=i.parent(),o=T(i,"role")||"",a=!o.match(W),s=t.isDefaultPrevented();a&&r.toggleClass(D,n&&!s)}},_templates:function(){var e=this.options.template,t=this.options.headerTemplate,n=' data-uid="#=arguments[0].uid || ""#"',i={},r={};typeof e===V&&(i.template=e,e="#=this.template(data)#"),this.template=S(m.template("<li"+n+">"+e+"</li>"),i),r.template=this.template,typeof t===V&&(r._headerTemplate=t,t="#=this._headerTemplate(data)#"),r.headerTemplate=m.template(t),this.groupTemplate=S(E,r)},_click:function(t){if(!(t.event.which>1||t.event.isDefaultPrevented())){var n,i=t.target,r=e(t.event.target),o=r.closest(m.roleSelector("button","detailbutton","backbutton")),a=m.widgetInstance(o,y),s=i.attr(m.attr("uid"));s&&(n=this.dataSource.getByUid(s)),this.trigger(O,{target:r,item:i,dataItem:n,button:a})&&t.preventDefault()}},_styleGroups:function(){var t=this.element.children();t.children("ul").addClass("km-list"),t.each(function(){var t=e(this),n=t.contents().first();t.addClass("km-group-container"),n.is("ul")||n.is("div."+A)||n.wrap(M)})},_style:function(){var e=this.options,t="group"===e.type,n=this.element,i="inset"===e.style;n.addClass("km-listview").toggleClass("km-list",!t).toggleClass("km-virtual-list",this.virtual).toggleClass("km-listinset",!t&&i).toggleClass("km-listgroup",t&&!i).toggleClass("km-listgroupinset",t&&i),n.parents(".km-listview")[0]||n.closest(".km-content").toggleClass("km-insetcontent",i),t&&this._styleGroups(),this.trigger(R)},_enhanceItems:function(t){t.each(function(){var t,n=e(this),i=!1;n.children().each(function(){t=e(this),t.is("a")?(o(t),i=!0):t.is("label")&&(a(t),i=!0)}),i||r(n)})}}),y.plugin(g)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(n,i){var o=i.find("["+r.attr("align")+"="+n+"]");return o[0]?e('<div class="km-'+n+'item" />').append(o).prependTo(i):t}function i(t){var n=t.siblings(),i=!!t.children("ul")[0],o=!!n[0]&&""===e.trim(t.text()),a=!(!r.mobile.application||!r.mobile.application.element.is(".km-android"));t.prevAll().toggleClass("km-absolute",i),t.toggleClass("km-show-title",o),t.toggleClass("km-fill-title",o&&!e.trim(t.html())),t.toggleClass("km-no-title",i),t.toggleClass("km-hide-title",a&&!n.children().is(":visible"))}var r=window.kendo,o=r.mobile,a=o.ui,s=a.Widget,l=s.extend({init:function(t,i){var r=this;s.fn.init.call(r,t,i),t=r.element,r.container().bind("show",e.proxy(this,"refresh")),t.addClass("km-navbar").wrapInner(e('<div class="km-view-title km-show-title" />')),r.leftElement=n("left",t),r.rightElement=n("right",t),r.centerElement=t.find(".km-view-title")},options:{name:"NavBar"},title:function(e){this.element.find(r.roleSelector("view-title")).text(e),i(this.centerElement)},refresh:function(e){var t=e.view;this.title(t.options.title)},destroy:function(){s.fn.destroy.call(this),r.destroy(this.element)}});a.plugin(l)}(window.kendo.jQuery)}(),function(){!function(e,t){var n,i,r,o,a,s,l,c,u=window.kendo,d=u.mobile,h=d.ui,f=e.proxy,p=u.effects.Transition,g=u.ui.Pane,m=u.ui.PaneDimensions,v=h.DataBoundWidget,_=u.data.DataSource,y=u.data.Buffer,b=u.data.BatchBuffer,w=Math,x=w.abs,k=w.ceil,C=w.round,S=w.max,T=w.min,A=w.floor,D="change",M="changing",E="refresh",P="km-current-page",I="km-virtual-page",z="function",R="itemChange",F="cleanup",B=3,L=-1,O=0,H=1,N=-1,V=0,U=1,W=u.Class.extend({init:function(t){var n=this,i=e("<ol class='km-pages'/>");t.element.append(i),this._changeProxy=f(n,"_change"),this._refreshProxy=f(n,"_refresh"),t.bind(D,this._changeProxy),t.bind(E,this._refreshProxy),e.extend(n,{element:i,scrollView:t})},items:function(){return this.element.children()},_refresh:function(e){var t,n="";for(t=0;e.pageCount>t;t++)n+="<li/>";this.element.html(n),this.items().eq(e.page).addClass(P)},_change:function(e){this.items().removeClass(P).eq(e.page).addClass(P)},destroy:function(){this.scrollView.unbind(D,this._changeProxy),this.scrollView.unbind(E,this._refreshProxy),this.element.remove()}});u.mobile.ui.ScrollViewPager=W,n="transitionEnd",i="dragStart",r="dragEnd",o=u.Observable.extend({init:function(t,o){var a,s,l,c,d,h,f=this;u.Observable.fn.init.call(this),this.element=t,this.container=t.parent(),a=new u.ui.Movable(f.element),s=new p({axis:"x",movable:a,onEnd:function(){f.trigger(n)}}),l=new u.UserEvents(t,{start:function(e){2*x(e.x.velocity)>=x(e.y.velocity)?l.capture():l.cancel(),f.trigger(i,e),s.cancel()},allowSelection:!0,end:function(e){f.trigger(r,e)}}),c=new m({element:f.element,container:f.container}),d=c.x,d.bind(D,function(){f.trigger(D)}),h=new g({dimensions:c,userEvents:l,movable:a,elastic:!0}),e.extend(f,{duration:o&&o.duration||1,movable:a,transition:s,userEvents:l,dimensions:c,dimension:d,pane:h}),this.bind([n,i,r,D],o)},size:function(){return{width:this.dimensions.x.getSize(),height:this.dimensions.y.getSize()}},total:function(){return this.dimension.getTotal()},offset:function(){return-this.movable.x},updateDimension:function(){this.dimension.update(!0)},refresh:function(){this.dimensions.refresh()},moveTo:function(e){this.movable.moveAxis("x",-e)},transitionTo:function(e,t,n){n?this.moveTo(-e):this.transition.moveTo({location:e,duration:this.duration,ease:t})}}),u.mobile.ui.ScrollViewElasticPane=o,a=u.Observable.extend({init:function(e,t,n){var i=this;u.Observable.fn.init.call(this),i.element=e,i.pane=t,i._getPages(),this.page=0,this.pageSize=n.pageSize||1,this.contentHeight=n.contentHeight,this.enablePager=n.enablePager,this.pagerOverlay=n.pagerOverlay},scrollTo:function(e,t){this.page=e,this.pane.transitionTo(-e*this.pane.size().width,p.easeOutExpo,t)},paneMoved:function(e,t,n,i){var r,o,a=this,s=a.pane,l=s.size().width*a.pageSize,c=C,u=t?p.easeOutBack:p.easeOutExpo;e===N?c=k:e===U&&(c=A),o=c(s.offset()/l),r=S(a.minSnap,T(-o*l,a.maxSnap)),o!=a.page&&n&&n({currentPage:a.page,nextPage:o})&&(r=-a.page*s.size().width),s.transitionTo(r,u,i)},updatePage:function(){var e=this.pane,t=C(e.offset()/e.size().width);return t!=this.page?(this.page=t,!0):!1},forcePageUpdate:function(){return this.updatePage()},resizeTo:function(e){var t,n,i=this.pane,r=e.width;this.pageElements.width(r),"100%"===this.contentHeight&&(t=this.element.parent().height(),this.enablePager===!0&&(n=this.element.parent().find("ol.km-pages"),!this.pagerOverlay&&n.length&&(t-=n.outerHeight(!0))),this.element.css("height",t),this.pageElements.css("height",t)),i.updateDimension(),this._paged||(this.page=A(i.offset()/r)),this.scrollTo(this.page,!0),this.pageCount=k(i.total()/r),this.minSnap=-(this.pageCount-1)*r,this.maxSnap=0},_getPages:function(){this.pageElements=this.element.find(u.roleSelector("page")),this._paged=this.pageElements.length>0}}),u.mobile.ui.ScrollViewContent=a,s=u.Observable.extend({init:function(e,t,n){var i=this;u.Observable.fn.init.call(this),i.element=e,i.pane=t,i.options=n,i._templates(),i.page=n.page||0,i.pages=[],i._initPages(),i.resizeTo(i.pane.size()),i.pane.dimension.forceEnabled()},setDataSource:function(e){this.dataSource=_.create(e),this._buffer(),this._pendingPageRefresh=!1,this._pendingWidgetRefresh=!1},_viewShow:function(){var e=this;e._pendingWidgetRefresh&&(setTimeout(function(){e._resetPages()},0),e._pendingWidgetRefresh=!1)},_buffer:function(){var e=this.options.itemsPerPage;this.buffer&&this.buffer.destroy(),this.buffer=e>1?new b(this.dataSource,e):new y(this.dataSource,3*e),this._resizeProxy=f(this,"_onResize"),this._resetProxy=f(this,"_onReset"),this._endReachedProxy=f(this,"_onEndReached"),this.buffer.bind({resize:this._resizeProxy,reset:this._resetProxy,endreached:this._endReachedProxy})},_templates:function(){var e=this.options.template,t=this.options.emptyTemplate,n={},i={};typeof e===z&&(n.template=e,e="#=this.template(data)#"),this.template=f(u.template(e),n),typeof t===z&&(i.emptyTemplate=t,t="#=this.emptyTemplate(data)#"),this.emptyTemplate=f(u.template(t),i)},_initPages:function(){var e,t,n=this.pages,i=this.element;for(t=0;B>t;t++)e=new l(i),n.push(e);this.pane.updateDimension()},resizeTo:function(e){var t,n,i,r=this.pages,o=this.pane;for(t=0;r.length>t;t++)r[t].setWidth(e.width);"auto"===this.options.contentHeight?this.element.css("height",this.pages[1].element.height()):"100%"===this.options.contentHeight&&(n=this.element.parent().height(),this.options.enablePager===!0&&(i=this.element.parent().find("ol.km-pages"),!this.options.pagerOverlay&&i.length&&(n-=i.outerHeight(!0))),this.element.css("height",n),r[0].element.css("height",n),r[1].element.css("height",n),r[2].element.css("height",n)),o.updateDimension(),this._repositionPages(),this.width=e.width},scrollTo:function(e){var t,n=this.buffer;n.syncDataSource(),t=n.at(e),t&&(this._updatePagesContent(e),this.page=e)},paneMoved:function(e,t,n,i){var r,o=this,a=o.pane,s=a.size().width,l=a.offset(),c=Math.abs(l)>=s/3,d=t?u.effects.Transition.easeOutBack:u.effects.Transition.easeOutExpo,h=o.page+2>o.buffer.total(),f=0;e===U?0!==o.page&&(f=-1):e!==N||h?l>0&&c&&!h?f=1:0>l&&c&&0!==o.page&&(f=-1):f=1,r=o.page,f&&(r=f>0?r+1:r-1),n&&n({currentPage:o.page,nextPage:r})&&(f=0),0===f?o._cancelMove(d,i):-1===f?o._moveBackward(i):1===f&&o._moveForward(i)},updatePage:function(){var e=this.pages;return 0===this.pane.offset()?!1:(this.pane.offset()>0?(e.push(this.pages.shift()),this.page++,this.setPageContent(e[2],this.page+1)):(e.unshift(this.pages.pop()),this.page--,this.setPageContent(e[0],this.page-1)),this._repositionPages(),this._resetMovable(),!0)},forcePageUpdate:function(){var e=this.pane.offset(),t=3*this.pane.size().width/4;return x(e)>t?this.updatePage():!1},_resetMovable:function(){this.pane.moveTo(0)},_moveForward:function(e){this.pane.transitionTo(-this.width,u.effects.Transition.easeOutExpo,e)},_moveBackward:function(e){this.pane.transitionTo(this.width,u.effects.Transition.easeOutExpo,e)},_cancelMove:function(e,t){this.pane.transitionTo(0,e,t)},_resetPages:function(){this.page=this.options.page||0,this._updatePagesContent(this.page),this._repositionPages(),this.trigger("reset")},_onResize:function(){this.pageCount=k(this.dataSource.total()/this.options.itemsPerPage),this._pendingPageRefresh&&(this._updatePagesContent(this.page),this._pendingPageRefresh=!1),this.trigger("resize")},_onReset:function(){this.pageCount=k(this.dataSource.total()/this.options.itemsPerPage),this._resetPages()},_onEndReached:function(){this._pendingPageRefresh=!0},_repositionPages:function(){var e=this.pages;e[0].position(L),e[1].position(O),e[2].position(H)},_updatePagesContent:function(e){var t=this.pages,n=e||0;this.setPageContent(t[0],n-1),this.setPageContent(t[1],n),this.setPageContent(t[2],n+1)},setPageContent:function(t,n){var i=this.buffer,r=this.template,o=this.emptyTemplate,a=null;n>=0&&(a=i.at(n),e.isArray(a)&&!a.length&&(a=null)),this.trigger(F,{item:t.element}),t.content(null!==a?r(a):o({})),u.mobile.init(t.element),this.trigger(R,{item:t.element,data:a,ns:u.mobile.ui})}}),u.mobile.ui.VirtualScrollViewContent=s,l=u.Class.extend({init:function(t){this.element=e("<div class='"+I+"'></div>"),this.width=t.width(),this.element.width(this.width),t.append(this.element)},content:function(e){this.element.html(e)},position:function(e){this.element.css("transform","translate3d("+this.width*e+"px, 0, 0)")},setWidth:function(e){this.width=e,this.element.width(e)}}),u.mobile.ui.VirtualPage=l,c=v.extend({init:function(e,t){var n,i,r,l=this;v.fn.init.call(l,e,t),t=l.options,e=l.element,u.stripWhitespace(e[0]),e.wrapInner("<div/>").addClass("km-scrollview"),this.options.enablePager&&(this.pager=new W(this),this.options.pagerOverlay&&e.addClass("km-scrollview-overlay")),l.inner=e.children().first(),l.page=0,l.inner.css("height",t.contentHeight),l.pane=new o(l.inner,{duration:this.options.duration,transitionEnd:f(this,"_transitionEnd"),dragStart:f(this,"_dragStart"),dragEnd:f(this,"_dragEnd"),change:f(this,E)}),l.bind("resize",function(){l.pane.refresh()}),l.page=t.page,n=0===this.inner.children().length,i=n?new s(l.inner,l.pane,t):new a(l.inner,l.pane,t),i.page=l.page,i.bind("reset",function(){this._pendingPageRefresh=!1,l._syncWithContent(),l.trigger(E,{pageCount:i.pageCount,page:i.page})}),i.bind("resize",function(){l.trigger(E,{pageCount:i.pageCount,page:i.page})}),i.bind(R,function(e){l.trigger(R,e),l.angular("compile",function(){return{elements:e.item,data:[{dataItem:e.data}]}})}),i.bind(F,function(e){l.angular("cleanup",function(){return{elements:e.item}})}),l._content=i,l.setDataSource(t.dataSource),r=l.container(),r.nullObject?(l.viewInit(),l.viewShow()):r.bind("show",f(this,"viewShow")).bind("init",f(this,"viewInit"))},options:{name:"ScrollView",page:0,duration:400,velocityThreshold:.8,contentHeight:"auto",pageSize:1,itemsPerPage:1,bounceVelocityThreshold:1.6,enablePager:!0,pagerOverlay:!1,autoBind:!0,template:"",emptyTemplate:""},events:[M,D,E],destroy:function(){v.fn.destroy.call(this),u.destroy(this.element)},viewInit:function(){this.options.autoBind&&this._content.scrollTo(this._content.page,!0)},viewShow:function(){this.pane.refresh()},refresh:function(){var e=this._content;e.resizeTo(this.pane.size()),this.page=e.page,this.trigger(E,{pageCount:e.pageCount,page:e.page})},content:function(e){this.element.children().first().html(e),this._content._getPages(),this.pane.refresh()},value:function(e){var n=this.dataSource;return e?(this.scrollTo(n.indexOf(e),!0),t):n.at(this.page)},scrollTo:function(e,t){this._content.scrollTo(e,t),this._syncWithContent()},prev:function(){var e=this,n=e.page-1;e._content instanceof s?e._content.paneMoved(U,t,function(t){return e.trigger(M,t)}):n>-1&&e.scrollTo(n)},next:function(){var e=this,n=e.page+1;e._content instanceof s?e._content.paneMoved(N,t,function(t){return e.trigger(M,t)}):e._content.pageCount>n&&e.scrollTo(n)},setDataSource:function(e){if(this._content instanceof s){var t=!e;this.dataSource=_.create(e),this._content.setDataSource(this.dataSource),this.options.autoBind&&!t&&this.dataSource.fetch()}},items:function(){return this.element.find("."+I)},_syncWithContent:function(){var e,n,i=this._content.pages,r=this._content.buffer;this.page=this._content.page,e=r?r.at(this.page):t,e instanceof Array||(e=[e]),n=i?i[1].element:t,this.trigger(D,{page:this.page,element:n,data:e})},_dragStart:function(){this._content.forcePageUpdate()&&this._syncWithContent()},_dragEnd:function(e){var t=this,n=e.x.velocity,i=this.options.velocityThreshold,r=V,o=x(n)>this.options.bounceVelocityThreshold;n>i?r=U:-i>n&&(r=N),this._content.paneMoved(r,o,function(e){return t.trigger(M,e)})},_transitionEnd:function(){this._content.updatePage()&&this._syncWithContent()}}),h.plugin(c)}(window.kendo.jQuery)}(),function(){!function(e,t){function n(e,t,n){return Math.max(t,Math.min(n,e))}var i=window.kendo,r=i.mobile.ui,o=r.Widget,a=i.support,s="change",l="km-switch-on",c="km-switch-off",u="margin-left",d="km-state-active",h="km-state-disabled",f="disabled",p=a.transitions.css+"transform",g=e.proxy,m='<span class="km-switch km-widget">        <span class="km-switch-wrapper"><span class="km-switch-background"></span></span>         <span class="km-switch-container"><span class="km-switch-handle" >             <span class="km-switch-label-on">{0}</span>             <span class="km-switch-label-off">{1}</span>         </span>     </span>',v=o.extend({init:function(t,n){var r,a=this;o.fn.init.call(a,t,n),n=a.options,a.wrapper=e(i.format(m,n.onLabel,n.offLabel)),a.handle=a.wrapper.find(".km-switch-handle"),a.background=a.wrapper.find(".km-switch-background"),a.wrapper.insertBefore(a.element).prepend(a.element),a._drag(),a.origin=parseInt(a.background.css(u),10),a.constrain=0,a.snapPoint=0,t=a.element[0],t.type="checkbox",a._animateBackground=!0,r=a.options.checked,null===r&&(r=t.checked),a.check(r),a.options.enable=a.options.enable&&!a.element.attr(f),a.enable(a.options.enable),a.refresh(),i.notify(a,i.mobile.ui)},refresh:function(){var e=this,t=e.handle.outerWidth(!0);e.width=e.wrapper.width(),e.constrain=e.width-t,e.snapPoint=e.constrain/2,"number"!=typeof e.origin&&(e.origin=parseInt(e.background.css(u),10)),e.background.data("origin",e.origin),e.check(e.element[0].checked)},events:[s],options:{name:"Switch",onLabel:"on",offLabel:"off",checked:null,enable:!0},check:function(e){var n=this,i=n.element[0];return e===t?i.checked:(n._position(e?n.constrain:0),i.checked=e,n.wrapper.toggleClass(l,e).toggleClass(c,!e),t)},value:function(){return this.check.apply(this,arguments)},destroy:function(){o.fn.destroy.call(this),this.userEvents.destroy()},toggle:function(){var e=this;e.check(!e.element[0].checked)},enable:function(e){var n=this.element,i=this.wrapper;t===e&&(e=!0),this.options.enable=e,e?n.removeAttr(f):n.attr(f,f),i.toggleClass(h,!e)},_resize:function(){this.refresh()},_move:function(e){var t=this;e.preventDefault(),t._position(n(t.position+e.x.delta,0,t.width-t.handle.outerWidth(!0)))},_position:function(e){var t=this;t.position=e,t.handle.css(p,"translatex("+e+"px)"),t._animateBackground&&t.background.css(u,t.origin+e)},_start:function(){this.options.enable?(this.userEvents.capture(),this.handle.addClass(d)):this.userEvents.cancel()},_stop:function(){var e=this;e.handle.removeClass(d),e._toggle(e.position>e.snapPoint)},_toggle:function(e){var t,n=this,r=n.handle,o=n.element[0],a=o.checked,u=i.mobile.application&&i.mobile.application.os.wp?100:200;n.wrapper.toggleClass(l,e).toggleClass(c,!e),n.position=t=e*n.constrain,n._animateBackground&&n.background.kendoStop(!0,!0).kendoAnimate({effects:"slideMargin",offset:t,reset:!0,reverse:!e,axis:"left",duration:u}),r.kendoStop(!0,!0).kendoAnimate({effects:"slideTo",duration:u,offset:t+"px,0",reset:!0,complete:function(){a!==e&&(o.checked=e,n.trigger(s,{checked:e}))}})},_drag:function(){var e=this;e.userEvents=new i.UserEvents(e.wrapper,{tap:function(){e.options.enable&&e._toggle(!e.element[0].checked)},start:g(e._start,e),move:g(e._move,e),end:g(e._stop,e)})}});r.plugin(v)}(window.kendo.jQuery)}(),function(){!function(e){function t(t){return e('<span class="km-badge">'+t+"</span>")}var n=window.kendo,i=n.mobile.ui,r=i.Widget,o="km-state-active",a="select",s=r.extend({init:function(t,n){var i=this;r.fn.init.call(i,t,n),i.container().bind("show",e.proxy(this,"refresh")),i.element.addClass("km-tabstrip").find("a").each(i._buildButton).eq(i.options.selectedIndex).addClass(o),i.element.on("down","a","_release")},events:[a],switchTo:function(t){var n,i,r=this.element.find("a"),o=0,a=r.length;if(!isNaN(t))return this._setActiveItem(r.eq(t)),!0;for(;a>o;o++)if(n=r[o],i=n.href.replace(/(\#.+)(\?.+)$/,"$1"),-1!==i.indexOf(t,i.length-t.length))return this._setActiveItem(e(n)),!0;return!1},switchByFullUrl:function(e){var t;t=this.element.find("a[href$='"+e+"']"),this._setActiveItem(t)},clear:function(){this.currentItem().removeClass(o)},currentItem:function(){return this.element.children("."+o)},badge:function(n,i){var r,o=this.element;return isNaN(n)||(n=o.children().get(n)),n=o.find(n),r=e(n.find(".km-badge")[0]||t(i).insertAfter(n.children(".km-icon"))),i||0===i?(r.html(i),this):i===!1?(r.empty().remove(),this):r.html()},_release:function(t){if(!(t.which>1)){var n=this,i=e(t.currentTarget);i[0]!==n.currentItem()[0]&&(n.trigger(a,{item:i})?t.preventDefault():n._setActiveItem(i))}},_setActiveItem:function(e){e[0]&&(this.clear(),e.addClass(o))},_buildButton:function(){var i=e(this),r=n.attrValue(i,"icon"),o=n.attrValue(i,"badge"),a=i.find("img"),s=e('<span class="km-icon"/>');i.addClass("km-button").attr(n.attr("role"),"tab").contents().not(a).wrapAll('<span class="km-text"/>'),a[0]?a.addClass("km-image").prependTo(i):(i.prepend(s),r&&(s.addClass("km-"+r),(o||0===o)&&t(o).insertAfter(s)))},refresh:function(e){var t=e.view.id;t&&!this.switchTo(e.view.id)&&this.switchTo(t)},options:{name:"TabStrip",selectedIndex:0,enable:!0}});i.plugin(s)}(window.kendo.jQuery)}(),function(){!function(e,t,n){"use strict";function i(e){var t=C;try{return C=function(e){return e()},e()}finally{C=t}}function r(t,i,r,c,u,m){function v(){var n,m,v,_,y,k,C;return r.kRebind&&(n=e(e(i)[0].cloneNode(!0))),S=o(t,i,r,c,x).options,i.is("select")&&!function(t){if(t.length>0){var n=e(t[0]);!/\S/.test(n.text())&&/^\?/.test(n.val())&&n.remove()}}(i[0].options),m=x.call(i,A=S).data(c),l(m,t,r,c,u),t.$emit("kendoWidgetCreated",m),v=f(t,m),r.kRebind&&g(m,t,i,n,r.kRebind,v,r),r.kNgDisabled&&(_=r.kNgDisabled,y=t.$eval(_),y&&m.enable(!y),a(m,t,i,_)),r.kNgReadonly&&(k=r.kNgReadonly,C=t.$eval(k),C&&m.readonly(C),s(m,t,i,k)),r.kNgModel&&h(m,t,r.kNgModel),b&&d(m,t,i,b,w),m&&p(m,i),m}var _,y,b,w,x,k,S,T,D,M,E,P,I,z;if(!(i instanceof jQuery))throw Error("The Kendo UI directives require jQuery to be available before AngularJS. Please include jquery before angular in the document.");if(_=r.kNgDelay,y=t.$eval(_),m=m||[],b=m[0],w=m[1],x=e(i)[c],!x)return window.console.error("Could not find: "+c),null;if(k=o(t,i,r,c,x),S=k.options,k.unresolved.length){for(T=[],D=0,M=k.unresolved.length;M>D;D++)E=k.unresolved[D],P=e.Deferred(function(e){var i=t.$watch(E.path,function(t){t!==n&&(i(),e.resolve())})}).promise(),T.push(P);return e.when.apply(null,T).then(v),n}return _&&!y?(I=t.$root||t,z=function(){var e=t.$watch(_,function(t){t!==n&&(e(),i.removeAttr(r.$attr.kNgDelay),_=null,C(v))})},/^\$(digest|apply)$/.test(I.$$phase)?z():t.$apply(z),n):v()}function o(i,r,o,a,s){function l(e,r){var o=t.copy(i.$eval(r));o===n?p.push({option:e,path:r}):c[e]=o}var c,u,d,h,f=a.replace(/^kendo/,""),p=[],g=o.kOptions||o.options,m=i.$eval(g);return g&&m===n&&p.push({option:"options",path:g}),c=t.extend({},o.defaultOptions,m),u=s.widget.prototype.options,d=s.widget.prototype.events,e.each(o,function(e,t){var n,i,r,o;"source"!==e&&"kDataSource"!==e&&"kScopeField"!==e&&"scopeField"!==e&&(n="data"+e.charAt(0).toUpperCase()+e.slice(1),0===e.indexOf("on")&&(i=e.replace(/^on./,function(e){return e.charAt(2).toLowerCase()}),d.indexOf(i)>-1&&(c[i]=t)),u.hasOwnProperty(n)?l(n,t):u.hasOwnProperty(e)&&!E[e]?l(e,t):M[e]||(r=e.match(/^k(On)?([A-Z].*)/),r&&(o=r[2].charAt(0).toLowerCase()+r[2].slice(1),r[1]&&"kOnLabel"!=e?c[o]=t:("kOnLabel"==e&&(o="onLabel"),l(o,t)))))}),h=o.kDataSource||o.source,h&&(c.dataSource=D(i,r,f,h)),c.$angular=[i],{options:c,unresolved:p}}function a(e,t,i,r){return kendo.ui.PanelBar&&e instanceof kendo.ui.PanelBar||kendo.ui.Menu&&e instanceof kendo.ui.Menu?(T.warn("k-ng-disabled specified on a widget that does not have the enable() method: "+e.options.name),n):(t.$watch(r,function(t,n){t!=n&&e.enable(!t)}),n)}function s(e,t,i,r){return"function"!=typeof e.readonly?(T.warn("k-ng-readonly specified on a widget that does not have the readonly() method: "+e.options.name),n):(t.$watch(r,function(t,n){t!=n&&e.readonly(t)}),n)}function l(e,t,n,i,r){if(n[r]){var o=k(n[r]).assign;if(!o)throw Error(r+" attribute used but expression in it is not assignable: "+n[i]);o(t,e)}}function c(e){return/checkbox|radio/i.test(e.attr("type"))?e.prop("checked"):e.val()}function u(e){return P.test(e[0].tagName)}function d(e,t,i,r,o){var a,s,l,d;e.value&&(a=u(i)?function(){return c(i)}:function(){return e.value()},r.$render=function(){var i=r.$viewValue;i===n&&(i=r.$modelValue),i===n&&(i=null),setTimeout(function(){if(e){var n=t[e.element.attr("k-ng-model")];n&&(i=n),e.value(i)}},0)},s=!1,u(i)&&i.on("change",function(){s=!0}),l=function(e){return function(){var n;s||(e&&o&&(n=o.$pristine),r.$setViewValue(a()),e&&(r.$setPristine(),n&&o.$setPristine()),_(t))}},e.first("change",l(!1)),kendo.ui.AutoComplete&&e instanceof kendo.ui.AutoComplete||e.first("dataBound",l(!0)),d=a(),isNaN(r.$viewValue)||d==r.$viewValue||(r.$isEmpty(r.$viewValue)?null!=d&&""!==d&&d!=r.$viewValue&&r.$setViewValue(d):e.value(r.$viewValue)),r.$setPristine())}function h(t,i,r){var o,a,s,l,c,u,d,h,f;return"function"!=typeof t.value?(T.warn("k-ng-model specified on a widget that does not have the value() method: "+t.options.name),n):(o=e(t.element).parents("form"),a=i[o.attr("name")],s=k(r),l=s.assign,c=!1,u=s(i),t.$angular_setLogicValue(u),d=kendo.ui.MultiSelect&&t instanceof kendo.ui.MultiSelect,d&&(h=u.length),f=function(e){if(e===n&&(e=null),d){if(e==u&&e.length==h)return}else if(e==u)return;c||(u=e,d&&(h=u.length),t.$angular_setLogicValue(e))},d?i.$watchCollection(r,f):i.$watch(r,f),t.first("change",function(){c=!0,a&&a.$pristine&&a.$setDirty(),_(i,function(){l(i,t.$angular_getLogicValue())}),c=!1}),n)}function f(e,t){var n=e.$on("$destroy",function(){n(),t&&(t.element&&(t=v(t.element),t&&t.destroy()),t=null)});return n}function p(t,n){function i(){a.disconnect()}function r(){a.observe(e(n)[0],{attributes:!0})}var o,a;window.MutationObserver&&t.wrapper&&(o=[].slice.call(e(n)[0].classList),a=new MutationObserver(function(n){i(),t&&(n.forEach(function(n){var i,r=e(t.wrapper)[0];switch(n.attributeName){case"class":i=[].slice.call(n.target.classList),i.forEach(function(e){o.indexOf(e)<0&&(r.classList.add(e),kendo.ui.ComboBox&&t instanceof kendo.ui.ComboBox&&t.input[0].classList.add(e))}),o.forEach(function(e){i.indexOf(e)<0&&(r.classList.remove(e),kendo.ui.ComboBox&&t instanceof kendo.ui.ComboBox&&t.input[0].classList.remove(e))}),o=i;break;case"disabled":"function"!=typeof t.enable||t.element.attr("readonly")||t.enable(!e(n.target).attr("disabled"));break;case"readonly":"function"!=typeof t.readonly||t.element.attr("disabled")||t.readonly(!!e(n.target).attr("readonly"))}}),r())}),r(),t.first("destroy",i))}function g(t,n,i,r,o,a,s){var l=n.$watch(o,function(o,c){var u,d,h,f;t._muteRebind||o===c||(l(),
u=B[t.options.name],u&&u.forEach(function(t){var i=n.$eval(s["k"+t]);i&&r.append(e(i).attr(kendo.toHyphens("k"+t),""))}),d=e(t.wrapper)[0],h=e(t.element)[0],f=i.injector().get("$compile"),t._destroy(),a&&a(),t=null,h&&(d&&d.parentNode.replaceChild(h,d),e(i).replaceWith(r)),f(r)(n))},!0);_(n)}function m(e,n){function i(e,t){w.directive(e,["directiveFactory",function(n){return n.create(t,e)}])}var r,o,a,s,l=n?"Mobile":"";l+=e.fn.options.name,r=l,o="kendo"+l.charAt(0)+l.substr(1).toLowerCase(),l="kendo"+l,a=l.replace(/([A-Z])/g,"-$1"),-1==z.indexOf(l.replace("kendo",""))&&(s=l===o?[l]:[l,o],t.forEach(s,function(e){w.directive(e,function(){return{restrict:"E",replace:!0,template:function(e,t){var n=I[r]||"div",i=t.kScopeField||t.scopeField;return"<"+n+" "+a+(i?'="'+i+'"':"")+">"+e.html()+"</"+n+">"}}})})),R.indexOf(l.replace("kendo",""))>-1||(i(l,l),o!=l&&i(o,l))}function v(t){return t=e(t),kendo.widgetInstance(t,kendo.ui)||kendo.widgetInstance(t,kendo.mobile.ui)||kendo.widgetInstance(t,kendo.dataviz.ui)}function _(e,t){var n=e.$root||e,i=/^\$(digest|apply)$/.test(n.$$phase);t?i?t():n.$apply(t):i||n.$digest()}function y(t,n){t.$destroy(),n&&e(n).removeData("$scope").removeData("$$kendoScope").removeData("$isolateScope").removeData("$isolateScopeNoTemplate").removeClass("ng-scope")}function b(n,i,r){var o,a,s;if(e.isArray(n))return t.forEach(n,function(e){b(e,i,r)});if("string"==typeof n){for(o=n.split("."),a=kendo;a&&o.length>0;)a=a[o.shift()];if(!a)return F.push([n,i,r]),!1;n=a.prototype}return s=n[i],n[i]=function(){var e=this,t=arguments;return r.apply({self:e,next:function(){return s.apply(e,arguments.length>0?arguments:t)}},t)},!0}var w,x,k,C,S,T,A,D,M,E,P,I,z,R,F,B;t&&t.injector&&(w=t.module("kendo.directives",[]),x=t.injector(["ng"]),k=x.get("$parse"),C=x.get("$timeout"),T=x.get("$log"),D=function(){var e={TreeList:"TreeListDataSource",TreeView:"HierarchicalDataSource",Scheduler:"SchedulerDataSource",PanelBar:"$PLAIN",Menu:"$PLAIN",ContextMenu:"$PLAIN"},t=function(e,t){return"$PLAIN"==t?e:kendo.data[t].create(e)};return function(n,i,r,o){var a=e[r]||"DataSource",s=n.$eval(o),l=t(s,a);return n.$watch(o,function(e){var n,r=v(i);r&&"function"==typeof r.setDataSource&&e!==s&&(n=t(e,a),r.setDataSource(n),s=e)}),l}}(),M={kDataSource:!0,kOptions:!0,kRebind:!0,kNgModel:!0,kNgDelay:!0},E={name:!0,title:!0,style:!0},P=/^(input|select|textarea)$/i,w.factory("directiveFactory",["$compile",function(t){var n,i,o=!1;return S=t,i=function(t,i){return{restrict:"AC",require:["?ngModel","^?form"],scope:!1,controller:["$scope","$attrs","$element",function(e,t){var n=this;n.template=function(e,n){t[e]=kendo.stringify(n)},e.$on("$destroy",function(){n.template=null,n=null})}],link:function(a,s,l,c){var u,d=e(s),h=t.replace(/([A-Z])/g,"-$1");d.attr(h,d.attr("data-"+h)),d[0].removeAttribute("data-"+h),u=r(a,s,l,t,i,c),u&&(n&&clearTimeout(n),n=setTimeout(function(){a.$emit("kendoRendered"),o||(o=!0,e("form").each(function(){var t=e(this).controller("form");t&&t.$setPristine()}))}))}}},{create:i}}]),I={Editor:"textarea",NumericTextBox:"input",DatePicker:"input",DateTimePicker:"input",TimePicker:"input",AutoComplete:"input",ColorPicker:"input",MaskedTextBox:"input",MultiSelect:"input",Upload:"input",Validator:"form",Button:"button",MobileButton:"a",MobileBackButton:"a",MobileDetailButton:"a",ListView:"ul",MobileListView:"ul",TreeView:"ul",Menu:"ul",ContextMenu:"ul",ActionSheet:"ul"},z=["MobileView","MobileDrawer","MobileLayout","MobileSplitView","MobilePane","MobileModalView"],R=["MobileApplication","MobileView","MobileModalView","MobileLayout","MobileActionSheet","MobileDrawer","MobileSplitView","MobilePane","MobileScrollView","MobilePopOver"],t.forEach(["MobileNavBar","MobileButton","MobileBackButton","MobileDetailButton","MobileTabStrip","MobileScrollView","MobileScroller"],function(e){R.push(e),e="kendo"+e,w.directive(e,function(){return{restrict:"A",link:function(t,n,i){r(t,n,i,e,e)}}})}),F=[],kendo.onWidgetRegistered(function(t){F=e.grep(F,function(e){return!b.apply(null,e)}),m(t.widget,"Mobile"==t.prefix)}),b(["ui.Widget","mobile.ui.Widget"],"angular",function(r,o){var a,s=this.self;return"init"==r?(!o&&A&&(o=A),A=null,o&&o.$angular&&(s.$angular_scope=o.$angular[0],s.$angular_init(s.element,o)),n):(a=s.$angular_scope,a&&i(function(){var i,l,c=o(),u=c.elements,d=c.data;if(u.length>0)switch(r){case"cleanup":t.forEach(u,function(t){var n=e(t).data("$$kendoScope");n&&n!==a&&n.$$kendoScope&&y(n,t)});break;case"compile":i=s.element.injector(),l=i?i.get("$compile"):S,t.forEach(u,function(t,i){var r,o;c.scopeFrom?r=c.scopeFrom:(o=d&&d[i],o!==n?(r=e.extend(a.$new(),o),r.$$kendoScope=!0):r=a),e(t).data("$$kendoScope",r),l(t)(r)}),_(a)}}),n)}),b("ui.Widget","$angular_getLogicValue",function(){return this.self.value()}),b("ui.Widget","$angular_setLogicValue",function(e){this.self.value(e)}),b("ui.Select","$angular_getLogicValue",function(){var e=this.self.dataItem(),t=this.self.options.dataValueField;return e?this.self.options.valuePrimitive?t?e[t]:e:e.toJSON():null}),b("ui.Select","$angular_setLogicValue",function(e){var t=this.self,i=t.options,r=i.dataValueField,o=i.text||"";e===n&&(e=""),r&&!i.valuePrimitive&&e&&(o=e[i.dataTextField]||"",e=e[r||i.dataTextField]),t.options.autoBind!==!1||t.listView.isBound()?t.value(e):!o&&e&&i.valuePrimitive?t.value(e):t._preselect(e,o)}),b("ui.MultiSelect","$angular_getLogicValue",function(){var t=this.self.dataItems().slice(0),n=this.self.options.dataValueField;return n&&this.self.options.valuePrimitive&&(t=e.map(t,function(e){return e[n]})),t}),b("ui.MultiSelect","$angular_setLogicValue",function(t){var n,i,r,o;null==t&&(t=[]),n=this.self,i=n.options,r=i.dataValueField,o=t,r&&!i.valuePrimitive&&(t=e.map(t,function(e){return e[r]})),i.autoBind!==!1||i.valuePrimitive||n.listView.isBound()?n.value(t):n._preselect(o,t)}),b("ui.AutoComplete","$angular_getLogicValue",function(){var e,t,n,i,r,o=this.self.options,a=this.self.value().split(o.separator),s=o.valuePrimitive,l=this.self.dataSource.data(),c=[];for(e=0,t=l.length;t>e;e++)for(n=l[e],i=o.dataTextField?n[o.dataTextField]:n,r=0;a.length>r;r++)if(i===a[r]){c.push(s?i:n.toJSON());break}return c}),b("ui.AutoComplete","$angular_setLogicValue",function(t){null==t&&(t=[]);var n=this.self,i=n.options.dataTextField;i&&!n.options.valuePrimitive&&(t=e.map(t,function(e){return e[i]})),n.value(t)}),b("ui.Widget","$angular_init",function(t,n){var i,r,o,a,s=this.self;if(n&&!e.isArray(n))for(i=s.$angular_scope,r=s.events.length;--r>=0;)o=s.events[r],a=n[o],a&&"string"==typeof a&&(n[o]=s.$angular_makeEventHandler(o,i,a))}),b("ui.Widget","$angular_makeEventHandler",function(e,t,n){return n=k(n),function(e){_(t,function(){n(t,{kendoEvent:e})})}}),b(["ui.Grid","ui.ListView","ui.TreeView"],"$angular_makeEventHandler",function(e,n,i){return"change"!=e?this.next():(i=k(i),function(e){var r,o,a,s,l,c,u,d,h,f=e.sender,p=f.options,g={kendoEvent:e};for(t.isString(p.selectable)&&(r=-1!==p.selectable.indexOf("cell"),o=-1!==p.selectable.indexOf("multiple")),a=g.selected=this.select(),s=g.data=[],l=g.columns=[],u=0;a.length>u;u++)d=r?a[u].parentNode:a[u],h=f.dataItem(d),r?(t.element.inArray(h,s)<0&&s.push(h),c=t.element(a[u]).index(),t.element.inArray(c,l)<0&&l.push(c)):s.push(h);o||(g.dataItem=g.data=s[0],g.selected=a[0]),_(n,function(){i(n,g)})})}),b("ui.Grid","$angular_init",function(i,r){if(this.next(),r.columns){var o=e.extend({},kendo.Template,r.templateSettings);t.forEach(r.columns,function(e){!e.field||e.template||e.format||e.values||e.encoded!==n&&!e.encoded||(e.template="<span ng-bind='"+kendo.expr(e.field,"dataItem")+"'>#: "+kendo.expr(e.field,o.paramName)+"#</span>")})}}),b("mobile.ui.ButtonGroup","value",function(e){var t=this.self;return null!=e&&(t.select(t.element.children("li.km-button").eq(e)),t.trigger("change"),t.trigger("select",{index:t.selectedIndex})),t.selectedIndex}),b("mobile.ui.ButtonGroup","_select",function(){this.next(),this.self.trigger("change")}),w.directive("kendoMobileApplication",function(){return{terminal:!0,link:function(e,t,n){r(e,t,n,"kendoMobileApplication","kendoMobileApplication")}}}).directive("kendoMobileView",function(){return{scope:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,n._instance=r(e,t,n,"kendoMobileView","kendoMobileView")},post:function(e,t,n){n._instance._layout(),n._instance._scroller()}}}}).directive("kendoMobileDrawer",function(){return{scope:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,n._instance=r(e,t,n,"kendoMobileDrawer","kendoMobileDrawer")},post:function(e,t,n){n._instance._layout(),n._instance._scroller()}}}}).directive("kendoMobileModalView",function(){return{scope:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,n._instance=r(e,t,n,"kendoMobileModalView","kendoMobileModalView")},post:function(e,t,n){n._instance._layout(),n._instance._scroller()}}}}).directive("kendoMobileSplitView",function(){return{terminal:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,n._instance=r(e,t,n,"kendoMobileSplitView","kendoMobileSplitView")},post:function(e,t,n){n._instance._layout()}}}}).directive("kendoMobilePane",function(){return{terminal:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,r(e,t,n,"kendoMobilePane","kendoMobilePane")}}}}).directive("kendoMobileLayout",function(){return{link:{pre:function(e,t,n){r(e,t,n,"kendoMobileLayout","kendoMobileLayout")}}}}).directive("kendoMobileActionSheet",function(){return{restrict:"A",link:function(t,n,i){n.find("a[k-action]").each(function(){e(this).attr("data-"+kendo.ns+"action",e(this).attr("k-action"))}),r(t,n,i,"kendoMobileActionSheet","kendoMobileActionSheet")}}}).directive("kendoMobilePopOver",function(){return{terminal:!0,link:{pre:function(e,t,n){n.defaultOptions=e.viewOptions,r(e,t,n,"kendoMobilePopOver","kendoMobilePopOver")}}}}).directive("kendoViewTitle",function(){return{restrict:"E",replace:!0,template:function(e){return"<span data-"+kendo.ns+"role='view-title'>"+e.html()+"</span>"}}}).directive("kendoMobileHeader",function(){return{restrict:"E",link:function(e,t){t.addClass("km-header").attr("data-role","header")}}}).directive("kendoMobileFooter",function(){return{restrict:"E",link:function(e,t){t.addClass("km-footer").attr("data-role","footer")}}}).directive("kendoMobileScrollViewPage",function(){return{restrict:"E",replace:!0,template:function(e){return"<div data-"+kendo.ns+"role='page'>"+e.html()+"</div>"}}}),t.forEach(["align","icon","rel","transition","actionsheetContext"],function(e){var t="k"+e.slice(0,1).toUpperCase()+e.slice(1);w.directive(t,function(){return{restrict:"A",priority:2,link:function(n,i,r){i.attr(kendo.attr(kendo.toHyphens(e)),n.$eval(r[t]))}}})}),B={TreeMap:["Template"],MobileListView:["HeaderTemplate","Template"],MobileScrollView:["EmptyTemplate","Template"],Grid:["AltRowTemplate","DetailTemplate","RowTemplate"],ListView:["EditTemplate","Template","AltTemplate"],Pager:["SelectTemplate","LinkTemplate"],PivotGrid:["ColumnHeaderTemplate","DataCellTemplate","RowHeaderTemplate"],Scheduler:["AllDayEventTemplate","DateHeaderTemplate","EventTemplate","MajorTimeHeaderTemplate","MinorTimeHeaderTemplate"],TreeView:["Template"],Validator:["ErrorTemplate"]},function(){var e={};t.forEach(B,function(n,i){t.forEach(n,function(t){e[t]||(e[t]=[]),e[t].push("?^^kendo"+i)})}),t.forEach(e,function(e,t){var n="k"+t,i=kendo.toHyphens(n);w.directive(n,function(){return{restrict:"A",require:e,terminal:!0,compile:function(t,r){if(""===r[n]){t.removeAttr(i);var o=t[0].outerHTML;return function(r,a,s,l){for(var c;!c&&l.length;)c=l.shift();c?(c.template(n,o),t.remove()):T.warn(i+" without a matching parent widget found. It can be one of the following: "+e.join(", "))}}}}})})}())}(window.kendo.jQuery,window.angular)}(),function(){!function(e,t,n){function i(e,t){var i=e.getAttribute(t);return null===i?i=n:"null"===i?i=null:"true"===i?i=!0:"false"===i?i=!1:p.test(i)?i=parseFloat(i):h.test(i)&&!f.test(i)&&(i=Function("return ("+i+")")()),i}function r(e,t){var n={};return Object.keys(t).concat("dataSource").forEach(function(t){e.hasAttribute(kendo.toHyphens(t))&&(n[t]=i(e,kendo.toHyphens(t)))}),n}function o(e){var t={};return Object.keys(e).forEach(function(n){"_"!=n[0]&&(t[n]=e[n])}),t}function a(e,t){var n=document.createEvent("CustomEvent");n.initCustomEvent(e,!1,!0,o(t)),this.dispatchEvent(n),n.defaultPrevented&&t.preventDefault()}function s(e,t){var n,i=Object.keys(t);for(n=0;i.length>=n;n++)if("function"==typeof t[i[n]])e[i[n]]||(e[i[n]]=t[i[n]].bind(e.widget));else{if("options"===i[n])continue;e[i[n]]=e[i[n]]||t[i[n]]}}function l(t,n){var i=n.prototype.options,o=Object.create(HTMLElement.prototype);Object.defineProperty(o,"options",{get:function(){return this.widget.options},set:function(n){var i,r,o,a=this.widget;n=e.extend(!0,{},a.options,n),i=e(a.wrapper)[0],r=e(a.element)[0],a._destroy(),o=document.createElement(c[t]||"div"),i&&r&&(i.parentNode.replaceChild(r,i),e(r).replaceWith(o)),a.value&&(n.value=a.value()),a.init(o,n),this.bindEvents()}}),o.bindEvents=function(){n.prototype.events.forEach(function(e){this.widget.bind(e,a.bind(this,e)),this.hasAttribute(u+e)&&this.bind(e,function(t){window[this.getAttribute(u+e)].call(this,t)}.bind(this))}.bind(this))},o.attachedCallback=function(){var o,a=this,l=document.createElement(c[t]||"div");e(l).append(a.childNodes),e(l).attr("class",e(a).attr("class")),e(l).attr("style",e(a).attr("style")),a.appendChild(l),a.widget=new n(l,r(a,i)),o=a.widget;do s(a,o);while(o=Object.getPrototypeOf(o));this.bindEvents()},o.detachedCallback=function(){kendo.destroy(this.element)},kendo.webComponents.push("kendo-"+t),document.registerElement("kendo-"+t,{prototype:o})}var c,u,d,h,f,p;kendo.support.customElements&&!kendo.webComponents.length&&(!t||1!=t.version.major&&!t.injector)&&(c={editor:"textarea",numerictextbox:"input",datepicker:"input",datetimepicker:"input",timepicker:"input",autocomplete:"input",colorpicker:"input",maskedtextbox:"input",dropdownlist:"select",multiselect:"select",upload:"input",validator:"form",button:"button",mobilebutton:"a",mobilebackbutton:"a",mobiledetailbutton:"a",listview:"ul",mobilelistview:"ul",treeview:"ul",menu:"ul",contextmenu:"ul",actionsheet:"ul"},u="on-",d=[],kendo.onWidgetRegistered(function(e){var t=e.prefix+e.widget.prototype.options.name.toLowerCase();-1===d.indexOf(t)&&(d.push(t),l(t,e.widget))}),h=/^\s*(?:\{(?:.|\r\n|\n)*\}|\[(?:.|\r\n|\n)*\])\s*$/,f=/^\{(\d+)(:[^\}]+)?\}|^\[[A-Za-z_]*\]$/,p=/^(\+|-?)\d+(\.?)\d*$/)}(window.kendo.jQuery,window.angular)}(),function(){!function(e,t){var n,i;t&&t.register&&(n=this&&this.__decorate||function(e,t,n,i){if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)return Reflect.decorate(e,t,n,i);switch(arguments.length){case 2:return e.reduceRight(function(e,t){return t&&t(e)||e},t);case 3:return e.reduceRight(function(e,i){return void(i&&i(t,n))},void 0);case 4:return e.reduceRight(function(e,i){return i&&i(t,n,e)||e},i)}},i=this&&this.__metadata||function(e,t){return"object"==typeof Reflect&&"function"==typeof Reflect.metadata?Reflect.metadata(e,t):void 0},t.register("kendo/angular2",["angular2/angular2"],function(t){var r,o;return{setters:[function(e){r=e}],execute:function(){o=function(){function t(e,t){var n=this;this.elementRef=t,this.onChange=function(){},this.onTouched=function(){},this.element=t.nativeElement,this.element.addEventListener("change",function(){n.onChange(n.element.value())}),this.element.addEventListener("spin",function(){n.onChange(n.element.value())}),e.valueAccessor=this,this.cd=e,e.valueAccessor=this}return t.prototype.writeValue=function(e){this.element.value(e)},t.prototype.registerOnChange=function(e){this.onChange=e},t.prototype.registerOnTouched=function(e){this.onTouched=e},t=n([r.Directive({selector:e.webComponents.join(",")}),i("design:paramtypes",[r.NgControl,r.ElementRef])],t)}(),t("KendoValueAccessor",o)}}}))}(window.kendo,window.System)}();return window.kendo},typeof define=="function"&&define.amd?define:function(_,f){f()});
(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/base/store',['jquery', 'kendo-ui'], factory);
    } else {
        root.kb_store = factory(jQuery.kendo);
    }
}(function ($, kendo) {

    var store = {};
    // 基础视图模型
    store.viewModel = function (obj) {
        return kendo.observable(obj);
    };

    // 基础模型
    store.model = function (options) {
        if (typeof options === 'string') {
            options = {
                id: options || store.model.IDFIELD
            };
        }
        return kendo.data.Model.define(options);
    };
    store.model.IDFIELD = 'ID';

    store.source = function (options) {
        return new kendo.data.DataSource(options);
    };

    store.remoteSource = function (url) {
        var param = {
            pageSize: 20,
            page: 1,
            schema: {
                model: store.model(),
                // type: 'json',
                data: 'data',
                total: 'total'
            },
            transport: {
                read: {
                    url: url,
                    dataType: 'json'
                }
            }
        };
        return store.source(param);
    };

    store.remoteComplexSource = function (url) {
        return store.source({
            pageSize: 20,
            page: 1,
            serverPaging: true,
            serverSorting: true,
            serverFiltering: true,
            schema: {
                //type: 'json',
                model: store.model(),
                data: 'data',
                total: 'total'
            },
            transport: {
                read: {
                    url: url,
                    type: 'POST',
                    dataType: "json",
                    contentType: "application/json; charset=utf-8"
                },
                parameterMap: function (data, type) {
                    if (type === "read") {
                        return JSON.stringify(data);
                    }
                    return data;
                }
            }
        });
    };

    return store;

}));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/base/binders',['jquery', 'kendo-ui'], factory);
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

(function(root) {
define("kendo-ui-messages", ["kendo-ui"], function() {
  return (function() {
(function ($, undefined) {
/* FlatColorPicker messages */

if (kendo.ui.FlatColorPicker) {
kendo.ui.FlatColorPicker.prototype.options.messages =
$.extend(true, kendo.ui.FlatColorPicker.prototype.options.messages,{
  "apply": "确定",
  "cancel": "取消"
});
}

/* ColorPicker messages */

if (kendo.ui.ColorPicker) {
kendo.ui.ColorPicker.prototype.options.messages =
$.extend(true, kendo.ui.ColorPicker.prototype.options.messages,{
  "apply": "确定",
  "cancel": "取消"
});
}

/* ColumnMenu messages */

if (kendo.ui.ColumnMenu) {
kendo.ui.ColumnMenu.prototype.options.messages =
$.extend(true, kendo.ui.ColumnMenu.prototype.options.messages,{
  "sortAscending": "升序",
  "sortDescending": "降序",
  "filter": "过滤",
  "columns": "列",
  "done": "完成",
  "settings": "列设置",
  "lock": "锁定",
  "unlock": "解除锁定"
});
}

/* Editor messages */

if (kendo.ui.Editor) {
kendo.ui.Editor.prototype.options.messages =
$.extend(true, kendo.ui.Editor.prototype.options.messages,{
  "bold": "粗体",
  "italic": "斜体",
  "underline": "下划线",
  "strikethrough": "删除线",
  "superscript": "上标",
  "subscript": "下标",
  "justifyCenter": "居中",
  "justifyLeft": "左对齐",
  "justifyRight": "右对齐",
  "justifyFull": "两端对齐",
  "insertUnorderedList": "插入无序列表",
  "insertOrderedList": "插入有序列表",
  "indent": "增加缩进",
  "outdent": "减少缩进",
  "createLink": "插入链接",
  "unlink": "移除链接",
  "insertImage": "插入图片",
  "insertFile": "插入文件",
  "insertHtml": "插入 HTML",
  "viewHtml": "查看 HTML",
  "fontName": "选择字体",
  "fontNameInherit": "（继承的字体）",
  "fontSize": "选择字号",
  "fontSizeInherit": "（继承的字号）",
  "formatBlock": "格式化块",
  "formatting": "格式化",
  "foreColor": "颜色",
  "backColor": "背景色",
  "style": "风格",
  "emptyFolder": "文件夹为空",
  "uploadFile": "上传",
  "orderBy": "排序条件:",
  "orderBySize": "大小",
  "orderByName": "名字",
  "invalidFileType": "选中的文件 \"{0}\" 非法，支持的文件类型为 {1}。",
  "deleteFile": '您确定要删除 \"{0}\"?',
  "overwriteFile": '当前文件夹已存在文件名为 \"{0}\" 的文件，您确定要覆盖么？',
  "directoryNotFound": "此文件夹未找到",
  "imageWebAddress": "图片地址",
  "imageAltText": "替代文本",
  "imageWidth": "宽度 (px)",
  "imageHeight": "高度 (px)",
  "fileWebAddress": "文件地址",
  "fileTitle": "标题",
  "linkWebAddress": "链接地址",
  "linkText": "链接文字",
  "linkToolTip": "链接提示",
  "linkOpenInNewWindow": "在新窗口中打开",
  "dialogUpdate": "上传",
  "dialogInsert": "插入",
  "dialogButtonSeparator": "或",
  "dialogCancel": "取消",
  "createTable": "创建表格",
  "addColumnLeft": "左侧添加列",
  "addColumnRight": "右侧添加列",
  "addRowAbove": "上方添加行",
  "addRowBelow": "下方添加行",
  "deleteRow": "删除行",
  "deleteColumn": "删除列"
});
}

/* FileBrowser messages */

if (kendo.ui.FileBrowser) {
kendo.ui.FileBrowser.prototype.options.messages =
$.extend(true, kendo.ui.FileBrowser.prototype.options.messages,{
  "uploadFile": "上传",
  "orderBy": "排序条件",
  "orderByName": "名称",
  "orderBySize": "大小",
  "directoryNotFound": "此文件夹未找到",
  "emptyFolder": "文件夹为空",
  "deleteFile": '您确定要删除 \"{0}\"?',
  "invalidFileType": "选中的文件 \"{0}\" 非法，支持的文件类型为 {1}。",
  "overwriteFile": "当前文件夹已存在文件名为 \"{0}\" 的文件，您确定要覆盖么？",
  "dropFilesHere": "拖拽要上传的文件到此处",
  "search": "搜索"
});
}

/* FilterCell messages */

if (kendo.ui.FilterCell) {
kendo.ui.FilterCell.prototype.options.messages =
$.extend(true, kendo.ui.FilterCell.prototype.options.messages,{
  "isTrue": "为真",
  "isFalse": "为假",
  "filter": "过滤",
  "clear": "清除",
  "operator": "运算符"
});
}

/* FilterMenu messages */

if (kendo.ui.FilterMenu) {
kendo.ui.FilterMenu.prototype.options.messages =
$.extend(true, kendo.ui.FilterMenu.prototype.options.messages,{
  "info": "显示符合以下条件的行",
  "isTrue": "为真",
  "isFalse": "为假",
  "filter": "过滤",
  "clear": "清除",
  "and": "并且",
  "or": "或",
  "selectValue": "-选择-",
  "operator": "运算符",
  "value": "值",
  "cancel": "取消"
});
}

/* FilterMultiCheck messages */

if (kendo.ui.FilterMultiCheck) {
kendo.ui.FilterMultiCheck.prototype.options.messages =
$.extend(true, kendo.ui.FilterMultiCheck.prototype.options.messages,{
  "search": "搜索"
});
}

/* Filter cell operator messages */

if (kendo.ui.FilterCell) {
kendo.ui.FilterCell.prototype.options.operators =
$.extend(true, kendo.ui.FilterCell.prototype.options.operators,{
  "string": {
    "eq": "等于",
    "neq": "不等于",
    "startswith": "开头为",
    "contains": "包含",
    "doesnotcontain": "不包含",
    "endswith": "结尾为"
  },
  "number": {
    "eq": "等于",
    "neq": "不等于",
    "gte": "大于等于",
    "gt": "大于",
    "lte": "小于等于",
    "lt": "小于"
  },
  "date": {
    "eq": "等于",
    "neq": "不等于",
    "gte": "大于等于",
    "gt": "大于",
    "lte": "小于等于",
    "lt": "小于"
  },
  "enums": {
    "eq": "等于",
    "neq": "不等于"
  }
});
}


/* Filter menu operator messages */

if (kendo.ui.FilterMenu) {
kendo.ui.FilterMenu.prototype.options.operators =
$.extend(true, kendo.ui.FilterMenu.prototype.options.operators,{
  "string": {
    "eq": "等于",
    "neq": "不等于",
    "startswith": "开头为",
    "contains": "包含",
    "doesnotcontain": "不包含",
    "endswith": "结尾为"
  },
  "number": {
    "eq": "等于",
    "neq": "不等于",
    "gte": "大于等于",
    "gt": "大于",
    "lte": "小于等于",
    "lt": "小于"
  },
  "date": {
    "eq": "等于",
    "neq": "不等于",
    "gte": "大于等于",
    "gt": "大于",
    "lte": "小于等于",
    "lt": "小于"
  },
  "enums": {
    "eq": "等于",
    "neq": "不等于"
  }
});
}


/* Gantt messages */

if (kendo.ui.Gantt) {
kendo.ui.Gantt.prototype.options.messages =
$.extend(true, kendo.ui.Gantt.prototype.options.messages,{
  "views": {
    "day": "日",
    "week": "周",
    "month": "月"
  },
  "actions": {
    "append": "添加任务",
    "addChild": "添加子任务",
    "insertBefore": "添加到前面",
    "insertAfter": "添加到后面"
  }
});
}

/* Grid messages */

if (kendo.ui.Grid) {
kendo.ui.Grid.prototype.options.messages =
$.extend(true, kendo.ui.Grid.prototype.options.messages,{
  "commands": {
    "cancel": "取消",
    "canceledit": "取消",
    "create": "新增",
    "destroy": "删除",
    "edit": "编辑",
    "excel": "导出 Excel",
    "pdf": "导出 PDF",
    "save": "保存",
    "select": "选择",
    "update": "更新"
  },
  "editable": {
    "cancelDelete": "取消",
    "confirmation": "确定要删除吗？",
    "confirmDelete": "删除"
  },
  "noRecords": "没有可用的记录。"
});
}

/* Groupable messages */

if (kendo.ui.Groupable) {
kendo.ui.Groupable.prototype.options.messages =
$.extend(true, kendo.ui.Groupable.prototype.options.messages,{
  "empty": "拖拽列标题到此处按列组合显示"
});
}

/* ImageBrowser messages */

if (kendo.ui.ImageBrowser) {
kendo.ui.ImageBrowser.prototype.options.messages =
$.extend(true, kendo.ui.ImageBrowser.prototype.options.messages,{
  "uploadFile": "上传",
  "orderBy": "排序条件",
  "orderByName": "名称",
  "orderBySize": "大小",
  "directoryNotFound": "此文件夹未找到",
  "emptyFolder": "文件夹为空",
  "deleteFile": '您确定要删除 \"{0}\"?',
  "invalidFileType": "选中的文件 \"{0}\" 非法，支持的文件类型为 {1}。",
  "overwriteFile": "当前文件夹已存在文件名为 \"{0}\" 的文件，您确定要覆盖么？",
  "dropFilesHere": "拖拽要上传的文件到此处",
  "search": "搜索"
});
}

/* NumericTextBox messages */

if (kendo.ui.NumericTextBox) {
kendo.ui.NumericTextBox.prototype.options =
$.extend(true, kendo.ui.NumericTextBox.prototype.options,{
  "upArrowText": "增加",
  "downArrowText": "减少"
});
}

/* Pager messages */

if (kendo.ui.Pager) {
kendo.ui.Pager.prototype.options.messages =
$.extend(true, kendo.ui.Pager.prototype.options.messages,{
  "allPages": "All",
  "display": "显示条目 {0} - {1} 共 {2}",
  "empty": "没有可显示的记录。",
  "page": "页",
  "of": "共 {0}",
  "itemsPerPage": "每页",
  "first": "首页",
  "last": "末页",
  "next": "下一页",
  "previous": "上一页",
  "refresh": "刷新",
  "morePages": "更多..."
});
}

/* PivotGrid messages */

if (kendo.ui.PivotGrid) {
kendo.ui.PivotGrid.prototype.options.messages =
$.extend(true, kendo.ui.PivotGrid.prototype.options.messages,{
  "measureFields": "拖放数据字段于此",
  "columnFields": "拖放列字段于此",
  "rowFields": "拖放行字段于此"
});
}

/* RecurrenceEditor messages */

if (kendo.ui.RecurrenceEditor) {
kendo.ui.RecurrenceEditor.prototype.options.messages =
$.extend(true, kendo.ui.RecurrenceEditor.prototype.options.messages,{
  "frequencies": {
    "never": "从不",
    "hourly": "每小时",
    "daily": "每天",
    "weekly": "每周",
    "monthly": "每月",
    "yearly": "每年"
  },
  "hourly": {
    "repeatEvery": "重复周期: ",
    "interval": " 小时"
  },
  "daily": {
    "repeatEvery": "重复周期: ",
    "interval": " 天"
  },
  "weekly": {
    "interval": " 周",
    "repeatEvery": "重复周期: ",
    "repeatOn": "重复于:"
  },
  "monthly": {
    "repeatEvery": "重复周期: ",
    "repeatOn": "重复于:",
    "interval": " 月",
    "day": "日期"
  },
  "yearly": {
    "repeatEvery": "重复周期: ",
    "repeatOn": "重复于: ",
    "interval": " 年",
    "of": " 月份: "
  },
  "end": {
    "label": "截止时间:",
    "mobileLabel": "截止时间",
    "never": "从不",
    "after": "重复 ",
    "occurrence": " 次后",
    "on": "止于 "
  },
  "offsetPositions": {
    "first": "第一",
    "second": "第二",
    "third": "第三",
    "fourth": "第四",
    "last": "最后"
  },
  "weekdays": {
    "day": "天",
    "weekday": "工作日",
    "weekend": "周末"
  }
});
}


/* Scheduler messages */

if (kendo.ui.Scheduler) {
kendo.ui.Scheduler.prototype.options.messages =
$.extend(true, kendo.ui.Scheduler.prototype.options.messages,{
  "today": "今天",
  "save": "保存",
  "cancel": "取消",
  "destroy": "删除",
  "allDay": "整天",
  "date": "日期",
  "event": "事件",
  "time": "时间",
  "showFullDay": "显示整天",
  "showWorkDay": "显示营业时间",
  "deleteWindowTitle": "删除事件",
  "ariaSlotLabel": "选择从 {0:t} 到 {1:t}",
  "ariaEventLabel": "{0} on {1:D} at {2:t}",
  "editable": {
    "confirmation": "你确定你要删除这个活动？"
  },
  "views": {
    "day": "日",
    "week": "周",
    "workWeek": "工作日",
    "agenda": "日程",
    "month": "月"
  },
  "recurrenceMessages": {
    "deleteWindowTitle": "删除周期条目",
    "deleteWindowOccurrence": "删除当前事件",
    "deleteWindowSeries": "删除序列",
    "editWindowTitle": "修改周期条目",
    "editWindowOccurrence": "修改当前事件",
    "editWindowSeries": "修改序列",
    "deleteRecurring": "你想删除仅此事件发生或整个系列？",
    "editRecurring": "你想，仅编辑此次事件发生或整个系列？"
  },
  "editor": {
    "title": "标题",
    "start": "起始",
    "end": "终止",
    "allDayEvent": "全天事件",
    "description": "描述",
    "repeat": "重复",
    "timezone": " ",
    "startTimezone": "起始时区",
    "endTimezone": "终止时区",
    "separateTimezones": "使用独立的起始和终止时区",
    "timezoneEditorTitle": "时区",
    "timezoneEditorButton": "时区",
    "timezoneTitle": "选择时区",
    "noTimezone": "无",
    "editorTitle": "事件"
  }
});
}

/* Slider messages */

if (kendo.ui.Slider) {
kendo.ui.Slider.prototype.options =
$.extend(true, kendo.ui.Slider.prototype.options,{
  "increaseButtonTitle": "增加",
  "decreaseButtonTitle": "减少"
});
}

/* TreeView messages */

if (kendo.ui.TreeView) {
kendo.ui.TreeView.prototype.options.messages =
$.extend(true, kendo.ui.TreeView.prototype.options.messages,{
  "loading": "加载中...",
  "requestFailed": "加载失败",
  "retry": "重试"
});
}

/* Upload messages */

if (kendo.ui.Upload) {
kendo.ui.Upload.prototype.options.localization =
$.extend(true, kendo.ui.Upload.prototype.options.localization,{
  "select": "选择...",
  "cancel": "取消",
  "retry": "重试",
  "remove": "移除",
  "uploadSelectedFiles": "上传文件",
  "dropFilesHere": "拖拽要上传的文件到此处",
  "statusUploading": "上传中",
  "statusUploaded": "已上传",
  "statusWarning": "警告",
  "statusFailed": "失败",
  "headerStatusUploading": "上传...",
  "headerStatusUploaded": "完成"
});
}

/* Validator messages */

if (kendo.ui.Validator) {
kendo.ui.Validator.prototype.options.messages =
$.extend(true, kendo.ui.Validator.prototype.options.messages,{
  "required": "{0} 为必填项",
  "pattern": "{0} 非法",
  "min": "{0} 应该大于或等于 {1}",
  "max": "{0} 应该小于或等于 {1}",
  "step": "{0} 非法",
  "email": "{0} 不是合法的邮件地址",
  "url": "{0} 不是合法的URL",
  "date": "{0} 不是合法的日期"
});
}
})(window.kendo.jQuery);


  }).apply(root, arguments);
});
}(this));

(function(root) {
define("kendo-ui-culture", ["kendo-ui","kendo-ui-messages"], function() {
  return (function() {
(function( window, undefined ) {
    kendo.cultures["zh-CN"] = {
        name: "zh-CN",
        numberFormat: {
            pattern: ["-n"],
            decimals: 2,
            ",": ",",
            ".": ".",
            groupSize: [3],
            percent: {
                pattern: ["-n%","n%"],
                decimals: 2,
                ",": ",",
                ".": ".",
                groupSize: [3],
                symbol: "%"
            },
            currency: {
                name: "PRC Yuan Renminbi",
                abbr: "CNY",
                pattern: ["$-n","$n"],
                decimals: 2,
                ",": ",",
                ".": ".",
                groupSize: [3],
                symbol: "¥"
            }
        },
        calendars: {
            standard: {
                days: {
                    names: ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"],
                    namesAbbr: ["周日","周一","周二","周三","周四","周五","周六"],
                    namesShort: ["日","一","二","三","四","五","六"]
                },
                months: {
                    names: ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"],
                    namesAbbr: ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"]
                },
                AM: ["上午","上午","上午"],
                PM: ["下午","下午","下午"],
                patterns: {
                    d: "yyyy/M/d",
                    D: "yyyy'年'M'月'd'日'",
                    F: "yyyy'年'M'月'd'日' H:mm:ss",
                    g: "yyyy/M/d H:mm",
                    G: "yyyy/M/d H:mm:ss",
                    m: "M'月'd'日'",
                    M: "M'月'd'日'",
                    s: "yyyy'-'MM'-'dd'T'HH':'mm':'ss",
                    t: "H:mm",
                    T: "H:mm:ss",
                    u: "yyyy'-'MM'-'dd HH':'mm':'ss'Z'",
                    y: "yyyy'年'M'月'",
                    Y: "yyyy'年'M'月'"
                },
                "/": "/",
                ":": ":",
                firstDay: 1
            }
        }
    }
})(this);


  }).apply(root, arguments);
});
}(this));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/base/culture',['kendo-ui-culture'], factory);
    } else {
        factory(jQuery);
    }
}(function () {
    kendo.culture("zh-CN");
}));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/ui/dataTable',['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {
    var ui = kendo.ui,
        Widget = ui.Widget;
    var ListView = kendo.ui.ListView;

    var DataTable = ListView.extend({
        options: {
            name: 'DataTable',
            header: null,
            widths: [],
            cls: 'flexbox',
            tableCls: 'datatable'
        },
        init: function (element, options) {
            var that = this;

            // 预设 options

            // 从元素内部获取模板(代码段)
            if (options.header == null) {
                options.header = $(element).find('.tpl-header').html();
            }
            if (options.template == null) {
                options.template = $(element).find('.tpl-row').html();
            }

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
            this.element.addClass(this.options.cls);

            if (this.options.header) {
                var element = this.element;

                var tableHtml =
                    '<div class="datatable-header data-inject">' +
                        '<table class="table no-margin">' +
                            '<colgroup></colgroup>' +
                            '<thead></thead>' +
                        '</table>' +
                    '</div>' +
                    '<div class="datatable-content grow data-inject">' +
                        '<table class="table no-margin">' +
                            '<colgroup></colgroup>' +
                            '<tbody></tbody>' +
                        '</table>' +
                    '</div>';
                element.find('.data-inject').remove();
                element.append(tableHtml);
                element.find('table').addClass(this.options.tableCls);

                var headerHtml = this.options.header.indexOf('<') > -1 ? this.options.header : $('#' + this.options.header).html();
                element.find('.datatable-header thead').html(headerHtml);

                var len = $(headerHtml).children('th').length;
                element.find('.datatable-header colgroup').html(this._colgroup(this.options.widths, len));

                element.find('.datatable-content colgroup').html(this._colgroup(this.options.widths, len));

                this.element = this.element.find('.datatable-content tbody');
            }
        },
        // 计算 colgroup 的值
        _colgroup: function (widths, len) {
            len || (len = widths.length);

            var cols = '';
            for (var i = 0; i < len; i++) {
                var $col = $('<col />');
                var width = widths && widths[i];
                if ((widths == null || widths.length === 0) && width == null) {
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
}));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/ui/tree',['jquery', 'kendo-ui'], factory);
    } else {
        factory(jQuery, kendo);
    }
}(function ($, kendo) {

    var ui = kendo.ui;
    var Widget = ui.Widget;
    var ListView = kendo.ui.ListView;
    var FOCUSSELECTOR = " .k-tree-item";
    var CHANGE = 'change';
    var ROOT = 'k-tree-root';
    var SWITCHER = 'k-tree-switcher';
    var SUBTREE = 'k-tree-subtree';

    var Selectable = kendo.ui.Selectable;


    // kendo ui selectable 会进行冒泡，导致行为不符合预期
    var TreeSelectable = Selectable.extend({
        _tap: function (e) {
            //if(e.stopPro)
            e.event.stopPropagation();
            Selectable.fn._tap.call(this, e);
        },
        _start: function (e) {
        },
        _move: function (e) { },
        _end: function (e) { }
    });

    var Tree = ListView.extend({
        options: {
            name: 'Tree',
            focusSelector: '.k-tree-item > .k-tree-inner',
            isSubtree: false,
            dataTextField: ''
        },
        init: function (element, options) {
            var that = this;

            // 预设 options

            // 从元素内部获取模板(代码段)
            options.template = options.template || $(element).find('.tpl-template').html()
                || this._defaultTemplate(options);

            var $root = $(element).find('.' + ROOT);
            if ($root.length === 0) {
                $root = $(element);
            }
            ListView.fn.init.call(that, $root, options);
            if (!this.options.isSubtree) {
                this._bindEvents();
            }
        },
        _defaultTemplate: function (options) {

            return '<div class="k-tree-item">' +
                        '<div class="k-tree-inner">' +
                            '# for(var i = 0, len = level(); i < len; i++){ #' +
                                '<span class="k-tree-indent"></span>' +
                            '# } #' +
                            '# if(hasChildren){ #' +
                                '<a class="k-tree-switcher"></a>' +
                            '# } else{ #' +
                                '<span class="k-tree-switcher-noop"></span>' +
                            '# } #' +
                            '<span class="k-tree-text">' +
                                '#: ' + options.dataTextField + ' #' +
                            '</span>' +
                        '</div>' +
                        '# if(hasChildren){ #' +
                            '<div class="k-tree-subtree"></div>' +
                        '# } #' +
                    '</div>';
        },
        _initRoot: function () {
        },
        _bindEvents: function () {
            var el = this.element;
            var me = this;
            el.on('click', '.' + SWITCHER, function (e) {
                var $target = $(e.target);
                var $item = $(e.target).closest('[data-uid]');
                if ($item.hasClass('open')) {
                    $item.removeClass('open');
                } else {
                    $item.addClass('open');
                    var node = me._getNode($item);
                    me._initSubtree(node, $item.find('.' + SUBTREE));

                }
            });

            this.dataSource.bind('change', function (e, ee) {
                // debugger;
            });
        },
        expand: function () {

        },
        collapse: function () {

        },
        _element: function () {
            ListView.fn._element.call(this);
        },
        _getNode: function ($el) {
            var dataSource = kendo.widgetInstance($el.closest('.k-listview')).dataSource;
            var node = dataSource.getByUid($el.data('uid'));
            return node;
        },
        _selectable: function () {
            var that = this;
            var multi;
            var selectable = that.options.selectable;

            if (selectable) {
                multi = Selectable.parseOptions(selectable).multiple;

                that.selectable = new TreeSelectable(that.element, {
                    aria: true,
                    multiple: multi,
                    filter: this.options.focusSelector,
                    change: function (e) {

                        // return false;
                        that.trigger(CHANGE);
                    }
                });

            }
        },
        _initSubtree: function (node, $el) {
            //var $sub = this.element
            //            .find("[" + kendo.attr("uid") + "=" + node.uid + "]").find('.' + SUBTREE);
            if (!kendo.widgetInstance($el)) {
                var options = $.extend({}, this.options, {
                    dataSource: node.children,
                    autoBind: true,
                    template: this.options.template,
                    selectable: false,
                    isSubtree: true
                });
                $el.kendoTree(options);
            }
        },
        _templates: function (e) {

            ListView.fn._templates.call(this);
        },
        refresh: function (e) {
            if (e.action === "itemloaded") {
                return;
            }

            ListView.fn.refresh.call(this, e);

        },
        select: function (items) {
            return ListView.fn.select.call(this, items);
        }
    });

    kendo.ui.plugin(Tree);


}));

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/base/coreUtil',[], factory);
    } else {
        root.kb_coreUtil = factory();
    }
}(function () {

    var coreUtil = {};

    coreUtil.randomString = function () {
        return Math.random().toString(36).substring(7);
    }

    coreUtil.isFalsy = function (o) {
        return o == null || o == false;
    }

    return coreUtil;
}));

/*!
 * Bootstrap v3.3.6 (http://getbootstrap.com)
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under the MIT license
 */

if (typeof jQuery === 'undefined') {
  throw new Error('Bootstrap\'s JavaScript requires jQuery')
}

+function ($) {
  'use strict';
  var version = $.fn.jquery.split(' ')[0].split('.')
  if ((version[0] < 2 && version[1] < 9) || (version[0] == 1 && version[1] == 9 && version[2] < 1) || (version[0] > 2)) {
    throw new Error('Bootstrap\'s JavaScript requires jQuery version 1.9.1 or higher, but lower than version 3')
  }
}(jQuery);

/* ========================================================================
 * Bootstrap: transition.js v3.3.6
 * http://getbootstrap.com/javascript/#transitions
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // CSS TRANSITION SUPPORT (Shoutout: http://www.modernizr.com/)
  // ============================================================

  function transitionEnd() {
    var el = document.createElement('bootstrap')

    var transEndEventNames = {
      WebkitTransition : 'webkitTransitionEnd',
      MozTransition    : 'transitionend',
      OTransition      : 'oTransitionEnd otransitionend',
      transition       : 'transitionend'
    }

    for (var name in transEndEventNames) {
      if (el.style[name] !== undefined) {
        return { end: transEndEventNames[name] }
      }
    }

    return false // explicit for ie8 (  ._.)
  }

  // http://blog.alexmaccaw.com/css-transitions
  $.fn.emulateTransitionEnd = function (duration) {
    var called = false
    var $el = this
    $(this).one('bsTransitionEnd', function () { called = true })
    var callback = function () { if (!called) $($el).trigger($.support.transition.end) }
    setTimeout(callback, duration)
    return this
  }

  $(function () {
    $.support.transition = transitionEnd()

    if (!$.support.transition) return

    $.event.special.bsTransitionEnd = {
      bindType: $.support.transition.end,
      delegateType: $.support.transition.end,
      handle: function (e) {
        if ($(e.target).is(this)) return e.handleObj.handler.apply(this, arguments)
      }
    }
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: alert.js v3.3.6
 * http://getbootstrap.com/javascript/#alerts
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // ALERT CLASS DEFINITION
  // ======================

  var dismiss = '[data-dismiss="alert"]'
  var Alert   = function (el) {
    $(el).on('click', dismiss, this.close)
  }

  Alert.VERSION = '3.3.6'

  Alert.TRANSITION_DURATION = 150

  Alert.prototype.close = function (e) {
    var $this    = $(this)
    var selector = $this.attr('data-target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '') // strip for ie7
    }

    var $parent = $(selector)

    if (e) e.preventDefault()

    if (!$parent.length) {
      $parent = $this.closest('.alert')
    }

    $parent.trigger(e = $.Event('close.bs.alert'))

    if (e.isDefaultPrevented()) return

    $parent.removeClass('in')

    function removeElement() {
      // detach from parent, fire event then clean up data
      $parent.detach().trigger('closed.bs.alert').remove()
    }

    $.support.transition && $parent.hasClass('fade') ?
      $parent
        .one('bsTransitionEnd', removeElement)
        .emulateTransitionEnd(Alert.TRANSITION_DURATION) :
      removeElement()
  }


  // ALERT PLUGIN DEFINITION
  // =======================

  function Plugin(option) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('bs.alert')

      if (!data) $this.data('bs.alert', (data = new Alert(this)))
      if (typeof option == 'string') data[option].call($this)
    })
  }

  var old = $.fn.alert

  $.fn.alert             = Plugin
  $.fn.alert.Constructor = Alert


  // ALERT NO CONFLICT
  // =================

  $.fn.alert.noConflict = function () {
    $.fn.alert = old
    return this
  }


  // ALERT DATA-API
  // ==============

  $(document).on('click.bs.alert.data-api', dismiss, Alert.prototype.close)

}(jQuery);

/* ========================================================================
 * Bootstrap: button.js v3.3.6
 * http://getbootstrap.com/javascript/#buttons
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // BUTTON PUBLIC CLASS DEFINITION
  // ==============================

  var Button = function (element, options) {
    this.$element  = $(element)
    this.options   = $.extend({}, Button.DEFAULTS, options)
    this.isLoading = false
  }

  Button.VERSION  = '3.3.6'

  Button.DEFAULTS = {
    loadingText: 'loading...'
  }

  Button.prototype.setState = function (state) {
    var d    = 'disabled'
    var $el  = this.$element
    var val  = $el.is('input') ? 'val' : 'html'
    var data = $el.data()

    state += 'Text'

    if (data.resetText == null) $el.data('resetText', $el[val]())

    // push to event loop to allow forms to submit
    setTimeout($.proxy(function () {
      $el[val](data[state] == null ? this.options[state] : data[state])

      if (state == 'loadingText') {
        this.isLoading = true
        $el.addClass(d).attr(d, d)
      } else if (this.isLoading) {
        this.isLoading = false
        $el.removeClass(d).removeAttr(d)
      }
    }, this), 0)
  }

  Button.prototype.toggle = function () {
    var changed = true
    var $parent = this.$element.closest('[data-toggle="buttons"]')

    if ($parent.length) {
      var $input = this.$element.find('input')
      if ($input.prop('type') == 'radio') {
        if ($input.prop('checked')) changed = false
        $parent.find('.active').removeClass('active')
        this.$element.addClass('active')
      } else if ($input.prop('type') == 'checkbox') {
        if (($input.prop('checked')) !== this.$element.hasClass('active')) changed = false
        this.$element.toggleClass('active')
      }
      $input.prop('checked', this.$element.hasClass('active'))
      if (changed) $input.trigger('change')
    } else {
      this.$element.attr('aria-pressed', !this.$element.hasClass('active'))
      this.$element.toggleClass('active')
    }
  }


  // BUTTON PLUGIN DEFINITION
  // ========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.button')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.button', (data = new Button(this, options)))

      if (option == 'toggle') data.toggle()
      else if (option) data.setState(option)
    })
  }

  var old = $.fn.button

  $.fn.button             = Plugin
  $.fn.button.Constructor = Button


  // BUTTON NO CONFLICT
  // ==================

  $.fn.button.noConflict = function () {
    $.fn.button = old
    return this
  }


  // BUTTON DATA-API
  // ===============

  $(document)
    .on('click.bs.button.data-api', '[data-toggle^="button"]', function (e) {
      var $btn = $(e.target)
      if (!$btn.hasClass('btn')) $btn = $btn.closest('.btn')
      Plugin.call($btn, 'toggle')
      if (!($(e.target).is('input[type="radio"]') || $(e.target).is('input[type="checkbox"]'))) e.preventDefault()
    })
    .on('focus.bs.button.data-api blur.bs.button.data-api', '[data-toggle^="button"]', function (e) {
      $(e.target).closest('.btn').toggleClass('focus', /^focus(in)?$/.test(e.type))
    })

}(jQuery);

/* ========================================================================
 * Bootstrap: carousel.js v3.3.6
 * http://getbootstrap.com/javascript/#carousel
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // CAROUSEL CLASS DEFINITION
  // =========================

  var Carousel = function (element, options) {
    this.$element    = $(element)
    this.$indicators = this.$element.find('.carousel-indicators')
    this.options     = options
    this.paused      = null
    this.sliding     = null
    this.interval    = null
    this.$active     = null
    this.$items      = null

    this.options.keyboard && this.$element.on('keydown.bs.carousel', $.proxy(this.keydown, this))

    this.options.pause == 'hover' && !('ontouchstart' in document.documentElement) && this.$element
      .on('mouseenter.bs.carousel', $.proxy(this.pause, this))
      .on('mouseleave.bs.carousel', $.proxy(this.cycle, this))
  }

  Carousel.VERSION  = '3.3.6'

  Carousel.TRANSITION_DURATION = 600

  Carousel.DEFAULTS = {
    interval: 5000,
    pause: 'hover',
    wrap: true,
    keyboard: true
  }

  Carousel.prototype.keydown = function (e) {
    if (/input|textarea/i.test(e.target.tagName)) return
    switch (e.which) {
      case 37: this.prev(); break
      case 39: this.next(); break
      default: return
    }

    e.preventDefault()
  }

  Carousel.prototype.cycle = function (e) {
    e || (this.paused = false)

    this.interval && clearInterval(this.interval)

    this.options.interval
      && !this.paused
      && (this.interval = setInterval($.proxy(this.next, this), this.options.interval))

    return this
  }

  Carousel.prototype.getItemIndex = function (item) {
    this.$items = item.parent().children('.item')
    return this.$items.index(item || this.$active)
  }

  Carousel.prototype.getItemForDirection = function (direction, active) {
    var activeIndex = this.getItemIndex(active)
    var willWrap = (direction == 'prev' && activeIndex === 0)
                || (direction == 'next' && activeIndex == (this.$items.length - 1))
    if (willWrap && !this.options.wrap) return active
    var delta = direction == 'prev' ? -1 : 1
    var itemIndex = (activeIndex + delta) % this.$items.length
    return this.$items.eq(itemIndex)
  }

  Carousel.prototype.to = function (pos) {
    var that        = this
    var activeIndex = this.getItemIndex(this.$active = this.$element.find('.item.active'))

    if (pos > (this.$items.length - 1) || pos < 0) return

    if (this.sliding)       return this.$element.one('slid.bs.carousel', function () { that.to(pos) }) // yes, "slid"
    if (activeIndex == pos) return this.pause().cycle()

    return this.slide(pos > activeIndex ? 'next' : 'prev', this.$items.eq(pos))
  }

  Carousel.prototype.pause = function (e) {
    e || (this.paused = true)

    if (this.$element.find('.next, .prev').length && $.support.transition) {
      this.$element.trigger($.support.transition.end)
      this.cycle(true)
    }

    this.interval = clearInterval(this.interval)

    return this
  }

  Carousel.prototype.next = function () {
    if (this.sliding) return
    return this.slide('next')
  }

  Carousel.prototype.prev = function () {
    if (this.sliding) return
    return this.slide('prev')
  }

  Carousel.prototype.slide = function (type, next) {
    var $active   = this.$element.find('.item.active')
    var $next     = next || this.getItemForDirection(type, $active)
    var isCycling = this.interval
    var direction = type == 'next' ? 'left' : 'right'
    var that      = this

    if ($next.hasClass('active')) return (this.sliding = false)

    var relatedTarget = $next[0]
    var slideEvent = $.Event('slide.bs.carousel', {
      relatedTarget: relatedTarget,
      direction: direction
    })
    this.$element.trigger(slideEvent)
    if (slideEvent.isDefaultPrevented()) return

    this.sliding = true

    isCycling && this.pause()

    if (this.$indicators.length) {
      this.$indicators.find('.active').removeClass('active')
      var $nextIndicator = $(this.$indicators.children()[this.getItemIndex($next)])
      $nextIndicator && $nextIndicator.addClass('active')
    }

    var slidEvent = $.Event('slid.bs.carousel', { relatedTarget: relatedTarget, direction: direction }) // yes, "slid"
    if ($.support.transition && this.$element.hasClass('slide')) {
      $next.addClass(type)
      $next[0].offsetWidth // force reflow
      $active.addClass(direction)
      $next.addClass(direction)
      $active
        .one('bsTransitionEnd', function () {
          $next.removeClass([type, direction].join(' ')).addClass('active')
          $active.removeClass(['active', direction].join(' '))
          that.sliding = false
          setTimeout(function () {
            that.$element.trigger(slidEvent)
          }, 0)
        })
        .emulateTransitionEnd(Carousel.TRANSITION_DURATION)
    } else {
      $active.removeClass('active')
      $next.addClass('active')
      this.sliding = false
      this.$element.trigger(slidEvent)
    }

    isCycling && this.cycle()

    return this
  }


  // CAROUSEL PLUGIN DEFINITION
  // ==========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.carousel')
      var options = $.extend({}, Carousel.DEFAULTS, $this.data(), typeof option == 'object' && option)
      var action  = typeof option == 'string' ? option : options.slide

      if (!data) $this.data('bs.carousel', (data = new Carousel(this, options)))
      if (typeof option == 'number') data.to(option)
      else if (action) data[action]()
      else if (options.interval) data.pause().cycle()
    })
  }

  var old = $.fn.carousel

  $.fn.carousel             = Plugin
  $.fn.carousel.Constructor = Carousel


  // CAROUSEL NO CONFLICT
  // ====================

  $.fn.carousel.noConflict = function () {
    $.fn.carousel = old
    return this
  }


  // CAROUSEL DATA-API
  // =================

  var clickHandler = function (e) {
    var href
    var $this   = $(this)
    var $target = $($this.attr('data-target') || (href = $this.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '')) // strip for ie7
    if (!$target.hasClass('carousel')) return
    var options = $.extend({}, $target.data(), $this.data())
    var slideIndex = $this.attr('data-slide-to')
    if (slideIndex) options.interval = false

    Plugin.call($target, options)

    if (slideIndex) {
      $target.data('bs.carousel').to(slideIndex)
    }

    e.preventDefault()
  }

  $(document)
    .on('click.bs.carousel.data-api', '[data-slide]', clickHandler)
    .on('click.bs.carousel.data-api', '[data-slide-to]', clickHandler)

  $(window).on('load', function () {
    $('[data-ride="carousel"]').each(function () {
      var $carousel = $(this)
      Plugin.call($carousel, $carousel.data())
    })
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: collapse.js v3.3.6
 * http://getbootstrap.com/javascript/#collapse
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // COLLAPSE PUBLIC CLASS DEFINITION
  // ================================

  var Collapse = function (element, options) {
    this.$element      = $(element)
    this.options       = $.extend({}, Collapse.DEFAULTS, options)
    this.$trigger      = $('[data-toggle="collapse"][href="#' + element.id + '"],' +
                           '[data-toggle="collapse"][data-target="#' + element.id + '"]')
    this.transitioning = null

    if (this.options.parent) {
      this.$parent = this.getParent()
    } else {
      this.addAriaAndCollapsedClass(this.$element, this.$trigger)
    }

    if (this.options.toggle) this.toggle()
  }

  Collapse.VERSION  = '3.3.6'

  Collapse.TRANSITION_DURATION = 350

  Collapse.DEFAULTS = {
    toggle: true
  }

  Collapse.prototype.dimension = function () {
    var hasWidth = this.$element.hasClass('width')
    return hasWidth ? 'width' : 'height'
  }

  Collapse.prototype.show = function () {
    if (this.transitioning || this.$element.hasClass('in')) return

    var activesData
    var actives = this.$parent && this.$parent.children('.panel').children('.in, .collapsing')

    if (actives && actives.length) {
      activesData = actives.data('bs.collapse')
      if (activesData && activesData.transitioning) return
    }

    var startEvent = $.Event('show.bs.collapse')
    this.$element.trigger(startEvent)
    if (startEvent.isDefaultPrevented()) return

    if (actives && actives.length) {
      Plugin.call(actives, 'hide')
      activesData || actives.data('bs.collapse', null)
    }

    var dimension = this.dimension()

    this.$element
      .removeClass('collapse')
      .addClass('collapsing')[dimension](0)
      .attr('aria-expanded', true)

    this.$trigger
      .removeClass('collapsed')
      .attr('aria-expanded', true)

    this.transitioning = 1

    var complete = function () {
      this.$element
        .removeClass('collapsing')
        .addClass('collapse in')[dimension]('')
      this.transitioning = 0
      this.$element
        .trigger('shown.bs.collapse')
    }

    if (!$.support.transition) return complete.call(this)

    var scrollSize = $.camelCase(['scroll', dimension].join('-'))

    this.$element
      .one('bsTransitionEnd', $.proxy(complete, this))
      .emulateTransitionEnd(Collapse.TRANSITION_DURATION)[dimension](this.$element[0][scrollSize])
  }

  Collapse.prototype.hide = function () {
    if (this.transitioning || !this.$element.hasClass('in')) return

    var startEvent = $.Event('hide.bs.collapse')
    this.$element.trigger(startEvent)
    if (startEvent.isDefaultPrevented()) return

    var dimension = this.dimension()

    this.$element[dimension](this.$element[dimension]())[0].offsetHeight

    this.$element
      .addClass('collapsing')
      .removeClass('collapse in')
      .attr('aria-expanded', false)

    this.$trigger
      .addClass('collapsed')
      .attr('aria-expanded', false)

    this.transitioning = 1

    var complete = function () {
      this.transitioning = 0
      this.$element
        .removeClass('collapsing')
        .addClass('collapse')
        .trigger('hidden.bs.collapse')
    }

    if (!$.support.transition) return complete.call(this)

    this.$element
      [dimension](0)
      .one('bsTransitionEnd', $.proxy(complete, this))
      .emulateTransitionEnd(Collapse.TRANSITION_DURATION)
  }

  Collapse.prototype.toggle = function () {
    this[this.$element.hasClass('in') ? 'hide' : 'show']()
  }

  Collapse.prototype.getParent = function () {
    return $(this.options.parent)
      .find('[data-toggle="collapse"][data-parent="' + this.options.parent + '"]')
      .each($.proxy(function (i, element) {
        var $element = $(element)
        this.addAriaAndCollapsedClass(getTargetFromTrigger($element), $element)
      }, this))
      .end()
  }

  Collapse.prototype.addAriaAndCollapsedClass = function ($element, $trigger) {
    var isOpen = $element.hasClass('in')

    $element.attr('aria-expanded', isOpen)
    $trigger
      .toggleClass('collapsed', !isOpen)
      .attr('aria-expanded', isOpen)
  }

  function getTargetFromTrigger($trigger) {
    var href
    var target = $trigger.attr('data-target')
      || (href = $trigger.attr('href')) && href.replace(/.*(?=#[^\s]+$)/, '') // strip for ie7

    return $(target)
  }


  // COLLAPSE PLUGIN DEFINITION
  // ==========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.collapse')
      var options = $.extend({}, Collapse.DEFAULTS, $this.data(), typeof option == 'object' && option)

      if (!data && options.toggle && /show|hide/.test(option)) options.toggle = false
      if (!data) $this.data('bs.collapse', (data = new Collapse(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.collapse

  $.fn.collapse             = Plugin
  $.fn.collapse.Constructor = Collapse


  // COLLAPSE NO CONFLICT
  // ====================

  $.fn.collapse.noConflict = function () {
    $.fn.collapse = old
    return this
  }


  // COLLAPSE DATA-API
  // =================

  $(document).on('click.bs.collapse.data-api', '[data-toggle="collapse"]', function (e) {
    var $this   = $(this)

    if (!$this.attr('data-target')) e.preventDefault()

    var $target = getTargetFromTrigger($this)
    var data    = $target.data('bs.collapse')
    var option  = data ? 'toggle' : $this.data()

    Plugin.call($target, option)
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: dropdown.js v3.3.6
 * http://getbootstrap.com/javascript/#dropdowns
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // DROPDOWN CLASS DEFINITION
  // =========================

  var backdrop = '.dropdown-backdrop'
  var toggle   = '[data-toggle="dropdown"]'
  var Dropdown = function (element) {
    $(element).on('click.bs.dropdown', this.toggle)
  }

  Dropdown.VERSION = '3.3.6'

  function getParent($this) {
    var selector = $this.attr('data-target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && /#[A-Za-z]/.test(selector) && selector.replace(/.*(?=#[^\s]*$)/, '') // strip for ie7
    }

    var $parent = selector && $(selector)

    return $parent && $parent.length ? $parent : $this.parent()
  }

  function clearMenus(e) {
    if (e && e.which === 3) return
    $(backdrop).remove()
    $(toggle).each(function () {
      var $this         = $(this)
      var $parent       = getParent($this)
      var relatedTarget = { relatedTarget: this }

      if (!$parent.hasClass('open')) return

      if (e && e.type == 'click' && /input|textarea/i.test(e.target.tagName) && $.contains($parent[0], e.target)) return

      $parent.trigger(e = $.Event('hide.bs.dropdown', relatedTarget))

      if (e.isDefaultPrevented()) return

      $this.attr('aria-expanded', 'false')
      $parent.removeClass('open').trigger($.Event('hidden.bs.dropdown', relatedTarget))
    })
  }

  Dropdown.prototype.toggle = function (e) {
    var $this = $(this)

    if ($this.is('.disabled, :disabled')) return

    var $parent  = getParent($this)
    var isActive = $parent.hasClass('open')

    clearMenus()

    if (!isActive) {
      if ('ontouchstart' in document.documentElement && !$parent.closest('.navbar-nav').length) {
        // if mobile we use a backdrop because click events don't delegate
        $(document.createElement('div'))
          .addClass('dropdown-backdrop')
          .insertAfter($(this))
          .on('click', clearMenus)
      }

      var relatedTarget = { relatedTarget: this }
      $parent.trigger(e = $.Event('show.bs.dropdown', relatedTarget))

      if (e.isDefaultPrevented()) return

      $this
        .trigger('focus')
        .attr('aria-expanded', 'true')

      $parent
        .toggleClass('open')
        .trigger($.Event('shown.bs.dropdown', relatedTarget))
    }

    return false
  }

  Dropdown.prototype.keydown = function (e) {
    if (!/(38|40|27|32)/.test(e.which) || /input|textarea/i.test(e.target.tagName)) return

    var $this = $(this)

    e.preventDefault()
    e.stopPropagation()

    if ($this.is('.disabled, :disabled')) return

    var $parent  = getParent($this)
    var isActive = $parent.hasClass('open')

    if (!isActive && e.which != 27 || isActive && e.which == 27) {
      if (e.which == 27) $parent.find(toggle).trigger('focus')
      return $this.trigger('click')
    }

    var desc = ' li:not(.disabled):visible a'
    var $items = $parent.find('.dropdown-menu' + desc)

    if (!$items.length) return

    var index = $items.index(e.target)

    if (e.which == 38 && index > 0)                 index--         // up
    if (e.which == 40 && index < $items.length - 1) index++         // down
    if (!~index)                                    index = 0

    $items.eq(index).trigger('focus')
  }


  // DROPDOWN PLUGIN DEFINITION
  // ==========================

  function Plugin(option) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('bs.dropdown')

      if (!data) $this.data('bs.dropdown', (data = new Dropdown(this)))
      if (typeof option == 'string') data[option].call($this)
    })
  }

  var old = $.fn.dropdown

  $.fn.dropdown             = Plugin
  $.fn.dropdown.Constructor = Dropdown


  // DROPDOWN NO CONFLICT
  // ====================

  $.fn.dropdown.noConflict = function () {
    $.fn.dropdown = old
    return this
  }


  // APPLY TO STANDARD DROPDOWN ELEMENTS
  // ===================================

  $(document)
    .on('click.bs.dropdown.data-api', clearMenus)
    .on('click.bs.dropdown.data-api', '.dropdown form', function (e) { e.stopPropagation() })
    .on('click.bs.dropdown.data-api', toggle, Dropdown.prototype.toggle)
    .on('keydown.bs.dropdown.data-api', toggle, Dropdown.prototype.keydown)
    .on('keydown.bs.dropdown.data-api', '.dropdown-menu', Dropdown.prototype.keydown)

}(jQuery);

/* ========================================================================
 * Bootstrap: modal.js v3.3.6
 * http://getbootstrap.com/javascript/#modals
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // MODAL CLASS DEFINITION
  // ======================

  var Modal = function (element, options) {
    this.options             = options
    this.$body               = $(document.body)
    this.$element            = $(element)
    this.$dialog             = this.$element.find('.modal-dialog')
    this.$backdrop           = null
    this.isShown             = null
    this.originalBodyPad     = null
    this.scrollbarWidth      = 0
    this.ignoreBackdropClick = false

    if (this.options.remote) {
      this.$element
        .find('.modal-content')
        .load(this.options.remote, $.proxy(function () {
          this.$element.trigger('loaded.bs.modal')
        }, this))
    }
  }

  Modal.VERSION  = '3.3.6'

  Modal.TRANSITION_DURATION = 300
  Modal.BACKDROP_TRANSITION_DURATION = 150

  Modal.DEFAULTS = {
    backdrop: true,
    keyboard: true,
    show: true
  }

  Modal.prototype.toggle = function (_relatedTarget) {
    return this.isShown ? this.hide() : this.show(_relatedTarget)
  }

  Modal.prototype.show = function (_relatedTarget) {
    var that = this
    var e    = $.Event('show.bs.modal', { relatedTarget: _relatedTarget })

    this.$element.trigger(e)

    if (this.isShown || e.isDefaultPrevented()) return

    this.isShown = true

    this.checkScrollbar()
    this.setScrollbar()
    this.$body.addClass('modal-open')

    this.escape()
    this.resize()

    this.$element.on('click.dismiss.bs.modal', '[data-dismiss="modal"]', $.proxy(this.hide, this))

    this.$dialog.on('mousedown.dismiss.bs.modal', function () {
      that.$element.one('mouseup.dismiss.bs.modal', function (e) {
        if ($(e.target).is(that.$element)) that.ignoreBackdropClick = true
      })
    })

    this.backdrop(function () {
      var transition = $.support.transition && that.$element.hasClass('fade')

      if (!that.$element.parent().length) {
        that.$element.appendTo(that.$body) // don't move modals dom position
      }

      that.$element
        .show()
        .scrollTop(0)

      that.adjustDialog()

      if (transition) {
        that.$element[0].offsetWidth // force reflow
      }

      that.$element.addClass('in')

      that.enforceFocus()

      var e = $.Event('shown.bs.modal', { relatedTarget: _relatedTarget })

      transition ?
        that.$dialog // wait for modal to slide in
          .one('bsTransitionEnd', function () {
            that.$element.trigger('focus').trigger(e)
          })
          .emulateTransitionEnd(Modal.TRANSITION_DURATION) :
        that.$element.trigger('focus').trigger(e)
    })
  }

  Modal.prototype.hide = function (e) {
    if (e) e.preventDefault()

    e = $.Event('hide.bs.modal')

    this.$element.trigger(e)

    if (!this.isShown || e.isDefaultPrevented()) return

    this.isShown = false

    this.escape()
    this.resize()

    $(document).off('focusin.bs.modal')

    this.$element
      .removeClass('in')
      .off('click.dismiss.bs.modal')
      .off('mouseup.dismiss.bs.modal')

    this.$dialog.off('mousedown.dismiss.bs.modal')

    $.support.transition && this.$element.hasClass('fade') ?
      this.$element
        .one('bsTransitionEnd', $.proxy(this.hideModal, this))
        .emulateTransitionEnd(Modal.TRANSITION_DURATION) :
      this.hideModal()
  }

  Modal.prototype.enforceFocus = function () {
    $(document)
      .off('focusin.bs.modal') // guard against infinite focus loop
      .on('focusin.bs.modal', $.proxy(function (e) {
        if (this.$element[0] !== e.target && !this.$element.has(e.target).length) {
          this.$element.trigger('focus')
        }
      }, this))
  }

  Modal.prototype.escape = function () {
    if (this.isShown && this.options.keyboard) {
      this.$element.on('keydown.dismiss.bs.modal', $.proxy(function (e) {
        e.which == 27 && this.hide()
      }, this))
    } else if (!this.isShown) {
      this.$element.off('keydown.dismiss.bs.modal')
    }
  }

  Modal.prototype.resize = function () {
    if (this.isShown) {
      $(window).on('resize.bs.modal', $.proxy(this.handleUpdate, this))
    } else {
      $(window).off('resize.bs.modal')
    }
  }

  Modal.prototype.hideModal = function () {
    var that = this
    this.$element.hide()
    this.backdrop(function () {
      that.$body.removeClass('modal-open')
      that.resetAdjustments()
      that.resetScrollbar()
      that.$element.trigger('hidden.bs.modal')
    })
  }

  Modal.prototype.removeBackdrop = function () {
    this.$backdrop && this.$backdrop.remove()
    this.$backdrop = null
  }

  Modal.prototype.backdrop = function (callback) {
    var that = this
    var animate = this.$element.hasClass('fade') ? 'fade' : ''

    if (this.isShown && this.options.backdrop) {
      var doAnimate = $.support.transition && animate

      this.$backdrop = $(document.createElement('div'))
        .addClass('modal-backdrop ' + animate)
        .appendTo(this.$body)

      this.$element.on('click.dismiss.bs.modal', $.proxy(function (e) {
        if (this.ignoreBackdropClick) {
          this.ignoreBackdropClick = false
          return
        }
        if (e.target !== e.currentTarget) return
        this.options.backdrop == 'static'
          ? this.$element[0].focus()
          : this.hide()
      }, this))

      if (doAnimate) this.$backdrop[0].offsetWidth // force reflow

      this.$backdrop.addClass('in')

      if (!callback) return

      doAnimate ?
        this.$backdrop
          .one('bsTransitionEnd', callback)
          .emulateTransitionEnd(Modal.BACKDROP_TRANSITION_DURATION) :
        callback()

    } else if (!this.isShown && this.$backdrop) {
      this.$backdrop.removeClass('in')

      var callbackRemove = function () {
        that.removeBackdrop()
        callback && callback()
      }
      $.support.transition && this.$element.hasClass('fade') ?
        this.$backdrop
          .one('bsTransitionEnd', callbackRemove)
          .emulateTransitionEnd(Modal.BACKDROP_TRANSITION_DURATION) :
        callbackRemove()

    } else if (callback) {
      callback()
    }
  }

  // these following methods are used to handle overflowing modals

  Modal.prototype.handleUpdate = function () {
    this.adjustDialog()
  }

  Modal.prototype.adjustDialog = function () {
    var modalIsOverflowing = this.$element[0].scrollHeight > document.documentElement.clientHeight

    this.$element.css({
      paddingLeft:  !this.bodyIsOverflowing && modalIsOverflowing ? this.scrollbarWidth : '',
      paddingRight: this.bodyIsOverflowing && !modalIsOverflowing ? this.scrollbarWidth : ''
    })
  }

  Modal.prototype.resetAdjustments = function () {
    this.$element.css({
      paddingLeft: '',
      paddingRight: ''
    })
  }

  Modal.prototype.checkScrollbar = function () {
    var fullWindowWidth = window.innerWidth
    if (!fullWindowWidth) { // workaround for missing window.innerWidth in IE8
      var documentElementRect = document.documentElement.getBoundingClientRect()
      fullWindowWidth = documentElementRect.right - Math.abs(documentElementRect.left)
    }
    this.bodyIsOverflowing = document.body.clientWidth < fullWindowWidth
    this.scrollbarWidth = this.measureScrollbar()
  }

  Modal.prototype.setScrollbar = function () {
    var bodyPad = parseInt((this.$body.css('padding-right') || 0), 10)
    this.originalBodyPad = document.body.style.paddingRight || ''
    if (this.bodyIsOverflowing) this.$body.css('padding-right', bodyPad + this.scrollbarWidth)
  }

  Modal.prototype.resetScrollbar = function () {
    this.$body.css('padding-right', this.originalBodyPad)
  }

  Modal.prototype.measureScrollbar = function () { // thx walsh
    var scrollDiv = document.createElement('div')
    scrollDiv.className = 'modal-scrollbar-measure'
    this.$body.append(scrollDiv)
    var scrollbarWidth = scrollDiv.offsetWidth - scrollDiv.clientWidth
    this.$body[0].removeChild(scrollDiv)
    return scrollbarWidth
  }


  // MODAL PLUGIN DEFINITION
  // =======================

  function Plugin(option, _relatedTarget) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.modal')
      var options = $.extend({}, Modal.DEFAULTS, $this.data(), typeof option == 'object' && option)

      if (!data) $this.data('bs.modal', (data = new Modal(this, options)))
      if (typeof option == 'string') data[option](_relatedTarget)
      else if (options.show) data.show(_relatedTarget)
    })
  }

  var old = $.fn.modal

  $.fn.modal             = Plugin
  $.fn.modal.Constructor = Modal


  // MODAL NO CONFLICT
  // =================

  $.fn.modal.noConflict = function () {
    $.fn.modal = old
    return this
  }


  // MODAL DATA-API
  // ==============

  $(document).on('click.bs.modal.data-api', '[data-toggle="modal"]', function (e) {
    var $this   = $(this)
    var href    = $this.attr('href')
    var $target = $($this.attr('data-target') || (href && href.replace(/.*(?=#[^\s]+$)/, ''))) // strip for ie7
    var option  = $target.data('bs.modal') ? 'toggle' : $.extend({ remote: !/#/.test(href) && href }, $target.data(), $this.data())

    if ($this.is('a')) e.preventDefault()

    $target.one('show.bs.modal', function (showEvent) {
      if (showEvent.isDefaultPrevented()) return // only register focus restorer if modal will actually get shown
      $target.one('hidden.bs.modal', function () {
        $this.is(':visible') && $this.trigger('focus')
      })
    })
    Plugin.call($target, option, this)
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: tooltip.js v3.3.6
 * http://getbootstrap.com/javascript/#tooltip
 * Inspired by the original jQuery.tipsy by Jason Frame
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // TOOLTIP PUBLIC CLASS DEFINITION
  // ===============================

  var Tooltip = function (element, options) {
    this.type       = null
    this.options    = null
    this.enabled    = null
    this.timeout    = null
    this.hoverState = null
    this.$element   = null
    this.inState    = null

    this.init('tooltip', element, options)
  }

  Tooltip.VERSION  = '3.3.6'

  Tooltip.TRANSITION_DURATION = 150

  Tooltip.DEFAULTS = {
    animation: true,
    placement: 'top',
    selector: false,
    template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',
    trigger: 'hover focus',
    title: '',
    delay: 0,
    html: false,
    container: false,
    viewport: {
      selector: 'body',
      padding: 0
    }
  }

  Tooltip.prototype.init = function (type, element, options) {
    this.enabled   = true
    this.type      = type
    this.$element  = $(element)
    this.options   = this.getOptions(options)
    this.$viewport = this.options.viewport && $($.isFunction(this.options.viewport) ? this.options.viewport.call(this, this.$element) : (this.options.viewport.selector || this.options.viewport))
    this.inState   = { click: false, hover: false, focus: false }

    if (this.$element[0] instanceof document.constructor && !this.options.selector) {
      throw new Error('`selector` option must be specified when initializing ' + this.type + ' on the window.document object!')
    }

    var triggers = this.options.trigger.split(' ')

    for (var i = triggers.length; i--;) {
      var trigger = triggers[i]

      if (trigger == 'click') {
        this.$element.on('click.' + this.type, this.options.selector, $.proxy(this.toggle, this))
      } else if (trigger != 'manual') {
        var eventIn  = trigger == 'hover' ? 'mouseenter' : 'focusin'
        var eventOut = trigger == 'hover' ? 'mouseleave' : 'focusout'

        this.$element.on(eventIn  + '.' + this.type, this.options.selector, $.proxy(this.enter, this))
        this.$element.on(eventOut + '.' + this.type, this.options.selector, $.proxy(this.leave, this))
      }
    }

    this.options.selector ?
      (this._options = $.extend({}, this.options, { trigger: 'manual', selector: '' })) :
      this.fixTitle()
  }

  Tooltip.prototype.getDefaults = function () {
    return Tooltip.DEFAULTS
  }

  Tooltip.prototype.getOptions = function (options) {
    options = $.extend({}, this.getDefaults(), this.$element.data(), options)

    if (options.delay && typeof options.delay == 'number') {
      options.delay = {
        show: options.delay,
        hide: options.delay
      }
    }

    return options
  }

  Tooltip.prototype.getDelegateOptions = function () {
    var options  = {}
    var defaults = this.getDefaults()

    this._options && $.each(this._options, function (key, value) {
      if (defaults[key] != value) options[key] = value
    })

    return options
  }

  Tooltip.prototype.enter = function (obj) {
    var self = obj instanceof this.constructor ?
      obj : $(obj.currentTarget).data('bs.' + this.type)

    if (!self) {
      self = new this.constructor(obj.currentTarget, this.getDelegateOptions())
      $(obj.currentTarget).data('bs.' + this.type, self)
    }

    if (obj instanceof $.Event) {
      self.inState[obj.type == 'focusin' ? 'focus' : 'hover'] = true
    }

    if (self.tip().hasClass('in') || self.hoverState == 'in') {
      self.hoverState = 'in'
      return
    }

    clearTimeout(self.timeout)

    self.hoverState = 'in'

    if (!self.options.delay || !self.options.delay.show) return self.show()

    self.timeout = setTimeout(function () {
      if (self.hoverState == 'in') self.show()
    }, self.options.delay.show)
  }

  Tooltip.prototype.isInStateTrue = function () {
    for (var key in this.inState) {
      if (this.inState[key]) return true
    }

    return false
  }

  Tooltip.prototype.leave = function (obj) {
    var self = obj instanceof this.constructor ?
      obj : $(obj.currentTarget).data('bs.' + this.type)

    if (!self) {
      self = new this.constructor(obj.currentTarget, this.getDelegateOptions())
      $(obj.currentTarget).data('bs.' + this.type, self)
    }

    if (obj instanceof $.Event) {
      self.inState[obj.type == 'focusout' ? 'focus' : 'hover'] = false
    }

    if (self.isInStateTrue()) return

    clearTimeout(self.timeout)

    self.hoverState = 'out'

    if (!self.options.delay || !self.options.delay.hide) return self.hide()

    self.timeout = setTimeout(function () {
      if (self.hoverState == 'out') self.hide()
    }, self.options.delay.hide)
  }

  Tooltip.prototype.show = function () {
    var e = $.Event('show.bs.' + this.type)

    if (this.hasContent() && this.enabled) {
      this.$element.trigger(e)

      var inDom = $.contains(this.$element[0].ownerDocument.documentElement, this.$element[0])
      if (e.isDefaultPrevented() || !inDom) return
      var that = this

      var $tip = this.tip()

      var tipId = this.getUID(this.type)

      this.setContent()
      $tip.attr('id', tipId)
      this.$element.attr('aria-describedby', tipId)

      if (this.options.animation) $tip.addClass('fade')

      var placement = typeof this.options.placement == 'function' ?
        this.options.placement.call(this, $tip[0], this.$element[0]) :
        this.options.placement

      var autoToken = /\s?auto?\s?/i
      var autoPlace = autoToken.test(placement)
      if (autoPlace) placement = placement.replace(autoToken, '') || 'top'

      $tip
        .detach()
        .css({ top: 0, left: 0, display: 'block' })
        .addClass(placement)
        .data('bs.' + this.type, this)

      this.options.container ? $tip.appendTo(this.options.container) : $tip.insertAfter(this.$element)
      this.$element.trigger('inserted.bs.' + this.type)

      var pos          = this.getPosition()
      var actualWidth  = $tip[0].offsetWidth
      var actualHeight = $tip[0].offsetHeight

      if (autoPlace) {
        var orgPlacement = placement
        var viewportDim = this.getPosition(this.$viewport)

        placement = placement == 'bottom' && pos.bottom + actualHeight > viewportDim.bottom ? 'top'    :
                    placement == 'top'    && pos.top    - actualHeight < viewportDim.top    ? 'bottom' :
                    placement == 'right'  && pos.right  + actualWidth  > viewportDim.width  ? 'left'   :
                    placement == 'left'   && pos.left   - actualWidth  < viewportDim.left   ? 'right'  :
                    placement

        $tip
          .removeClass(orgPlacement)
          .addClass(placement)
      }

      var calculatedOffset = this.getCalculatedOffset(placement, pos, actualWidth, actualHeight)

      this.applyPlacement(calculatedOffset, placement)

      var complete = function () {
        var prevHoverState = that.hoverState
        that.$element.trigger('shown.bs.' + that.type)
        that.hoverState = null

        if (prevHoverState == 'out') that.leave(that)
      }

      $.support.transition && this.$tip.hasClass('fade') ?
        $tip
          .one('bsTransitionEnd', complete)
          .emulateTransitionEnd(Tooltip.TRANSITION_DURATION) :
        complete()
    }
  }

  Tooltip.prototype.applyPlacement = function (offset, placement) {
    var $tip   = this.tip()
    var width  = $tip[0].offsetWidth
    var height = $tip[0].offsetHeight

    // manually read margins because getBoundingClientRect includes difference
    var marginTop = parseInt($tip.css('margin-top'), 10)
    var marginLeft = parseInt($tip.css('margin-left'), 10)

    // we must check for NaN for ie 8/9
    if (isNaN(marginTop))  marginTop  = 0
    if (isNaN(marginLeft)) marginLeft = 0

    offset.top  += marginTop
    offset.left += marginLeft

    // $.fn.offset doesn't round pixel values
    // so we use setOffset directly with our own function B-0
    $.offset.setOffset($tip[0], $.extend({
      using: function (props) {
        $tip.css({
          top: Math.round(props.top),
          left: Math.round(props.left)
        })
      }
    }, offset), 0)

    $tip.addClass('in')

    // check to see if placing tip in new offset caused the tip to resize itself
    var actualWidth  = $tip[0].offsetWidth
    var actualHeight = $tip[0].offsetHeight

    if (placement == 'top' && actualHeight != height) {
      offset.top = offset.top + height - actualHeight
    }

    var delta = this.getViewportAdjustedDelta(placement, offset, actualWidth, actualHeight)

    if (delta.left) offset.left += delta.left
    else offset.top += delta.top

    var isVertical          = /top|bottom/.test(placement)
    var arrowDelta          = isVertical ? delta.left * 2 - width + actualWidth : delta.top * 2 - height + actualHeight
    var arrowOffsetPosition = isVertical ? 'offsetWidth' : 'offsetHeight'

    $tip.offset(offset)
    this.replaceArrow(arrowDelta, $tip[0][arrowOffsetPosition], isVertical)
  }

  Tooltip.prototype.replaceArrow = function (delta, dimension, isVertical) {
    this.arrow()
      .css(isVertical ? 'left' : 'top', 50 * (1 - delta / dimension) + '%')
      .css(isVertical ? 'top' : 'left', '')
  }

  Tooltip.prototype.setContent = function () {
    var $tip  = this.tip()
    var title = this.getTitle()

    $tip.find('.tooltip-inner')[this.options.html ? 'html' : 'text'](title)
    $tip.removeClass('fade in top bottom left right')
  }

  Tooltip.prototype.hide = function (callback) {
    var that = this
    var $tip = $(this.$tip)
    var e    = $.Event('hide.bs.' + this.type)

    function complete() {
      if (that.hoverState != 'in') $tip.detach()
      that.$element
        .removeAttr('aria-describedby')
        .trigger('hidden.bs.' + that.type)
      callback && callback()
    }

    this.$element.trigger(e)

    if (e.isDefaultPrevented()) return

    $tip.removeClass('in')

    $.support.transition && $tip.hasClass('fade') ?
      $tip
        .one('bsTransitionEnd', complete)
        .emulateTransitionEnd(Tooltip.TRANSITION_DURATION) :
      complete()

    this.hoverState = null

    return this
  }

  Tooltip.prototype.fixTitle = function () {
    var $e = this.$element
    if ($e.attr('title') || typeof $e.attr('data-original-title') != 'string') {
      $e.attr('data-original-title', $e.attr('title') || '').attr('title', '')
    }
  }

  Tooltip.prototype.hasContent = function () {
    return this.getTitle()
  }

  Tooltip.prototype.getPosition = function ($element) {
    $element   = $element || this.$element

    var el     = $element[0]
    var isBody = el.tagName == 'BODY'

    var elRect    = el.getBoundingClientRect()
    if (elRect.width == null) {
      // width and height are missing in IE8, so compute them manually; see https://github.com/twbs/bootstrap/issues/14093
      elRect = $.extend({}, elRect, { width: elRect.right - elRect.left, height: elRect.bottom - elRect.top })
    }
    var elOffset  = isBody ? { top: 0, left: 0 } : $element.offset()
    var scroll    = { scroll: isBody ? document.documentElement.scrollTop || document.body.scrollTop : $element.scrollTop() }
    var outerDims = isBody ? { width: $(window).width(), height: $(window).height() } : null

    return $.extend({}, elRect, scroll, outerDims, elOffset)
  }

  Tooltip.prototype.getCalculatedOffset = function (placement, pos, actualWidth, actualHeight) {
    return placement == 'bottom' ? { top: pos.top + pos.height,   left: pos.left + pos.width / 2 - actualWidth / 2 } :
           placement == 'top'    ? { top: pos.top - actualHeight, left: pos.left + pos.width / 2 - actualWidth / 2 } :
           placement == 'left'   ? { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left - actualWidth } :
        /* placement == 'right' */ { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left + pos.width }

  }

  Tooltip.prototype.getViewportAdjustedDelta = function (placement, pos, actualWidth, actualHeight) {
    var delta = { top: 0, left: 0 }
    if (!this.$viewport) return delta

    var viewportPadding = this.options.viewport && this.options.viewport.padding || 0
    var viewportDimensions = this.getPosition(this.$viewport)

    if (/right|left/.test(placement)) {
      var topEdgeOffset    = pos.top - viewportPadding - viewportDimensions.scroll
      var bottomEdgeOffset = pos.top + viewportPadding - viewportDimensions.scroll + actualHeight
      if (topEdgeOffset < viewportDimensions.top) { // top overflow
        delta.top = viewportDimensions.top - topEdgeOffset
      } else if (bottomEdgeOffset > viewportDimensions.top + viewportDimensions.height) { // bottom overflow
        delta.top = viewportDimensions.top + viewportDimensions.height - bottomEdgeOffset
      }
    } else {
      var leftEdgeOffset  = pos.left - viewportPadding
      var rightEdgeOffset = pos.left + viewportPadding + actualWidth
      if (leftEdgeOffset < viewportDimensions.left) { // left overflow
        delta.left = viewportDimensions.left - leftEdgeOffset
      } else if (rightEdgeOffset > viewportDimensions.right) { // right overflow
        delta.left = viewportDimensions.left + viewportDimensions.width - rightEdgeOffset
      }
    }

    return delta
  }

  Tooltip.prototype.getTitle = function () {
    var title
    var $e = this.$element
    var o  = this.options

    title = $e.attr('data-original-title')
      || (typeof o.title == 'function' ? o.title.call($e[0]) :  o.title)

    return title
  }

  Tooltip.prototype.getUID = function (prefix) {
    do prefix += ~~(Math.random() * 1000000)
    while (document.getElementById(prefix))
    return prefix
  }

  Tooltip.prototype.tip = function () {
    if (!this.$tip) {
      this.$tip = $(this.options.template)
      if (this.$tip.length != 1) {
        throw new Error(this.type + ' `template` option must consist of exactly 1 top-level element!')
      }
    }
    return this.$tip
  }

  Tooltip.prototype.arrow = function () {
    return (this.$arrow = this.$arrow || this.tip().find('.tooltip-arrow'))
  }

  Tooltip.prototype.enable = function () {
    this.enabled = true
  }

  Tooltip.prototype.disable = function () {
    this.enabled = false
  }

  Tooltip.prototype.toggleEnabled = function () {
    this.enabled = !this.enabled
  }

  Tooltip.prototype.toggle = function (e) {
    var self = this
    if (e) {
      self = $(e.currentTarget).data('bs.' + this.type)
      if (!self) {
        self = new this.constructor(e.currentTarget, this.getDelegateOptions())
        $(e.currentTarget).data('bs.' + this.type, self)
      }
    }

    if (e) {
      self.inState.click = !self.inState.click
      if (self.isInStateTrue()) self.enter(self)
      else self.leave(self)
    } else {
      self.tip().hasClass('in') ? self.leave(self) : self.enter(self)
    }
  }

  Tooltip.prototype.destroy = function () {
    var that = this
    clearTimeout(this.timeout)
    this.hide(function () {
      that.$element.off('.' + that.type).removeData('bs.' + that.type)
      if (that.$tip) {
        that.$tip.detach()
      }
      that.$tip = null
      that.$arrow = null
      that.$viewport = null
    })
  }


  // TOOLTIP PLUGIN DEFINITION
  // =========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.tooltip')
      var options = typeof option == 'object' && option

      if (!data && /destroy|hide/.test(option)) return
      if (!data) $this.data('bs.tooltip', (data = new Tooltip(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.tooltip

  $.fn.tooltip             = Plugin
  $.fn.tooltip.Constructor = Tooltip


  // TOOLTIP NO CONFLICT
  // ===================

  $.fn.tooltip.noConflict = function () {
    $.fn.tooltip = old
    return this
  }

}(jQuery);

/* ========================================================================
 * Bootstrap: popover.js v3.3.6
 * http://getbootstrap.com/javascript/#popovers
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // POPOVER PUBLIC CLASS DEFINITION
  // ===============================

  var Popover = function (element, options) {
    this.init('popover', element, options)
  }

  if (!$.fn.tooltip) throw new Error('Popover requires tooltip.js')

  Popover.VERSION  = '3.3.6'

  Popover.DEFAULTS = $.extend({}, $.fn.tooltip.Constructor.DEFAULTS, {
    placement: 'right',
    trigger: 'click',
    content: '',
    template: '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
  })


  // NOTE: POPOVER EXTENDS tooltip.js
  // ================================

  Popover.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype)

  Popover.prototype.constructor = Popover

  Popover.prototype.getDefaults = function () {
    return Popover.DEFAULTS
  }

  Popover.prototype.setContent = function () {
    var $tip    = this.tip()
    var title   = this.getTitle()
    var content = this.getContent()

    $tip.find('.popover-title')[this.options.html ? 'html' : 'text'](title)
    $tip.find('.popover-content').children().detach().end()[ // we use append for html objects to maintain js events
      this.options.html ? (typeof content == 'string' ? 'html' : 'append') : 'text'
    ](content)

    $tip.removeClass('fade top bottom left right in')

    // IE8 doesn't accept hiding via the `:empty` pseudo selector, we have to do
    // this manually by checking the contents.
    if (!$tip.find('.popover-title').html()) $tip.find('.popover-title').hide()
  }

  Popover.prototype.hasContent = function () {
    return this.getTitle() || this.getContent()
  }

  Popover.prototype.getContent = function () {
    var $e = this.$element
    var o  = this.options

    return $e.attr('data-content')
      || (typeof o.content == 'function' ?
            o.content.call($e[0]) :
            o.content)
  }

  Popover.prototype.arrow = function () {
    return (this.$arrow = this.$arrow || this.tip().find('.arrow'))
  }


  // POPOVER PLUGIN DEFINITION
  // =========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.popover')
      var options = typeof option == 'object' && option

      if (!data && /destroy|hide/.test(option)) return
      if (!data) $this.data('bs.popover', (data = new Popover(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.popover

  $.fn.popover             = Plugin
  $.fn.popover.Constructor = Popover


  // POPOVER NO CONFLICT
  // ===================

  $.fn.popover.noConflict = function () {
    $.fn.popover = old
    return this
  }

}(jQuery);

/* ========================================================================
 * Bootstrap: scrollspy.js v3.3.6
 * http://getbootstrap.com/javascript/#scrollspy
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // SCROLLSPY CLASS DEFINITION
  // ==========================

  function ScrollSpy(element, options) {
    this.$body          = $(document.body)
    this.$scrollElement = $(element).is(document.body) ? $(window) : $(element)
    this.options        = $.extend({}, ScrollSpy.DEFAULTS, options)
    this.selector       = (this.options.target || '') + ' .nav li > a'
    this.offsets        = []
    this.targets        = []
    this.activeTarget   = null
    this.scrollHeight   = 0

    this.$scrollElement.on('scroll.bs.scrollspy', $.proxy(this.process, this))
    this.refresh()
    this.process()
  }

  ScrollSpy.VERSION  = '3.3.6'

  ScrollSpy.DEFAULTS = {
    offset: 10
  }

  ScrollSpy.prototype.getScrollHeight = function () {
    return this.$scrollElement[0].scrollHeight || Math.max(this.$body[0].scrollHeight, document.documentElement.scrollHeight)
  }

  ScrollSpy.prototype.refresh = function () {
    var that          = this
    var offsetMethod  = 'offset'
    var offsetBase    = 0

    this.offsets      = []
    this.targets      = []
    this.scrollHeight = this.getScrollHeight()

    if (!$.isWindow(this.$scrollElement[0])) {
      offsetMethod = 'position'
      offsetBase   = this.$scrollElement.scrollTop()
    }

    this.$body
      .find(this.selector)
      .map(function () {
        var $el   = $(this)
        var href  = $el.data('target') || $el.attr('href')
        var $href = /^#./.test(href) && $(href)

        return ($href
          && $href.length
          && $href.is(':visible')
          && [[$href[offsetMethod]().top + offsetBase, href]]) || null
      })
      .sort(function (a, b) { return a[0] - b[0] })
      .each(function () {
        that.offsets.push(this[0])
        that.targets.push(this[1])
      })
  }

  ScrollSpy.prototype.process = function () {
    var scrollTop    = this.$scrollElement.scrollTop() + this.options.offset
    var scrollHeight = this.getScrollHeight()
    var maxScroll    = this.options.offset + scrollHeight - this.$scrollElement.height()
    var offsets      = this.offsets
    var targets      = this.targets
    var activeTarget = this.activeTarget
    var i

    if (this.scrollHeight != scrollHeight) {
      this.refresh()
    }

    if (scrollTop >= maxScroll) {
      return activeTarget != (i = targets[targets.length - 1]) && this.activate(i)
    }

    if (activeTarget && scrollTop < offsets[0]) {
      this.activeTarget = null
      return this.clear()
    }

    for (i = offsets.length; i--;) {
      activeTarget != targets[i]
        && scrollTop >= offsets[i]
        && (offsets[i + 1] === undefined || scrollTop < offsets[i + 1])
        && this.activate(targets[i])
    }
  }

  ScrollSpy.prototype.activate = function (target) {
    this.activeTarget = target

    this.clear()

    var selector = this.selector +
      '[data-target="' + target + '"],' +
      this.selector + '[href="' + target + '"]'

    var active = $(selector)
      .parents('li')
      .addClass('active')

    if (active.parent('.dropdown-menu').length) {
      active = active
        .closest('li.dropdown')
        .addClass('active')
    }

    active.trigger('activate.bs.scrollspy')
  }

  ScrollSpy.prototype.clear = function () {
    $(this.selector)
      .parentsUntil(this.options.target, '.active')
      .removeClass('active')
  }


  // SCROLLSPY PLUGIN DEFINITION
  // ===========================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.scrollspy')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.scrollspy', (data = new ScrollSpy(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.scrollspy

  $.fn.scrollspy             = Plugin
  $.fn.scrollspy.Constructor = ScrollSpy


  // SCROLLSPY NO CONFLICT
  // =====================

  $.fn.scrollspy.noConflict = function () {
    $.fn.scrollspy = old
    return this
  }


  // SCROLLSPY DATA-API
  // ==================

  $(window).on('load.bs.scrollspy.data-api', function () {
    $('[data-spy="scroll"]').each(function () {
      var $spy = $(this)
      Plugin.call($spy, $spy.data())
    })
  })

}(jQuery);

/* ========================================================================
 * Bootstrap: tab.js v3.3.6
 * http://getbootstrap.com/javascript/#tabs
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // TAB CLASS DEFINITION
  // ====================

  var Tab = function (element) {
    // jscs:disable requireDollarBeforejQueryAssignment
    this.element = $(element)
    // jscs:enable requireDollarBeforejQueryAssignment
  }

  Tab.VERSION = '3.3.6'

  Tab.TRANSITION_DURATION = 150

  Tab.prototype.show = function () {
    var $this    = this.element
    var $ul      = $this.closest('ul:not(.dropdown-menu)')
    var selector = $this.data('target')

    if (!selector) {
      selector = $this.attr('href')
      selector = selector && selector.replace(/.*(?=#[^\s]*$)/, '') // strip for ie7
    }

    if ($this.parent('li').hasClass('active')) return

    var $previous = $ul.find('.active:last a')
    var hideEvent = $.Event('hide.bs.tab', {
      relatedTarget: $this[0]
    })
    var showEvent = $.Event('show.bs.tab', {
      relatedTarget: $previous[0]
    })

    $previous.trigger(hideEvent)
    $this.trigger(showEvent)

    if (showEvent.isDefaultPrevented() || hideEvent.isDefaultPrevented()) return

    var $target = $(selector)

    this.activate($this.closest('li'), $ul)
    this.activate($target, $target.parent(), function () {
      $previous.trigger({
        type: 'hidden.bs.tab',
        relatedTarget: $this[0]
      })
      $this.trigger({
        type: 'shown.bs.tab',
        relatedTarget: $previous[0]
      })
    })
  }

  Tab.prototype.activate = function (element, container, callback) {
    var $active    = container.find('> .active')
    var transition = callback
      && $.support.transition
      && ($active.length && $active.hasClass('fade') || !!container.find('> .fade').length)

    function next() {
      $active
        .removeClass('active')
        .find('> .dropdown-menu > .active')
          .removeClass('active')
        .end()
        .find('[data-toggle="tab"]')
          .attr('aria-expanded', false)

      element
        .addClass('active')
        .find('[data-toggle="tab"]')
          .attr('aria-expanded', true)

      if (transition) {
        element[0].offsetWidth // reflow for transition
        element.addClass('in')
      } else {
        element.removeClass('fade')
      }

      if (element.parent('.dropdown-menu').length) {
        element
          .closest('li.dropdown')
            .addClass('active')
          .end()
          .find('[data-toggle="tab"]')
            .attr('aria-expanded', true)
      }

      callback && callback()
    }

    $active.length && transition ?
      $active
        .one('bsTransitionEnd', next)
        .emulateTransitionEnd(Tab.TRANSITION_DURATION) :
      next()

    $active.removeClass('in')
  }


  // TAB PLUGIN DEFINITION
  // =====================

  function Plugin(option) {
    return this.each(function () {
      var $this = $(this)
      var data  = $this.data('bs.tab')

      if (!data) $this.data('bs.tab', (data = new Tab(this)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.tab

  $.fn.tab             = Plugin
  $.fn.tab.Constructor = Tab


  // TAB NO CONFLICT
  // ===============

  $.fn.tab.noConflict = function () {
    $.fn.tab = old
    return this
  }


  // TAB DATA-API
  // ============

  var clickHandler = function (e) {
    e.preventDefault()
    Plugin.call($(this), 'show')
  }

  $(document)
    .on('click.bs.tab.data-api', '[data-toggle="tab"]', clickHandler)
    .on('click.bs.tab.data-api', '[data-toggle="pill"]', clickHandler)

}(jQuery);

/* ========================================================================
 * Bootstrap: affix.js v3.3.6
 * http://getbootstrap.com/javascript/#affix
 * ========================================================================
 * Copyright 2011-2015 Twitter, Inc.
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 * ======================================================================== */


+function ($) {
  'use strict';

  // AFFIX CLASS DEFINITION
  // ======================

  var Affix = function (element, options) {
    this.options = $.extend({}, Affix.DEFAULTS, options)

    this.$target = $(this.options.target)
      .on('scroll.bs.affix.data-api', $.proxy(this.checkPosition, this))
      .on('click.bs.affix.data-api',  $.proxy(this.checkPositionWithEventLoop, this))

    this.$element     = $(element)
    this.affixed      = null
    this.unpin        = null
    this.pinnedOffset = null

    this.checkPosition()
  }

  Affix.VERSION  = '3.3.6'

  Affix.RESET    = 'affix affix-top affix-bottom'

  Affix.DEFAULTS = {
    offset: 0,
    target: window
  }

  Affix.prototype.getState = function (scrollHeight, height, offsetTop, offsetBottom) {
    var scrollTop    = this.$target.scrollTop()
    var position     = this.$element.offset()
    var targetHeight = this.$target.height()

    if (offsetTop != null && this.affixed == 'top') return scrollTop < offsetTop ? 'top' : false

    if (this.affixed == 'bottom') {
      if (offsetTop != null) return (scrollTop + this.unpin <= position.top) ? false : 'bottom'
      return (scrollTop + targetHeight <= scrollHeight - offsetBottom) ? false : 'bottom'
    }

    var initializing   = this.affixed == null
    var colliderTop    = initializing ? scrollTop : position.top
    var colliderHeight = initializing ? targetHeight : height

    if (offsetTop != null && scrollTop <= offsetTop) return 'top'
    if (offsetBottom != null && (colliderTop + colliderHeight >= scrollHeight - offsetBottom)) return 'bottom'

    return false
  }

  Affix.prototype.getPinnedOffset = function () {
    if (this.pinnedOffset) return this.pinnedOffset
    this.$element.removeClass(Affix.RESET).addClass('affix')
    var scrollTop = this.$target.scrollTop()
    var position  = this.$element.offset()
    return (this.pinnedOffset = position.top - scrollTop)
  }

  Affix.prototype.checkPositionWithEventLoop = function () {
    setTimeout($.proxy(this.checkPosition, this), 1)
  }

  Affix.prototype.checkPosition = function () {
    if (!this.$element.is(':visible')) return

    var height       = this.$element.height()
    var offset       = this.options.offset
    var offsetTop    = offset.top
    var offsetBottom = offset.bottom
    var scrollHeight = Math.max($(document).height(), $(document.body).height())

    if (typeof offset != 'object')         offsetBottom = offsetTop = offset
    if (typeof offsetTop == 'function')    offsetTop    = offset.top(this.$element)
    if (typeof offsetBottom == 'function') offsetBottom = offset.bottom(this.$element)

    var affix = this.getState(scrollHeight, height, offsetTop, offsetBottom)

    if (this.affixed != affix) {
      if (this.unpin != null) this.$element.css('top', '')

      var affixType = 'affix' + (affix ? '-' + affix : '')
      var e         = $.Event(affixType + '.bs.affix')

      this.$element.trigger(e)

      if (e.isDefaultPrevented()) return

      this.affixed = affix
      this.unpin = affix == 'bottom' ? this.getPinnedOffset() : null

      this.$element
        .removeClass(Affix.RESET)
        .addClass(affixType)
        .trigger(affixType.replace('affix', 'affixed') + '.bs.affix')
    }

    if (affix == 'bottom') {
      this.$element.offset({
        top: scrollHeight - height - offsetBottom
      })
    }
  }


  // AFFIX PLUGIN DEFINITION
  // =======================

  function Plugin(option) {
    return this.each(function () {
      var $this   = $(this)
      var data    = $this.data('bs.affix')
      var options = typeof option == 'object' && option

      if (!data) $this.data('bs.affix', (data = new Affix(this, options)))
      if (typeof option == 'string') data[option]()
    })
  }

  var old = $.fn.affix

  $.fn.affix             = Plugin
  $.fn.affix.Constructor = Affix


  // AFFIX NO CONFLICT
  // =================

  $.fn.affix.noConflict = function () {
    $.fn.affix = old
    return this
  }


  // AFFIX DATA-API
  // ==============

  $(window).on('load', function () {
    $('[data-spy="affix"]').each(function () {
      var $spy = $(this)
      var data = $spy.data()

      data.offset = data.offset || {}

      if (data.offsetBottom != null) data.offset.bottom = data.offsetBottom
      if (data.offsetTop    != null) data.offset.top    = data.offsetTop

      Plugin.call($spy, data)
    })
  })

}(jQuery);

define("bootstrap", function(){});

(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/ui/dynamicTab',['jquery', '../base/coreUtil', 'bootstrap'], factory);
    } else {
        factory(jQuery, kb_coreUtil);
    }
}(function ($, coreUtil) {
    "use strict";

    $.fn.dynamicTab = function () {
        var $parent = this;
        var $dynamicTabs = this.find('.nav[data-dynamic-tab]');
        var $allButtons = $parent.find('[data-tab-toggle]');

        $dynamicTabs.each(function (i, el) {
            var $nav = $(el);
            var group = $nav.attr('data-dynamic-tab');

            var $content = $parent.find('.tab-content[data-dynamic-tab=' + group + ']');
            var $buttons = $allButtons.filter('[data-for=' + group + ']');
            var $tabs = $nav.find('[data-toggle=tab]');
            var $panels = $content.find('.tab-pane');

            $tabs.on('shown.ver.tab', function (e) {
                var idx = $(e.target).closest('.nav-item').index();
                var $prev = $buttons.filter('[data-tab-toggle=prev]');
                var $next = $buttons.filter('[data-tab-toggle=next]');

                $prev.prop('diabled', false);
                $next.prop('diabled', false);
                if (idx === 0) {
                    $prev.prop('disabled', true);
                }
                if (idx === $tabs.length - 1) {
                    $next.prop('disabled', true);
                }
            });

            $tabs.each(function (i, tab) {
                var rstr = coreUtil.randomString();
                var $thePane = $($panels.get(i));
                var $theTab = $(tab);

                $theTab.attr('href', '#' + rstr);
                $thePane.attr('id', rstr);

                // 动态设置 form-invalid-tag

                var $form = $thePane.find('[data-validate-form]');
                var formName = $form.data('validate-form');
                if (coreUtil.isFalsy(formName)) {
                    $form.attr('data-validate-form', rstr);
                }

                var $formtag = $theTab.find('.form-invalid-tag');
                var formForName = $formtag.data('for');
                if (coreUtil.isFalsy(formForName)) {
                    $formtag.attr('data-for', rstr);
                }

            });
        });

        // toggle
        $allButtons.on('click.ver.tab.data-api', function (e) {
            var $target = $(this);
            var direction = $target.data('tab-toggle');
            var tabName = $target.data('for');
            var $tab = $('[data-dynamic-tab="' + tabName + '"]');

            $tab.find('.active')[direction]().find('[data-toggle=tab]').tab('show');
        });
    }

}));


(function (factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/ui/submenu',['jquery'], factory);
    } else {
        factory(jQuery);
    }
}(function ($) {
    "use strict";

    var pluginName = "submenu";
    var defaults = {};
    var MIN_CLASS = 'menu-vertical-min';

    function Plugin(element, options) {
        this.element = element;
        this.minimized = $(this.element).hasClass(MIN_CLASS);
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        this.toggleIcons = ['fa-angle-double-left', 'fa-angle-double-right'];
        this.submenuCls = '.menu-submenu';
        this.init();
    }

    $.extend(Plugin.prototype, {
        init: function () {
            var $navlist = $(this.element).find('.menu-nav');
            var $toggle = $(this.element).find('.menu-toggle');
            var me = this;

            // 初始化子级指示器
            $.each($navlist.find('li'), function (i, li) {
                var $li = $(li);
                var $submenu = $li.children(me.submenuCls);
                var $ddtoggle = $li.children('.dropdown-toggle');
                if ($submenu.length > 0) {
                    if ($ddtoggle.children('.menu-child_indicator').length === 0) {
                        $ddtoggle.append('<b class="menu-child_indicator fa"></b>');
                    }
                }
            });

            // 点击事件
            $navlist.on('click', 'a', function (e) {
                e.preventDefault();
                var $link = $(e.currentTarget);
                var $li = $link.parent();

                // 无子菜单则直接激活
                if ($li.children('.menu-submenu').length === 0) {
                    me.active($li);
                }

                // 有子菜单则视情况打开子菜单
                if ($link.hasClass('dropdown-toggle')) {
                    if (me.minimized || $li.hasClass('hover')) {
                        return;
                    }
                    me.toggleDisplay($li);
                }

            });

            // 切换显示模式
            $toggle.on('click', function (e) {
                e.preventDefault();
                if (me.minimized) {
                    $(me.element).removeClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[1]).addClass(me.toggleIcons[0]);
                } else {
                    $(me.element).addClass(MIN_CLASS);
                    $toggle.children().removeClass(me.toggleIcons[0]).addClass(me.toggleIcons[1]);
                    // 隐藏所有submenu
                    //$(me.element).find('.submenu').hide();
                }
                me.minimized = !me.minimized;
            });
        },
        toggleDisplay: function ($li) {
            if ($li.hasClass('open')) {
                this._toggleSubmenu($li, 'hide');
            } else {
                this._toggleSubmenu($li, 'show');
                this._toggleSubmenu($li.siblings('.open'), 'hide');
            }
        },
        _toggleSubmenu: function ($item, mode, callback) {
            var me = this;
            var animate = 'slideDown';
            var openHd = 'addClass';
            callback || (callback = function () { });

            if (mode === 'hide') {
                animate = 'slideUp';
                openHd = 'removeClass';
            }

            $item.children(this.submenuCls)[animate]('fast', function () {
                $item[openHd]('open');

                callback();
            });
            return this;
        },
        active: function (selector) {
            $(this.element).find('.active').removeClass('active');
            $(selector).addClass('active')
                .parentsUntil(this.element, 'li').addClass('active');
        }
    });

    $.fn[pluginName] = function (options) {
        return this.each(function () {

            var $this = $(this);
            var data = $this.data('plugin_' + pluginName);

            if (!data) {
                $this.data('plugin_' + pluginName, (data = new Plugin(this, options)))
            }

            if (typeof options == 'string') {
                data[options]();
            }

        });
    };
}));

!function(root, factory) {
	 if (typeof define === 'function' && define.amd) {
		 define('noty',['jquery'], factory);
	 } else if (typeof exports === 'object') {
		 module.exports = factory(require('jquery'));
	 } else {
		 factory(root.jQuery);
	 }
}(this, function($) {

/*!
 @package noty - jQuery Notification Plugin
 @version version: 2.3.8
 @contributors https://github.com/needim/noty/graphs/contributors

 @documentation Examples and Documentation - http://needim.github.com/noty/

 @license Licensed under the MIT licenses: http://www.opensource.org/licenses/mit-license.php
 */

    if(typeof Object.create !== 'function') {
        Object.create = function(o) {
            function F() {
            }

            F.prototype = o;
            return new F();
        };
    }

    var NotyObject = {

        init: function(options) {

            // Mix in the passed in options with the default options
            this.options = $.extend({}, $.noty.defaults, options);

            this.options.layout = (this.options.custom) ? $.noty.layouts['inline'] : $.noty.layouts[this.options.layout];

            if($.noty.themes[this.options.theme])
                this.options.theme = $.noty.themes[this.options.theme];
            else
                this.options.themeClassName = this.options.theme;

            this.options = $.extend({}, this.options, this.options.layout.options);
            this.options.id = 'noty_' + (new Date().getTime() * Math.floor(Math.random() * 1000000));

            // Build the noty dom initial structure
            this._build();

            // return this so we can chain/use the bridge with less code.
            return this;
        }, // end init

        _build: function() {

            // Generating noty bar
            var $bar = $('<div class="noty_bar noty_type_' + this.options.type + '"></div>').attr('id', this.options.id);
            $bar.append(this.options.template).find('.noty_text').html(this.options.text);

            this.$bar = (this.options.layout.parent.object !== null) ? $(this.options.layout.parent.object).css(this.options.layout.parent.css).append($bar) : $bar;

            if(this.options.themeClassName)
                this.$bar.addClass(this.options.themeClassName).addClass('noty_container_type_' + this.options.type);

            // Set buttons if available
            if(this.options.buttons) {

                // If we have button disable closeWith & timeout options
                this.options.closeWith = [];
                this.options.timeout = false;

                var $buttons = $('<div/>').addClass('noty_buttons');

                (this.options.layout.parent.object !== null) ? this.$bar.find('.noty_bar').append($buttons) : this.$bar.append($buttons);

                var self = this;

                $.each(this.options.buttons, function(i, button) {
                    var $button = $('<button/>').addClass((button.addClass) ? button.addClass : 'gray').html(button.text).attr('id', button.id ? button.id : 'button-' + i)
                        .attr('title', button.title)
                        .appendTo(self.$bar.find('.noty_buttons'))
                        .on('click', function(event) {
                            if($.isFunction(button.onClick)) {
                                button.onClick.call($button, self, event);
                            }
                        });
                });
            }

            // For easy access
            this.$message = this.$bar.find('.noty_message');
            this.$closeButton = this.$bar.find('.noty_close');
            this.$buttons = this.$bar.find('.noty_buttons');

            $.noty.store[this.options.id] = this; // store noty for api

        }, // end _build

        show: function() {

            var self = this;

            (self.options.custom) ? self.options.custom.find(self.options.layout.container.selector).append(self.$bar) : $(self.options.layout.container.selector).append(self.$bar);

            if(self.options.theme && self.options.theme.style)
                self.options.theme.style.apply(self);

            ($.type(self.options.layout.css) === 'function') ? this.options.layout.css.apply(self.$bar) : self.$bar.css(this.options.layout.css || {});

            self.$bar.addClass(self.options.layout.addClass);

            self.options.layout.container.style.apply($(self.options.layout.container.selector), [self.options.within]);

            self.showing = true;

            if(self.options.theme && self.options.theme.style)
                self.options.theme.callback.onShow.apply(this);

            if($.inArray('click', self.options.closeWith) > -1)
                self.$bar.css('cursor', 'pointer').one('click', function(evt) {
                    self.stopPropagation(evt);
                    if(self.options.callback.onCloseClick) {
                        self.options.callback.onCloseClick.apply(self);
                    }
                    self.close();
                });

            if($.inArray('hover', self.options.closeWith) > -1)
                self.$bar.one('mouseenter', function() {
                    self.close();
                });

            if($.inArray('button', self.options.closeWith) > -1)
                self.$closeButton.one('click', function(evt) {
                    self.stopPropagation(evt);
                    self.close();
                });

            if($.inArray('button', self.options.closeWith) == -1)
                self.$closeButton.remove();

            if(self.options.callback.onShow)
                self.options.callback.onShow.apply(self);

            if (typeof self.options.animation.open == 'string') {
                self.$bar.css('height', self.$bar.innerHeight());
                self.$bar.on('click',function(e){
                    self.wasClicked = true;
                });
                self.$bar.show().addClass(self.options.animation.open).one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function() {
                    if(self.options.callback.afterShow) self.options.callback.afterShow.apply(self);
                    self.showing = false;
                    self.shown = true;
                    if(self.hasOwnProperty('wasClicked')){
                        self.$bar.off('click',function(e){
                            self.wasClicked = true;
                        });
                        self.close();
                    }
                });

            } else {
                self.$bar.animate(
                    self.options.animation.open,
                    self.options.animation.speed,
                    self.options.animation.easing,
                    function() {
                        if(self.options.callback.afterShow) self.options.callback.afterShow.apply(self);
                        self.showing = false;
                        self.shown = true;
                    });
            }

            // If noty is have a timeout option
            if(self.options.timeout)
                self.$bar.delay(self.options.timeout).promise().done(function() {
                    self.close();
                });

            return this;

        }, // end show

        close: function() {

            if(this.closed) return;
            if(this.$bar && this.$bar.hasClass('i-am-closing-now')) return;

            var self = this;

            if(this.showing) {
                self.$bar.queue(
                    function() {
                        self.close.apply(self);
                    }
                );
                return;
            }

            if(!this.shown && !this.showing) { // If we are still waiting in the queue just delete from queue
                var queue = [];
                $.each($.noty.queue, function(i, n) {
                    if(n.options.id != self.options.id) {
                        queue.push(n);
                    }
                });
                $.noty.queue = queue;
                return;
            }

            self.$bar.addClass('i-am-closing-now');

            if(self.options.callback.onClose) {
                self.options.callback.onClose.apply(self);
            }

            if (typeof self.options.animation.close == 'string') {
                self.$bar.addClass(self.options.animation.close).one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function() {
                    if(self.options.callback.afterClose) self.options.callback.afterClose.apply(self);
                    self.closeCleanUp();
                });
            } else {
                self.$bar.clearQueue().stop().animate(
                    self.options.animation.close,
                    self.options.animation.speed,
                    self.options.animation.easing,
                    function() {
                        if(self.options.callback.afterClose) self.options.callback.afterClose.apply(self);
                    })
                    .promise().done(function() {
                        self.closeCleanUp();
                    });
            }

        }, // end close

        closeCleanUp: function() {

            var self = this;

            // Modal Cleaning
            if(self.options.modal) {
                $.notyRenderer.setModalCount(-1);
                if($.notyRenderer.getModalCount() == 0) $('.noty_modal').fadeOut(self.options.animation.fadeSpeed, function() {
                    $(this).remove();
                });
            }

            // Layout Cleaning
            $.notyRenderer.setLayoutCountFor(self, -1);
            if($.notyRenderer.getLayoutCountFor(self) == 0) $(self.options.layout.container.selector).remove();

            // Make sure self.$bar has not been removed before attempting to remove it
            if(typeof self.$bar !== 'undefined' && self.$bar !== null) {

                if (typeof self.options.animation.close == 'string') {
                    self.$bar.css('transition', 'all 100ms ease').css('border', 0).css('margin', 0).height(0);
                    self.$bar.one('transitionend webkitTransitionEnd oTransitionEnd MSTransitionEnd', function() {
                        self.$bar.remove();
                        self.$bar = null;
                        self.closed = true;

                        if(self.options.theme.callback && self.options.theme.callback.onClose) {
                            self.options.theme.callback.onClose.apply(self);
                        }
                    });
                } else {
                    self.$bar.remove();
                    self.$bar = null;
                    self.closed = true;
                }
            }

            delete $.noty.store[self.options.id]; // deleting noty from store

            if(self.options.theme.callback && self.options.theme.callback.onClose) {
                self.options.theme.callback.onClose.apply(self);
            }

            if(!self.options.dismissQueue) {
                // Queue render
                $.noty.ontap = true;

                $.notyRenderer.render();
            }

            if(self.options.maxVisible > 0 && self.options.dismissQueue) {
                $.notyRenderer.render();
            }

        }, // end close clean up

        setText: function(text) {
            if(!this.closed) {
                this.options.text = text;
                this.$bar.find('.noty_text').html(text);
            }
            return this;
        },

        setType: function(type) {
            if(!this.closed) {
                this.options.type = type;
                this.options.theme.style.apply(this);
                this.options.theme.callback.onShow.apply(this);
            }
            return this;
        },

        setTimeout: function(time) {
            if(!this.closed) {
                var self = this;
                this.options.timeout = time;
                self.$bar.delay(self.options.timeout).promise().done(function() {
                    self.close();
                });
            }
            return this;
        },

        stopPropagation: function(evt) {
            evt = evt || window.event;
            if(typeof evt.stopPropagation !== "undefined") {
                evt.stopPropagation();
            }
            else {
                evt.cancelBubble = true;
            }
        },

        closed : false,
        showing: false,
        shown  : false

    }; // end NotyObject

    $.notyRenderer = {};

    $.notyRenderer.init = function(options) {

        // Renderer creates a new noty
        var notification = Object.create(NotyObject).init(options);

        if(notification.options.killer)
            $.noty.closeAll();

        (notification.options.force) ? $.noty.queue.unshift(notification) : $.noty.queue.push(notification);

        $.notyRenderer.render();

        return ($.noty.returns == 'object') ? notification : notification.options.id;
    };

    $.notyRenderer.render = function() {

        var instance = $.noty.queue[0];

        if($.type(instance) === 'object') {
            if(instance.options.dismissQueue) {
                if(instance.options.maxVisible > 0) {
                    if($(instance.options.layout.container.selector + ' > li').length < instance.options.maxVisible) {
                        $.notyRenderer.show($.noty.queue.shift());
                    }
                    else {

                    }
                }
                else {
                    $.notyRenderer.show($.noty.queue.shift());
                }
            }
            else {
                if($.noty.ontap) {
                    $.notyRenderer.show($.noty.queue.shift());
                    $.noty.ontap = false;
                }
            }
        }
        else {
            $.noty.ontap = true; // Queue is over
        }

    };

    $.notyRenderer.show = function(notification) {

        if(notification.options.modal) {
            $.notyRenderer.createModalFor(notification);
            $.notyRenderer.setModalCount(+1);
        }

        // Where is the container?
        if(notification.options.custom) {
            if(notification.options.custom.find(notification.options.layout.container.selector).length == 0) {
                notification.options.custom.append($(notification.options.layout.container.object).addClass('i-am-new'));
            }
            else {
                notification.options.custom.find(notification.options.layout.container.selector).removeClass('i-am-new');
            }
        }
        else {
            if($(notification.options.layout.container.selector).length == 0) {
                $('body').append($(notification.options.layout.container.object).addClass('i-am-new'));
            }
            else {
                $(notification.options.layout.container.selector).removeClass('i-am-new');
            }
        }

        $.notyRenderer.setLayoutCountFor(notification, +1);

        notification.show();
    };

    $.notyRenderer.createModalFor = function(notification) {
        if($('.noty_modal').length == 0) {
            var modal = $('<div/>').addClass('noty_modal').addClass(notification.options.theme).data('noty_modal_count', 0);

            if(notification.options.theme.modal && notification.options.theme.modal.css)
                modal.css(notification.options.theme.modal.css);

            modal.prependTo($('body')).fadeIn(notification.options.animation.fadeSpeed);

            if($.inArray('backdrop', notification.options.closeWith) > -1)
                modal.on('click', function(e) {
                    $.noty.closeAll();
                });
        }
    };

    $.notyRenderer.getLayoutCountFor = function(notification) {
        return $(notification.options.layout.container.selector).data('noty_layout_count') || 0;
    };

    $.notyRenderer.setLayoutCountFor = function(notification, arg) {
        return $(notification.options.layout.container.selector).data('noty_layout_count', $.notyRenderer.getLayoutCountFor(notification) + arg);
    };

    $.notyRenderer.getModalCount = function() {
        return $('.noty_modal').data('noty_modal_count') || 0;
    };

    $.notyRenderer.setModalCount = function(arg) {
        return $('.noty_modal').data('noty_modal_count', $.notyRenderer.getModalCount() + arg);
    };

    // This is for custom container
    $.fn.noty = function(options) {
        options.custom = $(this);
        return $.notyRenderer.init(options);
    };

    $.noty = {};
    $.noty.queue = [];
    $.noty.ontap = true;
    $.noty.layouts = {};
    $.noty.themes = {};
    $.noty.returns = 'object';
    $.noty.store = {};

    $.noty.get = function(id) {
        return $.noty.store.hasOwnProperty(id) ? $.noty.store[id] : false;
    };

    $.noty.close = function(id) {
        return $.noty.get(id) ? $.noty.get(id).close() : false;
    };

    $.noty.setText = function(id, text) {
        return $.noty.get(id) ? $.noty.get(id).setText(text) : false;
    };

    $.noty.setType = function(id, type) {
        return $.noty.get(id) ? $.noty.get(id).setType(type) : false;
    };

    $.noty.clearQueue = function() {
        $.noty.queue = [];
    };

    $.noty.closeAll = function() {
        $.noty.clearQueue();
        $.each($.noty.store, function(id, noty) {
            noty.close();
        });
    };

    var windowAlert = window.alert;

    $.noty.consumeAlert = function(options) {
        window.alert = function(text) {
            if(options)
                options.text = text;
            else
                options = {text: text};

            $.notyRenderer.init(options);
        };
    };

    $.noty.stopConsumeAlert = function() {
        window.alert = windowAlert;
    };

    $.noty.defaults = {
        layout      : 'top',
        theme       : 'defaultTheme',
        type        : 'alert',
        text        : '',
        dismissQueue: true,
        template    : '<div class="noty_message"><span class="noty_text"></span><div class="noty_close"></div></div>',
        animation   : {
            open  : {height: 'toggle'},
            close : {height: 'toggle'},
            easing: 'swing',
            speed : 500,
            fadeSpeed: 'fast',
        },
        timeout     : false,
        force       : false,
        modal       : false,
        maxVisible  : 5,
        killer      : false,
        closeWith   : ['click'],
        callback    : {
            onShow      : function() {
            },
            afterShow   : function() {
            },
            onClose     : function() {
            },
            afterClose  : function() {
            },
            onCloseClick: function() {
            }
        },
        buttons     : false
    };

    $(window).on('resize', function() {
        $.each($.noty.layouts, function(index, layout) {
            layout.container.style.apply($(layout.container.selector));
        });
    });

    // Helpers
    window.noty = function noty(options) {
        return $.notyRenderer.init(options);
    };

$.noty.layouts.bottom = {
    name     : 'bottom',
    options  : {},
    container: {
        object  : '<ul id="noty_bottom_layout_container" />',
        selector: 'ul#noty_bottom_layout_container',
        style   : function() {
            $(this).css({
                bottom       : 0,
                left         : '5%',
                position     : 'fixed',
                width        : '90%',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 9999999
            });
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none'
    },
    addClass : ''
};

$.noty.layouts.bottomCenter = {
    name     : 'bottomCenter',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_bottomCenter_layout_container" />',
        selector: 'ul#noty_bottomCenter_layout_container',
        style   : function() {
            $(this).css({
                bottom       : 20,
                left         : 0,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            $(this).css({
                left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px'
            });
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};


$.noty.layouts.bottomLeft = {
    name     : 'bottomLeft',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_bottomLeft_layout_container" />',
        selector: 'ul#noty_bottomLeft_layout_container',
        style   : function() {
            $(this).css({
                bottom       : 20,
                left         : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            if(window.innerWidth < 600) {
                $(this).css({
                    left: 5
                });
            }
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.layouts.bottomRight = {
    name     : 'bottomRight',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_bottomRight_layout_container" />',
        selector: 'ul#noty_bottomRight_layout_container',
        style   : function() {
            $(this).css({
                bottom       : 20,
                right        : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            if(window.innerWidth < 600) {
                $(this).css({
                    right: 5
                });
            }
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.layouts.center = {
    name     : 'center',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_center_layout_container" />',
        selector: 'ul#noty_center_layout_container',
        style   : function() {
            $(this).css({
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            // getting hidden height
            var dupe = $(this).clone().css({visibility: "hidden", display: "block", position: "absolute", top: 0, left: 0}).attr('id', 'dupe');
            $("body").append(dupe);
            dupe.find('.i-am-closing-now').remove();
            dupe.find('li').css('display', 'block');
            var actual_height = dupe.height();
            dupe.remove();

            if($(this).hasClass('i-am-new')) {
                $(this).css({
                    left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px',
                    top : ($(window).height() - actual_height) / 2 + 'px'
                });
            }
            else {
                $(this).animate({
                    left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px',
                    top : ($(window).height() - actual_height) / 2 + 'px'
                }, 500);
            }

        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.layouts.centerLeft = {
    name     : 'centerLeft',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_centerLeft_layout_container" />',
        selector: 'ul#noty_centerLeft_layout_container',
        style   : function() {
            $(this).css({
                left         : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            // getting hidden height
            var dupe = $(this).clone().css({visibility: "hidden", display: "block", position: "absolute", top: 0, left: 0}).attr('id', 'dupe');
            $("body").append(dupe);
            dupe.find('.i-am-closing-now').remove();
            dupe.find('li').css('display', 'block');
            var actual_height = dupe.height();
            dupe.remove();

            if($(this).hasClass('i-am-new')) {
                $(this).css({
                    top: ($(window).height() - actual_height) / 2 + 'px'
                });
            }
            else {
                $(this).animate({
                    top: ($(window).height() - actual_height) / 2 + 'px'
                }, 500);
            }

            if(window.innerWidth < 600) {
                $(this).css({
                    left: 5
                });
            }

        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};

$.noty.layouts.centerRight = {
    name     : 'centerRight',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_centerRight_layout_container" />',
        selector: 'ul#noty_centerRight_layout_container',
        style   : function() {
            $(this).css({
                right        : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            // getting hidden height
            var dupe = $(this).clone().css({visibility: "hidden", display: "block", position: "absolute", top: 0, left: 0}).attr('id', 'dupe');
            $("body").append(dupe);
            dupe.find('.i-am-closing-now').remove();
            dupe.find('li').css('display', 'block');
            var actual_height = dupe.height();
            dupe.remove();

            if($(this).hasClass('i-am-new')) {
                $(this).css({
                    top: ($(window).height() - actual_height) / 2 + 'px'
                });
            }
            else {
                $(this).animate({
                    top: ($(window).height() - actual_height) / 2 + 'px'
                }, 500);
            }

            if(window.innerWidth < 600) {
                $(this).css({
                    right: 5
                });
            }

        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.layouts.inline = {
    name     : 'inline',
    options  : {},
    container: {
        object  : '<ul class="noty_inline_layout_container" />',
        selector: 'ul.noty_inline_layout_container',
        style   : function() {
            $(this).css({
                width        : '100%',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 9999999
            });
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none'
    },
    addClass : ''
};
$.noty.layouts.top = {
    name     : 'top',
    options  : {},
    container: {
        object  : '<ul id="noty_top_layout_container" />',
        selector: 'ul#noty_top_layout_container',
        style   : function() {
            $(this).css({
                top          : 0,
                left         : '5%',
                position     : 'fixed',
                width        : '90%',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 9999999
            });
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none'
    },
    addClass : ''
};
$.noty.layouts.topCenter = {
    name     : 'topCenter',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_topCenter_layout_container" />',
        selector: 'ul#noty_topCenter_layout_container',
        style   : function() {
            $(this).css({
                top          : 20,
                left         : 0,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            $(this).css({
                left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px'
            });
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};

$.noty.layouts.topLeft = {
    name     : 'topLeft',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_topLeft_layout_container" />',
        selector: 'ul#noty_topLeft_layout_container',
        style   : function() {
            $(this).css({
                top          : 20,
                left         : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            if(window.innerWidth < 600) {
                $(this).css({
                    left: 5
                });
            }
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.layouts.topRight = {
    name     : 'topRight',
    options  : { // overrides options

    },
    container: {
        object  : '<ul id="noty_topRight_layout_container" />',
        selector: 'ul#noty_topRight_layout_container',
        style   : function() {
            $(this).css({
                top          : 20,
                right        : 20,
                position     : 'fixed',
                width        : '310px',
                height       : 'auto',
                margin       : 0,
                padding      : 0,
                listStyleType: 'none',
                zIndex       : 10000000
            });

            if(window.innerWidth < 600) {
                $(this).css({
                    right: 5
                });
            }
        }
    },
    parent   : {
        object  : '<li />',
        selector: 'li',
        css     : {}
    },
    css      : {
        display: 'none',
        width  : '310px'
    },
    addClass : ''
};
$.noty.themes.bootstrapTheme = {
    name: 'bootstrapTheme',
    modal: {
        css: {
            position: 'fixed',
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            zIndex: 10000,
            opacity: 0.6,
            display: 'none',
            left: 0,
            top: 0
        }
    },
    style: function() {

        var containerSelector = this.options.layout.container.selector;
        $(containerSelector).addClass('list-group');

        this.$closeButton.append('<span aria-hidden="true">&times;</span><span class="sr-only">Close</span>');
        this.$closeButton.addClass('close');

        this.$bar.addClass( "list-group-item" ).css('padding', '0px');

        switch (this.options.type) {
            case 'alert': case 'notification':
                this.$bar.addClass( "list-group-item-info" );
                break;
            case 'warning':
                this.$bar.addClass( "list-group-item-warning" );
                break;
            case 'error':
                this.$bar.addClass( "list-group-item-danger" );
                break;
            case 'information':
                this.$bar.addClass("list-group-item-info");
                break;
            case 'success':
                this.$bar.addClass( "list-group-item-success" );
                break;
        }

        this.$message.css({
            fontSize: '13px',
            lineHeight: '16px',
            textAlign: 'center',
            padding: '8px 10px 9px',
            width: 'auto',
            position: 'relative'
        });
    },
    callback: {
        onShow: function() {  },
        onClose: function() {  }
    }
};


$.noty.themes.defaultTheme = {
    name    : 'defaultTheme',
    helpers : {
        borderFix: function() {
            if(this.options.dismissQueue) {
                var selector = this.options.layout.container.selector + ' ' + this.options.layout.parent.selector;
                switch(this.options.layout.name) {
                    case 'top':
                        $(selector).css({borderRadius: '0px 0px 0px 0px'});
                        $(selector).last().css({borderRadius: '0px 0px 5px 5px'});
                        break;
                    case 'topCenter':
                    case 'topLeft':
                    case 'topRight':
                    case 'bottomCenter':
                    case 'bottomLeft':
                    case 'bottomRight':
                    case 'center':
                    case 'centerLeft':
                    case 'centerRight':
                    case 'inline':
                        $(selector).css({borderRadius: '0px 0px 0px 0px'});
                        $(selector).first().css({'border-top-left-radius': '5px', 'border-top-right-radius': '5px'});
                        $(selector).last().css({'border-bottom-left-radius': '5px', 'border-bottom-right-radius': '5px'});
                        break;
                    case 'bottom':
                        $(selector).css({borderRadius: '0px 0px 0px 0px'});
                        $(selector).first().css({borderRadius: '5px 5px 0px 0px'});
                        break;
                    default:
                        break;
                }
            }
        }
    },
    modal   : {
        css: {
            position       : 'fixed',
            width          : '100%',
            height         : '100%',
            backgroundColor: '#000',
            zIndex         : 10000,
            opacity        : 0.6,
            display        : 'none',
            left           : 0,
            top            : 0
        }
    },
    style   : function() {

        this.$bar.css({
            overflow  : 'hidden',
            background: "url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABsAAAAoCAQAAAClM0ndAAAAhklEQVR4AdXO0QrCMBBE0bttkk38/w8WRERpdyjzVOc+HxhIHqJGMQcFFkpYRQotLLSw0IJ5aBdovruMYDA/kT8plF9ZKLFQcgF18hDj1SbQOMlCA4kao0iiXmah7qBWPdxpohsgVZyj7e5I9KcID+EhiDI5gxBYKLBQYKHAQoGFAoEks/YEGHYKB7hFxf0AAAAASUVORK5CYII=') repeat-x scroll left top #fff"
        });

        this.$message.css({
            fontSize  : '13px',
            lineHeight: '16px',
            textAlign : 'center',
            padding   : '8px 10px 9px',
            width     : 'auto',
            position  : 'relative'
        });

        this.$closeButton.css({
            position  : 'absolute',
            top       : 4, right: 4,
            width     : 10, height: 10,
            background: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAAxUlEQVR4AR3MPUoDURSA0e++uSkkOxC3IAOWNtaCIDaChfgXBMEZbQRByxCwk+BasgQRZLSYoLgDQbARxry8nyumPcVRKDfd0Aa8AsgDv1zp6pYd5jWOwhvebRTbzNNEw5BSsIpsj/kurQBnmk7sIFcCF5yyZPDRG6trQhujXYosaFoc+2f1MJ89uc76IND6F9BvlXUdpb6xwD2+4q3me3bysiHvtLYrUJto7PD/ve7LNHxSg/woN2kSz4txasBdhyiz3ugPGetTjm3XRokAAAAASUVORK5CYII=)",
            display   : 'none',
            cursor    : 'pointer'
        });

        this.$buttons.css({
            padding        : 5,
            textAlign      : 'right',
            borderTop      : '1px solid #ccc',
            backgroundColor: '#fff'
        });

        this.$buttons.find('button').css({
            marginLeft: 5
        });

        this.$buttons.find('button:first').css({
            marginLeft: 0
        });

        this.$bar.on({
            mouseenter: function() {
                $(this).find('.noty_close').stop().fadeTo('normal', 1);
            },
            mouseleave: function() {
                $(this).find('.noty_close').stop().fadeTo('normal', 0);
            }
        });

        switch(this.options.layout.name) {
            case 'top':
                this.$bar.css({
                    borderRadius: '0px 0px 5px 5px',
                    borderBottom: '2px solid #eee',
                    borderLeft  : '2px solid #eee',
                    borderRight : '2px solid #eee',
                    boxShadow   : "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
            case 'topCenter':
            case 'center':
            case 'bottomCenter':
            case 'inline':
                this.$bar.css({
                    borderRadius: '5px',
                    border      : '1px solid #eee',
                    boxShadow   : "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                this.$message.css({fontSize: '13px', textAlign: 'center'});
                break;
            case 'topLeft':
            case 'topRight':
            case 'bottomLeft':
            case 'bottomRight':
            case 'centerLeft':
            case 'centerRight':
                this.$bar.css({
                    borderRadius: '5px',
                    border      : '1px solid #eee',
                    boxShadow   : "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                this.$message.css({fontSize: '13px', textAlign: 'left'});
                break;
            case 'bottom':
                this.$bar.css({
                    borderRadius: '5px 5px 0px 0px',
                    borderTop   : '2px solid #eee',
                    borderLeft  : '2px solid #eee',
                    borderRight : '2px solid #eee',
                    boxShadow   : "0 -2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
            default:
                this.$bar.css({
                    border   : '2px solid #eee',
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
        }

        switch(this.options.type) {
            case 'alert':
            case 'notification':
                this.$bar.css({backgroundColor: '#FFF', borderColor: '#CCC', color: '#444'});
                break;
            case 'warning':
                this.$bar.css({backgroundColor: '#FFEAA8', borderColor: '#FFC237', color: '#826200'});
                this.$buttons.css({borderTop: '1px solid #FFC237'});
                break;
            case 'error':
                this.$bar.css({backgroundColor: 'red', borderColor: 'darkred', color: '#FFF'});
                this.$message.css({fontWeight: 'bold'});
                this.$buttons.css({borderTop: '1px solid darkred'});
                break;
            case 'information':
                this.$bar.css({backgroundColor: '#57B7E2', borderColor: '#0B90C4', color: '#FFF'});
                this.$buttons.css({borderTop: '1px solid #0B90C4'});
                break;
            case 'success':
                this.$bar.css({backgroundColor: 'lightgreen', borderColor: '#50C24E', color: 'darkgreen'});
                this.$buttons.css({borderTop: '1px solid #50C24E'});
                break;
            default:
                this.$bar.css({backgroundColor: '#FFF', borderColor: '#CCC', color: '#444'});
                break;
        }
    },
    callback: {
        onShow : function() {
            $.noty.themes.defaultTheme.helpers.borderFix.apply(this);
        },
        onClose: function() {
            $.noty.themes.defaultTheme.helpers.borderFix.apply(this);
        }
    }
};

$.noty.themes.relax = {
    name    : 'relax',
    helpers : {},
    modal   : {
        css: {
            position       : 'fixed',
            width          : '100%',
            height         : '100%',
            backgroundColor: '#000',
            zIndex         : 10000,
            opacity        : 0.6,
            display        : 'none',
            left           : 0,
            top            : 0
        }
    },
    style   : function() {

        this.$bar.css({
            overflow    : 'hidden',
            margin      : '4px 0',
            borderRadius: '2px'
        });

        this.$message.css({
            fontSize  : '14px',
            lineHeight: '16px',
            textAlign : 'center',
            padding   : '10px',
            width     : 'auto',
            position  : 'relative'
        });

        this.$closeButton.css({
            position  : 'absolute',
            top       : 4, right: 4,
            width     : 10, height: 10,
            background: "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAQAAAAnOwc2AAAAxUlEQVR4AR3MPUoDURSA0e++uSkkOxC3IAOWNtaCIDaChfgXBMEZbQRByxCwk+BasgQRZLSYoLgDQbARxry8nyumPcVRKDfd0Aa8AsgDv1zp6pYd5jWOwhvebRTbzNNEw5BSsIpsj/kurQBnmk7sIFcCF5yyZPDRG6trQhujXYosaFoc+2f1MJ89uc76IND6F9BvlXUdpb6xwD2+4q3me3bysiHvtLYrUJto7PD/ve7LNHxSg/woN2kSz4txasBdhyiz3ugPGetTjm3XRokAAAAASUVORK5CYII=)",
            display   : 'none',
            cursor    : 'pointer'
        });

        this.$buttons.css({
            padding        : 5,
            textAlign      : 'right',
            borderTop      : '1px solid #ccc',
            backgroundColor: '#fff'
        });

        this.$buttons.find('button').css({
            marginLeft: 5
        });

        this.$buttons.find('button:first').css({
            marginLeft: 0
        });

        this.$bar.on({
            mouseenter: function() {
                $(this).find('.noty_close').stop().fadeTo('normal', 1);
            },
            mouseleave: function() {
                $(this).find('.noty_close').stop().fadeTo('normal', 0);
            }
        });

        switch(this.options.layout.name) {
            case 'top':
                this.$bar.css({
                    borderBottom: '2px solid #eee',
                    borderLeft  : '2px solid #eee',
                    borderRight : '2px solid #eee',
                    borderTop   : '2px solid #eee',
                    boxShadow   : "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
            case 'topCenter':
            case 'center':
            case 'bottomCenter':
            case 'inline':
                this.$bar.css({
                    border   : '1px solid #eee',
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                this.$message.css({fontSize: '13px', textAlign: 'center'});
                break;
            case 'topLeft':
            case 'topRight':
            case 'bottomLeft':
            case 'bottomRight':
            case 'centerLeft':
            case 'centerRight':
                this.$bar.css({
                    border   : '1px solid #eee',
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                this.$message.css({fontSize: '13px', textAlign: 'left'});
                break;
            case 'bottom':
                this.$bar.css({
                    borderTop   : '2px solid #eee',
                    borderLeft  : '2px solid #eee',
                    borderRight : '2px solid #eee',
                    borderBottom: '2px solid #eee',
                    boxShadow   : "0 -2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
            default:
                this.$bar.css({
                    border   : '2px solid #eee',
                    boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)"
                });
                break;
        }

        switch(this.options.type) {
            case 'alert':
            case 'notification':
                this.$bar.css({backgroundColor: '#FFF', borderColor: '#dedede', color: '#444'});
                break;
            case 'warning':
                this.$bar.css({backgroundColor: '#FFEAA8', borderColor: '#FFC237', color: '#826200'});
                this.$buttons.css({borderTop: '1px solid #FFC237'});
                break;
            case 'error':
                this.$bar.css({backgroundColor: '#FF8181', borderColor: '#e25353', color: '#FFF'});
                this.$message.css({fontWeight: 'bold'});
                this.$buttons.css({borderTop: '1px solid darkred'});
                break;
            case 'information':
                this.$bar.css({backgroundColor: '#78C5E7', borderColor: '#3badd6', color: '#FFF'});
                this.$buttons.css({borderTop: '1px solid #0B90C4'});
                break;
            case 'success':
                this.$bar.css({backgroundColor: '#BCF5BC', borderColor: '#7cdd77', color: 'darkgreen'});
                this.$buttons.css({borderTop: '1px solid #50C24E'});
                break;
            default:
                this.$bar.css({backgroundColor: '#FFF', borderColor: '#CCC', color: '#444'});
                break;
        }
    },
    callback: {
        onShow : function() {

        },
        onClose: function() {

        }
    }
};


return window.noty;

});
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define('keboacy/ui/notify',['noty', 'jquery'], factory);
    } else {
        root.kb_notify = factory(root.noty);
    }
}(this, function (noty, $) {
    var notify = {}

    notify._core = function (option) {
        var n = noty($.extend({
            type: 'warning',
            dismissQueue: true,
            force: true,
            layout: 'topCenter',
            theme: 'relax',  // bootstrapTheme
            closeWith: ['click'],
            maxVisible: 1,
            animation: {
                open: { height: 'toggle' },
                close: { height: 'toggle' },
                easing: 'swing',
                speed: 100 // opening & closing animation speed
            },
            timeout: false,
            killer: true,
            modal: false
        }, option));

    };

    notify.warn = function (text) {
        notify._core({
            text: text,
            type: 'warning',
            timeout: 4000
        });
    };

    notify.success = function (text) {
        notify._core({
            text: text,
            timeout: 2000,
            type: 'success'
        });
    };

    notify.error = function (text) {
        notify._core({
            text: text,
            type: 'error',
            timeout: false
        });
    };

    notify.confirm = function (successCb, cancelCb) {
        notify._core({
            text: '确定进行这个操作？',
            type: 'confirm',
            modal: true,
            buttons: [{
                addClass: 'btn btn-primary btn-xs', text: '确定', onClick: function ($noty) {
                    $noty.close();
                    successCb();
                }
            }, {
                addClass: 'btn btn-danger btn-xs', text: '取消', onClick: function ($noty) {
                    $noty.close();
                    cancelCb();
                }
            }]
        });
    };

    // plugin
    $.notify = notify;

    return notify;
}));

/*
 * qTip2 - Pretty powerful tooltips - v3.0.3
 * http://qtip2.com
 *
 * Copyright (c) 2016 
 * Released under the MIT licenses
 * http://jquery.org/license
 *
 * Date: Wed May 11 2016 10:31 GMT+0100+0100
 * Plugins: tips modal viewport svg imagemap ie6
 * Styles: core basic css3
 */
/*global window: false, jQuery: false, console: false, define: false */

/* Cache window, document, undefined */
(function( window, document, undefined ) {

// Uses AMD or browser globals to create a jQuery plugin.
(function( factory ) {
	"use strict";
	if(typeof define === 'function' && define.amd) {
		define('qtip2',['jquery'], factory);
	}
	else if(jQuery && !jQuery.fn.qtip) {
		factory(jQuery);
	}
}
(function($) {
	"use strict"; // Enable ECMAScript "strict" operation for this function. See more: http://ejohn.org/blog/ecmascript-5-strict-mode-json-and-more/
;// Munge the primitives - Paul Irish tip
var TRUE = true,
FALSE = false,
NULL = null,

// Common variables
X = 'x', Y = 'y',
WIDTH = 'width',
HEIGHT = 'height',

// Positioning sides
TOP = 'top',
LEFT = 'left',
BOTTOM = 'bottom',
RIGHT = 'right',
CENTER = 'center',

// Position adjustment types
FLIP = 'flip',
FLIPINVERT = 'flipinvert',
SHIFT = 'shift',

// Shortcut vars
QTIP, PROTOTYPE, CORNER, CHECKS,
PLUGINS = {},
NAMESPACE = 'qtip',
ATTR_HAS = 'data-hasqtip',
ATTR_ID = 'data-qtip-id',
WIDGET = ['ui-widget', 'ui-tooltip'],
SELECTOR = '.'+NAMESPACE,
INACTIVE_EVENTS = 'click dblclick mousedown mouseup mousemove mouseleave mouseenter'.split(' '),

CLASS_FIXED = NAMESPACE+'-fixed',
CLASS_DEFAULT = NAMESPACE + '-default',
CLASS_FOCUS = NAMESPACE + '-focus',
CLASS_HOVER = NAMESPACE + '-hover',
CLASS_DISABLED = NAMESPACE+'-disabled',

replaceSuffix = '_replacedByqTip',
oldtitle = 'oldtitle',
trackingBound,

// Browser detection
BROWSER = {
	/*
	 * IE version detection
	 *
	 * Adapted from: http://ajaxian.com/archives/attack-of-the-ie-conditional-comment
	 * Credit to James Padolsey for the original implemntation!
	 */
	ie: (function() {
		/* eslint-disable no-empty */
		var v, i;
		for (
			v = 4, i = document.createElement('div');
			(i.innerHTML = '<!--[if gt IE ' + v + ']><i></i><![endif]-->') && i.getElementsByTagName('i')[0];
			v+=1
		) {}
		return v > 4 ? v : NaN;
		/* eslint-enable no-empty */
	})(),

	/*
	 * iOS version detection
	 */
	iOS: parseFloat(
		('' + (/CPU.*OS ([0-9_]{1,5})|(CPU like).*AppleWebKit.*Mobile/i.exec(navigator.userAgent) || [0,''])[1])
		.replace('undefined', '3_2').replace('_', '.').replace('_', '')
	) || FALSE
};
;function QTip(target, options, id, attr) {
	// Elements and ID
	this.id = id;
	this.target = target;
	this.tooltip = NULL;
	this.elements = { target: target };

	// Internal constructs
	this._id = NAMESPACE + '-' + id;
	this.timers = { img: {} };
	this.options = options;
	this.plugins = {};

	// Cache object
	this.cache = {
		event: {},
		target: $(),
		disabled: FALSE,
		attr: attr,
		onTooltip: FALSE,
		lastClass: ''
	};

	// Set the initial flags
	this.rendered = this.destroyed = this.disabled = this.waiting =
		this.hiddenDuringWait = this.positioning = this.triggering = FALSE;
}
PROTOTYPE = QTip.prototype;

PROTOTYPE._when = function(deferreds) {
	return $.when.apply($, deferreds);
};

PROTOTYPE.render = function(show) {
	if(this.rendered || this.destroyed) { return this; } // If tooltip has already been rendered, exit

	var self = this,
		options = this.options,
		cache = this.cache,
		elements = this.elements,
		text = options.content.text,
		title = options.content.title,
		button = options.content.button,
		posOptions = options.position,
		deferreds = [];

	// Add ARIA attributes to target
	$.attr(this.target[0], 'aria-describedby', this._id);

	// Create public position object that tracks current position corners
	cache.posClass = this._createPosClass(
		(this.position = { my: posOptions.my, at: posOptions.at }).my
	);

	// Create tooltip element
	this.tooltip = elements.tooltip = $('<div/>', {
		'id': this._id,
		'class': [ NAMESPACE, CLASS_DEFAULT, options.style.classes, cache.posClass ].join(' '),
		'width': options.style.width || '',
		'height': options.style.height || '',
		'tracking': posOptions.target === 'mouse' && posOptions.adjust.mouse,

		/* ARIA specific attributes */
		'role': 'alert',
		'aria-live': 'polite',
		'aria-atomic': FALSE,
		'aria-describedby': this._id + '-content',
		'aria-hidden': TRUE
	})
	.toggleClass(CLASS_DISABLED, this.disabled)
	.attr(ATTR_ID, this.id)
	.data(NAMESPACE, this)
	.appendTo(posOptions.container)
	.append(
		// Create content element
		elements.content = $('<div />', {
			'class': NAMESPACE + '-content',
			'id': this._id + '-content',
			'aria-atomic': TRUE
		})
	);

	// Set rendered flag and prevent redundant reposition calls for now
	this.rendered = -1;
	this.positioning = TRUE;

	// Create title...
	if(title) {
		this._createTitle();

		// Update title only if its not a callback (called in toggle if so)
		if(!$.isFunction(title)) {
			deferreds.push( this._updateTitle(title, FALSE) );
		}
	}

	// Create button
	if(button) { this._createButton(); }

	// Set proper rendered flag and update content if not a callback function (called in toggle)
	if(!$.isFunction(text)) {
		deferreds.push( this._updateContent(text, FALSE) );
	}
	this.rendered = TRUE;

	// Setup widget classes
	this._setWidget();

	// Initialize 'render' plugins
	$.each(PLUGINS, function(name) {
		var instance;
		if(this.initialize === 'render' && (instance = this(self))) {
			self.plugins[name] = instance;
		}
	});

	// Unassign initial events and assign proper events
	this._unassignEvents();
	this._assignEvents();

	// When deferreds have completed
	this._when(deferreds).then(function() {
		// tooltiprender event
		self._trigger('render');

		// Reset flags
		self.positioning = FALSE;

		// Show tooltip if not hidden during wait period
		if(!self.hiddenDuringWait && (options.show.ready || show)) {
			self.toggle(TRUE, cache.event, FALSE);
		}
		self.hiddenDuringWait = FALSE;
	});

	// Expose API
	QTIP.api[this.id] = this;

	return this;
};

PROTOTYPE.destroy = function(immediate) {
	// Set flag the signify destroy is taking place to plugins
	// and ensure it only gets destroyed once!
	if(this.destroyed) { return this.target; }

	function process() {
		if(this.destroyed) { return; }
		this.destroyed = TRUE;

		var target = this.target,
			title = target.attr(oldtitle),
			timer;

		// Destroy tooltip if rendered
		if(this.rendered) {
			this.tooltip.stop(1,0).find('*').remove().end().remove();
		}

		// Destroy all plugins
		$.each(this.plugins, function() {
			this.destroy && this.destroy();
		});

		// Clear timers
		for (timer in this.timers) {
			if (this.timers.hasOwnProperty(timer)) {
				clearTimeout(this.timers[timer]);
			}
		}

		// Remove api object and ARIA attributes
		target.removeData(NAMESPACE)
			.removeAttr(ATTR_ID)
			.removeAttr(ATTR_HAS)
			.removeAttr('aria-describedby');

		// Reset old title attribute if removed
		if(this.options.suppress && title) {
			target.attr('title', title).removeAttr(oldtitle);
		}

		// Remove qTip events associated with this API
		this._unassignEvents();

		// Remove ID from used id objects, and delete object references
		// for better garbage collection and leak protection
		this.options = this.elements = this.cache = this.timers =
			this.plugins = this.mouse = NULL;

		// Delete epoxsed API object
		delete QTIP.api[this.id];
	}

	// If an immediate destroy is needed
	if((immediate !== TRUE || this.triggering === 'hide') && this.rendered) {
		this.tooltip.one('tooltiphidden', $.proxy(process, this));
		!this.triggering && this.hide();
	}

	// If we're not in the process of hiding... process
	else { process.call(this); }

	return this.target;
};
;function invalidOpt(a) {
	return a === NULL || $.type(a) !== 'object';
}

function invalidContent(c) {
	return !($.isFunction(c) || 
            c && c.attr || 
            c.length || 
            $.type(c) === 'object' && (c.jquery || c.then));
}

// Option object sanitizer
function sanitizeOptions(opts) {
	var content, text, ajax, once;

	if(invalidOpt(opts)) { return FALSE; }

	if(invalidOpt(opts.metadata)) {
		opts.metadata = { type: opts.metadata };
	}

	if('content' in opts) {
		content = opts.content;

		if(invalidOpt(content) || content.jquery || content.done) {
			text = invalidContent(content) ? FALSE : content;
			content = opts.content = {
				text: text
			};
		}
		else { text = content.text; }

		// DEPRECATED - Old content.ajax plugin functionality
		// Converts it into the proper Deferred syntax
		if('ajax' in content) {
			ajax = content.ajax;
			once = ajax && ajax.once !== FALSE;
			delete content.ajax;

			content.text = function(event, api) {
				var loading = text || $(this).attr(api.options.content.attr) || 'Loading...',

				deferred = $.ajax(
					$.extend({}, ajax, { context: api })
				)
				.then(ajax.success, NULL, ajax.error)
				.then(function(newContent) {
					if(newContent && once) { api.set('content.text', newContent); }
					return newContent;
				},
				function(xhr, status, error) {
					if(api.destroyed || xhr.status === 0) { return; }
					api.set('content.text', status + ': ' + error);
				});

				return !once ? (api.set('content.text', loading), deferred) : loading;
			};
		}

		if('title' in content) {
			if($.isPlainObject(content.title)) {
				content.button = content.title.button;
				content.title = content.title.text;
			}

			if(invalidContent(content.title || FALSE)) {
				content.title = FALSE;
			}
		}
	}

	if('position' in opts && invalidOpt(opts.position)) {
		opts.position = { my: opts.position, at: opts.position };
	}

	if('show' in opts && invalidOpt(opts.show)) {
		opts.show = opts.show.jquery ? { target: opts.show } :
			opts.show === TRUE ? { ready: TRUE } : { event: opts.show };
	}

	if('hide' in opts && invalidOpt(opts.hide)) {
		opts.hide = opts.hide.jquery ? { target: opts.hide } : { event: opts.hide };
	}

	if('style' in opts && invalidOpt(opts.style)) {
		opts.style = { classes: opts.style };
	}

	// Sanitize plugin options
	$.each(PLUGINS, function() {
		this.sanitize && this.sanitize(opts);
	});

	return opts;
}

// Setup builtin .set() option checks
CHECKS = PROTOTYPE.checks = {
	builtin: {
		// Core checks
		'^id$': function(obj, o, v, prev) {
			var id = v === TRUE ? QTIP.nextid : v,
				newId = NAMESPACE + '-' + id;

			if(id !== FALSE && id.length > 0 && !$('#'+newId).length) {
				this._id = newId;

				if(this.rendered) {
					this.tooltip[0].id = this._id;
					this.elements.content[0].id = this._id + '-content';
					this.elements.title[0].id = this._id + '-title';
				}
			}
			else { obj[o] = prev; }
		},
		'^prerender': function(obj, o, v) {
			v && !this.rendered && this.render(this.options.show.ready);
		},

		// Content checks
		'^content.text$': function(obj, o, v) {
			this._updateContent(v);
		},
		'^content.attr$': function(obj, o, v, prev) {
			if(this.options.content.text === this.target.attr(prev)) {
				this._updateContent( this.target.attr(v) );
			}
		},
		'^content.title$': function(obj, o, v) {
			// Remove title if content is null
			if(!v) { return this._removeTitle(); }

			// If title isn't already created, create it now and update
			v && !this.elements.title && this._createTitle();
			this._updateTitle(v);
		},
		'^content.button$': function(obj, o, v) {
			this._updateButton(v);
		},
		'^content.title.(text|button)$': function(obj, o, v) {
			this.set('content.'+o, v); // Backwards title.text/button compat
		},

		// Position checks
		'^position.(my|at)$': function(obj, o, v){
			if('string' === typeof v) {
				this.position[o] = obj[o] = new CORNER(v, o === 'at');
			}
		},
		'^position.container$': function(obj, o, v){
			this.rendered && this.tooltip.appendTo(v);
		},

		// Show checks
		'^show.ready$': function(obj, o, v) {
			v && (!this.rendered && this.render(TRUE) || this.toggle(TRUE));
		},

		// Style checks
		'^style.classes$': function(obj, o, v, p) {
			this.rendered && this.tooltip.removeClass(p).addClass(v);
		},
		'^style.(width|height)': function(obj, o, v) {
			this.rendered && this.tooltip.css(o, v);
		},
		'^style.widget|content.title': function() {
			this.rendered && this._setWidget();
		},
		'^style.def': function(obj, o, v) {
			this.rendered && this.tooltip.toggleClass(CLASS_DEFAULT, !!v);
		},

		// Events check
		'^events.(render|show|move|hide|focus|blur)$': function(obj, o, v) {
			this.rendered && this.tooltip[($.isFunction(v) ? '' : 'un') + 'bind']('tooltip'+o, v);
		},

		// Properties which require event reassignment
		'^(show|hide|position).(event|target|fixed|inactive|leave|distance|viewport|adjust)': function() {
			if(!this.rendered) { return; }

			// Set tracking flag
			var posOptions = this.options.position;
			this.tooltip.attr('tracking', posOptions.target === 'mouse' && posOptions.adjust.mouse);

			// Reassign events
			this._unassignEvents();
			this._assignEvents();
		}
	}
};

// Dot notation converter
function convertNotation(options, notation) {
	var i = 0, obj, option = options,

	// Split notation into array
	levels = notation.split('.');

	// Loop through
	while(option = option[ levels[i++] ]) {
		if(i < levels.length) { obj = option; }
	}

	return [obj || options, levels.pop()];
}

PROTOTYPE.get = function(notation) {
	if(this.destroyed) { return this; }

	var o = convertNotation(this.options, notation.toLowerCase()),
		result = o[0][ o[1] ];

	return result.precedance ? result.string() : result;
};

function setCallback(notation, args) {
	var category, rule, match;

	for(category in this.checks) {
		if (!this.checks.hasOwnProperty(category)) { continue; }

		for(rule in this.checks[category]) {
			if (!this.checks[category].hasOwnProperty(rule)) { continue; }

			if(match = (new RegExp(rule, 'i')).exec(notation)) {
				args.push(match);

				if(category === 'builtin' || this.plugins[category]) {
					this.checks[category][rule].apply(
						this.plugins[category] || this, args
					);
				}
			}
		}
	}
}

var rmove = /^position\.(my|at|adjust|target|container|viewport)|style|content|show\.ready/i,
	rrender = /^prerender|show\.ready/i;

PROTOTYPE.set = function(option, value) {
	if(this.destroyed) { return this; }

	var rendered = this.rendered,
		reposition = FALSE,
		options = this.options,
		name;

	// Convert singular option/value pair into object form
	if('string' === typeof option) {
		name = option; option = {}; option[name] = value;
	}
	else { option = $.extend({}, option); }

	// Set all of the defined options to their new values
	$.each(option, function(notation, val) {
		if(rendered && rrender.test(notation)) {
			delete option[notation]; return;
		}

		// Set new obj value
		var obj = convertNotation(options, notation.toLowerCase()), previous;
		previous = obj[0][ obj[1] ];
		obj[0][ obj[1] ] = val && val.nodeType ? $(val) : val;

		// Also check if we need to reposition
		reposition = rmove.test(notation) || reposition;

		// Set the new params for the callback
		option[notation] = [obj[0], obj[1], val, previous];
	});

	// Re-sanitize options
	sanitizeOptions(options);

	/*
	 * Execute any valid callbacks for the set options
	 * Also set positioning flag so we don't get loads of redundant repositioning calls.
	 */
	this.positioning = TRUE;
	$.each(option, $.proxy(setCallback, this));
	this.positioning = FALSE;

	// Update position if needed
	if(this.rendered && this.tooltip[0].offsetWidth > 0 && reposition) {
		this.reposition( options.position.target === 'mouse' ? NULL : this.cache.event );
	}

	return this;
};
;PROTOTYPE._update = function(content, element) {
	var self = this,
		cache = this.cache;

	// Make sure tooltip is rendered and content is defined. If not return
	if(!this.rendered || !content) { return FALSE; }

	// Use function to parse content
	if($.isFunction(content)) {
		content = content.call(this.elements.target, cache.event, this) || '';
	}

	// Handle deferred content
	if($.isFunction(content.then)) {
		cache.waiting = TRUE;
		return content.then(function(c) {
			cache.waiting = FALSE;
			return self._update(c, element);
		}, NULL, function(e) {
			return self._update(e, element);
		});
	}

	// If content is null... return false
	if(content === FALSE || !content && content !== '') { return FALSE; }

	// Append new content if its a DOM array and show it if hidden
	if(content.jquery && content.length > 0) {
		element.empty().append(
			content.css({ display: 'block', visibility: 'visible' })
		);
	}

	// Content is a regular string, insert the new content
	else { element.html(content); }

	// Wait for content to be loaded, and reposition
	return this._waitForContent(element).then(function(images) {
		if(self.rendered && self.tooltip[0].offsetWidth > 0) {
			self.reposition(cache.event, !images.length);
		}
	});
};

PROTOTYPE._waitForContent = function(element) {
	var cache = this.cache;

	// Set flag
	cache.waiting = TRUE;

	// If imagesLoaded is included, ensure images have loaded and return promise
	return ( $.fn.imagesLoaded ? element.imagesLoaded() : new $.Deferred().resolve([]) )
		.done(function() { cache.waiting = FALSE; })
		.promise();
};

PROTOTYPE._updateContent = function(content, reposition) {
	this._update(content, this.elements.content, reposition);
};

PROTOTYPE._updateTitle = function(content, reposition) {
	if(this._update(content, this.elements.title, reposition) === FALSE) {
		this._removeTitle(FALSE);
	}
};

PROTOTYPE._createTitle = function()
{
	var elements = this.elements,
		id = this._id+'-title';

	// Destroy previous title element, if present
	if(elements.titlebar) { this._removeTitle(); }

	// Create title bar and title elements
	elements.titlebar = $('<div />', {
		'class': NAMESPACE + '-titlebar ' + (this.options.style.widget ? createWidgetClass('header') : '')
	})
	.append(
		elements.title = $('<div />', {
			'id': id,
			'class': NAMESPACE + '-title',
			'aria-atomic': TRUE
		})
	)
	.insertBefore(elements.content)

	// Button-specific events
	.delegate('.qtip-close', 'mousedown keydown mouseup keyup mouseout', function(event) {
		$(this).toggleClass('ui-state-active ui-state-focus', event.type.substr(-4) === 'down');
	})
	.delegate('.qtip-close', 'mouseover mouseout', function(event){
		$(this).toggleClass('ui-state-hover', event.type === 'mouseover');
	});

	// Create button if enabled
	if(this.options.content.button) { this._createButton(); }
};

PROTOTYPE._removeTitle = function(reposition)
{
	var elements = this.elements;

	if(elements.title) {
		elements.titlebar.remove();
		elements.titlebar = elements.title = elements.button = NULL;

		// Reposition if enabled
		if(reposition !== FALSE) { this.reposition(); }
	}
};
;PROTOTYPE._createPosClass = function(my) {
	return NAMESPACE + '-pos-' + (my || this.options.position.my).abbrev();
};

PROTOTYPE.reposition = function(event, effect) {
	if(!this.rendered || this.positioning || this.destroyed) { return this; }

	// Set positioning flag
	this.positioning = TRUE;

	var cache = this.cache,
		tooltip = this.tooltip,
		posOptions = this.options.position,
		target = posOptions.target,
		my = posOptions.my,
		at = posOptions.at,
		viewport = posOptions.viewport,
		container = posOptions.container,
		adjust = posOptions.adjust,
		method = adjust.method.split(' '),
		tooltipWidth = tooltip.outerWidth(FALSE),
		tooltipHeight = tooltip.outerHeight(FALSE),
		targetWidth = 0,
		targetHeight = 0,
		type = tooltip.css('position'),
		position = { left: 0, top: 0 },
		visible = tooltip[0].offsetWidth > 0,
		isScroll = event && event.type === 'scroll',
		win = $(window),
		doc = container[0].ownerDocument,
		mouse = this.mouse,
		pluginCalculations, offset, adjusted, newClass;

	// Check if absolute position was passed
	if($.isArray(target) && target.length === 2) {
		// Force left top and set position
		at = { x: LEFT, y: TOP };
		position = { left: target[0], top: target[1] };
	}

	// Check if mouse was the target
	else if(target === 'mouse') {
		// Force left top to allow flipping
		at = { x: LEFT, y: TOP };

		// Use the mouse origin that caused the show event, if distance hiding is enabled
		if((!adjust.mouse || this.options.hide.distance) && cache.origin && cache.origin.pageX) {
			event =  cache.origin;
		}

		// Use cached event for resize/scroll events
		else if(!event || event && (event.type === 'resize' || event.type === 'scroll')) {
			event = cache.event;
		}

		// Otherwise, use the cached mouse coordinates if available
		else if(mouse && mouse.pageX) {
			event = mouse;
		}

		// Calculate body and container offset and take them into account below
		if(type !== 'static') { position = container.offset(); }
		if(doc.body.offsetWidth !== (window.innerWidth || doc.documentElement.clientWidth)) {
			offset = $(document.body).offset();
		}

		// Use event coordinates for position
		position = {
			left: event.pageX - position.left + (offset && offset.left || 0),
			top: event.pageY - position.top + (offset && offset.top || 0)
		};

		// Scroll events are a pain, some browsers
		if(adjust.mouse && isScroll && mouse) {
			position.left -= (mouse.scrollX || 0) - win.scrollLeft();
			position.top -= (mouse.scrollY || 0) - win.scrollTop();
		}
	}

	// Target wasn't mouse or absolute...
	else {
		// Check if event targetting is being used
		if(target === 'event') {
			if(event && event.target && event.type !== 'scroll' && event.type !== 'resize') {
				cache.target = $(event.target);
			}
			else if(!event.target) {
				cache.target = this.elements.target;
			}
		}
		else if(target !== 'event'){
			cache.target = $(target.jquery ? target : this.elements.target);
		}
		target = cache.target;

		// Parse the target into a jQuery object and make sure there's an element present
		target = $(target).eq(0);
		if(target.length === 0) { return this; }

		// Check if window or document is the target
		else if(target[0] === document || target[0] === window) {
			targetWidth = BROWSER.iOS ? window.innerWidth : target.width();
			targetHeight = BROWSER.iOS ? window.innerHeight : target.height();

			if(target[0] === window) {
				position = {
					top: (viewport || target).scrollTop(),
					left: (viewport || target).scrollLeft()
				};
			}
		}

		// Check if the target is an <AREA> element
		else if(PLUGINS.imagemap && target.is('area')) {
			pluginCalculations = PLUGINS.imagemap(this, target, at, PLUGINS.viewport ? method : FALSE);
		}

		// Check if the target is an SVG element
		else if(PLUGINS.svg && target && target[0].ownerSVGElement) {
			pluginCalculations = PLUGINS.svg(this, target, at, PLUGINS.viewport ? method : FALSE);
		}

		// Otherwise use regular jQuery methods
		else {
			targetWidth = target.outerWidth(FALSE);
			targetHeight = target.outerHeight(FALSE);
			position = target.offset();
		}

		// Parse returned plugin values into proper variables
		if(pluginCalculations) {
			targetWidth = pluginCalculations.width;
			targetHeight = pluginCalculations.height;
			offset = pluginCalculations.offset;
			position = pluginCalculations.position;
		}

		// Adjust position to take into account offset parents
		position = this.reposition.offset(target, position, container);

		// Adjust for position.fixed tooltips (and also iOS scroll bug in v3.2-4.0 & v4.3-4.3.2)
		if(BROWSER.iOS > 3.1 && BROWSER.iOS < 4.1 ||
			BROWSER.iOS >= 4.3 && BROWSER.iOS < 4.33 ||
			!BROWSER.iOS && type === 'fixed'
		){
			position.left -= win.scrollLeft();
			position.top -= win.scrollTop();
		}

		// Adjust position relative to target
		if(!pluginCalculations || pluginCalculations && pluginCalculations.adjustable !== FALSE) {
			position.left += at.x === RIGHT ? targetWidth : at.x === CENTER ? targetWidth / 2 : 0;
			position.top += at.y === BOTTOM ? targetHeight : at.y === CENTER ? targetHeight / 2 : 0;
		}
	}

	// Adjust position relative to tooltip
	position.left += adjust.x + (my.x === RIGHT ? -tooltipWidth : my.x === CENTER ? -tooltipWidth / 2 : 0);
	position.top += adjust.y + (my.y === BOTTOM ? -tooltipHeight : my.y === CENTER ? -tooltipHeight / 2 : 0);

	// Use viewport adjustment plugin if enabled
	if(PLUGINS.viewport) {
		adjusted = position.adjusted = PLUGINS.viewport(
			this, position, posOptions, targetWidth, targetHeight, tooltipWidth, tooltipHeight
		);

		// Apply offsets supplied by positioning plugin (if used)
		if(offset && adjusted.left) { position.left += offset.left; }
		if(offset && adjusted.top) {  position.top += offset.top; }

		// Apply any new 'my' position
		if(adjusted.my) { this.position.my = adjusted.my; }
	}

	// Viewport adjustment is disabled, set values to zero
	else { position.adjusted = { left: 0, top: 0 }; }

	// Set tooltip position class if it's changed
	if(cache.posClass !== (newClass = this._createPosClass(this.position.my))) {
		cache.posClass = newClass;
		tooltip.removeClass(cache.posClass).addClass(newClass);
	}

	// tooltipmove event
	if(!this._trigger('move', [position, viewport.elem || viewport], event)) { return this; }
	delete position.adjusted;

	// If effect is disabled, target it mouse, no animation is defined or positioning gives NaN out, set CSS directly
	if(effect === FALSE || !visible || isNaN(position.left) || isNaN(position.top) || target === 'mouse' || !$.isFunction(posOptions.effect)) {
		tooltip.css(position);
	}

	// Use custom function if provided
	else if($.isFunction(posOptions.effect)) {
		posOptions.effect.call(tooltip, this, $.extend({}, position));
		tooltip.queue(function(next) {
			// Reset attributes to avoid cross-browser rendering bugs
			$(this).css({ opacity: '', height: '' });
			if(BROWSER.ie) { this.style.removeAttribute('filter'); }

			next();
		});
	}

	// Set positioning flag
	this.positioning = FALSE;

	return this;
};

// Custom (more correct for qTip!) offset calculator
PROTOTYPE.reposition.offset = function(elem, pos, container) {
	if(!container[0]) { return pos; }

	var ownerDocument = $(elem[0].ownerDocument),
		quirks = !!BROWSER.ie && document.compatMode !== 'CSS1Compat',
		parent = container[0],
		scrolled, position, parentOffset, overflow;

	function scroll(e, i) {
		pos.left += i * e.scrollLeft();
		pos.top += i * e.scrollTop();
	}

	// Compensate for non-static containers offset
	do {
		if((position = $.css(parent, 'position')) !== 'static') {
			if(position === 'fixed') {
				parentOffset = parent.getBoundingClientRect();
				scroll(ownerDocument, -1);
			}
			else {
				parentOffset = $(parent).position();
				parentOffset.left += parseFloat($.css(parent, 'borderLeftWidth')) || 0;
				parentOffset.top += parseFloat($.css(parent, 'borderTopWidth')) || 0;
			}

			pos.left -= parentOffset.left + (parseFloat($.css(parent, 'marginLeft')) || 0);
			pos.top -= parentOffset.top + (parseFloat($.css(parent, 'marginTop')) || 0);

			// If this is the first parent element with an overflow of "scroll" or "auto", store it
			if(!scrolled && (overflow = $.css(parent, 'overflow')) !== 'hidden' && overflow !== 'visible') { scrolled = $(parent); }
		}
	}
	while(parent = parent.offsetParent);

	// Compensate for containers scroll if it also has an offsetParent (or in IE quirks mode)
	if(scrolled && (scrolled[0] !== ownerDocument[0] || quirks)) {
		scroll(scrolled, 1);
	}

	return pos;
};

// Corner class
var C = (CORNER = PROTOTYPE.reposition.Corner = function(corner, forceY) {
	corner = ('' + corner).replace(/([A-Z])/, ' $1').replace(/middle/gi, CENTER).toLowerCase();
	this.x = (corner.match(/left|right/i) || corner.match(/center/) || ['inherit'])[0].toLowerCase();
	this.y = (corner.match(/top|bottom|center/i) || ['inherit'])[0].toLowerCase();
	this.forceY = !!forceY;

	var f = corner.charAt(0);
	this.precedance = f === 't' || f === 'b' ? Y : X;
}).prototype;

C.invert = function(z, center) {
	this[z] = this[z] === LEFT ? RIGHT : this[z] === RIGHT ? LEFT : center || this[z];
};

C.string = function(join) {
	var x = this.x, y = this.y;

	var result = x !== y ?
		x === 'center' || y !== 'center' && (this.precedance === Y || this.forceY) ? 
			[y,x] : 
			[x,y] :
		[x];

	return join !== false ? result.join(' ') : result;
};

C.abbrev = function() {
	var result = this.string(false);
	return result[0].charAt(0) + (result[1] && result[1].charAt(0) || '');
};

C.clone = function() {
	return new CORNER( this.string(), this.forceY );
};

;
PROTOTYPE.toggle = function(state, event) {
	var cache = this.cache,
		options = this.options,
		tooltip = this.tooltip;

	// Try to prevent flickering when tooltip overlaps show element
	if(event) {
		if((/over|enter/).test(event.type) && cache.event && (/out|leave/).test(cache.event.type) &&
			options.show.target.add(event.target).length === options.show.target.length &&
			tooltip.has(event.relatedTarget).length) {
			return this;
		}

		// Cache event
		cache.event = $.event.fix(event);
	}

	// If we're currently waiting and we've just hidden... stop it
	this.waiting && !state && (this.hiddenDuringWait = TRUE);

	// Render the tooltip if showing and it isn't already
	if(!this.rendered) { return state ? this.render(1) : this; }
	else if(this.destroyed || this.disabled) { return this; }

	var type = state ? 'show' : 'hide',
		opts = this.options[type],
		posOptions = this.options.position,
		contentOptions = this.options.content,
		width = this.tooltip.css('width'),
		visible = this.tooltip.is(':visible'),
		animate = state || opts.target.length === 1,
		sameTarget = !event || opts.target.length < 2 || cache.target[0] === event.target,
		identicalState, allow, after;

	// Detect state if valid one isn't provided
	if((typeof state).search('boolean|number')) { state = !visible; }

	// Check if the tooltip is in an identical state to the new would-be state
	identicalState = !tooltip.is(':animated') && visible === state && sameTarget;

	// Fire tooltip(show/hide) event and check if destroyed
	allow = !identicalState ? !!this._trigger(type, [90]) : NULL;

	// Check to make sure the tooltip wasn't destroyed in the callback
	if(this.destroyed) { return this; }

	// If the user didn't stop the method prematurely and we're showing the tooltip, focus it
	if(allow !== FALSE && state) { this.focus(event); }

	// If the state hasn't changed or the user stopped it, return early
	if(!allow || identicalState) { return this; }

	// Set ARIA hidden attribute
	$.attr(tooltip[0], 'aria-hidden', !!!state);

	// Execute state specific properties
	if(state) {
		// Store show origin coordinates
		this.mouse && (cache.origin = $.event.fix(this.mouse));

		// Update tooltip content & title if it's a dynamic function
		if($.isFunction(contentOptions.text)) { this._updateContent(contentOptions.text, FALSE); }
		if($.isFunction(contentOptions.title)) { this._updateTitle(contentOptions.title, FALSE); }

		// Cache mousemove events for positioning purposes (if not already tracking)
		if(!trackingBound && posOptions.target === 'mouse' && posOptions.adjust.mouse) {
			$(document).bind('mousemove.'+NAMESPACE, this._storeMouse);
			trackingBound = TRUE;
		}

		// Update the tooltip position (set width first to prevent viewport/max-width issues)
		if(!width) { tooltip.css('width', tooltip.outerWidth(FALSE)); }
		this.reposition(event, arguments[2]);
		if(!width) { tooltip.css('width', ''); }

		// Hide other tooltips if tooltip is solo
		if(!!opts.solo) {
			(typeof opts.solo === 'string' ? $(opts.solo) : $(SELECTOR, opts.solo))
				.not(tooltip).not(opts.target).qtip('hide', new $.Event('tooltipsolo'));
		}
	}
	else {
		// Clear show timer if we're hiding
		clearTimeout(this.timers.show);

		// Remove cached origin on hide
		delete cache.origin;

		// Remove mouse tracking event if not needed (all tracking qTips are hidden)
		if(trackingBound && !$(SELECTOR+'[tracking="true"]:visible', opts.solo).not(tooltip).length) {
			$(document).unbind('mousemove.'+NAMESPACE);
			trackingBound = FALSE;
		}

		// Blur the tooltip
		this.blur(event);
	}

	// Define post-animation, state specific properties
	after = $.proxy(function() {
		if(state) {
			// Prevent antialias from disappearing in IE by removing filter
			if(BROWSER.ie) { tooltip[0].style.removeAttribute('filter'); }

			// Remove overflow setting to prevent tip bugs
			tooltip.css('overflow', '');

			// Autofocus elements if enabled
			if('string' === typeof opts.autofocus) {
				$(this.options.show.autofocus, tooltip).focus();
			}

			// If set, hide tooltip when inactive for delay period
			this.options.show.target.trigger('qtip-'+this.id+'-inactive');
		}
		else {
			// Reset CSS states
			tooltip.css({
				display: '',
				visibility: '',
				opacity: '',
				left: '',
				top: ''
			});
		}

		// tooltipvisible/tooltiphidden events
		this._trigger(state ? 'visible' : 'hidden');
	}, this);

	// If no effect type is supplied, use a simple toggle
	if(opts.effect === FALSE || animate === FALSE) {
		tooltip[ type ]();
		after();
	}

	// Use custom function if provided
	else if($.isFunction(opts.effect)) {
		tooltip.stop(1, 1);
		opts.effect.call(tooltip, this);
		tooltip.queue('fx', function(n) {
			after(); n();
		});
	}

	// Use basic fade function by default
	else { tooltip.fadeTo(90, state ? 1 : 0, after); }

	// If inactive hide method is set, active it
	if(state) { opts.target.trigger('qtip-'+this.id+'-inactive'); }

	return this;
};

PROTOTYPE.show = function(event) { return this.toggle(TRUE, event); };

PROTOTYPE.hide = function(event) { return this.toggle(FALSE, event); };
;PROTOTYPE.focus = function(event) {
	if(!this.rendered || this.destroyed) { return this; }

	var qtips = $(SELECTOR),
		tooltip = this.tooltip,
		curIndex = parseInt(tooltip[0].style.zIndex, 10),
		newIndex = QTIP.zindex + qtips.length;

	// Only update the z-index if it has changed and tooltip is not already focused
	if(!tooltip.hasClass(CLASS_FOCUS)) {
		// tooltipfocus event
		if(this._trigger('focus', [newIndex], event)) {
			// Only update z-index's if they've changed
			if(curIndex !== newIndex) {
				// Reduce our z-index's and keep them properly ordered
				qtips.each(function() {
					if(this.style.zIndex > curIndex) {
						this.style.zIndex = this.style.zIndex - 1;
					}
				});

				// Fire blur event for focused tooltip
				qtips.filter('.' + CLASS_FOCUS).qtip('blur', event);
			}

			// Set the new z-index
			tooltip.addClass(CLASS_FOCUS)[0].style.zIndex = newIndex;
		}
	}

	return this;
};

PROTOTYPE.blur = function(event) {
	if(!this.rendered || this.destroyed) { return this; }

	// Set focused status to FALSE
	this.tooltip.removeClass(CLASS_FOCUS);

	// tooltipblur event
	this._trigger('blur', [ this.tooltip.css('zIndex') ], event);

	return this;
};
;PROTOTYPE.disable = function(state) {
	if(this.destroyed) { return this; }

	// If 'toggle' is passed, toggle the current state
	if(state === 'toggle') {
		state = !(this.rendered ? this.tooltip.hasClass(CLASS_DISABLED) : this.disabled);
	}

	// Disable if no state passed
	else if('boolean' !== typeof state) {
		state = TRUE;
	}

	if(this.rendered) {
		this.tooltip.toggleClass(CLASS_DISABLED, state)
			.attr('aria-disabled', state);
	}

	this.disabled = !!state;

	return this;
};

PROTOTYPE.enable = function() { return this.disable(FALSE); };
;PROTOTYPE._createButton = function()
{
	var self = this,
		elements = this.elements,
		tooltip = elements.tooltip,
		button = this.options.content.button,
		isString = typeof button === 'string',
		close = isString ? button : 'Close tooltip';

	if(elements.button) { elements.button.remove(); }

	// Use custom button if one was supplied by user, else use default
	if(button.jquery) {
		elements.button = button;
	}
	else {
		elements.button = $('<a />', {
			'class': 'qtip-close ' + (this.options.style.widget ? '' : NAMESPACE+'-icon'),
			'title': close,
			'aria-label': close
		})
		.prepend(
			$('<span />', {
				'class': 'ui-icon ui-icon-close',
				'html': '&times;'
			})
		);
	}

	// Create button and setup attributes
	elements.button.appendTo(elements.titlebar || tooltip)
		.attr('role', 'button')
		.click(function(event) {
			if(!tooltip.hasClass(CLASS_DISABLED)) { self.hide(event); }
			return FALSE;
		});
};

PROTOTYPE._updateButton = function(button)
{
	// Make sure tooltip is rendered and if not, return
	if(!this.rendered) { return FALSE; }

	var elem = this.elements.button;
	if(button) { this._createButton(); }
	else { elem.remove(); }
};
;// Widget class creator
function createWidgetClass(cls) {
	return WIDGET.concat('').join(cls ? '-'+cls+' ' : ' ');
}

// Widget class setter method
PROTOTYPE._setWidget = function()
{
	var on = this.options.style.widget,
		elements = this.elements,
		tooltip = elements.tooltip,
		disabled = tooltip.hasClass(CLASS_DISABLED);

	tooltip.removeClass(CLASS_DISABLED);
	CLASS_DISABLED = on ? 'ui-state-disabled' : 'qtip-disabled';
	tooltip.toggleClass(CLASS_DISABLED, disabled);

	tooltip.toggleClass('ui-helper-reset '+createWidgetClass(), on).toggleClass(CLASS_DEFAULT, this.options.style.def && !on);

	if(elements.content) {
		elements.content.toggleClass( createWidgetClass('content'), on);
	}
	if(elements.titlebar) {
		elements.titlebar.toggleClass( createWidgetClass('header'), on);
	}
	if(elements.button) {
		elements.button.toggleClass(NAMESPACE+'-icon', !on);
	}
};
;function delay(callback, duration) {
	// If tooltip has displayed, start hide timer
	if(duration > 0) {
		return setTimeout(
			$.proxy(callback, this), duration
		);
	}
	else{ callback.call(this); }
}

function showMethod(event) {
	if(this.tooltip.hasClass(CLASS_DISABLED)) { return; }

	// Clear hide timers
	clearTimeout(this.timers.show);
	clearTimeout(this.timers.hide);

	// Start show timer
	this.timers.show = delay.call(this,
		function() { this.toggle(TRUE, event); },
		this.options.show.delay
	);
}

function hideMethod(event) {
	if(this.tooltip.hasClass(CLASS_DISABLED) || this.destroyed) { return; }

	// Check if new target was actually the tooltip element
	var relatedTarget = $(event.relatedTarget),
		ontoTooltip = relatedTarget.closest(SELECTOR)[0] === this.tooltip[0],
		ontoTarget = relatedTarget[0] === this.options.show.target[0];

	// Clear timers and stop animation queue
	clearTimeout(this.timers.show);
	clearTimeout(this.timers.hide);

	// Prevent hiding if tooltip is fixed and event target is the tooltip.
	// Or if mouse positioning is enabled and cursor momentarily overlaps
	if(this !== relatedTarget[0] &&
		(this.options.position.target === 'mouse' && ontoTooltip) ||
		this.options.hide.fixed && (
			(/mouse(out|leave|move)/).test(event.type) && (ontoTooltip || ontoTarget))
		)
	{
		/* eslint-disable no-empty */
		try {
			event.preventDefault();
			event.stopImmediatePropagation();
		} catch(e) {}
		/* eslint-enable no-empty */

		return;
	}

	// If tooltip has displayed, start hide timer
	this.timers.hide = delay.call(this,
		function() { this.toggle(FALSE, event); },
		this.options.hide.delay,
		this
	);
}

function inactiveMethod(event) {
	if(this.tooltip.hasClass(CLASS_DISABLED) || !this.options.hide.inactive) { return; }

	// Clear timer
	clearTimeout(this.timers.inactive);

	this.timers.inactive = delay.call(this,
		function(){ this.hide(event); },
		this.options.hide.inactive
	);
}

function repositionMethod(event) {
	if(this.rendered && this.tooltip[0].offsetWidth > 0) { this.reposition(event); }
}

// Store mouse coordinates
PROTOTYPE._storeMouse = function(event) {
	(this.mouse = $.event.fix(event)).type = 'mousemove';
	return this;
};

// Bind events
PROTOTYPE._bind = function(targets, events, method, suffix, context) {
	if(!targets || !method || !events.length) { return; }
	var ns = '.' + this._id + (suffix ? '-'+suffix : '');
	$(targets).bind(
		(events.split ? events : events.join(ns + ' ')) + ns,
		$.proxy(method, context || this)
	);
	return this;
};
PROTOTYPE._unbind = function(targets, suffix) {
	targets && $(targets).unbind('.' + this._id + (suffix ? '-'+suffix : ''));
	return this;
};

// Global delegation helper
function delegate(selector, events, method) {
	$(document.body).delegate(selector,
		(events.split ? events : events.join('.'+NAMESPACE + ' ')) + '.'+NAMESPACE,
		function() {
			var api = QTIP.api[ $.attr(this, ATTR_ID) ];
			api && !api.disabled && method.apply(api, arguments);
		}
	);
}
// Event trigger
PROTOTYPE._trigger = function(type, args, event) {
	var callback = new $.Event('tooltip'+type);
	callback.originalEvent = event && $.extend({}, event) || this.cache.event || NULL;

	this.triggering = type;
	this.tooltip.trigger(callback, [this].concat(args || []));
	this.triggering = FALSE;

	return !callback.isDefaultPrevented();
};

PROTOTYPE._bindEvents = function(showEvents, hideEvents, showTargets, hideTargets, showCallback, hideCallback) {
	// Get tasrgets that lye within both
	var similarTargets = showTargets.filter( hideTargets ).add( hideTargets.filter(showTargets) ),
		toggleEvents = [];

	// If hide and show targets are the same...
	if(similarTargets.length) {

		// Filter identical show/hide events
		$.each(hideEvents, function(i, type) {
			var showIndex = $.inArray(type, showEvents);

			// Both events are identical, remove from both hide and show events
			// and append to toggleEvents
			showIndex > -1 && toggleEvents.push( showEvents.splice( showIndex, 1 )[0] );
		});

		// Toggle events are special case of identical show/hide events, which happen in sequence
		if(toggleEvents.length) {
			// Bind toggle events to the similar targets
			this._bind(similarTargets, toggleEvents, function(event) {
				var state = this.rendered ? this.tooltip[0].offsetWidth > 0 : false;
				(state ? hideCallback : showCallback).call(this, event);
			});

			// Remove the similar targets from the regular show/hide bindings
			showTargets = showTargets.not(similarTargets);
			hideTargets = hideTargets.not(similarTargets);
		}
	}

	// Apply show/hide/toggle events
	this._bind(showTargets, showEvents, showCallback);
	this._bind(hideTargets, hideEvents, hideCallback);
};

PROTOTYPE._assignInitialEvents = function(event) {
	var options = this.options,
		showTarget = options.show.target,
		hideTarget = options.hide.target,
		showEvents = options.show.event ? $.trim('' + options.show.event).split(' ') : [],
		hideEvents = options.hide.event ? $.trim('' + options.hide.event).split(' ') : [];

	// Catch remove/removeqtip events on target element to destroy redundant tooltips
	this._bind(this.elements.target, ['remove', 'removeqtip'], function() {
		this.destroy(true);
	}, 'destroy');

	/*
	 * Make sure hoverIntent functions properly by using mouseleave as a hide event if
	 * mouseenter/mouseout is used for show.event, even if it isn't in the users options.
	 */
	if(/mouse(over|enter)/i.test(options.show.event) && !/mouse(out|leave)/i.test(options.hide.event)) {
		hideEvents.push('mouseleave');
	}

	/*
	 * Also make sure initial mouse targetting works correctly by caching mousemove coords
	 * on show targets before the tooltip has rendered. Also set onTarget when triggered to
	 * keep mouse tracking working.
	 */
	this._bind(showTarget, 'mousemove', function(moveEvent) {
		this._storeMouse(moveEvent);
		this.cache.onTarget = TRUE;
	});

	// Define hoverIntent function
	function hoverIntent(hoverEvent) {
		// Only continue if tooltip isn't disabled
		if(this.disabled || this.destroyed) { return FALSE; }

		// Cache the event data
		this.cache.event = hoverEvent && $.event.fix(hoverEvent);
		this.cache.target = hoverEvent && $(hoverEvent.target);

		// Start the event sequence
		clearTimeout(this.timers.show);
		this.timers.show = delay.call(this,
			function() { this.render(typeof hoverEvent === 'object' || options.show.ready); },
			options.prerender ? 0 : options.show.delay
		);
	}

	// Filter and bind events
	this._bindEvents(showEvents, hideEvents, showTarget, hideTarget, hoverIntent, function() {
		if(!this.timers) { return FALSE; }
		clearTimeout(this.timers.show);
	});

	// Prerendering is enabled, create tooltip now
	if(options.show.ready || options.prerender) { hoverIntent.call(this, event); }
};

// Event assignment method
PROTOTYPE._assignEvents = function() {
	var self = this,
		options = this.options,
		posOptions = options.position,

		tooltip = this.tooltip,
		showTarget = options.show.target,
		hideTarget = options.hide.target,
		containerTarget = posOptions.container,
		viewportTarget = posOptions.viewport,
		documentTarget = $(document),
		windowTarget = $(window),

		showEvents = options.show.event ? $.trim('' + options.show.event).split(' ') : [],
		hideEvents = options.hide.event ? $.trim('' + options.hide.event).split(' ') : [];


	// Assign passed event callbacks
	$.each(options.events, function(name, callback) {
		self._bind(tooltip, name === 'toggle' ? ['tooltipshow','tooltiphide'] : ['tooltip'+name], callback, null, tooltip);
	});

	// Hide tooltips when leaving current window/frame (but not select/option elements)
	if(/mouse(out|leave)/i.test(options.hide.event) && options.hide.leave === 'window') {
		this._bind(documentTarget, ['mouseout', 'blur'], function(event) {
			if(!/select|option/.test(event.target.nodeName) && !event.relatedTarget) {
				this.hide(event);
			}
		});
	}

	// Enable hide.fixed by adding appropriate class
	if(options.hide.fixed) {
		hideTarget = hideTarget.add( tooltip.addClass(CLASS_FIXED) );
	}

	/*
	 * Make sure hoverIntent functions properly by using mouseleave to clear show timer if
	 * mouseenter/mouseout is used for show.event, even if it isn't in the users options.
	 */
	else if(/mouse(over|enter)/i.test(options.show.event)) {
		this._bind(hideTarget, 'mouseleave', function() {
			clearTimeout(this.timers.show);
		});
	}

	// Hide tooltip on document mousedown if unfocus events are enabled
	if(('' + options.hide.event).indexOf('unfocus') > -1) {
		this._bind(containerTarget.closest('html'), ['mousedown', 'touchstart'], function(event) {
			var elem = $(event.target),
				enabled = this.rendered && !this.tooltip.hasClass(CLASS_DISABLED) && this.tooltip[0].offsetWidth > 0,
				isAncestor = elem.parents(SELECTOR).filter(this.tooltip[0]).length > 0;

			if(elem[0] !== this.target[0] && elem[0] !== this.tooltip[0] && !isAncestor &&
				!this.target.has(elem[0]).length && enabled
			) {
				this.hide(event);
			}
		});
	}

	// Check if the tooltip hides when inactive
	if('number' === typeof options.hide.inactive) {
		// Bind inactive method to show target(s) as a custom event
		this._bind(showTarget, 'qtip-'+this.id+'-inactive', inactiveMethod, 'inactive');

		// Define events which reset the 'inactive' event handler
		this._bind(hideTarget.add(tooltip), QTIP.inactiveEvents, inactiveMethod);
	}

	// Filter and bind events
	this._bindEvents(showEvents, hideEvents, showTarget, hideTarget, showMethod, hideMethod);

	// Mouse movement bindings
	this._bind(showTarget.add(tooltip), 'mousemove', function(event) {
		// Check if the tooltip hides when mouse is moved a certain distance
		if('number' === typeof options.hide.distance) {
			var origin = this.cache.origin || {},
				limit = this.options.hide.distance,
				abs = Math.abs;

			// Check if the movement has gone beyond the limit, and hide it if so
			if(abs(event.pageX - origin.pageX) >= limit || abs(event.pageY - origin.pageY) >= limit) {
				this.hide(event);
			}
		}

		// Cache mousemove coords on show targets
		this._storeMouse(event);
	});

	// Mouse positioning events
	if(posOptions.target === 'mouse') {
		// If mouse adjustment is on...
		if(posOptions.adjust.mouse) {
			// Apply a mouseleave event so we don't get problems with overlapping
			if(options.hide.event) {
				// Track if we're on the target or not
				this._bind(showTarget, ['mouseenter', 'mouseleave'], function(event) {
					if(!this.cache) {return FALSE; }
					this.cache.onTarget = event.type === 'mouseenter';
				});
			}

			// Update tooltip position on mousemove
			this._bind(documentTarget, 'mousemove', function(event) {
				// Update the tooltip position only if the tooltip is visible and adjustment is enabled
				if(this.rendered && this.cache.onTarget && !this.tooltip.hasClass(CLASS_DISABLED) && this.tooltip[0].offsetWidth > 0) {
					this.reposition(event);
				}
			});
		}
	}

	// Adjust positions of the tooltip on window resize if enabled
	if(posOptions.adjust.resize || viewportTarget.length) {
		this._bind( $.event.special.resize ? viewportTarget : windowTarget, 'resize', repositionMethod );
	}

	// Adjust tooltip position on scroll of the window or viewport element if present
	if(posOptions.adjust.scroll) {
		this._bind( windowTarget.add(posOptions.container), 'scroll', repositionMethod );
	}
};

// Un-assignment method
PROTOTYPE._unassignEvents = function() {
	var options = this.options,
		showTargets = options.show.target,
		hideTargets = options.hide.target,
		targets = $.grep([
			this.elements.target[0],
			this.rendered && this.tooltip[0],
			options.position.container[0],
			options.position.viewport[0],
			options.position.container.closest('html')[0], // unfocus
			window,
			document
		], function(i) {
			return typeof i === 'object';
		});

	// Add show and hide targets if they're valid
	if(showTargets && showTargets.toArray) {
		targets = targets.concat(showTargets.toArray());
	}
	if(hideTargets && hideTargets.toArray) {
		targets = targets.concat(hideTargets.toArray());
	}

	// Unbind the events
	this._unbind(targets)
		._unbind(targets, 'destroy')
		._unbind(targets, 'inactive');
};

// Apply common event handlers using delegate (avoids excessive .bind calls!)
$(function() {
	delegate(SELECTOR, ['mouseenter', 'mouseleave'], function(event) {
		var state = event.type === 'mouseenter',
			tooltip = $(event.currentTarget),
			target = $(event.relatedTarget || event.target),
			options = this.options;

		// On mouseenter...
		if(state) {
			// Focus the tooltip on mouseenter (z-index stacking)
			this.focus(event);

			// Clear hide timer on tooltip hover to prevent it from closing
			tooltip.hasClass(CLASS_FIXED) && !tooltip.hasClass(CLASS_DISABLED) && clearTimeout(this.timers.hide);
		}

		// On mouseleave...
		else {
			// When mouse tracking is enabled, hide when we leave the tooltip and not onto the show target (if a hide event is set)
			if(options.position.target === 'mouse' && options.position.adjust.mouse &&
				options.hide.event && options.show.target && !target.closest(options.show.target[0]).length) {
				this.hide(event);
			}
		}

		// Add hover class
		tooltip.toggleClass(CLASS_HOVER, state);
	});

	// Define events which reset the 'inactive' event handler
	delegate('['+ATTR_ID+']', INACTIVE_EVENTS, inactiveMethod);
});
;// Initialization method
function init(elem, id, opts) {
	var obj, posOptions, attr, config, title,

	// Setup element references
	docBody = $(document.body),

	// Use document body instead of document element if needed
	newTarget = elem[0] === document ? docBody : elem,

	// Grab metadata from element if plugin is present
	metadata = elem.metadata ? elem.metadata(opts.metadata) : NULL,

	// If metadata type if HTML5, grab 'name' from the object instead, or use the regular data object otherwise
	metadata5 = opts.metadata.type === 'html5' && metadata ? metadata[opts.metadata.name] : NULL,

	// Grab data from metadata.name (or data-qtipopts as fallback) using .data() method,
	html5 = elem.data(opts.metadata.name || 'qtipopts');

	// If we don't get an object returned attempt to parse it manualyl without parseJSON
	/* eslint-disable no-empty */
	try { html5 = typeof html5 === 'string' ? $.parseJSON(html5) : html5; }
	catch(e) {}
	/* eslint-enable no-empty */

	// Merge in and sanitize metadata
	config = $.extend(TRUE, {}, QTIP.defaults, opts,
		typeof html5 === 'object' ? sanitizeOptions(html5) : NULL,
		sanitizeOptions(metadata5 || metadata));

	// Re-grab our positioning options now we've merged our metadata and set id to passed value
	posOptions = config.position;
	config.id = id;

	// Setup missing content if none is detected
	if('boolean' === typeof config.content.text) {
		attr = elem.attr(config.content.attr);

		// Grab from supplied attribute if available
		if(config.content.attr !== FALSE && attr) { config.content.text = attr; }

		// No valid content was found, abort render
		else { return FALSE; }
	}

	// Setup target options
	if(!posOptions.container.length) { posOptions.container = docBody; }
	if(posOptions.target === FALSE) { posOptions.target = newTarget; }
	if(config.show.target === FALSE) { config.show.target = newTarget; }
	if(config.show.solo === TRUE) { config.show.solo = posOptions.container.closest('body'); }
	if(config.hide.target === FALSE) { config.hide.target = newTarget; }
	if(config.position.viewport === TRUE) { config.position.viewport = posOptions.container; }

	// Ensure we only use a single container
	posOptions.container = posOptions.container.eq(0);

	// Convert position corner values into x and y strings
	posOptions.at = new CORNER(posOptions.at, TRUE);
	posOptions.my = new CORNER(posOptions.my);

	// Destroy previous tooltip if overwrite is enabled, or skip element if not
	if(elem.data(NAMESPACE)) {
		if(config.overwrite) {
			elem.qtip('destroy', true);
		}
		else if(config.overwrite === FALSE) {
			return FALSE;
		}
	}

	// Add has-qtip attribute
	elem.attr(ATTR_HAS, id);

	// Remove title attribute and store it if present
	if(config.suppress && (title = elem.attr('title'))) {
		// Final attr call fixes event delegatiom and IE default tooltip showing problem
		elem.removeAttr('title').attr(oldtitle, title).attr('title', '');
	}

	// Initialize the tooltip and add API reference
	obj = new QTip(elem, config, id, !!attr);
	elem.data(NAMESPACE, obj);

	return obj;
}

// jQuery $.fn extension method
QTIP = $.fn.qtip = function(options, notation, newValue)
{
	var command = ('' + options).toLowerCase(), // Parse command
		returned = NULL,
		args = $.makeArray(arguments).slice(1),
		event = args[args.length - 1],
		opts = this[0] ? $.data(this[0], NAMESPACE) : NULL;

	// Check for API request
	if(!arguments.length && opts || command === 'api') {
		return opts;
	}

	// Execute API command if present
	else if('string' === typeof options) {
		this.each(function() {
			var api = $.data(this, NAMESPACE);
			if(!api) { return TRUE; }

			// Cache the event if possible
			if(event && event.timeStamp) { api.cache.event = event; }

			// Check for specific API commands
			if(notation && (command === 'option' || command === 'options')) {
				if(newValue !== undefined || $.isPlainObject(notation)) {
					api.set(notation, newValue);
				}
				else {
					returned = api.get(notation);
					return FALSE;
				}
			}

			// Execute API command
			else if(api[command]) {
				api[command].apply(api, args);
			}
		});

		return returned !== NULL ? returned : this;
	}

	// No API commands. validate provided options and setup qTips
	else if('object' === typeof options || !arguments.length) {
		// Sanitize options first
		opts = sanitizeOptions($.extend(TRUE, {}, options));

		return this.each(function(i) {
			var api, id;

			// Find next available ID, or use custom ID if provided
			id = $.isArray(opts.id) ? opts.id[i] : opts.id;
			id = !id || id === FALSE || id.length < 1 || QTIP.api[id] ? QTIP.nextid++ : id;

			// Initialize the qTip and re-grab newly sanitized options
			api = init($(this), id, opts);
			if(api === FALSE) { return TRUE; }
			else { QTIP.api[id] = api; }

			// Initialize plugins
			$.each(PLUGINS, function() {
				if(this.initialize === 'initialize') { this(api); }
			});

			// Assign initial pre-render events
			api._assignInitialEvents(event);
		});
	}
};

// Expose class
$.qtip = QTip;

// Populated in render method
QTIP.api = {};
;$.each({
	/* Allow other plugins to successfully retrieve the title of an element with a qTip applied */
	attr: function(attr, val) {
		if(this.length) {
			var self = this[0],
				title = 'title',
				api = $.data(self, 'qtip');

			if(attr === title && api && api.options && 'object' === typeof api && 'object' === typeof api.options && api.options.suppress) {
				if(arguments.length < 2) {
					return $.attr(self, oldtitle);
				}

				// If qTip is rendered and title was originally used as content, update it
				if(api && api.options.content.attr === title && api.cache.attr) {
					api.set('content.text', val);
				}

				// Use the regular attr method to set, then cache the result
				return this.attr(oldtitle, val);
			}
		}

		return $.fn['attr'+replaceSuffix].apply(this, arguments);
	},

	/* Allow clone to correctly retrieve cached title attributes */
	clone: function(keepData) {
		// Clone our element using the real clone method
		var elems = $.fn['clone'+replaceSuffix].apply(this, arguments);

		// Grab all elements with an oldtitle set, and change it to regular title attribute, if keepData is false
		if(!keepData) {
			elems.filter('['+oldtitle+']').attr('title', function() {
				return $.attr(this, oldtitle);
			})
			.removeAttr(oldtitle);
		}

		return elems;
	}
}, function(name, func) {
	if(!func || $.fn[name+replaceSuffix]) { return TRUE; }

	var old = $.fn[name+replaceSuffix] = $.fn[name];
	$.fn[name] = function() {
		return func.apply(this, arguments) || old.apply(this, arguments);
	};
});

/* Fire off 'removeqtip' handler in $.cleanData if jQuery UI not present (it already does similar).
 * This snippet is taken directly from jQuery UI source code found here:
 *     http://code.jquery.com/ui/jquery-ui-git.js
 */
if(!$.ui) {
	$['cleanData'+replaceSuffix] = $.cleanData;
	$.cleanData = function( elems ) {
		for(var i = 0, elem; (elem = $( elems[i] )).length; i++) {
			if(elem.attr(ATTR_HAS)) {
				/* eslint-disable no-empty */
				try { elem.triggerHandler('removeqtip'); }
				catch( e ) {}
				/* eslint-enable no-empty */
			}
		}
		$['cleanData'+replaceSuffix].apply(this, arguments);
	};
}
;// qTip version
QTIP.version = '3.0.3';

// Base ID for all qTips
QTIP.nextid = 0;

// Inactive events array
QTIP.inactiveEvents = INACTIVE_EVENTS;

// Base z-index for all qTips
QTIP.zindex = 15000;

// Define configuration defaults
QTIP.defaults = {
	prerender: FALSE,
	id: FALSE,
	overwrite: TRUE,
	suppress: TRUE,
	content: {
		text: TRUE,
		attr: 'title',
		title: FALSE,
		button: FALSE
	},
	position: {
		my: 'top left',
		at: 'bottom right',
		target: FALSE,
		container: FALSE,
		viewport: FALSE,
		adjust: {
			x: 0, y: 0,
			mouse: TRUE,
			scroll: TRUE,
			resize: TRUE,
			method: 'flipinvert flipinvert'
		},
		effect: function(api, pos) {
			$(this).animate(pos, {
				duration: 200,
				queue: FALSE
			});
		}
	},
	show: {
		target: FALSE,
		event: 'mouseenter',
		effect: TRUE,
		delay: 90,
		solo: FALSE,
		ready: FALSE,
		autofocus: FALSE
	},
	hide: {
		target: FALSE,
		event: 'mouseleave',
		effect: TRUE,
		delay: 0,
		fixed: FALSE,
		inactive: FALSE,
		leave: 'window',
		distance: FALSE
	},
	style: {
		classes: '',
		widget: FALSE,
		width: FALSE,
		height: FALSE,
		def: TRUE
	},
	events: {
		render: NULL,
		move: NULL,
		show: NULL,
		hide: NULL,
		toggle: NULL,
		visible: NULL,
		hidden: NULL,
		focus: NULL,
		blur: NULL
	}
};
;var TIP,
createVML,
SCALE,
PIXEL_RATIO,
BACKING_STORE_RATIO,

// Common CSS strings
MARGIN = 'margin',
BORDER = 'border',
COLOR = 'color',
BG_COLOR = 'background-color',
TRANSPARENT = 'transparent',
IMPORTANT = ' !important',

// Check if the browser supports <canvas/> elements
HASCANVAS = !!document.createElement('canvas').getContext,

// Invalid colour values used in parseColours()
INVALID = /rgba?\(0, 0, 0(, 0)?\)|transparent|#123456/i;

// Camel-case method, taken from jQuery source
// http://code.jquery.com/jquery-1.8.0.js
function camel(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/*
 * Modified from Modernizr's testPropsAll()
 * http://modernizr.com/downloads/modernizr-latest.js
 */
var cssProps = {}, cssPrefixes = ['Webkit', 'O', 'Moz', 'ms'];
function vendorCss(elem, prop) {
	var ucProp = prop.charAt(0).toUpperCase() + prop.slice(1),
		props = (prop + ' ' + cssPrefixes.join(ucProp + ' ') + ucProp).split(' '),
		cur, val, i = 0;

	// If the property has already been mapped...
	if(cssProps[prop]) { return elem.css(cssProps[prop]); }

	while(cur = props[i++]) {
		if((val = elem.css(cur)) !== undefined) {
			cssProps[prop] = cur;
			return val;
		}
	}
}

// Parse a given elements CSS property into an int
function intCss(elem, prop) {
	return Math.ceil(parseFloat(vendorCss(elem, prop)));
}


// VML creation (for IE only)
if(!HASCANVAS) {
	createVML = function(tag, props, style) {
		return '<qtipvml:'+tag+' xmlns="urn:schemas-microsoft.com:vml" class="qtip-vml" '+(props||'')+
			' style="behavior: url(#default#VML); '+(style||'')+ '" />';
	};
}

// Canvas only definitions
else {
	PIXEL_RATIO = window.devicePixelRatio || 1;
	BACKING_STORE_RATIO = (function() {
		var context = document.createElement('canvas').getContext('2d');
		return context.backingStorePixelRatio || context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio ||
				context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || 1;
	})();
	SCALE = PIXEL_RATIO / BACKING_STORE_RATIO;
}


function Tip(qtip, options) {
	this._ns = 'tip';
	this.options = options;
	this.offset = options.offset;
	this.size = [ options.width, options.height ];

	// Initialize
	this.qtip = qtip;
	this.init(qtip);
}

$.extend(Tip.prototype, {
	init: function(qtip) {
		var context, tip;

		// Create tip element and prepend to the tooltip
		tip = this.element = qtip.elements.tip = $('<div />', { 'class': NAMESPACE+'-tip' }).prependTo(qtip.tooltip);

		// Create tip drawing element(s)
		if(HASCANVAS) {
			// save() as soon as we create the canvas element so FF2 doesn't bork on our first restore()!
			context = $('<canvas />').appendTo(this.element)[0].getContext('2d');

			// Setup constant parameters
			context.lineJoin = 'miter';
			context.miterLimit = 100000;
			context.save();
		}
		else {
			context = createVML('shape', 'coordorigin="0,0"', 'position:absolute;');
			this.element.html(context + context);

			// Prevent mousing down on the tip since it causes problems with .live() handling in IE due to VML
			qtip._bind( $('*', tip).add(tip), ['click', 'mousedown'], function(event) { event.stopPropagation(); }, this._ns);
		}

		// Bind update events
		qtip._bind(qtip.tooltip, 'tooltipmove', this.reposition, this._ns, this);

		// Create it
		this.create();
	},

	_swapDimensions: function() {
		this.size[0] = this.options.height;
		this.size[1] = this.options.width;
	},
	_resetDimensions: function() {
		this.size[0] = this.options.width;
		this.size[1] = this.options.height;
	},

	_useTitle: function(corner) {
		var titlebar = this.qtip.elements.titlebar;
		return titlebar && (
			corner.y === TOP || corner.y === CENTER && this.element.position().top + this.size[1] / 2 + this.options.offset < titlebar.outerHeight(TRUE)
		);
	},

	_parseCorner: function(corner) {
		var my = this.qtip.options.position.my;

		// Detect corner and mimic properties
		if(corner === FALSE || my === FALSE) {
			corner = FALSE;
		}
		else if(corner === TRUE) {
			corner = new CORNER( my.string() );
		}
		else if(!corner.string) {
			corner = new CORNER(corner);
			corner.fixed = TRUE;
		}

		return corner;
	},

	_parseWidth: function(corner, side, use) {
		var elements = this.qtip.elements,
			prop = BORDER + camel(side) + 'Width';

		return (use ? intCss(use, prop) : 
			intCss(elements.content, prop) ||
			intCss(this._useTitle(corner) && elements.titlebar || elements.content, prop) ||
			intCss(elements.tooltip, prop)
		) || 0;
	},

	_parseRadius: function(corner) {
		var elements = this.qtip.elements,
			prop = BORDER + camel(corner.y) + camel(corner.x) + 'Radius';

		return BROWSER.ie < 9 ? 0 :
			intCss(this._useTitle(corner) && elements.titlebar || elements.content, prop) ||
			intCss(elements.tooltip, prop) || 0;
	},

	_invalidColour: function(elem, prop, compare) {
		var val = elem.css(prop);
		return !val || compare && val === elem.css(compare) || INVALID.test(val) ? FALSE : val;
	},

	_parseColours: function(corner) {
		var elements = this.qtip.elements,
			tip = this.element.css('cssText', ''),
			borderSide = BORDER + camel(corner[ corner.precedance ]) + camel(COLOR),
			colorElem = this._useTitle(corner) && elements.titlebar || elements.content,
			css = this._invalidColour, color = [];

		// Attempt to detect the background colour from various elements, left-to-right precedance
		color[0] = css(tip, BG_COLOR) || css(colorElem, BG_COLOR) || css(elements.content, BG_COLOR) ||
			css(elements.tooltip, BG_COLOR) || tip.css(BG_COLOR);

		// Attempt to detect the correct border side colour from various elements, left-to-right precedance
		color[1] = css(tip, borderSide, COLOR) || css(colorElem, borderSide, COLOR) ||
			css(elements.content, borderSide, COLOR) || css(elements.tooltip, borderSide, COLOR) || elements.tooltip.css(borderSide);

		// Reset background and border colours
		$('*', tip).add(tip).css('cssText', BG_COLOR+':'+TRANSPARENT+IMPORTANT+';'+BORDER+':0'+IMPORTANT+';');

		return color;
	},

	_calculateSize: function(corner) {
		var y = corner.precedance === Y,
			width = this.options.width,
			height = this.options.height,
			isCenter = corner.abbrev() === 'c',
			base = (y ? width: height) * (isCenter ? 0.5 : 1),
			pow = Math.pow,
			round = Math.round,
			bigHyp, ratio, result,

		smallHyp = Math.sqrt( pow(base, 2) + pow(height, 2) ),
		hyp = [
			this.border / base * smallHyp,
			this.border / height * smallHyp
		];

		hyp[2] = Math.sqrt( pow(hyp[0], 2) - pow(this.border, 2) );
		hyp[3] = Math.sqrt( pow(hyp[1], 2) - pow(this.border, 2) );

		bigHyp = smallHyp + hyp[2] + hyp[3] + (isCenter ? 0 : hyp[0]);
		ratio = bigHyp / smallHyp;

		result = [ round(ratio * width), round(ratio * height) ];
		return y ? result : result.reverse();
	},

	// Tip coordinates calculator
	_calculateTip: function(corner, size, scale) {
		scale = scale || 1;
		size = size || this.size;

		var width = size[0] * scale,
			height = size[1] * scale,
			width2 = Math.ceil(width / 2), height2 = Math.ceil(height / 2),

		// Define tip coordinates in terms of height and width values
		tips = {
			br:	[0,0,		width,height,	width,0],
			bl:	[0,0,		width,0,		0,height],
			tr:	[0,height,	width,0,		width,height],
			tl:	[0,0,		0,height,		width,height],
			tc:	[0,height,	width2,0,		width,height],
			bc:	[0,0,		width,0,		width2,height],
			rc:	[0,0,		width,height2,	0,height],
			lc:	[width,0,	width,height,	0,height2]
		};

		// Set common side shapes
		tips.lt = tips.br; tips.rt = tips.bl;
		tips.lb = tips.tr; tips.rb = tips.tl;

		return tips[ corner.abbrev() ];
	},

	// Tip coordinates drawer (canvas)
	_drawCoords: function(context, coords) {
		context.beginPath();
		context.moveTo(coords[0], coords[1]);
		context.lineTo(coords[2], coords[3]);
		context.lineTo(coords[4], coords[5]);
		context.closePath();
	},

	create: function() {
		// Determine tip corner
		var c = this.corner = (HASCANVAS || BROWSER.ie) && this._parseCorner(this.options.corner);

		// If we have a tip corner...
		this.enabled = !!this.corner && this.corner.abbrev() !== 'c';
		if(this.enabled) {
			// Cache it
			this.qtip.cache.corner = c.clone();

			// Create it
			this.update();
		}

		// Toggle tip element
		this.element.toggle(this.enabled);

		return this.corner;
	},

	update: function(corner, position) {
		if(!this.enabled) { return this; }

		var elements = this.qtip.elements,
			tip = this.element,
			inner = tip.children(),
			options = this.options,
			curSize = this.size,
			mimic = options.mimic,
			round = Math.round,
			color, precedance, context,
			coords, bigCoords, translate, newSize, border;

		// Re-determine tip if not already set
		if(!corner) { corner = this.qtip.cache.corner || this.corner; }

		// Use corner property if we detect an invalid mimic value
		if(mimic === FALSE) { mimic = corner; }

		// Otherwise inherit mimic properties from the corner object as necessary
		else {
			mimic = new CORNER(mimic);
			mimic.precedance = corner.precedance;

			if(mimic.x === 'inherit') { mimic.x = corner.x; }
			else if(mimic.y === 'inherit') { mimic.y = corner.y; }
			else if(mimic.x === mimic.y) {
				mimic[ corner.precedance ] = corner[ corner.precedance ];
			}
		}
		precedance = mimic.precedance;

		// Ensure the tip width.height are relative to the tip position
		if(corner.precedance === X) { this._swapDimensions(); }
		else { this._resetDimensions(); }

		// Update our colours
		color = this.color = this._parseColours(corner);

		// Detect border width, taking into account colours
		if(color[1] !== TRANSPARENT) {
			// Grab border width
			border = this.border = this._parseWidth(corner, corner[corner.precedance]);

			// If border width isn't zero, use border color as fill if it's not invalid (1.0 style tips)
			if(options.border && border < 1 && !INVALID.test(color[1])) { color[0] = color[1]; }

			// Set border width (use detected border width if options.border is true)
			this.border = border = options.border !== TRUE ? options.border : border;
		}

		// Border colour was invalid, set border to zero
		else { this.border = border = 0; }

		// Determine tip size
		newSize = this.size = this._calculateSize(corner);
		tip.css({
			width: newSize[0],
			height: newSize[1],
			lineHeight: newSize[1]+'px'
		});

		// Calculate tip translation
		if(corner.precedance === Y) {
			translate = [
				round(mimic.x === LEFT ? border : mimic.x === RIGHT ? newSize[0] - curSize[0] - border : (newSize[0] - curSize[0]) / 2),
				round(mimic.y === TOP ? newSize[1] - curSize[1] : 0)
			];
		}
		else {
			translate = [
				round(mimic.x === LEFT ? newSize[0] - curSize[0] : 0),
				round(mimic.y === TOP ? border : mimic.y === BOTTOM ? newSize[1] - curSize[1] - border : (newSize[1] - curSize[1]) / 2)
			];
		}

		// Canvas drawing implementation
		if(HASCANVAS) {
			// Grab canvas context and clear/save it
			context = inner[0].getContext('2d');
			context.restore(); context.save();
			context.clearRect(0,0,6000,6000);

			// Calculate coordinates
			coords = this._calculateTip(mimic, curSize, SCALE);
			bigCoords = this._calculateTip(mimic, this.size, SCALE);

			// Set the canvas size using calculated size
			inner.attr(WIDTH, newSize[0] * SCALE).attr(HEIGHT, newSize[1] * SCALE);
			inner.css(WIDTH, newSize[0]).css(HEIGHT, newSize[1]);

			// Draw the outer-stroke tip
			this._drawCoords(context, bigCoords);
			context.fillStyle = color[1];
			context.fill();

			// Draw the actual tip
			context.translate(translate[0] * SCALE, translate[1] * SCALE);
			this._drawCoords(context, coords);
			context.fillStyle = color[0];
			context.fill();
		}

		// VML (IE Proprietary implementation)
		else {
			// Calculate coordinates
			coords = this._calculateTip(mimic);

			// Setup coordinates string
			coords = 'm' + coords[0] + ',' + coords[1] + ' l' + coords[2] +
				',' + coords[3] + ' ' + coords[4] + ',' + coords[5] + ' xe';

			// Setup VML-specific offset for pixel-perfection
			translate[2] = border && /^(r|b)/i.test(corner.string()) ?
				BROWSER.ie === 8 ? 2 : 1 : 0;

			// Set initial CSS
			inner.css({
				coordsize: newSize[0]+border + ' ' + newSize[1]+border,
				antialias: ''+(mimic.string().indexOf(CENTER) > -1),
				left: translate[0] - translate[2] * Number(precedance === X),
				top: translate[1] - translate[2] * Number(precedance === Y),
				width: newSize[0] + border,
				height: newSize[1] + border
			})
			.each(function(i) {
				var $this = $(this);

				// Set shape specific attributes
				$this[ $this.prop ? 'prop' : 'attr' ]({
					coordsize: newSize[0]+border + ' ' + newSize[1]+border,
					path: coords,
					fillcolor: color[0],
					filled: !!i,
					stroked: !i
				})
				.toggle(!!(border || i));

				// Check if border is enabled and add stroke element
				!i && $this.html( createVML(
					'stroke', 'weight="'+border*2+'px" color="'+color[1]+'" miterlimit="1000" joinstyle="miter"'
				) );
			});
		}

		// Opera bug #357 - Incorrect tip position
		// https://github.com/Craga89/qTip2/issues/367
		window.opera && setTimeout(function() {
			elements.tip.css({
				display: 'inline-block',
				visibility: 'visible'
			});
		}, 1);

		// Position if needed
		if(position !== FALSE) { this.calculate(corner, newSize); }
	},

	calculate: function(corner, size) {
		if(!this.enabled) { return FALSE; }

		var self = this,
			elements = this.qtip.elements,
			tip = this.element,
			userOffset = this.options.offset,
			position = {},
			precedance, corners;

		// Inherit corner if not provided
		corner = corner || this.corner;
		precedance = corner.precedance;

		// Determine which tip dimension to use for adjustment
		size = size || this._calculateSize(corner);

		// Setup corners and offset array
		corners = [ corner.x, corner.y ];
		if(precedance === X) { corners.reverse(); }

		// Calculate tip position
		$.each(corners, function(i, side) {
			var b, bc, br;

			if(side === CENTER) {
				b = precedance === Y ? LEFT : TOP;
				position[ b ] = '50%';
				position[MARGIN+'-' + b] = -Math.round(size[ precedance === Y ? 0 : 1 ] / 2) + userOffset;
			}
			else {
				b = self._parseWidth(corner, side, elements.tooltip);
				bc = self._parseWidth(corner, side, elements.content);
				br = self._parseRadius(corner);

				position[ side ] = Math.max(-self.border, i ? bc : userOffset + (br > b ? br : -b));
			}
		});

		// Adjust for tip size
		position[ corner[precedance] ] -= size[ precedance === X ? 0 : 1 ];

		// Set and return new position
		tip.css({ margin: '', top: '', bottom: '', left: '', right: '' }).css(position);
		return position;
	},

	reposition: function(event, api, pos) {
		if(!this.enabled) { return; }

		var cache = api.cache,
			newCorner = this.corner.clone(),
			adjust = pos.adjusted,
			method = api.options.position.adjust.method.split(' '),
			horizontal = method[0],
			vertical = method[1] || method[0],
			shift = { left: FALSE, top: FALSE, x: 0, y: 0 },
			offset, css = {}, props;

		function shiftflip(direction, precedance, popposite, side, opposite) {
			// Horizontal - Shift or flip method
			if(direction === SHIFT && newCorner.precedance === precedance && adjust[side] && newCorner[popposite] !== CENTER) {
				newCorner.precedance = newCorner.precedance === X ? Y : X;
			}
			else if(direction !== SHIFT && adjust[side]){
				newCorner[precedance] = newCorner[precedance] === CENTER ?
					adjust[side] > 0 ? side : opposite :
					newCorner[precedance] === side ? opposite : side;
			}
		}

		function shiftonly(xy, side, opposite) {
			if(newCorner[xy] === CENTER) {
				css[MARGIN+'-'+side] = shift[xy] = offset[MARGIN+'-'+side] - adjust[side];
			}
			else {
				props = offset[opposite] !== undefined ?
					[ adjust[side], -offset[side] ] : [ -adjust[side], offset[side] ];

				if( (shift[xy] = Math.max(props[0], props[1])) > props[0] ) {
					pos[side] -= adjust[side];
					shift[side] = FALSE;
				}

				css[ offset[opposite] !== undefined ? opposite : side ] = shift[xy];
			}
		}

		// If our tip position isn't fixed e.g. doesn't adjust with viewport...
		if(this.corner.fixed !== TRUE) {
			// Perform shift/flip adjustments
			shiftflip(horizontal, X, Y, LEFT, RIGHT);
			shiftflip(vertical, Y, X, TOP, BOTTOM);

			// Update and redraw the tip if needed (check cached details of last drawn tip)
			if(newCorner.string() !== cache.corner.string() || cache.cornerTop !== adjust.top || cache.cornerLeft !== adjust.left) {
				this.update(newCorner, FALSE);
			}
		}

		// Setup tip offset properties
		offset = this.calculate(newCorner);

		// Readjust offset object to make it left/top
		if(offset.right !== undefined) { offset.left = -offset.right; }
		if(offset.bottom !== undefined) { offset.top = -offset.bottom; }
		offset.user = this.offset;

		// Perform shift adjustments
		shift.left = horizontal === SHIFT && !!adjust.left;
		if(shift.left) {
			shiftonly(X, LEFT, RIGHT);
		}
		shift.top = vertical === SHIFT && !!adjust.top;
		if(shift.top) {
			shiftonly(Y, TOP, BOTTOM);
		}

		/*
		* If the tip is adjusted in both dimensions, or in a
		* direction that would cause it to be anywhere but the
		* outer border, hide it!
		*/
		this.element.css(css).toggle(
			!(shift.x && shift.y || newCorner.x === CENTER && shift.y || newCorner.y === CENTER && shift.x)
		);

		// Adjust position to accomodate tip dimensions
		pos.left -= offset.left.charAt ? offset.user :
			horizontal !== SHIFT || shift.top || !shift.left && !shift.top ? offset.left + this.border : 0;
		pos.top -= offset.top.charAt ? offset.user :
			vertical !== SHIFT || shift.left || !shift.left && !shift.top ? offset.top + this.border : 0;

		// Cache details
		cache.cornerLeft = adjust.left; cache.cornerTop = adjust.top;
		cache.corner = newCorner.clone();
	},

	destroy: function() {
		// Unbind events
		this.qtip._unbind(this.qtip.tooltip, this._ns);

		// Remove the tip element(s)
		if(this.qtip.elements.tip) {
			this.qtip.elements.tip.find('*')
				.remove().end().remove();
		}
	}
});

TIP = PLUGINS.tip = function(api) {
	return new Tip(api, api.options.style.tip);
};

// Initialize tip on render
TIP.initialize = 'render';

// Setup plugin sanitization options
TIP.sanitize = function(options) {
	if(options.style && 'tip' in options.style) {
		var opts = options.style.tip;
		if(typeof opts !== 'object') { opts = options.style.tip = { corner: opts }; }
		if(!(/string|boolean/i).test(typeof opts.corner)) { opts.corner = TRUE; }
	}
};

// Add new option checks for the plugin
CHECKS.tip = {
	'^position.my|style.tip.(corner|mimic|border)$': function() {
		// Make sure a tip can be drawn
		this.create();

		// Reposition the tooltip
		this.qtip.reposition();
	},
	'^style.tip.(height|width)$': function(obj) {
		// Re-set dimensions and redraw the tip
		this.size = [ obj.width, obj.height ];
		this.update();

		// Reposition the tooltip
		this.qtip.reposition();
	},
	'^content.title|style.(classes|widget)$': function() {
		this.update();
	}
};

// Extend original qTip defaults
$.extend(TRUE, QTIP.defaults, {
	style: {
		tip: {
			corner: TRUE,
			mimic: FALSE,
			width: 6,
			height: 6,
			border: TRUE,
			offset: 0
		}
	}
});
;var MODAL, OVERLAY,
	MODALCLASS = 'qtip-modal',
	MODALSELECTOR = '.'+MODALCLASS;

OVERLAY = function()
{
	var self = this,
		focusableElems = {},
		current,
		prevState,
		elem;

	// Modified code from jQuery UI 1.10.0 source
	// http://code.jquery.com/ui/1.10.0/jquery-ui.js
	function focusable(element) {
		// Use the defined focusable checker when possible
		if($.expr[':'].focusable) { return $.expr[':'].focusable; }

		var isTabIndexNotNaN = !isNaN($.attr(element, 'tabindex')),
			nodeName = element.nodeName && element.nodeName.toLowerCase(),
			map, mapName, img;

		if('area' === nodeName) {
			map = element.parentNode;
			mapName = map.name;
			if(!element.href || !mapName || map.nodeName.toLowerCase() !== 'map') {
				return false;
			}
			img = $('img[usemap=#' + mapName + ']')[0];
			return !!img && img.is(':visible');
		}

		return /input|select|textarea|button|object/.test( nodeName ) ?
			!element.disabled :
			'a' === nodeName ?
				element.href || isTabIndexNotNaN :
				isTabIndexNotNaN
		;
	}

	// Focus inputs using cached focusable elements (see update())
	function focusInputs(blurElems) {
		// Blurring body element in IE causes window.open windows to unfocus!
		if(focusableElems.length < 1 && blurElems.length) { blurElems.not('body').blur(); }

		// Focus the inputs
		else { focusableElems.first().focus(); }
	}

	// Steal focus from elements outside tooltip
	function stealFocus(event) {
		if(!elem.is(':visible')) { return; }

		var target = $(event.target),
			tooltip = current.tooltip,
			container = target.closest(SELECTOR),
			targetOnTop;

		// Determine if input container target is above this
		targetOnTop = container.length < 1 ? FALSE :
			parseInt(container[0].style.zIndex, 10) > parseInt(tooltip[0].style.zIndex, 10);

		// If we're showing a modal, but focus has landed on an input below
		// this modal, divert focus to the first visible input in this modal
		// or if we can't find one... the tooltip itself
		if(!targetOnTop && target.closest(SELECTOR)[0] !== tooltip[0]) {
			focusInputs(target);
		}
	}

	$.extend(self, {
		init: function() {
			// Create document overlay
			elem = self.elem = $('<div />', {
				id: 'qtip-overlay',
				html: '<div></div>',
				mousedown: function() { return FALSE; }
			})
			.hide();

			// Make sure we can't focus anything outside the tooltip
			$(document.body).bind('focusin'+MODALSELECTOR, stealFocus);

			// Apply keyboard "Escape key" close handler
			$(document).bind('keydown'+MODALSELECTOR, function(event) {
				if(current && current.options.show.modal.escape && event.keyCode === 27) {
					current.hide(event);
				}
			});

			// Apply click handler for blur option
			elem.bind('click'+MODALSELECTOR, function(event) {
				if(current && current.options.show.modal.blur) {
					current.hide(event);
				}
			});

			return self;
		},

		update: function(api) {
			// Update current API reference
			current = api;

			// Update focusable elements if enabled
			if(api.options.show.modal.stealfocus !== FALSE) {
				focusableElems = api.tooltip.find('*').filter(function() {
					return focusable(this);
				});
			}
			else { focusableElems = []; }
		},

		toggle: function(api, state, duration) {
			var tooltip = api.tooltip,
				options = api.options.show.modal,
				effect = options.effect,
				type = state ? 'show': 'hide',
				visible = elem.is(':visible'),
				visibleModals = $(MODALSELECTOR).filter(':visible:not(:animated)').not(tooltip);

			// Set active tooltip API reference
			self.update(api);

			// If the modal can steal the focus...
			// Blur the current item and focus anything in the modal we an
			if(state && options.stealfocus !== FALSE) {
				focusInputs( $(':focus') );
			}

			// Toggle backdrop cursor style on show
			elem.toggleClass('blurs', options.blur);

			// Append to body on show
			if(state) {
				elem.appendTo(document.body);
			}

			// Prevent modal from conflicting with show.solo, and don't hide backdrop is other modals are visible
			if(elem.is(':animated') && visible === state && prevState !== FALSE || !state && visibleModals.length) {
				return self;
			}

			// Stop all animations
			elem.stop(TRUE, FALSE);

			// Use custom function if provided
			if($.isFunction(effect)) {
				effect.call(elem, state);
			}

			// If no effect type is supplied, use a simple toggle
			else if(effect === FALSE) {
				elem[ type ]();
			}

			// Use basic fade function
			else {
				elem.fadeTo( parseInt(duration, 10) || 90, state ? 1 : 0, function() {
					if(!state) { elem.hide(); }
				});
			}

			// Reset position and detach from body on hide
			if(!state) {
				elem.queue(function(next) {
					elem.css({ left: '', top: '' });
					if(!$(MODALSELECTOR).length) { elem.detach(); }
					next();
				});
			}

			// Cache the state
			prevState = state;

			// If the tooltip is destroyed, set reference to null
			if(current.destroyed) { current = NULL; }

			return self;
		}
	});

	self.init();
};
OVERLAY = new OVERLAY();

function Modal(api, options) {
	this.options = options;
	this._ns = '-modal';

	this.qtip = api;
	this.init(api);
}

$.extend(Modal.prototype, {
	init: function(qtip) {
		var tooltip = qtip.tooltip;

		// If modal is disabled... return
		if(!this.options.on) { return this; }

		// Set overlay reference
		qtip.elements.overlay = OVERLAY.elem;

		// Add unique attribute so we can grab modal tooltips easily via a SELECTOR, and set z-index
		tooltip.addClass(MODALCLASS).css('z-index', QTIP.modal_zindex + $(MODALSELECTOR).length);

		// Apply our show/hide/focus modal events
		qtip._bind(tooltip, ['tooltipshow', 'tooltiphide'], function(event, api, duration) {
			var oEvent = event.originalEvent;

			// Make sure mouseout doesn't trigger a hide when showing the modal and mousing onto backdrop
			if(event.target === tooltip[0]) {
				if(oEvent && event.type === 'tooltiphide' && /mouse(leave|enter)/.test(oEvent.type) && $(oEvent.relatedTarget).closest(OVERLAY.elem[0]).length) {
					/* eslint-disable no-empty */
					try { event.preventDefault(); }
					catch(e) {}
					/* eslint-enable no-empty */
				}
				else if(!oEvent || oEvent && oEvent.type !== 'tooltipsolo') {
					this.toggle(event, event.type === 'tooltipshow', duration);
				}
			}
		}, this._ns, this);

		// Adjust modal z-index on tooltip focus
		qtip._bind(tooltip, 'tooltipfocus', function(event, api) {
			// If focus was cancelled before it reached us, don't do anything
			if(event.isDefaultPrevented() || event.target !== tooltip[0]) { return; }

			var qtips = $(MODALSELECTOR),

			// Keep the modal's lower than other, regular qtips
			newIndex = QTIP.modal_zindex + qtips.length,
			curIndex = parseInt(tooltip[0].style.zIndex, 10);

			// Set overlay z-index
			OVERLAY.elem[0].style.zIndex = newIndex - 1;

			// Reduce modal z-index's and keep them properly ordered
			qtips.each(function() {
				if(this.style.zIndex > curIndex) {
					this.style.zIndex -= 1;
				}
			});

			// Fire blur event for focused tooltip
			qtips.filter('.' + CLASS_FOCUS).qtip('blur', event.originalEvent);

			// Set the new z-index
			tooltip.addClass(CLASS_FOCUS)[0].style.zIndex = newIndex;

			// Set current
			OVERLAY.update(api);

			// Prevent default handling
			/* eslint-disable no-empty */
			try { event.preventDefault(); }
			catch(e) {}
			/* eslint-enable no-empty */
		}, this._ns, this);

		// Focus any other visible modals when this one hides
		qtip._bind(tooltip, 'tooltiphide', function(event) {
			if(event.target === tooltip[0]) {
				$(MODALSELECTOR).filter(':visible').not(tooltip).last().qtip('focus', event);
			}
		}, this._ns, this);
	},

	toggle: function(event, state, duration) {
		// Make sure default event hasn't been prevented
		if(event && event.isDefaultPrevented()) { return this; }

		// Toggle it
		OVERLAY.toggle(this.qtip, !!state, duration);
	},

	destroy: function() {
		// Remove modal class
		this.qtip.tooltip.removeClass(MODALCLASS);

		// Remove bound events
		this.qtip._unbind(this.qtip.tooltip, this._ns);

		// Delete element reference
		OVERLAY.toggle(this.qtip, FALSE);
		delete this.qtip.elements.overlay;
	}
});


MODAL = PLUGINS.modal = function(api) {
	return new Modal(api, api.options.show.modal);
};

// Setup sanitiztion rules
MODAL.sanitize = function(opts) {
	if(opts.show) {
		if(typeof opts.show.modal !== 'object') { opts.show.modal = { on: !!opts.show.modal }; }
		else if(typeof opts.show.modal.on === 'undefined') { opts.show.modal.on = TRUE; }
	}
};

// Base z-index for all modal tooltips (use qTip core z-index as a base)
/* eslint-disable camelcase */
QTIP.modal_zindex = QTIP.zindex - 200;
/* eslint-enable camelcase */

// Plugin needs to be initialized on render
MODAL.initialize = 'render';

// Setup option set checks
CHECKS.modal = {
	'^show.modal.(on|blur)$': function() {
		// Initialise
		this.destroy();
		this.init();

		// Show the modal if not visible already and tooltip is visible
		this.qtip.elems.overlay.toggle(
			this.qtip.tooltip[0].offsetWidth > 0
		);
	}
};

// Extend original api defaults
$.extend(TRUE, QTIP.defaults, {
	show: {
		modal: {
			on: FALSE,
			effect: TRUE,
			blur: TRUE,
			stealfocus: TRUE,
			escape: TRUE
		}
	}
});
;PLUGINS.viewport = function(api, position, posOptions, targetWidth, targetHeight, elemWidth, elemHeight)
{
	var target = posOptions.target,
		tooltip = api.elements.tooltip,
		my = posOptions.my,
		at = posOptions.at,
		adjust = posOptions.adjust,
		method = adjust.method.split(' '),
		methodX = method[0],
		methodY = method[1] || method[0],
		viewport = posOptions.viewport,
		container = posOptions.container,
		adjusted = { left: 0, top: 0 },
		fixed, newMy, containerOffset, containerStatic,
		viewportWidth, viewportHeight, viewportScroll, viewportOffset;

	// If viewport is not a jQuery element, or it's the window/document, or no adjustment method is used... return
	if(!viewport.jquery || target[0] === window || target[0] === document.body || adjust.method === 'none') {
		return adjusted;
	}

	// Cach container details
	containerOffset = container.offset() || adjusted;
	containerStatic = container.css('position') === 'static';

	// Cache our viewport details
	fixed = tooltip.css('position') === 'fixed';
	viewportWidth = viewport[0] === window ? viewport.width() : viewport.outerWidth(FALSE);
	viewportHeight = viewport[0] === window ? viewport.height() : viewport.outerHeight(FALSE);
	viewportScroll = { left: fixed ? 0 : viewport.scrollLeft(), top: fixed ? 0 : viewport.scrollTop() };
	viewportOffset = viewport.offset() || adjusted;

	// Generic calculation method
	function calculate(side, otherSide, type, adjustment, side1, side2, lengthName, targetLength, elemLength) {
		var initialPos = position[side1],
			mySide = my[side],
			atSide = at[side],
			isShift = type === SHIFT,
			myLength = mySide === side1 ? elemLength : mySide === side2 ? -elemLength : -elemLength / 2,
			atLength = atSide === side1 ? targetLength : atSide === side2 ? -targetLength : -targetLength / 2,
			sideOffset = viewportScroll[side1] + viewportOffset[side1] - (containerStatic ? 0 : containerOffset[side1]),
			overflow1 = sideOffset - initialPos,
			overflow2 = initialPos + elemLength - (lengthName === WIDTH ? viewportWidth : viewportHeight) - sideOffset,
			offset = myLength - (my.precedance === side || mySide === my[otherSide] ? atLength : 0) - (atSide === CENTER ? targetLength / 2 : 0);

		// shift
		if(isShift) {
			offset = (mySide === side1 ? 1 : -1) * myLength;

			// Adjust position but keep it within viewport dimensions
			position[side1] += overflow1 > 0 ? overflow1 : overflow2 > 0 ? -overflow2 : 0;
			position[side1] = Math.max(
				-containerOffset[side1] + viewportOffset[side1],
				initialPos - offset,
				Math.min(
					Math.max(
						-containerOffset[side1] + viewportOffset[side1] + (lengthName === WIDTH ? viewportWidth : viewportHeight),
						initialPos + offset
					),
					position[side1],

					// Make sure we don't adjust complete off the element when using 'center'
					mySide === 'center' ? initialPos - myLength : 1E9
				)
			);

		}

		// flip/flipinvert
		else {
			// Update adjustment amount depending on if using flipinvert or flip
			adjustment *= type === FLIPINVERT ? 2 : 0;

			// Check for overflow on the left/top
			if(overflow1 > 0 && (mySide !== side1 || overflow2 > 0)) {
				position[side1] -= offset + adjustment;
				newMy.invert(side, side1);
			}

			// Check for overflow on the bottom/right
			else if(overflow2 > 0 && (mySide !== side2 || overflow1 > 0)  ) {
				position[side1] -= (mySide === CENTER ? -offset : offset) + adjustment;
				newMy.invert(side, side2);
			}

			// Make sure we haven't made things worse with the adjustment and reset if so
			if(position[side1] < viewportScroll[side1] && -position[side1] > overflow2) {
				position[side1] = initialPos; newMy = my.clone();
			}
		}

		return position[side1] - initialPos;
	}

	// Set newMy if using flip or flipinvert methods
	if(methodX !== 'shift' || methodY !== 'shift') { newMy = my.clone(); }

	// Adjust position based onviewport and adjustment options
	adjusted = {
		left: methodX !== 'none' ? calculate( X, Y, methodX, adjust.x, LEFT, RIGHT, WIDTH, targetWidth, elemWidth ) : 0,
		top: methodY !== 'none' ? calculate( Y, X, methodY, adjust.y, TOP, BOTTOM, HEIGHT, targetHeight, elemHeight ) : 0,
		my: newMy
	};

	return adjusted;
};
;PLUGINS.polys = {
	// POLY area coordinate calculator
	//	Special thanks to Ed Cradock for helping out with this.
	//	Uses a binary search algorithm to find suitable coordinates.
	polygon: function(baseCoords, corner) {
		var result = {
			width: 0, height: 0,
			position: {
				top: 1e10, right: 0,
				bottom: 0, left: 1e10
			},
			adjustable: FALSE
		},
		i = 0, next,
		coords = [],
		compareX = 1, compareY = 1,
		realX = 0, realY = 0,
		newWidth, newHeight;

		// First pass, sanitize coords and determine outer edges
		i = baseCoords.length; 
		while(i--) {
			next = [ parseInt(baseCoords[--i], 10), parseInt(baseCoords[i+1], 10) ];

			if(next[0] > result.position.right){ result.position.right = next[0]; }
			if(next[0] < result.position.left){ result.position.left = next[0]; }
			if(next[1] > result.position.bottom){ result.position.bottom = next[1]; }
			if(next[1] < result.position.top){ result.position.top = next[1]; }

			coords.push(next);
		}

		// Calculate height and width from outer edges
		newWidth = result.width = Math.abs(result.position.right - result.position.left);
		newHeight = result.height = Math.abs(result.position.bottom - result.position.top);

		// If it's the center corner...
		if(corner.abbrev() === 'c') {
			result.position = {
				left: result.position.left + result.width / 2,
				top: result.position.top + result.height / 2
			};
		}
		else {
			// Second pass, use a binary search algorithm to locate most suitable coordinate
			while(newWidth > 0 && newHeight > 0 && compareX > 0 && compareY > 0)
			{
				newWidth = Math.floor(newWidth / 2);
				newHeight = Math.floor(newHeight / 2);

				if(corner.x === LEFT){ compareX = newWidth; }
				else if(corner.x === RIGHT){ compareX = result.width - newWidth; }
				else{ compareX += Math.floor(newWidth / 2); }

				if(corner.y === TOP){ compareY = newHeight; }
				else if(corner.y === BOTTOM){ compareY = result.height - newHeight; }
				else{ compareY += Math.floor(newHeight / 2); }

				i = coords.length;
				while(i--)
				{
					if(coords.length < 2){ break; }

					realX = coords[i][0] - result.position.left;
					realY = coords[i][1] - result.position.top;

					if(
						corner.x === LEFT && realX >= compareX ||
						corner.x === RIGHT && realX <= compareX ||
						corner.x === CENTER && (realX < compareX || realX > result.width - compareX) ||
						corner.y === TOP && realY >= compareY ||
						corner.y === BOTTOM && realY <= compareY ||
						corner.y === CENTER && (realY < compareY || realY > result.height - compareY)) {
						coords.splice(i, 1);
					}
				}
			}
			result.position = { left: coords[0][0], top: coords[0][1] };
		}

		return result;
	},

	rect: function(ax, ay, bx, by) {
		return {
			width: Math.abs(bx - ax),
			height: Math.abs(by - ay),
			position: {
				left: Math.min(ax, bx),
				top: Math.min(ay, by)
			}
		};
	},

	_angles: {
		tc: 3 / 2, tr: 7 / 4, tl: 5 / 4,
		bc: 1 / 2, br: 1 / 4, bl: 3 / 4,
		rc: 2, lc: 1, c: 0
	},
	ellipse: function(cx, cy, rx, ry, corner) {
		var c = PLUGINS.polys._angles[ corner.abbrev() ],
			rxc = c === 0 ? 0 : rx * Math.cos( c * Math.PI ),
			rys = ry * Math.sin( c * Math.PI );

		return {
			width: rx * 2 - Math.abs(rxc),
			height: ry * 2 - Math.abs(rys),
			position: {
				left: cx + rxc,
				top: cy + rys
			},
			adjustable: FALSE
		};
	},
	circle: function(cx, cy, r, corner) {
		return PLUGINS.polys.ellipse(cx, cy, r, r, corner);
	}
};
;PLUGINS.svg = function(api, svg, corner)
{
	var elem = svg[0],
		root = $(elem.ownerSVGElement),
		ownerDocument = elem.ownerDocument,
		strokeWidth2 = (parseInt(svg.css('stroke-width'), 10) || 0) / 2,
		frameOffset, mtx, transformed,
		len, next, i, points,
		result, position;

	// Ascend the parentNode chain until we find an element with getBBox()
	while(!elem.getBBox) { elem = elem.parentNode; }
	if(!elem.getBBox || !elem.parentNode) { return FALSE; }

	// Determine which shape calculation to use
	switch(elem.nodeName) {
		case 'ellipse':
		case 'circle':
			result = PLUGINS.polys.ellipse(
				elem.cx.baseVal.value,
				elem.cy.baseVal.value,
				(elem.rx || elem.r).baseVal.value + strokeWidth2,
				(elem.ry || elem.r).baseVal.value + strokeWidth2,
				corner
			);
		break;

		case 'line':
		case 'polygon':
		case 'polyline':
			// Determine points object (line has none, so mimic using array)
			points = elem.points || [
				{ x: elem.x1.baseVal.value, y: elem.y1.baseVal.value },
				{ x: elem.x2.baseVal.value, y: elem.y2.baseVal.value }
			];

			for(result = [], i = -1, len = points.numberOfItems || points.length; ++i < len;) {
				next = points.getItem ? points.getItem(i) : points[i];
				result.push.apply(result, [next.x, next.y]);
			}

			result = PLUGINS.polys.polygon(result, corner);
		break;

		// Unknown shape or rectangle? Use bounding box
		default:
			result = elem.getBBox();
			result = {
				width: result.width,
				height: result.height,
				position: {
					left: result.x,
					top: result.y
				}
			};
		break;
	}

	// Shortcut assignments
	position = result.position;
	root = root[0];

	// Convert position into a pixel value
	if(root.createSVGPoint) {
		mtx = elem.getScreenCTM();
		points = root.createSVGPoint();

		points.x = position.left;
		points.y = position.top;
		transformed = points.matrixTransform( mtx );
		position.left = transformed.x;
		position.top = transformed.y;
	}

	// Check the element is not in a child document, and if so, adjust for frame elements offset
	if(ownerDocument !== document && api.position.target !== 'mouse') {
		frameOffset = $((ownerDocument.defaultView || ownerDocument.parentWindow).frameElement).offset();
		if(frameOffset) {
			position.left += frameOffset.left;
			position.top += frameOffset.top;
		}
	}

	// Adjust by scroll offset of owner document
	ownerDocument = $(ownerDocument);
	position.left += ownerDocument.scrollLeft();
	position.top += ownerDocument.scrollTop();

	return result;
};
;PLUGINS.imagemap = function(api, area, corner)
{
	if(!area.jquery) { area = $(area); }

	var shape = (area.attr('shape') || 'rect').toLowerCase().replace('poly', 'polygon'),
		image = $('img[usemap="#'+area.parent('map').attr('name')+'"]'),
		coordsString = $.trim(area.attr('coords')),
		coordsArray = coordsString.replace(/,$/, '').split(','),
		imageOffset, coords, i, result, len;

	// If we can't find the image using the map...
	if(!image.length) { return FALSE; }

	// Pass coordinates string if polygon
	if(shape === 'polygon') {
		result = PLUGINS.polys.polygon(coordsArray, corner);
	}

	// Otherwise parse the coordinates and pass them as arguments
	else if(PLUGINS.polys[shape]) {
		for(i = -1, len = coordsArray.length, coords = []; ++i < len;) {
			coords.push( parseInt(coordsArray[i], 10) );
		}

		result = PLUGINS.polys[shape].apply(
			this, coords.concat(corner)
		);
	}

	// If no shapre calculation method was found, return false
	else { return FALSE; }

	// Make sure we account for padding and borders on the image
	imageOffset = image.offset();
	imageOffset.left += Math.ceil((image.outerWidth(FALSE) - image.width()) / 2);
	imageOffset.top += Math.ceil((image.outerHeight(FALSE) - image.height()) / 2);

	// Add image position to offset coordinates
	result.position.left += imageOffset.left;
	result.position.top += imageOffset.top;

	return result;
};
;var IE6,

/*
 * BGIFrame adaption (http://plugins.jquery.com/project/bgiframe)
 * Special thanks to Brandon Aaron
 */
BGIFRAME = '<iframe class="qtip-bgiframe" frameborder="0" tabindex="-1" src="javascript:\'\';" ' +
	' style="display:block; position:absolute; z-index:-1; filter:alpha(opacity=0); ' +
		'-ms-filter:"progid:DXImageTransform.Microsoft.Alpha(Opacity=0)";"></iframe>';

function Ie6(api) {
	this._ns = 'ie6';

	this.qtip = api;
	this.init(api);
}

$.extend(Ie6.prototype, {
	_scroll : function() {
		var overlay = this.qtip.elements.overlay;
		overlay && (overlay[0].style.top = $(window).scrollTop() + 'px');
	},

	init: function(qtip) {
		var tooltip = qtip.tooltip;

		// Create the BGIFrame element if needed
		if($('select, object').length < 1) {
			this.bgiframe = qtip.elements.bgiframe = $(BGIFRAME).appendTo(tooltip);

			// Update BGIFrame on tooltip move
			qtip._bind(tooltip, 'tooltipmove', this.adjustBGIFrame, this._ns, this);
		}

		// redraw() container for width/height calculations
		this.redrawContainer = $('<div/>', { id: NAMESPACE+'-rcontainer' })
			.appendTo(document.body);

		// Fixup modal plugin if present too
		if( qtip.elements.overlay && qtip.elements.overlay.addClass('qtipmodal-ie6fix') ) {
			qtip._bind(window, ['scroll', 'resize'], this._scroll, this._ns, this);
			qtip._bind(tooltip, ['tooltipshow'], this._scroll, this._ns, this);
		}

		// Set dimensions
		this.redraw();
	},

	adjustBGIFrame: function() {
		var tooltip = this.qtip.tooltip,
			dimensions = {
				height: tooltip.outerHeight(FALSE),
				width: tooltip.outerWidth(FALSE)
			},
			plugin = this.qtip.plugins.tip,
			tip = this.qtip.elements.tip,
			tipAdjust, offset;

		// Adjust border offset
		offset = parseInt(tooltip.css('borderLeftWidth'), 10) || 0;
		offset = { left: -offset, top: -offset };

		// Adjust for tips plugin
		if(plugin && tip) {
			tipAdjust = plugin.corner.precedance === 'x' ? [WIDTH, LEFT] : [HEIGHT, TOP];
			offset[ tipAdjust[1] ] -= tip[ tipAdjust[0] ]();
		}

		// Update bgiframe
		this.bgiframe.css(offset).css(dimensions);
	},

	// Max/min width simulator function
	redraw: function() {
		if(this.qtip.rendered < 1 || this.drawing) { return this; }

		var tooltip = this.qtip.tooltip,
			style = this.qtip.options.style,
			container = this.qtip.options.position.container,
			perc, width, max, min;

		// Set drawing flag
		this.qtip.drawing = 1;

		// If tooltip has a set height/width, just set it... like a boss!
		if(style.height) { tooltip.css(HEIGHT, style.height); }
		if(style.width) { tooltip.css(WIDTH, style.width); }

		// Simulate max/min width if not set width present...
		else {
			// Reset width and add fluid class
			tooltip.css(WIDTH, '').appendTo(this.redrawContainer);

			// Grab our tooltip width (add 1 if odd so we don't get wrapping problems.. huzzah!)
			width = tooltip.width();
			if(width % 2 < 1) { width += 1; }

			// Grab our max/min properties
			max = tooltip.css('maxWidth') || '';
			min = tooltip.css('minWidth') || '';

			// Parse into proper pixel values
			perc = (max + min).indexOf('%') > -1 ? container.width() / 100 : 0;
			max = (max.indexOf('%') > -1 ? perc : 1 * parseInt(max, 10)) || width;
			min = (min.indexOf('%') > -1 ? perc : 1 * parseInt(min, 10)) || 0;

			// Determine new dimension size based on max/min/current values
			width = max + min ? Math.min(Math.max(width, min), max) : width;

			// Set the newly calculated width and remvoe fluid class
			tooltip.css(WIDTH, Math.round(width)).appendTo(container);
		}

		// Set drawing flag
		this.drawing = 0;

		return this;
	},

	destroy: function() {
		// Remove iframe
		this.bgiframe && this.bgiframe.remove();

		// Remove bound events
		this.qtip._unbind([window, this.qtip.tooltip], this._ns);
	}
});

IE6 = PLUGINS.ie6 = function(api) {
	// Proceed only if the browser is IE6
	return BROWSER.ie === 6 ? new Ie6(api) : FALSE;
};

IE6.initialize = 'render';

CHECKS.ie6 = {
	'^content|style$': function() {
		this.redraw();
	}
};
;}));
}( window, document ));

define('keboacy/ui/confirm',[
    'qtip2'
], function(){

    // modal confirm

    var TPL_CONFIRM = '<div class="modal fade v-modal-confirm" id="v-modal-confirm" tabindex="-1">' +
        '    <div class="modal-dialog modal-sm" role="document">' +
        '        <div class="modal-content v-confirm-content">' +
        '            <div class="modal-body v-confirm-body">' +
        '                <span class="glyphicon glyphicon-question-sign v-confirm-icon"></span>' +
        '                <span class="v-confirm-msg"></span>' +
        '            </div>' +
        '            <div class="modal-footer v-confirm-footer">' +
        '                <button type="button" class="btn btn-default btn-sm" data-dismiss="modal">取 消</button>' +
        '                <button type="button" class="btn btn-primary btn-sm js-ok" data-dismiss="modal">确 认</button>' +
        '            </div>' +
        '        </div>' +
        '    </div>' +
        '</div>';


    var COMFIRM_KEY = '#v-modal-confirm';
    var NS = '.v-modal-confirm';

    $.modalConfirm = function (msg) {
        var deferred = $.Deferred();
        var $m = $(COMFIRM_KEY);
        if ($m.length === 0) {
            $(TPL_CONFIRM).appendTo($('body'));
        }
        $m = $(COMFIRM_KEY);
        var data = $m.data('bs.modal');
        if(data != null){
            $m.off(NS);
        }
        // bind events
        var rt = false;
        $m.on('click' + NS, '.js-ok', function (e) {
            rt = true;
        })
        $m.on('hidden.bs.modal' + NS, function (e) {
            if (rt === true) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
        })

        if (msg != null) {
            $m.find('.v-confirm-msg').html(msg);
        }

        $m.modal();

        return deferred.promise();
    }

    // popover Confirm

   // $.popoverConfirm =
})
;
define('keboacy/index',[
    './base/store',
    './base/binders',
    //'./base/validation',
    './base/culture',
    './ui/dataTable',
    './ui/tree',
    './ui/dynamicTab',
    './ui/submenu',
    './ui/notify',
    './ui/confirm'
], function (store) {
    return {
        store: store
    };
});
define('veronicaExt/appExt/uiKit',[
    '../../keboacy/index'
], function (keboacy) {

    return function (app) {

        var $ = app.core.$;

        $.extend(app, keboacy);

        app.uiKit.add('keboacy', {
            init: function (view, $el) {
                view.$el.dynamicTab();
            },
            destroy: function (view) {
                // 销毁该组件下的kendo控件
                if (window.kendo) {
                    _.each(view.$('[data-role]'), function (el) {
                        var inst = kendo.widgetInstance($(el));
                        inst && inst.destroy();
                    });
                }
            },
            getInstance: function (view, $el) {
                return kendo.widgetInstance($el);
            }
        });
    };
});

define('veronicaExt/appExt/viewEngine',[],function () {

    return function (app) {

        app.viewEngine.add('kendo', {
            bind: function (view, $dom, model) {
                kendo.unbind($dom);
                kendo.bind($dom, model);
            },
            unbind: function (view) {
                kendo.unbind(view.$el);
            },
            create: function (data) {
                return kendo.observable(data);
            },
            get: function (model, prop) {
                return model.get(prop);
            },
            set: function (model, prop, value) {
                return model.set(prop, value);
            }
        });
    };
});

define('veronicaExt/appExt/windowProvider',[], function () {

    return function (app) {
        var extend = app.core.$.extend;

        app.windowProvider.add('bs-modal', {
            create: function ($el, options, view) {

                var wnd = {
                    element: $el,
                    config: options,
                    flyNode: false,
                    close: function () {
                        this.element.modal('hide');
                    },
                    destroy: function () {
                        if(this.flyNode === true){
                            this.element.remove();
                        }
                    },
                    center: function () {
                    },
                    /**
                     * 打开对话框
                     */
                    open: function () {
                        this.element.modal('show');
                    },
                    rendered: function (view) {

                    },
                    setOptions: function (opt) {
                    },
                    removeLoading: function () {
                    }
                };
                if (!$.contains('body', $el)) {
                    wnd.flyNode = true;
                    $el.appendTo('body');
                }

                // init
                $el.modal();

                if (options.destroyOnClose) {
                    $el.on('hidden.bs.modal', function () {
                        view._destroyWindow(options.name);
                    });
                }

                wnd.core = $el.data('bs.modal');

                return wnd;
            },
            options: function (options) {
                return _.extend({}, options, {
                    template: '<div class="modal fade">' +
                    '<div class="modal-dialog">' +
                    '<div class="modal-content fn-wnd">' +
                    '</div>' +
                    '</div>' +
                    '</div>'
                });
            }

        });

    };
});

define('veronicaExt/appExt/_combine',[
    './formValidation',
    './templateEngine',
    './uiKit',
    './viewEngine',
    './windowProvider'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        app.use(args);
    }
});
define('veronicaExt/viewExt/ajax',[
], function () {

    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;
        var originalUrl = base.url;

        // helper
        function getProp(obj, desc) {
            var arr = desc.split(".");
            while (arr.length && (obj = obj[arr.shift()]));
            return obj;
        }

        var ext = {
            options: {
                autoLoadData: true, 
                dataLoadMap: null
            },
            methods: {
                url: function (url) {
                    this._call(originalUrl, arguments);
                    var result = originalUrl.call(this, url);
                    if (result.indexOf('g:') > -1) {
                        var prop = result.replace('g:', '').replace('[this]', this.options._source);
                        result = getProp(app.urlProvider, prop);
                    }
                    return result;
                },
                loadData: function (configs) {
                    var me = this;
                    if (configs == null) {
                        configs = this._invoke(this.options.dataLoadMap);
                    }
                    if(configs == null) return;
                    if (!_.isArray(configs)) {
                        configs = [configs];
                    }
                    var promises = _.map(configs, function (config) {
                        return app.request.getJSONCross(me.url(config.url), config.params);
                    });

                    var len = promises.length;
                    app.request.getBundle.apply(me, promises).done(function () {
                        var args = Array.prototype.slice.call(arguments, 0, len);
                        _.each(args, function (resp, i) {
                            var config = configs[i];
                            if (config.map) {
                                var map = config.map;
                                if (!_.isArray(map)) {
                                    map = [map];
                                }
                                _.each(map, function (m, i) {
                                    var val = app.core.util.getter(resp, m.from);
                                    if (m.parse) {
                                        var parse = _.bind(m.parse, me);
                                        val = parse(val);
                                    }
                                    me.model().set(m.to, val);
                                });

                            }

                        });
                    });
                },
                _ajaxifyLink: function () {
                    var context = this;
                    var $el = context.$el;
                    $el.find('[data-ajaxify]').on('click', function (e) {
                        var $this = $(this);
                        if ($this.data('noajaxify')) {
                            return;
                        } else {
                            e.preventDefault();
                            var url = $this.attr('href');
                            var method = $this.data('ajaxify');
                            method = method || '_linkHandler';
                            context[method](url);
                        }
                    });
                }
            }
        }

        base._extendMethod('_listen', function () {
            if (this.options.autoLoadData) {
                this.listenTo(this, 'rendered', function () {
                    this.loadData();
                });
            }
        });

        base._extend(ext);
    };
});

define('veronicaExt/viewExt/form',[
], function () {

    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        var ext = {
            options: {
                validateEngine: '',
                enableValidation: true
            },
            methods: {
                _validateEngine: function () {
                    return app.formValidation.get(this.options.validateEngine);
                },
                validate: function () {
                    var me = this;
                    var result = true;
                    var deferred = $.Deferred();
                    this.$('[data-validate-form]').each(function (i, el) {
                        result = me._validateEngine().validate($(el), me);
                    });
                    if (result) {
                        deferred.resolve();
                    } else {
                        deferred.reject();
                    }
                    return deferred.promise();
                },
                save: function (data) {
                    if (data == null) {
                        data = this.model('data');
                    }
                    if (data && data.toJSON) {
                        data = data.toJSON();
                    }
                    this.trigger('saved', data);
                }
            }
        }

        base._extend(ext);

        base._extendMethod('_rendered', function () {
            var me = this;
            if (this.options.enableValidation) {
                this.$('[data-validate-form]').each(function (i, form) {
                    me._validateEngine().init($(form), me);
                });
            }
        });

    };
});

define('veronicaExt/viewExt/modelDefine',[
], function () {


    return function(base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        // model define

        var options = {
            modelContext: null,
            modelName: null
        }

        var methods = {
            _modelProvider: function () {
                return app.modelProvider;
            },
            getContextModelDefine: function () {
                return this._modelProvider()[this.options.modelContext || this.options._source];
            },
            getModelDefine: function () {
                var contextModel = this.getContextModelDefine();
                return contextModel && contextModel[this.options.modelName];
            }
        }

        base._extend({
            options: options,
            methods: methods
        });
    };
});

define('veronicaExt/viewExt/resize',[
], function () {
    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        var ext = {
            options: {
                autoResize: false
            },
            methods: {
                /**
                 * **`重写`** 重写该方法，使视图自适应布局，当开启 `autoResize` 后，窗口大小变化时，该方法会被调用，
                 * 如果有必要，在该方法中应编写窗口大小变化时，该视图对应的处理逻辑
                 * @type {function}
                 */
                resize: function () {

                }
            }
        }

        base._extendMethod('_setup', function () {
            if (this.options.autoResize) {
                $(window).on('resize', this.resize);
            }
        });

        base._extendMethod('_rendered', function () {
            if (this.options.autoResize) {
                _.defer(this.resize);
            }
        });

        base._extendMethod('_destroy', function () {
            // 清理在全局注册的事件处理器
            this.options.autoResize && $(window).off('resize', this.resize);
        });

        base._extend(ext);
    }
});

define('veronicaExt/viewExt/trigger',[
], function () {
    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        base._extendMethod('_rendered', function () {
            this.options.autoST && this.setTriggers();
        });

        base._extend({
            options: {
                autoST: false,
                toolbar: 'toolbar',
                defaultToolbarTpl: '.tpl-toolbar'
            },
            methods: {
                /**
                 * 设置触发器
                 * @param {string} [toolbarTpl=options.defaultToolbarTpl] - 工具条选择器
                 * @returns void
                 * @fires View#setTriggers
                 */
                setTriggers: function (toolbarTpl) {
                    toolbarTpl || (toolbarTpl = this.options.defaultToolbarTpl);

                    /**
                     * **消息：** 设置触发器
                     * @event View#setTriggers
                     * @param {string} html - 工具条模板
                     * @param {string} name - 目标名称
                     * @param {View} view - 当前视图
                     */
                    this.pub('setTriggers', this.$(toolbarTpl).html(),
                        this.options.toolbar || this._name, this);
                }
            }
        });
    }
});

define('veronicaExt/viewExt/ui',[
], function () {
    return function (base, app) {
        var _ = app.core._;
        var $ = app.core.$;

        base._extend({
            options: {
                uiKit: ''
            },
            methods: {
                _uiKit: function () {
                    return app.uiKit.get(this.options.uiKit);
                },
                /**
                 * 根据元素获取该元素上创建的界面控件的实例
                 * @type {function}
                 * @returns {object}
                 * @example
                 *   instance: function (el) {
                 *       return this.$(el).data('instance');
                 *   }
                 */
                instance: function (el) {
                    return this._uiKit().getInstance(this, this.$(el));
                }
            }
        });

        base._extendMethod('_rendered', function () {
            this._uiKit().init(this, this.$el);
        });

        base._extendMethod('_destroy', function () {
            this._uiKit().destroy(this);
        });
    }
});

define('veronicaExt/viewExt/_combine',[
    './ajax',
    './form',
    './modelDefine',
    './resize',
    './trigger',
    './ui'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        var _ = app.core._;
        _.each(args, function (arg) {
            arg(app.view.base, app);
        });
    }
});
define('veronica-ui',[
    './veronicaExt/appExt/_combine',
    './veronicaExt/viewExt/_combine'
], function () {
    var args = Array.prototype.slice.call(arguments);
    return function (app) {
        app.use(args);
    }
});
    //Register in the values from the outer closure for common dependencies
    //as local almond modules
    define('jquery', function () {
        return $;
    });

    //Use almond's special top-level, synchronous require to trigger factory
    //functions, get the final module value, and export it as the public
    //value.
    return require('veronica-ui');
}));
