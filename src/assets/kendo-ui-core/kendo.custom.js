(function(f, define){
    define([], f);
})(function(){



/*jshint eqnull: true, loopfunc: true, evil: true, boss: true, freeze: false*/
(function($, window, undefined) {
    var kendo = window.kendo = window.kendo || { cultures: {} },
        extend = $.extend,
        each = $.each,
        isArray = $.isArray,
        proxy = $.proxy,
        noop = $.noop,
        math = Math,
        Template,
        JSON = window.JSON || {},
        support = {},
        percentRegExp = /%/,
        formatRegExp = /\{(\d+)(:[^\}]+)?\}/g,
        boxShadowRegExp = /(\d+(?:\.?)\d*)px\s*(\d+(?:\.?)\d*)px\s*(\d+(?:\.?)\d*)px\s*(\d+)?/i,
        numberRegExp = /^(\+|-?)\d+(\.?)\d*$/,
        FUNCTION = "function",
        STRING = "string",
        NUMBER = "number",
        OBJECT = "object",
        NULL = "null",
        BOOLEAN = "boolean",
        UNDEFINED = "undefined",
        getterCache = {},
        setterCache = {},
        slice = [].slice,
        globalize = window.Globalize;

    kendo.version = "$KENDO_VERSION";

    function Class() {}

    Class.extend = function(proto) {
        var base = function() {},
            member,
            that = this,
            subclass = proto && proto.init ? proto.init : function () {
                that.apply(this, arguments);
            },
            fn;

        base.prototype = that.prototype;
        fn = subclass.fn = subclass.prototype = new base();

        for (member in proto) {
            if (proto[member] != null && proto[member].constructor === Object) {
                // Merge object members
                fn[member] = extend(true, {}, base.prototype[member], proto[member]);
            } else {
                fn[member] = proto[member];
            }
        }

        fn.constructor = subclass;
        subclass.extend = that.extend;

        return subclass;
    };

    Class.prototype._initOptions = function(options) {
        this.options = deepExtend({}, this.options, options);
    };

    var isFunction = kendo.isFunction = function(fn) {
        return typeof fn === "function";
    };

    var preventDefault = function() {
        this._defaultPrevented = true;
    };

    var isDefaultPrevented = function() {
        return this._defaultPrevented === true;
    };

    var Observable = Class.extend({
        init: function() {
            this._events = {};
        },

        bind: function(eventName, handlers, one) {
            var that = this,
                idx,
                eventNames = typeof eventName === STRING ? [eventName] : eventName,
                length,
                original,
                handler,
                handlersIsFunction = typeof handlers === FUNCTION,
                events;

            if (handlers === undefined) {
                for (idx in eventName) {
                    that.bind(idx, eventName[idx]);
                }
                return that;
            }

            for (idx = 0, length = eventNames.length; idx < length; idx++) {
                eventName = eventNames[idx];

                handler = handlersIsFunction ? handlers : handlers[eventName];

                if (handler) {
                    if (one) {
                        original = handler;
                        handler = function() {
                            that.unbind(eventName, handler);
                            original.apply(that, arguments);
                        };
                        handler.original = original;
                    }
                    events = that._events[eventName] = that._events[eventName] || [];
                    events.push(handler);
                }
            }

            return that;
        },

        one: function(eventNames, handlers) {
            return this.bind(eventNames, handlers, true);
        },

        first: function(eventName, handlers) {
            var that = this,
                idx,
                eventNames = typeof eventName === STRING ? [eventName] : eventName,
                length,
                handler,
                handlersIsFunction = typeof handlers === FUNCTION,
                events;

            for (idx = 0, length = eventNames.length; idx < length; idx++) {
                eventName = eventNames[idx];

                handler = handlersIsFunction ? handlers : handlers[eventName];

                if (handler) {
                    events = that._events[eventName] = that._events[eventName] || [];
                    events.unshift(handler);
                }
            }

            return that;
        },

        trigger: function(eventName, e) {
            var that = this,
                events = that._events[eventName],
                idx,
                length;

            if (events) {
                e = e || {};

                e.sender = that;

                e._defaultPrevented = false;

                e.preventDefault = preventDefault;

                e.isDefaultPrevented = isDefaultPrevented;

                events = events.slice();

                for (idx = 0, length = events.length; idx < length; idx++) {
                    events[idx].call(that, e);
                }

                return e._defaultPrevented === true;
            }

            return false;
        },

        unbind: function(eventName, handler) {
            var that = this,
                events = that._events[eventName],
                idx;

            if (eventName === undefined) {
                that._events = {};
            } else if (events) {
                if (handler) {
                    for (idx = events.length - 1; idx >= 0; idx--) {
                        if (events[idx] === handler || events[idx].original === handler) {
                            events.splice(idx, 1);
                        }
                    }
                } else {
                    that._events[eventName] = [];
                }
            }

            return that;
        }
    });


     function compilePart(part, stringPart) {
         if (stringPart) {
             return "'" +
                 part.split("'").join("\\'")
                     .split('\\"').join('\\\\\\"')
                     .replace(/\n/g, "\\n")
                     .replace(/\r/g, "\\r")
                     .replace(/\t/g, "\\t") + "'";
         } else {
             var first = part.charAt(0),
                 rest = part.substring(1);

             if (first === "=") {
                 return "+(" + rest + ")+";
             } else if (first === ":") {
                 return "+$kendoHtmlEncode(" + rest + ")+";
             } else {
                 return ";" + part + ";$kendoOutput+=";
             }
         }
     }

    var argumentNameRegExp = /^\w+/,
        encodeRegExp = /\$\{([^}]*)\}/g,
        escapedCurlyRegExp = /\\\}/g,
        curlyRegExp = /__CURLY__/g,
        escapedSharpRegExp = /\\#/g,
        sharpRegExp = /__SHARP__/g,
        zeros = ["", "0", "00", "000", "0000"];

    Template = {
        paramName: "data", // name of the parameter of the generated template
        useWithBlock: true, // whether to wrap the template in a with() block
        render: function(template, data) {
            var idx,
                length,
                html = "";

            for (idx = 0, length = data.length; idx < length; idx++) {
                html += template(data[idx]);
            }

            return html;
        },
        compile: function(template, options) {
            var settings = extend({}, this, options),
                paramName = settings.paramName,
                argumentName = paramName.match(argumentNameRegExp)[0],
                useWithBlock = settings.useWithBlock,
                functionBody = "var $kendoOutput, $kendoHtmlEncode = kendo.htmlEncode;",
                fn,
                parts,
                idx;

            if (isFunction(template)) {
                return template;
            }

            functionBody += useWithBlock ? "with(" + paramName + "){" : "";

            functionBody += "$kendoOutput=";

            parts = template
                .replace(escapedCurlyRegExp, "__CURLY__")
                .replace(encodeRegExp, "#=$kendoHtmlEncode($1)#")
                .replace(curlyRegExp, "}")
                .replace(escapedSharpRegExp, "__SHARP__")
                .split("#");

            for (idx = 0; idx < parts.length; idx ++) {
                functionBody += compilePart(parts[idx], idx % 2 === 0);
            }

            functionBody += useWithBlock ? ";}" : ";";

            functionBody += "return $kendoOutput;";

            functionBody = functionBody.replace(sharpRegExp, "#");

            try {
                fn = new Function(argumentName, functionBody);
                fn._slotCount = Math.floor(parts.length / 2);
                return fn;
            } catch(e) {
                throw new Error(kendo.format("Invalid template:'{0}' Generated code:'{1}'", template, functionBody));
            }
        }
    };

function pad(number, digits, end) {
    number = number + "";
    digits = digits || 2;
    end = digits - number.length;

    if (end) {
        return zeros[digits].substring(0, end) + number;
    }

    return number;
}

    //JSON stringify
(function() {
    var escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
        gap,
        indent,
        meta = {
            "\b": "\\b",
            "\t": "\\t",
            "\n": "\\n",
            "\f": "\\f",
            "\r": "\\r",
            "\"" : '\\"',
            "\\": "\\\\"
        },
        rep,
        toString = {}.toString;


    if (typeof Date.prototype.toJSON !== FUNCTION) {

        Date.prototype.toJSON = function () {
            var that = this;

            return isFinite(that.valueOf()) ?
                pad(that.getUTCFullYear(), 4) + "-" +
                pad(that.getUTCMonth() + 1)   + "-" +
                pad(that.getUTCDate())        + "T" +
                pad(that.getUTCHours())       + ":" +
                pad(that.getUTCMinutes())     + ":" +
                pad(that.getUTCSeconds())     + "Z" : null;
        };

        String.prototype.toJSON = Number.prototype.toJSON = Boolean.prototype.toJSON = function () {
            return this.valueOf();
        };
    }

    function quote(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? "\"" + string.replace(escapable, function (a) {
            var c = meta[a];
            return typeof c === STRING ? c :
                "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
        }) + "\"" : "\"" + string + "\"";
    }

    function str(key, holder) {
        var i,
            k,
            v,
            length,
            mind = gap,
            partial,
            value = holder[key],
            type;

        if (value && typeof value === OBJECT && typeof value.toJSON === FUNCTION) {
            value = value.toJSON(key);
        }

        if (typeof rep === FUNCTION) {
            value = rep.call(holder, key, value);
        }

        type = typeof value;
        if (type === STRING) {
            return quote(value);
        } else if (type === NUMBER) {
            return isFinite(value) ? String(value) : NULL;
        } else if (type === BOOLEAN || type === NULL) {
            return String(value);
        } else if (type === OBJECT) {
            if (!value) {
                return NULL;
            }
            gap += indent;
            partial = [];
            if (toString.apply(value) === "[object Array]") {
                length = value.length;
                for (i = 0; i < length; i++) {
                    partial[i] = str(i, value) || NULL;
                }
                v = partial.length === 0 ? "[]" : gap ?
                    "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]" :
                    "[" + partial.join(",") + "]";
                gap = mind;
                return v;
            }
            if (rep && typeof rep === OBJECT) {
                length = rep.length;
                for (i = 0; i < length; i++) {
                    if (typeof rep[i] === STRING) {
                        k = rep[i];
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ": " : ":") + v);
                        }
                    }
                }
            } else {
                for (k in value) {
                    if (Object.hasOwnProperty.call(value, k)) {
                        v = str(k, value);
                        if (v) {
                            partial.push(quote(k) + (gap ? ": " : ":") + v);
                        }
                    }
                }
            }

            v = partial.length === 0 ? "{}" : gap ?
                "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}" :
                "{" + partial.join(",") + "}";
            gap = mind;
            return v;
        }
    }

    if (typeof JSON.stringify !== FUNCTION) {
        JSON.stringify = function (value, replacer, space) {
            var i;
            gap = "";
            indent = "";

            if (typeof space === NUMBER) {
                for (i = 0; i < space; i += 1) {
                    indent += " ";
                }

            } else if (typeof space === STRING) {
                indent = space;
            }

            rep = replacer;
            if (replacer && typeof replacer !== FUNCTION && (typeof replacer !== OBJECT || typeof replacer.length !== NUMBER)) {
                throw new Error("JSON.stringify");
            }

            return str("", {"": value});
        };
    }
})();

// Date and Number formatting
(function() {
    var dateFormatRegExp = /dddd|ddd|dd|d|MMMM|MMM|MM|M|yyyy|yy|HH|H|hh|h|mm|m|fff|ff|f|tt|ss|s|zzz|zz|z|"[^"]*"|'[^']*'/g,
        standardFormatRegExp =  /^(n|c|p|e)(\d*)$/i,
        literalRegExp = /(\\.)|(['][^']*[']?)|(["][^"]*["]?)/g,
        commaRegExp = /\,/g,
        EMPTY = "",
        POINT = ".",
        COMMA = ",",
        SHARP = "#",
        ZERO = "0",
        PLACEHOLDER = "??",
        EN = "en-US",
        objectToString = {}.toString;

    //cultures
    kendo.cultures["en-US"] = {
        name: EN,
        numberFormat: {
            pattern: ["-n"],
            decimals: 2,
            ",": ",",
            ".": ".",
            groupSize: [3],
            percent: {
                pattern: ["-n %", "n %"],
                decimals: 2,
                ",": ",",
                ".": ".",
                groupSize: [3],
                symbol: "%"
            },
            currency: {
                pattern: ["($n)", "$n"],
                decimals: 2,
                ",": ",",
                ".": ".",
                groupSize: [3],
                symbol: "$"
            }
        },
        calendars: {
            standard: {
                days: {
                    names: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                    namesAbbr: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                    namesShort: [ "Su", "Mo", "Tu", "We", "Th", "Fr", "Sa" ]
                },
                months: {
                    names: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
                    namesAbbr: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
                },
                AM: [ "AM", "am", "AM" ],
                PM: [ "PM", "pm", "PM" ],
                patterns: {
                    d: "M/d/yyyy",
                    D: "dddd, MMMM dd, yyyy",
                    F: "dddd, MMMM dd, yyyy h:mm:ss tt",
                    g: "M/d/yyyy h:mm tt",
                    G: "M/d/yyyy h:mm:ss tt",
                    m: "MMMM dd",
                    M: "MMMM dd",
                    s: "yyyy'-'MM'-'ddTHH':'mm':'ss",
                    t: "h:mm tt",
                    T: "h:mm:ss tt",
                    u: "yyyy'-'MM'-'dd HH':'mm':'ss'Z'",
                    y: "MMMM, yyyy",
                    Y: "MMMM, yyyy"
                },
                "/": "/",
                ":": ":",
                firstDay: 0,
                twoDigitYearMax: 2029
            }
        }
    };


     function findCulture(culture) {
        if (culture) {
            if (culture.numberFormat) {
                return culture;
            }

            if (typeof culture === STRING) {
                var cultures = kendo.cultures;
                return cultures[culture] || cultures[culture.split("-")[0]] || null;
            }

            return null;
        }

        return null;
    }

    function getCulture(culture) {
        if (culture) {
            culture = findCulture(culture);
        }

        return culture || kendo.cultures.current;
    }

    function expandNumberFormat(numberFormat) {
        numberFormat.groupSizes = numberFormat.groupSize;
        numberFormat.percent.groupSizes = numberFormat.percent.groupSize;
        numberFormat.currency.groupSizes = numberFormat.currency.groupSize;
    }

    kendo.culture = function(cultureName) {
        var cultures = kendo.cultures, culture;

        if (cultureName !== undefined) {
            culture = findCulture(cultureName) || cultures[EN];
            culture.calendar = culture.calendars.standard;
            cultures.current = culture;

            if (globalize && !globalize.load) {
                expandNumberFormat(culture.numberFormat);
            }

        } else {
            return cultures.current;
        }
    };

    kendo.findCulture = findCulture;
    kendo.getCulture = getCulture;

    //set current culture to en-US.
    kendo.culture(EN);

    function formatDate(date, format, culture) {
        culture = getCulture(culture);

        var calendar = culture.calendars.standard,
            days = calendar.days,
            months = calendar.months;

        format = calendar.patterns[format] || format;

        return format.replace(dateFormatRegExp, function (match) {
            var minutes;
            var result;
            var sign;

            if (match === "d") {
                result = date.getDate();
            } else if (match === "dd") {
                result = pad(date.getDate());
            } else if (match === "ddd") {
                result = days.namesAbbr[date.getDay()];
            } else if (match === "dddd") {
                result = days.names[date.getDay()];
            } else if (match === "M") {
                result = date.getMonth() + 1;
            } else if (match === "MM") {
                result = pad(date.getMonth() + 1);
            } else if (match === "MMM") {
                result = months.namesAbbr[date.getMonth()];
            } else if (match === "MMMM") {
                result = months.names[date.getMonth()];
            } else if (match === "yy") {
                result = pad(date.getFullYear() % 100);
            } else if (match === "yyyy") {
                result = pad(date.getFullYear(), 4);
            } else if (match === "h" ) {
                result = date.getHours() % 12 || 12;
            } else if (match === "hh") {
                result = pad(date.getHours() % 12 || 12);
            } else if (match === "H") {
                result = date.getHours();
            } else if (match === "HH") {
                result = pad(date.getHours());
            } else if (match === "m") {
                result = date.getMinutes();
            } else if (match === "mm") {
                result = pad(date.getMinutes());
            } else if (match === "s") {
                result = date.getSeconds();
            } else if (match === "ss") {
                result = pad(date.getSeconds());
            } else if (match === "f") {
                result = math.floor(date.getMilliseconds() / 100);
            } else if (match === "ff") {
                result = date.getMilliseconds();
                if (result > 99) {
                    result = math.floor(result / 10);
                }
                result = pad(result);
            } else if (match === "fff") {
                result = pad(date.getMilliseconds(), 3);
            } else if (match === "tt") {
                result = date.getHours() < 12 ? calendar.AM[0] : calendar.PM[0];
            } else if (match === "zzz") {
                minutes = date.getTimezoneOffset();
                sign = minutes < 0;

                result = math.abs(minutes / 60).toString().split(".")[0];
                minutes = math.abs(minutes) - (result * 60);

                result = (sign ? "+" : "-") + pad(result);
                result += ":" + pad(minutes);
            } else if (match === "zz" || match === "z") {
                result = date.getTimezoneOffset() / 60;
                sign = result < 0;

                result = math.abs(result).toString().split(".")[0];
                result = (sign ? "+" : "-") + (match === "zz" ? pad(result) : result);
            }

            return result !== undefined ? result : match.slice(1, match.length - 1);
        });
    }

    //number formatting
    function formatNumber(number, format, culture) {
        culture = getCulture(culture);

        var numberFormat = culture.numberFormat,
            groupSize = numberFormat.groupSize[0],
            groupSeparator = numberFormat[COMMA],
            decimal = numberFormat[POINT],
            precision = numberFormat.decimals,
            pattern = numberFormat.pattern[0],
            literals = [],
            symbol,
            isCurrency, isPercent,
            customPrecision,
            formatAndPrecision,
            negative = number < 0,
            integer,
            fraction,
            integerLength,
            fractionLength,
            replacement = EMPTY,
            value = EMPTY,
            idx,
            length,
            ch,
            hasGroup,
            hasNegativeFormat,
            decimalIndex,
            sharpIndex,
            zeroIndex,
            hasZero, hasSharp,
            percentIndex,
            currencyIndex,
            startZeroIndex,
            start = -1,
            end;

        //return empty string if no number
        if (number === undefined) {
            return EMPTY;
        }

        if (!isFinite(number)) {
            return number;
        }

        //if no format then return number.toString() or number.toLocaleString() if culture.name is not defined
        if (!format) {
            return culture.name.length ? number.toLocaleString() : number.toString();
        }

        formatAndPrecision = standardFormatRegExp.exec(format);

        // standard formatting
        if (formatAndPrecision) {
            format = formatAndPrecision[1].toLowerCase();

            isCurrency = format === "c";
            isPercent = format === "p";

            if (isCurrency || isPercent) {
                //get specific number format information if format is currency or percent
                numberFormat = isCurrency ? numberFormat.currency : numberFormat.percent;
                groupSize = numberFormat.groupSize[0];
                groupSeparator = numberFormat[COMMA];
                decimal = numberFormat[POINT];
                precision = numberFormat.decimals;
                symbol = numberFormat.symbol;
                pattern = numberFormat.pattern[negative ? 0 : 1];
            }

            customPrecision = formatAndPrecision[2];

            if (customPrecision) {
                precision = +customPrecision;
            }

            //return number in exponential format
            if (format === "e") {
                return customPrecision ? number.toExponential(precision) : number.toExponential(); // toExponential() and toExponential(undefined) differ in FF #653438.
            }

            // multiply if format is percent
            if (isPercent) {
                number *= 100;
            }

            number = round(number, precision);
            negative = number < 0;
            number = number.split(POINT);

            integer = number[0];
            fraction = number[1];

            //exclude "-" if number is negative.
            if (negative) {
                integer = integer.substring(1);
            }

            value = integer;
            integerLength = integer.length;

            //add group separator to the number if it is longer enough
            if (integerLength >= groupSize) {
                value = EMPTY;
                for (idx = 0; idx < integerLength; idx++) {
                    if (idx > 0 && (integerLength - idx) % groupSize === 0) {
                        value += groupSeparator;
                    }
                    value += integer.charAt(idx);
                }
            }

            if (fraction) {
                value += decimal + fraction;
            }

            if (format === "n" && !negative) {
                return value;
            }

            number = EMPTY;

            for (idx = 0, length = pattern.length; idx < length; idx++) {
                ch = pattern.charAt(idx);

                if (ch === "n") {
                    number += value;
                } else if (ch === "$" || ch === "%") {
                    number += symbol;
                } else {
                    number += ch;
                }
            }

            return number;
        }

        //custom formatting
        //
        //separate format by sections.

        //make number positive
        if (negative) {
            number = -number;
        }

        if (format.indexOf("'") > -1 || format.indexOf("\"") > -1 || format.indexOf("\\") > -1) {
            format = format.replace(literalRegExp, function (match) {
                var quoteChar = match.charAt(0).replace("\\", ""),
                    literal = match.slice(1).replace(quoteChar, "");

                literals.push(literal);

                return PLACEHOLDER;
            });
        }

        format = format.split(";");
        if (negative && format[1]) {
            //get negative format
            format = format[1];
            hasNegativeFormat = true;
        } else if (number === 0) {
            //format for zeros
            format = format[2] || format[0];
            if (format.indexOf(SHARP) == -1 && format.indexOf(ZERO) == -1) {
                //return format if it is string constant.
                return format;
            }
        } else {
            format = format[0];
        }

        percentIndex = format.indexOf("%");
        currencyIndex = format.indexOf("$");

        isPercent = percentIndex != -1;
        isCurrency = currencyIndex != -1;

        //multiply number if the format has percent
        if (isPercent) {
            number *= 100;
        }

        if (isCurrency && format[currencyIndex - 1] === "\\") {
            format = format.split("\\").join("");
            isCurrency = false;
        }

        if (isCurrency || isPercent) {
            //get specific number format information if format is currency or percent
            numberFormat = isCurrency ? numberFormat.currency : numberFormat.percent;
            groupSize = numberFormat.groupSize[0];
            groupSeparator = numberFormat[COMMA];
            decimal = numberFormat[POINT];
            precision = numberFormat.decimals;
            symbol = numberFormat.symbol;
        }

        hasGroup = format.indexOf(COMMA) > -1;
        if (hasGroup) {
            format = format.replace(commaRegExp, EMPTY);
        }

        decimalIndex = format.indexOf(POINT);
        length = format.length;

        if (decimalIndex != -1) {
            fraction = number.toString().split("e");
            if (fraction[1]) {
                fraction = round(number, Math.abs(fraction[1]));
            } else {
                fraction = fraction[0];
            }
            fraction = fraction.split(POINT)[1] || EMPTY;
            zeroIndex = format.lastIndexOf(ZERO) - decimalIndex;
            sharpIndex = format.lastIndexOf(SHARP) - decimalIndex;
            hasZero = zeroIndex > -1;
            hasSharp = sharpIndex > -1;
            idx = fraction.length;

            if (!hasZero && !hasSharp) {
                format = format.substring(0, decimalIndex) + format.substring(decimalIndex + 1);
                length = format.length;
                decimalIndex = -1;
                idx = 0;
            } if (hasZero && zeroIndex > sharpIndex) {
                idx = zeroIndex;
            } else if (sharpIndex > zeroIndex) {
                if (hasSharp && idx > sharpIndex) {
                    idx = sharpIndex;
                } else if (hasZero && idx < zeroIndex) {
                    idx = zeroIndex;
                }
            }

            if (idx > -1) {
                number = round(number, idx);
            }
        } else {
            number = round(number);
        }

        sharpIndex = format.indexOf(SHARP);
        startZeroIndex = zeroIndex = format.indexOf(ZERO);

        //define the index of the first digit placeholder
        if (sharpIndex == -1 && zeroIndex != -1) {
            start = zeroIndex;
        } else if (sharpIndex != -1 && zeroIndex == -1) {
            start = sharpIndex;
        } else {
            start = sharpIndex > zeroIndex ? zeroIndex : sharpIndex;
        }

        sharpIndex = format.lastIndexOf(SHARP);
        zeroIndex = format.lastIndexOf(ZERO);

        //define the index of the last digit placeholder
        if (sharpIndex == -1 && zeroIndex != -1) {
            end = zeroIndex;
        } else if (sharpIndex != -1 && zeroIndex == -1) {
            end = sharpIndex;
        } else {
            end = sharpIndex > zeroIndex ? sharpIndex : zeroIndex;
        }

        if (start == length) {
            end = start;
        }

        if (start != -1) {
            value = number.toString().split(POINT);
            integer = value[0];
            fraction = value[1] || EMPTY;

            integerLength = integer.length;
            fractionLength = fraction.length;

            if (negative && (number * -1) >= 0) {
                negative = false;
            }

            //add group separator to the number if it is longer enough
            if (hasGroup) {
                if (integerLength === groupSize && integerLength < decimalIndex - startZeroIndex) {
                    integer = groupSeparator + integer;
                } else if (integerLength > groupSize) {
                    value = EMPTY;
                    for (idx = 0; idx < integerLength; idx++) {
                        if (idx > 0 && (integerLength - idx) % groupSize === 0) {
                            value += groupSeparator;
                        }
                        value += integer.charAt(idx);
                    }

                    integer = value;
                }
            }

            number = format.substring(0, start);

            if (negative && !hasNegativeFormat) {
                number += "-";
            }

            for (idx = start; idx < length; idx++) {
                ch = format.charAt(idx);

                if (decimalIndex == -1) {
                    if (end - idx < integerLength) {
                        number += integer;
                        break;
                    }
                } else {
                    if (zeroIndex != -1 && zeroIndex < idx) {
                        replacement = EMPTY;
                    }

                    if ((decimalIndex - idx) <= integerLength && decimalIndex - idx > -1) {
                        number += integer;
                        idx = decimalIndex;
                    }

                    if (decimalIndex === idx) {
                        number += (fraction ? decimal : EMPTY) + fraction;
                        idx += end - decimalIndex + 1;
                        continue;
                    }
                }

                if (ch === ZERO) {
                    number += ch;
                    replacement = ch;
                } else if (ch === SHARP) {
                    number += replacement;
                }
            }

            if (end >= start) {
                number += format.substring(end + 1);
            }

            //replace symbol placeholders
            if (isCurrency || isPercent) {
                value = EMPTY;
                for (idx = 0, length = number.length; idx < length; idx++) {
                    ch = number.charAt(idx);
                    value += (ch === "$" || ch === "%") ? symbol : ch;
                }
                number = value;
            }

            length = literals.length;

            if (length) {
                for (idx = 0; idx < length; idx++) {
                    number = number.replace(PLACEHOLDER, literals[idx]);
                }
            }
        }

        return number;
    }

    var round = function(value, precision) {
        precision = precision || 0;

        value = value.toString().split('e');
        value = Math.round(+(value[0] + 'e' + (value[1] ? (+value[1] + precision) : precision)));

        value = value.toString().split('e');
        value = +(value[0] + 'e' + (value[1] ? (+value[1] - precision) : -precision));

        return value.toFixed(precision);
    };

    var toString = function(value, fmt, culture) {
        if (fmt) {
            if (objectToString.call(value) === "[object Date]") {
                return formatDate(value, fmt, culture);
            } else if (typeof value === NUMBER) {
                return formatNumber(value, fmt, culture);
            }
        }

        return value !== undefined ? value : "";
    };

    if (globalize && !globalize.load) {
        toString = function(value, format, culture) {
            if ($.isPlainObject(culture)) {
                culture = culture.name;
            }

            return globalize.format(value, format, culture);
        };
    }

    kendo.format = function(fmt) {
        var values = arguments;

        return fmt.replace(formatRegExp, function(match, index, placeholderFormat) {
            var value = values[parseInt(index, 10) + 1];

            return toString(value, placeholderFormat ? placeholderFormat.substring(1) : "");
        });
    };

    kendo._extractFormat = function (format) {
        if (format.slice(0,3) === "{0:") {
            format = format.slice(3, format.length - 1);
        }

        return format;
    };

    kendo._activeElement = function() {
        try {
            return document.activeElement;
        } catch(e) {
            return document.documentElement.activeElement;
        }
    };

    kendo._round = round;
    kendo.toString = toString;
})();


(function() {
    var nonBreakingSpaceRegExp = /\u00A0/g,
        exponentRegExp = /[eE][\-+]?[0-9]+/,
        shortTimeZoneRegExp = /[+|\-]\d{1,2}/,
        longTimeZoneRegExp = /[+|\-]\d{1,2}:?\d{2}/,
        dateRegExp = /^\/Date\((.*?)\)\/$/,
        offsetRegExp = /[+-]\d*/,
        formatsSequence = ["G", "g", "d", "F", "D", "y", "m", "T", "t"],
        numberRegExp = {
            2: /^\d{1,2}/,
            3: /^\d{1,3}/,
            4: /^\d{4}/
        },
        objectToString = {}.toString;

    function outOfRange(value, start, end) {
        return !(value >= start && value <= end);
    }

    function designatorPredicate(designator) {
        return designator.charAt(0);
    }

    function mapDesignators(designators) {
        return $.map(designators, designatorPredicate);
    }

    //if date's day is different than the typed one - adjust
    function adjustDST(date, hours) {
        if (!hours && date.getHours() === 23) {
            date.setHours(date.getHours() + 2);
        }
    }

    function lowerArray(data) {
        var idx = 0,
            length = data.length,
            array = [];

        for (; idx < length; idx++) {
            array[idx] = (data[idx] + "").toLowerCase();
        }

        return array;
    }

    function lowerLocalInfo(localInfo) {
        var newLocalInfo = {}, property;

        for (property in localInfo) {
            newLocalInfo[property] = lowerArray(localInfo[property]);
        }

        return newLocalInfo;
    }

    function parseExact(value, format, culture) {
        if (!value) {
            return null;
        }

        var lookAhead = function (match) {
                var i = 0;
                while (format[idx] === match) {
                    i++;
                    idx++;
                }
                if (i > 0) {
                    idx -= 1;
                }
                return i;
            },
            getNumber = function(size) {
                var rg = numberRegExp[size] || new RegExp('^\\d{1,' + size + '}'),
                    match = value.substr(valueIdx, size).match(rg);

                if (match) {
                    match = match[0];
                    valueIdx += match.length;
                    return parseInt(match, 10);
                }
                return null;
            },
            getIndexByName = function (names, lower) {
                var i = 0,
                    length = names.length,
                    name, nameLength,
                    matchLength = 0,
                    matchIdx = 0,
                    subValue;

                for (; i < length; i++) {
                    name = names[i];
                    nameLength = name.length;
                    subValue = value.substr(valueIdx, nameLength);

                    if (lower) {
                        subValue = subValue.toLowerCase();
                    }

                    if (subValue == name && nameLength > matchLength) {
                        matchLength = nameLength;
                        matchIdx = i;
                    }
                }

                if (matchLength) {
                    valueIdx += matchLength;
                    return matchIdx + 1;
                }

                return null;
            },
            checkLiteral = function() {
                var result = false;
                if (value.charAt(valueIdx) === format[idx]) {
                    valueIdx++;
                    result = true;
                }
                return result;
            },
            calendar = culture.calendars.standard,
            year = null,
            month = null,
            day = null,
            hours = null,
            minutes = null,
            seconds = null,
            milliseconds = null,
            idx = 0,
            valueIdx = 0,
            literal = false,
            date = new Date(),
            twoDigitYearMax = calendar.twoDigitYearMax || 2029,
            defaultYear = date.getFullYear(),
            ch, count, length, pattern,
            pmHour, UTC, matches,
            amDesignators, pmDesignators,
            hoursOffset, minutesOffset,
            hasTime, match;

        if (!format) {
            format = "d"; //shord date format
        }

        //if format is part of the patterns get real format
        pattern = calendar.patterns[format];
        if (pattern) {
            format = pattern;
        }

        format = format.split("");
        length = format.length;

        for (; idx < length; idx++) {
            ch = format[idx];

            if (literal) {
                if (ch === "'") {
                    literal = false;
                } else {
                    checkLiteral();
                }
            } else {
                if (ch === "d") {
                    count = lookAhead("d");
                    if (!calendar._lowerDays) {
                        calendar._lowerDays = lowerLocalInfo(calendar.days);
                    }

                    if (day !== null && count > 2) {
                        continue;
                    }

                    day = count < 3 ? getNumber(2) : getIndexByName(calendar._lowerDays[count == 3 ? "namesAbbr" : "names"], true);

                    if (day === null || outOfRange(day, 1, 31)) {
                        return null;
                    }
                } else if (ch === "M") {
                    count = lookAhead("M");
                    if (!calendar._lowerMonths) {
                        calendar._lowerMonths = lowerLocalInfo(calendar.months);
                    }
                    month = count < 3 ? getNumber(2) : getIndexByName(calendar._lowerMonths[count == 3 ? 'namesAbbr' : 'names'], true);

                    if (month === null || outOfRange(month, 1, 12)) {
                        return null;
                    }
                    month -= 1; //because month is zero based
                } else if (ch === "y") {
                    count = lookAhead("y");
                    year = getNumber(count);

                    if (year === null) {
                        return null;
                    }

                    if (count == 2) {
                        if (typeof twoDigitYearMax === "string") {
                            twoDigitYearMax = defaultYear + parseInt(twoDigitYearMax, 10);
                        }

                        year = (defaultYear - defaultYear % 100) + year;
                        if (year > twoDigitYearMax) {
                            year -= 100;
                        }
                    }
                } else if (ch === "h" ) {
                    lookAhead("h");
                    hours = getNumber(2);
                    if (hours == 12) {
                        hours = 0;
                    }
                    if (hours === null || outOfRange(hours, 0, 11)) {
                        return null;
                    }
                } else if (ch === "H") {
                    lookAhead("H");
                    hours = getNumber(2);
                    if (hours === null || outOfRange(hours, 0, 23)) {
                        return null;
                    }
                } else if (ch === "m") {
                    lookAhead("m");
                    minutes = getNumber(2);
                    if (minutes === null || outOfRange(minutes, 0, 59)) {
                        return null;
                    }
                } else if (ch === "s") {
                    lookAhead("s");
                    seconds = getNumber(2);
                    if (seconds === null || outOfRange(seconds, 0, 59)) {
                        return null;
                    }
                } else if (ch === "f") {
                    count = lookAhead("f");

                    match = value.substr(valueIdx, count).match(numberRegExp[3]);
                    milliseconds = getNumber(count);

                    if (milliseconds !== null) {
                        match = match[0].length;

                        if (match < 3) {
                            milliseconds *= Math.pow(10, (3 - match));
                        }

                        if (count > 3) {
                            milliseconds = parseInt(milliseconds.toString().substring(0, 3), 10);
                        }
                    }

                    if (milliseconds === null || outOfRange(milliseconds, 0, 999)) {
                        return null;
                    }

                } else if (ch === "t") {
                    count = lookAhead("t");
                    amDesignators = calendar.AM;
                    pmDesignators = calendar.PM;

                    if (count === 1) {
                        amDesignators = mapDesignators(amDesignators);
                        pmDesignators = mapDesignators(pmDesignators);
                    }

                    pmHour = getIndexByName(pmDesignators);
                    if (!pmHour && !getIndexByName(amDesignators)) {
                        return null;
                    }
                }
                else if (ch === "z") {
                    UTC = true;
                    count = lookAhead("z");

                    if (value.substr(valueIdx, 1) === "Z") {
                        checkLiteral();
                        continue;
                    }

                    matches = value.substr(valueIdx, 6)
                                   .match(count > 2 ? longTimeZoneRegExp : shortTimeZoneRegExp);

                    if (!matches) {
                        return null;
                    }

                    matches = matches[0].split(":");

                    hoursOffset = matches[0];
                    minutesOffset = matches[1];

                    if (!minutesOffset && hoursOffset.length > 3) { //(+|-)[hh][mm] format is used
                        valueIdx = hoursOffset.length - 2;
                        minutesOffset = hoursOffset.substring(valueIdx);
                        hoursOffset = hoursOffset.substring(0, valueIdx);
                    }

                    hoursOffset = parseInt(hoursOffset, 10);
                    if (outOfRange(hoursOffset, -12, 13)) {
                        return null;
                    }

                    if (count > 2) {
                        minutesOffset = parseInt(minutesOffset, 10);
                        if (isNaN(minutesOffset) || outOfRange(minutesOffset, 0, 59)) {
                            return null;
                        }
                    }
                } else if (ch === "'") {
                    literal = true;
                    checkLiteral();
                } else if (!checkLiteral()) {
                    return null;
                }
            }
        }

        hasTime = hours !== null || minutes !== null || seconds || null;

        if (year === null && month === null && day === null && hasTime) {
            year = defaultYear;
            month = date.getMonth();
            day = date.getDate();
        } else {
            if (year === null) {
                year = defaultYear;
            }

            if (day === null) {
                day = 1;
            }
        }

        if (pmHour && hours < 12) {
            hours += 12;
        }

        if (UTC) {
            if (hoursOffset) {
                hours += -hoursOffset;
            }

            if (minutesOffset) {
                minutes += -minutesOffset;
            }

            value = new Date(Date.UTC(year, month, day, hours, minutes, seconds, milliseconds));
        } else {
            value = new Date(year, month, day, hours, minutes, seconds, milliseconds);
            adjustDST(value, hours);
        }

        if (year < 100) {
            value.setFullYear(year);
        }

        if (value.getDate() !== day && UTC === undefined) {
            return null;
        }

        return value;
    }

    function parseMicrosoftFormatOffset(offset) {
        var sign = offset.substr(0, 1) === "-" ? -1 : 1;

        offset = offset.substring(1);
        offset = (parseInt(offset.substr(0, 2), 10) * 60) + parseInt(offset.substring(2), 10);

        return sign * offset;
    }

    kendo.parseDate = function(value, formats, culture) {
        if (objectToString.call(value) === "[object Date]") {
            return value;
        }

        var idx = 0;
        var date = null;
        var length, patterns;
        var tzoffset;
        var sign;

        if (value && value.indexOf("/D") === 0) {
            date = dateRegExp.exec(value);
            if (date) {
                date = date[1];
                tzoffset = offsetRegExp.exec(date.substring(1));

                date = new Date(parseInt(date, 10));

                if (tzoffset) {
                    tzoffset = parseMicrosoftFormatOffset(tzoffset[0]);
                    date = kendo.timezone.apply(date, 0);
                    date = kendo.timezone.convert(date, 0, -1 * tzoffset);
                }

                return date;
            }
        }

        culture = kendo.getCulture(culture);

        if (!formats) {
            formats = [];
            patterns = culture.calendar.patterns;
            length = formatsSequence.length;

            for (; idx < length; idx++) {
                formats[idx] = patterns[formatsSequence[idx]];
            }

            idx = 0;

            formats = [
                "yyyy/MM/dd HH:mm:ss",
                "yyyy/MM/dd HH:mm",
                "yyyy/MM/dd",
                "ddd MMM dd yyyy HH:mm:ss",
                "yyyy-MM-ddTHH:mm:ss.fffffffzzz",
                "yyyy-MM-ddTHH:mm:ss.fffzzz",
                "yyyy-MM-ddTHH:mm:sszzz",
                "yyyy-MM-ddTHH:mm:ss.fffffff",
                "yyyy-MM-ddTHH:mm:ss.fff",
                "yyyy-MM-ddTHH:mmzzz",
                "yyyy-MM-ddTHH:mmzz",
                "yyyy-MM-ddTHH:mm:ss",
                "yyyy-MM-ddTHH:mm",
                "yyyy-MM-dd HH:mm:ss",
                "yyyy-MM-dd HH:mm",
                "yyyy-MM-dd",
                "HH:mm:ss",
                "HH:mm"
            ].concat(formats);
        }

        formats = isArray(formats) ? formats: [formats];
        length = formats.length;

        for (; idx < length; idx++) {
            date = parseExact(value, formats[idx], culture);
            if (date) {
                return date;
            }
        }

        return date;
    };

    kendo.parseInt = function(value, culture) {
        var result = kendo.parseFloat(value, culture);
        if (result) {
            result = result | 0;
        }
        return result;
    };

    kendo.parseFloat = function(value, culture, format) {
        if (!value && value !== 0) {
           return null;
        }

        if (typeof value === NUMBER) {
           return value;
        }

        value = value.toString();
        culture = kendo.getCulture(culture);

        var number = culture.numberFormat,
            percent = number.percent,
            currency = number.currency,
            symbol = currency.symbol,
            percentSymbol = percent.symbol,
            negative = value.indexOf("-"),
            parts, isPercent;

        //handle exponential number
        if (exponentRegExp.test(value)) {
            value = parseFloat(value.replace(number["."], "."));
            if (isNaN(value)) {
                value = null;
            }
            return value;
        }

        if (negative > 0) {
            return null;
        } else {
            negative = negative > -1;
        }

        if (value.indexOf(symbol) > -1 || (format && format.toLowerCase().indexOf("c") > -1)) {
            number = currency;
            parts = number.pattern[0].replace("$", symbol).split("n");
            if (value.indexOf(parts[0]) > -1 && value.indexOf(parts[1]) > -1) {
                value = value.replace(parts[0], "").replace(parts[1], "");
                negative = true;
            }
        } else if (value.indexOf(percentSymbol) > -1) {
            isPercent = true;
            number = percent;
            symbol = percentSymbol;
        }

        value = value.replace("-", "")
                     .replace(symbol, "")
                     .replace(nonBreakingSpaceRegExp, " ")
                     .split(number[","].replace(nonBreakingSpaceRegExp, " ")).join("")
                     .replace(number["."], ".");

        value = parseFloat(value);

        if (isNaN(value)) {
            value = null;
        } else if (negative) {
            value *= -1;
        }

        if (value && isPercent) {
            value /= 100;
        }

        return value;
    };

    if (globalize && !globalize.load) {
        kendo.parseDate = function (value, format, culture) {
            if (objectToString.call(value) === "[object Date]") {
                return value;
            }

            return globalize.parseDate(value, format, culture);
        };

        kendo.parseFloat = function (value, culture) {
            if (typeof value === NUMBER) {
                return value;
            }

            if (value === undefined || value === null) {
               return null;
            }

            if ($.isPlainObject(culture)) {
                culture = culture.name;
            }

            value = globalize.parseFloat(value, culture);

            return isNaN(value) ? null : value;
        };
    }
})();

    function getShadows(element) {
        var shadow = element.css(kendo.support.transitions.css + "box-shadow") || element.css("box-shadow"),
            radius = shadow ? shadow.match(boxShadowRegExp) || [ 0, 0, 0, 0, 0 ] : [ 0, 0, 0, 0, 0 ],
            blur = math.max((+radius[3]), +(radius[4] || 0));

        return {
            left: (-radius[1]) + blur,
            right: (+radius[1]) + blur,
            bottom: (+radius[2]) + blur
        };
    }

    function wrap(element, autosize) {
        var browser = support.browser,
            percentage,
            isRtl = element.css("direction") == "rtl";

        if (!element.parent().hasClass("k-animation-container")) {
            var shadows = getShadows(element),
                width = element[0].style.width,
                height = element[0].style.height,
                percentWidth = percentRegExp.test(width),
                percentHeight = percentRegExp.test(height);

            if (browser.opera) { // Box shadow can't be retrieved in Opera
                shadows.left = shadows.right = shadows.bottom = 5;
            }

            percentage = percentWidth || percentHeight;

            if (!percentWidth && (!autosize || (autosize && width))) { width = element.outerWidth(); }
            if (!percentHeight && (!autosize || (autosize && height))) { height = element.outerHeight(); }

            element.wrap(
                         $("<div/>")
                         .addClass("k-animation-container")
                         .css({
                             width: width,
                             height: height,
                             marginLeft: shadows.left * (isRtl ? 1 : -1),
                             paddingLeft: shadows.left,
                             paddingRight: shadows.right,
                             paddingBottom: shadows.bottom
                         }));

            if (percentage) {
                element.css({
                    width: "100%",
                    height: "100%",
                    boxSizing: "border-box",
                    mozBoxSizing: "border-box",
                    webkitBoxSizing: "border-box"
                });
            }
        } else {
            var wrapper = element.parent(".k-animation-container"),
                wrapperStyle = wrapper[0].style;

            if (wrapper.is(":hidden")) {
                wrapper.show();
            }

            percentage = percentRegExp.test(wrapperStyle.width) || percentRegExp.test(wrapperStyle.height);

            if (!percentage) {
                wrapper.css({
                    width: element.outerWidth(),
                    height: element.outerHeight(),
                    boxSizing: "content-box",
                    mozBoxSizing: "content-box",
                    webkitBoxSizing: "content-box"
                });
            }
        }

        if (browser.msie && math.floor(browser.version) <= 7) {
            element.css({ zoom: 1 });
            element.children(".k-menu").width(element.width());
        }

        return element.parent();
    }

    function deepExtend(destination) {
        var i = 1,
            length = arguments.length;

        for (i = 1; i < length; i++) {
            deepExtendOne(destination, arguments[i]);
        }

        return destination;
    }

    function deepExtendOne(destination, source) {
        var ObservableArray = kendo.data.ObservableArray,
            LazyObservableArray = kendo.data.LazyObservableArray,
            DataSource = kendo.data.DataSource,
            HierarchicalDataSource = kendo.data.HierarchicalDataSource,
            property,
            propValue,
            propType,
            propInit,
            destProp;

        for (property in source) {
            propValue = source[property];
            propType = typeof propValue;

            if (propType === OBJECT && propValue !== null) {
                propInit = propValue.constructor;
            } else {
                propInit = null;
            }

            if (propInit &&
                propInit !== Array && propInit !== ObservableArray && propInit !== LazyObservableArray &&
                propInit !== DataSource && propInit !== HierarchicalDataSource) {

                if (propValue instanceof Date) {
                    destination[property] = new Date(propValue.getTime());
                } else if (isFunction(propValue.clone)) {
                    destination[property] = propValue.clone();
                } else {
                    destProp = destination[property];
                    if (typeof (destProp) === OBJECT) {
                        destination[property] = destProp || {};
                    } else {
                        destination[property] = {};
                    }
                    deepExtendOne(destination[property], propValue);
                }
            } else if (propType !== UNDEFINED) {
                destination[property] = propValue;
            }
        }

        return destination;
    }

    function testRx(agent, rxs, dflt) {
        for (var rx in rxs) {
            if (rxs.hasOwnProperty(rx) && rxs[rx].test(agent)) {
                return rx;
            }
        }
        return dflt !== undefined ? dflt : agent;
    }

    function toHyphens(str) {
        return str.replace(/([a-z][A-Z])/g, function (g) {
            return g.charAt(0) + '-' + g.charAt(1).toLowerCase();
        });
    }

    function toCamelCase(str) {
        return str.replace(/\-(\w)/g, function (strMatch, g1) {
            return g1.toUpperCase();
        });
    }

    function getComputedStyles(element, properties) {
        var styles = {}, computedStyle;

        if (document.defaultView && document.defaultView.getComputedStyle) {
            computedStyle = document.defaultView.getComputedStyle(element, "");

            if (properties) {
                $.each(properties, function(idx, value) {
                    styles[value] = computedStyle.getPropertyValue(value);
                });
            }
        } else {
            computedStyle = element.currentStyle;

            if (properties) {
                $.each(properties, function(idx, value) {
                    styles[value] = computedStyle[toCamelCase(value)];
                });
            }
        }

        if (!kendo.size(styles)) {
            styles = computedStyle;
        }

        return styles;
    }

    function isScrollable(element) {
        if (element.className.indexOf("k-auto-scrollable") > -1) {
            return true;
        }

        var overflow = getComputedStyles(element, ["overflow"]).overflow;
        return overflow == "auto" || overflow == "scroll";
    }

    (function () {
        support._scrollbar = undefined;

        support.scrollbar = function (refresh) {
            if (!isNaN(support._scrollbar) && !refresh) {
                return support._scrollbar;
            } else {
                var div = document.createElement("div"),
                    result;

                div.style.cssText = "overflow:scroll;overflow-x:hidden;zoom:1;clear:both;display:block";
                div.innerHTML = "&nbsp;";
                document.body.appendChild(div);

                support._scrollbar = result = div.offsetWidth - div.scrollWidth;

                document.body.removeChild(div);

                return result;
            }
        };

        support.isRtl = function(element) {
            return $(element).closest(".k-rtl").length > 0;
        };

        var table = document.createElement("table");

        // Internet Explorer does not support setting the innerHTML of TBODY and TABLE elements
        try {
            table.innerHTML = "<tr><td></td></tr>";

            support.tbodyInnerHtml = true;
        } catch (e) {
            support.tbodyInnerHtml = false;
        }

        support.touch = "ontouchstart" in window;
        support.msPointers = window.MSPointerEvent;
        support.pointers = window.PointerEvent;

        var transitions = support.transitions = false,
            transforms = support.transforms = false,
            elementProto = "HTMLElement" in window ? HTMLElement.prototype : [];

        support.hasHW3D = ("WebKitCSSMatrix" in window && "m11" in new window.WebKitCSSMatrix()) || "MozPerspective" in document.documentElement.style || "msPerspective" in document.documentElement.style;

        each([ "Moz", "webkit", "O", "ms" ], function () {
            var prefix = this.toString(),
                hasTransitions = typeof table.style[prefix + "Transition"] === STRING;

            if (hasTransitions || typeof table.style[prefix + "Transform"] === STRING) {
                var lowPrefix = prefix.toLowerCase();

                transforms = {
                    css: (lowPrefix != "ms") ? "-" + lowPrefix + "-" : "",
                    prefix: prefix,
                    event: (lowPrefix === "o" || lowPrefix === "webkit") ? lowPrefix : ""
                };

                if (hasTransitions) {
                    transitions = transforms;
                    transitions.event = transitions.event ? transitions.event + "TransitionEnd" : "transitionend";
                }

                return false;
            }
        });

        table = null;

        support.transforms = transforms;
        support.transitions = transitions;

        support.devicePixelRatio = window.devicePixelRatio === undefined ? 1 : window.devicePixelRatio;

        try {
            support.screenWidth = window.outerWidth || window.screen ? window.screen.availWidth : window.innerWidth;
            support.screenHeight = window.outerHeight || window.screen ? window.screen.availHeight : window.innerHeight;
        } catch(e) {
            //window.outerWidth throws error when in IE showModalDialog.
            support.screenWidth = window.screen.availWidth;
            support.screenHeight = window.screen.availHeight;
        }

        support.detectOS = function (ua) {
            var os = false, minorVersion, match = [],
                notAndroidPhone = !/mobile safari/i.test(ua),
                agentRxs = {
                    wp: /(Windows Phone(?: OS)?)\s(\d+)\.(\d+(\.\d+)?)/,
                    fire: /(Silk)\/(\d+)\.(\d+(\.\d+)?)/,
                    android: /(Android|Android.*(?:Opera|Firefox).*?\/)\s*(\d+)\.(\d+(\.\d+)?)/,
                    iphone: /(iPhone|iPod).*OS\s+(\d+)[\._]([\d\._]+)/,
                    ipad: /(iPad).*OS\s+(\d+)[\._]([\d_]+)/,
                    meego: /(MeeGo).+NokiaBrowser\/(\d+)\.([\d\._]+)/,
                    webos: /(webOS)\/(\d+)\.(\d+(\.\d+)?)/,
                    blackberry: /(BlackBerry|BB10).*?Version\/(\d+)\.(\d+(\.\d+)?)/,
                    playbook: /(PlayBook).*?Tablet\s*OS\s*(\d+)\.(\d+(\.\d+)?)/,
                    windows: /(MSIE)\s+(\d+)\.(\d+(\.\d+)?)/,
                    tizen: /(tizen).*?Version\/(\d+)\.(\d+(\.\d+)?)/i,
                    sailfish: /(sailfish).*rv:(\d+)\.(\d+(\.\d+)?).*firefox/i,
                    ffos: /(Mobile).*rv:(\d+)\.(\d+(\.\d+)?).*Firefox/
                },
                osRxs = {
                    ios: /^i(phone|pad|pod)$/i,
                    android: /^android|fire$/i,
                    blackberry: /^blackberry|playbook/i,
                    windows: /windows/,
                    wp: /wp/,
                    flat: /sailfish|ffos|tizen/i,
                    meego: /meego/
                },
                formFactorRxs = {
                    tablet: /playbook|ipad|fire/i
                },
                browserRxs = {
                    omini: /Opera\sMini/i,
                    omobile: /Opera\sMobi/i,
                    firefox: /Firefox|Fennec/i,
                    mobilesafari: /version\/.*safari/i,
                    ie: /MSIE|Windows\sPhone/i,
                    chrome: /chrome|crios/i,
                    webkit: /webkit/i
                };

            for (var agent in agentRxs) {
                if (agentRxs.hasOwnProperty(agent)) {
                    match = ua.match(agentRxs[agent]);
                    if (match) {
                        if (agent == "windows" && "plugins" in navigator) { return false; } // Break if not Metro/Mobile Windows

                        os = {};
                        os.device = agent;
                        os.tablet = testRx(agent, formFactorRxs, false);
                        os.browser = testRx(ua, browserRxs, "default");
                        os.name = testRx(agent, osRxs);
                        os[os.name] = true;
                        os.majorVersion = match[2];
                        os.minorVersion = match[3].replace("_", ".");
                        minorVersion = os.minorVersion.replace(".", "").substr(0, 2);
                        os.flatVersion = os.majorVersion + minorVersion + (new Array(3 - (minorVersion.length < 3 ? minorVersion.length : 2)).join("0"));
                        os.cordova = typeof window.PhoneGap !== UNDEFINED || typeof window.cordova !== UNDEFINED; // Use file protocol to detect appModes.
                        os.appMode = window.navigator.standalone || (/file|local|wmapp/).test(window.location.protocol) || os.cordova; // Use file protocol to detect appModes.

                        if (os.android && (support.devicePixelRatio < 1.5 && os.flatVersion < 400 || notAndroidPhone) && (support.screenWidth > 800 || support.screenHeight > 800)) {
                            os.tablet = agent;
                        }

                        break;
                    }
                }
            }
            return os;
        };

        var mobileOS = support.mobileOS = support.detectOS(navigator.userAgent);

        support.wpDevicePixelRatio = mobileOS.wp ? screen.width / 320 : 0;
        support.kineticScrollNeeded = mobileOS && (support.touch || support.msPointers || support.pointers);

        support.hasNativeScrolling = false;

        if (mobileOS.ios || (mobileOS.android && mobileOS.majorVersion > 2) || mobileOS.wp) {
            support.hasNativeScrolling = mobileOS;
        }

        support.mouseAndTouchPresent = support.touch && !(support.mobileOS.ios || support.mobileOS.android);

        support.detectBrowser = function(ua) {
            var browser = false, match = [],
                browserRxs = {
                    edge: /(edge)[ \/]([\w.]+)/i,
                    webkit: /(chrome)[ \/]([\w.]+)/i,
                    safari: /(webkit)[ \/]([\w.]+)/i,
                    opera: /(opera)(?:.*version|)[ \/]([\w.]+)/i,
                    msie: /(msie\s|trident.*? rv:)([\w.]+)/i,
                    mozilla: /(mozilla)(?:.*? rv:([\w.]+)|)/i
                };

            for (var agent in browserRxs) {
                if (browserRxs.hasOwnProperty(agent)) {
                    match = ua.match(browserRxs[agent]);
                    if (match) {
                        browser = {};
                        browser[agent] = true;
                        browser[match[1].toLowerCase().split(" ")[0].split("/")[0]] = true;
                        browser.version = parseInt(document.documentMode || match[2], 10);

                        break;
                    }
                }
            }

            return browser;
        };

        support.browser = support.detectBrowser(navigator.userAgent);

        support.zoomLevel = function() {
            try {
                var browser = support.browser;
                var ie11WidthCorrection = 0;
                var docEl = document.documentElement;

                if (browser.msie && browser.version == 11 && docEl.scrollHeight > docEl.clientHeight && !support.touch) {
                    ie11WidthCorrection = support.scrollbar();
                }

                return support.touch ? (docEl.clientWidth / window.innerWidth) :
                       browser.msie && browser.version >= 10 ? (((top || window).document.documentElement.offsetWidth + ie11WidthCorrection) / (top || window).innerWidth) : 1;
            } catch(e) {
                return 1;
            }
        };

        support.cssBorderSpacing = typeof document.documentElement.style.borderSpacing != "undefined" && !(support.browser.msie && support.browser.version < 8);

        (function(browser) {
            // add browser-specific CSS class
            var cssClass = "",
                docElement = $(document.documentElement),
                majorVersion = parseInt(browser.version, 10);

            if (browser.msie) {
                cssClass = "ie";
            } else if (browser.mozilla) {
                cssClass = "ff";
            } else if (browser.safari) {
                cssClass = "safari";
            } else if (browser.webkit) {
                cssClass = "webkit";
            } else if (browser.opera) {
                cssClass = "opera";
            }

            if (cssClass) {
                cssClass = "k-" + cssClass + " k-" + cssClass + majorVersion;
            }
            if (support.mobileOS) {
                cssClass += " k-mobile";
            }

            docElement.addClass(cssClass);
        })(support.browser);

        support.eventCapture = document.documentElement.addEventListener;

        var input = document.createElement("input");

        support.placeholder = "placeholder" in input;
        support.propertyChangeEvent = "onpropertychange" in input;

        support.input = (function() {
            var types = ["number", "date", "time", "month", "week", "datetime", "datetime-local"];
            var length = types.length;
            var value = "test";
            var result = {};
            var idx = 0;
            var type;

            for (;idx < length; idx++) {
                type = types[idx];
                input.setAttribute("type", type);
                input.value = value;

                result[type.replace("-", "")] = input.type !== "text" && input.value !== value;
            }

            return result;
        })();

        input.style.cssText = "float:left;";

        support.cssFloat = !!input.style.cssFloat;

        input = null;

        support.stableSort = (function() {
            // Chrome sort is not stable for more than *10* items
            // IE9+ sort is not stable for than *512* items
            var threshold = 513;

            var sorted = [{
                index: 0,
                field: "b"
            }];

            for (var i = 1; i < threshold; i++) {
                sorted.push({
                    index: i,
                    field: "a"
                });
            }

            sorted.sort(function(a, b) {
                return a.field > b.field ? 1 : (a.field < b.field ? -1 : 0);
            });

            return sorted[0].index === 1;
        })();

        support.matchesSelector = elementProto.webkitMatchesSelector || elementProto.mozMatchesSelector ||
                                  elementProto.msMatchesSelector || elementProto.oMatchesSelector ||
                                  elementProto.matchesSelector || elementProto.matches ||
          function( selector ) {
              var nodeList = document.querySelectorAll ? ( this.parentNode || document ).querySelectorAll( selector ) || [] : $(selector),
                  i = nodeList.length;

              while (i--) {
                  if (nodeList[i] == this) {
                      return true;
                  }
              }

              return false;
          };

        support.pushState = window.history && window.history.pushState;

        var documentMode = document.documentMode;

        support.hashChange = ("onhashchange" in window) && !(support.browser.msie && (!documentMode || documentMode <= 8)); // old IE detection
    })();


    function size(obj) {
        var result = 0, key;
        for (key in obj) {
            if (obj.hasOwnProperty(key) && key != "toJSON") { // Ignore fake IE7 toJSON.
                result++;
            }
        }

        return result;
    }

    function getOffset(element, type, positioned) {
        if (!type) {
            type = "offset";
        }

        var result = element[type](),
            mobileOS = support.mobileOS;

        // IE10 touch zoom is living in a separate viewport
        if (support.browser.msie && (support.pointers || support.msPointers) && !positioned) {
            result.top -= (window.pageYOffset - document.documentElement.scrollTop);
            result.left -= (window.pageXOffset - document.documentElement.scrollLeft);
        }

        return result;
    }

    var directions = {
        left: { reverse: "right" },
        right: { reverse: "left" },
        down: { reverse: "up" },
        up: { reverse: "down" },
        top: { reverse: "bottom" },
        bottom: { reverse: "top" },
        "in": { reverse: "out" },
        out: { reverse: "in" }
    };

    function parseEffects(input) {
        var effects = {};

        each((typeof input === "string" ? input.split(" ") : input), function(idx) {
            effects[idx] = this;
        });

        return effects;
    }

    function fx(element) {
        return new kendo.effects.Element(element);
    }

    var effects = {};

    $.extend(effects, {
        enabled: true,
        Element: function(element) {
            this.element = $(element);
        },

        promise: function(element, options) {
            if (!element.is(":visible")) {
                element.css({ display: element.data("olddisplay") || "block" }).css("display");
            }

            if (options.hide) {
                element.data("olddisplay", element.css("display")).hide();
            }

            if (options.init) {
                options.init();
            }

            if (options.completeCallback) {
                options.completeCallback(element); // call the external complete callback with the element
            }

            element.dequeue();
        },

        disable: function() {
            this.enabled = false;
            this.promise = this.promiseShim;
        },

        enable: function() {
            this.enabled = true;
            this.promise = this.animatedPromise;
        }
    });

    effects.promiseShim = effects.promise;

    function prepareAnimationOptions(options, duration, reverse, complete) {
        if (typeof options === STRING) {
            // options is the list of effect names separated by space e.g. animate(element, "fadeIn slideDown")

            // only callback is provided e.g. animate(element, options, function() {});
            if (isFunction(duration)) {
                complete = duration;
                duration = 400;
                reverse = false;
            }

            if (isFunction(reverse)) {
                complete = reverse;
                reverse = false;
            }

            if (typeof duration === BOOLEAN){
                reverse = duration;
                duration = 400;
            }

            options = {
                effects: options,
                duration: duration,
                reverse: reverse,
                complete: complete
            };
        }

        return extend({
            //default options
            effects: {},
            duration: 400, //jQuery default duration
            reverse: false,
            init: noop,
            teardown: noop,
            hide: false
        }, options, { completeCallback: options.complete, complete: noop }); // Move external complete callback, so deferred.resolve can be always executed.

    }

    function animate(element, options, duration, reverse, complete) {
        var idx = 0,
            length = element.length,
            instance;

        for (; idx < length; idx ++) {
            instance = $(element[idx]);
            instance.queue(function() {
                effects.promise(instance, prepareAnimationOptions(options, duration, reverse, complete));
            });
        }

        return element;
    }

    function toggleClass(element, classes, options, add) {
        if (classes) {
            classes = classes.split(" ");

            each(classes, function(idx, value) {
                element.toggleClass(value, add);
            });
        }

        return element;
    }

    if (!("kendoAnimate" in $.fn)) {
        extend($.fn, {
            kendoStop: function(clearQueue, gotoEnd) {
                return this.stop(clearQueue, gotoEnd);
            },

            kendoAnimate: function(options, duration, reverse, complete) {
                return animate(this, options, duration, reverse, complete);
            },

            kendoAddClass: function(classes, options){
                return kendo.toggleClass(this, classes, options, true);
            },

            kendoRemoveClass: function(classes, options){
                return kendo.toggleClass(this, classes, options, false);
            },
            kendoToggleClass: function(classes, options, toggle){
                return kendo.toggleClass(this, classes, options, toggle);
            }
        });
    }

    var ampRegExp = /&/g,
        ltRegExp = /</g,
        quoteRegExp = /"/g,
        aposRegExp = /'/g,
        gtRegExp = />/g;
    function htmlEncode(value) {
        return ("" + value).replace(ampRegExp, "&amp;").replace(ltRegExp, "&lt;").replace(gtRegExp, "&gt;").replace(quoteRegExp, "&quot;").replace(aposRegExp, "&#39;");
    }

    var eventTarget = function (e) {
        return e.target;
    };

    if (support.touch) {

        eventTarget = function(e) {
            var touches = "originalEvent" in e ? e.originalEvent.changedTouches : "changedTouches" in e ? e.changedTouches : null;

            return touches ? document.elementFromPoint(touches[0].clientX, touches[0].clientY) : e.target;
        };

        each(["swipe", "swipeLeft", "swipeRight", "swipeUp", "swipeDown", "doubleTap", "tap"], function(m, value) {
            $.fn[value] = function(callback) {
                return this.bind(value, callback);
            };
        });
    }

    if (support.touch) {
        if (!support.mobileOS) {
            support.mousedown = "mousedown touchstart";
            support.mouseup = "mouseup touchend";
            support.mousemove = "mousemove touchmove";
            support.mousecancel = "mouseleave touchcancel";
            support.click = "click";
            support.resize = "resize";
        } else {
            support.mousedown = "touchstart";
            support.mouseup = "touchend";
            support.mousemove = "touchmove";
            support.mousecancel = "touchcancel";
            support.click = "touchend";
            support.resize = "orientationchange";
        }
    } else if (support.pointers) {
        support.mousemove = "pointermove";
        support.mousedown = "pointerdown";
        support.mouseup = "pointerup";
        support.mousecancel = "pointercancel";
        support.click = "pointerup";
        support.resize = "orientationchange resize";
    } else if (support.msPointers) {
        support.mousemove = "MSPointerMove";
        support.mousedown = "MSPointerDown";
        support.mouseup = "MSPointerUp";
        support.mousecancel = "MSPointerCancel";
        support.click = "MSPointerUp";
        support.resize = "orientationchange resize";
    } else {
        support.mousemove = "mousemove";
        support.mousedown = "mousedown";
        support.mouseup = "mouseup";
        support.mousecancel = "mouseleave";
        support.click = "click";
        support.resize = "resize";
    }

    var wrapExpression = function(members, paramName) {
        var result = paramName || "d",
            index,
            idx,
            length,
            member,
            count = 1;

        for (idx = 0, length = members.length; idx < length; idx++) {
            member = members[idx];
            if (member !== "") {
                index = member.indexOf("[");

                if (index !== 0) {
                    if (index == -1) {
                        member = "." + member;
                    } else {
                        count++;
                        member = "." + member.substring(0, index) + " || {})" + member.substring(index);
                    }
                }

                count++;
                result += member + ((idx < length - 1) ? " || {})" : ")");
            }
        }
        return new Array(count).join("(") + result;
    },
    localUrlRe = /^([a-z]+:)?\/\//i;

    extend(kendo, {
        ui: kendo.ui || {},
        fx: kendo.fx || fx,
        effects: kendo.effects || effects,
        mobile: kendo.mobile || { },
        data: kendo.data || {},
        dataviz: kendo.dataviz || {},
        keys: {
            INSERT: 45,
            DELETE: 46,
            BACKSPACE: 8,
            TAB: 9,
            ENTER: 13,
            ESC: 27,
            LEFT: 37,
            UP: 38,
            RIGHT: 39,
            DOWN: 40,
            END: 35,
            HOME: 36,
            SPACEBAR: 32,
            PAGEUP: 33,
            PAGEDOWN: 34,
            F2: 113,
            F10: 121,
            F12: 123,
            NUMPAD_PLUS: 107,
            NUMPAD_MINUS: 109,
            NUMPAD_DOT: 110
        },
        support: kendo.support || support,
        animate: kendo.animate || animate,
        ns: "",
        attr: function(value) {
            return "data-" + kendo.ns + value;
        },
        getShadows: getShadows,
        wrap: wrap,
        deepExtend: deepExtend,
        getComputedStyles: getComputedStyles,
        isScrollable: isScrollable,
        size: size,
        toCamelCase: toCamelCase,
        toHyphens: toHyphens,
        getOffset: kendo.getOffset || getOffset,
        parseEffects: kendo.parseEffects || parseEffects,
        toggleClass: kendo.toggleClass || toggleClass,
        directions: kendo.directions || directions,
        Observable: Observable,
        Class: Class,
        Template: Template,
        template: proxy(Template.compile, Template),
        render: proxy(Template.render, Template),
        stringify: proxy(JSON.stringify, JSON),
        eventTarget: eventTarget,
        htmlEncode: htmlEncode,
        isLocalUrl: function(url) {
            return url && !localUrlRe.test(url);
        },

        expr: function(expression, safe, paramName) {
            expression = expression || "";

            if (typeof safe == STRING) {
                paramName = safe;
                safe = false;
            }

            paramName = paramName || "d";

            if (expression && expression.charAt(0) !== "[") {
                expression = "." + expression;
            }

            if (safe) {
                expression = expression.replace(/"([^.]*)\.([^"]*)"/g,'"$1_$DOT$_$2"');
                expression = expression.replace(/'([^.]*)\.([^']*)'/g,"'$1_$DOT$_$2'");
                expression = wrapExpression(expression.split("."), paramName);
                expression = expression.replace(/_\$DOT\$_/g, ".");
            } else {
                expression = paramName + expression;
            }

            return expression;
        },

        getter: function(expression, safe) {
            var key = expression + safe;
            return getterCache[key] = getterCache[key] || new Function("d", "return " + kendo.expr(expression, safe));
        },

        setter: function(expression) {
            return setterCache[expression] = setterCache[expression] || new Function("d,value", kendo.expr(expression) + "=value");
        },

        accessor: function(expression) {
            return {
                get: kendo.getter(expression),
                set: kendo.setter(expression)
            };
        },

        guid: function() {
            var id = "", i, random;

            for (i = 0; i < 32; i++) {
                random = math.random() * 16 | 0;

                if (i == 8 || i == 12 || i == 16 || i == 20) {
                    id += "-";
                }
                id += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
            }

            return id;
        },

        roleSelector: function(role) {
            return role.replace(/(\S+)/g, "[" + kendo.attr("role") + "=$1],").slice(0, -1);
        },

        directiveSelector: function(directives) {
            var selectors = directives.split(" ");

            if (selectors) {
                for (var i = 0; i < selectors.length; i++) {
                    if (selectors[i] != "view") {
                        selectors[i] = selectors[i].replace(/(\w*)(view|bar|strip|over)$/, "$1-$2");
                    }
                }
            }

            return selectors.join(" ").replace(/(\S+)/g, "kendo-mobile-$1,").slice(0, -1);
        },

        triggeredByInput: function(e) {
            return (/^(label|input|textarea|select)$/i).test(e.target.tagName);
        },

        logToConsole: function(message) {
            var console = window.console;

            if (!kendo.suppressLog && typeof(console) != "undefined" && console.log) {
                console.log(message);
            }
        }
    });

    var Widget = Observable.extend( {
        init: function(element, options) {
            var that = this;

            that.element = kendo.jQuery(element).handler(that);

            that.angular("init", options);

            Observable.fn.init.call(that);

            var dataSource = options ? options.dataSource : null;

            if (dataSource) {
                // avoid deep cloning the data source
                options = extend({}, options, { dataSource: {} });
            }

            options = that.options = extend(true, {}, that.options, options);

            if (dataSource) {
                options.dataSource = dataSource;
            }

            if (!that.element.attr(kendo.attr("role"))) {
                that.element.attr(kendo.attr("role"), (options.name || "").toLowerCase());
            }

            that.element.data("kendo" + options.prefix + options.name, that);

            that.bind(that.events, options);
        },

        events: [],

        options: {
            prefix: ""
        },

        _hasBindingTarget: function() {
            return !!this.element[0].kendoBindingTarget;
        },

        _tabindex: function(target) {
            target = target || this.wrapper;

            var element = this.element,
                TABINDEX = "tabindex",
                tabindex = target.attr(TABINDEX) || element.attr(TABINDEX);

            element.removeAttr(TABINDEX);

            target.attr(TABINDEX, !isNaN(tabindex) ? tabindex : 0);
        },

        setOptions: function(options) {
            this._setEvents(options);
            $.extend(this.options, options);
        },

        _setEvents: function(options) {
            var that = this,
                idx = 0,
                length = that.events.length,
                e;

            for (; idx < length; idx ++) {
                e = that.events[idx];
                if (that.options[e] && options[e]) {
                    that.unbind(e, that.options[e]);
                }
            }

            that.bind(that.events, options);
        },

        resize: function(force) {
            var size = this.getSize(),
                currentSize = this._size;

            if (force || (size.width > 0 || size.height > 0) && (!currentSize || size.width !== currentSize.width || size.height !== currentSize.height)) {
                this._size = size;
                this._resize(size, force);
                this.trigger("resize", size);
            }
        },

        getSize: function() {
            return kendo.dimensions(this.element);
        },

        size: function(size) {
            if (!size) {
                return this.getSize();
            } else {
                this.setSize(size);
            }
        },

        setSize: $.noop,
        _resize: $.noop,

        destroy: function() {
            var that = this;

            that.element.removeData("kendo" + that.options.prefix + that.options.name);
            that.element.removeData("handler");
            that.unbind();
        },
        _destroy: function() {
            this.destroy();
        },
        angular: function(){}
    });

    var DataBoundWidget = Widget.extend({
        // Angular consumes these.
        dataItems: function() {
            return this.dataSource.flatView();
        },

        _angularItems: function(cmd) {
            var that = this;
            that.angular(cmd, function(){
                return {
                    elements: that.items(),
                    data: $.map(that.dataItems(), function(dataItem){
                        return { dataItem: dataItem };
                    })
                };
            });
        }
    });

    kendo.dimensions = function(element, dimensions) {
        var domElement = element[0];

        if (dimensions) {
            element.css(dimensions);
        }

        return { width: domElement.offsetWidth, height: domElement.offsetHeight };
    };

    kendo.notify = noop;

    var templateRegExp = /template$/i,
        jsonRegExp = /^\s*(?:\{(?:.|\r\n|\n)*\}|\[(?:.|\r\n|\n)*\])\s*$/,
        jsonFormatRegExp = /^\{(\d+)(:[^\}]+)?\}|^\[[A-Za-z_]*\]$/,
        dashRegExp = /([A-Z])/g;

    function parseOption(element, option) {
        var value;

        if (option.indexOf("data") === 0) {
            option = option.substring(4);
            option = option.charAt(0).toLowerCase() + option.substring(1);
        }

        option = option.replace(dashRegExp, "-$1");
        value = element.getAttribute("data-" + kendo.ns + option);

        if (value === null) {
            value = undefined;
        } else if (value === "null") {
            value = null;
        } else if (value === "true") {
            value = true;
        } else if (value === "false") {
            value = false;
        } else if (numberRegExp.test(value)) {
            value = parseFloat(value);
        } else if (jsonRegExp.test(value) && !jsonFormatRegExp.test(value)) {
            value = new Function("return (" + value + ")")();
        }

        return value;
    }

    function parseOptions(element, options) {
        var result = {},
            option,
            value;

        for (option in options) {
            value = parseOption(element, option);

            if (value !== undefined) {

                if (templateRegExp.test(option)) {
                    value = kendo.template($("#" + value).html());
                }

                result[option] = value;
            }
        }

        return result;
    }

    kendo.initWidget = function(element, options, roles) {
        var result,
            option,
            widget,
            idx,
            length,
            role,
            value,
            dataSource,
            fullPath,
            widgetKeyRegExp;

        // Preserve backwards compatibility with (element, options, namespace) signature, where namespace was kendo.ui
        if (!roles) {
            roles = kendo.ui.roles;
        } else if (roles.roles) {
            roles = roles.roles;
        }

        element = element.nodeType ? element : element[0];

        role = element.getAttribute("data-" + kendo.ns + "role");

        if (!role) {
            return;
        }

        fullPath = role.indexOf(".") === -1;

        // look for any widget that may be already instantiated based on this role.
        // The prefix used is unknown, hence the regexp
        //

        if (fullPath) {
            widget = roles[role];
        } else { // full namespace path - like kendo.ui.Widget
            widget = kendo.getter(role)(window);
        }

        var data = $(element).data(),
            widgetKey = widget ? "kendo" + widget.fn.options.prefix + widget.fn.options.name : "";

        if (fullPath) {
            widgetKeyRegExp = new RegExp("^kendo.*" + role + "$", "i");
        } else { // full namespace path - like kendo.ui.Widget
            widgetKeyRegExp = new RegExp("^" + widgetKey + "$", "i");
        }

        for(var key in data) {
            if (key.match(widgetKeyRegExp)) {
                // we have detected a widget of the same kind - save its reference, we will set its options
                if (key === widgetKey) {
                    result = data[key];
                } else {
                    return data[key];
                }
            }
        }

        if (!widget) {
            return;
        }

        dataSource = parseOption(element, "dataSource");

        options = $.extend({}, parseOptions(element, widget.fn.options), options);

        if (dataSource) {
            if (typeof dataSource === STRING) {
                options.dataSource = kendo.getter(dataSource)(window);
            } else {
                options.dataSource = dataSource;
            }
        }

        for (idx = 0, length = widget.fn.events.length; idx < length; idx++) {
            option = widget.fn.events[idx];

            value = parseOption(element, option);

            if (value !== undefined) {
                options[option] = kendo.getter(value)(window);
            }
        }

        if (!result) {
            result = new widget(element, options);
        } else if (!$.isEmptyObject(options)) {
            result.setOptions(options);
        }

        return result;
    };

    kendo.rolesFromNamespaces = function(namespaces) {
        var roles = [],
            idx,
            length;

        if (!namespaces[0]) {
            namespaces = [kendo.ui, kendo.dataviz.ui];
        }

        for (idx = 0, length = namespaces.length; idx < length; idx ++) {
            roles[idx] = namespaces[idx].roles;
        }

        return extend.apply(null, [{}].concat(roles.reverse()));
    };

    kendo.init = function(element) {
        var roles = kendo.rolesFromNamespaces(slice.call(arguments, 1));

        $(element).find("[data-" + kendo.ns + "role]").addBack().each(function(){
            kendo.initWidget(this, {}, roles);
        });
    };

    kendo.destroy = function(element) {
        $(element).find("[data-" + kendo.ns + "role]").addBack().each(function(){
            var data = $(this).data();

            for (var key in data) {
                if (key.indexOf("kendo") === 0 && typeof data[key].destroy === FUNCTION) {
                    data[key].destroy();
                }
            }
        });
    };

    function containmentComparer(a, b) {
        return $.contains(a, b) ? -1 : 1;
    }

    function resizableWidget() {
        var widget = $(this);
        return ($.inArray(widget.attr("data-" + kendo.ns + "role"), ["slider", "rangeslider"]) > -1) || widget.is(":visible");
    }

    kendo.resize = function(element, force) {
        var widgets = $(element).find("[data-" + kendo.ns + "role]").addBack().filter(resizableWidget);

        if (!widgets.length) {
            return;
        }

        // sort widgets based on their parent-child relation
        var widgetsArray = $.makeArray(widgets);
        widgetsArray.sort(containmentComparer);

        // resize widgets
        $.each(widgetsArray, function () {
            var widget = kendo.widgetInstance($(this));
            if (widget) {
                widget.resize(force);
            }
        });
    };

    kendo.parseOptions = parseOptions;

    extend(kendo.ui, {
        Widget: Widget,
        DataBoundWidget: DataBoundWidget,
        roles: {},
        progress: function(container, toggle) {
            var mask = container.find(".k-loading-mask"),
                support = kendo.support,
                browser = support.browser,
                isRtl, leftRight, webkitCorrection, containerScrollLeft;

            if (toggle) {
                if (!mask.length) {
                    isRtl = support.isRtl(container);
                    leftRight = isRtl ? "right" : "left";
                    containerScrollLeft = container.scrollLeft();
                    webkitCorrection = browser.webkit ? (!isRtl ? 0 : container[0].scrollWidth - container.width() - 2 * containerScrollLeft) : 0;

                    mask = $("<div class='k-loading-mask'><span class='k-loading-text'>Loading...</span><div class='k-loading-image'/><div class='k-loading-color'/></div>")
                        .width("100%").height("100%")
                        .css("top", container.scrollTop())
                        .css(leftRight, Math.abs(containerScrollLeft) + webkitCorrection)
                        .prependTo(container);
                }
            } else if (mask) {
                mask.remove();
            }
        },
        plugin: function(widget, register, prefix) {
            var name = widget.fn.options.name,
                getter;

            register = register || kendo.ui;
            prefix = prefix || "";

            register[name] = widget;

            register.roles[name.toLowerCase()] = widget;

            getter = "getKendo" + prefix + name;
            name = "kendo" + prefix + name;

            $.fn[name] = function(options) {
                var value = this,
                    args;

                if (typeof options === STRING) {
                    args = slice.call(arguments, 1);

                    this.each(function(){
                        var widget = $.data(this, name),
                            method,
                            result;

                        if (!widget) {
                            throw new Error(kendo.format("Cannot call method '{0}' of {1} before it is initialized", options, name));
                        }

                        method = widget[options];

                        if (typeof method !== FUNCTION) {
                            throw new Error(kendo.format("Cannot find method '{0}' of {1}", options, name));
                        }

                        result = method.apply(widget, args);

                        if (result !== undefined) {
                            value = result;
                            return false;
                        }
                    });
                } else {
                    this.each(function() {
                        new widget(this, options);
                    });
                }

                return value;
            };

            $.fn[name].widget = widget;

            $.fn[getter] = function() {
                return this.data(name);
            };
        }
    });

    var ContainerNullObject = { bind: function () { return this; }, nullObject: true, options: {} };

    var MobileWidget = Widget.extend({
        init: function(element, options) {
            Widget.fn.init.call(this, element, options);
            this.element.autoApplyNS();
            this.wrapper = this.element;
            this.element.addClass("km-widget");
        },

        destroy: function() {
            Widget.fn.destroy.call(this);
            this.element.kendoDestroy();
        },

        options: {
            prefix: "Mobile"
        },

        events: [],

        view: function() {
            var viewElement = this.element.closest(kendo.roleSelector("view splitview modalview drawer"));
            return kendo.widgetInstance(viewElement, kendo.mobile.ui) || ContainerNullObject;
        },

        viewHasNativeScrolling: function() {
            var view = this.view();
            return view && view.options.useNativeScrolling;
        },

        container: function() {
            var element = this.element.closest(kendo.roleSelector("view layout modalview drawer splitview"));
            return kendo.widgetInstance(element.eq(0), kendo.mobile.ui) || ContainerNullObject;
        }
    });

    extend(kendo.mobile, {
        init: function(element) {
            kendo.init(element, kendo.mobile.ui, kendo.ui, kendo.dataviz.ui);
        },

        appLevelNativeScrolling: function() {
            return kendo.mobile.application && kendo.mobile.application.options && kendo.mobile.application.options.useNativeScrolling;
        },

        roles: {},

        ui: {
            Widget: MobileWidget,
            DataBoundWidget: DataBoundWidget.extend(MobileWidget.prototype),
            roles: {},
            plugin: function(widget) {
                kendo.ui.plugin(widget, kendo.mobile.ui, "Mobile");
            }
        }
    });

    deepExtend(kendo.dataviz, {
        init: function(element) {
            kendo.init(element, kendo.dataviz.ui);
        },
        ui: {
            roles: {},
            themes: {},
            views: [],
            plugin: function(widget) {
                kendo.ui.plugin(widget, kendo.dataviz.ui);
            }
        },
        roles: {}
    });

    kendo.touchScroller = function(elements, options) {
        // return the first touch scroller
        return $(elements).map(function(idx, element) {
            element = $(element);
            if (support.kineticScrollNeeded && kendo.mobile.ui.Scroller && !element.data("kendoMobileScroller")) {
                element.kendoMobileScroller(options);
                return element.data("kendoMobileScroller");
            } else {
                return false;
            }
        })[0];
    };

    kendo.preventDefault = function(e) {
        e.preventDefault();
    };

    kendo.widgetInstance = function(element, suites) {
        var role = element.data(kendo.ns + "role"),
            widgets = [], i, length;

        if (role) {
            // HACK!!! mobile view scroller widgets are instantiated on data-role="content" elements. We need to discover them when resizing.
            if (role === "content") {
                role = "scroller";
            }

            if (suites) {
                if (suites[0]) {
                    for (i = 0, length = suites.length; i < length; i ++) {
                        widgets.push(suites[i].roles[role]);
                    }
                } else {
                    widgets.push(suites.roles[role]);
                }
            }
            else {
                widgets = [ kendo.ui.roles[role], kendo.dataviz.ui.roles[role],  kendo.mobile.ui.roles[role] ];
            }

            if (role.indexOf(".") >= 0) {
                widgets = [ kendo.getter(role)(window) ];
            }

            for (i = 0, length = widgets.length; i < length; i ++) {
                var widget = widgets[i];
                if (widget) {
                    var instance = element.data("kendo" + widget.fn.options.prefix + widget.fn.options.name);
                    if (instance) {
                        return instance;
                    }
                }
            }
        }
    };

    kendo.onResize = function(callback) {
        var handler = callback;
        if (support.mobileOS.android) {
            handler = function() { setTimeout(callback, 600); };
        }

        $(window).on(support.resize, handler);
        return handler;
    };

    kendo.unbindResize = function(callback) {
        $(window).off(support.resize, callback);
    };

    kendo.attrValue = function(element, key) {
        return element.data(kendo.ns + key);
    };

    kendo.days = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
    };

    function focusable(element, isTabIndexNotNaN) {
        var nodeName = element.nodeName.toLowerCase();

        return (/input|select|textarea|button|object/.test(nodeName) ?
                !element.disabled :
                "a" === nodeName ?
                element.href || isTabIndexNotNaN :
                isTabIndexNotNaN
               ) &&
            visible(element);
    }

    function visible(element) {
        return $.expr.filters.visible(element) &&
            !$(element).parents().addBack().filter(function() {
                return $.css(this,"visibility") === "hidden";
            }).length;
    }

    $.extend($.expr[ ":" ], {
        kendoFocusable: function(element) {
            var idx = $.attr(element, "tabindex");
            return focusable(element, !isNaN(idx) && idx > -1);
        }
    });

    var MOUSE_EVENTS = ["mousedown", "mousemove", "mouseenter", "mouseleave", "mouseover", "mouseout", "mouseup", "click"];
    var EXCLUDE_BUST_CLICK_SELECTOR = "label, input, [data-rel=external]";

    var MouseEventNormalizer = {
        setupMouseMute: function() {
            var idx = 0,
                length = MOUSE_EVENTS.length,
                element = document.documentElement;

            if (MouseEventNormalizer.mouseTrap || !support.eventCapture) {
                return;
            }

            MouseEventNormalizer.mouseTrap = true;

            MouseEventNormalizer.bustClick = false;
            MouseEventNormalizer.captureMouse = false;

            var handler = function(e) {
                if (MouseEventNormalizer.captureMouse) {
                    if (e.type === "click") {
                        if (MouseEventNormalizer.bustClick && !$(e.target).is(EXCLUDE_BUST_CLICK_SELECTOR)) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    } else {
                        e.stopPropagation();
                    }
                }
            };

            for (; idx < length; idx++) {
                element.addEventListener(MOUSE_EVENTS[idx], handler, true);
            }
        },

        muteMouse: function(e) {
            MouseEventNormalizer.captureMouse = true;
            if (e.data.bustClick) {
                MouseEventNormalizer.bustClick = true;
            }
            clearTimeout(MouseEventNormalizer.mouseTrapTimeoutID);
        },

        unMuteMouse: function() {
            clearTimeout(MouseEventNormalizer.mouseTrapTimeoutID);
            MouseEventNormalizer.mouseTrapTimeoutID = setTimeout(function() {
                MouseEventNormalizer.captureMouse = false;
                MouseEventNormalizer.bustClick = false;
            }, 400);
        }
    };

    var eventMap = {
        down: "touchstart mousedown",
        move: "mousemove touchmove",
        up: "mouseup touchend touchcancel",
        cancel: "mouseleave touchcancel"
    };

    if (support.touch && (support.mobileOS.ios || support.mobileOS.android)) {
        eventMap = {
            down: "touchstart",
            move: "touchmove",
            up: "touchend touchcancel",
            cancel: "touchcancel"
        };
    } else if (support.pointers) {
        eventMap = {
            down: "pointerdown",
            move: "pointermove",
            up: "pointerup",
            cancel: "pointercancel pointerleave"
        };
    } else if (support.msPointers) {
        eventMap = {
            down: "MSPointerDown",
            move: "MSPointerMove",
            up: "MSPointerUp",
            cancel: "MSPointerCancel MSPointerLeave"
        };
    }

    if (support.msPointers && !("onmspointerenter" in window)) { // IE10
        // Create MSPointerEnter/MSPointerLeave events using mouseover/out and event-time checks
        $.each({
            MSPointerEnter: "MSPointerOver",
            MSPointerLeave: "MSPointerOut"
        }, function( orig, fix ) {
            $.event.special[ orig ] = {
                delegateType: fix,
                bindType: fix,

                handle: function( event ) {
                    var ret,
                        target = this,
                        related = event.relatedTarget,
                        handleObj = event.handleObj;

                    // For mousenter/leave call the handler if related is outside the target.
                    // NB: No relatedTarget if the mouse left/entered the browser window
                    if ( !related || (related !== target && !$.contains( target, related )) ) {
                        event.type = handleObj.origType;
                        ret = handleObj.handler.apply( this, arguments );
                        event.type = fix;
                    }
                    return ret;
                }
            };
        });
    }


    var getEventMap = function(e) { return (eventMap[e] || e); },
        eventRegEx = /([^ ]+)/g;

    kendo.applyEventMap = function(events, ns) {
        events = events.replace(eventRegEx, getEventMap);

        if (ns) {
            events = events.replace(eventRegEx, "$1." + ns);
        }

        return events;
    };

    var on = $.fn.on;

    function kendoJQuery(selector, context) {
        return new kendoJQuery.fn.init(selector, context);
    }

    extend(true, kendoJQuery, $);

    kendoJQuery.fn = kendoJQuery.prototype = new $();

    kendoJQuery.fn.constructor = kendoJQuery;

    kendoJQuery.fn.init = function(selector, context) {
        if (context && context instanceof $ && !(context instanceof kendoJQuery)) {
            context = kendoJQuery(context);
        }

        return $.fn.init.call(this, selector, context, rootjQuery);
    };

    kendoJQuery.fn.init.prototype = kendoJQuery.fn;

    var rootjQuery = kendoJQuery(document);

    extend(kendoJQuery.fn, {
        handler: function(handler) {
            this.data("handler", handler);
            return this;
        },

        autoApplyNS: function(ns) {
            this.data("kendoNS", ns || kendo.guid());
            return this;
        },

        on: function() {
            var that = this,
                ns = that.data("kendoNS");

            // support for event map signature
            if (arguments.length === 1) {
                return on.call(that, arguments[0]);
            }

            var context = that,
                args = slice.call(arguments);

            if (typeof args[args.length -1] === UNDEFINED) {
                args.pop();
            }

            var callback =  args[args.length - 1],
                events = kendo.applyEventMap(args[0], ns);

            // setup mouse trap
            if (support.mouseAndTouchPresent && events.search(/mouse|click/) > -1 && this[0] !== document.documentElement) {
                MouseEventNormalizer.setupMouseMute();

                var selector = args.length === 2 ? null : args[1],
                    bustClick = events.indexOf("click") > -1 && events.indexOf("touchend") > -1;

                on.call(this,
                    {
                        touchstart: MouseEventNormalizer.muteMouse,
                        touchend: MouseEventNormalizer.unMuteMouse
                    },
                    selector,
                    {
                        bustClick: bustClick
                    });
            }

            if (typeof callback === STRING) {
                context = that.data("handler");
                callback = context[callback];

                args[args.length - 1] = function(e) {
                    callback.call(context, e);
                };
            }

            args[0] = events;

            on.apply(that, args);

            return that;
        },

        kendoDestroy: function(ns) {
            ns = ns || this.data("kendoNS");

            if (ns) {
                this.off("." + ns);
            }

            return this;
        }
    });

    kendo.jQuery = kendoJQuery;
    kendo.eventMap = eventMap;

    kendo.timezone = (function(){
        var months =  { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        var days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

        function ruleToDate(year, rule) {
            var date;
            var targetDay;
            var ourDay;
            var month = rule[3];
            var on = rule[4];
            var time = rule[5];
            var cache = rule[8];

            if (!cache) {
                rule[8] = cache = {};
            }

            if (cache[year]) {
                return cache[year];
            }

            if (!isNaN(on)) {
                date = new Date(Date.UTC(year, months[month], on, time[0], time[1], time[2], 0));
            } else if (on.indexOf("last") === 0) {
                date = new Date(Date.UTC(year, months[month] + 1, 1, time[0] - 24, time[1], time[2], 0));

                targetDay = days[on.substr(4, 3)];
                ourDay = date.getUTCDay();

                date.setUTCDate(date.getUTCDate() + targetDay - ourDay - (targetDay > ourDay ? 7 : 0));
            } else if (on.indexOf(">=") >= 0) {
                date = new Date(Date.UTC(year, months[month], on.substr(5), time[0], time[1], time[2], 0));

                targetDay = days[on.substr(0, 3)];
                ourDay = date.getUTCDay();

                date.setUTCDate(date.getUTCDate() + targetDay - ourDay + (targetDay < ourDay ? 7 : 0));
            }

            return cache[year] = date;
        }

        function findRule(utcTime, rules, zone) {
            rules = rules[zone];

            if (!rules) {
                var time = zone.split(":");
                var offset = 0;

                if (time.length > 1) {
                    offset = time[0] * 60 + Number(time[1]);
                }

                return [-1000000, 'max', '-', 'Jan', 1, [0, 0, 0], offset, '-'];
            }

            var year = new Date(utcTime).getUTCFullYear();

            rules = jQuery.grep(rules, function(rule) {
                var from = rule[0];
                var to = rule[1];

                return from <= year && (to >= year || (from == year && to == "only") || to == "max");
            });

            rules.push(utcTime);

            rules.sort(function(a, b) {
                if (typeof a != "number") {
                    a = Number(ruleToDate(year, a));
                }

                if (typeof b != "number") {
                    b = Number(ruleToDate(year, b));
                }

                return a - b;
            });

            var rule = rules[jQuery.inArray(utcTime, rules) - 1] || rules[rules.length - 1];

            return isNaN(rule) ? rule : null;
        }

        function findZone(utcTime, zones, timezone) {
            var zoneRules = zones[timezone];

            if (typeof zoneRules === "string") {
                zoneRules = zones[zoneRules];
            }

            if (!zoneRules) {
                throw new Error('Timezone "' + timezone + '" is either incorrect, or kendo.timezones.min.js is not included.');
            }

            for (var idx = zoneRules.length - 1; idx >= 0; idx--) {
                var until = zoneRules[idx][3];

                if (until && utcTime > until) {
                    break;
                }
            }

            var zone = zoneRules[idx + 1];

            if (!zone) {
                throw new Error('Timezone "' + timezone + '" not found on ' + utcTime + ".");
            }

            return zone;
        }

        function zoneAndRule(utcTime, zones, rules, timezone) {
            if (typeof utcTime != NUMBER) {
                utcTime = Date.UTC(utcTime.getFullYear(), utcTime.getMonth(),
                    utcTime.getDate(), utcTime.getHours(), utcTime.getMinutes(),
                    utcTime.getSeconds(), utcTime.getMilliseconds());
            }

            var zone = findZone(utcTime, zones, timezone);

            return {
                zone: zone,
                rule: findRule(utcTime, rules, zone[1])
            };
        }

        function offset(utcTime, timezone) {
            if (timezone == "Etc/UTC" || timezone == "Etc/GMT") {
                return 0;
            }

            var info = zoneAndRule(utcTime, this.zones, this.rules, timezone);
            var zone = info.zone;
            var rule = info.rule;

            return kendo.parseFloat(rule? zone[0] - rule[6] : zone[0]);
        }

        function abbr(utcTime, timezone) {
            var info = zoneAndRule(utcTime, this.zones, this.rules, timezone);
            var zone = info.zone;
            var rule = info.rule;

            var base = zone[2];

            if (base.indexOf("/") >= 0) {
                return base.split("/")[rule && +rule[6] ? 1 : 0];
            } else if (base.indexOf("%s") >= 0) {
                return base.replace("%s", (!rule || rule[7] == "-") ? '' : rule[7]);
            }

            return base;
        }

        function convert(date, fromOffset, toOffset) {
            if (typeof fromOffset == STRING) {
                fromOffset = this.offset(date, fromOffset);
            }

            if (typeof toOffset == STRING) {
                toOffset = this.offset(date, toOffset);
            }

            var fromLocalOffset = date.getTimezoneOffset();

            date = new Date(date.getTime() + (fromOffset - toOffset) * 60000);

            var toLocalOffset = date.getTimezoneOffset();

            return new Date(date.getTime() + (toLocalOffset - fromLocalOffset) * 60000);
        }

        function apply(date, timezone) {
           return this.convert(date, date.getTimezoneOffset(), timezone);
        }

        function remove(date, timezone) {
           return this.convert(date, timezone, date.getTimezoneOffset());
        }

        function toLocalDate(time) {
            return this.apply(new Date(time), "Etc/UTC");
        }

        return {
           zones: {},
           rules: {},
           offset: offset,
           convert: convert,
           apply: apply,
           remove: remove,
           abbr: abbr,
           toLocalDate: toLocalDate
        };
    })();

    kendo.date = (function(){
        var MS_PER_MINUTE = 60000,
            MS_PER_DAY = 86400000;

        function adjustDST(date, hours) {
            if (hours === 0 && date.getHours() === 23) {
                date.setHours(date.getHours() + 2);
                return true;
            }

            return false;
        }

        function setDayOfWeek(date, day, dir) {
            var hours = date.getHours();

            dir = dir || 1;
            day = ((day - date.getDay()) + (7 * dir)) % 7;

            date.setDate(date.getDate() + day);
            adjustDST(date, hours);
        }

        function dayOfWeek(date, day, dir) {
            date = new Date(date);
            setDayOfWeek(date, day, dir);
            return date;
        }

        function firstDayOfMonth(date) {
            return new Date(
                date.getFullYear(),
                date.getMonth(),
                1
            );
        }

        function lastDayOfMonth(date) {
            var last = new Date(date.getFullYear(), date.getMonth() + 1, 0),
                first = firstDayOfMonth(date),
                timeOffset = Math.abs(last.getTimezoneOffset() - first.getTimezoneOffset());

            if (timeOffset) {
                last.setHours(first.getHours() + (timeOffset / 60));
            }

            return last;
        }

        function getDate(date) {
            date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
            adjustDST(date, 0);
            return date;
        }

        function toUtcTime(date) {
            return Date.UTC(date.getFullYear(), date.getMonth(),
                        date.getDate(), date.getHours(), date.getMinutes(),
                        date.getSeconds(), date.getMilliseconds());
        }

        function getMilliseconds(date) {
            return date.getTime() - getDate(date);
        }

        function isInTimeRange(value, min, max) {
            var msMin = getMilliseconds(min),
                msMax = getMilliseconds(max),
                msValue;

            if (!value || msMin == msMax) {
                return true;
            }

            if (min >= max) {
                max += MS_PER_DAY;
            }

            msValue = getMilliseconds(value);

            if (msMin > msValue) {
                msValue += MS_PER_DAY;
            }

            if (msMax < msMin) {
                msMax += MS_PER_DAY;
            }

            return msValue >= msMin && msValue <= msMax;
        }

        function isInDateRange(value, min, max) {
            var msMin = min.getTime(),
                msMax = max.getTime(),
                msValue;

            if (msMin >= msMax) {
                msMax += MS_PER_DAY;
            }

            msValue = value.getTime();

            return msValue >= msMin && msValue <= msMax;
        }

        function addDays(date, offset) {
            var hours = date.getHours();
                date = new Date(date);

            setTime(date, offset * MS_PER_DAY);
            adjustDST(date, hours);
            return date;
        }

        function setTime(date, milliseconds, ignoreDST) {
            var offset = date.getTimezoneOffset();
            var difference;

            date.setTime(date.getTime() + milliseconds);

            if (!ignoreDST) {
                difference = date.getTimezoneOffset() - offset;
                date.setTime(date.getTime() + difference * MS_PER_MINUTE);
            }
        }

        function today() {
            return getDate(new Date());
        }

        function isToday(date) {
           return getDate(date).getTime() == today().getTime();
        }

        function toInvariantTime(date) {
            var staticDate = new Date(1980, 1, 1, 0, 0, 0);

            if (date) {
                staticDate.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
            }

            return staticDate;
        }

        return {
            adjustDST: adjustDST,
            dayOfWeek: dayOfWeek,
            setDayOfWeek: setDayOfWeek,
            getDate: getDate,
            isInDateRange: isInDateRange,
            isInTimeRange: isInTimeRange,
            isToday: isToday,
            nextDay: function(date) {
                return addDays(date, 1);
            },
            previousDay: function(date) {
                return addDays(date, -1);
            },
            toUtcTime: toUtcTime,
            MS_PER_DAY: MS_PER_DAY,
            MS_PER_HOUR: 60 * MS_PER_MINUTE,
            MS_PER_MINUTE: MS_PER_MINUTE,
            setTime: setTime,
            addDays: addDays,
            today: today,
            toInvariantTime: toInvariantTime,
            firstDayOfMonth: firstDayOfMonth,
            lastDayOfMonth: lastDayOfMonth,
            getMilliseconds: getMilliseconds
            //TODO methods: combine date portion and time portion from arguments - date1, date 2
        };
    })();


    kendo.stripWhitespace = function(element) {
        if (document.createNodeIterator) {
            var iterator = document.createNodeIterator(element, NodeFilter.SHOW_TEXT, function(node) {
                    return node.parentNode == element ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                }, false);

            while (iterator.nextNode()) {
                if (iterator.referenceNode && !iterator.referenceNode.textContent.trim()) {
                    iterator.referenceNode.parentNode.removeChild(iterator.referenceNode);
                }
            }
        } else { // IE7/8 support
            for (var i = 0; i < element.childNodes.length; i++) {
                var child = element.childNodes[i];

                if (child.nodeType == 3 && !/\S/.test(child.nodeValue)) {
                    element.removeChild(child);
                    i--;
                }

                if (child.nodeType == 1) {
                    kendo.stripWhitespace(child);
                }
            }
        }
    };

    var animationFrame  = window.requestAnimationFrame       ||
                          window.webkitRequestAnimationFrame ||
                          window.mozRequestAnimationFrame    ||
                          window.oRequestAnimationFrame      ||
                          window.msRequestAnimationFrame     ||
                          function(callback){ setTimeout(callback, 1000 / 60); };

    kendo.animationFrame = function(callback) {
        animationFrame.call(window, callback);
    };

    var animationQueue = [];

    kendo.queueAnimation = function(callback) {
        animationQueue[animationQueue.length] = callback;
        if (animationQueue.length === 1) {
            kendo.runNextAnimation();
        }
    };

    kendo.runNextAnimation = function() {
        kendo.animationFrame(function() {
            if (animationQueue[0]) {
                animationQueue.shift()();
                if (animationQueue[0]) {
                    kendo.runNextAnimation();
                }
            }
        });
    };

    kendo.parseQueryStringParams = function(url) {
        var queryString = url.split('?')[1] || "",
            params = {},
            paramParts = queryString.split(/&|=/),
            length = paramParts.length,
            idx = 0;

        for (; idx < length; idx += 2) {
            if(paramParts[idx] !== "") {
                params[decodeURIComponent(paramParts[idx])] = decodeURIComponent(paramParts[idx + 1]);
            }
        }

        return params;
    };

    kendo.elementUnderCursor = function(e) {
        if (typeof e.x.client != "undefined") {
            return document.elementFromPoint(e.x.client, e.y.client);
        }
    };

    kendo.wheelDeltaY = function(jQueryEvent) {
        var e = jQueryEvent.originalEvent,
            deltaY = e.wheelDeltaY,
            delta;

            if (e.wheelDelta) { // Webkit and IE
                if (deltaY === undefined || deltaY) { // IE does not have deltaY, thus always scroll (horizontal scrolling is treated as vertical)
                    delta = e.wheelDelta;
                }
            } else if (e.detail && e.axis === e.VERTICAL_AXIS) { // Firefox and Opera
                delta = (-e.detail) * 10;
            }

        return delta;
    };

    kendo.throttle = function(fn, delay) {
        var timeout;
        var lastExecTime = 0;

        if (!delay || delay <= 0) {
            return fn;
        }

        var throttled = function() {
            var that = this;
            var elapsed = +new Date() - lastExecTime;
            var args = arguments;

            function exec() {
                fn.apply(that, args);
                lastExecTime = +new Date();
            }

            // first execution
            if (!lastExecTime) {
                return exec();
            }

            if (timeout) {
                clearTimeout(timeout);
            }

            if (elapsed > delay) {
                exec();
            } else {
                timeout = setTimeout(exec, delay - elapsed);
            }
        };

        throttled.cancel = function() {
            clearTimeout(timeout);
        };

        return throttled;
    };


    kendo.caret = function (element, start, end) {
        var rangeElement;
        var isPosition = start !== undefined;

        if (end === undefined) {
            end = start;
        }

        if (element[0]) {
            element = element[0];
        }

        if (isPosition && element.disabled) {
            return;
        }

        try {
            if (element.selectionStart !== undefined) {
                if (isPosition) {
                    element.focus();
                    element.setSelectionRange(start, end);
                } else {
                    start = [element.selectionStart, element.selectionEnd];
                }
            } else if (document.selection) {
                if ($(element).is(":visible")) {
                    element.focus();
                }

                rangeElement = element.createTextRange();

                if (isPosition) {
                    rangeElement.collapse(true);
                    rangeElement.moveStart("character", start);
                    rangeElement.moveEnd("character", end - start);
                    rangeElement.select();
                } else {
                    var rangeDuplicated = rangeElement.duplicate(),
                        selectionStart, selectionEnd;

                        rangeElement.moveToBookmark(document.selection.createRange().getBookmark());
                        rangeDuplicated.setEndPoint('EndToStart', rangeElement);
                        selectionStart = rangeDuplicated.text.length;
                        selectionEnd = selectionStart + rangeElement.text.length;

                    start = [selectionStart, selectionEnd];
                }
            }
        } catch(e) {
            /* element is not focused or it is not in the DOM */
            start = [];
        }

        return start;
    };

    kendo.compileMobileDirective = function(element, scope) {
        var angular = window.angular;

        element.attr("data-" + kendo.ns + "role", element[0].tagName.toLowerCase().replace('kendo-mobile-', '').replace('-', ''));

        angular.element(element).injector().invoke(["$compile", function($compile) {
            $compile(element)(scope);

            if (!/^\$(digest|apply)$/.test(scope.$$phase)) {
                scope.$digest();
            }
        }]);

        return kendo.widgetInstance(element, kendo.mobile.ui);
    };

    kendo.antiForgeryTokens = function() {
        var tokens = { },
            csrf_token = $("meta[name=csrf-token],meta[name=_csrf]").attr("content"),
            csrf_param = $("meta[name=csrf-param],meta[name=_csrf_header]").attr("content");

        $("input[name^='__RequestVerificationToken']").each(function() {
            tokens[this.name] = this.value;
        });

        if (csrf_param !== undefined && csrf_token !== undefined) {
          tokens[csrf_param] = csrf_token;
        }

        return tokens;
    };

    kendo.cycleForm = function(form) {
        var firstElement = form.find("input, .k-widget").first();
        var lastElement = form.find("button, .k-button").last();

        function focus(el) {
            var widget = kendo.widgetInstance(el);

            if (widget && widget.focus) {
              widget.focus();
            } else {
              el.focus();
            }
        }

        lastElement.on("keydown", function(e) {
          if (e.keyCode == kendo.keys.TAB && !e.shiftKey) {
            e.preventDefault();
            focus(firstElement);
          }
        });

        firstElement.on("keydown", function(e) {
          if (e.keyCode == kendo.keys.TAB && e.shiftKey) {
            e.preventDefault();
            focus(lastElement);
          }
        });
    };

    // kendo.saveAs -----------------------------------------------
    (function() {
        function postToProxy(dataURI, fileName, proxyURL, proxyTarget) {
            var form = $("<form>").attr({
                action: proxyURL,
                method: "POST",
                target: proxyTarget
            });

            var data = kendo.antiForgeryTokens();
            data.fileName = fileName;

            var parts = dataURI.split(";base64,");
            data.contentType = parts[0].replace("data:", "");
            data.base64 = parts[1];

            for (var name in data) {
                if (data.hasOwnProperty(name)) {
                    $('<input>').attr({
                        value: data[name],
                        name: name,
                        type: "hidden"
                    }).appendTo(form);
                }
            }

            form.appendTo("body").submit().remove();
        }

        var fileSaver = document.createElement("a");
        var downloadAttribute = "download" in fileSaver;

        function saveAsBlob(dataURI, fileName) {
            var blob = dataURI; // could be a Blob object

            if (typeof dataURI == "string") {
                var parts = dataURI.split(";base64,");
                var contentType = parts[0];
                var base64 = atob(parts[1]);
                var array = new Uint8Array(base64.length);

                for (var idx = 0; idx < base64.length; idx++) {
                    array[idx] = base64.charCodeAt(idx);
                }
                blob = new Blob([array.buffer], { type: contentType });
            }

            navigator.msSaveBlob(blob, fileName);
        }

        function saveAsDataURI(dataURI, fileName) {
            if (window.Blob && dataURI instanceof Blob) {
                dataURI = URL.createObjectURL(dataURI);
            }

            fileSaver.download = fileName;
            fileSaver.href = dataURI;

            var e = document.createEvent("MouseEvents");
            e.initMouseEvent("click", true, false, window,
                0, 0, 0, 0, 0, false, false, false, false, 0, null);

            fileSaver.dispatchEvent(e);
        }

        kendo.saveAs = function(options) {
            var save = postToProxy;

            if (!options.forceProxy) {
                if (downloadAttribute) {
                    save = saveAsDataURI;
                } else if (navigator.msSaveBlob) {
                    save = saveAsBlob;
                }
            }

            save(options.dataURI, options.fileName, options.proxyURL, options.proxyTarget);
        };
    })();
})(jQuery, window);





(function($, undefined) {
    var kendo = window.kendo,
        extend = $.extend,
        odataFilters = {
            eq: "eq",
            neq: "ne",
            gt: "gt",
            gte: "ge",
            lt: "lt",
            lte: "le",
            contains : "substringof",
            doesnotcontain: "substringof",
            endswith: "endswith",
            startswith: "startswith"
        },
        odataFiltersVersionFour = extend({}, odataFilters, {
            contains: "contains"
        }),
        mappers = {
            pageSize: $.noop,
            page: $.noop,
            filter: function(params, filter, useVersionFour) {
                if (filter) {
                    filter = toOdataFilter(filter, useVersionFour);
                    if (filter) {
                        params.$filter = filter;
                    }
                }
            },
            sort: function(params, orderby) {
                var expr = $.map(orderby, function(value) {
                    var order = value.field.replace(/\./g, "/");

                    if (value.dir === "desc") {
                        order += " desc";
                    }

                    return order;
                }).join(",");

                if (expr) {
                    params.$orderby = expr;
                }
            },
            skip: function(params, skip) {
                if (skip) {
                    params.$skip = skip;
                }
            },
            take: function(params, take) {
                if (take) {
                    params.$top = take;
                }
            }
        },
        defaultDataType = {
            read: {
                dataType: "jsonp"
            }
        };

    function toOdataFilter(filter, useOdataFour) {
        var result = [],
            logic = filter.logic || "and",
            idx,
            length,
            field,
            type,
            format,
            operator,
            value,
            ignoreCase,
            filters = filter.filters;

        for (idx = 0, length = filters.length; idx < length; idx++) {
            filter = filters[idx];
            field = filter.field;
            value = filter.value;
            operator = filter.operator;

            if (filter.filters) {
                filter = toOdataFilter(filter, useOdataFour);
            } else {
                ignoreCase = filter.ignoreCase;
                field = field.replace(/\./g, "/");
                filter = odataFilters[operator];
                if (useOdataFour) {
                    filter = odataFiltersVersionFour[operator];
                }

                if (filter && value !== undefined) {
                    type = $.type(value);
                    if (type === "string") {
                        format = "'{1}'";
                        value = value.replace(/'/g, "''");

                        if (ignoreCase === true) {
                            field = "tolower(" + field + ")";
                        }

                    } else if (type === "date") {
                        if (useOdataFour) {
                            format = "{1:yyyy-MM-ddTHH:mm:ss+00:00}";
                        } else {
                            format = "datetime'{1:yyyy-MM-ddTHH:mm:ss}'";
                        }
                    } else {
                        format = "{1}";
                    }

                    if (filter.length > 3) {
                        if (filter !== "substringof") {
                            format = "{0}({2}," + format + ")";
                        } else {
                            format = "{0}(" + format + ",{2})";
                            if (operator === "doesnotcontain") {
                                if (useOdataFour) {
                                    format = "{0}({2},'{1}') eq -1";
                                    filter = "indexof";
                                } else {
                                    format += " eq false";
                                }
                            }
                        }
                    } else {
                        format = "{2} {0} " + format;
                    }

                    filter = kendo.format(format, filter, value, field);
                }
            }

            result.push(filter);
        }

        filter = result.join(" " + logic + " ");

        if (result.length > 1) {
            filter = "(" + filter + ")";
        }

        return filter;
    }

    function stripMetadata(obj) {
        for (var name in obj) {
            if(name.indexOf("@odata") === 0) {
                delete obj[name];
            }
        }
    }

    extend(true, kendo.data, {
        schemas: {
            odata: {
                type: "json",
                data: function(data) {
                    return data.d.results || [data.d];
                },
                total: "d.__count"
            }
        },
        transports: {
            odata: {
                read: {
                    cache: true, // to prevent jQuery from adding cache buster
                    dataType: "jsonp",
                    jsonp: "$callback"
                },
                update: {
                    cache: true,
                    dataType: "json",
                    contentType: "application/json", // to inform the server the the request body is JSON encoded
                    type: "PUT" // can be PUT or MERGE
                },
                create: {
                    cache: true,
                    dataType: "json",
                    contentType: "application/json",
                    type: "POST" // must be POST to create new entity
                },
                destroy: {
                    cache: true,
                    dataType: "json",
                    type: "DELETE"
                },
                parameterMap: function(options, type, useVersionFour) {
                    var params,
                        value,
                        option,
                        dataType;

                    options = options || {};
                    type = type || "read";
                    dataType = (this.options || defaultDataType)[type];
                    dataType = dataType ? dataType.dataType : "json";

                    if (type === "read") {
                        params = {
                            $inlinecount: "allpages"
                        };

                        if (dataType != "json") {
                            params.$format = "json";
                        }

                        for (option in options) {
                            if (mappers[option]) {
                                mappers[option](params, options[option], useVersionFour);
                            } else {
                                params[option] = options[option];
                            }
                        }
                    } else {
                        if (dataType !== "json") {
                            throw new Error("Only json dataType can be used for " + type + " operation.");
                        }

                        if (type !== "destroy") {
                            for (option in options) {
                                value = options[option];
                                if (typeof value === "number") {
                                    options[option] = value + "";
                                }
                            }

                            params = kendo.stringify(options);
                        }
                    }

                    return params;
                }
            }
        }
    });

    extend(true, kendo.data, {
        schemas: {
            "odata-v4": {
                type: "json",
                data: function(data) {
                    data = $.extend({}, data);
                    stripMetadata(data);

                    if (data.value) {
                        return data.value;
                    }
                    return [data];
                },
                total: function(data) {
                    return data["@odata.count"];
                }
            }
        },
        transports: {
            "odata-v4": {
                read: {
                    cache: true, // to prevent jQuery from adding cache buster
                    dataType: "json"
                },
                update: {
                    cache: true,
                    dataType: "json",
                    contentType: "application/json;IEEE754Compatible=true", // to inform the server the the request body is JSON encoded
                    type: "PUT" // can be PUT or MERGE
                },
                create: {
                    cache: true,
                    dataType: "json",
                    contentType: "application/json;IEEE754Compatible=true",
                    type: "POST" // must be POST to create new entity
                },
                destroy: {
                    cache: true,
                    dataType: "json",
                    type: "DELETE"
                },
                parameterMap: function(options, type) {
                    var result = kendo.data.transports.odata.parameterMap(options, type, true);
                    if (type == "read") {
                        result.$count = true;
                        delete result.$inlinecount;
                    }

                    return result;
                }
            }
        }
    });

})(window.kendo.jQuery);





/*jshint  eqnull: true, boss: true */
(function($, undefined) {
    var kendo = window.kendo,
        isArray = $.isArray,
        isPlainObject = $.isPlainObject,
        map = $.map,
        each = $.each,
        extend = $.extend,
        getter = kendo.getter,
        Class = kendo.Class;

    var XmlDataReader = Class.extend({
        init: function(options) {
            var that = this,
                total = options.total,
                model = options.model,
                parse = options.parse,
                errors = options.errors,
                serialize = options.serialize,
                data = options.data;

            if (model) {
                if (isPlainObject(model)) {
                    var base = options.modelBase || kendo.data.Model;

                    if (model.fields) {
                        each(model.fields, function(field, value) {
                            if (isPlainObject(value) && value.field) {
                                if (!$.isFunction(value.field)) {
                                    value = extend(value, { field: that.getter(value.field) });
                                }
                            } else {
                                value = { field: that.getter(value) };
                            }
                            model.fields[field] = value;
                        });
                    }

                    var id = model.id;
                    if (id) {
                        var idField = {};

                        idField[that.xpathToMember(id, true)] = { field : that.getter(id) };
                        model.fields = extend(idField, model.fields);
                        model.id = that.xpathToMember(id);
                    }
                    model = base.define(model);
                }

                that.model = model;
            }

            if (total) {
                if (typeof total == "string") {
                    total = that.getter(total);
                    that.total = function(data) {
                        return parseInt(total(data), 10);
                    };
                } else if (typeof total == "function"){
                    that.total = total;
                }
            }

            if (errors) {
                if (typeof errors == "string") {
                    errors = that.getter(errors);
                    that.errors = function(data) {
                        return errors(data) || null;
                    };
                } else if (typeof errors == "function"){
                    that.errors = errors;
                }
            }

            if (data) {
                if (typeof data == "string") {
                    data = that.xpathToMember(data);
                    that.data = function(value) {
                        var result = that.evaluate(value, data),
                            modelInstance;

                        result = isArray(result) ? result : [result];

                        if (that.model && model.fields) {
                            modelInstance = new that.model();

                            return map(result, function(value) {
                                if (value) {
                                    var record = {}, field;

                                    for (field in model.fields) {
                                        record[field] = modelInstance._parse(field, model.fields[field].field(value));
                                    }

                                    return record;
                                }
                            });
                        }

                        return result;
                    };
                } else if (typeof data == "function") {
                    that.data = data;
                }
            }

            if (typeof parse == "function") {
                var xmlParse = that.parse;

                that.parse = function(data) {
                    var xml = parse.call(that, data);
                    return xmlParse.call(that, xml);
                };
            }

            if (typeof serialize == "function") {
                that.serialize = serialize;
            }
        },
        total: function(result) {
            return this.data(result).length;
        },
        errors: function(data) {
            return data ? data.errors : null;
        },
        serialize: function(data) {
            return data;
        },
        parseDOM: function(element) {
            var result = {},
                parsedNode,
                node,
                nodeType,
                nodeName,
                member,
                attribute,
                attributes = element.attributes,
                attributeCount = attributes.length,
                idx;

            for (idx = 0; idx < attributeCount; idx++) {
                attribute = attributes[idx];
                result["@" + attribute.nodeName] = attribute.nodeValue;
            }

            for (node = element.firstChild; node; node = node.nextSibling) {
                nodeType = node.nodeType;

                if (nodeType === 3 || nodeType === 4) {
                    // text nodes or CDATA are stored as #text field
                    result["#text"] = node.nodeValue;
                } else if (nodeType === 1) {
                    // elements are stored as fields
                    parsedNode = this.parseDOM(node);

                    nodeName = node.nodeName;

                    member = result[nodeName];

                    if (isArray(member)) {
                        // elements of same nodeName are stored as array
                        member.push(parsedNode);
                    } else if (member !== undefined) {
                        member = [member, parsedNode];
                    } else {
                        member = parsedNode;
                    }

                    result[nodeName] = member;
                }
            }
            return result;
        },

        evaluate: function(value, expression) {
            var members = expression.split("."),
                member,
                result,
                length,
                intermediateResult,
                idx;

            while (member = members.shift()) {
                value = value[member];

                if (isArray(value)) {
                    result = [];
                    expression = members.join(".");

                    for (idx = 0, length = value.length; idx < length; idx++) {
                        intermediateResult = this.evaluate(value[idx], expression);

                        intermediateResult = isArray(intermediateResult) ? intermediateResult : [intermediateResult];

                        result.push.apply(result, intermediateResult);
                    }

                    return result;
                }
            }

            return value;
        },

        parse: function(xml) {
            var documentElement,
                tree,
                result = {};

            documentElement = xml.documentElement || $.parseXML(xml).documentElement;

            tree = this.parseDOM(documentElement);

            result[documentElement.nodeName] = tree;

            return result;
        },

        xpathToMember: function(member, raw) {
            if (!member) {
                return "";
            }

            member = member.replace(/^\//, "") // remove the first "/"
                           .replace(/\//g, "."); // replace all "/" with "."

            if (member.indexOf("@") >= 0) {
                // replace @attribute with '["@attribute"]'
                return member.replace(/\.?(@.*)/, raw? '$1':'["$1"]');
            }

            if (member.indexOf("text()") >= 0) {
                // replace ".text()" with '["#text"]'
                return member.replace(/(\.?text\(\))/, raw? '#text':'["#text"]');
            }

            return member;
        },
        getter: function(member) {
            return getter(this.xpathToMember(member), true);
        }
    });

    $.extend(true, kendo.data, {
        XmlDataReader: XmlDataReader,
        readers: {
            xml: XmlDataReader
        }
    });
})(window.kendo.jQuery);





/*jshint eqnull: true, loopfunc: true, evil: true */
(function($, undefined) {
    var extend = $.extend,
        proxy = $.proxy,
        isPlainObject = $.isPlainObject,
        isEmptyObject = $.isEmptyObject,
        isArray = $.isArray,
        grep = $.grep,
        ajax = $.ajax,
        map,
        each = $.each,
        noop = $.noop,
        kendo = window.kendo,
        isFunction = kendo.isFunction,
        Observable = kendo.Observable,
        Class = kendo.Class,
        STRING = "string",
        FUNCTION = "function",
        CREATE = "create",
        READ = "read",
        UPDATE = "update",
        DESTROY = "destroy",
        CHANGE = "change",
        SYNC = "sync",
        GET = "get",
        ERROR = "error",
        REQUESTSTART = "requestStart",
        PROGRESS = "progress",
        REQUESTEND = "requestEnd",
        crud = [CREATE, READ, UPDATE, DESTROY],
        identity = function(o) { return o; },
        getter = kendo.getter,
        stringify = kendo.stringify,
        math = Math,
        push = [].push,
        join = [].join,
        pop = [].pop,
        splice = [].splice,
        shift = [].shift,
        slice = [].slice,
        unshift = [].unshift,
        toString = {}.toString,
        stableSort = kendo.support.stableSort,
        dateRegExp = /^\/Date\((.*?)\)\/$/,
        newLineRegExp = /(\r+|\n+)/g,
        quoteRegExp = /(?=['\\])/g;

    var ObservableArray = Observable.extend({
        init: function(array, type) {
            var that = this;

            that.type = type || ObservableObject;

            Observable.fn.init.call(that);

            that.length = array.length;

            that.wrapAll(array, that);
        },

        at: function(index) {
            return this[index];
        },

        toJSON: function() {
            var idx, length = this.length, value, json = new Array(length);

            for (idx = 0; idx < length; idx++){
                value = this[idx];

                if (value instanceof ObservableObject) {
                    value = value.toJSON();
                }

                json[idx] = value;
            }

            return json;
        },

        parent: noop,

        wrapAll: function(source, target) {
            var that = this,
                idx,
                length,
                parent = function() {
                    return that;
                };

            target = target || [];

            for (idx = 0, length = source.length; idx < length; idx++) {
                target[idx] = that.wrap(source[idx], parent);
            }

            return target;
        },

        wrap: function(object, parent) {
            var that = this,
                observable;

            if (object !== null && toString.call(object) === "[object Object]") {
                observable = object instanceof that.type || object instanceof Model;

                if (!observable) {
                    object = object instanceof ObservableObject ? object.toJSON() : object;
                    object = new that.type(object);
                }

                object.parent = parent;

                object.bind(CHANGE, function(e) {
                    that.trigger(CHANGE, {
                        field: e.field,
                        node: e.node,
                        index: e.index,
                        items: e.items || [this],
                        action: e.node ? (e.action || "itemloaded") : "itemchange"
                    });
                });
            }

            return object;
        },

        push: function() {
            var index = this.length,
                items = this.wrapAll(arguments),
                result;

            result = push.apply(this, items);

            this.trigger(CHANGE, {
                action: "add",
                index: index,
                items: items
            });

            return result;
        },

        slice: slice,

        sort: [].sort,

        join: join,

        pop: function() {
            var length = this.length, result = pop.apply(this);

            if (length) {
                this.trigger(CHANGE, {
                    action: "remove",
                    index: length - 1,
                    items:[result]
                });
            }

            return result;
        },

        splice: function(index, howMany, item) {
            var items = this.wrapAll(slice.call(arguments, 2)),
                result, i, len;

            result = splice.apply(this, [index, howMany].concat(items));

            if (result.length) {
                this.trigger(CHANGE, {
                    action: "remove",
                    index: index,
                    items: result
                });

                for (i = 0, len = result.length; i < len; i++) {
                    if (result[i] && result[i].children) {
                        result[i].unbind(CHANGE);
                    }
                }
            }

            if (item) {
                this.trigger(CHANGE, {
                    action: "add",
                    index: index,
                    items: items
                });
            }
            return result;
        },

        shift: function() {
            var length = this.length, result = shift.apply(this);

            if (length) {
                this.trigger(CHANGE, {
                    action: "remove",
                    index: 0,
                    items:[result]
                });
            }

            return result;
        },

        unshift: function() {
            var items = this.wrapAll(arguments),
                result;

            result = unshift.apply(this, items);

            this.trigger(CHANGE, {
                action: "add",
                index: 0,
                items: items
            });

            return result;
        },

        indexOf: function(item) {
            var that = this,
                idx,
                length;

            for (idx = 0, length = that.length; idx < length; idx++) {
                if (that[idx] === item) {
                    return idx;
                }
            }
            return -1;
        },

        forEach: function(callback) {
            var idx = 0,
                length = this.length;

            for (; idx < length; idx++) {
                callback(this[idx], idx, this);
            }
        },

        map: function(callback) {
            var idx = 0,
                result = [],
                length = this.length;

            for (; idx < length; idx++) {
                result[idx] = callback(this[idx], idx, this);
            }

            return result;
        },

        reduce: function(callback, initialValue) {
            var idx = 0,
                result,
                length = this.length;

            if (arguments.length == 2) {
                result = arguments[1];
            } else if (idx < length) {
                result = this[idx++];
            }

            for (; idx < length; idx++) {
                result = callback(result, this[idx], idx, this);
            }

            return result;
        },

        reduceRight: function(callback, initialValue) {
            var idx = this.length - 1,
                result;

            if (arguments.length == 2) {
                result = arguments[1];
            } else if (idx > 0) {
                result = this[idx--];
            }

            for (; idx >= 0; idx--) {
                result = callback(result, this[idx], idx, this);
            }

            return result;
        },

        filter: function(callback) {
            var idx = 0,
                result = [],
                item,
                length = this.length;

            for (; idx < length; idx++) {
                item = this[idx];
                if (callback(item, idx, this)) {
                    result[result.length] = item;
                }
            }

            return result;
        },

        find: function(callback) {
            var idx = 0,
                item,
                length = this.length;

            for (; idx < length; idx++) {
                item = this[idx];
                if (callback(item, idx, this)) {
                    return item;
                }
            }
        },

        every: function(callback) {
            var idx = 0,
                item,
                length = this.length;

            for (; idx < length; idx++) {
                item = this[idx];
                if (!callback(item, idx, this)) {
                    return false;
                }
            }

            return true;
        },

        some: function(callback) {
            var idx = 0,
                item,
                length = this.length;

            for (; idx < length; idx++) {
                item = this[idx];
                if (callback(item, idx, this)) {
                    return true;
                }
            }

            return false;
        },

        // non-standard collection methods
        remove: function(item) {
            var idx = this.indexOf(item);

            if (idx !== -1) {
                this.splice(idx, 1);
            }
        },

        empty: function() {
            this.splice(0, this.length);
        }
    });

    var LazyObservableArray = ObservableArray.extend({
        init: function(data, type) {
            Observable.fn.init.call(this);

            this.type = type || ObservableObject;

            for (var idx = 0; idx < data.length; idx++) {
                this[idx] = data[idx];
            }

            this.length = idx;
            this._parent = proxy(function() { return this; }, this);
        },
        at: function(index) {
            var item = this[index];

            if (!(item instanceof this.type)) {
                item = this[index] = this.wrap(item, this._parent);
            } else {
                item.parent = this._parent;
            }

            return item;
        }
    });

    function eventHandler(context, type, field, prefix) {
        return function(e) {
            var event = {}, key;

            for (key in e) {
                event[key] = e[key];
            }

            if (prefix) {
                event.field = field + "." + e.field;
            } else {
                event.field = field;
            }

            if (type == CHANGE && context._notifyChange) {
                context._notifyChange(event);
            }

            context.trigger(type, event);
        };
    }

    var ObservableObject = Observable.extend({
        init: function(value) {
            var that = this,
                member,
                field,
                parent = function() {
                    return that;
                };

            Observable.fn.init.call(this);

            for (field in value) {
                member = value[field];

                if (typeof member === "object" && member && !member.getTime && field.charAt(0) != "_") {
                    member = that.wrap(member, field, parent);
                }

                that[field] = member;
            }

            that.uid = kendo.guid();
        },

        shouldSerialize: function(field) {
            return this.hasOwnProperty(field) && field !== "_events" && typeof this[field] !== FUNCTION && field !== "uid";
        },

        forEach: function(f) {
            for (var i in this) {
                if (this.shouldSerialize(i)) {
                    f(this[i], i);
                }
            }
        },

        toJSON: function() {
            var result = {}, value, field;

            for (field in this) {
                if (this.shouldSerialize(field)) {
                    value = this[field];

                    if (value instanceof ObservableObject || value instanceof ObservableArray) {
                        value = value.toJSON();
                    }

                    result[field] = value;
                }
            }

            return result;
        },

        get: function(field) {
            var that = this, result;

            that.trigger(GET, { field: field });

            if (field === "this") {
                result = that;
            } else {
                result = kendo.getter(field, true)(that);
            }

            return result;
        },

        _set: function(field, value) {
            var that = this;
            var composite = field.indexOf(".") >= 0;

            if (composite) {
                var paths = field.split("."),
                    path = "";

                while (paths.length > 1) {
                    path += paths.shift();
                    var obj = kendo.getter(path, true)(that);
                    if (obj instanceof ObservableObject) {
                        obj.set(paths.join("."), value);
                        return composite;
                    }
                    path += ".";
                }
            }

            kendo.setter(field)(that, value);

            return composite;
        },

        set: function(field, value) {
            var that = this,
                composite = field.indexOf(".") >= 0,
                current = kendo.getter(field, true)(that);

            if (current !== value) {

                if (!that.trigger("set", { field: field, value: value })) {
                    if (!composite) {
                        value = that.wrap(value, field, function() { return that; });
                    }
                    if (!that._set(field, value) || field.indexOf("(") >= 0 || field.indexOf("[") >= 0) {
                        that.trigger(CHANGE, { field: field });
                    }
                }
            }
        },

        parent: noop,

        wrap: function(object, field, parent) {
            var that = this,
                type = toString.call(object);

            if (object != null && (type === "[object Object]" || type === "[object Array]")) {
                var isObservableArray = object instanceof ObservableArray;
                var isDataSource = object instanceof DataSource;

                if (type === "[object Object]" && !isDataSource && !isObservableArray) {
                    if (!(object instanceof ObservableObject)) {
                        object = new ObservableObject(object);
                    }

                    if (object.parent() != parent()) {
                        object.bind(GET, eventHandler(that, GET, field, true));
                        object.bind(CHANGE, eventHandler(that, CHANGE, field, true));
                    }
                } else if (type === "[object Array]" || isObservableArray || isDataSource) {
                    if (!isObservableArray && !isDataSource) {
                        object = new ObservableArray(object);
                    }

                    if (object.parent() != parent()) {
                        object.bind(CHANGE, eventHandler(that, CHANGE, field, false));
                    }
                }

                object.parent = parent;
            }

            return object;
        }
    });

    function equal(x, y) {
        if (x === y) {
            return true;
        }

        var xtype = $.type(x), ytype = $.type(y), field;

        if (xtype !== ytype) {
            return false;
        }

        if (xtype === "date") {
            return x.getTime() === y.getTime();
        }

        if (xtype !== "object" && xtype !== "array") {
            return false;
        }

        for (field in x) {
            if (!equal(x[field], y[field])) {
                return false;
            }
        }

        return true;
    }

    var parsers = {
        "number": function(value) {
            return kendo.parseFloat(value);
        },

        "date": function(value) {
            return kendo.parseDate(value);
        },

        "boolean": function(value) {
            if (typeof value === STRING) {
                return value.toLowerCase() === "true";
            }
            return value != null ? !!value : value;
        },

        "string": function(value) {
            return value != null ? (value + "") : value;
        },

        "default": function(value) {
            return value;
        }
    };

    var defaultValues = {
        "string": "",
        "number": 0,
        "date": new Date(),
        "boolean": false,
        "default": ""
    };

    function getFieldByName(obj, name) {
        var field,
            fieldName;

        for (fieldName in obj) {
            field = obj[fieldName];
            if (isPlainObject(field) && field.field && field.field === name) {
                return field;
            } else if (field === name) {
                return field;
            }
        }
        return null;
    }

    var Model = ObservableObject.extend({
        init: function(data) {
            var that = this;

            if (!data || $.isEmptyObject(data)) {
                data = $.extend({}, that.defaults, data);

                if (that._initializers) {
                    for (var idx = 0; idx < that._initializers.length; idx++) {
                         var name = that._initializers[idx];
                         data[name] = that.defaults[name]();
                    }
                }
            }

            ObservableObject.fn.init.call(that, data);

            that.dirty = false;

            if (that.idField) {
                that.id = that.get(that.idField);

                if (that.id === undefined) {
                    that.id = that._defaultId;
                }
            }
        },

        shouldSerialize: function(field) {
            return ObservableObject.fn.shouldSerialize.call(this, field) && field !== "uid" && !(this.idField !== "id" && field === "id") && field !== "dirty" && field !== "_accessors";
        },

        _parse: function(field, value) {
            var that = this,
                fieldName = field,
                fields = (that.fields || {}),
                parse;

            field = fields[field];
            if (!field) {
                field = getFieldByName(fields, fieldName);
            }
            if (field) {
                parse = field.parse;
                if (!parse && field.type) {
                    parse = parsers[field.type.toLowerCase()];
                }
            }

            return parse ? parse(value) : value;
        },

        _notifyChange: function(e) {
            var action = e.action;

            if (action == "add" || action == "remove") {
                this.dirty = true;
            }
        },

        editable: function(field) {
            field = (this.fields || {})[field];
            return field ? field.editable !== false : true;
        },

        set: function(field, value, initiator) {
            var that = this;

            if (that.editable(field)) {
                value = that._parse(field, value);

                if (!equal(value, that.get(field))) {
                    that.dirty = true;
                    ObservableObject.fn.set.call(that, field, value, initiator);
                }
            }
        },

        accept: function(data) {
            var that = this,
                parent = function() { return that; },
                field;

            for (field in data) {
                var value = data[field];

                if (field.charAt(0) != "_") {
                    value = that.wrap(data[field], field, parent);
                }

                that._set(field, value);
            }

            if (that.idField) {
                that.id = that.get(that.idField);
            }

            that.dirty = false;
        },

        isNew: function() {
            return this.id === this._defaultId;
        }
    });

    Model.define = function(base, options) {
        if (options === undefined) {
            options = base;
            base = Model;
        }

        var model,
            proto = extend({ defaults: {} }, options),
            name,
            field,
            type,
            value,
            idx,
            length,
            fields = {},
            originalName,
            id = proto.id,
            functionFields = [];

        if (id) {
            proto.idField = id;
        }

        if (proto.id) {
            delete proto.id;
        }

        if (id) {
            proto.defaults[id] = proto._defaultId = "";
        }

        if (toString.call(proto.fields) === "[object Array]") {
            for (idx = 0, length = proto.fields.length; idx < length; idx++) {
                field = proto.fields[idx];
                if (typeof field === STRING) {
                    fields[field] = {};
                } else if (field.field) {
                    fields[field.field] = field;
                }
            }
            proto.fields = fields;
        }

        for (name in proto.fields) {
            field = proto.fields[name];
            type = field.type || "default";
            value = null;
            originalName = name;

            name = typeof (field.field) === STRING ? field.field : name;

            if (!field.nullable) {
                value = proto.defaults[originalName !== name ? originalName : name] = field.defaultValue !== undefined ? field.defaultValue : defaultValues[type.toLowerCase()];

                if (typeof value === "function") {
                    functionFields.push(name);
                }
            }

            if (options.id === name) {
                proto._defaultId = value;
            }

            proto.defaults[originalName !== name ? originalName : name] = value;

            field.parse = field.parse || parsers[type];
        }

        if (functionFields.length > 0) {
            proto._initializers = functionFields;
        }

        model = base.extend(proto);
        model.define = function(options) {
            return Model.define(model, options);
        };

        if (proto.fields) {
            model.fields = proto.fields;
            model.idField = proto.idField;
        }

        return model;
    };

    var Comparer = {
        selector: function(field) {
            return isFunction(field) ? field : getter(field);
        },

        compare: function(field) {
            var selector = this.selector(field);
            return function (a, b) {
                a = selector(a);
                b = selector(b);

                if (a == null && b == null) {
                    return 0;
                }

                if (a == null) {
                    return -1;
                }

                if (b == null) {
                    return 1;
                }

                if (a.localeCompare) {
                    return a.localeCompare(b);
                }

                return a > b ? 1 : (a < b ? -1 : 0);
            };
        },

        create: function(sort) {
            var compare = sort.compare || this.compare(sort.field);

            if (sort.dir == "desc") {
                return function(a, b) {
                    return compare(b, a, true);
                };
            }

            return compare;
        },

        combine: function(comparers) {
            return function(a, b) {
                var result = comparers[0](a, b),
                    idx,
                    length;

                for (idx = 1, length = comparers.length; idx < length; idx ++) {
                    result = result || comparers[idx](a, b);
                }

                return result;
            };
        }
    };

    var StableComparer = extend({}, Comparer, {
        asc: function(field) {
            var selector = this.selector(field);
            return function (a, b) {
                var valueA = selector(a);
                var valueB = selector(b);

                if (valueA && valueA.getTime && valueB && valueB.getTime) {
                    valueA = valueA.getTime();
                    valueB = valueB.getTime();
                }

                if (valueA === valueB) {
                    return a.__position - b.__position;
                }

                if (valueA == null) {
                    return -1;
                }

                if (valueB == null) {
                    return 1;
                }

                if (valueA.localeCompare) {
                    return valueA.localeCompare(valueB);
                }

                return valueA > valueB ? 1 : -1;
            };
        },

        desc: function(field) {
            var selector = this.selector(field);
            return function (a, b) {
                var valueA = selector(a);
                var valueB = selector(b);

                if (valueA && valueA.getTime && valueB && valueB.getTime) {
                    valueA = valueA.getTime();
                    valueB = valueB.getTime();
                }

                if (valueA === valueB) {
                    return a.__position - b.__position;
                }

                if (valueA == null) {
                    return 1;
                }

                if (valueB == null) {
                    return -1;
                }

                if (valueB.localeCompare) {
                    return valueB.localeCompare(valueA);
                }

                return valueA < valueB ? 1 : -1;
            };
        },
        create: function(sort) {
           return this[sort.dir](sort.field);
        }
    });

    map = function (array, callback) {
        var idx, length = array.length, result = new Array(length);

        for (idx = 0; idx < length; idx++) {
            result[idx] = callback(array[idx], idx, array);
        }

        return result;
    };

    var operators = (function(){

        function quote(value) {
            return value.replace(quoteRegExp, "\\").replace(newLineRegExp, "");
        }

        function operator(op, a, b, ignore) {
            var date;

            if (b != null) {
                if (typeof b === STRING) {
                    b = quote(b);
                    date = dateRegExp.exec(b);
                    if (date) {
                        b = new Date(+date[1]);
                    } else if (ignore) {
                        b = "'" + b.toLowerCase() + "'";
                        a = "(" + a + " || '').toLowerCase()";
                    } else {
                        b = "'" + b + "'";
                    }
                }

                if (b.getTime) {
                    //b looks like a Date
                    a = "(" + a + "?" + a + ".getTime():" + a + ")";
                    b = b.getTime();
                }
            }

            return a + " " + op + " " + b;
        }

        return {
            quote: function(value) {
                if (value && value.getTime) {
                    return "new Date(" + value.getTime() + ")";
                }

                if (typeof value == "string") {
                    return "'" + quote(value) + "'";
                }

                return "" + value;
            },
            eq: function(a, b, ignore) {
                return operator("==", a, b, ignore);
            },
            neq: function(a, b, ignore) {
                return operator("!=", a, b, ignore);
            },
            gt: function(a, b, ignore) {
                return operator(">", a, b, ignore);
            },
            gte: function(a, b, ignore) {
                return operator(">=", a, b, ignore);
            },
            lt: function(a, b, ignore) {
                return operator("<", a, b, ignore);
            },
            lte: function(a, b, ignore) {
                return operator("<=", a, b, ignore);
            },
            startswith: function(a, b, ignore) {
                if (ignore) {
                    a = "(" + a + " || '').toLowerCase()";
                    if (b) {
                        b = b.toLowerCase();
                    }
                }

                if (b) {
                    b = quote(b);
                }

                return a + ".lastIndexOf('" + b + "', 0) == 0";
            },
            endswith: function(a, b, ignore) {
                if (ignore) {
                    a = "(" + a + " || '').toLowerCase()";
                    if (b) {
                        b = b.toLowerCase();
                    }
                }

                if (b) {
                    b = quote(b);
                }

                return a + ".indexOf('" + b + "', " + a + ".length - " + (b || "").length + ") >= 0";
            },
            contains: function(a, b, ignore) {
                if (ignore) {
                    a = "(" + a + " || '').toLowerCase()";
                    if (b) {
                        b = b.toLowerCase();
                    }
                }

                if (b) {
                    b = quote(b);
                }

                return a + ".indexOf('" + b + "') >= 0";
            },
            doesnotcontain: function(a, b, ignore) {
                if (ignore) {
                    a = "(" + a + " || '').toLowerCase()";
                    if (b) {
                        b = b.toLowerCase();
                    }
                }

                if (b) {
                    b = quote(b);
                }

                return a + ".indexOf('" + b + "') == -1";
            }
        };
    })();

    function Query(data) {
        this.data = data || [];
    }

    Query.filterExpr = function(expression) {
        var expressions = [],
            logic = { and: " && ", or: " || " },
            idx,
            length,
            filter,
            expr,
            fieldFunctions = [],
            operatorFunctions = [],
            field,
            operator,
            filters = expression.filters;

        for (idx = 0, length = filters.length; idx < length; idx++) {
            filter = filters[idx];
            field = filter.field;
            operator = filter.operator;

            if (filter.filters) {
                expr = Query.filterExpr(filter);
                //Nested function fields or operators - update their index e.g. __o[0] -> __o[1]
                filter = expr.expression
                .replace(/__o\[(\d+)\]/g, function(match, index) {
                    index = +index;
                    return "__o[" + (operatorFunctions.length + index) + "]";
                })
                .replace(/__f\[(\d+)\]/g, function(match, index) {
                    index = +index;
                    return "__f[" + (fieldFunctions.length + index) + "]";
                });

                operatorFunctions.push.apply(operatorFunctions, expr.operators);
                fieldFunctions.push.apply(fieldFunctions, expr.fields);
            } else {
                if (typeof field === FUNCTION) {
                    expr = "__f[" + fieldFunctions.length +"](d)";
                    fieldFunctions.push(field);
                } else {
                    expr = kendo.expr(field);
                }

                if (typeof operator === FUNCTION) {
                    filter = "__o[" + operatorFunctions.length + "](" + expr + ", " + operators.quote(filter.value) + ")";
                    operatorFunctions.push(operator);
                } else {
                    filter = operators[(operator || "eq").toLowerCase()](expr, filter.value, filter.ignoreCase !== undefined? filter.ignoreCase : true);
                }
            }

            expressions.push(filter);
        }

        return  { expression: "(" + expressions.join(logic[expression.logic]) + ")", fields: fieldFunctions, operators: operatorFunctions };
    };

    function normalizeSort(field, dir) {
        if (field) {
            var descriptor = typeof field === STRING ? { field: field, dir: dir } : field,
            descriptors = isArray(descriptor) ? descriptor : (descriptor !== undefined ? [descriptor] : []);

            return grep(descriptors, function(d) { return !!d.dir; });
        }
    }

    var operatorMap = {
        "==": "eq",
        equals: "eq",
        isequalto: "eq",
        equalto: "eq",
        equal: "eq",
        "!=": "neq",
        ne: "neq",
        notequals: "neq",
        isnotequalto: "neq",
        notequalto: "neq",
        notequal: "neq",
        "<": "lt",
        islessthan: "lt",
        lessthan: "lt",
        less: "lt",
        "<=": "lte",
        le: "lte",
        islessthanorequalto: "lte",
        lessthanequal: "lte",
        ">": "gt",
        isgreaterthan: "gt",
        greaterthan: "gt",
        greater: "gt",
        ">=": "gte",
        isgreaterthanorequalto: "gte",
        greaterthanequal: "gte",
        ge: "gte",
        notsubstringof: "doesnotcontain"
    };

    function normalizeOperator(expression) {
        var idx,
        length,
        filter,
        operator,
        filters = expression.filters;

        if (filters) {
            for (idx = 0, length = filters.length; idx < length; idx++) {
                filter = filters[idx];
                operator = filter.operator;

                if (operator && typeof operator === STRING) {
                    filter.operator = operatorMap[operator.toLowerCase()] || operator;
                }

                normalizeOperator(filter);
            }
        }
    }

    function normalizeFilter(expression) {
        if (expression && !isEmptyObject(expression)) {
            if (isArray(expression) || !expression.filters) {
                expression = {
                    logic: "and",
                    filters: isArray(expression) ? expression : [expression]
                };
            }

            normalizeOperator(expression);

            return expression;
        }
    }

    Query.normalizeFilter = normalizeFilter;

    function normalizeAggregate(expressions) {
        return isArray(expressions) ? expressions : [expressions];
    }

    function normalizeGroup(field, dir) {
        var descriptor = typeof field === STRING ? { field: field, dir: dir } : field,
        descriptors = isArray(descriptor) ? descriptor : (descriptor !== undefined ? [descriptor] : []);

        return map(descriptors, function(d) { return { field: d.field, dir: d.dir || "asc", aggregates: d.aggregates }; });
    }

    Query.prototype = {
        toArray: function () {
            return this.data;
        },
        range: function(index, count) {
            return new Query(this.data.slice(index, index + count));
        },
        skip: function (count) {
            return new Query(this.data.slice(count));
        },
        take: function (count) {
            return new Query(this.data.slice(0, count));
        },
        select: function (selector) {
            return new Query(map(this.data, selector));
        },
        order: function(selector, dir) {
            var sort = { dir: dir };

            if (selector) {
                if (selector.compare) {
                    sort.compare = selector.compare;
                } else {
                    sort.field = selector;
                }
            }

            return new Query(this.data.slice(0).sort(Comparer.create(sort)));
        },
        orderBy: function(selector) {
            return this.order(selector, "asc");
        },
        orderByDescending: function(selector) {
            return this.order(selector, "desc");
        },
        sort: function(field, dir, comparer) {
            var idx,
            length,
            descriptors = normalizeSort(field, dir),
            comparers = [];

            comparer = comparer || Comparer;

            if (descriptors.length) {
                for (idx = 0, length = descriptors.length; idx < length; idx++) {
                    comparers.push(comparer.create(descriptors[idx]));
                }

                return this.orderBy({ compare: comparer.combine(comparers) });
            }

            return this;
        },

        filter: function(expressions) {
            var idx,
            current,
            length,
            compiled,
            predicate,
            data = this.data,
            fields,
            operators,
            result = [],
            filter;

            expressions = normalizeFilter(expressions);

            if (!expressions || expressions.filters.length === 0) {
                return this;
            }

            compiled = Query.filterExpr(expressions);
            fields = compiled.fields;
            operators = compiled.operators;

            predicate = filter = new Function("d, __f, __o", "return " + compiled.expression);

            if (fields.length || operators.length) {
                filter = function(d) {
                    return predicate(d, fields, operators);
                };
            }


            for (idx = 0, length = data.length; idx < length; idx++) {
                current = data[idx];

                if (filter(current)) {
                    result.push(current);
                }
            }

            return new Query(result);
        },

        group: function(descriptors, allData) {
            descriptors =  normalizeGroup(descriptors || []);
            allData = allData || this.data;

            var that = this,
            result = new Query(that.data),
            descriptor;

            if (descriptors.length > 0) {
                descriptor = descriptors[0];
                result = result.groupBy(descriptor).select(function(group) {
                    var data = new Query(allData).filter([ { field: group.field, operator: "eq", value: group.value, ignoreCase: false } ]);
                    return {
                        field: group.field,
                        value: group.value,
                        items: descriptors.length > 1 ? new Query(group.items).group(descriptors.slice(1), data.toArray()).toArray() : group.items,
                        hasSubgroups: descriptors.length > 1,
                        aggregates: data.aggregate(descriptor.aggregates)
                    };
                });
            }
            return result;
        },

        groupBy: function(descriptor) {
            if (isEmptyObject(descriptor) || !this.data.length) {
                return new Query([]);
            }

            var field = descriptor.field,
                sorted = this._sortForGrouping(field, descriptor.dir || "asc"),
                accessor = kendo.accessor(field),
                item,
                groupValue = accessor.get(sorted[0], field),
                group = {
                    field: field,
                    value: groupValue,
                    items: []
                },
                currentValue,
                idx,
                len,
                result = [group];

            for(idx = 0, len = sorted.length; idx < len; idx++) {
                item = sorted[idx];
                currentValue = accessor.get(item, field);
                if(!groupValueComparer(groupValue, currentValue)) {
                    groupValue = currentValue;
                    group = {
                        field: field,
                        value: groupValue,
                        items: []
                    };
                    result.push(group);
                }
                group.items.push(item);
            }
            return new Query(result);
        },

        _sortForGrouping: function(field, dir) {
            var idx, length,
                data = this.data;

            if (!stableSort) {
                for (idx = 0, length = data.length; idx < length; idx++) {
                    data[idx].__position = idx;
                }

                data = new Query(data).sort(field, dir, StableComparer).toArray();

                for (idx = 0, length = data.length; idx < length; idx++) {
                    delete data[idx].__position;
                }
                return data;
            }
            return this.sort(field, dir).toArray();
        },

        aggregate: function (aggregates) {
            var idx,
                len,
                result = {},
                state = {};

            if (aggregates && aggregates.length) {
                for(idx = 0, len = this.data.length; idx < len; idx++) {
                    calculateAggregate(result, aggregates, this.data[idx], idx, len, state);
                }
            }
            return result;
        }
    };

    function groupValueComparer(a, b) {
        if (a && a.getTime && b && b.getTime) {
            return a.getTime() === b.getTime();
        }
        return a === b;
    }

    function calculateAggregate(accumulator, aggregates, item, index, length, state) {
        aggregates = aggregates || [];
        var idx,
            aggr,
            functionName,
            len = aggregates.length;

        for (idx = 0; idx < len; idx++) {
            aggr = aggregates[idx];
            functionName = aggr.aggregate;
            var field = aggr.field;
            accumulator[field] = accumulator[field] || {};
            state[field] = state[field] || {};
            state[field][functionName] = state[field][functionName] || {};
            accumulator[field][functionName] = functions[functionName.toLowerCase()](accumulator[field][functionName], item, kendo.accessor(field), index, length, state[field][functionName]);
        }
    }

    var functions = {
        sum: function(accumulator, item, accessor) {
            var value = accessor.get(item);

            if (!isNumber(accumulator)) {
                accumulator = value;
            } else if (isNumber(value)) {
                accumulator += value;
            }

            return accumulator;
        },
        count: function(accumulator) {
            return (accumulator || 0) + 1;
        },
        average: function(accumulator, item, accessor, index, length, state) {
            var value = accessor.get(item);

            if (state.count === undefined) {
                state.count = 0;
            }

            if (!isNumber(accumulator)) {
                accumulator = value;
            } else if (isNumber(value)) {
                accumulator += value;
            }

            if (isNumber(value)) {
                state.count++;
            }

            if(index == length - 1 && isNumber(accumulator)) {
                accumulator = accumulator / state.count;
            }
            return accumulator;
        },
        max: function(accumulator, item, accessor) {
            var value = accessor.get(item);

            if (!isNumber(accumulator) && !isDate(accumulator)) {
                accumulator = value;
            }

            if(accumulator < value && (isNumber(value) || isDate(value))) {
                accumulator = value;
            }
            return accumulator;
        },
        min: function(accumulator, item, accessor) {
            var value = accessor.get(item);

            if (!isNumber(accumulator) && !isDate(accumulator)) {
                accumulator = value;
            }

            if(accumulator > value && (isNumber(value) || isDate(value))) {
                accumulator = value;
            }
            return accumulator;
        }
    };

    function isNumber(val) {
        return typeof val === "number" && !isNaN(val);
    }

    function isDate(val) {
        return val && val.getTime;
    }

    function toJSON(array) {
        var idx, length = array.length, result = new Array(length);

        for (idx = 0; idx < length; idx++) {
            result[idx] = array[idx].toJSON();
        }

        return result;
    }

    Query.process = function(data, options) {
        options = options || {};

        var query = new Query(data),
            group = options.group,
            sort = normalizeGroup(group || []).concat(normalizeSort(options.sort || [])),
            total,
            filterCallback = options.filterCallback,
            filter = options.filter,
            skip = options.skip,
            take = options.take;

        if (filter) {
            query = query.filter(filter);

            if (filterCallback) {
                query = filterCallback(query);
            }

            total = query.toArray().length;
        }

        if (sort) {
            query = query.sort(sort);

            if (group) {
                data = query.toArray();
            }
        }

        if (skip !== undefined && take !== undefined) {
            query = query.range(skip, take);
        }

        if (group) {
            query = query.group(group, data);
        }

        return {
            total: total,
            data: query.toArray()
        };
    };

    var LocalTransport = Class.extend({
        init: function(options) {
            this.data = options.data;
        },

        read: function(options) {
            options.success(this.data);
        },
        update: function(options) {
            options.success(options.data);
        },
        create: function(options) {
            options.success(options.data);
        },
        destroy: function(options) {
            options.success(options.data);
        }
    });

    var RemoteTransport = Class.extend( {
        init: function(options) {
            var that = this, parameterMap;

            options = that.options = extend({}, that.options, options);

            each(crud, function(index, type) {
                if (typeof options[type] === STRING) {
                    options[type] = {
                        url: options[type]
                    };
                }
            });

            that.cache = options.cache? Cache.create(options.cache) : {
                find: noop,
                add: noop
            };

            parameterMap = options.parameterMap;

            if (isFunction(options.push)) {
                that.push = options.push;
            }

            if (!that.push) {
                that.push = identity;
            }

            that.parameterMap = isFunction(parameterMap) ? parameterMap : function(options) {
                var result = {};

                each(options, function(option, value) {
                    if (option in parameterMap) {
                        option = parameterMap[option];
                        if (isPlainObject(option)) {
                            value = option.value(value);
                            option = option.key;
                        }
                    }

                    result[option] = value;
                });

                return result;
            };
        },

        options: {
            parameterMap: identity
        },

        create: function(options) {
            return ajax(this.setup(options, CREATE));
        },

        read: function(options) {
            var that = this,
                success,
                error,
                result,
                cache = that.cache;

            options = that.setup(options, READ);

            success = options.success || noop;
            error = options.error || noop;

            result = cache.find(options.data);

            if(result !== undefined) {
                success(result);
            } else {
                options.success = function(result) {
                    cache.add(options.data, result);

                    success(result);
                };

                $.ajax(options);
            }
        },

        update: function(options) {
            return ajax(this.setup(options, UPDATE));
        },

        destroy: function(options) {
            return ajax(this.setup(options, DESTROY));
        },

        setup: function(options, type) {
            options = options || {};

            var that = this,
                parameters,
                operation = that.options[type],
                data = isFunction(operation.data) ? operation.data(options.data) : operation.data;

            options = extend(true, {}, operation, options);
            parameters = extend(true, {}, data, options.data);

            options.data = that.parameterMap(parameters, type);

            if (isFunction(options.url)) {
                options.url = options.url(parameters);
            }

            return options;
        }
    });

    var Cache = Class.extend({
        init: function() {
            this._store = {};
        },
        add: function(key, data) {
            if(key !== undefined) {
                this._store[stringify(key)] = data;
            }
        },
        find: function(key) {
            return this._store[stringify(key)];
        },
        clear: function() {
            this._store = {};
        },
        remove: function(key) {
            delete this._store[stringify(key)];
        }
    });

    Cache.create = function(options) {
        var store = {
            "inmemory": function() { return new Cache(); }
        };

        if (isPlainObject(options) && isFunction(options.find)) {
            return options;
        }

        if (options === true) {
            return new Cache();
        }

        return store[options]();
    };

    function serializeRecords(data, getters, modelInstance, originalFieldNames, fieldNames) {
        var record,
            getter,
            originalName,
            idx,
            length;

        for (idx = 0, length = data.length; idx < length; idx++) {
            record = data[idx];
            for (getter in getters) {
                originalName = fieldNames[getter];

                if (originalName && originalName !== getter) {
                    record[originalName] = getters[getter](record);
                    delete record[getter];
                }
            }
        }
    }

    function convertRecords(data, getters, modelInstance, originalFieldNames, fieldNames) {
        var record,
            getter,
            originalName,
            idx,
            length;

        for (idx = 0, length = data.length; idx < length; idx++) {
            record = data[idx];
            for (getter in getters) {
                record[getter] = modelInstance._parse(getter, getters[getter](record));

                originalName = fieldNames[getter];
                if (originalName && originalName !== getter) {
                    delete record[originalName];
                }
            }
        }
    }

    function convertGroup(data, getters, modelInstance, originalFieldNames, fieldNames) {
        var record,
            idx,
            fieldName,
            length;

        for (idx = 0, length = data.length; idx < length; idx++) {
            record = data[idx];

            fieldName = originalFieldNames[record.field];
            if (fieldName && fieldName != record.field) {
                record.field = fieldName;
            }

            record.value = modelInstance._parse(record.field, record.value);

            if (record.hasSubgroups) {
                convertGroup(record.items, getters, modelInstance, originalFieldNames, fieldNames);
            } else {
                convertRecords(record.items, getters, modelInstance, originalFieldNames, fieldNames);
            }
        }
    }

    function wrapDataAccess(originalFunction, model, converter, getters, originalFieldNames, fieldNames) {
        return function(data) {
            data = originalFunction(data);

            if (data && !isEmptyObject(getters)) {
                if (toString.call(data) !== "[object Array]" && !(data instanceof ObservableArray)) {
                    data = [data];
                }

                converter(data, getters, new model(), originalFieldNames, fieldNames);
            }

            return data || [];
        };
    }

    var DataReader = Class.extend({
        init: function(schema) {
            var that = this, member, get, model, base;

            schema = schema || {};

            for (member in schema) {
                get = schema[member];

                that[member] = typeof get === STRING ? getter(get) : get;
            }

            base = schema.modelBase || Model;

            if (isPlainObject(that.model)) {
                that.model = model = base.define(that.model);
            }

            var dataFunction = proxy(that.data, that);

            that._dataAccessFunction = dataFunction;

            if (that.model) {
                var groupsFunction = proxy(that.groups, that),
                    serializeFunction = proxy(that.serialize, that),
                    originalFieldNames = {},
                    getters = {},
                    serializeGetters = {},
                    fieldNames = {},
                    shouldSerialize = false,
                    fieldName;

                model = that.model;

                if (model.fields) {
                    each(model.fields, function(field, value) {
                        var fromName;

                        fieldName = field;

                        if (isPlainObject(value) && value.field) {
                            fieldName = value.field;
                        } else if (typeof value === STRING) {
                            fieldName = value;
                        }

                        if (isPlainObject(value) && value.from) {
                            fromName = value.from;
                        }

                        shouldSerialize = shouldSerialize || (fromName && fromName !== field) || fieldName !== field;

                        getters[field] = getter(fromName || fieldName);
                        serializeGetters[field] = getter(field);
                        originalFieldNames[fromName || fieldName] = field;
                        fieldNames[field] = fromName || fieldName;
                    });

                    if (!schema.serialize && shouldSerialize) {
                        that.serialize = wrapDataAccess(serializeFunction, model, serializeRecords, serializeGetters, originalFieldNames, fieldNames);
                    }
                }

                that._dataAccessFunction = dataFunction;
                that.data = wrapDataAccess(dataFunction, model, convertRecords, getters, originalFieldNames, fieldNames);
                that.groups = wrapDataAccess(groupsFunction, model, convertGroup, getters, originalFieldNames, fieldNames);
            }
        },
        errors: function(data) {
            return data ? data.errors : null;
        },
        parse: identity,
        data: identity,
        total: function(data) {
            return data.length;
        },
        groups: identity,
        aggregates: function() {
            return {};
        },
        serialize: function(data) {
            return data;
        }
    });

    function mergeGroups(target, dest, skip, take) {
        var group,
            idx = 0,
            items;

        while (dest.length && take) {
            group = dest[idx];
            items = group.items;

            var length = items.length;

            if (target && target.field === group.field && target.value === group.value) {
                if (target.hasSubgroups && target.items.length) {
                    mergeGroups(target.items[target.items.length - 1], group.items, skip, take);
                } else {
                    items = items.slice(skip, skip + take);
                    target.items = target.items.concat(items);
                }
                dest.splice(idx--, 1);
            } else if (group.hasSubgroups && items.length) {
                mergeGroups(group, items, skip, take);
                if (!group.items.length) {
                    dest.splice(idx--, 1);
                }
            } else {
                items = items.slice(skip, skip + take);
                group.items = items;

                if (!group.items.length) {
                    dest.splice(idx--, 1);
                }
            }

            if (items.length === 0) {
                skip -= length;
            } else {
                skip = 0;
                take -= items.length;
            }

            if (++idx >= dest.length) {
                break;
            }
        }

        if (idx < dest.length) {
            dest.splice(idx, dest.length - idx);
        }
    }

    function flattenGroups(data) {
        var idx,
            result = [],
            length,
            items,
            itemIndex;

        for (idx = 0, length = data.length; idx < length; idx++) {
            var group = data.at(idx);
            if (group.hasSubgroups) {
                result = result.concat(flattenGroups(group.items));
            } else {
                items = group.items;
                for (itemIndex = 0; itemIndex < items.length; itemIndex++) {
                    result.push(items.at(itemIndex));
                }
            }
        }
        return result;
    }

    function wrapGroupItems(data, model) {
        var idx, length, group, items;
        if (model) {
            for (idx = 0, length = data.length; idx < length; idx++) {
                group = data.at(idx);

                if (group.hasSubgroups) {
                    wrapGroupItems(group.items, model);
                } else {
                    group.items = new LazyObservableArray(group.items, model);
                }
            }
        }
    }

    function eachGroupItems(data, func) {
        for (var idx = 0, length = data.length; idx < length; idx++) {
            if (data[idx].hasSubgroups) {
                if (eachGroupItems(data[idx].items, func)) {
                    return true;
                }
            } else if (func(data[idx].items, data[idx])) {
                return true;
            }
        }
    }

    function replaceInRanges(ranges, data, item, observable) {
        for (var idx = 0; idx < ranges.length; idx++) {
            if (ranges[idx].data === data) {
                break;
            }
            if (replaceInRange(ranges[idx].data, item, observable)) {
                break;
            }
        }
    }

    function replaceInRange(items, item, observable) {
        for (var idx = 0, length = items.length; idx < length; idx++) {
            if (items[idx] && items[idx].hasSubgroups) {
                return replaceInRange(items[idx].items, item, observable);
            } else if (items[idx] === item || items[idx] === observable) {
               items[idx] = observable;
               return true;
            }
        }
    }

    function replaceWithObservable(view, data, ranges, type, serverGrouping) {
        for (var viewIndex = 0, length = view.length; viewIndex < length; viewIndex++) {
            var item = view[viewIndex];

            if (!item || item instanceof type) {
                continue;
            }

            if (item.hasSubgroups !== undefined && !serverGrouping) {
                replaceWithObservable(item.items, data, ranges, type, serverGrouping);
            } else {
                for (var idx = 0; idx < data.length; idx++) {
                    if (data[idx] === item) {
                        view[viewIndex] = data.at(idx);
                        replaceInRanges(ranges, data, item, view[viewIndex]);
                        break;
                    }
                }
            }
        }
    }

    function removeModel(data, model) {
        var idx, length;

        for (idx = 0, length = data.length; idx < length; idx++) {
            var dataItem = data.at(idx);
            if (dataItem.uid == model.uid) {
                data.splice(idx, 1);
                return dataItem;
            }
        }
    }

    function indexOfPristineModel(data, model) {
        if (model) {
            return indexOf(data, function(item) {
                return (item.uid && item.uid == model.uid) || (item[model.idField] === model.id && model.id !== model._defaultId);
            });
        }
        return -1;
    }

    function indexOfModel(data, model) {
        if (model) {
            return indexOf(data, function(item) {
                return item.uid == model.uid;
            });
        }
        return -1;
    }

    function indexOf(data, comparer) {
        var idx, length;

        for (idx = 0, length = data.length; idx < length; idx++) {
            if (comparer(data[idx])) {
                return idx;
            }
        }

        return -1;
    }

    function fieldNameFromModel(fields, name) {
        if (fields && !isEmptyObject(fields)) {
            var descriptor = fields[name];
            var fieldName;
            if (isPlainObject(descriptor)) {
                fieldName = descriptor.from || descriptor.field || name;
            } else {
                fieldName = fields[name] || name;
            }

            if (isFunction(fieldName)) {
                return name;
            }

            return fieldName;
        }
        return name;
    }

    function convertFilterDescriptorsField(descriptor, model) {
        var idx,
            length,
            target = {};

        for (var field in descriptor) {
            if (field !== "filters") {
                target[field] = descriptor[field];
            }
        }

        if (descriptor.filters) {
            target.filters = [];
            for (idx = 0, length = descriptor.filters.length; idx < length; idx++) {
                target.filters[idx] = convertFilterDescriptorsField(descriptor.filters[idx], model);
            }
        } else {
            target.field = fieldNameFromModel(model.fields, target.field);
        }
        return target;
    }

    function convertDescriptorsField(descriptors, model) {
        var idx,
            length,
            result = [],
            target,
            descriptor;

        for (idx = 0, length = descriptors.length; idx < length; idx ++) {
            target = {};

            descriptor = descriptors[idx];

            for (var field in descriptor) {
                target[field] = descriptor[field];
            }

            target.field = fieldNameFromModel(model.fields, target.field);

            if (target.aggregates && isArray(target.aggregates)) {
                target.aggregates = convertDescriptorsField(target.aggregates, model);
            }
            result.push(target);
        }
        return result;
    }

    var DataSource = Observable.extend({
        init: function(options) {
            var that = this, model, data;

            if (options) {
                data = options.data;
            }

            options = that.options = extend({}, that.options, options);

            that._map = {};
            that._prefetch = {};
            that._data = [];
            that._pristineData = [];
            that._ranges = [];
            that._view = [];
            that._pristineTotal = 0;
            that._destroyed = [];
            that._pageSize = options.pageSize;
            that._page = options.page  || (options.pageSize ? 1 : undefined);
            that._sort = normalizeSort(options.sort);
            that._filter = normalizeFilter(options.filter);
            that._group = normalizeGroup(options.group);
            that._aggregate = options.aggregate;
            that._total = options.total;

            that._shouldDetachObservableParents = true;

            Observable.fn.init.call(that);

            that.transport = Transport.create(options, data, that);

            if (isFunction(that.transport.push)) {
                that.transport.push({
                    pushCreate: proxy(that._pushCreate, that),
                    pushUpdate: proxy(that._pushUpdate, that),
                    pushDestroy: proxy(that._pushDestroy, that)
                });
            }

            if (options.offlineStorage != null) {
                if (typeof options.offlineStorage == "string") {
                    var key = options.offlineStorage;

                    that._storage = {
                        getItem: function() {
                            return JSON.parse(localStorage.getItem(key));
                        },
                        setItem: function(item) {
                            localStorage.setItem(key, stringify(that.reader.serialize(item)));
                        }
                    };
                } else {
                    that._storage = options.offlineStorage;
                }
            }

            that.reader = new kendo.data.readers[options.schema.type || "json" ](options.schema);

            model = that.reader.model || {};

            that._detachObservableParents();

            that._data = that._observe(that._data);
            that._online = true;

            that.bind(["push", ERROR, CHANGE, REQUESTSTART, SYNC, REQUESTEND, PROGRESS], options);
        },

        options: {
            data: null,
            schema: {
               modelBase: Model
            },
            offlineStorage: null,
            serverSorting: false,
            serverPaging: false,
            serverFiltering: false,
            serverGrouping: false,
            serverAggregates: false,
            batch: false
        },

        clone: function() {
            return this;
        },

        online: function(value) {
            if (value !== undefined) {
                if (this._online != value) {
                    this._online = value;

                    if (value) {
                        return this.sync();
                    }
                }

                return $.Deferred().resolve().promise();
            } else {
                return this._online;
            }
        },

        offlineData: function(state) {
            if (this.options.offlineStorage == null) {
                return null;
            }

            if (state !== undefined) {
                return this._storage.setItem(state);
            }

            return this._storage.getItem() || [];
        },

        _isServerGrouped: function() {
            var group = this.group() || [];

            return this.options.serverGrouping && group.length;
        },

        _pushCreate: function(result) {
            this._push(result, "pushCreate");
        },

        _pushUpdate: function(result) {
            this._push(result, "pushUpdate");
        },

        _pushDestroy: function(result) {
            this._push(result, "pushDestroy");
        },

        _push: function(result, operation) {
            var data = this._readData(result);

            if (!data) {
                data = result;
            }

            this[operation](data);
        },

        _flatData: function(data, skip) {
            if (data) {
                if (this._isServerGrouped()) {
                    return flattenGroups(data);
                }

                if (!skip) {
                    for (var idx = 0; idx < data.length; idx++) {
                        data.at(idx);
                    }
                }
            }

            return data;
        },

        parent: noop,

        get: function(id) {
            var idx, length, data = this._flatData(this._data);

            for (idx = 0, length = data.length; idx < length; idx++) {
                if (data[idx].id == id) {
                    return data[idx];
                }
            }
        },

        getByUid: function(id) {
            var idx, length, data = this._flatData(this._data);

            if (!data) {
                return;
            }

            for (idx = 0, length = data.length; idx < length; idx++) {
                if (data[idx].uid == id) {
                    return data[idx];
                }
            }
        },

        indexOf: function(model) {
            return indexOfModel(this._data, model);
        },

        at: function(index) {
            return this._data.at(index);
        },

        data: function(value) {
            var that = this;
            if (value !== undefined) {
                that._detachObservableParents();
                that._data = this._observe(value);

                that._pristineData = value.slice(0);

                that._storeData();

                that._ranges = [];
                that.trigger("reset");
                that._addRange(that._data);

                that._total = that._data.length;
                that._pristineTotal = that._total;

                that._process(that._data);
            } else {
                if (that._data) {
                    for (var idx = 0; idx < that._data.length; idx++) {
                        that._data.at(idx);
                    }
                }

                return that._data;
            }
        },

        view: function(value) {
            if (value === undefined) {
                return this._view;
            } else {
                this._view = this._observeView(value);
            }
        },

        _observeView: function(data) {
            var that = this;
            replaceWithObservable(data, that._data, that._ranges, that.reader.model || ObservableObject, that._isServerGrouped());

            var view = new LazyObservableArray(data, that.reader.model);
            view.parent = function() { return that.parent(); };
            return view;
        },

        flatView: function() {
            var groups = this.group() || [];

            if (groups.length) {
                return flattenGroups(this._view);
            } else {
                return this._view;
            }
        },

        add: function(model) {
            return this.insert(this._data.length, model);
        },

        _createNewModel: function(model) {
            if (this.reader.model) {
                return new this.reader.model(model);
            }

            if (model instanceof ObservableObject) {
                return model;
            }

            return new ObservableObject(model);
        },

        insert: function(index, model) {
            if (!model) {
                model = index;
                index = 0;
            }

            if (!(model instanceof Model)) {
                model = this._createNewModel(model);
            }

            if (this._isServerGrouped()) {
                this._data.splice(index, 0, this._wrapInEmptyGroup(model));
            } else {
                this._data.splice(index, 0, model);
            }

            return model;
        },

        pushCreate: function(items) {
            if (!isArray(items)) {
                items = [items];
            }

            var pushed = [];
            var autoSync = this.options.autoSync;
            this.options.autoSync = false;

            try {
                for (var idx = 0; idx < items.length; idx ++) {
                    var item = items[idx];

                    var result = this.add(item);

                    pushed.push(result);

                    var pristine = result.toJSON();

                    if (this._isServerGrouped()) {
                        pristine = this._wrapInEmptyGroup(pristine);
                    }

                    this._pristineData.push(pristine);
                }
            } finally {
                this.options.autoSync = autoSync;
            }

            if (pushed.length) {
                this.trigger("push", {
                    type: "create",
                    items: pushed
                });
            }
        },

        pushUpdate: function(items) {
            if (!isArray(items)) {
                items = [items];
            }

            var pushed = [];

            for (var idx = 0; idx < items.length; idx ++) {
                var item = items[idx];
                var model = this._createNewModel(item);

                var target = this.get(model.id);

                if (target) {
                    pushed.push(target);

                    target.accept(item);

                    target.trigger(CHANGE);

                    this._updatePristineForModel(target, item);
                } else {
                    this.pushCreate(item);
                }
            }

            if (pushed.length) {
                this.trigger("push", {
                    type: "update",
                    items: pushed
                });
            }
        },

        pushDestroy: function(items) {
            var pushed = this._removeItems(items);

            if (pushed.length) {
                this.trigger("push", {
                    type: "destroy",
                    items: pushed
                });
            }
        },

        _removeItems: function(items) {
            if (!isArray(items)) {
                items = [items];
            }

            var destroyed = [];
            var autoSync = this.options.autoSync;
            this.options.autoSync = false;
            try {
                for (var idx = 0; idx < items.length; idx ++) {
                    var item = items[idx];
                    var model = this._createNewModel(item);
                    var found = false;

                    this._eachItem(this._data, function(items){
                        for (var idx = 0; idx < items.length; idx++) {
                            var item = items.at(idx);
                            if (item.id === model.id) {
                                destroyed.push(item);
                                items.splice(idx, 1);
                                found = true;
                                break;
                            }
                        }
                    });

                    if (found) {
                        this._removePristineForModel(model);
                        this._destroyed.pop();
                    }
                }
            } finally {
                this.options.autoSync = autoSync;
            }

            return destroyed;
        },

        remove: function(model) {
            var result,
                that = this,
                hasGroups = that._isServerGrouped();

            this._eachItem(that._data, function(items) {
                result = removeModel(items, model);
                if (result && hasGroups) {
                    if (!result.isNew || !result.isNew()) {
                        that._destroyed.push(result);
                    }
                    return true;
                }
            });

            this._removeModelFromRanges(model);

            this._updateRangesLength();

            return model;
        },

        destroyed: function() {
            return this._destroyed;
        },

        created: function() {
            var idx,
                length,
                result = [],
                data = this._flatData(this._data);

            for (idx = 0, length = data.length; idx < length; idx++) {
                if (data[idx].isNew && data[idx].isNew()) {
                    result.push(data[idx]);
                }
            }
            return result;
        },

        updated: function() {
            var idx,
                length,
                result = [],
                data = this._flatData(this._data);

            for (idx = 0, length = data.length; idx < length; idx++) {
                if ((data[idx].isNew && !data[idx].isNew()) && data[idx].dirty) {
                    result.push(data[idx]);
                }
            }
            return result;
        },

        sync: function() {
            var that = this,
                idx,
                length,
                created = [],
                updated = [],
                destroyed = that._destroyed,
                data = that._flatData(that._data);

            var promise = $.Deferred().resolve().promise();

            if (that.online()) {

                if (!that.reader.model) {
                    return promise;
                }

                created = that.created();
                updated = that.updated();

                var promises = [];

                if (that.options.batch && that.transport.submit) {
                    promises = that._sendSubmit(created, updated, destroyed);
                } else {
                    promises.push.apply(promises, that._send("create", created));
                    promises.push.apply(promises, that._send("update", updated));
                    promises.push.apply(promises, that._send("destroy", destroyed));
                }

                promise = $.when
                 .apply(null, promises)
                 .then(function() {
                    var idx, length;

                    for (idx = 0, length = arguments.length; idx < length; idx++){
                        that._accept(arguments[idx]);
                    }

                    that._storeData(true);

                    that._change({ action: "sync" });

                    that.trigger(SYNC);
                });
            } else {
                that._storeData(true);

                that._change({ action: "sync" });
            }

            return promise;
        },

        cancelChanges: function(model) {
            var that = this;

            if (model instanceof kendo.data.Model) {
                that._cancelModel(model);
            } else {
                that._destroyed = [];
                that._detachObservableParents();
                that._data = that._observe(that._pristineData);
                if (that.options.serverPaging) {
                    that._total = that._pristineTotal;
                }

                that._ranges = [];
                that._addRange(that._data);

                that._change();
            }
        },

        hasChanges: function() {
            var idx,
                length,
                data = this._flatData(this._data);

            if (this._destroyed.length) {
                return true;
            }

            for (idx = 0, length = data.length; idx < length; idx++) {
                if ((data[idx].isNew && data[idx].isNew()) || data[idx].dirty) {
                    return true;
                }
            }

            return false;
        },

        _accept: function(result) {
            var that = this,
                models = result.models,
                response = result.response,
                idx = 0,
                serverGroup = that._isServerGrouped(),
                pristine = that._pristineData,
                type = result.type,
                length;

            that.trigger(REQUESTEND, { response: response, type: type });

            if (response && !isEmptyObject(response)) {
                response = that.reader.parse(response);

                if (that._handleCustomErrors(response)) {
                    return;
                }

                response = that.reader.data(response);

                if (!isArray(response)) {
                    response = [response];
                }
            } else {
                response = $.map(models, function(model) { return model.toJSON(); } );
            }

            if (type === "destroy") {
                that._destroyed = [];
            }

            for (idx = 0, length = models.length; idx < length; idx++) {
                if (type !== "destroy") {
                    models[idx].accept(response[idx]);

                    if (type === "create") {
                        pristine.push(serverGroup ? that._wrapInEmptyGroup(models[idx]) : response[idx]);
                    } else if (type === "update") {
                        that._updatePristineForModel(models[idx], response[idx]);
                    }
                } else {
                    that._removePristineForModel(models[idx]);
                }
            }
        },

        _updatePristineForModel: function(model, values) {
            this._executeOnPristineForModel(model, function(index, items) {
                kendo.deepExtend(items[index], values);
            });
        },

        _executeOnPristineForModel: function(model, callback) {
            this._eachPristineItem(
                function(items) {
                    var index = indexOfPristineModel(items, model);
                    if (index > -1) {
                        callback(index, items);
                        return true;
                    }
                });
        },

        _removePristineForModel: function(model) {
            this._executeOnPristineForModel(model, function(index, items) {
                items.splice(index, 1);
            });
        },

        _readData: function(data) {
            var read = !this._isServerGrouped() ? this.reader.data : this.reader.groups;
            return read.call(this.reader, data);
        },

        _eachPristineItem: function(callback) {
            this._eachItem(this._pristineData, callback);
        },

       _eachItem: function(data, callback) {
            if (data && data.length) {
                if (this._isServerGrouped()) {
                    eachGroupItems(data, callback);
                } else {
                    callback(data);
                }
            }
        },

        _pristineForModel: function(model) {
            var pristine,
                idx,
                callback = function(items) {
                    idx = indexOfPristineModel(items, model);
                    if (idx > -1) {
                        pristine = items[idx];
                        return true;
                    }
                };

            this._eachPristineItem(callback);

            return pristine;
        },

        _cancelModel: function(model) {
            var pristine = this._pristineForModel(model);

            this._eachItem(this._data, function(items) {
                var idx = indexOfModel(items, model);
                if (idx >= 0) {
                    if (pristine && (!model.isNew() || pristine.__state__)) {
                        items[idx].accept(pristine);
                    } else {
                        items.splice(idx, 1);
                    }
                }
            });
        },

        _submit: function(promises, data) {
            var that = this;

            that.trigger(REQUESTSTART, { type: "submit" });

            that.transport.submit(extend({
                success: function(response, type) {
                    var promise = $.grep(promises, function(x) {
                        return x.type == type;
                    })[0];

                    if (promise) {
                        promise.resolve({
                            response: response,
                            models: promise.models,
                            type: type
                        });
                    }
                },
                error: function(response, status, error) {
                    for (var idx = 0; idx < promises.length; idx++) {
                        promises[idx].reject(response);
                    }

                    that.error(response, status, error);
                }
            }, data));
        },

        _sendSubmit: function(created, updated, destroyed) {
            var that = this,
                promises = [];

            if (that.options.batch) {
                if (created.length) {
                    promises.push($.Deferred(function(deferred) {
                        deferred.type = "create";
                        deferred.models = created;
                    }));
                }

                if (updated.length) {
                    promises.push($.Deferred(function(deferred) {
                        deferred.type = "update";
                        deferred.models = updated;
                    }));
                }

                if (destroyed.length) {
                    promises.push($.Deferred(function(deferred) {
                        deferred.type = "destroy";
                        deferred.models = destroyed;
                    }));
                }

                that._submit(promises, {
                    data: {
                        created: that.reader.serialize(toJSON(created)),
                        updated: that.reader.serialize(toJSON(updated)),
                        destroyed: that.reader.serialize(toJSON(destroyed))
                    }
                });
            }

            return promises;
        },

        _promise: function(data, models, type) {
            var that = this;

            return $.Deferred(function(deferred) {
                that.trigger(REQUESTSTART, { type: type });

                that.transport[type].call(that.transport, extend({
                    success: function(response) {
                        deferred.resolve({
                            response: response,
                            models: models,
                            type: type
                        });
                    },
                    error: function(response, status, error) {
                        deferred.reject(response);
                        that.error(response, status, error);
                    }
                }, data));
            }).promise();
        },

        _send: function(method, data) {
            var that = this,
                idx,
                length,
                promises = [],
                converted = that.reader.serialize(toJSON(data));

            if (that.options.batch) {
                if (data.length) {
                    promises.push(that._promise( { data: { models: converted } }, data , method));
                }
            } else {
                for (idx = 0, length = data.length; idx < length; idx++) {
                    promises.push(that._promise( { data: converted[idx] }, [ data[idx] ], method));
                }
            }

            return promises;
        },

        read: function(data) {
            var that = this, params = that._params(data);
            var deferred = $.Deferred();

            that._queueRequest(params, function() {
                var isPrevented = that.trigger(REQUESTSTART, { type: "read" });
                if (!isPrevented) {
                    that.trigger(PROGRESS);

                    that._ranges = [];
                    that.trigger("reset");
                    if (that.online()) {
                        that.transport.read({
                            data: params,
                            success: function(data) {
                                that.success(data, params);

                                deferred.resolve();
                            },
                            error: function() {
                                var args = slice.call(arguments);

                                that.error.apply(that, args);

                                deferred.reject.apply(deferred, args);
                            }
                        });
                    } else if (that.options.offlineStorage != null){
                        that.success(that.offlineData(), params);

                        deferred.resolve();
                    }
                } else {
                    that._dequeueRequest();

                    deferred.resolve(isPrevented);
                }
            });

            return deferred.promise();
        },

        _readAggregates: function(data) {
            return this.reader.aggregates(data);
        },

        success: function(data) {
            var that = this,
                options = that.options;

            that.trigger(REQUESTEND, { response: data, type: "read" });

            if (that.online()) {
                data = that.reader.parse(data);

                if (that._handleCustomErrors(data)) {
                    that._dequeueRequest();
                    return;
                }

                that._total = that.reader.total(data);

                if (that._aggregate && options.serverAggregates) {
                    that._aggregateResult = that._readAggregates(data);
                }

                data = that._readData(data);
            } else {
                data = that._readData(data);

                var items = [];
                var itemIds = {};
                var model = that.reader.model;
                var idField = model ? model.idField : "id";
                var idx;

                for (idx = 0; idx < this._destroyed.length; idx++) {
                    var id = this._destroyed[idx][idField];
                    itemIds[id] = id;
                }

                for (idx = 0; idx < data.length; idx++) {
                    var item = data[idx];
                    var state = item.__state__;
                    if (state == "destroy") {
                        if (!itemIds[item[idField]]) {
                            this._destroyed.push(this._createNewModel(item));
                        }
                    } else {
                        items.push(item);
                    }
                }

                data = items;

                that._total = data.length;
            }

            that._pristineTotal = that._total;

            that._pristineData = data.slice(0);

            that._detachObservableParents();

            that._data = that._observe(data);

            if (that.options.offlineStorage != null) {
                that._eachItem(that._data, function(items) {
                    for (var idx = 0; idx < items.length; idx++) {
                        var item = items.at(idx);
                        if (item.__state__ == "update") {
                            item.dirty = true;
                        }
                    }
                });
            }

            that._storeData();

            that._addRange(that._data);

            that._process(that._data);

            that._dequeueRequest();
        },

        _detachObservableParents: function() {
            if (this._data && this._shouldDetachObservableParents) {
                for (var idx = 0; idx < this._data.length; idx++) {
                    if (this._data[idx].parent) {
                        this._data[idx].parent = noop;
                    }
                }
            }
        },

        _storeData: function(updatePristine) {
            var serverGrouping = this._isServerGrouped();
            var model = this.reader.model;

            function items(data) {
                var state = [];

                for (var idx = 0; idx < data.length; idx++) {
                    var dataItem = data.at(idx);
                    var item = dataItem.toJSON();

                    if (serverGrouping && dataItem.items) {
                        item.items = items(dataItem.items);
                    } else {
                        item.uid = dataItem.uid;

                        if (model) {
                            if (dataItem.isNew()) {
                                item.__state__ = "create";
                            } else if (dataItem.dirty) {
                                item.__state__ = "update";
                            }
                        }
                    }
                    state.push(item);
                }

                return state;
            }

            if (this.options.offlineStorage != null) {
                var state = items(this._data);

                for (var idx = 0; idx < this._destroyed.length; idx++) {
                    var item = this._destroyed[idx].toJSON();
                    item.__state__ = "destroy";
                    state.push(item);
                }

                this.offlineData(state);

                if (updatePristine) {
                    this._pristineData = state;
                }
            }
        },

        _addRange: function(data) {
            var that = this,
                start = that._skip || 0,
                end = start + that._flatData(data, true).length;

            that._ranges.push({ start: start, end: end, data: data, timestamp: new Date().getTime() });
            that._ranges.sort( function(x, y) { return x.start - y.start; } );
        },

        error: function(xhr, status, errorThrown) {
            this._dequeueRequest();
            this.trigger(REQUESTEND, { });
            this.trigger(ERROR, { xhr: xhr, status: status, errorThrown: errorThrown });
        },

        _params: function(data) {
            var that = this,
                options =  extend({
                    take: that.take(),
                    skip: that.skip(),
                    page: that.page(),
                    pageSize: that.pageSize(),
                    sort: that._sort,
                    filter: that._filter,
                    group: that._group,
                    aggregate: that._aggregate
                }, data);

            if (!that.options.serverPaging) {
                delete options.take;
                delete options.skip;
                delete options.page;
                delete options.pageSize;
            }

            if (!that.options.serverGrouping) {
                delete options.group;
            } else if (that.reader.model && options.group) {
                options.group = convertDescriptorsField(options.group, that.reader.model);
            }

            if (!that.options.serverFiltering) {
                delete options.filter;
            } else if (that.reader.model && options.filter) {
               options.filter = convertFilterDescriptorsField(options.filter, that.reader.model);
            }

            if (!that.options.serverSorting) {
                delete options.sort;
            } else if (that.reader.model && options.sort) {
                options.sort = convertDescriptorsField(options.sort, that.reader.model);
            }

            if (!that.options.serverAggregates) {
                delete options.aggregate;
            } else if (that.reader.model && options.aggregate) {
                options.aggregate = convertDescriptorsField(options.aggregate, that.reader.model);
            }

            return options;
        },

        _queueRequest: function(options, callback) {
            var that = this;
            if (!that._requestInProgress) {
                that._requestInProgress = true;
                that._pending = undefined;
                callback();
            } else {
                that._pending = { callback: proxy(callback, that), options: options };
            }
        },

        _dequeueRequest: function() {
            var that = this;
            that._requestInProgress = false;
            if (that._pending) {
                that._queueRequest(that._pending.options, that._pending.callback);
            }
        },

        _handleCustomErrors: function(response) {
            if (this.reader.errors) {
                var errors = this.reader.errors(response);
                if (errors) {
                    this.trigger(ERROR, { xhr: null, status: "customerror", errorThrown: "custom error", errors: errors });
                    return true;
                }
            }
            return false;
        },

        _shouldWrap: function(data) {
            var model = this.reader.model;

            if (model && data.length) {
                return !(data[0] instanceof model);
            }

            return false;
        },

        _observe: function(data) {
            var that = this,
                model = that.reader.model,
                wrap = false;

            that._shouldDetachObservableParents = true;

            if (data instanceof ObservableArray) {
                that._shouldDetachObservableParents = false;
                if (that._shouldWrap(data)) {
                    data.type = that.reader.model;
                    data.wrapAll(data, data);
                }
            } else {
                var arrayType = that.pageSize() && !that.options.serverPaging ? LazyObservableArray : ObservableArray;
                data = new arrayType(data, that.reader.model);
                data.parent = function() { return that.parent(); };
            }

            if (that._isServerGrouped()) {
                wrapGroupItems(data, model);
            }

            if (that._changeHandler && that._data && that._data instanceof ObservableArray) {
                that._data.unbind(CHANGE, that._changeHandler);
            } else {
                that._changeHandler = proxy(that._change, that);
            }

            return data.bind(CHANGE, that._changeHandler);
        },

        _change: function(e) {
            var that = this, idx, length, action = e ? e.action : "";

            if (action === "remove") {
                for (idx = 0, length = e.items.length; idx < length; idx++) {
                    if (!e.items[idx].isNew || !e.items[idx].isNew()) {
                        that._destroyed.push(e.items[idx]);
                    }
                }
            }

            if (that.options.autoSync && (action === "add" || action === "remove" || action === "itemchange")) {
                that.sync();
            } else {
                var total = parseInt(that._total, 10);
                if (!isNumber(that._total)) {
                    total = parseInt(that._pristineTotal, 10);
                }
                if (action === "add") {
                    total += e.items.length;
                } else if (action === "remove") {
                    total -= e.items.length;
                } else if (action !== "itemchange" && action !== "sync" && !that.options.serverPaging) {
                    total = that._pristineTotal;
                } else if (action === "sync") {
                    total = that._pristineTotal = parseInt(that._total, 10);
                }

                that._total = total;

                that._process(that._data, e);
            }
        },

        _calculateAggregates: function (data, options) {
            options = options || {};

            var query = new Query(data),
                aggregates = options.aggregate,
                filter = options.filter;

            if (filter) {
                query = query.filter(filter);
            }

            return query.aggregate(aggregates);
        },

        _process: function (data, e) {
            var that = this,
                options = {},
                result;

            if (that.options.serverPaging !== true) {
                options.skip = that._skip;
                options.take = that._take || that._pageSize;

                if(options.skip === undefined && that._page !== undefined && that._pageSize !== undefined) {
                    options.skip = (that._page - 1) * that._pageSize;
                }
            }

            if (that.options.serverSorting !== true) {
                options.sort = that._sort;
            }

            if (that.options.serverFiltering !== true) {
                options.filter = that._filter;
            }

            if (that.options.serverGrouping !== true) {
                options.group = that._group;
            }

            if (that.options.serverAggregates !== true) {
                options.aggregate = that._aggregate;
                that._aggregateResult = that._calculateAggregates(data, options);
            }

            result = that._queryProcess(data, options);

            that.view(result.data);

            if (result.total !== undefined && !that.options.serverFiltering) {
                that._total = result.total;
            }

            e = e || {};

            e.items = e.items || that._view;

            that.trigger(CHANGE, e);
        },

        _queryProcess: function(data, options) {
            return Query.process(data, options);
        },

        _mergeState: function(options) {
            var that = this;

            if (options !== undefined) {
                that._pageSize = options.pageSize;
                that._page = options.page;
                that._sort = options.sort;
                that._filter = options.filter;
                that._group = options.group;
                that._aggregate = options.aggregate;
                that._skip = options.skip;
                that._take = options.take;

                if(that._skip === undefined) {
                    that._skip = that.skip();
                    options.skip = that.skip();
                }

                if(that._take === undefined && that._pageSize !== undefined) {
                    that._take = that._pageSize;
                    options.take = that._take;
                }

                if (options.sort) {
                    that._sort = options.sort = normalizeSort(options.sort);
                }

                if (options.filter) {
                    that._filter = options.filter = normalizeFilter(options.filter);
                }

                if (options.group) {
                    that._group = options.group = normalizeGroup(options.group);
                }
                if (options.aggregate) {
                    that._aggregate = options.aggregate = normalizeAggregate(options.aggregate);
                }
            }
            return options;
        },

        query: function(options) {
            var result;
            var remote = this.options.serverSorting || this.options.serverPaging || this.options.serverFiltering || this.options.serverGrouping || this.options.serverAggregates;

            if (remote || ((this._data === undefined || this._data.length === 0) && !this._destroyed.length)) {
                return this.read(this._mergeState(options));
            }

            var isPrevented = this.trigger(REQUESTSTART, { type: "read" });
            if (!isPrevented) {
                this.trigger(PROGRESS);

                result = this._queryProcess(this._data, this._mergeState(options));

                if (!this.options.serverFiltering) {
                    if (result.total !== undefined) {
                        this._total = result.total;
                    } else {
                        this._total = this._data.length;
                    }
                }

                this._aggregateResult = this._calculateAggregates(this._data, options);
                this.view(result.data);
                this.trigger(REQUESTEND, { type: "read" });
                this.trigger(CHANGE, { items: result.data });
            }

            return $.Deferred().resolve(isPrevented).promise();
        },

        fetch: function(callback) {
            var that = this;
            var fn = function(isPrevented) {
                if (isPrevented !== true && isFunction(callback)) {
                    callback.call(that);
                }
            };

            return this._query().then(fn);
        },

        _query: function(options) {
            var that = this;

            return that.query(extend({}, {
                page: that.page(),
                pageSize: that.pageSize(),
                sort: that.sort(),
                filter: that.filter(),
                group: that.group(),
                aggregate: that.aggregate()
            }, options));
        },

        next: function(options) {
            var that = this,
                page = that.page(),
                total = that.total();

            options = options || {};

            if (!page || (total && page + 1 > that.totalPages())) {
                return;
            }

            that._skip = page * that.take();

            page += 1;
            options.page = page;

            that._query(options);

            return page;
        },

        prev: function(options) {
            var that = this,
                page = that.page();

            options = options || {};

            if (!page || page === 1) {
                return;
            }

            that._skip = that._skip - that.take();

            page -= 1;
            options.page = page;

            that._query(options);

            return page;
        },

        page: function(val) {
            var that = this,
            skip;

            if(val !== undefined) {
                val = math.max(math.min(math.max(val, 1), that.totalPages()), 1);
                that._query({ page: val });
                return;
            }
            skip = that.skip();

            return skip !== undefined ? math.round((skip || 0) / (that.take() || 1)) + 1 : undefined;
        },

        pageSize: function(val) {
            var that = this;

            if(val !== undefined) {
                that._query({ pageSize: val, page: 1 });
                return;
            }

            return that.take();
        },

        sort: function(val) {
            var that = this;

            if(val !== undefined) {
                that._query({ sort: val });
                return;
            }

            return that._sort;
        },

        filter: function(val) {
            var that = this;

            if (val === undefined) {
                return that._filter;
            }

            that.trigger("reset");
            that._query({ filter: val, page: 1 });
        },

        group: function(val) {
            var that = this;

            if(val !== undefined) {
                that._query({ group: val });
                return;
            }

            return that._group;
        },

        total: function() {
            return parseInt(this._total || 0, 10);
        },

        aggregate: function(val) {
            var that = this;

            if(val !== undefined) {
                that._query({ aggregate: val });
                return;
            }

            return that._aggregate;
        },

        aggregates: function() {
            var result = this._aggregateResult;

            if (isEmptyObject(result)) {
                result = this._emptyAggregates(this.aggregate());
            }

            return result;
        },

        _emptyAggregates: function(aggregates) {
            var result = {};

            if (!isEmptyObject(aggregates)) {
                var aggregate = {};

                if (!isArray(aggregates)){
                    aggregates = [aggregates];
                }

                for (var idx = 0; idx <aggregates.length; idx++) {
                    aggregate[aggregates[idx].aggregate] = 0;
                    result[aggregates[idx].field] = aggregate;
                }
            }

            return result;
        },

        _wrapInEmptyGroup: function(model) {
            var groups = this.group(),
                parent,
                group,
                idx,
                length;

            for (idx = groups.length-1, length = 0; idx >= length; idx--) {
                group = groups[idx];
                parent = {
                    value: model.get(group.field),
                    field: group.field,
                    items: parent ? [parent] : [model],
                    hasSubgroups: !!parent,
                    aggregates: this._emptyAggregates(group.aggregates)
                };
            }

            return parent;
        },

        totalPages: function() {
            var that = this,
            pageSize = that.pageSize() || that.total();

            return math.ceil((that.total() || 0) / pageSize);
        },

        inRange: function(skip, take) {
            var that = this,
                end = math.min(skip + take, that.total());

            if (!that.options.serverPaging && that._data.length > 0) {
                return true;
            }

            return that._findRange(skip, end).length > 0;
        },

        lastRange: function() {
            var ranges = this._ranges;
            return ranges[ranges.length - 1] || { start: 0, end: 0, data: [] };
        },

        firstItemUid: function() {
            var ranges = this._ranges;
            return ranges.length && ranges[0].data.length && ranges[0].data[0].uid;
        },

        enableRequestsInProgress: function() {
            this._skipRequestsInProgress = false;
        },

        _timeStamp: function() {
            return new Date().getTime();
        },

        range: function(skip, take) {
            this._currentRequestTimeStamp = this._timeStamp();
            this._skipRequestsInProgress = true;

            skip = math.min(skip || 0, this.total());

            var that = this,
                pageSkip = math.max(math.floor(skip / take), 0) * take,
                size = math.min(pageSkip + take, that.total()),
                data;

            data = that._findRange(skip, math.min(skip + take, that.total()));

            if (data.length) {

                that._pending = undefined;

                that._skip = skip > that.skip() ? math.min(size, (that.totalPages() - 1) * that.take()) : pageSkip;

                that._take = take;

                var paging = that.options.serverPaging;
                var sorting = that.options.serverSorting;
                var filtering = that.options.serverFiltering;
                var aggregates = that.options.serverAggregates;
                try {
                    that.options.serverPaging = true;
                    if (!that._isServerGrouped() && !(that.group() && that.group().length)) {
                        that.options.serverSorting = true;
                    }
                    that.options.serverFiltering = true;
                    that.options.serverPaging = true;
                    that.options.serverAggregates = true;

                    if (paging) {
                        that._detachObservableParents();
                        that._data = data = that._observe(data);
                    }
                    that._process(data);
                } finally {
                    that.options.serverPaging = paging;
                    that.options.serverSorting = sorting;
                    that.options.serverFiltering = filtering;
                    that.options.serverAggregates = aggregates;
                }

                return;
            }

            if (take !== undefined) {
                if (!that._rangeExists(pageSkip, size)) {
                    that.prefetch(pageSkip, take, function() {
                        if (skip > pageSkip && size < that.total() && !that._rangeExists(size, math.min(size + take, that.total()))) {
                            that.prefetch(size, take, function() {
                                that.range(skip, take);
                            });
                        } else {
                            that.range(skip, take);
                        }
                    });
                } else if (pageSkip < skip) {
                    that.prefetch(size, take, function() {
                        that.range(skip, take);
                    });
                }
            }
        },

        _findRange: function(start, end) {
            var that = this,
                ranges = that._ranges,
                range,
                data = [],
                skipIdx,
                takeIdx,
                startIndex,
                endIndex,
                rangeData,
                rangeEnd,
                processed,
                options = that.options,
                remote = options.serverSorting || options.serverPaging || options.serverFiltering || options.serverGrouping || options.serverAggregates,
                flatData,
                count,
                length;

            for (skipIdx = 0, length = ranges.length; skipIdx < length; skipIdx++) {
                range = ranges[skipIdx];
                if (start >= range.start && start <= range.end) {
                    count = 0;

                    for (takeIdx = skipIdx; takeIdx < length; takeIdx++) {
                        range = ranges[takeIdx];
                        flatData = that._flatData(range.data, true);

                        if (flatData.length && start + count >= range.start) {
                            rangeData = range.data;
                            rangeEnd = range.end;

                            if (!remote) {
                                var sort = normalizeGroup(that.group() || []).concat(normalizeSort(that.sort() || []));
                                processed = that._queryProcess(range.data, { sort: sort, filter: that.filter() });
                                flatData = rangeData = processed.data;

                                if (processed.total !== undefined) {
                                    rangeEnd = processed.total;
                                }
                            }

                            startIndex = 0;
                            if (start + count > range.start) {
                                startIndex = (start + count) - range.start;
                            }
                            endIndex = flatData.length;
                            if (rangeEnd > end) {
                                endIndex = endIndex - (rangeEnd - end);
                            }
                            count += endIndex - startIndex;
                            data = that._mergeGroups(data, rangeData, startIndex, endIndex);

                            if (end <= range.end && count == end - start) {
                                return data;
                            }
                        }
                    }
                    break;
                }
            }
            return [];
        },

        _mergeGroups: function(data, range, skip, take) {
            if (this._isServerGrouped()) {
                var temp = range.toJSON(),
                    prevGroup;

                if (data.length) {
                    prevGroup = data[data.length - 1];
                }

                mergeGroups(prevGroup, temp, skip, take);

                return data.concat(temp);
            }
            return data.concat(range.slice(skip, take));
        },

        skip: function() {
            var that = this;

            if (that._skip === undefined) {
                return (that._page !== undefined ? (that._page  - 1) * (that.take() || 1) : undefined);
            }
            return that._skip;
        },

        take: function() {
            return this._take || this._pageSize;
        },

        _prefetchSuccessHandler: function (skip, size, callback, force) {
            var that = this;
            var timestamp = that._timeStamp();

            return function(data) {
                var found = false,
                    range = { start: skip, end: size, data: [], timestamp: that._timeStamp() },
                    idx,
                    length,
                    temp;

                that._dequeueRequest();

                that.trigger(REQUESTEND, { response: data, type: "read" });

                data = that.reader.parse(data);

                temp = that._readData(data);

                if (temp.length) {

                    for (idx = 0, length = that._ranges.length; idx < length; idx++) {
                        if (that._ranges[idx].start === skip) {
                            found = true;
                            range = that._ranges[idx];
                            break;
                        }
                    }
                    if (!found) {
                        that._ranges.push(range);
                    }
                }

                range.data = that._observe(temp);
                range.end = range.start + that._flatData(range.data, true).length;
                that._ranges.sort( function(x, y) { return x.start - y.start; } );
                that._total = that.reader.total(data);

                if (force || (timestamp >= that._currentRequestTimeStamp || !that._skipRequestsInProgress)) {
                    if (callback && temp.length) {
                        callback();
                    } else {
                        that.trigger(CHANGE, {});
                    }
                }
            };
        },

        prefetch: function(skip, take, callback) {
            var that = this,
                size = math.min(skip + take, that.total()),
                options = {
                    take: take,
                    skip: skip,
                    page: skip / take + 1,
                    pageSize: take,
                    sort: that._sort,
                    filter: that._filter,
                    group: that._group,
                    aggregate: that._aggregate
                };

            if (!that._rangeExists(skip, size)) {
                clearTimeout(that._timeout);

                that._timeout = setTimeout(function() {
                    that._queueRequest(options, function() {
                        if (!that.trigger(REQUESTSTART, { type: "read" })) {
                            that.transport.read({
                                data: that._params(options),
                                success: that._prefetchSuccessHandler(skip, size, callback),
                                error: function() {
                                    var args = slice.call(arguments);
                                    that.error.apply(that, args);
                                }
                            });
                        } else {
                            that._dequeueRequest();
                        }
                    });
                }, 100);
            } else if (callback) {
                callback();
            }
        },

        _multiplePrefetch: function(skip, take, callback) {
            var that = this,
                size = math.min(skip + take, that.total()),
                options = {
                    take: take,
                    skip: skip,
                    page: skip / take + 1,
                    pageSize: take,
                    sort: that._sort,
                    filter: that._filter,
                    group: that._group,
                    aggregate: that._aggregate
                };

            if (!that._rangeExists(skip, size)) {
                if (!that.trigger(REQUESTSTART, { type: "read" })) {
                    that.transport.read({
                        data: that._params(options),
                        success: that._prefetchSuccessHandler(skip, size, callback, true)
                    });
                }
            } else if (callback) {
                callback();
            }
        },

        _rangeExists: function(start, end) {
            var that = this,
                ranges = that._ranges,
                idx,
                length;

            for (idx = 0, length = ranges.length; idx < length; idx++) {
                if (ranges[idx].start <= start && ranges[idx].end >= end) {
                    return true;
                }
            }
            return false;
        },

        _removeModelFromRanges: function(model) {
            var result,
                found,
                range;

            for (var idx = 0, length = this._ranges.length; idx < length; idx++) {
                range = this._ranges[idx];

                this._eachItem(range.data, function(items) {
                    result = removeModel(items, model);
                    if (result) {
                        found = true;
                    }
                });

                if (found) {
                    break;
                }
            }
        },

        _updateRangesLength: function() {
            var startOffset = 0,
                range,
                rangeLength;

            for (var idx = 0, length = this._ranges.length; idx < length; idx++) {
                range = this._ranges[idx];
                range.start = range.start - startOffset;

                rangeLength = this._flatData(range.data, true).length;
                startOffset = range.end - rangeLength;
                range.end = range.start + rangeLength;
            }
        }
    });

    var Transport = {};

    Transport.create = function(options, data, dataSource) {
        var transport,
            transportOptions = options.transport ? $.extend({}, options.transport) : null;

        if (transportOptions) {
            transportOptions.read = typeof transportOptions.read === STRING ? { url: transportOptions.read } : transportOptions.read;

            if (dataSource) {
                transportOptions.dataSource = dataSource;
            }

            if (options.type) {
                kendo.data.transports = kendo.data.transports || {};
                kendo.data.schemas = kendo.data.schemas || {};

                if (kendo.data.transports[options.type] && !isPlainObject(kendo.data.transports[options.type])) {
                    transport = new kendo.data.transports[options.type](extend(transportOptions, { data: data }));
                } else {
                    transportOptions = extend(true, {}, kendo.data.transports[options.type], transportOptions);
                }

                options.schema = extend(true, {}, kendo.data.schemas[options.type], options.schema);
            }

            if (!transport) {
                transport = isFunction(transportOptions.read) ? transportOptions : new RemoteTransport(transportOptions);
            }
        } else {
            transport = new LocalTransport({ data: options.data || [] });
        }
        return transport;
    };

    DataSource.create = function(options) {
        if (isArray(options) || options instanceof ObservableArray) {
           options = { data: options };
        }

        var dataSource = options || {},
            data = dataSource.data,
            fields = dataSource.fields,
            table = dataSource.table,
            select = dataSource.select,
            idx,
            length,
            model = {},
            field;

        if (!data && fields && !dataSource.transport) {
            if (table) {
                data = inferTable(table, fields);
            } else if (select) {
                data = inferSelect(select, fields);

                if (dataSource.group === undefined && data[0] && data[0].optgroup !== undefined) {
                    dataSource.group = "optgroup";
                }
            }
        }

        if (kendo.data.Model && fields && (!dataSource.schema || !dataSource.schema.model)) {
            for (idx = 0, length = fields.length; idx < length; idx++) {
                field = fields[idx];
                if (field.type) {
                    model[field.field] = field;
                }
            }

            if (!isEmptyObject(model)) {
                dataSource.schema = extend(true, dataSource.schema, { model:  { fields: model } });
            }
        }

        dataSource.data = data;

        select = null;
        dataSource.select = null;
        table = null;
        dataSource.table = null;

        return dataSource instanceof DataSource ? dataSource : new DataSource(dataSource);
    };

    function inferSelect(select, fields) {
        select = $(select)[0];
        var options = select.options;
        var firstField = fields[0];
        var secondField = fields[1];

        var data = [];
        var idx, length;
        var optgroup;
        var option;
        var record;
        var value;

        for (idx = 0, length = options.length; idx < length; idx++) {
            record = {};
            option = options[idx];
            optgroup = option.parentNode;

            if (optgroup === select) {
                optgroup = null;
            }

            if (option.disabled || (optgroup && optgroup.disabled)) {
                continue;
            }

            if (optgroup) {
                record.optgroup = optgroup.label;
            }

            record[firstField.field] = option.text;

            value = option.attributes.value;

            if (value && value.specified) {
                value = option.value;
            } else {
                value = option.text;
            }

            record[secondField.field] = value;

            data.push(record);
        }

        return data;
    }

    function inferTable(table, fields) {
        var tbody = $(table)[0].tBodies[0],
        rows = tbody ? tbody.rows : [],
        idx,
        length,
        fieldIndex,
        fieldCount = fields.length,
        data = [],
        cells,
        record,
        cell,
        empty;

        for (idx = 0, length = rows.length; idx < length; idx++) {
            record = {};
            empty = true;
            cells = rows[idx].cells;

            for (fieldIndex = 0; fieldIndex < fieldCount; fieldIndex++) {
                cell = cells[fieldIndex];
                if(cell.nodeName.toLowerCase() !== "th") {
                    empty = false;
                    record[fields[fieldIndex].field] = cell.innerHTML;
                }
            }
            if(!empty) {
                data.push(record);
            }
        }

        return data;
    }

    var Node = Model.define({
        idField: "id",

        init: function(value) {
            var that = this,
                hasChildren = that.hasChildren || value && value.hasChildren,
                childrenField = "items",
                childrenOptions = {};

            kendo.data.Model.fn.init.call(that, value);

            if (typeof that.children === STRING) {
                childrenField = that.children;
            }

            childrenOptions = {
                schema: {
                    data: childrenField,
                    model: {
                        hasChildren: hasChildren,
                        id: that.idField,
                        fields: that.fields
                    }
                }
            };

            if (typeof that.children !== STRING) {
                extend(childrenOptions, that.children);
            }

            childrenOptions.data = value;

            if (!hasChildren) {
                hasChildren = childrenOptions.schema.data;
            }

            if (typeof hasChildren === STRING) {
                hasChildren = kendo.getter(hasChildren);
            }

            if (isFunction(hasChildren)) {
                that.hasChildren = !!hasChildren.call(that, that);
            }

            that._childrenOptions = childrenOptions;

            if (that.hasChildren) {
                that._initChildren();
            }

            that._loaded = !!(value && (value[childrenField] || value._loaded));
        },

        _initChildren: function() {
            var that = this;
            var children, transport, parameterMap;

            if (!(that.children instanceof HierarchicalDataSource)) {
                children = that.children = new HierarchicalDataSource(that._childrenOptions);

                transport = children.transport;
                parameterMap = transport.parameterMap;

                transport.parameterMap = function(data, type) {
                    data[that.idField || "id"] = that.id;

                    if (parameterMap) {
                        data = parameterMap(data, type);
                    }

                    return data;
                };

                children.parent = function(){
                    return that;
                };

                children.bind(CHANGE, function(e){
                    e.node = e.node || that;
                    that.trigger(CHANGE, e);
                });

                children.bind(ERROR, function(e){
                    var collection = that.parent();

                    if (collection) {
                        e.node = e.node || that;
                        collection.trigger(ERROR, e);
                    }
                });

                that._updateChildrenField();
            }
        },

        append: function(model) {
            this._initChildren();
            this.loaded(true);
            this.children.add(model);
        },

        hasChildren: false,

        level: function() {
            var parentNode = this.parentNode(),
                level = 0;

            while (parentNode && parentNode.parentNode) {
                level++;
                parentNode = parentNode.parentNode ? parentNode.parentNode() : null;
            }

            return level;
        },

        _updateChildrenField: function() {
            var fieldName = this._childrenOptions.schema.data;

            this[fieldName || "items"] = this.children.data();
        },

        _childrenLoaded: function() {
            this._loaded = true;

            this._updateChildrenField();
        },

        load: function() {
            var options = {};
            var method = "_query";
            var children, promise;

            if (this.hasChildren) {
                this._initChildren();

                children = this.children;

                options[this.idField || "id"] = this.id;

                if (!this._loaded) {
                    children._data = undefined;
                    method = "read";
                }

                children.one(CHANGE, proxy(this._childrenLoaded, this));

                promise = children[method](options);
            } else {
                this.loaded(true);
            }

            return promise || $.Deferred().resolve().promise();
        },

        parentNode: function() {
            var array = this.parent();

            return array.parent();
        },

        loaded: function(value) {
            if (value !== undefined) {
                this._loaded = value;
            } else {
                return this._loaded;
            }
        },

        shouldSerialize: function(field) {
            return Model.fn.shouldSerialize.call(this, field) &&
                    field !== "children" &&
                    field !== "_loaded" &&
                    field !== "hasChildren" &&
                    field !== "_childrenOptions";
        }
    });

    function dataMethod(name) {
        return function() {
            var data = this._data,
                result = DataSource.fn[name].apply(this, slice.call(arguments));

            if (this._data != data) {
                this._attachBubbleHandlers();
            }

            return result;
        };
    }

    var HierarchicalDataSource = DataSource.extend({
        init: function(options) {
            var node = Node.define({
                children: options
            });

            DataSource.fn.init.call(this, extend(true, {}, { schema: { modelBase: node, model: node } }, options));

            this._attachBubbleHandlers();
        },

        _attachBubbleHandlers: function() {
            var that = this;

            that._data.bind(ERROR, function(e) {
                that.trigger(ERROR, e);
            });
        },

        remove: function(node){
            var parentNode = node.parentNode(),
                dataSource = this,
                result;

            if (parentNode && parentNode._initChildren) {
                dataSource = parentNode.children;
            }

            result = DataSource.fn.remove.call(dataSource, node);

            if (parentNode && !dataSource.data().length) {
                parentNode.hasChildren = false;
            }

            return result;
        },

        success: dataMethod("success"),

        data: dataMethod("data"),

        insert: function(index, model) {
            var parentNode = this.parent();

            if (parentNode && parentNode._initChildren) {
                parentNode.hasChildren = true;
                parentNode._initChildren();
            }

            return DataSource.fn.insert.call(this, index, model);
        },

        _find: function(method, value) {
            var idx, length, node, data, children;

            node = DataSource.fn[method].call(this, value);

            if (node) {
                return node;
            }

            data = this._flatData(this._data);

            if (!data) {
                return;
            }

            for (idx = 0, length = data.length; idx < length; idx++) {
                children = data[idx].children;

                if (!(children instanceof HierarchicalDataSource)) {
                    continue;
                }

                node = children[method](value);

                if (node) {
                    return node;
                }
            }
        },

        get: function(id) {
            return this._find("get", id);
        },

        getByUid: function(uid) {
            return this._find("getByUid", uid);
        }
    });

    function inferList(list, fields) {
        var items = $(list).children(),
            idx,
            length,
            data = [],
            record,
            textField = fields[0].field,
            urlField = fields[1] && fields[1].field,
            spriteCssClassField = fields[2] && fields[2].field,
            imageUrlField = fields[3] && fields[3].field,
            item,
            id,
            textChild,
            className,
            children;

        function elements(collection, tagName) {
            return collection.filter(tagName).add(collection.find(tagName));
        }

        for (idx = 0, length = items.length; idx < length; idx++) {
            record = { _loaded: true };
            item = items.eq(idx);

            textChild = item[0].firstChild;
            children = item.children();
            list = children.filter("ul");
            children = children.filter(":not(ul)");

            id = item.attr("data-id");

            if (id) {
                record.id = id;
            }

            if (textChild) {
                record[textField] = textChild.nodeType == 3 ? textChild.nodeValue : children.text();
            }

            if (urlField) {
                record[urlField] = elements(children, "a").attr("href");
            }

            if (imageUrlField) {
                record[imageUrlField] = elements(children, "img").attr("src");
            }

            if (spriteCssClassField) {
                className = elements(children, ".k-sprite").prop("className");
                record[spriteCssClassField] = className && $.trim(className.replace("k-sprite", ""));
            }

            if (list.length) {
                record.items = inferList(list.eq(0), fields);
            }

            if (item.attr("data-hasChildren") == "true") {
                record.hasChildren = true;
            }

            data.push(record);
        }

        return data;
    }

    HierarchicalDataSource.create = function(options) {
        options = options && options.push ? { data: options } : options;

        var dataSource = options || {},
            data = dataSource.data,
            fields = dataSource.fields,
            list = dataSource.list;

        if (data && data._dataSource) {
            return data._dataSource;
        }

        if (!data && fields && !dataSource.transport) {
            if (list) {
                data = inferList(list, fields);
            }
        }

        dataSource.data = data;

        return dataSource instanceof HierarchicalDataSource ? dataSource : new HierarchicalDataSource(dataSource);
    };

    var Buffer = kendo.Observable.extend({
        init: function(dataSource, viewSize, disablePrefetch) {
            kendo.Observable.fn.init.call(this);

            this._prefetching = false;
            this.dataSource = dataSource;
            this.prefetch = !disablePrefetch;

            var buffer = this;

            dataSource.bind("change", function() {
                buffer._change();
            });

            dataSource.bind("reset", function() {
                buffer._reset();
            });

            this._syncWithDataSource();

            this.setViewSize(viewSize);
        },

        setViewSize: function(viewSize) {
            this.viewSize = viewSize;
            this._recalculate();
        },

        at: function(index)  {
            var pageSize = this.pageSize,
                item,
                itemPresent = true,
                changeTo;

            if (index >= this.total()) {
                this.trigger("endreached", {index: index });
                return null;
            }

            if (!this.useRanges) {
               return this.dataSource.view()[index];
            }
            if (this.useRanges) {
                // out of range request
                if (index < this.dataOffset || index >= this.skip + pageSize) {
                    itemPresent = this.range(Math.floor(index / pageSize) * pageSize);
                }

                // prefetch
                if (index === this.prefetchThreshold) {
                    this._prefetch();
                }

                // mid-range jump - prefetchThreshold and nextPageThreshold may be equal, do not change to else if
                if (index === this.midPageThreshold) {
                    this.range(this.nextMidRange, true);
                }
                // next range jump
                else if (index === this.nextPageThreshold) {
                    this.range(this.nextFullRange);
                }
                // pull-back
                else if (index === this.pullBackThreshold) {
                    if (this.offset === this.skip) { // from full range to mid range
                        this.range(this.previousMidRange);
                    } else { // from mid range to full range
                        this.range(this.previousFullRange);
                    }
                }

                if (itemPresent) {
                    return this.dataSource.at(index - this.dataOffset);
                } else {
                    this.trigger("endreached", { index: index });
                    return null;
                }
            }
        },

        indexOf: function(item) {
            return this.dataSource.data().indexOf(item) + this.dataOffset;
        },

        total: function() {
            return parseInt(this.dataSource.total(), 10);
        },

        next: function() {
            var buffer = this,
                pageSize = buffer.pageSize,
                offset = buffer.skip - buffer.viewSize + pageSize,
                pageSkip = math.max(math.floor(offset / pageSize), 0) * pageSize;

            this.offset = offset;
            this.dataSource.prefetch(pageSkip, pageSize, function() {
                buffer._goToRange(offset, true);
            });
        },

        range: function(offset, nextRange) {
            if (this.offset === offset) {
                return true;
            }

            var buffer = this,
                pageSize = this.pageSize,
                pageSkip = math.max(math.floor(offset / pageSize), 0) * pageSize,
                dataSource = this.dataSource;

            if (nextRange) {
                pageSkip += pageSize;
            }

            if (dataSource.inRange(offset, pageSize)) {
                this.offset = offset;
                this._recalculate();
                this._goToRange(offset);
                return true;
            } else if (this.prefetch) {
                dataSource.prefetch(pageSkip, pageSize, function() {
                    buffer.offset = offset;
                    buffer._recalculate();
                    buffer._goToRange(offset, true);
                });
                return false;
            }

            return true;
        },

        syncDataSource: function() {
            var offset = this.offset;
            this.offset = null;
            this.range(offset);
        },

        destroy: function() {
            this.unbind();
        },

        _prefetch: function() {
            var buffer = this,
                pageSize = this.pageSize,
                prefetchOffset = this.skip + pageSize,
                dataSource = this.dataSource;

            if (!dataSource.inRange(prefetchOffset, pageSize) && !this._prefetching && this.prefetch) {
                this._prefetching = true;
                this.trigger("prefetching", { skip: prefetchOffset, take: pageSize });

                dataSource.prefetch(prefetchOffset, pageSize, function() {
                    buffer._prefetching = false;
                    buffer.trigger("prefetched", { skip: prefetchOffset, take: pageSize });
                });
            }
        },

        _goToRange: function(offset, expanding) {
            if (this.offset !== offset) {
                return;
            }

            this.dataOffset = offset;
            this._expanding = expanding;
            this.dataSource.range(offset, this.pageSize);
            this.dataSource.enableRequestsInProgress();
        },

        _reset: function() {
            this._syncPending = true;
        },

        _change: function() {
            var dataSource = this.dataSource;

            this.length = this.useRanges ? dataSource.lastRange().end : dataSource.view().length;

            if (this._syncPending) {
                this._syncWithDataSource();
                this._recalculate();
                this._syncPending = false;
                this.trigger("reset", { offset: this.offset });
            }

            this.trigger("resize");

            if (this._expanding) {
                this.trigger("expand");
            }

            delete this._expanding;
        },

        _syncWithDataSource: function() {
            var dataSource = this.dataSource;

            this._firstItemUid = dataSource.firstItemUid();
            this.dataOffset = this.offset = dataSource.skip() || 0;
            this.pageSize = dataSource.pageSize();
            this.useRanges = dataSource.options.serverPaging;
        },

        _recalculate: function() {
            var pageSize = this.pageSize,
                offset = this.offset,
                viewSize = this.viewSize,
                skip = Math.ceil(offset / pageSize) * pageSize;

            this.skip = skip;
            this.midPageThreshold = skip + pageSize - 1;
            this.nextPageThreshold = skip + viewSize - 1;
            this.prefetchThreshold = skip + Math.floor(pageSize / 3 * 2);
            this.pullBackThreshold = this.offset - 1;

            this.nextMidRange = skip + pageSize - viewSize;
            this.nextFullRange = skip;
            this.previousMidRange = offset - viewSize;
            this.previousFullRange = skip - pageSize;
        }
    });

    var BatchBuffer = kendo.Observable.extend({
        init: function(dataSource, batchSize) {
            var batchBuffer = this;

            kendo.Observable.fn.init.call(batchBuffer);

            this.dataSource = dataSource;
            this.batchSize = batchSize;
            this._total = 0;

            this.buffer = new Buffer(dataSource, batchSize * 3);

            this.buffer.bind({
                "endreached": function (e) {
                    batchBuffer.trigger("endreached", { index: e.index });
                },
                "prefetching": function (e) {
                    batchBuffer.trigger("prefetching", { skip: e.skip, take: e.take });
                },
                "prefetched": function (e) {
                    batchBuffer.trigger("prefetched", { skip: e.skip, take: e.take });
                },
                "reset": function () {
                    batchBuffer._total = 0;
                    batchBuffer.trigger("reset");
                },
                "resize": function () {
                    batchBuffer._total = Math.ceil(this.length / batchBuffer.batchSize);
                    batchBuffer.trigger("resize", { total: batchBuffer.total(), offset: this.offset });
                }
            });
        },

        syncDataSource: function() {
            this.buffer.syncDataSource();
        },

        at: function(index) {
            var buffer = this.buffer,
                skip = index * this.batchSize,
                take = this.batchSize,
                view = [],
                item;

            if (buffer.offset > skip) {
                buffer.at(buffer.offset - 1);
            }

            for (var i = 0; i < take; i++) {
                item = buffer.at(skip + i);

                if (item === null) {
                    break;
                }

                view.push(item);
            }

            return view;
        },

        total: function() {
            return this._total;
        },

        destroy: function() {
            this.buffer.destroy();
            this.unbind();
        }
    });

    extend(true, kendo.data, {
        readers: {
            json: DataReader
        },
        Query: Query,
        DataSource: DataSource,
        HierarchicalDataSource: HierarchicalDataSource,
        Node: Node,
        ObservableObject: ObservableObject,
        ObservableArray: ObservableArray,
        LazyObservableArray: LazyObservableArray,
        LocalTransport: LocalTransport,
        RemoteTransport: RemoteTransport,
        Cache: Cache,
        DataReader: DataReader,
        Model: Model,
        Buffer: Buffer,
        BatchBuffer: BatchBuffer
    });
})(window.kendo.jQuery);





(function ($, undefined) {
    var kendo = window.kendo,
        support = kendo.support,
        document = window.document,
        Class = kendo.Class,
        Observable = kendo.Observable,
        now = $.now,
        extend = $.extend,
        OS = support.mobileOS,
        invalidZeroEvents = OS && OS.android,
        DEFAULT_MIN_HOLD = 800,
        DEFAULT_THRESHOLD = support.browser.msie ? 5 : 0, // WP8 and W8 are very sensitive and always report move.

        // UserEvents events
        PRESS = "press",
        HOLD = "hold",
        SELECT = "select",
        START = "start",
        MOVE = "move",
        END = "end",
        CANCEL = "cancel",
        TAP = "tap",
        RELEASE = "release",
        GESTURESTART = "gesturestart",
        GESTURECHANGE = "gesturechange",
        GESTUREEND = "gestureend",
        GESTURETAP = "gesturetap";

    var THRESHOLD = {
        "api": 0,
        "touch": 0,
        "mouse": 9,
        "pointer": 9
    };

    var ENABLE_GLOBAL_SURFACE = (!support.touch || support.mouseAndTouchPresent);

    function touchDelta(touch1, touch2) {
        var x1 = touch1.x.location,
            y1 = touch1.y.location,
            x2 = touch2.x.location,
            y2 = touch2.y.location,
            dx = x1 - x2,
            dy = y1 - y2;

        return {
            center: {
               x: (x1 + x2) / 2,
               y: (y1 + y2) / 2
            },

            distance: Math.sqrt(dx*dx + dy*dy)
        };
    }

    function getTouches(e) {
        var touches = [],
            originalEvent = e.originalEvent,
            currentTarget = e.currentTarget,
            idx = 0, length,
            changedTouches,
            touch;

        if (e.api) {
            touches.push({
                id: 2,  // hardcoded ID for API call;
                event: e,
                target: e.target,
                currentTarget: e.target,
                location: e,
                type: "api"
            });
        }
        else if (e.type.match(/touch/)) {
            changedTouches = originalEvent ? originalEvent.changedTouches : [];
            for (length = changedTouches.length; idx < length; idx ++) {
                touch = changedTouches[idx];
                touches.push({
                    location: touch,
                    event: e,
                    target: touch.target,
                    currentTarget: currentTarget,
                    id: touch.identifier,
                    type: "touch"
                });
            }
        }
        else if (support.pointers || support.msPointers) {
            touches.push({
                location: originalEvent,
                event: e,
                target: e.target,
                currentTarget: currentTarget,
                id: originalEvent.pointerId,
                type: "pointer"
            });
        } else {
            touches.push({
                id: 1, // hardcoded ID for mouse event;
                event: e,
                target: e.target,
                currentTarget: currentTarget,
                location: e,
                type: "mouse"
            });
        }

        return touches;
    }

    var TouchAxis = Class.extend({
        init: function(axis, location) {
            var that = this;

            that.axis = axis;

            that._updateLocationData(location);

            that.startLocation = that.location;
            that.velocity = that.delta = 0;
            that.timeStamp = now();
        },

        move: function(location) {
            var that = this,
                offset = location["page" + that.axis],
                timeStamp = now(),
                timeDelta = (timeStamp - that.timeStamp) || 1; // Firing manually events in tests can make this 0;

            if (!offset && invalidZeroEvents) {
                return;
            }

            that.delta = offset - that.location;

            that._updateLocationData(location);

            that.initialDelta = offset - that.startLocation;
            that.velocity = that.delta / timeDelta;
            that.timeStamp = timeStamp;
        },

        _updateLocationData: function(location) {
            var that = this, axis = that.axis;

            that.location = location["page" + axis];
            that.client = location["client" + axis];
            that.screen = location["screen" + axis];
        }
    });

    var Touch = Class.extend({
        init: function(userEvents, target, touchInfo) {
            extend(this, {
                x: new TouchAxis("X", touchInfo.location),
                y: new TouchAxis("Y", touchInfo.location),
                type: touchInfo.type,
                threshold: userEvents.threshold || THRESHOLD[touchInfo.type],
                userEvents: userEvents,
                target: target,
                currentTarget: touchInfo.currentTarget,
                initialTouch: touchInfo.target,
                id: touchInfo.id,
                pressEvent: touchInfo,
                _moved: false,
                _finished: false
            });
        },

        press: function() {
            this._holdTimeout = setTimeout($.proxy(this, "_hold"), this.userEvents.minHold);
            this._trigger(PRESS, this.pressEvent);
        },

        _hold: function() {
            this._trigger(HOLD, this.pressEvent);
        },

        move: function(touchInfo) {
            var that = this;

            if (that._finished) { return; }

            that.x.move(touchInfo.location);
            that.y.move(touchInfo.location);

            if (!that._moved) {
                if (that._withinIgnoreThreshold()) {
                    return;
                }

                if (!UserEvents.current || UserEvents.current === that.userEvents) {
                    that._start(touchInfo);
                } else {
                    return that.dispose();
                }
            }

            // Event handlers may cancel the drag in the START event handler, hence the double check for pressed.
            if (!that._finished) {
                that._trigger(MOVE, touchInfo);
            }
        },

        end: function(touchInfo) {
            var that = this;

            that.endTime = now();

            if (that._finished) { return; }

            // Mark the object as finished if there are blocking operations in the event handlers (alert/confirm)
            that._finished = true;

            that._trigger(RELEASE, touchInfo); // Release should be fired before TAP (as click is after mouseup/touchend)

            if (that._moved) {
                that._trigger(END, touchInfo);
            } else {
                that._trigger(TAP, touchInfo);
            }

            clearTimeout(that._holdTimeout);

            that.dispose();
        },

        dispose: function() {
            var userEvents = this.userEvents,
                activeTouches = userEvents.touches;

            this._finished = true;
            this.pressEvent = null;
            clearTimeout(this._holdTimeout);

            activeTouches.splice($.inArray(this, activeTouches), 1);
        },

        skip: function() {
            this.dispose();
        },

        cancel: function() {
            this.dispose();
        },

        isMoved: function() {
            return this._moved;
        },

        _start: function(touchInfo) {
            clearTimeout(this._holdTimeout);

            this.startTime = now();
            this._moved = true;
            this._trigger(START, touchInfo);
        },

        _trigger: function(name, touchInfo) {
            var that = this,
                jQueryEvent = touchInfo.event,
                data = {
                    touch: that,
                    x: that.x,
                    y: that.y,
                    target: that.target,
                    event: jQueryEvent
                };

            if(that.userEvents.notify(name, data)) {
                jQueryEvent.preventDefault();
            }
        },

        _withinIgnoreThreshold: function() {
            var xDelta = this.x.initialDelta,
                yDelta = this.y.initialDelta;

            return Math.sqrt(xDelta * xDelta + yDelta * yDelta) <= this.threshold;
        }
    });

    function withEachUpEvent(callback) {
        var downEvents = kendo.eventMap.up.split(" "),
            idx = 0,
            length = downEvents.length;

        for(; idx < length; idx ++) {
            callback(downEvents[idx]);
        }
    }

    var UserEvents = Observable.extend({
        init: function(element, options) {
            var that = this,
                filter,
                ns = kendo.guid();

            options = options || {};
            filter = that.filter = options.filter;
            that.threshold = options.threshold || DEFAULT_THRESHOLD;
            that.minHold = options.minHold || DEFAULT_MIN_HOLD;
            that.touches = [];
            that._maxTouches = options.multiTouch ? 2 : 1;
            that.allowSelection = options.allowSelection;
            that.captureUpIfMoved = options.captureUpIfMoved;
            that.eventNS = ns;

            element = $(element).handler(that);
            Observable.fn.init.call(that);

            extend(that, {
                element: element,
                // the touch events lock to the element anyway, so no need for the global setting
                surface: options.global && ENABLE_GLOBAL_SURFACE ? $(document.documentElement) : $(options.surface || element),
                stopPropagation: options.stopPropagation,
                pressed: false
            });

            that.surface.handler(that)
                .on(kendo.applyEventMap("move", ns), "_move")
                .on(kendo.applyEventMap("up cancel", ns), "_end");

            element.on(kendo.applyEventMap("down", ns), filter, "_start");

            if (support.pointers || support.msPointers) {
                element.css("-ms-touch-action", "pinch-zoom double-tap-zoom");
            }

            if (options.preventDragEvent) {
                element.on(kendo.applyEventMap("dragstart", ns), kendo.preventDefault);
            }

            element.on(kendo.applyEventMap("mousedown", ns), filter, { root: element }, "_select");

            if (that.captureUpIfMoved && support.eventCapture) {
                var surfaceElement = that.surface[0],
                    preventIfMovingProxy = $.proxy(that.preventIfMoving, that);

                withEachUpEvent(function(eventName) {
                    surfaceElement.addEventListener(eventName, preventIfMovingProxy, true);
                });
            }

            that.bind([
            PRESS,
            HOLD,
            TAP,
            START,
            MOVE,
            END,
            RELEASE,
            CANCEL,
            GESTURESTART,
            GESTURECHANGE,
            GESTUREEND,
            GESTURETAP,
            SELECT
            ], options);
        },

        preventIfMoving: function(e) {
            if (this._isMoved()) {
                e.preventDefault();
            }
        },

        destroy: function() {
            var that = this;

            if (that._destroyed) {
                return;
            }

            that._destroyed = true;

            if (that.captureUpIfMoved && support.eventCapture) {
                var surfaceElement = that.surface[0];
                withEachUpEvent(function(eventName) {
                    surfaceElement.removeEventListener(eventName, that.preventIfMoving);
                });
            }

            that.element.kendoDestroy(that.eventNS);
            that.surface.kendoDestroy(that.eventNS);
            that.element.removeData("handler");
            that.surface.removeData("handler");
            that._disposeAll();

            that.unbind();
            delete that.surface;
            delete that.element;
            delete that.currentTarget;
        },

        capture: function() {
            UserEvents.current = this;
        },

        cancel: function() {
            this._disposeAll();
            this.trigger(CANCEL);
        },

        notify: function(eventName, data) {
            var that = this,
                touches = that.touches;

            if (this._isMultiTouch()) {
                switch(eventName) {
                    case MOVE:
                        eventName = GESTURECHANGE;
                        break;
                    case END:
                        eventName = GESTUREEND;
                        break;
                    case TAP:
                        eventName = GESTURETAP;
                        break;
                }

                extend(data, {touches: touches}, touchDelta(touches[0], touches[1]));
            }

            return this.trigger(eventName, extend(data, {type: eventName}));
        },

        // API
        press: function(x, y, target) {
            this._apiCall("_start", x, y, target);
        },

        move: function(x, y) {
            this._apiCall("_move", x, y);
        },

        end: function(x, y) {
            this._apiCall("_end", x, y);
        },

        _isMultiTouch: function() {
            return this.touches.length > 1;
        },

        _maxTouchesReached: function() {
            return this.touches.length >= this._maxTouches;
        },

        _disposeAll: function() {
            var touches = this.touches;
            while (touches.length > 0) {
                touches.pop().dispose();
            }
        },

        _isMoved: function() {
            return $.grep(this.touches, function(touch) {
                return touch.isMoved();
            }).length;
        },

        _select: function(e) {
           if (!this.allowSelection || this.trigger(SELECT, { event: e })) {
               e.preventDefault();
           }
        },

        _start: function(e) {
            var that = this,
                idx = 0,
                filter = that.filter,
                target,
                touches = getTouches(e),
                length = touches.length,
                touch,
                which = e.which;

            if ((which && which > 1) || (that._maxTouchesReached())){
                return;
            }

            UserEvents.current = null;

            that.currentTarget = e.currentTarget;

            if (that.stopPropagation) {
                e.stopPropagation();
            }

            for (; idx < length; idx ++) {
                if (that._maxTouchesReached()) {
                    break;
                }

                touch = touches[idx];

                if (filter) {
                    target = $(touch.currentTarget); // target.is(filter) ? target : target.closest(filter, that.element);
                } else {
                    target = that.element;
                }

                if (!target.length) {
                    continue;
                }

                touch = new Touch(that, target, touch);
                that.touches.push(touch);
                touch.press();

                if (that._isMultiTouch()) {
                    that.notify("gesturestart", {});
                }
            }
        },

        _move: function(e) {
            this._eachTouch("move", e);
        },

        _end: function(e) {
            this._eachTouch("end", e);
        },

        _eachTouch: function(methodName, e) {
            var that = this,
                dict = {},
                touches = getTouches(e),
                activeTouches = that.touches,
                idx,
                touch,
                touchInfo,
                matchingTouch;

            for (idx = 0; idx < activeTouches.length; idx ++) {
                touch = activeTouches[idx];
                dict[touch.id] = touch;
            }

            for (idx = 0; idx < touches.length; idx ++) {
                touchInfo = touches[idx];
                matchingTouch = dict[touchInfo.id];

                if (matchingTouch) {
                    matchingTouch[methodName](touchInfo);
                }
            }
        },

        _apiCall: function(type, x, y, target) {
            this[type]({
                api: true,
                pageX: x,
                pageY: y,
                clientX: x,
                clientY: y,
                target: $(target || this.element)[0],
                stopPropagation: $.noop,
                preventDefault: $.noop
            });
        }
    });

    UserEvents.defaultThreshold = function(value) {
        DEFAULT_THRESHOLD = value;
    };

    UserEvents.minHold = function(value) {
        DEFAULT_MIN_HOLD = value;
    };

    kendo.getTouches = getTouches;
    kendo.touchDelta = touchDelta;
    kendo.UserEvents = UserEvents;
 })(window.kendo.jQuery);





(function ($, undefined) {
    var kendo = window.kendo,
        Widget = kendo.ui.Widget,
        proxy = $.proxy,
        abs = Math.abs,
        shift = Array.prototype.shift,
        ARIASELECTED = "aria-selected",
        SELECTED = "k-state-selected",
        ACTIVE = "k-state-selecting",
        SELECTABLE = "k-selectable",
        CHANGE = "change",
        NS = ".kendoSelectable",
        UNSELECTING = "k-state-unselecting",
        INPUTSELECTOR = "input,a,textarea,.k-multiselect-wrap,select,button,a.k-button>.k-icon,button.k-button>.k-icon,span.k-icon.k-i-expand,span.k-icon.k-i-collapse",
        msie = kendo.support.browser.msie,
        supportEventDelegation = false;

        (function($) {
            (function() {
                $('<div class="parent"><span /></div>')
                .on("click", ">*", function() {
                    supportEventDelegation = true;
                })
                .find("span")
                .click()
                .end()
                .off();
            })();
        })($);

    var Selectable = Widget.extend({
        init: function(element, options) {
            var that = this,
                multiple;

            Widget.fn.init.call(that, element, options);

            that._marquee = $("<div class='k-marquee'><div class='k-marquee-color'></div></div>");
            that._lastActive = null;
            that.element.addClass(SELECTABLE);

            that.relatedTarget = that.options.relatedTarget;

            multiple = that.options.multiple;

            if (this.options.aria && multiple) {
                that.element.attr("aria-multiselectable", true);
            }

            that.userEvents = new kendo.UserEvents(that.element, {
                global: true,
                allowSelection: true,
                filter: (!supportEventDelegation ? "." + SELECTABLE + " " : "") + that.options.filter,
                tap: proxy(that._tap, that)
            });

            if (multiple) {
                that.userEvents
                   .bind("start", proxy(that._start, that))
                   .bind("move", proxy(that._move, that))
                   .bind("end", proxy(that._end, that))
                   .bind("select", proxy(that._select, that));
            }
        },

        events: [CHANGE],

        options: {
            name: "Selectable",
            filter: ">*",
            multiple: false,
            relatedTarget: $.noop
        },

        _isElement: function(target) {
            var elements = this.element;
            var idx, length = elements.length, result = false;

            target = target[0];

            for (idx = 0; idx < length; idx ++) {
                if (elements[idx] === target) {
                    result = true;
                    break;
                }
            }

            return result;
        },

        _tap: function(e) {
            var target = $(e.target),
                that = this,
                ctrlKey = e.event.ctrlKey || e.event.metaKey,
                multiple = that.options.multiple,
                shiftKey = multiple && e.event.shiftKey,
                selected,
                whichCode = e.event.which,
                buttonCode = e.event.button;

            //in case of hierarchy or right-click
            if (!that._isElement(target.closest("." + SELECTABLE)) || whichCode && whichCode == 3 || buttonCode && buttonCode == 2) {
                return;
            }

            if (!this._allowSelection(e.event.target)) {
                return;
            }

            selected = target.hasClass(SELECTED);
            if (!multiple || !ctrlKey) {
                that.clear();
            }

            target = target.add(that.relatedTarget(target));

            if (shiftKey) {
                that.selectRange(that._firstSelectee(), target);
            } else {
                if (selected && ctrlKey) {
                    that._unselect(target);
                    that._notify(CHANGE);
                } else {
                    that.value(target);
                }

                that._lastActive = that._downTarget = target;
            }
        },

        _start: function(e) {
            var that = this,
                target = $(e.target),
                selected = target.hasClass(SELECTED),
                currentElement,
                ctrlKey = e.event.ctrlKey || e.event.metaKey;

            if (!this._allowSelection(e.event.target)) {
                return;
            }

            that._downTarget = target;

            //in case of hierarchy
            if (!that._isElement(target.closest("." + SELECTABLE))) {
                that.userEvents.cancel();
                return;
            }

            if (that.options.useAllItems) {
                that._items = that.element.find(that.options.filter);
            } else {
                currentElement = target.closest(that.element);
                that._items = currentElement.find(that.options.filter);
            }

            e.sender.capture();

            that._marquee
                .appendTo(document.body)
                .css({
                    left: e.x.client + 1,
                    top: e.y.client + 1,
                    width: 0,
                    height: 0
                });

            if (!ctrlKey) {
                that.clear();
            }

            target = target.add(that.relatedTarget(target));
            if (selected) {
                that._selectElement(target, true);
                if (ctrlKey) {
                    target.addClass(UNSELECTING);
                }
            }
        },

        _move: function(e) {
            var that = this,
                position = {
                    left: e.x.startLocation > e.x.location ? e.x.location : e.x.startLocation,
                    top: e.y.startLocation > e.y.location ? e.y.location : e.y.startLocation,
                    width: abs(e.x.initialDelta),
                    height: abs(e.y.initialDelta)
                };

            that._marquee.css(position);

            that._invalidateSelectables(position, (e.event.ctrlKey || e.event.metaKey));

            e.preventDefault();
        },

        _end: function() {
            var that = this;

            that._marquee.remove();

            that._unselect(that.element
                .find(that.options.filter + "." + UNSELECTING))
                .removeClass(UNSELECTING);


            var target = that.element.find(that.options.filter + "." + ACTIVE);
            target = target.add(that.relatedTarget(target));

            that.value(target);
            that._lastActive = that._downTarget;
            that._items = null;
        },

        _invalidateSelectables: function(position, ctrlKey) {
            var idx,
                length,
                target = this._downTarget[0],
                items = this._items,
                related,
                toSelect;

            for (idx = 0, length = items.length; idx < length; idx ++) {
                toSelect = items.eq(idx);
                related = toSelect.add(this.relatedTarget(toSelect));

                if (collision(toSelect, position)) {
                    if(toSelect.hasClass(SELECTED)) {
                        if(ctrlKey && target !== toSelect[0]) {
                            related.removeClass(SELECTED).addClass(UNSELECTING);
                        }
                    } else if (!toSelect.hasClass(ACTIVE) && !toSelect.hasClass(UNSELECTING)) {
                        related.addClass(ACTIVE);
                    }
                } else {
                    if (toSelect.hasClass(ACTIVE)) {
                        related.removeClass(ACTIVE);
                    } else if(ctrlKey && toSelect.hasClass(UNSELECTING)) {
                        related.removeClass(UNSELECTING).addClass(SELECTED);
                    }
                }
            }
        },

        value: function(val) {
            var that = this,
                selectElement = proxy(that._selectElement, that);

            if(val) {
                val.each(function() {
                    selectElement(this);
                });

                that._notify(CHANGE);
                return;
            }

            return that.element.find(that.options.filter + "." + SELECTED);
        },

        _firstSelectee: function() {
            var that = this,
                selected;

            if(that._lastActive !== null) {
                return that._lastActive;
            }

            selected = that.value();
            return selected.length > 0 ?
                    selected[0] :
                    that.element.find(that.options.filter)[0];
        },

        _selectElement: function(element, preventNotify) {
            var toSelect = $(element),
                isPrevented =  !preventNotify && this._notify("select", { element: element });

            toSelect.removeClass(ACTIVE);
            if(!isPrevented) {
                 toSelect.addClass(SELECTED);

                if (this.options.aria) {
                    toSelect.attr(ARIASELECTED, true);
                }
            }
        },

        _notify: function(name, args) {
            args = args || { };
            return this.trigger(name, args);
        },

        _unselect: function(element) {
            element.removeClass(SELECTED);

            if (this.options.aria) {
                element.attr(ARIASELECTED, false);
            }

            return element;
        },

        _select: function(e) {
            if (this._allowSelection(e.event.target)) {
                if (!msie || (msie && !$(kendo._activeElement()).is(INPUTSELECTOR))) {
                    e.preventDefault();
                }
            }
        },

        _allowSelection: function(target) {
            if ($(target).is(INPUTSELECTOR)) {
                this.userEvents.cancel();
                this._downTarget = null;
                return false;
            }

            return true;
        },

        resetTouchEvents: function() {
            this.userEvents.cancel();
        },

        clear: function() {
            var items = this.element.find(this.options.filter + "." + SELECTED);
            this._unselect(items);
        },

        selectRange: function(start, end) {
            var that = this,
                idx,
                tmp,
                items;

            that.clear();

            if (that.element.length > 1) {
                items = that.options.continuousItems();
            }

            if (!items || !items.length) {
                items = that.element.find(that.options.filter);
            }

            start = $.inArray($(start)[0], items);
            end = $.inArray($(end)[0], items);

            if (start > end) {
                tmp = start;
                start = end;
                end = tmp;
            }

            if (!that.options.useAllItems) {
                end += that.element.length - 1;
            }

            for (idx = start; idx <= end; idx ++ ) {
                that._selectElement(items[idx]);
            }

            that._notify(CHANGE);
        },

        destroy: function() {
            var that = this;

            Widget.fn.destroy.call(that);

            that.element.off(NS);

            that.userEvents.destroy();

            that._marquee = that._lastActive = that.element = that.userEvents = null;
        }
    });

    Selectable.parseOptions = function(selectable) {
        var asLowerString = typeof selectable === "string" && selectable.toLowerCase();

        return {
            multiple: asLowerString && asLowerString.indexOf("multiple") > -1,
            cell: asLowerString && asLowerString.indexOf("cell") > -1
        };
    };

    function collision(element, position) {
        if (!element.is(":visible")) {
            return false;
        }

        var elementPosition = kendo.getOffset(element),
            right = position.left + position.width,
            bottom = position.top + position.height;

        elementPosition.right = elementPosition.left + element.outerWidth();
        elementPosition.bottom = elementPosition.top + element.outerHeight();

        return !(elementPosition.left > right||
            elementPosition.right < position.left ||
            elementPosition.top > bottom ||
            elementPosition.bottom < position.top);
    }

    kendo.ui.plugin(Selectable);

})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
        support = kendo.support,
        ui = kendo.ui,
        Widget = ui.Widget,
        keys = kendo.keys,
        parse = kendo.parseDate,
        adjustDST = kendo.date.adjustDST,
        extractFormat = kendo._extractFormat,
        template = kendo.template,
        getCulture = kendo.getCulture,
        transitions = kendo.support.transitions,
        transitionOrigin = transitions ? transitions.css + "transform-origin" : "",
        cellTemplate = template('<td#=data.cssClass# role="gridcell"><a tabindex="-1" class="k-link" href="\\#" data-#=data.ns#value="#=data.dateString#">#=data.value#</a></td>', { useWithBlock: false }),
        emptyCellTemplate = template('<td role="gridcell">&nbsp;</td>', { useWithBlock: false }),
        browser = kendo.support.browser,
        isIE8 = browser.msie && browser.version < 9,
        ns = ".kendoCalendar",
        CLICK = "click" + ns,
        KEYDOWN_NS = "keydown" + ns,
        ID = "id",
        MIN = "min",
        LEFT = "left",
        SLIDE = "slideIn",
        MONTH = "month",
        CENTURY = "century",
        CHANGE = "change",
        NAVIGATE = "navigate",
        VALUE = "value",
        HOVER = "k-state-hover",
        DISABLED = "k-state-disabled",
        FOCUSED = "k-state-focused",
        OTHERMONTH = "k-other-month",
        OTHERMONTHCLASS = ' class="' + OTHERMONTH + '"',
        TODAY = "k-nav-today",
        CELLSELECTOR = "td:has(.k-link)",
        BLUR = "blur" + ns,
        FOCUS = "focus",
        FOCUS_WITH_NS = FOCUS + ns,
        MOUSEENTER = support.touch ? "touchstart" : "mouseenter",
        MOUSEENTER_WITH_NS = support.touch ? "touchstart" + ns : "mouseenter" + ns,
        MOUSELEAVE = support.touch ? "touchend" + ns + " touchmove" + ns : "mouseleave" + ns,
        MS_PER_MINUTE = 60000,
        MS_PER_DAY = 86400000,
        PREVARROW = "_prevArrow",
        NEXTARROW = "_nextArrow",
        ARIA_DISABLED = "aria-disabled",
        ARIA_SELECTED = "aria-selected",
        proxy = $.proxy,
        extend = $.extend,
        DATE = Date,
        views = {
            month: 0,
            year: 1,
            decade: 2,
            century: 3
        };

    var Calendar = Widget.extend({
        init: function(element, options) {
            var that = this, value, id;

            Widget.fn.init.call(that, element, options);

            element = that.wrapper = that.element;
            options = that.options;

            options.url = window.unescape(options.url);

            that._templates();

            that._header();

            that._footer(that.footer);

            id = element
                    .addClass("k-widget k-calendar")
                    .on(MOUSEENTER_WITH_NS + " " + MOUSELEAVE, CELLSELECTOR, mousetoggle)
                    .on(KEYDOWN_NS, "table.k-content", proxy(that._move, that))
                    .on(CLICK, CELLSELECTOR, function(e) {
                        var link = e.currentTarget.firstChild;

                        if (link.href.indexOf("#") != -1) {
                            e.preventDefault();
                        }

                        that._click($(link));
                    })
                    .on("mouseup" + ns, "table.k-content, .k-footer", function() {
                        that._focusView(that.options.focusOnNav !== false);
                    })
                    .attr(ID);

            if (id) {
                that._cellID = id + "_cell_selected";
            }

            normalize(options);
            value = parse(options.value, options.format, options.culture);

            that._index = views[options.start];
            that._current = new DATE(+restrictValue(value, options.min, options.max));

            that._addClassProxy = function() {
                that._active = true;
                that._cell.addClass(FOCUSED);
            };

            that._removeClassProxy = function() {
                that._active = false;
                that._cell.removeClass(FOCUSED);
            };

            that.value(value);

            kendo.notify(that);
        },

        options: {
            name: "Calendar",
            value: null,
            min: new DATE(1900, 0, 1),
            max: new DATE(2099, 11, 31),
            dates: [],
            url: "",
            culture: "",
            footer : "",
            format : "",
            month : {},
            start: MONTH,
            depth: MONTH,
            animation: {
                horizontal: {
                    effects: SLIDE,
                    reverse: true,
                    duration: 500,
                    divisor: 2
                },
                vertical: {
                    effects: "zoomIn",
                    duration: 400
                }
            }
        },

        events: [
            CHANGE,
            NAVIGATE
        ],

        setOptions: function(options) {
            var that = this;

            normalize(options);

            if (!options.dates[0]) {
                options.dates = that.options.dates;
            }

            Widget.fn.setOptions.call(that, options);

            that._templates();

            that._footer(that.footer);
            that._index = views[that.options.start];

            that.navigate();
        },

        destroy: function() {
            var that = this,
                today = that._today;

            that.element.off(ns);
            that._title.off(ns);
            that[PREVARROW].off(ns);
            that[NEXTARROW].off(ns);

            kendo.destroy(that._table);

            if (today) {
                kendo.destroy(today.off(ns));
            }

            Widget.fn.destroy.call(that);
        },

        current: function() {
            return this._current;
        },

        view: function() {
            return this._view;
        },

        focus: function(table) {
            table = table || this._table;
            this._bindTable(table);
            table.focus();
        },

        min: function(value) {
            return this._option(MIN, value);
        },

        max: function(value) {
            return this._option("max", value);
        },

        navigateToPast: function() {
            this._navigate(PREVARROW, -1);
        },

        navigateToFuture: function() {
            this._navigate(NEXTARROW, 1);
        },

        navigateUp: function() {
            var that = this,
                index = that._index;

            if (that._title.hasClass(DISABLED)) {
                return;
            }

            that.navigate(that._current, ++index);
        },

        navigateDown: function(value) {
            var that = this,
            index = that._index,
            depth = that.options.depth;

            if (!value) {
                return;
            }

            if (index === views[depth]) {
                if (+that._value != +value) {
                    that.value(value);
                    that.trigger(CHANGE);
                }
                return;
            }

            that.navigate(value, --index);
        },

        navigate: function(value, view) {
            view = isNaN(view) ? views[view] : view;

            var that = this,
                options = that.options,
                culture = options.culture,
                min = options.min,
                max = options.max,
                title = that._title,
                from = that._table,
                old = that._oldTable,
                selectedValue = that._value,
                currentValue = that._current,
                future = value && +value > +currentValue,
                vertical = view !== undefined && view !== that._index,
                to, currentView, compare,
                disabled;

            if (!value) {
                value = currentValue;
            }

            that._current = value = new DATE(+restrictValue(value, min, max));

            if (view === undefined) {
                view = that._index;
            } else {
                that._index = view;
            }

            that._view = currentView = calendar.views[view];
            compare = currentView.compare;

            disabled = view === views[CENTURY];
            title.toggleClass(DISABLED, disabled).attr(ARIA_DISABLED, disabled);

            disabled = compare(value, min) < 1;
            that[PREVARROW].toggleClass(DISABLED, disabled).attr(ARIA_DISABLED, disabled);

            disabled = compare(value, max) > -1;
            that[NEXTARROW].toggleClass(DISABLED, disabled).attr(ARIA_DISABLED, disabled);

            if (from && old && old.data("animating")) {
                old.kendoStop(true, true);
                from.kendoStop(true, true);
            }

            that._oldTable = from;

            if (!from || that._changeView) {
                title.html(currentView.title(value, min, max, culture));

                that._table = to = $(currentView.content(extend({
                    min: min,
                    max: max,
                    date: value,
                    url: options.url,
                    dates: options.dates,
                    format: options.format,
                    culture: culture
                }, that[currentView.name])));

                makeUnselectable(to);

                that._animate({
                    from: from,
                    to: to,
                    vertical: vertical,
                    future: future
                });

                that._focus(value);
                that.trigger(NAVIGATE);
            }

            if (view === views[options.depth] && selectedValue) {
                that._class("k-state-selected", currentView.toDateString(selectedValue));
            }

            that._class(FOCUSED, currentView.toDateString(value));

            if (!from && that._cell) {
                that._cell.removeClass(FOCUSED);
            }

            that._changeView = true;
        },

        value: function(value) {
            var that = this,
            view = that._view,
            options = that.options,
            old = that._view,
            min = options.min,
            max = options.max;

            if (value === undefined) {
                return that._value;
            }

            value = parse(value, options.format, options.culture);

            if (value !== null) {
                value = new DATE(+value);

                if (!isInRange(value, min, max)) {
                    value = null;
                }
            }

            that._value = value;

            if (old && value === null && that._cell) {
                that._cell.removeClass("k-state-selected");
            } else {
                that._changeView = !value || view && view.compare(value, that._current) !== 0;
                that.navigate(value);
            }
        },

        _move: function(e) {
            var that = this,
                options = that.options,
                key = e.keyCode,
                view = that._view,
                index = that._index,
                currentValue = new DATE(+that._current),
                isRtl = kendo.support.isRtl(that.wrapper),
                value, prevent, method, temp;

            if (e.target === that._table[0]) {
                that._active = true;
            }

            if (e.ctrlKey) {
                if (key == keys.RIGHT && !isRtl || key == keys.LEFT && isRtl) {
                    that.navigateToFuture();
                    prevent = true;
                } else if (key == keys.LEFT && !isRtl || key == keys.RIGHT && isRtl) {
                    that.navigateToPast();
                    prevent = true;
                } else if (key == keys.UP) {
                    that.navigateUp();
                    prevent = true;
                } else if (key == keys.DOWN) {
                    that._click($(that._cell[0].firstChild));
                    prevent = true;
                }
            } else {
                if (key == keys.RIGHT && !isRtl || key == keys.LEFT && isRtl) {
                    value = 1;
                    prevent = true;
                } else if (key == keys.LEFT && !isRtl || key == keys.RIGHT && isRtl) {
                    value = -1;
                    prevent = true;
                } else if (key == keys.UP) {
                    value = index === 0 ? -7 : -4;
                    prevent = true;
                } else if (key == keys.DOWN) {
                    value = index === 0 ? 7 : 4;
                    prevent = true;
                } else if (key == keys.ENTER) {
                    that._click($(that._cell[0].firstChild));
                    prevent = true;
                } else if (key == keys.HOME || key == keys.END) {
                    method = key == keys.HOME ? "first" : "last";
                    temp = view[method](currentValue);
                    currentValue = new DATE(temp.getFullYear(), temp.getMonth(), temp.getDate(), currentValue.getHours(), currentValue.getMinutes(), currentValue.getSeconds(), currentValue.getMilliseconds());
                    prevent = true;
                } else if (key == keys.PAGEUP) {
                    prevent = true;
                    that.navigateToPast();
                } else if (key == keys.PAGEDOWN) {
                    prevent = true;
                    that.navigateToFuture();
                }

                if (value || method) {
                    if (!method) {
                        view.setDate(currentValue, value);
                    }

                    that._focus(restrictValue(currentValue, options.min, options.max));
                }
            }

            if (prevent) {
                e.preventDefault();
            }

            return that._current;
        },

        _animate: function(options) {
            var that = this,
                from = options.from,
                to = options.to,
                active = that._active;

            if (!from) {
                to.insertAfter(that.element[0].firstChild);
                that._bindTable(to);
            } else if (from.parent().data("animating")) {
                from.off(ns);
                from.parent().kendoStop(true, true).remove();
                from.remove();

                to.insertAfter(that.element[0].firstChild);
                that._focusView(active);
            } else if (!from.is(":visible") || that.options.animation === false) {
                to.insertAfter(from);
                from.off(ns).remove();

                that._focusView(active);
            } else {
                that[options.vertical ? "_vertical" : "_horizontal"](from, to, options.future);
            }
        },

        _horizontal: function(from, to, future) {
            var that = this,
                active = that._active,
                horizontal = that.options.animation.horizontal,
                effects = horizontal.effects,
                viewWidth = from.outerWidth();

            if (effects && effects.indexOf(SLIDE) != -1) {
                from.add(to).css({ width: viewWidth });

                from.wrap("<div/>");

                that._focusView(active, from);

                from.parent()
                    .css({
                        position: "relative",
                        width: viewWidth * 2,
                        "float": LEFT,
                        "margin-left": future ? 0 : -viewWidth
                    });

                to[future ? "insertAfter" : "insertBefore"](from);

                extend(horizontal, {
                    effects: SLIDE + ":" + (future ? "right" : LEFT),
                    complete: function() {
                        from.off(ns).remove();
                        that._oldTable = null;

                        to.unwrap();

                        that._focusView(active);

                    }
                });

                from.parent().kendoStop(true, true).kendoAnimate(horizontal);
            }
        },

        _vertical: function(from, to) {
            var that = this,
                vertical = that.options.animation.vertical,
                effects = vertical.effects,
                active = that._active, //active state before from's blur
                cell, position;

            if (effects && effects.indexOf("zoom") != -1) {
                to.css({
                    position: "absolute",
                    top: from.prev().outerHeight(),
                    left: 0
                }).insertBefore(from);

                if (transitionOrigin) {
                    cell = that._cellByDate(that._view.toDateString(that._current));
                    position = cell.position();
                    position = (position.left + parseInt(cell.width() / 2, 10)) + "px" + " " + (position.top + parseInt(cell.height() / 2, 10) + "px");
                    to.css(transitionOrigin, position);
                }

                from.kendoStop(true, true).kendoAnimate({
                    effects: "fadeOut",
                    duration: 600,
                    complete: function() {
                        from.off(ns).remove();
                        that._oldTable = null;

                        to.css({
                            position: "static",
                            top: 0,
                            left: 0
                        });

                        that._focusView(active);
                    }
                });

                to.kendoStop(true, true).kendoAnimate(vertical);
            }
        },

        _cellByDate: function(value) {
            return this._table.find("td:not(." + OTHERMONTH + ")")
                       .filter(function() {
                           return $(this.firstChild).attr(kendo.attr(VALUE)) === value;
                       });
        },

        _class: function(className, value) {
            var that = this,
                id = that._cellID,
                cell = that._cell;

            if (cell) {
                cell.removeAttr(ARIA_SELECTED)
                    .removeAttr("aria-label")
                    .removeAttr(ID);
            }

            cell = that._table
                       .find("td:not(." + OTHERMONTH + ")")
                       .removeClass(className)
                       .filter(function() {
                          return $(this.firstChild).attr(kendo.attr(VALUE)) === value;
                       })
                       .attr(ARIA_SELECTED, true);

            if (className === FOCUSED && !that._active && that.options.focusOnNav !== false) {
                className = "";
            }

            cell.addClass(className);

            if (cell[0]) {
                that._cell = cell;
            }

            if (id) {
                cell.attr(ID, id);
                that._table.removeAttr("aria-activedescendant").attr("aria-activedescendant", id);
            }
        },

        _bindTable: function (table) {
            table
                .on(FOCUS_WITH_NS, this._addClassProxy)
                .on(BLUR, this._removeClassProxy);
        },

        _click: function(link) {
            var that = this,
                options = that.options,
                currentValue = new Date(+that._current),
                value = link.attr(kendo.attr(VALUE)).split("/");

            //Safari cannot create correctly date from "1/1/2090"
            value = new DATE(value[0], value[1], value[2]);
            adjustDST(value, 0);

            that._view.setDate(currentValue, value);

            that.navigateDown(restrictValue(currentValue, options.min, options.max));
        },

        _focus: function(value) {
            var that = this,
                view = that._view;

            if (view.compare(value, that._current) !== 0) {
                that.navigate(value);
            } else {
                that._current = value;
                that._class(FOCUSED, view.toDateString(value));
            }
        },

        _focusView: function(active, table) {
            if (active) {
                this.focus(table);
            }
        },

        _footer: function(template) {
            var that = this,
                today = getToday(),
                element = that.element,
                footer = element.find(".k-footer");

            if (!template) {
                that._toggle(false);
                footer.hide();
                return;
            }

            if (!footer[0]) {
                footer = $('<div class="k-footer"><a href="#" class="k-link k-nav-today"></a></div>').appendTo(element);
            }

            that._today = footer.show()
                                .find(".k-link")
                                .html(template(today))
                                .attr("title", kendo.toString(today, "D", that.options.culture));

            that._toggle();
        },

        _header: function() {
            var that = this,
            element = that.element,
            links;

            if (!element.find(".k-header")[0]) {
                element.html('<div class="k-header">' +
                             '<a href="#" role="button" class="k-link k-nav-prev"><span class="k-icon k-i-arrow-w"></span></a>' +
                             '<a href="#" role="button" aria-live="assertive" aria-atomic="true" class="k-link k-nav-fast"></a>' +
                             '<a href="#" role="button" class="k-link k-nav-next"><span class="k-icon k-i-arrow-e"></span></a>' +
                             '</div>');
            }

            links = element.find(".k-link")
                           .on(MOUSEENTER_WITH_NS + " " + MOUSELEAVE + " " + FOCUS_WITH_NS + " " + BLUR, mousetoggle)
                           .click(false);

            that._title = links.eq(1).on(CLICK, function() { that._active = that.options.focusOnNav !== false; that.navigateUp(); });
            that[PREVARROW] = links.eq(0).on(CLICK, function() { that._active = that.options.focusOnNav !== false; that.navigateToPast(); });
            that[NEXTARROW] = links.eq(2).on(CLICK, function() { that._active = that.options.focusOnNav !== false; that.navigateToFuture(); });
        },

        _navigate: function(arrow, modifier) {
            var that = this,
                index = that._index + 1,
                currentValue = new DATE(+that._current);

            arrow = that[arrow];

            if (!arrow.hasClass(DISABLED)) {
                if (index > 3) {
                    currentValue.setFullYear(currentValue.getFullYear() + 100 * modifier);
                } else {
                    calendar.views[index].setDate(currentValue, modifier);
                }

                that.navigate(currentValue);
            }
        },

        _option: function(option, value) {
            var that = this,
                options = that.options,
                currentValue = that._value || that._current,
                isBigger;

            if (value === undefined) {
                return options[option];
            }

            value = parse(value, options.format, options.culture);

            if (!value) {
                return;
            }

            options[option] = new DATE(+value);

            if (option === MIN) {
                isBigger = value > currentValue;
            } else {
                isBigger = currentValue > value;
            }

            if (isBigger || isEqualMonth(currentValue, value)) {
                if (isBigger) {
                    that._value = null;
                }
                that._changeView = true;
            }

            if (!that._changeView) {
                that._changeView = !!(options.month.content || options.month.empty);
            }

            that.navigate(that._value);

            that._toggle();
        },

        _toggle: function(toggle) {
            var that = this,
                options = that.options,
                link = that._today;

            if (toggle === undefined) {
                toggle = isInRange(getToday(), options.min, options.max);
            }

            if (link) {
                link.off(CLICK);

                if (toggle) {
                    link.addClass(TODAY)
                        .removeClass(DISABLED)
                        .on(CLICK, proxy(that._todayClick, that));
                } else {
                    link.removeClass(TODAY)
                        .addClass(DISABLED)
                        .on(CLICK, prevent);
                }
            }
        },

        _todayClick: function(e) {
            var that = this,
                depth = views[that.options.depth],
                today = getToday();

            e.preventDefault();

            if (that._view.compare(that._current, today) === 0 && that._index == depth) {
                that._changeView = false;
            }

            that._value = today;
            that.navigate(today, depth);

            that.trigger(CHANGE);
        },

        _templates: function() {
            var that = this,
                options = that.options,
                footer = options.footer,
                month = options.month,
                content = month.content,
                empty = month.empty;

            that.month = {
                content: template('<td#=data.cssClass# role="gridcell"><a tabindex="-1" class="k-link#=data.linkClass#" href="#=data.url#" ' + kendo.attr("value") + '="#=data.dateString#" title="#=data.title#">' + (content || "#=data.value#") + '</a></td>', { useWithBlock: !!content }),
                empty: template('<td role="gridcell">' + (empty || "&nbsp;") + "</td>", { useWithBlock: !!empty })
            };

            that.footer = footer !== false ? template(footer || '#= kendo.toString(data,"D","' + options.culture +'") #', { useWithBlock: false }) : null;
        }
    });

    ui.plugin(Calendar);

    var calendar = {
        firstDayOfMonth: function (date) {
            return new DATE(
                date.getFullYear(),
                date.getMonth(),
                1
            );
        },

        firstVisibleDay: function (date, calendarInfo) {
            calendarInfo = calendarInfo || kendo.culture().calendar;

            var firstDay = calendarInfo.firstDay,
            firstVisibleDay = new DATE(date.getFullYear(), date.getMonth(), 0, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());

            while (firstVisibleDay.getDay() != firstDay) {
                calendar.setTime(firstVisibleDay, -1 * MS_PER_DAY);
            }

            return firstVisibleDay;
        },

        setTime: function (date, time) {
            var tzOffsetBefore = date.getTimezoneOffset(),
            resultDATE = new DATE(date.getTime() + time),
            tzOffsetDiff = resultDATE.getTimezoneOffset() - tzOffsetBefore;

            date.setTime(resultDATE.getTime() + tzOffsetDiff * MS_PER_MINUTE);
        },
        views: [{
            name: MONTH,
            title: function(date, min, max, culture) {
                return getCalendarInfo(culture).months.names[date.getMonth()] + " " + date.getFullYear();
            },
            content: function(options) {
                var that = this,
                idx = 0,
                min = options.min,
                max = options.max,
                date = options.date,
                dates = options.dates,
                format = options.format,
                culture = options.culture,
                navigateUrl = options.url,
                hasUrl = navigateUrl && dates[0],
                currentCalendar = getCalendarInfo(culture),
                firstDayIdx = currentCalendar.firstDay,
                days = currentCalendar.days,
                names = shiftArray(days.names, firstDayIdx),
                shortNames = shiftArray(days.namesShort, firstDayIdx),
                start = calendar.firstVisibleDay(date, currentCalendar),
                firstDayOfMonth = that.first(date),
                lastDayOfMonth = that.last(date),
                toDateString = that.toDateString,
                today = new DATE(),
                html = '<table tabindex="0" role="grid" class="k-content" cellspacing="0"><thead><tr role="row">';

                for (; idx < 7; idx++) {
                    html += '<th scope="col" title="' + names[idx] + '">' + shortNames[idx] + '</th>';
                }

                today = new DATE(today.getFullYear(), today.getMonth(), today.getDate());
                adjustDST(today, 0);
                today = +today;

                start = new DATE(start.getFullYear(), start.getMonth(), start.getDate());
                adjustDST(start, 0);

                return view({
                    cells: 42,
                    perRow: 7,
                    html: html += '</tr></thead><tbody><tr role="row">',
                    start: start,
                    min: new DATE(min.getFullYear(), min.getMonth(), min.getDate()),
                    max: new DATE(max.getFullYear(), max.getMonth(), max.getDate()),
                    content: options.content,
                    empty: options.empty,
                    setter: that.setDate,
                    build: function(date) {
                        var cssClass = [],
                            day = date.getDay(),
                            linkClass = "",
                            url = "#";

                        if (date < firstDayOfMonth || date > lastDayOfMonth) {
                            cssClass.push(OTHERMONTH);
                        }

                        if (+date === today) {
                            cssClass.push("k-today");
                        }

                        if (day === 0 || day === 6) {
                            cssClass.push("k-weekend");
                        }

                        if (hasUrl && inArray(+date, dates)) {
                            url = navigateUrl.replace("{0}", kendo.toString(date, format, culture));
                            linkClass = " k-action-link";
                        }

                        return {
                            date: date,
                            dates: dates,
                            ns: kendo.ns,
                            title: kendo.toString(date, "D", culture),
                            value: date.getDate(),
                            dateString: toDateString(date),
                            cssClass: cssClass[0] ? ' class="' + cssClass.join(" ") + '"' : "",
                            linkClass: linkClass,
                            url: url
                        };
                    }
                });
            },
            first: function(date) {
                return calendar.firstDayOfMonth(date);
            },
            last: function(date) {
                var last = new DATE(date.getFullYear(), date.getMonth() + 1, 0),
                    first = calendar.firstDayOfMonth(date),
                    timeOffset = Math.abs(last.getTimezoneOffset() - first.getTimezoneOffset());

                if (timeOffset) {
                    last.setHours(first.getHours() + (timeOffset / 60));
                }

                return last;
            },
            compare: function(date1, date2) {
                var result,
                month1 = date1.getMonth(),
                year1 = date1.getFullYear(),
                month2 = date2.getMonth(),
                year2 = date2.getFullYear();

                if (year1 > year2) {
                    result = 1;
                } else if (year1 < year2) {
                    result = -1;
                } else {
                    result = month1 == month2 ? 0 : month1 > month2 ? 1 : -1;
                }

                return result;
            },
            setDate: function(date, value) {
                var hours = date.getHours();
                if (value instanceof DATE) {
                    date.setFullYear(value.getFullYear(), value.getMonth(), value.getDate());
                } else {
                    calendar.setTime(date, value * MS_PER_DAY);
                }
                adjustDST(date, hours);
            },
            toDateString: function(date) {
                return date.getFullYear() + "/" + date.getMonth() + "/" + date.getDate();
            }
        },
        {
            name: "year",
            title: function(date) {
                return date.getFullYear();
            },
            content: function(options) {
                var namesAbbr = getCalendarInfo(options.culture).months.namesAbbr,
                toDateString = this.toDateString,
                min = options.min,
                max = options.max;

                return view({
                    min: new DATE(min.getFullYear(), min.getMonth(), 1),
                    max: new DATE(max.getFullYear(), max.getMonth(), 1),
                    start: new DATE(options.date.getFullYear(), 0, 1),
                    setter: this.setDate,
                    build: function(date) {
                        return {
                            value: namesAbbr[date.getMonth()],
                            ns: kendo.ns,
                            dateString: toDateString(date),
                            cssClass: ""
                        };
                    }
                });
            },
            first: function(date) {
                return new DATE(date.getFullYear(), 0, date.getDate());
            },
            last: function(date) {
                return new DATE(date.getFullYear(), 11, date.getDate());
            },
            compare: function(date1, date2){
                return compare(date1, date2);
            },
            setDate: function(date, value) {
                var month,
                    hours = date.getHours();

                if (value instanceof DATE) {
                    month = value.getMonth();

                    date.setFullYear(value.getFullYear(), month, date.getDate());

                    if (month !== date.getMonth()) {
                        date.setDate(0);
                    }
                } else {
                    month = date.getMonth() + value;

                    date.setMonth(month);

                    if (month > 11) {
                        month -= 12;
                    }

                    if (month > 0 && date.getMonth() != month) {
                        date.setDate(0);
                    }
                }

                adjustDST(date, hours);
            },
            toDateString: function(date) {
                return date.getFullYear() + "/" + date.getMonth() + "/1";
            }
        },
        {
            name: "decade",
            title: function(date, min, max) {
                return title(date, min, max, 10);
            },
            content: function(options) {
                var year = options.date.getFullYear(),
                toDateString = this.toDateString;

                return view({
                    start: new DATE(year - year % 10 - 1, 0, 1),
                    min: new DATE(options.min.getFullYear(), 0, 1),
                    max: new DATE(options.max.getFullYear(), 0, 1),
                    setter: this.setDate,
                    build: function(date, idx) {
                        return {
                            value: date.getFullYear(),
                            ns: kendo.ns,
                            dateString: toDateString(date),
                            cssClass: idx === 0 || idx == 11 ? OTHERMONTHCLASS : ""
                        };
                    }
                });
            },
            first: function(date) {
                var year = date.getFullYear();
                return new DATE(year - year % 10, date.getMonth(), date.getDate());
            },
            last: function(date) {
                var year = date.getFullYear();
                return new DATE(year - year % 10 + 9, date.getMonth(), date.getDate());
            },
            compare: function(date1, date2) {
                return compare(date1, date2, 10);
            },
            setDate: function(date, value) {
                setDate(date, value, 1);
            },
            toDateString: function(date) {
                return date.getFullYear() + "/0/1";
            }
        },
        {
            name: CENTURY,
            title: function(date, min, max) {
                return title(date, min, max, 100);
            },
            content: function(options) {
                var year = options.date.getFullYear(),
                min = options.min.getFullYear(),
                max = options.max.getFullYear(),
                toDateString = this.toDateString,
                minYear = min,
                maxYear = max;

                minYear = minYear - minYear % 10;
                maxYear = maxYear - maxYear % 10;

                if (maxYear - minYear < 10) {
                    maxYear = minYear + 9;
                }

                return view({
                    start: new DATE(year - year % 100 - 10, 0, 1),
                    min: new DATE(minYear, 0, 1),
                    max: new DATE(maxYear, 0, 1),
                    setter: this.setDate,
                    build: function(date, idx) {
                        var start = date.getFullYear(),
                            end = start + 9;

                        if (start < min) {
                            start = min;
                        }

                        if (end > max) {
                            end = max;
                        }

                        return {
                            ns: kendo.ns,
                            value: start + " - " + end,
                            dateString: toDateString(date),
                            cssClass: idx === 0 || idx == 11 ? OTHERMONTHCLASS : ""
                        };
                    }
                });
            },
            first: function(date) {
                var year = date.getFullYear();
                return new DATE(year - year % 100, date.getMonth(), date.getDate());
            },
            last: function(date) {
                var year = date.getFullYear();
                return new DATE(year - year % 100 + 99, date.getMonth(), date.getDate());
            },
            compare: function(date1, date2) {
                return compare(date1, date2, 100);
            },
            setDate: function(date, value) {
                setDate(date, value, 10);
            },
            toDateString: function(date) {
                var year = date.getFullYear();
                return (year - year % 10) + "/0/1";
            }
        }]
    };

    function title(date, min, max, modular) {
        var start = date.getFullYear(),
            minYear = min.getFullYear(),
            maxYear = max.getFullYear(),
            end;

        start = start - start % modular;
        end = start + (modular - 1);

        if (start < minYear) {
            start = minYear;
        }
        if (end > maxYear) {
            end = maxYear;
        }

        return start + "-" + end;
    }

    function view(options) {
        var idx = 0,
            data,
            min = options.min,
            max = options.max,
            start = options.start,
            setter = options.setter,
            build = options.build,
            length = options.cells || 12,
            cellsPerRow = options.perRow || 4,
            content = options.content || cellTemplate,
            empty = options.empty || emptyCellTemplate,
            html = options.html || '<table tabindex="0" role="grid" class="k-content k-meta-view" cellspacing="0"><tbody><tr role="row">';

        for(; idx < length; idx++) {
            if (idx > 0 && idx % cellsPerRow === 0) {
                html += '</tr><tr role="row">';
            }

            data = build(start, idx);

            html += isInRange(start, min, max) ? content(data) : empty(data);

            setter(start, 1);
        }

        return html + "</tr></tbody></table>";
    }

    function compare(date1, date2, modifier) {
        var year1 = date1.getFullYear(),
            start  = date2.getFullYear(),
            end = start,
            result = 0;

        if (modifier) {
            start = start - start % modifier;
            end = start - start % modifier + modifier - 1;
        }

        if (year1 > end) {
            result = 1;
        } else if (year1 < start) {
            result = -1;
        }

        return result;
    }

    function getToday() {
        var today = new DATE();
        return new DATE(today.getFullYear(), today.getMonth(), today.getDate());
    }

    function restrictValue (value, min, max) {
        var today = getToday();

        if (value) {
            today = new DATE(+value);
        }

        if (min > today) {
            today = new DATE(+min);
        } else if (max < today) {
            today = new DATE(+max);
        }
        return today;
    }

    function isInRange(date, min, max) {
        return +date >= +min && +date <= +max;
    }

    function shiftArray(array, idx) {
        return array.slice(idx).concat(array.slice(0, idx));
    }

    function setDate(date, value, multiplier) {
        value = value instanceof DATE ? value.getFullYear() : date.getFullYear() + multiplier * value;
        date.setFullYear(value);
    }

    function mousetoggle(e) {
        $(this).toggleClass(HOVER, MOUSEENTER.indexOf(e.type) > -1 || e.type == FOCUS);
    }

    function prevent (e) {
        e.preventDefault();
    }

    function getCalendarInfo(culture) {
        return getCulture(culture).calendars.standard;
    }

    function normalize(options) {
        var start = views[options.start],
            depth = views[options.depth],
            culture = getCulture(options.culture);

        options.format = extractFormat(options.format || culture.calendars.standard.patterns.d);

        if (isNaN(start)) {
            start = 0;
            options.start = MONTH;
        }

        if (depth === undefined || depth > start) {
            options.depth = MONTH;
        }

        if (!options.dates) {
            options.dates = [];
        }
    }

    function makeUnselectable(element) {
        if (isIE8) {
            element.find("*").attr("unselectable", "on");
        }
    }

    function inArray(date, dates) {
        for(var i = 0, length = dates.length; i < length; i++) {
            if (date === +dates[i]) {
                return true;
            }
        }
        return false;
    }

    function isEqualDatePart(value1, value2) {
        if (value1) {
            return value1.getFullYear() === value2.getFullYear() &&
                   value1.getMonth() === value2.getMonth() &&
                   value1.getDate() === value2.getDate();
        }

        return false;
    }

    function isEqualMonth(value1, value2) {
        if (value1) {
            return value1.getFullYear() === value2.getFullYear() &&
                   value1.getMonth() === value2.getMonth();
        }

        return false;
    }

    calendar.isEqualDatePart = isEqualDatePart;
    calendar.makeUnselectable =  makeUnselectable;
    calendar.restrictValue = restrictValue;
    calendar.isInRange = isInRange;
    calendar.normalize = normalize;
    calendar.viewsEnum = views;

    kendo.calendar = calendar;
})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        Widget = ui.Widget,
        support = kendo.support,
        getOffset = kendo.getOffset,
        activeElement = kendo._activeElement,
        OPEN = "open",
        CLOSE = "close",
        DEACTIVATE = "deactivate",
        ACTIVATE = "activate",
        CENTER = "center",
        LEFT = "left",
        RIGHT = "right",
        TOP = "top",
        BOTTOM = "bottom",
        ABSOLUTE = "absolute",
        HIDDEN = "hidden",
        BODY = "body",
        LOCATION = "location",
        POSITION = "position",
        VISIBLE = "visible",
        EFFECTS = "effects",
        ACTIVE = "k-state-active",
        ACTIVEBORDER = "k-state-border",
        ACTIVEBORDERREGEXP = /k-state-border-(\w+)/,
        ACTIVECHILDREN = ".k-picker-wrap, .k-dropdown-wrap, .k-link",
        MOUSEDOWN = "down",
        DOCUMENT_ELEMENT = $(document.documentElement),
        WINDOW = $(window),
        SCROLL = "scroll",
        RESIZE_SCROLL = "resize scroll",
        cssPrefix = support.transitions.css,
        TRANSFORM = cssPrefix + "transform",
        extend = $.extend,
        NS = ".kendoPopup",
        styles = ["font-size",
                  "font-family",
                  "font-stretch",
                  "font-style",
                  "font-weight",
                  "line-height"];

    function contains(container, target) {
        return container === target || $.contains(container, target);
    }

    var Popup = Widget.extend({
        init: function(element, options) {
            var that = this, parentPopup;

            options = options || {};

            if (options.isRtl) {
                options.origin = options.origin || BOTTOM + " " + RIGHT;
                options.position = options.position || TOP + " " + RIGHT;
            }

            Widget.fn.init.call(that, element, options);

            element = that.element;
            options = that.options;

            that.collisions = options.collision ? options.collision.split(" ") : [];
            that.downEvent = kendo.applyEventMap(MOUSEDOWN, kendo.guid());

            if (that.collisions.length === 1) {
                that.collisions.push(that.collisions[0]);
            }

            parentPopup = $(that.options.anchor).closest(".k-popup,.k-group").filter(":not([class^=km-])"); // When popup is in another popup, make it relative.
            options.appendTo = $($(options.appendTo)[0] || parentPopup[0] || BODY);

            that.element.hide()
                .addClass("k-popup k-group k-reset")
                .toggleClass("k-rtl", !!options.isRtl)
                .css({ position : ABSOLUTE })
                .appendTo(options.appendTo)
                .on("mouseenter" + NS, function() {
                    that._hovered = true;
                })
                .on("mouseleave" + NS, function() {
                    that._hovered = false;
                });

            that.wrapper = $();

            if (options.animation === false) {
                options.animation = { open: { effects: {} }, close: { hide: true, effects: {} } };
            }

            extend(options.animation.open, {
                complete: function() {
                    that.wrapper.css({ overflow: VISIBLE }); // Forcing refresh causes flickering in mobile.
                    that._activated = true;
                    that._trigger(ACTIVATE);
                }
            });

            extend(options.animation.close, {
                complete: function() {
                    that._animationClose();
                }
            });

            that._mousedownProxy = function(e) {
                that._mousedown(e);
            };

            that._resizeProxy = function(e) {
                that._resize(e);
            };

            if (options.toggleTarget) {
                $(options.toggleTarget).on(options.toggleEvent + NS, $.proxy(that.toggle, that));
            }
        },

        events: [
            OPEN,
            ACTIVATE,
            CLOSE,
            DEACTIVATE
        ],

        options: {
            name: "Popup",
            toggleEvent: "click",
            origin: BOTTOM + " " + LEFT,
            position: TOP + " " + LEFT,
            anchor: BODY,
            appendTo: null,
            collision: "flip fit",
            viewport: window,
            copyAnchorStyles: true,
            autosize: false,
            modal: false,
            adjustSize: {
                width: 0,
                height: 0
            },
            animation: {
                open: {
                    effects: "slideIn:down",
                    transition: true,
                    duration: 200
                },
                close: { // if close animation effects are defined, they will be used instead of open.reverse
                    duration: 100,
                    hide: true
                }
            }
        },

        _animationClose: function() {
            var that = this,
                options = that.options;

            that.wrapper.hide();

            var location = that.wrapper.data(LOCATION),
                anchor = $(options.anchor),
                direction, dirClass;

            if (location) {
                that.wrapper.css(location);
            }

            if (options.anchor != BODY) {
                direction = ((anchor.attr("class") || "").match(ACTIVEBORDERREGEXP) || ["", "down"])[1];
                dirClass = ACTIVEBORDER + "-" + direction;

                anchor
                    .removeClass(dirClass)
                    .children(ACTIVECHILDREN)
                    .removeClass(ACTIVE)
                    .removeClass(dirClass);

                that.element.removeClass(ACTIVEBORDER + "-" + kendo.directions[direction].reverse);
            }

            that._closing = false;
            that._trigger(DEACTIVATE);
        },

        destroy: function() {
            var that = this,
                options = that.options,
                element = that.element.off(NS),
                parent;

            Widget.fn.destroy.call(that);

            if (options.toggleTarget) {
                $(options.toggleTarget).off(NS);
            }

            if (!options.modal) {
                DOCUMENT_ELEMENT.unbind(that.downEvent, that._mousedownProxy);
                that._toggleResize(false);
            }

            kendo.destroy(that.element.children());
            element.removeData();

            if (options.appendTo[0] === document.body) {
                parent = element.parent(".k-animation-container");

                if (parent[0]) {
                    parent.remove();
                } else {
                    element.remove();
                }
            }
        },

        open: function(x, y) {
            var that = this,
                fixed = { isFixed: !isNaN(parseInt(y,10)), x: x, y: y },
                element = that.element,
                options = that.options,
                direction = "down",
                animation, wrapper,
                anchor = $(options.anchor),
                mobile = element[0] && element.hasClass("km-widget");

            if (!that.visible()) {
                if (options.copyAnchorStyles) {
                    if (mobile && styles[0] == "font-size") {
                        styles.shift();
                    }
                    element.css(kendo.getComputedStyles(anchor[0], styles));
                }

                if (element.data("animating") || that._trigger(OPEN)) {
                    return;
                }

                that._activated = false;

                if (!options.modal) {
                    DOCUMENT_ELEMENT.unbind(that.downEvent, that._mousedownProxy)
                                .bind(that.downEvent, that._mousedownProxy);

                    // this binding hangs iOS in editor
                    if (!(support.mobileOS.ios || support.mobileOS.android)) {
                        // all elements in IE7/8 fire resize event, causing mayhem
                        that._toggleResize(false);
                        that._toggleResize(true);
                    }
                }

                that.wrapper = wrapper = kendo.wrap(element, options.autosize)
                                        .css({
                                            overflow: HIDDEN,
                                            display: "block",
                                            position: ABSOLUTE
                                        });

                if (support.mobileOS.android) {
                    wrapper.css(TRANSFORM, "translatez(0)"); // Android is VERY slow otherwise. Should be tested in other droids as well since it may cause blur.
                }

                wrapper.css(POSITION);

                if ($(options.appendTo)[0] == document.body) {
                    wrapper.css(TOP, "-10000px");
                }

                animation = extend(true, {}, options.animation.open);
                that.flipped = that._position(fixed);
                animation.effects = kendo.parseEffects(animation.effects, that.flipped);

                direction = animation.effects.slideIn ? animation.effects.slideIn.direction : direction;

                if (options.anchor != BODY) {
                    var dirClass = ACTIVEBORDER + "-" + direction;

                    element.addClass(ACTIVEBORDER + "-" + kendo.directions[direction].reverse);

                    anchor
                        .addClass(dirClass)
                        .children(ACTIVECHILDREN)
                        .addClass(ACTIVE)
                        .addClass(dirClass);
                }

                element.data(EFFECTS, animation.effects)
                       .kendoStop(true)
                       .kendoAnimate(animation);
            }
        },

        position: function() {
            if (this.visible()) {
                this._position();
            }
        },

        toggle: function() {
            var that = this;

            that[that.visible() ? CLOSE : OPEN]();
        },

        visible: function() {
            return this.element.is(":" + VISIBLE);
        },

        close: function(skipEffects) {
            var that = this,
                options = that.options, wrap,
                animation, openEffects, closeEffects;

            if (that.visible()) {
                wrap = (that.wrapper[0] ? that.wrapper : kendo.wrap(that.element).hide());

                that._toggleResize(false);

                if (that._closing || that._trigger(CLOSE)) {
                    that._toggleResize(true);
                    return;
                }

                // Close all inclusive popups.
                that.element.find(".k-popup").each(function () {
                    var that = $(this),
                        popup = that.data("kendoPopup");

                    if (popup) {
                        popup.close(skipEffects);
                    }
                });

                DOCUMENT_ELEMENT.unbind(that.downEvent, that._mousedownProxy);

                if (skipEffects) {
                    animation = { hide: true, effects: {} };
                } else {
                    animation = extend(true, {}, options.animation.close);
                    openEffects = that.element.data(EFFECTS);
                    closeEffects = animation.effects;

                    if (!closeEffects && !kendo.size(closeEffects) && openEffects && kendo.size(openEffects)) {
                        animation.effects = openEffects;
                        animation.reverse = true;
                    }

                    that._closing = true;
                }

                that.element.kendoStop(true);
                wrap.css({ overflow: HIDDEN }); // stop callback will remove hidden overflow
                that.element.kendoAnimate(animation);
            }
        },

        _trigger: function(ev) {
            return this.trigger(ev, { type: ev });
        },

        _resize: function(e) {
            var that = this;

            if (e.type === "resize") {
                clearTimeout(that._resizeTimeout);
                that._resizeTimeout = setTimeout(function() {
                    that._position();
                    that._resizeTimeout = null;
                }, 50);
            } else {
                if (!that._hovered || (that._activated && that.element.hasClass("k-list-container"))) {
                    that.close();
                }
            }
        },

        _toggleResize: function(toggle) {
            var method = toggle ? "on" : "off";

            this._scrollableParents()[method](SCROLL, this._resizeProxy);
            WINDOW[method](RESIZE_SCROLL, this._resizeProxy);
        },

        _mousedown: function(e) {
            var that = this,
                container = that.element[0],
                options = that.options,
                anchor = $(options.anchor)[0],
                toggleTarget = options.toggleTarget,
                target = kendo.eventTarget(e),
                popup = $(target).closest(".k-popup"),
                mobile = popup.parent().parent(".km-shim").length;

            popup = popup[0];
            if (!mobile && popup && popup !== that.element[0]){
                return;
            }

            // This MAY result in popup not closing in certain cases.
            if ($(e.target).closest("a").data("rel") === "popover") {
                return;
            }

            if (!contains(container, target) && !contains(anchor, target) && !(toggleTarget && contains($(toggleTarget)[0], target))) {
                that.close();
            }
        },

        _fit: function(position, size, viewPortSize) {
            var output = 0;

            if (position + size > viewPortSize) {
                output = viewPortSize - (position + size);
            }

            if (position < 0) {
                output = -position;
            }

            return output;
        },

        _flip: function(offset, size, anchorSize, viewPortSize, origin, position, boxSize) {
            var output = 0;
                boxSize = boxSize || size;

            if (position !== origin && position !== CENTER && origin !== CENTER) {
                if (offset + boxSize > viewPortSize) {
                    output += -(anchorSize + size);
                }

                if (offset + output < 0) {
                    output += anchorSize + size;
                }
            }
            return output;
        },

        _scrollableParents: function() {
            return $(this.options.anchor)
                       .parentsUntil("body")
                       .filter(function(index, element) {
                           return kendo.isScrollable(element);
                       });
        },

        _position: function(fixed) {
            var that = this,
                //element = that.element.css(POSITION, ""), /* fixes telerik/kendo-ui-core#790, comes from telerik/kendo#615 */
                element = that.element,
                wrapper = that.wrapper,
                options = that.options,
                viewport = $(options.viewport),
                viewportOffset = viewport.offset(),
                anchor = $(options.anchor),
                origins = options.origin.toLowerCase().split(" "),
                positions = options.position.toLowerCase().split(" "),
                collisions = that.collisions,
                zoomLevel = support.zoomLevel(),
                siblingContainer, parents,
                parentZIndex, zIndex = 10002,
                isWindow = !!((viewport[0] == window) && window.innerWidth && (zoomLevel <= 1.02)),
                idx = 0,
                docEl = document.documentElement,
                length, viewportWidth, viewportHeight;

            // $(window).height() uses documentElement to get the height
            viewportWidth = isWindow ? window.innerWidth : viewport.width();
            viewportHeight = isWindow ? window.innerHeight : viewport.height();

            if (isWindow && docEl.scrollHeight - docEl.clientHeight > 0) {
                viewportWidth -= kendo.support.scrollbar();
            }

            siblingContainer = anchor.parents().filter(wrapper.siblings());

            if (siblingContainer[0]) {
                parentZIndex = Math.max(Number(siblingContainer.css("zIndex")), 0);

                // set z-index to be more than that of the container/sibling
                // compensate with more units for window z-stack
                if (parentZIndex) {
                    zIndex = parentZIndex + 10;
                } else {
                    parents = anchor.parentsUntil(siblingContainer);
                    for (length = parents.length; idx < length; idx++) {
                        parentZIndex = Number($(parents[idx]).css("zIndex"));
                        if (parentZIndex && zIndex < parentZIndex) {
                            zIndex = parentZIndex + 10;
                        }
                    }
                }
            }

            wrapper.css("zIndex", zIndex);

            if (fixed && fixed.isFixed) {
                wrapper.css({ left: fixed.x, top: fixed.y });
            } else {
                wrapper.css(that._align(origins, positions));
            }

            var pos = getOffset(wrapper, POSITION, anchor[0] === wrapper.offsetParent()[0]),
                offset = getOffset(wrapper),
                anchorParent = anchor.offsetParent().parent(".k-animation-container,.k-popup,.k-group"); // If the parent is positioned, get the current positions

            if (anchorParent.length) {
                pos = getOffset(wrapper, POSITION, true);
                offset = getOffset(wrapper);
            }

            if (viewport[0] === window) {
                offset.top -= (window.pageYOffset || document.documentElement.scrollTop || 0);
                offset.left -= (window.pageXOffset || document.documentElement.scrollLeft || 0);
            }
            else {
                offset.top -= viewportOffset.top;
                offset.left -= viewportOffset.left;
            }

            if (!that.wrapper.data(LOCATION)) { // Needed to reset the popup location after every closure - fixes the resize bugs.
                wrapper.data(LOCATION, extend({}, pos));
            }

            var offsets = extend({}, offset),
                location = extend({}, pos),
                adjustSize = options.adjustSize;

            if (collisions[0] === "fit") {
                location.top += that._fit(offsets.top, wrapper.outerHeight() + adjustSize.height, viewportHeight / zoomLevel);
            }

            if (collisions[1] === "fit") {
                location.left += that._fit(offsets.left, wrapper.outerWidth() + adjustSize.width, viewportWidth / zoomLevel);
            }

            var flipPos = extend({}, location);

            if (collisions[0] === "flip") {
                location.top += that._flip(offsets.top, element.outerHeight(), anchor.outerHeight(), viewportHeight / zoomLevel, origins[0], positions[0], wrapper.outerHeight());
            }

            if (collisions[1] === "flip") {
                location.left += that._flip(offsets.left, element.outerWidth(), anchor.outerWidth(), viewportWidth / zoomLevel, origins[1], positions[1], wrapper.outerWidth());
            }

            element.css(POSITION, ABSOLUTE);
            wrapper.css(location);

            return (location.left != flipPos.left || location.top != flipPos.top);
        },

        _align: function(origin, position) {
            var that = this,
                element = that.wrapper,
                anchor = $(that.options.anchor),
                verticalOrigin = origin[0],
                horizontalOrigin = origin[1],
                verticalPosition = position[0],
                horizontalPosition = position[1],
                anchorOffset = getOffset(anchor),
                appendTo = $(that.options.appendTo),
                appendToOffset,
                width = element.outerWidth(),
                height = element.outerHeight(),
                anchorWidth = anchor.outerWidth(),
                anchorHeight = anchor.outerHeight(),
                top = anchorOffset.top,
                left = anchorOffset.left,
                round = Math.round;

            if (appendTo[0] != document.body) {
                appendToOffset = getOffset(appendTo);
                top -= appendToOffset.top;
                left -= appendToOffset.left;
            }


            if (verticalOrigin === BOTTOM) {
                top += anchorHeight;
            }

            if (verticalOrigin === CENTER) {
                top += round(anchorHeight / 2);
            }

            if (verticalPosition === BOTTOM) {
                top -= height;
            }

            if (verticalPosition === CENTER) {
                top -= round(height / 2);
            }

            if (horizontalOrigin === RIGHT) {
                left += anchorWidth;
            }

            if (horizontalOrigin === CENTER) {
                left += round(anchorWidth / 2);
            }

            if (horizontalPosition === RIGHT) {
                left -= width;
            }

            if (horizontalPosition === CENTER) {
                left -= round(width / 2);
            }

            return {
                top: top,
                left: left
            };
        }
    });

    ui.plugin(Popup);
})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
    ui = kendo.ui,
    Widget = ui.Widget,
    parse = kendo.parseDate,
    keys = kendo.keys,
    template = kendo.template,
    activeElement = kendo._activeElement,
    DIV = "<div />",
    SPAN = "<span />",
    ns = ".kendoDatePicker",
    CLICK = "click" + ns,
    OPEN = "open",
    CLOSE = "close",
    CHANGE = "change",
    DATEVIEW = "dateView",
    DISABLED = "disabled",
    READONLY = "readonly",
    DEFAULT = "k-state-default",
    FOCUSED = "k-state-focused",
    SELECTED = "k-state-selected",
    STATEDISABLED = "k-state-disabled",
    HOVER = "k-state-hover",
    KEYDOWN = "keydown" + ns,
    HOVEREVENTS = "mouseenter" + ns + " mouseleave" + ns,
    MOUSEDOWN = "mousedown" + ns,
    ID = "id",
    MIN = "min",
    MAX = "max",
    MONTH = "month",
    ARIA_DISABLED = "aria-disabled",
    ARIA_EXPANDED = "aria-expanded",
    ARIA_HIDDEN = "aria-hidden",
    ARIA_READONLY = "aria-readonly",
    calendar = kendo.calendar,
    isInRange = calendar.isInRange,
    restrictValue = calendar.restrictValue,
    isEqualDatePart = calendar.isEqualDatePart,
    extend = $.extend,
    proxy = $.proxy,
    DATE = Date;

    function normalize(options) {
        var parseFormats = options.parseFormats,
            format = options.format;

        calendar.normalize(options);


        parseFormats = $.isArray(parseFormats) ? parseFormats : [parseFormats];

        if (!parseFormats.length) {
            parseFormats.push("yyyy-MM-dd");
        }

        if ($.inArray(format, parseFormats) === -1) {
            parseFormats.splice(0, 0, options.format);
        }

        options.parseFormats = parseFormats;
    }

    function preventDefault(e) {
        e.preventDefault();
    }

    var DateView = function(options) {
        var that = this, id,
            body = document.body,
            div = $(DIV).attr(ARIA_HIDDEN, "true")
                        .addClass("k-calendar-container")
                        .appendTo(body);

        that.options = options = options || {};
        id = options.id;

        if (id) {
            id += "_dateview";

            div.attr(ID, id);
            that._dateViewID = id;
        }

        that.popup = new ui.Popup(div, extend(options.popup, options, { name: "Popup", isRtl: kendo.support.isRtl(options.anchor) }));
        that.div = div;

        that.value(options.value);
    };

    DateView.prototype = {
        _calendar: function() {
            var that = this;
            var calendar = that.calendar;
            var options = that.options;
            var div;

            if (!calendar) {
                div = $(DIV).attr(ID, kendo.guid())
                            .appendTo(that.popup.element)
                            .on(MOUSEDOWN, preventDefault)
                            .on(CLICK, "td:has(.k-link)", proxy(that._click, that));

                that.calendar = calendar = new ui.Calendar(div);
                that._setOptions(options);

                kendo.calendar.makeUnselectable(calendar.element);

                calendar.navigate(that._value || that._current, options.start);

                that.value(that._value);
            }
        },

        _setOptions: function(options) {
            this.calendar.setOptions({
                focusOnNav: false,
                change: options.change,
                culture: options.culture,
                dates: options.dates,
                depth: options.depth,
                footer: options.footer,
                format: options.format,
                max: options.max,
                min: options.min,
                month: options.month,
                start: options.start
            });
        },

        setOptions: function(options) {
            var old = this.options;

            this.options = extend(old, options, {
                change: old.change,
                close: old.close,
                open: old.open
            });

            if (this.calendar) {
                this._setOptions(this.options);
            }
        },

        destroy: function() {
            this.popup.destroy();
        },

        open: function() {
            var that = this;

            that._calendar();
            that.popup.open();
        },

        close: function() {
            this.popup.close();
        },

        min: function(value) {
            this._option(MIN, value);
        },

        max: function(value) {
            this._option(MAX, value);
        },

        toggle: function() {
            var that = this;

            that[that.popup.visible() ? CLOSE : OPEN]();
        },

        move: function(e) {
            var that = this,
                key = e.keyCode,
                calendar = that.calendar,
                selectIsClicked = e.ctrlKey && key == keys.DOWN || key == keys.ENTER,
                handled = false;

            if (e.altKey) {
                if (key == keys.DOWN) {
                    that.open();
                    e.preventDefault();
                    handled = true;
                } else if (key == keys.UP) {
                    that.close();
                    e.preventDefault();
                    handled = true;
                }

            } else if (that.popup.visible()) {

                if (key == keys.ESC || (selectIsClicked && calendar._cell.hasClass(SELECTED))) {
                    that.close();
                    e.preventDefault();
                    return true;
                }

                that._current = calendar._move(e);
                handled = true;
            }

            return handled;
        },

        current: function(date) {
            this._current = date;
            this.calendar._focus(date);
        },

        value: function(value) {
            var that = this,
                calendar = that.calendar,
                options = that.options;

            that._value = value;
            that._current = new DATE(+restrictValue(value, options.min, options.max));

            if (calendar) {
                calendar.value(value);
            }
        },

        _click: function(e) {
            if (e.currentTarget.className.indexOf(SELECTED) !== -1) {
                this.close();
            }
        },

        _option: function(option, value) {
            var that = this;
            var calendar = that.calendar;

            that.options[option] = value;

            if (calendar) {
                calendar[option](value);
            }
        }
    };

    DateView.normalize = normalize;

    kendo.DateView = DateView;

    var DatePicker = Widget.extend({
        init: function(element, options) {
            var that = this,
                disabled,
                div;

            Widget.fn.init.call(that, element, options);
            element = that.element;
            options = that.options;

            options.min = parse(element.attr("min")) || parse(options.min);
            options.max = parse(element.attr("max")) || parse(options.max);

            normalize(options);

            that._initialOptions = extend({}, options);

            that._wrapper();

            that.dateView = new DateView(extend({}, options, {
                id: element.attr(ID),
                anchor: that.wrapper,
                change: function() {
                    // calendar is the current scope
                    that._change(this.value());
                    that.close();
                },
                close: function(e) {
                    if (that.trigger(CLOSE)) {
                        e.preventDefault();
                    } else {
                        element.attr(ARIA_EXPANDED, false);
                        div.attr(ARIA_HIDDEN, true);
                    }
                },
                open: function(e) {
                    var options = that.options,
                        date;

                    if (that.trigger(OPEN)) {
                        e.preventDefault();
                    } else {
                        if (that.element.val() !== that._oldText) {
                            date = parse(element.val(), options.parseFormats, options.culture);

                            that.dateView[date ? "current" : "value"](date);
                        }

                        element.attr(ARIA_EXPANDED, true);
                        div.attr(ARIA_HIDDEN, false);

                        that._updateARIA(date);

                    }
                }
            }));
            div = that.dateView.div;

            that._icon();

            try {
                element[0].setAttribute("type", "text");
            } catch(e) {
                element[0].type = "text";
            }

            element
                .addClass("k-input")
                .attr({
                    role: "combobox",
                    "aria-expanded": false,
                    "aria-owns": that.dateView._dateViewID
                });

            that._reset();
            that._template();

            disabled = element.is("[disabled]") || $(that.element).parents("fieldset").is(':disabled');
            if (disabled) {
                that.enable(false);
            } else {
                that.readonly(element.is("[readonly]"));
            }

            that._old = that._update(options.value || that.element.val());
            that._oldText = element.val();

            kendo.notify(that);
        },
        events: [
        OPEN,
        CLOSE,
        CHANGE],
        options: {
            name: "DatePicker",
            value: null,
            footer: "",
            format: "",
            culture: "",
            parseFormats: [],
            min: new Date(1900, 0, 1),
            max: new Date(2099, 11, 31),
            start: MONTH,
            depth: MONTH,
            animation: {},
            month : {},
            dates: [],
            ARIATemplate: 'Current focused date is #=kendo.toString(data.current, "D")#'
        },

        setOptions: function(options) {
            var that = this;
            var value = that._value;

            Widget.fn.setOptions.call(that, options);

            options = that.options;

            options.min = parse(options.min);
            options.max = parse(options.max);

            normalize(options);

            that.dateView.setOptions(options);

            if (value) {
                that.element.val(kendo.toString(value, options.format, options.culture));
                that._updateARIA(value);
            }
        },

        _editable: function(options) {
            var that = this,
                icon = that._dateIcon.off(ns),
                element = that.element.off(ns),
                wrapper = that._inputWrapper.off(ns),
                readonly = options.readonly,
                disable = options.disable;

            if (!readonly && !disable) {
                wrapper
                    .addClass(DEFAULT)
                    .removeClass(STATEDISABLED)
                    .on(HOVEREVENTS, that._toggleHover);

                element.removeAttr(DISABLED)
                       .removeAttr(READONLY)
                       .attr(ARIA_DISABLED, false)
                       .attr(ARIA_READONLY, false)
                       .on("keydown" + ns, proxy(that._keydown, that))
                       .on("focusout" + ns, proxy(that._blur, that))
                       .on("focus" + ns, function() {
                           that._inputWrapper.addClass(FOCUSED);
                       });

               icon.on(CLICK, proxy(that._click, that))
                   .on(MOUSEDOWN, preventDefault);
            } else {
                wrapper
                    .addClass(disable ? STATEDISABLED : DEFAULT)
                    .removeClass(disable ? DEFAULT : STATEDISABLED);

                element.attr(DISABLED, disable)
                       .attr(READONLY, readonly)
                       .attr(ARIA_DISABLED, disable)
                       .attr(ARIA_READONLY, readonly);
            }
        },

        readonly: function(readonly) {
            this._editable({
                readonly: readonly === undefined ? true : readonly,
                disable: false
            });
        },

        enable: function(enable) {
            this._editable({
                readonly: false,
                disable: !(enable = enable === undefined ? true : enable)
            });
        },

        destroy: function() {
            var that = this;

            Widget.fn.destroy.call(that);

            that.dateView.destroy();

            that.element.off(ns);
            that._dateIcon.off(ns);
            that._inputWrapper.off(ns);

            if (that._form) {
                that._form.off("reset", that._resetHandler);
            }
        },

        open: function() {
            this.dateView.open();
        },

        close: function() {
            this.dateView.close();
        },

        min: function(value) {
            return this._option(MIN, value);
        },

        max: function(value) {
            return this._option(MAX, value);
        },

        value: function(value) {
            var that = this;

            if (value === undefined) {
                return that._value;
            }

            that._old = that._update(value);

            if (that._old === null) {
                that.element.val("");
            }

            that._oldText = that.element.val();
        },

        _toggleHover: function(e) {
            $(e.currentTarget).toggleClass(HOVER, e.type === "mouseenter");
        },

        _blur: function() {
            var that = this,
                value = that.element.val();

            that.close();
            if (value !== that._oldText) {
                that._change(value);
            }

            that._inputWrapper.removeClass(FOCUSED);
        },

        _click: function() {
            var that = this,
                element = that.element;

            that.dateView.toggle();

            if (!kendo.support.touch && element[0] !== activeElement()) {
                element.focus();
            }
        },

        _change: function(value) {
            var that = this;

            value = that._update(value);

            if (+that._old != +value) {
                that._old = value;
                that._oldText = that.element.val();

                if (!that._typing) {
                    // trigger the DOM change event so any subscriber gets notified
                    that.element.trigger(CHANGE);
                }

                that.trigger(CHANGE);
            }

            that._typing = false;
        },

        _keydown: function(e) {
            var that = this,
                dateView = that.dateView,
                value = that.element.val(),
                handled = false;

            if (!dateView.popup.visible() && e.keyCode == keys.ENTER && value !== that._oldText) {
                that._change(value);
            } else {
                handled = dateView.move(e);
                that._updateARIA(dateView._current);

                if (!handled) {
                    that._typing = true;
                }
            }
        },

        _icon: function() {
            var that = this,
                element = that.element,
                icon;

            icon = element.next("span.k-select");

            if (!icon[0]) {
                icon = $('<span unselectable="on" class="k-select"><span unselectable="on" class="k-icon k-i-calendar">select</span></span>').insertAfter(element);
            }

            that._dateIcon = icon.attr({
                "role": "button",
                "aria-controls": that.dateView._dateViewID
            });
        },

        _option: function(option, value) {
            var that = this,
                options = that.options;

            if (value === undefined) {
                return options[option];
            }

            value = parse(value, options.parseFormats, options.culture);

            if (!value) {
                return;
            }

            options[option] = new DATE(+value);
            that.dateView[option](value);
        },

        _update: function(value) {
            var that = this,
                options = that.options,
                min = options.min,
                max = options.max,
                current = that._value,
                date = parse(value, options.parseFormats, options.culture),
                isSameType = (date === null && current === null) || (date instanceof Date && current instanceof Date),
                formattedValue;

            if (+date === +current && isSameType) {
                formattedValue = kendo.toString(date, options.format, options.culture);

                if (formattedValue !== value) {
                    that.element.val(date === null ? value : formattedValue);
                }

                return date;
            }

            if (date !== null && isEqualDatePart(date, min)) {
                date = restrictValue(date, min, max);
            } else if (!isInRange(date, min, max)) {
                date = null;
            }

            that._value = date;
            that.dateView.value(date);
            that.element.val(date ? kendo.toString(date, options.format, options.culture) : value);
            that._updateARIA(date);

            return date;
        },

        _wrapper: function() {
            var that = this,
                element = that.element,
                wrapper;

            wrapper = element.parents(".k-datepicker");

            if (!wrapper[0]) {
                wrapper = element.wrap(SPAN).parent().addClass("k-picker-wrap k-state-default");
                wrapper = wrapper.wrap(SPAN).parent();
            }

            wrapper[0].style.cssText = element[0].style.cssText;
            element.css({
                width: "100%",
                height: element[0].style.height
            });

            that.wrapper = wrapper.addClass("k-widget k-datepicker k-header")
                                  .addClass(element[0].className);

            that._inputWrapper = $(wrapper[0].firstChild);
        },

        _reset: function() {
            var that = this,
                element = that.element,
                formId = element.attr("form"),
                form = formId ? $("#" + formId) : element.closest("form");

            if (form[0]) {
                that._resetHandler = function() {
                    that.value(element[0].defaultValue);
                    that.max(that._initialOptions.max);
                    that.min(that._initialOptions.min);
                };

                that._form = form.on("reset", that._resetHandler);
            }
        },

        _template: function() {
            this._ariaTemplate = template(this.options.ARIATemplate);
        },

        _updateARIA: function(date) {
            var cell;
            var that = this;
            var calendar = that.dateView.calendar;

            that.element.removeAttr("aria-activedescendant");

            if (calendar) {
                cell = calendar._cell;
                cell.attr("aria-label", that._ariaTemplate({ current: date || calendar.current() }));

                that.element.attr("aria-activedescendant", cell.attr("id"));
            }
        }
    });

    ui.plugin(DatePicker);

})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
        caret = kendo.caret,
        keys = kendo.keys,
        ui = kendo.ui,
        Widget = ui.Widget,
        activeElement = kendo._activeElement,
        extractFormat = kendo._extractFormat,
        parse = kendo.parseFloat,
        placeholderSupported = kendo.support.placeholder,
        getCulture = kendo.getCulture,
        round = kendo._round,
        CHANGE = "change",
        DISABLED = "disabled",
        READONLY = "readonly",
        INPUT = "k-input",
        SPIN = "spin",
        ns = ".kendoNumericTextBox",
        TOUCHEND = "touchend",
        MOUSELEAVE = "mouseleave" + ns,
        HOVEREVENTS = "mouseenter" + ns + " " + MOUSELEAVE,
        DEFAULT = "k-state-default",
        FOCUSED = "k-state-focused",
        HOVER = "k-state-hover",
        FOCUS = "focus",
        POINT = ".",
        SELECTED = "k-state-selected",
        STATEDISABLED = "k-state-disabled",
        ARIA_DISABLED = "aria-disabled",
        ARIA_READONLY = "aria-readonly",
        INTEGER_REGEXP = /^(-)?(\d*)$/,
        NULL = null,
        proxy = $.proxy,
        extend = $.extend;

    var NumericTextBox = Widget.extend({
         init: function(element, options) {
             var that = this,
             isStep = options && options.step !== undefined,
             min, max, step, value, disabled;

             Widget.fn.init.call(that, element, options);

             options = that.options;
             element = that.element
                           .on("focusout" + ns, proxy(that._focusout, that))
                           .attr("role", "spinbutton");

             options.placeholder = options.placeholder || element.attr("placeholder");

             that._initialOptions = extend({}, options);

             that._reset();
             that._wrapper();
             that._arrows();
             that._input();

             if (!kendo.support.mobileOS) {
                 that._text.on(FOCUS + ns, proxy(that._click, that));
             } else {
                 that._text.on(TOUCHEND + ns + " " + FOCUS + ns, function(e) {
                    that._toggleText(false);
                    element.focus();
                 });
             }

             min = that.min(element.attr("min"));
             max = that.max(element.attr("max"));
             step = that._parse(element.attr("step"));

             if (options.min === NULL && min !== NULL) {
                 options.min = min;
             }

             if (options.max === NULL && max !== NULL) {
                 options.max = max;
             }

             if (!isStep && step !== NULL) {
                 options.step = step;
             }

             element.attr("aria-valuemin", options.min)
                    .attr("aria-valuemax", options.max);

             options.format = extractFormat(options.format);

             value = options.value;
             that.value(value !== NULL ? value : element.val());

             disabled = element.is("[disabled]") || $(that.element).parents("fieldset").is(':disabled');

             if (disabled) {
                 that.enable(false);
             } else {
                 that.readonly(element.is("[readonly]"));
             }

             kendo.notify(that);
         },

        options: {
            name: "NumericTextBox",
            decimals: NULL,
            min: NULL,
            max: NULL,
            value: NULL,
            step: 1,
            culture: "",
            format: "n",
            spinners: true,
            placeholder: "",
            upArrowText: "Increase value",
            downArrowText: "Decrease value"
        },
        events: [
            CHANGE,
            SPIN
        ],

        _editable: function(options) {
            var that = this,
                element = that.element,
                disable = options.disable,
                readonly = options.readonly,
                text = that._text.add(element),
                wrapper = that._inputWrapper.off(HOVEREVENTS);

            that._toggleText(true);

            that._upArrowEventHandler.unbind("press");
            that._downArrowEventHandler.unbind("press");
            element.off("keydown" + ns).off("keypress" + ns).off("paste" + ns);

            if (!readonly && !disable) {
                wrapper
                    .addClass(DEFAULT)
                    .removeClass(STATEDISABLED)
                    .on(HOVEREVENTS, that._toggleHover);

                text.removeAttr(DISABLED)
                    .removeAttr(READONLY)
                    .attr(ARIA_DISABLED, false)
                    .attr(ARIA_READONLY, false);

                that._upArrowEventHandler.bind("press", function(e) {
                    e.preventDefault();
                    that._spin(1);
                    that._upArrow.addClass(SELECTED);
                });

                that._downArrowEventHandler.bind("press", function(e) {
                    e.preventDefault();
                    that._spin(-1);
                    that._downArrow.addClass(SELECTED);
                });

                that.element
                    .on("keydown" + ns, proxy(that._keydown, that))
                    .on("keypress" + ns, proxy(that._keypress, that))
                    .on("paste" + ns, proxy(that._paste, that));

            } else {
                wrapper
                    .addClass(disable ? STATEDISABLED : DEFAULT)
                    .removeClass(disable ? DEFAULT : STATEDISABLED);

                text.attr(DISABLED, disable)
                    .attr(READONLY, readonly)
                    .attr(ARIA_DISABLED, disable)
                    .attr(ARIA_READONLY, readonly);
            }
        },

        readonly: function(readonly) {
            this._editable({
                readonly: readonly === undefined ? true : readonly,
                disable: false
            });
        },

        enable: function(enable) {
            this._editable({
                readonly: false,
                disable: !(enable = enable === undefined ? true : enable)
            });
        },

        destroy: function() {
            var that = this;

            that.element
                .add(that._text)
                .add(that._upArrow)
                .add(that._downArrow)
                .add(that._inputWrapper)
                .off(ns);

            that._upArrowEventHandler.destroy();
            that._downArrowEventHandler.destroy();

            if (that._form) {
                that._form.off("reset", that._resetHandler);
            }

            Widget.fn.destroy.call(that);
        },

        min: function(value) {
            return this._option("min", value);
        },

        max: function(value) {
            return this._option("max", value);
        },

        step: function(value) {
            return this._option("step", value);
        },

        value: function(value) {
            var that = this, adjusted;

            if (value === undefined) {
                return that._value;
            }

            value = that._parse(value);
            adjusted = that._adjust(value);

            if (value !== adjusted) {
                return;
            }

            that._update(value);
            that._old = that._value;
        },

        focus: function() {
            this._focusin();
        },

        _adjust: function(value) {
            var that = this,
            options = that.options,
            min = options.min,
            max = options.max;

            if (value === NULL) {
                return value;
            }

            if (min !== NULL && value < min) {
                value = min;
            } else if (max !== NULL && value > max) {
                value = max;
            }

            return value;
        },

        _arrows: function() {
            var that = this,
            arrows,
            _release = function() {
                clearTimeout( that._spinning );
                arrows.removeClass(SELECTED);
            },
            options = that.options,
            spinners = options.spinners,
            element = that.element;

            arrows = element.siblings(".k-icon");

            if (!arrows[0]) {
                arrows = $(buttonHtml("n", options.upArrowText) + buttonHtml("s", options.downArrowText))
                        .insertAfter(element);

                arrows.wrapAll('<span class="k-select"/>');
            }

            if (!spinners) {
                arrows.parent().toggle(spinners);
                that._inputWrapper.addClass("k-expand-padding");
            }

            that._upArrow = arrows.eq(0);
            that._upArrowEventHandler = new kendo.UserEvents(that._upArrow, { release: _release });
            that._downArrow = arrows.eq(1);
            that._downArrowEventHandler = new kendo.UserEvents(that._downArrow, { release: _release });
        },

        _blur: function() {
            var that = this;

            that._toggleText(true);
            that._change(that.element.val());
        },

        _click: function(e) {
            var that = this;

            clearTimeout(that._focusing);
            that._focusing = setTimeout(function() {
                var input = e.target,
                    idx = caret(input)[0],
                    value = input.value.substring(0, idx),
                    format = that._format(that.options.format),
                    group = format[","],
                    result, groupRegExp, extractRegExp,
                    caretPosition = 0;

                if (group) {
                    groupRegExp = new RegExp("\\" + group, "g");
                    extractRegExp = new RegExp("([\\d\\" + group + "]+)(\\" + format[POINT] + ")?(\\d+)?");
                }

                if (extractRegExp) {
                    result = extractRegExp.exec(value);
                }

                if (result) {
                    caretPosition = result[0].replace(groupRegExp, "").length;

                    if (value.indexOf("(") != -1 && that._value < 0) {
                        caretPosition++;
                    }
                }

                that._focusin();

                caret(that.element[0], caretPosition);
            });
        },

        _change: function(value) {
            var that = this;

            that._update(value);
            value = that._value;

            if (that._old != value) {
                that._old = value;

                if (!that._typing) {
                    // trigger the DOM change event so any subscriber gets notified
                    that.element.trigger(CHANGE);
                }

                that.trigger(CHANGE);
            }

            that._typing = false;
        },

        _culture: function(culture) {
            return culture || getCulture(this.options.culture);
        },

        _focusin: function() {
            var that = this;
            that._inputWrapper.addClass(FOCUSED);
            that._toggleText(false);
            that.element[0].focus();
        },

        _focusout: function() {
            var that = this;

            clearTimeout(that._focusing);
            that._inputWrapper.removeClass(FOCUSED).removeClass(HOVER);
            that._blur();
        },

        _format: function(format, culture) {
            var numberFormat = this._culture(culture).numberFormat;

            format = format.toLowerCase();

            if (format.indexOf("c") > -1) {
                numberFormat = numberFormat.currency;
            } else if (format.indexOf("p") > -1) {
                numberFormat = numberFormat.percent;
            }

            return numberFormat;
        },

        _input: function() {
            var that = this,
                CLASSNAME = "k-formatted-value",
                element = that.element.addClass(INPUT).show()[0],
                accessKey = element.accessKey,
                wrapper = that.wrapper,
                text;

            text = wrapper.find(POINT + CLASSNAME);

            if (!text[0]) {
                text = $('<input type="text"/>').insertBefore(element).addClass(CLASSNAME);
            }

            try {
                element.setAttribute("type", "text");
            } catch(e) {
                element.type = "text";
            }

            text[0].tabIndex = element.tabIndex;
            text[0].style.cssText = element.style.cssText;
            text[0].title = element.title;
            text.prop("placeholder", that.options.placeholder);

            if (accessKey) {
                text.attr("accesskey", accessKey);
                element.accessKey = "";
            }

            that._text = text.addClass(element.className);
        },

        _keydown: function(e) {
            var that = this,
                key = e.keyCode;

            that._key = key;

            if (key == keys.DOWN) {
                that._step(-1);
            } else if (key == keys.UP) {
                that._step(1);
            } else if (key == keys.ENTER) {
                that._change(that.element.val());
            } else {
                that._typing = true;
            }

        },

        _keypress: function(e) {
            if (e.which === 0 || e.metaKey || e.ctrlKey || e.keyCode === keys.BACKSPACE || e.keyCode === keys.ENTER) {
                return;
            }

            var that = this;
            var min = that.options.min;
            var element = that.element;
            var selection = caret(element);
            var selectionStart = selection[0];
            var selectionEnd = selection[1];
            var character = String.fromCharCode(e.which);
            var numberFormat = that._format(that.options.format);
            var isNumPadDecimal = that._key === keys.NUMPAD_DOT;
            var value = element.val();
            var isValid;

            if (isNumPadDecimal) {
                character = numberFormat[POINT];
            }

            value = value.substring(0, selectionStart) + character + value.substring(selectionEnd);
            isValid = that._numericRegex(numberFormat).test(value);

            if (isValid && isNumPadDecimal) {
                element.val(value);
                caret(element, selectionStart + character.length);

                e.preventDefault();
            } else if ((min !== null && min >= 0 && value.charAt(0) === "-") || !isValid) {
                e.preventDefault();
            }

            that._key = 0;
        },

        _numericRegex: function(numberFormat) {
            var that = this;
            var separator = numberFormat[POINT];
            var precision = that.options.decimals;

            if (separator === POINT) {
                separator = "\\" + separator;
            }

            if (precision === NULL) {
                precision = numberFormat.decimals;
            }

            if (precision === 0) {
                return INTEGER_REGEXP;
            }

            if (that._separator !== separator) {
                that._separator = separator;
                that._floatRegExp = new RegExp("^(-)?(((\\d+(" + separator + "\\d*)?)|(" + separator + "\\d*)))?$");
            }

            return that._floatRegExp;
        },

        _paste: function(e) {
            var that = this,
                element = e.target,
                value = element.value;

            setTimeout(function() {
                if (that._parse(element.value) === NULL) {
                    that._update(value);
                }
            });
        },

        _option: function(option, value) {
            var that = this,
                options = that.options;

            if (value === undefined) {
                return options[option];
            }

            value = that._parse(value);

            if (!value && option === "step") {
                return;
            }

            options[option] = value;
            that.element
                .attr("aria-value" + option, value)
                .attr(option, value);
        },

        _spin: function(step, timeout) {
            var that = this;

            timeout = timeout || 500;

            clearTimeout( that._spinning );
            that._spinning = setTimeout(function() {
                that._spin(step, 50);
            }, timeout );

            that._step(step);
        },

        _step: function(step) {
            var that = this,
                element = that.element,
                value = that._parse(element.val()) || 0;

            if (activeElement() != element[0]) {
                that._focusin();
            }

            value += that.options.step * step;

            that._update(that._adjust(value));
            that._typing = false;

            that.trigger(SPIN);
        },

        _toggleHover: function(e) {
            $(e.currentTarget).toggleClass(HOVER, e.type === "mouseenter");
        },

        _toggleText: function(toggle) {
            var that = this;

            that._text.toggle(toggle);
            that.element.toggle(!toggle);
        },

        _parse: function(value, culture) {
            return parse(value, this._culture(culture), this.options.format);
        },

        _update: function(value) {
            var that = this,
                options = that.options,
                format = options.format,
                decimals = options.decimals,
                culture = that._culture(),
                numberFormat = that._format(format, culture),
                isNotNull;

            if (decimals === NULL) {
                decimals = numberFormat.decimals;
            }

            value = that._parse(value, culture);

            isNotNull = value !== NULL;

            if (isNotNull) {
                value = parseFloat(round(value, decimals));
            }

            that._value = value = that._adjust(value);
            that._placeholder(kendo.toString(value, format, culture));

            if (isNotNull) {
                value = value.toString();
                if (value.indexOf("e") !== -1) {
                    value = round(+value, decimals);
                }
                value = value.replace(POINT, numberFormat[POINT]);
            } else {
                value = "";
            }

            that.element.val(value).attr("aria-valuenow", value);
        },

        _placeholder: function(value) {
            this._text.val(value);
            if (!placeholderSupported && !value) {
                this._text.val(this.options.placeholder);
            }
        },

        _wrapper: function() {
            var that = this,
                element = that.element,
                DOMElement = element[0],
                wrapper;

            wrapper = element.parents(".k-numerictextbox");

            if (!wrapper.is("span.k-numerictextbox")) {
                wrapper = element.hide().wrap('<span class="k-numeric-wrap k-state-default" />').parent();
                wrapper = wrapper.wrap("<span/>").parent();
            }

            wrapper[0].style.cssText = DOMElement.style.cssText;
            DOMElement.style.width = "";
            that.wrapper = wrapper.addClass("k-widget k-numerictextbox")
                                  .addClass(DOMElement.className)
                                  .css("display", "");

            that._inputWrapper = $(wrapper[0].firstChild);
        },

        _reset: function() {
            var that = this,
                element = that.element,
                formId = element.attr("form"),
                form = formId ? $("#" + formId) : element.closest("form");

            if (form[0]) {
                that._resetHandler = function() {
                    setTimeout(function() {
                        that.value(element[0].value);
                        that.max(that._initialOptions.max);
                        that.min(that._initialOptions.min);
                    });
                };

                that._form = form.on("reset", that._resetHandler);
            }
        }
    });

    function buttonHtml(className, text) {
        return '<span unselectable="on" class="k-link"><span unselectable="on" class="k-icon k-i-arrow-' + className + '" title="' + text + '">' + text + '</span></span>';
    }

    ui.plugin(NumericTextBox);
})(window.kendo.jQuery);





/* jshint eqnull: true */
(function($, undefined) {
    var kendo = window.kendo,
        Widget = kendo.ui.Widget,
        NS = ".kendoValidator",
        INVALIDMSG = "k-invalid-msg",
        invalidMsgRegExp = new RegExp(INVALIDMSG,'i'),
        INVALIDINPUT = "k-invalid",
        VALIDINPUT = "k-valid",
        emailRegExp = /^((([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+(\.([a-z]|\d|[!#\$%&'\*\+\-\/=\?\^_`{\|}~]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])+)*)|((\x22)((((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(([\x01-\x08\x0b\x0c\x0e-\x1f\x7f]|\x21|[\x23-\x5b]|[\x5d-\x7e]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(\\([\x01-\x09\x0b\x0c\x0d-\x7f]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))))*(((\x20|\x09)*(\x0d\x0a))?(\x20|\x09)+)?(\x22)))@((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))$/i,
        urlRegExp = /^(https?|ftp):\/\/(((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:)*@)?(((\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\.(\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5]))|((([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|\d|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.)+(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])*([a-z]|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])))\.?)(:\d*)?)(\/((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)+(\/(([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)*)*)?)?(\?((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|[\uE000-\uF8FF]|\/|\?)*)?(\#((([a-z]|\d|-|\.|_|~|[\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF])|(%[\da-f]{2})|[!\$&'\(\)\*\+,;=]|:|@)|\/|\?)*)?$/i,
        INPUTSELECTOR = ":input:not(:button,[type=submit],[type=reset],[disabled],[readonly])",
        CHECKBOXSELECTOR = ":checkbox:not([disabled],[readonly])",
        NUMBERINPUTSELECTOR = "[type=number],[type=range]",
        BLUR = "blur",
        NAME = "name",
        FORM = "form",
        NOVALIDATE = "novalidate",
        proxy = $.proxy,
        patternMatcher = function(value, pattern) {
            if (typeof pattern === "string") {
                pattern = new RegExp('^(?:' + pattern + ')$');
            }
            return pattern.test(value);
        },
        matcher = function(input, selector, pattern) {
            var value = input.val();

            if (input.filter(selector).length && value !== "") {
                return patternMatcher(value, pattern);
            }
            return true;
        },
        hasAttribute = function(input, name) {
            if (input.length)  {
                return input[0].attributes[name] != null;
            }
            return false;
        };

    if (!kendo.ui.validator) {
        kendo.ui.validator = { rules: {}, messages: {} };
    }

    function resolveRules(element) {
        var resolvers = kendo.ui.validator.ruleResolvers || {},
            rules = {},
            name;

        for (name in resolvers) {
            $.extend(true, rules, resolvers[name].resolve(element));
        }
        return rules;
    }

    function decode(value) {
        return value.replace(/&amp/g, '&amp;')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
    }

    function numberOfDecimalDigits(value) {
        value = (value + "").split('.');
        if (value.length > 1) {
            return value[1].length;
        }
        return 0;
    }

    function parseHtml(text) {
        if ($.parseHTML) {
            return $($.parseHTML(text));
        }
        return $(text);
    }

    function searchForMessageContainer(elements, fieldName) {
        var containers = $(),
            element,
            attr;

        for (var idx = 0, length = elements.length; idx < length; idx++) {
            element = elements[idx];
            if (invalidMsgRegExp.test(element.className)) {
                attr = element.getAttribute(kendo.attr("for"));
                if (attr === fieldName) {
                    containers = containers.add(element);
                }
            }
        }
        return containers;
    }

    var Validator = Widget.extend({
        init: function(element, options) {
            var that = this,
                resolved = resolveRules(element),
                validateAttributeSelector = "[" + kendo.attr("validate") + "!=false]";

            options = options || {};

            options.rules = $.extend({}, kendo.ui.validator.rules, resolved.rules, options.rules);
            options.messages = $.extend({}, kendo.ui.validator.messages, resolved.messages, options.messages);

            Widget.fn.init.call(that, element, options);

            that._errorTemplate = kendo.template(that.options.errorTemplate);

            if (that.element.is(FORM)) {
                that.element.attr(NOVALIDATE, NOVALIDATE);
            }

            that._inputSelector = INPUTSELECTOR + validateAttributeSelector;
            that._checkboxSelector = CHECKBOXSELECTOR + validateAttributeSelector;

            that._errors = {};
            that._attachEvents();
            that._isValidated = false;
        },

        events: [ "validate", "change" ],

        options: {
            name: "Validator",
            errorTemplate: '<span class="k-widget k-tooltip k-tooltip-validation">' +
                '<span class="k-icon k-warning"> </span> #=message#</span>',
            messages: {
                required: "{0} is required",
                pattern: "{0} is not valid",
                min: "{0} should be greater than or equal to {1}",
                max: "{0} should be smaller than or equal to {1}",
                step: "{0} is not valid",
                email: "{0} is not valid email",
                url: "{0} is not valid URL",
                date: "{0} is not valid date",
                dateCompare: "End date should be greater than or equal to the start date"
            },
            rules: {
                required: function(input) {
                    var checkbox = input.filter("[type=checkbox]").length && !input.is(":checked"),
                        value = input.val();

                    return !(hasAttribute(input, "required") && (value === "" || !value  || checkbox));
                },
                pattern: function(input) {
                    if (input.filter("[type=text],[type=email],[type=url],[type=tel],[type=search],[type=password]").filter("[pattern]").length && input.val() !== "") {
                        return patternMatcher(input.val(), input.attr("pattern"));
                    }
                    return true;
                },
                min: function(input) {
                    if (input.filter(NUMBERINPUTSELECTOR + ",[" + kendo.attr("type") + "=number]").filter("[min]").length && input.val() !== "") {
                        var min = parseFloat(input.attr("min")) || 0,
                            val = kendo.parseFloat(input.val());

                        return min <= val;
                    }
                    return true;
                },
                max: function(input) {
                    if (input.filter(NUMBERINPUTSELECTOR + ",[" + kendo.attr("type") + "=number]").filter("[max]").length && input.val() !== "") {
                        var max = parseFloat(input.attr("max")) || 0,
                            val = kendo.parseFloat(input.val());

                        return max >= val;
                    }
                    return true;
                },
                step: function(input) {
                    if (input.filter(NUMBERINPUTSELECTOR + ",[" + kendo.attr("type") + "=number]").filter("[step]").length && input.val() !== "") {
                        var min = parseFloat(input.attr("min")) || 0,
                            step = parseFloat(input.attr("step")) || 1,
                            val = parseFloat(input.val()),
                            decimals = numberOfDecimalDigits(step),
                            raise;

                        if (decimals) {
                            raise = Math.pow(10, decimals);
                            return ((Math.floor((val-min)*raise))%(step*raise)) / Math.pow(100, decimals) === 0;
                        }
                        return ((val-min)%step) === 0;
                    }
                    return true;
                },
                email: function(input) {
                    return matcher(input, "[type=email],[" + kendo.attr("type") + "=email]", emailRegExp);
                },
                url: function(input) {
                    return matcher(input, "[type=url],[" + kendo.attr("type") + "=url]", urlRegExp);
                },
                date: function(input) {
                    if (input.filter("[type^=date],[" + kendo.attr("type") + "=date]").length && input.val() !== "") {
                        return kendo.parseDate(input.val(), input.attr(kendo.attr("format"))) !== null;
                    }
                    return true;
                }
            },
            validateOnBlur: true
        },

        destroy: function() {
            Widget.fn.destroy.call(this);

            this.element.off(NS);
        },

        value: function() {
            if (!this._isValidated) {
                return false;
            }

            return this.errors().length === 0;
        },

        _submit: function(e) {
            if (!this.validate()) {
                e.stopPropagation();
                e.stopImmediatePropagation();
                e.preventDefault();
                return false;
            }
            return true;
        },

        _checkElement: function(element) {
            var state = this.value();

            this.validateInput(element);

            if (this.value() !== state) {
                this.trigger("change");
            }
        },

        _attachEvents: function() {
            var that = this;

            if (that.element.is(FORM)) {
                that.element.on("submit" + NS, proxy(that._submit, that));
            }

            if (that.options.validateOnBlur) {
                if (!that.element.is(INPUTSELECTOR)) {
                    that.element.on(BLUR + NS, that._inputSelector, function() {
                        that._checkElement($(this));
                    });

                    that.element.on("click" + NS, that._checkboxSelector, function() {
                        that._checkElement($(this));
                    });
                } else {
                    that.element.on(BLUR + NS, function() {
                        that._checkElement(that.element);
                    });

                    if (that.element.is(CHECKBOXSELECTOR)) {
                        that.element.on("click" + NS, function() {
                            that._checkElement(that.element);
                        });
                    }
                }
            }
        },

        validate: function() {
            var inputs;
            var idx;
            var result = false;
            var length;

            var isValid = this.value();

            this._errors = {};

            if (!this.element.is(INPUTSELECTOR)) {
                var invalid = false;

                inputs = this.element.find(this._inputSelector);

                for (idx = 0, length = inputs.length; idx < length; idx++) {
                    if (!this.validateInput(inputs.eq(idx))) {
                        invalid = true;
                    }
                }

                result = !invalid;
            } else {
                result = this.validateInput(this.element);
            }

            this.trigger("validate", { valid: result });

            if (isValid !== result) {
                this.trigger("change");
            }

            return result;
        },

        validateInput: function(input) {
            input = $(input);

            this._isValidated = true;

            var that = this,
                template = that._errorTemplate,
                result = that._checkValidity(input),
                valid = result.valid,
                className = "." + INVALIDMSG,
                fieldName = (input.attr(NAME) || ""),
                lbl = that._findMessageContainer(fieldName).add(input.next(className).filter(function() {
                    var element = $(this);
                    if (element.filter("[" + kendo.attr("for") + "]").length) {
                        return element.attr(kendo.attr("for")) === fieldName;
                    }

                    return true;

                })).hide(),
                messageText;

            input.removeAttr("aria-invalid");

            if (!valid) {
                messageText = that._extractMessage(input, result.key);
                that._errors[fieldName] = messageText;
                var messageLabel = parseHtml(template({ message: decode(messageText) }));
                var lblId = lbl.attr('id');

                that._decorateMessageContainer(messageLabel, fieldName);

                if (lblId) {
                    messageLabel.attr('id', lblId);
                }

                if (!lbl.replaceWith(messageLabel).length) {
                    messageLabel.insertAfter(input);
                }
                messageLabel.show();

                input.attr("aria-invalid", true);
            } else {
                delete that._errors[fieldName];
            }

            input.toggleClass(INVALIDINPUT, !valid);
            input.toggleClass(VALIDINPUT, valid);

            return valid;
        },

        hideMessages: function() {
            var that = this,
                className = "." + INVALIDMSG,
                element = that.element;

            if (!element.is(INPUTSELECTOR)) {
                element.find(className).hide();
            } else {
                element.next(className).hide();
            }
        },

        _findMessageContainer: function(fieldName) {
            var locators = kendo.ui.validator.messageLocators,
                name,
                containers = $();

            for (var idx = 0, length = this.element.length; idx < length; idx++) {
                containers = containers.add(searchForMessageContainer(this.element[idx].getElementsByTagName("*"), fieldName));
            }

            for (name in locators) {
                containers = containers.add(locators[name].locate(this.element, fieldName));
            }

            return containers;
        },

        _decorateMessageContainer: function(container, fieldName) {
            var locators = kendo.ui.validator.messageLocators,
                name;

            container.addClass(INVALIDMSG)
                .attr(kendo.attr("for"), fieldName || "");

            for (name in locators) {
                locators[name].decorate(container, fieldName);
            }

            container.attr("role", "alert");
        },

        _extractMessage: function(input, ruleKey) {
            var that = this,
                customMessage = that.options.messages[ruleKey],
                fieldName = input.attr(NAME);

            customMessage = kendo.isFunction(customMessage) ? customMessage(input) : customMessage;

            return kendo.format(input.attr(kendo.attr(ruleKey + "-msg")) || input.attr("validationMessage") || input.attr("title") || customMessage || "", fieldName, input.attr(ruleKey));
        },

        _checkValidity: function(input) {
            var rules = this.options.rules,
                rule;

            for (rule in rules) {
                if (!rules[rule].call(this, input)) {
                    return { valid: false, key: rule };
                }
            }

            return { valid: true };
        },

        errors: function() {
            var results = [],
                errors = this._errors,
                error;

            for (error in errors) {
                results.push(errors[error]);
            }
            return results;
        }
    });

    kendo.ui.plugin(Validator);
})(window.kendo.jQuery);





/*jshint eqnull: true */
(function ($, undefined) {
    var kendo = window.kendo,
        browser = kendo.support.browser,
        Observable = kendo.Observable,
        ObservableObject = kendo.data.ObservableObject,
        ObservableArray = kendo.data.ObservableArray,
        toString = {}.toString,
        binders = {},
        slice = Array.prototype.slice,
        Class = kendo.Class,
        proxy = $.proxy,
        VALUE = "value",
        SOURCE = "source",
        EVENTS = "events",
        CHECKED = "checked",
        CSS = "css",
        deleteExpando = true,
        CHANGE = "change";

    (function() {
        var a = document.createElement("a");

        try {
            delete a.test;
        } catch(e) {
            deleteExpando = false;
        }
    })();

    var Binding = Observable.extend( {
        init: function(parents, path) {
            var that = this;

            Observable.fn.init.call(that);

            that.source = parents[0];
            that.parents = parents;
            that.path = path;
            that.dependencies = {};
            that.dependencies[path] = true;
            that.observable = that.source instanceof Observable;

            that._access = function(e) {
                that.dependencies[e.field] = true;
            };

            if (that.observable) {
                that._change = function(e) {
                    that.change(e);
                };

                that.source.bind(CHANGE, that._change);
            }
        },

        _parents: function() {
            var parents = this.parents;
            var value = this.get();

            if (value && typeof value.parent == "function") {
                var parent = value.parent();

                if ($.inArray(parent, parents) < 0) {
                    parents = [parent].concat(parents);
                }
            }

            return parents;
        },

        change: function(e) {
            var dependency,
                ch,
                field = e.field,
                that = this;

            if (that.path === "this") {
                that.trigger(CHANGE, e);
            } else {
                for (dependency in that.dependencies) {
                    if (dependency.indexOf(field) === 0) {
                       ch = dependency.charAt(field.length);

                       if (!ch || ch === "." || ch === "[") {
                            that.trigger(CHANGE, e);
                            break;
                       }
                    }
                }
            }
        },

        start: function(source) {
            source.bind("get", this._access);
        },

        stop: function(source) {
            source.unbind("get", this._access);
        },

        get: function() {

            var that = this,
                source = that.source,
                index = 0,
                path = that.path,
                result = source;

            if (!that.observable) {
                return result;
            }

            that.start(that.source);

            result = source.get(path);

            // Traverse the observable hierarchy if the binding is not resolved at the current level.
            while (result === undefined && source) {

                source = that.parents[++index];

                if (source instanceof ObservableObject) {
                    result = source.get(path);
                }
            }

            // second pass try to get the parent from the object hierarchy
            if (result === undefined) {
                source = that.source; //get the initial source

                while (result === undefined && source) {
                    source = source.parent();

                    if (source instanceof ObservableObject) {
                        result = source.get(path);
                    }
                }
            }

            // If the result is a function - invoke it
            if (typeof result === "function") {
                index = path.lastIndexOf(".");

                // If the function is a member of a nested observable object make that nested observable the context (this) of the function
                if (index > 0) {
                    source = source.get(path.substring(0, index));
                }

                // Invoke the function
                that.start(source);

                if (source !== that.source) {
                    result = result.call(source, that.source);
                } else {
                    result = result.call(source);
                }

                that.stop(source);
            }

            // If the binding is resolved by a parent object
            if (source && source !== that.source) {

                that.currentSource = source; // save parent object

                // Listen for changes in the parent object
                source.unbind(CHANGE, that._change)
                      .bind(CHANGE, that._change);
            }

            that.stop(that.source);

            return result;
        },

        set: function(value) {
            var source = this.currentSource || this.source;

            var field = kendo.getter(this.path)(source);

            if (typeof field === "function") {
                if (source !== this.source) {
                    field.call(source, this.source, value);
                } else {
                    field.call(source, value);
                }
            } else {
                source.set(this.path, value);
            }
        },

        destroy: function() {
            if (this.observable) {
                this.source.unbind(CHANGE, this._change);
                if(this.currentSource) {
                    this.currentSource.unbind(CHANGE, this._change);
                }
            }

            this.unbind();
        }
    });

    var EventBinding = Binding.extend( {
        get: function() {
            var source = this.source,
                path = this.path,
                index = 0,
                handler;

            handler = source.get(path);

            while (!handler && source) {
                source = this.parents[++index];

                if (source instanceof ObservableObject) {
                    handler = source.get(path);
                }
            }

            return proxy(handler, source);
        }
    });

    var TemplateBinding = Binding.extend( {
        init: function(source, path, template) {
            var that = this;

            Binding.fn.init.call(that, source, path);

            that.template = template;
        },

        render: function(value) {
            var html;

            this.start(this.source);

            html = kendo.render(this.template, value);

            this.stop(this.source);

            return html;
        }
    });

    var Binder = Class.extend({
        init: function(element, bindings, options) {
            this.element = element;
            this.bindings = bindings;
            this.options = options;
        },

        bind: function(binding, attribute) {
            var that = this;

            binding = attribute ? binding[attribute] : binding;

            binding.bind(CHANGE, function(e) {
                that.refresh(attribute || e);
            });

            that.refresh(attribute);
        },

        destroy: function() {
        }
    });

    var TypedBinder = Binder.extend({
        dataType: function() {
            var dataType = this.element.getAttribute("data-type") || this.element.type || "text";
            return dataType.toLowerCase();
        },

        parsedValue: function() {
            return this._parseValue(this.element.value, this.dataType());
        },

        _parseValue: function (value, dataType){
            if (dataType == "date") {
                value = kendo.parseDate(value, "yyyy-MM-dd");
            } else if (dataType == "datetime-local") {
                value = kendo.parseDate(value, ["yyyy-MM-ddTHH:mm:ss", "yyyy-MM-ddTHH:mm"] );
            } else if (dataType == "number") {
                value = kendo.parseFloat(value);
            } else if (dataType == "boolean"){
                value = value.toLowerCase();
                if(kendo.parseFloat(value) !== null){
                    value = Boolean(kendo.parseFloat(value));
                }else{
                    value = (value.toLowerCase() === "true");
                }
            }
            return value;
        }
    });

    binders.attr = Binder.extend({
        refresh: function(key) {
            this.element.setAttribute(key, this.bindings.attr[key].get());
        }
    });

    binders.css = Binder.extend({
        init: function(element, bindings, options) {
            Binder.fn.init.call(this, element, bindings, options);
            this.classes = {};
        },
        refresh: function(className) {
            var element = $(this.element),
                binding = this.bindings.css[className],
                hasClass = this.classes[className] = binding.get();
            if(hasClass){
                element.addClass(className);
            }else{
                element.removeClass(className);
            }
        }
    });

    binders.style = Binder.extend({
        refresh: function(key) {
            this.element.style[key] = this.bindings.style[key].get() || "";
        }
    });

    binders.enabled = Binder.extend({
        refresh: function() {
            if (this.bindings.enabled.get()) {
                this.element.removeAttribute("disabled");
            } else {
                this.element.setAttribute("disabled", "disabled");
            }
        }
    });

    binders.readonly = Binder.extend({
       refresh: function() {
            if (this.bindings.readonly.get()) {
                this.element.setAttribute("readonly", "readonly");
            } else {
                this.element.removeAttribute("readonly");
            }
       }
    });

    binders.disabled = Binder.extend({
        refresh: function() {
            if (this.bindings.disabled.get()) {
                this.element.setAttribute("disabled", "disabled");
            } else {
                this.element.removeAttribute("disabled");
            }
        }
    });

    binders.events = Binder.extend({
        init: function(element, bindings, options) {
            Binder.fn.init.call(this, element, bindings, options);
            this.handlers = {};
        },

        refresh: function(key) {
            var element = $(this.element),
                binding = this.bindings.events[key],
                handler = this.handlers[key];

            if (handler) {
                element.off(key, handler);
            }

            handler = this.handlers[key] = binding.get();

            element.on(key, binding.source, handler);
        },

        destroy: function() {
            var element = $(this.element),
                handler;

            for (handler in this.handlers) {
                element.off(handler, this.handlers[handler]);
            }
        }
    });

    binders.text = Binder.extend({
        refresh: function() {
            var text = this.bindings.text.get();
            var dataFormat = this.element.getAttribute("data-format") || "";
            if (text == null) {
                text = "";
            }

            $(this.element).text(kendo.toString(text, dataFormat));
        }
    });

    binders.visible = Binder.extend({
        refresh: function() {
            if (this.bindings.visible.get()) {
                this.element.style.display = "";
            } else {
                this.element.style.display = "none";
            }
        }
    });

    binders.invisible = Binder.extend({
        refresh: function() {
            if (!this.bindings.invisible.get()) {
                this.element.style.display = "";
            } else {
                this.element.style.display = "none";
            }
        }
  });

    binders.html = Binder.extend({
        refresh: function() {
            this.element.innerHTML = this.bindings.html.get();
        }
    });

    binders.value = TypedBinder.extend({
        init: function(element, bindings, options) {
            TypedBinder.fn.init.call(this, element, bindings, options);

            this._change = proxy(this.change, this);
            this.eventName = options.valueUpdate || CHANGE;

            $(this.element).on(this.eventName, this._change);

            this._initChange = false;
        },

        change: function() {
            this._initChange = this.eventName != CHANGE;

            this.bindings[VALUE].set(this.parsedValue());

            this._initChange = false;
        },

        refresh: function() {
            if (!this._initChange) {
                var value = this.bindings[VALUE].get();

                if (value == null) {
                    value = "";
                }

                var type = this.dataType();

                if (type == "date") {
                    value = kendo.toString(value, "yyyy-MM-dd");
                } else if (type == "datetime-local") {
                    value = kendo.toString(value, "yyyy-MM-ddTHH:mm:ss");
                }

                this.element.value = value;
            }

            this._initChange = false;
        },

        destroy: function() {
            $(this.element).off(this.eventName, this._change);
        }
    });

    binders.source = Binder.extend({
        init: function(element, bindings, options) {
            Binder.fn.init.call(this, element, bindings, options);

            var source = this.bindings.source.get();

            if (source instanceof kendo.data.DataSource && options.autoBind !== false) {
                source.fetch();
            }
        },

        refresh: function(e) {
            var that = this,
                source = that.bindings.source.get();

            if (source instanceof ObservableArray || source instanceof kendo.data.DataSource) {
                e = e || {};

                if (e.action == "add") {
                    that.add(e.index, e.items);
                } else if (e.action == "remove") {
                    that.remove(e.index, e.items);
                } else if (e.action != "itemchange") {
                    that.render();
                }
            } else {
                that.render();
            }
        },

        container: function() {
            var element = this.element;

            if (element.nodeName.toLowerCase() == "table") {
                if (!element.tBodies[0]) {
                    element.appendChild(document.createElement("tbody"));
                }
                element = element.tBodies[0];
            }

            return element;
        },

        template: function() {
            var options = this.options,
                template = options.template,
                nodeName = this.container().nodeName.toLowerCase();

            if (!template) {
                if (nodeName == "select") {
                    if (options.valueField || options.textField) {
                        template = kendo.format('<option value="#:{0}#">#:{1}#</option>',
                            options.valueField || options.textField, options.textField || options.valueField);
                    } else {
                        template = "<option>#:data#</option>";
                    }
                } else if (nodeName == "tbody") {
                    template = "<tr><td>#:data#</td></tr>";
                } else if (nodeName == "ul" || nodeName == "ol") {
                    template = "<li>#:data#</li>";
                } else {
                    template = "#:data#";
                }
                template = kendo.template(template);
            }

            return template;
        },

        add: function(index, items) {
            var element = this.container(),
                parents,
                idx,
                length,
                child,
                clone = element.cloneNode(false),
                reference = element.children[index];

            $(clone).html(kendo.render(this.template(), items));

            if (clone.children.length) {
                parents = this.bindings.source._parents();

                for (idx = 0, length = items.length; idx < length; idx++) {
                    child = clone.children[0];
                    element.insertBefore(child, reference || null);
                    bindElement(child, items[idx], this.options.roles, [items[idx]].concat(parents));
                }
            }
        },

        remove: function(index, items) {
            var idx, element = this.container();

            for (idx = 0; idx < items.length; idx++) {
                var child = element.children[index];
                unbindElementTree(child);
                element.removeChild(child);
            }
        },

        render: function() {
            var source = this.bindings.source.get(),
                parents,
                idx,
                length,
                element = this.container(),
                template = this.template();

            if (source instanceof kendo.data.DataSource) {
                source = source.view();
            }

            if (!(source instanceof ObservableArray) && toString.call(source) !== "[object Array]") {
                source = [source];
            }

            if (this.bindings.template) {
                unbindElementChildren(element);

                $(element).html(this.bindings.template.render(source));

                if (element.children.length) {
                    parents = this.bindings.source._parents();

                    for (idx = 0, length = source.length; idx < length; idx++) {
                        bindElement(element.children[idx], source[idx], this.options.roles, [source[idx]].concat(parents));
                    }
                }
            }
            else {
                $(element).html(kendo.render(template, source));
            }
        }
    });

    binders.input = {
        checked: TypedBinder.extend({
            init: function(element, bindings, options) {
                TypedBinder.fn.init.call(this, element, bindings, options);
                this._change = proxy(this.change, this);

                $(this.element).change(this._change);
            },

            change: function() {
                var element = this.element;
                var value = this.value();

                if (element.type == "radio") {
                    value = this.parsedValue();
                    this.bindings[CHECKED].set(value);
                } else if (element.type == "checkbox") {
                    var source = this.bindings[CHECKED].get();
                    var index;

                    if (source instanceof ObservableArray) {
                        value = this.parsedValue();
                        if (value instanceof Date) {
                            for(var i = 0; i < source.length; i++){
                                if(source[i] instanceof Date && +source[i] === +value){
                                    index = i;
                                    break;
                                }
                            }
                        }else{
                            index = source.indexOf(value);
                        }
                        if (index > -1) {
                            source.splice(index, 1);
                        } else {
                            source.push(value);
                        }
                    } else {
                        this.bindings[CHECKED].set(value);
                    }
                }
            },

            refresh: function() {
                var value = this.bindings[CHECKED].get(),
                    source = value,
                    type = this.dataType(),
                    element = this.element;

                if (element.type == "checkbox") {
                    if (source instanceof ObservableArray) {
                        var index = -1;
                        value = this.parsedValue();
                        if(value instanceof Date){
                            for(var i = 0; i < source.length; i++){
                                if(source[i] instanceof Date && +source[i] === +value){
                                    index = i;
                                    break;
                                }
                            }
                        }else{
                            index = source.indexOf(value);
                        }
                        element.checked = (index >= 0);
                    }else{
                        element.checked = source;
                    }
                } else if (element.type == "radio" && value != null) {
                    if (type == "date") {
                        value = kendo.toString(value, "yyyy-MM-dd");
                    } else if (type == "datetime-local") {
                        value = kendo.toString(value, "yyyy-MM-ddTHH:mm:ss");
                    }
                    if (element.value === value.toString()) {
                        element.checked = true;
                    }else{
                        element.checked = false;
                    }
                }
            },

            value: function() {
                var element = this.element,
                    value = element.value;

                if (element.type == "checkbox") {
                    value = element.checked;
                }

                return value;
            },
            destroy: function() {
                $(this.element).off(CHANGE, this._change);
            }
        })
    };

    binders.select = {
        source: binders.source.extend({
            refresh: function(e) {
                var that = this,
                    source = that.bindings.source.get();

                if (source instanceof ObservableArray || source instanceof kendo.data.DataSource) {
                    e = e || {};
                    if (e.action == "add") {
                        that.add(e.index, e.items);
                    } else if (e.action == "remove") {
                        that.remove(e.index, e.items);
                    } else if (e.action == "itemchange" || e.action === undefined) {
                        that.render();
                        if(that.bindings.value){
                            if (that.bindings.value) {
                                that.element.value = retrievePrimitiveValues(that.bindings.value.get(), $(that.element).data("valueField"));
                            }
                        }
                    }
                } else {
                    that.render();
                }
            }
        }),
        value: TypedBinder.extend({
            init: function(target, bindings, options) {
                TypedBinder.fn.init.call(this, target, bindings, options);

                this._change = proxy(this.change, this);
                $(this.element).change(this._change);
            },

            parsedValue : function() {
                var dataType = this.dataType();
                var values = [];
                var value, option, idx, length;
                for (idx = 0, length = this.element.options.length; idx < length; idx++) {
                    option = this.element.options[idx];

                    if (option.selected) {
                        value = option.attributes.value;

                        if (value && value.specified) {
                            value = option.value;
                        } else {
                            value = option.text;
                        }

                        values.push(this._parseValue(value, dataType));
                    }
                }
                return values;
            },

            change: function() {
                var values = [],
                    element = this.element,
                    source,
                    field = this.options.valueField || this.options.textField,
                    valuePrimitive = this.options.valuePrimitive,
                    option,
                    valueIndex,
                    value,
                    idx,
                    length;

                for (idx = 0, length = element.options.length; idx < length; idx++) {
                    option = element.options[idx];

                    if (option.selected) {
                        value = option.attributes.value;

                        if (value && value.specified) {
                            value = option.value;
                        } else {
                            value = option.text;
                        }

                        values.push(this._parseValue(value, this.dataType()));
                    }
                }

                if (field) {
                    source = this.bindings.source.get();
                    if (source instanceof kendo.data.DataSource) {
                        source = source.view();
                    }

                    for (valueIndex = 0; valueIndex < values.length; valueIndex++) {
                        for (idx = 0, length = source.length; idx < length; idx++) {
                            var sourceValue = this._parseValue(source[idx].get(field), this.dataType());
                            var match = (String(sourceValue) === values[valueIndex]);
                            if (match) {
                                values[valueIndex] = source[idx];
                                break;
                            }
                        }
                    }
                }

                value = this.bindings[VALUE].get();
                if (value instanceof ObservableArray) {
                    value.splice.apply(value, [0, value.length].concat(values));
                } else if (!valuePrimitive && (value instanceof ObservableObject || value === null || value === undefined || !field)) {
                    this.bindings[VALUE].set(values[0]);
                } else {
                    this.bindings[VALUE].set(values[0].get(field));
                }
            },
            refresh: function() {
                var optionIndex,
                    element = this.element,
                    options = element.options,
                    valuePrimitive = this.options.valuePrimitive,
                    value = this.bindings[VALUE].get(),
                    values = value,
                    field = this.options.valueField || this.options.textField,
                    found = false,
                    type = this.dataType(),
                    optionValue;

                if (!(values instanceof ObservableArray)) {
                    values = new ObservableArray([value]);
                }

                element.selectedIndex = -1;

                for (var valueIndex = 0; valueIndex < values.length; valueIndex++) {
                    value = values[valueIndex];


                    if (field && value instanceof ObservableObject) {
                        value = value.get(field);
                    }

                    if (type == "date") {
                        value = kendo.toString(values[valueIndex], "yyyy-MM-dd");
                    } else if (type == "datetime-local") {
                        value = kendo.toString(values[valueIndex], "yyyy-MM-ddTHH:mm:ss");
                    }

                    for (optionIndex = 0; optionIndex < options.length; optionIndex++) {
                        optionValue = options[optionIndex].value;

                        if (optionValue === "" && value !== "") {
                            optionValue = options[optionIndex].text;
                        }

                        if (value != null && optionValue == value.toString()) {
                            options[optionIndex].selected = true;
                            found = true;
                        }
                    }
                }
            },
            destroy: function() {
                $(this.element).off(CHANGE, this._change);
            }
        })
    };

    function dataSourceBinding(bindingName, fieldName, setter) {
        return Binder.extend({
            init: function(widget, bindings, options) {
                var that = this;

                Binder.fn.init.call(that, widget.element[0], bindings, options);

                that.widget = widget;
                that._dataBinding = proxy(that.dataBinding, that);
                that._dataBound = proxy(that.dataBound, that);
                that._itemChange = proxy(that.itemChange, that);
            },

            itemChange: function(e) {
                bindElement(e.item[0], e.data, this._ns(e.ns), [e.data].concat(this.bindings[bindingName]._parents()));
            },

            dataBinding: function(e) {
                var idx,
                    length,
                    widget = this.widget,
                    items = e.removedItems || widget.items();

                for (idx = 0, length = items.length; idx < length; idx++) {
                    unbindElementTree(items[idx]);
                }
            },

            _ns: function(ns) {
                ns = ns || kendo.ui;
                var all = [ kendo.ui, kendo.dataviz.ui, kendo.mobile.ui ];
                all.splice($.inArray(ns, all), 1);
                all.unshift(ns);

                return kendo.rolesFromNamespaces(all);
            },

            dataBound: function(e) {
                var idx,
                    length,
                    widget = this.widget,
                    items = e.addedItems || widget.items(),
                    dataSource = widget[fieldName],
                    view,
                    parents,
                    groups = dataSource.group() || [],
                    hds = kendo.data.HierarchicalDataSource;

                if (hds && dataSource instanceof hds) {
                    // suppress binding of HDS items, because calling view() on root
                    // will return only root items, and widget.items() returns all items
                    return;
                }

                if (items.length) {
                    view = e.addedDataItems || dataSource.flatView();
                    parents = this.bindings[bindingName]._parents();

                    for (idx = 0, length = view.length; idx < length; idx++) {
                        bindElement(items[idx], view[idx], this._ns(e.ns), [view[idx]].concat(parents));
                    }
                }
            },

            refresh: function(e) {
                var that = this,
                    source,
                    widget = that.widget;

                e = e || {};

                if (!e.action) {
                    that.destroy();

                    widget.bind("dataBinding", that._dataBinding);
                    widget.bind("dataBound", that._dataBound);
                    widget.bind("itemChange", that._itemChange);

                    source = that.bindings[bindingName].get();

                    if (widget[fieldName] instanceof kendo.data.DataSource && widget[fieldName] != source) {
                        if (source instanceof kendo.data.DataSource) {
                            widget[setter](source);
                        } else if (source && source._dataSource) {
                            widget[setter](source._dataSource);
                        } else {
                            widget[fieldName].data(source);

                            if (that.bindings.value && (widget instanceof kendo.ui.Select || widget instanceof kendo.ui.MultiSelect)) {
                                widget.value(retrievePrimitiveValues(that.bindings.value.get(), widget.options.dataValueField));
                            }
                        }
                    }
                }
            },

            destroy: function() {
                var widget = this.widget;

                widget.unbind("dataBinding", this._dataBinding);
                widget.unbind("dataBound", this._dataBound);
                widget.unbind("itemChange", this._itemChange);
            }
        });
    }

    binders.widget = {
        events : Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);
                this.widget = widget;
                this.handlers = {};
            },

            refresh: function(key) {
                var binding = this.bindings.events[key],
                    handler = this.handlers[key];

                if (handler) {
                    this.widget.unbind(key, handler);
                }

                handler = binding.get();

                this.handlers[key] = function(e) {
                    e.data = binding.source;

                    handler(e);

                    if (e.data === binding.source) {
                        delete e.data;
                    }
                };

                this.widget.bind(key, this.handlers[key]);
            },

            destroy: function() {
                var handler;

                for (handler in this.handlers) {
                    this.widget.unbind(handler, this.handlers[handler]);
                }
            }
        }),

        checked: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
                this._change = proxy(this.change, this);
                this.widget.bind(CHANGE, this._change);
            },
            change: function() {
                this.bindings[CHECKED].set(this.value());
            },

            refresh: function() {
                this.widget.check(this.bindings[CHECKED].get() === true);
            },

            value: function() {
                var element = this.element,
                    value = element.value;

                if (value == "on" || value == "off") {
                    value = element.checked;
                }

                return value;
            },

            destroy: function() {
                this.widget.unbind(CHANGE, this._change);
            }
        }),

        visible: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
            },

            refresh: function() {
                var visible = this.bindings.visible.get();
                this.widget.wrapper[0].style.display = visible ? "" : "none";
            }
        }),

        invisible: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
            },

            refresh: function() {
                var invisible = this.bindings.invisible.get();
                this.widget.wrapper[0].style.display = invisible ? "none" : "";
            }
        }),

        enabled: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
            },

            refresh: function() {
                if (this.widget.enable) {
                    this.widget.enable(this.bindings.enabled.get());
                }
            }
        }),

        disabled: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
            },

            refresh: function() {
                if (this.widget.enable) {
                    this.widget.enable(!this.bindings.disabled.get());
                }
            }
        }),

        source: dataSourceBinding("source", "dataSource", "setDataSource"),

        value: Binder.extend({
            init: function(widget, bindings, options) {
                Binder.fn.init.call(this, widget.element[0], bindings, options);

                this.widget = widget;
                this._change = $.proxy(this.change, this);
                this.widget.first(CHANGE, this._change);

                var value = this.bindings.value.get();

                this._valueIsObservableObject = !options.valuePrimitive && (value == null || value instanceof ObservableObject);
                this._valueIsObservableArray = value instanceof ObservableArray;
                this._initChange = false;
            },

            change: function() {
                var value = this.widget.value(),
                    field = this.options.dataValueField || this.options.dataTextField,
                    isArray = toString.call(value) === "[object Array]",
                    isObservableObject = this._valueIsObservableObject,
                    valueIndex, valueLength, values = [],
                    sourceItem, sourceValue,
                    idx, length, source;

                this._initChange = true;

                if (field) {

                    if (this.bindings.source) {
                        source = this.bindings.source.get();
                    }

                    if (value === "" && (isObservableObject || this.options.valuePrimitive)) {
                        value = null;
                    } else {
                        if (!source || source instanceof kendo.data.DataSource) {
                            source = this.widget.dataSource.flatView();
                        }

                        if (isArray) {
                            valueLength = value.length;
                            values = value.slice(0);
                        }

                        for (idx = 0, length = source.length; idx < length; idx++) {
                            sourceItem = source[idx];
                            sourceValue = sourceItem.get(field);

                            if (isArray) {
                                for (valueIndex = 0; valueIndex < valueLength; valueIndex++) {
                                    if (sourceValue == values[valueIndex]) {
                                        values[valueIndex] = sourceItem;
                                        break;
                                    }
                                }
                            } else if (sourceValue == value) {
                                value = isObservableObject ? sourceItem : sourceValue;
                                break;
                            }
                        }

                        if (values[0]) {
                            if (this._valueIsObservableArray) {
                                value = values;
                            } else if (isObservableObject || !field) {
                                value = values[0];
                            } else {
                                value = values[0].get(field);
                            }
                        }
                    }
                }

                this.bindings.value.set(value);
                this._initChange = false;
            },

            refresh: function() {
                if (!this._initChange) {
                    var widget = this.widget;
                    var options = widget.options;
                    var textField = options.dataTextField;
                    var valueField = options.dataValueField || textField;
                    var value = this.bindings.value.get();
                    var text = options.text || "";
                    var idx = 0, length;
                    var values = [];

                    if (value === undefined) {
                        value = null;
                    }

                    if (valueField) {
                        if (value instanceof ObservableArray) {
                            for (length = value.length; idx < length; idx++) {
                                values[idx] = value[idx].get(valueField);
                            }
                            value = values;
                        } else if (value instanceof ObservableObject) {
                            text = value.get(textField);
                            value = value.get(valueField);
                        }
                    }

                    if (options.autoBind === false && !options.cascadeFrom && widget.listView && !widget.listView.isBound()) {
                        if (textField === valueField && !text) {
                            text = value;
                        }

                        if (!text && (value || value === 0) && options.valuePrimitive) {
                            widget.value(value);
                        } else {
                            widget._preselect(value, text);
                        }
                    } else {
                        widget.value(value);
                    }
                }

                this._initChange = false;
            },

            destroy: function() {
                this.widget.unbind(CHANGE, this._change);
            }
        }),

        gantt: {
            dependencies: dataSourceBinding("dependencies", "dependencies", "setDependenciesDataSource")
        },

        multiselect: {
            value: Binder.extend({
                init: function(widget, bindings, options) {
                    Binder.fn.init.call(this, widget.element[0], bindings, options);

                    this.widget = widget;
                    this._change = $.proxy(this.change, this);
                    this.widget.first(CHANGE, this._change);
                    this._initChange = false;
                },

                change: function() {
                    var that = this,
                        oldValues = that.bindings[VALUE].get(),
                        valuePrimitive = that.options.valuePrimitive,
                        newValues = valuePrimitive ? that.widget.value() : that.widget.dataItems();

                    var field = this.options.dataValueField || this.options.dataTextField;

                    newValues = newValues.slice(0);

                    that._initChange = true;

                    if (oldValues instanceof ObservableArray) {
                        var remove = [];

                        var newLength = newValues.length;

                        var i = 0, j = 0;
                        var old = oldValues[i];
                        var same = false;
                        var removeIndex;
                        var newValue;
                        var found;

                        while (old !== undefined) {
                            found = false;
                            for (j = 0; j < newLength; j++) {
                                if (valuePrimitive) {
                                    same = newValues[j] == old;
                                } else {
                                    newValue = newValues[j];

                                    newValue = newValue.get ? newValue.get(field) : newValue;
                                    same = newValue == (old.get ? old.get(field) : old);
                                }

                                if (same) {
                                    newValues.splice(j, 1);
                                    newLength -= 1;
                                    found = true;
                                    break;
                                }
                            }

                            if (!found) {
                                remove.push(old);
                                arraySplice(oldValues, i, 1);
                                removeIndex = i;
                            } else {
                                i += 1;
                            }

                            old = oldValues[i];
                        }

                        arraySplice(oldValues, oldValues.length, 0, newValues);

                        if (remove.length) {
                            oldValues.trigger("change", {
                                action: "remove",
                                items: remove,
                                index: removeIndex
                            });
                        }

                        if (newValues.length) {
                            oldValues.trigger("change", {
                                action: "add",
                                items: newValues,
                                index: oldValues.length - 1
                            });
                        }
                    } else {
                        that.bindings[VALUE].set(newValues);
                    }

                    that._initChange = false;
                },

                refresh: function() {
                    if (!this._initChange) {
                        var options = this.options,
                            widget = this.widget,
                            field = options.dataValueField || options.dataTextField,
                            value = this.bindings.value.get(),
                            data = value,
                            idx = 0, length,
                            values = [],
                            selectedValue;

                        if (value === undefined) {
                            value = null;
                        }

                        if (field) {
                            if (value instanceof ObservableArray) {
                                for (length = value.length; idx < length; idx++) {
                                    selectedValue = value[idx];
                                    values[idx] = selectedValue.get ? selectedValue.get(field) : selectedValue;
                                }
                                value = values;
                            } else if (value instanceof ObservableObject) {
                                value = value.get(field);
                            }
                        }

                        if (options.autoBind === false && options.valuePrimitive !== true && !widget.listView.isBound()) {
                            widget._preselect(data, value);
                        } else {
                            widget.value(value);
                        }
                    }
                },

                destroy: function() {
                    this.widget.unbind(CHANGE, this._change);
                }

            })
        },
        scheduler: {
            source: dataSourceBinding("source", "dataSource", "setDataSource").extend({
                dataBound: function(e) {
                    var idx;
                    var length;
                    var widget = this.widget;
                    var elements = e.addedItems || widget.items();
                    var data, parents;

                    if (elements.length) {
                        data = e.addedDataItems || widget.dataItems();
                        parents = this.bindings.source._parents();

                        for (idx = 0, length = data.length; idx < length; idx++) {
                            bindElement(elements[idx], data[idx], this._ns(e.ns), [data[idx]].concat(parents));
                        }
                    }
                }
            })
        }
    };

    var arraySplice = function(arr, idx, remove, add) {
        add = add || [];
        remove = remove || 0;

        var addLength = add.length;
        var oldLength = arr.length;

        var shifted = [].slice.call(arr, idx + remove);
        var shiftedLength = shifted.length;
        var index;

        if (addLength) {
            addLength = idx + addLength;
            index = 0;

            for (; idx < addLength; idx++) {
                arr[idx] = add[index];
                index++;
            }

            arr.length = addLength;
        } else if (remove) {
            arr.length = idx;

            remove += idx;
            while (idx < remove) {
                delete arr[--remove];
            }
        }

        if (shiftedLength) {
            shiftedLength = idx + shiftedLength;
            index = 0;

            for (; idx < shiftedLength; idx++) {
                arr[idx] = shifted[index];
                index++;
            }

            arr.length = shiftedLength;
        }

        idx = arr.length;

        while (idx < oldLength) {
            delete arr[idx];
            idx++;
        }
    };

    var BindingTarget = Class.extend( {
        init: function(target, options) {
            this.target = target;
            this.options = options;
            this.toDestroy = [];
        },

        bind: function(bindings) {
            var key,
                hasValue,
                hasSource,
                hasEvents,
                hasChecked,
                hasCss,
                widgetBinding = this instanceof WidgetBindingTarget,
                specificBinders = this.binders();

            for (key in bindings) {
                if (key == VALUE) {
                    hasValue = true;
                } else if (key == SOURCE) {
                    hasSource = true;
                } else if (key == EVENTS && !widgetBinding) {
                    hasEvents = true;
                } else if (key == CHECKED) {
                    hasChecked = true;
                } else if (key == CSS) {
                    hasCss = true;
                } else {
                    this.applyBinding(key, bindings, specificBinders);
                }
            }
            if (hasSource) {
                this.applyBinding(SOURCE, bindings, specificBinders);
            }

            if (hasValue) {
                this.applyBinding(VALUE, bindings, specificBinders);
            }

            if (hasChecked) {
                this.applyBinding(CHECKED, bindings, specificBinders);
            }

            if (hasEvents && !widgetBinding) {
                this.applyBinding(EVENTS, bindings, specificBinders);
            }

            if (hasCss && !widgetBinding) {
                this.applyBinding(CSS, bindings, specificBinders);
            }
        },

        binders: function() {
            return binders[this.target.nodeName.toLowerCase()] || {};
        },

        applyBinding: function(name, bindings, specificBinders) {
            var binder = specificBinders[name] || binders[name],
                toDestroy = this.toDestroy,
                attribute,
                binding = bindings[name];

            if (binder) {
                binder = new binder(this.target, bindings, this.options);

                toDestroy.push(binder);

                if (binding instanceof Binding) {
                    binder.bind(binding);
                    toDestroy.push(binding);
                } else {
                    for (attribute in binding) {
                        binder.bind(binding, attribute);
                        toDestroy.push(binding[attribute]);
                    }
                }
            } else if (name !== "template") {
                throw new Error("The " + name + " binding is not supported by the " + this.target.nodeName.toLowerCase() + " element");
            }
        },

        destroy: function() {
            var idx,
                length,
                toDestroy = this.toDestroy;

            for (idx = 0, length = toDestroy.length; idx < length; idx++) {
                toDestroy[idx].destroy();
            }
        }
    });

    var WidgetBindingTarget = BindingTarget.extend( {
        binders: function() {
            return binders.widget[this.target.options.name.toLowerCase()] || {};
        },

        applyBinding: function(name, bindings, specificBinders) {
            var binder = specificBinders[name] || binders.widget[name],
                toDestroy = this.toDestroy,
                attribute,
                binding = bindings[name];

            if (binder) {
                binder = new binder(this.target, bindings, this.target.options);

                toDestroy.push(binder);


                if (binding instanceof Binding) {
                    binder.bind(binding);
                    toDestroy.push(binding);
                } else {
                    for (attribute in binding) {
                        binder.bind(binding, attribute);
                        toDestroy.push(binding[attribute]);
                    }
                }
            } else {
                throw new Error("The " + name + " binding is not supported by the " + this.target.options.name + " widget");
            }
        }
    });

    function bindingTargetForRole(element, roles) {
        var widget = kendo.initWidget(element, {}, roles);

        if (widget) {
            return new WidgetBindingTarget(widget);
        }
    }

    var keyValueRegExp = /[A-Za-z0-9_\-]+:(\{([^}]*)\}|[^,}]+)/g,
        whiteSpaceRegExp = /\s/g;

    function parseBindings(bind) {
        var result = {},
            idx,
            length,
            token,
            colonIndex,
            key,
            value,
            tokens;

        tokens = bind.match(keyValueRegExp);

        for (idx = 0, length = tokens.length; idx < length; idx++) {
            token = tokens[idx];
            colonIndex = token.indexOf(":");

            key = token.substring(0, colonIndex);
            value = token.substring(colonIndex + 1);

            if (value.charAt(0) == "{") {
                value = parseBindings(value);
            }

            result[key] = value;
        }

        return result;
    }

    function createBindings(bindings, source, type) {
        var binding,
            result = {};

        for (binding in bindings) {
            result[binding] = new type(source, bindings[binding]);
        }

        return result;
    }

    function bindElement(element, source, roles, parents) {
        var role = element.getAttribute("data-" + kendo.ns + "role"),
            idx,
            bind = element.getAttribute("data-" + kendo.ns + "bind"),
            children = element.children,
            childrenCopy = [],
            deep = true,
            bindings,
            options = {},
            target;

        parents = parents || [source];

        if (role || bind) {
            unbindElement(element);
        }

        if (role) {
            target = bindingTargetForRole(element, roles);
        }

        if (bind) {
            bind = parseBindings(bind.replace(whiteSpaceRegExp, ""));

            if (!target) {
                options = kendo.parseOptions(element, {textField: "", valueField: "", template: "", valueUpdate: CHANGE, valuePrimitive: false, autoBind: true});
                options.roles = roles;
                target = new BindingTarget(element, options);
            }

            target.source = source;

            bindings = createBindings(bind, parents, Binding);

            if (options.template) {
                bindings.template = new TemplateBinding(parents, "", options.template);
            }

            if (bindings.click) {
                bind.events = bind.events || {};
                bind.events.click = bind.click;
                bindings.click.destroy();
                delete bindings.click;
            }

            if (bindings.source) {
                deep = false;
            }

            if (bind.attr) {
                bindings.attr = createBindings(bind.attr, parents, Binding);
            }

            if (bind.style) {
                bindings.style = createBindings(bind.style, parents, Binding);
            }

            if (bind.events) {
                bindings.events = createBindings(bind.events, parents, EventBinding);
            }

            if (bind.css) {
                bindings.css = createBindings(bind.css, parents, Binding);
            }

            target.bind(bindings);
        }

        if (target) {
            element.kendoBindingTarget = target;
        }

        if (deep && children) {
            // https://github.com/telerik/kendo/issues/1240 for the weirdness.
            for (idx = 0; idx < children.length; idx++) {
                childrenCopy[idx] = children[idx];
            }

            for (idx = 0; idx < childrenCopy.length; idx++) {
                bindElement(childrenCopy[idx], source, roles, parents);
            }
        }
    }

    function bind(dom, object) {
        var idx,
            length,
            node,
            roles = kendo.rolesFromNamespaces([].slice.call(arguments, 2));

        object = kendo.observable(object);
        dom = $(dom);

        for (idx = 0, length = dom.length; idx < length; idx++) {
            node = dom[idx];
            if (node.nodeType === 1) {
                bindElement(node, object, roles);
            }
        }
    }

    function unbindElement(element) {
        var bindingTarget = element.kendoBindingTarget;

        if (bindingTarget) {
            bindingTarget.destroy();

            if (deleteExpando) {
                delete element.kendoBindingTarget;
            } else if (element.removeAttribute) {
                element.removeAttribute("kendoBindingTarget");
            } else {
                element.kendoBindingTarget = null;
            }
        }
    }

    function unbindElementTree(element) {
        unbindElement(element);

        unbindElementChildren(element);
    }

    function unbindElementChildren(element) {
        var children = element.children;

        if (children) {
            for (var idx = 0, length = children.length; idx < length; idx++) {
                unbindElementTree(children[idx]);
            }
        }
    }

    function unbind(dom) {
        var idx, length;

        dom = $(dom);

        for (idx = 0, length = dom.length; idx < length; idx++ ) {
            unbindElementTree(dom[idx]);
        }
    }

    function notify(widget, namespace) {
        var element = widget.element,
            bindingTarget = element[0].kendoBindingTarget;

        if (bindingTarget) {
            bind(element, bindingTarget.source, namespace);
        }
    }

    function retrievePrimitiveValues(value, valueField) {
        var values = [];
        var idx = 0;
        var length;
        var item;

        if (!valueField) {
            return value;
        }

        if (value instanceof ObservableArray) {
            for (length = value.length; idx < length; idx++) {
                item = value[idx];
                values[idx] = item.get ? item.get(valueField) : item[valueField];
            }
            value = values;
        } else if (value instanceof ObservableObject) {
            value = value.get(valueField);
        }

        return value;
    }

    kendo.unbind = unbind;
    kendo.bind = bind;
    kendo.data.binders = binders;
    kendo.data.Binder = Binder;
    kendo.notify = notify;

    kendo.observable = function(object) {
        if (!(object instanceof ObservableObject)) {
            object = new ObservableObject(object);
        }

        return object;
    };

    kendo.observableHierarchy = function(array) {
        var dataSource = kendo.data.HierarchicalDataSource.create(array);

        function recursiveRead(data) {
            var i, children;

            for (i = 0; i < data.length; i++) {
                data[i]._initChildren();

                children = data[i].children;

                children.fetch();

                data[i].items = children.data();

                recursiveRead(data[i].items);
            }
        }

        dataSource.fetch();

        recursiveRead(dataSource.data());

        dataSource._data._dataSource = dataSource;

        return dataSource._data;
    };

})(window.kendo.jQuery);





/* jshint eqnull: true */
(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        Widget = ui.Widget,
        extend = $.extend,
        oldIE = kendo.support.browser.msie && kendo.support.browser.version < 9,
        isFunction = kendo.isFunction,
        isPlainObject = $.isPlainObject,
        inArray = $.inArray,
        nameSpecialCharRegExp = /("|\%|'|\[|\]|\$|\.|\,|\:|\;|\+|\*|\&|\!|\#|\(|\)|<|>|\=|\?|\@|\^|\{|\}|\~|\/|\||`)/g,
        ERRORTEMPLATE = '<div class="k-widget k-tooltip k-tooltip-validation" style="margin:0.5em"><span class="k-icon k-warning"> </span>' +
                    '#=message#<div class="k-callout k-callout-n"></div></div>',
        CHANGE = "change";

    var specialRules = ["url", "email", "number", "date", "boolean"];

    function fieldType(field) {
        field = field != null ? field : "";
        return field.type || $.type(field) || "string";
    }

    function convertToValueBinding(container) {
        container.find(":input:not(:button, [" + kendo.attr("role") + "=upload], [" + kendo.attr("skip") + "], [type=file]), select").each(function() {
            var bindAttr = kendo.attr("bind"),
                binding = this.getAttribute(bindAttr) || "",
                bindingName = this.type === "checkbox" ||  this.type === "radio" ? "checked:" : "value:",
                fieldName = this.name;

            if (binding.indexOf(bindingName) === -1 && fieldName) {
                binding += (binding.length ? "," : "") + bindingName + fieldName;

                $(this).attr(bindAttr, binding);
            }
        });
    }

    function createAttributes(options) {
        var field = (options.model.fields || options.model)[options.field],
            type = fieldType(field),
            validation = field ? field.validation : {},
            ruleName,
            DATATYPE = kendo.attr("type"),
            BINDING = kendo.attr("bind"),
            rule,
            attr = {
                name: options.field
            };

        for (ruleName in validation) {
            rule = validation[ruleName];

            if (inArray(ruleName, specialRules) >= 0) {
                attr[DATATYPE] = ruleName;
            } else if (!isFunction(rule)) {
                attr[ruleName] = isPlainObject(rule) ? rule.value || ruleName : rule;
            }

            attr[kendo.attr(ruleName + "-msg")] = rule.message;
        }

        if (inArray(type, specialRules) >= 0) {
            attr[DATATYPE] = type;
        }

        attr[BINDING] = (type === "boolean" ? "checked:" : "value:") + options.field;

        return attr;
    }

    function convertItems(items) {
        var idx,
            length,
            item,
            value,
            text,
            result;

        if (items && items.length) {
            result = [];
            for (idx = 0, length = items.length; idx < length; idx++) {
                item = items[idx];
                text = item.text || item.value || item;
                value = item.value == null ? (item.text || item) : item.value;

                result[idx] = { text: text, value: value };
            }
        }
        return result;
    }

    var editors = {
        "number": function(container, options) {
            var attr = createAttributes(options);
            $('<input type="text"/>').attr(attr).appendTo(container).kendoNumericTextBox({ format: options.format });
            $('<span ' + kendo.attr("for") + '="' + options.field + '" class="k-invalid-msg"/>').hide().appendTo(container);
        },
        "date": function(container, options) {
            var attr = createAttributes(options),
                format = options.format;

            if (format) {
                format = kendo._extractFormat(format);
            }

            attr[kendo.attr("format")] = format;

            $('<input type="text"/>').attr(attr).appendTo(container).kendoDatePicker({ format: options.format });
            $('<span ' + kendo.attr("for") + '="' + options.field + '" class="k-invalid-msg"/>').hide().appendTo(container);
        },
        "string": function(container, options) {
            var attr = createAttributes(options);

            $('<input type="text" class="k-input k-textbox"/>').attr(attr).appendTo(container);
        },
        "boolean": function(container, options) {
            var attr = createAttributes(options);
            $('<input type="checkbox" />').attr(attr).appendTo(container);
        },
        "values": function(container, options) {
            var attr = createAttributes(options);
            $('<select ' + kendo.attr("text-field") + '="text"' + kendo.attr("value-field") + '="value"' +
                kendo.attr("source") + "=\'" + kendo.stringify(convertItems(options.values)).replace(/\'/g,"&apos;") +
                "\'" + kendo.attr("role") + '="dropdownlist"/>') .attr(attr).appendTo(container);
            $('<span ' + kendo.attr("for") + '="' + options.field + '" class="k-invalid-msg"/>').hide().appendTo(container);
        }
    };

    function addValidationRules(modelField, rules) {
        var validation = modelField ? (modelField.validation || {}) : {},
            rule,
            descriptor;

        for (rule in validation) {
            descriptor = validation[rule];

            if (isPlainObject(descriptor) && descriptor.value) {
                descriptor = descriptor.value;
            }

            if (isFunction(descriptor)) {
                rules[rule] = descriptor;
            }
        }
    }

    var Editable = Widget.extend({
        init: function(element, options) {
            var that = this;

            if (options.target) {
                options.$angular = options.target.options.$angular;
            }
            Widget.fn.init.call(that, element, options);
            that._validateProxy = $.proxy(that._validate, that);
            that.refresh();
        },

        events: [CHANGE],

        options: {
            name: "Editable",
            editors: editors,
            clearContainer: true,
            errorTemplate: ERRORTEMPLATE
        },

        editor: function(field, modelField) {
            var that = this,
                editors = that.options.editors,
                isObject = isPlainObject(field),
                fieldName = isObject ? field.field : field,
                model = that.options.model || {},
                isValuesEditor = isObject && field.values,
                type = isValuesEditor ? "values" : fieldType(modelField),
                isCustomEditor = isObject && field.editor,
                editor = isCustomEditor ? field.editor : editors[type],
                container = that.element.find("[" + kendo.attr("container-for") + "=" + fieldName.replace(nameSpecialCharRegExp, "\\$1")+ "]");

            editor = editor ? editor : editors.string;

            if (isCustomEditor && typeof field.editor === "string") {
                editor = function(container) {
                    container.append(field.editor);
                };
            }

            container = container.length ? container : that.element;
            editor(container, extend(true, {}, isObject ? field : { field: fieldName }, { model: model }));
        },

        _validate: function(e) {
            var that = this,
                input,
                value = e.value,
                preventChangeTrigger = that._validationEventInProgress,
                values = {},
                bindAttribute = kendo.attr("bind"),
                fieldName = e.field.replace(nameSpecialCharRegExp, "\\$1"),
                bindingRegex = new RegExp("(value|checked)\\s*:\\s*" + fieldName + "\\s*(,|$)");

            values[e.field] = e.value;

            input = $(':input[' + bindAttribute + '*="' + fieldName + '"]', that.element)
                .filter("[" + kendo.attr("validate") + "!='false']").filter(function(element) {
                   return bindingRegex.test($(this).attr(bindAttribute));
                });
            if (input.length > 1) {
                input = input.filter(function () {
                    var element = $(this);
                    return !element.is(":radio") || element.val() == value;
                });
            }

            try {
                that._validationEventInProgress = true;

                if (!that.validatable.validateInput(input) || (!preventChangeTrigger && that.trigger(CHANGE, { values: values }))) {
                    e.preventDefault();
                }

            } finally {
                that._validationEventInProgress = false;
            }
        },

        end: function() {
            return this.validatable.validate();
        },

        destroy: function() {
            var that = this;

            that.angular("cleanup", function(){
                return { elements: that.element };
            });

            Widget.fn.destroy.call(that);

            that.options.model.unbind("set", that._validateProxy);

            kendo.unbind(that.element);

            if (that.validatable) {
                that.validatable.destroy();
            }
            kendo.destroy(that.element);

            that.element.removeData("kendoValidator");
        },

        refresh: function() {
            var that = this,
                idx,
                length,
                fields = that.options.fields || [],
                container = that.options.clearContainer ? that.element.empty() : that.element,
                model = that.options.model || {},
                rules = {},
                field,
                isObject,
                fieldName,
                modelField,
                modelFields;

            if (!$.isArray(fields)) {
                fields = [fields];
            }

            for (idx = 0, length = fields.length; idx < length; idx++) {
                 field = fields[idx];
                 isObject = isPlainObject(field);
                 fieldName = isObject ? field.field : field;
                 modelField = (model.fields || model)[fieldName];

                 addValidationRules(modelField, rules);

                 that.editor(field, modelField);
            }

            if (that.options.target) {
                that.angular("compile", function(){
                    return {
                        elements: container,
                        data: [ { dataItem: model } ]
                    };
                });
            }

            if (!length) {
                modelFields = model.fields || model;
                for (fieldName in modelFields) {
                    addValidationRules(modelFields[fieldName], rules);
               }
            }

            convertToValueBinding(container);

            if (that.validatable) {
                that.validatable.destroy();
            }

            kendo.bind(container, that.options.model);

            that.options.model.unbind("set", that._validateProxy);
            that.options.model.bind("set", that._validateProxy);

            that.validatable = new kendo.ui.Validator(container, {
                validateOnBlur: false,
                errorTemplate: that.options.errorTemplate || undefined,
                rules: rules });

            var focusable = container.find(":kendoFocusable").eq(0).focus();
            if (oldIE) {
                focusable.focus();
            }
        }
   });

   ui.plugin(Editable);
})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
        CHANGE = "change",
        CANCEL = "cancel",
        DATABOUND = "dataBound",
        DATABINDING = "dataBinding",
        Widget = kendo.ui.Widget,
        keys = kendo.keys,
        FOCUSSELECTOR =  ">*",
        PROGRESS = "progress",
        ERROR = "error",
        FOCUSED = "k-state-focused",
        SELECTED = "k-state-selected",
        KEDITITEM = "k-edit-item",
        STRING = "string",
        EDIT = "edit",
        REMOVE = "remove",
        SAVE = "save",
        CLICK = "click",
        NS = ".kendoListView",
        proxy = $.proxy,
        activeElement = kendo._activeElement,
        progress = kendo.ui.progress,
        DataSource = kendo.data.DataSource;

    var ListView = kendo.ui.DataBoundWidget.extend( {
        init: function(element, options) {
            var that = this;

            options = $.isArray(options) ? { dataSource: options } : options;

            Widget.fn.init.call(that, element, options);

            options = that.options;

            that.wrapper = element = that.element;

            if (element[0].id) {
                that._itemId = element[0].id + "_lv_active";
            }

            that._element();

            that._dataSource();

            that._templates();

            that._navigatable();

            that._selectable();

            that._pageable();

            that._crudHandlers();

            if (that.options.autoBind){
                that.dataSource.fetch();
            }

            kendo.notify(that);
        },

        events: [
            CHANGE,
            CANCEL,
            DATABINDING,
            DATABOUND,
            EDIT,
            REMOVE,
            SAVE
        ],

        options: {
            name: "ListView",
            autoBind: true,
            selectable: false,
            navigatable: false,
            template: "",
            altTemplate: "",
            editTemplate: ""
        },

        setOptions: function(options) {
            Widget.fn.setOptions.call(this, options);

            this._templates();

            if (this.selectable) {
                this.selectable.destroy();
                this.selectable = null;
            }

            this._selectable();
        },

        _templates: function() {
            var options = this.options;

            this.template = kendo.template(options.template || "");
            this.altTemplate = kendo.template(options.altTemplate || options.template);
            this.editTemplate = kendo.template(options.editTemplate || "");
        },

        _item: function(action) {
            return this.element.children()[action]();
        },

        items: function() {
            return this.element.children();
        },

        dataItem: function(element) {
            var attr = kendo.attr("uid");
            var uid = $(element).closest("[" + attr + "]").attr(attr);

            return this.dataSource.getByUid(uid);
        },

        setDataSource: function(dataSource) {
            this.options.dataSource = dataSource;
            this._dataSource();

            if (this.options.autoBind) {
                dataSource.fetch();
            }
        },

        _unbindDataSource: function() {
            var that = this;

            that.dataSource.unbind(CHANGE, that._refreshHandler)
                            .unbind(PROGRESS, that._progressHandler)
                            .unbind(ERROR, that._errorHandler);
        },

        _dataSource: function() {
            var that = this;

            if (that.dataSource && that._refreshHandler) {
                that._unbindDataSource();
            } else {
                that._refreshHandler = proxy(that.refresh, that);
                that._progressHandler = proxy(that._progress, that);
                that._errorHandler = proxy(that._error, that);
            }

            that.dataSource = DataSource.create(that.options.dataSource)
                                .bind(CHANGE, that._refreshHandler)
                                .bind(PROGRESS, that._progressHandler)
                                .bind(ERROR, that._errorHandler);
        },

        _progress: function() {
            progress(this.element, true);
        },

        _error: function() {
            progress(this.element, false);
        },

        _element: function() {
            this.element.addClass("k-widget k-listview").attr("role", "listbox");
        },

        refresh: function(e) {
            var that = this,
                view = that.dataSource.view(),
                data,
                items,
                item,
                html = "",
                idx,
                length,
                template = that.template,
                altTemplate = that.altTemplate,
                active = activeElement();

            e = e || {};

            if (e.action === "itemchange") {
                if (!that._hasBindingTarget() && !that.editable) {
                    data = e.items[0];
                    item = that.items().filter("[" + kendo.attr("uid") + "=" + data.uid + "]");

                    if (item.length > 0) {
                        idx = item.index();

                        that.angular("cleanup", function() {
                            return { elements: [ item ]};
                        });

                        item.replaceWith(template(data));
                        item = that.items().eq(idx);
                        item.attr(kendo.attr("uid"), data.uid);

                        that.angular("compile", function() {
                            return { elements: [ item ], data: [ { dataItem: data } ]};
                        });

                        that.trigger("itemChange", {
                            item: item,
                            data: data
                        });
                    }
                }

                return;
            }

            if (that.trigger(DATABINDING, { action: e.action || "rebind", items: e.items, index: e.index })) {
                return;
            }

            that._angularItems("cleanup");

            that._destroyEditable();

            for (idx = 0, length = view.length; idx < length; idx++) {
                if (idx % 2) {
                    html += altTemplate(view[idx]);
                } else {
                    html += template(view[idx]);
                }
            }

            that.element.html(html);

            items = that.items();
            for (idx = 0, length = view.length; idx < length; idx++) {
                items.eq(idx).attr(kendo.attr("uid"), view[idx].uid)
                             .attr("role", "option")
                             .attr("aria-selected", "false");
            }

            if (that.element[0] === active && that.options.navigatable) {
                that.current(items.eq(0));
            }

            that._angularItems("compile");

            that.trigger(DATABOUND);
        },

        _pageable: function() {
            var that = this,
                pageable = that.options.pageable,
                settings,
                pagerId;

            if ($.isPlainObject(pageable)) {
                pagerId = pageable.pagerId;
                settings = $.extend({}, pageable, {
                    dataSource: that.dataSource,
                    pagerId: null
                });

                that.pager = new kendo.ui.Pager($("#" + pagerId), settings);
            }
        },

        _selectable: function() {
            var that = this,
                multi,
                current,
                selectable = that.options.selectable,
                navigatable = that.options.navigatable;

            if (selectable) {
                multi = kendo.ui.Selectable.parseOptions(selectable).multiple;

                that.selectable = new kendo.ui.Selectable(that.element, {
                    aria: true,
                    multiple: multi,
                    filter: FOCUSSELECTOR,
                    change: function() {
                        that.trigger(CHANGE);
                    }
                });

                if (navigatable) {
                    that.element.on("keydown" + NS, function(e) {
                        if (e.keyCode === keys.SPACEBAR) {
                            current = that.current();
                            if (e.target == e.currentTarget) {
                                e.preventDefault();
                            }
                            if(multi) {
                                if(!e.ctrlKey) {
                                    that.selectable.clear();
                                } else {
                                    if (current && current.hasClass(SELECTED)) {
                                        current.removeClass(SELECTED);
                                        return;
                                    }
                                }
                            } else {
                                that.selectable.clear();
                            }

                            that.selectable.value(current);
                        }
                    });
                }
            }
        },

        current: function(candidate) {
            var that = this,
                element = that.element,
                current = that._current,
                id = that._itemId;

            if (candidate === undefined) {
                return current;
            }

            if (current && current[0]) {
                if (current[0].id === id) {
                    current.removeAttr("id");
                }

                current.removeClass(FOCUSED);
                element.removeAttr("aria-activedescendant");
            }

            if (candidate && candidate[0]) {
                id = candidate[0].id || id;

                that._scrollTo(candidate[0]);

                element.attr("aria-activedescendant", id);
                candidate.addClass(FOCUSED).attr("id", id);
            }

            that._current = candidate;
        },

        _scrollTo: function(element) {
            var that = this,
                container,
                UseJQueryoffset = false,
                SCROLL = "scroll";

            if (that.wrapper.css("overflow") == "auto" || that.wrapper.css("overflow") == SCROLL) {
                container = that.wrapper[0];
            } else {
                container = window;
                UseJQueryoffset = true;
            }

            var scrollDirectionFunc = function(direction, dimension) {

                var elementOffset = UseJQueryoffset ? $(element).offset()[direction.toLowerCase()] : element["offset" + direction],
                    elementDimension = element["client" + dimension],
                    containerScrollAmount = $(container)[SCROLL + direction](),
                    containerDimension = $(container)[dimension.toLowerCase()]();

                if (elementOffset + elementDimension > containerScrollAmount + containerDimension) {
                    $(container)[SCROLL + direction](elementOffset + elementDimension - containerDimension);
                } else if (elementOffset < containerScrollAmount) {
                    $(container)[SCROLL + direction](elementOffset);
                }
            };

            scrollDirectionFunc("Top", "Height");
            scrollDirectionFunc("Left", "Width");
        },

        _navigatable: function() {
            var that = this,
                navigatable = that.options.navigatable,
                element = that.element,
                clickCallback = function(e) {
                    that.current($(e.currentTarget));
                    if(!$(e.target).is(":button,a,:input,a>.k-icon,textarea")) {
                        element.focus();
                    }
                };

            if (navigatable) {
                that._tabindex();
                element.on("focus" + NS, function() {
                        var current = that._current;
                        if(!current || !current.is(":visible")) {
                            current = that._item("first");
                        }

                        that.current(current);
                    })
                    .on("focusout" + NS, function() {
                        if (that._current) {
                            that._current.removeClass(FOCUSED);
                        }
                    })
                    .on("keydown" + NS, function(e) {
                        var key = e.keyCode,
                            current = that.current(),
                            target = $(e.target),
                            canHandle = !target.is(":button,textarea,a,a>.t-icon,input"),
                            isTextBox = target.is(":text"),
                            preventDefault = kendo.preventDefault,
                            editItem = element.find("." + KEDITITEM),
                            active = activeElement(), idx;

                        if ((!canHandle && !isTextBox && keys.ESC != key) || (isTextBox && keys.ESC != key && keys.ENTER != key)) {
                            return;
                        }

                        if (keys.UP === key || keys.LEFT === key) {
                            if (current) {
                                current = current.prev();
                            }

                            that.current(!current || !current[0] ? that._item("last") : current);
                            preventDefault(e);
                        } else if (keys.DOWN === key || keys.RIGHT === key) {
                            if (current) {
                                current = current.next();
                            }
                            that.current(!current || !current[0] ? that._item("first") : current);
                            preventDefault(e);
                        } else if (keys.PAGEUP === key) {
                            that.current(null);
                            that.dataSource.page(that.dataSource.page() - 1);
                            preventDefault(e);
                        } else if (keys.PAGEDOWN === key) {
                            that.current(null);
                            that.dataSource.page(that.dataSource.page() + 1);
                            preventDefault(e);
                        } else if (keys.HOME === key) {
                            that.current(that._item("first"));
                            preventDefault(e);
                        } else if (keys.END === key) {
                            that.current(that._item("last"));
                            preventDefault(e);
                        } else if (keys.ENTER === key) {
                            if (editItem.length !== 0 && (canHandle || isTextBox)) {
                                idx = that.items().index(editItem);
                                if (active) {
                                    active.blur();
                                }
                                that.save();
                                var focusAgain = function(){
                                    that.element.trigger("focus");
                                    that.current(that.items().eq(idx));
                                };
                                that.one("dataBound", focusAgain);
                            } else if (that.options.editTemplate !== "") {
                                that.edit(current);
                            }
                        } else if (keys.ESC === key) {
                            editItem = element.find("." + KEDITITEM);
                            if (editItem.length === 0) {
                                return;
                            }
                            idx = that.items().index(editItem);
                            that.cancel();
                            that.element.trigger("focus");
                            that.current(that.items().eq(idx));
                        }
                    });

                element.on("mousedown" + NS + " touchstart" + NS, FOCUSSELECTOR, proxy(clickCallback, that));
            }
       },

       clearSelection: function() {
           var that = this;
           that.selectable.clear();
           that.trigger(CHANGE);
       },

       select: function(items) {
           var that = this,
               selectable = that.selectable;

            items = $(items);
            if(items.length) {
                if(!selectable.options.multiple) {
                    selectable.clear();
                    items = items.first();
                }
                selectable.value(items);
                return;
            }

           return selectable.value();
       },

       _destroyEditable: function() {
           var that = this;
           if (that.editable) {
               that.editable.destroy();
               delete that.editable;
           }
       },

       _modelFromElement: function(element) {
           var uid = element.attr(kendo.attr("uid"));

           return this.dataSource.getByUid(uid);
       },

       _closeEditable: function() {
           var that = this,
               editable = that.editable,
               data,
               item,
               index,
               template = that.template;

           if (editable) {
               if (editable.element.index() % 2) {
                   template = that.altTemplate;
               }

               that.angular("cleanup", function() {
                   return { elements: [ editable.element ]};
               });

               data = that._modelFromElement(editable.element);
               that._destroyEditable();

               index = editable.element.index();
               editable.element.replaceWith(template(data));
               item = that.items().eq(index);
               item.attr(kendo.attr("uid"), data.uid);

               if (that._hasBindingTarget()) {
                   kendo.bind(item, data);
               }

               that.angular("compile", function() {
                   return { elements: [ item ], data: [ { dataItem: data } ]};
               });
           }
           return true;
       },

       edit: function(item) {
           var that = this,
               data = that._modelFromElement(item),
               container,
               uid = data.uid,
               index;

            that.cancel();

            item = that.items().filter("[" + kendo.attr("uid") + "=" + uid + "]");
            index = item.index();
            item.replaceWith(that.editTemplate(data));
            container = that.items().eq(index).addClass(KEDITITEM).attr(kendo.attr("uid"), data.uid);
            that.editable = container.kendoEditable({
                model: data,
                clearContainer: false,
                errorTemplate: false,
                target: that
            }).data("kendoEditable");

            that.trigger(EDIT, { model: data, item: container });
       },

       save: function() {
           var that = this,
               editable = that.editable,
               model;

           if (!editable) {
               return;
           }

           var container = editable.element;
           model = that._modelFromElement(container);

           if (editable.end() && !that.trigger(SAVE, { model: model, item: container }))  {
               that._closeEditable();
               that.dataSource.sync();
           }
       },

       remove: function(item) {
           var that = this,
               dataSource = that.dataSource,
               data = that._modelFromElement(item);

           if (that.editable) {
               dataSource.cancelChanges(that._modelFromElement(that.editable.element));
               that._closeEditable();
           }

           if (!that.trigger(REMOVE, { model: data, item: item })) {
               item.hide();
               dataSource.remove(data);
               dataSource.sync();
           }
       },

       add: function() {
           var that = this,
               dataItem,
               dataSource = that.dataSource,
               index = dataSource.indexOf((dataSource.view() || [])[0]);

           if (index < 0) {
               index = 0;
           }

           that.cancel();
           dataItem = dataSource.insert(index, {});
           that.edit(that.element.find("[data-uid='" + dataItem.uid + "']"));
       },

       cancel: function() {
           var that = this,
               dataSource = that.dataSource;

           if (that.editable) {
               var container = that.editable.element;
               var model = that._modelFromElement(container);

               if (!that.trigger(CANCEL, { model: model, container: container})) {
                   dataSource.cancelChanges(model);
                   that._closeEditable();
               }
           }
       },

       _crudHandlers: function() {
           var that = this,
               clickNS = CLICK + NS;

           that.element.on(clickNS, ".k-edit-button", function(e) {
               var item = $(this).closest("[" + kendo.attr("uid") + "]");
               that.edit(item);
               e.preventDefault();
           });

           that.element.on(clickNS, ".k-delete-button", function(e) {
               var item = $(this).closest("[" + kendo.attr("uid") + "]");
               that.remove(item);
               e.preventDefault();
           });

           that.element.on(clickNS, ".k-update-button", function(e) {
               that.save();
               e.preventDefault();
           });

           that.element.on(clickNS, ".k-cancel-button", function(e) {
               that.cancel();
               e.preventDefault();
           });
       },

       destroy: function() {
           var that = this;

           Widget.fn.destroy.call(that);

           that._unbindDataSource();

           that._destroyEditable();

           that.element.off(NS);

           if (that.pager) {
               that.pager.destroy();
           }

           kendo.destroy(that.element);
       }
    });

    kendo.ui.plugin(ListView);
})(window.kendo.jQuery);





(function($, undefined) {
    var kendo = window.kendo,
        ui = kendo.ui,
        Widget = ui.Widget,
        proxy = $.proxy,
        FIRST = ".k-i-seek-w",
        LAST = ".k-i-seek-e",
        PREV = ".k-i-arrow-w",
        NEXT = ".k-i-arrow-e",
        CHANGE = "change",
        NS = ".kendoPager",
        CLICK = "click",
        KEYDOWN = "keydown",
        DISABLED = "disabled",
        iconTemplate = kendo.template('<a href="\\#" title="#=text#" class="k-link k-pager-nav #= wrapClassName #"><span class="k-icon #= className #">#=text#</span></a>');

    function button(template, idx, text, numeric, title) {
        return template( {
            idx: idx,
            text: text,
            ns: kendo.ns,
            numeric: numeric,
            title: title || ""
        });
    }

    function icon(className, text, wrapClassName) {
        return iconTemplate({
            className: className.substring(1),
            text: text,
            wrapClassName: wrapClassName || ""
        });
    }

    function update(element, selector, page, disabled) {
       element.find(selector)
              .parent()
              .attr(kendo.attr("page"), page)
              .attr("tabindex", -1)
              .toggleClass("k-state-disabled", disabled);
    }

    function first(element, page) {
        update(element, FIRST, 1, page <= 1);
    }

    function prev(element, page) {
        update(element, PREV, Math.max(1, page - 1), page <= 1);
    }

    function next(element, page, totalPages) {
        update(element, NEXT, Math.min(totalPages, page + 1), page >= totalPages);
    }

    function last(element, page, totalPages) {
        update(element, LAST, totalPages, page >= totalPages);
    }

    var Pager = Widget.extend( {
        init: function(element, options) {
            var that = this, page, totalPages;

            Widget.fn.init.call(that, element, options);

            options = that.options;
            that.dataSource = kendo.data.DataSource.create(options.dataSource);
            that.linkTemplate = kendo.template(that.options.linkTemplate);
            that.selectTemplate = kendo.template(that.options.selectTemplate);
            that.currentPageTemplate = kendo.template(that.options.currentPageTemplate);

            page = that.page();
            totalPages = that.totalPages();

            that._refreshHandler = proxy(that.refresh, that);

            that.dataSource.bind(CHANGE, that._refreshHandler);

            if (options.previousNext) {
                if (!that.element.find(FIRST).length) {
                    that.element.append(icon(FIRST, options.messages.first, "k-pager-first"));

                    first(that.element, page, totalPages);
                }

                if (!that.element.find(PREV).length) {
                    that.element.append(icon(PREV, options.messages.previous));

                    prev(that.element, page, totalPages);
                }
            }

            if (options.numeric) {
                that.list = that.element.find(".k-pager-numbers");

                if (!that.list.length) {
                   that.list = $('<ul class="k-pager-numbers k-reset" />').appendTo(that.element);
                }
            }

            if (options.input) {
                if (!that.element.find(".k-pager-input").length) {
                   that.element.append('<span class="k-pager-input k-label">'+
                       options.messages.page +
                       '<input class="k-textbox">' +
                       kendo.format(options.messages.of, totalPages) +
                       '</span>');
                }

                that.element.on(KEYDOWN + NS, ".k-pager-input input", proxy(that._keydown, that));
            }

            if (options.previousNext) {
                if (!that.element.find(NEXT).length) {
                    that.element.append(icon(NEXT, options.messages.next));

                    next(that.element, page, totalPages);
                }

                if (!that.element.find(LAST).length) {
                    that.element.append(icon(LAST, options.messages.last, "k-pager-last"));

                    last(that.element, page, totalPages);
                }
            }

            if (options.pageSizes){
                if (!that.element.find(".k-pager-sizes").length){
                    var pageSizes = options.pageSizes.length ? options.pageSizes : ["all", 5, 10, 20];
                    var pageItems = $.map(pageSizes, function(size) {
                        if (size.toLowerCase && size.toLowerCase() === "all") {
                            return "<option value='all'>" + options.messages.allPages + "</option>";
                        }

                        return "<option>" + size + "</option>";
                    });

                    $('<span class="k-pager-sizes k-label"><select/>' + options.messages.itemsPerPage + "</span>")
                        .appendTo(that.element)
                        .find("select").html(pageItems.join("")).end()
                        .appendTo(that.element);
                }

                that.element.find(".k-pager-sizes select").val(that.pageSize());

                if (kendo.ui.DropDownList) {
                   that.element.find(".k-pager-sizes select").show().kendoDropDownList();
                }

                that.element.on(CHANGE + NS, ".k-pager-sizes select", proxy(that._change, that));
            }

            if (options.refresh) {
                if (!that.element.find(".k-pager-refresh").length) {
                    that.element.append('<a href="#" class="k-pager-refresh k-link" title="' + options.messages.refresh +
                        '"><span class="k-icon k-i-refresh">' + options.messages.refresh + "</span></a>");
                }

                that.element.on(CLICK + NS, ".k-pager-refresh", proxy(that._refreshClick, that));
            }

            if (options.info) {
                if (!that.element.find(".k-pager-info").length) {
                    that.element.append('<span class="k-pager-info k-label" />');
                }
            }

            that.element
                .on(CLICK + NS , "a", proxy(that._click, that))
                .addClass("k-pager-wrap k-widget k-floatwrap");

            that.element.on(CLICK + NS , ".k-current-page", proxy(that._toggleActive, that));

            if (options.autoBind) {
                that.refresh();
            }

            kendo.notify(that);
        },

        destroy: function() {
            var that = this;

            Widget.fn.destroy.call(that);

            that.element.off(NS);
            that.dataSource.unbind(CHANGE, that._refreshHandler);
            that._refreshHandler = null;

            kendo.destroy(that.element);
            that.element = that.list = null;
        },

        events: [
            CHANGE
        ],

        options: {
            name: "Pager",
            selectTemplate: '<li><span class="k-state-selected">#=text#</span></li>',
            currentPageTemplate: '<li class="k-current-page"><span class="k-link k-pager-nav">#=text#</span></li>',
            linkTemplate: '<li><a tabindex="-1" href="\\#" class="k-link" data-#=ns#page="#=idx#" #if (title !== "") {# title="#=title#" #}#>#=text#</a></li>',
            buttonCount: 10,
            autoBind: true,
            numeric: true,
            info: true,
            input: false,
            previousNext: true,
            pageSizes: false,
            refresh: false,
            messages: {
                allPages: "All",
                display: "{0} - {1} of {2} items",
                empty: "No items to display",
                page: "Page",
                of: "of {0}",
                itemsPerPage: "items per page",
                first: "Go to the first page",
                previous: "Go to the previous page",
                next: "Go to the next page",
                last: "Go to the last page",
                refresh: "Refresh",
                morePages: "More pages"
            }
        },

        setDataSource: function(dataSource) {
            var that = this;

            that.dataSource.unbind(CHANGE, that._refreshHandler);
            that.dataSource = that.options.dataSource = dataSource;
            dataSource.bind(CHANGE, that._refreshHandler);

            if (that.options.autoBind) {
                dataSource.fetch();
            }
        },

        refresh: function(e) {
            var that = this,
                idx,
                end,
                start = 1,
                reminder,
                page = that.page(),
                html = "",
                options = that.options,
                pageSize = that.pageSize(),
                total = that.dataSource.total(),
                totalPages = that.totalPages(),
                linkTemplate = that.linkTemplate,
                buttonCount = options.buttonCount;

            if (e && e.action == "itemchange") {
                return;
            }

            if (options.numeric) {

                if (page > buttonCount) {
                    reminder = (page % buttonCount);

                    start = (reminder === 0) ? (page - buttonCount) + 1 : (page - reminder) + 1;
                }

                end = Math.min((start + buttonCount) - 1, totalPages);

                if (start > 1) {
                    html += button(linkTemplate, start - 1, "...", false, options.messages.morePages);
                }

                for (idx = start; idx <= end; idx++) {
                    html += button(idx == page ? that.selectTemplate : linkTemplate, idx, idx, true);
                }

                if (end < totalPages) {
                    html += button(linkTemplate, idx, "...", false, options.messages.morePages);
                }

                if (html === "") {
                    html = that.selectTemplate({ text: 0 });
                }

                html = this.currentPageTemplate({ text: page }) + html;

                that.list.removeClass("k-state-expanded").html(html);
            }

            if (options.info) {
                if (total > 0) {
                    html = kendo.format(options.messages.display,
                        (page - 1) * pageSize + 1, // first item in the page
                        Math.min(page * pageSize, total), // last item in the page
                    total);
                } else {
                    html = options.messages.empty;
                }

                that.element.find(".k-pager-info").html(html);
            }

            if (options.input) {
                that.element
                    .find(".k-pager-input")
                    .html(that.options.messages.page +
                        '<input class="k-textbox">' +
                        kendo.format(options.messages.of, totalPages))
                    .find("input")
                    .val(page)
                    .attr(DISABLED, total < 1)
                    .toggleClass("k-state-disabled", total < 1);
            }

            if (options.previousNext) {
                first(that.element, page, totalPages);

                prev(that.element, page, totalPages);

                next(that.element, page, totalPages);

                last(that.element, page, totalPages);
            }

            if (options.pageSizes) {
                var hasAll = that.element.find(".k-pager-sizes option[value='all']").length > 0;
                var selectAll = hasAll && pageSize === this.dataSource.total();
                var text = pageSize;
                if (selectAll) {
                    pageSize = "all";
                    text = options.messages.allPages;
                }

                that.element
                    .find(".k-pager-sizes select")
                    .val(pageSize)
                    .filter("[" + kendo.attr("role") + "=dropdownlist]")
                    .kendoDropDownList("value", pageSize)
                    .kendoDropDownList("text", text); // handles custom values
            }
        },

        _keydown: function(e) {
            if (e.keyCode === kendo.keys.ENTER) {
                var input = this.element.find(".k-pager-input").find("input"),
                    page = parseInt(input.val(), 10);

                if (isNaN(page) || page < 1 || page > this.totalPages()) {
                    page = this.page();
                }

                input.val(page);

                this.page(page);
            }
        },

        _refreshClick: function(e) {
            e.preventDefault();

            this.dataSource.read();
        },

        _change: function(e) {
            var value = e.currentTarget.value;
            var pageSize = parseInt(value, 10);
            var dataSource = this.dataSource;

            if (!isNaN(pageSize)){
                dataSource.pageSize(pageSize);
            } else if ((value + "").toLowerCase() == "all") {
                dataSource.pageSize(dataSource.total());
            }
        },

        _toggleActive: function(e) {
            this.list.toggleClass("k-state-expanded");
        },

        _click: function(e) {
            var target = $(e.currentTarget);

            e.preventDefault();

            if (!target.is(".k-state-disabled")) {
                this.page(target.attr(kendo.attr("page")));
            }
        },

        totalPages: function() {
            return Math.ceil((this.dataSource.total() || 0) / (this.pageSize() || 1));
        },

        pageSize: function() {
            return this.dataSource.pageSize() || this.dataSource.total();
        },

        page: function(page) {
            if (page !== undefined) {
                this.dataSource.page(page);

                this.trigger(CHANGE, { index: page });
            } else {
                if (this.dataSource.total() > 0) {
                    return this.dataSource.page();
                } else {
                    return 0;
                }
            }
        }
    });

    ui.plugin(Pager);
})(window.kendo.jQuery);



return window.kendo;

}, typeof define == 'function' && define.amd ? define : function(_, f){ f(); });