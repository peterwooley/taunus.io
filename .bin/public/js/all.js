(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],2:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],4:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],5:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":3,"./encode":4}],6:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function about(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/about.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/about.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"why-taunus-\">Why Taunus?</h1>\n<p>Taunus focuses on delivering a progressively enhanced experience to the end-user, while providing <em>a reasonable development experience</em> as well. <strong>Taunus prioritizes content</strong>. It uses server-side rendering to get content to your humans as fast as possible, and it uses client-side rendering to improve their experience.</p>\n<p>While it focuses on progressive enhancement, <strong><a href=\"http://ponyfoo.com/articles/adjusting-ux-for-humans\">usability</a> and performance are both core concerns</strong> for Taunus. Incidentally, focusing on progressive enhancement also improves both of these. Usability is improved because the experience is gradually improved, meaning that if somewhere along the line a feature is missing, the component is <strong>still expected to work</strong>.</p>\n<p>For example, a progressively enhanced site uses plain-old links to navigate from one view to another, and then adds a <code>click</code> event handler that blocks navigation and issues an AJAX request instead. If JavaScript fails to load, perhaps the experience might stay a little bit worse, but that&#39;s okay, because we acknowledge that <strong>our sites don&#39;t need to look and behave the same on every browser</strong>. Similarly, <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">performance is greatly enhanced</a> by delivering content to the human as fast as possible, and then adding functionality on top of that.</p>\n<p>With progressive enhancement, if the functionality never gets there because a JavaScript resource failed to load because the network failed <em>(not uncommon in the mobile era)</em> or because the user blocked JavaScript, your application will still work!</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 3, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 4, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"why-not-other-frameworks-\">Why Not Other Frameworks?</h1>\n<p>Many other frameworks weren&#39;t designed with shared-rendering in mind. Content isn&#39;t prioritized, and humans are expected to <a href=\"http://ponyfoo.com/articles/stop-breaking-the-web\">download most of a web page before they can see any human-digestible content</a>. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, SEO is also a problem. Google isn&#39;t the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them.</p>\n<p>Lately, we can observe many mature open-source frameworks are dropping support for older browsers. This is necessary because of the way they&#39;re architected, where the developer is put first. <strong>Taunus is <a href=\"https://twitter.com/hashtag/humanfirst\">#humanfirst</a></strong>, meaning that it concedes that humans are more important than the developers building their applications.</p>\n<p>Progressively enhanced applications are always going to have great browser support because of the way they&#39;re architected. As the name implies, a baseline is established where we deliver the core experience to the user <em>(typically in the form of readable HTML content)</em>, and then enhance it <strong>if possible</strong> using CSS and JavaScript. Building applications in this way means that you&#39;ll be able to reach the most people with your core experience, and you&#39;ll also be able to provide humans in more modern browsers with all of the latest features and technologies.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 5, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 6, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"features\">Features</h1>\n<p>Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer and even the terminal, providing support for plain text responses <a href=\"/getting-started\">without any configuration needed</a>. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you&#39;ll only have to declare these once but they&#39;ll be used in both the server-side and the client-side.</p>\n<p>Taunus features a reasonably enhanced experience, where if features aren&#39;t available on a browser, they&#39;re just not provided. For example, the client-side router makes use of the <code>history</code> API but if that&#39;s not available then it&#39;ll fall back to simply not meddling with links instead of using a client-side-only hash router.</p>\n<p>Taunus can deal with view caching on your behalf, if you so desire, using <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">asynchronous embedded database stores</a> on the client-side. Turns out, there&#39;s <a href=\"http://caniuse.com/#search=indexeddb\">pretty good browser support for IndexedDB</a>. Of course, IndexedDB will only be used if it&#39;s available, and if it&#39;s not then views won&#39;t be cached in the client-side besides an in-memory store. <strong>The site won&#39;t simply roll over and die, though.</strong></p>\n<p>If you&#39;ve turned client-side caching on, then you can also turn on the <strong>view pre-fetching feature</strong>, which will start downloading views as soon as humans hover on links, as to deliver a <em>faster perceived human experience</em>.</p>\n<p>Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are <a href=\"/complements\">a few complementary modules</a> you can use to enhance your development experience, as well.</p>\n<p>With Taunus you&#39;ll be in charge. <a href=\"/getting-started\">Are you ready to get started?</a></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.unshift({ lineno: 7, filename: "views/documentation/about.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 8, filename: "views/documentation/about.jade" });
buf.push("<h1 id=\"familiarity\">Familiarity</h1>\n<p>You can use Taunus to develop applications using your favorite Node.js HTTP server, <strong>both <a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a> are fully supported</strong>. In both cases, you&#39;ll <a href=\"/getting-started\">build controllers the way you&#39;re already used to</a>, except you won&#39;t have to <code>require</code> the view controllers or define any view routes since Taunus will deal with that on your behalf. In the controllers you&#39;ll be able to do everything you&#39;re already able to do, and then you&#39;ll have to return a JSON model which will be used to render a view.</p>\n<p>You can use any view-rendering engine that you want, provided that it can be compiled into JavaScript functions. That&#39;s because Taunus treats views as mere JavaScript functions, rather than being tied into a specific view-rendering engine.</p>\n<p>Client-side controllers are just functions, too. You can bring your own selector engine, your own AJAX libraries, and your own data-binding solutions. It might mean there&#39;s a bit more work involved for you, but you&#39;ll also be free to pick whatever libraries you&#39;re most comfortable with! That being said, Taunus <a href=\"/complements\">does recommend a few libraries</a> that work well with it.</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Why Taunus?\n\n    Taunus focuses on delivering a progressively enhanced experience to the end-user, while providing _a reasonable development experience_ as well. **Taunus prioritizes content**. It uses server-side rendering to get content to your humans as fast as possible, and it uses client-side rendering to improve their experience.\n\n    While it focuses on progressive enhancement, **[usability][2] and performance are both core concerns** for Taunus. Incidentally, focusing on progressive enhancement also improves both of these. Usability is improved because the experience is gradually improved, meaning that if somewhere along the line a feature is missing, the component is **still expected to work**.\n\n    For example, a progressively enhanced site uses plain-old links to navigate from one view to another, and then adds a `click` event handler that blocks navigation and issues an AJAX request instead. If JavaScript fails to load, perhaps the experience might stay a little bit worse, but that's okay, because we acknowledge that **our sites don't need to look and behave the same on every browser**. Similarly, [performance is greatly enhanced][1] by delivering content to the human as fast as possible, and then adding functionality on top of that.\n\n    With progressive enhancement, if the functionality never gets there because a JavaScript resource failed to load because the network failed _(not uncommon in the mobile era)_ or because the user blocked JavaScript, your application will still work!\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://ponyfoo.com/articles/adjusting-ux-for-humans\n\nsection.ly-section.md-markdown\n  :markdown\n    # Why Not Other Frameworks?\n\n    Many other frameworks weren't designed with shared-rendering in mind. Content isn't prioritized, and humans are expected to [download most of a web page before they can see any human-digestible content][2]. While Google is going to resolve the SEO issues with dedicated client-side rendering soon, SEO is also a problem. Google isn't the only web crawler operator out there, and it might be a while before social media link crawlers catch up with them.\n\n    Lately, we can observe many mature open-source frameworks are dropping support for older browsers. This is necessary because of the way they're architected, where the developer is put first. **Taunus is [#humanfirst][1]**, meaning that it concedes that humans are more important than the developers building their applications.\n\n    Progressively enhanced applications are always going to have great browser support because of the way they're architected. As the name implies, a baseline is established where we deliver the core experience to the user _(typically in the form of readable HTML content)_, and then enhance it **if possible** using CSS and JavaScript. Building applications in this way means that you'll be able to reach the most people with your core experience, and you'll also be able to provide humans in more modern browsers with all of the latest features and technologies.\n\n    [1]: https://twitter.com/hashtag/humanfirst\n    [2]: http://ponyfoo.com/articles/stop-breaking-the-web\n\nsection.ly-section.md-markdown\n  :markdown\n    # Features\n\n    Out of the box, Taunus ensures that your site works on any HTML-enabled document viewer and even the terminal, providing support for plain text responses [without any configuration needed][2]. Even while Taunus provides shared-rendering capabilities, it offers code reuse of views and routes, meaning you'll only have to declare these once but they'll be used in both the server-side and the client-side.\n\n    Taunus features a reasonably enhanced experience, where if features aren't available on a browser, they're just not provided. For example, the client-side router makes use of the `history` API but if that's not available then it'll fall back to simply not meddling with links instead of using a client-side-only hash router.\n\n    Taunus can deal with view caching on your behalf, if you so desire, using [asynchronous embedded database stores][3] on the client-side. Turns out, there's [pretty good browser support for IndexedDB][4]. Of course, IndexedDB will only be used if it's available, and if it's not then views won't be cached in the client-side besides an in-memory store. **The site won't simply roll over and die, though.**\n\n    If you've turned client-side caching on, then you can also turn on the **view pre-fetching feature**, which will start downloading views as soon as humans hover on links, as to deliver a _faster perceived human experience_.\n\n    Taunus provides the bare bones for your application so that you can separate concerns into routes, controllers, models, and views. Then it gets out of the way, by design. There are [a few complementary modules][1] you can use to enhance your development experience, as well.\n\n    With Taunus you'll be in charge. [Are you ready to get started?][2]\n\n    [1]: /complements\n    [2]: /getting-started\n    [3]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [4]: http://caniuse.com/#search=indexeddb\n\nsection.ly-section.md-markdown\n  :markdown\n    # Familiarity\n\n    You can use Taunus to develop applications using your favorite Node.js HTTP server, **both [Express][3] and [Hapi][4] are fully supported**. In both cases, you'll [build controllers the way you're already used to][1], except you won't have to `require` the view controllers or define any view routes since Taunus will deal with that on your behalf. In the controllers you'll be able to do everything you're already able to do, and then you'll have to return a JSON model which will be used to render a view.\n\n    You can use any view-rendering engine that you want, provided that it can be compiled into JavaScript functions. That's because Taunus treats views as mere JavaScript functions, rather than being tied into a specific view-rendering engine.\n\n    Client-side controllers are just functions, too. You can bring your own selector engine, your own AJAX libraries, and your own data-binding solutions. It might mean there's a bit more work involved for you, but you'll also be free to pick whatever libraries you're most comfortable with! That being said, Taunus [does recommend a few libraries][2] that work well with it.\n\n    [1]: /getting-started\n    [2]: /complements\n    [3]: http://expressjs.com\n    [4]: http://hapijs.com\n");
}
}
},{"jadum/runtime":32}],7:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function api(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/api.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/api.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/api.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/api.jade" });
buf.push("<h1 id=\"api-documentation\">API Documentation</h1>\n<p>Here&#39;s the API documentation for Taunus. If you&#39;ve never used it before, we recommend going over the <a href=\"/getting-started\">Getting Started</a> guide before jumping into the API documentation. That way, you&#39;ll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.</p>\n<p>Taunus exposes <em>three different public APIs</em>, and there&#39;s also <strong>plugins to integrate Taunus and an HTTP server</strong>. This document covers all three APIs extensively. If you&#39;re concerned about the inner workings of Taunus, please refer to the <a href=\"/getting-started\">Getting Started</a> guide. This document aims to only cover how the public interface affects application state, but <strong>doesn&#39;t delve into implementation details</strong>.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li>A <a href=\"#server-side-api\">server-side API</a> that deals with server-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Its <a href=\"#the-options-object\"><code>options</code></a> argument<ul>\n<li><a href=\"#-options-layout-\"><code>layout</code></a></li>\n<li><a href=\"#-options-routes-\"><code>routes</code></a></li>\n<li><a href=\"#-options-getdefaultviewmodel-\"><code>getDefaultViewModel</code></a></li>\n<li><a href=\"#-options-plaintext-\"><code>plaintext</code></a></li>\n<li><a href=\"#-options-resolvers-\"><code>resolvers</code></a></li>\n</ul>\n</li>\n<li>Its <a href=\"#-addroute-definition-\"><code>addRoute</code></a> argument</li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render</code></a> method</li>\n<li>The <a href=\"#-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel</code></a> method</li>\n</ul>\n</li>\n<li>A <a href=\"#http-framework-plugins\">suite of plugins</a> can integrate Taunus and an HTTP server<ul>\n<li>Using <a href=\"#using-taunus-express-\"><code>taunus-express</code></a> for <a href=\"http://expressjs.com\">Express</a></li>\n<li>Using <a href=\"#using-taunus-hapi-\"><code>taunus-hapi</code></a> for <a href=\"http://hapijs.com\">Hapi</a></li>\n</ul>\n</li>\n<li>A <a href=\"#command-line-interface\">CLI that produces a wiring module</a> for the client-side<ul>\n<li>The <a href=\"#-output-\"><code>--output</code></a> flag</li>\n<li>The <a href=\"#-watch-\"><code>--watch</code></a> flag</li>\n<li>The <a href=\"#-transform-module-\"><code>--transform &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></a> flag</li>\n<li>The <a href=\"#-standalone-\"><code>--standalone</code></a> flag</li>\n</ul>\n</li>\n<li>A <a href=\"#client-side-api\">client-side API</a> that deals with client-side rendering<ul>\n<li>The <a href=\"#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> method<ul>\n<li>Using the <a href=\"#using-the-auto-strategy\"><code>auto</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-inline-strategy\"><code>inline</code></a> strategy</li>\n<li>Using the <a href=\"#using-the-manual-strategy\"><code>manual</code></a> strategy</li>\n<li><a href=\"#caching\">Caching</a></li>\n<li><a href=\"#prefetching\">Prefetching</a></li>\n</ul>\n</li>\n<li>The <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a> method</li>\n<li>The <a href=\"#-taunus-once-type-fn-\"><code>taunus.once</code></a> method</li>\n<li>The <a href=\"#-taunus-off-type-fn-\"><code>taunus.off</code></a> method</li>\n<li>The <a href=\"#-taunus-intercept-action-fn-\"><code>taunus.intercept</code></a> method</li>\n<li>The <a href=\"#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a> method</li>\n<li>The <a href=\"#-taunus-navigate-url-\"><code>taunus.navigate</code></a> method</li>\n<li>The <a href=\"#-taunus-route-url-\"><code>taunus.state</code></a> property</li>\n<li>The <a href=\"#-taunus-state-\"><code>taunus.route</code></a> method</li>\n</ul>\n</li>\n<li>The <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a> manifest</li>\n</ul>\n<h1 id=\"server-side-api\">Server-side API</h1>\n<p>The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, <em>including client-side rendering</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-addroute-options-\"><code>taunus.mount(addRoute, options?)</code></h2>\n<p>Mounts Taunus on top of a server-side router, by registering each route in <code>options.routes</code> with the <code>addRoute</code> method.</p>\n<blockquote>\n<p>Note that most of the time, <strong>this method shouldn&#39;t be invoked directly</strong>, but rather through one of the <a href=\"#http-framework-plugins\">HTTP framework plugins</a> presented below.</p>\n</blockquote>\n<p>Here&#39;s an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the <code>route</code> and <code>action</code> properties.</p>\n<pre><code class=\"lang-js\">taunus.mount(addRoute, {\n  routes: [{ route: &#39;/&#39;, action: &#39;home/index&#39; }]\n});\n\nfunction addRoute (definition) {\n  app.get(definition.route, definition.action);\n}\n</code></pre>\n<p>Let&#39;s go over the options you can pass to <code>taunus.mount</code> first.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"the-options-object\">The <code>options?</code> object</h4>\n<p>There&#39;s a few options that can be passed to the server-side mountpoint. You&#39;re probably going to be passing these to your <a href=\"#http-framework-plugins\">HTTP framework plugin</a>, rather than using <code>taunus.mount</code> directly.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-layout-\"><code>options.layout?</code></h6>\n<p>The <code>layout</code> property is expected to have the <code>function(data)</code> signature. It&#39;ll be invoked whenever a full HTML document needs to be rendered, and a <code>data</code> object will be passed to it. That object will contain everything you&#39;ve set as the view model, plus a <code>partial</code> property containing the raw HTML of the rendered partial view. Your <code>layout</code> method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out <a href=\"https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\">the <code>layout.jade</code> used in Pony Foo</a> as an example.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-routes-\"><code>options.routes</code></h6>\n<p>The other big option is <code>routes</code>, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.</p>\n<p>Here&#39;s an example route that uses the <a href=\"http://expressjs.com\">Express</a> routing scheme.</p>\n<pre><code class=\"lang-js\">{\n  route: &#39;/articles/:slug&#39;,\n  action: &#39;articles/article&#39;,\n  ignore: false,\n  cache: &lt;inherit&gt;\n}\n</code></pre>\n<ul>\n<li><code>route</code> is a route in the format your HTTP framework of choice understands</li>\n<li><code>action</code> is the name of your controller action. It&#39;ll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller</li>\n<li><code>cache</code> can be used to determine the client-side caching behavior in this application path, and it&#39;ll default to inheriting from the options passed to <code>taunus.mount</code> <em>on the client-side</em></li>\n<li><code>ignore</code> is used in those cases where you want a URL to be ignored by the client-side router even if there&#39;s a catch-all route that would match that URL</li>\n</ul>\n<p>As an example of the <code>ignore</code> use case, consider the routing table shown below. The client-side router doesn&#39;t know <em>(and can&#39;t know unless you point it out)</em> what routes are server-side only, and it&#39;s up to you to point those out.</p>\n<pre><code class=\"lang-js\">[\n  { route: &#39;/&#39;, action: &#39;/home/index&#39; },\n  { route: &#39;/feed&#39;, ignore: true },\n  { route: &#39;/*&#39;, action: &#39;error/not-found&#39; }\n]\n</code></pre>\n<p>This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The <code>ignore</code> property is effectively telling the client-side <em>&quot;don&#39;t hijack links containing this URL&quot;</em>.</p>\n<p>Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don&#39;t need to be <code>ignore</code>d.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-getdefaultviewmodel-\"><code>options.getDefaultViewModel?</code></h6>\n<p>The <code>getDefaultViewModel(done)</code> property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you&#39;re done creating a view model, you can invoke <code>done(null, model)</code>. If an error occurs while building the view model, you should call <code>done(err)</code> instead.</p>\n<p>Taunus will throw an error if <code>done</code> is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases <a href=\"#taunus-rebuilddefaultviewmodel\">the defaults can be rebuilt</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-plaintext-\"><code>options.plaintext?</code></h6>\n<p>The <code>plaintext</code> options object is passed directly to <a href=\"https://github.com/bevacqua/hget\">hget</a>, and it&#39;s used to <a href=\"https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\">tweak the plaintext version</a> of your site.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h6 id=\"-options-resolvers-\"><code>options.resolvers?</code></h6>\n<p>Resolvers are used to determine the location of some of the different pieces of your application. Typically you won&#39;t have to touch these in the slightest.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getServerController(action)</code></td>\n<td>Return path to server-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p>The <code>addRoute</code> method passed to <code>taunus.mount</code> on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"-addroute-definition-\"><code>addRoute(definition)</code></h4>\n<p>The <code>addRoute(definition)</code> method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework&#39;s router.</p>\n<ul>\n<li><code>route</code> is the route that you set as <code>definition.route</code></li>\n<li><code>action</code> is the action as passed to the route definition</li>\n<li><code>actionFn</code> will be the controller for this action method</li>\n<li><code>middleware</code> will be an array of methods to be executed before <code>actionFn</code></li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-render-action-viewmodel-req-res-next-\"><code>taunus.render(action, viewModel, req, res, next)</code></h2>\n<p>This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won&#39;t go very deep into it.</p>\n<p>The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The <code>action</code> property determines the default view that will be rendered. The <code>viewModel</code> will be extended by <a href=\"#-options-getdefaultviewmodel-\">the default view model</a>, and it may also override the default <code>action</code> by setting <code>viewModel.model.action</code>.</p>\n<p>The <code>req</code>, <code>res</code>, and <code>next</code> arguments are expected to be the Express routing arguments, but they can also be mocked <em>(which is in fact what the Hapi plugin does)</em>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-rebuilddefaultviewmodel-done-\"><code>taunus.rebuildDefaultViewModel(done?)</code></h2>\n<p>Once Taunus has been mounted, calling this method will rebuild the view model defaults using the <code>getDefaultViewModel</code> that was passed to <code>taunus.mount</code> in the options. An optional <code>done</code> callback will be invoked when the model is rebuilt.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"http-framework-plugins\">HTTP Framework Plugins</h1>\n<p>There&#39;s currently two different HTTP frameworks <em>(<a href=\"http://expressjs.com\">Express</a> and <a href=\"http://hapijs.com\">Hapi</a>)</em> that you can readily use with Taunus without having to deal with any of the route plumbing yourself.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-express-\">Using <code>taunus-express</code></h2>\n<p>The <code>taunus-express</code> plugin is probably the easiest to use, as Taunus was originally developed with just <a href=\"http://expressjs.com\">Express</a> in mind. In addition to the options already outlined for <a href=\"#-taunus-mount-addroute-options-\">taunus.mount</a>, you can add middleware for any route individually.</p>\n<ul>\n<li><code>middleware</code> are any methods you want Taunus to execute as middleware in Express applications</li>\n</ul>\n<p>To get <code>taunus-express</code> going you can use the following piece of code, provided that you come up with an <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  // ...\n};\n\ntaunusExpress(taunus, app, options);\n</code></pre>\n<p>The <code>taunusExpress</code> method will merely set up Taunus and add the relevant routes to your Express application by calling <code>app.get</code> a bunch of times. You can <a href=\"https://github.com/taunus/taunus-express\">find taunus-express on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"using-taunus-hapi-\">Using <code>taunus-hapi</code></h2>\n<p>The <code>taunus-hapi</code> plugin is a bit more involved, and you&#39;ll have to create a Pack in order to use it. In addition to <a href=\"#-taunus-mount-addroute-options-\">the options we&#39;ve already covered</a>, you can add <code>config</code> on any route.</p>\n<ul>\n<li><code>config</code> is passed directly into the route registered with Hapi, giving you the most flexibility</li>\n</ul>\n<p>To get <code>taunus-hapi</code> going you can use the following piece of code, and you can bring your own <code>options</code> object.</p>\n<pre><code class=\"lang-js\">var Hapi = require(&#39;hapi&#39;);\nvar taunus = require(&#39;taunus&#39;);\nvar taunusHapi = require(&#39;taunus-hapi&#39;)(taunus);\nvar pack = new Hapi.Pack();\n\npack.register({\n  plugin: taunusHapi,\n  options: {\n    // ...\n  }\n});\n</code></pre>\n<p>The <code>taunusHapi</code> plugin will mount Taunus and register all of the necessary routes. You can <a href=\"https://github.com/taunus/taunus-hapi\">find taunus-hapi on GitHub</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"command-line-interface\">Command-Line Interface</h1>\n<p>Once you&#39;ve set up the server-side to render your views using Taunus, it&#39;s only logical that you&#39;ll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.</p>\n<p>The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.</p>\n<p>Install it globally for development, but remember to use local copies for production-grade uses.</p>\n<pre><code class=\"lang-shell\">npm install -g taunus\n</code></pre>\n<p>When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.</p>\n<pre><code class=\"lang-shell\">taunus\n</code></pre>\n<p>By default, the output will be printed to the standard output, making for a fast debugging experience. Here&#39;s the output if you just had a single <code>home/index</code> route, and the matching view and client-side controller existed.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;)\n};\n\nvar controllers = {\n  &#39;home/index&#39;: require(&#39;../client/js/controllers/home/index.js&#39;)\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p>You can use a few options to alter the outcome of invoking <code>taunus</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-output-\"><code>--output</code></h2>\n<p><sub>the <code>-o</code> alias is available</sub></p>\n<p>Output is written to a file instead of to standard output. The file path used will be the <code>client_wiring</code> option in <a href=\"#the-taunusrc-manifest\"><code>.taunusrc</code></a>, which defaults to <code>&#39;.bin/wiring.js&#39;</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-watch-\"><code>--watch</code></h2>\n<p><sub>the <code>-w</code> alias is available</sub></p>\n<p>Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether <code>--output</code> was used.</p>\n<p>The program won&#39;t exit.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-transform-module-\"><code>--transform &lt;module&gt;</code></h2>\n<p><sub>the <code>-t</code> alias is available</sub></p>\n<p>This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the <a href=\"https://github.com/taunus/hapiify\"><code>hapiify</code></a> module.</p>\n<pre><code class=\"lang-shell\">npm install hapiify\ntaunus -t hapiify\n</code></pre>\n<p>Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-resolvers-module-\"><code>--resolvers &lt;module&gt;</code></h2>\n<p><sub>the <code>-r</code> alias is available</sub></p>\n<p>Similarly to the <a href=\"#-options-resolvers-\"><code>resolvers</code></a> option that you can pass to <a href=\"#-taunus-mount-addroute-options-\"><code>taunus.mount</code></a>, these resolvers can change the way in which file paths are resolved.</p>\n<table>\n<thead>\n<tr>\n<th>Signature</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>getClientController(action)</code></td>\n<td>Return path to client-side controller action handler module</td>\n</tr>\n<tr>\n<td><code>getView(action)</code></td>\n<td>Return path to view template module</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-standalone-\"><code>--standalone</code></h2>\n<p><sub>the <code>-s</code> alias is available</sub></p>\n<p>Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus <a href=\"https://github.com/umdjs/umd\">as a UMD module</a>.</p>\n<p>This would allow you to use Taunus on the client-side even if you don&#39;t want to use <a href=\"http://browserify.org\">Browserify</a> directly.</p>\n<p>Feedback and suggestions about this flag, <em>and possible alternatives that would make Taunus easier to use</em>, are welcome.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"client-side-api\">Client-side API</h1>\n<p>Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-mount-container-wiring-options-\"><code>taunus.mount(container, wiring, options?)</code></h2>\n<p>The mountpoint takes a root container, the wiring module, and an options parameter. The <code>container</code> is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the <code>wiring</code> module exactly as built by the CLI, and no further configuration is necessary.</p>\n<p>When the mountpoint executes, Taunus will configure its internal state, <em>set up the client-side router</em>, run the client-side controller for the server-side rendered view, and start hijacking links.</p>\n<p>As an example, consider a browser makes a <code>GET</code> request for <code>/articles/the-fox</code> for the first time. Once <code>taunus.mount(container, wiring)</code> is invoked on the client-side, several things would happen in the order listed below.</p>\n<ul>\n<li>Taunus sets up the client-side view routing engine</li>\n<li>If enabled <em>(via <code>options</code>)</em>, the caching engine is configured</li>\n<li>Taunus obtains the view model <em>(more on this later)</em></li>\n<li>When a view model is obtained, the <code>&#39;start&#39;</code> event is emitted</li>\n<li>Anchor links start being monitored for clicks <em>(at this point your application becomes a <a href=\"http://en.wikipedia.org/wiki/Single-page_application\">SPA</a>)</em></li>\n<li>The <code>articles/article</code> client-side controller is executed</li>\n</ul>\n<p>That&#39;s quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, <em>rather than on the server-side!</em></p>\n<p>In order to better understand the process, I&#39;ll walk you through the <code>options</code> parameter.</p>\n<p>First off, the <code>bootstrap</code> option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: <code>auto</code> <em>(the default strategy)</em>, <code>inline</code>, or <code>manual</code>. The <code>auto</code> strategy involves the least work, which is why it&#39;s the default.</p>\n<ul>\n<li><code>auto</code> will make an AJAX request for the view model</li>\n<li><code>inline</code> expects you to place the model into a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag</li>\n<li><code>manual</code> expects you to get the view model however you want to, and then let Taunus know when it&#39;s ready</li>\n</ul>\n<p>Let&#39;s go into detail about each of these strategies.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-auto-strategy\">Using the <code>auto</code> strategy</h4>\n<p>The <code>auto</code> strategy means that Taunus will make use of an AJAX request to obtain the view model. <em>You don&#39;t have to do anything else</em> and this is the default strategy. This is the <strong>most convenient strategy, but also the slowest</strong> one.</p>\n<p>It&#39;s slow because the view model won&#39;t be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and <code>taunus.mount</code> is invoked.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-inline-strategy\">Using the <code>inline</code> strategy</h4>\n<p>The <code>inline</code> strategy expects you to add a <code>data-taunus</code> attribute on the <code>container</code> element. This attribute must be equal to the <code>id</code> attribute of a <code>&lt;script&gt;</code> tag containing the serialized view model.</p>\n<pre><code class=\"lang-jade\">div(data-taunus=&#39;model&#39;)!=partial\nscript(type=&#39;text/taunus&#39;, data-taunus=&#39;model&#39;)=JSON.stringify(model)\n</code></pre>\n<p>Pay special attention to the fact that the model is not only made into a JSON string, <em>but also HTML encoded by Jade</em>. When Taunus extracts the model from the <code>&lt;script&gt;</code> tag it&#39;ll unescape it, and then parse it as JSON.</p>\n<p>This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.</p>\n<p>That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-manual-strategy\">Using the <code>manual</code> strategy</h4>\n<p>The <code>manual</code> strategy is the most involved of the three, but also the most performant. In this strategy you&#39;re supposed to add the following <em>(seemingly pointless)</em> snippet of code in a <code>&lt;script&gt;</code> other than the one that&#39;s pulling down Taunus, so that they are pulled concurrently rather than serially.</p>\n<pre><code class=\"lang-js\">window.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n</code></pre>\n<p>Once you somehow get your hands on the view model, you should invoke <code>taunusReady(model)</code>. Considering you&#39;ll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.</p>\n<ul>\n<li>The view model is loaded first, you call <code>taunusReady(model)</code> and wait for Taunus to take the model object and boot the application as soon as <code>taunus.mount</code> is executed</li>\n<li>Taunus loads first and <code>taunus.mount</code> is called first. In this case, Taunus will replace <code>window.taunusReady</code> with a special <code>boot</code> method. When the view model finishes loading, you call <code>taunusReady(model)</code> and the application finishes booting</li>\n</ul>\n<blockquote>\n<p>If this sounds a little mind-bending it&#39;s because it is. It&#39;s not designed to be pretty, but merely to be performant.</p>\n</blockquote>\n<p>Now that we&#39;ve addressed the awkward bits, let&#39;s cover the <em>&quot;somehow get your hands on the view model&quot;</em> aspect. My preferred method is using JSONP, as it&#39;s able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you&#39;ll probably want this to be an inline script, keeping it small is important.</p>\n<p>The good news is that the server-side supports JSONP out the box. Here&#39;s a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.</p>\n<pre><code class=\"lang-js\">function inject (url) {\n  var script = document.createElement(&#39;script&#39;);\n  script.src = url;\n  document.body.appendChild(script);\n}\n\nfunction injector () {\n  var search = location.search;\n  var searchQuery = search ? &#39;&amp;&#39; + search.substr(1) : &#39;&#39;;\n  var searchJson = &#39;?json&amp;callback=taunusReady&#39; + searchQuery;\n  inject(location.pathname + searchJson);\n}\n\nwindow.taunusReady = function (model) {\n  window.taunusReady = model;\n};\n\ninjector();\n</code></pre>\n<p>As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching\">Caching</h4>\n<p>The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the <code>cache</code> flag in the options passed to <code>taunus.mount</code> on the client-side.</p>\n<p>If you set <code>cache</code> to <code>true</code> then cached items will be considered <em>&quot;fresh&quot; (valid copies of the original)</em> for <strong>15 seconds</strong>. You can also set <code>cache</code> to a number, and that number of seconds will be used as the default instead.</p>\n<p>Caching can also be tweaked on individual routes. For instance, you could set <code>{ cache: true }</code> when mounting Taunus and then have <code>{ cache: 3600 }</code> on a route that you want to cache for a longer period of time.</p>\n<p>The caching layer is <em>seamlessly integrated</em> into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in <a href=\"http://caniuse.com/#feat=indexeddb\">browsers that support IndexedDB</a>. In the case of browsers that don&#39;t support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"prefetching\">Prefetching</h4>\n<p>If caching is enabled, the next logical step is prefetching. This is enabled just by adding <code>prefetch: true</code> to the options passed to <code>taunus.mount</code>. The prefetching feature will fire for any anchor link that&#39;s trips over a <code>mouseover</code> or a <code>touchstart</code> event. If a route matches the URL in the <code>href</code>, an AJAX request will prefetch the view and cache its contents, improving perceived performance.</p>\n<p>When links are clicked before prefetching finishes, they&#39;ll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-on-type-fn-\"><code>taunus.on(type, fn)</code></h2>\n<p>Taunus emits a series of events during its lifecycle, and <code>taunus.on</code> is the way you can tune in and listen for these events using a subscription function <code>fn</code>.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-once-type-fn-\"><code>taunus.once(type, fn)</code></h2>\n<p>This method is equivalent to <a href=\"#-taunus-on-type-fn-\"><code>taunus.on</code></a>, except the event listeners will be used once and then it&#39;ll be discarded.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-off-type-fn-\"><code>taunus.off(type, fn)</code></h2>\n<p>Using this method you can remove any event listeners that were previously added using <code>.on</code> or <code>.once</code>. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling <code>.on</code> or <code>.once</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-intercept-action-fn-\"><code>taunus.intercept(action?, fn)</code></h2>\n<p>This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified <code>action</code>. You can also add global interceptors by omitting the <code>action</code> parameter, or setting it to <code>*</code>.</p>\n<p>An interceptor function will receive an <code>event</code> parameter, containing a few different properties.</p>\n<ul>\n<li><code>url</code> contains the URL that needs a view model</li>\n<li><code>route</code> contains the full route object as you&#39;d get from <a href=\"#-taunus-route-url-\"><code>taunus.route(url)</code></a></li>\n<li><code>parts</code> is just a shortcut for <code>route.parts</code></li>\n<li><code>preventDefault(model)</code> allows you to suppress the need for an AJAX request, commanding Taunus to use the model you&#39;ve provided instead</li>\n<li><code>defaultPrevented</code> tells you if some other handler has prevented the default behavior</li>\n<li><code>canPreventDefault</code> tells you if invoking <code>event.preventDefault</code> will have any effect</li>\n<li><code>model</code> starts as <code>null</code>, and it can later become the model passed to <code>preventDefault</code></li>\n</ul>\n<p>Interceptors are asynchronous, but if an interceptor spends longer than 200ms it&#39;ll be short-circuited and calling <code>event.preventDefault</code> past that point won&#39;t have any effect.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-partial-container-action-model-\"><code>taunus.partial(container, action, model)</code></h2>\n<p>This method provides you with access to the view-rendering engine of Taunus. You can use it to render the <code>action</code> view into the <code>container</code> DOM element, using the specified <code>model</code>. Once the view is rendered, the <code>render</code> event will be fired <em>(with <code>container, model</code> as arguments)</em> and the client-side controller for that view will be executed.</p>\n<p>While <code>taunus.partial</code> takes a <code>route</code> as the fourth parameter, you should omit that since it&#39;s used for internal purposes only.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-navigate-url-\"><code>taunus.navigate(url)</code></h2>\n<p>Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use <code>taunus.navigate</code> passing it a plain URL.</p>\n<p>If <code>taunus.navigate(url)</code> is called with an <code>url</code> that doesn&#39;t match any client-side route, then the user will be redirected via <code>location.href</code>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-route-url-\"><code>taunus.route(url)</code></h2>\n<p>This convenience method allows you to break down a URL into its individual components. This method shouldn&#39;t be needed during normal usage of Taunus, but it&#39;s useful when debugging your routing tables.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h2 id=\"-taunus-state-\"><code>taunus.state</code></h2>\n<p>This is an internal state variable, and it contains a lot of useful debugging information.</p>\n<ul>\n<li><code>container</code> is the DOM element passed to <code>taunus.mount</code></li>\n<li><code>controllers</code> are all the controllers, as defined in the wiring module</li>\n<li><code>templates</code> are all the templates, as defined in the wiring module</li>\n<li><code>routes</code> are all the routes, as defined in the wiring module</li>\n<li><code>prefetch</code> exposes whether prefetching is turned on</li>\n<li><code>cache</code> exposes whether caching is enabled</li>\n<li><code>model</code> is a reference to the model used to render the current view</li>\n</ul>\n<p>Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-taunusrc-manifest\">The <code>.taunusrc</code> manifest</h1>\n<p>If you want to use values other than the conventional defaults shown in the table below, then you should create a <code>.taunusrc</code> file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your <code>package.json</code>, under the <code>taunus</code> property.</p>\n<pre><code class=\"lang-json\">{\n  &quot;views&quot;: &quot;.bin/views&quot;,\n  &quot;server_routes&quot;: &quot;controllers/routes.js&quot;,\n  &quot;server_controllers&quot;: &quot;controllers&quot;,\n  &quot;client_controllers&quot;: &quot;client/js/controllers&quot;,\n  &quot;client_wiring&quot;: &quot;.bin/wiring.js&quot;\n}\n</code></pre>\n<ul>\n<li>The <code>views</code> directory is where your views <em>(already compiled into JavaScript)</em> are placed. These views are used directly on both the server-side and the client-side</li>\n<li>The <code>server_routes</code> file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module</li>\n<li>The <code>server_controllers</code> directory is the root directory where your server-side controllers live. It&#39;s used when setting up the server-side router</li>\n<li>The <code>client_controllers</code> directory is where your client-side controller modules live. The CLI will <code>require</code> these controllers in its resulting wiring module</li>\n<li>The <code>client_wiring</code> file is where your wiring module will be placed by the CLI. You&#39;ll then have to <code>require</code> it in your application when booting up Taunus</li>\n</ul>\n<p>Here is where things get <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">a little conventional</a>. Views, and both server-side and client-side controllers are expected to be organized by following the <code>{root}/{controller}/{action}</code> pattern, but you could change that using <code>resolvers</code> when invoking the CLI and using the server-side API.</p>\n<p>Views and controllers are also expected to be CommonJS modules that export a single method.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # API Documentation\n\n    Here's the API documentation for Taunus. If you've never used it before, we recommend going over the [Getting Started][1] guide before jumping into the API documentation. That way, you'll get a better idea of what to look for and how to put together simple applications using Taunus, before going through documentation on every public interface to Taunus.\n\n    Taunus exposes _three different public APIs_, and there's also **plugins to integrate Taunus and an HTTP server**. This document covers all three APIs extensively. If you're concerned about the inner workings of Taunus, please refer to the [Getting Started][1] guide. This document aims to only cover how the public interface affects application state, but **doesn't delve into implementation details**.\n\n    # Table of Contents\n\n    - A [server-side API](#server-side-api) that deals with server-side rendering\n      - The [`taunus.mount`](#-taunus-mount-addroute-options-) method\n        - Its [`options`](#the-options-object) argument\n          - [`layout`](#-options-layout-)\n          - [`routes`](#-options-routes-)\n          - [`getDefaultViewModel`](#-options-getdefaultviewmodel-)\n          - [`plaintext`](#-options-plaintext-)\n          - [`resolvers`](#-options-resolvers-)\n        - Its [`addRoute`](#-addroute-definition-) argument\n      - The [`taunus.render`](#-taunus-render-action-viewmodel-req-res-next-) method\n      - The [`taunus.rebuildDefaultViewModel`](#-taunus-rebuilddefaultviewmodel-done-) method\n    - A [suite of plugins](#http-framework-plugins) can integrate Taunus and an HTTP server\n      - Using [`taunus-express`](#using-taunus-express-) for [Express][2]\n      - Using [`taunus-hapi`](#using-taunus-hapi-) for [Hapi][3]\n    - A [CLI that produces a wiring module](#command-line-interface) for the client-side\n      - The [`--output`](#-output-) flag\n      - The [`--watch`](#-watch-) flag\n      - The [`--transform <module>`](#-transform-module-) flag\n      - The [`--resolvers <module>`](#-resolvers-module-) flag\n      - The [`--standalone`](#-standalone-) flag\n    - A [client-side API](#client-side-api) that deals with client-side rendering\n      - The [`taunus.mount`](#-taunus-mount-container-wiring-options-) method\n        - Using the [`auto`](#using-the-auto-strategy) strategy\n        - Using the [`inline`](#using-the-inline-strategy) strategy\n        - Using the [`manual`](#using-the-manual-strategy) strategy\n        - [Caching](#caching)\n        - [Prefetching](#prefetching)\n      - The [`taunus.on`](#-taunus-on-type-fn-) method\n      - The [`taunus.once`](#-taunus-once-type-fn-) method\n      - The [`taunus.off`](#-taunus-off-type-fn-) method\n      - The [`taunus.intercept`](#-taunus-intercept-action-fn-) method\n      - The [`taunus.partial`](#-taunus-partial-container-action-model-) method\n      - The [`taunus.navigate`](#-taunus-navigate-url-) method\n      - The [`taunus.state`](#-taunus-route-url-) property\n      - The [`taunus.route`](#-taunus-state-) method\n    - The [`.taunusrc`](#the-taunusrc-manifest) manifest\n\n    # Server-side API\n\n    The server-side API is used to set up the view router. It then gets out of the way, allowing the client-side to eventually take over and add any extra sugar on top, _including client-side rendering_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(addRoute, options?)`\n\n    Mounts Taunus on top of a server-side router, by registering each route in `options.routes` with the `addRoute` method.\n\n    > Note that most of the time, **this method shouldn't be invoked directly**, but rather through one of the [HTTP framework plugins](#http-framework-plugins) presented below.\n\n    Here's an incomplete example of how this method may be used. It is incomplete because route definitions have more options beyond the `route` and `action` properties.\n\n    ```js\n    taunus.mount(addRoute, {\n      routes: [{ route: '/', action: 'home/index' }]\n    });\n\n    function addRoute (definition) {\n      app.get(definition.route, definition.action);\n    }\n    ```\n\n    Let's go over the options you can pass to `taunus.mount` first.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### The `options?` object\n\n    There's a few options that can be passed to the server-side mountpoint. You're probably going to be passing these to your [HTTP framework plugin](#http-framework-plugins), rather than using `taunus.mount` directly.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.layout?`\n\n    The `layout` property is expected to have the `function(data)` signature. It'll be invoked whenever a full HTML document needs to be rendered, and a `data` object will be passed to it. That object will contain everything you've set as the view model, plus a `partial` property containing the raw HTML of the rendered partial view. Your `layout` method will typically wrap the raw HTML for the partial with the bare bones of an HTML document. Check out [the `layout.jade` used in Pony Foo][4] as an example.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.routes`\n\n    The other big option is `routes`, which expects a collection of route definitions. Route definitions use a number of properties to determine how the route is going to behave.\n\n    Here's an example route that uses the [Express][2] routing scheme.\n\n    ```js\n    {\n      route: '/articles/:slug',\n      action: 'articles/article',\n      ignore: false,\n      cache: <inherit>\n    }\n    ```\n\n    - `route` is a route in the format your HTTP framework of choice understands\n    - `action` is the name of your controller action. It'll be used to find the server-side controller, the default view that should be used with this route, and the client-side controller\n    - `cache` can be used to determine the client-side caching behavior in this application path, and it'll default to inheriting from the options passed to `taunus.mount` _on the client-side_\n    - `ignore` is used in those cases where you want a URL to be ignored by the client-side router even if there's a catch-all route that would match that URL\n\n    As an example of the `ignore` use case, consider the routing table shown below. The client-side router doesn't know _(and can't know unless you point it out)_ what routes are server-side only, and it's up to you to point those out.\n\n    ```js\n    [\n      { route: '/', action: '/home/index' },\n      { route: '/feed', ignore: true },\n      { route: '/*', action: 'error/not-found' }\n    ]\n    ```\n\n    This step is necessary whenever you have an anchor link pointed at something like an RSS feed. The `ignore` property is effectively telling the client-side _\"don't hijack links containing this URL\"_.\n\n    Please note that external links are never hijacked. Only same-origin links containing a URL that matches one of the routes will be hijacked by Taunus. External links don't need to be `ignore`d.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.getDefaultViewModel?`\n\n    The `getDefaultViewModel(done)` property can be a method that puts together the base view model, which will then be extended on an action-by-action basis. When you're done creating a view model, you can invoke `done(null, model)`. If an error occurs while building the view model, you should call `done(err)` instead.\n\n    Taunus will throw an error if `done` is invoked with an error, so you might want to put safeguards in place as to avoid that from happenning. The reason this method is asynchronous is because you may need database access or somesuch when putting together the defaults. The reason this is a method and not just an object is that the defaults may change due to human interaction with the application, and in those cases [the defaults can be rebuilt](#taunus-rebuilddefaultviewmodel).\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.plaintext?`\n\n    The `plaintext` options object is passed directly to [hget][5], and it's used to [tweak the plaintext version][6] of your site.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ###### `options.resolvers?`\n\n    Resolvers are used to determine the location of some of the different pieces of your application. Typically you won't have to touch these in the slightest.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getServerController(action)` | Return path to server-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    The `addRoute` method passed to `taunus.mount` on the server-side is mostly going to be used internally by the HTTP framework plugins, so feel free to skip over the following section.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### `addRoute(definition)`\n\n    The `addRoute(definition)` method will be passed a route definition, containing the following properties. This method is expected to register a route in your HTTP framework's router.\n\n    - `route` is the route that you set as `definition.route`\n    - `action` is the action as passed to the route definition\n    - `actionFn` will be the controller for this action method\n    - `middleware` will be an array of methods to be executed before `actionFn`\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.render(action, viewModel, req, res, next)`\n\n    This method is almost an implementation detail as you should be using Taunus through one of the plugins anyways, so we won't go very deep into it.\n\n    The render method is what Taunus uses to render views by constructing HTML, JSON, or plaintext responses. The `action` property determines the default view that will be rendered. The `viewModel` will be extended by [the default view model](#-options-getdefaultviewmodel-), and it may also override the default `action` by setting `viewModel.model.action`.\n\n    The `req`, `res`, and `next` arguments are expected to be the Express routing arguments, but they can also be mocked _(which is in fact what the Hapi plugin does)_.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.rebuildDefaultViewModel(done?)`\n\n    Once Taunus has been mounted, calling this method will rebuild the view model defaults using the `getDefaultViewModel` that was passed to `taunus.mount` in the options. An optional `done` callback will be invoked when the model is rebuilt.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # HTTP Framework Plugins\n\n    There's currently two different HTTP frameworks _([Express][2] and [Hapi][3])_ that you can readily use with Taunus without having to deal with any of the route plumbing yourself.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-express`\n\n    The `taunus-express` plugin is probably the easiest to use, as Taunus was originally developed with just [Express][2] in mind. In addition to the options already outlined for [taunus.mount](#-taunus-mount-addroute-options-), you can add middleware for any route individually.\n\n    - `middleware` are any methods you want Taunus to execute as middleware in Express applications\n\n    To get `taunus-express` going you can use the following piece of code, provided that you come up with an `options` object.\n\n    ```js\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      // ...\n    };\n\n    taunusExpress(taunus, app, options);\n    ```\n\n    The `taunusExpress` method will merely set up Taunus and add the relevant routes to your Express application by calling `app.get` a bunch of times. You can [find taunus-express on GitHub][7].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## Using `taunus-hapi`\n\n    The `taunus-hapi` plugin is a bit more involved, and you'll have to create a Pack in order to use it. In addition to [the options we've already covered](#-taunus-mount-addroute-options-), you can add `config` on any route.\n\n    - `config` is passed directly into the route registered with Hapi, giving you the most flexibility\n\n    To get `taunus-hapi` going you can use the following piece of code, and you can bring your own `options` object.\n\n    ```js\n    var Hapi = require('hapi');\n    var taunus = require('taunus');\n    var taunusHapi = require('taunus-hapi')(taunus);\n    var pack = new Hapi.Pack();\n\n    pack.register({\n      plugin: taunusHapi,\n      options: {\n        // ...\n      }\n    });\n    ```\n\n    The `taunusHapi` plugin will mount Taunus and register all of the necessary routes. You can [find taunus-hapi on GitHub][8].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Command-Line Interface\n\n    Once you've set up the server-side to render your views using Taunus, it's only logical that you'll want to render the views in the client-side as well, effectively converting your application into a single-page application after the first view has been rendered on the server-side.\n\n    The Taunus CLI is an useful intermediary in the process of getting the configuration you wrote so far for the server-side to also work well in the client-side.\n\n    Install it globally for development, but remember to use local copies for production-grade uses.\n\n    ```shell\n    npm install -g taunus\n    ```\n\n    When invoked without any arguments, the CLI will simply follow the default conventions to find your route definitions, views, and client-side controllers.\n\n    ```shell\n    taunus\n    ```\n\n    By default, the output will be printed to the standard output, making for a fast debugging experience. Here's the output if you just had a single `home/index` route, and the matching view and client-side controller existed.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js')\n    };\n\n    var controllers = {\n      'home/index': require('../client/js/controllers/home/index.js')\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    You can use a few options to alter the outcome of invoking `taunus`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--output`\n\n    <sub>the `-o` alias is available</sub>\n\n    Output is written to a file instead of to standard output. The file path used will be the `client_wiring` option in [`.taunusrc`](#the-taunusrc-manifest), which defaults to `'.bin/wiring.js'`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--watch`\n\n    <sub>the `-w` alias is available</sub>\n\n    Whenever a server-side route definition changes, the output is printed again to either standard output or a file, depending on whether `--output` was used.\n\n    The program won't exit.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--transform <module>`\n\n    <sub>the `-t` alias is available</sub>\n\n    This flag allows you to transform server-side routes into something the client-side understands. Express routes are completely compatible with the client-side router, but Hapi routes need to be transformed using the [`hapiify`][9] module.\n\n    ```shell\n    npm install hapiify\n    taunus -t hapiify\n    ```\n\n    Using this transform relieves you from having to define the same routes twice using slightly different formats that convey the same meaning.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--resolvers <module>`\n\n    <sub>the `-r` alias is available</sub>\n\n    Similarly to the [`resolvers`](#-options-resolvers-) option that you can pass to [`taunus.mount`](#-taunus-mount-addroute-options-), these resolvers can change the way in which file paths are resolved.\n\n    Signature                     | Description\n    ------------------------------|------------------------------------------------------\n    `getClientController(action)` | Return path to client-side controller action handler module\n    `getView(action)`             | Return path to view template module\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `--standalone`\n\n    <sub>the `-s` alias is available</sub>\n\n    Under this experimental flag, the CLI will use Browserify to compile a standalone module that includes the wiring normally exported by the CLI plus all of Taunus [as a UMD module][10].\n\n    This would allow you to use Taunus on the client-side even if you don't want to use [Browserify][11] directly.\n\n    Feedback and suggestions about this flag, _and possible alternatives that would make Taunus easier to use_, are welcome.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Client-side API\n\n    Just like the server-side, everything in the client-side begins at the mountpoint. Once the application is mounted, anchor links will be hijacked and the client-side router will take over view rendering. Client-side controllers are executed whenever a view is rendered.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.mount(container, wiring, options?)`\n\n    The mountpoint takes a root container, the wiring module, and an options parameter. The `container` is where client-side-rendered views will be placed, by replacing whatever HTML contents already exist. You can pass in the `wiring` module exactly as built by the CLI, and no further configuration is necessary.\n\n    When the mountpoint executes, Taunus will configure its internal state, _set up the client-side router_, run the client-side controller for the server-side rendered view, and start hijacking links.\n\n    As an example, consider a browser makes a `GET` request for `/articles/the-fox` for the first time. Once `taunus.mount(container, wiring)` is invoked on the client-side, several things would happen in the order listed below.\n\n    - Taunus sets up the client-side view routing engine\n    - If enabled _(via `options`)_, the caching engine is configured\n    - Taunus obtains the view model _(more on this later)_\n    - When a view model is obtained, the `'start'` event is emitted\n    - Anchor links start being monitored for clicks _(at this point your application becomes a [SPA][13])_\n    - The `articles/article` client-side controller is executed\n\n    That's quite a bit of functionality, but if you think about it, most other frameworks also render the view at this point, _rather than on the server-side!_\n\n    In order to better understand the process, I'll walk you through the `options` parameter.\n\n    First off, the `bootstrap` option determines the strategy used to pull the view model of the server-side rendered view into the client-side. There are three possible strategies available: `auto` _(the default strategy)_, `inline`, or `manual`. The `auto` strategy involves the least work, which is why it's the default.\n\n    - `auto` will make an AJAX request for the view model\n    - `inline` expects you to place the model into a `<script type='text/taunus'>` tag\n    - `manual` expects you to get the view model however you want to, and then let Taunus know when it's ready\n\n    Let's go into detail about each of these strategies.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `auto` strategy\n\n    The `auto` strategy means that Taunus will make use of an AJAX request to obtain the view model. _You don't have to do anything else_ and this is the default strategy. This is the **most convenient strategy, but also the slowest** one.\n\n    It's slow because the view model won't be requested until the bulk of your JavaScript code has been downloaded, parsed, executed, and `taunus.mount` is invoked.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `inline` strategy\n\n    The `inline` strategy expects you to add a `data-taunus` attribute on the `container` element. This attribute must be equal to the `id` attribute of a `<script>` tag containing the serialized view model.\n\n    ```jade\n    div(data-taunus='model')!=partial\n    script(type='text/taunus', data-taunus='model')=JSON.stringify(model)\n    ```\n\n    Pay special attention to the fact that the model is not only made into a JSON string, _but also HTML encoded by Jade_. When Taunus extracts the model from the `<script>` tag it'll unescape it, and then parse it as JSON.\n\n    This strategy is also fairly convenient to set up, but it involves a little more work. It might be worthwhile to use in cases where models are small, but it will slow down server-side view rendering, as the model is inlined alongside the HTML.\n\n    That means that the content you are supposed to be prioritizing is going to take longer to get to your humans, but once they get the HTML, this strategy will execute the client-side controller almost immediately.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the `manual` strategy\n\n    The `manual` strategy is the most involved of the three, but also the most performant. In this strategy you're supposed to add the following _(seemingly pointless)_ snippet of code in a `<script>` other than the one that's pulling down Taunus, so that they are pulled concurrently rather than serially.\n\n    ```js\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n    ```\n\n    Once you somehow get your hands on the view model, you should invoke `taunusReady(model)`. Considering you'll be pulling both the view model and Taunus at the same time, a number of different scenarios may play out.\n\n    - The view model is loaded first, you call `taunusReady(model)` and wait for Taunus to take the model object and boot the application as soon as `taunus.mount` is executed\n    - Taunus loads first and `taunus.mount` is called first. In this case, Taunus will replace `window.taunusReady` with a special `boot` method. When the view model finishes loading, you call `taunusReady(model)` and the application finishes booting\n\n    > If this sounds a little mind-bending it's because it is. It's not designed to be pretty, but merely to be performant.\n\n    Now that we've addressed the awkward bits, let's cover the _\"somehow get your hands on the view model\"_ aspect. My preferred method is using JSONP, as it's able to deliver the smallest snippet possible, and it can take advantage of server-side caching. Considering you'll probably want this to be an inline script, keeping it small is important.\n\n    The good news is that the server-side supports JSONP out the box. Here's a snippet of code you could use to pull down the view model and boot Taunus up as soon as both operations are ready.\n\n    ```js\n    function inject (url) {\n      var script = document.createElement('script');\n      script.src = url;\n      document.body.appendChild(script);\n    }\n\n    function injector () {\n      var search = location.search;\n      var searchQuery = search ? '&' + search.substr(1) : '';\n      var searchJson = '?json&callback=taunusReady' + searchQuery;\n      inject(location.pathname + searchJson);\n    }\n\n    window.taunusReady = function (model) {\n      window.taunusReady = model;\n    };\n\n    injector();\n    ```\n\n    As mentioned earlier, this approach involves getting your hands dirtier but it pays off by being the fastest of the three.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching\n\n    The client-side in Taunus supports caching in-memory and using the embedded IndexedDB system by merely turning on the `cache` flag in the options passed to `taunus.mount` on the client-side.\n\n    If you set `cache` to `true` then cached items will be considered _\"fresh\" (valid copies of the original)_ for **15 seconds**. You can also set `cache` to a number, and that number of seconds will be used as the default instead.\n\n    Caching can also be tweaked on individual routes. For instance, you could set `{ cache: true }` when mounting Taunus and then have `{ cache: 3600 }` on a route that you want to cache for a longer period of time.\n\n    The caching layer is _seamlessly integrated_ into Taunus, meaning that any views rendered by Taunus will be cached according to these caching rules. Keep in mind, however, that persistence at the client-side caching layer will only be possible in [browsers that support IndexedDB][14]. In the case of browsers that don't support IndexedDB, Taunus will use an in-memory cache, which will be wiped out whenever the human decides to close the tab in their browser.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Prefetching\n\n    If caching is enabled, the next logical step is prefetching. This is enabled just by adding `prefetch: true` to the options passed to `taunus.mount`. The prefetching feature will fire for any anchor link that's trips over a `mouseover` or a `touchstart` event. If a route matches the URL in the `href`, an AJAX request will prefetch the view and cache its contents, improving perceived performance.\n\n    When links are clicked before prefetching finishes, they'll wait on the prefetcher to finish before immediately switching to the view, effectively cutting down the response time. If the link was already prefetched or otherwise cached, the view will be loaded immediately. If the human hovers over a link and another one was already being prefetched, then that one is aborted. This prevents prefetching from draining the bandwidth on clients with limited or intermittent connectivity.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.on(type, fn)`\n\n    Taunus emits a series of events during its lifecycle, and `taunus.on` is the way you can tune in and listen for these events using a subscription function `fn`.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.once(type, fn)`\n\n    This method is equivalent to [`taunus.on`](#-taunus-on-type-fn-), except the event listeners will be used once and then it'll be discarded.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.off(type, fn)`\n\n    Using this method you can remove any event listeners that were previously added using `.on` or `.once`. You must provide the type of event you want to remove and a reference to the event listener function that was originally used when calling `.on` or `.once`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.intercept(action?, fn)`\n\n    This method can be used to anticipate model requests, before they ever make it into XHR requests. You can add interceptors for specific actions, which would be triggered only if the request matches the specified `action`. You can also add global interceptors by omitting the `action` parameter, or setting it to `*`.\n\n    An interceptor function will receive an `event` parameter, containing a few different properties.\n\n    - `url` contains the URL that needs a view model\n    - `route` contains the full route object as you'd get from [`taunus.route(url)`](#-taunus-route-url-)\n    - `parts` is just a shortcut for `route.parts`\n    - `preventDefault(model)` allows you to suppress the need for an AJAX request, commanding Taunus to use the model you've provided instead\n    - `defaultPrevented` tells you if some other handler has prevented the default behavior\n    - `canPreventDefault` tells you if invoking `event.preventDefault` will have any effect\n    - `model` starts as `null`, and it can later become the model passed to `preventDefault`\n\n    Interceptors are asynchronous, but if an interceptor spends longer than 200ms it'll be short-circuited and calling `event.preventDefault` past that point won't have any effect.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.partial(container, action, model)`\n\n    This method provides you with access to the view-rendering engine of Taunus. You can use it to render the `action` view into the `container` DOM element, using the specified `model`. Once the view is rendered, the `render` event will be fired _(with `container, model` as arguments)_ and the client-side controller for that view will be executed.\n\n    While `taunus.partial` takes a `route` as the fourth parameter, you should omit that since it's used for internal purposes only.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.navigate(url)`\n\n    Whenever you want to navigate to a URL, say when an AJAX call finishes after a button click, you can use `taunus.navigate` passing it a plain URL.\n\n    If `taunus.navigate(url)` is called with an `url` that doesn't match any client-side route, then the user will be redirected via `location.href`.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.route(url)`\n\n    This convenience method allows you to break down a URL into its individual components. This method shouldn't be needed during normal usage of Taunus, but it's useful when debugging your routing tables.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    ## `taunus.state`\n\n    This is an internal state variable, and it contains a lot of useful debugging information.\n\n    - `container` is the DOM element passed to `taunus.mount`\n    - `controllers` are all the controllers, as defined in the wiring module\n    - `templates` are all the templates, as defined in the wiring module\n    - `routes` are all the routes, as defined in the wiring module\n    - `prefetch` exposes whether prefetching is turned on\n    - `cache` exposes whether caching is enabled\n    - `model` is a reference to the model used to render the current view\n\n    Of course, your not supposed to meddle with it, so be a good citizen and just inspect its values!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The `.taunusrc` manifest\n\n    If you want to use values other than the conventional defaults shown in the table below, then you should create a `.taunusrc` file. Note that the defaults need to be overwritten in a case-by-case basis. These options can also be configured in your `package.json`, under the `taunus` property.\n\n    ```json\n    {\n      \"views\": \".bin/views\",\n      \"server_routes\": \"controllers/routes.js\",\n      \"server_controllers\": \"controllers\",\n      \"client_controllers\": \"client/js/controllers\",\n      \"client_wiring\": \".bin/wiring.js\"\n    }\n    ```\n\n    - The `views` directory is where your views _(already compiled into JavaScript)_ are placed. These views are used directly on both the server-side and the client-side\n    - The `server_routes` file is the module where you export a collection of routes. The CLI will pull these routes when creating the client-side routes for the wiring module\n    - The `server_controllers` directory is the root directory where your server-side controllers live. It's used when setting up the server-side router\n    - The `client_controllers` directory is where your client-side controller modules live. The CLI will `require` these controllers in its resulting wiring module\n    - The `client_wiring` file is where your wiring module will be placed by the CLI. You'll then have to `require` it in your application when booting up Taunus\n\n    Here is where things get [a little conventional][12]. Views, and both server-side and client-side controllers are expected to be organized by following the `{root}/{controller}/{action}` pattern, but you could change that using `resolvers` when invoking the CLI and using the server-side API.\n\n    Views and controllers are also expected to be CommonJS modules that export a single method.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: /getting-started\n    [2]: http://expressjs.com\n    [3]: http://hapijs.com\n    [4]: https://github.com/ponyfoo/ponyfoo/blob/33271751312db6e92059d98293d0a7ac6e9e8e5b/views/server/layout/layout.jade\n    [5]: https://github.com/bevacqua/hget\n    [6]: https://github.com/ponyfoo/ponyfoo/blob/f6d6b5068ff03a387f503900160d9fdc1e749750/controllers/routing.js#L70-L72\n    [7]: https://github.com/taunus/taunus-express\n    [8]: https://github.com/taunus/taunus-hapi\n    [9]: https://github.com/taunus/hapiify\n    [10]: https://github.com/umdjs/umd\n    [11]: http://browserify.org\n    [12]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [13]: http://en.wikipedia.org/wiki/Single-page_application\n    [14]: http://caniuse.com/#feat=indexeddb\n");
}
}
},{"jadum/runtime":32}],8:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function complements(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/complements.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/complements.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/complements.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/complements.jade" });
buf.push("<h1 id=\"complementary-modules\">Complementary Modules</h1>\n<p><code>dominus</code>\n<code>xhr</code>\n<code>measly</code></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Complementary Modules\n\n    `dominus`\n    `xhr`\n    `measly`\n");
}
}
},{"jadum/runtime":32}],9:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function gettingStarted(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/getting-started.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/getting-started.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/getting-started.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/getting-started.jade" });
buf.push("<h1 id=\"getting-started\">Getting Started</h1>\n<p>Taunus is a shared-rendering MVC engine for Node.js, and it&#39;s <em>up to you how to use it</em>. In fact, it might be a good idea for you to <strong>set up just the server-side aspect first</strong>, as that&#39;ll teach you how it works even when JavaScript never gets to the client.</p>\n<h1 id=\"table-of-contents\">Table of Contents</h1>\n<ul>\n<li><a href=\"#how-it-works\">How it works</a></li>\n<li><a href=\"#installing-taunus\">Installing Taunus</a></li>\n<li><a href=\"#setting-up-the-server-side\">Setting up the server-side</a><ul>\n<li><a href=\"#your-first-route\">Your first route</a></li>\n<li><a href=\"#creating-a-layout\">Creating a layout</a></li>\n<li><a href=\"#using-jade-as-your-view-engine\">Using Jade as your view engine</a></li>\n<li><a href=\"#throwing-in-a-controller\">Throwing in a controller</a></li>\n</ul>\n</li>\n<li><a href=\"#taunus-in-the-client\">Taunus in the client</a><ul>\n<li><a href=\"#using-the-taunus-cli\">Using the Taunus CLI</a></li>\n<li><a href=\"#booting-up-the-client-side-router\">Booting up the client-side router</a></li>\n<li><a href=\"#adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</a></li>\n<li><a href=\"#compiling-your-client-side-javascript\">Compiling your client-side JavaScript</a></li>\n<li><a href=\"#using-the-client-side-taunus-api\">Using the client-side Taunus API</a></li>\n<li><a href=\"#caching-and-prefetching\">Caching and Prefetching</a></li>\n</ul>\n</li>\n<li><a href=\"#the-sky-is-the-limit-\">The sky is the limit!</a></li>\n</ul>\n<h1 id=\"how-it-works\">How it works</h1>\n<p>Taunus follows a simple but <strong>proven</strong> set of rules.</p>\n<ul>\n<li>Define a <code>function(model)</code> for each your views</li>\n<li>Put these views in both the server and the client</li>\n<li>Define routes for your application</li>\n<li>Put those routes in both the server and the client</li>\n<li>Ensure route matches work the same way on both ends</li>\n<li>Create server-side controllers that yield the model for your views</li>\n<li>Create client-side controllers if you need to add client-side functionality to a particular view</li>\n<li>For the first request, always render views on the server-side</li>\n<li>When rendering a view on the server-side, include the full layout as well!</li>\n<li>Once the client-side code kicks in, <strong>hijack link clicks</strong> and make AJAX requests instead</li>\n<li>When you get the JSON model back, render views on the client-side</li>\n<li>If the <code>history</code> API is unavailable, fall back to good old request-response. <strong>Don&#39;t confuse your humans with obscure hash routers!</strong></li>\n</ul>\n<p>I&#39;ll step you through these, but rather than looking at implementation details, I&#39;ll walk you through the steps you need to take in order to make this flow happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"installing-taunus\">Installing Taunus</h1>\n<p>First off, you&#39;ll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.</p>\n<ul>\n<li><a href=\"http://expressjs.com\">Express</a>, through <a href=\"https://github.com/taunus/taunus-express\">taunus-express</a></li>\n<li><a href=\"http://hapijs.com\">Hapi</a>, through <a href=\"https://github.com/taunus/taunus-hapi\">taunus-hapi</a> and the <a href=\"https://github.com/taunus/hapiify\">hapiify</a> transform</li>\n</ul>\n<blockquote>\n<p>If you&#39;re more of a <em>&quot;rummage through someone else&#39;s code&quot;</em> type of developer, you may feel comfortable <a href=\"https://github.com/taunus/taunus.bevacqua.io\">going through this website&#39;s source code</a>, which uses the <a href=\"http://hapijs.com\">Hapi</a> flavor of Taunus. Alternatively you can look at the source code for <a href=\"https://github.com/ponyfoo/ponyfoo\">ponyfoo.com</a>, which is <strong>a more advanced use-case</strong> under the <a href=\"http://expressjs.com\">Express</a> flavor. Or, you could just keep on reading this page, that&#39;s okay too.</p>\n</blockquote>\n<p>Once you&#39;ve settled for either <a href=\"http://expressjs.com\">Express</a> or <a href=\"http://hapijs.com\">Hapi</a> you&#39;ll be able to proceed. For the purposes of this guide, we&#39;ll use <a href=\"http://expressjs.com\">Express</a>. Switching between one of the different HTTP flavors is strikingly easy, though.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"setting-up-the-server-side\">Setting up the server-side</h4>\n<p>Naturally, you&#39;ll need to install all of the following modules from <code>npm</code> to get started.</p>\n<pre><code class=\"lang-shell\">mkdir getting-started\ncd getting-started\nnpm init\nnpm install --save taunus taunus-express express\n</code></pre>\n<p><img src=\"http://i.imgur.com/4P8vNe9.png\" alt=\"Screenshot with `npm init` output\"></p>\n<p>Let&#39;s build our application step-by-step, and I&#39;ll walk you through them as we go along. First of all, you&#39;ll need the famous <code>app.js</code> file.</p>\n<pre><code class=\"lang-shell\">touch app.js\n</code></pre>\n<p>It&#39;s probably a good idea to put something in your <code>app.js</code> file, let&#39;s do that now.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>All <code>taunus-express</code> really does is add a bunch of routes to your Express <code>app</code>. You should note that any middleware and API routes should probably come before the <code>taunusExpress</code> invocation. You&#39;ll probably be using a catch-all view route that renders a <em>&quot;Not Found&quot;</em> view, blocking any routing beyond that route.</p>\n<p>If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/n8mH4mN.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>The <code>options</code> object passed to <code>taunusExpress</code> let&#39;s you configure Taunus. Instead of discussing every single configuration option you could set here, let&#39;s discuss what matters: the <em>required configuration</em>. There&#39;s two options that you must set if you want your Taunus application to make any sense.</p>\n<ul>\n<li><code>routes</code> should be an array of view routes</li>\n<li><code>layout</code> should be a function that takes a single <code>model</code> argument and returns an entire HTML document</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"your-first-route\">Your first route</h4>\n<p>Routes need to be placed in its own dedicated module, so that you can reuse it later on <strong>when setting up client-side routing</strong>. Let&#39;s create that module and add a route to it.</p>\n<pre><code class=\"lang-shell\">touch routes.js\n</code></pre>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = [\n  { route: &#39;/&#39;, action: &#39;home/index&#39; }\n];\n</code></pre>\n<p>Each item in the exported array is a route. In this case, we only have the <code>/</code> route with the <code>home/index</code> action. Taunus follows the well known <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention over configuration pattern</a>, which made <a href=\"http://en.wikipedia.org/wiki/Ruby_on_Rails\">Ruby on Rails</a> famous. <em>Maybe one day Taunus will be famous too!</em> By convention, Taunus will assume that the <code>home/index</code> action uses the <code>home/index</code> controller and renders the <code>home/index</code> view. Of course, <em>all of that can be changed using configuration</em>.</p>\n<p>Time to go back to <code>app.js</code> and update the <code>options</code> object.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>It&#39;s important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is <em>(more on that <a href=\"/api\">in the API documentation</a>, but it defaults to <code>{}</code>)</em>.</p>\n<p>Here&#39;s what you&#39;d get if you attempted to run the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/08lnCec.png\" alt=\"Screenshot with `node app` results\"></p>\n<p>Turns out you&#39;re missing a lot of things! Taunus is quite lenient and it&#39;ll try its best to let you know what you might be missing, though. Apparently you don&#39;t have a layout, a server-side controller, or even a view! <em>That&#39;s rough.</em></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"creating-a-layout\">Creating a layout</h4>\n<p>Let&#39;s also create a layout. For the purposes of making our way through this guide, it&#39;ll just be a plain JavaScript function.</p>\n<pre><code class=\"lang-shell\">touch layout.js\n</code></pre>\n<p>Note that the <code>partial</code> property in the <code>model</code> <em>(as seen below)</em> is created on the fly after rendering partial views. The layout function we&#39;ll be using here effectively means <em>&quot;use the following combination of plain text and the <strong>(maybe HTML)</strong> partial view&quot;</em>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model) {\n  return &#39;This is the partial: &quot;&#39; + model.partial + &#39;&quot;&#39;;\n};\n</code></pre>\n<p>Of course, if you were developing a real application, then you probably wouldn&#39;t want to write views as JavaScript functions as that&#39;s unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.</p>\n<ul>\n<li><a href=\"https://github.com/janl/mustache.js\">Mustache</a> is a templating engine that can compile your views into plain functions, using a syntax that&#39;s minimally different from HTML</li>\n<li><a href=\"https://github.com/jadejs/jade\">Jade</a> is another option, and it has a terse syntax where spacing matters but there&#39;s no closing tags</li>\n<li>There&#39;s many more alternatives like <a href=\"http://mozilla.github.io/nunjucks/\">Mozilla&#39;s Nunjucks</a>, <a href=\"http://handlebarsjs.com/\">Handlebars</a>, and <a href=\"http://www.embeddedjs.com/\">EJS</a>.</li>\n</ul>\n<p>Remember to add the <code>layout</code> under the <code>options</code> object passed to <code>taunusExpress</code>!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Here&#39;s what you&#39;d get if you ran the application at this point.</p>\n<pre><code class=\"lang-shell\">node app &amp;\ncurl localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/wUbnCyk.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>At this point we have a layout, but we&#39;re still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you&#39;re trying to get an MVC engine up and running, right?</p>\n<p>You&#39;ll find tools related to view templating in the <a href=\"/complements\">complementary modules section</a>. If you don&#39;t provide a <code>layout</code> property at all, Taunus will render your model in a response by wrapping it in <code>&lt;pre&gt;</code> and <code>&lt;code&gt;</code> tags, which may aid you when getting started.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-jade-as-your-view-engine\">Using Jade as your view engine</h4>\n<p>Let&#39;s go ahead and use Jade as the view-rendering engine of choice for our views.</p>\n<pre><code class=\"lang-shell\">mkdir -p views/home\ntouch views/home/index.jade\n</code></pre>\n<p>Since we&#39;re just getting started, the view will just have some basic static content, and that&#39;s it.</p>\n<pre><code class=\"lang-jade\">p Hello Taunus!\n</code></pre>\n<p>Next you&#39;ll want to compile the view into a function. To do that you can use <a href=\"https://github.com/bevacqua/jadum\">jadum</a>, a specialized Jade compiler that plays well with Taunus by being aware of <code>require</code> statements, and thus saving bytes when it comes to client-side rendering. Let&#39;s install it globally, for the sake of this exercise <em>(you should install it locally when you&#39;re developing a real application)</em>.</p>\n<pre><code class=\"lang-shell\">npm install --global jadum\n</code></pre>\n<p>To compile every view in the <code>views</code> directory into functions that work well with Taunus, you can use the command below. The <code>--output</code> flag indicates where you want the views to be placed. We chose to use <code>.bin</code> because that&#39;s where Taunus expects your compiled views to be by default. But since Taunus follows the <a href=\"http://ponyfoo.com/stop-breaking-the-web\">convention over configuration</a> approach, you could change that if you wanted to.</p>\n<pre><code class=\"lang-shell\">jadum views/** --output .bin\n</code></pre>\n<p>Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that&#39;s left is for you to run the application and visit it on port <code>3000</code>.</p>\n<pre><code class=\"lang-shell\">node app &amp;\nopen http://localhost:3000\n</code></pre>\n<p><img src=\"http://i.imgur.com/zjaJYCq.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>Granted, you should <em>probably</em> move the layout into a Jade <em>(any view engine will do)</em> template as well.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"throwing-in-a-controller\">Throwing in a controller</h4>\n<p>Controllers are indeed optional, but an application that renders every view using the same model won&#39;t get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let&#39;s create a controller for the <code>home/view</code> action.</p>\n<pre><code class=\"lang-shell\">mkdir -p controllers/home\ntouch controllers/home/index.js\n</code></pre>\n<p>The controller module should merely export a function. <em>Started noticing the pattern?</em> The signature for the controller is the same signature as that of any other middleware passed to <a href=\"http://expressjs.com\">Express</a> <em>(or any route handler passed to <a href=\"http://hapijs.com\">Hapi</a> in the case of <code>taunus-hapi</code>)</em>.</p>\n<p>As you may have noticed in the examples so far, you haven&#39;t even set a document title for your HTML pages! Turns out, there&#39;s a few model properties <em>(very few)</em> that Taunus is aware of. One of those is the <code>title</code> property, and it&#39;ll be used to change the <code>document.title</code> in your pages when navigating through the client-side. Keep in mind that anything that&#39;s not in the <code>model</code> property won&#39;t be trasmitted to the client, and will just be accessible to the layout.</p>\n<p>Here is our newfangled <code>home/index</code> controller. As you&#39;ll notice, it doesn&#39;t disrupt any of the typical Express experience, but merely builds upon it. When <code>next</code> is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to <code>res.viewModel</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (req, res, next) {\n  res.viewModel = {\n    model: {\n      title: &#39;Welcome Home, Taunus!&#39;\n    }\n  };\n  next();\n};\n</code></pre>\n<p>Of course, relying on the client-side changes to your page in order to set the view title <em>wouldn&#39;t be progressive</em>, and thus <a href=\"http://ponyfoo.com/stop-breaking-the-web\">it would be really, <em>really</em> bad</a>. We should update the layout to use whatever <code>title</code> has been passed to the model. In fact, let&#39;s go back to the drawing board and make the layout into a Jade template!</p>\n<pre><code class=\"lang-shell\">rm layout.js\ntouch views/layout.jade\njadum views/** --output .bin\n</code></pre>\n<p>You should also remember to update the <code>app.js</code> module once again!</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The <code>!=</code> syntax below means that whatever is in the value assigned to the element won&#39;t be escaped. That&#39;s okay because <code>partial</code> is a view where Jade escaped anything that needed escaping, but we wouldn&#39;t want HTML tags to be escaped!</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\n</code></pre>\n<p>By the way, did you know that <code>&lt;html&gt;</code>, <code>&lt;head&gt;</code>, and <code>&lt;body&gt;</code> are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! <em>How cool is that?</em></p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/NvEWx9z.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>You can now visit <code>localhost:3000</code> with your favorite web browser and you&#39;ll notice that the view renders as you&#39;d expect. The title will be properly set, and a <code>&lt;main&gt;</code> element will have the contents of your view.</p>\n<p><img src=\"http://i.imgur.com/LgZRFn5.png\" alt=\"Screenshot with application running on Google Chrome\"></p>\n<p>That&#39;s it, now your view has a title. Of course, there&#39;s nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking <code>next</code> to render the view.</p>\n<p>Then there&#39;s also the client-side aspect of setting up Taunus. Let&#39;s set it up and see how it opens up our possibilities.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"taunus-in-the-client\">Taunus in the client</h1>\n<p>You already know how to set up the basics for server-side rendering, and you know that you should <a href=\"/api\">check out the API documentation</a> to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.</p>\n<p>The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, <em>or if it hasn&#39;t loaded yet due to a slow connection such as those in unstable mobile networks</em>, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.</p>\n<p>Setting up the client-side involves a few different steps. Firstly, we&#39;ll have to compile the application&#39;s wiring <em>(the routes and JavaScript view functions)</em> into something the browser understands. Then, you&#39;ll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that&#39;s out of the way, client-side routing would be set up.</p>\n<p>As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you&#39;ll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-taunus-cli\">Using the Taunus CLI</h4>\n<p>Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don&#39;t have to <code>require</code> every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with <code>jadum</code> earlier, we&#39;ll install the <code>taunus</code> CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.</p>\n<pre><code class=\"lang-shell\">npm install --global taunus\n</code></pre>\n<p>Before you can use the CLI, you should move the route definitions to <code>controllers/routes.js</code>. That&#39;s where Taunus expects them to be. If you want to place them something else, <a href=\"/api\">the API documentation can help you</a>.</p>\n<pre><code class=\"lang-shell\">mv routes.js controllers/routes.js\n</code></pre>\n<p>Since you moved the routes you should also update the <code>require</code> statement in the <code>app.js</code> module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>The CLI is terse in both its inputs and its outputs. If you run it without any arguments it&#39;ll print out the wiring module, and if you want to persist it you should provide the <code>--output</code> flag. In typical <a href=\"http://en.wikipedia.org/wiki/Convention_over_configuration\">convention-over-configuration</a> fashion, the CLI will default to inferring your views are located in <code>.bin/views</code> and that you want the wiring module to be placed in <code>.bin/wiring.js</code>, but you&#39;ll be able to change that if it doesn&#39;t meet your needs.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>At this point in our example, the CLI should create a <code>.bin/wiring.js</code> file with the contents detailed below. As you can see, even if <code>taunus</code> is an automated code-generation tool, it&#39;s output is as human readable as any other module.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar templates = {\n  &#39;home/index&#39;: require(&#39;./views/home/index.js&#39;),\n  &#39;layout&#39;: require(&#39;./views/layout.js&#39;)\n};\n\nvar controllers = {\n};\n\nvar routes = {\n  &#39;/&#39;: {\n    action: &#39;home/index&#39;\n  }\n};\n\nmodule.exports = {\n  templates: templates,\n  controllers: controllers,\n  routes: routes\n};\n</code></pre>\n<p><img src=\"http://i.imgur.com/fJnHdYi.png\" alt=\"Screenshot with `taunus` output\"></p>\n<p>Note that the <code>controllers</code> object is empty because you haven&#39;t created any <em>client-side controllers</em> yet. We created server-side controllers but those don&#39;t have any effect in the client-side, besides determining what gets sent to the client.</p>\n<p>The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.</p>\n<p>During development, you can also add the <code>--watch</code> flag, which will rebuild the wiring module if a relevant file changes.</p>\n<pre><code class=\"lang-shell\">taunus --output --watch\n</code></pre>\n<p>If you&#39;re using Hapi instead of Express, you&#39;ll also need to pass in the <code>hapiify</code> transform so that routes get converted into something the client-side routing module understand.</p>\n<pre><code class=\"lang-shell\">taunus --output --transform hapiify\n</code></pre>\n<p>Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"booting-up-the-client-side-router\">Booting up the client-side router</h4>\n<p>Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use <code>client/js</code> to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let&#39;s stick to the conventions.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js\ntouch client/js/main.js\n</code></pre>\n<p>The <code>main</code> module will be used as the <em>entry point</em> of your application on the client-side. Here you&#39;ll need to import <code>taunus</code>, the wiring module we&#39;ve just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke <code>taunus.mount</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar wiring = require(&#39;../../.bin/wiring&#39;);\nvar main = document.getElementsByTagName(&#39;main&#39;)[0];\n\ntaunus.mount(main, wiring);\n</code></pre>\n<p>The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.</p>\n<p>By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won&#39;t be functional until the client-side controller runs.</p>\n<p>An alternative is to inline the view model alongside the views in a <code>&lt;script type=&#39;text/taunus&#39;&gt;</code> tag, but this tends to slow down the initial response (models are <em>typically larger</em> than the resulting views).</p>\n<p>A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that&#39;s harder to set up.</p>\n<p>The three booting strategies are explained in <a href=\"/api\">the API documentation</a> and further discussed in <a href=\"/performance\">the optimization guide</a>. For now, the default strategy <em>(<code>&#39;auto&#39;</code>)</em> should suffice. It fetches the view model using an AJAX request right after Taunus loads.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"adding-functionality-in-a-client-side-controller\">Adding functionality in a client-side controller</h4>\n<p>Client-side controllers run whenever a view is rendered, even if it&#39;s a partial. The controller is passed the <code>model</code>, containing the model that was used to render the view; the <code>route</code>, broken down into its components; and the <code>container</code>, which is whatever DOM element the view was rendered into.</p>\n<p>These controllers are entirely optional, which makes sense since we&#39;re progressively enhancing the application: it might not even be necessary! Let&#39;s add some client-side functionality to the example we&#39;ve been building.</p>\n<pre><code class=\"lang-shell\">mkdir -p client/js/controllers/home\ntouch client/js/controllers/home/index.js\n</code></pre>\n<p>Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we&#39;ll just print the action and the model to the console. If there&#39;s one place where you&#39;d want to enhance the experience, client-side controllers are where you want to put your code.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nmodule.exports = function (model, container, route) {\n  console.log(&#39;Rendered view %s using model:\\n%s&#39;, route.action, JSON.stringify(model, null, 2));\n};\n</code></pre>\n<p>Since we weren&#39;t using the <code>--watch</code> flag from the Taunus CLI, you&#39;ll have to recompile the wiring at this point, so that the controller gets added to that manifest.</p>\n<pre><code class=\"lang-shell\">taunus --output\n</code></pre>\n<p>Of course, you&#39;ll now have to wire up the client-side JavaScript using <a href=\"http://browserify.org/\">Browserify</a>!</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"compiling-your-client-side-javascript\">Compiling your client-side JavaScript</h4>\n<p>You&#39;ll need to compile the <code>client/js/main.js</code> module, our client-side application&#39;s entry point, using Browserify since the code is written using CommonJS. In this example you&#39;ll install <code>browserify</code> globally to compile the code, but naturally you&#39;ll install it locally when working on a real-world application.</p>\n<pre><code class=\"lang-shell\">npm install --global browserify\n</code></pre>\n<p>Once you have the Browserify CLI, you&#39;ll be able to compile the code right from your command line. The <code>-d</code> flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The <code>-o</code> flag redirects output to the indicated file, whereas the output is printed to standard output by default.</p>\n<pre><code class=\"lang-shell\">mkdir -p .bin/public/js\nbrowserify client/js/main.js -do .bin/public/js/all.js\n</code></pre>\n<p>We haven&#39;t done much of anything with the Express application, so you&#39;ll need to adjust the <code>app.js</code> module to serve static assets. If you&#39;re used to Express, you&#39;ll notice there&#39;s nothing special about how we&#39;re using <code>serve-static</code>.</p>\n<pre><code class=\"lang-shell\">npm install --save serve-static\n</code></pre>\n<p>Let&#39;s configure the application to serve static assets from <code>.bin/public</code>.</p>\n<pre><code class=\"lang-js\">&#39;use strict&#39;;\n\nvar taunus = require(&#39;taunus&#39;);\nvar taunusExpress = require(&#39;taunus-express&#39;);\nvar express = require(&#39;express&#39;);\nvar serveStatic = require(&#39;serve-static&#39;);\nvar app = express();\nvar options = {\n  routes: require(&#39;./controllers/routes&#39;),\n  layout: require(&#39;./.bin/views/layout&#39;)\n};\n\napp.use(serveStatic(&#39;.bin/public&#39;));\ntaunusExpress(taunus, app, options);\napp.listen(3000);\n</code></pre>\n<p>Next up, you&#39;ll have to edit the layout to include the compiled JavaScript bundle file.</p>\n<pre><code class=\"lang-jade\">title=model.title\nmain!=partial\nscript(src=&#39;/js/all.js&#39;)\n</code></pre>\n<p>Lastly, you can execute the application and see it in action!</p>\n<pre><code class=\"lang-shell\">node app\n</code></pre>\n<p><img src=\"http://i.imgur.com/68O84wX.png\" alt=\"Screenshot with `node app` output\"></p>\n<p>If you open the application on a web browser, you&#39;ll notice that the appropriate information will be logged into the developer <code>console</code>.</p>\n<p><img src=\"http://i.imgur.com/ZUF6NFl.png\" alt=\"Screenshot with the application running under Google Chrome\"></p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"using-the-client-side-taunus-api\">Using the client-side Taunus API</h4>\n<p>Taunus does provide <a href=\"/api\">a thin API</a> in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there&#39;s a few methods you can take advantage of on a global scale as well.</p>\n<p>Taunus can notify you whenever important events occur.</p>\n<table>\n<thead>\n<tr>\n<th>Event</th>\n<th>Arguments</th>\n<th>Description</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><code>&#39;start&#39;</code></td>\n<td><code>container, model</code></td>\n<td>Emitted when <code>taunus.mount</code> finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling <code>taunus.mount</code>.</td>\n</tr>\n<tr>\n<td><code>&#39;render&#39;</code></td>\n<td><code>container, model</code></td>\n<td>A view has just been rendered and its client-side controller is about to be invoked</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.start&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request starts.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.done&#39;</code></td>\n<td><code>route, context, data</code></td>\n<td>Emitted whenever an XHR request ends successfully.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.abort&#39;</code></td>\n<td><code>route, context</code></td>\n<td>Emitted whenever an XHR request is purposely aborted.</td>\n</tr>\n<tr>\n<td><code>&#39;fetch.error&#39;</code></td>\n<td><code>route, context, err</code></td>\n<td>Emitted whenever an XHR request results in an HTTP error.</td>\n</tr>\n</tbody>\n</table>\n<p>Besides events, there&#39;s a couple more methods you can use. The <code>taunus.navigate</code> method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there&#39;s <code>taunus.partial</code>, and that allows you to render any partial view on a DOM element of your choosing, and it&#39;ll then invoke its controller. You&#39;ll need to come up with the model yourself, though.</p>\n<p>Astonishingly, the API is further documented in <a href=\"/api\">the API documentation</a>.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h4 id=\"caching-and-prefetching\">Caching and Prefetching</h4>\n<p><a href=\"/performance\">Performance</a> plays an important role in Taunus. That&#39;s why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?</p>\n<p>When turned on, by passing <code>{ cache: true }</code> as the third parameter for <code>taunus.mount</code>, the caching layer will make sure that responses are kept around for <code>15</code> seconds. Whenever a route needs a model in order to render a view, it&#39;ll first ask the caching layer for a fresh copy. If the caching layer doesn&#39;t have a copy, or if that copy is stale <em>(in this case, older than <code>15</code> seconds)</em>, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set <code>cache</code> to a number in seconds instead of just <code>true</code>.</p>\n<p>Since Taunus understands that not every view operates under the same constraints, you&#39;re also able to set a <code>cache</code> freshness duration directly in your routes. The <code>cache</code> property in routes has precedence over the default value.</p>\n<p>There&#39;s currently two caching stores: a raw in-memory store, and an <a href=\"https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\">IndexedDB</a> store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of <code>localStorage</code>. It has <a href=\"http://caniuse.com/#feat=indexeddb\">surprisingly broad browser support</a>, and in the cases where it&#39;s not supported then caching is done solely in-memory.</p>\n<p>The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them <em>(the <code>touchstart</code> event)</em>, the prefetcher will issue an AJAX request for the view model for that link.</p>\n<p>If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their <em>(possibly limited)</em> Internet connection bandwidth.</p>\n<p>If the human clicks on the link before prefetching is completed, he&#39;ll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.</p>\n<p>Turning prefetching on is simply a matter of setting <code>prefetch</code> to <code>true</code> in the options passed to <code>taunus.mount</code>. For additional insights into the performance improvements Taunus can offer, head over to the <a href=\"/performance\">Performance Optimizations</a> guide.</p>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"the-sky-is-the-limit-\">The sky is the limit!</h1>\n<p>You&#39;re now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn&#39;t stop there.</p>\n<ul>\n<li>Learn more about <a href=\"/api\">the API Taunus has</a> to offer</li>\n<li>Go through the <a href=\"/performance\">performance optimization tips</a>. You may learn something new!</li>\n<li><em>Familiarize yourself with the ways of progressive enhancement</em><ul>\n<li>Jeremy Keith enunciates <a href=\"https://adactio.com/journal/7706\">&quot;Be progressive&quot;</a></li>\n<li>Christian Heilmann advocates for <a href=\"http://icant.co.uk/articles/pragmatic-progressive-enhancement/\">&quot;Pragmatic progressive enhancement&quot;</a></li>\n<li>Jake Archibald explains how <a href=\"http://jakearchibald.com/2013/progressive-enhancement-is-faster/\">&quot;Progressive enhancement is faster&quot;</a></li>\n<li>I blogged about how we should <a href=\"http://ponyfoo.com/stop-breaking-the-web\">&quot;Stop Breaking the Web&quot;</a></li>\n<li>Guillermo Rauch argues for <a href=\"http://rauchg.com/2014/7-principles-of-rich-web-applications/\">&quot;7 Principles of Rich Web Applications&quot;</a></li>\n<li>Aaron Gustafson writes <a href=\"http://alistapart.com/article/understandingprogressiveenhancement\">&quot;Understanding Progressive Enhancement&quot;</a></li>\n<li>Orde Saunders gives his point of view in <a href=\"https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\">&quot;Progressive enhancement for fault tolerance&quot;</a></li>\n</ul>\n</li>\n<li>Sift through the <a href=\"/complements\">complementary modules</a>. You may find something you hadn&#39;t thought of!</li>\n</ul>\n<p>Also, get involved!</p>\n<ul>\n<li>Fork this repository and <a href=\"https://github.com/taunus/taunus.bevacqua.io/pulls\">send some pull requests</a> to improve these guides!</li>\n<li>See something, say something! If you detect a bug, <a href=\"https://github.com/taunus/taunus/issues/new\">please create an issue</a>!</li>\n</ul>\n<p><sub><a href=\"#table-of-contents\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Getting Started\n\n    Taunus is a shared-rendering MVC engine for Node.js, and it's _up to you how to use it_. In fact, it might be a good idea for you to **set up just the server-side aspect first**, as that'll teach you how it works even when JavaScript never gets to the client.\n\n    # Table of Contents\n\n    - [How it works](#how-it-works)\n    - [Installing Taunus](#installing-taunus)\n    - [Setting up the server-side](#setting-up-the-server-side)\n      - [Your first route](#your-first-route)\n      - [Creating a layout](#creating-a-layout)\n      - [Using Jade as your view engine](#using-jade-as-your-view-engine)\n      - [Throwing in a controller](#throwing-in-a-controller)\n    - [Taunus in the client](#taunus-in-the-client)\n      - [Using the Taunus CLI](#using-the-taunus-cli)\n      - [Booting up the client-side router](#booting-up-the-client-side-router)\n      - [Adding functionality in a client-side controller](#adding-functionality-in-a-client-side-controller)\n      - [Compiling your client-side JavaScript](#compiling-your-client-side-javascript)\n      - [Using the client-side Taunus API](#using-the-client-side-taunus-api)\n      - [Caching and Prefetching](#caching-and-prefetching)\n    - [The sky is the limit!](#the-sky-is-the-limit-)\n\n    # How it works\n\n    Taunus follows a simple but **proven** set of rules.\n\n    - Define a `function(model)` for each your views\n    - Put these views in both the server and the client\n    - Define routes for your application\n    - Put those routes in both the server and the client\n    - Ensure route matches work the same way on both ends\n    - Create server-side controllers that yield the model for your views\n    - Create client-side controllers if you need to add client-side functionality to a particular view\n    - For the first request, always render views on the server-side\n    - When rendering a view on the server-side, include the full layout as well!\n    - Once the client-side code kicks in, **hijack link clicks** and make AJAX requests instead\n    - When you get the JSON model back, render views on the client-side\n    - If the `history` API is unavailable, fall back to good old request-response. **Don't confuse your humans with obscure hash routers!**\n\n    I'll step you through these, but rather than looking at implementation details, I'll walk you through the steps you need to take in order to make this flow happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Installing Taunus\n\n    First off, you'll need to choose a HTTP server framework for your application. At the moment Taunus supports only a couple of HTTP frameworks, but more may be added if they are popular enough.\n\n    - [Express][6], through [taunus-express][1]\n    - [Hapi][7], through [taunus-hapi][2] and the [hapiify][3] transform\n\n    > If you're more of a _\"rummage through someone else's code\"_ type of developer, you may feel comfortable [going through this website's source code][4], which uses the [Hapi][7] flavor of Taunus. Alternatively you can look at the source code for [ponyfoo.com][5], which is **a more advanced use-case** under the [Express][6] flavor. Or, you could just keep on reading this page, that's okay too.\n\n    Once you've settled for either [Express][6] or [Hapi][7] you'll be able to proceed. For the purposes of this guide, we'll use [Express][6]. Switching between one of the different HTTP flavors is strikingly easy, though.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Setting up the server-side\n\n    Naturally, you'll need to install all of the following modules from `npm` to get started.\n\n    ```shell\n    mkdir getting-started\n    cd getting-started\n    npm init\n    npm install --save taunus taunus-express express\n    ```\n\n    ![Screenshot with `npm init` output][30]\n\n    Let's build our application step-by-step, and I'll walk you through them as we go along. First of all, you'll need the famous `app.js` file.\n\n    ```shell\n    touch app.js\n    ```\n\n    It's probably a good idea to put something in your `app.js` file, let's do that now.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {};\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    All `taunus-express` really does is add a bunch of routes to your Express `app`. You should note that any middleware and API routes should probably come before the `taunusExpress` invocation. You'll probably be using a catch-all view route that renders a _\"Not Found\"_ view, blocking any routing beyond that route.\n\n    If you were to run the application now you would get a friendly remined from Taunus letting you know that you forgot to declare any view routes. Silly you!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][31]\n\n    The `options` object passed to `taunusExpress` let's you configure Taunus. Instead of discussing every single configuration option you could set here, let's discuss what matters: the _required configuration_. There's two options that you must set if you want your Taunus application to make any sense.\n\n    - `routes` should be an array of view routes\n    - `layout` should be a function that takes a single `model` argument and returns an entire HTML document\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Your first route\n\n    Routes need to be placed in its own dedicated module, so that you can reuse it later on **when setting up client-side routing**. Let's create that module and add a route to it.\n\n    ```shell\n    touch routes.js\n    ```\n\n    ```js\n    'use strict';\n\n    module.exports = [\n      { route: '/', action: 'home/index' }\n    ];\n    ```\n\n    Each item in the exported array is a route. In this case, we only have the `/` route with the `home/index` action. Taunus follows the well known [convention over configuration pattern][8], which made [Ruby on Rails][9] famous. _Maybe one day Taunus will be famous too!_ By convention, Taunus will assume that the `home/index` action uses the `home/index` controller and renders the `home/index` view. Of course, _all of that can be changed using configuration_.\n\n    Time to go back to `app.js` and update the `options` object.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    It's important to know that if you omit the creation of a controller then Taunus will skip that step, and render the view passing it whatever the default model is _(more on that [in the API documentation][18], but it defaults to `{}`)_.\n\n    Here's what you'd get if you attempted to run the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` results][32]\n\n    Turns out you're missing a lot of things! Taunus is quite lenient and it'll try its best to let you know what you might be missing, though. Apparently you don't have a layout, a server-side controller, or even a view! _That's rough._\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Creating a layout\n\n    Let's also create a layout. For the purposes of making our way through this guide, it'll just be a plain JavaScript function.\n\n    ```shell\n    touch layout.js\n    ```\n\n    Note that the `partial` property in the `model` _(as seen below)_ is created on the fly after rendering partial views. The layout function we'll be using here effectively means _\"use the following combination of plain text and the **(maybe HTML)** partial view\"_.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model) {\n      return 'This is the partial: \"' + model.partial + '\"';\n    };\n    ```\n\n    Of course, if you were developing a real application, then you probably wouldn't want to write views as JavaScript functions as that's unproductive, confusing, and hard to maintain. What you could do instead, is use a view-rendering engine that allows you to compile your view templates into JavaScript functions.\n\n    - [Mustache][10] is a templating engine that can compile your views into plain functions, using a syntax that's minimally different from HTML\n    - [Jade][11] is another option, and it has a terse syntax where spacing matters but there's no closing tags\n    - There's many more alternatives like [Mozilla's Nunjucks][12], [Handlebars][13], and [EJS][14].\n\n    Remember to add the `layout` under the `options` object passed to `taunusExpress`!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Here's what you'd get if you ran the application at this point.\n\n    ```shell\n    node app &\n    curl localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][33]\n\n    At this point we have a layout, but we're still missing the partial view and the server-side controller. We can do without the controller, but having no views is kind of pointless when you're trying to get an MVC engine up and running, right?\n\n    You'll find tools related to view templating in the [complementary modules section][15]. If you don't provide a `layout` property at all, Taunus will render your model in a response by wrapping it in `<pre>` and `<code>` tags, which may aid you when getting started.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using Jade as your view engine\n\n    Let's go ahead and use Jade as the view-rendering engine of choice for our views.\n\n    ```shell\n    mkdir -p views/home\n    touch views/home/index.jade\n    ```\n\n    Since we're just getting started, the view will just have some basic static content, and that's it.\n\n    ```jade\n    p Hello Taunus!\n    ```\n\n    Next you'll want to compile the view into a function. To do that you can use [jadum][16], a specialized Jade compiler that plays well with Taunus by being aware of `require` statements, and thus saving bytes when it comes to client-side rendering. Let's install it globally, for the sake of this exercise _(you should install it locally when you're developing a real application)_.\n\n    ```shell\n    npm install --global jadum\n    ```\n\n    To compile every view in the `views` directory into functions that work well with Taunus, you can use the command below. The `--output` flag indicates where you want the views to be placed. We chose to use `.bin` because that's where Taunus expects your compiled views to be by default. But since Taunus follows the [convention over configuration][17] approach, you could change that if you wanted to.\n\n    ```shell\n    jadum views/** --output .bin\n    ```\n\n    Congratulations! Your first view is now operational and built using a full-fledged templating engine! All that's left is for you to run the application and visit it on port `3000`.\n\n    ```shell\n    node app &\n    open http://localhost:3000\n    ```\n\n    ![Screenshot with `node app` output][34]\n\n    Granted, you should _probably_ move the layout into a Jade _(any view engine will do)_ template as well.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Throwing in a controller\n\n    Controllers are indeed optional, but an application that renders every view using the same model won't get you very far. Controllers allow you to handle the request and put together the model to be used when sending a response. Contrary to what most frameworks propose, Taunus expects every action to have its own individual controller. Since Node.js makes it easy to import components, this setup helps you keep your code modular while still being able to reuse logic by sharing modules across different controllers. Let's create a controller for the `home/view` action.\n\n    ```shell\n    mkdir -p controllers/home\n    touch controllers/home/index.js\n    ```\n\n    The controller module should merely export a function. _Started noticing the pattern?_ The signature for the controller is the same signature as that of any other middleware passed to [Express][6] _(or any route handler passed to [Hapi][7] in the case of `taunus-hapi`)_.\n\n    As you may have noticed in the examples so far, you haven't even set a document title for your HTML pages! Turns out, there's a few model properties _(very few)_ that Taunus is aware of. One of those is the `title` property, and it'll be used to change the `document.title` in your pages when navigating through the client-side. Keep in mind that anything that's not in the `model` property won't be trasmitted to the client, and will just be accessible to the layout.\n\n    Here is our newfangled `home/index` controller. As you'll notice, it doesn't disrupt any of the typical Express experience, but merely builds upon it. When `next` is called, the Taunus view-rendering handler will kick in, and render the view using the information that was assigned to `res.viewModel`.\n\n    ```js\n    'use strict';\n\n    module.exports = function (req, res, next) {\n      res.viewModel = {\n        model: {\n          title: 'Welcome Home, Taunus!'\n        }\n      };\n      next();\n    };\n    ```\n\n    Of course, relying on the client-side changes to your page in order to set the view title _wouldn't be progressive_, and thus [it would be really, _really_ bad][17]. We should update the layout to use whatever `title` has been passed to the model. In fact, let's go back to the drawing board and make the layout into a Jade template!\n\n    ```shell\n    rm layout.js\n    touch views/layout.jade\n    jadum views/** --output .bin\n    ```\n\n    You should also remember to update the `app.js` module once again!\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The `!=` syntax below means that whatever is in the value assigned to the element won't be escaped. That's okay because `partial` is a view where Jade escaped anything that needed escaping, but we wouldn't want HTML tags to be escaped!\n\n    ```jade\n    title=model.title\n    main!=partial\n    ```\n\n    By the way, did you know that `<html>`, `<head>`, and `<body>` are all optional in HTML 5, and that you can safely omit them in your HTML? Of course, rendering engines will still insert those elements automatically into the DOM for you! _How cool is that?_\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][35]\n\n    You can now visit `localhost:3000` with your favorite web browser and you'll notice that the view renders as you'd expect. The title will be properly set, and a `<main>` element will have the contents of your view.\n\n    ![Screenshot with application running on Google Chrome][36]\n\n    That's it, now your view has a title. Of course, there's nothing stopping you from adding database calls to fetch bits and pieces of the model before invoking `next` to render the view.\n\n    Then there's also the client-side aspect of setting up Taunus. Let's set it up and see how it opens up our possibilities.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # Taunus in the client\n\n    You already know how to set up the basics for server-side rendering, and you know that you should [check out the API documentation][18] to get a more thorough understanding of the public interface on Taunus, and what it enables you to do.\n\n    The way Taunus works on the client-side is so that once you set it up, it will hijack link clicks and use AJAX to fetch models and render those views in the client. If the JavaScript code fails to load, _or if it hasn't loaded yet due to a slow connection such as those in unstable mobile networks_, the regular link would be followed instead and no harm would be unleashed upon the human, except they would get a slightly less fancy experience.\n\n    Setting up the client-side involves a few different steps. Firstly, we'll have to compile the application's wiring _(the routes and JavaScript view functions)_ into something the browser understands. Then, you'll have to mount Taunus on the client-side, passing the wiring so that it knows which routes it should respond to, and which others it should merely ignore. Once that's out of the way, client-side routing would be set up.\n\n    As sugar coating on top of that, you may add client-side functionality using controllers. These controllers would be executed even if the view was rendered on the server-side. They can access the Taunus API directly, in case you need to navigate to another view in some way other than by having humans click on anchor tags. The API, as you'll learn, will also let you render partial views using the powerful Taunus engine, listen for events that may occur at key stages of the view-rendering process, and even intercept AJAX requests blocking them before they ever happen.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the Taunus CLI\n\n    Taunus comes with a CLI that can be used to wire your Node.js routes and views into the client-side. The same CLI can be used to wire up the client-side controllers as well. The main reason why the Taunus CLI exists is so that you don't have to `require` every single view and controller, undoing a lot of the work that was put into code reuse. Just like we did with `jadum` earlier, we'll install the `taunus` CLI globally for the sake of exercising, but we understand that relying on globally installed modules is insufficient for production-grade applications.\n\n    ```shell\n    npm install --global taunus\n    ```\n\n    Before you can use the CLI, you should move the route definitions to `controllers/routes.js`. That's where Taunus expects them to be. If you want to place them something else, [the API documentation can help you][18].\n\n    ```shell\n    mv routes.js controllers/routes.js\n    ```\n\n    Since you moved the routes you should also update the `require` statement in the `app.js` module.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    The CLI is terse in both its inputs and its outputs. If you run it without any arguments it'll print out the wiring module, and if you want to persist it you should provide the `--output` flag. In typical [convention-over-configuration][8] fashion, the CLI will default to inferring your views are located in `.bin/views` and that you want the wiring module to be placed in `.bin/wiring.js`, but you'll be able to change that if it doesn't meet your needs.\n\n    ```shell\n    taunus --output\n    ```\n\n    At this point in our example, the CLI should create a `.bin/wiring.js` file with the contents detailed below. As you can see, even if `taunus` is an automated code-generation tool, it's output is as human readable as any other module.\n\n    ```js\n    'use strict';\n\n    var templates = {\n      'home/index': require('./views/home/index.js'),\n      'layout': require('./views/layout.js')\n    };\n\n    var controllers = {\n    };\n\n    var routes = {\n      '/': {\n        action: 'home/index'\n      }\n    };\n\n    module.exports = {\n      templates: templates,\n      controllers: controllers,\n      routes: routes\n    };\n    ```\n\n    ![Screenshot with `taunus` output][37]\n\n    Note that the `controllers` object is empty because you haven't created any _client-side controllers_ yet. We created server-side controllers but those don't have any effect in the client-side, besides determining what gets sent to the client.\n\n    The CLI can be entirely ignored, you could write these definitions by yourself, but you would have to remember to update this file whenever you add, change, or remove a view, a client-side controller, or a route. Doing that would be cumbersome, and the CLI solves that problem for us at the expense of one additional build step.\n\n    During development, you can also add the `--watch` flag, which will rebuild the wiring module if a relevant file changes.\n\n    ```shell\n    taunus --output --watch\n    ```\n\n    If you're using Hapi instead of Express, you'll also need to pass in the `hapiify` transform so that routes get converted into something the client-side routing module understand.\n\n    ```shell\n    taunus --output --transform hapiify\n    ```\n\n    Now that you understand how to use the CLI or build the wiring module on your own, booting up Taunus on the client-side will be an easy thing to do!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Booting up the client-side router\n\n    Once we have the wiring module, booting up the client-side engine is pretty easy. Taunus suggests you use `client/js` to keep all of your client-side JavaScript logic, but that is up to you too. For the sake of this guide, let's stick to the conventions.\n\n    ```shell\n    mkdir -p client/js\n    touch client/js/main.js\n    ```\n\n    The `main` module will be used as the _entry point_ of your application on the client-side. Here you'll need to import `taunus`, the wiring module we've just built, and a reference to the DOM element where you are rendering your partial views. Once you have all that, you can invoke `taunus.mount`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var wiring = require('../../.bin/wiring');\n    var main = document.getElementsByTagName('main')[0];\n\n    taunus.mount(main, wiring);\n    ```\n\n    The mountpoint will set up the client-side Taunus router and fire the client-side view controller for the view that has been rendered in the server-side. Whenever an anchor link is clicked, Taunus will be able to hijack that click and request the model using AJAX, but only if it matches a view route. Otherwise the link will behave just like any normal link would.\n\n    By default, the mountpoint will issue an AJAX request for the view model of the server-side rendered view. This is akin to what dedicated client-side rendering frameworks such as AngularJS do, where views are only rendered after all the JavaScript has been downloaded, parsed, and executed. Except Taunus provides human-readable content faster, before the JavaScript even begins downloading, although it won't be functional until the client-side controller runs.\n\n    An alternative is to inline the view model alongside the views in a `<script type='text/taunus'>` tag, but this tends to slow down the initial response (models are _typically larger_ than the resulting views).\n\n    A third strategy is that you request the model asynchronously outside of Taunus, allowing you to fetch both the view model and Taunus itself concurrently, but that's harder to set up.\n\n    The three booting strategies are explained in [the API documentation][18] and further discussed in [the optimization guide][25]. For now, the default strategy _(`'auto'`)_ should suffice. It fetches the view model using an AJAX request right after Taunus loads.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Adding functionality in a client-side controller\n\n    Client-side controllers run whenever a view is rendered, even if it's a partial. The controller is passed the `model`, containing the model that was used to render the view; the `route`, broken down into its components; and the `container`, which is whatever DOM element the view was rendered into.\n\n    These controllers are entirely optional, which makes sense since we're progressively enhancing the application: it might not even be necessary! Let's add some client-side functionality to the example we've been building.\n\n    ```shell\n    mkdir -p client/js/controllers/home\n    touch client/js/controllers/home/index.js\n    ```\n\n    Guess what? The controller should be a module which exports a function. That function will be called whenever the view is rendered. For the sake of simplicity we'll just print the action and the model to the console. If there's one place where you'd want to enhance the experience, client-side controllers are where you want to put your code.\n\n    ```js\n    'use strict';\n\n    module.exports = function (model, container, route) {\n      console.log('Rendered view %s using model:\\n%s', route.action, JSON.stringify(model, null, 2));\n    };\n    ```\n\n    Since we weren't using the `--watch` flag from the Taunus CLI, you'll have to recompile the wiring at this point, so that the controller gets added to that manifest.\n\n    ```shell\n    taunus --output\n    ```\n\n    Of course, you'll now have to wire up the client-side JavaScript using [Browserify][38]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Compiling your client-side JavaScript\n\n    You'll need to compile the `client/js/main.js` module, our client-side application's entry point, using Browserify since the code is written using CommonJS. In this example you'll install `browserify` globally to compile the code, but naturally you'll install it locally when working on a real-world application.\n\n    ```shell\n    npm install --global browserify\n    ```\n\n    Once you have the Browserify CLI, you'll be able to compile the code right from your command line. The `-d` flag tells Browserify to add an inline source map into the compiled bundle, making debugging easier for us. The `-o` flag redirects output to the indicated file, whereas the output is printed to standard output by default.\n\n    ```shell\n    mkdir -p .bin/public/js\n    browserify client/js/main.js -do .bin/public/js/all.js\n    ```\n\n    We haven't done much of anything with the Express application, so you'll need to adjust the `app.js` module to serve static assets. If you're used to Express, you'll notice there's nothing special about how we're using `serve-static`.\n\n    ```shell\n    npm install --save serve-static\n    ```\n\n    Let's configure the application to serve static assets from `.bin/public`.\n\n    ```js\n    'use strict';\n\n    var taunus = require('taunus');\n    var taunusExpress = require('taunus-express');\n    var express = require('express');\n    var serveStatic = require('serve-static');\n    var app = express();\n    var options = {\n      routes: require('./controllers/routes'),\n      layout: require('./.bin/views/layout')\n    };\n\n    app.use(serveStatic('.bin/public'));\n    taunusExpress(taunus, app, options);\n    app.listen(3000);\n    ```\n\n    Next up, you'll have to edit the layout to include the compiled JavaScript bundle file.\n\n    ```jade\n    title=model.title\n    main!=partial\n    script(src='/js/all.js')\n    ```\n\n    Lastly, you can execute the application and see it in action!\n\n    ```shell\n    node app\n    ```\n\n    ![Screenshot with `node app` output][39]\n\n    If you open the application on a web browser, you'll notice that the appropriate information will be logged into the developer `console`.\n\n    ![Screenshot with the application running under Google Chrome][40]\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Using the client-side Taunus API\n\n    Taunus does provide [a thin API][18] in the client-side. Usage of that API belongs mostly inside the body of client-side view controllers, but there's a few methods you can take advantage of on a global scale as well.\n\n    Taunus can notify you whenever important events occur.\n\n    Event            | Arguments               | Description\n    -----------------|-------------------------|------------------------------------\n    `'start'`        | `container, model`      | Emitted when `taunus.mount` finished the route setup and is about to invoke the client-side controller. Subscribe to this event before calling `taunus.mount`.\n    `'render'`       | `container, model`      | A view has just been rendered and its client-side controller is about to be invoked\n    `'fetch.start'`  |  `route, context`       | Emitted whenever an XHR request starts.\n    `'fetch.done'`   |  `route, context, data` | Emitted whenever an XHR request ends successfully.\n    `'fetch.abort'`  |  `route, context`       | Emitted whenever an XHR request is purposely aborted.\n    `'fetch.error'`  |  `route, context, err`  | Emitted whenever an XHR request results in an HTTP error.\n\n    Besides events, there's a couple more methods you can use. The `taunus.navigate` method allows you to navigate to a URL without the need for a human to click on an anchor link. Then there's `taunus.partial`, and that allows you to render any partial view on a DOM element of your choosing, and it'll then invoke its controller. You'll need to come up with the model yourself, though.\n\n    Astonishingly, the API is further documented in [the API documentation][18].\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    #### Caching and Prefetching\n\n    [Performance][25] plays an important role in Taunus. That's why the you can perform caching and prefetching on the client-side just by turning on a pair of flags. But what do these flags do exactly?\n\n    When turned on, by passing `{ cache: true }` as the third parameter for `taunus.mount`, the caching layer will make sure that responses are kept around for `15` seconds. Whenever a route needs a model in order to render a view, it'll first ask the caching layer for a fresh copy. If the caching layer doesn't have a copy, or if that copy is stale _(in this case, older than `15` seconds)_, then an AJAX request will be issued to the server. Of course, the duration is configurable. If you want to use a value other than the default, you should set `cache` to a number in seconds instead of just `true`.\n\n    Since Taunus understands that not every view operates under the same constraints, you're also able to set a `cache` freshness duration directly in your routes. The `cache` property in routes has precedence over the default value.\n\n    There's currently two caching stores: a raw in-memory store, and an [IndexedDB][28] store. IndexedDB is an embedded database solution, and you can think of it like an asynchronous version of `localStorage`. It has [surprisingly broad browser support][29], and in the cases where it's not supported then caching is done solely in-memory.\n\n    The prefetching mechanism is an interesting spin-off of caching, and it requires caching to be enabled in order to work. Whenever humans hover over a link, or whenever they put their finger on one of them _(the `touchstart` event)_, the prefetcher will issue an AJAX request for the view model for that link.\n\n    If the request ends successfully then the response will be cached in the same way any other view would be cached. If the human hovers over another link while the previous one is still being prefetched, then the old request is aborted, as not to drain their _(possibly limited)_ Internet connection bandwidth.\n\n    If the human clicks on the link before prefetching is completed, he'll navigate to the view as soon as prefetching ends, rather than firing another request. This helps Taunus save precious milliseconds when dealing with latency-sensitive operations.\n\n    Turning prefetching on is simply a matter of setting `prefetch` to `true` in the options passed to `taunus.mount`. For additional insights into the performance improvements Taunus can offer, head over to the [Performance Optimizations][25] guide.\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    # The sky is the limit!\n\n    You're now familiar with how Taunus works on a high-level. You have covered a decent amount of ground, but you shouldn't stop there.\n\n    - Learn more about [the API Taunus has][18] to offer\n    - Go through the [performance optimization tips][25]. You may learn something new!\n    - _Familiarize yourself with the ways of progressive enhancement_\n      - Jeremy Keith enunciates [\"Be progressive\"][20]\n      - Christian Heilmann advocates for [\"Pragmatic progressive enhancement\"][26]\n      - Jake Archibald explains how [\"Progressive enhancement is faster\"][22]\n      - I blogged about how we should [\"Stop Breaking the Web\"][17]\n      - Guillermo Rauch argues for [\"7 Principles of Rich Web Applications\"][24]\n      - Aaron Gustafson writes [\"Understanding Progressive Enhancement\"][21]\n      - Orde Saunders gives his point of view in [\"Progressive enhancement for fault tolerance\"][23]\n    - Sift through the [complementary modules][15]. You may find something you hadn't thought of!\n\n    Also, get involved!\n\n    - Fork this repository and [send some pull requests][19] to improve these guides!\n    - See something, say something! If you detect a bug, [please create an issue][27]!\n\n    <sub>[_(back to table of contents)_](#table-of-contents)</sub>\n\n    [1]: https://github.com/taunus/taunus-express\n    [2]: https://github.com/taunus/taunus-hapi\n    [3]: https://github.com/taunus/hapiify\n    [4]: https://github.com/taunus/taunus.bevacqua.io\n    [5]: https://github.com/ponyfoo/ponyfoo\n    [6]: http://expressjs.com\n    [7]: http://hapijs.com\n    [8]: http://en.wikipedia.org/wiki/Convention_over_configuration\n    [9]: http://en.wikipedia.org/wiki/Ruby_on_Rails\n    [10]: https://github.com/janl/mustache.js\n    [11]: https://github.com/jadejs/jade\n    [12]: http://mozilla.github.io/nunjucks/\n    [13]: http://handlebarsjs.com/\n    [14]: http://www.embeddedjs.com/\n    [15]: /complements\n    [16]: https://github.com/bevacqua/jadum\n    [17]: http://ponyfoo.com/stop-breaking-the-web\n    [18]: /api\n    [19]: https://github.com/taunus/taunus.bevacqua.io/pulls\n    [20]: https://adactio.com/journal/7706\n    [21]: http://alistapart.com/article/understandingprogressiveenhancement\n    [22]: http://jakearchibald.com/2013/progressive-enhancement-is-faster/\n    [23]: https://decadecity.net/blog/2013/09/16/progressive-enhancement-for-fault-tolerance\n    [24]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [25]: /performance\n    [26]: http://icant.co.uk/articles/pragmatic-progressive-enhancement/\n    [27]: https://github.com/taunus/taunus/issues/new\n    [28]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API\n    [29]: http://caniuse.com/#feat=indexeddb\n    [30]: http://i.imgur.com/4P8vNe9.png\n    [31]: http://i.imgur.com/n8mH4mN.png\n    [32]: http://i.imgur.com/08lnCec.png\n    [33]: http://i.imgur.com/wUbnCyk.png\n    [34]: http://i.imgur.com/zjaJYCq.png\n    [35]: http://i.imgur.com/NvEWx9z.png\n    [36]: http://i.imgur.com/LgZRFn5.png\n    [37]: http://i.imgur.com/fJnHdYi.png\n    [38]: http://browserify.org/\n    [39]: http://i.imgur.com/68O84wX.png\n    [40]: http://i.imgur.com/ZUF6NFl.png\n");
}
}
},{"jadum/runtime":32}],10:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function performance(locals) {
var jade_debug = [{ lineno: 1, filename: "views/documentation/performance.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/documentation/performance.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/documentation/performance.jade" });
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 2, filename: "views/documentation/performance.jade" });
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Foo</p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Performance Optimization\n\n    Foo\n");
}
}
},{"jadum/runtime":32}],11:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function notFound(locals) {
var jade_debug = [{ lineno: 1, filename: "views/error/not-found.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined) {
jade_debug.unshift({ lineno: 0, filename: "views/error/not-found.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/error/not-found.jade" });
buf.push("<h1>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 1, filename: jade_debug[0].filename });
buf.push("Not Found");
jade_debug.shift();
jade_debug.shift();
buf.push("</h1>");
jade_debug.shift();
jade_debug.unshift({ lineno: 3, filename: "views/error/not-found.jade" });
buf.push("<p>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 3, filename: jade_debug[0].filename });
buf.push("There doesn't seem to be anything here yet. If you believe this to be a mistake, please let us know!");
jade_debug.shift();
jade_debug.shift();
buf.push("</p>");
jade_debug.shift();
jade_debug.unshift({ lineno: 4, filename: "views/error/not-found.jade" });
buf.push("<p>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 5, filename: "views/error/not-found.jade" });
buf.push("<a href=\"https://twitter.com/nzgb\" target=\"_blank\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 5, filename: jade_debug[0].filename });
buf.push("&mdash; @nzgb");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</p>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "h1 Not Found\n\np There doesn't seem to be anything here yet. If you believe this to be a mistake, please let us know!\np\n  a(href='https://twitter.com/nzgb', target='_blank') &mdash; @nzgb\n");
}
}
},{"jadum/runtime":32}],12:[function(require,module,exports){
var jade = require("jadum/runtime");
module.exports = function layout(locals) {
var jade_debug = [{ lineno: 1, filename: "views/layout.jade" }];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;
;var locals_for_with = (locals || {});(function (undefined, model, partial) {
jade_debug.unshift({ lineno: 0, filename: "views/layout.jade" });
jade_debug.unshift({ lineno: 1, filename: "views/layout.jade" });
buf.push("<!DOCTYPE html>");
jade_debug.shift();
jade_debug.unshift({ lineno: 2, filename: "views/layout.jade" });
buf.push("<html lang=\"en\" itemscope itemtype=\"http://schema.org/Blog\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 3, filename: "views/layout.jade" });
buf.push("<head>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 4, filename: "views/layout.jade" });
buf.push("<title>" + (jade.escape(null == (jade_interp = model.title) ? "" : jade_interp)));
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</title>");
jade_debug.shift();
jade_debug.unshift({ lineno: 5, filename: "views/layout.jade" });
buf.push("<meta charset=\"utf-8\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 6, filename: "views/layout.jade" });
buf.push("<link rel=\"shortcut icon\" href=\"/favicon.ico\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 7, filename: "views/layout.jade" });
buf.push("<meta http-equiv=\"X-UA-Compatible\" content=\"IE=edge,chrome=1\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 8, filename: "views/layout.jade" });
buf.push("<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 9, filename: "views/layout.jade" });
buf.push("<link rel=\"stylesheet\" type=\"text/css\" href=\"/css/all.css\">");
jade_debug.shift();
jade_debug.unshift({ lineno: 10, filename: "views/layout.jade" });
buf.push("<link rel=\"stylesheet\" type=\"text/css\" href=\"http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700\">");
jade_debug.shift();
jade_debug.shift();
buf.push("</head>");
jade_debug.shift();
jade_debug.unshift({ lineno: 12, filename: "views/layout.jade" });
buf.push("<body id=\"top\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 13, filename: "views/layout.jade" });
buf.push("<header>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 14, filename: "views/layout.jade" });
buf.push("<h1>");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 15, filename: "views/layout.jade" });
buf.push("<a href=\"/\" aria-label=\"Go to home\" class=\"ly-title\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 15, filename: jade_debug[0].filename });
buf.push("Taunus");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</h1>");
jade_debug.shift();
jade_debug.unshift({ lineno: 16, filename: "views/layout.jade" });
buf.push("<h2 class=\"ly-subheading\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 16, filename: jade_debug[0].filename });
buf.push("Micro Isomorphic MVC Engine for Node.js");
jade_debug.shift();
jade_debug.shift();
buf.push("</h2>");
jade_debug.shift();
jade_debug.shift();
buf.push("</header>");
jade_debug.shift();
jade_debug.unshift({ lineno: 18, filename: "views/layout.jade" });
buf.push("<aside class=\"sb-sidebar\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 19, filename: "views/layout.jade" });
buf.push("<nav class=\"sb-container\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 20, filename: "views/layout.jade" });
buf.push("<ul class=\"nv-items\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 21, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 22, filename: "views/layout.jade" });
buf.push("<a href=\"/\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 22, filename: jade_debug[0].filename });
buf.push("About");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 23, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 24, filename: "views/layout.jade" });
buf.push("<a href=\"/getting-started\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 24, filename: jade_debug[0].filename });
buf.push("Getting Started");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 25, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 26, filename: "views/layout.jade" });
buf.push("<a href=\"/api\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 26, filename: jade_debug[0].filename });
buf.push("API Documentation");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 27, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 28, filename: "views/layout.jade" });
buf.push("<a href=\"/complements\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 28, filename: jade_debug[0].filename });
buf.push("Complementary Modules");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 29, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 30, filename: "views/layout.jade" });
buf.push("<a href=\"/performance\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 30, filename: jade_debug[0].filename });
buf.push("Performance Optimization");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 31, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 32, filename: "views/layout.jade" });
buf.push("<a href=\"/source-code\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 32, filename: jade_debug[0].filename });
buf.push("Source Code");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.unshift({ lineno: 33, filename: "views/layout.jade" });
buf.push("<li class=\"nv-item\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 34, filename: "views/layout.jade" });
buf.push("<a href=\"/changelog\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.unshift({ lineno: 34, filename: jade_debug[0].filename });
buf.push("Changelog");
jade_debug.shift();
jade_debug.shift();
buf.push("</a>");
jade_debug.shift();
jade_debug.shift();
buf.push("</li>");
jade_debug.shift();
jade_debug.shift();
buf.push("</ul>");
jade_debug.shift();
jade_debug.shift();
buf.push("</nav>");
jade_debug.shift();
jade_debug.shift();
buf.push("</aside>");
jade_debug.shift();
jade_debug.unshift({ lineno: 36, filename: "views/layout.jade" });
buf.push("<main id=\"application-root\" data-taunus=\"model\" class=\"ly-main\">" + (null == (jade_interp = partial) ? "" : jade_interp));
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</main>");
jade_debug.shift();
jade_debug.unshift({ lineno: 37, filename: "views/layout.jade" });
buf.push("<script src=\"/js/all.js\">");
jade_debug.unshift({ lineno: undefined, filename: jade_debug[0].filename });
jade_debug.shift();
buf.push("</script>");
jade_debug.shift();
jade_debug.shift();
buf.push("</body>");
jade_debug.shift();
jade_debug.shift();
buf.push("</html>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined,"model" in locals_for_with?locals_for_with.model:typeof model!=="undefined"?model:undefined,"partial" in locals_for_with?locals_for_with.partial:typeof partial!=="undefined"?partial:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "doctype html\nhtml(lang='en', itemscope, itemtype='http://schema.org/Blog')\n  head\n    title=model.title\n    meta(charset='utf-8')\n    link(rel='shortcut icon', href='/favicon.ico')\n    meta(http-equiv='X-UA-Compatible', content='IE=edge,chrome=1')\n    meta(name='viewport', content='width=device-width, initial-scale=1')\n    link(rel='stylesheet', type='text/css', href='/css/all.css')\n    link(rel='stylesheet', type='text/css', href='http://fonts.googleapis.com/css?family=Unica+One:400|Playfair+Display:700|Megrim:700|Fauna+One:400italic,400,700')\n\n  body#top\n    header\n      h1\n        a.ly-title(href='/', aria-label='Go to home') Taunus\n      h2.ly-subheading Micro Isomorphic MVC Engine for Node.js\n\n    aside.sb-sidebar\n      nav.sb-container\n        ul.nv-items\n          li.nv-item\n            a(href='/') About\n          li.nv-item\n            a(href='/getting-started') Getting Started\n          li.nv-item\n            a(href='/api') API Documentation\n          li.nv-item\n            a(href='/complements') Complementary Modules\n          li.nv-item\n            a(href='/performance') Performance Optimization\n          li.nv-item\n            a(href='/source-code') Source Code\n          li.nv-item\n            a(href='/changelog') Changelog\n\n    main.ly-main#application-root(data-taunus='model')!=partial\n    script(src='/js/all.js')\n");
}
}
},{"jadum/runtime":32}],13:[function(require,module,exports){
'use strict';

var templates = {
  'documentation/about': require('./views/documentation/about.js'),
  'documentation/api': require('./views/documentation/api.js'),
  'documentation/complements': require('./views/documentation/complements.js'),
  'documentation/getting-started': require('./views/documentation/getting-started.js'),
  'documentation/performance': require('./views/documentation/performance.js'),
  'error/not-found': require('./views/error/not-found.js'),
  'layout': require('./views/layout.js')
};

var controllers = {
  'documentation/about': require('../client/js/controllers/documentation/about.js')
};

var routes = {
  '/': {
    action: 'documentation/about'
  },
  '/getting-started': {
    action: 'documentation/getting-started'
  },
  '/api': {
    action: 'documentation/api'
  },
  '/complements': {
    action: 'documentation/complements'
  },
  '/performance': {
    action: 'documentation/performance'
  },
  '/source-code': {
    ignore: true
  },
  '/changelog': {
    ignore: true
  },
  '/:catchall*': {
    action: 'error/not-found'
  }
};

module.exports = {
  templates: templates,
  controllers: controllers,
  routes: routes
};

},{"../client/js/controllers/documentation/about.js":14,"./views/documentation/about.js":6,"./views/documentation/api.js":7,"./views/documentation/complements.js":8,"./views/documentation/getting-started.js":9,"./views/documentation/performance.js":10,"./views/error/not-found.js":11,"./views/layout.js":12}],14:[function(require,module,exports){
'use strict';

module.exports = function () {
  console.log('Welcome to Taunus documentation mini-site!');
};

},{}],15:[function(require,module,exports){
'use strict';

var $ = require('dominus');
var raf = require('raf');
var sidebar = $('.sb-sidebar');
var throttle = require('./throttle');
var slowScrollCheck = throttle(scrollCheck, 200);
var heading;
var tracking;

raf(scroll);

function conventions (container) {
  tracking = $(container).find('#table-of-contents').length;
}

function scroll () {
  slowScrollCheck();
  raf(scroll);
}

function scrollCheck () {
  if (!tracking) {
    return;
  }
  var found = $('main').find('h1,h2,h3,h4,h5,h6').filter(inViewport);
  if (found.length === 0 || found[0] === heading) {
    return;
  }
  heading = found[0];
  set('#' + heading.id);
}

function inViewport (element) {
  var rect = element.getBoundingClientRect();
  var viewable = (
    Math.ceil(rect.top) >= 0 &&
    Math.ceil(rect.left) >= 0 &&
    Math.floor(rect.bottom) <= (window.innerHeight || document.documentElement.clientHeight) &&
    Math.floor(rect.right) <= (window.innerWidth || document.documentElement.clientWidth)
  );
  return viewable;
}

function set (hash) {
  if (history.pushState) {
    history.pushState(null, null, hash);
  }
}

module.exports = conventions;

},{"./throttle":17,"dominus":26,"raf":33}],16:[function(require,module,exports){
(function (global){
'use strict';

// import the taunus module
var taunus = require('taunus');

// import the wiring module exported by Taunus
var wiring = require('../../.bin/wiring');

// import conventions
var conventions = require('./conventions');

// get the <main> element
var main = document.getElementById('application-root');

// set up conventions that get executed for every view
taunus.on('render', conventions);

// mount taunus so it starts its routing engine
taunus.mount(main, wiring);

// make $ a global to make it easy to debug!
global.$ = require('dominus');

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../../.bin/wiring":13,"./conventions":15,"dominus":26,"taunus":42}],17:[function(require,module,exports){
(function (global){
'use strict';

function throttle (fn, t) {
  var cache;
  var last = -1;
  return function throttled () {
    var now = Date.now();
    if (now - last > t) {
      cache = fn.apply(this, arguments);
      last = now;
    }
    return cache;
  };
}

module.exports = throttle;
global.throttle=throttle;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],18:[function(require,module,exports){
var poser = require('./src/node');

module.exports = poser;

['Array', 'Function', 'Object', 'Date', 'String'].forEach(pose);

function pose (type) {
  poser[type] = function poseComputedType () { return poser(type); };
}

},{"./src/node":19}],19:[function(require,module,exports){
(function (global){
'use strict';

var d = global.document;

function poser (type) {
  var iframe = d.createElement('iframe');

  iframe.style.display = 'none';
  d.body.appendChild(iframe);

  return map(type, iframe.contentWindow);
}

function map (type, source) { // forward polyfills to the stolen reference!
  var original = window[type].prototype;
  var value = source[type];
  var prop;

  for (prop in original) {
    value.prototype[prop] = original[prop];
  }

  return value;
}

module.exports = poser;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],20:[function(require,module,exports){
(function (global){
'use strict';

var expando = 'sektor-' + Date.now();
var rsiblings = /[+~]/;
var document = global.document;
var del = document.documentElement;
var match = del.matches ||
            del.webkitMatchesSelector ||
            del.mozMatchesSelector ||
            del.oMatchesSelector ||
            del.msMatchesSelector;

function qsa (selector, context) {
  var existed, id, prefix, prefixed, adapter, hack = context !== document;
  if (hack) { // id hack for context-rooted queries
    existed = context.getAttribute('id');
    id = existed || expando;
    prefix = '#' + id + ' ';
    prefixed = prefix + selector.replace(/,/g, ',' + prefix);
    adapter = rsiblings.test(selector) && context.parentNode;
    if (!existed) { context.setAttribute('id', id); }
  }
  try {
    return (adapter || context).querySelectorAll(prefixed || selector);
  } catch (e) {
    return [];
  } finally {
    if (existed === null) { context.removeAttribute('id'); }
  }
}

function find (selector, ctx, collection, seed) {
  var element;
  var context = ctx || document;
  var results = collection || [];
  var i = 0;
  if (typeof selector !== 'string') {
    return results;
  }
  if (context.nodeType !== 1 && context.nodeType !== 9) {
    return []; // bail if context is not an element or document
  }
  if (seed) {
    while ((element = seed[i++])) {
      if (matchesSelector(element, selector)) {
        results.push(element);
      }
    }
  } else {
    results.push.apply(results, qsa(selector, context));
  }
  return results;
}

function matches (selector, elements) {
  return find(selector, null, null, elements);
}

function matchesSelector (element, selector) {
  return match.call(element, selector);
}

module.exports = find;

find.matches = matches;
find.matchesSelector = matchesSelector;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],21:[function(require,module,exports){
'use strict';

var poser = require('poser');
var Dominus = poser.Array();

module.exports = Dominus;

},{"poser":18}],22:[function(require,module,exports){
'use strict';

var $ = require('./public');
var core = require('./core');
var dom = require('./dom');
var classes = require('./classes');
var Dominus = require('./Dominus.ctor');

function equals (selector) {
  return function equals (elem) {
    return dom.matches(elem, selector);
  };
}

function straight (prop, one) {
  return function domMapping (selector) {
    var result = this.map(function (elem) {
      return dom[prop](elem, selector);
    });
    var results = core.flatten(result);
    return one ? results[0] : results;
  };
}

Dominus.prototype.prev = straight('prev');
Dominus.prototype.next = straight('next');
Dominus.prototype.parent = straight('parent');
Dominus.prototype.parents = straight('parents');
Dominus.prototype.children = straight('children');
Dominus.prototype.find = straight('qsa');
Dominus.prototype.findOne = straight('qs', true);

Dominus.prototype.where = function (selector) {
  return this.filter(equals(selector));
};

Dominus.prototype.is = function (selector) {
  return this.some(equals(selector));
};

Dominus.prototype.i = function (index) {
  return new Dominus(this[index]);
};

function compareFactory (fn) {
  return function compare () {
    $.apply(null, arguments).forEach(fn, this);
    return this;
  };
}

Dominus.prototype.and = compareFactory(function addOne (elem) {
  if (this.indexOf(elem) === -1) {
    this.push(elem);
  }
  return this;
});

Dominus.prototype.but = compareFactory(function addOne (elem) {
  var index = this.indexOf(elem);
  if (index !== -1) {
    this.splice(index, 1);
  }
  return this;
});

Dominus.prototype.on = function (types, filter, fn) {
  this.forEach(function (elem) {
    types.split(' ').forEach(function (type) {
      dom.on(elem, type, filter, fn);
    });
  });
  return this;
};

Dominus.prototype.off = function (types, filter, fn) {
  this.forEach(function (elem) {
    types.split(' ').forEach(function (type) {
      dom.off(elem, type, filter, fn);
    });
  });
  return this;
};

[
  ['addClass', classes.add],
  ['removeClass', classes.remove],
  ['setClass', classes.set],
  ['removeClass', classes.remove],
  ['remove', dom.remove]
].forEach(mapMethods);

function mapMethods (data) {
  Dominus.prototype[data[0]] = function (value) {
    this.forEach(function (elem) {
      data[1](elem, value);
    });
    return this;
  };
}

[
  ['append', dom.append],
  ['appendTo', dom.appendTo],
  ['prepend', dom.prepend],
  ['prependTo', dom.prependTo],
  ['before', dom.before],
  ['beforeOf', dom.beforeOf],
  ['after', dom.after],
  ['afterOf', dom.afterOf],
  ['show', dom.show],
  ['hide', dom.hide]
].forEach(mapManipulation);

function mapManipulation (data) {
  Dominus.prototype[data[0]] = function (value) {
    data[1](this, value);
    return this;
  };
}

Dominus.prototype.hasClass = function (value) {
  return this.some(function (elem) {
    return classes.contains(elem, value);
  });
};

Dominus.prototype.attr = function (name, value) {
  var getter = arguments.length < 2;
  var result = this.map(function (elem) {
    return getter ? dom.attr(elem, name) : dom.attr(elem, name, value);
  });
  return getter ? result[0] : this;
};

function keyValue (key, value) {
  var getter = arguments.length < 2;
  if (getter) {
    return this.length ? dom[key](this[0]) : '';
  }
  this.forEach(function (elem) {
    dom[key](elem, value);
  });
  return this;
}

function keyValueProperty (prop) {
  Dominus.prototype[prop] = function accessor (value) {
    var getter = arguments.length < 1;
    if (getter) {
      return keyValue.call(this, prop);
    }
    return keyValue.call(this, prop, value);
  };
}

['html', 'text', 'value'].forEach(keyValueProperty);

Dominus.prototype.clone = function () {
  return this.map(function (elem) {
    return dom.clone(elem);
  });
};

module.exports = require('./public');

},{"./Dominus.ctor":21,"./classes":23,"./core":24,"./dom":25,"./public":28}],23:[function(require,module,exports){
'use strict';

var trim = /^\s+|\s+$/g;
var whitespace = /\s+/g;

function interpret (input) {
  return typeof input === 'string' ? input.replace(trim, '').split(whitespace) : input;
}

function classes (node) {
  return node.className.replace(trim, '').split(whitespace);
}

function set (node, input) {
  node.className = interpret(input).join(' ');
}

function add (node, input) {
  var current = remove(node, input);
  var values = interpret(input);
  current.push.apply(current, values);
  set(node, current);
  return current;
}

function remove (node, input) {
  var current = classes(node);
  var values = interpret(input);
  values.forEach(function (value) {
    var i = current.indexOf(value);
    if (i !== -1) {
      current.splice(i, 1);
    }
  });
  set(node, current);
  return current;
}

function contains (node, input) {
  var current = classes(node);
  var values = interpret(input);

  return values.every(function (value) {
    return current.indexOf(value) !== -1;
  });
}

module.exports = {
  add: add,
  remove: remove,
  contains: contains,
  set: set,
  get: classes
};

},{}],24:[function(require,module,exports){
'use strict';

var test = require('./test');
var Dominus = require('./Dominus.ctor');
var proto = Dominus.prototype;

function Applied (args) {
  return Dominus.apply(this, args);
}

Applied.prototype = proto;

['map', 'filter', 'concat'].forEach(ensure);

function ensure (key) {
  var original = proto[key];
  proto[key] = function applied () {
    return apply(original.apply(this, arguments));
  };
}

function apply (a) {
  return new Applied(a);
}

function cast (a) {
  if (a instanceof Dominus) {
    return a;
  }
  if (!a) {
    return new Dominus();
  }
  if (test.isElement(a)) {
    return new Dominus(a);
  }
  if (!test.isArray(a)) {
    return new Dominus();
  }
  return apply(a).filter(function (i) {
    return test.isElement(i);
  });
}

function flatten (a, cache) {
  return a.reduce(function (current, item) {
    if (Dominus.isArray(item)) {
      return flatten(item, current);
    } else if (current.indexOf(item) === -1) {
      return current.concat(item);
    }
    return current;
  }, cache || new Dominus());
}

module.exports = {
  apply: apply,
  cast: cast,
  flatten: flatten
};

},{"./Dominus.ctor":21,"./test":29}],25:[function(require,module,exports){
'use strict';

var sektor = require('sektor');
var Dominus = require('./Dominus.ctor');
var core = require('./core');
var events = require('./events');
var text = require('./text');
var test = require('./test');
var api = module.exports = {};
var delegates = {};

function castContext (context) {
  if (typeof context === 'string') {
    return api.qs(null, context);
  }
  if (test.isElement(context)) {
    return context;
  }
  if (context instanceof Dominus) {
    return context[0];
  }
  return null;
}

api.qsa = function (elem, selector) {
  var results = new Dominus();
  return sektor(selector, castContext(elem), results);
};

api.qs = function (elem, selector) {
  return api.qsa(elem, selector)[0];
};

api.matches = function (elem, selector) {
  return sektor.matchesSelector(elem, selector);
};

function relatedFactory (prop) {
  return function related (elem, selector) {
    var relative = elem[prop];
    if (relative) {
      if (!selector || api.matches(relative, selector)) {
        return core.cast(relative);
      }
    }
    return new Dominus();
  };
}

api.prev = relatedFactory('previousSibling');
api.next = relatedFactory('nextSibling');
api.parent = relatedFactory('parentElement');

function matches (elem, value) {
  if (!value) {
    return true;
  }
  if (value instanceof Dominus) {
    return value.indexOf(elem) !== -1;
  }
  if (test.isElement(value)) {
    return elem === value;
  }
  return api.matches(elem, value);
}

api.parents = function (elem, value) {
  var nodes = [];
  var node = elem;
  while (node.parentElement) {
    if (matches(node.parentElement, value)) {
      nodes.push(node.parentElement);
    }
    node = node.parentElement;
  }
  return core.apply(nodes);
};

api.children = function (elem, value) {
  var nodes = [];
  var children = elem.children;
  var child;
  var i;
  for (i = 0; i < children.length; i++) {
    child = children[i];
    if (matches(child, value)) {
      nodes.push(child);
    }
  }
  return core.apply(nodes);
};

// this method caches delegates so that .off() works seamlessly
function delegate (root, filter, fn) {
  if (delegates[fn._dd]) {
    return delegates[fn._dd];
  }
  fn._dd = Date.now();
  delegates[fn._dd] = delegator;
  function delegator (e) {
    var elem = e.target;
    while (elem && elem !== root) {
      if (api.matches(elem, filter)) {
        fn.apply(this, arguments); return;
      }
      elem = elem.parentElement;
    }
  }
  return delegator;
}

api.on = function (elem, type, filter, fn) {
  if (fn === void 0) {
    events.add(elem, type, filter); // filter _is_ fn
  } else {
    events.add(elem, type, delegate(elem, filter, fn));
  }
};

api.off = function (elem, type, filter, fn) {
  if (fn === void 0) {
    events.remove(elem, type, filter); // filter _is_ fn
  } else {
    events.remove(elem, type, delegate(elem, filter, fn));
  }
};

api.html = function (elem, html) {
  var getter = arguments.length < 2;
  if (getter) {
    return elem.innerHTML;
  } else {
    elem.innerHTML = html;
  }
};

api.text = function (elem, text) {
  var checkable = test.isCheckable(elem);
  var getter = arguments.length < 2;
  if (getter) {
    return checkable ? elem.value : elem.innerText || elem.textContent;
  } else if (checkable) {
    elem.value = text;
  } else {
    elem.innerText = elem.textContent = text;
  }
};

api.value = function (elem, value) {
  var checkable = test.isCheckable(elem);
  var getter = arguments.length < 2;
  if (getter) {
    return checkable ? elem.checked : elem.value;
  } else if (checkable) {
    elem.checked = value;
  } else {
    elem.value = value;
  }
};

api.attr = function (elem, name, value) {
  var getter = arguments.length < 3;
  var camel = text.hyphenToCamel(name);
  if (getter) {
    if (camel in elem) {
      return elem[camel];
    } else {
      return elem.getAttribute(name, value);
    }
  }
  if (camel in elem) {
    elem[camel] = value;
  } else if (value === null || value === void 0) {
    elem.removeAttribute(name);
  } else {
    elem.setAttribute(name, value);
  }
};

api.make = function (type) {
  return new Dominus(document.createElement(type));
};

api.clone = function (elem) {
  return elem.cloneNode(true);
};

api.remove = function (elem) {
  if (elem.parentElement) {
    elem.parentElement.removeChild(elem);
  }
};

api.append = function (elem, target) {
  if (manipulationGuard(elem, target, api.append)) {
    return;
  }
  elem.appendChild(target);
};

api.prepend = function (elem, target) {
  if (manipulationGuard(elem, target, api.prepend)) {
    return;
  }
  elem.insertBefore(target, elem.firstChild);
};

api.before = function (elem, target) {
  if (manipulationGuard(elem, target, api.before)) {
    return;
  }
  if (elem.parentElement) {
    elem.parentElement.insertBefore(target, elem);
  }
};

api.after = function (elem, target) {
  if (manipulationGuard(elem, target, api.after)) {
    return;
  }
  if (elem.parentElement) {
    elem.parentElement.insertBefore(target, elem.nextSibling);
  }
};

function manipulationGuard (elem, target, fn) {
  var right = target instanceof Dominus;
  var left = elem instanceof Dominus;
  if (left) {
    elem.forEach(manipulateMany);
  } else if (right) {
    manipulate(elem, true);
  }
  return left || right;

  function manipulate (elem, precondition) {
    if (right) {
      target.forEach(function (target, j) {
        fn(elem, cloneUnless(target, precondition && j === 0));
      });
    } else {
      fn(elem, cloneUnless(target, precondition));
    }
  }

  function manipulateMany (elem, i) {
    manipulate(elem, i === 0);
  }
}

function cloneUnless (target, condition) {
  return condition ? target : api.clone(target);
}

['appendTo', 'prependTo', 'beforeOf', 'afterOf'].forEach(flip);

function flip (key) {
  var original = key.split(/[A-Z]/)[0];
  api[key] = function (elem, target) {
    api[original](target, elem);
  };
}

api.show = function (elem, should, invert) {
  if (elem instanceof Dominus) {
    elem.forEach(showTest);
  } else {
    showTest(elem);
  }

  function showTest (current) {
    var ok = should === void 0 || should === true || typeof should === 'function' && should.call(current);
    display(current, invert ? !ok : ok);
  }
};

api.hide = function (elem, should) {
  api.show(elem, should, true);
};

function display (elem, should) {
  if (should) {
    elem.style.display = 'block';
  } else {
    elem.style.display = 'none';
  }
}

},{"./Dominus.ctor":21,"./core":24,"./events":27,"./test":29,"./text":30,"sektor":20}],26:[function(require,module,exports){
'use strict';

module.exports = require('./Dominus.prototype');

},{"./Dominus.prototype":22}],27:[function(require,module,exports){
'use strict';

var addEvent = addEventEasy;
var removeEvent = removeEventEasy;
var hardCache = [];

if (!window.addEventListener) {
  addEvent = addEventHard;
}

if (!window.removeEventListener) {
  removeEvent = removeEventHard;
}

function addEventEasy (element, evt, fn) {
  return element.addEventListener(evt, fn);
}

function addEventHard (element, evt, fn) {
  return element.attachEvent('on' + evt, wrap(element, evt, fn));
}

function removeEventEasy (element, evt, fn) {
  return element.removeEventListener(evt, fn);
}

function removeEventHard (element, evt, fn) {
  return element.detachEvent('on' + evt, unwrap(element, evt, fn));
}

function wrapperFactory (element, evt, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || window.event;
    e.target = e.target || e.srcElement;
    e.preventDefault  = e.preventDefault  || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    fn.call(element, e);
  };
}

function wrap (element, evt, fn) {
  var wrapper = unwrap(element, evt, fn) || wrapperFactory(element, evt, fn);
  hardCache.push({
    wrapper: wrapper,
    element: element,
    evt: evt,
    fn: fn
  });
  return wrapper;
}

function unwrap (element, evt, fn) {
  var i = find(element, evt, fn);
  if (i) {
    var wrapper = hardCache[i].wrapper;
    hardCache.splice(i, 1); // free up a tad of memory
    return wrapper;
  }
}

function find (element, evt, fn) {
  var i, item;
  for (i = 0; i < hardCache.length; i++) {
    item = hardCache[i];
    if (item.element === element && item.evt === evt && item.fn === fn) {
      return i;
    }
  }
}

module.exports = {
  add: addEvent,
  remove: removeEvent
};

},{}],28:[function(require,module,exports){
'use strict';

var dom = require('./dom');
var core = require('./core');
var Dominus = require('./Dominus.ctor');
var tag = /^\s*<([a-z]+(?:-[a-z]+)?)\s*\/?>\s*$/i;

function api (selector, context) {
  var notText = typeof selector !== 'string';
  if (notText && arguments.length < 2) {
    return core.cast(selector);
  }
  if (notText) {
    return new Dominus();
  }
  var matches = selector.match(tag);
  if (matches) {
    return dom.make(matches[1]);
  }
  return api.find(selector, context);
}

api.find = function (selector, context) {
  return dom.qsa(context, selector);
};

api.findOne = function (selector, context) {
  return dom.qs(context, selector);
};

module.exports = api;

},{"./Dominus.ctor":21,"./core":24,"./dom":25}],29:[function(require,module,exports){
'use strict';

var nodeObjects = typeof Node === 'object';
var elementObjects = typeof HTMLElement === 'object';

function isNode (o) {
  return nodeObjects ? o instanceof Node : isNodeObject(o);
}

function isNodeObject (o) {
  return o &&
    typeof o === 'object' &&
    typeof o.nodeName === 'string' &&
    typeof o.nodeType === 'number';
}

function isElement (o) {
  return elementObjects ? o instanceof HTMLElement : isElementObject(o);
}

function isElementObject (o) {
  return o &&
    typeof o === 'object' &&
    typeof o.nodeName === 'string' &&
    o.nodeType === 1;
}

function isArray (a) {
  return Object.prototype.toString.call(a) === '[object Array]';
}

function isCheckable (elem) {
  return 'checked' in elem && elem.type === 'radio' || elem.type === 'checkbox';
}

module.exports = {
  isNode: isNode,
  isElement: isElement,
  isArray: isArray,
  isCheckable: isCheckable
};

},{}],30:[function(require,module,exports){
'use strict';

function hyphenToCamel (hyphens) {
  var part = /-([a-z])/g;
  return hyphens.replace(part, function (g, m) {
    return m.toUpperCase();
  });
}

module.exports = {
  hyphenToCamel: hyphenToCamel
};

},{}],31:[function(require,module,exports){
(function (global){
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.jade=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
'use strict';

/**
 * Merge two attribute objects giving precedence
 * to values in object `b`. Classes are special-cased
 * allowing for arrays and merging/joining appropriately
 * resulting in a string.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Object} a
 * @api private
 */

exports.merge = function merge(a, b) {
  if (arguments.length === 1) {
    var attrs = a[0];
    for (var i = 1; i < a.length; i++) {
      attrs = merge(attrs, a[i]);
    }
    return attrs;
  }
  var ac = a['class'];
  var bc = b['class'];

  if (ac || bc) {
    ac = ac || [];
    bc = bc || [];
    if (!Array.isArray(ac)) ac = [ac];
    if (!Array.isArray(bc)) bc = [bc];
    a['class'] = ac.concat(bc).filter(nulls);
  }

  for (var key in b) {
    if (key != 'class') {
      a[key] = b[key];
    }
  }

  return a;
};

/**
 * Filter null `val`s.
 *
 * @param {*} val
 * @return {Boolean}
 * @api private
 */

function nulls(val) {
  return val != null && val !== '';
}

/**
 * join array as classes.
 *
 * @param {*} val
 * @return {String}
 */
exports.joinClasses = joinClasses;
function joinClasses(val) {
  return Array.isArray(val) ? val.map(joinClasses).filter(nulls).join(' ') : val;
}

/**
 * Render the given classes.
 *
 * @param {Array} classes
 * @param {Array.<Boolean>} escaped
 * @return {String}
 */
exports.cls = function cls(classes, escaped) {
  var buf = [];
  for (var i = 0; i < classes.length; i++) {
    if (escaped && escaped[i]) {
      buf.push(exports.escape(joinClasses([classes[i]])));
    } else {
      buf.push(joinClasses(classes[i]));
    }
  }
  var text = joinClasses(buf);
  if (text.length) {
    return ' class="' + text + '"';
  } else {
    return '';
  }
};

/**
 * Render the given attribute.
 *
 * @param {String} key
 * @param {String} val
 * @param {Boolean} escaped
 * @param {Boolean} terse
 * @return {String}
 */
exports.attr = function attr(key, val, escaped, terse) {
  if ('boolean' == typeof val || null == val) {
    if (val) {
      return ' ' + (terse ? key : key + '="' + key + '"');
    } else {
      return '';
    }
  } else if (0 == key.indexOf('data') && 'string' != typeof val) {
    return ' ' + key + "='" + JSON.stringify(val).replace(/'/g, '&apos;') + "'";
  } else if (escaped) {
    return ' ' + key + '="' + exports.escape(val) + '"';
  } else {
    return ' ' + key + '="' + val + '"';
  }
};

/**
 * Render the given attributes object.
 *
 * @param {Object} obj
 * @param {Object} escaped
 * @return {String}
 */
exports.attrs = function attrs(obj, terse){
  var buf = [];

  var keys = Object.keys(obj);

  if (keys.length) {
    for (var i = 0; i < keys.length; ++i) {
      var key = keys[i]
        , val = obj[key];

      if ('class' == key) {
        if (val = joinClasses(val)) {
          buf.push(' ' + key + '="' + val + '"');
        }
      } else {
        buf.push(exports.attr(key, val, false, terse));
      }
    }
  }

  return buf.join('');
};

/**
 * Escape the given string of `html`.
 *
 * @param {String} html
 * @return {String}
 * @api private
 */

exports.escape = function escape(html){
  var result = String(html)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (result === '' + html) return html;
  else return result;
};

/**
 * Re-throw the given `err` in context to the
 * the jade in `filename` at the given `lineno`.
 *
 * @param {Error} err
 * @param {String} filename
 * @param {String} lineno
 * @api private
 */

exports.rethrow = function rethrow(err, filename, lineno, str){
  if (!(err instanceof Error)) throw err;
  if ((typeof window != 'undefined' || !filename) && !str) {
    err.message += ' on line ' + lineno;
    throw err;
  }
  try {
    str = str || _dereq_('fs').readFileSync(filename, 'utf8')
  } catch (ex) {
    rethrow(err, null, lineno)
  }
  var context = 3
    , lines = str.split('\n')
    , start = Math.max(lineno - context, 0)
    , end = Math.min(lines.length, lineno + context);

  // Error context
  var context = lines.slice(start, end).map(function(line, i){
    var curr = i + start + 1;
    return (curr == lineno ? '  > ' : '    ')
      + curr
      + '| '
      + line;
  }).join('\n');

  // Alter exception message
  err.path = filename;
  err.message = (filename || 'Jade') + ':' + lineno
    + '\n' + context + '\n\n' + err.message;
  throw err;
};

},{"fs":2}],2:[function(_dereq_,module,exports){

},{}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],32:[function(require,module,exports){
module.exports = require('jade/runtime');

},{"jade/runtime":31}],33:[function(require,module,exports){
var now = require('performance-now')
  , global = typeof window === 'undefined' ? {} : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = global['request' + suffix]
  , caf = global['cancel' + suffix] || global['cancelRequest' + suffix]
  , isNative = true

for(var i = 0; i < vendors.length && !raf; i++) {
  raf = global[vendors[i] + 'Request' + suffix]
  caf = global[vendors[i] + 'Cancel' + suffix]
      || global[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  isNative = false

  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  if(!isNative) {
    return raf.call(global, fn)
  }
  return raf.call(global, function() {
    try{
      fn.apply(this, arguments)
    } catch(e) {
      setTimeout(function() { throw e }, 0)
    }
  })
}
module.exports.cancel = function() {
  caf.apply(global, arguments)
}

},{"performance-now":34}],34:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.6.3
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

/*
//@ sourceMappingURL=performance-now.map
*/

}).call(this,require("/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],35:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var fetcher = require('./fetcher');
var partial = require('./partial');
var router = require('./router');
var state = require('./state');
var isNative = require('./isNative');
var modern = 'history' in window && 'pushState' in history;

// Google Chrome 38 on iOS makes weird changes to history.replaceState, breaking it
var nativeReplace = modern && isNative(window.history.replaceState);

function go (url, o) {
  var options = o || {};
  var context = options.context || null;

  if (!modern) {
    location.href = url; return;
  }

  var route = router(url);
  if (!route) {
    location.href = url; return;
  }

  fetcher.abortPending();
  fetcher(route, { element: context, source: 'intent' }, resolved);

  function resolved (err, model) {
    if (err) {
      return;
    }
    navigation(route, model, 'pushState');
    partial(state.container, null, model, route);
  }
}

function start (model) {
  var route = replaceWith(model);
  emitter.emit('start', state.container, model);
  partial(state.container, null, model, route, { render: false });
  window.onpopstate = back;
}

function back (e) {
  var empty = !(e && e.state && e.state.model);
  if (empty) {
    return;
  }
  var model = e.state.model;
  var route = replaceWith(model);
  partial(state.container, null, model, route);
}

function replaceWith (model) {
  var url = location.pathname;
  var query = orEmpty(location.search) + orEmpty(location.hash);
  var route = router(url + query);
  navigation(route, model, 'replaceState');
  return route;
}

function orEmpty (value) {
  return value || '';
}

function navigation (route, model, direction) {
  state.model = model;
  if (model.title) {
    document.title = model.title;
  }
  if (modern && direction !== 'replaceState' || nativeReplace) {
    history[direction]({ model: model }, model.title, route.url);
  }
}

module.exports = {
  start: start,
  go: go
};

},{"./emitter":38,"./fetcher":40,"./isNative":44,"./partial":48,"./router":49,"./state":50}],36:[function(require,module,exports){
'use strict';

var once = require('./once');
var raw = require('./stores/raw');
var idb = require('./stores/idb');
var stores = [raw, idb];

function clone (value) {
  return JSON.parse(JSON.stringify(value));
}

function get (url, done) {
  var i = 0;

  function next () {
    var gotOnce = once(got);
    var store = stores[i++];
    if (store) {
      store.get(url, gotOnce);
      setTimeout(gotOnce, store === idb ? 100 : 50); // at worst, spend 150ms on caching layers
    } else {
      done(true);
    }

    function got (err, item) {
      if (err) {
        next();
      } else if (item && typeof item.expires === 'number' && Date.now() < item.expires) {
        done(false, clone(item.data)); // always return a unique copy
      } else {
        next();
      }
    }
  }

  next();
}

function set (url, data, duration) {
  if (duration < 1) { // sanity
    return;
  }
  var cloned = clone(data); // freeze a copy for our records
  stores.forEach(store);
  function store (s) {
    s.set(url, {
      data: cloned,
      expires: Date.now() + duration
    });
  }
}

module.exports = {
  get: get,
  set: set
};

},{"./once":47,"./stores/idb":51,"./stores/raw":52}],37:[function(require,module,exports){
'use strict';

var cache = require('./cache');
var idb = require('./stores/idb');
var state = require('./state');
var emitter = require('./emitter');
var interceptor = require('./interceptor');
var defaults = 15;
var baseline;

function e (value) {
  return value || '';
}

function setup (duration, route) {
  baseline = parseDuration(duration);
  if (baseline < 1) {
    state.cache = false;
    return;
  }
  interceptor.add(intercept);
  emitter.on('fetch.done', persist);
  state.cache = true;
}

function intercept (e) {
  cache.get(e.url, result);

  function result (err, data) {
    if (!err && data) {
      e.preventDefault(data);
    }
  }
}

function parseDuration (value) {
  if (value === true) {
    return baseline || defaults;
  }
  if (typeof value === 'number') {
    return value;
  }
  return 0;
}

function persist (route, context, data) {
  if (!state.cache) {
    return;
  }
  if (route.cache === false) {
    return;
  }
  var d = baseline;
  if (typeof route.cache === 'number') {
    d = route.cache;
  }
  var key = route.parts.pathname + e(route.parts.query);
  cache.set(key, data, parseDuration(d) * 1000);
}

function ready (fn) {
  if (state.cache) {
    idb.tested(fn); // wait on idb compatibility tests
  } else {
    fn(); // caching is a no-op
  }
}

module.exports = {
  setup: setup,
  persist: persist,
  ready: ready
};

},{"./cache":36,"./emitter":38,"./interceptor":43,"./state":50,"./stores/idb":51}],38:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');

module.exports = emitter({}, { throws: false });

},{"contra.emitter":55}],39:[function(require,module,exports){
'use strict';

function add (element, type, fn) {
  if (element.addEventListener) {
    element.addEventListener(type, fn);
  } else if (element.attachEvent) {
    element.attachEvent('on' + type, wrapperFactory(element, fn));
  } else {
    element['on' + type] = fn;
  }
}

function wrapperFactory (element, fn) {
  return function wrapper (originalEvent) {
    var e = originalEvent || window.event;
    e.target = e.target || e.srcElement;
    e.preventDefault  = e.preventDefault  || function preventDefault () { e.returnValue = false; };
    e.stopPropagation = e.stopPropagation || function stopPropagation () { e.cancelBubble = true; };
    fn.call(element, e);
  };
}

module.exports = {
  add: add
};

},{}],40:[function(require,module,exports){
'use strict';

var xhr = require('./xhr');
var emitter = require('./emitter');
var interceptor = require('./interceptor');
var lastXhr = {};

function e (value) {
  return value || '';
}

function jsonify (route) {
  var parts = route.parts;
  var qs = e(parts.search);
  var p = qs ? '&' : '?';
  return parts.pathname + qs + p + 'json';
}

function abort (source) {
  if (lastXhr[source]) {
    lastXhr[source].abort();
  }
}

function abortPending () {
  Object.keys(lastXhr).forEach(abort);
  lastXhr = {};
}

function fetcher (route, context, done) {
  var url = route.url;
  if (lastXhr[context.source]) {
    lastXhr[context.source].abort();
    lastXhr[context.source] = null;
  }
  interceptor.execute(route, afterInterceptors);

  function afterInterceptors (err, result) {
    if (!err && result.defaultPrevented) {
      done(null, result.model);
    } else {
      emitter.emit('fetch.start', route, context);
      lastXhr[context.source] = xhr(jsonify(route), notify);
    }
  }

  function notify (err, data) {
    if (err) {
      if (err.message === 'aborted') {
        emitter.emit('fetch.abort', route, context);
      } else {
        emitter.emit('fetch.error', route, context, err);
      }
    } else {
      emitter.emit('fetch.done', route, context, data);
    }
    done(err, data);
  }
}

fetcher.abortPending = abortPending;

module.exports = fetcher;

},{"./emitter":38,"./interceptor":43,"./xhr":54}],41:[function(require,module,exports){
'use strict';

var emitter = require('./emitter');
var links = require('./links');

function attach () {
  emitter.on('start', links);
}

module.exports = {
  attach: attach
};

},{"./emitter":38,"./links":45}],42:[function(require,module,exports){
'use strict';

var state = require('./state');
var interceptor = require('./interceptor');
var activator = require('./activator');
var emitter = require('./emitter');
var hooks = require('./hooks');
var partial = require('./partial');
var mount = require('./mount');
var router = require('./router');

hooks.attach();

module.exports = {
  mount: mount,
  partial: partial.standalone,
  on: emitter.on.bind(emitter),
  once: emitter.once.bind(emitter),
  off: emitter.off.bind(emitter),
  intercept: interceptor.add,
  navigate: activator.go,
  state: state,
  route: router
};

},{"./activator":35,"./emitter":38,"./hooks":41,"./interceptor":43,"./mount":46,"./partial":48,"./router":49,"./state":50}],43:[function(require,module,exports){
'use strict';

var emitter = require('contra.emitter');
var once = require('./once');
var router = require('./router');
var interceptors = emitter({ count: 0 }, { async: true });

function getInterceptorEvent (route) {
  var e = {
    url: route.url,
    route: route,
    parts: route.parts,
    model: null,
    canPreventDefault: true,
    defaultPrevented: false,
    preventDefault: once(preventDefault)
  };

  function preventDefault (model) {
    if (!e.canPreventDefault) {
      return;
    }
    e.canPreventDefault = false;
    e.defaultPrevented = true;
    e.model = model;
  }

  return e;
}

function add (action, fn) {
  if (arguments.length === 1) {
    fn = action;
    action = '*';
  }
  interceptors.count++;
  interceptors.on(action, fn);
}

function executeSync (route) {
  var e = getInterceptorEvent(route);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  return e;
}

function execute (route, done) {
  var e = getInterceptorEvent(route);
  if (interceptors.count === 0) { // fail fast
    end(); return;
  }
  var fn = once(end);
  var preventDefaultBase = e.preventDefault;

  e.preventDefault = once(preventDefaultEnds);

  interceptors.emit('*', e);
  interceptors.emit(route.action, e);

  setTimeout(fn, 200); // at worst, spend 200ms waiting on interceptors

  function preventDefaultEnds () {
    preventDefaultBase.apply(null, arguments);
    fn();
  }

  function end () {
    e.canPreventDefault = false;
    done(null, e);
  }
}

module.exports = {
  add: add,
  execute: execute
};

},{"./once":47,"./router":49,"contra.emitter":55}],44:[function(require,module,exports){
'use strict';

// source: https://gist.github.com/jdalton/5e34d890105aca44399f
// thanks @jdalton!

var toString = Object.prototype.toString; // used to resolve the internal `[[Class]]` of values
var fnToString = Function.prototype.toString; // used to resolve the decompiled source of functions
var host = /^\[object .+?Constructor\]$/; // used to detect host constructors (Safari > 4; really typed array specific)

// Escape any special regexp characters.
var specials = /[.*+?^${}()|[\]\/\\]/g;

// Replace mentions of `toString` with `.*?` to keep the template generic.
// Replace thing like `for ...` to support environments, like Rhino, which add extra
// info such as method arity.
var extras = /toString|(function).*?(?=\\\()| for .+?(?=\\\])/g;

// Compile a regexp using a common native method as a template.
// We chose `Object#toString` because there's a good chance it is not being mucked with.
var fnString = String(toString).replace(specials, '\\$&').replace(extras, '$1.*?');
var reNative = new RegExp('^' + fnString + '$');

function isNative (value) {
  var type = typeof value;
  if (type === 'function') {
    // Use `Function#toString` to bypass the value's own `toString` method
    // and avoid being faked out.
    return reNative.test(fnToString.call(value));
  }

  // Fallback to a host object check because some environments will represent
  // things like typed arrays as DOM methods which may not conform to the
  // normal native pattern.
  return (value && type === 'object' && host.test(toString.call(value))) || false;
}

module.exports = isNative;

},{}],45:[function(require,module,exports){
'use strict';

var state = require('./state');
var router = require('./router');
var events = require('./events');
var fetcher = require('./fetcher');
var activator = require('./activator');
var origin = document.location.origin;
var leftClick = 1;
var prefetching = [];
var clicksOnHold = [];

function links () {
  if (state.prefetch && state.cache) { // prefetch without cache makes no sense
    events.add(document.body, 'mouseover', maybePrefetch);
    events.add(document.body, 'touchstart', maybePrefetch);
  }
  events.add(document.body, 'click', maybeReroute);
}

function so (anchor) {
  return anchor.origin === origin;
}

function leftClickOnAnchor (e, anchor) {
  return anchor.pathname && e.which === leftClick && !e.metaKey && !e.ctrlKey;
}

function targetOrAnchor (e) {
  var anchor = e.target;
  while (anchor) {
    if (anchor.tagName === 'A') {
      return anchor;
    }
    anchor = anchor.parentElement;
  }
}

function maybeReroute (e) {
  var anchor = targetOrAnchor(e);
  if (anchor && so(anchor) && leftClickOnAnchor(e, anchor)) {
    reroute(e, anchor);
  }
}

function maybePrefetch (e) {
  var anchor = targetOrAnchor(e);
  if (anchor && so(anchor)) {
    prefetch(e, anchor);
  }
}

function scrollInto (id) {
  var elem = document.getElementById(id);
  if (elem && elem.scrollIntoView) {
    elem.scrollIntoView();
  }
}

function noop () {}

function getRoute (anchor, fail) {
  var url = anchor.pathname + anchor.search + anchor.hash;
  if (url === location.pathname + location.search + anchor.hash) {
    (fail || noop)();
    return; // anchor hash-navigation on same page ignores router
  }
  var route = router(url);
  if (!route || route.ignore) {
    return;
  }
  return route;
}

function reroute (e, anchor) {
  var route = getRoute(anchor, fail);
  if (!route) {
    return;
  }

  prevent();

  if (prefetching.indexOf(anchor) !== -1) {
    clicksOnHold.push(anchor);
    return;
  }

  activator.go(route.url, { context: anchor });

  function fail () {
    if (anchor.hash === location.hash) {
      scrollInto(anchor.hash.substr(1));
      prevent();
    }
  }

  function prevent () { e.preventDefault(); }
}

function prefetch (e, anchor) {
  var route = getRoute(anchor);
  if (!route) {
    return;
  }

  if (prefetching.indexOf(anchor) !== -1) {
    return;
  }

  prefetching.push(anchor);
  fetcher(route, { element: anchor, source: 'prefetch' }, resolved);

  function resolved (err, data) {
    prefetching.splice(prefetching.indexOf(anchor), 1);
    if (clicksOnHold.indexOf(anchor) !== -1) {
      clicksOnHold.splice(clicksOnHold.indexOf(anchor), 1);
      activator.go(route.url, { context: anchor });
    }
  }
}

module.exports = links;

},{"./activator":35,"./events":39,"./fetcher":40,"./router":49,"./state":50}],46:[function(require,module,exports){
(function (global){
'use strict';

var unescape = require('./unescape');
var state = require('./state');
var router = require('./router');
var activator = require('./activator');
var caching = require('./caching');
var fetcher = require('./fetcher');
var g = global;
var mounted;
var booted;

function orEmpty (value) {
  return value || '';
}

function mount (container, wiring, options) {
  var o = options || {};
  if (mounted) {
    throw new Error('Taunus already mounted!');
  }
  if (!container || !container.tagName) { // naïve is enough
    throw new Error('You must define an application root container!');
  }

  mounted = true;

  state.container = container;
  state.controllers = wiring.controllers;
  state.templates = wiring.templates;
  state.routes = wiring.routes;
  state.prefetch = !!o.prefetch;

  router.setup(wiring.routes);

  var url = location.pathname;
  var query = orEmpty(location.search) + orEmpty(location.hash);
  var route = router(url + query);

  caching.setup(o.cache, route);
  caching.ready(kickstart);

  function kickstart () {
    if (!o.bootstrap) { o.bootstrap = 'auto'; }
    if (o.bootstrap === 'auto') {
      autoboot();
    } else if (o.bootstrap === 'inline') {
      inlineboot();
    } else if (o.bootstrap === 'manual') {
      manualboot();
    } else {
      throw new Error(o.bootstrap + ' is not a valid bootstrap mode!');
    }
  }

  function autoboot () {
    fetcher(route, { element: container, source: 'boot' }, fetched);
  }

  function fetched (err, data) {
    if (err) {
      throw new Error('Fetching JSON data model for first view failed.');
    }
    boot(data);
  }

  function inlineboot () {
    var id = container.getAttribute('data-taunus');
    var script = document.getElementById(id);
    var model = JSON.parse(unescape(script.innerText || script.textContent));
    boot(model);
  }

  function manualboot () {
    if (typeof g.taunusReady === 'function') {
      g.taunusReady = boot; // not yet an object? turn it into the boot method
    } else if (g.taunusReady && typeof g.taunusReady === 'object') {
      boot(g.taunusReady); // already an object? boot with that as the model
    } else {
      throw new Error('Did you forget to add the taunusReady global?');
    }
  }

  function boot (model) {
    if (booted) { // sanity
      return;
    }
    if (!model || typeof model !== 'object') {
      throw new Error('Taunus model must be an object!');
    }
    booted = true;
    caching.persist(route, state.container, model);
    activator.start(model);
  }
}

module.exports = mount;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./activator":35,"./caching":37,"./fetcher":40,"./router":49,"./state":50,"./unescape":53}],47:[function(require,module,exports){
'use strict';

module.exports = function (fn) {
  var used;
  return function once () {
    if (used) { return; } used = true;
    return fn.apply(this, arguments);
  };
};

},{}],48:[function(require,module,exports){
'use strict';

var raf = require('raf');
var state = require('./state');
var emitter = require('./emitter');

function positioning () {
  var target;
  var hash = location.hash;
  if (hash) {
    target = document.getElementById(hash.slice(1));
  }
  if (!target) {
    target = document.documentElement;
  }
  raf(focusin);
  function focusin () {
    target.scrollIntoView();
  }
}

function partial (container, enforcedAction, model, route, options) {
  var action = enforcedAction || model && model.action || route && route.action;
  var controller = state.controllers[action];
  var internals = options || {};
  if (internals.render !== false) {
    container.innerHTML = render(action, model);
    if (internals.routed !== false) {
      positioning();
    }
  }
  emitter.emit('render', container, model);
  if (controller) {
    controller(model, container, route);
  }
}

function render (action, model) {
  var template = state.templates[action];
  try {
    return template(model);
  } catch (e) {
    throw new Error('Error rendering "' + action + '" template\n' + e.stack);
  }
}

function standalone (container, action, model, route) {
  return partial(container, action, model, route, { routed: false });
}

partial.standalone = standalone;

module.exports = partial;

},{"./emitter":38,"./state":50,"raf":58}],49:[function(require,module,exports){
'use strict';

var url = require('fast-url-parser');
var routes = require('routes');
var matcher = routes();

function router (raw) {
  var parts = url.parse(raw);
  var result = matcher.match(parts.pathname);
  var route = result ? result.fn(result) : null;
  if (route) {
    route.url = raw;
    route.parts = parts;
  }
  return route;
}

function setup (definitions) {
  Object.keys(definitions).forEach(define.bind(null, definitions));
}

function define (definitions, key) {
  matcher.addRoute(key, function definition (match) {
    var params = match.params;
    params.args = match.splats;
    return {
      route: key,
      params: params,
      action: definitions[key].action || null,
      ignore: definitions[key].ignore,
      cache: definitions[key].cache
    };
  });
}

router.setup = setup;

module.exports = router;

},{"fast-url-parser":57,"routes":60}],50:[function(require,module,exports){
'use strict';

module.exports = {
  container: null
};

},{}],51:[function(require,module,exports){
(function (global){
'use strict';

var api = {};
var g = global;
var idb = g.indexedDB || g.mozIndexedDB || g.webkitIndexedDB || g.msIndexedDB;
var supports;
var db;
var dbName = 'taunus-cache';
var store = 'view-models';
var keyPath = 'url';
var setQueue = [];
var testedQueue = [];

function noop () {}

function test () {
  var key = 'indexed-db-feature-detection';
  var req;
  var db;

  if (!(idb && 'deleteDatabase' in idb)) {
    support(false); return;
  }

  try {
    idb.deleteDatabase(key).onsuccess = transactionalTest;
  } catch (e) {
    support(false);
  }

  function transactionalTest () {
    req = idb.open(key, 1);
    req.onupgradeneeded = upgneeded;
    req.onerror = error;
    req.onsuccess = success;

    function upgneeded () {
      req.result.createObjectStore('store');
    }

    function success () {
      db = req.result;
      try {
        db.transaction('store', 'readwrite').objectStore('store').add(new Blob(), 'key');
      } catch (e) {
        support(false);
      } finally {
        db.close();
        idb.deleteDatabase(key);
        if (supports !== false) {
          open();
        }
      }
    }

    function error () {
      support(false);
    }
  }
}

function open () {
  var req = idb.open(dbName, 1);
  req.onerror = error;
  req.onupgradeneeded = upgneeded;
  req.onsuccess = success;

  function upgneeded () {
    req.result.createObjectStore(store, { keyPath: keyPath });
  }

  function success () {
    db = req.result;
    api.name = 'IndexedDB';
    api.get = get;
    api.set = set;
    drainSet();
    support(true);
  }

  function error () {
    support(false);
  }
}

function fallback () {
  api.name = 'IndexedDB-fallbackStore';
  api.get = undefinedGet;
  api.set = enqueueSet;
}

function undefinedGet (key, done) {
  done(null, null);
}

function enqueueSet (key,  value, done) {
  if (setQueue.length > 2) { // let's not waste any more memory
    return;
  }
  if (supports !== false) { // let's assume the capability is validated soon
    setQueue.push({ key: key, value: value, done: done });
  }
}

function drainSet () {
  while (setQueue.length) {
    var item = setQueue.shift();
    set(item.key, item.value, item.done);
  }
}

function query (op, value, done) {
  var req = db.transaction(store, 'readwrite').objectStore(store)[op](value);

  req.onsuccess = success;
  req.onerror = error;

  function success () {
    (done || noop)(null, req.result);
  }

  function error () {
    (done || noop)(new Error('Taunus cache query failed at IndexedDB!'));
  }
}

function get (key, done) {
  query('get', key, done);
}

function set (key, value, done) {
  value[keyPath] = key;
  query('add', value, done); // attempt to insert
  query('put', value, done); // attempt to update
}

function drainTested () {
  while (testedQueue.length) {
    testedQueue.shift()();
  }
}

function tested (fn) {
  if (supports !== void 0) {
    fn();
  } else {
    testedQueue.push(fn);
  }
}

function support (value) {
  if (supports !== void 0) {
    return; // sanity
  }
  supports = value;
  drainTested();
}

function failed () {
  support(false);
}

fallback();
test();
setTimeout(failed, 600); // the test can take somewhere near 300ms to complete

module.exports = api;

api.tested = tested;

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],52:[function(require,module,exports){
'use strict';

var raw = {};

function noop () {}

function get (key, done) {
  done(null, raw[key]);
}

function set (key, value, done) {
  raw[key] = value;
  (done || noop)(null);
}

module.exports = {
  name: 'memoryStore',
  get: get,
  set: set
};

},{}],53:[function(require,module,exports){
'use strict';

var reEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/g;
var htmlUnescapes = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
  '&#96;': '`'
};

function unescapeHtmlChar (c) {
  return htmlUnescapes[c];
}

function unescape (input) {
  var data = input == null ? '' : String(input);
  if (data && (reEscapedHtml.lastIndex = 0, reEscapedHtml.test(data))) {
    return data.replace(reEscapedHtml, unescapeHtmlChar);
  }
  return data;
}

module.exports = unescape;

},{}],54:[function(require,module,exports){
'use strict';

var xhr = require('xhr');
var emitter = require('./emitter');

module.exports = function (url, done) {
  var options = {
    url: url,
    json: true,
    headers: { Accept: 'application/json' }
  };
  var req = xhr(options, handle);

  return req;

  function handle (err, res, body) {
    if (err && !req.getAllResponseHeaders()) {
      done(new Error('aborted'));
    } else {
      done(err, body);
    }
  }
};

},{"./emitter":38,"xhr":61}],55:[function(require,module,exports){
module.exports = require('./src/contra.emitter.js');

},{"./src/contra.emitter.js":56}],56:[function(require,module,exports){
(function (process){
(function (root, undefined) {
  'use strict';

  var undef = '' + undefined;
  function atoa (a, n) { return Array.prototype.slice.call(a, n); }
  function debounce (fn, args, ctx) { if (!fn) { return; } tick(function run () { fn.apply(ctx || null, args || []); }); }

  // cross-platform ticker
  var si = typeof setImmediate === 'function', tick;
  if (si) {
    tick = function (fn) { setImmediate(fn); };
  } else if (typeof process !== undef && process.nextTick) {
    tick = process.nextTick;
  } else {
    tick = function (fn) { setTimeout(fn, 0); };
  }

  function _emitter (thing, options) {
    var opts = options || {};
    var evt = {};
    if (thing === undefined) { thing = {}; }
    thing.on = function (type, fn) {
      if (!evt[type]) {
        evt[type] = [fn];
      } else {
        evt[type].push(fn);
      }
      return thing;
    };
    thing.once = function (type, fn) {
      fn._once = true; // thing.off(fn) still works!
      thing.on(type, fn);
      return thing;
    };
    thing.off = function (type, fn) {
      var c = arguments.length;
      if (c === 1) {
        delete evt[type];
      } else if (c === 0) {
        evt = {};
      } else {
        var et = evt[type];
        if (!et) { return thing; }
        et.splice(et.indexOf(fn), 1);
      }
      return thing;
    };
    thing.emit = function () {
      var ctx = this;
      var args = atoa(arguments);
      var type = args.shift();
      var et = evt[type];
      if (type === 'error' && opts.throws !== false && !et) { throw args.length === 1 ? args[0] : args; }
      if (!et) { return thing; }
      evt[type] = et.filter(function emitter (listen) {
        if (opts.async) { debounce(listen, args, ctx); } else { listen.apply(ctx, args); }
        return !listen._once;
      });
      return thing;
    };
    return thing;
  }

  // cross-platform export
  if (typeof module !== undef && module.exports) {
    module.exports = _emitter;
  } else {
    root.contra = root.contra || {};
    root.contra.emitter = _emitter;
  }
})(this);

}).call(this,require("/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"))
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],57:[function(require,module,exports){
"use strict";
/*
Copyright (c) 2014 Petka Antonov

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
function Url() {
    //For more efficient internal representation and laziness.
    //The non-underscore versions of these properties are accessor functions
    //defined on the prototype.
    this._protocol = null;
    this._href = "";
    this._port = -1;
    this._query = null;

    this.auth = null;
    this.slashes = null;
    this.host = null;
    this.hostname = null;
    this.hash = null;
    this.search = null;
    this.pathname = null;

    this._prependSlash = false;
}

var querystring = require("querystring");
Url.prototype.parse =
function Url$parse(str, parseQueryString, hostDenotesSlash) {
    if (typeof str !== "string") {
        throw new TypeError("Parameter 'url' must be a string, not " +
            typeof str);
    }
    var start = 0;
    var end = str.length - 1;

    //Trim leading and trailing ws
    while (str.charCodeAt(start) <= 0x20 /*' '*/) start++;
    while (str.charCodeAt(end) <= 0x20 /*' '*/) end--;

    start = this._parseProtocol(str, start, end);

    //Javascript doesn't have host
    if (this._protocol !== "javascript") {
        start = this._parseHost(str, start, end, hostDenotesSlash);
        var proto = this._protocol;
        if (!this.hostname &&
            (this.slashes || (proto && !slashProtocols[proto]))) {
            this.hostname = this.host = "";
        }
    }

    if (start <= end) {
        var ch = str.charCodeAt(start);

        if (ch === 0x2F /*'/'*/) {
            this._parsePath(str, start, end);
        }
        else if (ch === 0x3F /*'?'*/) {
            this._parseQuery(str, start, end);
        }
        else if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, start, end);
        }
        else if (this._protocol !== "javascript") {
            this._parsePath(str, start, end);
        }
        else { //For javascript the pathname is just the rest of it
            this.pathname = str.slice(start, end + 1 );
        }

    }

    if (!this.pathname && this.hostname &&
        this._slashProtocols[this._protocol]) {
        this.pathname = "/";
    }

    if (parseQueryString) {
        var search = this.search;
        if (search == null) {
            search = this.search = "";
        }
        if (search.charCodeAt(0) === 0x3F /*'?'*/) {
            search = search.slice(1);
        }
        //This calls a setter function, there is no .query data property
        this.query = querystring.parse(search);
    }
};

Url.prototype.resolve = function Url$resolve(relative) {
    return this.resolveObject(Url.parse(relative, false, true)).format();
};

Url.prototype.format = function Url$format() {
    var auth = this.auth || "";

    if (auth) {
        auth = encodeURIComponent(auth);
        auth = auth.replace(/%3A/i, ":");
        auth += "@";
    }

    var protocol = this.protocol || "";
    var pathname = this.pathname || "";
    var hash = this.hash || "";
    var search = this.search || "";
    var query = "";
    var hostname = this.hostname || "";
    var port = this.port || "";
    var host = false;
    var scheme = "";

    //Cache the result of the getter function
    var q = this.query;
    if (q && typeof q === "object") {
        query = querystring.stringify(q);
    }

    if (!search) {
        search = query ? "?" + query : "";
    }

    if (protocol && protocol.charCodeAt(protocol.length - 1) !== 0x3A /*':'*/)
        protocol += ":";

    if (this.host) {
        host = auth + this.host;
    }
    else if (hostname) {
        var ip6 = hostname.indexOf(":") > -1;
        if (ip6) hostname = "[" + hostname + "]";
        host = auth + hostname + (port ? ":" + port : "");
    }

    var slashes = this.slashes ||
        ((!protocol ||
        slashProtocols[protocol]) && host !== false);


    if (protocol) scheme = protocol + (slashes ? "//" : "");
    else if (slashes) scheme = "//";

    if (slashes && pathname && pathname.charCodeAt(0) !== 0x2F /*'/'*/) {
        pathname = "/" + pathname;
    }
    else if (!slashes && pathname === "/") {
        pathname = "";
    }
    if (search && search.charCodeAt(0) !== 0x3F /*'?'*/)
        search = "?" + search;
    if (hash && hash.charCodeAt(0) !== 0x23 /*'#'*/)
        hash = "#" + hash;

    pathname = escapePathName(pathname);
    search = escapeSearch(search);

    return scheme + (host === false ? "" : host) + pathname + search + hash;
};

Url.prototype.resolveObject = function Url$resolveObject(relative) {
    if (typeof relative === "string")
        relative = Url.parse(relative, false, true);

    var result = this._clone();

    // hash is always overridden, no matter what.
    // even href="" will remove it.
    result.hash = relative.hash;

    // if the relative url is empty, then there"s nothing left to do here.
    if (!relative.href) {
        result._href = "";
        return result;
    }

    // hrefs like //foo/bar always cut to the protocol.
    if (relative.slashes && !relative._protocol) {
        relative._copyPropsTo(result, true);

        if (slashProtocols[result._protocol] &&
            result.hostname && !result.pathname) {
            result.pathname = "/";
        }
        result._href = "";
        return result;
    }

    if (relative._protocol && relative._protocol !== result._protocol) {
        // if it"s a known url protocol, then changing
        // the protocol does weird things
        // first, if it"s not file:, then we MUST have a host,
        // and if there was a path
        // to begin with, then we MUST have a path.
        // if it is file:, then the host is dropped,
        // because that"s known to be hostless.
        // anything else is assumed to be absolute.
        if (!slashProtocols[relative._protocol]) {
            relative._copyPropsTo(result, false);
            result._href = "";
            return result;
        }

        result._protocol = relative._protocol;
        if (!relative.host && relative._protocol !== "javascript") {
            var relPath = (relative.pathname || "").split("/");
            while (relPath.length && !(relative.host = relPath.shift()));
            if (!relative.host) relative.host = "";
            if (!relative.hostname) relative.hostname = "";
            if (relPath[0] !== "") relPath.unshift("");
            if (relPath.length < 2) relPath.unshift("");
            result.pathname = relPath.join("/");
        } else {
            result.pathname = relative.pathname;
        }

        result.search = relative.search;
        result.host = relative.host || "";
        result.auth = relative.auth;
        result.hostname = relative.hostname || relative.host;
        result._port = relative._port;
        result.slashes = result.slashes || relative.slashes;
        result._href = "";
        return result;
    }

    var isSourceAbs =
        (result.pathname && result.pathname.charCodeAt(0) === 0x2F /*'/'*/);
    var isRelAbs = (
            relative.host ||
            (relative.pathname &&
            relative.pathname.charCodeAt(0) === 0x2F /*'/'*/)
        );
    var mustEndAbs = (isRelAbs || isSourceAbs ||
                        (result.host && relative.pathname));

    var removeAllDots = mustEndAbs;

    var srcPath = result.pathname && result.pathname.split("/") || [];
    var relPath = relative.pathname && relative.pathname.split("/") || [];
    var psychotic = result._protocol && !slashProtocols[result._protocol];

    // if the url is a non-slashed url, then relative
    // links like ../.. should be able
    // to crawl up to the hostname, as well.  This is strange.
    // result.protocol has already been set by now.
    // Later on, put the first path part into the host field.
    if (psychotic) {
        result.hostname = "";
        result._port = -1;
        if (result.host) {
            if (srcPath[0] === "") srcPath[0] = result.host;
            else srcPath.unshift(result.host);
        }
        result.host = "";
        if (relative._protocol) {
            relative.hostname = "";
            relative._port = -1;
            if (relative.host) {
                if (relPath[0] === "") relPath[0] = relative.host;
                else relPath.unshift(relative.host);
            }
            relative.host = "";
        }
        mustEndAbs = mustEndAbs && (relPath[0] === "" || srcPath[0] === "");
    }

    if (isRelAbs) {
        // it"s absolute.
        result.host = relative.host ?
            relative.host : result.host;
        result.hostname = relative.hostname ?
            relative.hostname : result.hostname;
        result.search = relative.search;
        srcPath = relPath;
        // fall through to the dot-handling below.
    } else if (relPath.length) {
        // it"s relative
        // throw away the existing file, and take the new path instead.
        if (!srcPath) srcPath = [];
        srcPath.pop();
        srcPath = srcPath.concat(relPath);
        result.search = relative.search;
    } else if (relative.search) {
        // just pull out the search.
        // like href="?foo".
        // Put this after the other two cases because it simplifies the booleans
        if (psychotic) {
            result.hostname = result.host = srcPath.shift();
            //occationaly the auth can get stuck only in host
            //this especialy happens in cases like
            //url.resolveObject("mailto:local1@domain1", "local2@domain2")
            var authInHost = result.host && result.host.indexOf("@") > 0 ?
                result.host.split("@") : false;
            if (authInHost) {
                result.auth = authInHost.shift();
                result.host = result.hostname = authInHost.shift();
            }
        }
        result.search = relative.search;
        result._href = "";
        return result;
    }

    if (!srcPath.length) {
        // no path at all.  easy.
        // we"ve already handled the other stuff above.
        result.pathname = null;
        result._href = "";
        return result;
    }

    // if a url ENDs in . or .., then it must get a trailing slash.
    // however, if it ends in anything else non-slashy,
    // then it must NOT get a trailing slash.
    var last = srcPath.slice(-1)[0];
    var hasTrailingSlash = (
        (result.host || relative.host) && (last === "." || last === "..") ||
        last === "");

    // strip single dots, resolve double dots to parent dir
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = srcPath.length; i >= 0; i--) {
        last = srcPath[i];
        if (last == ".") {
            srcPath.splice(i, 1);
        } else if (last === "..") {
            srcPath.splice(i, 1);
            up++;
        } else if (up) {
            srcPath.splice(i, 1);
            up--;
        }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (!mustEndAbs && !removeAllDots) {
        for (; up--; up) {
            srcPath.unshift("..");
        }
    }

    if (mustEndAbs && srcPath[0] !== "" &&
        (!srcPath[0] || srcPath[0].charCodeAt(0) !== 0x2F /*'/'*/)) {
        srcPath.unshift("");
    }

    if (hasTrailingSlash && (srcPath.join("/").substr(-1) !== "/")) {
        srcPath.push("");
    }

    var isAbsolute = srcPath[0] === "" ||
        (srcPath[0] && srcPath[0].charCodeAt(0) === 0x2F /*'/'*/);

    // put the host back
    if (psychotic) {
        result.hostname = result.host = isAbsolute ? "" :
            srcPath.length ? srcPath.shift() : "";
        //occationaly the auth can get stuck only in host
        //this especialy happens in cases like
        //url.resolveObject("mailto:local1@domain1", "local2@domain2")
        var authInHost = result.host && result.host.indexOf("@") > 0 ?
            result.host.split("@") : false;
        if (authInHost) {
            result.auth = authInHost.shift();
            result.host = result.hostname = authInHost.shift();
        }
    }

    mustEndAbs = mustEndAbs || (result.host && srcPath.length);

    if (mustEndAbs && !isAbsolute) {
        srcPath.unshift("");
    }

    result.pathname = srcPath.length === 0 ? null : srcPath.join("/");
    result.auth = relative.auth || result.auth;
    result.slashes = result.slashes || relative.slashes;
    result._href = "";
    return result;
};

var punycode = require("punycode");
Url.prototype._hostIdna = function Url$_hostIdna(hostname) {
    // IDNA Support: Returns a puny coded representation of "domain".
    // It only converts the part of the domain name that
    // has non ASCII characters. I.e. it dosent matter if
    // you call it with a domain that already is in ASCII.
    var domainArray = hostname.split(".");
    var newOut = [];
    for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            "xn--" + punycode.encode(s) : s);
    }
    return newOut.join(".");
};

var escapePathName = Url.prototype._escapePathName =
function Url$_escapePathName(pathname) {
    if (!containsCharacter2(pathname, 0x23 /*'#'*/, 0x3F /*'?'*/)) {
        return pathname;
    }
    //Avoid closure creation to keep this inlinable
    return _escapePath(pathname);
};

var escapeSearch = Url.prototype._escapeSearch =
function Url$_escapeSearch(search) {
    if (!containsCharacter2(search, 0x23 /*'#'*/, -1)) return search;
    //Avoid closure creation to keep this inlinable
    return _escapeSearch(search);
};

Url.prototype._parseProtocol = function Url$_parseProtocol(str, start, end) {
    var doLowerCase = false;
    var protocolCharacters = this._protocolCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x3A /*':'*/) {
            var protocol = str.slice(start, i);
            if (doLowerCase) protocol = protocol.toLowerCase();
            this._protocol = protocol;
            return i + 1;
        }
        else if (protocolCharacters[ch] === 1) {
            if (ch < 0x61 /*'a'*/)
                doLowerCase = true;
        }
        else {
            return start;
        }

    }
    return start;
};

Url.prototype._parseAuth = function Url$_parseAuth(str, start, end, decode) {
    var auth = str.slice(start, end + 1);
    if (decode) {
        auth = decodeURIComponent(auth);
    }
    this.auth = auth;
};

Url.prototype._parsePort = function Url$_parsePort(str, start, end) {
    //Internal format is integer for more efficient parsing
    //and for efficient trimming of leading zeros
    var port = 0;
    //Distinguish between :0 and : (no port number at all)
    var hadChars = false;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (0x30 /*'0'*/ <= ch && ch <= 0x39 /*'9'*/) {
            port = (10 * port) + (ch - 0x30 /*'0'*/);
            hadChars = true;
        }
        else break;

    }
    if (port === 0 && !hadChars) {
        return 0;
    }

    this._port = port;
    return i - start;
};

Url.prototype._parseHost =
function Url$_parseHost(str, start, end, slashesDenoteHost) {
    var hostEndingCharacters = this._hostEndingCharacters;
    if (str.charCodeAt(start) === 0x2F /*'/'*/ &&
        str.charCodeAt(start + 1) === 0x2F /*'/'*/) {
        this.slashes = true;

        //The string starts with //
        if (start === 0) {
            //The string is just "//"
            if (end < 2) return start;
            //If slashes do not denote host and there is no auth,
            //there is no host when the string starts with //
            var hasAuth =
                containsCharacter(str, 0x40 /*'@'*/, 2, hostEndingCharacters);
            if (!hasAuth && !slashesDenoteHost) {
                this.slashes = null;
                return start;
            }
        }
        //There is a host that starts after the //
        start += 2;
    }
    //If there is no slashes, there is no hostname if
    //1. there was no protocol at all
    else if (!this._protocol ||
        //2. there was a protocol that requires slashes
        //e.g. in 'http:asd' 'asd' is not a hostname
        slashProtocols[this._protocol]
    ) {
        return start;
    }

    var doLowerCase = false;
    var idna = false;
    var hostNameStart = start;
    var hostNameEnd = end;
    var lastCh = -1;
    var portLength = 0;
    var charsAfterDot = 0;
    var authNeedsDecoding = false;

    var j = -1;

    //Find the last occurrence of an @-sign until hostending character is met
    //also mark if decoding is needed for the auth portion
    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x40 /*'@'*/) {
            j = i;
        }
        //This check is very, very cheap. Unneeded decodeURIComponent is very
        //very expensive
        else if (ch === 0x25 /*'%'*/) {
            authNeedsDecoding = true;
        }
        else if (hostEndingCharacters[ch] === 1) {
            break;
        }
    }

    //@-sign was found at index j, everything to the left from it
    //is auth part
    if (j > -1) {
        this._parseAuth(str, start, j - 1, authNeedsDecoding);
        //hostname starts after the last @-sign
        start = hostNameStart = j + 1;
    }

    //Host name is starting with a [
    if (str.charCodeAt(start) === 0x5B /*'['*/) {
        for (var i = start + 1; i <= end; ++i) {
            var ch = str.charCodeAt(i);

            //Assume valid IP6 is between the brackets
            if (ch === 0x5D /*']'*/) {
                if (str.charCodeAt(i + 1) === 0x3A /*':'*/) {
                    portLength = this._parsePort(str, i + 2, end) + 1;
                }
                var hostname = str.slice(start + 1, i).toLowerCase();
                this.hostname = hostname;
                this.host = this._port > 0
                    ? "[" + hostname + "]:" + this._port
                    : "[" + hostname + "]";
                this.pathname = "/";
                return i + portLength + 1;
            }
        }
        //Empty hostname, [ starts a path
        return start;
    }

    for (var i = start; i <= end; ++i) {
        if (charsAfterDot > 62) {
            this.hostname = this.host = str.slice(start, i);
            return i;
        }
        var ch = str.charCodeAt(i);

        if (ch === 0x3A /*':'*/) {
            portLength = this._parsePort(str, i + 1, end) + 1;
            hostNameEnd = i - 1;
            break;
        }
        else if (ch < 0x61 /*'a'*/) {
            if (ch === 0x2E /*'.'*/) {
                //Node.js ignores this error
                /*
                if (lastCh === DOT || lastCh === -1) {
                    this.hostname = this.host = "";
                    return start;
                }
                */
                charsAfterDot = -1;
            }
            else if (0x41 /*'A'*/ <= ch && ch <= 0x5A /*'Z'*/) {
                doLowerCase = true;
            }
            else if (!(ch === 0x2D /*'-'*/ || ch === 0x5F /*'_'*/ ||
                (0x30 /*'0'*/ <= ch && ch <= 0x39 /*'9'*/))) {
                if (hostEndingCharacters[ch] === 0 &&
                    this._noPrependSlashHostEnders[ch] === 0) {
                    this._prependSlash = true;
                }
                hostNameEnd = i - 1;
                break;
            }
        }
        else if (ch >= 0x7B /*'{'*/) {
            if (ch <= 0x7E /*'~'*/) {
                if (this._noPrependSlashHostEnders[ch] === 0) {
                    this._prependSlash = true;
                }
                hostNameEnd = i - 1;
                break;
            }
            idna = true;
        }
        lastCh = ch;
        charsAfterDot++;
    }

    //Node.js ignores this error
    /*
    if (lastCh === DOT) {
        hostNameEnd--;
    }
    */

    if (hostNameEnd + 1 !== start &&
        hostNameEnd - hostNameStart <= 256) {
        var hostname = str.slice(hostNameStart, hostNameEnd + 1);
        if (doLowerCase) hostname = hostname.toLowerCase();
        if (idna) hostname = this._hostIdna(hostname);
        this.hostname = hostname;
        this.host = this._port > 0 ? hostname + ":" + this._port : hostname;
    }

    return hostNameEnd + 1 + portLength;

};

Url.prototype._copyPropsTo = function Url$_copyPropsTo(input, noProtocol) {
    if (!noProtocol) {
        input._protocol = this._protocol;
    }
    input._href = this._href;
    input._port = this._port;
    input._prependSlash = this._prependSlash;
    input.auth = this.auth;
    input.slashes = this.slashes;
    input.host = this.host;
    input.hostname = this.hostname;
    input.hash = this.hash;
    input.search = this.search;
    input.pathname = this.pathname;
};

Url.prototype._clone = function Url$_clone() {
    var ret = new Url();
    ret._protocol = this._protocol;
    ret._href = this._href;
    ret._port = this._port;
    ret._prependSlash = this._prependSlash;
    ret.auth = this.auth;
    ret.slashes = this.slashes;
    ret.host = this.host;
    ret.hostname = this.hostname;
    ret.hash = this.hash;
    ret.search = this.search;
    ret.pathname = this.pathname;
    return ret;
};

Url.prototype._getComponentEscaped =
function Url$_getComponentEscaped(str, start, end) {
    var cur = start;
    var i = start;
    var ret = "";
    var autoEscapeMap = this._autoEscapeMap;
    for (; i <= end; ++i) {
        var ch = str.charCodeAt(i);
        var escaped = autoEscapeMap[ch];

        if (escaped !== "") {
            if (cur < i) ret += str.slice(cur, i);
            ret += escaped;
            cur = i + 1;
        }
    }
    if (cur < i + 1) ret += str.slice(cur, i);
    return ret;
};

Url.prototype._parsePath =
function Url$_parsePath(str, start, end) {
    var pathStart = start;
    var pathEnd = end;
    var escape = false;
    var autoEscapeCharacters = this._autoEscapeCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);
        if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, i, end);
            pathEnd = i - 1;
            break;
        }
        else if (ch === 0x3F /*'?'*/) {
            this._parseQuery(str, i, end);
            pathEnd = i - 1;
            break;
        }
        else if (!escape && autoEscapeCharacters[ch] === 1) {
            escape = true;
        }
    }

    if (pathStart > pathEnd) {
        this.pathname = "/";
        return;
    }

    var path;
    if (escape) {
        path = this._getComponentEscaped(str, pathStart, pathEnd);
    }
    else {
        path = str.slice(pathStart, pathEnd + 1);
    }
    this.pathname = this._prependSlash ? "/" + path : path;
};

Url.prototype._parseQuery = function Url$_parseQuery(str, start, end) {
    var queryStart = start;
    var queryEnd = end;
    var escape = false;
    var autoEscapeCharacters = this._autoEscapeCharacters;

    for (var i = start; i <= end; ++i) {
        var ch = str.charCodeAt(i);

        if (ch === 0x23 /*'#'*/) {
            this._parseHash(str, i, end);
            queryEnd = i - 1;
            break;
        }
        else if (!escape && autoEscapeCharacters[ch] === 1) {
            escape = true;
        }
    }

    if (queryStart > queryEnd) {
        this.search = "";
        return;
    }

    var query;
    if (escape) {
        query = this._getComponentEscaped(str, queryStart, queryEnd);
    }
    else {
        query = str.slice(queryStart, queryEnd + 1);
    }
    this.search = query;
};

Url.prototype._parseHash = function Url$_parseHash(str, start, end) {
    if (start > end) {
        this.hash = "";
        return;
    }
    this.hash = this._getComponentEscaped(str, start, end);
};

Object.defineProperty(Url.prototype, "port", {
    get: function() {
        if (this._port >= 0) {
            return ("" + this._port);
        }
        return null;
    },
    set: function(v) {
        if (v == null) {
            this._port = -1;
        }
        else {
            this._port = parseInt(v, 10);
        }
    }
});

Object.defineProperty(Url.prototype, "query", {
    get: function() {
        var query = this._query;
        if (query != null) {
            return query;
        }
        var search = this.search;

        if (search) {
            if (search.charCodeAt(0) === 0x3F /*'?'*/) {
                search = search.slice(1);
            }
            if (search !== "") {
                this._query = search;
                return search;
            }
        }
        return search;
    },
    set: function(v) {
        this._query = v;
    }
});

Object.defineProperty(Url.prototype, "path", {
    get: function() {
        var p = this.pathname || "";
        var s = this.search || "";
        if (p || s) {
            return p + s;
        }
        return (p == null && s) ? ("/" + s) : null;
    },
    set: function() {}
});

Object.defineProperty(Url.prototype, "protocol", {
    get: function() {
        var proto = this._protocol;
        return proto ? proto + ":" : proto;
    },
    set: function(v) {
        if (typeof v === "string") {
            var end = v.length - 1;
            if (v.charCodeAt(end) === 0x3A /*':'*/) {
                this._protocol = v.slice(0, end);
            }
            else {
                this._protocol = v;
            }
        }
        else if (v == null) {
            this._protocol = null;
        }
    }
});

Object.defineProperty(Url.prototype, "href", {
    get: function() {
        var href = this._href;
        if (!href) {
            href = this._href = this.format();
        }
        return href;
    },
    set: function(v) {
        this._href = v;
    }
});

Url.parse = function Url$Parse(str, parseQueryString, hostDenotesSlash) {
    if (str instanceof Url) return str;
    var ret = new Url();
    ret.parse(str, !!parseQueryString, !!hostDenotesSlash);
    return ret;
};

Url.format = function Url$Format(obj) {
    if (typeof obj === "string") {
        obj = Url.parse(obj);
    }
    if (!(obj instanceof Url)) {
        return Url.prototype.format.call(obj);
    }
    return obj.format();
};

Url.resolve = function Url$Resolve(source, relative) {
    return Url.parse(source, false, true).resolve(relative);
};

Url.resolveObject = function Url$ResolveObject(source, relative) {
    if (!source) return relative;
    return Url.parse(source, false, true).resolveObject(relative);
};

function _escapePath(pathname) {
    return pathname.replace(/[?#]/g, function(match) {
        return encodeURIComponent(match);
    });
}

function _escapeSearch(search) {
    return search.replace(/#/g, function(match) {
        return encodeURIComponent(match);
    });
}

//Search `char1` (integer code for a character) in `string`
//starting from `fromIndex` and ending at `string.length - 1`
//or when a stop character is found
function containsCharacter(string, char1, fromIndex, stopCharacterTable) {
    var len = string.length;
    for (var i = fromIndex; i < len; ++i) {
        var ch = string.charCodeAt(i);

        if (ch === char1) {
            return true;
        }
        else if (stopCharacterTable[ch] === 1) {
            return false;
        }
    }
    return false;
}

//See if `char1` or `char2` (integer codes for characters)
//is contained in `string`
function containsCharacter2(string, char1, char2) {
    for (var i = 0, len = string.length; i < len; ++i) {
        var ch = string.charCodeAt(i);
        if (ch === char1 || ch === char2) return true;
    }
    return false;
}

//Makes an array of 128 uint8's which represent boolean values.
//Spec is an array of ascii code points or ascii code point ranges
//ranges are expressed as [start, end]

//Create a table with the characters 0x30-0x39 (decimals '0' - '9') and
//0x7A (lowercaseletter 'z') as `true`:
//
//var a = makeAsciiTable([[0x30, 0x39], 0x7A]);
//a[0x30]; //1
//a[0x15]; //0
//a[0x35]; //1
function makeAsciiTable(spec) {
    var ret = new Uint8Array(128);
    spec.forEach(function(item){
        if (typeof item === "number") {
            ret[item] = 1;
        }
        else {
            var start = item[0];
            var end = item[1];
            for (var j = start; j <= end; ++j) {
                ret[j] = 1;
            }
        }
    });

    return ret;
}


var autoEscape = ["<", ">", "\"", "`", " ", "\r", "\n",
    "\t", "{", "}", "|", "\\", "^", "`", "'"];

var autoEscapeMap = new Array(128);



for (var i = 0, len = autoEscapeMap.length; i < len; ++i) {
    autoEscapeMap[i] = "";
}

for (var i = 0, len = autoEscape.length; i < len; ++i) {
    var c = autoEscape[i];
    var esc = encodeURIComponent(c);
    if (esc === c) {
        esc = escape(c);
    }
    autoEscapeMap[c.charCodeAt(0)] = esc;
}


var slashProtocols = Url.prototype._slashProtocols = {
    http: true,
    https: true,
    gopher: true,
    file: true,
    ftp: true,

    "http:": true,
    "https:": true,
    "gopher:": true,
    "file:": true,
    "ftp:": true
};

//Optimize back from normalized object caused by non-identifier keys
function f(){}
f.prototype = slashProtocols;

Url.prototype._protocolCharacters = makeAsciiTable([
    [0x61 /*'a'*/, 0x7A /*'z'*/],
    [0x41 /*'A'*/, 0x5A /*'Z'*/],
    0x2E /*'.'*/, 0x2B /*'+'*/, 0x2D /*'-'*/
]);

Url.prototype._hostEndingCharacters = makeAsciiTable([
    0x23 /*'#'*/, 0x3F /*'?'*/, 0x2F /*'/'*/
]);

Url.prototype._autoEscapeCharacters = makeAsciiTable(
    autoEscape.map(function(v) {
        return v.charCodeAt(0);
    })
);

//If these characters end a host name, the path will not be prepended a /
Url.prototype._noPrependSlashHostEnders = makeAsciiTable(
    [
        "<", ">", "'", "`", " ", "\r",
        "\n", "\t", "{", "}", "|", "\\",
        "^", "`", "\"", "%", ";"
    ].map(function(v) {
        return v.charCodeAt(0);
    })
);

Url.prototype._autoEscapeMap = autoEscapeMap;

module.exports = Url;

Url.replace = function Url$Replace() {
    require.cache["url"] = {
        exports: Url
    };
};

},{"punycode":2,"querystring":5}],58:[function(require,module,exports){
module.exports=require(33)
},{"performance-now":59}],59:[function(require,module,exports){
module.exports=require(34)
},{"/Users/nico/.nvm/v0.10.26/lib/node_modules/watchify/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":1}],60:[function(require,module,exports){
(function (global){
!function(e){if("object"==typeof exports)module.exports=e();else if("function"==typeof define&&define.amd)define(e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.routes=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){

var localRoutes = [];


/**
 * Convert path to route object
 *
 * A string or RegExp should be passed,
 * will return { re, src, keys} obj
 *
 * @param  {String / RegExp} path
 * @return {Object}
 */

var Route = function(path){
  //using 'new' is optional

  var src, re, keys = [];

  if(path instanceof RegExp){
    re = path;
    src = path.toString();
  }else{
    re = pathToRegExp(path, keys);
    src = path;
  }

  return {
  	 re: re,
  	 src: path.toString(),
  	 keys: keys
  }
};

/**
 * Normalize the given path string,
 * returning a regular expression.
 *
 * An empty array should be passed,
 * which will contain the placeholder
 * key names. For example "/user/:id" will
 * then contain ["id"].
 *
 * @param  {String} path
 * @param  {Array} keys
 * @return {RegExp}
 */
var pathToRegExp = function (path, keys) {
	path = path
		.concat('/?')
		.replace(/\/\(/g, '(?:/')
		.replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?|\*/g, function(_, slash, format, key, capture, optional){
			if (_ === "*"){
				keys.push(undefined);
				return _;
			}

			keys.push(key);
			slash = slash || '';
			return ''
				+ (optional ? '' : slash)
				+ '(?:'
				+ (optional ? slash : '')
				+ (format || '') + (capture || '([^/]+?)') + ')'
				+ (optional || '');
		})
		.replace(/([\/.])/g, '\\$1')
		.replace(/\*/g, '(.*)');
	return new RegExp('^' + path + '$', 'i');
};

/**
 * Attempt to match the given request to
 * one of the routes. When successful
 * a  {fn, params, splats} obj is returned
 *
 * @param  {Array} routes
 * @param  {String} uri
 * @return {Object}
 */
var match = function (routes, uri, startAt) {
	var captures, i = startAt || 0;

	for (var len = routes.length; i < len; ++i) {
		var route = routes[i],
		    re = route.re,
		    keys = route.keys,
		    splats = [],
		    params = {};

		if (captures = uri.match(re)) {
			for (var j = 1, len = captures.length; j < len; ++j) {
				var key = keys[j-1],
					val = typeof captures[j] === 'string'
						? unescape(captures[j])
						: captures[j];
				if (key) {
					params[key] = val;
				} else {
					splats.push(val);
				}
			}
			return {
				params: params,
				splats: splats,
				route: route.src,
				next: i + 1
			};
		}
	}
};

/**
 * Default "normal" router constructor.
 * accepts path, fn tuples via addRoute
 * returns {fn, params, splats, route}
 *  via match
 *
 * @return {Object}
 */

var Router = function(){
  //using 'new' is optional
  return {
    routes: [],
    routeMap : {},
    addRoute: function(path, fn){
      if (!path) throw new Error(' route requires a path');
      if (!fn) throw new Error(' route ' + path.toString() + ' requires a callback');

      var route = Route(path);
      route.fn = fn;

      this.routes.push(route);
      this.routeMap[path] = fn;
    },

    match: function(pathname, startAt){
      var route = match(this.routes, pathname, startAt);
      if(route){
        route.fn = this.routeMap[route.route];
        route.next = this.match.bind(this, pathname, route.next)
      }
      return route;
    }
  }
};

Router.Route = Route
Router.pathToRegExp = pathToRegExp
Router.match = match
// back compat
Router.Router = Router

module.exports = Router

},{}]},{},[1])
(1)
});
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],61:[function(require,module,exports){
var window = require("global/window")
var once = require("once")
var parseHeaders = require('parse-headers')

var messages = {
    "0": "Internal XMLHttpRequest Error",
    "4": "4xx Client Error",
    "5": "5xx Server Error"
}

var XHR = window.XMLHttpRequest || noop
var XDR = "withCredentials" in (new XHR()) ? XHR : window.XDomainRequest

module.exports = createXHR

function createXHR(options, callback) {
    if (typeof options === "string") {
        options = { uri: options }
    }

    options = options || {}
    callback = once(callback)

    var xhr = options.xhr || null

    if (!xhr) {
        if (options.cors || options.useXDR) {
            xhr = new XDR()
        }else{
            xhr = new XHR()
        }
    }

    var uri = xhr.url = options.uri || options.url
    var method = xhr.method = options.method || "GET"
    var body = options.body || options.data
    var headers = xhr.headers = options.headers || {}
    var sync = !!options.sync
    var isJson = false
    var key
    var load = options.response ? loadResponse : loadXhr

    if ("json" in options) {
        isJson = true
        headers["Accept"] = "application/json"
        if (method !== "GET" && method !== "HEAD") {
            headers["Content-Type"] = "application/json"
            body = JSON.stringify(options.json)
        }
    }

    xhr.onreadystatechange = readystatechange
    xhr.onload = load
    xhr.onerror = error
    // IE9 must have onprogress be set to a unique function.
    xhr.onprogress = function () {
        // IE must die
    }
    // hate IE
    xhr.ontimeout = noop
    xhr.open(method, uri, !sync)
                                    //backward compatibility
    if (options.withCredentials || (options.cors && options.withCredentials !== false)) {
        xhr.withCredentials = true
    }

    // Cannot set timeout with sync request
    if (!sync) {
        xhr.timeout = "timeout" in options ? options.timeout : 5000
    }

    if (xhr.setRequestHeader) {
        for(key in headers){
            if(headers.hasOwnProperty(key)){
                xhr.setRequestHeader(key, headers[key])
            }
        }
    } else if (options.headers) {
        throw new Error("Headers cannot be set on an XDomainRequest object")
    }

    if ("responseType" in options) {
        xhr.responseType = options.responseType
    }
    
    if ("beforeSend" in options && 
        typeof options.beforeSend === "function"
    ) {
        options.beforeSend(xhr)
    }

    xhr.send(body)

    return xhr

    function readystatechange() {
        if (xhr.readyState === 4) {
            load()
        }
    }

    function getBody() {
        // Chrome with requestType=blob throws errors arround when even testing access to responseText
        var body = null

        if (xhr.response) {
            body = xhr.response
        } else if (xhr.responseType === 'text' || !xhr.responseType) {
            body = xhr.responseText || xhr.responseXML
        }

        if (isJson) {
            try {
                body = JSON.parse(body)
            } catch (e) {}
        }

        return body
    }

    function getStatusCode() {
        return xhr.status === 1223 ? 204 : xhr.status
    }

    // if we're getting a none-ok statusCode, build & return an error
    function errorFromStatusCode(status) {
        var error = null
        if (status === 0 || (status >= 400 && status < 600)) {
            var message = (typeof body === "string" ? body : false) ||
                messages[String(status).charAt(0)]
            error = new Error(message)
            error.statusCode = status
        }

        return error
    }

    // will load the data & process the response in a special response object
    function loadResponse() {
        var status = getStatusCode()
        var error = errorFromStatusCode(status)
        var response = {
            body: getBody(),
            statusCode: status,
            statusText: xhr.statusText,
            raw: xhr
        }
        if(xhr.getAllResponseHeaders){ //remember xhr can in fact be XDR for CORS in IE
            response.headers = parseHeaders(xhr.getAllResponseHeaders())
        } else {
            response.headers = {}
        }

        callback(error, response, response.body)
    }

    // will load the data and add some response properties to the source xhr
    // and then respond with that
    function loadXhr() {
        var status = getStatusCode()
        var error = errorFromStatusCode(status)

        xhr.status = xhr.statusCode = status
        xhr.body = getBody()
        xhr.headers = parseHeaders(xhr.getAllResponseHeaders())

        callback(error, xhr, xhr.body)
    }

    function error(evt) {
        callback(evt, xhr)
    }
}


function noop() {}

},{"global/window":62,"once":63,"parse-headers":67}],62:[function(require,module,exports){
(function (global){
if (typeof window !== "undefined") {
    module.exports = window;
} else if (typeof global !== "undefined") {
    module.exports = global;
} else if (typeof self !== "undefined"){
    module.exports = self;
} else {
    module.exports = {};
}

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],63:[function(require,module,exports){
module.exports = once

once.proto = once(function () {
  Object.defineProperty(Function.prototype, 'once', {
    value: function () {
      return once(this)
    },
    configurable: true
  })
})

function once (fn) {
  var called = false
  return function () {
    if (called) return
    called = true
    return fn.apply(this, arguments)
  }
}

},{}],64:[function(require,module,exports){
var isFunction = require('is-function')

module.exports = forEach

var toString = Object.prototype.toString
var hasOwnProperty = Object.prototype.hasOwnProperty

function forEach(list, iterator, context) {
    if (!isFunction(iterator)) {
        throw new TypeError('iterator must be a function')
    }

    if (arguments.length < 3) {
        context = this
    }
    
    if (toString.call(list) === '[object Array]')
        forEachArray(list, iterator, context)
    else if (typeof list === 'string')
        forEachString(list, iterator, context)
    else
        forEachObject(list, iterator, context)
}

function forEachArray(array, iterator, context) {
    for (var i = 0, len = array.length; i < len; i++) {
        if (hasOwnProperty.call(array, i)) {
            iterator.call(context, array[i], i, array)
        }
    }
}

function forEachString(string, iterator, context) {
    for (var i = 0, len = string.length; i < len; i++) {
        // no such thing as a sparse string.
        iterator.call(context, string.charAt(i), i, string)
    }
}

function forEachObject(object, iterator, context) {
    for (var k in object) {
        if (hasOwnProperty.call(object, k)) {
            iterator.call(context, object[k], k, object)
        }
    }
}

},{"is-function":65}],65:[function(require,module,exports){
module.exports = isFunction

var toString = Object.prototype.toString

function isFunction (fn) {
  var string = toString.call(fn)
  return string === '[object Function]' ||
    (typeof fn === 'function' && string !== '[object RegExp]') ||
    (typeof window !== 'undefined' &&
     // IE8 and below
     (fn === window.setTimeout ||
      fn === window.alert ||
      fn === window.confirm ||
      fn === window.prompt))
};

},{}],66:[function(require,module,exports){

exports = module.exports = trim;

function trim(str){
  return str.replace(/^\s*|\s*$/g, '');
}

exports.left = function(str){
  return str.replace(/^\s*/, '');
};

exports.right = function(str){
  return str.replace(/\s*$/, '');
};

},{}],67:[function(require,module,exports){
var trim = require('trim')
  , forEach = require('for-each')
  , isArray = function(arg) {
      return Object.prototype.toString.call(arg) === '[object Array]';
    }

module.exports = function (headers) {
  if (!headers)
    return {}

  var result = {}

  forEach(
      trim(headers).split('\n')
    , function (row) {
        var index = row.indexOf(':')
          , key = trim(row.slice(0, index)).toLowerCase()
          , value = trim(row.slice(index + 1))

        if (typeof(result[key]) === 'undefined') {
          result[key] = value
        } else if (isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [ result[key], value ]
        }
      }
  )

  return result
}
},{"for-each":64,"trim":66}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3B1bnljb2RlL3B1bnljb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL1VzZXJzL25pY28vLm52bS92MC4xMC4yNi9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi92aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvLy5iaW4vdmlld3MvZXJyb3Ivbm90LWZvdW5kLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby8uYmluL3ZpZXdzL2xheW91dC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vLmJpbi93aXJpbmcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9jb250cm9sbGVycy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvY29udmVudGlvbnMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL2NsaWVudC9qcy9tYWluLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9jbGllbnQvanMvdGhyb3R0bGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL25vZGVfbW9kdWxlcy9wb3Nlci9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvbm9kZV9tb2R1bGVzL3Bvc2VyL3NyYy9icm93c2VyLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9ub2RlX21vZHVsZXMvc2VrdG9yL3NyYy9zZWt0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLmN0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9Eb21pbnVzLnByb3RvdHlwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2NsYXNzZXMuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy9jb3JlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9tLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvZG9taW51cy9zcmMvZG9taW51cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3B1YmxpYy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2RvbWludXMvc3JjL3Rlc3QuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9kb21pbnVzL3NyYy90ZXh0LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvamFkdW0vbm9kZV9tb2R1bGVzL2phZGUvcnVudGltZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL2phZHVtL3J1bnRpbWUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvYWN0aXZhdG9yLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvY2FjaGUuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9jYWNoaW5nLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2V2ZW50cy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2ZldGNoZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9ob29rcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvaW50ZXJjZXB0b3IuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9pc05hdGl2ZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL2xpbmtzLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvbW91bnQuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvcGFydGlhbC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3JvdXRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0YXRlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL2Jyb3dzZXIvc3RvcmVzL2lkYi5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3N0b3Jlcy9yYXcuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvYnJvd3Nlci91bmVzY2FwZS5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9icm93c2VyL3hoci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvY29udHJhLmVtaXR0ZXIvaW5kZXguanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL2NvbnRyYS5lbWl0dGVyL3NyYy9jb250cmEuZW1pdHRlci5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMvZmFzdC11cmwtcGFyc2VyL3NyYy91cmxwYXJzZXIuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3JvdXRlcy9kaXN0L3JvdXRlcy5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL2dsb2JhbC93aW5kb3cuanMiLCIvVXNlcnMvbmljby9kZXYvdGF1bnVzLmJldmFjcXVhLmlvL25vZGVfbW9kdWxlcy90YXVudXMvbm9kZV9tb2R1bGVzL3hoci9ub2RlX21vZHVsZXMvb25jZS9vbmNlLmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL2Zvci1lYWNoL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvbm9kZV9tb2R1bGVzL2Zvci1lYWNoL25vZGVfbW9kdWxlcy9pcy1mdW5jdGlvbi9pbmRleC5qcyIsIi9Vc2Vycy9uaWNvL2Rldi90YXVudXMuYmV2YWNxdWEuaW8vbm9kZV9tb2R1bGVzL3RhdW51cy9ub2RlX21vZHVsZXMveGhyL25vZGVfbW9kdWxlcy9wYXJzZS1oZWFkZXJzL25vZGVfbW9kdWxlcy90cmltL2luZGV4LmpzIiwiL1VzZXJzL25pY28vZGV2L3RhdW51cy5iZXZhY3F1YS5pby9ub2RlX21vZHVsZXMvdGF1bnVzL25vZGVfbW9kdWxlcy94aHIvbm9kZV9tb2R1bGVzL3BhcnNlLWhlYWRlcnMvcGFyc2UtaGVhZGVycy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNUQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ05BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL1JBO0FBQ0E7QUFDQTtBQUNBOztBQ0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25OQTtBQUNBOztBQ0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQ3BoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbnByb2Nlc3MubmV4dFRpY2sgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBjYW5TZXRJbW1lZGlhdGUgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5zZXRJbW1lZGlhdGU7XG4gICAgdmFyIGNhblBvc3QgPSB0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJ1xuICAgICYmIHdpbmRvdy5wb3N0TWVzc2FnZSAmJiB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lclxuICAgIDtcblxuICAgIGlmIChjYW5TZXRJbW1lZGlhdGUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChmKSB7IHJldHVybiB3aW5kb3cuc2V0SW1tZWRpYXRlKGYpIH07XG4gICAgfVxuXG4gICAgaWYgKGNhblBvc3QpIHtcbiAgICAgICAgdmFyIHF1ZXVlID0gW107XG4gICAgICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZnVuY3Rpb24gKGV2KSB7XG4gICAgICAgICAgICB2YXIgc291cmNlID0gZXYuc291cmNlO1xuICAgICAgICAgICAgaWYgKChzb3VyY2UgPT09IHdpbmRvdyB8fCBzb3VyY2UgPT09IG51bGwpICYmIGV2LmRhdGEgPT09ICdwcm9jZXNzLXRpY2snKSB7XG4gICAgICAgICAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgaWYgKHF1ZXVlLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGZuID0gcXVldWUuc2hpZnQoKTtcbiAgICAgICAgICAgICAgICAgICAgZm4oKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sIHRydWUpO1xuXG4gICAgICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICAgICAgcXVldWUucHVzaChmbik7XG4gICAgICAgICAgICB3aW5kb3cucG9zdE1lc3NhZ2UoJ3Byb2Nlc3MtdGljaycsICcqJyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZm4sIDApO1xuICAgIH07XG59KSgpO1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4vKiEgaHR0cDovL210aHMuYmUvcHVueWNvZGUgdjEuMi40IGJ5IEBtYXRoaWFzICovXG47KGZ1bmN0aW9uKHJvb3QpIHtcblxuXHQvKiogRGV0ZWN0IGZyZWUgdmFyaWFibGVzICovXG5cdHZhciBmcmVlRXhwb3J0cyA9IHR5cGVvZiBleHBvcnRzID09ICdvYmplY3QnICYmIGV4cG9ydHM7XG5cdHZhciBmcmVlTW9kdWxlID0gdHlwZW9mIG1vZHVsZSA9PSAnb2JqZWN0JyAmJiBtb2R1bGUgJiZcblx0XHRtb2R1bGUuZXhwb3J0cyA9PSBmcmVlRXhwb3J0cyAmJiBtb2R1bGU7XG5cdHZhciBmcmVlR2xvYmFsID0gdHlwZW9mIGdsb2JhbCA9PSAnb2JqZWN0JyAmJiBnbG9iYWw7XG5cdGlmIChmcmVlR2xvYmFsLmdsb2JhbCA9PT0gZnJlZUdsb2JhbCB8fCBmcmVlR2xvYmFsLndpbmRvdyA9PT0gZnJlZUdsb2JhbCkge1xuXHRcdHJvb3QgPSBmcmVlR2xvYmFsO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBgcHVueWNvZGVgIG9iamVjdC5cblx0ICogQG5hbWUgcHVueWNvZGVcblx0ICogQHR5cGUgT2JqZWN0XG5cdCAqL1xuXHR2YXIgcHVueWNvZGUsXG5cblx0LyoqIEhpZ2hlc3QgcG9zaXRpdmUgc2lnbmVkIDMyLWJpdCBmbG9hdCB2YWx1ZSAqL1xuXHRtYXhJbnQgPSAyMTQ3NDgzNjQ3LCAvLyBha2EuIDB4N0ZGRkZGRkYgb3IgMl4zMS0xXG5cblx0LyoqIEJvb3RzdHJpbmcgcGFyYW1ldGVycyAqL1xuXHRiYXNlID0gMzYsXG5cdHRNaW4gPSAxLFxuXHR0TWF4ID0gMjYsXG5cdHNrZXcgPSAzOCxcblx0ZGFtcCA9IDcwMCxcblx0aW5pdGlhbEJpYXMgPSA3Mixcblx0aW5pdGlhbE4gPSAxMjgsIC8vIDB4ODBcblx0ZGVsaW1pdGVyID0gJy0nLCAvLyAnXFx4MkQnXG5cblx0LyoqIFJlZ3VsYXIgZXhwcmVzc2lvbnMgKi9cblx0cmVnZXhQdW55Y29kZSA9IC9eeG4tLS8sXG5cdHJlZ2V4Tm9uQVNDSUkgPSAvW14gLX5dLywgLy8gdW5wcmludGFibGUgQVNDSUkgY2hhcnMgKyBub24tQVNDSUkgY2hhcnNcblx0cmVnZXhTZXBhcmF0b3JzID0gL1xceDJFfFxcdTMwMDJ8XFx1RkYwRXxcXHVGRjYxL2csIC8vIFJGQyAzNDkwIHNlcGFyYXRvcnNcblxuXHQvKiogRXJyb3IgbWVzc2FnZXMgKi9cblx0ZXJyb3JzID0ge1xuXHRcdCdvdmVyZmxvdyc6ICdPdmVyZmxvdzogaW5wdXQgbmVlZHMgd2lkZXIgaW50ZWdlcnMgdG8gcHJvY2VzcycsXG5cdFx0J25vdC1iYXNpYyc6ICdJbGxlZ2FsIGlucHV0ID49IDB4ODAgKG5vdCBhIGJhc2ljIGNvZGUgcG9pbnQpJyxcblx0XHQnaW52YWxpZC1pbnB1dCc6ICdJbnZhbGlkIGlucHV0J1xuXHR9LFxuXG5cdC8qKiBDb252ZW5pZW5jZSBzaG9ydGN1dHMgKi9cblx0YmFzZU1pbnVzVE1pbiA9IGJhc2UgLSB0TWluLFxuXHRmbG9vciA9IE1hdGguZmxvb3IsXG5cdHN0cmluZ0Zyb21DaGFyQ29kZSA9IFN0cmluZy5mcm9tQ2hhckNvZGUsXG5cblx0LyoqIFRlbXBvcmFyeSB2YXJpYWJsZSAqL1xuXHRrZXk7XG5cblx0LyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblx0LyoqXG5cdCAqIEEgZ2VuZXJpYyBlcnJvciB1dGlsaXR5IGZ1bmN0aW9uLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gdHlwZSBUaGUgZXJyb3IgdHlwZS5cblx0ICogQHJldHVybnMge0Vycm9yfSBUaHJvd3MgYSBgUmFuZ2VFcnJvcmAgd2l0aCB0aGUgYXBwbGljYWJsZSBlcnJvciBtZXNzYWdlLlxuXHQgKi9cblx0ZnVuY3Rpb24gZXJyb3IodHlwZSkge1xuXHRcdHRocm93IFJhbmdlRXJyb3IoZXJyb3JzW3R5cGVdKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGdlbmVyaWMgYEFycmF5I21hcGAgdXRpbGl0eSBmdW5jdGlvbi5cblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtBcnJheX0gYXJyYXkgVGhlIGFycmF5IHRvIGl0ZXJhdGUgb3Zlci5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5IGFycmF5XG5cdCAqIGl0ZW0uXG5cdCAqIEByZXR1cm5zIHtBcnJheX0gQSBuZXcgYXJyYXkgb2YgdmFsdWVzIHJldHVybmVkIGJ5IHRoZSBjYWxsYmFjayBmdW5jdGlvbi5cblx0ICovXG5cdGZ1bmN0aW9uIG1hcChhcnJheSwgZm4pIHtcblx0XHR2YXIgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuXHRcdHdoaWxlIChsZW5ndGgtLSkge1xuXHRcdFx0YXJyYXlbbGVuZ3RoXSA9IGZuKGFycmF5W2xlbmd0aF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gYXJyYXk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzaW1wbGUgYEFycmF5I21hcGAtbGlrZSB3cmFwcGVyIHRvIHdvcmsgd2l0aCBkb21haW4gbmFtZSBzdHJpbmdzLlxuXHQgKiBAcHJpdmF0ZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZS5cblx0ICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uIHRoYXQgZ2V0cyBjYWxsZWQgZm9yIGV2ZXJ5XG5cdCAqIGNoYXJhY3Rlci5cblx0ICogQHJldHVybnMge0FycmF5fSBBIG5ldyBzdHJpbmcgb2YgY2hhcmFjdGVycyByZXR1cm5lZCBieSB0aGUgY2FsbGJhY2tcblx0ICogZnVuY3Rpb24uXG5cdCAqL1xuXHRmdW5jdGlvbiBtYXBEb21haW4oc3RyaW5nLCBmbikge1xuXHRcdHJldHVybiBtYXAoc3RyaW5nLnNwbGl0KHJlZ2V4U2VwYXJhdG9ycyksIGZuKS5qb2luKCcuJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBhcnJheSBjb250YWluaW5nIHRoZSBudW1lcmljIGNvZGUgcG9pbnRzIG9mIGVhY2ggVW5pY29kZVxuXHQgKiBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZy4gV2hpbGUgSmF2YVNjcmlwdCB1c2VzIFVDUy0yIGludGVybmFsbHksXG5cdCAqIHRoaXMgZnVuY3Rpb24gd2lsbCBjb252ZXJ0IGEgcGFpciBvZiBzdXJyb2dhdGUgaGFsdmVzIChlYWNoIG9mIHdoaWNoXG5cdCAqIFVDUy0yIGV4cG9zZXMgYXMgc2VwYXJhdGUgY2hhcmFjdGVycykgaW50byBhIHNpbmdsZSBjb2RlIHBvaW50LFxuXHQgKiBtYXRjaGluZyBVVEYtMTYuXG5cdCAqIEBzZWUgYHB1bnljb2RlLnVjczIuZW5jb2RlYFxuXHQgKiBAc2VlIDxodHRwOi8vbWF0aGlhc2J5bmVucy5iZS9ub3Rlcy9qYXZhc2NyaXB0LWVuY29kaW5nPlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGUudWNzMlxuXHQgKiBAbmFtZSBkZWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IHN0cmluZyBUaGUgVW5pY29kZSBpbnB1dCBzdHJpbmcgKFVDUy0yKS5cblx0ICogQHJldHVybnMge0FycmF5fSBUaGUgbmV3IGFycmF5IG9mIGNvZGUgcG9pbnRzLlxuXHQgKi9cblx0ZnVuY3Rpb24gdWNzMmRlY29kZShzdHJpbmcpIHtcblx0XHR2YXIgb3V0cHV0ID0gW10sXG5cdFx0ICAgIGNvdW50ZXIgPSAwLFxuXHRcdCAgICBsZW5ndGggPSBzdHJpbmcubGVuZ3RoLFxuXHRcdCAgICB2YWx1ZSxcblx0XHQgICAgZXh0cmE7XG5cdFx0d2hpbGUgKGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdHZhbHVlID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdGlmICh2YWx1ZSA+PSAweEQ4MDAgJiYgdmFsdWUgPD0gMHhEQkZGICYmIGNvdW50ZXIgPCBsZW5ndGgpIHtcblx0XHRcdFx0Ly8gaGlnaCBzdXJyb2dhdGUsIGFuZCB0aGVyZSBpcyBhIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdGV4dHJhID0gc3RyaW5nLmNoYXJDb2RlQXQoY291bnRlcisrKTtcblx0XHRcdFx0aWYgKChleHRyYSAmIDB4RkMwMCkgPT0gMHhEQzAwKSB7IC8vIGxvdyBzdXJyb2dhdGVcblx0XHRcdFx0XHRvdXRwdXQucHVzaCgoKHZhbHVlICYgMHgzRkYpIDw8IDEwKSArIChleHRyYSAmIDB4M0ZGKSArIDB4MTAwMDApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVubWF0Y2hlZCBzdXJyb2dhdGU7IG9ubHkgYXBwZW5kIHRoaXMgY29kZSB1bml0LCBpbiBjYXNlIHRoZSBuZXh0XG5cdFx0XHRcdFx0Ly8gY29kZSB1bml0IGlzIHRoZSBoaWdoIHN1cnJvZ2F0ZSBvZiBhIHN1cnJvZ2F0ZSBwYWlyXG5cdFx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0XHRcdGNvdW50ZXItLTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0cHV0LnB1c2godmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBzdHJpbmcgYmFzZWQgb24gYW4gYXJyYXkgb2YgbnVtZXJpYyBjb2RlIHBvaW50cy5cblx0ICogQHNlZSBgcHVueWNvZGUudWNzMi5kZWNvZGVgXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZS51Y3MyXG5cdCAqIEBuYW1lIGVuY29kZVxuXHQgKiBAcGFyYW0ge0FycmF5fSBjb2RlUG9pbnRzIFRoZSBhcnJheSBvZiBudW1lcmljIGNvZGUgcG9pbnRzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgbmV3IFVuaWNvZGUgc3RyaW5nIChVQ1MtMikuXG5cdCAqL1xuXHRmdW5jdGlvbiB1Y3MyZW5jb2RlKGFycmF5KSB7XG5cdFx0cmV0dXJuIG1hcChhcnJheSwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRcdHZhciBvdXRwdXQgPSAnJztcblx0XHRcdGlmICh2YWx1ZSA+IDB4RkZGRikge1xuXHRcdFx0XHR2YWx1ZSAtPSAweDEwMDAwO1xuXHRcdFx0XHRvdXRwdXQgKz0gc3RyaW5nRnJvbUNoYXJDb2RlKHZhbHVlID4+PiAxMCAmIDB4M0ZGIHwgMHhEODAwKTtcblx0XHRcdFx0dmFsdWUgPSAweERDMDAgfCB2YWx1ZSAmIDB4M0ZGO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0ICs9IHN0cmluZ0Zyb21DaGFyQ29kZSh2YWx1ZSk7XG5cdFx0XHRyZXR1cm4gb3V0cHV0O1xuXHRcdH0pLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgYmFzaWMgY29kZSBwb2ludCBpbnRvIGEgZGlnaXQvaW50ZWdlci5cblx0ICogQHNlZSBgZGlnaXRUb0Jhc2ljKClgXG5cdCAqIEBwcml2YXRlXG5cdCAqIEBwYXJhbSB7TnVtYmVyfSBjb2RlUG9pbnQgVGhlIGJhc2ljIG51bWVyaWMgY29kZSBwb2ludCB2YWx1ZS5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIG51bWVyaWMgdmFsdWUgb2YgYSBiYXNpYyBjb2RlIHBvaW50IChmb3IgdXNlIGluXG5cdCAqIHJlcHJlc2VudGluZyBpbnRlZ2VycykgaW4gdGhlIHJhbmdlIGAwYCB0byBgYmFzZSAtIDFgLCBvciBgYmFzZWAgaWZcblx0ICogdGhlIGNvZGUgcG9pbnQgZG9lcyBub3QgcmVwcmVzZW50IGEgdmFsdWUuXG5cdCAqL1xuXHRmdW5jdGlvbiBiYXNpY1RvRGlnaXQoY29kZVBvaW50KSB7XG5cdFx0aWYgKGNvZGVQb2ludCAtIDQ4IDwgMTApIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSAyMjtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDY1IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA2NTtcblx0XHR9XG5cdFx0aWYgKGNvZGVQb2ludCAtIDk3IDwgMjYpIHtcblx0XHRcdHJldHVybiBjb2RlUG9pbnQgLSA5Nztcblx0XHR9XG5cdFx0cmV0dXJuIGJhc2U7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBkaWdpdC9pbnRlZ2VyIGludG8gYSBiYXNpYyBjb2RlIHBvaW50LlxuXHQgKiBAc2VlIGBiYXNpY1RvRGlnaXQoKWBcblx0ICogQHByaXZhdGVcblx0ICogQHBhcmFtIHtOdW1iZXJ9IGRpZ2l0IFRoZSBudW1lcmljIHZhbHVlIG9mIGEgYmFzaWMgY29kZSBwb2ludC5cblx0ICogQHJldHVybnMge051bWJlcn0gVGhlIGJhc2ljIGNvZGUgcG9pbnQgd2hvc2UgdmFsdWUgKHdoZW4gdXNlZCBmb3Jcblx0ICogcmVwcmVzZW50aW5nIGludGVnZXJzKSBpcyBgZGlnaXRgLCB3aGljaCBuZWVkcyB0byBiZSBpbiB0aGUgcmFuZ2Vcblx0ICogYDBgIHRvIGBiYXNlIC0gMWAuIElmIGBmbGFnYCBpcyBub24temVybywgdGhlIHVwcGVyY2FzZSBmb3JtIGlzXG5cdCAqIHVzZWQ7IGVsc2UsIHRoZSBsb3dlcmNhc2UgZm9ybSBpcyB1c2VkLiBUaGUgYmVoYXZpb3IgaXMgdW5kZWZpbmVkXG5cdCAqIGlmIGBmbGFnYCBpcyBub24temVybyBhbmQgYGRpZ2l0YCBoYXMgbm8gdXBwZXJjYXNlIGZvcm0uXG5cdCAqL1xuXHRmdW5jdGlvbiBkaWdpdFRvQmFzaWMoZGlnaXQsIGZsYWcpIHtcblx0XHQvLyAgMC4uMjUgbWFwIHRvIEFTQ0lJIGEuLnogb3IgQS4uWlxuXHRcdC8vIDI2Li4zNSBtYXAgdG8gQVNDSUkgMC4uOVxuXHRcdHJldHVybiBkaWdpdCArIDIyICsgNzUgKiAoZGlnaXQgPCAyNikgLSAoKGZsYWcgIT0gMCkgPDwgNSk7XG5cdH1cblxuXHQvKipcblx0ICogQmlhcyBhZGFwdGF0aW9uIGZ1bmN0aW9uIGFzIHBlciBzZWN0aW9uIDMuNCBvZiBSRkMgMzQ5Mi5cblx0ICogaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMzQ5MiNzZWN0aW9uLTMuNFxuXHQgKiBAcHJpdmF0ZVxuXHQgKi9cblx0ZnVuY3Rpb24gYWRhcHQoZGVsdGEsIG51bVBvaW50cywgZmlyc3RUaW1lKSB7XG5cdFx0dmFyIGsgPSAwO1xuXHRcdGRlbHRhID0gZmlyc3RUaW1lID8gZmxvb3IoZGVsdGEgLyBkYW1wKSA6IGRlbHRhID4+IDE7XG5cdFx0ZGVsdGEgKz0gZmxvb3IoZGVsdGEgLyBudW1Qb2ludHMpO1xuXHRcdGZvciAoLyogbm8gaW5pdGlhbGl6YXRpb24gKi87IGRlbHRhID4gYmFzZU1pbnVzVE1pbiAqIHRNYXggPj4gMTsgayArPSBiYXNlKSB7XG5cdFx0XHRkZWx0YSA9IGZsb29yKGRlbHRhIC8gYmFzZU1pbnVzVE1pbik7XG5cdFx0fVxuXHRcdHJldHVybiBmbG9vcihrICsgKGJhc2VNaW51c1RNaW4gKyAxKSAqIGRlbHRhIC8gKGRlbHRhICsgc2tldykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnRzIGEgUHVueWNvZGUgc3RyaW5nIG9mIEFTQ0lJLW9ubHkgc3ltYm9scyB0byBhIHN0cmluZyBvZiBVbmljb2RlXG5cdCAqIHN5bWJvbHMuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gaW5wdXQgVGhlIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSByZXN1bHRpbmcgc3RyaW5nIG9mIFVuaWNvZGUgc3ltYm9scy5cblx0ICovXG5cdGZ1bmN0aW9uIGRlY29kZShpbnB1dCkge1xuXHRcdC8vIERvbid0IHVzZSBVQ1MtMlxuXHRcdHZhciBvdXRwdXQgPSBbXSxcblx0XHQgICAgaW5wdXRMZW5ndGggPSBpbnB1dC5sZW5ndGgsXG5cdFx0ICAgIG91dCxcblx0XHQgICAgaSA9IDAsXG5cdFx0ICAgIG4gPSBpbml0aWFsTixcblx0XHQgICAgYmlhcyA9IGluaXRpYWxCaWFzLFxuXHRcdCAgICBiYXNpYyxcblx0XHQgICAgaixcblx0XHQgICAgaW5kZXgsXG5cdFx0ICAgIG9sZGksXG5cdFx0ICAgIHcsXG5cdFx0ICAgIGssXG5cdFx0ICAgIGRpZ2l0LFxuXHRcdCAgICB0LFxuXHRcdCAgICAvKiogQ2FjaGVkIGNhbGN1bGF0aW9uIHJlc3VsdHMgKi9cblx0XHQgICAgYmFzZU1pbnVzVDtcblxuXHRcdC8vIEhhbmRsZSB0aGUgYmFzaWMgY29kZSBwb2ludHM6IGxldCBgYmFzaWNgIGJlIHRoZSBudW1iZXIgb2YgaW5wdXQgY29kZVxuXHRcdC8vIHBvaW50cyBiZWZvcmUgdGhlIGxhc3QgZGVsaW1pdGVyLCBvciBgMGAgaWYgdGhlcmUgaXMgbm9uZSwgdGhlbiBjb3B5XG5cdFx0Ly8gdGhlIGZpcnN0IGJhc2ljIGNvZGUgcG9pbnRzIHRvIHRoZSBvdXRwdXQuXG5cblx0XHRiYXNpYyA9IGlucHV0Lmxhc3RJbmRleE9mKGRlbGltaXRlcik7XG5cdFx0aWYgKGJhc2ljIDwgMCkge1xuXHRcdFx0YmFzaWMgPSAwO1xuXHRcdH1cblxuXHRcdGZvciAoaiA9IDA7IGogPCBiYXNpYzsgKytqKSB7XG5cdFx0XHQvLyBpZiBpdCdzIG5vdCBhIGJhc2ljIGNvZGUgcG9pbnRcblx0XHRcdGlmIChpbnB1dC5jaGFyQ29kZUF0KGopID49IDB4ODApIHtcblx0XHRcdFx0ZXJyb3IoJ25vdC1iYXNpYycpO1xuXHRcdFx0fVxuXHRcdFx0b3V0cHV0LnB1c2goaW5wdXQuY2hhckNvZGVBdChqKSk7XG5cdFx0fVxuXG5cdFx0Ly8gTWFpbiBkZWNvZGluZyBsb29wOiBzdGFydCBqdXN0IGFmdGVyIHRoZSBsYXN0IGRlbGltaXRlciBpZiBhbnkgYmFzaWMgY29kZVxuXHRcdC8vIHBvaW50cyB3ZXJlIGNvcGllZDsgc3RhcnQgYXQgdGhlIGJlZ2lubmluZyBvdGhlcndpc2UuXG5cblx0XHRmb3IgKGluZGV4ID0gYmFzaWMgPiAwID8gYmFzaWMgKyAxIDogMDsgaW5kZXggPCBpbnB1dExlbmd0aDsgLyogbm8gZmluYWwgZXhwcmVzc2lvbiAqLykge1xuXG5cdFx0XHQvLyBgaW5kZXhgIGlzIHRoZSBpbmRleCBvZiB0aGUgbmV4dCBjaGFyYWN0ZXIgdG8gYmUgY29uc3VtZWQuXG5cdFx0XHQvLyBEZWNvZGUgYSBnZW5lcmFsaXplZCB2YXJpYWJsZS1sZW5ndGggaW50ZWdlciBpbnRvIGBkZWx0YWAsXG5cdFx0XHQvLyB3aGljaCBnZXRzIGFkZGVkIHRvIGBpYC4gVGhlIG92ZXJmbG93IGNoZWNraW5nIGlzIGVhc2llclxuXHRcdFx0Ly8gaWYgd2UgaW5jcmVhc2UgYGlgIGFzIHdlIGdvLCB0aGVuIHN1YnRyYWN0IG9mZiBpdHMgc3RhcnRpbmdcblx0XHRcdC8vIHZhbHVlIGF0IHRoZSBlbmQgdG8gb2J0YWluIGBkZWx0YWAuXG5cdFx0XHRmb3IgKG9sZGkgPSBpLCB3ID0gMSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cblx0XHRcdFx0aWYgKGluZGV4ID49IGlucHV0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZXJyb3IoJ2ludmFsaWQtaW5wdXQnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRpZ2l0ID0gYmFzaWNUb0RpZ2l0KGlucHV0LmNoYXJDb2RlQXQoaW5kZXgrKykpO1xuXG5cdFx0XHRcdGlmIChkaWdpdCA+PSBiYXNlIHx8IGRpZ2l0ID4gZmxvb3IoKG1heEludCAtIGkpIC8gdykpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGkgKz0gZGlnaXQgKiB3O1xuXHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblxuXHRcdFx0XHRpZiAoZGlnaXQgPCB0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiYXNlTWludXNUID0gYmFzZSAtIHQ7XG5cdFx0XHRcdGlmICh3ID4gZmxvb3IobWF4SW50IC8gYmFzZU1pbnVzVCkpIHtcblx0XHRcdFx0XHRlcnJvcignb3ZlcmZsb3cnKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHcgKj0gYmFzZU1pbnVzVDtcblxuXHRcdFx0fVxuXG5cdFx0XHRvdXQgPSBvdXRwdXQubGVuZ3RoICsgMTtcblx0XHRcdGJpYXMgPSBhZGFwdChpIC0gb2xkaSwgb3V0LCBvbGRpID09IDApO1xuXG5cdFx0XHQvLyBgaWAgd2FzIHN1cHBvc2VkIHRvIHdyYXAgYXJvdW5kIGZyb20gYG91dGAgdG8gYDBgLFxuXHRcdFx0Ly8gaW5jcmVtZW50aW5nIGBuYCBlYWNoIHRpbWUsIHNvIHdlJ2xsIGZpeCB0aGF0IG5vdzpcblx0XHRcdGlmIChmbG9vcihpIC8gb3V0KSA+IG1heEludCAtIG4pIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdG4gKz0gZmxvb3IoaSAvIG91dCk7XG5cdFx0XHRpICU9IG91dDtcblxuXHRcdFx0Ly8gSW5zZXJ0IGBuYCBhdCBwb3NpdGlvbiBgaWAgb2YgdGhlIG91dHB1dFxuXHRcdFx0b3V0cHV0LnNwbGljZShpKyssIDAsIG4pO1xuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVjczJlbmNvZGUob3V0cHV0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIHN0cmluZyBvZiBVbmljb2RlIHN5bWJvbHMgdG8gYSBQdW55Y29kZSBzdHJpbmcgb2YgQVNDSUktb25seVxuXHQgKiBzeW1ib2xzLlxuXHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0ICogQHBhcmFtIHtTdHJpbmd9IGlucHV0IFRoZSBzdHJpbmcgb2YgVW5pY29kZSBzeW1ib2xzLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgcmVzdWx0aW5nIFB1bnljb2RlIHN0cmluZyBvZiBBU0NJSS1vbmx5IHN5bWJvbHMuXG5cdCAqL1xuXHRmdW5jdGlvbiBlbmNvZGUoaW5wdXQpIHtcblx0XHR2YXIgbixcblx0XHQgICAgZGVsdGEsXG5cdFx0ICAgIGhhbmRsZWRDUENvdW50LFxuXHRcdCAgICBiYXNpY0xlbmd0aCxcblx0XHQgICAgYmlhcyxcblx0XHQgICAgaixcblx0XHQgICAgbSxcblx0XHQgICAgcSxcblx0XHQgICAgayxcblx0XHQgICAgdCxcblx0XHQgICAgY3VycmVudFZhbHVlLFxuXHRcdCAgICBvdXRwdXQgPSBbXSxcblx0XHQgICAgLyoqIGBpbnB1dExlbmd0aGAgd2lsbCBob2xkIHRoZSBudW1iZXIgb2YgY29kZSBwb2ludHMgaW4gYGlucHV0YC4gKi9cblx0XHQgICAgaW5wdXRMZW5ndGgsXG5cdFx0ICAgIC8qKiBDYWNoZWQgY2FsY3VsYXRpb24gcmVzdWx0cyAqL1xuXHRcdCAgICBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsXG5cdFx0ICAgIGJhc2VNaW51c1QsXG5cdFx0ICAgIHFNaW51c1Q7XG5cblx0XHQvLyBDb252ZXJ0IHRoZSBpbnB1dCBpbiBVQ1MtMiB0byBVbmljb2RlXG5cdFx0aW5wdXQgPSB1Y3MyZGVjb2RlKGlucHV0KTtcblxuXHRcdC8vIENhY2hlIHRoZSBsZW5ndGhcblx0XHRpbnB1dExlbmd0aCA9IGlucHV0Lmxlbmd0aDtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHN0YXRlXG5cdFx0biA9IGluaXRpYWxOO1xuXHRcdGRlbHRhID0gMDtcblx0XHRiaWFzID0gaW5pdGlhbEJpYXM7XG5cblx0XHQvLyBIYW5kbGUgdGhlIGJhc2ljIGNvZGUgcG9pbnRzXG5cdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IGlucHV0W2pdO1xuXHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IDB4ODApIHtcblx0XHRcdFx0b3V0cHV0LnB1c2goc3RyaW5nRnJvbUNoYXJDb2RlKGN1cnJlbnRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGhhbmRsZWRDUENvdW50ID0gYmFzaWNMZW5ndGggPSBvdXRwdXQubGVuZ3RoO1xuXG5cdFx0Ly8gYGhhbmRsZWRDUENvdW50YCBpcyB0aGUgbnVtYmVyIG9mIGNvZGUgcG9pbnRzIHRoYXQgaGF2ZSBiZWVuIGhhbmRsZWQ7XG5cdFx0Ly8gYGJhc2ljTGVuZ3RoYCBpcyB0aGUgbnVtYmVyIG9mIGJhc2ljIGNvZGUgcG9pbnRzLlxuXG5cdFx0Ly8gRmluaXNoIHRoZSBiYXNpYyBzdHJpbmcgLSBpZiBpdCBpcyBub3QgZW1wdHkgLSB3aXRoIGEgZGVsaW1pdGVyXG5cdFx0aWYgKGJhc2ljTGVuZ3RoKSB7XG5cdFx0XHRvdXRwdXQucHVzaChkZWxpbWl0ZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1haW4gZW5jb2RpbmcgbG9vcDpcblx0XHR3aGlsZSAoaGFuZGxlZENQQ291bnQgPCBpbnB1dExlbmd0aCkge1xuXG5cdFx0XHQvLyBBbGwgbm9uLWJhc2ljIGNvZGUgcG9pbnRzIDwgbiBoYXZlIGJlZW4gaGFuZGxlZCBhbHJlYWR5LiBGaW5kIHRoZSBuZXh0XG5cdFx0XHQvLyBsYXJnZXIgb25lOlxuXHRcdFx0Zm9yIChtID0gbWF4SW50LCBqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cdFx0XHRcdGlmIChjdXJyZW50VmFsdWUgPj0gbiAmJiBjdXJyZW50VmFsdWUgPCBtKSB7XG5cdFx0XHRcdFx0bSA9IGN1cnJlbnRWYWx1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmNyZWFzZSBgZGVsdGFgIGVub3VnaCB0byBhZHZhbmNlIHRoZSBkZWNvZGVyJ3MgPG4saT4gc3RhdGUgdG8gPG0sMD4sXG5cdFx0XHQvLyBidXQgZ3VhcmQgYWdhaW5zdCBvdmVyZmxvd1xuXHRcdFx0aGFuZGxlZENQQ291bnRQbHVzT25lID0gaGFuZGxlZENQQ291bnQgKyAxO1xuXHRcdFx0aWYgKG0gLSBuID4gZmxvb3IoKG1heEludCAtIGRlbHRhKSAvIGhhbmRsZWRDUENvdW50UGx1c09uZSkpIHtcblx0XHRcdFx0ZXJyb3IoJ292ZXJmbG93Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGRlbHRhICs9IChtIC0gbikgKiBoYW5kbGVkQ1BDb3VudFBsdXNPbmU7XG5cdFx0XHRuID0gbTtcblxuXHRcdFx0Zm9yIChqID0gMDsgaiA8IGlucHV0TGVuZ3RoOyArK2opIHtcblx0XHRcdFx0Y3VycmVudFZhbHVlID0gaW5wdXRbal07XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA8IG4gJiYgKytkZWx0YSA+IG1heEludCkge1xuXHRcdFx0XHRcdGVycm9yKCdvdmVyZmxvdycpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRWYWx1ZSA9PSBuKSB7XG5cdFx0XHRcdFx0Ly8gUmVwcmVzZW50IGRlbHRhIGFzIGEgZ2VuZXJhbGl6ZWQgdmFyaWFibGUtbGVuZ3RoIGludGVnZXJcblx0XHRcdFx0XHRmb3IgKHEgPSBkZWx0YSwgayA9IGJhc2U7IC8qIG5vIGNvbmRpdGlvbiAqLzsgayArPSBiYXNlKSB7XG5cdFx0XHRcdFx0XHR0ID0gayA8PSBiaWFzID8gdE1pbiA6IChrID49IGJpYXMgKyB0TWF4ID8gdE1heCA6IGsgLSBiaWFzKTtcblx0XHRcdFx0XHRcdGlmIChxIDwgdCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHFNaW51c1QgPSBxIC0gdDtcblx0XHRcdFx0XHRcdGJhc2VNaW51c1QgPSBiYXNlIC0gdDtcblx0XHRcdFx0XHRcdG91dHB1dC5wdXNoKFxuXHRcdFx0XHRcdFx0XHRzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHQgKyBxTWludXNUICUgYmFzZU1pbnVzVCwgMCkpXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdFx0cSA9IGZsb29yKHFNaW51c1QgLyBiYXNlTWludXNUKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRvdXRwdXQucHVzaChzdHJpbmdGcm9tQ2hhckNvZGUoZGlnaXRUb0Jhc2ljKHEsIDApKSk7XG5cdFx0XHRcdFx0YmlhcyA9IGFkYXB0KGRlbHRhLCBoYW5kbGVkQ1BDb3VudFBsdXNPbmUsIGhhbmRsZWRDUENvdW50ID09IGJhc2ljTGVuZ3RoKTtcblx0XHRcdFx0XHRkZWx0YSA9IDA7XG5cdFx0XHRcdFx0KytoYW5kbGVkQ1BDb3VudDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQrK2RlbHRhO1xuXHRcdFx0KytuO1xuXG5cdFx0fVxuXHRcdHJldHVybiBvdXRwdXQuam9pbignJyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYSBQdW55Y29kZSBzdHJpbmcgcmVwcmVzZW50aW5nIGEgZG9tYWluIG5hbWUgdG8gVW5pY29kZS4gT25seSB0aGVcblx0ICogUHVueWNvZGVkIHBhcnRzIG9mIHRoZSBkb21haW4gbmFtZSB3aWxsIGJlIGNvbnZlcnRlZCwgaS5lLiBpdCBkb2Vzbid0XG5cdCAqIG1hdHRlciBpZiB5b3UgY2FsbCBpdCBvbiBhIHN0cmluZyB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gY29udmVydGVkIHRvXG5cdCAqIFVuaWNvZGUuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBQdW55Y29kZSBkb21haW4gbmFtZSB0byBjb252ZXJ0IHRvIFVuaWNvZGUuXG5cdCAqIEByZXR1cm5zIHtTdHJpbmd9IFRoZSBVbmljb2RlIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBnaXZlbiBQdW55Y29kZVxuXHQgKiBzdHJpbmcuXG5cdCAqL1xuXHRmdW5jdGlvbiB0b1VuaWNvZGUoZG9tYWluKSB7XG5cdFx0cmV0dXJuIG1hcERvbWFpbihkb21haW4sIGZ1bmN0aW9uKHN0cmluZykge1xuXHRcdFx0cmV0dXJuIHJlZ2V4UHVueWNvZGUudGVzdChzdHJpbmcpXG5cdFx0XHRcdD8gZGVjb2RlKHN0cmluZy5zbGljZSg0KS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb252ZXJ0cyBhIFVuaWNvZGUgc3RyaW5nIHJlcHJlc2VudGluZyBhIGRvbWFpbiBuYW1lIHRvIFB1bnljb2RlLiBPbmx5IHRoZVxuXHQgKiBub24tQVNDSUkgcGFydHMgb2YgdGhlIGRvbWFpbiBuYW1lIHdpbGwgYmUgY29udmVydGVkLCBpLmUuIGl0IGRvZXNuJ3Rcblx0ICogbWF0dGVyIGlmIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCdzIGFscmVhZHkgaW4gQVNDSUkuXG5cdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHQgKiBAcGFyYW0ge1N0cmluZ30gZG9tYWluIFRoZSBkb21haW4gbmFtZSB0byBjb252ZXJ0LCBhcyBhIFVuaWNvZGUgc3RyaW5nLlxuXHQgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgUHVueWNvZGUgcmVwcmVzZW50YXRpb24gb2YgdGhlIGdpdmVuIGRvbWFpbiBuYW1lLlxuXHQgKi9cblx0ZnVuY3Rpb24gdG9BU0NJSShkb21haW4pIHtcblx0XHRyZXR1cm4gbWFwRG9tYWluKGRvbWFpbiwgZnVuY3Rpb24oc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4gcmVnZXhOb25BU0NJSS50ZXN0KHN0cmluZylcblx0XHRcdFx0PyAneG4tLScgKyBlbmNvZGUoc3RyaW5nKVxuXHRcdFx0XHQ6IHN0cmluZztcblx0XHR9KTtcblx0fVxuXG5cdC8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cdC8qKiBEZWZpbmUgdGhlIHB1YmxpYyBBUEkgKi9cblx0cHVueWNvZGUgPSB7XG5cdFx0LyoqXG5cdFx0ICogQSBzdHJpbmcgcmVwcmVzZW50aW5nIHRoZSBjdXJyZW50IFB1bnljb2RlLmpzIHZlcnNpb24gbnVtYmVyLlxuXHRcdCAqIEBtZW1iZXJPZiBwdW55Y29kZVxuXHRcdCAqIEB0eXBlIFN0cmluZ1xuXHRcdCAqL1xuXHRcdCd2ZXJzaW9uJzogJzEuMi40Jyxcblx0XHQvKipcblx0XHQgKiBBbiBvYmplY3Qgb2YgbWV0aG9kcyB0byBjb252ZXJ0IGZyb20gSmF2YVNjcmlwdCdzIGludGVybmFsIGNoYXJhY3RlclxuXHRcdCAqIHJlcHJlc2VudGF0aW9uIChVQ1MtMikgdG8gVW5pY29kZSBjb2RlIHBvaW50cywgYW5kIGJhY2suXG5cdFx0ICogQHNlZSA8aHR0cDovL21hdGhpYXNieW5lbnMuYmUvbm90ZXMvamF2YXNjcmlwdC1lbmNvZGluZz5cblx0XHQgKiBAbWVtYmVyT2YgcHVueWNvZGVcblx0XHQgKiBAdHlwZSBPYmplY3Rcblx0XHQgKi9cblx0XHQndWNzMic6IHtcblx0XHRcdCdkZWNvZGUnOiB1Y3MyZGVjb2RlLFxuXHRcdFx0J2VuY29kZSc6IHVjczJlbmNvZGVcblx0XHR9LFxuXHRcdCdkZWNvZGUnOiBkZWNvZGUsXG5cdFx0J2VuY29kZSc6IGVuY29kZSxcblx0XHQndG9BU0NJSSc6IHRvQVNDSUksXG5cdFx0J3RvVW5pY29kZSc6IHRvVW5pY29kZVxuXHR9O1xuXG5cdC8qKiBFeHBvc2UgYHB1bnljb2RlYCAqL1xuXHQvLyBTb21lIEFNRCBidWlsZCBvcHRpbWl6ZXJzLCBsaWtlIHIuanMsIGNoZWNrIGZvciBzcGVjaWZpYyBjb25kaXRpb24gcGF0dGVybnNcblx0Ly8gbGlrZSB0aGUgZm9sbG93aW5nOlxuXHRpZiAoXG5cdFx0dHlwZW9mIGRlZmluZSA9PSAnZnVuY3Rpb24nICYmXG5cdFx0dHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiZcblx0XHRkZWZpbmUuYW1kXG5cdCkge1xuXHRcdGRlZmluZSgncHVueWNvZGUnLCBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBwdW55Y29kZTtcblx0XHR9KTtcblx0fSBlbHNlIGlmIChmcmVlRXhwb3J0cyAmJiAhZnJlZUV4cG9ydHMubm9kZVR5cGUpIHtcblx0XHRpZiAoZnJlZU1vZHVsZSkgeyAvLyBpbiBOb2RlLmpzIG9yIFJpbmdvSlMgdjAuOC4wK1xuXHRcdFx0ZnJlZU1vZHVsZS5leHBvcnRzID0gcHVueWNvZGU7XG5cdFx0fSBlbHNlIHsgLy8gaW4gTmFyd2hhbCBvciBSaW5nb0pTIHYwLjcuMC1cblx0XHRcdGZvciAoa2V5IGluIHB1bnljb2RlKSB7XG5cdFx0XHRcdHB1bnljb2RlLmhhc093blByb3BlcnR5KGtleSkgJiYgKGZyZWVFeHBvcnRzW2tleV0gPSBwdW55Y29kZVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdH0gZWxzZSB7IC8vIGluIFJoaW5vIG9yIGEgd2ViIGJyb3dzZXJcblx0XHRyb290LnB1bnljb2RlID0gcHVueWNvZGU7XG5cdH1cblxufSh0aGlzKSk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxuLy8gSWYgb2JqLmhhc093blByb3BlcnR5IGhhcyBiZWVuIG92ZXJyaWRkZW4sIHRoZW4gY2FsbGluZ1xuLy8gb2JqLmhhc093blByb3BlcnR5KHByb3ApIHdpbGwgYnJlYWsuXG4vLyBTZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9qb3llbnQvbm9kZS9pc3N1ZXMvMTcwN1xuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihxcywgc2VwLCBlcSwgb3B0aW9ucykge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgdmFyIG9iaiA9IHt9O1xuXG4gIGlmICh0eXBlb2YgcXMgIT09ICdzdHJpbmcnIHx8IHFzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBvYmo7XG4gIH1cblxuICB2YXIgcmVnZXhwID0gL1xcKy9nO1xuICBxcyA9IHFzLnNwbGl0KHNlcCk7XG5cbiAgdmFyIG1heEtleXMgPSAxMDAwO1xuICBpZiAob3B0aW9ucyAmJiB0eXBlb2Ygb3B0aW9ucy5tYXhLZXlzID09PSAnbnVtYmVyJykge1xuICAgIG1heEtleXMgPSBvcHRpb25zLm1heEtleXM7XG4gIH1cblxuICB2YXIgbGVuID0gcXMubGVuZ3RoO1xuICAvLyBtYXhLZXlzIDw9IDAgbWVhbnMgdGhhdCB3ZSBzaG91bGQgbm90IGxpbWl0IGtleXMgY291bnRcbiAgaWYgKG1heEtleXMgPiAwICYmIGxlbiA+IG1heEtleXMpIHtcbiAgICBsZW4gPSBtYXhLZXlzO1xuICB9XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSkge1xuICAgIHZhciB4ID0gcXNbaV0ucmVwbGFjZShyZWdleHAsICclMjAnKSxcbiAgICAgICAgaWR4ID0geC5pbmRleE9mKGVxKSxcbiAgICAgICAga3N0ciwgdnN0ciwgaywgdjtcblxuICAgIGlmIChpZHggPj0gMCkge1xuICAgICAga3N0ciA9IHguc3Vic3RyKDAsIGlkeCk7XG4gICAgICB2c3RyID0geC5zdWJzdHIoaWR4ICsgMSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtzdHIgPSB4O1xuICAgICAgdnN0ciA9ICcnO1xuICAgIH1cblxuICAgIGsgPSBkZWNvZGVVUklDb21wb25lbnQoa3N0cik7XG4gICAgdiA9IGRlY29kZVVSSUNvbXBvbmVudCh2c3RyKTtcblxuICAgIGlmICghaGFzT3duUHJvcGVydHkob2JqLCBrKSkge1xuICAgICAgb2JqW2tdID0gdjtcbiAgICB9IGVsc2UgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgb2JqW2tdLnB1c2godik7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ialtrXSA9IFtvYmpba10sIHZdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBvYmo7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBzdHJpbmdpZnlQcmltaXRpdmUgPSBmdW5jdGlvbih2KSB7XG4gIHN3aXRjaCAodHlwZW9mIHYpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHY7XG5cbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiB2ID8gJ3RydWUnIDogJ2ZhbHNlJztcblxuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gaXNGaW5pdGUodikgPyB2IDogJyc7XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuICcnO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iaiwgc2VwLCBlcSwgbmFtZSkge1xuICBzZXAgPSBzZXAgfHwgJyYnO1xuICBlcSA9IGVxIHx8ICc9JztcbiAgaWYgKG9iaiA9PT0gbnVsbCkge1xuICAgIG9iaiA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuICAgIHJldHVybiBtYXAob2JqZWN0S2V5cyhvYmopLCBmdW5jdGlvbihrKSB7XG4gICAgICB2YXIga3MgPSBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKGspKSArIGVxO1xuICAgICAgaWYgKGlzQXJyYXkob2JqW2tdKSkge1xuICAgICAgICByZXR1cm4gb2JqW2tdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZSh2KSk7XG4gICAgICAgIH0pLmpvaW4oc2VwKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqW2tdKSk7XG4gICAgICB9XG4gICAgfSkuam9pbihzZXApO1xuXG4gIH1cblxuICBpZiAoIW5hbWUpIHJldHVybiAnJztcbiAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUobmFtZSkpICsgZXEgK1xuICAgICAgICAgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmopKTtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuXG5mdW5jdGlvbiBtYXAgKHhzLCBmKSB7XG4gIGlmICh4cy5tYXApIHJldHVybiB4cy5tYXAoZik7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB4cy5sZW5ndGg7IGkrKykge1xuICAgIHJlcy5wdXNoKGYoeHNbaV0sIGkpKTtcbiAgfVxuICByZXR1cm4gcmVzO1xufVxuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIHJlcy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbmV4cG9ydHMuZGVjb2RlID0gZXhwb3J0cy5wYXJzZSA9IHJlcXVpcmUoJy4vZGVjb2RlJyk7XG5leHBvcnRzLmVuY29kZSA9IGV4cG9ydHMuc3RyaW5naWZ5ID0gcmVxdWlyZSgnLi9lbmNvZGUnKTtcbiIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGFib3V0KGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcIndoeS10YXVudXMtXFxcIj5XaHkgVGF1bnVzPzwvaDE+XFxuPHA+VGF1bnVzIGZvY3VzZXMgb24gZGVsaXZlcmluZyBhIHByb2dyZXNzaXZlbHkgZW5oYW5jZWQgZXhwZXJpZW5jZSB0byB0aGUgZW5kLXVzZXIsIHdoaWxlIHByb3ZpZGluZyA8ZW0+YSByZWFzb25hYmxlIGRldmVsb3BtZW50IGV4cGVyaWVuY2U8L2VtPiBhcyB3ZWxsLiA8c3Ryb25nPlRhdW51cyBwcmlvcml0aXplcyBjb250ZW50PC9zdHJvbmc+LiBJdCB1c2VzIHNlcnZlci1zaWRlIHJlbmRlcmluZyB0byBnZXQgY29udGVudCB0byB5b3VyIGh1bWFucyBhcyBmYXN0IGFzIHBvc3NpYmxlLCBhbmQgaXQgdXNlcyBjbGllbnQtc2lkZSByZW5kZXJpbmcgdG8gaW1wcm92ZSB0aGVpciBleHBlcmllbmNlLjwvcD5cXG48cD5XaGlsZSBpdCBmb2N1c2VzIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCA8c3Ryb25nPjxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9hcnRpY2xlcy9hZGp1c3RpbmctdXgtZm9yLWh1bWFuc1xcXCI+dXNhYmlsaXR5PC9hPiBhbmQgcGVyZm9ybWFuY2UgYXJlIGJvdGggY29yZSBjb25jZXJuczwvc3Ryb25nPiBmb3IgVGF1bnVzLiBJbmNpZGVudGFsbHksIGZvY3VzaW5nIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGFsc28gaW1wcm92ZXMgYm90aCBvZiB0aGVzZS4gVXNhYmlsaXR5IGlzIGltcHJvdmVkIGJlY2F1c2UgdGhlIGV4cGVyaWVuY2UgaXMgZ3JhZHVhbGx5IGltcHJvdmVkLCBtZWFuaW5nIHRoYXQgaWYgc29tZXdoZXJlIGFsb25nIHRoZSBsaW5lIGEgZmVhdHVyZSBpcyBtaXNzaW5nLCB0aGUgY29tcG9uZW50IGlzIDxzdHJvbmc+c3RpbGwgZXhwZWN0ZWQgdG8gd29yazwvc3Ryb25nPi48L3A+XFxuPHA+Rm9yIGV4YW1wbGUsIGEgcHJvZ3Jlc3NpdmVseSBlbmhhbmNlZCBzaXRlIHVzZXMgcGxhaW4tb2xkIGxpbmtzIHRvIG5hdmlnYXRlIGZyb20gb25lIHZpZXcgdG8gYW5vdGhlciwgYW5kIHRoZW4gYWRkcyBhIDxjb2RlPmNsaWNrPC9jb2RlPiBldmVudCBoYW5kbGVyIHRoYXQgYmxvY2tzIG5hdmlnYXRpb24gYW5kIGlzc3VlcyBhbiBBSkFYIHJlcXVlc3QgaW5zdGVhZC4gSWYgSmF2YVNjcmlwdCBmYWlscyB0byBsb2FkLCBwZXJoYXBzIHRoZSBleHBlcmllbmNlIG1pZ2h0IHN0YXkgYSBsaXR0bGUgYml0IHdvcnNlLCBidXQgdGhhdCYjMzk7cyBva2F5LCBiZWNhdXNlIHdlIGFja25vd2xlZGdlIHRoYXQgPHN0cm9uZz5vdXIgc2l0ZXMgZG9uJiMzOTt0IG5lZWQgdG8gbG9vayBhbmQgYmVoYXZlIHRoZSBzYW1lIG9uIGV2ZXJ5IGJyb3dzZXI8L3N0cm9uZz4uIFNpbWlsYXJseSwgPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2NyaXRpY2FsLXBhdGgtcGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxcIj5wZXJmb3JtYW5jZSBpcyBncmVhdGx5IGVuaGFuY2VkPC9hPiBieSBkZWxpdmVyaW5nIGNvbnRlbnQgdG8gdGhlIGh1bWFuIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCB0aGVuIGFkZGluZyBmdW5jdGlvbmFsaXR5IG9uIHRvcCBvZiB0aGF0LjwvcD5cXG48cD5XaXRoIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50LCBpZiB0aGUgZnVuY3Rpb25hbGl0eSBuZXZlciBnZXRzIHRoZXJlIGJlY2F1c2UgYSBKYXZhU2NyaXB0IHJlc291cmNlIGZhaWxlZCB0byBsb2FkIGJlY2F1c2UgdGhlIG5ldHdvcmsgZmFpbGVkIDxlbT4obm90IHVuY29tbW9uIGluIHRoZSBtb2JpbGUgZXJhKTwvZW0+IG9yIGJlY2F1c2UgdGhlIHVzZXIgYmxvY2tlZCBKYXZhU2NyaXB0LCB5b3VyIGFwcGxpY2F0aW9uIHdpbGwgc3RpbGwgd29yayE8L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwid2h5LW5vdC1vdGhlci1mcmFtZXdvcmtzLVxcXCI+V2h5IE5vdCBPdGhlciBGcmFtZXdvcmtzPzwvaDE+XFxuPHA+TWFueSBvdGhlciBmcmFtZXdvcmtzIHdlcmVuJiMzOTt0IGRlc2lnbmVkIHdpdGggc2hhcmVkLXJlbmRlcmluZyBpbiBtaW5kLiBDb250ZW50IGlzbiYjMzk7dCBwcmlvcml0aXplZCwgYW5kIGh1bWFucyBhcmUgZXhwZWN0ZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcXCI+ZG93bmxvYWQgbW9zdCBvZiBhIHdlYiBwYWdlIGJlZm9yZSB0aGV5IGNhbiBzZWUgYW55IGh1bWFuLWRpZ2VzdGlibGUgY29udGVudDwvYT4uIFdoaWxlIEdvb2dsZSBpcyBnb2luZyB0byByZXNvbHZlIHRoZSBTRU8gaXNzdWVzIHdpdGggZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBzb29uLCBTRU8gaXMgYWxzbyBhIHByb2JsZW0uIEdvb2dsZSBpc24mIzM5O3QgdGhlIG9ubHkgd2ViIGNyYXdsZXIgb3BlcmF0b3Igb3V0IHRoZXJlLCBhbmQgaXQgbWlnaHQgYmUgYSB3aGlsZSBiZWZvcmUgc29jaWFsIG1lZGlhIGxpbmsgY3Jhd2xlcnMgY2F0Y2ggdXAgd2l0aCB0aGVtLjwvcD5cXG48cD5MYXRlbHksIHdlIGNhbiBvYnNlcnZlIG1hbnkgbWF0dXJlIG9wZW4tc291cmNlIGZyYW1ld29ya3MgYXJlIGRyb3BwaW5nIHN1cHBvcnQgZm9yIG9sZGVyIGJyb3dzZXJzLiBUaGlzIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIG9mIHRoZSB3YXkgdGhleSYjMzk7cmUgYXJjaGl0ZWN0ZWQsIHdoZXJlIHRoZSBkZXZlbG9wZXIgaXMgcHV0IGZpcnN0LiA8c3Ryb25nPlRhdW51cyBpcyA8YSBocmVmPVxcXCJodHRwczovL3R3aXR0ZXIuY29tL2hhc2h0YWcvaHVtYW5maXJzdFxcXCI+I2h1bWFuZmlyc3Q8L2E+PC9zdHJvbmc+LCBtZWFuaW5nIHRoYXQgaXQgY29uY2VkZXMgdGhhdCBodW1hbnMgYXJlIG1vcmUgaW1wb3J0YW50IHRoYW4gdGhlIGRldmVsb3BlcnMgYnVpbGRpbmcgdGhlaXIgYXBwbGljYXRpb25zLjwvcD5cXG48cD5Qcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGFwcGxpY2F0aW9ucyBhcmUgYWx3YXlzIGdvaW5nIHRvIGhhdmUgZ3JlYXQgYnJvd3NlciBzdXBwb3J0IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5JiMzOTtyZSBhcmNoaXRlY3RlZC4gQXMgdGhlIG5hbWUgaW1wbGllcywgYSBiYXNlbGluZSBpcyBlc3RhYmxpc2hlZCB3aGVyZSB3ZSBkZWxpdmVyIHRoZSBjb3JlIGV4cGVyaWVuY2UgdG8gdGhlIHVzZXIgPGVtPih0eXBpY2FsbHkgaW4gdGhlIGZvcm0gb2YgcmVhZGFibGUgSFRNTCBjb250ZW50KTwvZW0+LCBhbmQgdGhlbiBlbmhhbmNlIGl0IDxzdHJvbmc+aWYgcG9zc2libGU8L3N0cm9uZz4gdXNpbmcgQ1NTIGFuZCBKYXZhU2NyaXB0LiBCdWlsZGluZyBhcHBsaWNhdGlvbnMgaW4gdGhpcyB3YXkgbWVhbnMgdGhhdCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gcmVhY2ggdGhlIG1vc3QgcGVvcGxlIHdpdGggeW91ciBjb3JlIGV4cGVyaWVuY2UsIGFuZCB5b3UmIzM5O2xsIGFsc28gYmUgYWJsZSB0byBwcm92aWRlIGh1bWFucyBpbiBtb3JlIG1vZGVybiBicm93c2VycyB3aXRoIGFsbCBvZiB0aGUgbGF0ZXN0IGZlYXR1cmVzIGFuZCB0ZWNobm9sb2dpZXMuPC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDYsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImZlYXR1cmVzXFxcIj5GZWF0dXJlczwvaDE+XFxuPHA+T3V0IG9mIHRoZSBib3gsIFRhdW51cyBlbnN1cmVzIHRoYXQgeW91ciBzaXRlIHdvcmtzIG9uIGFueSBIVE1MLWVuYWJsZWQgZG9jdW1lbnQgdmlld2VyIGFuZCBldmVuIHRoZSB0ZXJtaW5hbCwgcHJvdmlkaW5nIHN1cHBvcnQgZm9yIHBsYWluIHRleHQgcmVzcG9uc2VzIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPndpdGhvdXQgYW55IGNvbmZpZ3VyYXRpb24gbmVlZGVkPC9hPi4gRXZlbiB3aGlsZSBUYXVudXMgcHJvdmlkZXMgc2hhcmVkLXJlbmRlcmluZyBjYXBhYmlsaXRpZXMsIGl0IG9mZmVycyBjb2RlIHJldXNlIG9mIHZpZXdzIGFuZCByb3V0ZXMsIG1lYW5pbmcgeW91JiMzOTtsbCBvbmx5IGhhdmUgdG8gZGVjbGFyZSB0aGVzZSBvbmNlIGJ1dCB0aGV5JiMzOTtsbCBiZSB1c2VkIGluIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGUuPC9wPlxcbjxwPlRhdW51cyBmZWF0dXJlcyBhIHJlYXNvbmFibHkgZW5oYW5jZWQgZXhwZXJpZW5jZSwgd2hlcmUgaWYgZmVhdHVyZXMgYXJlbiYjMzk7dCBhdmFpbGFibGUgb24gYSBicm93c2VyLCB0aGV5JiMzOTtyZSBqdXN0IG5vdCBwcm92aWRlZC4gRm9yIGV4YW1wbGUsIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgbWFrZXMgdXNlIG9mIHRoZSA8Y29kZT5oaXN0b3J5PC9jb2RlPiBBUEkgYnV0IGlmIHRoYXQmIzM5O3Mgbm90IGF2YWlsYWJsZSB0aGVuIGl0JiMzOTtsbCBmYWxsIGJhY2sgdG8gc2ltcGx5IG5vdCBtZWRkbGluZyB3aXRoIGxpbmtzIGluc3RlYWQgb2YgdXNpbmcgYSBjbGllbnQtc2lkZS1vbmx5IGhhc2ggcm91dGVyLjwvcD5cXG48cD5UYXVudXMgY2FuIGRlYWwgd2l0aCB2aWV3IGNhY2hpbmcgb24geW91ciBiZWhhbGYsIGlmIHlvdSBzbyBkZXNpcmUsIHVzaW5nIDxhIGhyZWY9XFxcImh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxcIj5hc3luY2hyb25vdXMgZW1iZWRkZWQgZGF0YWJhc2Ugc3RvcmVzPC9hPiBvbiB0aGUgY2xpZW50LXNpZGUuIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9aW5kZXhlZGRiXFxcIj5wcmV0dHkgZ29vZCBicm93c2VyIHN1cHBvcnQgZm9yIEluZGV4ZWREQjwvYT4uIE9mIGNvdXJzZSwgSW5kZXhlZERCIHdpbGwgb25seSBiZSB1c2VkIGlmIGl0JiMzOTtzIGF2YWlsYWJsZSwgYW5kIGlmIGl0JiMzOTtzIG5vdCB0aGVuIHZpZXdzIHdvbiYjMzk7dCBiZSBjYWNoZWQgaW4gdGhlIGNsaWVudC1zaWRlIGJlc2lkZXMgYW4gaW4tbWVtb3J5IHN0b3JlLiA8c3Ryb25nPlRoZSBzaXRlIHdvbiYjMzk7dCBzaW1wbHkgcm9sbCBvdmVyIGFuZCBkaWUsIHRob3VnaC48L3N0cm9uZz48L3A+XFxuPHA+SWYgeW91JiMzOTt2ZSB0dXJuZWQgY2xpZW50LXNpZGUgY2FjaGluZyBvbiwgdGhlbiB5b3UgY2FuIGFsc28gdHVybiBvbiB0aGUgPHN0cm9uZz52aWV3IHByZS1mZXRjaGluZyBmZWF0dXJlPC9zdHJvbmc+LCB3aGljaCB3aWxsIHN0YXJ0IGRvd25sb2FkaW5nIHZpZXdzIGFzIHNvb24gYXMgaHVtYW5zIGhvdmVyIG9uIGxpbmtzLCBhcyB0byBkZWxpdmVyIGEgPGVtPmZhc3RlciBwZXJjZWl2ZWQgaHVtYW4gZXhwZXJpZW5jZTwvZW0+LjwvcD5cXG48cD5UYXVudXMgcHJvdmlkZXMgdGhlIGJhcmUgYm9uZXMgZm9yIHlvdXIgYXBwbGljYXRpb24gc28gdGhhdCB5b3UgY2FuIHNlcGFyYXRlIGNvbmNlcm5zIGludG8gcm91dGVzLCBjb250cm9sbGVycywgbW9kZWxzLCBhbmQgdmlld3MuIFRoZW4gaXQgZ2V0cyBvdXQgb2YgdGhlIHdheSwgYnkgZGVzaWduLiBUaGVyZSBhcmUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5hIGZldyBjb21wbGVtZW50YXJ5IG1vZHVsZXM8L2E+IHlvdSBjYW4gdXNlIHRvIGVuaGFuY2UgeW91ciBkZXZlbG9wbWVudCBleHBlcmllbmNlLCBhcyB3ZWxsLjwvcD5cXG48cD5XaXRoIFRhdW51cyB5b3UmIzM5O2xsIGJlIGluIGNoYXJnZS4gPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+QXJlIHlvdSByZWFkeSB0byBnZXQgc3RhcnRlZD88L2E+PC9wPlxcblwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zZWN0aW9uPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hYm91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYWJvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImZhbWlsaWFyaXR5XFxcIj5GYW1pbGlhcml0eTwvaDE+XFxuPHA+WW91IGNhbiB1c2UgVGF1bnVzIHRvIGRldmVsb3AgYXBwbGljYXRpb25zIHVzaW5nIHlvdXIgZmF2b3JpdGUgTm9kZS5qcyBIVFRQIHNlcnZlciwgPHN0cm9uZz5ib3RoIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBhbmQgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IGFyZSBmdWxseSBzdXBwb3J0ZWQ8L3N0cm9uZz4uIEluIGJvdGggY2FzZXMsIHlvdSYjMzk7bGwgPGEgaHJlZj1cXFwiL2dldHRpbmctc3RhcnRlZFxcXCI+YnVpbGQgY29udHJvbGxlcnMgdGhlIHdheSB5b3UmIzM5O3JlIGFscmVhZHkgdXNlZCB0bzwvYT4sIGV4Y2VwdCB5b3Ugd29uJiMzOTt0IGhhdmUgdG8gPGNvZGU+cmVxdWlyZTwvY29kZT4gdGhlIHZpZXcgY29udHJvbGxlcnMgb3IgZGVmaW5lIGFueSB2aWV3IHJvdXRlcyBzaW5jZSBUYXVudXMgd2lsbCBkZWFsIHdpdGggdGhhdCBvbiB5b3VyIGJlaGFsZi4gSW4gdGhlIGNvbnRyb2xsZXJzIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBkbyBldmVyeXRoaW5nIHlvdSYjMzk7cmUgYWxyZWFkeSBhYmxlIHRvIGRvLCBhbmQgdGhlbiB5b3UmIzM5O2xsIGhhdmUgdG8gcmV0dXJuIGEgSlNPTiBtb2RlbCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIGEgdmlldy48L3A+XFxuPHA+WW91IGNhbiB1c2UgYW55IHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IHlvdSB3YW50LCBwcm92aWRlZCB0aGF0IGl0IGNhbiBiZSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLiBUaGF0JiMzOTtzIGJlY2F1c2UgVGF1bnVzIHRyZWF0cyB2aWV3cyBhcyBtZXJlIEphdmFTY3JpcHQgZnVuY3Rpb25zLCByYXRoZXIgdGhhbiBiZWluZyB0aWVkIGludG8gYSBzcGVjaWZpYyB2aWV3LXJlbmRlcmluZyBlbmdpbmUuPC9wPlxcbjxwPkNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBqdXN0IGZ1bmN0aW9ucywgdG9vLiBZb3UgY2FuIGJyaW5nIHlvdXIgb3duIHNlbGVjdG9yIGVuZ2luZSwgeW91ciBvd24gQUpBWCBsaWJyYXJpZXMsIGFuZCB5b3VyIG93biBkYXRhLWJpbmRpbmcgc29sdXRpb25zLiBJdCBtaWdodCBtZWFuIHRoZXJlJiMzOTtzIGEgYml0IG1vcmUgd29yayBpbnZvbHZlZCBmb3IgeW91LCBidXQgeW91JiMzOTtsbCBhbHNvIGJlIGZyZWUgdG8gcGljayB3aGF0ZXZlciBsaWJyYXJpZXMgeW91JiMzOTtyZSBtb3N0IGNvbWZvcnRhYmxlIHdpdGghIFRoYXQgYmVpbmcgc2FpZCwgVGF1bnVzIDxhIGhyZWY9XFxcIi9jb21wbGVtZW50c1xcXCI+ZG9lcyByZWNvbW1lbmQgYSBmZXcgbGlicmFyaWVzPC9hPiB0aGF0IHdvcmsgd2VsbCB3aXRoIGl0LjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFdoeSBUYXVudXM/XFxuXFxuICAgIFRhdW51cyBmb2N1c2VzIG9uIGRlbGl2ZXJpbmcgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGV4cGVyaWVuY2UgdG8gdGhlIGVuZC11c2VyLCB3aGlsZSBwcm92aWRpbmcgX2EgcmVhc29uYWJsZSBkZXZlbG9wbWVudCBleHBlcmllbmNlXyBhcyB3ZWxsLiAqKlRhdW51cyBwcmlvcml0aXplcyBjb250ZW50KiouIEl0IHVzZXMgc2VydmVyLXNpZGUgcmVuZGVyaW5nIHRvIGdldCBjb250ZW50IHRvIHlvdXIgaHVtYW5zIGFzIGZhc3QgYXMgcG9zc2libGUsIGFuZCBpdCB1c2VzIGNsaWVudC1zaWRlIHJlbmRlcmluZyB0byBpbXByb3ZlIHRoZWlyIGV4cGVyaWVuY2UuXFxuXFxuICAgIFdoaWxlIGl0IGZvY3VzZXMgb24gcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsICoqW3VzYWJpbGl0eV1bMl0gYW5kIHBlcmZvcm1hbmNlIGFyZSBib3RoIGNvcmUgY29uY2VybnMqKiBmb3IgVGF1bnVzLiBJbmNpZGVudGFsbHksIGZvY3VzaW5nIG9uIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50IGFsc28gaW1wcm92ZXMgYm90aCBvZiB0aGVzZS4gVXNhYmlsaXR5IGlzIGltcHJvdmVkIGJlY2F1c2UgdGhlIGV4cGVyaWVuY2UgaXMgZ3JhZHVhbGx5IGltcHJvdmVkLCBtZWFuaW5nIHRoYXQgaWYgc29tZXdoZXJlIGFsb25nIHRoZSBsaW5lIGEgZmVhdHVyZSBpcyBtaXNzaW5nLCB0aGUgY29tcG9uZW50IGlzICoqc3RpbGwgZXhwZWN0ZWQgdG8gd29yayoqLlxcblxcbiAgICBGb3IgZXhhbXBsZSwgYSBwcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIHNpdGUgdXNlcyBwbGFpbi1vbGQgbGlua3MgdG8gbmF2aWdhdGUgZnJvbSBvbmUgdmlldyB0byBhbm90aGVyLCBhbmQgdGhlbiBhZGRzIGEgYGNsaWNrYCBldmVudCBoYW5kbGVyIHRoYXQgYmxvY2tzIG5hdmlnYXRpb24gYW5kIGlzc3VlcyBhbiBBSkFYIHJlcXVlc3QgaW5zdGVhZC4gSWYgSmF2YVNjcmlwdCBmYWlscyB0byBsb2FkLCBwZXJoYXBzIHRoZSBleHBlcmllbmNlIG1pZ2h0IHN0YXkgYSBsaXR0bGUgYml0IHdvcnNlLCBidXQgdGhhdCdzIG9rYXksIGJlY2F1c2Ugd2UgYWNrbm93bGVkZ2UgdGhhdCAqKm91ciBzaXRlcyBkb24ndCBuZWVkIHRvIGxvb2sgYW5kIGJlaGF2ZSB0aGUgc2FtZSBvbiBldmVyeSBicm93c2VyKiouIFNpbWlsYXJseSwgW3BlcmZvcm1hbmNlIGlzIGdyZWF0bHkgZW5oYW5jZWRdWzFdIGJ5IGRlbGl2ZXJpbmcgY29udGVudCB0byB0aGUgaHVtYW4gYXMgZmFzdCBhcyBwb3NzaWJsZSwgYW5kIHRoZW4gYWRkaW5nIGZ1bmN0aW9uYWxpdHkgb24gdG9wIG9mIHRoYXQuXFxuXFxuICAgIFdpdGggcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQsIGlmIHRoZSBmdW5jdGlvbmFsaXR5IG5ldmVyIGdldHMgdGhlcmUgYmVjYXVzZSBhIEphdmFTY3JpcHQgcmVzb3VyY2UgZmFpbGVkIHRvIGxvYWQgYmVjYXVzZSB0aGUgbmV0d29yayBmYWlsZWQgXyhub3QgdW5jb21tb24gaW4gdGhlIG1vYmlsZSBlcmEpXyBvciBiZWNhdXNlIHRoZSB1c2VyIGJsb2NrZWQgSmF2YVNjcmlwdCwgeW91ciBhcHBsaWNhdGlvbiB3aWxsIHN0aWxsIHdvcmshXFxuXFxuICAgIFsxXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2NyaXRpY2FsLXBhdGgtcGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxuICAgIFsyXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL2FkanVzdGluZy11eC1mb3ItaHVtYW5zXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBXaHkgTm90IE90aGVyIEZyYW1ld29ya3M/XFxuXFxuICAgIE1hbnkgb3RoZXIgZnJhbWV3b3JrcyB3ZXJlbid0IGRlc2lnbmVkIHdpdGggc2hhcmVkLXJlbmRlcmluZyBpbiBtaW5kLiBDb250ZW50IGlzbid0IHByaW9yaXRpemVkLCBhbmQgaHVtYW5zIGFyZSBleHBlY3RlZCB0byBbZG93bmxvYWQgbW9zdCBvZiBhIHdlYiBwYWdlIGJlZm9yZSB0aGV5IGNhbiBzZWUgYW55IGh1bWFuLWRpZ2VzdGlibGUgY29udGVudF1bMl0uIFdoaWxlIEdvb2dsZSBpcyBnb2luZyB0byByZXNvbHZlIHRoZSBTRU8gaXNzdWVzIHdpdGggZGVkaWNhdGVkIGNsaWVudC1zaWRlIHJlbmRlcmluZyBzb29uLCBTRU8gaXMgYWxzbyBhIHByb2JsZW0uIEdvb2dsZSBpc24ndCB0aGUgb25seSB3ZWIgY3Jhd2xlciBvcGVyYXRvciBvdXQgdGhlcmUsIGFuZCBpdCBtaWdodCBiZSBhIHdoaWxlIGJlZm9yZSBzb2NpYWwgbWVkaWEgbGluayBjcmF3bGVycyBjYXRjaCB1cCB3aXRoIHRoZW0uXFxuXFxuICAgIExhdGVseSwgd2UgY2FuIG9ic2VydmUgbWFueSBtYXR1cmUgb3Blbi1zb3VyY2UgZnJhbWV3b3JrcyBhcmUgZHJvcHBpbmcgc3VwcG9ydCBmb3Igb2xkZXIgYnJvd3NlcnMuIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5J3JlIGFyY2hpdGVjdGVkLCB3aGVyZSB0aGUgZGV2ZWxvcGVyIGlzIHB1dCBmaXJzdC4gKipUYXVudXMgaXMgWyNodW1hbmZpcnN0XVsxXSoqLCBtZWFuaW5nIHRoYXQgaXQgY29uY2VkZXMgdGhhdCBodW1hbnMgYXJlIG1vcmUgaW1wb3J0YW50IHRoYW4gdGhlIGRldmVsb3BlcnMgYnVpbGRpbmcgdGhlaXIgYXBwbGljYXRpb25zLlxcblxcbiAgICBQcm9ncmVzc2l2ZWx5IGVuaGFuY2VkIGFwcGxpY2F0aW9ucyBhcmUgYWx3YXlzIGdvaW5nIHRvIGhhdmUgZ3JlYXQgYnJvd3NlciBzdXBwb3J0IGJlY2F1c2Ugb2YgdGhlIHdheSB0aGV5J3JlIGFyY2hpdGVjdGVkLiBBcyB0aGUgbmFtZSBpbXBsaWVzLCBhIGJhc2VsaW5lIGlzIGVzdGFibGlzaGVkIHdoZXJlIHdlIGRlbGl2ZXIgdGhlIGNvcmUgZXhwZXJpZW5jZSB0byB0aGUgdXNlciBfKHR5cGljYWxseSBpbiB0aGUgZm9ybSBvZiByZWFkYWJsZSBIVE1MIGNvbnRlbnQpXywgYW5kIHRoZW4gZW5oYW5jZSBpdCAqKmlmIHBvc3NpYmxlKiogdXNpbmcgQ1NTIGFuZCBKYXZhU2NyaXB0LiBCdWlsZGluZyBhcHBsaWNhdGlvbnMgaW4gdGhpcyB3YXkgbWVhbnMgdGhhdCB5b3UnbGwgYmUgYWJsZSB0byByZWFjaCB0aGUgbW9zdCBwZW9wbGUgd2l0aCB5b3VyIGNvcmUgZXhwZXJpZW5jZSwgYW5kIHlvdSdsbCBhbHNvIGJlIGFibGUgdG8gcHJvdmlkZSBodW1hbnMgaW4gbW9yZSBtb2Rlcm4gYnJvd3NlcnMgd2l0aCBhbGwgb2YgdGhlIGxhdGVzdCBmZWF0dXJlcyBhbmQgdGVjaG5vbG9naWVzLlxcblxcbiAgICBbMV06IGh0dHBzOi8vdHdpdHRlci5jb20vaGFzaHRhZy9odW1hbmZpcnN0XFxuICAgIFsyXTogaHR0cDovL3Bvbnlmb28uY29tL2FydGljbGVzL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcblxcbnNlY3Rpb24ubHktc2VjdGlvbi5tZC1tYXJrZG93blxcbiAgOm1hcmtkb3duXFxuICAgICMgRmVhdHVyZXNcXG5cXG4gICAgT3V0IG9mIHRoZSBib3gsIFRhdW51cyBlbnN1cmVzIHRoYXQgeW91ciBzaXRlIHdvcmtzIG9uIGFueSBIVE1MLWVuYWJsZWQgZG9jdW1lbnQgdmlld2VyIGFuZCBldmVuIHRoZSB0ZXJtaW5hbCwgcHJvdmlkaW5nIHN1cHBvcnQgZm9yIHBsYWluIHRleHQgcmVzcG9uc2VzIFt3aXRob3V0IGFueSBjb25maWd1cmF0aW9uIG5lZWRlZF1bMl0uIEV2ZW4gd2hpbGUgVGF1bnVzIHByb3ZpZGVzIHNoYXJlZC1yZW5kZXJpbmcgY2FwYWJpbGl0aWVzLCBpdCBvZmZlcnMgY29kZSByZXVzZSBvZiB2aWV3cyBhbmQgcm91dGVzLCBtZWFuaW5nIHlvdSdsbCBvbmx5IGhhdmUgdG8gZGVjbGFyZSB0aGVzZSBvbmNlIGJ1dCB0aGV5J2xsIGJlIHVzZWQgaW4gYm90aCB0aGUgc2VydmVyLXNpZGUgYW5kIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgVGF1bnVzIGZlYXR1cmVzIGEgcmVhc29uYWJseSBlbmhhbmNlZCBleHBlcmllbmNlLCB3aGVyZSBpZiBmZWF0dXJlcyBhcmVuJ3QgYXZhaWxhYmxlIG9uIGEgYnJvd3NlciwgdGhleSdyZSBqdXN0IG5vdCBwcm92aWRlZC4gRm9yIGV4YW1wbGUsIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgbWFrZXMgdXNlIG9mIHRoZSBgaGlzdG9yeWAgQVBJIGJ1dCBpZiB0aGF0J3Mgbm90IGF2YWlsYWJsZSB0aGVuIGl0J2xsIGZhbGwgYmFjayB0byBzaW1wbHkgbm90IG1lZGRsaW5nIHdpdGggbGlua3MgaW5zdGVhZCBvZiB1c2luZyBhIGNsaWVudC1zaWRlLW9ubHkgaGFzaCByb3V0ZXIuXFxuXFxuICAgIFRhdW51cyBjYW4gZGVhbCB3aXRoIHZpZXcgY2FjaGluZyBvbiB5b3VyIGJlaGFsZiwgaWYgeW91IHNvIGRlc2lyZSwgdXNpbmcgW2FzeW5jaHJvbm91cyBlbWJlZGRlZCBkYXRhYmFzZSBzdG9yZXNdWzNdIG9uIHRoZSBjbGllbnQtc2lkZS4gVHVybnMgb3V0LCB0aGVyZSdzIFtwcmV0dHkgZ29vZCBicm93c2VyIHN1cHBvcnQgZm9yIEluZGV4ZWREQl1bNF0uIE9mIGNvdXJzZSwgSW5kZXhlZERCIHdpbGwgb25seSBiZSB1c2VkIGlmIGl0J3MgYXZhaWxhYmxlLCBhbmQgaWYgaXQncyBub3QgdGhlbiB2aWV3cyB3b24ndCBiZSBjYWNoZWQgaW4gdGhlIGNsaWVudC1zaWRlIGJlc2lkZXMgYW4gaW4tbWVtb3J5IHN0b3JlLiAqKlRoZSBzaXRlIHdvbid0IHNpbXBseSByb2xsIG92ZXIgYW5kIGRpZSwgdGhvdWdoLioqXFxuXFxuICAgIElmIHlvdSd2ZSB0dXJuZWQgY2xpZW50LXNpZGUgY2FjaGluZyBvbiwgdGhlbiB5b3UgY2FuIGFsc28gdHVybiBvbiB0aGUgKip2aWV3IHByZS1mZXRjaGluZyBmZWF0dXJlKiosIHdoaWNoIHdpbGwgc3RhcnQgZG93bmxvYWRpbmcgdmlld3MgYXMgc29vbiBhcyBodW1hbnMgaG92ZXIgb24gbGlua3MsIGFzIHRvIGRlbGl2ZXIgYSBfZmFzdGVyIHBlcmNlaXZlZCBodW1hbiBleHBlcmllbmNlXy5cXG5cXG4gICAgVGF1bnVzIHByb3ZpZGVzIHRoZSBiYXJlIGJvbmVzIGZvciB5b3VyIGFwcGxpY2F0aW9uIHNvIHRoYXQgeW91IGNhbiBzZXBhcmF0ZSBjb25jZXJucyBpbnRvIHJvdXRlcywgY29udHJvbGxlcnMsIG1vZGVscywgYW5kIHZpZXdzLiBUaGVuIGl0IGdldHMgb3V0IG9mIHRoZSB3YXksIGJ5IGRlc2lnbi4gVGhlcmUgYXJlIFthIGZldyBjb21wbGVtZW50YXJ5IG1vZHVsZXNdWzFdIHlvdSBjYW4gdXNlIHRvIGVuaGFuY2UgeW91ciBkZXZlbG9wbWVudCBleHBlcmllbmNlLCBhcyB3ZWxsLlxcblxcbiAgICBXaXRoIFRhdW51cyB5b3UnbGwgYmUgaW4gY2hhcmdlLiBbQXJlIHlvdSByZWFkeSB0byBnZXQgc3RhcnRlZD9dWzJdXFxuXFxuICAgIFsxXTogL2NvbXBsZW1lbnRzXFxuICAgIFsyXTogL2dldHRpbmctc3RhcnRlZFxcbiAgICBbM106IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFs0XTogaHR0cDovL2Nhbml1c2UuY29tLyNzZWFyY2g9aW5kZXhlZGRiXFxuXFxuc2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBGYW1pbGlhcml0eVxcblxcbiAgICBZb3UgY2FuIHVzZSBUYXVudXMgdG8gZGV2ZWxvcCBhcHBsaWNhdGlvbnMgdXNpbmcgeW91ciBmYXZvcml0ZSBOb2RlLmpzIEhUVFAgc2VydmVyLCAqKmJvdGggW0V4cHJlc3NdWzNdIGFuZCBbSGFwaV1bNF0gYXJlIGZ1bGx5IHN1cHBvcnRlZCoqLiBJbiBib3RoIGNhc2VzLCB5b3UnbGwgW2J1aWxkIGNvbnRyb2xsZXJzIHRoZSB3YXkgeW91J3JlIGFscmVhZHkgdXNlZCB0b11bMV0sIGV4Y2VwdCB5b3Ugd29uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgdGhlIHZpZXcgY29udHJvbGxlcnMgb3IgZGVmaW5lIGFueSB2aWV3IHJvdXRlcyBzaW5jZSBUYXVudXMgd2lsbCBkZWFsIHdpdGggdGhhdCBvbiB5b3VyIGJlaGFsZi4gSW4gdGhlIGNvbnRyb2xsZXJzIHlvdSdsbCBiZSBhYmxlIHRvIGRvIGV2ZXJ5dGhpbmcgeW91J3JlIGFscmVhZHkgYWJsZSB0byBkbywgYW5kIHRoZW4geW91J2xsIGhhdmUgdG8gcmV0dXJuIGEgSlNPTiBtb2RlbCB3aGljaCB3aWxsIGJlIHVzZWQgdG8gcmVuZGVyIGEgdmlldy5cXG5cXG4gICAgWW91IGNhbiB1c2UgYW55IHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IHlvdSB3YW50LCBwcm92aWRlZCB0aGF0IGl0IGNhbiBiZSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLiBUaGF0J3MgYmVjYXVzZSBUYXVudXMgdHJlYXRzIHZpZXdzIGFzIG1lcmUgSmF2YVNjcmlwdCBmdW5jdGlvbnMsIHJhdGhlciB0aGFuIGJlaW5nIHRpZWQgaW50byBhIHNwZWNpZmljIHZpZXctcmVuZGVyaW5nIGVuZ2luZS5cXG5cXG4gICAgQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGp1c3QgZnVuY3Rpb25zLCB0b28uIFlvdSBjYW4gYnJpbmcgeW91ciBvd24gc2VsZWN0b3IgZW5naW5lLCB5b3VyIG93biBBSkFYIGxpYnJhcmllcywgYW5kIHlvdXIgb3duIGRhdGEtYmluZGluZyBzb2x1dGlvbnMuIEl0IG1pZ2h0IG1lYW4gdGhlcmUncyBhIGJpdCBtb3JlIHdvcmsgaW52b2x2ZWQgZm9yIHlvdSwgYnV0IHlvdSdsbCBhbHNvIGJlIGZyZWUgdG8gcGljayB3aGF0ZXZlciBsaWJyYXJpZXMgeW91J3JlIG1vc3QgY29tZm9ydGFibGUgd2l0aCEgVGhhdCBiZWluZyBzYWlkLCBUYXVudXMgW2RvZXMgcmVjb21tZW5kIGEgZmV3IGxpYnJhcmllc11bMl0gdGhhdCB3b3JrIHdlbGwgd2l0aCBpdC5cXG5cXG4gICAgWzFdOiAvZ2V0dGluZy1zdGFydGVkXFxuICAgIFsyXTogL2NvbXBsZW1lbnRzXFxuICAgIFszXTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzRdOiBodHRwOi8vaGFwaWpzLmNvbVxcblwiKTtcbn1cbn0iLCJ2YXIgamFkZSA9IHJlcXVpcmUoXCJqYWR1bS9ydW50aW1lXCIpO1xubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBhcGkobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCkge1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAwLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2FwaS5qYWRlXCIgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vYXBpLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDEgaWQ9XFxcImFwaS1kb2N1bWVudGF0aW9uXFxcIj5BUEkgRG9jdW1lbnRhdGlvbjwvaDE+XFxuPHA+SGVyZSYjMzk7cyB0aGUgQVBJIGRvY3VtZW50YXRpb24gZm9yIFRhdW51cy4gSWYgeW91JiMzOTt2ZSBuZXZlciB1c2VkIGl0IGJlZm9yZSwgd2UgcmVjb21tZW5kIGdvaW5nIG92ZXIgdGhlIDxhIGhyZWY9XFxcIi9nZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvYT4gZ3VpZGUgYmVmb3JlIGp1bXBpbmcgaW50byB0aGUgQVBJIGRvY3VtZW50YXRpb24uIFRoYXQgd2F5LCB5b3UmIzM5O2xsIGdldCBhIGJldHRlciBpZGVhIG9mIHdoYXQgdG8gbG9vayBmb3IgYW5kIGhvdyB0byBwdXQgdG9nZXRoZXIgc2ltcGxlIGFwcGxpY2F0aW9ucyB1c2luZyBUYXVudXMsIGJlZm9yZSBnb2luZyB0aHJvdWdoIGRvY3VtZW50YXRpb24gb24gZXZlcnkgcHVibGljIGludGVyZmFjZSB0byBUYXVudXMuPC9wPlxcbjxwPlRhdW51cyBleHBvc2VzIDxlbT50aHJlZSBkaWZmZXJlbnQgcHVibGljIEFQSXM8L2VtPiwgYW5kIHRoZXJlJiMzOTtzIGFsc28gPHN0cm9uZz5wbHVnaW5zIHRvIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyPC9zdHJvbmc+LiBUaGlzIGRvY3VtZW50IGNvdmVycyBhbGwgdGhyZWUgQVBJcyBleHRlbnNpdmVseS4gSWYgeW91JiMzOTtyZSBjb25jZXJuZWQgYWJvdXQgdGhlIGlubmVyIHdvcmtpbmdzIG9mIFRhdW51cywgcGxlYXNlIHJlZmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5HZXR0aW5nIFN0YXJ0ZWQ8L2E+IGd1aWRlLiBUaGlzIGRvY3VtZW50IGFpbXMgdG8gb25seSBjb3ZlciBob3cgdGhlIHB1YmxpYyBpbnRlcmZhY2UgYWZmZWN0cyBhcHBsaWNhdGlvbiBzdGF0ZSwgYnV0IDxzdHJvbmc+ZG9lc24mIzM5O3QgZGVsdmUgaW50byBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzPC9zdHJvbmc+LjwvcD5cXG48aDEgaWQ9XFxcInRhYmxlLW9mLWNvbnRlbnRzXFxcIj5UYWJsZSBvZiBDb250ZW50czwvaDE+XFxuPHVsPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNzZXJ2ZXItc2lkZS1hcGlcXFwiPnNlcnZlci1zaWRlIEFQSTwvYT4gdGhhdCBkZWFscyB3aXRoIHNlcnZlci1zaWRlIHJlbmRlcmluZzx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiBtZXRob2Q8dWw+XFxuPGxpPkl0cyA8YSBocmVmPVxcXCIjdGhlLW9wdGlvbnMtb2JqZWN0XFxcIj48Y29kZT5vcHRpb25zPC9jb2RlPjwvYT4gYXJndW1lbnQ8dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1sYXlvdXQtXFxcIj48Y29kZT5sYXlvdXQ8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1yb3V0ZXMtXFxcIj48Y29kZT5yb3V0ZXM8L2NvZGU+PC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiMtb3B0aW9ucy1nZXRkZWZhdWx0dmlld21vZGVsLVxcXCI+PGNvZGU+Z2V0RGVmYXVsdFZpZXdNb2RlbDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXBsYWludGV4dC1cXFwiPjxjb2RlPnBsYWludGV4dDwvY29kZT48L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiIy1vcHRpb25zLXJlc29sdmVycy1cXFwiPjxjb2RlPnJlc29sdmVyczwvY29kZT48L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPkl0cyA8YSBocmVmPVxcXCIjLWFkZHJvdXRlLWRlZmluaXRpb24tXFxcIj48Y29kZT5hZGRSb3V0ZTwvY29kZT48L2E+IGFyZ3VtZW50PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1yZW5kZXItYWN0aW9uLXZpZXdtb2RlbC1yZXEtcmVzLW5leHQtXFxcIj48Y29kZT50YXVudXMucmVuZGVyPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsLWRvbmUtXFxcIj48Y29kZT50YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWw8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+c3VpdGUgb2YgcGx1Z2luczwvYT4gY2FuIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyPHVsPlxcbjxsaT5Vc2luZyA8YSBocmVmPVxcXCIjdXNpbmctdGF1bnVzLWV4cHJlc3MtXFxcIj48Y29kZT50YXVudXMtZXhwcmVzczwvY29kZT48L2E+IGZvciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT48L2xpPlxcbjxsaT5Vc2luZyA8YSBocmVmPVxcXCIjdXNpbmctdGF1bnVzLWhhcGktXFxcIj48Y29kZT50YXVudXMtaGFwaTwvY29kZT48L2E+IGZvciA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+QSA8YSBocmVmPVxcXCIjY29tbWFuZC1saW5lLWludGVyZmFjZVxcXCI+Q0xJIHRoYXQgcHJvZHVjZXMgYSB3aXJpbmcgbW9kdWxlPC9hPiBmb3IgdGhlIGNsaWVudC1zaWRlPHVsPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1vdXRwdXQtXFxcIj48Y29kZT4tLW91dHB1dDwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy13YXRjaC1cXFwiPjxjb2RlPi0td2F0Y2g8L2NvZGU+PC9hPiBmbGFnPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdHJhbnNmb3JtLW1vZHVsZS1cXFwiPjxjb2RlPi0tdHJhbnNmb3JtICZsdDttb2R1bGUmZ3Q7PC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXJlc29sdmVycy1tb2R1bGUtXFxcIj48Y29kZT4tLXJlc29sdmVycyAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2E+IGZsYWc8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy1zdGFuZGFsb25lLVxcXCI+PGNvZGU+LS1zdGFuZGFsb25lPC9jb2RlPjwvYT4gZmxhZzwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5BIDxhIGhyZWY9XFxcIiNjbGllbnQtc2lkZS1hcGlcXFwiPmNsaWVudC1zaWRlIEFQSTwvYT4gdGhhdCBkZWFscyB3aXRoIGNsaWVudC1zaWRlIHJlbmRlcmluZzx1bD5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWNvbnRhaW5lci13aXJpbmctb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2E+IG1ldGhvZDx1bD5cXG48bGk+VXNpbmcgdGhlIDxhIGhyZWY9XFxcIiN1c2luZy10aGUtYXV0by1zdHJhdGVneVxcXCI+PGNvZGU+YXV0bzwvY29kZT48L2E+IHN0cmF0ZWd5PC9saT5cXG48bGk+VXNpbmcgdGhlIDxhIGhyZWY9XFxcIiN1c2luZy10aGUtaW5saW5lLXN0cmF0ZWd5XFxcIj48Y29kZT5pbmxpbmU8L2NvZGU+PC9hPiBzdHJhdGVneTwvbGk+XFxuPGxpPlVzaW5nIHRoZSA8YSBocmVmPVxcXCIjdXNpbmctdGhlLW1hbnVhbC1zdHJhdGVneVxcXCI+PGNvZGU+bWFudWFsPC9jb2RlPjwvYT4gc3RyYXRlZ3k8L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY2FjaGluZ1xcXCI+Q2FjaGluZzwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjcHJlZmV0Y2hpbmdcXFwiPlByZWZldGNoaW5nPC9hPjwvbGk+XFxuPC91bD5cXG48L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtb24tdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vbjwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1vbmNlLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub25jZTwvY29kZT48L2E+IG1ldGhvZDwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjLXRhdW51cy1vZmYtdHlwZS1mbi1cXFwiPjxjb2RlPnRhdW51cy5vZmY8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi1cXFwiPjxjb2RlPnRhdW51cy5pbnRlcmNlcHQ8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWw8L2NvZGU+PC9hPiBtZXRob2Q8L2xpPlxcbjxsaT5UaGUgPGEgaHJlZj1cXFwiIy10YXVudXMtbmF2aWdhdGUtdXJsLVxcXCI+PGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5zdGF0ZTwvY29kZT48L2E+IHByb3BlcnR5PC9saT5cXG48bGk+VGhlIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXN0YXRlLVxcXCI+PGNvZGU+dGF1bnVzLnJvdXRlPC9jb2RlPjwvYT4gbWV0aG9kPC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPlRoZSA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiBtYW5pZmVzdDwvbGk+XFxuPC91bD5cXG48aDEgaWQ9XFxcInNlcnZlci1zaWRlLWFwaVxcXCI+U2VydmVyLXNpZGUgQVBJPC9oMT5cXG48cD5UaGUgc2VydmVyLXNpZGUgQVBJIGlzIHVzZWQgdG8gc2V0IHVwIHRoZSB2aWV3IHJvdXRlci4gSXQgdGhlbiBnZXRzIG91dCBvZiB0aGUgd2F5LCBhbGxvd2luZyB0aGUgY2xpZW50LXNpZGUgdG8gZXZlbnR1YWxseSB0YWtlIG92ZXIgYW5kIGFkZCBhbnkgZXh0cmEgc3VnYXIgb24gdG9wLCA8ZW0+aW5jbHVkaW5nIGNsaWVudC1zaWRlIHJlbmRlcmluZzwvZW0+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPjxjb2RlPnRhdW51cy5tb3VudChhZGRSb3V0ZSwgb3B0aW9ucz8pPC9jb2RlPjwvaDI+XFxuPHA+TW91bnRzIFRhdW51cyBvbiB0b3Agb2YgYSBzZXJ2ZXItc2lkZSByb3V0ZXIsIGJ5IHJlZ2lzdGVyaW5nIGVhY2ggcm91dGUgaW4gPGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+IHdpdGggdGhlIDxjb2RlPmFkZFJvdXRlPC9jb2RlPiBtZXRob2QuPC9wPlxcbjxibG9ja3F1b3RlPlxcbjxwPk5vdGUgdGhhdCBtb3N0IG9mIHRoZSB0aW1lLCA8c3Ryb25nPnRoaXMgbWV0aG9kIHNob3VsZG4mIzM5O3QgYmUgaW52b2tlZCBkaXJlY3RseTwvc3Ryb25nPiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbnM8L2E+IHByZXNlbnRlZCBiZWxvdy48L3A+XFxuPC9ibG9ja3F1b3RlPlxcbjxwPkhlcmUmIzM5O3MgYW4gaW5jb21wbGV0ZSBleGFtcGxlIG9mIGhvdyB0aGlzIG1ldGhvZCBtYXkgYmUgdXNlZC4gSXQgaXMgaW5jb21wbGV0ZSBiZWNhdXNlIHJvdXRlIGRlZmluaXRpb25zIGhhdmUgbW9yZSBvcHRpb25zIGJleW9uZCB0aGUgPGNvZGU+cm91dGU8L2NvZGU+IGFuZCA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnRpZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPnRhdW51cy5tb3VudChhZGRSb3V0ZSwge1xcbiAgcm91dGVzOiBbeyByb3V0ZTogJiMzOTsvJiMzOTssIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTsgfV1cXG59KTtcXG5cXG5mdW5jdGlvbiBhZGRSb3V0ZSAoZGVmaW5pdGlvbikge1xcbiAgYXBwLmdldChkZWZpbml0aW9uLnJvdXRlLCBkZWZpbml0aW9uLmFjdGlvbik7XFxufVxcbjwvY29kZT48L3ByZT5cXG48cD5MZXQmIzM5O3MgZ28gb3ZlciB0aGUgb3B0aW9ucyB5b3UgY2FuIHBhc3MgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaXJzdC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ0aGUtb3B0aW9ucy1vYmplY3RcXFwiPlRoZSA8Y29kZT5vcHRpb25zPzwvY29kZT4gb2JqZWN0PC9oND5cXG48cD5UaGVyZSYjMzk7cyBhIGZldyBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byB0aGUgc2VydmVyLXNpZGUgbW91bnRwb2ludC4gWW91JiMzOTtyZSBwcm9iYWJseSBnb2luZyB0byBiZSBwYXNzaW5nIHRoZXNlIHRvIHlvdXIgPGEgaHJlZj1cXFwiI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnNcXFwiPkhUVFAgZnJhbWV3b3JrIHBsdWdpbjwvYT4sIHJhdGhlciB0aGFuIHVzaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZGlyZWN0bHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtbGF5b3V0LVxcXCI+PGNvZGU+b3B0aW9ucy5sYXlvdXQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgaXMgZXhwZWN0ZWQgdG8gaGF2ZSB0aGUgPGNvZGU+ZnVuY3Rpb24oZGF0YSk8L2NvZGU+IHNpZ25hdHVyZS4gSXQmIzM5O2xsIGJlIGludm9rZWQgd2hlbmV2ZXIgYSBmdWxsIEhUTUwgZG9jdW1lbnQgbmVlZHMgdG8gYmUgcmVuZGVyZWQsIGFuZCBhIDxjb2RlPmRhdGE8L2NvZGU+IG9iamVjdCB3aWxsIGJlIHBhc3NlZCB0byBpdC4gVGhhdCBvYmplY3Qgd2lsbCBjb250YWluIGV2ZXJ5dGhpbmcgeW91JiMzOTt2ZSBzZXQgYXMgdGhlIHZpZXcgbW9kZWwsIHBsdXMgYSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBjb250YWluaW5nIHRoZSByYXcgSFRNTCBvZiB0aGUgcmVuZGVyZWQgcGFydGlhbCB2aWV3LiBZb3VyIDxjb2RlPmxheW91dDwvY29kZT4gbWV0aG9kIHdpbGwgdHlwaWNhbGx5IHdyYXAgdGhlIHJhdyBIVE1MIGZvciB0aGUgcGFydGlhbCB3aXRoIHRoZSBiYXJlIGJvbmVzIG9mIGFuIEhUTUwgZG9jdW1lbnQuIENoZWNrIG91dCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vL2Jsb2IvMzMyNzE3NTEzMTJkYjZlOTIwNTlkOTgyOTNkMGE3YWM2ZTllOGU1Yi92aWV3cy9zZXJ2ZXIvbGF5b3V0L2xheW91dC5qYWRlXFxcIj50aGUgPGNvZGU+bGF5b3V0LmphZGU8L2NvZGU+IHVzZWQgaW4gUG9ueSBGb288L2E+IGFzIGFuIGV4YW1wbGUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcm91dGVzLVxcXCI+PGNvZGU+b3B0aW9ucy5yb3V0ZXM8L2NvZGU+PC9oNj5cXG48cD5UaGUgb3RoZXIgYmlnIG9wdGlvbiBpcyA8Y29kZT5yb3V0ZXM8L2NvZGU+LCB3aGljaCBleHBlY3RzIGEgY29sbGVjdGlvbiBvZiByb3V0ZSBkZWZpbml0aW9ucy4gUm91dGUgZGVmaW5pdGlvbnMgdXNlIGEgbnVtYmVyIG9mIHByb3BlcnRpZXMgdG8gZGV0ZXJtaW5lIGhvdyB0aGUgcm91dGUgaXMgZ29pbmcgdG8gYmVoYXZlLjwvcD5cXG48cD5IZXJlJiMzOTtzIGFuIGV4YW1wbGUgcm91dGUgdGhhdCB1c2VzIHRoZSA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gcm91dGluZyBzY2hlbWUuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPntcXG4gIHJvdXRlOiAmIzM5Oy9hcnRpY2xlcy86c2x1ZyYjMzk7LFxcbiAgYWN0aW9uOiAmIzM5O2FydGljbGVzL2FydGljbGUmIzM5OyxcXG4gIGlnbm9yZTogZmFsc2UsXFxuICBjYWNoZTogJmx0O2luaGVyaXQmZ3Q7XFxufVxcbjwvY29kZT48L3ByZT5cXG48dWw+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBpcyBhIHJvdXRlIGluIHRoZSBmb3JtYXQgeW91ciBIVFRQIGZyYW1ld29yayBvZiBjaG9pY2UgdW5kZXJzdGFuZHM8L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBuYW1lIG9mIHlvdXIgY29udHJvbGxlciBhY3Rpb24uIEl0JiMzOTtsbCBiZSB1c2VkIHRvIGZpbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIHRoZSBkZWZhdWx0IHZpZXcgdGhhdCBzaG91bGQgYmUgdXNlZCB3aXRoIHRoaXMgcm91dGUsIGFuZCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvbGk+XFxuPGxpPjxjb2RlPmNhY2hlPC9jb2RlPiBjYW4gYmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGNsaWVudC1zaWRlIGNhY2hpbmcgYmVoYXZpb3IgaW4gdGhpcyBhcHBsaWNhdGlvbiBwYXRoLCBhbmQgaXQmIzM5O2xsIGRlZmF1bHQgdG8gaW5oZXJpdGluZyBmcm9tIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IDxlbT5vbiB0aGUgY2xpZW50LXNpZGU8L2VtPjwvbGk+XFxuPGxpPjxjb2RlPmlnbm9yZTwvY29kZT4gaXMgdXNlZCBpbiB0aG9zZSBjYXNlcyB3aGVyZSB5b3Ugd2FudCBhIFVSTCB0byBiZSBpZ25vcmVkIGJ5IHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZXZlbiBpZiB0aGVyZSYjMzk7cyBhIGNhdGNoLWFsbCByb3V0ZSB0aGF0IHdvdWxkIG1hdGNoIHRoYXQgVVJMPC9saT5cXG48L3VsPlxcbjxwPkFzIGFuIGV4YW1wbGUgb2YgdGhlIDxjb2RlPmlnbm9yZTwvY29kZT4gdXNlIGNhc2UsIGNvbnNpZGVyIHRoZSByb3V0aW5nIHRhYmxlIHNob3duIGJlbG93LiBUaGUgY2xpZW50LXNpZGUgcm91dGVyIGRvZXNuJiMzOTt0IGtub3cgPGVtPihhbmQgY2FuJiMzOTt0IGtub3cgdW5sZXNzIHlvdSBwb2ludCBpdCBvdXQpPC9lbT4gd2hhdCByb3V0ZXMgYXJlIHNlcnZlci1zaWRlIG9ubHksIGFuZCBpdCYjMzk7cyB1cCB0byB5b3UgdG8gcG9pbnQgdGhvc2Ugb3V0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj5bXFxuICB7IHJvdXRlOiAmIzM5Oy8mIzM5OywgYWN0aW9uOiAmIzM5Oy9ob21lL2luZGV4JiMzOTsgfSxcXG4gIHsgcm91dGU6ICYjMzk7L2ZlZWQmIzM5OywgaWdub3JlOiB0cnVlIH0sXFxuICB7IHJvdXRlOiAmIzM5Oy8qJiMzOTssIGFjdGlvbjogJiMzOTtlcnJvci9ub3QtZm91bmQmIzM5OyB9XFxuXVxcbjwvY29kZT48L3ByZT5cXG48cD5UaGlzIHN0ZXAgaXMgbmVjZXNzYXJ5IHdoZW5ldmVyIHlvdSBoYXZlIGFuIGFuY2hvciBsaW5rIHBvaW50ZWQgYXQgc29tZXRoaW5nIGxpa2UgYW4gUlNTIGZlZWQuIFRoZSA8Y29kZT5pZ25vcmU8L2NvZGU+IHByb3BlcnR5IGlzIGVmZmVjdGl2ZWx5IHRlbGxpbmcgdGhlIGNsaWVudC1zaWRlIDxlbT4mcXVvdDtkb24mIzM5O3QgaGlqYWNrIGxpbmtzIGNvbnRhaW5pbmcgdGhpcyBVUkwmcXVvdDs8L2VtPi48L3A+XFxuPHA+UGxlYXNlIG5vdGUgdGhhdCBleHRlcm5hbCBsaW5rcyBhcmUgbmV2ZXIgaGlqYWNrZWQuIE9ubHkgc2FtZS1vcmlnaW4gbGlua3MgY29udGFpbmluZyBhIFVSTCB0aGF0IG1hdGNoZXMgb25lIG9mIHRoZSByb3V0ZXMgd2lsbCBiZSBoaWphY2tlZCBieSBUYXVudXMuIEV4dGVybmFsIGxpbmtzIGRvbiYjMzk7dCBuZWVkIHRvIGJlIDxjb2RlPmlnbm9yZTwvY29kZT5kLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDYgaWQ9XFxcIi1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj48Y29kZT5vcHRpb25zLmdldERlZmF1bHRWaWV3TW9kZWw/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPmdldERlZmF1bHRWaWV3TW9kZWwoZG9uZSk8L2NvZGU+IHByb3BlcnR5IGNhbiBiZSBhIG1ldGhvZCB0aGF0IHB1dHMgdG9nZXRoZXIgdGhlIGJhc2UgdmlldyBtb2RlbCwgd2hpY2ggd2lsbCB0aGVuIGJlIGV4dGVuZGVkIG9uIGFuIGFjdGlvbi1ieS1hY3Rpb24gYmFzaXMuIFdoZW4geW91JiMzOTtyZSBkb25lIGNyZWF0aW5nIGEgdmlldyBtb2RlbCwgeW91IGNhbiBpbnZva2UgPGNvZGU+ZG9uZShudWxsLCBtb2RlbCk8L2NvZGU+LiBJZiBhbiBlcnJvciBvY2N1cnMgd2hpbGUgYnVpbGRpbmcgdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgY2FsbCA8Y29kZT5kb25lKGVycik8L2NvZGU+IGluc3RlYWQuPC9wPlxcbjxwPlRhdW51cyB3aWxsIHRocm93IGFuIGVycm9yIGlmIDxjb2RlPmRvbmU8L2NvZGU+IGlzIGludm9rZWQgd2l0aCBhbiBlcnJvciwgc28geW91IG1pZ2h0IHdhbnQgdG8gcHV0IHNhZmVndWFyZHMgaW4gcGxhY2UgYXMgdG8gYXZvaWQgdGhhdCBmcm9tIGhhcHBlbm5pbmcuIFRoZSByZWFzb24gdGhpcyBtZXRob2QgaXMgYXN5bmNocm9ub3VzIGlzIGJlY2F1c2UgeW91IG1heSBuZWVkIGRhdGFiYXNlIGFjY2VzcyBvciBzb21lc3VjaCB3aGVuIHB1dHRpbmcgdG9nZXRoZXIgdGhlIGRlZmF1bHRzLiBUaGUgcmVhc29uIHRoaXMgaXMgYSBtZXRob2QgYW5kIG5vdCBqdXN0IGFuIG9iamVjdCBpcyB0aGF0IHRoZSBkZWZhdWx0cyBtYXkgY2hhbmdlIGR1ZSB0byBodW1hbiBpbnRlcmFjdGlvbiB3aXRoIHRoZSBhcHBsaWNhdGlvbiwgYW5kIGluIHRob3NlIGNhc2VzIDxhIGhyZWY9XFxcIiN0YXVudXMtcmVidWlsZGRlZmF1bHR2aWV3bW9kZWxcXFwiPnRoZSBkZWZhdWx0cyBjYW4gYmUgcmVidWlsdDwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNiBpZD1cXFwiLW9wdGlvbnMtcGxhaW50ZXh0LVxcXCI+PGNvZGU+b3B0aW9ucy5wbGFpbnRleHQ/PC9jb2RlPjwvaDY+XFxuPHA+VGhlIDxjb2RlPnBsYWludGV4dDwvY29kZT4gb3B0aW9ucyBvYmplY3QgaXMgcGFzc2VkIGRpcmVjdGx5IHRvIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oZ2V0XFxcIj5oZ2V0PC9hPiwgYW5kIGl0JiMzOTtzIHVzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iL2Y2ZDZiNTA2OGZmMDNhMzg3ZjUwMzkwMDE2MGQ5ZmRjMWU3NDk3NTAvY29udHJvbGxlcnMvcm91dGluZy5qcyNMNzAtTDcyXFxcIj50d2VhayB0aGUgcGxhaW50ZXh0IHZlcnNpb248L2E+IG9mIHlvdXIgc2l0ZS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg2IGlkPVxcXCItb3B0aW9ucy1yZXNvbHZlcnMtXFxcIj48Y29kZT5vcHRpb25zLnJlc29sdmVycz88L2NvZGU+PC9oNj5cXG48cD5SZXNvbHZlcnMgYXJlIHVzZWQgdG8gZGV0ZXJtaW5lIHRoZSBsb2NhdGlvbiBvZiBzb21lIG9mIHRoZSBkaWZmZXJlbnQgcGllY2VzIG9mIHlvdXIgYXBwbGljYXRpb24uIFR5cGljYWxseSB5b3Ugd29uJiMzOTt0IGhhdmUgdG8gdG91Y2ggdGhlc2UgaW4gdGhlIHNsaWdodGVzdC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0U2VydmVyQ29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5UaGUgPGNvZGU+YWRkUm91dGU8L2NvZGU+IG1ldGhvZCBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBvbiB0aGUgc2VydmVyLXNpZGUgaXMgbW9zdGx5IGdvaW5nIHRvIGJlIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgSFRUUCBmcmFtZXdvcmsgcGx1Z2lucywgc28gZmVlbCBmcmVlIHRvIHNraXAgb3ZlciB0aGUgZm9sbG93aW5nIHNlY3Rpb24uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiLWFkZHJvdXRlLWRlZmluaXRpb24tXFxcIj48Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT48L2g0PlxcbjxwPlRoZSA8Y29kZT5hZGRSb3V0ZShkZWZpbml0aW9uKTwvY29kZT4gbWV0aG9kIHdpbGwgYmUgcGFzc2VkIGEgcm91dGUgZGVmaW5pdGlvbiwgY29udGFpbmluZyB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXMuIFRoaXMgbWV0aG9kIGlzIGV4cGVjdGVkIHRvIHJlZ2lzdGVyIGEgcm91dGUgaW4geW91ciBIVFRQIGZyYW1ld29yayYjMzk7cyByb3V0ZXIuPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+cm91dGU8L2NvZGU+IGlzIHRoZSByb3V0ZSB0aGF0IHlvdSBzZXQgYXMgPGNvZGU+ZGVmaW5pdGlvbi5yb3V0ZTwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5hY3Rpb248L2NvZGU+IGlzIHRoZSBhY3Rpb24gYXMgcGFzc2VkIHRvIHRoZSByb3V0ZSBkZWZpbml0aW9uPC9saT5cXG48bGk+PGNvZGU+YWN0aW9uRm48L2NvZGU+IHdpbGwgYmUgdGhlIGNvbnRyb2xsZXIgZm9yIHRoaXMgYWN0aW9uIG1ldGhvZDwvbGk+XFxuPGxpPjxjb2RlPm1pZGRsZXdhcmU8L2NvZGU+IHdpbGwgYmUgYW4gYXJyYXkgb2YgbWV0aG9kcyB0byBiZSBleGVjdXRlZCBiZWZvcmUgPGNvZGU+YWN0aW9uRm48L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZW5kZXItYWN0aW9uLXZpZXdtb2RlbC1yZXEtcmVzLW5leHQtXFxcIj48Y29kZT50YXVudXMucmVuZGVyKGFjdGlvbiwgdmlld01vZGVsLCByZXEsIHJlcywgbmV4dCk8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBhbG1vc3QgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsIGFzIHlvdSBzaG91bGQgYmUgdXNpbmcgVGF1bnVzIHRocm91Z2ggb25lIG9mIHRoZSBwbHVnaW5zIGFueXdheXMsIHNvIHdlIHdvbiYjMzk7dCBnbyB2ZXJ5IGRlZXAgaW50byBpdC48L3A+XFxuPHA+VGhlIHJlbmRlciBtZXRob2QgaXMgd2hhdCBUYXVudXMgdXNlcyB0byByZW5kZXIgdmlld3MgYnkgY29uc3RydWN0aW5nIEhUTUwsIEpTT04sIG9yIHBsYWludGV4dCByZXNwb25zZXMuIFRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHByb3BlcnR5IGRldGVybWluZXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHdpbGwgYmUgcmVuZGVyZWQuIFRoZSA8Y29kZT52aWV3TW9kZWw8L2NvZGU+IHdpbGwgYmUgZXh0ZW5kZWQgYnkgPGEgaHJlZj1cXFwiIy1vcHRpb25zLWdldGRlZmF1bHR2aWV3bW9kZWwtXFxcIj50aGUgZGVmYXVsdCB2aWV3IG1vZGVsPC9hPiwgYW5kIGl0IG1heSBhbHNvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IDxjb2RlPmFjdGlvbjwvY29kZT4gYnkgc2V0dGluZyA8Y29kZT52aWV3TW9kZWwubW9kZWwuYWN0aW9uPC9jb2RlPi48L3A+XFxuPHA+VGhlIDxjb2RlPnJlcTwvY29kZT4sIDxjb2RlPnJlczwvY29kZT4sIGFuZCA8Y29kZT5uZXh0PC9jb2RlPiBhcmd1bWVudHMgYXJlIGV4cGVjdGVkIHRvIGJlIHRoZSBFeHByZXNzIHJvdXRpbmcgYXJndW1lbnRzLCBidXQgdGhleSBjYW4gYWxzbyBiZSBtb2NrZWQgPGVtPih3aGljaCBpcyBpbiBmYWN0IHdoYXQgdGhlIEhhcGkgcGx1Z2luIGRvZXMpPC9lbT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLVxcXCI+PGNvZGU+dGF1bnVzLnJlYnVpbGREZWZhdWx0Vmlld01vZGVsKGRvbmU/KTwvY29kZT48L2gyPlxcbjxwPk9uY2UgVGF1bnVzIGhhcyBiZWVuIG1vdW50ZWQsIGNhbGxpbmcgdGhpcyBtZXRob2Qgd2lsbCByZWJ1aWxkIHRoZSB2aWV3IG1vZGVsIGRlZmF1bHRzIHVzaW5nIHRoZSA8Y29kZT5nZXREZWZhdWx0Vmlld01vZGVsPC9jb2RlPiB0aGF0IHdhcyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpbiB0aGUgb3B0aW9ucy4gQW4gb3B0aW9uYWwgPGNvZGU+ZG9uZTwvY29kZT4gY2FsbGJhY2sgd2lsbCBiZSBpbnZva2VkIHdoZW4gdGhlIG1vZGVsIGlzIHJlYnVpbHQuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwiaHR0cC1mcmFtZXdvcmstcGx1Z2luc1xcXCI+SFRUUCBGcmFtZXdvcmsgUGx1Z2luczwvaDE+XFxuPHA+VGhlcmUmIzM5O3MgY3VycmVudGx5IHR3byBkaWZmZXJlbnQgSFRUUCBmcmFtZXdvcmtzIDxlbT4oPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IGFuZCA8YSBocmVmPVxcXCJodHRwOi8vaGFwaWpzLmNvbVxcXCI+SGFwaTwvYT4pPC9lbT4gdGhhdCB5b3UgY2FuIHJlYWRpbHkgdXNlIHdpdGggVGF1bnVzIHdpdGhvdXQgaGF2aW5nIHRvIGRlYWwgd2l0aCBhbnkgb2YgdGhlIHJvdXRlIHBsdW1iaW5nIHlvdXJzZWxmLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcInVzaW5nLXRhdW51cy1leHByZXNzLVxcXCI+VXNpbmcgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+PC9oMj5cXG48cD5UaGUgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IHBsdWdpbiBpcyBwcm9iYWJseSB0aGUgZWFzaWVzdCB0byB1c2UsIGFzIFRhdW51cyB3YXMgb3JpZ2luYWxseSBkZXZlbG9wZWQgd2l0aCBqdXN0IDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBpbiBtaW5kLiBJbiBhZGRpdGlvbiB0byB0aGUgb3B0aW9ucyBhbHJlYWR5IG91dGxpbmVkIGZvciA8YSBocmVmPVxcXCIjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLVxcXCI+dGF1bnVzLm1vdW50PC9hPiwgeW91IGNhbiBhZGQgbWlkZGxld2FyZSBmb3IgYW55IHJvdXRlIGluZGl2aWR1YWxseS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5taWRkbGV3YXJlPC9jb2RlPiBhcmUgYW55IG1ldGhvZHMgeW91IHdhbnQgVGF1bnVzIHRvIGV4ZWN1dGUgYXMgbWlkZGxld2FyZSBpbiBFeHByZXNzIGFwcGxpY2F0aW9uczwvbGk+XFxuPC91bD5cXG48cD5UbyBnZXQgPGNvZGU+dGF1bnVzLWV4cHJlc3M8L2NvZGU+IGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgcHJvdmlkZWQgdGhhdCB5b3UgY29tZSB1cCB3aXRoIGFuIDxjb2RlPm9wdGlvbnM8L2NvZGU+IG9iamVjdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+dmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgLy8gLi4uXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+IG1ldGhvZCB3aWxsIG1lcmVseSBzZXQgdXAgVGF1bnVzIGFuZCBhZGQgdGhlIHJlbGV2YW50IHJvdXRlcyB0byB5b3VyIEV4cHJlc3MgYXBwbGljYXRpb24gYnkgY2FsbGluZyA8Y29kZT5hcHAuZ2V0PC9jb2RlPiBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXFwiPmZpbmQgdGF1bnVzLWV4cHJlc3Mgb24gR2l0SHViPC9hPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCJ1c2luZy10YXVudXMtaGFwaS1cXFwiPlVzaW5nIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPjwvaDI+XFxuPHA+VGhlIDxjb2RlPnRhdW51cy1oYXBpPC9jb2RlPiBwbHVnaW4gaXMgYSBiaXQgbW9yZSBpbnZvbHZlZCwgYW5kIHlvdSYjMzk7bGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gPGEgaHJlZj1cXFwiIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy1cXFwiPnRoZSBvcHRpb25zIHdlJiMzOTt2ZSBhbHJlYWR5IGNvdmVyZWQ8L2E+LCB5b3UgY2FuIGFkZCA8Y29kZT5jb25maWc8L2NvZGU+IG9uIGFueSByb3V0ZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5jb25maWc8L2NvZGU+IGlzIHBhc3NlZCBkaXJlY3RseSBpbnRvIHRoZSByb3V0ZSByZWdpc3RlcmVkIHdpdGggSGFwaSwgZ2l2aW5nIHlvdSB0aGUgbW9zdCBmbGV4aWJpbGl0eTwvbGk+XFxuPC91bD5cXG48cD5UbyBnZXQgPGNvZGU+dGF1bnVzLWhhcGk8L2NvZGU+IGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj52YXIgSGFwaSA9IHJlcXVpcmUoJiMzOTtoYXBpJiMzOTspO1xcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNIYXBpID0gcmVxdWlyZSgmIzM5O3RhdW51cy1oYXBpJiMzOTspKHRhdW51cyk7XFxudmFyIHBhY2sgPSBuZXcgSGFwaS5QYWNrKCk7XFxuXFxucGFjay5yZWdpc3Rlcih7XFxuICBwbHVnaW46IHRhdW51c0hhcGksXFxuICBvcHRpb25zOiB7XFxuICAgIC8vIC4uLlxcbiAgfVxcbn0pO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgPGNvZGU+dGF1bnVzSGFwaTwvY29kZT4gcGx1Z2luIHdpbGwgbW91bnQgVGF1bnVzIGFuZCByZWdpc3RlciBhbGwgb2YgdGhlIG5lY2Vzc2FyeSByb3V0ZXMuIFlvdSBjYW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtaGFwaVxcXCI+ZmluZCB0YXVudXMtaGFwaSBvbiBHaXRIdWI8L2E+LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImNvbW1hbmQtbGluZS1pbnRlcmZhY2VcXFwiPkNvbW1hbmQtTGluZSBJbnRlcmZhY2U8L2gxPlxcbjxwPk9uY2UgeW91JiMzOTt2ZSBzZXQgdXAgdGhlIHNlcnZlci1zaWRlIHRvIHJlbmRlciB5b3VyIHZpZXdzIHVzaW5nIFRhdW51cywgaXQmIzM5O3Mgb25seSBsb2dpY2FsIHRoYXQgeW91JiMzOTtsbCB3YW50IHRvIHJlbmRlciB0aGUgdmlld3MgaW4gdGhlIGNsaWVudC1zaWRlIGFzIHdlbGwsIGVmZmVjdGl2ZWx5IGNvbnZlcnRpbmcgeW91ciBhcHBsaWNhdGlvbiBpbnRvIGEgc2luZ2xlLXBhZ2UgYXBwbGljYXRpb24gYWZ0ZXIgdGhlIGZpcnN0IHZpZXcgaGFzIGJlZW4gcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLjwvcD5cXG48cD5UaGUgVGF1bnVzIENMSSBpcyBhbiB1c2VmdWwgaW50ZXJtZWRpYXJ5IGluIHRoZSBwcm9jZXNzIG9mIGdldHRpbmcgdGhlIGNvbmZpZ3VyYXRpb24geW91IHdyb3RlIHNvIGZhciBmb3IgdGhlIHNlcnZlci1zaWRlIHRvIGFsc28gd29yayB3ZWxsIGluIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+SW5zdGFsbCBpdCBnbG9iYWxseSBmb3IgZGV2ZWxvcG1lbnQsIGJ1dCByZW1lbWJlciB0byB1c2UgbG9jYWwgY29waWVzIGZvciBwcm9kdWN0aW9uLWdyYWRlIHVzZXMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC1nIHRhdW51c1xcbjwvY29kZT48L3ByZT5cXG48cD5XaGVuIGludm9rZWQgd2l0aG91dCBhbnkgYXJndW1lbnRzLCB0aGUgQ0xJIHdpbGwgc2ltcGx5IGZvbGxvdyB0aGUgZGVmYXVsdCBjb252ZW50aW9ucyB0byBmaW5kIHlvdXIgcm91dGUgZGVmaW5pdGlvbnMsIHZpZXdzLCBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51c1xcbjwvY29kZT48L3ByZT5cXG48cD5CeSBkZWZhdWx0LCB0aGUgb3V0cHV0IHdpbGwgYmUgcHJpbnRlZCB0byB0aGUgc3RhbmRhcmQgb3V0cHV0LCBtYWtpbmcgZm9yIGEgZmFzdCBkZWJ1Z2dpbmcgZXhwZXJpZW5jZS4gSGVyZSYjMzk7cyB0aGUgb3V0cHV0IGlmIHlvdSBqdXN0IGhhZCBhIHNpbmdsZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiByb3V0ZSwgYW5kIHRoZSBtYXRjaGluZyB2aWV3IGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVyIGV4aXN0ZWQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0ZW1wbGF0ZXMgPSB7XFxuICAmIzM5O2hvbWUvaW5kZXgmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvaG9tZS9pbmRleC5qcyYjMzk7KVxcbn07XFxuXFxudmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgJiMzOTtob21lL2luZGV4JiMzOTs6IHJlcXVpcmUoJiMzOTsuLi9jbGllbnQvanMvY29udHJvbGxlcnMvaG9tZS9pbmRleC5qcyYjMzk7KVxcbn07XFxuXFxudmFyIHJvdXRlcyA9IHtcXG4gICYjMzk7LyYjMzk7OiB7XFxuICAgIGFjdGlvbjogJiMzOTtob21lL2luZGV4JiMzOTtcXG4gIH1cXG59O1xcblxcbm1vZHVsZS5leHBvcnRzID0ge1xcbiAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXFxuICByb3V0ZXM6IHJvdXRlc1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPllvdSBjYW4gdXNlIGEgZmV3IG9wdGlvbnMgdG8gYWx0ZXIgdGhlIG91dGNvbWUgb2YgaW52b2tpbmcgPGNvZGU+dGF1bnVzPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItb3V0cHV0LVxcXCI+PGNvZGU+LS1vdXRwdXQ8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tbzwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPk91dHB1dCBpcyB3cml0dGVuIHRvIGEgZmlsZSBpbnN0ZWFkIG9mIHRvIHN0YW5kYXJkIG91dHB1dC4gVGhlIGZpbGUgcGF0aCB1c2VkIHdpbGwgYmUgdGhlIDxjb2RlPmNsaWVudF93aXJpbmc8L2NvZGU+IG9wdGlvbiBpbiA8YSBocmVmPVxcXCIjdGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj48Y29kZT4udGF1bnVzcmM8L2NvZGU+PC9hPiwgd2hpY2ggZGVmYXVsdHMgdG8gPGNvZGU+JiMzOTsuYmluL3dpcmluZy5qcyYjMzk7PC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItd2F0Y2gtXFxcIj48Y29kZT4tLXdhdGNoPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXc8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5XaGVuZXZlciBhIHNlcnZlci1zaWRlIHJvdXRlIGRlZmluaXRpb24gY2hhbmdlcywgdGhlIG91dHB1dCBpcyBwcmludGVkIGFnYWluIHRvIGVpdGhlciBzdGFuZGFyZCBvdXRwdXQgb3IgYSBmaWxlLCBkZXBlbmRpbmcgb24gd2hldGhlciA8Y29kZT4tLW91dHB1dDwvY29kZT4gd2FzIHVzZWQuPC9wPlxcbjxwPlRoZSBwcm9ncmFtIHdvbiYjMzk7dCBleGl0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10cmFuc2Zvcm0tbW9kdWxlLVxcXCI+PGNvZGU+LS10cmFuc2Zvcm0gJmx0O21vZHVsZSZndDs8L2NvZGU+PC9oMj5cXG48cD48c3ViPnRoZSA8Y29kZT4tdDwvY29kZT4gYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+PC9wPlxcbjxwPlRoaXMgZmxhZyBhbGxvd3MgeW91IHRvIHRyYW5zZm9ybSBzZXJ2ZXItc2lkZSByb3V0ZXMgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHVuZGVyc3RhbmRzLiBFeHByZXNzIHJvdXRlcyBhcmUgY29tcGxldGVseSBjb21wYXRpYmxlIHdpdGggdGhlIGNsaWVudC1zaWRlIHJvdXRlciwgYnV0IEhhcGkgcm91dGVzIG5lZWQgdG8gYmUgdHJhbnNmb3JtZWQgdXNpbmcgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+PGNvZGU+aGFwaWlmeTwvY29kZT48L2E+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgaGFwaWlmeVxcbnRhdW51cyAtdCBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlVzaW5nIHRoaXMgdHJhbnNmb3JtIHJlbGlldmVzIHlvdSBmcm9tIGhhdmluZyB0byBkZWZpbmUgdGhlIHNhbWUgcm91dGVzIHR3aWNlIHVzaW5nIHNsaWdodGx5IGRpZmZlcmVudCBmb3JtYXRzIHRoYXQgY29udmV5IHRoZSBzYW1lIG1lYW5pbmcuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXJlc29sdmVycy1tb2R1bGUtXFxcIj48Y29kZT4tLXJlc29sdmVycyAmbHQ7bW9kdWxlJmd0OzwvY29kZT48L2gyPlxcbjxwPjxzdWI+dGhlIDxjb2RlPi1yPC9jb2RlPiBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj48L3A+XFxuPHA+U2ltaWxhcmx5IHRvIHRoZSA8YSBocmVmPVxcXCIjLW9wdGlvbnMtcmVzb2x2ZXJzLVxcXCI+PGNvZGU+cmVzb2x2ZXJzPC9jb2RlPjwvYT4gb3B0aW9uIHRoYXQgeW91IGNhbiBwYXNzIHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW1vdW50LWFkZHJvdXRlLW9wdGlvbnMtXFxcIj48Y29kZT50YXVudXMubW91bnQ8L2NvZGU+PC9hPiwgdGhlc2UgcmVzb2x2ZXJzIGNhbiBjaGFuZ2UgdGhlIHdheSBpbiB3aGljaCBmaWxlIHBhdGhzIGFyZSByZXNvbHZlZC48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPlNpZ25hdHVyZTwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0Q2xpZW50Q29udHJvbGxlcihhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+Z2V0VmlldyhhY3Rpb24pPC9jb2RlPjwvdGQ+XFxuPHRkPlJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi1zdGFuZGFsb25lLVxcXCI+PGNvZGU+LS1zdGFuZGFsb25lPC9jb2RlPjwvaDI+XFxuPHA+PHN1Yj50aGUgPGNvZGU+LXM8L2NvZGU+IGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPjwvcD5cXG48cD5VbmRlciB0aGlzIGV4cGVyaW1lbnRhbCBmbGFnLCB0aGUgQ0xJIHdpbGwgdXNlIEJyb3dzZXJpZnkgdG8gY29tcGlsZSBhIHN0YW5kYWxvbmUgbW9kdWxlIHRoYXQgaW5jbHVkZXMgdGhlIHdpcmluZyBub3JtYWxseSBleHBvcnRlZCBieSB0aGUgQ0xJIHBsdXMgYWxsIG9mIFRhdW51cyA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdW1kanMvdW1kXFxcIj5hcyBhIFVNRCBtb2R1bGU8L2E+LjwvcD5cXG48cD5UaGlzIHdvdWxkIGFsbG93IHlvdSB0byB1c2UgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSBldmVuIGlmIHlvdSBkb24mIzM5O3Qgd2FudCB0byB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2Jyb3dzZXJpZnkub3JnXFxcIj5Ccm93c2VyaWZ5PC9hPiBkaXJlY3RseS48L3A+XFxuPHA+RmVlZGJhY2sgYW5kIHN1Z2dlc3Rpb25zIGFib3V0IHRoaXMgZmxhZywgPGVtPmFuZCBwb3NzaWJsZSBhbHRlcm5hdGl2ZXMgdGhhdCB3b3VsZCBtYWtlIFRhdW51cyBlYXNpZXIgdG8gdXNlPC9lbT4sIGFyZSB3ZWxjb21lLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcImNsaWVudC1zaWRlLWFwaVxcXCI+Q2xpZW50LXNpZGUgQVBJPC9oMT5cXG48cD5KdXN0IGxpa2UgdGhlIHNlcnZlci1zaWRlLCBldmVyeXRoaW5nIGluIHRoZSBjbGllbnQtc2lkZSBiZWdpbnMgYXQgdGhlIG1vdW50cG9pbnQuIE9uY2UgdGhlIGFwcGxpY2F0aW9uIGlzIG1vdW50ZWQsIGFuY2hvciBsaW5rcyB3aWxsIGJlIGhpamFja2VkIGFuZCB0aGUgY2xpZW50LXNpZGUgcm91dGVyIHdpbGwgdGFrZSBvdmVyIHZpZXcgcmVuZGVyaW5nLiBDbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhlY3V0ZWQgd2hlbmV2ZXIgYSB2aWV3IGlzIHJlbmRlcmVkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtbW91bnQtY29udGFpbmVyLXdpcmluZy1vcHRpb25zLVxcXCI+PGNvZGU+dGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nLCBvcHRpb25zPyk8L2NvZGU+PC9oMj5cXG48cD5UaGUgbW91bnRwb2ludCB0YWtlcyBhIHJvb3QgY29udGFpbmVyLCB0aGUgd2lyaW5nIG1vZHVsZSwgYW5kIGFuIG9wdGlvbnMgcGFyYW1ldGVyLiBUaGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBpcyB3aGVyZSBjbGllbnQtc2lkZS1yZW5kZXJlZCB2aWV3cyB3aWxsIGJlIHBsYWNlZCwgYnkgcmVwbGFjaW5nIHdoYXRldmVyIEhUTUwgY29udGVudHMgYWxyZWFkeSBleGlzdC4gWW91IGNhbiBwYXNzIGluIHRoZSA8Y29kZT53aXJpbmc8L2NvZGU+IG1vZHVsZSBleGFjdGx5IGFzIGJ1aWx0IGJ5IHRoZSBDTEksIGFuZCBubyBmdXJ0aGVyIGNvbmZpZ3VyYXRpb24gaXMgbmVjZXNzYXJ5LjwvcD5cXG48cD5XaGVuIHRoZSBtb3VudHBvaW50IGV4ZWN1dGVzLCBUYXVudXMgd2lsbCBjb25maWd1cmUgaXRzIGludGVybmFsIHN0YXRlLCA8ZW0+c2V0IHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXI8L2VtPiwgcnVuIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldywgYW5kIHN0YXJ0IGhpamFja2luZyBsaW5rcy48L3A+XFxuPHA+QXMgYW4gZXhhbXBsZSwgY29uc2lkZXIgYSBicm93c2VyIG1ha2VzIGEgPGNvZGU+R0VUPC9jb2RlPiByZXF1ZXN0IGZvciA8Y29kZT4vYXJ0aWNsZXMvdGhlLWZveDwvY29kZT4gZm9yIHRoZSBmaXJzdCB0aW1lLiBPbmNlIDxjb2RlPnRhdW51cy5tb3VudChjb250YWluZXIsIHdpcmluZyk8L2NvZGU+IGlzIGludm9rZWQgb24gdGhlIGNsaWVudC1zaWRlLCBzZXZlcmFsIHRoaW5ncyB3b3VsZCBoYXBwZW4gaW4gdGhlIG9yZGVyIGxpc3RlZCBiZWxvdy48L3A+XFxuPHVsPlxcbjxsaT5UYXVudXMgc2V0cyB1cCB0aGUgY2xpZW50LXNpZGUgdmlldyByb3V0aW5nIGVuZ2luZTwvbGk+XFxuPGxpPklmIGVuYWJsZWQgPGVtPih2aWEgPGNvZGU+b3B0aW9uczwvY29kZT4pPC9lbT4sIHRoZSBjYWNoaW5nIGVuZ2luZSBpcyBjb25maWd1cmVkPC9saT5cXG48bGk+VGF1bnVzIG9idGFpbnMgdGhlIHZpZXcgbW9kZWwgPGVtPihtb3JlIG9uIHRoaXMgbGF0ZXIpPC9lbT48L2xpPlxcbjxsaT5XaGVuIGEgdmlldyBtb2RlbCBpcyBvYnRhaW5lZCwgdGhlIDxjb2RlPiYjMzk7c3RhcnQmIzM5OzwvY29kZT4gZXZlbnQgaXMgZW1pdHRlZDwvbGk+XFxuPGxpPkFuY2hvciBsaW5rcyBzdGFydCBiZWluZyBtb25pdG9yZWQgZm9yIGNsaWNrcyA8ZW0+KGF0IHRoaXMgcG9pbnQgeW91ciBhcHBsaWNhdGlvbiBiZWNvbWVzIGEgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9TaW5nbGUtcGFnZV9hcHBsaWNhdGlvblxcXCI+U1BBPC9hPik8L2VtPjwvbGk+XFxuPGxpPlRoZSA8Y29kZT5hcnRpY2xlcy9hcnRpY2xlPC9jb2RlPiBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGV4ZWN1dGVkPC9saT5cXG48L3VsPlxcbjxwPlRoYXQmIzM5O3MgcXVpdGUgYSBiaXQgb2YgZnVuY3Rpb25hbGl0eSwgYnV0IGlmIHlvdSB0aGluayBhYm91dCBpdCwgbW9zdCBvdGhlciBmcmFtZXdvcmtzIGFsc28gcmVuZGVyIHRoZSB2aWV3IGF0IHRoaXMgcG9pbnQsIDxlbT5yYXRoZXIgdGhhbiBvbiB0aGUgc2VydmVyLXNpZGUhPC9lbT48L3A+XFxuPHA+SW4gb3JkZXIgdG8gYmV0dGVyIHVuZGVyc3RhbmQgdGhlIHByb2Nlc3MsIEkmIzM5O2xsIHdhbGsgeW91IHRocm91Z2ggdGhlIDxjb2RlPm9wdGlvbnM8L2NvZGU+IHBhcmFtZXRlci48L3A+XFxuPHA+Rmlyc3Qgb2ZmLCB0aGUgPGNvZGU+Ym9vdHN0cmFwPC9jb2RlPiBvcHRpb24gZGV0ZXJtaW5lcyB0aGUgc3RyYXRlZ3kgdXNlZCB0byBwdWxsIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3IGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGVyZSBhcmUgdGhyZWUgcG9zc2libGUgc3RyYXRlZ2llcyBhdmFpbGFibGU6IDxjb2RlPmF1dG88L2NvZGU+IDxlbT4odGhlIGRlZmF1bHQgc3RyYXRlZ3kpPC9lbT4sIDxjb2RlPmlubGluZTwvY29kZT4sIG9yIDxjb2RlPm1hbnVhbDwvY29kZT4uIFRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneSBpbnZvbHZlcyB0aGUgbGVhc3Qgd29yaywgd2hpY2ggaXMgd2h5IGl0JiMzOTtzIHRoZSBkZWZhdWx0LjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPmF1dG88L2NvZGU+IHdpbGwgbWFrZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsPC9saT5cXG48bGk+PGNvZGU+aW5saW5lPC9jb2RlPiBleHBlY3RzIHlvdSB0byBwbGFjZSB0aGUgbW9kZWwgaW50byBhIDxjb2RlPiZsdDtzY3JpcHQgdHlwZT0mIzM5O3RleHQvdGF1bnVzJiMzOTsmZ3Q7PC9jb2RlPiB0YWc8L2xpPlxcbjxsaT48Y29kZT5tYW51YWw8L2NvZGU+IGV4cGVjdHMgeW91IHRvIGdldCB0aGUgdmlldyBtb2RlbCBob3dldmVyIHlvdSB3YW50IHRvLCBhbmQgdGhlbiBsZXQgVGF1bnVzIGtub3cgd2hlbiBpdCYjMzk7cyByZWFkeTwvbGk+XFxuPC91bD5cXG48cD5MZXQmIzM5O3MgZ28gaW50byBkZXRhaWwgYWJvdXQgZWFjaCBvZiB0aGVzZSBzdHJhdGVnaWVzLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5XFxcIj5Vc2luZyB0aGUgPGNvZGU+YXV0bzwvY29kZT4gc3RyYXRlZ3k8L2g0PlxcbjxwPlRoZSA8Y29kZT5hdXRvPC9jb2RlPiBzdHJhdGVneSBtZWFucyB0aGF0IFRhdW51cyB3aWxsIG1ha2UgdXNlIG9mIGFuIEFKQVggcmVxdWVzdCB0byBvYnRhaW4gdGhlIHZpZXcgbW9kZWwuIDxlbT5Zb3UgZG9uJiMzOTt0IGhhdmUgdG8gZG8gYW55dGhpbmcgZWxzZTwvZW0+IGFuZCB0aGlzIGlzIHRoZSBkZWZhdWx0IHN0cmF0ZWd5LiBUaGlzIGlzIHRoZSA8c3Ryb25nPm1vc3QgY29udmVuaWVudCBzdHJhdGVneSwgYnV0IGFsc28gdGhlIHNsb3dlc3Q8L3N0cm9uZz4gb25lLjwvcD5cXG48cD5JdCYjMzk7cyBzbG93IGJlY2F1c2UgdGhlIHZpZXcgbW9kZWwgd29uJiMzOTt0IGJlIHJlcXVlc3RlZCB1bnRpbCB0aGUgYnVsayBvZiB5b3VyIEphdmFTY3JpcHQgY29kZSBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGV4ZWN1dGVkLCBhbmQgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBpbnZva2VkLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcInVzaW5nLXRoZS1pbmxpbmUtc3RyYXRlZ3lcXFwiPlVzaW5nIHRoZSA8Y29kZT5pbmxpbmU8L2NvZGU+IHN0cmF0ZWd5PC9oND5cXG48cD5UaGUgPGNvZGU+aW5saW5lPC9jb2RlPiBzdHJhdGVneSBleHBlY3RzIHlvdSB0byBhZGQgYSA8Y29kZT5kYXRhLXRhdW51czwvY29kZT4gYXR0cmlidXRlIG9uIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+IGVsZW1lbnQuIFRoaXMgYXR0cmlidXRlIG11c3QgYmUgZXF1YWwgdG8gdGhlIDxjb2RlPmlkPC9jb2RlPiBhdHRyaWJ1dGUgb2YgYSA8Y29kZT4mbHQ7c2NyaXB0Jmd0OzwvY29kZT4gdGFnIGNvbnRhaW5pbmcgdGhlIHNlcmlhbGl6ZWQgdmlldyBtb2RlbC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj5kaXYoZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KSE9cGFydGlhbFxcbnNjcmlwdCh0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OywgZGF0YS10YXVudXM9JiMzOTttb2RlbCYjMzk7KT1KU09OLnN0cmluZ2lmeShtb2RlbClcXG48L2NvZGU+PC9wcmU+XFxuPHA+UGF5IHNwZWNpYWwgYXR0ZW50aW9uIHRvIHRoZSBmYWN0IHRoYXQgdGhlIG1vZGVsIGlzIG5vdCBvbmx5IG1hZGUgaW50byBhIEpTT04gc3RyaW5nLCA8ZW0+YnV0IGFsc28gSFRNTCBlbmNvZGVkIGJ5IEphZGU8L2VtPi4gV2hlbiBUYXVudXMgZXh0cmFjdHMgdGhlIG1vZGVsIGZyb20gdGhlIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiB0YWcgaXQmIzM5O2xsIHVuZXNjYXBlIGl0LCBhbmQgdGhlbiBwYXJzZSBpdCBhcyBKU09OLjwvcD5cXG48cD5UaGlzIHN0cmF0ZWd5IGlzIGFsc28gZmFpcmx5IGNvbnZlbmllbnQgdG8gc2V0IHVwLCBidXQgaXQgaW52b2x2ZXMgYSBsaXR0bGUgbW9yZSB3b3JrLiBJdCBtaWdodCBiZSB3b3J0aHdoaWxlIHRvIHVzZSBpbiBjYXNlcyB3aGVyZSBtb2RlbHMgYXJlIHNtYWxsLCBidXQgaXQgd2lsbCBzbG93IGRvd24gc2VydmVyLXNpZGUgdmlldyByZW5kZXJpbmcsIGFzIHRoZSBtb2RlbCBpcyBpbmxpbmVkIGFsb25nc2lkZSB0aGUgSFRNTC48L3A+XFxuPHA+VGhhdCBtZWFucyB0aGF0IHRoZSBjb250ZW50IHlvdSBhcmUgc3VwcG9zZWQgdG8gYmUgcHJpb3JpdGl6aW5nIGlzIGdvaW5nIHRvIHRha2UgbG9uZ2VyIHRvIGdldCB0byB5b3VyIGh1bWFucywgYnV0IG9uY2UgdGhleSBnZXQgdGhlIEhUTUwsIHRoaXMgc3RyYXRlZ3kgd2lsbCBleGVjdXRlIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFsbW9zdCBpbW1lZGlhdGVseS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtbWFudWFsLXN0cmF0ZWd5XFxcIj5Vc2luZyB0aGUgPGNvZGU+bWFudWFsPC9jb2RlPiBzdHJhdGVneTwvaDQ+XFxuPHA+VGhlIDxjb2RlPm1hbnVhbDwvY29kZT4gc3RyYXRlZ3kgaXMgdGhlIG1vc3QgaW52b2x2ZWQgb2YgdGhlIHRocmVlLCBidXQgYWxzbyB0aGUgbW9zdCBwZXJmb3JtYW50LiBJbiB0aGlzIHN0cmF0ZWd5IHlvdSYjMzk7cmUgc3VwcG9zZWQgdG8gYWRkIHRoZSBmb2xsb3dpbmcgPGVtPihzZWVtaW5nbHkgcG9pbnRsZXNzKTwvZW0+IHNuaXBwZXQgb2YgY29kZSBpbiBhIDxjb2RlPiZsdDtzY3JpcHQmZ3Q7PC9jb2RlPiBvdGhlciB0aGFuIHRoZSBvbmUgdGhhdCYjMzk7cyBwdWxsaW5nIGRvd24gVGF1bnVzLCBzbyB0aGF0IHRoZXkgYXJlIHB1bGxlZCBjb25jdXJyZW50bHkgcmF0aGVyIHRoYW4gc2VyaWFsbHkuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPndpbmRvdy50YXVudXNSZWFkeSA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3Ugc29tZWhvdyBnZXQgeW91ciBoYW5kcyBvbiB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBpbnZva2UgPGNvZGU+dGF1bnVzUmVhZHkobW9kZWwpPC9jb2RlPi4gQ29uc2lkZXJpbmcgeW91JiMzOTtsbCBiZSBwdWxsaW5nIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBhdCB0aGUgc2FtZSB0aW1lLCBhIG51bWJlciBvZiBkaWZmZXJlbnQgc2NlbmFyaW9zIG1heSBwbGF5IG91dC48L3A+XFxuPHVsPlxcbjxsaT5UaGUgdmlldyBtb2RlbCBpcyBsb2FkZWQgZmlyc3QsIHlvdSBjYWxsIDxjb2RlPnRhdW51c1JlYWR5KG1vZGVsKTwvY29kZT4gYW5kIHdhaXQgZm9yIFRhdW51cyB0byB0YWtlIHRoZSBtb2RlbCBvYmplY3QgYW5kIGJvb3QgdGhlIGFwcGxpY2F0aW9uIGFzIHNvb24gYXMgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBleGVjdXRlZDwvbGk+XFxuPGxpPlRhdW51cyBsb2FkcyBmaXJzdCBhbmQgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBpcyBjYWxsZWQgZmlyc3QuIEluIHRoaXMgY2FzZSwgVGF1bnVzIHdpbGwgcmVwbGFjZSA8Y29kZT53aW5kb3cudGF1bnVzUmVhZHk8L2NvZGU+IHdpdGggYSBzcGVjaWFsIDxjb2RlPmJvb3Q8L2NvZGU+IG1ldGhvZC4gV2hlbiB0aGUgdmlldyBtb2RlbCBmaW5pc2hlcyBsb2FkaW5nLCB5b3UgY2FsbCA8Y29kZT50YXVudXNSZWFkeShtb2RlbCk8L2NvZGU+IGFuZCB0aGUgYXBwbGljYXRpb24gZmluaXNoZXMgYm9vdGluZzwvbGk+XFxuPC91bD5cXG48YmxvY2txdW90ZT5cXG48cD5JZiB0aGlzIHNvdW5kcyBhIGxpdHRsZSBtaW5kLWJlbmRpbmcgaXQmIzM5O3MgYmVjYXVzZSBpdCBpcy4gSXQmIzM5O3Mgbm90IGRlc2lnbmVkIHRvIGJlIHByZXR0eSwgYnV0IG1lcmVseSB0byBiZSBwZXJmb3JtYW50LjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+Tm93IHRoYXQgd2UmIzM5O3ZlIGFkZHJlc3NlZCB0aGUgYXdrd2FyZCBiaXRzLCBsZXQmIzM5O3MgY292ZXIgdGhlIDxlbT4mcXVvdDtzb21laG93IGdldCB5b3VyIGhhbmRzIG9uIHRoZSB2aWV3IG1vZGVsJnF1b3Q7PC9lbT4gYXNwZWN0LiBNeSBwcmVmZXJyZWQgbWV0aG9kIGlzIHVzaW5nIEpTT05QLCBhcyBpdCYjMzk7cyBhYmxlIHRvIGRlbGl2ZXIgdGhlIHNtYWxsZXN0IHNuaXBwZXQgcG9zc2libGUsIGFuZCBpdCBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygc2VydmVyLXNpZGUgY2FjaGluZy4gQ29uc2lkZXJpbmcgeW91JiMzOTtsbCBwcm9iYWJseSB3YW50IHRoaXMgdG8gYmUgYW4gaW5saW5lIHNjcmlwdCwga2VlcGluZyBpdCBzbWFsbCBpcyBpbXBvcnRhbnQuPC9wPlxcbjxwPlRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgc2VydmVyLXNpZGUgc3VwcG9ydHMgSlNPTlAgb3V0IHRoZSBib3guIEhlcmUmIzM5O3MgYSBzbmlwcGV0IG9mIGNvZGUgeW91IGNvdWxkIHVzZSB0byBwdWxsIGRvd24gdGhlIHZpZXcgbW9kZWwgYW5kIGJvb3QgVGF1bnVzIHVwIGFzIHNvb24gYXMgYm90aCBvcGVyYXRpb25zIGFyZSByZWFkeS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+ZnVuY3Rpb24gaW5qZWN0ICh1cmwpIHtcXG4gIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCYjMzk7c2NyaXB0JiMzOTspO1xcbiAgc2NyaXB0LnNyYyA9IHVybDtcXG4gIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG59XFxuXFxuZnVuY3Rpb24gaW5qZWN0b3IgKCkge1xcbiAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gIHZhciBzZWFyY2hRdWVyeSA9IHNlYXJjaCA/ICYjMzk7JmFtcDsmIzM5OyArIHNlYXJjaC5zdWJzdHIoMSkgOiAmIzM5OyYjMzk7O1xcbiAgdmFyIHNlYXJjaEpzb24gPSAmIzM5Oz9qc29uJmFtcDtjYWxsYmFjaz10YXVudXNSZWFkeSYjMzk7ICsgc2VhcmNoUXVlcnk7XFxuICBpbmplY3QobG9jYXRpb24ucGF0aG5hbWUgKyBzZWFyY2hKc29uKTtcXG59XFxuXFxud2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG59O1xcblxcbmluamVjdG9yKCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPkFzIG1lbnRpb25lZCBlYXJsaWVyLCB0aGlzIGFwcHJvYWNoIGludm9sdmVzIGdldHRpbmcgeW91ciBoYW5kcyBkaXJ0aWVyIGJ1dCBpdCBwYXlzIG9mZiBieSBiZWluZyB0aGUgZmFzdGVzdCBvZiB0aGUgdGhyZWUuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZ1xcXCI+Q2FjaGluZzwvaDQ+XFxuPHA+VGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIDxjb2RlPmNhY2hlPC9jb2RlPiBmbGFnIGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+IG9uIHRoZSBjbGllbnQtc2lkZS48L3A+XFxuPHA+SWYgeW91IHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gPGNvZGU+dHJ1ZTwvY29kZT4gdGhlbiBjYWNoZWQgaXRlbXMgd2lsbCBiZSBjb25zaWRlcmVkIDxlbT4mcXVvdDtmcmVzaCZxdW90OyAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbCk8L2VtPiBmb3IgPHN0cm9uZz4xNSBzZWNvbmRzPC9zdHJvbmc+LiBZb3UgY2FuIGFsc28gc2V0IDxjb2RlPmNhY2hlPC9jb2RlPiB0byBhIG51bWJlciwgYW5kIHRoYXQgbnVtYmVyIG9mIHNlY29uZHMgd2lsbCBiZSB1c2VkIGFzIHRoZSBkZWZhdWx0IGluc3RlYWQuPC9wPlxcbjxwPkNhY2hpbmcgY2FuIGFsc28gYmUgdHdlYWtlZCBvbiBpbmRpdmlkdWFsIHJvdXRlcy4gRm9yIGluc3RhbmNlLCB5b3UgY291bGQgc2V0IDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSA8Y29kZT57IGNhY2hlOiAzNjAwIH08L2NvZGU+IG9uIGEgcm91dGUgdGhhdCB5b3Ugd2FudCB0byBjYWNoZSBmb3IgYSBsb25nZXIgcGVyaW9kIG9mIHRpbWUuPC9wPlxcbjxwPlRoZSBjYWNoaW5nIGxheWVyIGlzIDxlbT5zZWFtbGVzc2x5IGludGVncmF0ZWQ8L2VtPiBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gPGEgaHJlZj1cXFwiaHR0cDovL2Nhbml1c2UuY29tLyNmZWF0PWluZGV4ZWRkYlxcXCI+YnJvd3NlcnMgdGhhdCBzdXBwb3J0IEluZGV4ZWREQjwvYT4uIEluIHRoZSBjYXNlIG9mIGJyb3dzZXJzIHRoYXQgZG9uJiMzOTt0IHN1cHBvcnQgSW5kZXhlZERCLCBUYXVudXMgd2lsbCB1c2UgYW4gaW4tbWVtb3J5IGNhY2hlLCB3aGljaCB3aWxsIGJlIHdpcGVkIG91dCB3aGVuZXZlciB0aGUgaHVtYW4gZGVjaWRlcyB0byBjbG9zZSB0aGUgdGFiIGluIHRoZWlyIGJyb3dzZXIuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwicHJlZmV0Y2hpbmdcXFwiPlByZWZldGNoaW5nPC9oND5cXG48cD5JZiBjYWNoaW5nIGlzIGVuYWJsZWQsIHRoZSBuZXh0IGxvZ2ljYWwgc3RlcCBpcyBwcmVmZXRjaGluZy4gVGhpcyBpcyBlbmFibGVkIGp1c3QgYnkgYWRkaW5nIDxjb2RlPnByZWZldGNoOiB0cnVlPC9jb2RlPiB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi4gVGhlIHByZWZldGNoaW5nIGZlYXR1cmUgd2lsbCBmaXJlIGZvciBhbnkgYW5jaG9yIGxpbmsgdGhhdCYjMzk7cyB0cmlwcyBvdmVyIGEgPGNvZGU+bW91c2VvdmVyPC9jb2RlPiBvciBhIDxjb2RlPnRvdWNoc3RhcnQ8L2NvZGU+IGV2ZW50LiBJZiBhIHJvdXRlIG1hdGNoZXMgdGhlIFVSTCBpbiB0aGUgPGNvZGU+aHJlZjwvY29kZT4sIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuPC9wPlxcbjxwPldoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5JiMzOTtsbCB3YWl0IG9uIHRoZSBwcmVmZXRjaGVyIHRvIGZpbmlzaCBiZWZvcmUgaW1tZWRpYXRlbHkgc3dpdGNoaW5nIHRvIHRoZSB2aWV3LCBlZmZlY3RpdmVseSBjdXR0aW5nIGRvd24gdGhlIHJlc3BvbnNlIHRpbWUuIElmIHRoZSBsaW5rIHdhcyBhbHJlYWR5IHByZWZldGNoZWQgb3Igb3RoZXJ3aXNlIGNhY2hlZCwgdGhlIHZpZXcgd2lsbCBiZSBsb2FkZWQgaW1tZWRpYXRlbHkuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhIGxpbmsgYW5kIGFub3RoZXIgb25lIHdhcyBhbHJlYWR5IGJlaW5nIHByZWZldGNoZWQsIHRoZW4gdGhhdCBvbmUgaXMgYWJvcnRlZC4gVGhpcyBwcmV2ZW50cyBwcmVmZXRjaGluZyBmcm9tIGRyYWluaW5nIHRoZSBiYW5kd2lkdGggb24gY2xpZW50cyB3aXRoIGxpbWl0ZWQgb3IgaW50ZXJtaXR0ZW50IGNvbm5lY3Rpdml0eS48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub24odHlwZSwgZm4pPC9jb2RlPjwvaDI+XFxuPHA+VGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIDxjb2RlPnRhdW51cy5vbjwvY29kZT4gaXMgdGhlIHdheSB5b3UgY2FuIHR1bmUgaW4gYW5kIGxpc3RlbiBmb3IgdGhlc2UgZXZlbnRzIHVzaW5nIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIDxjb2RlPmZuPC9jb2RlPi48L3A+XFxuPHRhYmxlPlxcbjx0aGVhZD5cXG48dHI+XFxuPHRoPkV2ZW50PC90aD5cXG48dGg+QXJndW1lbnRzPC90aD5cXG48dGg+RGVzY3JpcHRpb248L3RoPlxcbjwvdHI+XFxuPC90aGVhZD5cXG48dGJvZHk+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3N0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+Y29udGFpbmVyLCBtb2RlbDwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW4gPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPi48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O3JlbmRlciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+QSB2aWV3IGhhcyBqdXN0IGJlZW4gcmVuZGVyZWQgYW5kIGl0cyBjbGllbnQtc2lkZSBjb250cm9sbGVyIGlzIGFib3V0IHRvIGJlIGludm9rZWQ8L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLnN0YXJ0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBzdGFydHMuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5kb25lJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGRhdGE8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmFib3J0JiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQ8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC48L3RkPlxcbjwvdHI+XFxuPHRyPlxcbjx0ZD48Y29kZT4mIzM5O2ZldGNoLmVycm9yJiMzOTs8L2NvZGU+PC90ZD5cXG48dGQ+PGNvZGU+cm91dGUsIGNvbnRleHQsIGVycjwvY29kZT48L3RkPlxcbjx0ZD5FbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci48L3RkPlxcbjwvdHI+XFxuPC90Ym9keT5cXG48L3RhYmxlPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1vbmNlLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub25jZSh0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBpcyBlcXVpdmFsZW50IHRvIDxhIGhyZWY9XFxcIiMtdGF1bnVzLW9uLXR5cGUtZm4tXFxcIj48Y29kZT50YXVudXMub248L2NvZGU+PC9hPiwgZXhjZXB0IHRoZSBldmVudCBsaXN0ZW5lcnMgd2lsbCBiZSB1c2VkIG9uY2UgYW5kIHRoZW4gaXQmIzM5O2xsIGJlIGRpc2NhcmRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLW9mZi10eXBlLWZuLVxcXCI+PGNvZGU+dGF1bnVzLm9mZih0eXBlLCBmbik8L2NvZGU+PC9oMj5cXG48cD5Vc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIDxjb2RlPi5vbjwvY29kZT4gb3IgPGNvZGU+Lm9uY2U8L2NvZGU+LiBZb3UgbXVzdCBwcm92aWRlIHRoZSB0eXBlIG9mIGV2ZW50IHlvdSB3YW50IHRvIHJlbW92ZSBhbmQgYSByZWZlcmVuY2UgdG8gdGhlIGV2ZW50IGxpc3RlbmVyIGZ1bmN0aW9uIHRoYXQgd2FzIG9yaWdpbmFsbHkgdXNlZCB3aGVuIGNhbGxpbmcgPGNvZGU+Lm9uPC9jb2RlPiBvciA8Y29kZT4ub25jZTwvY29kZT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1pbnRlcmNlcHQtYWN0aW9uLWZuLVxcXCI+PGNvZGU+dGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbik8L2NvZGU+PC9oMj5cXG48cD5UaGlzIG1ldGhvZCBjYW4gYmUgdXNlZCB0byBhbnRpY2lwYXRlIG1vZGVsIHJlcXVlc3RzLCBiZWZvcmUgdGhleSBldmVyIG1ha2UgaXQgaW50byBYSFIgcmVxdWVzdHMuIFlvdSBjYW4gYWRkIGludGVyY2VwdG9ycyBmb3Igc3BlY2lmaWMgYWN0aW9ucywgd2hpY2ggd291bGQgYmUgdHJpZ2dlcmVkIG9ubHkgaWYgdGhlIHJlcXVlc3QgbWF0Y2hlcyB0aGUgc3BlY2lmaWVkIDxjb2RlPmFjdGlvbjwvY29kZT4uIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgPGNvZGU+YWN0aW9uPC9jb2RlPiBwYXJhbWV0ZXIsIG9yIHNldHRpbmcgaXQgdG8gPGNvZGU+KjwvY29kZT4uPC9wPlxcbjxwPkFuIGludGVyY2VwdG9yIGZ1bmN0aW9uIHdpbGwgcmVjZWl2ZSBhbiA8Y29kZT5ldmVudDwvY29kZT4gcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLjwvcD5cXG48dWw+XFxuPGxpPjxjb2RlPnVybDwvY29kZT4gY29udGFpbnMgdGhlIFVSTCB0aGF0IG5lZWRzIGEgdmlldyBtb2RlbDwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlPC9jb2RlPiBjb250YWlucyB0aGUgZnVsbCByb3V0ZSBvYmplY3QgYXMgeW91JiMzOTtkIGdldCBmcm9tIDxhIGhyZWY9XFxcIiMtdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPjwvYT48L2xpPlxcbjxsaT48Y29kZT5wYXJ0czwvY29kZT4gaXMganVzdCBhIHNob3J0Y3V0IGZvciA8Y29kZT5yb3V0ZS5wYXJ0czwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5wcmV2ZW50RGVmYXVsdChtb2RlbCk8L2NvZGU+IGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UmIzM5O3ZlIHByb3ZpZGVkIGluc3RlYWQ8L2xpPlxcbjxsaT48Y29kZT5kZWZhdWx0UHJldmVudGVkPC9jb2RlPiB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3I8L2xpPlxcbjxsaT48Y29kZT5jYW5QcmV2ZW50RGVmYXVsdDwvY29kZT4gdGVsbHMgeW91IGlmIGludm9raW5nIDxjb2RlPmV2ZW50LnByZXZlbnREZWZhdWx0PC9jb2RlPiB3aWxsIGhhdmUgYW55IGVmZmVjdDwvbGk+XFxuPGxpPjxjb2RlPm1vZGVsPC9jb2RlPiBzdGFydHMgYXMgPGNvZGU+bnVsbDwvY29kZT4sIGFuZCBpdCBjYW4gbGF0ZXIgYmVjb21lIHRoZSBtb2RlbCBwYXNzZWQgdG8gPGNvZGU+cHJldmVudERlZmF1bHQ8L2NvZGU+PC9saT5cXG48L3VsPlxcbjxwPkludGVyY2VwdG9ycyBhcmUgYXN5bmNocm9ub3VzLCBidXQgaWYgYW4gaW50ZXJjZXB0b3Igc3BlbmRzIGxvbmdlciB0aGFuIDIwMG1zIGl0JiMzOTtsbCBiZSBzaG9ydC1jaXJjdWl0ZWQgYW5kIGNhbGxpbmcgPGNvZGU+ZXZlbnQucHJldmVudERlZmF1bHQ8L2NvZGU+IHBhc3QgdGhhdCBwb2ludCB3b24mIzM5O3QgaGF2ZSBhbnkgZWZmZWN0LjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDIgaWQ9XFxcIi10YXVudXMtcGFydGlhbC1jb250YWluZXItYWN0aW9uLW1vZGVsLVxcXCI+PGNvZGU+dGF1bnVzLnBhcnRpYWwoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsKTwvY29kZT48L2gyPlxcbjxwPlRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSA8Y29kZT5hY3Rpb248L2NvZGU+IHZpZXcgaW50byB0aGUgPGNvZGU+Y29udGFpbmVyPC9jb2RlPiBET00gZWxlbWVudCwgdXNpbmcgdGhlIHNwZWNpZmllZCA8Y29kZT5tb2RlbDwvY29kZT4uIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSA8Y29kZT5yZW5kZXI8L2NvZGU+IGV2ZW50IHdpbGwgYmUgZmlyZWQgPGVtPih3aXRoIDxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+IGFzIGFyZ3VtZW50cyk8L2VtPiBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoYXQgdmlldyB3aWxsIGJlIGV4ZWN1dGVkLjwvcD5cXG48cD5XaGlsZSA8Y29kZT50YXVudXMucGFydGlhbDwvY29kZT4gdGFrZXMgYSA8Y29kZT5yb3V0ZTwvY29kZT4gYXMgdGhlIGZvdXJ0aCBwYXJhbWV0ZXIsIHlvdSBzaG91bGQgb21pdCB0aGF0IHNpbmNlIGl0JiMzOTtzIHVzZWQgZm9yIGludGVybmFsIHB1cnBvc2VzIG9ubHkuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMiBpZD1cXFwiLXRhdW51cy1uYXZpZ2F0ZS11cmwtXFxcIj48Y29kZT50YXVudXMubmF2aWdhdGUodXJsKTwvY29kZT48L2gyPlxcbjxwPldoZW5ldmVyIHlvdSB3YW50IHRvIG5hdmlnYXRlIHRvIGEgVVJMLCBzYXkgd2hlbiBhbiBBSkFYIGNhbGwgZmluaXNoZXMgYWZ0ZXIgYSBidXR0b24gY2xpY2ssIHlvdSBjYW4gdXNlIDxjb2RlPnRhdW51cy5uYXZpZ2F0ZTwvY29kZT4gcGFzc2luZyBpdCBhIHBsYWluIFVSTC48L3A+XFxuPHA+SWYgPGNvZGU+dGF1bnVzLm5hdmlnYXRlKHVybCk8L2NvZGU+IGlzIGNhbGxlZCB3aXRoIGFuIDxjb2RlPnVybDwvY29kZT4gdGhhdCBkb2VzbiYjMzk7dCBtYXRjaCBhbnkgY2xpZW50LXNpZGUgcm91dGUsIHRoZW4gdGhlIHVzZXIgd2lsbCBiZSByZWRpcmVjdGVkIHZpYSA8Y29kZT5sb2NhdGlvbi5ocmVmPC9jb2RlPi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXJvdXRlLXVybC1cXFwiPjxjb2RlPnRhdW51cy5yb3V0ZSh1cmwpPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhpcyBtZXRob2Qgc2hvdWxkbiYjMzk7dCBiZSBuZWVkZWQgZHVyaW5nIG5vcm1hbCB1c2FnZSBvZiBUYXVudXMsIGJ1dCBpdCYjMzk7cyB1c2VmdWwgd2hlbiBkZWJ1Z2dpbmcgeW91ciByb3V0aW5nIHRhYmxlcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgyIGlkPVxcXCItdGF1bnVzLXN0YXRlLVxcXCI+PGNvZGU+dGF1bnVzLnN0YXRlPC9jb2RlPjwvaDI+XFxuPHA+VGhpcyBpcyBhbiBpbnRlcm5hbCBzdGF0ZSB2YXJpYWJsZSwgYW5kIGl0IGNvbnRhaW5zIGEgbG90IG9mIHVzZWZ1bCBkZWJ1Z2dpbmcgaW5mb3JtYXRpb24uPC9wPlxcbjx1bD5cXG48bGk+PGNvZGU+Y29udGFpbmVyPC9jb2RlPiBpcyB0aGUgRE9NIGVsZW1lbnQgcGFzc2VkIHRvIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT48L2xpPlxcbjxsaT48Y29kZT5jb250cm9sbGVyczwvY29kZT4gYXJlIGFsbCB0aGUgY29udHJvbGxlcnMsIGFzIGRlZmluZWQgaW4gdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT48Y29kZT50ZW1wbGF0ZXM8L2NvZGU+IGFyZSBhbGwgdGhlIHRlbXBsYXRlcywgYXMgZGVmaW5lZCBpbiB0aGUgd2lyaW5nIG1vZHVsZTwvbGk+XFxuPGxpPjxjb2RlPnJvdXRlczwvY29kZT4gYXJlIGFsbCB0aGUgcm91dGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+PGNvZGU+cHJlZmV0Y2g8L2NvZGU+IGV4cG9zZXMgd2hldGhlciBwcmVmZXRjaGluZyBpcyB0dXJuZWQgb248L2xpPlxcbjxsaT48Y29kZT5jYWNoZTwvY29kZT4gZXhwb3NlcyB3aGV0aGVyIGNhY2hpbmcgaXMgZW5hYmxlZDwvbGk+XFxuPGxpPjxjb2RlPm1vZGVsPC9jb2RlPiBpcyBhIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgdXNlZCB0byByZW5kZXIgdGhlIGN1cnJlbnQgdmlldzwvbGk+XFxuPC91bD5cXG48cD5PZiBjb3Vyc2UsIHlvdXIgbm90IHN1cHBvc2VkIHRvIG1lZGRsZSB3aXRoIGl0LCBzbyBiZSBhIGdvb2QgY2l0aXplbiBhbmQganVzdCBpbnNwZWN0IGl0cyB2YWx1ZXMhPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGhlLXRhdW51c3JjLW1hbmlmZXN0XFxcIj5UaGUgPGNvZGU+LnRhdW51c3JjPC9jb2RlPiBtYW5pZmVzdDwvaDE+XFxuPHA+SWYgeW91IHdhbnQgdG8gdXNlIHZhbHVlcyBvdGhlciB0aGFuIHRoZSBjb252ZW50aW9uYWwgZGVmYXVsdHMgc2hvd24gaW4gdGhlIHRhYmxlIGJlbG93LCB0aGVuIHlvdSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LnRhdW51c3JjPC9jb2RlPiBmaWxlLiBOb3RlIHRoYXQgdGhlIGRlZmF1bHRzIG5lZWQgdG8gYmUgb3ZlcndyaXR0ZW4gaW4gYSBjYXNlLWJ5LWNhc2UgYmFzaXMuIFRoZXNlIG9wdGlvbnMgY2FuIGFsc28gYmUgY29uZmlndXJlZCBpbiB5b3VyIDxjb2RlPnBhY2thZ2UuanNvbjwvY29kZT4sIHVuZGVyIHRoZSA8Y29kZT50YXVudXM8L2NvZGU+IHByb3BlcnR5LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzb25cXFwiPntcXG4gICZxdW90O3ZpZXdzJnF1b3Q7OiAmcXVvdDsuYmluL3ZpZXdzJnF1b3Q7LFxcbiAgJnF1b3Q7c2VydmVyX3JvdXRlcyZxdW90OzogJnF1b3Q7Y29udHJvbGxlcnMvcm91dGVzLmpzJnF1b3Q7LFxcbiAgJnF1b3Q7c2VydmVyX2NvbnRyb2xsZXJzJnF1b3Q7OiAmcXVvdDtjb250cm9sbGVycyZxdW90OyxcXG4gICZxdW90O2NsaWVudF9jb250cm9sbGVycyZxdW90OzogJnF1b3Q7Y2xpZW50L2pzL2NvbnRyb2xsZXJzJnF1b3Q7LFxcbiAgJnF1b3Q7Y2xpZW50X3dpcmluZyZxdW90OzogJnF1b3Q7LmJpbi93aXJpbmcuanMmcXVvdDtcXG59XFxuPC9jb2RlPjwvcHJlPlxcbjx1bD5cXG48bGk+VGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaXMgd2hlcmUgeW91ciB2aWV3cyA8ZW0+KGFscmVhZHkgY29tcGlsZWQgaW50byBKYXZhU2NyaXB0KTwvZW0+IGFyZSBwbGFjZWQuIFRoZXNlIHZpZXdzIGFyZSB1c2VkIGRpcmVjdGx5IG9uIGJvdGggdGhlIHNlcnZlci1zaWRlIGFuZCB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5UaGUgPGNvZGU+c2VydmVyX3JvdXRlczwvY29kZT4gZmlsZSBpcyB0aGUgbW9kdWxlIHdoZXJlIHlvdSBleHBvcnQgYSBjb2xsZWN0aW9uIG9mIHJvdXRlcy4gVGhlIENMSSB3aWxsIHB1bGwgdGhlc2Ugcm91dGVzIHdoZW4gY3JlYXRpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRlcyBmb3IgdGhlIHdpcmluZyBtb2R1bGU8L2xpPlxcbjxsaT5UaGUgPGNvZGU+c2VydmVyX2NvbnRyb2xsZXJzPC9jb2RlPiBkaXJlY3RvcnkgaXMgdGhlIHJvb3QgZGlyZWN0b3J5IHdoZXJlIHlvdXIgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgbGl2ZS4gSXQmIzM5O3MgdXNlZCB3aGVuIHNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlIHJvdXRlcjwvbGk+XFxuPGxpPlRoZSA8Y29kZT5jbGllbnRfY29udHJvbGxlcnM8L2NvZGU+IGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgbW9kdWxlcyBsaXZlLiBUaGUgQ0xJIHdpbGwgPGNvZGU+cmVxdWlyZTwvY29kZT4gdGhlc2UgY29udHJvbGxlcnMgaW4gaXRzIHJlc3VsdGluZyB3aXJpbmcgbW9kdWxlPC9saT5cXG48bGk+VGhlIDxjb2RlPmNsaWVudF93aXJpbmc8L2NvZGU+IGZpbGUgaXMgd2hlcmUgeW91ciB3aXJpbmcgbW9kdWxlIHdpbGwgYmUgcGxhY2VkIGJ5IHRoZSBDTEkuIFlvdSYjMzk7bGwgdGhlbiBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGl0IGluIHlvdXIgYXBwbGljYXRpb24gd2hlbiBib290aW5nIHVwIFRhdW51czwvbGk+XFxuPC91bD5cXG48cD5IZXJlIGlzIHdoZXJlIHRoaW5ncyBnZXQgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+YSBsaXR0bGUgY29udmVudGlvbmFsPC9hPi4gVmlld3MsIGFuZCBib3RoIHNlcnZlci1zaWRlIGFuZCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgZXhwZWN0ZWQgdG8gYmUgb3JnYW5pemVkIGJ5IGZvbGxvd2luZyB0aGUgPGNvZGU+e3Jvb3R9L3tjb250cm9sbGVyfS97YWN0aW9ufTwvY29kZT4gcGF0dGVybiwgYnV0IHlvdSBjb3VsZCBjaGFuZ2UgdGhhdCB1c2luZyA8Y29kZT5yZXNvbHZlcnM8L2NvZGU+IHdoZW4gaW52b2tpbmcgdGhlIENMSSBhbmQgdXNpbmcgdGhlIHNlcnZlci1zaWRlIEFQSS48L3A+XFxuPHA+Vmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBhbHNvIGV4cGVjdGVkIHRvIGJlIENvbW1vbkpTIG1vZHVsZXMgdGhhdCBleHBvcnQgYSBzaW5nbGUgbWV0aG9kLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEFQSSBEb2N1bWVudGF0aW9uXFxuXFxuICAgIEhlcmUncyB0aGUgQVBJIGRvY3VtZW50YXRpb24gZm9yIFRhdW51cy4gSWYgeW91J3ZlIG5ldmVyIHVzZWQgaXQgYmVmb3JlLCB3ZSByZWNvbW1lbmQgZ29pbmcgb3ZlciB0aGUgW0dldHRpbmcgU3RhcnRlZF1bMV0gZ3VpZGUgYmVmb3JlIGp1bXBpbmcgaW50byB0aGUgQVBJIGRvY3VtZW50YXRpb24uIFRoYXQgd2F5LCB5b3UnbGwgZ2V0IGEgYmV0dGVyIGlkZWEgb2Ygd2hhdCB0byBsb29rIGZvciBhbmQgaG93IHRvIHB1dCB0b2dldGhlciBzaW1wbGUgYXBwbGljYXRpb25zIHVzaW5nIFRhdW51cywgYmVmb3JlIGdvaW5nIHRocm91Z2ggZG9jdW1lbnRhdGlvbiBvbiBldmVyeSBwdWJsaWMgaW50ZXJmYWNlIHRvIFRhdW51cy5cXG5cXG4gICAgVGF1bnVzIGV4cG9zZXMgX3RocmVlIGRpZmZlcmVudCBwdWJsaWMgQVBJc18sIGFuZCB0aGVyZSdzIGFsc28gKipwbHVnaW5zIHRvIGludGVncmF0ZSBUYXVudXMgYW5kIGFuIEhUVFAgc2VydmVyKiouIFRoaXMgZG9jdW1lbnQgY292ZXJzIGFsbCB0aHJlZSBBUElzIGV4dGVuc2l2ZWx5LiBJZiB5b3UncmUgY29uY2VybmVkIGFib3V0IHRoZSBpbm5lciB3b3JraW5ncyBvZiBUYXVudXMsIHBsZWFzZSByZWZlciB0byB0aGUgW0dldHRpbmcgU3RhcnRlZF1bMV0gZ3VpZGUuIFRoaXMgZG9jdW1lbnQgYWltcyB0byBvbmx5IGNvdmVyIGhvdyB0aGUgcHVibGljIGludGVyZmFjZSBhZmZlY3RzIGFwcGxpY2F0aW9uIHN0YXRlLCBidXQgKipkb2Vzbid0IGRlbHZlIGludG8gaW1wbGVtZW50YXRpb24gZGV0YWlscyoqLlxcblxcbiAgICAjIFRhYmxlIG9mIENvbnRlbnRzXFxuXFxuICAgIC0gQSBbc2VydmVyLXNpZGUgQVBJXSgjc2VydmVyLXNpZGUtYXBpKSB0aGF0IGRlYWxzIHdpdGggc2VydmVyLXNpZGUgcmVuZGVyaW5nXFxuICAgICAgLSBUaGUgW2B0YXVudXMubW91bnRgXSgjLXRhdW51cy1tb3VudC1hZGRyb3V0ZS1vcHRpb25zLSkgbWV0aG9kXFxuICAgICAgICAtIEl0cyBbYG9wdGlvbnNgXSgjdGhlLW9wdGlvbnMtb2JqZWN0KSBhcmd1bWVudFxcbiAgICAgICAgICAtIFtgbGF5b3V0YF0oIy1vcHRpb25zLWxheW91dC0pXFxuICAgICAgICAgIC0gW2Byb3V0ZXNgXSgjLW9wdGlvbnMtcm91dGVzLSlcXG4gICAgICAgICAgLSBbYGdldERlZmF1bHRWaWV3TW9kZWxgXSgjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC0pXFxuICAgICAgICAgIC0gW2BwbGFpbnRleHRgXSgjLW9wdGlvbnMtcGxhaW50ZXh0LSlcXG4gICAgICAgICAgLSBbYHJlc29sdmVyc2BdKCMtb3B0aW9ucy1yZXNvbHZlcnMtKVxcbiAgICAgICAgLSBJdHMgW2BhZGRSb3V0ZWBdKCMtYWRkcm91dGUtZGVmaW5pdGlvbi0pIGFyZ3VtZW50XFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVuZGVyYF0oIy10YXVudXMtcmVuZGVyLWFjdGlvbi12aWV3bW9kZWwtcmVxLXJlcy1uZXh0LSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWxgXSgjLXRhdW51cy1yZWJ1aWxkZGVmYXVsdHZpZXdtb2RlbC1kb25lLSkgbWV0aG9kXFxuICAgIC0gQSBbc3VpdGUgb2YgcGx1Z2luc10oI2h0dHAtZnJhbWV3b3JrLXBsdWdpbnMpIGNhbiBpbnRlZ3JhdGUgVGF1bnVzIGFuZCBhbiBIVFRQIHNlcnZlclxcbiAgICAgIC0gVXNpbmcgW2B0YXVudXMtZXhwcmVzc2BdKCN1c2luZy10YXVudXMtZXhwcmVzcy0pIGZvciBbRXhwcmVzc11bMl1cXG4gICAgICAtIFVzaW5nIFtgdGF1bnVzLWhhcGlgXSgjdXNpbmctdGF1bnVzLWhhcGktKSBmb3IgW0hhcGldWzNdXFxuICAgIC0gQSBbQ0xJIHRoYXQgcHJvZHVjZXMgYSB3aXJpbmcgbW9kdWxlXSgjY29tbWFuZC1saW5lLWludGVyZmFjZSkgZm9yIHRoZSBjbGllbnQtc2lkZVxcbiAgICAgIC0gVGhlIFtgLS1vdXRwdXRgXSgjLW91dHB1dC0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0td2F0Y2hgXSgjLXdhdGNoLSkgZmxhZ1xcbiAgICAgIC0gVGhlIFtgLS10cmFuc2Zvcm0gPG1vZHVsZT5gXSgjLXRyYW5zZm9ybS1tb2R1bGUtKSBmbGFnXFxuICAgICAgLSBUaGUgW2AtLXJlc29sdmVycyA8bW9kdWxlPmBdKCMtcmVzb2x2ZXJzLW1vZHVsZS0pIGZsYWdcXG4gICAgICAtIFRoZSBbYC0tc3RhbmRhbG9uZWBdKCMtc3RhbmRhbG9uZS0pIGZsYWdcXG4gICAgLSBBIFtjbGllbnQtc2lkZSBBUEldKCNjbGllbnQtc2lkZS1hcGkpIHRoYXQgZGVhbHMgd2l0aCBjbGllbnQtc2lkZSByZW5kZXJpbmdcXG4gICAgICAtIFRoZSBbYHRhdW51cy5tb3VudGBdKCMtdGF1bnVzLW1vdW50LWNvbnRhaW5lci13aXJpbmctb3B0aW9ucy0pIG1ldGhvZFxcbiAgICAgICAgLSBVc2luZyB0aGUgW2BhdXRvYF0oI3VzaW5nLXRoZS1hdXRvLXN0cmF0ZWd5KSBzdHJhdGVneVxcbiAgICAgICAgLSBVc2luZyB0aGUgW2BpbmxpbmVgXSgjdXNpbmctdGhlLWlubGluZS1zdHJhdGVneSkgc3RyYXRlZ3lcXG4gICAgICAgIC0gVXNpbmcgdGhlIFtgbWFudWFsYF0oI3VzaW5nLXRoZS1tYW51YWwtc3RyYXRlZ3kpIHN0cmF0ZWd5XFxuICAgICAgICAtIFtDYWNoaW5nXSgjY2FjaGluZylcXG4gICAgICAgIC0gW1ByZWZldGNoaW5nXSgjcHJlZmV0Y2hpbmcpXFxuICAgICAgLSBUaGUgW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMub25jZWBdKCMtdGF1bnVzLW9uY2UtdHlwZS1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLm9mZmBdKCMtdGF1bnVzLW9mZi10eXBlLWZuLSkgbWV0aG9kXFxuICAgICAgLSBUaGUgW2B0YXVudXMuaW50ZXJjZXB0YF0oIy10YXVudXMtaW50ZXJjZXB0LWFjdGlvbi1mbi0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnBhcnRpYWxgXSgjLXRhdW51cy1wYXJ0aWFsLWNvbnRhaW5lci1hY3Rpb24tbW9kZWwtKSBtZXRob2RcXG4gICAgICAtIFRoZSBbYHRhdW51cy5uYXZpZ2F0ZWBdKCMtdGF1bnVzLW5hdmlnYXRlLXVybC0pIG1ldGhvZFxcbiAgICAgIC0gVGhlIFtgdGF1bnVzLnN0YXRlYF0oIy10YXVudXMtcm91dGUtdXJsLSkgcHJvcGVydHlcXG4gICAgICAtIFRoZSBbYHRhdW51cy5yb3V0ZWBdKCMtdGF1bnVzLXN0YXRlLSkgbWV0aG9kXFxuICAgIC0gVGhlIFtgLnRhdW51c3JjYF0oI3RoZS10YXVudXNyYy1tYW5pZmVzdCkgbWFuaWZlc3RcXG5cXG4gICAgIyBTZXJ2ZXItc2lkZSBBUElcXG5cXG4gICAgVGhlIHNlcnZlci1zaWRlIEFQSSBpcyB1c2VkIHRvIHNldCB1cCB0aGUgdmlldyByb3V0ZXIuIEl0IHRoZW4gZ2V0cyBvdXQgb2YgdGhlIHdheSwgYWxsb3dpbmcgdGhlIGNsaWVudC1zaWRlIHRvIGV2ZW50dWFsbHkgdGFrZSBvdmVyIGFuZCBhZGQgYW55IGV4dHJhIHN1Z2FyIG9uIHRvcCwgX2luY2x1ZGluZyBjbGllbnQtc2lkZSByZW5kZXJpbmdfLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm1vdW50KGFkZFJvdXRlLCBvcHRpb25zPylgXFxuXFxuICAgIE1vdW50cyBUYXVudXMgb24gdG9wIG9mIGEgc2VydmVyLXNpZGUgcm91dGVyLCBieSByZWdpc3RlcmluZyBlYWNoIHJvdXRlIGluIGBvcHRpb25zLnJvdXRlc2Agd2l0aCB0aGUgYGFkZFJvdXRlYCBtZXRob2QuXFxuXFxuICAgID4gTm90ZSB0aGF0IG1vc3Qgb2YgdGhlIHRpbWUsICoqdGhpcyBtZXRob2Qgc2hvdWxkbid0IGJlIGludm9rZWQgZGlyZWN0bHkqKiwgYnV0IHJhdGhlciB0aHJvdWdoIG9uZSBvZiB0aGUgW0hUVFAgZnJhbWV3b3JrIHBsdWdpbnNdKCNodHRwLWZyYW1ld29yay1wbHVnaW5zKSBwcmVzZW50ZWQgYmVsb3cuXFxuXFxuICAgIEhlcmUncyBhbiBpbmNvbXBsZXRlIGV4YW1wbGUgb2YgaG93IHRoaXMgbWV0aG9kIG1heSBiZSB1c2VkLiBJdCBpcyBpbmNvbXBsZXRlIGJlY2F1c2Ugcm91dGUgZGVmaW5pdGlvbnMgaGF2ZSBtb3JlIG9wdGlvbnMgYmV5b25kIHRoZSBgcm91dGVgIGFuZCBgYWN0aW9uYCBwcm9wZXJ0aWVzLlxcblxcbiAgICBgYGBqc1xcbiAgICB0YXVudXMubW91bnQoYWRkUm91dGUsIHtcXG4gICAgICByb3V0ZXM6IFt7IHJvdXRlOiAnLycsIGFjdGlvbjogJ2hvbWUvaW5kZXgnIH1dXFxuICAgIH0pO1xcblxcbiAgICBmdW5jdGlvbiBhZGRSb3V0ZSAoZGVmaW5pdGlvbikge1xcbiAgICAgIGFwcC5nZXQoZGVmaW5pdGlvbi5yb3V0ZSwgZGVmaW5pdGlvbi5hY3Rpb24pO1xcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICBMZXQncyBnbyBvdmVyIHRoZSBvcHRpb25zIHlvdSBjYW4gcGFzcyB0byBgdGF1bnVzLm1vdW50YCBmaXJzdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBUaGUgYG9wdGlvbnM/YCBvYmplY3RcXG5cXG4gICAgVGhlcmUncyBhIGZldyBvcHRpb25zIHRoYXQgY2FuIGJlIHBhc3NlZCB0byB0aGUgc2VydmVyLXNpZGUgbW91bnRwb2ludC4gWW91J3JlIHByb2JhYmx5IGdvaW5nIHRvIGJlIHBhc3NpbmcgdGhlc2UgdG8geW91ciBbSFRUUCBmcmFtZXdvcmsgcGx1Z2luXSgjaHR0cC1mcmFtZXdvcmstcGx1Z2lucyksIHJhdGhlciB0aGFuIHVzaW5nIGB0YXVudXMubW91bnRgIGRpcmVjdGx5LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMubGF5b3V0P2BcXG5cXG4gICAgVGhlIGBsYXlvdXRgIHByb3BlcnR5IGlzIGV4cGVjdGVkIHRvIGhhdmUgdGhlIGBmdW5jdGlvbihkYXRhKWAgc2lnbmF0dXJlLiBJdCdsbCBiZSBpbnZva2VkIHdoZW5ldmVyIGEgZnVsbCBIVE1MIGRvY3VtZW50IG5lZWRzIHRvIGJlIHJlbmRlcmVkLCBhbmQgYSBgZGF0YWAgb2JqZWN0IHdpbGwgYmUgcGFzc2VkIHRvIGl0LiBUaGF0IG9iamVjdCB3aWxsIGNvbnRhaW4gZXZlcnl0aGluZyB5b3UndmUgc2V0IGFzIHRoZSB2aWV3IG1vZGVsLCBwbHVzIGEgYHBhcnRpYWxgIHByb3BlcnR5IGNvbnRhaW5pbmcgdGhlIHJhdyBIVE1MIG9mIHRoZSByZW5kZXJlZCBwYXJ0aWFsIHZpZXcuIFlvdXIgYGxheW91dGAgbWV0aG9kIHdpbGwgdHlwaWNhbGx5IHdyYXAgdGhlIHJhdyBIVE1MIGZvciB0aGUgcGFydGlhbCB3aXRoIHRoZSBiYXJlIGJvbmVzIG9mIGFuIEhUTUwgZG9jdW1lbnQuIENoZWNrIG91dCBbdGhlIGBsYXlvdXQuamFkZWAgdXNlZCBpbiBQb255IEZvb11bNF0gYXMgYW4gZXhhbXBsZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnJvdXRlc2BcXG5cXG4gICAgVGhlIG90aGVyIGJpZyBvcHRpb24gaXMgYHJvdXRlc2AsIHdoaWNoIGV4cGVjdHMgYSBjb2xsZWN0aW9uIG9mIHJvdXRlIGRlZmluaXRpb25zLiBSb3V0ZSBkZWZpbml0aW9ucyB1c2UgYSBudW1iZXIgb2YgcHJvcGVydGllcyB0byBkZXRlcm1pbmUgaG93IHRoZSByb3V0ZSBpcyBnb2luZyB0byBiZWhhdmUuXFxuXFxuICAgIEhlcmUncyBhbiBleGFtcGxlIHJvdXRlIHRoYXQgdXNlcyB0aGUgW0V4cHJlc3NdWzJdIHJvdXRpbmcgc2NoZW1lLlxcblxcbiAgICBgYGBqc1xcbiAgICB7XFxuICAgICAgcm91dGU6ICcvYXJ0aWNsZXMvOnNsdWcnLFxcbiAgICAgIGFjdGlvbjogJ2FydGljbGVzL2FydGljbGUnLFxcbiAgICAgIGlnbm9yZTogZmFsc2UsXFxuICAgICAgY2FjaGU6IDxpbmhlcml0PlxcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICAtIGByb3V0ZWAgaXMgYSByb3V0ZSBpbiB0aGUgZm9ybWF0IHlvdXIgSFRUUCBmcmFtZXdvcmsgb2YgY2hvaWNlIHVuZGVyc3RhbmRzXFxuICAgIC0gYGFjdGlvbmAgaXMgdGhlIG5hbWUgb2YgeW91ciBjb250cm9sbGVyIGFjdGlvbi4gSXQnbGwgYmUgdXNlZCB0byBmaW5kIHRoZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVyLCB0aGUgZGVmYXVsdCB2aWV3IHRoYXQgc2hvdWxkIGJlIHVzZWQgd2l0aCB0aGlzIHJvdXRlLCBhbmQgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJcXG4gICAgLSBgY2FjaGVgIGNhbiBiZSB1c2VkIHRvIGRldGVybWluZSB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBiZWhhdmlvciBpbiB0aGlzIGFwcGxpY2F0aW9uIHBhdGgsIGFuZCBpdCdsbCBkZWZhdWx0IHRvIGluaGVyaXRpbmcgZnJvbSB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgX29uIHRoZSBjbGllbnQtc2lkZV9cXG4gICAgLSBgaWdub3JlYCBpcyB1c2VkIGluIHRob3NlIGNhc2VzIHdoZXJlIHlvdSB3YW50IGEgVVJMIHRvIGJlIGlnbm9yZWQgYnkgdGhlIGNsaWVudC1zaWRlIHJvdXRlciBldmVuIGlmIHRoZXJlJ3MgYSBjYXRjaC1hbGwgcm91dGUgdGhhdCB3b3VsZCBtYXRjaCB0aGF0IFVSTFxcblxcbiAgICBBcyBhbiBleGFtcGxlIG9mIHRoZSBgaWdub3JlYCB1c2UgY2FzZSwgY29uc2lkZXIgdGhlIHJvdXRpbmcgdGFibGUgc2hvd24gYmVsb3cuIFRoZSBjbGllbnQtc2lkZSByb3V0ZXIgZG9lc24ndCBrbm93IF8oYW5kIGNhbid0IGtub3cgdW5sZXNzIHlvdSBwb2ludCBpdCBvdXQpXyB3aGF0IHJvdXRlcyBhcmUgc2VydmVyLXNpZGUgb25seSwgYW5kIGl0J3MgdXAgdG8geW91IHRvIHBvaW50IHRob3NlIG91dC5cXG5cXG4gICAgYGBganNcXG4gICAgW1xcbiAgICAgIHsgcm91dGU6ICcvJywgYWN0aW9uOiAnL2hvbWUvaW5kZXgnIH0sXFxuICAgICAgeyByb3V0ZTogJy9mZWVkJywgaWdub3JlOiB0cnVlIH0sXFxuICAgICAgeyByb3V0ZTogJy8qJywgYWN0aW9uOiAnZXJyb3Ivbm90LWZvdW5kJyB9XFxuICAgIF1cXG4gICAgYGBgXFxuXFxuICAgIFRoaXMgc3RlcCBpcyBuZWNlc3Nhcnkgd2hlbmV2ZXIgeW91IGhhdmUgYW4gYW5jaG9yIGxpbmsgcG9pbnRlZCBhdCBzb21ldGhpbmcgbGlrZSBhbiBSU1MgZmVlZC4gVGhlIGBpZ25vcmVgIHByb3BlcnR5IGlzIGVmZmVjdGl2ZWx5IHRlbGxpbmcgdGhlIGNsaWVudC1zaWRlIF9cXFwiZG9uJ3QgaGlqYWNrIGxpbmtzIGNvbnRhaW5pbmcgdGhpcyBVUkxcXFwiXy5cXG5cXG4gICAgUGxlYXNlIG5vdGUgdGhhdCBleHRlcm5hbCBsaW5rcyBhcmUgbmV2ZXIgaGlqYWNrZWQuIE9ubHkgc2FtZS1vcmlnaW4gbGlua3MgY29udGFpbmluZyBhIFVSTCB0aGF0IG1hdGNoZXMgb25lIG9mIHRoZSByb3V0ZXMgd2lsbCBiZSBoaWphY2tlZCBieSBUYXVudXMuIEV4dGVybmFsIGxpbmtzIGRvbid0IG5lZWQgdG8gYmUgYGlnbm9yZWBkLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIyMgYG9wdGlvbnMuZ2V0RGVmYXVsdFZpZXdNb2RlbD9gXFxuXFxuICAgIFRoZSBgZ2V0RGVmYXVsdFZpZXdNb2RlbChkb25lKWAgcHJvcGVydHkgY2FuIGJlIGEgbWV0aG9kIHRoYXQgcHV0cyB0b2dldGhlciB0aGUgYmFzZSB2aWV3IG1vZGVsLCB3aGljaCB3aWxsIHRoZW4gYmUgZXh0ZW5kZWQgb24gYW4gYWN0aW9uLWJ5LWFjdGlvbiBiYXNpcy4gV2hlbiB5b3UncmUgZG9uZSBjcmVhdGluZyBhIHZpZXcgbW9kZWwsIHlvdSBjYW4gaW52b2tlIGBkb25lKG51bGwsIG1vZGVsKWAuIElmIGFuIGVycm9yIG9jY3VycyB3aGlsZSBidWlsZGluZyB0aGUgdmlldyBtb2RlbCwgeW91IHNob3VsZCBjYWxsIGBkb25lKGVycilgIGluc3RlYWQuXFxuXFxuICAgIFRhdW51cyB3aWxsIHRocm93IGFuIGVycm9yIGlmIGBkb25lYCBpcyBpbnZva2VkIHdpdGggYW4gZXJyb3IsIHNvIHlvdSBtaWdodCB3YW50IHRvIHB1dCBzYWZlZ3VhcmRzIGluIHBsYWNlIGFzIHRvIGF2b2lkIHRoYXQgZnJvbSBoYXBwZW5uaW5nLiBUaGUgcmVhc29uIHRoaXMgbWV0aG9kIGlzIGFzeW5jaHJvbm91cyBpcyBiZWNhdXNlIHlvdSBtYXkgbmVlZCBkYXRhYmFzZSBhY2Nlc3Mgb3Igc29tZXN1Y2ggd2hlbiBwdXR0aW5nIHRvZ2V0aGVyIHRoZSBkZWZhdWx0cy4gVGhlIHJlYXNvbiB0aGlzIGlzIGEgbWV0aG9kIGFuZCBub3QganVzdCBhbiBvYmplY3QgaXMgdGhhdCB0aGUgZGVmYXVsdHMgbWF5IGNoYW5nZSBkdWUgdG8gaHVtYW4gaW50ZXJhY3Rpb24gd2l0aCB0aGUgYXBwbGljYXRpb24sIGFuZCBpbiB0aG9zZSBjYXNlcyBbdGhlIGRlZmF1bHRzIGNhbiBiZSByZWJ1aWx0XSgjdGF1bnVzLXJlYnVpbGRkZWZhdWx0dmlld21vZGVsKS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnBsYWludGV4dD9gXFxuXFxuICAgIFRoZSBgcGxhaW50ZXh0YCBvcHRpb25zIG9iamVjdCBpcyBwYXNzZWQgZGlyZWN0bHkgdG8gW2hnZXRdWzVdLCBhbmQgaXQncyB1c2VkIHRvIFt0d2VhayB0aGUgcGxhaW50ZXh0IHZlcnNpb25dWzZdIG9mIHlvdXIgc2l0ZS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyMjIGBvcHRpb25zLnJlc29sdmVycz9gXFxuXFxuICAgIFJlc29sdmVycyBhcmUgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGxvY2F0aW9uIG9mIHNvbWUgb2YgdGhlIGRpZmZlcmVudCBwaWVjZXMgb2YgeW91ciBhcHBsaWNhdGlvbi4gVHlwaWNhbGx5IHlvdSB3b24ndCBoYXZlIHRvIHRvdWNoIHRoZXNlIGluIHRoZSBzbGlnaHRlc3QuXFxuXFxuICAgIFNpZ25hdHVyZSAgICAgICAgICAgICAgICAgICAgIHwgRGVzY3JpcHRpb25cXG4gICAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgZ2V0U2VydmVyQ29udHJvbGxlcihhY3Rpb24pYCB8IFJldHVybiBwYXRoIHRvIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIgYWN0aW9uIGhhbmRsZXIgbW9kdWxlXFxuICAgIGBnZXRWaWV3KGFjdGlvbilgICAgICAgICAgICAgIHwgUmV0dXJuIHBhdGggdG8gdmlldyB0ZW1wbGF0ZSBtb2R1bGVcXG5cXG4gICAgVGhlIGBhZGRSb3V0ZWAgbWV0aG9kIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBvbiB0aGUgc2VydmVyLXNpZGUgaXMgbW9zdGx5IGdvaW5nIHRvIGJlIHVzZWQgaW50ZXJuYWxseSBieSB0aGUgSFRUUCBmcmFtZXdvcmsgcGx1Z2lucywgc28gZmVlbCBmcmVlIHRvIHNraXAgb3ZlciB0aGUgZm9sbG93aW5nIHNlY3Rpb24uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgYGFkZFJvdXRlKGRlZmluaXRpb24pYFxcblxcbiAgICBUaGUgYGFkZFJvdXRlKGRlZmluaXRpb24pYCBtZXRob2Qgd2lsbCBiZSBwYXNzZWQgYSByb3V0ZSBkZWZpbml0aW9uLCBjb250YWluaW5nIHRoZSBmb2xsb3dpbmcgcHJvcGVydGllcy4gVGhpcyBtZXRob2QgaXMgZXhwZWN0ZWQgdG8gcmVnaXN0ZXIgYSByb3V0ZSBpbiB5b3VyIEhUVFAgZnJhbWV3b3JrJ3Mgcm91dGVyLlxcblxcbiAgICAtIGByb3V0ZWAgaXMgdGhlIHJvdXRlIHRoYXQgeW91IHNldCBhcyBgZGVmaW5pdGlvbi5yb3V0ZWBcXG4gICAgLSBgYWN0aW9uYCBpcyB0aGUgYWN0aW9uIGFzIHBhc3NlZCB0byB0aGUgcm91dGUgZGVmaW5pdGlvblxcbiAgICAtIGBhY3Rpb25GbmAgd2lsbCBiZSB0aGUgY29udHJvbGxlciBmb3IgdGhpcyBhY3Rpb24gbWV0aG9kXFxuICAgIC0gYG1pZGRsZXdhcmVgIHdpbGwgYmUgYW4gYXJyYXkgb2YgbWV0aG9kcyB0byBiZSBleGVjdXRlZCBiZWZvcmUgYGFjdGlvbkZuYFxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLnJlbmRlcihhY3Rpb24sIHZpZXdNb2RlbCwgcmVxLCByZXMsIG5leHQpYFxcblxcbiAgICBUaGlzIG1ldGhvZCBpcyBhbG1vc3QgYW4gaW1wbGVtZW50YXRpb24gZGV0YWlsIGFzIHlvdSBzaG91bGQgYmUgdXNpbmcgVGF1bnVzIHRocm91Z2ggb25lIG9mIHRoZSBwbHVnaW5zIGFueXdheXMsIHNvIHdlIHdvbid0IGdvIHZlcnkgZGVlcCBpbnRvIGl0LlxcblxcbiAgICBUaGUgcmVuZGVyIG1ldGhvZCBpcyB3aGF0IFRhdW51cyB1c2VzIHRvIHJlbmRlciB2aWV3cyBieSBjb25zdHJ1Y3RpbmcgSFRNTCwgSlNPTiwgb3IgcGxhaW50ZXh0IHJlc3BvbnNlcy4gVGhlIGBhY3Rpb25gIHByb3BlcnR5IGRldGVybWluZXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0IHdpbGwgYmUgcmVuZGVyZWQuIFRoZSBgdmlld01vZGVsYCB3aWxsIGJlIGV4dGVuZGVkIGJ5IFt0aGUgZGVmYXVsdCB2aWV3IG1vZGVsXSgjLW9wdGlvbnMtZ2V0ZGVmYXVsdHZpZXdtb2RlbC0pLCBhbmQgaXQgbWF5IGFsc28gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgYGFjdGlvbmAgYnkgc2V0dGluZyBgdmlld01vZGVsLm1vZGVsLmFjdGlvbmAuXFxuXFxuICAgIFRoZSBgcmVxYCwgYHJlc2AsIGFuZCBgbmV4dGAgYXJndW1lbnRzIGFyZSBleHBlY3RlZCB0byBiZSB0aGUgRXhwcmVzcyByb3V0aW5nIGFyZ3VtZW50cywgYnV0IHRoZXkgY2FuIGFsc28gYmUgbW9ja2VkIF8od2hpY2ggaXMgaW4gZmFjdCB3aGF0IHRoZSBIYXBpIHBsdWdpbiBkb2VzKV8uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucmVidWlsZERlZmF1bHRWaWV3TW9kZWwoZG9uZT8pYFxcblxcbiAgICBPbmNlIFRhdW51cyBoYXMgYmVlbiBtb3VudGVkLCBjYWxsaW5nIHRoaXMgbWV0aG9kIHdpbGwgcmVidWlsZCB0aGUgdmlldyBtb2RlbCBkZWZhdWx0cyB1c2luZyB0aGUgYGdldERlZmF1bHRWaWV3TW9kZWxgIHRoYXQgd2FzIHBhc3NlZCB0byBgdGF1bnVzLm1vdW50YCBpbiB0aGUgb3B0aW9ucy4gQW4gb3B0aW9uYWwgYGRvbmVgIGNhbGxiYWNrIHdpbGwgYmUgaW52b2tlZCB3aGVuIHRoZSBtb2RlbCBpcyByZWJ1aWx0LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIEhUVFAgRnJhbWV3b3JrIFBsdWdpbnNcXG5cXG4gICAgVGhlcmUncyBjdXJyZW50bHkgdHdvIGRpZmZlcmVudCBIVFRQIGZyYW1ld29ya3MgXyhbRXhwcmVzc11bMl0gYW5kIFtIYXBpXVszXSlfIHRoYXQgeW91IGNhbiByZWFkaWx5IHVzZSB3aXRoIFRhdW51cyB3aXRob3V0IGhhdmluZyB0byBkZWFsIHdpdGggYW55IG9mIHRoZSByb3V0ZSBwbHVtYmluZyB5b3Vyc2VsZi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgVXNpbmcgYHRhdW51cy1leHByZXNzYFxcblxcbiAgICBUaGUgYHRhdW51cy1leHByZXNzYCBwbHVnaW4gaXMgcHJvYmFibHkgdGhlIGVhc2llc3QgdG8gdXNlLCBhcyBUYXVudXMgd2FzIG9yaWdpbmFsbHkgZGV2ZWxvcGVkIHdpdGgganVzdCBbRXhwcmVzc11bMl0gaW4gbWluZC4gSW4gYWRkaXRpb24gdG8gdGhlIG9wdGlvbnMgYWxyZWFkeSBvdXRsaW5lZCBmb3IgW3RhdW51cy5tb3VudF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB5b3UgY2FuIGFkZCBtaWRkbGV3YXJlIGZvciBhbnkgcm91dGUgaW5kaXZpZHVhbGx5LlxcblxcbiAgICAtIGBtaWRkbGV3YXJlYCBhcmUgYW55IG1ldGhvZHMgeW91IHdhbnQgVGF1bnVzIHRvIGV4ZWN1dGUgYXMgbWlkZGxld2FyZSBpbiBFeHByZXNzIGFwcGxpY2F0aW9uc1xcblxcbiAgICBUbyBnZXQgYHRhdW51cy1leHByZXNzYCBnb2luZyB5b3UgY2FuIHVzZSB0aGUgZm9sbG93aW5nIHBpZWNlIG9mIGNvZGUsIHByb3ZpZGVkIHRoYXQgeW91IGNvbWUgdXAgd2l0aCBhbiBgb3B0aW9uc2Agb2JqZWN0LlxcblxcbiAgICBgYGBqc1xcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIC8vIC4uLlxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzRXhwcmVzc2AgbWV0aG9kIHdpbGwgbWVyZWx5IHNldCB1cCBUYXVudXMgYW5kIGFkZCB0aGUgcmVsZXZhbnQgcm91dGVzIHRvIHlvdXIgRXhwcmVzcyBhcHBsaWNhdGlvbiBieSBjYWxsaW5nIGBhcHAuZ2V0YCBhIGJ1bmNoIG9mIHRpbWVzLiBZb3UgY2FuIFtmaW5kIHRhdW51cy1leHByZXNzIG9uIEdpdEh1Yl1bN10uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIFVzaW5nIGB0YXVudXMtaGFwaWBcXG5cXG4gICAgVGhlIGB0YXVudXMtaGFwaWAgcGx1Z2luIGlzIGEgYml0IG1vcmUgaW52b2x2ZWQsIGFuZCB5b3UnbGwgaGF2ZSB0byBjcmVhdGUgYSBQYWNrIGluIG9yZGVyIHRvIHVzZSBpdC4gSW4gYWRkaXRpb24gdG8gW3RoZSBvcHRpb25zIHdlJ3ZlIGFscmVhZHkgY292ZXJlZF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB5b3UgY2FuIGFkZCBgY29uZmlnYCBvbiBhbnkgcm91dGUuXFxuXFxuICAgIC0gYGNvbmZpZ2AgaXMgcGFzc2VkIGRpcmVjdGx5IGludG8gdGhlIHJvdXRlIHJlZ2lzdGVyZWQgd2l0aCBIYXBpLCBnaXZpbmcgeW91IHRoZSBtb3N0IGZsZXhpYmlsaXR5XFxuXFxuICAgIFRvIGdldCBgdGF1bnVzLWhhcGlgIGdvaW5nIHlvdSBjYW4gdXNlIHRoZSBmb2xsb3dpbmcgcGllY2Ugb2YgY29kZSwgYW5kIHlvdSBjYW4gYnJpbmcgeW91ciBvd24gYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgdmFyIEhhcGkgPSByZXF1aXJlKCdoYXBpJyk7XFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0hhcGkgPSByZXF1aXJlKCd0YXVudXMtaGFwaScpKHRhdW51cyk7XFxuICAgIHZhciBwYWNrID0gbmV3IEhhcGkuUGFjaygpO1xcblxcbiAgICBwYWNrLnJlZ2lzdGVyKHtcXG4gICAgICBwbHVnaW46IHRhdW51c0hhcGksXFxuICAgICAgb3B0aW9uczoge1xcbiAgICAgICAgLy8gLi4uXFxuICAgICAgfVxcbiAgICB9KTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgdGF1bnVzSGFwaWAgcGx1Z2luIHdpbGwgbW91bnQgVGF1bnVzIGFuZCByZWdpc3RlciBhbGwgb2YgdGhlIG5lY2Vzc2FyeSByb3V0ZXMuIFlvdSBjYW4gW2ZpbmQgdGF1bnVzLWhhcGkgb24gR2l0SHViXVs4XS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBDb21tYW5kLUxpbmUgSW50ZXJmYWNlXFxuXFxuICAgIE9uY2UgeW91J3ZlIHNldCB1cCB0aGUgc2VydmVyLXNpZGUgdG8gcmVuZGVyIHlvdXIgdmlld3MgdXNpbmcgVGF1bnVzLCBpdCdzIG9ubHkgbG9naWNhbCB0aGF0IHlvdSdsbCB3YW50IHRvIHJlbmRlciB0aGUgdmlld3MgaW4gdGhlIGNsaWVudC1zaWRlIGFzIHdlbGwsIGVmZmVjdGl2ZWx5IGNvbnZlcnRpbmcgeW91ciBhcHBsaWNhdGlvbiBpbnRvIGEgc2luZ2xlLXBhZ2UgYXBwbGljYXRpb24gYWZ0ZXIgdGhlIGZpcnN0IHZpZXcgaGFzIGJlZW4gcmVuZGVyZWQgb24gdGhlIHNlcnZlci1zaWRlLlxcblxcbiAgICBUaGUgVGF1bnVzIENMSSBpcyBhbiB1c2VmdWwgaW50ZXJtZWRpYXJ5IGluIHRoZSBwcm9jZXNzIG9mIGdldHRpbmcgdGhlIGNvbmZpZ3VyYXRpb24geW91IHdyb3RlIHNvIGZhciBmb3IgdGhlIHNlcnZlci1zaWRlIHRvIGFsc28gd29yayB3ZWxsIGluIHRoZSBjbGllbnQtc2lkZS5cXG5cXG4gICAgSW5zdGFsbCBpdCBnbG9iYWxseSBmb3IgZGV2ZWxvcG1lbnQsIGJ1dCByZW1lbWJlciB0byB1c2UgbG9jYWwgY29waWVzIGZvciBwcm9kdWN0aW9uLWdyYWRlIHVzZXMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC1nIHRhdW51c1xcbiAgICBgYGBcXG5cXG4gICAgV2hlbiBpbnZva2VkIHdpdGhvdXQgYW55IGFyZ3VtZW50cywgdGhlIENMSSB3aWxsIHNpbXBseSBmb2xsb3cgdGhlIGRlZmF1bHQgY29udmVudGlvbnMgdG8gZmluZCB5b3VyIHJvdXRlIGRlZmluaXRpb25zLCB2aWV3cywgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXNcXG4gICAgYGBgXFxuXFxuICAgIEJ5IGRlZmF1bHQsIHRoZSBvdXRwdXQgd2lsbCBiZSBwcmludGVkIHRvIHRoZSBzdGFuZGFyZCBvdXRwdXQsIG1ha2luZyBmb3IgYSBmYXN0IGRlYnVnZ2luZyBleHBlcmllbmNlLiBIZXJlJ3MgdGhlIG91dHB1dCBpZiB5b3UganVzdCBoYWQgYSBzaW5nbGUgYGhvbWUvaW5kZXhgIHJvdXRlLCBhbmQgdGhlIG1hdGNoaW5nIHZpZXcgYW5kIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZXhpc3RlZC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGVtcGxhdGVzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi92aWV3cy9ob21lL2luZGV4LmpzJylcXG4gICAgfTtcXG5cXG4gICAgdmFyIGNvbnRyb2xsZXJzID0ge1xcbiAgICAgICdob21lL2luZGV4JzogcmVxdWlyZSgnLi4vY2xpZW50L2pzL2NvbnRyb2xsZXJzL2hvbWUvaW5kZXguanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgcm91dGVzID0ge1xcbiAgICAgICcvJzoge1xcbiAgICAgICAgYWN0aW9uOiAnaG9tZS9pbmRleCdcXG4gICAgICB9XFxuICAgIH07XFxuXFxuICAgIG1vZHVsZS5leHBvcnRzID0ge1xcbiAgICAgIHRlbXBsYXRlczogdGVtcGxhdGVzLFxcbiAgICAgIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gICAgICByb3V0ZXM6IHJvdXRlc1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgWW91IGNhbiB1c2UgYSBmZXcgb3B0aW9ucyB0byBhbHRlciB0aGUgb3V0Y29tZSBvZiBpbnZva2luZyBgdGF1bnVzYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0tb3V0cHV0YFxcblxcbiAgICA8c3ViPnRoZSBgLW9gIGFsaWFzIGlzIGF2YWlsYWJsZTwvc3ViPlxcblxcbiAgICBPdXRwdXQgaXMgd3JpdHRlbiB0byBhIGZpbGUgaW5zdGVhZCBvZiB0byBzdGFuZGFyZCBvdXRwdXQuIFRoZSBmaWxlIHBhdGggdXNlZCB3aWxsIGJlIHRoZSBgY2xpZW50X3dpcmluZ2Agb3B0aW9uIGluIFtgLnRhdW51c3JjYF0oI3RoZS10YXVudXNyYy1tYW5pZmVzdCksIHdoaWNoIGRlZmF1bHRzIHRvIGAnLmJpbi93aXJpbmcuanMnYC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYC0td2F0Y2hgXFxuXFxuICAgIDxzdWI+dGhlIGAtd2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFdoZW5ldmVyIGEgc2VydmVyLXNpZGUgcm91dGUgZGVmaW5pdGlvbiBjaGFuZ2VzLCB0aGUgb3V0cHV0IGlzIHByaW50ZWQgYWdhaW4gdG8gZWl0aGVyIHN0YW5kYXJkIG91dHB1dCBvciBhIGZpbGUsIGRlcGVuZGluZyBvbiB3aGV0aGVyIGAtLW91dHB1dGAgd2FzIHVzZWQuXFxuXFxuICAgIFRoZSBwcm9ncmFtIHdvbid0IGV4aXQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXRyYW5zZm9ybSA8bW9kdWxlPmBcXG5cXG4gICAgPHN1Yj50aGUgYC10YCBhbGlhcyBpcyBhdmFpbGFibGU8L3N1Yj5cXG5cXG4gICAgVGhpcyBmbGFnIGFsbG93cyB5b3UgdG8gdHJhbnNmb3JtIHNlcnZlci1zaWRlIHJvdXRlcyBpbnRvIHNvbWV0aGluZyB0aGUgY2xpZW50LXNpZGUgdW5kZXJzdGFuZHMuIEV4cHJlc3Mgcm91dGVzIGFyZSBjb21wbGV0ZWx5IGNvbXBhdGlibGUgd2l0aCB0aGUgY2xpZW50LXNpZGUgcm91dGVyLCBidXQgSGFwaSByb3V0ZXMgbmVlZCB0byBiZSB0cmFuc2Zvcm1lZCB1c2luZyB0aGUgW2BoYXBpaWZ5YF1bOV0gbW9kdWxlLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBucG0gaW5zdGFsbCBoYXBpaWZ5XFxuICAgIHRhdW51cyAtdCBoYXBpaWZ5XFxuICAgIGBgYFxcblxcbiAgICBVc2luZyB0aGlzIHRyYW5zZm9ybSByZWxpZXZlcyB5b3UgZnJvbSBoYXZpbmcgdG8gZGVmaW5lIHRoZSBzYW1lIHJvdXRlcyB0d2ljZSB1c2luZyBzbGlnaHRseSBkaWZmZXJlbnQgZm9ybWF0cyB0aGF0IGNvbnZleSB0aGUgc2FtZSBtZWFuaW5nLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgLS1yZXNvbHZlcnMgPG1vZHVsZT5gXFxuXFxuICAgIDxzdWI+dGhlIGAtcmAgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFNpbWlsYXJseSB0byB0aGUgW2ByZXNvbHZlcnNgXSgjLW9wdGlvbnMtcmVzb2x2ZXJzLSkgb3B0aW9uIHRoYXQgeW91IGNhbiBwYXNzIHRvIFtgdGF1bnVzLm1vdW50YF0oIy10YXVudXMtbW91bnQtYWRkcm91dGUtb3B0aW9ucy0pLCB0aGVzZSByZXNvbHZlcnMgY2FuIGNoYW5nZSB0aGUgd2F5IGluIHdoaWNoIGZpbGUgcGF0aHMgYXJlIHJlc29sdmVkLlxcblxcbiAgICBTaWduYXR1cmUgICAgICAgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cXG4gICAgYGdldENsaWVudENvbnRyb2xsZXIoYWN0aW9uKWAgfCBSZXR1cm4gcGF0aCB0byBjbGllbnQtc2lkZSBjb250cm9sbGVyIGFjdGlvbiBoYW5kbGVyIG1vZHVsZVxcbiAgICBgZ2V0VmlldyhhY3Rpb24pYCAgICAgICAgICAgICB8IFJldHVybiBwYXRoIHRvIHZpZXcgdGVtcGxhdGUgbW9kdWxlXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGAtLXN0YW5kYWxvbmVgXFxuXFxuICAgIDxzdWI+dGhlIGAtc2AgYWxpYXMgaXMgYXZhaWxhYmxlPC9zdWI+XFxuXFxuICAgIFVuZGVyIHRoaXMgZXhwZXJpbWVudGFsIGZsYWcsIHRoZSBDTEkgd2lsbCB1c2UgQnJvd3NlcmlmeSB0byBjb21waWxlIGEgc3RhbmRhbG9uZSBtb2R1bGUgdGhhdCBpbmNsdWRlcyB0aGUgd2lyaW5nIG5vcm1hbGx5IGV4cG9ydGVkIGJ5IHRoZSBDTEkgcGx1cyBhbGwgb2YgVGF1bnVzIFthcyBhIFVNRCBtb2R1bGVdWzEwXS5cXG5cXG4gICAgVGhpcyB3b3VsZCBhbGxvdyB5b3UgdG8gdXNlIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgZXZlbiBpZiB5b3UgZG9uJ3Qgd2FudCB0byB1c2UgW0Jyb3dzZXJpZnldWzExXSBkaXJlY3RseS5cXG5cXG4gICAgRmVlZGJhY2sgYW5kIHN1Z2dlc3Rpb25zIGFib3V0IHRoaXMgZmxhZywgX2FuZCBwb3NzaWJsZSBhbHRlcm5hdGl2ZXMgdGhhdCB3b3VsZCBtYWtlIFRhdW51cyBlYXNpZXIgdG8gdXNlXywgYXJlIHdlbGNvbWUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgQ2xpZW50LXNpZGUgQVBJXFxuXFxuICAgIEp1c3QgbGlrZSB0aGUgc2VydmVyLXNpZGUsIGV2ZXJ5dGhpbmcgaW4gdGhlIGNsaWVudC1zaWRlIGJlZ2lucyBhdCB0aGUgbW91bnRwb2ludC4gT25jZSB0aGUgYXBwbGljYXRpb24gaXMgbW91bnRlZCwgYW5jaG9yIGxpbmtzIHdpbGwgYmUgaGlqYWNrZWQgYW5kIHRoZSBjbGllbnQtc2lkZSByb3V0ZXIgd2lsbCB0YWtlIG92ZXIgdmlldyByZW5kZXJpbmcuIENsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSBleGVjdXRlZCB3aGVuZXZlciBhIHZpZXcgaXMgcmVuZGVyZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMubW91bnQoY29udGFpbmVyLCB3aXJpbmcsIG9wdGlvbnM/KWBcXG5cXG4gICAgVGhlIG1vdW50cG9pbnQgdGFrZXMgYSByb290IGNvbnRhaW5lciwgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBhbiBvcHRpb25zIHBhcmFtZXRlci4gVGhlIGBjb250YWluZXJgIGlzIHdoZXJlIGNsaWVudC1zaWRlLXJlbmRlcmVkIHZpZXdzIHdpbGwgYmUgcGxhY2VkLCBieSByZXBsYWNpbmcgd2hhdGV2ZXIgSFRNTCBjb250ZW50cyBhbHJlYWR5IGV4aXN0LiBZb3UgY2FuIHBhc3MgaW4gdGhlIGB3aXJpbmdgIG1vZHVsZSBleGFjdGx5IGFzIGJ1aWx0IGJ5IHRoZSBDTEksIGFuZCBubyBmdXJ0aGVyIGNvbmZpZ3VyYXRpb24gaXMgbmVjZXNzYXJ5LlxcblxcbiAgICBXaGVuIHRoZSBtb3VudHBvaW50IGV4ZWN1dGVzLCBUYXVudXMgd2lsbCBjb25maWd1cmUgaXRzIGludGVybmFsIHN0YXRlLCBfc2V0IHVwIHRoZSBjbGllbnQtc2lkZSByb3V0ZXJfLCBydW4gdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgZm9yIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LCBhbmQgc3RhcnQgaGlqYWNraW5nIGxpbmtzLlxcblxcbiAgICBBcyBhbiBleGFtcGxlLCBjb25zaWRlciBhIGJyb3dzZXIgbWFrZXMgYSBgR0VUYCByZXF1ZXN0IGZvciBgL2FydGljbGVzL3RoZS1mb3hgIGZvciB0aGUgZmlyc3QgdGltZS4gT25jZSBgdGF1bnVzLm1vdW50KGNvbnRhaW5lciwgd2lyaW5nKWAgaXMgaW52b2tlZCBvbiB0aGUgY2xpZW50LXNpZGUsIHNldmVyYWwgdGhpbmdzIHdvdWxkIGhhcHBlbiBpbiB0aGUgb3JkZXIgbGlzdGVkIGJlbG93LlxcblxcbiAgICAtIFRhdW51cyBzZXRzIHVwIHRoZSBjbGllbnQtc2lkZSB2aWV3IHJvdXRpbmcgZW5naW5lXFxuICAgIC0gSWYgZW5hYmxlZCBfKHZpYSBgb3B0aW9uc2ApXywgdGhlIGNhY2hpbmcgZW5naW5lIGlzIGNvbmZpZ3VyZWRcXG4gICAgLSBUYXVudXMgb2J0YWlucyB0aGUgdmlldyBtb2RlbCBfKG1vcmUgb24gdGhpcyBsYXRlcilfXFxuICAgIC0gV2hlbiBhIHZpZXcgbW9kZWwgaXMgb2J0YWluZWQsIHRoZSBgJ3N0YXJ0J2AgZXZlbnQgaXMgZW1pdHRlZFxcbiAgICAtIEFuY2hvciBsaW5rcyBzdGFydCBiZWluZyBtb25pdG9yZWQgZm9yIGNsaWNrcyBfKGF0IHRoaXMgcG9pbnQgeW91ciBhcHBsaWNhdGlvbiBiZWNvbWVzIGEgW1NQQV1bMTNdKV9cXG4gICAgLSBUaGUgYGFydGljbGVzL2FydGljbGVgIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgZXhlY3V0ZWRcXG5cXG4gICAgVGhhdCdzIHF1aXRlIGEgYml0IG9mIGZ1bmN0aW9uYWxpdHksIGJ1dCBpZiB5b3UgdGhpbmsgYWJvdXQgaXQsIG1vc3Qgb3RoZXIgZnJhbWV3b3JrcyBhbHNvIHJlbmRlciB0aGUgdmlldyBhdCB0aGlzIHBvaW50LCBfcmF0aGVyIHRoYW4gb24gdGhlIHNlcnZlci1zaWRlIV9cXG5cXG4gICAgSW4gb3JkZXIgdG8gYmV0dGVyIHVuZGVyc3RhbmQgdGhlIHByb2Nlc3MsIEknbGwgd2FsayB5b3UgdGhyb3VnaCB0aGUgYG9wdGlvbnNgIHBhcmFtZXRlci5cXG5cXG4gICAgRmlyc3Qgb2ZmLCB0aGUgYGJvb3RzdHJhcGAgb3B0aW9uIGRldGVybWluZXMgdGhlIHN0cmF0ZWd5IHVzZWQgdG8gcHVsbCB0aGUgdmlldyBtb2RlbCBvZiB0aGUgc2VydmVyLXNpZGUgcmVuZGVyZWQgdmlldyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlcmUgYXJlIHRocmVlIHBvc3NpYmxlIHN0cmF0ZWdpZXMgYXZhaWxhYmxlOiBgYXV0b2AgXyh0aGUgZGVmYXVsdCBzdHJhdGVneSlfLCBgaW5saW5lYCwgb3IgYG1hbnVhbGAuIFRoZSBgYXV0b2Agc3RyYXRlZ3kgaW52b2x2ZXMgdGhlIGxlYXN0IHdvcmssIHdoaWNoIGlzIHdoeSBpdCdzIHRoZSBkZWZhdWx0LlxcblxcbiAgICAtIGBhdXRvYCB3aWxsIG1ha2UgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbFxcbiAgICAtIGBpbmxpbmVgIGV4cGVjdHMgeW91IHRvIHBsYWNlIHRoZSBtb2RlbCBpbnRvIGEgYDxzY3JpcHQgdHlwZT0ndGV4dC90YXVudXMnPmAgdGFnXFxuICAgIC0gYG1hbnVhbGAgZXhwZWN0cyB5b3UgdG8gZ2V0IHRoZSB2aWV3IG1vZGVsIGhvd2V2ZXIgeW91IHdhbnQgdG8sIGFuZCB0aGVuIGxldCBUYXVudXMga25vdyB3aGVuIGl0J3MgcmVhZHlcXG5cXG4gICAgTGV0J3MgZ28gaW50byBkZXRhaWwgYWJvdXQgZWFjaCBvZiB0aGVzZSBzdHJhdGVnaWVzLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBgYXV0b2Agc3RyYXRlZ3lcXG5cXG4gICAgVGhlIGBhdXRvYCBzdHJhdGVneSBtZWFucyB0aGF0IFRhdW51cyB3aWxsIG1ha2UgdXNlIG9mIGFuIEFKQVggcmVxdWVzdCB0byBvYnRhaW4gdGhlIHZpZXcgbW9kZWwuIF9Zb3UgZG9uJ3QgaGF2ZSB0byBkbyBhbnl0aGluZyBlbHNlXyBhbmQgdGhpcyBpcyB0aGUgZGVmYXVsdCBzdHJhdGVneS4gVGhpcyBpcyB0aGUgKiptb3N0IGNvbnZlbmllbnQgc3RyYXRlZ3ksIGJ1dCBhbHNvIHRoZSBzbG93ZXN0Kiogb25lLlxcblxcbiAgICBJdCdzIHNsb3cgYmVjYXVzZSB0aGUgdmlldyBtb2RlbCB3b24ndCBiZSByZXF1ZXN0ZWQgdW50aWwgdGhlIGJ1bGsgb2YgeW91ciBKYXZhU2NyaXB0IGNvZGUgaGFzIGJlZW4gZG93bmxvYWRlZCwgcGFyc2VkLCBleGVjdXRlZCwgYW5kIGB0YXVudXMubW91bnRgIGlzIGludm9rZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIGBpbmxpbmVgIHN0cmF0ZWd5XFxuXFxuICAgIFRoZSBgaW5saW5lYCBzdHJhdGVneSBleHBlY3RzIHlvdSB0byBhZGQgYSBgZGF0YS10YXVudXNgIGF0dHJpYnV0ZSBvbiB0aGUgYGNvbnRhaW5lcmAgZWxlbWVudC4gVGhpcyBhdHRyaWJ1dGUgbXVzdCBiZSBlcXVhbCB0byB0aGUgYGlkYCBhdHRyaWJ1dGUgb2YgYSBgPHNjcmlwdD5gIHRhZyBjb250YWluaW5nIHRoZSBzZXJpYWxpemVkIHZpZXcgbW9kZWwuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgZGl2KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdCh0eXBlPSd0ZXh0L3RhdW51cycsIGRhdGEtdGF1bnVzPSdtb2RlbCcpPUpTT04uc3RyaW5naWZ5KG1vZGVsKVxcbiAgICBgYGBcXG5cXG4gICAgUGF5IHNwZWNpYWwgYXR0ZW50aW9uIHRvIHRoZSBmYWN0IHRoYXQgdGhlIG1vZGVsIGlzIG5vdCBvbmx5IG1hZGUgaW50byBhIEpTT04gc3RyaW5nLCBfYnV0IGFsc28gSFRNTCBlbmNvZGVkIGJ5IEphZGVfLiBXaGVuIFRhdW51cyBleHRyYWN0cyB0aGUgbW9kZWwgZnJvbSB0aGUgYDxzY3JpcHQ+YCB0YWcgaXQnbGwgdW5lc2NhcGUgaXQsIGFuZCB0aGVuIHBhcnNlIGl0IGFzIEpTT04uXFxuXFxuICAgIFRoaXMgc3RyYXRlZ3kgaXMgYWxzbyBmYWlybHkgY29udmVuaWVudCB0byBzZXQgdXAsIGJ1dCBpdCBpbnZvbHZlcyBhIGxpdHRsZSBtb3JlIHdvcmsuIEl0IG1pZ2h0IGJlIHdvcnRod2hpbGUgdG8gdXNlIGluIGNhc2VzIHdoZXJlIG1vZGVscyBhcmUgc21hbGwsIGJ1dCBpdCB3aWxsIHNsb3cgZG93biBzZXJ2ZXItc2lkZSB2aWV3IHJlbmRlcmluZywgYXMgdGhlIG1vZGVsIGlzIGlubGluZWQgYWxvbmdzaWRlIHRoZSBIVE1MLlxcblxcbiAgICBUaGF0IG1lYW5zIHRoYXQgdGhlIGNvbnRlbnQgeW91IGFyZSBzdXBwb3NlZCB0byBiZSBwcmlvcml0aXppbmcgaXMgZ29pbmcgdG8gdGFrZSBsb25nZXIgdG8gZ2V0IHRvIHlvdXIgaHVtYW5zLCBidXQgb25jZSB0aGV5IGdldCB0aGUgSFRNTCwgdGhpcyBzdHJhdGVneSB3aWxsIGV4ZWN1dGUgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgYWxtb3N0IGltbWVkaWF0ZWx5LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBgbWFudWFsYCBzdHJhdGVneVxcblxcbiAgICBUaGUgYG1hbnVhbGAgc3RyYXRlZ3kgaXMgdGhlIG1vc3QgaW52b2x2ZWQgb2YgdGhlIHRocmVlLCBidXQgYWxzbyB0aGUgbW9zdCBwZXJmb3JtYW50LiBJbiB0aGlzIHN0cmF0ZWd5IHlvdSdyZSBzdXBwb3NlZCB0byBhZGQgdGhlIGZvbGxvd2luZyBfKHNlZW1pbmdseSBwb2ludGxlc3MpXyBzbmlwcGV0IG9mIGNvZGUgaW4gYSBgPHNjcmlwdD5gIG90aGVyIHRoYW4gdGhlIG9uZSB0aGF0J3MgcHVsbGluZyBkb3duIFRhdW51cywgc28gdGhhdCB0aGV5IGFyZSBwdWxsZWQgY29uY3VycmVudGx5IHJhdGhlciB0aGFuIHNlcmlhbGx5LlxcblxcbiAgICBgYGBqc1xcbiAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gICAgICB3aW5kb3cudGF1bnVzUmVhZHkgPSBtb2RlbDtcXG4gICAgfTtcXG4gICAgYGBgXFxuXFxuICAgIE9uY2UgeW91IHNvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWwsIHlvdSBzaG91bGQgaW52b2tlIGB0YXVudXNSZWFkeShtb2RlbClgLiBDb25zaWRlcmluZyB5b3UnbGwgYmUgcHVsbGluZyBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgYXQgdGhlIHNhbWUgdGltZSwgYSBudW1iZXIgb2YgZGlmZmVyZW50IHNjZW5hcmlvcyBtYXkgcGxheSBvdXQuXFxuXFxuICAgIC0gVGhlIHZpZXcgbW9kZWwgaXMgbG9hZGVkIGZpcnN0LCB5b3UgY2FsbCBgdGF1bnVzUmVhZHkobW9kZWwpYCBhbmQgd2FpdCBmb3IgVGF1bnVzIHRvIHRha2UgdGhlIG1vZGVsIG9iamVjdCBhbmQgYm9vdCB0aGUgYXBwbGljYXRpb24gYXMgc29vbiBhcyBgdGF1bnVzLm1vdW50YCBpcyBleGVjdXRlZFxcbiAgICAtIFRhdW51cyBsb2FkcyBmaXJzdCBhbmQgYHRhdW51cy5tb3VudGAgaXMgY2FsbGVkIGZpcnN0LiBJbiB0aGlzIGNhc2UsIFRhdW51cyB3aWxsIHJlcGxhY2UgYHdpbmRvdy50YXVudXNSZWFkeWAgd2l0aCBhIHNwZWNpYWwgYGJvb3RgIG1ldGhvZC4gV2hlbiB0aGUgdmlldyBtb2RlbCBmaW5pc2hlcyBsb2FkaW5nLCB5b3UgY2FsbCBgdGF1bnVzUmVhZHkobW9kZWwpYCBhbmQgdGhlIGFwcGxpY2F0aW9uIGZpbmlzaGVzIGJvb3RpbmdcXG5cXG4gICAgPiBJZiB0aGlzIHNvdW5kcyBhIGxpdHRsZSBtaW5kLWJlbmRpbmcgaXQncyBiZWNhdXNlIGl0IGlzLiBJdCdzIG5vdCBkZXNpZ25lZCB0byBiZSBwcmV0dHksIGJ1dCBtZXJlbHkgdG8gYmUgcGVyZm9ybWFudC5cXG5cXG4gICAgTm93IHRoYXQgd2UndmUgYWRkcmVzc2VkIHRoZSBhd2t3YXJkIGJpdHMsIGxldCdzIGNvdmVyIHRoZSBfXFxcInNvbWVob3cgZ2V0IHlvdXIgaGFuZHMgb24gdGhlIHZpZXcgbW9kZWxcXFwiXyBhc3BlY3QuIE15IHByZWZlcnJlZCBtZXRob2QgaXMgdXNpbmcgSlNPTlAsIGFzIGl0J3MgYWJsZSB0byBkZWxpdmVyIHRoZSBzbWFsbGVzdCBzbmlwcGV0IHBvc3NpYmxlLCBhbmQgaXQgY2FuIHRha2UgYWR2YW50YWdlIG9mIHNlcnZlci1zaWRlIGNhY2hpbmcuIENvbnNpZGVyaW5nIHlvdSdsbCBwcm9iYWJseSB3YW50IHRoaXMgdG8gYmUgYW4gaW5saW5lIHNjcmlwdCwga2VlcGluZyBpdCBzbWFsbCBpcyBpbXBvcnRhbnQuXFxuXFxuICAgIFRoZSBnb29kIG5ld3MgaXMgdGhhdCB0aGUgc2VydmVyLXNpZGUgc3VwcG9ydHMgSlNPTlAgb3V0IHRoZSBib3guIEhlcmUncyBhIHNuaXBwZXQgb2YgY29kZSB5b3UgY291bGQgdXNlIHRvIHB1bGwgZG93biB0aGUgdmlldyBtb2RlbCBhbmQgYm9vdCBUYXVudXMgdXAgYXMgc29vbiBhcyBib3RoIG9wZXJhdGlvbnMgYXJlIHJlYWR5LlxcblxcbiAgICBgYGBqc1xcbiAgICBmdW5jdGlvbiBpbmplY3QgKHVybCkge1xcbiAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKTtcXG4gICAgICBzY3JpcHQuc3JjID0gdXJsO1xcbiAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoc2NyaXB0KTtcXG4gICAgfVxcblxcbiAgICBmdW5jdGlvbiBpbmplY3RvciAoKSB7XFxuICAgICAgdmFyIHNlYXJjaCA9IGxvY2F0aW9uLnNlYXJjaDtcXG4gICAgICB2YXIgc2VhcmNoUXVlcnkgPSBzZWFyY2ggPyAnJicgKyBzZWFyY2guc3Vic3RyKDEpIDogJyc7XFxuICAgICAgdmFyIHNlYXJjaEpzb24gPSAnP2pzb24mY2FsbGJhY2s9dGF1bnVzUmVhZHknICsgc2VhcmNoUXVlcnk7XFxuICAgICAgaW5qZWN0KGxvY2F0aW9uLnBhdGhuYW1lICsgc2VhcmNoSnNvbik7XFxuICAgIH1cXG5cXG4gICAgd2luZG93LnRhdW51c1JlYWR5ID0gZnVuY3Rpb24gKG1vZGVsKSB7XFxuICAgICAgd2luZG93LnRhdW51c1JlYWR5ID0gbW9kZWw7XFxuICAgIH07XFxuXFxuICAgIGluamVjdG9yKCk7XFxuICAgIGBgYFxcblxcbiAgICBBcyBtZW50aW9uZWQgZWFybGllciwgdGhpcyBhcHByb2FjaCBpbnZvbHZlcyBnZXR0aW5nIHlvdXIgaGFuZHMgZGlydGllciBidXQgaXQgcGF5cyBvZmYgYnkgYmVpbmcgdGhlIGZhc3Rlc3Qgb2YgdGhlIHRocmVlLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmdcXG5cXG4gICAgVGhlIGNsaWVudC1zaWRlIGluIFRhdW51cyBzdXBwb3J0cyBjYWNoaW5nIGluLW1lbW9yeSBhbmQgdXNpbmcgdGhlIGVtYmVkZGVkIEluZGV4ZWREQiBzeXN0ZW0gYnkgbWVyZWx5IHR1cm5pbmcgb24gdGhlIGBjYWNoZWAgZmxhZyBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAgb24gdGhlIGNsaWVudC1zaWRlLlxcblxcbiAgICBJZiB5b3Ugc2V0IGBjYWNoZWAgdG8gYHRydWVgIHRoZW4gY2FjaGVkIGl0ZW1zIHdpbGwgYmUgY29uc2lkZXJlZCBfXFxcImZyZXNoXFxcIiAodmFsaWQgY29waWVzIG9mIHRoZSBvcmlnaW5hbClfIGZvciAqKjE1IHNlY29uZHMqKi4gWW91IGNhbiBhbHNvIHNldCBgY2FjaGVgIHRvIGEgbnVtYmVyLCBhbmQgdGhhdCBudW1iZXIgb2Ygc2Vjb25kcyB3aWxsIGJlIHVzZWQgYXMgdGhlIGRlZmF1bHQgaW5zdGVhZC5cXG5cXG4gICAgQ2FjaGluZyBjYW4gYWxzbyBiZSB0d2Vha2VkIG9uIGluZGl2aWR1YWwgcm91dGVzLiBGb3IgaW5zdGFuY2UsIHlvdSBjb3VsZCBzZXQgYHsgY2FjaGU6IHRydWUgfWAgd2hlbiBtb3VudGluZyBUYXVudXMgYW5kIHRoZW4gaGF2ZSBgeyBjYWNoZTogMzYwMCB9YCBvbiBhIHJvdXRlIHRoYXQgeW91IHdhbnQgdG8gY2FjaGUgZm9yIGEgbG9uZ2VyIHBlcmlvZCBvZiB0aW1lLlxcblxcbiAgICBUaGUgY2FjaGluZyBsYXllciBpcyBfc2VhbWxlc3NseSBpbnRlZ3JhdGVkXyBpbnRvIFRhdW51cywgbWVhbmluZyB0aGF0IGFueSB2aWV3cyByZW5kZXJlZCBieSBUYXVudXMgd2lsbCBiZSBjYWNoZWQgYWNjb3JkaW5nIHRvIHRoZXNlIGNhY2hpbmcgcnVsZXMuIEtlZXAgaW4gbWluZCwgaG93ZXZlciwgdGhhdCBwZXJzaXN0ZW5jZSBhdCB0aGUgY2xpZW50LXNpZGUgY2FjaGluZyBsYXllciB3aWxsIG9ubHkgYmUgcG9zc2libGUgaW4gW2Jyb3dzZXJzIHRoYXQgc3VwcG9ydCBJbmRleGVkREJdWzE0XS4gSW4gdGhlIGNhc2Ugb2YgYnJvd3NlcnMgdGhhdCBkb24ndCBzdXBwb3J0IEluZGV4ZWREQiwgVGF1bnVzIHdpbGwgdXNlIGFuIGluLW1lbW9yeSBjYWNoZSwgd2hpY2ggd2lsbCBiZSB3aXBlZCBvdXQgd2hlbmV2ZXIgdGhlIGh1bWFuIGRlY2lkZXMgdG8gY2xvc2UgdGhlIHRhYiBpbiB0aGVpciBicm93c2VyLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFByZWZldGNoaW5nXFxuXFxuICAgIElmIGNhY2hpbmcgaXMgZW5hYmxlZCwgdGhlIG5leHQgbG9naWNhbCBzdGVwIGlzIHByZWZldGNoaW5nLiBUaGlzIGlzIGVuYWJsZWQganVzdCBieSBhZGRpbmcgYHByZWZldGNoOiB0cnVlYCB0byB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIFRoZSBwcmVmZXRjaGluZyBmZWF0dXJlIHdpbGwgZmlyZSBmb3IgYW55IGFuY2hvciBsaW5rIHRoYXQncyB0cmlwcyBvdmVyIGEgYG1vdXNlb3ZlcmAgb3IgYSBgdG91Y2hzdGFydGAgZXZlbnQuIElmIGEgcm91dGUgbWF0Y2hlcyB0aGUgVVJMIGluIHRoZSBgaHJlZmAsIGFuIEFKQVggcmVxdWVzdCB3aWxsIHByZWZldGNoIHRoZSB2aWV3IGFuZCBjYWNoZSBpdHMgY29udGVudHMsIGltcHJvdmluZyBwZXJjZWl2ZWQgcGVyZm9ybWFuY2UuXFxuXFxuICAgIFdoZW4gbGlua3MgYXJlIGNsaWNrZWQgYmVmb3JlIHByZWZldGNoaW5nIGZpbmlzaGVzLCB0aGV5J2xsIHdhaXQgb24gdGhlIHByZWZldGNoZXIgdG8gZmluaXNoIGJlZm9yZSBpbW1lZGlhdGVseSBzd2l0Y2hpbmcgdG8gdGhlIHZpZXcsIGVmZmVjdGl2ZWx5IGN1dHRpbmcgZG93biB0aGUgcmVzcG9uc2UgdGltZS4gSWYgdGhlIGxpbmsgd2FzIGFscmVhZHkgcHJlZmV0Y2hlZCBvciBvdGhlcndpc2UgY2FjaGVkLCB0aGUgdmlldyB3aWxsIGJlIGxvYWRlZCBpbW1lZGlhdGVseS4gSWYgdGhlIGh1bWFuIGhvdmVycyBvdmVyIGEgbGluayBhbmQgYW5vdGhlciBvbmUgd2FzIGFscmVhZHkgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGF0IG9uZSBpcyBhYm9ydGVkLiBUaGlzIHByZXZlbnRzIHByZWZldGNoaW5nIGZyb20gZHJhaW5pbmcgdGhlIGJhbmR3aWR0aCBvbiBjbGllbnRzIHdpdGggbGltaXRlZCBvciBpbnRlcm1pdHRlbnQgY29ubmVjdGl2aXR5LlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLm9uKHR5cGUsIGZuKWBcXG5cXG4gICAgVGF1bnVzIGVtaXRzIGEgc2VyaWVzIG9mIGV2ZW50cyBkdXJpbmcgaXRzIGxpZmVjeWNsZSwgYW5kIGB0YXVudXMub25gIGlzIHRoZSB3YXkgeW91IGNhbiB0dW5lIGluIGFuZCBsaXN0ZW4gZm9yIHRoZXNlIGV2ZW50cyB1c2luZyBhIHN1YnNjcmlwdGlvbiBmdW5jdGlvbiBgZm5gLlxcblxcbiAgICBFdmVudCAgICAgICAgICAgIHwgQXJndW1lbnRzICAgICAgICAgICAgICAgfCBEZXNjcmlwdGlvblxcbiAgICAtLS0tLS0tLS0tLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxcbiAgICBgJ3N0YXJ0J2AgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBFbWl0dGVkIHdoZW4gYHRhdW51cy5tb3VudGAgZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIGB0YXVudXMubW91bnRgLlxcbiAgICBgJ3JlbmRlcidgICAgICAgIHwgYGNvbnRhaW5lciwgbW9kZWxgICAgICAgfCBBIHZpZXcgaGFzIGp1c3QgYmVlbiByZW5kZXJlZCBhbmQgaXRzIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgaXMgYWJvdXQgdG8gYmUgaW52b2tlZFxcbiAgICBgJ2ZldGNoLnN0YXJ0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHN0YXJ0cy5cXG4gICAgYCdmZXRjaC5kb25lJ2AgICB8ICBgcm91dGUsIGNvbnRleHQsIGRhdGFgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseS5cXG4gICAgYCdmZXRjaC5hYm9ydCdgICB8ICBgcm91dGUsIGNvbnRleHRgICAgICAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCBpcyBwdXJwb3NlbHkgYWJvcnRlZC5cXG4gICAgYCdmZXRjaC5lcnJvcidgICB8ICBgcm91dGUsIGNvbnRleHQsIGVycmAgIHwgRW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMub25jZSh0eXBlLCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGlzIGVxdWl2YWxlbnQgdG8gW2B0YXVudXMub25gXSgjLXRhdW51cy1vbi10eXBlLWZuLSksIGV4Y2VwdCB0aGUgZXZlbnQgbGlzdGVuZXJzIHdpbGwgYmUgdXNlZCBvbmNlIGFuZCB0aGVuIGl0J2xsIGJlIGRpc2NhcmRlZC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5vZmYodHlwZSwgZm4pYFxcblxcbiAgICBVc2luZyB0aGlzIG1ldGhvZCB5b3UgY2FuIHJlbW92ZSBhbnkgZXZlbnQgbGlzdGVuZXJzIHRoYXQgd2VyZSBwcmV2aW91c2x5IGFkZGVkIHVzaW5nIGAub25gIG9yIGAub25jZWAuIFlvdSBtdXN0IHByb3ZpZGUgdGhlIHR5cGUgb2YgZXZlbnQgeW91IHdhbnQgdG8gcmVtb3ZlIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgZXZlbnQgbGlzdGVuZXIgZnVuY3Rpb24gdGhhdCB3YXMgb3JpZ2luYWxseSB1c2VkIHdoZW4gY2FsbGluZyBgLm9uYCBvciBgLm9uY2VgLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyBgdGF1bnVzLmludGVyY2VwdChhY3Rpb24/LCBmbilgXFxuXFxuICAgIFRoaXMgbWV0aG9kIGNhbiBiZSB1c2VkIHRvIGFudGljaXBhdGUgbW9kZWwgcmVxdWVzdHMsIGJlZm9yZSB0aGV5IGV2ZXIgbWFrZSBpdCBpbnRvIFhIUiByZXF1ZXN0cy4gWW91IGNhbiBhZGQgaW50ZXJjZXB0b3JzIGZvciBzcGVjaWZpYyBhY3Rpb25zLCB3aGljaCB3b3VsZCBiZSB0cmlnZ2VyZWQgb25seSBpZiB0aGUgcmVxdWVzdCBtYXRjaGVzIHRoZSBzcGVjaWZpZWQgYGFjdGlvbmAuIFlvdSBjYW4gYWxzbyBhZGQgZ2xvYmFsIGludGVyY2VwdG9ycyBieSBvbWl0dGluZyB0aGUgYGFjdGlvbmAgcGFyYW1ldGVyLCBvciBzZXR0aW5nIGl0IHRvIGAqYC5cXG5cXG4gICAgQW4gaW50ZXJjZXB0b3IgZnVuY3Rpb24gd2lsbCByZWNlaXZlIGFuIGBldmVudGAgcGFyYW1ldGVyLCBjb250YWluaW5nIGEgZmV3IGRpZmZlcmVudCBwcm9wZXJ0aWVzLlxcblxcbiAgICAtIGB1cmxgIGNvbnRhaW5zIHRoZSBVUkwgdGhhdCBuZWVkcyBhIHZpZXcgbW9kZWxcXG4gICAgLSBgcm91dGVgIGNvbnRhaW5zIHRoZSBmdWxsIHJvdXRlIG9iamVjdCBhcyB5b3UnZCBnZXQgZnJvbSBbYHRhdW51cy5yb3V0ZSh1cmwpYF0oIy10YXVudXMtcm91dGUtdXJsLSlcXG4gICAgLSBgcGFydHNgIGlzIGp1c3QgYSBzaG9ydGN1dCBmb3IgYHJvdXRlLnBhcnRzYFxcbiAgICAtIGBwcmV2ZW50RGVmYXVsdChtb2RlbClgIGFsbG93cyB5b3UgdG8gc3VwcHJlc3MgdGhlIG5lZWQgZm9yIGFuIEFKQVggcmVxdWVzdCwgY29tbWFuZGluZyBUYXVudXMgdG8gdXNlIHRoZSBtb2RlbCB5b3UndmUgcHJvdmlkZWQgaW5zdGVhZFxcbiAgICAtIGBkZWZhdWx0UHJldmVudGVkYCB0ZWxscyB5b3UgaWYgc29tZSBvdGhlciBoYW5kbGVyIGhhcyBwcmV2ZW50ZWQgdGhlIGRlZmF1bHQgYmVoYXZpb3JcXG4gICAgLSBgY2FuUHJldmVudERlZmF1bHRgIHRlbGxzIHlvdSBpZiBpbnZva2luZyBgZXZlbnQucHJldmVudERlZmF1bHRgIHdpbGwgaGF2ZSBhbnkgZWZmZWN0XFxuICAgIC0gYG1vZGVsYCBzdGFydHMgYXMgYG51bGxgLCBhbmQgaXQgY2FuIGxhdGVyIGJlY29tZSB0aGUgbW9kZWwgcGFzc2VkIHRvIGBwcmV2ZW50RGVmYXVsdGBcXG5cXG4gICAgSW50ZXJjZXB0b3JzIGFyZSBhc3luY2hyb25vdXMsIGJ1dCBpZiBhbiBpbnRlcmNlcHRvciBzcGVuZHMgbG9uZ2VyIHRoYW4gMjAwbXMgaXQnbGwgYmUgc2hvcnQtY2lyY3VpdGVkIGFuZCBjYWxsaW5nIGBldmVudC5wcmV2ZW50RGVmYXVsdGAgcGFzdCB0aGF0IHBvaW50IHdvbid0IGhhdmUgYW55IGVmZmVjdC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5wYXJ0aWFsKGNvbnRhaW5lciwgYWN0aW9uLCBtb2RlbClgXFxuXFxuICAgIFRoaXMgbWV0aG9kIHByb3ZpZGVzIHlvdSB3aXRoIGFjY2VzcyB0byB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIFRhdW51cy4gWW91IGNhbiB1c2UgaXQgdG8gcmVuZGVyIHRoZSBgYWN0aW9uYCB2aWV3IGludG8gdGhlIGBjb250YWluZXJgIERPTSBlbGVtZW50LCB1c2luZyB0aGUgc3BlY2lmaWVkIGBtb2RlbGAuIE9uY2UgdGhlIHZpZXcgaXMgcmVuZGVyZWQsIHRoZSBgcmVuZGVyYCBldmVudCB3aWxsIGJlIGZpcmVkIF8od2l0aCBgY29udGFpbmVyLCBtb2RlbGAgYXMgYXJndW1lbnRzKV8gYW5kIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIGZvciB0aGF0IHZpZXcgd2lsbCBiZSBleGVjdXRlZC5cXG5cXG4gICAgV2hpbGUgYHRhdW51cy5wYXJ0aWFsYCB0YWtlcyBhIGByb3V0ZWAgYXMgdGhlIGZvdXJ0aCBwYXJhbWV0ZXIsIHlvdSBzaG91bGQgb21pdCB0aGF0IHNpbmNlIGl0J3MgdXNlZCBmb3IgaW50ZXJuYWwgcHVycG9zZXMgb25seS5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMgYHRhdW51cy5uYXZpZ2F0ZSh1cmwpYFxcblxcbiAgICBXaGVuZXZlciB5b3Ugd2FudCB0byBuYXZpZ2F0ZSB0byBhIFVSTCwgc2F5IHdoZW4gYW4gQUpBWCBjYWxsIGZpbmlzaGVzIGFmdGVyIGEgYnV0dG9uIGNsaWNrLCB5b3UgY2FuIHVzZSBgdGF1bnVzLm5hdmlnYXRlYCBwYXNzaW5nIGl0IGEgcGxhaW4gVVJMLlxcblxcbiAgICBJZiBgdGF1bnVzLm5hdmlnYXRlKHVybClgIGlzIGNhbGxlZCB3aXRoIGFuIGB1cmxgIHRoYXQgZG9lc24ndCBtYXRjaCBhbnkgY2xpZW50LXNpZGUgcm91dGUsIHRoZW4gdGhlIHVzZXIgd2lsbCBiZSByZWRpcmVjdGVkIHZpYSBgbG9jYXRpb24uaHJlZmAuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMucm91dGUodXJsKWBcXG5cXG4gICAgVGhpcyBjb252ZW5pZW5jZSBtZXRob2QgYWxsb3dzIHlvdSB0byBicmVhayBkb3duIGEgVVJMIGludG8gaXRzIGluZGl2aWR1YWwgY29tcG9uZW50cy4gVGhpcyBtZXRob2Qgc2hvdWxkbid0IGJlIG5lZWRlZCBkdXJpbmcgbm9ybWFsIHVzYWdlIG9mIFRhdW51cywgYnV0IGl0J3MgdXNlZnVsIHdoZW4gZGVidWdnaW5nIHlvdXIgcm91dGluZyB0YWJsZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIGB0YXVudXMuc3RhdGVgXFxuXFxuICAgIFRoaXMgaXMgYW4gaW50ZXJuYWwgc3RhdGUgdmFyaWFibGUsIGFuZCBpdCBjb250YWlucyBhIGxvdCBvZiB1c2VmdWwgZGVidWdnaW5nIGluZm9ybWF0aW9uLlxcblxcbiAgICAtIGBjb250YWluZXJgIGlzIHRoZSBET00gZWxlbWVudCBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGBcXG4gICAgLSBgY29udHJvbGxlcnNgIGFyZSBhbGwgdGhlIGNvbnRyb2xsZXJzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlXFxuICAgIC0gYHRlbXBsYXRlc2AgYXJlIGFsbCB0aGUgdGVtcGxhdGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlXFxuICAgIC0gYHJvdXRlc2AgYXJlIGFsbCB0aGUgcm91dGVzLCBhcyBkZWZpbmVkIGluIHRoZSB3aXJpbmcgbW9kdWxlXFxuICAgIC0gYHByZWZldGNoYCBleHBvc2VzIHdoZXRoZXIgcHJlZmV0Y2hpbmcgaXMgdHVybmVkIG9uXFxuICAgIC0gYGNhY2hlYCBleHBvc2VzIHdoZXRoZXIgY2FjaGluZyBpcyBlbmFibGVkXFxuICAgIC0gYG1vZGVsYCBpcyBhIHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgdXNlZCB0byByZW5kZXIgdGhlIGN1cnJlbnQgdmlld1xcblxcbiAgICBPZiBjb3Vyc2UsIHlvdXIgbm90IHN1cHBvc2VkIHRvIG1lZGRsZSB3aXRoIGl0LCBzbyBiZSBhIGdvb2QgY2l0aXplbiBhbmQganVzdCBpbnNwZWN0IGl0cyB2YWx1ZXMhXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGhlIGAudGF1bnVzcmNgIG1hbmlmZXN0XFxuXFxuICAgIElmIHlvdSB3YW50IHRvIHVzZSB2YWx1ZXMgb3RoZXIgdGhhbiB0aGUgY29udmVudGlvbmFsIGRlZmF1bHRzIHNob3duIGluIHRoZSB0YWJsZSBiZWxvdywgdGhlbiB5b3Ugc2hvdWxkIGNyZWF0ZSBhIGAudGF1bnVzcmNgIGZpbGUuIE5vdGUgdGhhdCB0aGUgZGVmYXVsdHMgbmVlZCB0byBiZSBvdmVyd3JpdHRlbiBpbiBhIGNhc2UtYnktY2FzZSBiYXNpcy4gVGhlc2Ugb3B0aW9ucyBjYW4gYWxzbyBiZSBjb25maWd1cmVkIGluIHlvdXIgYHBhY2thZ2UuanNvbmAsIHVuZGVyIHRoZSBgdGF1bnVzYCBwcm9wZXJ0eS5cXG5cXG4gICAgYGBganNvblxcbiAgICB7XFxuICAgICAgXFxcInZpZXdzXFxcIjogXFxcIi5iaW4vdmlld3NcXFwiLFxcbiAgICAgIFxcXCJzZXJ2ZXJfcm91dGVzXFxcIjogXFxcImNvbnRyb2xsZXJzL3JvdXRlcy5qc1xcXCIsXFxuICAgICAgXFxcInNlcnZlcl9jb250cm9sbGVyc1xcXCI6IFxcXCJjb250cm9sbGVyc1xcXCIsXFxuICAgICAgXFxcImNsaWVudF9jb250cm9sbGVyc1xcXCI6IFxcXCJjbGllbnQvanMvY29udHJvbGxlcnNcXFwiLFxcbiAgICAgIFxcXCJjbGllbnRfd2lyaW5nXFxcIjogXFxcIi5iaW4vd2lyaW5nLmpzXFxcIlxcbiAgICB9XFxuICAgIGBgYFxcblxcbiAgICAtIFRoZSBgdmlld3NgIGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIHZpZXdzIF8oYWxyZWFkeSBjb21waWxlZCBpbnRvIEphdmFTY3JpcHQpXyBhcmUgcGxhY2VkLiBUaGVzZSB2aWV3cyBhcmUgdXNlZCBkaXJlY3RseSBvbiBib3RoIHRoZSBzZXJ2ZXItc2lkZSBhbmQgdGhlIGNsaWVudC1zaWRlXFxuICAgIC0gVGhlIGBzZXJ2ZXJfcm91dGVzYCBmaWxlIGlzIHRoZSBtb2R1bGUgd2hlcmUgeW91IGV4cG9ydCBhIGNvbGxlY3Rpb24gb2Ygcm91dGVzLiBUaGUgQ0xJIHdpbGwgcHVsbCB0aGVzZSByb3V0ZXMgd2hlbiBjcmVhdGluZyB0aGUgY2xpZW50LXNpZGUgcm91dGVzIGZvciB0aGUgd2lyaW5nIG1vZHVsZVxcbiAgICAtIFRoZSBgc2VydmVyX2NvbnRyb2xsZXJzYCBkaXJlY3RvcnkgaXMgdGhlIHJvb3QgZGlyZWN0b3J5IHdoZXJlIHlvdXIgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgbGl2ZS4gSXQncyB1c2VkIHdoZW4gc2V0dGluZyB1cCB0aGUgc2VydmVyLXNpZGUgcm91dGVyXFxuICAgIC0gVGhlIGBjbGllbnRfY29udHJvbGxlcnNgIGRpcmVjdG9yeSBpcyB3aGVyZSB5b3VyIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIgbW9kdWxlcyBsaXZlLiBUaGUgQ0xJIHdpbGwgYHJlcXVpcmVgIHRoZXNlIGNvbnRyb2xsZXJzIGluIGl0cyByZXN1bHRpbmcgd2lyaW5nIG1vZHVsZVxcbiAgICAtIFRoZSBgY2xpZW50X3dpcmluZ2AgZmlsZSBpcyB3aGVyZSB5b3VyIHdpcmluZyBtb2R1bGUgd2lsbCBiZSBwbGFjZWQgYnkgdGhlIENMSS4gWW91J2xsIHRoZW4gaGF2ZSB0byBgcmVxdWlyZWAgaXQgaW4geW91ciBhcHBsaWNhdGlvbiB3aGVuIGJvb3RpbmcgdXAgVGF1bnVzXFxuXFxuICAgIEhlcmUgaXMgd2hlcmUgdGhpbmdzIGdldCBbYSBsaXR0bGUgY29udmVudGlvbmFsXVsxMl0uIFZpZXdzLCBhbmQgYm90aCBzZXJ2ZXItc2lkZSBhbmQgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXJlIGV4cGVjdGVkIHRvIGJlIG9yZ2FuaXplZCBieSBmb2xsb3dpbmcgdGhlIGB7cm9vdH0ve2NvbnRyb2xsZXJ9L3thY3Rpb259YCBwYXR0ZXJuLCBidXQgeW91IGNvdWxkIGNoYW5nZSB0aGF0IHVzaW5nIGByZXNvbHZlcnNgIHdoZW4gaW52b2tpbmcgdGhlIENMSSBhbmQgdXNpbmcgdGhlIHNlcnZlci1zaWRlIEFQSS5cXG5cXG4gICAgVmlld3MgYW5kIGNvbnRyb2xsZXJzIGFyZSBhbHNvIGV4cGVjdGVkIHRvIGJlIENvbW1vbkpTIG1vZHVsZXMgdGhhdCBleHBvcnQgYSBzaW5nbGUgbWV0aG9kLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICBbMV06IC9nZXR0aW5nLXN0YXJ0ZWRcXG4gICAgWzJdOiBodHRwOi8vZXhwcmVzc2pzLmNvbVxcbiAgICBbM106IGh0dHA6Ly9oYXBpanMuY29tXFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iLzMzMjcxNzUxMzEyZGI2ZTkyMDU5ZDk4MjkzZDBhN2FjNmU5ZThlNWIvdmlld3Mvc2VydmVyL2xheW91dC9sYXlvdXQuamFkZVxcbiAgICBbNV06IGh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9oZ2V0XFxuICAgIFs2XTogaHR0cHM6Ly9naXRodWIuY29tL3Bvbnlmb28vcG9ueWZvby9ibG9iL2Y2ZDZiNTA2OGZmMDNhMzg3ZjUwMzkwMDE2MGQ5ZmRjMWU3NDk3NTAvY29udHJvbGxlcnMvcm91dGluZy5qcyNMNzAtTDcyXFxuICAgIFs3XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcbiAgICBbOF06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXG4gICAgWzldOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL2hhcGlpZnlcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL3VtZGpzL3VtZFxcbiAgICBbMTFdOiBodHRwOi8vYnJvd3NlcmlmeS5vcmdcXG4gICAgWzEyXTogaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcbiAgICBbMTNdOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1NpbmdsZS1wYWdlX2FwcGxpY2F0aW9uXFxuICAgIFsxNF06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gY29tcGxlbWVudHMobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2NvbXBsZW1lbnRzLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cy5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwiY29tcGxlbWVudGFyeS1tb2R1bGVzXFxcIj5Db21wbGVtZW50YXJ5IE1vZHVsZXM8L2gxPlxcbjxwPjxjb2RlPmRvbWludXM8L2NvZGU+XFxuPGNvZGU+eGhyPC9jb2RlPlxcbjxjb2RlPm1lYXNseTwvY29kZT48L3A+XFxuXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3NlY3Rpb24+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCkpOztyZXR1cm4gYnVmLmpvaW4oXCJcIik7XG59IGNhdGNoIChlcnIpIHtcbiAgamFkZS5yZXRocm93KGVyciwgamFkZV9kZWJ1Z1swXS5maWxlbmFtZSwgamFkZV9kZWJ1Z1swXS5saW5lbm8sIFwic2VjdGlvbi5seS1zZWN0aW9uLm1kLW1hcmtkb3duXFxuICA6bWFya2Rvd25cXG4gICAgIyBDb21wbGVtZW50YXJ5IE1vZHVsZXNcXG5cXG4gICAgYGRvbWludXNgXFxuICAgIGB4aHJgXFxuICAgIGBtZWFzbHlgXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGdldHRpbmdTdGFydGVkKGxvY2Fscykge1xudmFyIGphZGVfZGVidWcgPSBbeyBsaW5lbm86IDEsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9nZXR0aW5nLXN0YXJ0ZWQuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxzZWN0aW9uIGNsYXNzPVxcXCJseS1zZWN0aW9uIG1kLW1hcmtkb3duXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxIGlkPVxcXCJnZXR0aW5nLXN0YXJ0ZWRcXFwiPkdldHRpbmcgU3RhcnRlZDwvaDE+XFxuPHA+VGF1bnVzIGlzIGEgc2hhcmVkLXJlbmRlcmluZyBNVkMgZW5naW5lIGZvciBOb2RlLmpzLCBhbmQgaXQmIzM5O3MgPGVtPnVwIHRvIHlvdSBob3cgdG8gdXNlIGl0PC9lbT4uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gPHN0cm9uZz5zZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0PC9zdHJvbmc+LCBhcyB0aGF0JiMzOTtsbCB0ZWFjaCB5b3UgaG93IGl0IHdvcmtzIGV2ZW4gd2hlbiBKYXZhU2NyaXB0IG5ldmVyIGdldHMgdG8gdGhlIGNsaWVudC48L3A+XFxuPGgxIGlkPVxcXCJ0YWJsZS1vZi1jb250ZW50c1xcXCI+VGFibGUgb2YgQ29udGVudHM8L2gxPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiI2hvdy1pdC13b3Jrc1xcXCI+SG93IGl0IHdvcmtzPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlXFxcIj5TZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZTwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjcmVhdGluZy1hLWxheW91dFxcXCI+Q3JlYXRpbmcgYSBsYXlvdXQ8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3VzaW5nLWphZGUtYXMteW91ci12aWV3LWVuZ2luZVxcXCI+VXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aHJvd2luZy1pbi1hLWNvbnRyb2xsZXJcXFwiPlRocm93aW5nIGluIGEgY29udHJvbGxlcjwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI3RhdW51cy1pbi10aGUtY2xpZW50XFxcIj5UYXVudXMgaW4gdGhlIGNsaWVudDwvYT48dWw+XFxuPGxpPjxhIGhyZWY9XFxcIiN1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlclxcXCI+Qm9vdGluZyB1cCB0aGUgY2xpZW50LXNpZGUgcm91dGVyPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjY29tcGlsaW5nLXlvdXItY2xpZW50LXNpZGUtamF2YXNjcmlwdFxcXCI+Q29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdDwvYT48L2xpPlxcbjxsaT48YSBocmVmPVxcXCIjdXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9hPjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiNjYWNoaW5nLWFuZC1wcmVmZXRjaGluZ1xcXCI+Q2FjaGluZyBhbmQgUHJlZmV0Y2hpbmc8L2E+PC9saT5cXG48L3VsPlxcbjwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcIiN0aGUtc2t5LWlzLXRoZS1saW1pdC1cXFwiPlRoZSBza3kgaXMgdGhlIGxpbWl0ITwvYT48L2xpPlxcbjwvdWw+XFxuPGgxIGlkPVxcXCJob3ctaXQtd29ya3NcXFwiPkhvdyBpdCB3b3JrczwvaDE+XFxuPHA+VGF1bnVzIGZvbGxvd3MgYSBzaW1wbGUgYnV0IDxzdHJvbmc+cHJvdmVuPC9zdHJvbmc+IHNldCBvZiBydWxlcy48L3A+XFxuPHVsPlxcbjxsaT5EZWZpbmUgYSA8Y29kZT5mdW5jdGlvbihtb2RlbCk8L2NvZGU+IGZvciBlYWNoIHlvdXIgdmlld3M8L2xpPlxcbjxsaT5QdXQgdGhlc2Ugdmlld3MgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RGVmaW5lIHJvdXRlcyBmb3IgeW91ciBhcHBsaWNhdGlvbjwvbGk+XFxuPGxpPlB1dCB0aG9zZSByb3V0ZXMgaW4gYm90aCB0aGUgc2VydmVyIGFuZCB0aGUgY2xpZW50PC9saT5cXG48bGk+RW5zdXJlIHJvdXRlIG1hdGNoZXMgd29yayB0aGUgc2FtZSB3YXkgb24gYm90aCBlbmRzPC9saT5cXG48bGk+Q3JlYXRlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXJzIHRoYXQgeWllbGQgdGhlIG1vZGVsIGZvciB5b3VyIHZpZXdzPC9saT5cXG48bGk+Q3JlYXRlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGlmIHlvdSBuZWVkIHRvIGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIGEgcGFydGljdWxhciB2aWV3PC9saT5cXG48bGk+Rm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbHdheXMgcmVuZGVyIHZpZXdzIG9uIHRoZSBzZXJ2ZXItc2lkZTwvbGk+XFxuPGxpPldoZW4gcmVuZGVyaW5nIGEgdmlldyBvbiB0aGUgc2VydmVyLXNpZGUsIGluY2x1ZGUgdGhlIGZ1bGwgbGF5b3V0IGFzIHdlbGwhPC9saT5cXG48bGk+T25jZSB0aGUgY2xpZW50LXNpZGUgY29kZSBraWNrcyBpbiwgPHN0cm9uZz5oaWphY2sgbGluayBjbGlja3M8L3N0cm9uZz4gYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkPC9saT5cXG48bGk+V2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGU8L2xpPlxcbjxsaT5JZiB0aGUgPGNvZGU+aGlzdG9yeTwvY29kZT4gQVBJIGlzIHVuYXZhaWxhYmxlLCBmYWxsIGJhY2sgdG8gZ29vZCBvbGQgcmVxdWVzdC1yZXNwb25zZS4gPHN0cm9uZz5Eb24mIzM5O3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzITwvc3Ryb25nPjwvbGk+XFxuPC91bD5cXG48cD5JJiMzOTtsbCBzdGVwIHlvdSB0aHJvdWdoIHRoZXNlLCBidXQgcmF0aGVyIHRoYW4gbG9va2luZyBhdCBpbXBsZW1lbnRhdGlvbiBkZXRhaWxzLCBJJiMzOTtsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGgxIGlkPVxcXCJpbnN0YWxsaW5nLXRhdW51c1xcXCI+SW5zdGFsbGluZyBUYXVudXM8L2gxPlxcbjxwPkZpcnN0IG9mZiwgeW91JiMzOTtsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC48L3A+XFxuPHVsPlxcbjxsaT48YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4sIHRocm91Z2ggPGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMtZXhwcmVzc1xcXCI+dGF1bnVzLWV4cHJlc3M8L2E+PC9saT5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+LCB0aHJvdWdoIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWhhcGlcXFwiPnRhdW51cy1oYXBpPC9hPiBhbmQgdGhlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvaGFwaWlmeVxcXCI+aGFwaWlmeTwvYT4gdHJhbnNmb3JtPC9saT5cXG48L3VsPlxcbjxibG9ja3F1b3RlPlxcbjxwPklmIHlvdSYjMzk7cmUgbW9yZSBvZiBhIDxlbT4mcXVvdDtydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJiMzOTtzIGNvZGUmcXVvdDs8L2VtPiB0eXBlIG9mIGRldmVsb3BlciwgeW91IG1heSBmZWVsIGNvbWZvcnRhYmxlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvXFxcIj5nb2luZyB0aHJvdWdoIHRoaXMgd2Vic2l0ZSYjMzk7cyBzb3VyY2UgY29kZTwvYT4sIHdoaWNoIHVzZXMgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBmbGF2b3Igb2YgVGF1bnVzLiBBbHRlcm5hdGl2ZWx5IHlvdSBjYW4gbG9vayBhdCB0aGUgc291cmNlIGNvZGUgZm9yIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9wb255Zm9vL3Bvbnlmb29cXFwiPnBvbnlmb28uY29tPC9hPiwgd2hpY2ggaXMgPHN0cm9uZz5hIG1vcmUgYWR2YW5jZWQgdXNlLWNhc2U8L3N0cm9uZz4gdW5kZXIgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9leHByZXNzanMuY29tXFxcIj5FeHByZXNzPC9hPiBmbGF2b3IuIE9yLCB5b3UgY291bGQganVzdCBrZWVwIG9uIHJlYWRpbmcgdGhpcyBwYWdlLCB0aGF0JiMzOTtzIG9rYXkgdG9vLjwvcD5cXG48L2Jsb2NrcXVvdGU+XFxuPHA+T25jZSB5b3UmIzM5O3ZlIHNldHRsZWQgZm9yIGVpdGhlciA8YSBocmVmPVxcXCJodHRwOi8vZXhwcmVzc2pzLmNvbVxcXCI+RXhwcmVzczwvYT4gb3IgPGEgaHJlZj1cXFwiaHR0cDovL2hhcGlqcy5jb21cXFwiPkhhcGk8L2E+IHlvdSYjMzk7bGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJiMzOTtsbCB1c2UgPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+LiBTd2l0Y2hpbmcgYmV0d2VlbiBvbmUgb2YgdGhlIGRpZmZlcmVudCBIVFRQIGZsYXZvcnMgaXMgc3RyaWtpbmdseSBlYXN5LCB0aG91Z2guPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwic2V0dGluZy11cC10aGUtc2VydmVyLXNpZGVcXFwiPlNldHRpbmcgdXAgdGhlIHNlcnZlci1zaWRlPC9oND5cXG48cD5OYXR1cmFsbHksIHlvdSYjMzk7bGwgbmVlZCB0byBpbnN0YWxsIGFsbCBvZiB0aGUgZm9sbG93aW5nIG1vZHVsZXMgZnJvbSA8Y29kZT5ucG08L2NvZGU+IHRvIGdldCBzdGFydGVkLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG5jZCBnZXR0aW5nLXN0YXJ0ZWRcXG5ucG0gaW5pdFxcbm5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbjwvY29kZT48L3ByZT5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBgbnBtIGluaXRgIG91dHB1dFxcXCI+PC9wPlxcbjxwPkxldCYjMzk7cyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSYjMzk7bGwgd2FsayB5b3UgdGhyb3VnaCB0aGVtIGFzIHdlIGdvIGFsb25nLiBGaXJzdCBvZiBhbGwsIHlvdSYjMzk7bGwgbmVlZCB0aGUgZmFtb3VzIDxjb2RlPmFwcC5qczwvY29kZT4gZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dG91Y2ggYXBwLmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkl0JiMzOTtzIHByb2JhYmx5IGEgZ29vZCBpZGVhIHRvIHB1dCBzb21ldGhpbmcgaW4geW91ciA8Y29kZT5hcHAuanM8L2NvZGU+IGZpbGUsIGxldCYjMzk7cyBkbyB0aGF0IG5vdy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge307XFxuXFxudGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuYXBwLmxpc3RlbigzMDAwKTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+QWxsIDxjb2RlPnRhdW51cy1leHByZXNzPC9jb2RlPiByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIDxjb2RlPmFwcDwvY29kZT4uIFlvdSBzaG91bGQgbm90ZSB0aGF0IGFueSBtaWRkbGV3YXJlIGFuZCBBUEkgcm91dGVzIHNob3VsZCBwcm9iYWJseSBjb21lIGJlZm9yZSB0aGUgPGNvZGU+dGF1bnVzRXhwcmVzczwvY29kZT4gaW52b2NhdGlvbi4gWW91JiMzOTtsbCBwcm9iYWJseSBiZSB1c2luZyBhIGNhdGNoLWFsbCB2aWV3IHJvdXRlIHRoYXQgcmVuZGVycyBhIDxlbT4mcXVvdDtOb3QgRm91bmQmcXVvdDs8L2VtPiB2aWV3LCBibG9ja2luZyBhbnkgcm91dGluZyBiZXlvbmQgdGhhdCByb3V0ZS48L3A+XFxuPHA+SWYgeW91IHdlcmUgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBub3cgeW91IHdvdWxkIGdldCBhIGZyaWVuZGx5IHJlbWluZWQgZnJvbSBUYXVudXMgbGV0dGluZyB5b3Uga25vdyB0aGF0IHlvdSBmb3Jnb3QgdG8gZGVjbGFyZSBhbnkgdmlldyByb3V0ZXMuIFNpbGx5IHlvdSE8L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bm9kZSBhcHBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5UaGUgPGNvZGU+b3B0aW9uczwvY29kZT4gb2JqZWN0IHBhc3NlZCB0byA8Y29kZT50YXVudXNFeHByZXNzPC9jb2RlPiBsZXQmIzM5O3MgeW91IGNvbmZpZ3VyZSBUYXVudXMuIEluc3RlYWQgb2YgZGlzY3Vzc2luZyBldmVyeSBzaW5nbGUgY29uZmlndXJhdGlvbiBvcHRpb24geW91IGNvdWxkIHNldCBoZXJlLCBsZXQmIzM5O3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSA8ZW0+cmVxdWlyZWQgY29uZmlndXJhdGlvbjwvZW0+LiBUaGVyZSYjMzk7cyB0d28gb3B0aW9ucyB0aGF0IHlvdSBtdXN0IHNldCBpZiB5b3Ugd2FudCB5b3VyIFRhdW51cyBhcHBsaWNhdGlvbiB0byBtYWtlIGFueSBzZW5zZS48L3A+XFxuPHVsPlxcbjxsaT48Y29kZT5yb3V0ZXM8L2NvZGU+IHNob3VsZCBiZSBhbiBhcnJheSBvZiB2aWV3IHJvdXRlczwvbGk+XFxuPGxpPjxjb2RlPmxheW91dDwvY29kZT4gc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSA8Y29kZT5tb2RlbDwvY29kZT4gYXJndW1lbnQgYW5kIHJldHVybnMgYW4gZW50aXJlIEhUTUwgZG9jdW1lbnQ8L2xpPlxcbjwvdWw+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ5b3VyLWZpcnN0LXJvdXRlXFxcIj5Zb3VyIGZpcnN0IHJvdXRlPC9oND5cXG48cD5Sb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gPHN0cm9uZz53aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZzwvc3Ryb25nPi4gTGV0JiMzOTtzIGNyZWF0ZSB0aGF0IG1vZHVsZSBhbmQgYWRkIGEgcm91dGUgdG8gaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRvdWNoIHJvdXRlcy5qc1xcbjwvY29kZT48L3ByZT5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IFtcXG4gIHsgcm91dGU6ICYjMzk7LyYjMzk7LCBhY3Rpb246ICYjMzk7aG9tZS9pbmRleCYjMzk7IH1cXG5dO1xcbjwvY29kZT48L3ByZT5cXG48cD5FYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSA8Y29kZT4vPC9jb2RlPiByb3V0ZSB3aXRoIHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24uIFRhdW51cyBmb2xsb3dzIHRoZSB3ZWxsIGtub3duIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm48L2E+LCB3aGljaCBtYWRlIDxhIGhyZWY9XFxcImh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvUnVieV9vbl9SYWlsc1xcXCI+UnVieSBvbiBSYWlsczwvYT4gZmFtb3VzLiA8ZW0+TWF5YmUgb25lIGRheSBUYXVudXMgd2lsbCBiZSBmYW1vdXMgdG9vITwvZW0+IEJ5IGNvbnZlbnRpb24sIFRhdW51cyB3aWxsIGFzc3VtZSB0aGF0IHRoZSA8Y29kZT5ob21lL2luZGV4PC9jb2RlPiBhY3Rpb24gdXNlcyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgPGNvZGU+aG9tZS9pbmRleDwvY29kZT4gdmlldy4gT2YgY291cnNlLCA8ZW0+YWxsIG9mIHRoYXQgY2FuIGJlIGNoYW5nZWQgdXNpbmcgY29uZmlndXJhdGlvbjwvZW0+LjwvcD5cXG48cD5UaW1lIHRvIGdvIGJhY2sgdG8gPGNvZGU+YXBwLmpzPC9jb2RlPiBhbmQgdXBkYXRlIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIGFwcCA9IGV4cHJlc3MoKTtcXG52YXIgb3B0aW9ucyA9IHtcXG4gIHJvdXRlczogcmVxdWlyZSgmIzM5Oy4vcm91dGVzJiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5JdCYjMzk7cyBpbXBvcnRhbnQgdG8ga25vdyB0aGF0IGlmIHlvdSBvbWl0IHRoZSBjcmVhdGlvbiBvZiBhIGNvbnRyb2xsZXIgdGhlbiBUYXVudXMgd2lsbCBza2lwIHRoYXQgc3RlcCwgYW5kIHJlbmRlciB0aGUgdmlldyBwYXNzaW5nIGl0IHdoYXRldmVyIHRoZSBkZWZhdWx0IG1vZGVsIGlzIDxlbT4obW9yZSBvbiB0aGF0IDxhIGhyZWY9XFxcIi9hcGlcXFwiPmluIHRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4sIGJ1dCBpdCBkZWZhdWx0cyB0byA8Y29kZT57fTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkhlcmUmIzM5O3Mgd2hhdCB5b3UmIzM5O2QgZ2V0IGlmIHlvdSBhdHRlbXB0ZWQgdG8gcnVuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS8wOGxuQ2VjLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCByZXN1bHRzXFxcIj48L3A+XFxuPHA+VHVybnMgb3V0IHlvdSYjMzk7cmUgbWlzc2luZyBhIGxvdCBvZiB0aGluZ3MhIFRhdW51cyBpcyBxdWl0ZSBsZW5pZW50IGFuZCBpdCYjMzk7bGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbiYjMzk7dCBoYXZlIGEgbGF5b3V0LCBhIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIsIG9yIGV2ZW4gYSB2aWV3ISA8ZW0+VGhhdCYjMzk7cyByb3VnaC48L2VtPjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNyZWF0aW5nLWEtbGF5b3V0XFxcIj5DcmVhdGluZyBhIGxheW91dDwvaDQ+XFxuPHA+TGV0JiMzOTtzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQmIzM5O2xsIGp1c3QgYmUgYSBwbGFpbiBKYXZhU2NyaXB0IGZ1bmN0aW9uLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50b3VjaCBsYXlvdXQuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBwcm9wZXJ0eSBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IDxlbT4oYXMgc2VlbiBiZWxvdyk8L2VtPiBpcyBjcmVhdGVkIG9uIHRoZSBmbHkgYWZ0ZXIgcmVuZGVyaW5nIHBhcnRpYWwgdmlld3MuIFRoZSBsYXlvdXQgZnVuY3Rpb24gd2UmIzM5O2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgPGVtPiZxdW90O3VzZSB0aGUgZm9sbG93aW5nIGNvbWJpbmF0aW9uIG9mIHBsYWluIHRleHQgYW5kIHRoZSA8c3Ryb25nPihtYXliZSBIVE1MKTwvc3Ryb25nPiBwYXJ0aWFsIHZpZXcmcXVvdDs8L2VtPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAobW9kZWwpIHtcXG4gIHJldHVybiAmIzM5O1RoaXMgaXMgdGhlIHBhcnRpYWw6ICZxdW90OyYjMzk7ICsgbW9kZWwucGFydGlhbCArICYjMzk7JnF1b3Q7JiMzOTs7XFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+T2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJiMzOTt0IHdhbnQgdG8gd3JpdGUgdmlld3MgYXMgSmF2YVNjcmlwdCBmdW5jdGlvbnMgYXMgdGhhdCYjMzk7cyB1bnByb2R1Y3RpdmUsIGNvbmZ1c2luZywgYW5kIGhhcmQgdG8gbWFpbnRhaW4uIFdoYXQgeW91IGNvdWxkIGRvIGluc3RlYWQsIGlzIHVzZSBhIHZpZXctcmVuZGVyaW5nIGVuZ2luZSB0aGF0IGFsbG93cyB5b3UgdG8gY29tcGlsZSB5b3VyIHZpZXcgdGVtcGxhdGVzIGludG8gSmF2YVNjcmlwdCBmdW5jdGlvbnMuPC9wPlxcbjx1bD5cXG48bGk+PGEgaHJlZj1cXFwiaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXFwiPk11c3RhY2hlPC9hPiBpcyBhIHRlbXBsYXRpbmcgZW5naW5lIHRoYXQgY2FuIGNvbXBpbGUgeW91ciB2aWV3cyBpbnRvIHBsYWluIGZ1bmN0aW9ucywgdXNpbmcgYSBzeW50YXggdGhhdCYjMzk7cyBtaW5pbWFsbHkgZGlmZmVyZW50IGZyb20gSFRNTDwvbGk+XFxuPGxpPjxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9qYWRlanMvamFkZVxcXCI+SmFkZTwvYT4gaXMgYW5vdGhlciBvcHRpb24sIGFuZCBpdCBoYXMgYSB0ZXJzZSBzeW50YXggd2hlcmUgc3BhY2luZyBtYXR0ZXJzIGJ1dCB0aGVyZSYjMzk7cyBubyBjbG9zaW5nIHRhZ3M8L2xpPlxcbjxsaT5UaGVyZSYjMzk7cyBtYW55IG1vcmUgYWx0ZXJuYXRpdmVzIGxpa2UgPGEgaHJlZj1cXFwiaHR0cDovL21vemlsbGEuZ2l0aHViLmlvL251bmp1Y2tzL1xcXCI+TW96aWxsYSYjMzk7cyBOdW5qdWNrczwvYT4sIDxhIGhyZWY9XFxcImh0dHA6Ly9oYW5kbGViYXJzanMuY29tL1xcXCI+SGFuZGxlYmFyczwvYT4sIGFuZCA8YSBocmVmPVxcXCJodHRwOi8vd3d3LmVtYmVkZGVkanMuY29tL1xcXCI+RUpTPC9hPi48L2xpPlxcbjwvdWw+XFxuPHA+UmVtZW1iZXIgdG8gYWRkIHRoZSA8Y29kZT5sYXlvdXQ8L2NvZGU+IHVuZGVyIHRoZSA8Y29kZT5vcHRpb25zPC9jb2RlPiBvYmplY3QgcGFzc2VkIHRvIDxjb2RlPnRhdW51c0V4cHJlc3M8L2NvZGU+ITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5IZXJlJiMzOTtzIHdoYXQgeW91JiMzOTtkIGdldCBpZiB5b3UgcmFuIHRoZSBhcHBsaWNhdGlvbiBhdCB0aGlzIHBvaW50LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ub2RlIGFwcCAmYW1wO1xcbmN1cmwgbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS93VWJuQ3lrLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5BdCB0aGlzIHBvaW50IHdlIGhhdmUgYSBsYXlvdXQsIGJ1dCB3ZSYjMzk7cmUgc3RpbGwgbWlzc2luZyB0aGUgcGFydGlhbCB2aWV3IGFuZCB0aGUgc2VydmVyLXNpZGUgY29udHJvbGxlci4gV2UgY2FuIGRvIHdpdGhvdXQgdGhlIGNvbnRyb2xsZXIsIGJ1dCBoYXZpbmcgbm8gdmlld3MgaXMga2luZCBvZiBwb2ludGxlc3Mgd2hlbiB5b3UmIzM5O3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/PC9wPlxcbjxwPllvdSYjMzk7bGwgZmluZCB0b29scyByZWxhdGVkIHRvIHZpZXcgdGVtcGxhdGluZyBpbiB0aGUgPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5jb21wbGVtZW50YXJ5IG1vZHVsZXMgc2VjdGlvbjwvYT4uIElmIHlvdSBkb24mIzM5O3QgcHJvdmlkZSBhIDxjb2RlPmxheW91dDwvY29kZT4gcHJvcGVydHkgYXQgYWxsLCBUYXVudXMgd2lsbCByZW5kZXIgeW91ciBtb2RlbCBpbiBhIHJlc3BvbnNlIGJ5IHdyYXBwaW5nIGl0IGluIDxjb2RlPiZsdDtwcmUmZ3Q7PC9jb2RlPiBhbmQgPGNvZGU+Jmx0O2NvZGUmZ3Q7PC9jb2RlPiB0YWdzLCB3aGljaCBtYXkgYWlkIHlvdSB3aGVuIGdldHRpbmcgc3RhcnRlZC48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy1qYWRlLWFzLXlvdXItdmlldy1lbmdpbmVcXFwiPlVzaW5nIEphZGUgYXMgeW91ciB2aWV3IGVuZ2luZTwvaDQ+XFxuPHA+TGV0JiMzOTtzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCB2aWV3cy9ob21lXFxudG91Y2ggdmlld3MvaG9tZS9pbmRleC5qYWRlXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlJiMzOTtyZSBqdXN0IGdldHRpbmcgc3RhcnRlZCwgdGhlIHZpZXcgd2lsbCBqdXN0IGhhdmUgc29tZSBiYXNpYyBzdGF0aWMgY29udGVudCwgYW5kIHRoYXQmIzM5O3MgaXQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+cCBIZWxsbyBUYXVudXMhXFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgeW91JiMzOTtsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS9iZXZhY3F1YS9qYWR1bVxcXCI+amFkdW08L2E+LCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIDxjb2RlPnJlcXVpcmU8L2NvZGU+IHN0YXRlbWVudHMsIGFuZCB0aHVzIHNhdmluZyBieXRlcyB3aGVuIGl0IGNvbWVzIHRvIGNsaWVudC1zaWRlIHJlbmRlcmluZy4gTGV0JiMzOTtzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIDxlbT4oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UmIzM5O3JlIGRldmVsb3BpbmcgYSByZWFsIGFwcGxpY2F0aW9uKTwvZW0+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLWdsb2JhbCBqYWR1bVxcbjwvY29kZT48L3ByZT5cXG48cD5UbyBjb21waWxlIGV2ZXJ5IHZpZXcgaW4gdGhlIDxjb2RlPnZpZXdzPC9jb2RlPiBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcgaW5kaWNhdGVzIHdoZXJlIHlvdSB3YW50IHRoZSB2aWV3cyB0byBiZSBwbGFjZWQuIFdlIGNob3NlIHRvIHVzZSA8Y29kZT4uYmluPC9jb2RlPiBiZWNhdXNlIHRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgeW91ciBjb21waWxlZCB2aWV3cyB0byBiZSBieSBkZWZhdWx0LiBCdXQgc2luY2UgVGF1bnVzIGZvbGxvd3MgdGhlIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPmNvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uPC9hPiBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPmphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG48L2NvZGU+PC9wcmU+XFxuPHA+Q29uZ3JhdHVsYXRpb25zISBZb3VyIGZpcnN0IHZpZXcgaXMgbm93IG9wZXJhdGlvbmFsIGFuZCBidWlsdCB1c2luZyBhIGZ1bGwtZmxlZGdlZCB0ZW1wbGF0aW5nIGVuZ2luZSEgQWxsIHRoYXQmIzM5O3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgPGNvZGU+MzAwMDwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwICZhbXA7XFxub3BlbiBodHRwOi8vbG9jYWxob3N0OjMwMDBcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRcXFwiPjwvcD5cXG48cD5HcmFudGVkLCB5b3Ugc2hvdWxkIDxlbT5wcm9iYWJseTwvZW0+IG1vdmUgdGhlIGxheW91dCBpbnRvIGEgSmFkZSA8ZW0+KGFueSB2aWV3IGVuZ2luZSB3aWxsIGRvKTwvZW0+IHRlbXBsYXRlIGFzIHdlbGwuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidGhyb3dpbmctaW4tYS1jb250cm9sbGVyXFxcIj5UaHJvd2luZyBpbiBhIGNvbnRyb2xsZXI8L2g0PlxcbjxwPkNvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24mIzM5O3QgZ2V0IHlvdSB2ZXJ5IGZhci4gQ29udHJvbGxlcnMgYWxsb3cgeW91IHRvIGhhbmRsZSB0aGUgcmVxdWVzdCBhbmQgcHV0IHRvZ2V0aGVyIHRoZSBtb2RlbCB0byBiZSB1c2VkIHdoZW4gc2VuZGluZyBhIHJlc3BvbnNlLiBDb250cmFyeSB0byB3aGF0IG1vc3QgZnJhbWV3b3JrcyBwcm9wb3NlLCBUYXVudXMgZXhwZWN0cyBldmVyeSBhY3Rpb24gdG8gaGF2ZSBpdHMgb3duIGluZGl2aWR1YWwgY29udHJvbGxlci4gU2luY2UgTm9kZS5qcyBtYWtlcyBpdCBlYXN5IHRvIGltcG9ydCBjb21wb25lbnRzLCB0aGlzIHNldHVwIGhlbHBzIHlvdSBrZWVwIHlvdXIgY29kZSBtb2R1bGFyIHdoaWxlIHN0aWxsIGJlaW5nIGFibGUgdG8gcmV1c2UgbG9naWMgYnkgc2hhcmluZyBtb2R1bGVzIGFjcm9zcyBkaWZmZXJlbnQgY29udHJvbGxlcnMuIExldCYjMzk7cyBjcmVhdGUgYSBjb250cm9sbGVyIGZvciB0aGUgPGNvZGU+aG9tZS92aWV3PC9jb2RlPiBhY3Rpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm1rZGlyIC1wIGNvbnRyb2xsZXJzL2hvbWVcXG50b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSBjb250cm9sbGVyIG1vZHVsZSBzaG91bGQgbWVyZWx5IGV4cG9ydCBhIGZ1bmN0aW9uLiA8ZW0+U3RhcnRlZCBub3RpY2luZyB0aGUgcGF0dGVybj88L2VtPiBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gPGEgaHJlZj1cXFwiaHR0cDovL2V4cHJlc3Nqcy5jb21cXFwiPkV4cHJlc3M8L2E+IDxlbT4ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIDxhIGhyZWY9XFxcImh0dHA6Ly9oYXBpanMuY29tXFxcIj5IYXBpPC9hPiBpbiB0aGUgY2FzZSBvZiA8Y29kZT50YXVudXMtaGFwaTwvY29kZT4pPC9lbT4uPC9wPlxcbjxwPkFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbiYjMzk7dCBldmVuIHNldCBhIGRvY3VtZW50IHRpdGxlIGZvciB5b3VyIEhUTUwgcGFnZXMhIFR1cm5zIG91dCwgdGhlcmUmIzM5O3MgYSBmZXcgbW9kZWwgcHJvcGVydGllcyA8ZW0+KHZlcnkgZmV3KTwvZW0+IHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIDxjb2RlPnRpdGxlPC9jb2RlPiBwcm9wZXJ0eSwgYW5kIGl0JiMzOTtsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgPGNvZGU+ZG9jdW1lbnQudGl0bGU8L2NvZGU+IGluIHlvdXIgcGFnZXMgd2hlbiBuYXZpZ2F0aW5nIHRocm91Z2ggdGhlIGNsaWVudC1zaWRlLiBLZWVwIGluIG1pbmQgdGhhdCBhbnl0aGluZyB0aGF0JiMzOTtzIG5vdCBpbiB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+IHByb3BlcnR5IHdvbiYjMzk7dCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LjwvcD5cXG48cD5IZXJlIGlzIG91ciBuZXdmYW5nbGVkIDxjb2RlPmhvbWUvaW5kZXg8L2NvZGU+IGNvbnRyb2xsZXIuIEFzIHlvdSYjMzk7bGwgbm90aWNlLCBpdCBkb2VzbiYjMzk7dCBkaXNydXB0IGFueSBvZiB0aGUgdHlwaWNhbCBFeHByZXNzIGV4cGVyaWVuY2UsIGJ1dCBtZXJlbHkgYnVpbGRzIHVwb24gaXQuIFdoZW4gPGNvZGU+bmV4dDwvY29kZT4gaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byA8Y29kZT5yZXMudmlld01vZGVsPC9jb2RlPi48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gIHJlcy52aWV3TW9kZWwgPSB7XFxuICAgIG1vZGVsOiB7XFxuICAgICAgdGl0bGU6ICYjMzk7V2VsY29tZSBIb21lLCBUYXVudXMhJiMzOTtcXG4gICAgfVxcbiAgfTtcXG4gIG5leHQoKTtcXG59O1xcbjwvY29kZT48L3ByZT5cXG48cD5PZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSA8ZW0+d291bGRuJiMzOTt0IGJlIHByb2dyZXNzaXZlPC9lbT4sIGFuZCB0aHVzIDxhIGhyZWY9XFxcImh0dHA6Ly9wb255Zm9vLmNvbS9zdG9wLWJyZWFraW5nLXRoZS13ZWJcXFwiPml0IHdvdWxkIGJlIHJlYWxseSwgPGVtPnJlYWxseTwvZW0+IGJhZDwvYT4uIFdlIHNob3VsZCB1cGRhdGUgdGhlIGxheW91dCB0byB1c2Ugd2hhdGV2ZXIgPGNvZGU+dGl0bGU8L2NvZGU+IGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCYjMzk7cyBnbyBiYWNrIHRvIHRoZSBkcmF3aW5nIGJvYXJkIGFuZCBtYWtlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgdGVtcGxhdGUhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnJtIGxheW91dC5qc1xcbnRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuamFkdW0gdmlld3MvKiogLS1vdXRwdXQgLmJpblxcbjwvY29kZT48L3ByZT5cXG48cD5Zb3Ugc2hvdWxkIGFsc28gcmVtZW1iZXIgdG8gdXBkYXRlIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZSBvbmNlIGFnYWluITwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJiMzOTt0YXVudXMtZXhwcmVzcyYjMzk7KTtcXG52YXIgZXhwcmVzcyA9IHJlcXVpcmUoJiMzOTtleHByZXNzJiMzOTspO1xcbnZhciBhcHAgPSBleHByZXNzKCk7XFxudmFyIG9wdGlvbnMgPSB7XFxuICByb3V0ZXM6IHJlcXVpcmUoJiMzOTsuL3JvdXRlcyYjMzk7KSxcXG4gIGxheW91dDogcmVxdWlyZSgmIzM5Oy4vLmJpbi92aWV3cy9sYXlvdXQmIzM5OylcXG59O1xcblxcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlRoZSA8Y29kZT4hPTwvY29kZT4gc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbiYjMzk7dCBiZSBlc2NhcGVkLiBUaGF0JiMzOTtzIG9rYXkgYmVjYXVzZSA8Y29kZT5wYXJ0aWFsPC9jb2RlPiBpcyBhIHZpZXcgd2hlcmUgSmFkZSBlc2NhcGVkIGFueXRoaW5nIHRoYXQgbmVlZGVkIGVzY2FwaW5nLCBidXQgd2Ugd291bGRuJiMzOTt0IHdhbnQgSFRNTCB0YWdzIHRvIGJlIGVzY2FwZWQhPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctamFkZVxcXCI+dGl0bGU9bW9kZWwudGl0bGVcXG5tYWluIT1wYXJ0aWFsXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IDxjb2RlPiZsdDtodG1sJmd0OzwvY29kZT4sIDxjb2RlPiZsdDtoZWFkJmd0OzwvY29kZT4sIGFuZCA8Y29kZT4mbHQ7Ym9keSZndDs8L2NvZGU+IGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIDxlbT5Ib3cgY29vbCBpcyB0aGF0PzwvZW0+PC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+WW91IGNhbiBub3cgdmlzaXQgPGNvZGU+bG9jYWxob3N0OjMwMDA8L2NvZGU+IHdpdGggeW91ciBmYXZvcml0ZSB3ZWIgYnJvd3NlciBhbmQgeW91JiMzOTtsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSYjMzk7ZCBleHBlY3QuIFRoZSB0aXRsZSB3aWxsIGJlIHByb3Blcmx5IHNldCwgYW5kIGEgPGNvZGU+Jmx0O21haW4mZ3Q7PC9jb2RlPiBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LjwvcD5cXG48cD48aW1nIHNyYz1cXFwiaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxcIiBhbHQ9XFxcIlNjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVcXFwiPjwvcD5cXG48cD5UaGF0JiMzOTtzIGl0LCBub3cgeW91ciB2aWV3IGhhcyBhIHRpdGxlLiBPZiBjb3Vyc2UsIHRoZXJlJiMzOTtzIG5vdGhpbmcgc3RvcHBpbmcgeW91IGZyb20gYWRkaW5nIGRhdGFiYXNlIGNhbGxzIHRvIGZldGNoIGJpdHMgYW5kIHBpZWNlcyBvZiB0aGUgbW9kZWwgYmVmb3JlIGludm9raW5nIDxjb2RlPm5leHQ8L2NvZGU+IHRvIHJlbmRlciB0aGUgdmlldy48L3A+XFxuPHA+VGhlbiB0aGVyZSYjMzk7cyBhbHNvIHRoZSBjbGllbnQtc2lkZSBhc3BlY3Qgb2Ygc2V0dGluZyB1cCBUYXVudXMuIExldCYjMzk7cyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoMSBpZD1cXFwidGF1bnVzLWluLXRoZS1jbGllbnRcXFwiPlRhdW51cyBpbiB0aGUgY2xpZW50PC9oMT5cXG48cD5Zb3UgYWxyZWFkeSBrbm93IGhvdyB0byBzZXQgdXAgdGhlIGJhc2ljcyBmb3Igc2VydmVyLXNpZGUgcmVuZGVyaW5nLCBhbmQgeW91IGtub3cgdGhhdCB5b3Ugc2hvdWxkIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmNoZWNrIG91dCB0aGUgQVBJIGRvY3VtZW50YXRpb248L2E+IHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLjwvcD5cXG48cD5UaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIDxlbT5vciBpZiBpdCBoYXNuJiMzOTt0IGxvYWRlZCB5ZXQgZHVlIHRvIGEgc2xvdyBjb25uZWN0aW9uIHN1Y2ggYXMgdGhvc2UgaW4gdW5zdGFibGUgbW9iaWxlIG5ldHdvcmtzPC9lbT4sIHRoZSByZWd1bGFyIGxpbmsgd291bGQgYmUgZm9sbG93ZWQgaW5zdGVhZCBhbmQgbm8gaGFybSB3b3VsZCBiZSB1bmxlYXNoZWQgdXBvbiB0aGUgaHVtYW4sIGV4Y2VwdCB0aGV5IHdvdWxkIGdldCBhIHNsaWdodGx5IGxlc3MgZmFuY3kgZXhwZXJpZW5jZS48L3A+XFxuPHA+U2V0dGluZyB1cCB0aGUgY2xpZW50LXNpZGUgaW52b2x2ZXMgYSBmZXcgZGlmZmVyZW50IHN0ZXBzLiBGaXJzdGx5LCB3ZSYjMzk7bGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbiYjMzk7cyB3aXJpbmcgPGVtPih0aGUgcm91dGVzIGFuZCBKYXZhU2NyaXB0IHZpZXcgZnVuY3Rpb25zKTwvZW0+IGludG8gc29tZXRoaW5nIHRoZSBicm93c2VyIHVuZGVyc3RhbmRzLiBUaGVuLCB5b3UmIzM5O2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQmIzM5O3Mgb3V0IG9mIHRoZSB3YXksIGNsaWVudC1zaWRlIHJvdXRpbmcgd291bGQgYmUgc2V0IHVwLjwvcD5cXG48cD5BcyBzdWdhciBjb2F0aW5nIG9uIHRvcCBvZiB0aGF0LCB5b3UgbWF5IGFkZCBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHVzaW5nIGNvbnRyb2xsZXJzLiBUaGVzZSBjb250cm9sbGVycyB3b3VsZCBiZSBleGVjdXRlZCBldmVuIGlmIHRoZSB2aWV3IHdhcyByZW5kZXJlZCBvbiB0aGUgc2VydmVyLXNpZGUuIFRoZXkgY2FuIGFjY2VzcyB0aGUgVGF1bnVzIEFQSSBkaXJlY3RseSwgaW4gY2FzZSB5b3UgbmVlZCB0byBuYXZpZ2F0ZSB0byBhbm90aGVyIHZpZXcgaW4gc29tZSB3YXkgb3RoZXIgdGhhbiBieSBoYXZpbmcgaHVtYW5zIGNsaWNrIG9uIGFuY2hvciB0YWdzLiBUaGUgQVBJLCBhcyB5b3UmIzM5O2xsIGxlYXJuLCB3aWxsIGFsc28gbGV0IHlvdSByZW5kZXIgcGFydGlhbCB2aWV3cyB1c2luZyB0aGUgcG93ZXJmdWwgVGF1bnVzIGVuZ2luZSwgbGlzdGVuIGZvciBldmVudHMgdGhhdCBtYXkgb2NjdXIgYXQga2V5IHN0YWdlcyBvZiB0aGUgdmlldy1yZW5kZXJpbmcgcHJvY2VzcywgYW5kIGV2ZW4gaW50ZXJjZXB0IEFKQVggcmVxdWVzdHMgYmxvY2tpbmcgdGhlbSBiZWZvcmUgdGhleSBldmVyIGhhcHBlbi48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJ1c2luZy10aGUtdGF1bnVzLWNsaVxcXCI+VXNpbmcgdGhlIFRhdW51cyBDTEk8L2g0PlxcbjxwPlRhdW51cyBjb21lcyB3aXRoIGEgQ0xJIHRoYXQgY2FuIGJlIHVzZWQgdG8gd2lyZSB5b3VyIE5vZGUuanMgcm91dGVzIGFuZCB2aWV3cyBpbnRvIHRoZSBjbGllbnQtc2lkZS4gVGhlIHNhbWUgQ0xJIGNhbiBiZSB1c2VkIHRvIHdpcmUgdXAgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFzIHdlbGwuIFRoZSBtYWluIHJlYXNvbiB3aHkgdGhlIFRhdW51cyBDTEkgZXhpc3RzIGlzIHNvIHRoYXQgeW91IGRvbiYjMzk7dCBoYXZlIHRvIDxjb2RlPnJlcXVpcmU8L2NvZGU+IGV2ZXJ5IHNpbmdsZSB2aWV3IGFuZCBjb250cm9sbGVyLCB1bmRvaW5nIGEgbG90IG9mIHRoZSB3b3JrIHRoYXQgd2FzIHB1dCBpbnRvIGNvZGUgcmV1c2UuIEp1c3QgbGlrZSB3ZSBkaWQgd2l0aCA8Y29kZT5qYWR1bTwvY29kZT4gZWFybGllciwgd2UmIzM5O2xsIGluc3RhbGwgdGhlIDxjb2RlPnRhdW51czwvY29kZT4gQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkJlZm9yZSB5b3UgY2FuIHVzZSB0aGUgQ0xJLCB5b3Ugc2hvdWxkIG1vdmUgdGhlIHJvdXRlIGRlZmluaXRpb25zIHRvIDxjb2RlPmNvbnRyb2xsZXJzL3JvdXRlcy5qczwvY29kZT4uIFRoYXQmIzM5O3Mgd2hlcmUgVGF1bnVzIGV4cGVjdHMgdGhlbSB0byBiZS4gSWYgeW91IHdhbnQgdG8gcGxhY2UgdGhlbSBzb21ldGhpbmcgZWxzZSwgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uIGNhbiBoZWxwIHlvdTwvYT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+U2luY2UgeW91IG1vdmVkIHRoZSByb3V0ZXMgeW91IHNob3VsZCBhbHNvIHVwZGF0ZSB0aGUgPGNvZGU+cmVxdWlyZTwvY29kZT4gc3RhdGVtZW50IGluIHRoZSA8Y29kZT5hcHAuanM8L2NvZGU+IG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRhdW51cyA9IHJlcXVpcmUoJiMzOTt0YXVudXMmIzM5Oyk7XFxudmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCYjMzk7dGF1bnVzLWV4cHJlc3MmIzM5Oyk7XFxudmFyIGV4cHJlc3MgPSByZXF1aXJlKCYjMzk7ZXhwcmVzcyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG50YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG5hcHAubGlzdGVuKDMwMDApO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgQ0xJIGlzIHRlcnNlIGluIGJvdGggaXRzIGlucHV0cyBhbmQgaXRzIG91dHB1dHMuIElmIHlvdSBydW4gaXQgd2l0aG91dCBhbnkgYXJndW1lbnRzIGl0JiMzOTtsbCBwcmludCBvdXQgdGhlIHdpcmluZyBtb2R1bGUsIGFuZCBpZiB5b3Ugd2FudCB0byBwZXJzaXN0IGl0IHlvdSBzaG91bGQgcHJvdmlkZSB0aGUgPGNvZGU+LS1vdXRwdXQ8L2NvZGU+IGZsYWcuIEluIHR5cGljYWwgPGEgaHJlZj1cXFwiaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9Db252ZW50aW9uX292ZXJfY29uZmlndXJhdGlvblxcXCI+Y29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb248L2E+IGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIDxjb2RlPi5iaW4vdmlld3M8L2NvZGU+IGFuZCB0aGF0IHlvdSB3YW50IHRoZSB3aXJpbmcgbW9kdWxlIHRvIGJlIHBsYWNlZCBpbiA8Y29kZT4uYmluL3dpcmluZy5qczwvY29kZT4sIGJ1dCB5b3UmIzM5O2xsIGJlIGFibGUgdG8gY2hhbmdlIHRoYXQgaWYgaXQgZG9lc24mIzM5O3QgbWVldCB5b3VyIG5lZWRzLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj50YXVudXMgLS1vdXRwdXRcXG48L2NvZGU+PC9wcmU+XFxuPHA+QXQgdGhpcyBwb2ludCBpbiBvdXIgZXhhbXBsZSwgdGhlIENMSSBzaG91bGQgY3JlYXRlIGEgPGNvZGU+LmJpbi93aXJpbmcuanM8L2NvZGU+IGZpbGUgd2l0aCB0aGUgY29udGVudHMgZGV0YWlsZWQgYmVsb3cuIEFzIHlvdSBjYW4gc2VlLCBldmVuIGlmIDxjb2RlPnRhdW51czwvY29kZT4gaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCYjMzk7cyBvdXRwdXQgaXMgYXMgaHVtYW4gcmVhZGFibGUgYXMgYW55IG90aGVyIG1vZHVsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qc1xcXCI+JiMzOTt1c2Ugc3RyaWN0JiMzOTs7XFxuXFxudmFyIHRlbXBsYXRlcyA9IHtcXG4gICYjMzk7aG9tZS9pbmRleCYjMzk7OiByZXF1aXJlKCYjMzk7Li92aWV3cy9ob21lL2luZGV4LmpzJiMzOTspLFxcbiAgJiMzOTtsYXlvdXQmIzM5OzogcmVxdWlyZSgmIzM5Oy4vdmlld3MvbGF5b3V0LmpzJiMzOTspXFxufTtcXG5cXG52YXIgY29udHJvbGxlcnMgPSB7XFxufTtcXG5cXG52YXIgcm91dGVzID0ge1xcbiAgJiMzOTsvJiMzOTs6IHtcXG4gICAgYWN0aW9uOiAmIzM5O2hvbWUvaW5kZXgmIzM5O1xcbiAgfVxcbn07XFxuXFxubW9kdWxlLmV4cG9ydHMgPSB7XFxuICB0ZW1wbGF0ZXM6IHRlbXBsYXRlcyxcXG4gIGNvbnRyb2xsZXJzOiBjb250cm9sbGVycyxcXG4gIHJvdXRlczogcm91dGVzXFxufTtcXG48L2NvZGU+PC9wcmU+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9mSm5IZFlpLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggYHRhdW51c2Agb3V0cHV0XFxcIj48L3A+XFxuPHA+Tm90ZSB0aGF0IHRoZSA8Y29kZT5jb250cm9sbGVyczwvY29kZT4gb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJiMzOTt0IGNyZWF0ZWQgYW55IDxlbT5jbGllbnQtc2lkZSBjb250cm9sbGVyczwvZW0+IHlldC4gV2UgY3JlYXRlZCBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyBidXQgdGhvc2UgZG9uJiMzOTt0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC48L3A+XFxuPHA+VGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLjwvcD5cXG48cD5EdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIDxjb2RlPi0td2F0Y2g8L2NvZGU+IGZsYWcsIHdoaWNoIHdpbGwgcmVidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBpZiBhIHJlbGV2YW50IGZpbGUgY2hhbmdlcy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0IC0td2F0Y2hcXG48L2NvZGU+PC9wcmU+XFxuPHA+SWYgeW91JiMzOTtyZSB1c2luZyBIYXBpIGluc3RlYWQgb2YgRXhwcmVzcywgeW91JiMzOTtsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgPGNvZGU+aGFwaWlmeTwvY29kZT4gdHJhbnNmb3JtIHNvIHRoYXQgcm91dGVzIGdldCBjb252ZXJ0ZWQgaW50byBzb21ldGhpbmcgdGhlIGNsaWVudC1zaWRlIHJvdXRpbmcgbW9kdWxlIHVuZGVyc3RhbmQuPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPnRhdW51cyAtLW91dHB1dCAtLXRyYW5zZm9ybSBoYXBpaWZ5XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5vdyB0aGF0IHlvdSB1bmRlcnN0YW5kIGhvdyB0byB1c2UgdGhlIENMSSBvciBidWlsZCB0aGUgd2lyaW5nIG1vZHVsZSBvbiB5b3VyIG93biwgYm9vdGluZyB1cCBUYXVudXMgb24gdGhlIGNsaWVudC1zaWRlIHdpbGwgYmUgYW4gZWFzeSB0aGluZyB0byBkbyE8L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJib290aW5nLXVwLXRoZS1jbGllbnQtc2lkZS1yb3V0ZXJcXFwiPkJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcjwvaDQ+XFxuPHA+T25jZSB3ZSBoYXZlIHRoZSB3aXJpbmcgbW9kdWxlLCBib290aW5nIHVwIHRoZSBjbGllbnQtc2lkZSBlbmdpbmUgaXMgcHJldHR5IGVhc3kuIFRhdW51cyBzdWdnZXN0cyB5b3UgdXNlIDxjb2RlPmNsaWVudC9qczwvY29kZT4gdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0JiMzOTtzIHN0aWNrIHRvIHRoZSBjb252ZW50aW9ucy48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgY2xpZW50L2pzXFxudG91Y2ggY2xpZW50L2pzL21haW4uanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+VGhlIDxjb2RlPm1haW48L2NvZGU+IG1vZHVsZSB3aWxsIGJlIHVzZWQgYXMgdGhlIDxlbT5lbnRyeSBwb2ludDwvZW0+IG9mIHlvdXIgYXBwbGljYXRpb24gb24gdGhlIGNsaWVudC1zaWRlLiBIZXJlIHlvdSYjMzk7bGwgbmVlZCB0byBpbXBvcnQgPGNvZGU+dGF1bnVzPC9jb2RlPiwgdGhlIHdpcmluZyBtb2R1bGUgd2UmIzM5O3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG52YXIgdGF1bnVzID0gcmVxdWlyZSgmIzM5O3RhdW51cyYjMzk7KTtcXG52YXIgd2lyaW5nID0gcmVxdWlyZSgmIzM5Oy4uLy4uLy5iaW4vd2lyaW5nJiMzOTspO1xcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJiMzOTttYWluJiMzOTspWzBdO1xcblxcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbjwvY29kZT48L3ByZT5cXG48cD5UaGUgbW91bnRwb2ludCB3aWxsIHNldCB1cCB0aGUgY2xpZW50LXNpZGUgVGF1bnVzIHJvdXRlciBhbmQgZmlyZSB0aGUgY2xpZW50LXNpZGUgdmlldyBjb250cm9sbGVyIGZvciB0aGUgdmlldyB0aGF0IGhhcyBiZWVuIHJlbmRlcmVkIGluIHRoZSBzZXJ2ZXItc2lkZS4gV2hlbmV2ZXIgYW4gYW5jaG9yIGxpbmsgaXMgY2xpY2tlZCwgVGF1bnVzIHdpbGwgYmUgYWJsZSB0byBoaWphY2sgdGhhdCBjbGljayBhbmQgcmVxdWVzdCB0aGUgbW9kZWwgdXNpbmcgQUpBWCwgYnV0IG9ubHkgaWYgaXQgbWF0Y2hlcyBhIHZpZXcgcm91dGUuIE90aGVyd2lzZSB0aGUgbGluayB3aWxsIGJlaGF2ZSBqdXN0IGxpa2UgYW55IG5vcm1hbCBsaW5rIHdvdWxkLjwvcD5cXG48cD5CeSBkZWZhdWx0LCB0aGUgbW91bnRwb2ludCB3aWxsIGlzc3VlIGFuIEFKQVggcmVxdWVzdCBmb3IgdGhlIHZpZXcgbW9kZWwgb2YgdGhlIHNlcnZlci1zaWRlIHJlbmRlcmVkIHZpZXcuIFRoaXMgaXMgYWtpbiB0byB3aGF0IGRlZGljYXRlZCBjbGllbnQtc2lkZSByZW5kZXJpbmcgZnJhbWV3b3JrcyBzdWNoIGFzIEFuZ3VsYXJKUyBkbywgd2hlcmUgdmlld3MgYXJlIG9ubHkgcmVuZGVyZWQgYWZ0ZXIgYWxsIHRoZSBKYXZhU2NyaXB0IGhhcyBiZWVuIGRvd25sb2FkZWQsIHBhcnNlZCwgYW5kIGV4ZWN1dGVkLiBFeGNlcHQgVGF1bnVzIHByb3ZpZGVzIGh1bWFuLXJlYWRhYmxlIGNvbnRlbnQgZmFzdGVyLCBiZWZvcmUgdGhlIEphdmFTY3JpcHQgZXZlbiBiZWdpbnMgZG93bmxvYWRpbmcsIGFsdGhvdWdoIGl0IHdvbiYjMzk7dCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuPC9wPlxcbjxwPkFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgPGNvZGU+Jmx0O3NjcmlwdCB0eXBlPSYjMzk7dGV4dC90YXVudXMmIzM5OyZndDs8L2NvZGU+IHRhZywgYnV0IHRoaXMgdGVuZHMgdG8gc2xvdyBkb3duIHRoZSBpbml0aWFsIHJlc3BvbnNlIChtb2RlbHMgYXJlIDxlbT50eXBpY2FsbHkgbGFyZ2VyPC9lbT4gdGhhbiB0aGUgcmVzdWx0aW5nIHZpZXdzKS48L3A+XFxuPHA+QSB0aGlyZCBzdHJhdGVneSBpcyB0aGF0IHlvdSByZXF1ZXN0IHRoZSBtb2RlbCBhc3luY2hyb25vdXNseSBvdXRzaWRlIG9mIFRhdW51cywgYWxsb3dpbmcgeW91IHRvIGZldGNoIGJvdGggdGhlIHZpZXcgbW9kZWwgYW5kIFRhdW51cyBpdHNlbGYgY29uY3VycmVudGx5LCBidXQgdGhhdCYjMzk7cyBoYXJkZXIgdG8gc2V0IHVwLjwvcD5cXG48cD5UaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBkb2N1bWVudGF0aW9uPC9hPiBhbmQgZnVydGhlciBkaXNjdXNzZWQgaW4gPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj50aGUgb3B0aW1pemF0aW9uIGd1aWRlPC9hPi4gRm9yIG5vdywgdGhlIGRlZmF1bHQgc3RyYXRlZ3kgPGVtPig8Y29kZT4mIzM5O2F1dG8mIzM5OzwvY29kZT4pPC9lbT4gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy48L3A+XFxuPHA+PHN1Yj48YSBocmVmPVxcXCIjdGFibGUtb2YtY29udGVudHNcXFwiPjxlbT4oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cyk8L2VtPjwvYT48L3N1Yj48L3A+XFxuPGg0IGlkPVxcXCJhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXJcXFwiPkFkZGluZyBmdW5jdGlvbmFsaXR5IGluIGEgY2xpZW50LXNpZGUgY29udHJvbGxlcjwvaDQ+XFxuPHA+Q2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCYjMzk7cyBhIHBhcnRpYWwuIFRoZSBjb250cm9sbGVyIGlzIHBhc3NlZCB0aGUgPGNvZGU+bW9kZWw8L2NvZGU+LCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIDxjb2RlPnJvdXRlPC9jb2RlPiwgYnJva2VuIGRvd24gaW50byBpdHMgY29tcG9uZW50czsgYW5kIHRoZSA8Y29kZT5jb250YWluZXI8L2NvZGU+LCB3aGljaCBpcyB3aGF0ZXZlciBET00gZWxlbWVudCB0aGUgdmlldyB3YXMgcmVuZGVyZWQgaW50by48L3A+XFxuPHA+VGhlc2UgY29udHJvbGxlcnMgYXJlIGVudGlyZWx5IG9wdGlvbmFsLCB3aGljaCBtYWtlcyBzZW5zZSBzaW5jZSB3ZSYjMzk7cmUgcHJvZ3Jlc3NpdmVseSBlbmhhbmNpbmcgdGhlIGFwcGxpY2F0aW9uOiBpdCBtaWdodCBub3QgZXZlbiBiZSBuZWNlc3NhcnkhIExldCYjMzk7cyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJiMzOTt2ZSBiZWVuIGJ1aWxkaW5nLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ta2RpciAtcCBjbGllbnQvanMvY29udHJvbGxlcnMvaG9tZVxcbnRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkd1ZXNzIHdoYXQ/IFRoZSBjb250cm9sbGVyIHNob3VsZCBiZSBhIG1vZHVsZSB3aGljaCBleHBvcnRzIGEgZnVuY3Rpb24uIFRoYXQgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgd2hlbmV2ZXIgdGhlIHZpZXcgaXMgcmVuZGVyZWQuIEZvciB0aGUgc2FrZSBvZiBzaW1wbGljaXR5IHdlJiMzOTtsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUmIzM5O3Mgb25lIHBsYWNlIHdoZXJlIHlvdSYjMzk7ZCB3YW50IHRvIGVuaGFuY2UgdGhlIGV4cGVyaWVuY2UsIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJzIGFyZSB3aGVyZSB5b3Ugd2FudCB0byBwdXQgeW91ciBjb2RlLjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLWpzXFxcIj4mIzM5O3VzZSBzdHJpY3QmIzM5OztcXG5cXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGFpbmVyLCByb3V0ZSkge1xcbiAgY29uc29sZS5sb2coJiMzOTtSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsOlxcXFxuJXMmIzM5Oywgcm91dGUuYWN0aW9uLCBKU09OLnN0cmluZ2lmeShtb2RlbCwgbnVsbCwgMikpO1xcbn07XFxuPC9jb2RlPjwvcHJlPlxcbjxwPlNpbmNlIHdlIHdlcmVuJiMzOTt0IHVzaW5nIHRoZSA8Y29kZT4tLXdhdGNoPC9jb2RlPiBmbGFnIGZyb20gdGhlIFRhdW51cyBDTEksIHlvdSYjMzk7bGwgaGF2ZSB0byByZWNvbXBpbGUgdGhlIHdpcmluZyBhdCB0aGlzIHBvaW50LCBzbyB0aGF0IHRoZSBjb250cm9sbGVyIGdldHMgYWRkZWQgdG8gdGhhdCBtYW5pZmVzdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+dGF1bnVzIC0tb3V0cHV0XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk9mIGNvdXJzZSwgeW91JiMzOTtsbCBub3cgaGF2ZSB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IHVzaW5nIDxhIGhyZWY9XFxcImh0dHA6Ly9icm93c2VyaWZ5Lm9yZy9cXFwiPkJyb3dzZXJpZnk8L2E+ITwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDQgaWQ9XFxcImNvbXBpbGluZy15b3VyLWNsaWVudC1zaWRlLWphdmFzY3JpcHRcXFwiPkNvbXBpbGluZyB5b3VyIGNsaWVudC1zaWRlIEphdmFTY3JpcHQ8L2g0PlxcbjxwPllvdSYjMzk7bGwgbmVlZCB0byBjb21waWxlIHRoZSA8Y29kZT5jbGllbnQvanMvbWFpbi5qczwvY29kZT4gbW9kdWxlLCBvdXIgY2xpZW50LXNpZGUgYXBwbGljYXRpb24mIzM5O3MgZW50cnkgcG9pbnQsIHVzaW5nIEJyb3dzZXJpZnkgc2luY2UgdGhlIGNvZGUgaXMgd3JpdHRlbiB1c2luZyBDb21tb25KUy4gSW4gdGhpcyBleGFtcGxlIHlvdSYjMzk7bGwgaW5zdGFsbCA8Y29kZT5icm93c2VyaWZ5PC9jb2RlPiBnbG9iYWxseSB0byBjb21waWxlIHRoZSBjb2RlLCBidXQgbmF0dXJhbGx5IHlvdSYjMzk7bGwgaW5zdGFsbCBpdCBsb2NhbGx5IHdoZW4gd29ya2luZyBvbiBhIHJlYWwtd29ybGQgYXBwbGljYXRpb24uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5wbSBpbnN0YWxsIC0tZ2xvYmFsIGJyb3dzZXJpZnlcXG48L2NvZGU+PC9wcmU+XFxuPHA+T25jZSB5b3UgaGF2ZSB0aGUgQnJvd3NlcmlmeSBDTEksIHlvdSYjMzk7bGwgYmUgYWJsZSB0byBjb21waWxlIHRoZSBjb2RlIHJpZ2h0IGZyb20geW91ciBjb21tYW5kIGxpbmUuIFRoZSA8Y29kZT4tZDwvY29kZT4gZmxhZyB0ZWxscyBCcm93c2VyaWZ5IHRvIGFkZCBhbiBpbmxpbmUgc291cmNlIG1hcCBpbnRvIHRoZSBjb21waWxlZCBidW5kbGUsIG1ha2luZyBkZWJ1Z2dpbmcgZWFzaWVyIGZvciB1cy4gVGhlIDxjb2RlPi1vPC9jb2RlPiBmbGFnIHJlZGlyZWN0cyBvdXRwdXQgdG8gdGhlIGluZGljYXRlZCBmaWxlLCB3aGVyZWFzIHRoZSBvdXRwdXQgaXMgcHJpbnRlZCB0byBzdGFuZGFyZCBvdXRwdXQgYnkgZGVmYXVsdC48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1zaGVsbFxcXCI+bWtkaXIgLXAgLmJpbi9wdWJsaWMvanNcXG5icm93c2VyaWZ5IGNsaWVudC9qcy9tYWluLmpzIC1kbyAuYmluL3B1YmxpYy9qcy9hbGwuanNcXG48L2NvZGU+PC9wcmU+XFxuPHA+V2UgaGF2ZW4mIzM5O3QgZG9uZSBtdWNoIG9mIGFueXRoaW5nIHdpdGggdGhlIEV4cHJlc3MgYXBwbGljYXRpb24sIHNvIHlvdSYjMzk7bGwgbmVlZCB0byBhZGp1c3QgdGhlIDxjb2RlPmFwcC5qczwvY29kZT4gbW9kdWxlIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMuIElmIHlvdSYjMzk7cmUgdXNlZCB0byBFeHByZXNzLCB5b3UmIzM5O2xsIG5vdGljZSB0aGVyZSYjMzk7cyBub3RoaW5nIHNwZWNpYWwgYWJvdXQgaG93IHdlJiMzOTtyZSB1c2luZyA8Y29kZT5zZXJ2ZS1zdGF0aWM8L2NvZGU+LjwvcD5cXG48cHJlPjxjb2RlIGNsYXNzPVxcXCJsYW5nLXNoZWxsXFxcIj5ucG0gaW5zdGFsbCAtLXNhdmUgc2VydmUtc3RhdGljXFxuPC9jb2RlPjwvcHJlPlxcbjxwPkxldCYjMzk7cyBjb25maWd1cmUgdGhlIGFwcGxpY2F0aW9uIHRvIHNlcnZlIHN0YXRpYyBhc3NldHMgZnJvbSA8Y29kZT4uYmluL3B1YmxpYzwvY29kZT4uPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctanNcXFwiPiYjMzk7dXNlIHN0cmljdCYjMzk7O1xcblxcbnZhciB0YXVudXMgPSByZXF1aXJlKCYjMzk7dGF1bnVzJiMzOTspO1xcbnZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgmIzM5O3RhdW51cy1leHByZXNzJiMzOTspO1xcbnZhciBleHByZXNzID0gcmVxdWlyZSgmIzM5O2V4cHJlc3MmIzM5Oyk7XFxudmFyIHNlcnZlU3RhdGljID0gcmVxdWlyZSgmIzM5O3NlcnZlLXN0YXRpYyYjMzk7KTtcXG52YXIgYXBwID0gZXhwcmVzcygpO1xcbnZhciBvcHRpb25zID0ge1xcbiAgcm91dGVzOiByZXF1aXJlKCYjMzk7Li9jb250cm9sbGVycy9yb3V0ZXMmIzM5OyksXFxuICBsYXlvdXQ6IHJlcXVpcmUoJiMzOTsuLy5iaW4vdmlld3MvbGF5b3V0JiMzOTspXFxufTtcXG5cXG5hcHAudXNlKHNlcnZlU3RhdGljKCYjMzk7LmJpbi9wdWJsaWMmIzM5OykpO1xcbnRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbmFwcC5saXN0ZW4oMzAwMCk7XFxuPC9jb2RlPjwvcHJlPlxcbjxwPk5leHQgdXAsIHlvdSYjMzk7bGwgaGF2ZSB0byBlZGl0IHRoZSBsYXlvdXQgdG8gaW5jbHVkZSB0aGUgY29tcGlsZWQgSmF2YVNjcmlwdCBidW5kbGUgZmlsZS48L3A+XFxuPHByZT48Y29kZSBjbGFzcz1cXFwibGFuZy1qYWRlXFxcIj50aXRsZT1tb2RlbC50aXRsZVxcbm1haW4hPXBhcnRpYWxcXG5zY3JpcHQoc3JjPSYjMzk7L2pzL2FsbC5qcyYjMzk7KVxcbjwvY29kZT48L3ByZT5cXG48cD5MYXN0bHksIHlvdSBjYW4gZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24gYW5kIHNlZSBpdCBpbiBhY3Rpb24hPC9wPlxcbjxwcmU+PGNvZGUgY2xhc3M9XFxcImxhbmctc2hlbGxcXFwiPm5vZGUgYXBwXFxuPC9jb2RlPjwvcHJlPlxcbjxwPjxpbWcgc3JjPVxcXCJodHRwOi8vaS5pbWd1ci5jb20vNjhPODR3WC5wbmdcXFwiIGFsdD1cXFwiU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XFxcIj48L3A+XFxuPHA+SWYgeW91IG9wZW4gdGhlIGFwcGxpY2F0aW9uIG9uIGEgd2ViIGJyb3dzZXIsIHlvdSYjMzk7bGwgbm90aWNlIHRoYXQgdGhlIGFwcHJvcHJpYXRlIGluZm9ybWF0aW9uIHdpbGwgYmUgbG9nZ2VkIGludG8gdGhlIGRldmVsb3BlciA8Y29kZT5jb25zb2xlPC9jb2RlPi48L3A+XFxuPHA+PGltZyBzcmM9XFxcImh0dHA6Ly9pLmltZ3VyLmNvbS9aVUY2TkZsLnBuZ1xcXCIgYWx0PVxcXCJTY3JlZW5zaG90IHdpdGggdGhlIGFwcGxpY2F0aW9uIHJ1bm5pbmcgdW5kZXIgR29vZ2xlIENocm9tZVxcXCI+PC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwidXNpbmctdGhlLWNsaWVudC1zaWRlLXRhdW51cy1hcGlcXFwiPlVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJPC9oND5cXG48cD5UYXVudXMgZG9lcyBwcm92aWRlIDxhIGhyZWY9XFxcIi9hcGlcXFwiPmEgdGhpbiBBUEk8L2E+IGluIHRoZSBjbGllbnQtc2lkZS4gVXNhZ2Ugb2YgdGhhdCBBUEkgYmVsb25ncyBtb3N0bHkgaW5zaWRlIHRoZSBib2R5IG9mIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlcnMsIGJ1dCB0aGVyZSYjMzk7cyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC48L3A+XFxuPHA+VGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuPC9wPlxcbjx0YWJsZT5cXG48dGhlYWQ+XFxuPHRyPlxcbjx0aD5FdmVudDwvdGg+XFxuPHRoPkFyZ3VtZW50czwvdGg+XFxuPHRoPkRlc2NyaXB0aW9uPC90aD5cXG48L3RyPlxcbjwvdGhlYWQ+XFxuPHRib2R5Plxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtzdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPmNvbnRhaW5lciwgbW9kZWw8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4gZmluaXNoZWQgdGhlIHJvdXRlIHNldHVwIGFuZCBpcyBhYm91dCB0byBpbnZva2UgdGhlIGNsaWVudC1zaWRlIGNvbnRyb2xsZXIuIFN1YnNjcmliZSB0byB0aGlzIGV2ZW50IGJlZm9yZSBjYWxsaW5nIDxjb2RlPnRhdW51cy5tb3VudDwvY29kZT4uPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtyZW5kZXImIzM5OzwvY29kZT48L3RkPlxcbjx0ZD48Y29kZT5jb250YWluZXIsIG1vZGVsPC9jb2RlPjwvdGQ+XFxuPHRkPkEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5zdGFydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLjwvdGQ+XFxuPC90cj5cXG48dHI+XFxuPHRkPjxjb2RlPiYjMzk7ZmV0Y2guZG9uZSYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBkYXRhPC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgZW5kcyBzdWNjZXNzZnVsbHkuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5hYm9ydCYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0PC9jb2RlPjwvdGQ+XFxuPHRkPkVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3QgaXMgcHVycG9zZWx5IGFib3J0ZWQuPC90ZD5cXG48L3RyPlxcbjx0cj5cXG48dGQ+PGNvZGU+JiMzOTtmZXRjaC5lcnJvciYjMzk7PC9jb2RlPjwvdGQ+XFxuPHRkPjxjb2RlPnJvdXRlLCBjb250ZXh0LCBlcnI8L2NvZGU+PC90ZD5cXG48dGQ+RW1pdHRlZCB3aGVuZXZlciBhbiBYSFIgcmVxdWVzdCByZXN1bHRzIGluIGFuIEhUVFAgZXJyb3IuPC90ZD5cXG48L3RyPlxcbjwvdGJvZHk+XFxuPC90YWJsZT5cXG48cD5CZXNpZGVzIGV2ZW50cywgdGhlcmUmIzM5O3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgPGNvZGU+dGF1bnVzLm5hdmlnYXRlPC9jb2RlPiBtZXRob2QgYWxsb3dzIHlvdSB0byBuYXZpZ2F0ZSB0byBhIFVSTCB3aXRob3V0IHRoZSBuZWVkIGZvciBhIGh1bWFuIHRvIGNsaWNrIG9uIGFuIGFuY2hvciBsaW5rLiBUaGVuIHRoZXJlJiMzOTtzIDxjb2RlPnRhdW51cy5wYXJ0aWFsPC9jb2RlPiwgYW5kIHRoYXQgYWxsb3dzIHlvdSB0byByZW5kZXIgYW55IHBhcnRpYWwgdmlldyBvbiBhIERPTSBlbGVtZW50IG9mIHlvdXIgY2hvb3NpbmcsIGFuZCBpdCYjMzk7bGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSYjMzk7bGwgbmVlZCB0byBjb21lIHVwIHdpdGggdGhlIG1vZGVsIHlvdXJzZWxmLCB0aG91Z2guPC9wPlxcbjxwPkFzdG9uaXNoaW5nbHksIHRoZSBBUEkgaXMgZnVydGhlciBkb2N1bWVudGVkIGluIDxhIGhyZWY9XFxcIi9hcGlcXFwiPnRoZSBBUEkgZG9jdW1lbnRhdGlvbjwvYT4uPC9wPlxcbjxwPjxzdWI+PGEgaHJlZj1cXFwiI3RhYmxlLW9mLWNvbnRlbnRzXFxcIj48ZW0+KGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpPC9lbT48L2E+PC9zdWI+PC9wPlxcbjxoNCBpZD1cXFwiY2FjaGluZy1hbmQtcHJlZmV0Y2hpbmdcXFwiPkNhY2hpbmcgYW5kIFByZWZldGNoaW5nPC9oND5cXG48cD48YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlPC9hPiBwbGF5cyBhbiBpbXBvcnRhbnQgcm9sZSBpbiBUYXVudXMuIFRoYXQmIzM5O3Mgd2h5IHRoZSB5b3UgY2FuIHBlcmZvcm0gY2FjaGluZyBhbmQgcHJlZmV0Y2hpbmcgb24gdGhlIGNsaWVudC1zaWRlIGp1c3QgYnkgdHVybmluZyBvbiBhIHBhaXIgb2YgZmxhZ3MuIEJ1dCB3aGF0IGRvIHRoZXNlIGZsYWdzIGRvIGV4YWN0bHk/PC9wPlxcbjxwPldoZW4gdHVybmVkIG9uLCBieSBwYXNzaW5nIDxjb2RlPnsgY2FjaGU6IHRydWUgfTwvY29kZT4gYXMgdGhlIHRoaXJkIHBhcmFtZXRlciBmb3IgPGNvZGU+dGF1bnVzLm1vdW50PC9jb2RlPiwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcy4gV2hlbmV2ZXIgYSByb3V0ZSBuZWVkcyBhIG1vZGVsIGluIG9yZGVyIHRvIHJlbmRlciBhIHZpZXcsIGl0JiMzOTtsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24mIzM5O3QgaGF2ZSBhIGNvcHksIG9yIGlmIHRoYXQgY29weSBpcyBzdGFsZSA8ZW0+KGluIHRoaXMgY2FzZSwgb2xkZXIgdGhhbiA8Y29kZT4xNTwvY29kZT4gc2Vjb25kcyk8L2VtPiwgdGhlbiBhbiBBSkFYIHJlcXVlc3Qgd2lsbCBiZSBpc3N1ZWQgdG8gdGhlIHNlcnZlci4gT2YgY291cnNlLCB0aGUgZHVyYXRpb24gaXMgY29uZmlndXJhYmxlLiBJZiB5b3Ugd2FudCB0byB1c2UgYSB2YWx1ZSBvdGhlciB0aGFuIHRoZSBkZWZhdWx0LCB5b3Ugc2hvdWxkIHNldCA8Y29kZT5jYWNoZTwvY29kZT4gdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgPGNvZGU+dHJ1ZTwvY29kZT4uPC9wPlxcbjxwPlNpbmNlIFRhdW51cyB1bmRlcnN0YW5kcyB0aGF0IG5vdCBldmVyeSB2aWV3IG9wZXJhdGVzIHVuZGVyIHRoZSBzYW1lIGNvbnN0cmFpbnRzLCB5b3UmIzM5O3JlIGFsc28gYWJsZSB0byBzZXQgYSA8Y29kZT5jYWNoZTwvY29kZT4gZnJlc2huZXNzIGR1cmF0aW9uIGRpcmVjdGx5IGluIHlvdXIgcm91dGVzLiBUaGUgPGNvZGU+Y2FjaGU8L2NvZGU+IHByb3BlcnR5IGluIHJvdXRlcyBoYXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IHZhbHVlLjwvcD5cXG48cD5UaGVyZSYjMzk7cyBjdXJyZW50bHkgdHdvIGNhY2hpbmcgc3RvcmVzOiBhIHJhdyBpbi1tZW1vcnkgc3RvcmUsIGFuZCBhbiA8YSBocmVmPVxcXCJodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9BUEkvSW5kZXhlZERCX0FQSVxcXCI+SW5kZXhlZERCPC9hPiBzdG9yZS4gSW5kZXhlZERCIGlzIGFuIGVtYmVkZGVkIGRhdGFiYXNlIHNvbHV0aW9uLCBhbmQgeW91IGNhbiB0aGluayBvZiBpdCBsaWtlIGFuIGFzeW5jaHJvbm91cyB2ZXJzaW9uIG9mIDxjb2RlPmxvY2FsU3RvcmFnZTwvY29kZT4uIEl0IGhhcyA8YSBocmVmPVxcXCJodHRwOi8vY2FuaXVzZS5jb20vI2ZlYXQ9aW5kZXhlZGRiXFxcIj5zdXJwcmlzaW5nbHkgYnJvYWQgYnJvd3NlciBzdXBwb3J0PC9hPiwgYW5kIGluIHRoZSBjYXNlcyB3aGVyZSBpdCYjMzk7cyBub3Qgc3VwcG9ydGVkIHRoZW4gY2FjaGluZyBpcyBkb25lIHNvbGVseSBpbi1tZW1vcnkuPC9wPlxcbjxwPlRoZSBwcmVmZXRjaGluZyBtZWNoYW5pc20gaXMgYW4gaW50ZXJlc3Rpbmcgc3Bpbi1vZmYgb2YgY2FjaGluZywgYW5kIGl0IHJlcXVpcmVzIGNhY2hpbmcgdG8gYmUgZW5hYmxlZCBpbiBvcmRlciB0byB3b3JrLiBXaGVuZXZlciBodW1hbnMgaG92ZXIgb3ZlciBhIGxpbmssIG9yIHdoZW5ldmVyIHRoZXkgcHV0IHRoZWlyIGZpbmdlciBvbiBvbmUgb2YgdGhlbSA8ZW0+KHRoZSA8Y29kZT50b3VjaHN0YXJ0PC9jb2RlPiBldmVudCk8L2VtPiwgdGhlIHByZWZldGNoZXIgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIGZvciB0aGF0IGxpbmsuPC9wPlxcbjxwPklmIHRoZSByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5IHRoZW4gdGhlIHJlc3BvbnNlIHdpbGwgYmUgY2FjaGVkIGluIHRoZSBzYW1lIHdheSBhbnkgb3RoZXIgdmlldyB3b3VsZCBiZSBjYWNoZWQuIElmIHRoZSBodW1hbiBob3ZlcnMgb3ZlciBhbm90aGVyIGxpbmsgd2hpbGUgdGhlIHByZXZpb3VzIG9uZSBpcyBzdGlsbCBiZWluZyBwcmVmZXRjaGVkLCB0aGVuIHRoZSBvbGQgcmVxdWVzdCBpcyBhYm9ydGVkLCBhcyBub3QgdG8gZHJhaW4gdGhlaXIgPGVtPihwb3NzaWJseSBsaW1pdGVkKTwvZW0+IEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLjwvcD5cXG48cD5JZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJiMzOTtsbCBuYXZpZ2F0ZSB0byB0aGUgdmlldyBhcyBzb29uIGFzIHByZWZldGNoaW5nIGVuZHMsIHJhdGhlciB0aGFuIGZpcmluZyBhbm90aGVyIHJlcXVlc3QuIFRoaXMgaGVscHMgVGF1bnVzIHNhdmUgcHJlY2lvdXMgbWlsbGlzZWNvbmRzIHdoZW4gZGVhbGluZyB3aXRoIGxhdGVuY3ktc2Vuc2l0aXZlIG9wZXJhdGlvbnMuPC9wPlxcbjxwPlR1cm5pbmcgcHJlZmV0Y2hpbmcgb24gaXMgc2ltcGx5IGEgbWF0dGVyIG9mIHNldHRpbmcgPGNvZGU+cHJlZmV0Y2g8L2NvZGU+IHRvIDxjb2RlPnRydWU8L2NvZGU+IGluIHRoZSBvcHRpb25zIHBhc3NlZCB0byA8Y29kZT50YXVudXMubW91bnQ8L2NvZGU+LiBGb3IgYWRkaXRpb25hbCBpbnNpZ2h0cyBpbnRvIHRoZSBwZXJmb3JtYW5jZSBpbXByb3ZlbWVudHMgVGF1bnVzIGNhbiBvZmZlciwgaGVhZCBvdmVyIHRvIHRoZSA8YSBocmVmPVxcXCIvcGVyZm9ybWFuY2VcXFwiPlBlcmZvcm1hbmNlIE9wdGltaXphdGlvbnM8L2E+IGd1aWRlLjwvcD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG48aDEgaWQ9XFxcInRoZS1za3ktaXMtdGhlLWxpbWl0LVxcXCI+VGhlIHNreSBpcyB0aGUgbGltaXQhPC9oMT5cXG48cD5Zb3UmIzM5O3JlIG5vdyBmYW1pbGlhciB3aXRoIGhvdyBUYXVudXMgd29ya3Mgb24gYSBoaWdoLWxldmVsLiBZb3UgaGF2ZSBjb3ZlcmVkIGEgZGVjZW50IGFtb3VudCBvZiBncm91bmQsIGJ1dCB5b3Ugc2hvdWxkbiYjMzk7dCBzdG9wIHRoZXJlLjwvcD5cXG48dWw+XFxuPGxpPkxlYXJuIG1vcmUgYWJvdXQgPGEgaHJlZj1cXFwiL2FwaVxcXCI+dGhlIEFQSSBUYXVudXMgaGFzPC9hPiB0byBvZmZlcjwvbGk+XFxuPGxpPkdvIHRocm91Z2ggdGhlIDxhIGhyZWY9XFxcIi9wZXJmb3JtYW5jZVxcXCI+cGVyZm9ybWFuY2Ugb3B0aW1pemF0aW9uIHRpcHM8L2E+LiBZb3UgbWF5IGxlYXJuIHNvbWV0aGluZyBuZXchPC9saT5cXG48bGk+PGVtPkZhbWlsaWFyaXplIHlvdXJzZWxmIHdpdGggdGhlIHdheXMgb2YgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQ8L2VtPjx1bD5cXG48bGk+SmVyZW15IEtlaXRoIGVudW5jaWF0ZXMgPGEgaHJlZj1cXFwiaHR0cHM6Ly9hZGFjdGlvLmNvbS9qb3VybmFsLzc3MDZcXFwiPiZxdW90O0JlIHByb2dyZXNzaXZlJnF1b3Q7PC9hPjwvbGk+XFxuPGxpPkNocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIDxhIGhyZWY9XFxcImh0dHA6Ly9pY2FudC5jby51ay9hcnRpY2xlcy9wcmFnbWF0aWMtcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQvXFxcIj4mcXVvdDtQcmFnbWF0aWMgcHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQmcXVvdDs8L2E+PC9saT5cXG48bGk+SmFrZSBBcmNoaWJhbGQgZXhwbGFpbnMgaG93IDxhIGhyZWY9XFxcImh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXFwiPiZxdW90O1Byb2dyZXNzaXZlIGVuaGFuY2VtZW50IGlzIGZhc3RlciZxdW90OzwvYT48L2xpPlxcbjxsaT5JIGJsb2dnZWQgYWJvdXQgaG93IHdlIHNob3VsZCA8YSBocmVmPVxcXCJodHRwOi8vcG9ueWZvby5jb20vc3RvcC1icmVha2luZy10aGUtd2ViXFxcIj4mcXVvdDtTdG9wIEJyZWFraW5nIHRoZSBXZWImcXVvdDs8L2E+PC9saT5cXG48bGk+R3VpbGxlcm1vIFJhdWNoIGFyZ3VlcyBmb3IgPGEgaHJlZj1cXFwiaHR0cDovL3JhdWNoZy5jb20vMjAxNC83LXByaW5jaXBsZXMtb2YtcmljaC13ZWItYXBwbGljYXRpb25zL1xcXCI+JnF1b3Q7NyBQcmluY2lwbGVzIG9mIFJpY2ggV2ViIEFwcGxpY2F0aW9ucyZxdW90OzwvYT48L2xpPlxcbjxsaT5BYXJvbiBHdXN0YWZzb24gd3JpdGVzIDxhIGhyZWY9XFxcImh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxcIj4mcXVvdDtVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50JnF1b3Q7PC9hPjwvbGk+XFxuPGxpPk9yZGUgU2F1bmRlcnMgZ2l2ZXMgaGlzIHBvaW50IG9mIHZpZXcgaW4gPGEgaHJlZj1cXFwiaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcXCI+JnF1b3Q7UHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZSZxdW90OzwvYT48L2xpPlxcbjwvdWw+XFxuPC9saT5cXG48bGk+U2lmdCB0aHJvdWdoIHRoZSA8YSBocmVmPVxcXCIvY29tcGxlbWVudHNcXFwiPmNvbXBsZW1lbnRhcnkgbW9kdWxlczwvYT4uIFlvdSBtYXkgZmluZCBzb21ldGhpbmcgeW91IGhhZG4mIzM5O3QgdGhvdWdodCBvZiE8L2xpPlxcbjwvdWw+XFxuPHA+QWxzbywgZ2V0IGludm9sdmVkITwvcD5cXG48dWw+XFxuPGxpPkZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCA8YSBocmVmPVxcXCJodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy5iZXZhY3F1YS5pby9wdWxsc1xcXCI+c2VuZCBzb21lIHB1bGwgcmVxdWVzdHM8L2E+IHRvIGltcHJvdmUgdGhlc2UgZ3VpZGVzITwvbGk+XFxuPGxpPlNlZSBzb21ldGhpbmcsIHNheSBzb21ldGhpbmchIElmIHlvdSBkZXRlY3QgYSBidWcsIDxhIGhyZWY9XFxcImh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzL2lzc3Vlcy9uZXdcXFwiPnBsZWFzZSBjcmVhdGUgYW4gaXNzdWU8L2E+ITwvbGk+XFxuPC91bD5cXG48cD48c3ViPjxhIGhyZWY9XFxcIiN0YWJsZS1vZi1jb250ZW50c1xcXCI+PGVtPihiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKTwvZW0+PC9hPjwvc3ViPjwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIEdldHRpbmcgU3RhcnRlZFxcblxcbiAgICBUYXVudXMgaXMgYSBzaGFyZWQtcmVuZGVyaW5nIE1WQyBlbmdpbmUgZm9yIE5vZGUuanMsIGFuZCBpdCdzIF91cCB0byB5b3UgaG93IHRvIHVzZSBpdF8uIEluIGZhY3QsIGl0IG1pZ2h0IGJlIGEgZ29vZCBpZGVhIGZvciB5b3UgdG8gKipzZXQgdXAganVzdCB0aGUgc2VydmVyLXNpZGUgYXNwZWN0IGZpcnN0KiosIGFzIHRoYXQnbGwgdGVhY2ggeW91IGhvdyBpdCB3b3JrcyBldmVuIHdoZW4gSmF2YVNjcmlwdCBuZXZlciBnZXRzIHRvIHRoZSBjbGllbnQuXFxuXFxuICAgICMgVGFibGUgb2YgQ29udGVudHNcXG5cXG4gICAgLSBbSG93IGl0IHdvcmtzXSgjaG93LWl0LXdvcmtzKVxcbiAgICAtIFtJbnN0YWxsaW5nIFRhdW51c10oI2luc3RhbGxpbmctdGF1bnVzKVxcbiAgICAtIFtTZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZV0oI3NldHRpbmctdXAtdGhlLXNlcnZlci1zaWRlKVxcbiAgICAgIC0gW1lvdXIgZmlyc3Qgcm91dGVdKCN5b3VyLWZpcnN0LXJvdXRlKVxcbiAgICAgIC0gW0NyZWF0aW5nIGEgbGF5b3V0XSgjY3JlYXRpbmctYS1sYXlvdXQpXFxuICAgICAgLSBbVXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lXSgjdXNpbmctamFkZS1hcy15b3VyLXZpZXctZW5naW5lKVxcbiAgICAgIC0gW1Rocm93aW5nIGluIGEgY29udHJvbGxlcl0oI3Rocm93aW5nLWluLWEtY29udHJvbGxlcilcXG4gICAgLSBbVGF1bnVzIGluIHRoZSBjbGllbnRdKCN0YXVudXMtaW4tdGhlLWNsaWVudClcXG4gICAgICAtIFtVc2luZyB0aGUgVGF1bnVzIENMSV0oI3VzaW5nLXRoZS10YXVudXMtY2xpKVxcbiAgICAgIC0gW0Jvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlcl0oI2Jvb3RpbmctdXAtdGhlLWNsaWVudC1zaWRlLXJvdXRlcilcXG4gICAgICAtIFtBZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJdKCNhZGRpbmctZnVuY3Rpb25hbGl0eS1pbi1hLWNsaWVudC1zaWRlLWNvbnRyb2xsZXIpXFxuICAgICAgLSBbQ29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdF0oI2NvbXBpbGluZy15b3VyLWNsaWVudC1zaWRlLWphdmFzY3JpcHQpXFxuICAgICAgLSBbVXNpbmcgdGhlIGNsaWVudC1zaWRlIFRhdW51cyBBUEldKCN1c2luZy10aGUtY2xpZW50LXNpZGUtdGF1bnVzLWFwaSlcXG4gICAgICAtIFtDYWNoaW5nIGFuZCBQcmVmZXRjaGluZ10oI2NhY2hpbmctYW5kLXByZWZldGNoaW5nKVxcbiAgICAtIFtUaGUgc2t5IGlzIHRoZSBsaW1pdCFdKCN0aGUtc2t5LWlzLXRoZS1saW1pdC0pXFxuXFxuICAgICMgSG93IGl0IHdvcmtzXFxuXFxuICAgIFRhdW51cyBmb2xsb3dzIGEgc2ltcGxlIGJ1dCAqKnByb3ZlbioqIHNldCBvZiBydWxlcy5cXG5cXG4gICAgLSBEZWZpbmUgYSBgZnVuY3Rpb24obW9kZWwpYCBmb3IgZWFjaCB5b3VyIHZpZXdzXFxuICAgIC0gUHV0IHRoZXNlIHZpZXdzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudFxcbiAgICAtIERlZmluZSByb3V0ZXMgZm9yIHlvdXIgYXBwbGljYXRpb25cXG4gICAgLSBQdXQgdGhvc2Ugcm91dGVzIGluIGJvdGggdGhlIHNlcnZlciBhbmQgdGhlIGNsaWVudFxcbiAgICAtIEVuc3VyZSByb3V0ZSBtYXRjaGVzIHdvcmsgdGhlIHNhbWUgd2F5IG9uIGJvdGggZW5kc1xcbiAgICAtIENyZWF0ZSBzZXJ2ZXItc2lkZSBjb250cm9sbGVycyB0aGF0IHlpZWxkIHRoZSBtb2RlbCBmb3IgeW91ciB2aWV3c1xcbiAgICAtIENyZWF0ZSBjbGllbnQtc2lkZSBjb250cm9sbGVycyBpZiB5b3UgbmVlZCB0byBhZGQgY2xpZW50LXNpZGUgZnVuY3Rpb25hbGl0eSB0byBhIHBhcnRpY3VsYXIgdmlld1xcbiAgICAtIEZvciB0aGUgZmlyc3QgcmVxdWVzdCwgYWx3YXlzIHJlbmRlciB2aWV3cyBvbiB0aGUgc2VydmVyLXNpZGVcXG4gICAgLSBXaGVuIHJlbmRlcmluZyBhIHZpZXcgb24gdGhlIHNlcnZlci1zaWRlLCBpbmNsdWRlIHRoZSBmdWxsIGxheW91dCBhcyB3ZWxsIVxcbiAgICAtIE9uY2UgdGhlIGNsaWVudC1zaWRlIGNvZGUga2lja3MgaW4sICoqaGlqYWNrIGxpbmsgY2xpY2tzKiogYW5kIG1ha2UgQUpBWCByZXF1ZXN0cyBpbnN0ZWFkXFxuICAgIC0gV2hlbiB5b3UgZ2V0IHRoZSBKU09OIG1vZGVsIGJhY2ssIHJlbmRlciB2aWV3cyBvbiB0aGUgY2xpZW50LXNpZGVcXG4gICAgLSBJZiB0aGUgYGhpc3RvcnlgIEFQSSBpcyB1bmF2YWlsYWJsZSwgZmFsbCBiYWNrIHRvIGdvb2Qgb2xkIHJlcXVlc3QtcmVzcG9uc2UuICoqRG9uJ3QgY29uZnVzZSB5b3VyIGh1bWFucyB3aXRoIG9ic2N1cmUgaGFzaCByb3V0ZXJzISoqXFxuXFxuICAgIEknbGwgc3RlcCB5b3UgdGhyb3VnaCB0aGVzZSwgYnV0IHJhdGhlciB0aGFuIGxvb2tpbmcgYXQgaW1wbGVtZW50YXRpb24gZGV0YWlscywgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZSBzdGVwcyB5b3UgbmVlZCB0byB0YWtlIGluIG9yZGVyIHRvIG1ha2UgdGhpcyBmbG93IGhhcHBlbi5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyBJbnN0YWxsaW5nIFRhdW51c1xcblxcbiAgICBGaXJzdCBvZmYsIHlvdSdsbCBuZWVkIHRvIGNob29zZSBhIEhUVFAgc2VydmVyIGZyYW1ld29yayBmb3IgeW91ciBhcHBsaWNhdGlvbi4gQXQgdGhlIG1vbWVudCBUYXVudXMgc3VwcG9ydHMgb25seSBhIGNvdXBsZSBvZiBIVFRQIGZyYW1ld29ya3MsIGJ1dCBtb3JlIG1heSBiZSBhZGRlZCBpZiB0aGV5IGFyZSBwb3B1bGFyIGVub3VnaC5cXG5cXG4gICAgLSBbRXhwcmVzc11bNl0sIHRocm91Z2ggW3RhdW51cy1leHByZXNzXVsxXVxcbiAgICAtIFtIYXBpXVs3XSwgdGhyb3VnaCBbdGF1bnVzLWhhcGldWzJdIGFuZCB0aGUgW2hhcGlpZnldWzNdIHRyYW5zZm9ybVxcblxcbiAgICA+IElmIHlvdSdyZSBtb3JlIG9mIGEgX1xcXCJydW1tYWdlIHRocm91Z2ggc29tZW9uZSBlbHNlJ3MgY29kZVxcXCJfIHR5cGUgb2YgZGV2ZWxvcGVyLCB5b3UgbWF5IGZlZWwgY29tZm9ydGFibGUgW2dvaW5nIHRocm91Z2ggdGhpcyB3ZWJzaXRlJ3Mgc291cmNlIGNvZGVdWzRdLCB3aGljaCB1c2VzIHRoZSBbSGFwaV1bN10gZmxhdm9yIG9mIFRhdW51cy4gQWx0ZXJuYXRpdmVseSB5b3UgY2FuIGxvb2sgYXQgdGhlIHNvdXJjZSBjb2RlIGZvciBbcG9ueWZvby5jb21dWzVdLCB3aGljaCBpcyAqKmEgbW9yZSBhZHZhbmNlZCB1c2UtY2FzZSoqIHVuZGVyIHRoZSBbRXhwcmVzc11bNl0gZmxhdm9yLiBPciwgeW91IGNvdWxkIGp1c3Qga2VlcCBvbiByZWFkaW5nIHRoaXMgcGFnZSwgdGhhdCdzIG9rYXkgdG9vLlxcblxcbiAgICBPbmNlIHlvdSd2ZSBzZXR0bGVkIGZvciBlaXRoZXIgW0V4cHJlc3NdWzZdIG9yIFtIYXBpXVs3XSB5b3UnbGwgYmUgYWJsZSB0byBwcm9jZWVkLiBGb3IgdGhlIHB1cnBvc2VzIG9mIHRoaXMgZ3VpZGUsIHdlJ2xsIHVzZSBbRXhwcmVzc11bNl0uIFN3aXRjaGluZyBiZXR3ZWVuIG9uZSBvZiB0aGUgZGlmZmVyZW50IEhUVFAgZmxhdm9ycyBpcyBzdHJpa2luZ2x5IGVhc3ksIHRob3VnaC5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBTZXR0aW5nIHVwIHRoZSBzZXJ2ZXItc2lkZVxcblxcbiAgICBOYXR1cmFsbHksIHlvdSdsbCBuZWVkIHRvIGluc3RhbGwgYWxsIG9mIHRoZSBmb2xsb3dpbmcgbW9kdWxlcyBmcm9tIGBucG1gIHRvIGdldCBzdGFydGVkLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciBnZXR0aW5nLXN0YXJ0ZWRcXG4gICAgY2QgZ2V0dGluZy1zdGFydGVkXFxuICAgIG5wbSBpbml0XFxuICAgIG5wbSBpbnN0YWxsIC0tc2F2ZSB0YXVudXMgdGF1bnVzLWV4cHJlc3MgZXhwcmVzc1xcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5wbSBpbml0YCBvdXRwdXRdWzMwXVxcblxcbiAgICBMZXQncyBidWlsZCBvdXIgYXBwbGljYXRpb24gc3RlcC1ieS1zdGVwLCBhbmQgSSdsbCB3YWxrIHlvdSB0aHJvdWdoIHRoZW0gYXMgd2UgZ28gYWxvbmcuIEZpcnN0IG9mIGFsbCwgeW91J2xsIG5lZWQgdGhlIGZhbW91cyBgYXBwLmpzYCBmaWxlLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCBhcHAuanNcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgcHJvYmFibHkgYSBnb29kIGlkZWEgdG8gcHV0IHNvbWV0aGluZyBpbiB5b3VyIGBhcHAuanNgIGZpbGUsIGxldCdzIGRvIHRoYXQgbm93LlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7fTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBBbGwgYHRhdW51cy1leHByZXNzYCByZWFsbHkgZG9lcyBpcyBhZGQgYSBidW5jaCBvZiByb3V0ZXMgdG8geW91ciBFeHByZXNzIGBhcHBgLiBZb3Ugc2hvdWxkIG5vdGUgdGhhdCBhbnkgbWlkZGxld2FyZSBhbmQgQVBJIHJvdXRlcyBzaG91bGQgcHJvYmFibHkgY29tZSBiZWZvcmUgdGhlIGB0YXVudXNFeHByZXNzYCBpbnZvY2F0aW9uLiBZb3UnbGwgcHJvYmFibHkgYmUgdXNpbmcgYSBjYXRjaC1hbGwgdmlldyByb3V0ZSB0aGF0IHJlbmRlcnMgYSBfXFxcIk5vdCBGb3VuZFxcXCJfIHZpZXcsIGJsb2NraW5nIGFueSByb3V0aW5nIGJleW9uZCB0aGF0IHJvdXRlLlxcblxcbiAgICBJZiB5b3Ugd2VyZSB0byBydW4gdGhlIGFwcGxpY2F0aW9uIG5vdyB5b3Ugd291bGQgZ2V0IGEgZnJpZW5kbHkgcmVtaW5lZCBmcm9tIFRhdW51cyBsZXR0aW5nIHlvdSBrbm93IHRoYXQgeW91IGZvcmdvdCB0byBkZWNsYXJlIGFueSB2aWV3IHJvdXRlcy4gU2lsbHkgeW91IVxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcFxcbiAgICBgYGBcXG5cXG4gICAgIVtTY3JlZW5zaG90IHdpdGggYG5vZGUgYXBwYCBvdXRwdXRdWzMxXVxcblxcbiAgICBUaGUgYG9wdGlvbnNgIG9iamVjdCBwYXNzZWQgdG8gYHRhdW51c0V4cHJlc3NgIGxldCdzIHlvdSBjb25maWd1cmUgVGF1bnVzLiBJbnN0ZWFkIG9mIGRpc2N1c3NpbmcgZXZlcnkgc2luZ2xlIGNvbmZpZ3VyYXRpb24gb3B0aW9uIHlvdSBjb3VsZCBzZXQgaGVyZSwgbGV0J3MgZGlzY3VzcyB3aGF0IG1hdHRlcnM6IHRoZSBfcmVxdWlyZWQgY29uZmlndXJhdGlvbl8uIFRoZXJlJ3MgdHdvIG9wdGlvbnMgdGhhdCB5b3UgbXVzdCBzZXQgaWYgeW91IHdhbnQgeW91ciBUYXVudXMgYXBwbGljYXRpb24gdG8gbWFrZSBhbnkgc2Vuc2UuXFxuXFxuICAgIC0gYHJvdXRlc2Agc2hvdWxkIGJlIGFuIGFycmF5IG9mIHZpZXcgcm91dGVzXFxuICAgIC0gYGxheW91dGAgc2hvdWxkIGJlIGEgZnVuY3Rpb24gdGhhdCB0YWtlcyBhIHNpbmdsZSBgbW9kZWxgIGFyZ3VtZW50IGFuZCByZXR1cm5zIGFuIGVudGlyZSBIVE1MIGRvY3VtZW50XFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgWW91ciBmaXJzdCByb3V0ZVxcblxcbiAgICBSb3V0ZXMgbmVlZCB0byBiZSBwbGFjZWQgaW4gaXRzIG93biBkZWRpY2F0ZWQgbW9kdWxlLCBzbyB0aGF0IHlvdSBjYW4gcmV1c2UgaXQgbGF0ZXIgb24gKip3aGVuIHNldHRpbmcgdXAgY2xpZW50LXNpZGUgcm91dGluZyoqLiBMZXQncyBjcmVhdGUgdGhhdCBtb2R1bGUgYW5kIGFkZCBhIHJvdXRlIHRvIGl0LlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0b3VjaCByb3V0ZXMuanNcXG4gICAgYGBgXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBbXFxuICAgICAgeyByb3V0ZTogJy8nLCBhY3Rpb246ICdob21lL2luZGV4JyB9XFxuICAgIF07XFxuICAgIGBgYFxcblxcbiAgICBFYWNoIGl0ZW0gaW4gdGhlIGV4cG9ydGVkIGFycmF5IGlzIGEgcm91dGUuIEluIHRoaXMgY2FzZSwgd2Ugb25seSBoYXZlIHRoZSBgL2Agcm91dGUgd2l0aCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbi4gVGF1bnVzIGZvbGxvd3MgdGhlIHdlbGwga25vd24gW2NvbnZlbnRpb24gb3ZlciBjb25maWd1cmF0aW9uIHBhdHRlcm5dWzhdLCB3aGljaCBtYWRlIFtSdWJ5IG9uIFJhaWxzXVs5XSBmYW1vdXMuIF9NYXliZSBvbmUgZGF5IFRhdW51cyB3aWxsIGJlIGZhbW91cyB0b28hXyBCeSBjb252ZW50aW9uLCBUYXVudXMgd2lsbCBhc3N1bWUgdGhhdCB0aGUgYGhvbWUvaW5kZXhgIGFjdGlvbiB1c2VzIHRoZSBgaG9tZS9pbmRleGAgY29udHJvbGxlciBhbmQgcmVuZGVycyB0aGUgYGhvbWUvaW5kZXhgIHZpZXcuIE9mIGNvdXJzZSwgX2FsbCBvZiB0aGF0IGNhbiBiZSBjaGFuZ2VkIHVzaW5nIGNvbmZpZ3VyYXRpb25fLlxcblxcbiAgICBUaW1lIHRvIGdvIGJhY2sgdG8gYGFwcC5qc2AgYW5kIHVwZGF0ZSB0aGUgYG9wdGlvbnNgIG9iamVjdC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIEl0J3MgaW1wb3J0YW50IHRvIGtub3cgdGhhdCBpZiB5b3Ugb21pdCB0aGUgY3JlYXRpb24gb2YgYSBjb250cm9sbGVyIHRoZW4gVGF1bnVzIHdpbGwgc2tpcCB0aGF0IHN0ZXAsIGFuZCByZW5kZXIgdGhlIHZpZXcgcGFzc2luZyBpdCB3aGF0ZXZlciB0aGUgZGVmYXVsdCBtb2RlbCBpcyBfKG1vcmUgb24gdGhhdCBbaW4gdGhlIEFQSSBkb2N1bWVudGF0aW9uXVsxOF0sIGJ1dCBpdCBkZWZhdWx0cyB0byBge31gKV8uXFxuXFxuICAgIEhlcmUncyB3aGF0IHlvdSdkIGdldCBpZiB5b3UgYXR0ZW1wdGVkIHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYXQgdGhpcyBwb2ludC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBjdXJsIGxvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIHJlc3VsdHNdWzMyXVxcblxcbiAgICBUdXJucyBvdXQgeW91J3JlIG1pc3NpbmcgYSBsb3Qgb2YgdGhpbmdzISBUYXVudXMgaXMgcXVpdGUgbGVuaWVudCBhbmQgaXQnbGwgdHJ5IGl0cyBiZXN0IHRvIGxldCB5b3Uga25vdyB3aGF0IHlvdSBtaWdodCBiZSBtaXNzaW5nLCB0aG91Z2guIEFwcGFyZW50bHkgeW91IGRvbid0IGhhdmUgYSBsYXlvdXQsIGEgc2VydmVyLXNpZGUgY29udHJvbGxlciwgb3IgZXZlbiBhIHZpZXchIF9UaGF0J3Mgcm91Z2guX1xcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENyZWF0aW5nIGEgbGF5b3V0XFxuXFxuICAgIExldCdzIGFsc28gY3JlYXRlIGEgbGF5b3V0LiBGb3IgdGhlIHB1cnBvc2VzIG9mIG1ha2luZyBvdXIgd2F5IHRocm91Z2ggdGhpcyBndWlkZSwgaXQnbGwganVzdCBiZSBhIHBsYWluIEphdmFTY3JpcHQgZnVuY3Rpb24uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRvdWNoIGxheW91dC5qc1xcbiAgICBgYGBcXG5cXG4gICAgTm90ZSB0aGF0IHRoZSBgcGFydGlhbGAgcHJvcGVydHkgaW4gdGhlIGBtb2RlbGAgXyhhcyBzZWVuIGJlbG93KV8gaXMgY3JlYXRlZCBvbiB0aGUgZmx5IGFmdGVyIHJlbmRlcmluZyBwYXJ0aWFsIHZpZXdzLiBUaGUgbGF5b3V0IGZ1bmN0aW9uIHdlJ2xsIGJlIHVzaW5nIGhlcmUgZWZmZWN0aXZlbHkgbWVhbnMgX1xcXCJ1c2UgdGhlIGZvbGxvd2luZyBjb21iaW5hdGlvbiBvZiBwbGFpbiB0ZXh0IGFuZCB0aGUgKioobWF5YmUgSFRNTCkqKiBwYXJ0aWFsIHZpZXdcXFwiXy5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCkge1xcbiAgICAgIHJldHVybiAnVGhpcyBpcyB0aGUgcGFydGlhbDogXFxcIicgKyBtb2RlbC5wYXJ0aWFsICsgJ1xcXCInO1xcbiAgICB9O1xcbiAgICBgYGBcXG5cXG4gICAgT2YgY291cnNlLCBpZiB5b3Ugd2VyZSBkZXZlbG9waW5nIGEgcmVhbCBhcHBsaWNhdGlvbiwgdGhlbiB5b3UgcHJvYmFibHkgd291bGRuJ3Qgd2FudCB0byB3cml0ZSB2aWV3cyBhcyBKYXZhU2NyaXB0IGZ1bmN0aW9ucyBhcyB0aGF0J3MgdW5wcm9kdWN0aXZlLCBjb25mdXNpbmcsIGFuZCBoYXJkIHRvIG1haW50YWluLiBXaGF0IHlvdSBjb3VsZCBkbyBpbnN0ZWFkLCBpcyB1c2UgYSB2aWV3LXJlbmRlcmluZyBlbmdpbmUgdGhhdCBhbGxvd3MgeW91IHRvIGNvbXBpbGUgeW91ciB2aWV3IHRlbXBsYXRlcyBpbnRvIEphdmFTY3JpcHQgZnVuY3Rpb25zLlxcblxcbiAgICAtIFtNdXN0YWNoZV1bMTBdIGlzIGEgdGVtcGxhdGluZyBlbmdpbmUgdGhhdCBjYW4gY29tcGlsZSB5b3VyIHZpZXdzIGludG8gcGxhaW4gZnVuY3Rpb25zLCB1c2luZyBhIHN5bnRheCB0aGF0J3MgbWluaW1hbGx5IGRpZmZlcmVudCBmcm9tIEhUTUxcXG4gICAgLSBbSmFkZV1bMTFdIGlzIGFub3RoZXIgb3B0aW9uLCBhbmQgaXQgaGFzIGEgdGVyc2Ugc3ludGF4IHdoZXJlIHNwYWNpbmcgbWF0dGVycyBidXQgdGhlcmUncyBubyBjbG9zaW5nIHRhZ3NcXG4gICAgLSBUaGVyZSdzIG1hbnkgbW9yZSBhbHRlcm5hdGl2ZXMgbGlrZSBbTW96aWxsYSdzIE51bmp1Y2tzXVsxMl0sIFtIYW5kbGViYXJzXVsxM10sIGFuZCBbRUpTXVsxNF0uXFxuXFxuICAgIFJlbWVtYmVyIHRvIGFkZCB0aGUgYGxheW91dGAgdW5kZXIgdGhlIGBvcHRpb25zYCBvYmplY3QgcGFzc2VkIHRvIGB0YXVudXNFeHByZXNzYCFcXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vbGF5b3V0JylcXG4gICAgfTtcXG5cXG4gICAgdGF1bnVzRXhwcmVzcyh0YXVudXMsIGFwcCwgb3B0aW9ucyk7XFxuICAgIGFwcC5saXN0ZW4oMzAwMCk7XFxuICAgIGBgYFxcblxcbiAgICBIZXJlJ3Mgd2hhdCB5b3UnZCBnZXQgaWYgeW91IHJhbiB0aGUgYXBwbGljYXRpb24gYXQgdGhpcyBwb2ludC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHAgJlxcbiAgICBjdXJsIGxvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzNdXFxuXFxuICAgIEF0IHRoaXMgcG9pbnQgd2UgaGF2ZSBhIGxheW91dCwgYnV0IHdlJ3JlIHN0aWxsIG1pc3NpbmcgdGhlIHBhcnRpYWwgdmlldyBhbmQgdGhlIHNlcnZlci1zaWRlIGNvbnRyb2xsZXIuIFdlIGNhbiBkbyB3aXRob3V0IHRoZSBjb250cm9sbGVyLCBidXQgaGF2aW5nIG5vIHZpZXdzIGlzIGtpbmQgb2YgcG9pbnRsZXNzIHdoZW4geW91J3JlIHRyeWluZyB0byBnZXQgYW4gTVZDIGVuZ2luZSB1cCBhbmQgcnVubmluZywgcmlnaHQ/XFxuXFxuICAgIFlvdSdsbCBmaW5kIHRvb2xzIHJlbGF0ZWQgdG8gdmlldyB0ZW1wbGF0aW5nIGluIHRoZSBbY29tcGxlbWVudGFyeSBtb2R1bGVzIHNlY3Rpb25dWzE1XS4gSWYgeW91IGRvbid0IHByb3ZpZGUgYSBgbGF5b3V0YCBwcm9wZXJ0eSBhdCBhbGwsIFRhdW51cyB3aWxsIHJlbmRlciB5b3VyIG1vZGVsIGluIGEgcmVzcG9uc2UgYnkgd3JhcHBpbmcgaXQgaW4gYDxwcmU+YCBhbmQgYDxjb2RlPmAgdGFncywgd2hpY2ggbWF5IGFpZCB5b3Ugd2hlbiBnZXR0aW5nIHN0YXJ0ZWQuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgSmFkZSBhcyB5b3VyIHZpZXcgZW5naW5lXFxuXFxuICAgIExldCdzIGdvIGFoZWFkIGFuZCB1c2UgSmFkZSBhcyB0aGUgdmlldy1yZW5kZXJpbmcgZW5naW5lIG9mIGNob2ljZSBmb3Igb3VyIHZpZXdzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCB2aWV3cy9ob21lXFxuICAgIHRvdWNoIHZpZXdzL2hvbWUvaW5kZXguamFkZVxcbiAgICBgYGBcXG5cXG4gICAgU2luY2Ugd2UncmUganVzdCBnZXR0aW5nIHN0YXJ0ZWQsIHRoZSB2aWV3IHdpbGwganVzdCBoYXZlIHNvbWUgYmFzaWMgc3RhdGljIGNvbnRlbnQsIGFuZCB0aGF0J3MgaXQuXFxuXFxuICAgIGBgYGphZGVcXG4gICAgcCBIZWxsbyBUYXVudXMhXFxuICAgIGBgYFxcblxcbiAgICBOZXh0IHlvdSdsbCB3YW50IHRvIGNvbXBpbGUgdGhlIHZpZXcgaW50byBhIGZ1bmN0aW9uLiBUbyBkbyB0aGF0IHlvdSBjYW4gdXNlIFtqYWR1bV1bMTZdLCBhIHNwZWNpYWxpemVkIEphZGUgY29tcGlsZXIgdGhhdCBwbGF5cyB3ZWxsIHdpdGggVGF1bnVzIGJ5IGJlaW5nIGF3YXJlIG9mIGByZXF1aXJlYCBzdGF0ZW1lbnRzLCBhbmQgdGh1cyBzYXZpbmcgYnl0ZXMgd2hlbiBpdCBjb21lcyB0byBjbGllbnQtc2lkZSByZW5kZXJpbmcuIExldCdzIGluc3RhbGwgaXQgZ2xvYmFsbHksIGZvciB0aGUgc2FrZSBvZiB0aGlzIGV4ZXJjaXNlIF8oeW91IHNob3VsZCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB5b3UncmUgZGV2ZWxvcGluZyBhIHJlYWwgYXBwbGljYXRpb24pXy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1nbG9iYWwgamFkdW1cXG4gICAgYGBgXFxuXFxuICAgIFRvIGNvbXBpbGUgZXZlcnkgdmlldyBpbiB0aGUgYHZpZXdzYCBkaXJlY3RvcnkgaW50byBmdW5jdGlvbnMgdGhhdCB3b3JrIHdlbGwgd2l0aCBUYXVudXMsIHlvdSBjYW4gdXNlIHRoZSBjb21tYW5kIGJlbG93LiBUaGUgYC0tb3V0cHV0YCBmbGFnIGluZGljYXRlcyB3aGVyZSB5b3Ugd2FudCB0aGUgdmlld3MgdG8gYmUgcGxhY2VkLiBXZSBjaG9zZSB0byB1c2UgYC5iaW5gIGJlY2F1c2UgdGhhdCdzIHdoZXJlIFRhdW51cyBleHBlY3RzIHlvdXIgY29tcGlsZWQgdmlld3MgdG8gYmUgYnkgZGVmYXVsdC4gQnV0IHNpbmNlIFRhdW51cyBmb2xsb3dzIHRoZSBbY29udmVudGlvbiBvdmVyIGNvbmZpZ3VyYXRpb25dWzE3XSBhcHByb2FjaCwgeW91IGNvdWxkIGNoYW5nZSB0aGF0IGlmIHlvdSB3YW50ZWQgdG8uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIGphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG4gICAgYGBgXFxuXFxuICAgIENvbmdyYXR1bGF0aW9ucyEgWW91ciBmaXJzdCB2aWV3IGlzIG5vdyBvcGVyYXRpb25hbCBhbmQgYnVpbHQgdXNpbmcgYSBmdWxsLWZsZWRnZWQgdGVtcGxhdGluZyBlbmdpbmUhIEFsbCB0aGF0J3MgbGVmdCBpcyBmb3IgeW91IHRvIHJ1biB0aGUgYXBwbGljYXRpb24gYW5kIHZpc2l0IGl0IG9uIHBvcnQgYDMwMDBgLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBub2RlIGFwcCAmXFxuICAgIG9wZW4gaHR0cDovL2xvY2FsaG9zdDozMDAwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzRdXFxuXFxuICAgIEdyYW50ZWQsIHlvdSBzaG91bGQgX3Byb2JhYmx5XyBtb3ZlIHRoZSBsYXlvdXQgaW50byBhIEphZGUgXyhhbnkgdmlldyBlbmdpbmUgd2lsbCBkbylfIHRlbXBsYXRlIGFzIHdlbGwuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVGhyb3dpbmcgaW4gYSBjb250cm9sbGVyXFxuXFxuICAgIENvbnRyb2xsZXJzIGFyZSBpbmRlZWQgb3B0aW9uYWwsIGJ1dCBhbiBhcHBsaWNhdGlvbiB0aGF0IHJlbmRlcnMgZXZlcnkgdmlldyB1c2luZyB0aGUgc2FtZSBtb2RlbCB3b24ndCBnZXQgeW91IHZlcnkgZmFyLiBDb250cm9sbGVycyBhbGxvdyB5b3UgdG8gaGFuZGxlIHRoZSByZXF1ZXN0IGFuZCBwdXQgdG9nZXRoZXIgdGhlIG1vZGVsIHRvIGJlIHVzZWQgd2hlbiBzZW5kaW5nIGEgcmVzcG9uc2UuIENvbnRyYXJ5IHRvIHdoYXQgbW9zdCBmcmFtZXdvcmtzIHByb3Bvc2UsIFRhdW51cyBleHBlY3RzIGV2ZXJ5IGFjdGlvbiB0byBoYXZlIGl0cyBvd24gaW5kaXZpZHVhbCBjb250cm9sbGVyLiBTaW5jZSBOb2RlLmpzIG1ha2VzIGl0IGVhc3kgdG8gaW1wb3J0IGNvbXBvbmVudHMsIHRoaXMgc2V0dXAgaGVscHMgeW91IGtlZXAgeW91ciBjb2RlIG1vZHVsYXIgd2hpbGUgc3RpbGwgYmVpbmcgYWJsZSB0byByZXVzZSBsb2dpYyBieSBzaGFyaW5nIG1vZHVsZXMgYWNyb3NzIGRpZmZlcmVudCBjb250cm9sbGVycy4gTGV0J3MgY3JlYXRlIGEgY29udHJvbGxlciBmb3IgdGhlIGBob21lL3ZpZXdgIGFjdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbWtkaXIgLXAgY29udHJvbGxlcnMvaG9tZVxcbiAgICB0b3VjaCBjb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuICAgIGBgYFxcblxcbiAgICBUaGUgY29udHJvbGxlciBtb2R1bGUgc2hvdWxkIG1lcmVseSBleHBvcnQgYSBmdW5jdGlvbi4gX1N0YXJ0ZWQgbm90aWNpbmcgdGhlIHBhdHRlcm4/XyBUaGUgc2lnbmF0dXJlIGZvciB0aGUgY29udHJvbGxlciBpcyB0aGUgc2FtZSBzaWduYXR1cmUgYXMgdGhhdCBvZiBhbnkgb3RoZXIgbWlkZGxld2FyZSBwYXNzZWQgdG8gW0V4cHJlc3NdWzZdIF8ob3IgYW55IHJvdXRlIGhhbmRsZXIgcGFzc2VkIHRvIFtIYXBpXVs3XSBpbiB0aGUgY2FzZSBvZiBgdGF1bnVzLWhhcGlgKV8uXFxuXFxuICAgIEFzIHlvdSBtYXkgaGF2ZSBub3RpY2VkIGluIHRoZSBleGFtcGxlcyBzbyBmYXIsIHlvdSBoYXZlbid0IGV2ZW4gc2V0IGEgZG9jdW1lbnQgdGl0bGUgZm9yIHlvdXIgSFRNTCBwYWdlcyEgVHVybnMgb3V0LCB0aGVyZSdzIGEgZmV3IG1vZGVsIHByb3BlcnRpZXMgXyh2ZXJ5IGZldylfIHRoYXQgVGF1bnVzIGlzIGF3YXJlIG9mLiBPbmUgb2YgdGhvc2UgaXMgdGhlIGB0aXRsZWAgcHJvcGVydHksIGFuZCBpdCdsbCBiZSB1c2VkIHRvIGNoYW5nZSB0aGUgYGRvY3VtZW50LnRpdGxlYCBpbiB5b3VyIHBhZ2VzIHdoZW4gbmF2aWdhdGluZyB0aHJvdWdoIHRoZSBjbGllbnQtc2lkZS4gS2VlcCBpbiBtaW5kIHRoYXQgYW55dGhpbmcgdGhhdCdzIG5vdCBpbiB0aGUgYG1vZGVsYCBwcm9wZXJ0eSB3b24ndCBiZSB0cmFzbWl0dGVkIHRvIHRoZSBjbGllbnQsIGFuZCB3aWxsIGp1c3QgYmUgYWNjZXNzaWJsZSB0byB0aGUgbGF5b3V0LlxcblxcbiAgICBIZXJlIGlzIG91ciBuZXdmYW5nbGVkIGBob21lL2luZGV4YCBjb250cm9sbGVyLiBBcyB5b3UnbGwgbm90aWNlLCBpdCBkb2Vzbid0IGRpc3J1cHQgYW55IG9mIHRoZSB0eXBpY2FsIEV4cHJlc3MgZXhwZXJpZW5jZSwgYnV0IG1lcmVseSBidWlsZHMgdXBvbiBpdC4gV2hlbiBgbmV4dGAgaXMgY2FsbGVkLCB0aGUgVGF1bnVzIHZpZXctcmVuZGVyaW5nIGhhbmRsZXIgd2lsbCBraWNrIGluLCBhbmQgcmVuZGVyIHRoZSB2aWV3IHVzaW5nIHRoZSBpbmZvcm1hdGlvbiB0aGF0IHdhcyBhc3NpZ25lZCB0byBgcmVzLnZpZXdNb2RlbGAuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAocmVxLCByZXMsIG5leHQpIHtcXG4gICAgICByZXMudmlld01vZGVsID0ge1xcbiAgICAgICAgbW9kZWw6IHtcXG4gICAgICAgICAgdGl0bGU6ICdXZWxjb21lIEhvbWUsIFRhdW51cyEnXFxuICAgICAgICB9XFxuICAgICAgfTtcXG4gICAgICBuZXh0KCk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIHJlbHlpbmcgb24gdGhlIGNsaWVudC1zaWRlIGNoYW5nZXMgdG8geW91ciBwYWdlIGluIG9yZGVyIHRvIHNldCB0aGUgdmlldyB0aXRsZSBfd291bGRuJ3QgYmUgcHJvZ3Jlc3NpdmVfLCBhbmQgdGh1cyBbaXQgd291bGQgYmUgcmVhbGx5LCBfcmVhbGx5XyBiYWRdWzE3XS4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgbGF5b3V0IHRvIHVzZSB3aGF0ZXZlciBgdGl0bGVgIGhhcyBiZWVuIHBhc3NlZCB0byB0aGUgbW9kZWwuIEluIGZhY3QsIGxldCdzIGdvIGJhY2sgdG8gdGhlIGRyYXdpbmcgYm9hcmQgYW5kIG1ha2UgdGhlIGxheW91dCBpbnRvIGEgSmFkZSB0ZW1wbGF0ZSFcXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgcm0gbGF5b3V0LmpzXFxuICAgIHRvdWNoIHZpZXdzL2xheW91dC5qYWRlXFxuICAgIGphZHVtIHZpZXdzLyoqIC0tb3V0cHV0IC5iaW5cXG4gICAgYGBgXFxuXFxuICAgIFlvdSBzaG91bGQgYWxzbyByZW1lbWJlciB0byB1cGRhdGUgdGhlIGBhcHAuanNgIG1vZHVsZSBvbmNlIGFnYWluIVxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0YXVudXMgPSByZXF1aXJlKCd0YXVudXMnKTtcXG4gICAgdmFyIHRhdW51c0V4cHJlc3MgPSByZXF1aXJlKCd0YXVudXMtZXhwcmVzcycpO1xcbiAgICB2YXIgZXhwcmVzcyA9IHJlcXVpcmUoJ2V4cHJlc3MnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL3JvdXRlcycpLFxcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi8uYmluL3ZpZXdzL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIHRhdW51c0V4cHJlc3ModGF1bnVzLCBhcHAsIG9wdGlvbnMpO1xcbiAgICBhcHAubGlzdGVuKDMwMDApO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIGAhPWAgc3ludGF4IGJlbG93IG1lYW5zIHRoYXQgd2hhdGV2ZXIgaXMgaW4gdGhlIHZhbHVlIGFzc2lnbmVkIHRvIHRoZSBlbGVtZW50IHdvbid0IGJlIGVzY2FwZWQuIFRoYXQncyBva2F5IGJlY2F1c2UgYHBhcnRpYWxgIGlzIGEgdmlldyB3aGVyZSBKYWRlIGVzY2FwZWQgYW55dGhpbmcgdGhhdCBuZWVkZWQgZXNjYXBpbmcsIGJ1dCB3ZSB3b3VsZG4ndCB3YW50IEhUTUwgdGFncyB0byBiZSBlc2NhcGVkIVxcblxcbiAgICBgYGBqYWRlXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1haW4hPXBhcnRpYWxcXG4gICAgYGBgXFxuXFxuICAgIEJ5IHRoZSB3YXksIGRpZCB5b3Uga25vdyB0aGF0IGA8aHRtbD5gLCBgPGhlYWQ+YCwgYW5kIGA8Ym9keT5gIGFyZSBhbGwgb3B0aW9uYWwgaW4gSFRNTCA1LCBhbmQgdGhhdCB5b3UgY2FuIHNhZmVseSBvbWl0IHRoZW0gaW4geW91ciBIVE1MPyBPZiBjb3Vyc2UsIHJlbmRlcmluZyBlbmdpbmVzIHdpbGwgc3RpbGwgaW5zZXJ0IHRob3NlIGVsZW1lbnRzIGF1dG9tYXRpY2FsbHkgaW50byB0aGUgRE9NIGZvciB5b3UhIF9Ib3cgY29vbCBpcyB0aGF0P19cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbm9kZSBhcHBcXG4gICAgYGBgXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIGBub2RlIGFwcGAgb3V0cHV0XVszNV1cXG5cXG4gICAgWW91IGNhbiBub3cgdmlzaXQgYGxvY2FsaG9zdDozMDAwYCB3aXRoIHlvdXIgZmF2b3JpdGUgd2ViIGJyb3dzZXIgYW5kIHlvdSdsbCBub3RpY2UgdGhhdCB0aGUgdmlldyByZW5kZXJzIGFzIHlvdSdkIGV4cGVjdC4gVGhlIHRpdGxlIHdpbGwgYmUgcHJvcGVybHkgc2V0LCBhbmQgYSBgPG1haW4+YCBlbGVtZW50IHdpbGwgaGF2ZSB0aGUgY29udGVudHMgb2YgeW91ciB2aWV3LlxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBhcHBsaWNhdGlvbiBydW5uaW5nIG9uIEdvb2dsZSBDaHJvbWVdWzM2XVxcblxcbiAgICBUaGF0J3MgaXQsIG5vdyB5b3VyIHZpZXcgaGFzIGEgdGl0bGUuIE9mIGNvdXJzZSwgdGhlcmUncyBub3RoaW5nIHN0b3BwaW5nIHlvdSBmcm9tIGFkZGluZyBkYXRhYmFzZSBjYWxscyB0byBmZXRjaCBiaXRzIGFuZCBwaWVjZXMgb2YgdGhlIG1vZGVsIGJlZm9yZSBpbnZva2luZyBgbmV4dGAgdG8gcmVuZGVyIHRoZSB2aWV3LlxcblxcbiAgICBUaGVuIHRoZXJlJ3MgYWxzbyB0aGUgY2xpZW50LXNpZGUgYXNwZWN0IG9mIHNldHRpbmcgdXAgVGF1bnVzLiBMZXQncyBzZXQgaXQgdXAgYW5kIHNlZSBob3cgaXQgb3BlbnMgdXAgb3VyIHBvc3NpYmlsaXRpZXMuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGF1bnVzIGluIHRoZSBjbGllbnRcXG5cXG4gICAgWW91IGFscmVhZHkga25vdyBob3cgdG8gc2V0IHVwIHRoZSBiYXNpY3MgZm9yIHNlcnZlci1zaWRlIHJlbmRlcmluZywgYW5kIHlvdSBrbm93IHRoYXQgeW91IHNob3VsZCBbY2hlY2sgb3V0IHRoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdIHRvIGdldCBhIG1vcmUgdGhvcm91Z2ggdW5kZXJzdGFuZGluZyBvZiB0aGUgcHVibGljIGludGVyZmFjZSBvbiBUYXVudXMsIGFuZCB3aGF0IGl0IGVuYWJsZXMgeW91IHRvIGRvLlxcblxcbiAgICBUaGUgd2F5IFRhdW51cyB3b3JrcyBvbiB0aGUgY2xpZW50LXNpZGUgaXMgc28gdGhhdCBvbmNlIHlvdSBzZXQgaXQgdXAsIGl0IHdpbGwgaGlqYWNrIGxpbmsgY2xpY2tzIGFuZCB1c2UgQUpBWCB0byBmZXRjaCBtb2RlbHMgYW5kIHJlbmRlciB0aG9zZSB2aWV3cyBpbiB0aGUgY2xpZW50LiBJZiB0aGUgSmF2YVNjcmlwdCBjb2RlIGZhaWxzIHRvIGxvYWQsIF9vciBpZiBpdCBoYXNuJ3QgbG9hZGVkIHlldCBkdWUgdG8gYSBzbG93IGNvbm5lY3Rpb24gc3VjaCBhcyB0aG9zZSBpbiB1bnN0YWJsZSBtb2JpbGUgbmV0d29ya3NfLCB0aGUgcmVndWxhciBsaW5rIHdvdWxkIGJlIGZvbGxvd2VkIGluc3RlYWQgYW5kIG5vIGhhcm0gd291bGQgYmUgdW5sZWFzaGVkIHVwb24gdGhlIGh1bWFuLCBleGNlcHQgdGhleSB3b3VsZCBnZXQgYSBzbGlnaHRseSBsZXNzIGZhbmN5IGV4cGVyaWVuY2UuXFxuXFxuICAgIFNldHRpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGludm9sdmVzIGEgZmV3IGRpZmZlcmVudCBzdGVwcy4gRmlyc3RseSwgd2UnbGwgaGF2ZSB0byBjb21waWxlIHRoZSBhcHBsaWNhdGlvbidzIHdpcmluZyBfKHRoZSByb3V0ZXMgYW5kIEphdmFTY3JpcHQgdmlldyBmdW5jdGlvbnMpXyBpbnRvIHNvbWV0aGluZyB0aGUgYnJvd3NlciB1bmRlcnN0YW5kcy4gVGhlbiwgeW91J2xsIGhhdmUgdG8gbW91bnQgVGF1bnVzIG9uIHRoZSBjbGllbnQtc2lkZSwgcGFzc2luZyB0aGUgd2lyaW5nIHNvIHRoYXQgaXQga25vd3Mgd2hpY2ggcm91dGVzIGl0IHNob3VsZCByZXNwb25kIHRvLCBhbmQgd2hpY2ggb3RoZXJzIGl0IHNob3VsZCBtZXJlbHkgaWdub3JlLiBPbmNlIHRoYXQncyBvdXQgb2YgdGhlIHdheSwgY2xpZW50LXNpZGUgcm91dGluZyB3b3VsZCBiZSBzZXQgdXAuXFxuXFxuICAgIEFzIHN1Z2FyIGNvYXRpbmcgb24gdG9wIG9mIHRoYXQsIHlvdSBtYXkgYWRkIGNsaWVudC1zaWRlIGZ1bmN0aW9uYWxpdHkgdXNpbmcgY29udHJvbGxlcnMuIFRoZXNlIGNvbnRyb2xsZXJzIHdvdWxkIGJlIGV4ZWN1dGVkIGV2ZW4gaWYgdGhlIHZpZXcgd2FzIHJlbmRlcmVkIG9uIHRoZSBzZXJ2ZXItc2lkZS4gVGhleSBjYW4gYWNjZXNzIHRoZSBUYXVudXMgQVBJIGRpcmVjdGx5LCBpbiBjYXNlIHlvdSBuZWVkIHRvIG5hdmlnYXRlIHRvIGFub3RoZXIgdmlldyBpbiBzb21lIHdheSBvdGhlciB0aGFuIGJ5IGhhdmluZyBodW1hbnMgY2xpY2sgb24gYW5jaG9yIHRhZ3MuIFRoZSBBUEksIGFzIHlvdSdsbCBsZWFybiwgd2lsbCBhbHNvIGxldCB5b3UgcmVuZGVyIHBhcnRpYWwgdmlld3MgdXNpbmcgdGhlIHBvd2VyZnVsIFRhdW51cyBlbmdpbmUsIGxpc3RlbiBmb3IgZXZlbnRzIHRoYXQgbWF5IG9jY3VyIGF0IGtleSBzdGFnZXMgb2YgdGhlIHZpZXctcmVuZGVyaW5nIHByb2Nlc3MsIGFuZCBldmVuIGludGVyY2VwdCBBSkFYIHJlcXVlc3RzIGJsb2NraW5nIHRoZW0gYmVmb3JlIHRoZXkgZXZlciBoYXBwZW4uXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgVXNpbmcgdGhlIFRhdW51cyBDTElcXG5cXG4gICAgVGF1bnVzIGNvbWVzIHdpdGggYSBDTEkgdGhhdCBjYW4gYmUgdXNlZCB0byB3aXJlIHlvdXIgTm9kZS5qcyByb3V0ZXMgYW5kIHZpZXdzIGludG8gdGhlIGNsaWVudC1zaWRlLiBUaGUgc2FtZSBDTEkgY2FuIGJlIHVzZWQgdG8gd2lyZSB1cCB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlcnMgYXMgd2VsbC4gVGhlIG1haW4gcmVhc29uIHdoeSB0aGUgVGF1bnVzIENMSSBleGlzdHMgaXMgc28gdGhhdCB5b3UgZG9uJ3QgaGF2ZSB0byBgcmVxdWlyZWAgZXZlcnkgc2luZ2xlIHZpZXcgYW5kIGNvbnRyb2xsZXIsIHVuZG9pbmcgYSBsb3Qgb2YgdGhlIHdvcmsgdGhhdCB3YXMgcHV0IGludG8gY29kZSByZXVzZS4gSnVzdCBsaWtlIHdlIGRpZCB3aXRoIGBqYWR1bWAgZWFybGllciwgd2UnbGwgaW5zdGFsbCB0aGUgYHRhdW51c2AgQ0xJIGdsb2JhbGx5IGZvciB0aGUgc2FrZSBvZiBleGVyY2lzaW5nLCBidXQgd2UgdW5kZXJzdGFuZCB0aGF0IHJlbHlpbmcgb24gZ2xvYmFsbHkgaW5zdGFsbGVkIG1vZHVsZXMgaXMgaW5zdWZmaWNpZW50IGZvciBwcm9kdWN0aW9uLWdyYWRlIGFwcGxpY2F0aW9ucy5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1nbG9iYWwgdGF1bnVzXFxuICAgIGBgYFxcblxcbiAgICBCZWZvcmUgeW91IGNhbiB1c2UgdGhlIENMSSwgeW91IHNob3VsZCBtb3ZlIHRoZSByb3V0ZSBkZWZpbml0aW9ucyB0byBgY29udHJvbGxlcnMvcm91dGVzLmpzYC4gVGhhdCdzIHdoZXJlIFRhdW51cyBleHBlY3RzIHRoZW0gdG8gYmUuIElmIHlvdSB3YW50IHRvIHBsYWNlIHRoZW0gc29tZXRoaW5nIGVsc2UsIFt0aGUgQVBJIGRvY3VtZW50YXRpb24gY2FuIGhlbHAgeW91XVsxOF0uXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG12IHJvdXRlcy5qcyBjb250cm9sbGVycy9yb3V0ZXMuanNcXG4gICAgYGBgXFxuXFxuICAgIFNpbmNlIHlvdSBtb3ZlZCB0aGUgcm91dGVzIHlvdSBzaG91bGQgYWxzbyB1cGRhdGUgdGhlIGByZXF1aXJlYCBzdGF0ZW1lbnQgaW4gdGhlIGBhcHAuanNgIG1vZHVsZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB0YXVudXNFeHByZXNzID0gcmVxdWlyZSgndGF1bnVzLWV4cHJlc3MnKTtcXG4gICAgdmFyIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyk7XFxuICAgIHZhciBhcHAgPSBleHByZXNzKCk7XFxuICAgIHZhciBvcHRpb25zID0ge1xcbiAgICAgIHJvdXRlczogcmVxdWlyZSgnLi9jb250cm9sbGVycy9yb3V0ZXMnKSxcXG4gICAgICBsYXlvdXQ6IHJlcXVpcmUoJy4vLmJpbi92aWV3cy9sYXlvdXQnKVxcbiAgICB9O1xcblxcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBDTEkgaXMgdGVyc2UgaW4gYm90aCBpdHMgaW5wdXRzIGFuZCBpdHMgb3V0cHV0cy4gSWYgeW91IHJ1biBpdCB3aXRob3V0IGFueSBhcmd1bWVudHMgaXQnbGwgcHJpbnQgb3V0IHRoZSB3aXJpbmcgbW9kdWxlLCBhbmQgaWYgeW91IHdhbnQgdG8gcGVyc2lzdCBpdCB5b3Ugc2hvdWxkIHByb3ZpZGUgdGhlIGAtLW91dHB1dGAgZmxhZy4gSW4gdHlwaWNhbCBbY29udmVudGlvbi1vdmVyLWNvbmZpZ3VyYXRpb25dWzhdIGZhc2hpb24sIHRoZSBDTEkgd2lsbCBkZWZhdWx0IHRvIGluZmVycmluZyB5b3VyIHZpZXdzIGFyZSBsb2NhdGVkIGluIGAuYmluL3ZpZXdzYCBhbmQgdGhhdCB5b3Ugd2FudCB0aGUgd2lyaW5nIG1vZHVsZSB0byBiZSBwbGFjZWQgaW4gYC5iaW4vd2lyaW5nLmpzYCwgYnV0IHlvdSdsbCBiZSBhYmxlIHRvIGNoYW5nZSB0aGF0IGlmIGl0IGRvZXNuJ3QgbWVldCB5b3VyIG5lZWRzLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXRcXG4gICAgYGBgXFxuXFxuICAgIEF0IHRoaXMgcG9pbnQgaW4gb3VyIGV4YW1wbGUsIHRoZSBDTEkgc2hvdWxkIGNyZWF0ZSBhIGAuYmluL3dpcmluZy5qc2AgZmlsZSB3aXRoIHRoZSBjb250ZW50cyBkZXRhaWxlZCBiZWxvdy4gQXMgeW91IGNhbiBzZWUsIGV2ZW4gaWYgYHRhdW51c2AgaXMgYW4gYXV0b21hdGVkIGNvZGUtZ2VuZXJhdGlvbiB0b29sLCBpdCdzIG91dHB1dCBpcyBhcyBodW1hbiByZWFkYWJsZSBhcyBhbnkgb3RoZXIgbW9kdWxlLlxcblxcbiAgICBgYGBqc1xcbiAgICAndXNlIHN0cmljdCc7XFxuXFxuICAgIHZhciB0ZW1wbGF0ZXMgPSB7XFxuICAgICAgJ2hvbWUvaW5kZXgnOiByZXF1aXJlKCcuL3ZpZXdzL2hvbWUvaW5kZXguanMnKSxcXG4gICAgICAnbGF5b3V0JzogcmVxdWlyZSgnLi92aWV3cy9sYXlvdXQuanMnKVxcbiAgICB9O1xcblxcbiAgICB2YXIgY29udHJvbGxlcnMgPSB7XFxuICAgIH07XFxuXFxuICAgIHZhciByb3V0ZXMgPSB7XFxuICAgICAgJy8nOiB7XFxuICAgICAgICBhY3Rpb246ICdob21lL2luZGV4J1xcbiAgICAgIH1cXG4gICAgfTtcXG5cXG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7XFxuICAgICAgdGVtcGxhdGVzOiB0ZW1wbGF0ZXMsXFxuICAgICAgY29udHJvbGxlcnM6IGNvbnRyb2xsZXJzLFxcbiAgICAgIHJvdXRlczogcm91dGVzXFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgdGF1bnVzYCBvdXRwdXRdWzM3XVxcblxcbiAgICBOb3RlIHRoYXQgdGhlIGBjb250cm9sbGVyc2Agb2JqZWN0IGlzIGVtcHR5IGJlY2F1c2UgeW91IGhhdmVuJ3QgY3JlYXRlZCBhbnkgX2NsaWVudC1zaWRlIGNvbnRyb2xsZXJzXyB5ZXQuIFdlIGNyZWF0ZWQgc2VydmVyLXNpZGUgY29udHJvbGxlcnMgYnV0IHRob3NlIGRvbid0IGhhdmUgYW55IGVmZmVjdCBpbiB0aGUgY2xpZW50LXNpZGUsIGJlc2lkZXMgZGV0ZXJtaW5pbmcgd2hhdCBnZXRzIHNlbnQgdG8gdGhlIGNsaWVudC5cXG5cXG4gICAgVGhlIENMSSBjYW4gYmUgZW50aXJlbHkgaWdub3JlZCwgeW91IGNvdWxkIHdyaXRlIHRoZXNlIGRlZmluaXRpb25zIGJ5IHlvdXJzZWxmLCBidXQgeW91IHdvdWxkIGhhdmUgdG8gcmVtZW1iZXIgdG8gdXBkYXRlIHRoaXMgZmlsZSB3aGVuZXZlciB5b3UgYWRkLCBjaGFuZ2UsIG9yIHJlbW92ZSBhIHZpZXcsIGEgY2xpZW50LXNpZGUgY29udHJvbGxlciwgb3IgYSByb3V0ZS4gRG9pbmcgdGhhdCB3b3VsZCBiZSBjdW1iZXJzb21lLCBhbmQgdGhlIENMSSBzb2x2ZXMgdGhhdCBwcm9ibGVtIGZvciB1cyBhdCB0aGUgZXhwZW5zZSBvZiBvbmUgYWRkaXRpb25hbCBidWlsZCBzdGVwLlxcblxcbiAgICBEdXJpbmcgZGV2ZWxvcG1lbnQsIHlvdSBjYW4gYWxzbyBhZGQgdGhlIGAtLXdhdGNoYCBmbGFnLCB3aGljaCB3aWxsIHJlYnVpbGQgdGhlIHdpcmluZyBtb2R1bGUgaWYgYSByZWxldmFudCBmaWxlIGNoYW5nZXMuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIHRhdW51cyAtLW91dHB1dCAtLXdhdGNoXFxuICAgIGBgYFxcblxcbiAgICBJZiB5b3UncmUgdXNpbmcgSGFwaSBpbnN0ZWFkIG9mIEV4cHJlc3MsIHlvdSdsbCBhbHNvIG5lZWQgdG8gcGFzcyBpbiB0aGUgYGhhcGlpZnlgIHRyYW5zZm9ybSBzbyB0aGF0IHJvdXRlcyBnZXQgY29udmVydGVkIGludG8gc29tZXRoaW5nIHRoZSBjbGllbnQtc2lkZSByb3V0aW5nIG1vZHVsZSB1bmRlcnN0YW5kLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICB0YXVudXMgLS1vdXRwdXQgLS10cmFuc2Zvcm0gaGFwaWlmeVxcbiAgICBgYGBcXG5cXG4gICAgTm93IHRoYXQgeW91IHVuZGVyc3RhbmQgaG93IHRvIHVzZSB0aGUgQ0xJIG9yIGJ1aWxkIHRoZSB3aXJpbmcgbW9kdWxlIG9uIHlvdXIgb3duLCBib290aW5nIHVwIFRhdW51cyBvbiB0aGUgY2xpZW50LXNpZGUgd2lsbCBiZSBhbiBlYXN5IHRoaW5nIHRvIGRvIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIEJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIHJvdXRlclxcblxcbiAgICBPbmNlIHdlIGhhdmUgdGhlIHdpcmluZyBtb2R1bGUsIGJvb3RpbmcgdXAgdGhlIGNsaWVudC1zaWRlIGVuZ2luZSBpcyBwcmV0dHkgZWFzeS4gVGF1bnVzIHN1Z2dlc3RzIHlvdSB1c2UgYGNsaWVudC9qc2AgdG8ga2VlcCBhbGwgb2YgeW91ciBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IGxvZ2ljLCBidXQgdGhhdCBpcyB1cCB0byB5b3UgdG9vLiBGb3IgdGhlIHNha2Ugb2YgdGhpcyBndWlkZSwgbGV0J3Mgc3RpY2sgdG8gdGhlIGNvbnZlbnRpb25zLlxcblxcbiAgICBgYGBzaGVsbFxcbiAgICBta2RpciAtcCBjbGllbnQvanNcXG4gICAgdG91Y2ggY2xpZW50L2pzL21haW4uanNcXG4gICAgYGBgXFxuXFxuICAgIFRoZSBgbWFpbmAgbW9kdWxlIHdpbGwgYmUgdXNlZCBhcyB0aGUgX2VudHJ5IHBvaW50XyBvZiB5b3VyIGFwcGxpY2F0aW9uIG9uIHRoZSBjbGllbnQtc2lkZS4gSGVyZSB5b3UnbGwgbmVlZCB0byBpbXBvcnQgYHRhdW51c2AsIHRoZSB3aXJpbmcgbW9kdWxlIHdlJ3ZlIGp1c3QgYnVpbHQsIGFuZCBhIHJlZmVyZW5jZSB0byB0aGUgRE9NIGVsZW1lbnQgd2hlcmUgeW91IGFyZSByZW5kZXJpbmcgeW91ciBwYXJ0aWFsIHZpZXdzLiBPbmNlIHlvdSBoYXZlIGFsbCB0aGF0LCB5b3UgY2FuIGludm9rZSBgdGF1bnVzLm1vdW50YC5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICB2YXIgdGF1bnVzID0gcmVxdWlyZSgndGF1bnVzJyk7XFxuICAgIHZhciB3aXJpbmcgPSByZXF1aXJlKCcuLi8uLi8uYmluL3dpcmluZycpO1xcbiAgICB2YXIgbWFpbiA9IGRvY3VtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdtYWluJylbMF07XFxuXFxuICAgIHRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xcbiAgICBgYGBcXG5cXG4gICAgVGhlIG1vdW50cG9pbnQgd2lsbCBzZXQgdXAgdGhlIGNsaWVudC1zaWRlIFRhdW51cyByb3V0ZXIgYW5kIGZpcmUgdGhlIGNsaWVudC1zaWRlIHZpZXcgY29udHJvbGxlciBmb3IgdGhlIHZpZXcgdGhhdCBoYXMgYmVlbiByZW5kZXJlZCBpbiB0aGUgc2VydmVyLXNpZGUuIFdoZW5ldmVyIGFuIGFuY2hvciBsaW5rIGlzIGNsaWNrZWQsIFRhdW51cyB3aWxsIGJlIGFibGUgdG8gaGlqYWNrIHRoYXQgY2xpY2sgYW5kIHJlcXVlc3QgdGhlIG1vZGVsIHVzaW5nIEFKQVgsIGJ1dCBvbmx5IGlmIGl0IG1hdGNoZXMgYSB2aWV3IHJvdXRlLiBPdGhlcndpc2UgdGhlIGxpbmsgd2lsbCBiZWhhdmUganVzdCBsaWtlIGFueSBub3JtYWwgbGluayB3b3VsZC5cXG5cXG4gICAgQnkgZGVmYXVsdCwgdGhlIG1vdW50cG9pbnQgd2lsbCBpc3N1ZSBhbiBBSkFYIHJlcXVlc3QgZm9yIHRoZSB2aWV3IG1vZGVsIG9mIHRoZSBzZXJ2ZXItc2lkZSByZW5kZXJlZCB2aWV3LiBUaGlzIGlzIGFraW4gdG8gd2hhdCBkZWRpY2F0ZWQgY2xpZW50LXNpZGUgcmVuZGVyaW5nIGZyYW1ld29ya3Mgc3VjaCBhcyBBbmd1bGFySlMgZG8sIHdoZXJlIHZpZXdzIGFyZSBvbmx5IHJlbmRlcmVkIGFmdGVyIGFsbCB0aGUgSmF2YVNjcmlwdCBoYXMgYmVlbiBkb3dubG9hZGVkLCBwYXJzZWQsIGFuZCBleGVjdXRlZC4gRXhjZXB0IFRhdW51cyBwcm92aWRlcyBodW1hbi1yZWFkYWJsZSBjb250ZW50IGZhc3RlciwgYmVmb3JlIHRoZSBKYXZhU2NyaXB0IGV2ZW4gYmVnaW5zIGRvd25sb2FkaW5nLCBhbHRob3VnaCBpdCB3b24ndCBiZSBmdW5jdGlvbmFsIHVudGlsIHRoZSBjbGllbnQtc2lkZSBjb250cm9sbGVyIHJ1bnMuXFxuXFxuICAgIEFuIGFsdGVybmF0aXZlIGlzIHRvIGlubGluZSB0aGUgdmlldyBtb2RlbCBhbG9uZ3NpZGUgdGhlIHZpZXdzIGluIGEgYDxzY3JpcHQgdHlwZT0ndGV4dC90YXVudXMnPmAgdGFnLCBidXQgdGhpcyB0ZW5kcyB0byBzbG93IGRvd24gdGhlIGluaXRpYWwgcmVzcG9uc2UgKG1vZGVscyBhcmUgX3R5cGljYWxseSBsYXJnZXJfIHRoYW4gdGhlIHJlc3VsdGluZyB2aWV3cykuXFxuXFxuICAgIEEgdGhpcmQgc3RyYXRlZ3kgaXMgdGhhdCB5b3UgcmVxdWVzdCB0aGUgbW9kZWwgYXN5bmNocm9ub3VzbHkgb3V0c2lkZSBvZiBUYXVudXMsIGFsbG93aW5nIHlvdSB0byBmZXRjaCBib3RoIHRoZSB2aWV3IG1vZGVsIGFuZCBUYXVudXMgaXRzZWxmIGNvbmN1cnJlbnRseSwgYnV0IHRoYXQncyBoYXJkZXIgdG8gc2V0IHVwLlxcblxcbiAgICBUaGUgdGhyZWUgYm9vdGluZyBzdHJhdGVnaWVzIGFyZSBleHBsYWluZWQgaW4gW3RoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdIGFuZCBmdXJ0aGVyIGRpc2N1c3NlZCBpbiBbdGhlIG9wdGltaXphdGlvbiBndWlkZV1bMjVdLiBGb3Igbm93LCB0aGUgZGVmYXVsdCBzdHJhdGVneSBfKGAnYXV0bydgKV8gc2hvdWxkIHN1ZmZpY2UuIEl0IGZldGNoZXMgdGhlIHZpZXcgbW9kZWwgdXNpbmcgYW4gQUpBWCByZXF1ZXN0IHJpZ2h0IGFmdGVyIFRhdW51cyBsb2Fkcy5cXG5cXG4gICAgPHN1Yj5bXyhiYWNrIHRvIHRhYmxlIG9mIGNvbnRlbnRzKV9dKCN0YWJsZS1vZi1jb250ZW50cyk8L3N1Yj5cXG5cXG4gICAgIyMjIyBBZGRpbmcgZnVuY3Rpb25hbGl0eSBpbiBhIGNsaWVudC1zaWRlIGNvbnRyb2xsZXJcXG5cXG4gICAgQ2xpZW50LXNpZGUgY29udHJvbGxlcnMgcnVuIHdoZW5ldmVyIGEgdmlldyBpcyByZW5kZXJlZCwgZXZlbiBpZiBpdCdzIGEgcGFydGlhbC4gVGhlIGNvbnRyb2xsZXIgaXMgcGFzc2VkIHRoZSBgbW9kZWxgLCBjb250YWluaW5nIHRoZSBtb2RlbCB0aGF0IHdhcyB1c2VkIHRvIHJlbmRlciB0aGUgdmlldzsgdGhlIGByb3V0ZWAsIGJyb2tlbiBkb3duIGludG8gaXRzIGNvbXBvbmVudHM7IGFuZCB0aGUgYGNvbnRhaW5lcmAsIHdoaWNoIGlzIHdoYXRldmVyIERPTSBlbGVtZW50IHRoZSB2aWV3IHdhcyByZW5kZXJlZCBpbnRvLlxcblxcbiAgICBUaGVzZSBjb250cm9sbGVycyBhcmUgZW50aXJlbHkgb3B0aW9uYWwsIHdoaWNoIG1ha2VzIHNlbnNlIHNpbmNlIHdlJ3JlIHByb2dyZXNzaXZlbHkgZW5oYW5jaW5nIHRoZSBhcHBsaWNhdGlvbjogaXQgbWlnaHQgbm90IGV2ZW4gYmUgbmVjZXNzYXJ5ISBMZXQncyBhZGQgc29tZSBjbGllbnQtc2lkZSBmdW5jdGlvbmFsaXR5IHRvIHRoZSBleGFtcGxlIHdlJ3ZlIGJlZW4gYnVpbGRpbmcuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lXFxuICAgIHRvdWNoIGNsaWVudC9qcy9jb250cm9sbGVycy9ob21lL2luZGV4LmpzXFxuICAgIGBgYFxcblxcbiAgICBHdWVzcyB3aGF0PyBUaGUgY29udHJvbGxlciBzaG91bGQgYmUgYSBtb2R1bGUgd2hpY2ggZXhwb3J0cyBhIGZ1bmN0aW9uLiBUaGF0IGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIHdoZW5ldmVyIHRoZSB2aWV3IGlzIHJlbmRlcmVkLiBGb3IgdGhlIHNha2Ugb2Ygc2ltcGxpY2l0eSB3ZSdsbCBqdXN0IHByaW50IHRoZSBhY3Rpb24gYW5kIHRoZSBtb2RlbCB0byB0aGUgY29uc29sZS4gSWYgdGhlcmUncyBvbmUgcGxhY2Ugd2hlcmUgeW91J2Qgd2FudCB0byBlbmhhbmNlIHRoZSBleHBlcmllbmNlLCBjbGllbnQtc2lkZSBjb250cm9sbGVycyBhcmUgd2hlcmUgeW91IHdhbnQgdG8gcHV0IHlvdXIgY29kZS5cXG5cXG4gICAgYGBganNcXG4gICAgJ3VzZSBzdHJpY3QnO1xcblxcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChtb2RlbCwgY29udGFpbmVyLCByb3V0ZSkge1xcbiAgICAgIGNvbnNvbGUubG9nKCdSZW5kZXJlZCB2aWV3ICVzIHVzaW5nIG1vZGVsOlxcXFxuJXMnLCByb3V0ZS5hY3Rpb24sIEpTT04uc3RyaW5naWZ5KG1vZGVsLCBudWxsLCAyKSk7XFxuICAgIH07XFxuICAgIGBgYFxcblxcbiAgICBTaW5jZSB3ZSB3ZXJlbid0IHVzaW5nIHRoZSBgLS13YXRjaGAgZmxhZyBmcm9tIHRoZSBUYXVudXMgQ0xJLCB5b3UnbGwgaGF2ZSB0byByZWNvbXBpbGUgdGhlIHdpcmluZyBhdCB0aGlzIHBvaW50LCBzbyB0aGF0IHRoZSBjb250cm9sbGVyIGdldHMgYWRkZWQgdG8gdGhhdCBtYW5pZmVzdC5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgdGF1bnVzIC0tb3V0cHV0XFxuICAgIGBgYFxcblxcbiAgICBPZiBjb3Vyc2UsIHlvdSdsbCBub3cgaGF2ZSB0byB3aXJlIHVwIHRoZSBjbGllbnQtc2lkZSBKYXZhU2NyaXB0IHVzaW5nIFtCcm93c2VyaWZ5XVszOF0hXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMjIyMgQ29tcGlsaW5nIHlvdXIgY2xpZW50LXNpZGUgSmF2YVNjcmlwdFxcblxcbiAgICBZb3UnbGwgbmVlZCB0byBjb21waWxlIHRoZSBgY2xpZW50L2pzL21haW4uanNgIG1vZHVsZSwgb3VyIGNsaWVudC1zaWRlIGFwcGxpY2F0aW9uJ3MgZW50cnkgcG9pbnQsIHVzaW5nIEJyb3dzZXJpZnkgc2luY2UgdGhlIGNvZGUgaXMgd3JpdHRlbiB1c2luZyBDb21tb25KUy4gSW4gdGhpcyBleGFtcGxlIHlvdSdsbCBpbnN0YWxsIGBicm93c2VyaWZ5YCBnbG9iYWxseSB0byBjb21waWxlIHRoZSBjb2RlLCBidXQgbmF0dXJhbGx5IHlvdSdsbCBpbnN0YWxsIGl0IGxvY2FsbHkgd2hlbiB3b3JraW5nIG9uIGEgcmVhbC13b3JsZCBhcHBsaWNhdGlvbi5cXG5cXG4gICAgYGBgc2hlbGxcXG4gICAgbnBtIGluc3RhbGwgLS1nbG9iYWwgYnJvd3NlcmlmeVxcbiAgICBgYGBcXG5cXG4gICAgT25jZSB5b3UgaGF2ZSB0aGUgQnJvd3NlcmlmeSBDTEksIHlvdSdsbCBiZSBhYmxlIHRvIGNvbXBpbGUgdGhlIGNvZGUgcmlnaHQgZnJvbSB5b3VyIGNvbW1hbmQgbGluZS4gVGhlIGAtZGAgZmxhZyB0ZWxscyBCcm93c2VyaWZ5IHRvIGFkZCBhbiBpbmxpbmUgc291cmNlIG1hcCBpbnRvIHRoZSBjb21waWxlZCBidW5kbGUsIG1ha2luZyBkZWJ1Z2dpbmcgZWFzaWVyIGZvciB1cy4gVGhlIGAtb2AgZmxhZyByZWRpcmVjdHMgb3V0cHV0IHRvIHRoZSBpbmRpY2F0ZWQgZmlsZSwgd2hlcmVhcyB0aGUgb3V0cHV0IGlzIHByaW50ZWQgdG8gc3RhbmRhcmQgb3V0cHV0IGJ5IGRlZmF1bHQuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG1rZGlyIC1wIC5iaW4vcHVibGljL2pzXFxuICAgIGJyb3dzZXJpZnkgY2xpZW50L2pzL21haW4uanMgLWRvIC5iaW4vcHVibGljL2pzL2FsbC5qc1xcbiAgICBgYGBcXG5cXG4gICAgV2UgaGF2ZW4ndCBkb25lIG11Y2ggb2YgYW55dGhpbmcgd2l0aCB0aGUgRXhwcmVzcyBhcHBsaWNhdGlvbiwgc28geW91J2xsIG5lZWQgdG8gYWRqdXN0IHRoZSBgYXBwLmpzYCBtb2R1bGUgdG8gc2VydmUgc3RhdGljIGFzc2V0cy4gSWYgeW91J3JlIHVzZWQgdG8gRXhwcmVzcywgeW91J2xsIG5vdGljZSB0aGVyZSdzIG5vdGhpbmcgc3BlY2lhbCBhYm91dCBob3cgd2UncmUgdXNpbmcgYHNlcnZlLXN0YXRpY2AuXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5wbSBpbnN0YWxsIC0tc2F2ZSBzZXJ2ZS1zdGF0aWNcXG4gICAgYGBgXFxuXFxuICAgIExldCdzIGNvbmZpZ3VyZSB0aGUgYXBwbGljYXRpb24gdG8gc2VydmUgc3RhdGljIGFzc2V0cyBmcm9tIGAuYmluL3B1YmxpY2AuXFxuXFxuICAgIGBgYGpzXFxuICAgICd1c2Ugc3RyaWN0JztcXG5cXG4gICAgdmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xcbiAgICB2YXIgdGF1bnVzRXhwcmVzcyA9IHJlcXVpcmUoJ3RhdW51cy1leHByZXNzJyk7XFxuICAgIHZhciBleHByZXNzID0gcmVxdWlyZSgnZXhwcmVzcycpO1xcbiAgICB2YXIgc2VydmVTdGF0aWMgPSByZXF1aXJlKCdzZXJ2ZS1zdGF0aWMnKTtcXG4gICAgdmFyIGFwcCA9IGV4cHJlc3MoKTtcXG4gICAgdmFyIG9wdGlvbnMgPSB7XFxuICAgICAgcm91dGVzOiByZXF1aXJlKCcuL2NvbnRyb2xsZXJzL3JvdXRlcycpLFxcbiAgICAgIGxheW91dDogcmVxdWlyZSgnLi8uYmluL3ZpZXdzL2xheW91dCcpXFxuICAgIH07XFxuXFxuICAgIGFwcC51c2Uoc2VydmVTdGF0aWMoJy5iaW4vcHVibGljJykpO1xcbiAgICB0YXVudXNFeHByZXNzKHRhdW51cywgYXBwLCBvcHRpb25zKTtcXG4gICAgYXBwLmxpc3RlbigzMDAwKTtcXG4gICAgYGBgXFxuXFxuICAgIE5leHQgdXAsIHlvdSdsbCBoYXZlIHRvIGVkaXQgdGhlIGxheW91dCB0byBpbmNsdWRlIHRoZSBjb21waWxlZCBKYXZhU2NyaXB0IGJ1bmRsZSBmaWxlLlxcblxcbiAgICBgYGBqYWRlXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1haW4hPXBhcnRpYWxcXG4gICAgc2NyaXB0KHNyYz0nL2pzL2FsbC5qcycpXFxuICAgIGBgYFxcblxcbiAgICBMYXN0bHksIHlvdSBjYW4gZXhlY3V0ZSB0aGUgYXBwbGljYXRpb24gYW5kIHNlZSBpdCBpbiBhY3Rpb24hXFxuXFxuICAgIGBgYHNoZWxsXFxuICAgIG5vZGUgYXBwXFxuICAgIGBgYFxcblxcbiAgICAhW1NjcmVlbnNob3Qgd2l0aCBgbm9kZSBhcHBgIG91dHB1dF1bMzldXFxuXFxuICAgIElmIHlvdSBvcGVuIHRoZSBhcHBsaWNhdGlvbiBvbiBhIHdlYiBicm93c2VyLCB5b3UnbGwgbm90aWNlIHRoYXQgdGhlIGFwcHJvcHJpYXRlIGluZm9ybWF0aW9uIHdpbGwgYmUgbG9nZ2VkIGludG8gdGhlIGRldmVsb3BlciBgY29uc29sZWAuXFxuXFxuICAgICFbU2NyZWVuc2hvdCB3aXRoIHRoZSBhcHBsaWNhdGlvbiBydW5uaW5nIHVuZGVyIEdvb2dsZSBDaHJvbWVdWzQwXVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIFVzaW5nIHRoZSBjbGllbnQtc2lkZSBUYXVudXMgQVBJXFxuXFxuICAgIFRhdW51cyBkb2VzIHByb3ZpZGUgW2EgdGhpbiBBUEldWzE4XSBpbiB0aGUgY2xpZW50LXNpZGUuIFVzYWdlIG9mIHRoYXQgQVBJIGJlbG9uZ3MgbW9zdGx5IGluc2lkZSB0aGUgYm9keSBvZiBjbGllbnQtc2lkZSB2aWV3IGNvbnRyb2xsZXJzLCBidXQgdGhlcmUncyBhIGZldyBtZXRob2RzIHlvdSBjYW4gdGFrZSBhZHZhbnRhZ2Ugb2Ygb24gYSBnbG9iYWwgc2NhbGUgYXMgd2VsbC5cXG5cXG4gICAgVGF1bnVzIGNhbiBub3RpZnkgeW91IHdoZW5ldmVyIGltcG9ydGFudCBldmVudHMgb2NjdXIuXFxuXFxuICAgIEV2ZW50ICAgICAgICAgICAgfCBBcmd1bWVudHMgICAgICAgICAgICAgICB8IERlc2NyaXB0aW9uXFxuICAgIC0tLS0tLS0tLS0tLS0tLS0tfC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS18LS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXFxuICAgIGAnc3RhcnQnYCAgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbGAgICAgICB8IEVtaXR0ZWQgd2hlbiBgdGF1bnVzLm1vdW50YCBmaW5pc2hlZCB0aGUgcm91dGUgc2V0dXAgYW5kIGlzIGFib3V0IHRvIGludm9rZSB0aGUgY2xpZW50LXNpZGUgY29udHJvbGxlci4gU3Vic2NyaWJlIHRvIHRoaXMgZXZlbnQgYmVmb3JlIGNhbGxpbmcgYHRhdW51cy5tb3VudGAuXFxuICAgIGAncmVuZGVyJ2AgICAgICAgfCBgY29udGFpbmVyLCBtb2RlbGAgICAgICB8IEEgdmlldyBoYXMganVzdCBiZWVuIHJlbmRlcmVkIGFuZCBpdHMgY2xpZW50LXNpZGUgY29udHJvbGxlciBpcyBhYm91dCB0byBiZSBpbnZva2VkXFxuICAgIGAnZmV0Y2guc3RhcnQnYCAgfCAgYHJvdXRlLCBjb250ZXh0YCAgICAgICB8IEVtaXR0ZWQgd2hlbmV2ZXIgYW4gWEhSIHJlcXVlc3Qgc3RhcnRzLlxcbiAgICBgJ2ZldGNoLmRvbmUnYCAgIHwgIGByb3V0ZSwgY29udGV4dCwgZGF0YWAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGVuZHMgc3VjY2Vzc2Z1bGx5LlxcbiAgICBgJ2ZldGNoLmFib3J0J2AgIHwgIGByb3V0ZSwgY29udGV4dGAgICAgICAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IGlzIHB1cnBvc2VseSBhYm9ydGVkLlxcbiAgICBgJ2ZldGNoLmVycm9yJ2AgIHwgIGByb3V0ZSwgY29udGV4dCwgZXJyYCAgfCBFbWl0dGVkIHdoZW5ldmVyIGFuIFhIUiByZXF1ZXN0IHJlc3VsdHMgaW4gYW4gSFRUUCBlcnJvci5cXG5cXG4gICAgQmVzaWRlcyBldmVudHMsIHRoZXJlJ3MgYSBjb3VwbGUgbW9yZSBtZXRob2RzIHlvdSBjYW4gdXNlLiBUaGUgYHRhdW51cy5uYXZpZ2F0ZWAgbWV0aG9kIGFsbG93cyB5b3UgdG8gbmF2aWdhdGUgdG8gYSBVUkwgd2l0aG91dCB0aGUgbmVlZCBmb3IgYSBodW1hbiB0byBjbGljayBvbiBhbiBhbmNob3IgbGluay4gVGhlbiB0aGVyZSdzIGB0YXVudXMucGFydGlhbGAsIGFuZCB0aGF0IGFsbG93cyB5b3UgdG8gcmVuZGVyIGFueSBwYXJ0aWFsIHZpZXcgb24gYSBET00gZWxlbWVudCBvZiB5b3VyIGNob29zaW5nLCBhbmQgaXQnbGwgdGhlbiBpbnZva2UgaXRzIGNvbnRyb2xsZXIuIFlvdSdsbCBuZWVkIHRvIGNvbWUgdXAgd2l0aCB0aGUgbW9kZWwgeW91cnNlbGYsIHRob3VnaC5cXG5cXG4gICAgQXN0b25pc2hpbmdseSwgdGhlIEFQSSBpcyBmdXJ0aGVyIGRvY3VtZW50ZWQgaW4gW3RoZSBBUEkgZG9jdW1lbnRhdGlvbl1bMThdLlxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICAjIyMjIENhY2hpbmcgYW5kIFByZWZldGNoaW5nXFxuXFxuICAgIFtQZXJmb3JtYW5jZV1bMjVdIHBsYXlzIGFuIGltcG9ydGFudCByb2xlIGluIFRhdW51cy4gVGhhdCdzIHdoeSB0aGUgeW91IGNhbiBwZXJmb3JtIGNhY2hpbmcgYW5kIHByZWZldGNoaW5nIG9uIHRoZSBjbGllbnQtc2lkZSBqdXN0IGJ5IHR1cm5pbmcgb24gYSBwYWlyIG9mIGZsYWdzLiBCdXQgd2hhdCBkbyB0aGVzZSBmbGFncyBkbyBleGFjdGx5P1xcblxcbiAgICBXaGVuIHR1cm5lZCBvbiwgYnkgcGFzc2luZyBgeyBjYWNoZTogdHJ1ZSB9YCBhcyB0aGUgdGhpcmQgcGFyYW1ldGVyIGZvciBgdGF1bnVzLm1vdW50YCwgdGhlIGNhY2hpbmcgbGF5ZXIgd2lsbCBtYWtlIHN1cmUgdGhhdCByZXNwb25zZXMgYXJlIGtlcHQgYXJvdW5kIGZvciBgMTVgIHNlY29uZHMuIFdoZW5ldmVyIGEgcm91dGUgbmVlZHMgYSBtb2RlbCBpbiBvcmRlciB0byByZW5kZXIgYSB2aWV3LCBpdCdsbCBmaXJzdCBhc2sgdGhlIGNhY2hpbmcgbGF5ZXIgZm9yIGEgZnJlc2ggY29weS4gSWYgdGhlIGNhY2hpbmcgbGF5ZXIgZG9lc24ndCBoYXZlIGEgY29weSwgb3IgaWYgdGhhdCBjb3B5IGlzIHN0YWxlIF8oaW4gdGhpcyBjYXNlLCBvbGRlciB0aGFuIGAxNWAgc2Vjb25kcylfLCB0aGVuIGFuIEFKQVggcmVxdWVzdCB3aWxsIGJlIGlzc3VlZCB0byB0aGUgc2VydmVyLiBPZiBjb3Vyc2UsIHRoZSBkdXJhdGlvbiBpcyBjb25maWd1cmFibGUuIElmIHlvdSB3YW50IHRvIHVzZSBhIHZhbHVlIG90aGVyIHRoYW4gdGhlIGRlZmF1bHQsIHlvdSBzaG91bGQgc2V0IGBjYWNoZWAgdG8gYSBudW1iZXIgaW4gc2Vjb25kcyBpbnN0ZWFkIG9mIGp1c3QgYHRydWVgLlxcblxcbiAgICBTaW5jZSBUYXVudXMgdW5kZXJzdGFuZHMgdGhhdCBub3QgZXZlcnkgdmlldyBvcGVyYXRlcyB1bmRlciB0aGUgc2FtZSBjb25zdHJhaW50cywgeW91J3JlIGFsc28gYWJsZSB0byBzZXQgYSBgY2FjaGVgIGZyZXNobmVzcyBkdXJhdGlvbiBkaXJlY3RseSBpbiB5b3VyIHJvdXRlcy4gVGhlIGBjYWNoZWAgcHJvcGVydHkgaW4gcm91dGVzIGhhcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGRlZmF1bHQgdmFsdWUuXFxuXFxuICAgIFRoZXJlJ3MgY3VycmVudGx5IHR3byBjYWNoaW5nIHN0b3JlczogYSByYXcgaW4tbWVtb3J5IHN0b3JlLCBhbmQgYW4gW0luZGV4ZWREQl1bMjhdIHN0b3JlLiBJbmRleGVkREIgaXMgYW4gZW1iZWRkZWQgZGF0YWJhc2Ugc29sdXRpb24sIGFuZCB5b3UgY2FuIHRoaW5rIG9mIGl0IGxpa2UgYW4gYXN5bmNocm9ub3VzIHZlcnNpb24gb2YgYGxvY2FsU3RvcmFnZWAuIEl0IGhhcyBbc3VycHJpc2luZ2x5IGJyb2FkIGJyb3dzZXIgc3VwcG9ydF1bMjldLCBhbmQgaW4gdGhlIGNhc2VzIHdoZXJlIGl0J3Mgbm90IHN1cHBvcnRlZCB0aGVuIGNhY2hpbmcgaXMgZG9uZSBzb2xlbHkgaW4tbWVtb3J5LlxcblxcbiAgICBUaGUgcHJlZmV0Y2hpbmcgbWVjaGFuaXNtIGlzIGFuIGludGVyZXN0aW5nIHNwaW4tb2ZmIG9mIGNhY2hpbmcsIGFuZCBpdCByZXF1aXJlcyBjYWNoaW5nIHRvIGJlIGVuYWJsZWQgaW4gb3JkZXIgdG8gd29yay4gV2hlbmV2ZXIgaHVtYW5zIGhvdmVyIG92ZXIgYSBsaW5rLCBvciB3aGVuZXZlciB0aGV5IHB1dCB0aGVpciBmaW5nZXIgb24gb25lIG9mIHRoZW0gXyh0aGUgYHRvdWNoc3RhcnRgIGV2ZW50KV8sIHRoZSBwcmVmZXRjaGVyIHdpbGwgaXNzdWUgYW4gQUpBWCByZXF1ZXN0IGZvciB0aGUgdmlldyBtb2RlbCBmb3IgdGhhdCBsaW5rLlxcblxcbiAgICBJZiB0aGUgcmVxdWVzdCBlbmRzIHN1Y2Nlc3NmdWxseSB0aGVuIHRoZSByZXNwb25zZSB3aWxsIGJlIGNhY2hlZCBpbiB0aGUgc2FtZSB3YXkgYW55IG90aGVyIHZpZXcgd291bGQgYmUgY2FjaGVkLiBJZiB0aGUgaHVtYW4gaG92ZXJzIG92ZXIgYW5vdGhlciBsaW5rIHdoaWxlIHRoZSBwcmV2aW91cyBvbmUgaXMgc3RpbGwgYmVpbmcgcHJlZmV0Y2hlZCwgdGhlbiB0aGUgb2xkIHJlcXVlc3QgaXMgYWJvcnRlZCwgYXMgbm90IHRvIGRyYWluIHRoZWlyIF8ocG9zc2libHkgbGltaXRlZClfIEludGVybmV0IGNvbm5lY3Rpb24gYmFuZHdpZHRoLlxcblxcbiAgICBJZiB0aGUgaHVtYW4gY2xpY2tzIG9uIHRoZSBsaW5rIGJlZm9yZSBwcmVmZXRjaGluZyBpcyBjb21wbGV0ZWQsIGhlJ2xsIG5hdmlnYXRlIHRvIHRoZSB2aWV3IGFzIHNvb24gYXMgcHJlZmV0Y2hpbmcgZW5kcywgcmF0aGVyIHRoYW4gZmlyaW5nIGFub3RoZXIgcmVxdWVzdC4gVGhpcyBoZWxwcyBUYXVudXMgc2F2ZSBwcmVjaW91cyBtaWxsaXNlY29uZHMgd2hlbiBkZWFsaW5nIHdpdGggbGF0ZW5jeS1zZW5zaXRpdmUgb3BlcmF0aW9ucy5cXG5cXG4gICAgVHVybmluZyBwcmVmZXRjaGluZyBvbiBpcyBzaW1wbHkgYSBtYXR0ZXIgb2Ygc2V0dGluZyBgcHJlZmV0Y2hgIHRvIGB0cnVlYCBpbiB0aGUgb3B0aW9ucyBwYXNzZWQgdG8gYHRhdW51cy5tb3VudGAuIEZvciBhZGRpdGlvbmFsIGluc2lnaHRzIGludG8gdGhlIHBlcmZvcm1hbmNlIGltcHJvdmVtZW50cyBUYXVudXMgY2FuIG9mZmVyLCBoZWFkIG92ZXIgdG8gdGhlIFtQZXJmb3JtYW5jZSBPcHRpbWl6YXRpb25zXVsyNV0gZ3VpZGUuXFxuXFxuICAgIDxzdWI+W18oYmFjayB0byB0YWJsZSBvZiBjb250ZW50cylfXSgjdGFibGUtb2YtY29udGVudHMpPC9zdWI+XFxuXFxuICAgICMgVGhlIHNreSBpcyB0aGUgbGltaXQhXFxuXFxuICAgIFlvdSdyZSBub3cgZmFtaWxpYXIgd2l0aCBob3cgVGF1bnVzIHdvcmtzIG9uIGEgaGlnaC1sZXZlbC4gWW91IGhhdmUgY292ZXJlZCBhIGRlY2VudCBhbW91bnQgb2YgZ3JvdW5kLCBidXQgeW91IHNob3VsZG4ndCBzdG9wIHRoZXJlLlxcblxcbiAgICAtIExlYXJuIG1vcmUgYWJvdXQgW3RoZSBBUEkgVGF1bnVzIGhhc11bMThdIHRvIG9mZmVyXFxuICAgIC0gR28gdGhyb3VnaCB0aGUgW3BlcmZvcm1hbmNlIG9wdGltaXphdGlvbiB0aXBzXVsyNV0uIFlvdSBtYXkgbGVhcm4gc29tZXRoaW5nIG5ldyFcXG4gICAgLSBfRmFtaWxpYXJpemUgeW91cnNlbGYgd2l0aCB0aGUgd2F5cyBvZiBwcm9ncmVzc2l2ZSBlbmhhbmNlbWVudF9cXG4gICAgICAtIEplcmVteSBLZWl0aCBlbnVuY2lhdGVzIFtcXFwiQmUgcHJvZ3Jlc3NpdmVcXFwiXVsyMF1cXG4gICAgICAtIENocmlzdGlhbiBIZWlsbWFubiBhZHZvY2F0ZXMgZm9yIFtcXFwiUHJhZ21hdGljIHByb2dyZXNzaXZlIGVuaGFuY2VtZW50XFxcIl1bMjZdXFxuICAgICAgLSBKYWtlIEFyY2hpYmFsZCBleHBsYWlucyBob3cgW1xcXCJQcm9ncmVzc2l2ZSBlbmhhbmNlbWVudCBpcyBmYXN0ZXJcXFwiXVsyMl1cXG4gICAgICAtIEkgYmxvZ2dlZCBhYm91dCBob3cgd2Ugc2hvdWxkIFtcXFwiU3RvcCBCcmVha2luZyB0aGUgV2ViXFxcIl1bMTddXFxuICAgICAgLSBHdWlsbGVybW8gUmF1Y2ggYXJndWVzIGZvciBbXFxcIjcgUHJpbmNpcGxlcyBvZiBSaWNoIFdlYiBBcHBsaWNhdGlvbnNcXFwiXVsyNF1cXG4gICAgICAtIEFhcm9uIEd1c3RhZnNvbiB3cml0ZXMgW1xcXCJVbmRlcnN0YW5kaW5nIFByb2dyZXNzaXZlIEVuaGFuY2VtZW50XFxcIl1bMjFdXFxuICAgICAgLSBPcmRlIFNhdW5kZXJzIGdpdmVzIGhpcyBwb2ludCBvZiB2aWV3IGluIFtcXFwiUHJvZ3Jlc3NpdmUgZW5oYW5jZW1lbnQgZm9yIGZhdWx0IHRvbGVyYW5jZVxcXCJdWzIzXVxcbiAgICAtIFNpZnQgdGhyb3VnaCB0aGUgW2NvbXBsZW1lbnRhcnkgbW9kdWxlc11bMTVdLiBZb3UgbWF5IGZpbmQgc29tZXRoaW5nIHlvdSBoYWRuJ3QgdGhvdWdodCBvZiFcXG5cXG4gICAgQWxzbywgZ2V0IGludm9sdmVkIVxcblxcbiAgICAtIEZvcmsgdGhpcyByZXBvc2l0b3J5IGFuZCBbc2VuZCBzb21lIHB1bGwgcmVxdWVzdHNdWzE5XSB0byBpbXByb3ZlIHRoZXNlIGd1aWRlcyFcXG4gICAgLSBTZWUgc29tZXRoaW5nLCBzYXkgc29tZXRoaW5nISBJZiB5b3UgZGV0ZWN0IGEgYnVnLCBbcGxlYXNlIGNyZWF0ZSBhbiBpc3N1ZV1bMjddIVxcblxcbiAgICA8c3ViPltfKGJhY2sgdG8gdGFibGUgb2YgY29udGVudHMpX10oI3RhYmxlLW9mLWNvbnRlbnRzKTwvc3ViPlxcblxcbiAgICBbMV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLWV4cHJlc3NcXG4gICAgWzJdOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy1oYXBpXFxuICAgIFszXTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy9oYXBpaWZ5XFxuICAgIFs0XTogaHR0cHM6Ly9naXRodWIuY29tL3RhdW51cy90YXVudXMuYmV2YWNxdWEuaW9cXG4gICAgWzVdOiBodHRwczovL2dpdGh1Yi5jb20vcG9ueWZvby9wb255Zm9vXFxuICAgIFs2XTogaHR0cDovL2V4cHJlc3Nqcy5jb21cXG4gICAgWzddOiBodHRwOi8vaGFwaWpzLmNvbVxcbiAgICBbOF06IGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQ29udmVudGlvbl9vdmVyX2NvbmZpZ3VyYXRpb25cXG4gICAgWzldOiBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1J1Ynlfb25fUmFpbHNcXG4gICAgWzEwXTogaHR0cHM6Ly9naXRodWIuY29tL2phbmwvbXVzdGFjaGUuanNcXG4gICAgWzExXTogaHR0cHM6Ly9naXRodWIuY29tL2phZGVqcy9qYWRlXFxuICAgIFsxMl06IGh0dHA6Ly9tb3ppbGxhLmdpdGh1Yi5pby9udW5qdWNrcy9cXG4gICAgWzEzXTogaHR0cDovL2hhbmRsZWJhcnNqcy5jb20vXFxuICAgIFsxNF06IGh0dHA6Ly93d3cuZW1iZWRkZWRqcy5jb20vXFxuICAgIFsxNV06IC9jb21wbGVtZW50c1xcbiAgICBbMTZdOiBodHRwczovL2dpdGh1Yi5jb20vYmV2YWNxdWEvamFkdW1cXG4gICAgWzE3XTogaHR0cDovL3Bvbnlmb28uY29tL3N0b3AtYnJlYWtpbmctdGhlLXdlYlxcbiAgICBbMThdOiAvYXBpXFxuICAgIFsxOV06IGh0dHBzOi8vZ2l0aHViLmNvbS90YXVudXMvdGF1bnVzLmJldmFjcXVhLmlvL3B1bGxzXFxuICAgIFsyMF06IGh0dHBzOi8vYWRhY3Rpby5jb20vam91cm5hbC83NzA2XFxuICAgIFsyMV06IGh0dHA6Ly9hbGlzdGFwYXJ0LmNvbS9hcnRpY2xlL3VuZGVyc3RhbmRpbmdwcm9ncmVzc2l2ZWVuaGFuY2VtZW50XFxuICAgIFsyMl06IGh0dHA6Ly9qYWtlYXJjaGliYWxkLmNvbS8yMDEzL3Byb2dyZXNzaXZlLWVuaGFuY2VtZW50LWlzLWZhc3Rlci9cXG4gICAgWzIzXTogaHR0cHM6Ly9kZWNhZGVjaXR5Lm5ldC9ibG9nLzIwMTMvMDkvMTYvcHJvZ3Jlc3NpdmUtZW5oYW5jZW1lbnQtZm9yLWZhdWx0LXRvbGVyYW5jZVxcbiAgICBbMjRdOiBodHRwOi8vcmF1Y2hnLmNvbS8yMDE0LzctcHJpbmNpcGxlcy1vZi1yaWNoLXdlYi1hcHBsaWNhdGlvbnMvXFxuICAgIFsyNV06IC9wZXJmb3JtYW5jZVxcbiAgICBbMjZdOiBodHRwOi8vaWNhbnQuY28udWsvYXJ0aWNsZXMvcHJhZ21hdGljLXByb2dyZXNzaXZlLWVuaGFuY2VtZW50L1xcbiAgICBbMjddOiBodHRwczovL2dpdGh1Yi5jb20vdGF1bnVzL3RhdW51cy9pc3N1ZXMvbmV3XFxuICAgIFsyOF06IGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9JbmRleGVkREJfQVBJXFxuICAgIFsyOV06IGh0dHA6Ly9jYW5pdXNlLmNvbS8jZmVhdD1pbmRleGVkZGJcXG4gICAgWzMwXTogaHR0cDovL2kuaW1ndXIuY29tLzRQOHZOZTkucG5nXFxuICAgIFszMV06IGh0dHA6Ly9pLmltZ3VyLmNvbS9uOG1ING1OLnBuZ1xcbiAgICBbMzJdOiBodHRwOi8vaS5pbWd1ci5jb20vMDhsbkNlYy5wbmdcXG4gICAgWzMzXTogaHR0cDovL2kuaW1ndXIuY29tL3dVYm5DeWsucG5nXFxuICAgIFszNF06IGh0dHA6Ly9pLmltZ3VyLmNvbS96amFKWUNxLnBuZ1xcbiAgICBbMzVdOiBodHRwOi8vaS5pbWd1ci5jb20vTnZFV3g5ei5wbmdcXG4gICAgWzM2XTogaHR0cDovL2kuaW1ndXIuY29tL0xnWlJGbjUucG5nXFxuICAgIFszN106IGh0dHA6Ly9pLmltZ3VyLmNvbS9mSm5IZFlpLnBuZ1xcbiAgICBbMzhdOiBodHRwOi8vYnJvd3NlcmlmeS5vcmcvXFxuICAgIFszOV06IGh0dHA6Ly9pLmltZ3VyLmNvbS82OE84NHdYLnBuZ1xcbiAgICBbNDBdOiBodHRwOi8vaS5pbWd1ci5jb20vWlVGNk5GbC5wbmdcXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gcGVyZm9ybWFuY2UobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfV07XG50cnkge1xudmFyIGJ1ZiA9IFtdO1xudmFyIGphZGVfbWl4aW5zID0ge307XG52YXIgamFkZV9pbnRlcnA7XG47dmFyIGxvY2Fsc19mb3Jfd2l0aCA9IChsb2NhbHMgfHwge30pOyhmdW5jdGlvbiAodW5kZWZpbmVkKSB7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDAsIGZpbGVuYW1lOiBcInZpZXdzL2RvY3VtZW50YXRpb24vcGVyZm9ybWFuY2UuamFkZVwiIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9kb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNlY3Rpb24gY2xhc3M9XFxcImx5LXNlY3Rpb24gbWQtbWFya2Rvd25cXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMiwgZmlsZW5hbWU6IFwidmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoMSBpZD1cXFwicGVyZm9ybWFuY2Utb3B0aW1pemF0aW9uXFxcIj5QZXJmb3JtYW5jZSBPcHRpbWl6YXRpb248L2gxPlxcbjxwPkZvbzwvcD5cXG5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvc2VjdGlvbj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7fS5jYWxsKHRoaXMsXCJ1bmRlZmluZWRcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnVuZGVmaW5lZDp0eXBlb2YgdW5kZWZpbmVkIT09XCJ1bmRlZmluZWRcIj91bmRlZmluZWQ6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJzZWN0aW9uLmx5LXNlY3Rpb24ubWQtbWFya2Rvd25cXG4gIDptYXJrZG93blxcbiAgICAjIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcblxcbiAgICBGb29cXG5cIik7XG59XG59IiwidmFyIGphZGUgPSByZXF1aXJlKFwiamFkdW0vcnVudGltZVwiKTtcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbm90Rm91bmQobG9jYWxzKSB7XG52YXIgamFkZV9kZWJ1ZyA9IFt7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9XTtcbnRyeSB7XG52YXIgYnVmID0gW107XG52YXIgamFkZV9taXhpbnMgPSB7fTtcbnZhciBqYWRlX2ludGVycDtcbjt2YXIgbG9jYWxzX2Zvcl93aXRoID0gKGxvY2FscyB8fCB7fSk7KGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIk5vdCBGb3VuZFwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMywgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRoZXJlIGRvZXNuJ3Qgc2VlbSB0byBiZSBhbnl0aGluZyBoZXJlIHlldC4gSWYgeW91IGJlbGlldmUgdGhpcyB0byBiZSBhIG1pc3Rha2UsIHBsZWFzZSBsZXQgdXMga25vdyFcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvcD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDQsIGZpbGVuYW1lOiBcInZpZXdzL2Vycm9yL25vdC1mb3VuZC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxwPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvZXJyb3Ivbm90LWZvdW5kLmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiaHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiXFxcIiB0YXJnZXQ9XFxcIl9ibGFua1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA1LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiJm1kYXNoOyBAbnpnYlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9wPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTt9LmNhbGwodGhpcyxcInVuZGVmaW5lZFwiIGluIGxvY2Fsc19mb3Jfd2l0aD9sb2NhbHNfZm9yX3dpdGgudW5kZWZpbmVkOnR5cGVvZiB1bmRlZmluZWQhPT1cInVuZGVmaW5lZFwiP3VuZGVmaW5lZDp1bmRlZmluZWQpKTs7cmV0dXJuIGJ1Zi5qb2luKFwiXCIpO1xufSBjYXRjaCAoZXJyKSB7XG4gIGphZGUucmV0aHJvdyhlcnIsIGphZGVfZGVidWdbMF0uZmlsZW5hbWUsIGphZGVfZGVidWdbMF0ubGluZW5vLCBcImgxIE5vdCBGb3VuZFxcblxcbnAgVGhlcmUgZG9lc24ndCBzZWVtIHRvIGJlIGFueXRoaW5nIGhlcmUgeWV0LiBJZiB5b3UgYmVsaWV2ZSB0aGlzIHRvIGJlIGEgbWlzdGFrZSwgcGxlYXNlIGxldCB1cyBrbm93IVxcbnBcXG4gIGEoaHJlZj0naHR0cHM6Ly90d2l0dGVyLmNvbS9uemdiJywgdGFyZ2V0PSdfYmxhbmsnKSAmbWRhc2g7IEBuemdiXFxuXCIpO1xufVxufSIsInZhciBqYWRlID0gcmVxdWlyZShcImphZHVtL3J1bnRpbWVcIik7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGxheW91dChsb2NhbHMpIHtcbnZhciBqYWRlX2RlYnVnID0gW3sgbGluZW5vOiAxLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH1dO1xudHJ5IHtcbnZhciBidWYgPSBbXTtcbnZhciBqYWRlX21peGlucyA9IHt9O1xudmFyIGphZGVfaW50ZXJwO1xuO3ZhciBsb2NhbHNfZm9yX3dpdGggPSAobG9jYWxzIHx8IHt9KTsoZnVuY3Rpb24gKHVuZGVmaW5lZCwgbW9kZWwsIHBhcnRpYWwpIHtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPCFET0NUWVBFIGh0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aHRtbCBsYW5nPVxcXCJlblxcXCIgaXRlbXNjb3BlIGl0ZW10eXBlPVxcXCJodHRwOi8vc2NoZW1hLm9yZy9CbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHRpdGxlPlwiICsgKGphZGUuZXNjYXBlKG51bGwgPT0gKGphZGVfaW50ZXJwID0gbW9kZWwudGl0bGUpID8gXCJcIiA6IGphZGVfaW50ZXJwKSkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L3RpdGxlPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgY2hhcnNldD1cXFwidXRmLThcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpbmsgcmVsPVxcXCJzaG9ydGN1dCBpY29uXFxcIiBocmVmPVxcXCIvZmF2aWNvbi5pY29cXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPG1ldGEgaHR0cC1lcXVpdj1cXFwiWC1VQS1Db21wYXRpYmxlXFxcIiBjb250ZW50PVxcXCJJRT1lZGdlLGNocm9tZT0xXFxcIj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDgsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxtZXRhIG5hbWU9XFxcInZpZXdwb3J0XFxcIiBjb250ZW50PVxcXCJ3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiA5LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bGluayByZWw9XFxcInN0eWxlc2hlZXRcXFwiIHR5cGU9XFxcInRleHQvY3NzXFxcIiBocmVmPVxcXCIvY3NzL2FsbC5jc3NcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTAsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaW5rIHJlbD1cXFwic3R5bGVzaGVldFxcXCIgdHlwZT1cXFwidGV4dC9jc3NcXFwiIGhyZWY9XFxcImh0dHA6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3M/ZmFtaWx5PVVuaWNhK09uZTo0MDB8UGxheWZhaXIrRGlzcGxheTo3MDB8TWVncmltOjcwMHxGYXVuYStPbmU6NDAwaXRhbGljLDQwMCw3MDBcXFwiPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oZWFkPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTIsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxib2R5IGlkPVxcXCJ0b3BcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTMsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxoZWFkZXI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGgxPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxhIGhyZWY9XFxcIi9cXFwiIGFyaWEtbGFiZWw9XFxcIkdvIHRvIGhvbWVcXFwiIGNsYXNzPVxcXCJseS10aXRsZVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAxNSwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIlRhdW51c1wiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9oMT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8aDIgY2xhc3M9XFxcImx5LXN1YmhlYWRpbmdcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTYsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuYnVmLnB1c2goXCJNaWNybyBJc29tb3JwaGljIE1WQyBFbmdpbmUgZm9yIE5vZGUuanNcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvaDI+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2hlYWRlcj5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDE4LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YXNpZGUgY2xhc3M9XFxcInNiLXNpZGViYXJcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMTksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxuYXYgY2xhc3M9XFxcInNiLWNvbnRhaW5lclxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHVsIGNsYXNzPVxcXCJudi1pdGVtc1xcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMSwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDIyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQWJvdXRcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvZ2V0dGluZy1zdGFydGVkXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiR2V0dGluZyBTdGFydGVkXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjUsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2FwaVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyNiwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5idWYucHVzaChcIkFQSSBEb2N1bWVudGF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjcsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAyOCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL2NvbXBsZW1lbnRzXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDI4LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ29tcGxlbWVudGFyeSBNb2R1bGVzXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMjksIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMCwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3BlcmZvcm1hbmNlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMwLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiUGVyZm9ybWFuY2UgT3B0aW1pemF0aW9uXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogMzEsIGZpbGVuYW1lOiBcInZpZXdzL2xheW91dC5qYWRlXCIgfSk7XG5idWYucHVzaChcIjxsaSBjbGFzcz1cXFwibnYtaXRlbVxcXCI+XCIpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMiwgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGEgaHJlZj1cXFwiL3NvdXJjZS1jb2RlXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDMyLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiU291cmNlIENvZGVcIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvYT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbGk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzMywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPGxpIGNsYXNzPVxcXCJudi1pdGVtXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8YSBocmVmPVxcXCIvY2hhbmdlbG9nXFxcIj5cIik7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IHVuZGVmaW5lZCwgZmlsZW5hbWU6IGphZGVfZGVidWdbMF0uZmlsZW5hbWUgfSk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM0LCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmJ1Zi5wdXNoKFwiQ2hhbmdlbG9nXCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2E+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2xpPlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC91bD5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5idWYucHVzaChcIjwvbmF2PlwiKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9hc2lkZT5cIik7XG5qYWRlX2RlYnVnLnNoaWZ0KCk7XG5qYWRlX2RlYnVnLnVuc2hpZnQoeyBsaW5lbm86IDM2LCBmaWxlbmFtZTogXCJ2aWV3cy9sYXlvdXQuamFkZVwiIH0pO1xuYnVmLnB1c2goXCI8bWFpbiBpZD1cXFwiYXBwbGljYXRpb24tcm9vdFxcXCIgZGF0YS10YXVudXM9XFxcIm1vZGVsXFxcIiBjbGFzcz1cXFwibHktbWFpblxcXCI+XCIgKyAobnVsbCA9PSAoamFkZV9pbnRlcnAgPSBwYXJ0aWFsKSA/IFwiXCIgOiBqYWRlX2ludGVycCkpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiB1bmRlZmluZWQsIGZpbGVuYW1lOiBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lIH0pO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L21haW4+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy51bnNoaWZ0KHsgbGluZW5vOiAzNywgZmlsZW5hbWU6IFwidmlld3MvbGF5b3V0LmphZGVcIiB9KTtcbmJ1Zi5wdXNoKFwiPHNjcmlwdCBzcmM9XFxcIi9qcy9hbGwuanNcXFwiPlwiKTtcbmphZGVfZGVidWcudW5zaGlmdCh7IGxpbmVubzogdW5kZWZpbmVkLCBmaWxlbmFtZTogamFkZV9kZWJ1Z1swXS5maWxlbmFtZSB9KTtcbmphZGVfZGVidWcuc2hpZnQoKTtcbmJ1Zi5wdXNoKFwiPC9zY3JpcHQ+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2JvZHk+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuYnVmLnB1c2goXCI8L2h0bWw+XCIpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO1xuamFkZV9kZWJ1Zy5zaGlmdCgpO30uY2FsbCh0aGlzLFwidW5kZWZpbmVkXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC51bmRlZmluZWQ6dHlwZW9mIHVuZGVmaW5lZCE9PVwidW5kZWZpbmVkXCI/dW5kZWZpbmVkOnVuZGVmaW5lZCxcIm1vZGVsXCIgaW4gbG9jYWxzX2Zvcl93aXRoP2xvY2Fsc19mb3Jfd2l0aC5tb2RlbDp0eXBlb2YgbW9kZWwhPT1cInVuZGVmaW5lZFwiP21vZGVsOnVuZGVmaW5lZCxcInBhcnRpYWxcIiBpbiBsb2NhbHNfZm9yX3dpdGg/bG9jYWxzX2Zvcl93aXRoLnBhcnRpYWw6dHlwZW9mIHBhcnRpYWwhPT1cInVuZGVmaW5lZFwiP3BhcnRpYWw6dW5kZWZpbmVkKSk7O3JldHVybiBidWYuam9pbihcIlwiKTtcbn0gY2F0Y2ggKGVycikge1xuICBqYWRlLnJldGhyb3coZXJyLCBqYWRlX2RlYnVnWzBdLmZpbGVuYW1lLCBqYWRlX2RlYnVnWzBdLmxpbmVubywgXCJkb2N0eXBlIGh0bWxcXG5odG1sKGxhbmc9J2VuJywgaXRlbXNjb3BlLCBpdGVtdHlwZT0naHR0cDovL3NjaGVtYS5vcmcvQmxvZycpXFxuICBoZWFkXFxuICAgIHRpdGxlPW1vZGVsLnRpdGxlXFxuICAgIG1ldGEoY2hhcnNldD0ndXRmLTgnKVxcbiAgICBsaW5rKHJlbD0nc2hvcnRjdXQgaWNvbicsIGhyZWY9Jy9mYXZpY29uLmljbycpXFxuICAgIG1ldGEoaHR0cC1lcXVpdj0nWC1VQS1Db21wYXRpYmxlJywgY29udGVudD0nSUU9ZWRnZSxjaHJvbWU9MScpXFxuICAgIG1ldGEobmFtZT0ndmlld3BvcnQnLCBjb250ZW50PSd3aWR0aD1kZXZpY2Utd2lkdGgsIGluaXRpYWwtc2NhbGU9MScpXFxuICAgIGxpbmsocmVsPSdzdHlsZXNoZWV0JywgdHlwZT0ndGV4dC9jc3MnLCBocmVmPScvY3NzL2FsbC5jc3MnKVxcbiAgICBsaW5rKHJlbD0nc3R5bGVzaGVldCcsIHR5cGU9J3RleHQvY3NzJywgaHJlZj0naHR0cDovL2ZvbnRzLmdvb2dsZWFwaXMuY29tL2Nzcz9mYW1pbHk9VW5pY2ErT25lOjQwMHxQbGF5ZmFpcitEaXNwbGF5OjcwMHxNZWdyaW06NzAwfEZhdW5hK09uZTo0MDBpdGFsaWMsNDAwLDcwMCcpXFxuXFxuICBib2R5I3RvcFxcbiAgICBoZWFkZXJcXG4gICAgICBoMVxcbiAgICAgICAgYS5seS10aXRsZShocmVmPScvJywgYXJpYS1sYWJlbD0nR28gdG8gaG9tZScpIFRhdW51c1xcbiAgICAgIGgyLmx5LXN1YmhlYWRpbmcgTWljcm8gSXNvbW9ycGhpYyBNVkMgRW5naW5lIGZvciBOb2RlLmpzXFxuXFxuICAgIGFzaWRlLnNiLXNpZGViYXJcXG4gICAgICBuYXYuc2ItY29udGFpbmVyXFxuICAgICAgICB1bC5udi1pdGVtc1xcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvJykgQWJvdXRcXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2dldHRpbmctc3RhcnRlZCcpIEdldHRpbmcgU3RhcnRlZFxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvYXBpJykgQVBJIERvY3VtZW50YXRpb25cXG4gICAgICAgICAgbGkubnYtaXRlbVxcbiAgICAgICAgICAgIGEoaHJlZj0nL2NvbXBsZW1lbnRzJykgQ29tcGxlbWVudGFyeSBNb2R1bGVzXFxuICAgICAgICAgIGxpLm52LWl0ZW1cXG4gICAgICAgICAgICBhKGhyZWY9Jy9wZXJmb3JtYW5jZScpIFBlcmZvcm1hbmNlIE9wdGltaXphdGlvblxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvc291cmNlLWNvZGUnKSBTb3VyY2UgQ29kZVxcbiAgICAgICAgICBsaS5udi1pdGVtXFxuICAgICAgICAgICAgYShocmVmPScvY2hhbmdlbG9nJykgQ2hhbmdlbG9nXFxuXFxuICAgIG1haW4ubHktbWFpbiNhcHBsaWNhdGlvbi1yb290KGRhdGEtdGF1bnVzPSdtb2RlbCcpIT1wYXJ0aWFsXFxuICAgIHNjcmlwdChzcmM9Jy9qcy9hbGwuanMnKVxcblwiKTtcbn1cbn0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0ZW1wbGF0ZXMgPSB7XG4gICdkb2N1bWVudGF0aW9uL2Fib3V0JzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2Fib3V0LmpzJyksXG4gICdkb2N1bWVudGF0aW9uL2FwaSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9hcGkuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMnOiByZXF1aXJlKCcuL3ZpZXdzL2RvY3VtZW50YXRpb24vY29tcGxlbWVudHMuanMnKSxcbiAgJ2RvY3VtZW50YXRpb24vZ2V0dGluZy1zdGFydGVkJzogcmVxdWlyZSgnLi92aWV3cy9kb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZC5qcycpLFxuICAnZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZSc6IHJlcXVpcmUoJy4vdmlld3MvZG9jdW1lbnRhdGlvbi9wZXJmb3JtYW5jZS5qcycpLFxuICAnZXJyb3Ivbm90LWZvdW5kJzogcmVxdWlyZSgnLi92aWV3cy9lcnJvci9ub3QtZm91bmQuanMnKSxcbiAgJ2xheW91dCc6IHJlcXVpcmUoJy4vdmlld3MvbGF5b3V0LmpzJylcbn07XG5cbnZhciBjb250cm9sbGVycyA9IHtcbiAgJ2RvY3VtZW50YXRpb24vYWJvdXQnOiByZXF1aXJlKCcuLi9jbGllbnQvanMvY29udHJvbGxlcnMvZG9jdW1lbnRhdGlvbi9hYm91dC5qcycpXG59O1xuXG52YXIgcm91dGVzID0ge1xuICAnLyc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2Fib3V0J1xuICB9LFxuICAnL2dldHRpbmctc3RhcnRlZCc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL2dldHRpbmctc3RhcnRlZCdcbiAgfSxcbiAgJy9hcGknOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9hcGknXG4gIH0sXG4gICcvY29tcGxlbWVudHMnOiB7XG4gICAgYWN0aW9uOiAnZG9jdW1lbnRhdGlvbi9jb21wbGVtZW50cydcbiAgfSxcbiAgJy9wZXJmb3JtYW5jZSc6IHtcbiAgICBhY3Rpb246ICdkb2N1bWVudGF0aW9uL3BlcmZvcm1hbmNlJ1xuICB9LFxuICAnL3NvdXJjZS1jb2RlJzoge1xuICAgIGlnbm9yZTogdHJ1ZVxuICB9LFxuICAnL2NoYW5nZWxvZyc6IHtcbiAgICBpZ25vcmU6IHRydWVcbiAgfSxcbiAgJy86Y2F0Y2hhbGwqJzoge1xuICAgIGFjdGlvbjogJ2Vycm9yL25vdC1mb3VuZCdcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHRlbXBsYXRlczogdGVtcGxhdGVzLFxuICBjb250cm9sbGVyczogY29udHJvbGxlcnMsXG4gIHJvdXRlczogcm91dGVzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uICgpIHtcbiAgY29uc29sZS5sb2coJ1dlbGNvbWUgdG8gVGF1bnVzIGRvY3VtZW50YXRpb24gbWluaS1zaXRlIScpO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSByZXF1aXJlKCdkb21pbnVzJyk7XG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgc2lkZWJhciA9ICQoJy5zYi1zaWRlYmFyJyk7XG52YXIgdGhyb3R0bGUgPSByZXF1aXJlKCcuL3Rocm90dGxlJyk7XG52YXIgc2xvd1Njcm9sbENoZWNrID0gdGhyb3R0bGUoc2Nyb2xsQ2hlY2ssIDIwMCk7XG52YXIgaGVhZGluZztcbnZhciB0cmFja2luZztcblxucmFmKHNjcm9sbCk7XG5cbmZ1bmN0aW9uIGNvbnZlbnRpb25zIChjb250YWluZXIpIHtcbiAgdHJhY2tpbmcgPSAkKGNvbnRhaW5lcikuZmluZCgnI3RhYmxlLW9mLWNvbnRlbnRzJykubGVuZ3RoO1xufVxuXG5mdW5jdGlvbiBzY3JvbGwgKCkge1xuICBzbG93U2Nyb2xsQ2hlY2soKTtcbiAgcmFmKHNjcm9sbCk7XG59XG5cbmZ1bmN0aW9uIHNjcm9sbENoZWNrICgpIHtcbiAgaWYgKCF0cmFja2luZykge1xuICAgIHJldHVybjtcbiAgfVxuICB2YXIgZm91bmQgPSAkKCdtYWluJykuZmluZCgnaDEsaDIsaDMsaDQsaDUsaDYnKS5maWx0ZXIoaW5WaWV3cG9ydCk7XG4gIGlmIChmb3VuZC5sZW5ndGggPT09IDAgfHwgZm91bmRbMF0gPT09IGhlYWRpbmcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaGVhZGluZyA9IGZvdW5kWzBdO1xuICBzZXQoJyMnICsgaGVhZGluZy5pZCk7XG59XG5cbmZ1bmN0aW9uIGluVmlld3BvcnQgKGVsZW1lbnQpIHtcbiAgdmFyIHJlY3QgPSBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuICB2YXIgdmlld2FibGUgPSAoXG4gICAgTWF0aC5jZWlsKHJlY3QudG9wKSA+PSAwICYmXG4gICAgTWF0aC5jZWlsKHJlY3QubGVmdCkgPj0gMCAmJlxuICAgIE1hdGguZmxvb3IocmVjdC5ib3R0b20pIDw9ICh3aW5kb3cuaW5uZXJIZWlnaHQgfHwgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmNsaWVudEhlaWdodCkgJiZcbiAgICBNYXRoLmZsb29yKHJlY3QucmlnaHQpIDw9ICh3aW5kb3cuaW5uZXJXaWR0aCB8fCBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGgpXG4gICk7XG4gIHJldHVybiB2aWV3YWJsZTtcbn1cblxuZnVuY3Rpb24gc2V0IChoYXNoKSB7XG4gIGlmIChoaXN0b3J5LnB1c2hTdGF0ZSkge1xuICAgIGhpc3RvcnkucHVzaFN0YXRlKG51bGwsIG51bGwsIGhhc2gpO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gY29udmVudGlvbnM7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbi8vIGltcG9ydCB0aGUgdGF1bnVzIG1vZHVsZVxudmFyIHRhdW51cyA9IHJlcXVpcmUoJ3RhdW51cycpO1xuXG4vLyBpbXBvcnQgdGhlIHdpcmluZyBtb2R1bGUgZXhwb3J0ZWQgYnkgVGF1bnVzXG52YXIgd2lyaW5nID0gcmVxdWlyZSgnLi4vLi4vLmJpbi93aXJpbmcnKTtcblxuLy8gaW1wb3J0IGNvbnZlbnRpb25zXG52YXIgY29udmVudGlvbnMgPSByZXF1aXJlKCcuL2NvbnZlbnRpb25zJyk7XG5cbi8vIGdldCB0aGUgPG1haW4+IGVsZW1lbnRcbnZhciBtYWluID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2FwcGxpY2F0aW9uLXJvb3QnKTtcblxuLy8gc2V0IHVwIGNvbnZlbnRpb25zIHRoYXQgZ2V0IGV4ZWN1dGVkIGZvciBldmVyeSB2aWV3XG50YXVudXMub24oJ3JlbmRlcicsIGNvbnZlbnRpb25zKTtcblxuLy8gbW91bnQgdGF1bnVzIHNvIGl0IHN0YXJ0cyBpdHMgcm91dGluZyBlbmdpbmVcbnRhdW51cy5tb3VudChtYWluLCB3aXJpbmcpO1xuXG4vLyBtYWtlICQgYSBnbG9iYWwgdG8gbWFrZSBpdCBlYXN5IHRvIGRlYnVnIVxuZ2xvYmFsLiQgPSByZXF1aXJlKCdkb21pbnVzJyk7XG5cbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiB0aHJvdHRsZSAoZm4sIHQpIHtcbiAgdmFyIGNhY2hlO1xuICB2YXIgbGFzdCA9IC0xO1xuICByZXR1cm4gZnVuY3Rpb24gdGhyb3R0bGVkICgpIHtcbiAgICB2YXIgbm93ID0gRGF0ZS5ub3coKTtcbiAgICBpZiAobm93IC0gbGFzdCA+IHQpIHtcbiAgICAgIGNhY2hlID0gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIGxhc3QgPSBub3c7XG4gICAgfVxuICAgIHJldHVybiBjYWNoZTtcbiAgfTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB0aHJvdHRsZTtcbmdsb2JhbC50aHJvdHRsZT10aHJvdHRsZTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJ2YXIgcG9zZXIgPSByZXF1aXJlKCcuL3NyYy9ub2RlJyk7XG5cbm1vZHVsZS5leHBvcnRzID0gcG9zZXI7XG5cblsnQXJyYXknLCAnRnVuY3Rpb24nLCAnT2JqZWN0JywgJ0RhdGUnLCAnU3RyaW5nJ10uZm9yRWFjaChwb3NlKTtcblxuZnVuY3Rpb24gcG9zZSAodHlwZSkge1xuICBwb3Nlclt0eXBlXSA9IGZ1bmN0aW9uIHBvc2VDb21wdXRlZFR5cGUgKCkgeyByZXR1cm4gcG9zZXIodHlwZSk7IH07XG59XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBkID0gZ2xvYmFsLmRvY3VtZW50O1xuXG5mdW5jdGlvbiBwb3NlciAodHlwZSkge1xuICB2YXIgaWZyYW1lID0gZC5jcmVhdGVFbGVtZW50KCdpZnJhbWUnKTtcblxuICBpZnJhbWUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgZC5ib2R5LmFwcGVuZENoaWxkKGlmcmFtZSk7XG5cbiAgcmV0dXJuIG1hcCh0eXBlLCBpZnJhbWUuY29udGVudFdpbmRvdyk7XG59XG5cbmZ1bmN0aW9uIG1hcCAodHlwZSwgc291cmNlKSB7IC8vIGZvcndhcmQgcG9seWZpbGxzIHRvIHRoZSBzdG9sZW4gcmVmZXJlbmNlIVxuICB2YXIgb3JpZ2luYWwgPSB3aW5kb3dbdHlwZV0ucHJvdG90eXBlO1xuICB2YXIgdmFsdWUgPSBzb3VyY2VbdHlwZV07XG4gIHZhciBwcm9wO1xuXG4gIGZvciAocHJvcCBpbiBvcmlnaW5hbCkge1xuICAgIHZhbHVlLnByb3RvdHlwZVtwcm9wXSA9IG9yaWdpbmFsW3Byb3BdO1xuICB9XG5cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHBvc2VyO1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGV4cGFuZG8gPSAnc2VrdG9yLScgKyBEYXRlLm5vdygpO1xudmFyIHJzaWJsaW5ncyA9IC9bK35dLztcbnZhciBkb2N1bWVudCA9IGdsb2JhbC5kb2N1bWVudDtcbnZhciBkZWwgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQ7XG52YXIgbWF0Y2ggPSBkZWwubWF0Y2hlcyB8fFxuICAgICAgICAgICAgZGVsLndlYmtpdE1hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuICAgICAgICAgICAgZGVsLm9NYXRjaGVzU2VsZWN0b3IgfHxcbiAgICAgICAgICAgIGRlbC5tc01hdGNoZXNTZWxlY3RvcjtcblxuZnVuY3Rpb24gcXNhIChzZWxlY3RvciwgY29udGV4dCkge1xuICB2YXIgZXhpc3RlZCwgaWQsIHByZWZpeCwgcHJlZml4ZWQsIGFkYXB0ZXIsIGhhY2sgPSBjb250ZXh0ICE9PSBkb2N1bWVudDtcbiAgaWYgKGhhY2spIHsgLy8gaWQgaGFjayBmb3IgY29udGV4dC1yb290ZWQgcXVlcmllc1xuICAgIGV4aXN0ZWQgPSBjb250ZXh0LmdldEF0dHJpYnV0ZSgnaWQnKTtcbiAgICBpZCA9IGV4aXN0ZWQgfHwgZXhwYW5kbztcbiAgICBwcmVmaXggPSAnIycgKyBpZCArICcgJztcbiAgICBwcmVmaXhlZCA9IHByZWZpeCArIHNlbGVjdG9yLnJlcGxhY2UoLywvZywgJywnICsgcHJlZml4KTtcbiAgICBhZGFwdGVyID0gcnNpYmxpbmdzLnRlc3Qoc2VsZWN0b3IpICYmIGNvbnRleHQucGFyZW50Tm9kZTtcbiAgICBpZiAoIWV4aXN0ZWQpIHsgY29udGV4dC5zZXRBdHRyaWJ1dGUoJ2lkJywgaWQpOyB9XG4gIH1cbiAgdHJ5IHtcbiAgICByZXR1cm4gKGFkYXB0ZXIgfHwgY29udGV4dCkucXVlcnlTZWxlY3RvckFsbChwcmVmaXhlZCB8fCBzZWxlY3Rvcik7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gW107XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKGV4aXN0ZWQgPT09IG51bGwpIHsgY29udGV4dC5yZW1vdmVBdHRyaWJ1dGUoJ2lkJyk7IH1cbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChzZWxlY3RvciwgY3R4LCBjb2xsZWN0aW9uLCBzZWVkKSB7XG4gIHZhciBlbGVtZW50O1xuICB2YXIgY29udGV4dCA9IGN0eCB8fCBkb2N1bWVudDtcbiAgdmFyIHJlc3VsdHMgPSBjb2xsZWN0aW9uIHx8IFtdO1xuICB2YXIgaSA9IDA7XG4gIGlmICh0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH1cbiAgaWYgKGNvbnRleHQubm9kZVR5cGUgIT09IDEgJiYgY29udGV4dC5ub2RlVHlwZSAhPT0gOSkge1xuICAgIHJldHVybiBbXTsgLy8gYmFpbCBpZiBjb250ZXh0IGlzIG5vdCBhbiBlbGVtZW50IG9yIGRvY3VtZW50XG4gIH1cbiAgaWYgKHNlZWQpIHtcbiAgICB3aGlsZSAoKGVsZW1lbnQgPSBzZWVkW2krK10pKSB7XG4gICAgICBpZiAobWF0Y2hlc1NlbGVjdG9yKGVsZW1lbnQsIHNlbGVjdG9yKSkge1xuICAgICAgICByZXN1bHRzLnB1c2goZWxlbWVudCk7XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHJlc3VsdHMucHVzaC5hcHBseShyZXN1bHRzLCBxc2Eoc2VsZWN0b3IsIGNvbnRleHQpKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0cztcbn1cblxuZnVuY3Rpb24gbWF0Y2hlcyAoc2VsZWN0b3IsIGVsZW1lbnRzKSB7XG4gIHJldHVybiBmaW5kKHNlbGVjdG9yLCBudWxsLCBudWxsLCBlbGVtZW50cyk7XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXNTZWxlY3RvciAoZWxlbWVudCwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIG1hdGNoLmNhbGwoZWxlbWVudCwgc2VsZWN0b3IpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZpbmQ7XG5cbmZpbmQubWF0Y2hlcyA9IG1hdGNoZXM7XG5maW5kLm1hdGNoZXNTZWxlY3RvciA9IG1hdGNoZXNTZWxlY3RvcjtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBwb3NlciA9IHJlcXVpcmUoJ3Bvc2VyJyk7XG52YXIgRG9taW51cyA9IHBvc2VyLkFycmF5KCk7XG5cbm1vZHVsZS5leHBvcnRzID0gRG9taW51cztcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyICQgPSByZXF1aXJlKCcuL3B1YmxpYycpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBkb20gPSByZXF1aXJlKCcuL2RvbScpO1xudmFyIGNsYXNzZXMgPSByZXF1aXJlKCcuL2NsYXNzZXMnKTtcbnZhciBEb21pbnVzID0gcmVxdWlyZSgnLi9Eb21pbnVzLmN0b3InKTtcblxuZnVuY3Rpb24gZXF1YWxzIChzZWxlY3Rvcikge1xuICByZXR1cm4gZnVuY3Rpb24gZXF1YWxzIChlbGVtKSB7XG4gICAgcmV0dXJuIGRvbS5tYXRjaGVzKGVsZW0sIHNlbGVjdG9yKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gc3RyYWlnaHQgKHByb3AsIG9uZSkge1xuICByZXR1cm4gZnVuY3Rpb24gZG9tTWFwcGluZyAoc2VsZWN0b3IpIHtcbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIHJldHVybiBkb21bcHJvcF0oZWxlbSwgc2VsZWN0b3IpO1xuICAgIH0pO1xuICAgIHZhciByZXN1bHRzID0gY29yZS5mbGF0dGVuKHJlc3VsdCk7XG4gICAgcmV0dXJuIG9uZSA/IHJlc3VsdHNbMF0gOiByZXN1bHRzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5wcmV2ID0gc3RyYWlnaHQoJ3ByZXYnKTtcbkRvbWludXMucHJvdG90eXBlLm5leHQgPSBzdHJhaWdodCgnbmV4dCcpO1xuRG9taW51cy5wcm90b3R5cGUucGFyZW50ID0gc3RyYWlnaHQoJ3BhcmVudCcpO1xuRG9taW51cy5wcm90b3R5cGUucGFyZW50cyA9IHN0cmFpZ2h0KCdwYXJlbnRzJyk7XG5Eb21pbnVzLnByb3RvdHlwZS5jaGlsZHJlbiA9IHN0cmFpZ2h0KCdjaGlsZHJlbicpO1xuRG9taW51cy5wcm90b3R5cGUuZmluZCA9IHN0cmFpZ2h0KCdxc2EnKTtcbkRvbWludXMucHJvdG90eXBlLmZpbmRPbmUgPSBzdHJhaWdodCgncXMnLCB0cnVlKTtcblxuRG9taW51cy5wcm90b3R5cGUud2hlcmUgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHRoaXMuZmlsdGVyKGVxdWFscyhzZWxlY3RvcikpO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUuaXMgPSBmdW5jdGlvbiAoc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHRoaXMuc29tZShlcXVhbHMoc2VsZWN0b3IpKTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmkgPSBmdW5jdGlvbiAoaW5kZXgpIHtcbiAgcmV0dXJuIG5ldyBEb21pbnVzKHRoaXNbaW5kZXhdKTtcbn07XG5cbmZ1bmN0aW9uIGNvbXBhcmVGYWN0b3J5IChmbikge1xuICByZXR1cm4gZnVuY3Rpb24gY29tcGFyZSAoKSB7XG4gICAgJC5hcHBseShudWxsLCBhcmd1bWVudHMpLmZvckVhY2goZm4sIHRoaXMpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5hbmQgPSBjb21wYXJlRmFjdG9yeShmdW5jdGlvbiBhZGRPbmUgKGVsZW0pIHtcbiAgaWYgKHRoaXMuaW5kZXhPZihlbGVtKSA9PT0gLTEpIHtcbiAgICB0aGlzLnB1c2goZWxlbSk7XG4gIH1cbiAgcmV0dXJuIHRoaXM7XG59KTtcblxuRG9taW51cy5wcm90b3R5cGUuYnV0ID0gY29tcGFyZUZhY3RvcnkoZnVuY3Rpb24gYWRkT25lIChlbGVtKSB7XG4gIHZhciBpbmRleCA9IHRoaXMuaW5kZXhPZihlbGVtKTtcbiAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgIHRoaXMuc3BsaWNlKGluZGV4LCAxKTtcbiAgfVxuICByZXR1cm4gdGhpcztcbn0pO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5vbiA9IGZ1bmN0aW9uICh0eXBlcywgZmlsdGVyLCBmbikge1xuICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICB0eXBlcy5zcGxpdCgnICcpLmZvckVhY2goZnVuY3Rpb24gKHR5cGUpIHtcbiAgICAgIGRvbS5vbihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuRG9taW51cy5wcm90b3R5cGUub2ZmID0gZnVuY3Rpb24gKHR5cGVzLCBmaWx0ZXIsIGZuKSB7XG4gIHRoaXMuZm9yRWFjaChmdW5jdGlvbiAoZWxlbSkge1xuICAgIHR5cGVzLnNwbGl0KCcgJykuZm9yRWFjaChmdW5jdGlvbiAodHlwZSkge1xuICAgICAgZG9tLm9mZihlbGVtLCB0eXBlLCBmaWx0ZXIsIGZuKTtcbiAgICB9KTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuW1xuICBbJ2FkZENsYXNzJywgY2xhc3Nlcy5hZGRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3NldENsYXNzJywgY2xhc3Nlcy5zZXRdLFxuICBbJ3JlbW92ZUNsYXNzJywgY2xhc3Nlcy5yZW1vdmVdLFxuICBbJ3JlbW92ZScsIGRvbS5yZW1vdmVdXG5dLmZvckVhY2gobWFwTWV0aG9kcyk7XG5cbmZ1bmN0aW9uIG1hcE1ldGhvZHMgKGRhdGEpIHtcbiAgRG9taW51cy5wcm90b3R5cGVbZGF0YVswXV0gPSBmdW5jdGlvbiAodmFsdWUpIHtcbiAgICB0aGlzLmZvckVhY2goZnVuY3Rpb24gKGVsZW0pIHtcbiAgICAgIGRhdGFbMV0oZWxlbSwgdmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5bXG4gIFsnYXBwZW5kJywgZG9tLmFwcGVuZF0sXG4gIFsnYXBwZW5kVG8nLCBkb20uYXBwZW5kVG9dLFxuICBbJ3ByZXBlbmQnLCBkb20ucHJlcGVuZF0sXG4gIFsncHJlcGVuZFRvJywgZG9tLnByZXBlbmRUb10sXG4gIFsnYmVmb3JlJywgZG9tLmJlZm9yZV0sXG4gIFsnYmVmb3JlT2YnLCBkb20uYmVmb3JlT2ZdLFxuICBbJ2FmdGVyJywgZG9tLmFmdGVyXSxcbiAgWydhZnRlck9mJywgZG9tLmFmdGVyT2ZdLFxuICBbJ3Nob3cnLCBkb20uc2hvd10sXG4gIFsnaGlkZScsIGRvbS5oaWRlXVxuXS5mb3JFYWNoKG1hcE1hbmlwdWxhdGlvbik7XG5cbmZ1bmN0aW9uIG1hcE1hbmlwdWxhdGlvbiAoZGF0YSkge1xuICBEb21pbnVzLnByb3RvdHlwZVtkYXRhWzBdXSA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIGRhdGFbMV0odGhpcywgdmFsdWUpO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xufVxuXG5Eb21pbnVzLnByb3RvdHlwZS5oYXNDbGFzcyA9IGZ1bmN0aW9uICh2YWx1ZSkge1xuICByZXR1cm4gdGhpcy5zb21lKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGNsYXNzZXMuY29udGFpbnMoZWxlbSwgdmFsdWUpO1xuICB9KTtcbn07XG5cbkRvbWludXMucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgdmFyIGdldHRlciA9IGFyZ3VtZW50cy5sZW5ndGggPCAyO1xuICB2YXIgcmVzdWx0ID0gdGhpcy5tYXAoZnVuY3Rpb24gKGVsZW0pIHtcbiAgICByZXR1cm4gZ2V0dGVyID8gZG9tLmF0dHIoZWxlbSwgbmFtZSkgOiBkb20uYXR0cihlbGVtLCBuYW1lLCB2YWx1ZSk7XG4gIH0pO1xuICByZXR1cm4gZ2V0dGVyID8gcmVzdWx0WzBdIDogdGhpcztcbn07XG5cbmZ1bmN0aW9uIGtleVZhbHVlIChrZXksIHZhbHVlKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMjtcbiAgaWYgKGdldHRlcikge1xuICAgIHJldHVybiB0aGlzLmxlbmd0aCA/IGRvbVtrZXldKHRoaXNbMF0pIDogJyc7XG4gIH1cbiAgdGhpcy5mb3JFYWNoKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgZG9tW2tleV0oZWxlbSwgdmFsdWUpO1xuICB9KTtcbiAgcmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGtleVZhbHVlUHJvcGVydHkgKHByb3ApIHtcbiAgRG9taW51cy5wcm90b3R5cGVbcHJvcF0gPSBmdW5jdGlvbiBhY2Nlc3NvciAodmFsdWUpIHtcbiAgICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDE7XG4gICAgaWYgKGdldHRlcikge1xuICAgICAgcmV0dXJuIGtleVZhbHVlLmNhbGwodGhpcywgcHJvcCk7XG4gICAgfVxuICAgIHJldHVybiBrZXlWYWx1ZS5jYWxsKHRoaXMsIHByb3AsIHZhbHVlKTtcbiAgfTtcbn1cblxuWydodG1sJywgJ3RleHQnLCAndmFsdWUnXS5mb3JFYWNoKGtleVZhbHVlUHJvcGVydHkpO1xuXG5Eb21pbnVzLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uICgpIHtcbiAgcmV0dXJuIHRoaXMubWFwKGZ1bmN0aW9uIChlbGVtKSB7XG4gICAgcmV0dXJuIGRvbS5jbG9uZShlbGVtKTtcbiAgfSk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vcHVibGljJyk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB0cmltID0gL15cXHMrfFxccyskL2c7XG52YXIgd2hpdGVzcGFjZSA9IC9cXHMrL2c7XG5cbmZ1bmN0aW9uIGludGVycHJldCAoaW5wdXQpIHtcbiAgcmV0dXJuIHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycgPyBpbnB1dC5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKSA6IGlucHV0O1xufVxuXG5mdW5jdGlvbiBjbGFzc2VzIChub2RlKSB7XG4gIHJldHVybiBub2RlLmNsYXNzTmFtZS5yZXBsYWNlKHRyaW0sICcnKS5zcGxpdCh3aGl0ZXNwYWNlKTtcbn1cblxuZnVuY3Rpb24gc2V0IChub2RlLCBpbnB1dCkge1xuICBub2RlLmNsYXNzTmFtZSA9IGludGVycHJldChpbnB1dCkuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBhZGQgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gcmVtb3ZlKG5vZGUsIGlucHV0KTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIGN1cnJlbnQucHVzaC5hcHBseShjdXJyZW50LCB2YWx1ZXMpO1xuICBzZXQobm9kZSwgY3VycmVudCk7XG4gIHJldHVybiBjdXJyZW50O1xufVxuXG5mdW5jdGlvbiByZW1vdmUgKG5vZGUsIGlucHV0KSB7XG4gIHZhciBjdXJyZW50ID0gY2xhc3Nlcyhub2RlKTtcbiAgdmFyIHZhbHVlcyA9IGludGVycHJldChpbnB1dCk7XG4gIHZhbHVlcy5mb3JFYWNoKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgIHZhciBpID0gY3VycmVudC5pbmRleE9mKHZhbHVlKTtcbiAgICBpZiAoaSAhPT0gLTEpIHtcbiAgICAgIGN1cnJlbnQuc3BsaWNlKGksIDEpO1xuICAgIH1cbiAgfSk7XG4gIHNldChub2RlLCBjdXJyZW50KTtcbiAgcmV0dXJuIGN1cnJlbnQ7XG59XG5cbmZ1bmN0aW9uIGNvbnRhaW5zIChub2RlLCBpbnB1dCkge1xuICB2YXIgY3VycmVudCA9IGNsYXNzZXMobm9kZSk7XG4gIHZhciB2YWx1ZXMgPSBpbnRlcnByZXQoaW5wdXQpO1xuXG4gIHJldHVybiB2YWx1ZXMuZXZlcnkoZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgcmV0dXJuIGN1cnJlbnQuaW5kZXhPZih2YWx1ZSkgIT09IC0xO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICByZW1vdmU6IHJlbW92ZSxcbiAgY29udGFpbnM6IGNvbnRhaW5zLFxuICBzZXQ6IHNldCxcbiAgZ2V0OiBjbGFzc2VzXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdGVzdCA9IHJlcXVpcmUoJy4vdGVzdCcpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHByb3RvID0gRG9taW51cy5wcm90b3R5cGU7XG5cbmZ1bmN0aW9uIEFwcGxpZWQgKGFyZ3MpIHtcbiAgcmV0dXJuIERvbWludXMuYXBwbHkodGhpcywgYXJncyk7XG59XG5cbkFwcGxpZWQucHJvdG90eXBlID0gcHJvdG87XG5cblsnbWFwJywgJ2ZpbHRlcicsICdjb25jYXQnXS5mb3JFYWNoKGVuc3VyZSk7XG5cbmZ1bmN0aW9uIGVuc3VyZSAoa2V5KSB7XG4gIHZhciBvcmlnaW5hbCA9IHByb3RvW2tleV07XG4gIHByb3RvW2tleV0gPSBmdW5jdGlvbiBhcHBsaWVkICgpIHtcbiAgICByZXR1cm4gYXBwbHkob3JpZ2luYWwuYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XG4gIH07XG59XG5cbmZ1bmN0aW9uIGFwcGx5IChhKSB7XG4gIHJldHVybiBuZXcgQXBwbGllZChhKTtcbn1cblxuZnVuY3Rpb24gY2FzdCAoYSkge1xuICBpZiAoYSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICByZXR1cm4gYTtcbiAgfVxuICBpZiAoIWEpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoYSk7XG4gIH1cbiAgaWYgKCF0ZXN0LmlzQXJyYXkoYSkpIHtcbiAgICByZXR1cm4gbmV3IERvbWludXMoKTtcbiAgfVxuICByZXR1cm4gYXBwbHkoYSkuZmlsdGVyKGZ1bmN0aW9uIChpKSB7XG4gICAgcmV0dXJuIHRlc3QuaXNFbGVtZW50KGkpO1xuICB9KTtcbn1cblxuZnVuY3Rpb24gZmxhdHRlbiAoYSwgY2FjaGUpIHtcbiAgcmV0dXJuIGEucmVkdWNlKGZ1bmN0aW9uIChjdXJyZW50LCBpdGVtKSB7XG4gICAgaWYgKERvbWludXMuaXNBcnJheShpdGVtKSkge1xuICAgICAgcmV0dXJuIGZsYXR0ZW4oaXRlbSwgY3VycmVudCk7XG4gICAgfSBlbHNlIGlmIChjdXJyZW50LmluZGV4T2YoaXRlbSkgPT09IC0xKSB7XG4gICAgICByZXR1cm4gY3VycmVudC5jb25jYXQoaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiBjdXJyZW50O1xuICB9LCBjYWNoZSB8fCBuZXcgRG9taW51cygpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFwcGx5OiBhcHBseSxcbiAgY2FzdDogY2FzdCxcbiAgZmxhdHRlbjogZmxhdHRlblxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHNla3RvciA9IHJlcXVpcmUoJ3Nla3RvcicpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIGNvcmUgPSByZXF1aXJlKCcuL2NvcmUnKTtcbnZhciBldmVudHMgPSByZXF1aXJlKCcuL2V2ZW50cycpO1xudmFyIHRleHQgPSByZXF1aXJlKCcuL3RleHQnKTtcbnZhciB0ZXN0ID0gcmVxdWlyZSgnLi90ZXN0Jyk7XG52YXIgYXBpID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBkZWxlZ2F0ZXMgPSB7fTtcblxuZnVuY3Rpb24gY2FzdENvbnRleHQgKGNvbnRleHQpIHtcbiAgaWYgKHR5cGVvZiBjb250ZXh0ID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBhcGkucXMobnVsbCwgY29udGV4dCk7XG4gIH1cbiAgaWYgKHRlc3QuaXNFbGVtZW50KGNvbnRleHQpKSB7XG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cbiAgaWYgKGNvbnRleHQgaW5zdGFuY2VvZiBEb21pbnVzKSB7XG4gICAgcmV0dXJuIGNvbnRleHRbMF07XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59XG5cbmFwaS5xc2EgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgdmFyIHJlc3VsdHMgPSBuZXcgRG9taW51cygpO1xuICByZXR1cm4gc2VrdG9yKHNlbGVjdG9yLCBjYXN0Q29udGV4dChlbGVtKSwgcmVzdWx0cyk7XG59O1xuXG5hcGkucXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIGFwaS5xc2EoZWxlbSwgc2VsZWN0b3IpWzBdO1xufTtcblxuYXBpLm1hdGNoZXMgPSBmdW5jdGlvbiAoZWxlbSwgc2VsZWN0b3IpIHtcbiAgcmV0dXJuIHNla3Rvci5tYXRjaGVzU2VsZWN0b3IoZWxlbSwgc2VsZWN0b3IpO1xufTtcblxuZnVuY3Rpb24gcmVsYXRlZEZhY3RvcnkgKHByb3ApIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHJlbGF0ZWQgKGVsZW0sIHNlbGVjdG9yKSB7XG4gICAgdmFyIHJlbGF0aXZlID0gZWxlbVtwcm9wXTtcbiAgICBpZiAocmVsYXRpdmUpIHtcbiAgICAgIGlmICghc2VsZWN0b3IgfHwgYXBpLm1hdGNoZXMocmVsYXRpdmUsIHNlbGVjdG9yKSkge1xuICAgICAgICByZXR1cm4gY29yZS5jYXN0KHJlbGF0aXZlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH07XG59XG5cbmFwaS5wcmV2ID0gcmVsYXRlZEZhY3RvcnkoJ3ByZXZpb3VzU2libGluZycpO1xuYXBpLm5leHQgPSByZWxhdGVkRmFjdG9yeSgnbmV4dFNpYmxpbmcnKTtcbmFwaS5wYXJlbnQgPSByZWxhdGVkRmFjdG9yeSgncGFyZW50RWxlbWVudCcpO1xuXG5mdW5jdGlvbiBtYXRjaGVzIChlbGVtLCB2YWx1ZSkge1xuICBpZiAoIXZhbHVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRG9taW51cykge1xuICAgIHJldHVybiB2YWx1ZS5pbmRleE9mKGVsZW0pICE9PSAtMTtcbiAgfVxuICBpZiAodGVzdC5pc0VsZW1lbnQodmFsdWUpKSB7XG4gICAgcmV0dXJuIGVsZW0gPT09IHZhbHVlO1xuICB9XG4gIHJldHVybiBhcGkubWF0Y2hlcyhlbGVtLCB2YWx1ZSk7XG59XG5cbmFwaS5wYXJlbnRzID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBub2RlcyA9IFtdO1xuICB2YXIgbm9kZSA9IGVsZW07XG4gIHdoaWxlIChub2RlLnBhcmVudEVsZW1lbnQpIHtcbiAgICBpZiAobWF0Y2hlcyhub2RlLnBhcmVudEVsZW1lbnQsIHZhbHVlKSkge1xuICAgICAgbm9kZXMucHVzaChub2RlLnBhcmVudEVsZW1lbnQpO1xuICAgIH1cbiAgICBub2RlID0gbm9kZS5wYXJlbnRFbGVtZW50O1xuICB9XG4gIHJldHVybiBjb3JlLmFwcGx5KG5vZGVzKTtcbn07XG5cbmFwaS5jaGlsZHJlbiA9IGZ1bmN0aW9uIChlbGVtLCB2YWx1ZSkge1xuICB2YXIgbm9kZXMgPSBbXTtcbiAgdmFyIGNoaWxkcmVuID0gZWxlbS5jaGlsZHJlbjtcbiAgdmFyIGNoaWxkO1xuICB2YXIgaTtcbiAgZm9yIChpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgY2hpbGQgPSBjaGlsZHJlbltpXTtcbiAgICBpZiAobWF0Y2hlcyhjaGlsZCwgdmFsdWUpKSB7XG4gICAgICBub2Rlcy5wdXNoKGNoaWxkKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNvcmUuYXBwbHkobm9kZXMpO1xufTtcblxuLy8gdGhpcyBtZXRob2QgY2FjaGVzIGRlbGVnYXRlcyBzbyB0aGF0IC5vZmYoKSB3b3JrcyBzZWFtbGVzc2x5XG5mdW5jdGlvbiBkZWxlZ2F0ZSAocm9vdCwgZmlsdGVyLCBmbikge1xuICBpZiAoZGVsZWdhdGVzW2ZuLl9kZF0pIHtcbiAgICByZXR1cm4gZGVsZWdhdGVzW2ZuLl9kZF07XG4gIH1cbiAgZm4uX2RkID0gRGF0ZS5ub3coKTtcbiAgZGVsZWdhdGVzW2ZuLl9kZF0gPSBkZWxlZ2F0b3I7XG4gIGZ1bmN0aW9uIGRlbGVnYXRvciAoZSkge1xuICAgIHZhciBlbGVtID0gZS50YXJnZXQ7XG4gICAgd2hpbGUgKGVsZW0gJiYgZWxlbSAhPT0gcm9vdCkge1xuICAgICAgaWYgKGFwaS5tYXRjaGVzKGVsZW0sIGZpbHRlcikpIHtcbiAgICAgICAgZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTsgcmV0dXJuO1xuICAgICAgfVxuICAgICAgZWxlbSA9IGVsZW0ucGFyZW50RWxlbWVudDtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlbGVnYXRvcjtcbn1cblxuYXBpLm9uID0gZnVuY3Rpb24gKGVsZW0sIHR5cGUsIGZpbHRlciwgZm4pIHtcbiAgaWYgKGZuID09PSB2b2lkIDApIHtcbiAgICBldmVudHMuYWRkKGVsZW0sIHR5cGUsIGZpbHRlcik7IC8vIGZpbHRlciBfaXNfIGZuXG4gIH0gZWxzZSB7XG4gICAgZXZlbnRzLmFkZChlbGVtLCB0eXBlLCBkZWxlZ2F0ZShlbGVtLCBmaWx0ZXIsIGZuKSk7XG4gIH1cbn07XG5cbmFwaS5vZmYgPSBmdW5jdGlvbiAoZWxlbSwgdHlwZSwgZmlsdGVyLCBmbikge1xuICBpZiAoZm4gPT09IHZvaWQgMCkge1xuICAgIGV2ZW50cy5yZW1vdmUoZWxlbSwgdHlwZSwgZmlsdGVyKTsgLy8gZmlsdGVyIF9pc18gZm5cbiAgfSBlbHNlIHtcbiAgICBldmVudHMucmVtb3ZlKGVsZW0sIHR5cGUsIGRlbGVnYXRlKGVsZW0sIGZpbHRlciwgZm4pKTtcbiAgfVxufTtcblxuYXBpLmh0bWwgPSBmdW5jdGlvbiAoZWxlbSwgaHRtbCkge1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gZWxlbS5pbm5lckhUTUw7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lckhUTUwgPSBodG1sO1xuICB9XG59O1xuXG5hcGkudGV4dCA9IGZ1bmN0aW9uIChlbGVtLCB0ZXh0KSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS52YWx1ZSA6IGVsZW0uaW5uZXJUZXh0IHx8IGVsZW0udGV4dENvbnRlbnQ7XG4gIH0gZWxzZSBpZiAoY2hlY2thYmxlKSB7XG4gICAgZWxlbS52YWx1ZSA9IHRleHQ7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5pbm5lclRleHQgPSBlbGVtLnRleHRDb250ZW50ID0gdGV4dDtcbiAgfVxufTtcblxuYXBpLnZhbHVlID0gZnVuY3Rpb24gKGVsZW0sIHZhbHVlKSB7XG4gIHZhciBjaGVja2FibGUgPSB0ZXN0LmlzQ2hlY2thYmxlKGVsZW0pO1xuICB2YXIgZ2V0dGVyID0gYXJndW1lbnRzLmxlbmd0aCA8IDI7XG4gIGlmIChnZXR0ZXIpIHtcbiAgICByZXR1cm4gY2hlY2thYmxlID8gZWxlbS5jaGVja2VkIDogZWxlbS52YWx1ZTtcbiAgfSBlbHNlIGlmIChjaGVja2FibGUpIHtcbiAgICBlbGVtLmNoZWNrZWQgPSB2YWx1ZTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnZhbHVlID0gdmFsdWU7XG4gIH1cbn07XG5cbmFwaS5hdHRyID0gZnVuY3Rpb24gKGVsZW0sIG5hbWUsIHZhbHVlKSB7XG4gIHZhciBnZXR0ZXIgPSBhcmd1bWVudHMubGVuZ3RoIDwgMztcbiAgdmFyIGNhbWVsID0gdGV4dC5oeXBoZW5Ub0NhbWVsKG5hbWUpO1xuICBpZiAoZ2V0dGVyKSB7XG4gICAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICAgIHJldHVybiBlbGVtW2NhbWVsXTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGVsZW0uZ2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcbiAgICB9XG4gIH1cbiAgaWYgKGNhbWVsIGluIGVsZW0pIHtcbiAgICBlbGVtW2NhbWVsXSA9IHZhbHVlO1xuICB9IGVsc2UgaWYgKHZhbHVlID09PSBudWxsIHx8IHZhbHVlID09PSB2b2lkIDApIHtcbiAgICBlbGVtLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG4gIH1cbn07XG5cbmFwaS5tYWtlID0gZnVuY3Rpb24gKHR5cGUpIHtcbiAgcmV0dXJuIG5ldyBEb21pbnVzKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodHlwZSkpO1xufTtcblxuYXBpLmNsb25lID0gZnVuY3Rpb24gKGVsZW0pIHtcbiAgcmV0dXJuIGVsZW0uY2xvbmVOb2RlKHRydWUpO1xufTtcblxuYXBpLnJlbW92ZSA9IGZ1bmN0aW9uIChlbGVtKSB7XG4gIGlmIChlbGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICBlbGVtLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoZWxlbSk7XG4gIH1cbn07XG5cbmFwaS5hcHBlbmQgPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gIGlmIChtYW5pcHVsYXRpb25HdWFyZChlbGVtLCB0YXJnZXQsIGFwaS5hcHBlbmQpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGVsZW0uYXBwZW5kQ2hpbGQodGFyZ2V0KTtcbn07XG5cbmFwaS5wcmVwZW5kID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkucHJlcGVuZCkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZWxlbS5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtLmZpcnN0Q2hpbGQpO1xufTtcblxuYXBpLmJlZm9yZSA9IGZ1bmN0aW9uIChlbGVtLCB0YXJnZXQpIHtcbiAgaWYgKG1hbmlwdWxhdGlvbkd1YXJkKGVsZW0sIHRhcmdldCwgYXBpLmJlZm9yZSkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKGVsZW0ucGFyZW50RWxlbWVudCkge1xuICAgIGVsZW0ucGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUodGFyZ2V0LCBlbGVtKTtcbiAgfVxufTtcblxuYXBpLmFmdGVyID0gZnVuY3Rpb24gKGVsZW0sIHRhcmdldCkge1xuICBpZiAobWFuaXB1bGF0aW9uR3VhcmQoZWxlbSwgdGFyZ2V0LCBhcGkuYWZ0ZXIpKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmIChlbGVtLnBhcmVudEVsZW1lbnQpIHtcbiAgICBlbGVtLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHRhcmdldCwgZWxlbS5uZXh0U2libGluZyk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIG1hbmlwdWxhdGlvbkd1YXJkIChlbGVtLCB0YXJnZXQsIGZuKSB7XG4gIHZhciByaWdodCA9IHRhcmdldCBpbnN0YW5jZW9mIERvbWludXM7XG4gIHZhciBsZWZ0ID0gZWxlbSBpbnN0YW5jZW9mIERvbWludXM7XG4gIGlmIChsZWZ0KSB7XG4gICAgZWxlbS5mb3JFYWNoKG1hbmlwdWxhdGVNYW55KTtcbiAgfSBlbHNlIGlmIChyaWdodCkge1xuICAgIG1hbmlwdWxhdGUoZWxlbSwgdHJ1ZSk7XG4gIH1cbiAgcmV0dXJuIGxlZnQgfHwgcmlnaHQ7XG5cbiAgZnVuY3Rpb24gbWFuaXB1bGF0ZSAoZWxlbSwgcHJlY29uZGl0aW9uKSB7XG4gICAgaWYgKHJpZ2h0KSB7XG4gICAgICB0YXJnZXQuZm9yRWFjaChmdW5jdGlvbiAodGFyZ2V0LCBqKSB7XG4gICAgICAgIGZuKGVsZW0sIGNsb25lVW5sZXNzKHRhcmdldCwgcHJlY29uZGl0aW9uICYmIGogPT09IDApKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBmbihlbGVtLCBjbG9uZVVubGVzcyh0YXJnZXQsIHByZWNvbmRpdGlvbikpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG1hbmlwdWxhdGVNYW55IChlbGVtLCBpKSB7XG4gICAgbWFuaXB1bGF0ZShlbGVtLCBpID09PSAwKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBjbG9uZVVubGVzcyAodGFyZ2V0LCBjb25kaXRpb24pIHtcbiAgcmV0dXJuIGNvbmRpdGlvbiA/IHRhcmdldCA6IGFwaS5jbG9uZSh0YXJnZXQpO1xufVxuXG5bJ2FwcGVuZFRvJywgJ3ByZXBlbmRUbycsICdiZWZvcmVPZicsICdhZnRlck9mJ10uZm9yRWFjaChmbGlwKTtcblxuZnVuY3Rpb24gZmxpcCAoa2V5KSB7XG4gIHZhciBvcmlnaW5hbCA9IGtleS5zcGxpdCgvW0EtWl0vKVswXTtcbiAgYXBpW2tleV0gPSBmdW5jdGlvbiAoZWxlbSwgdGFyZ2V0KSB7XG4gICAgYXBpW29yaWdpbmFsXSh0YXJnZXQsIGVsZW0pO1xuICB9O1xufVxuXG5hcGkuc2hvdyA9IGZ1bmN0aW9uIChlbGVtLCBzaG91bGQsIGludmVydCkge1xuICBpZiAoZWxlbSBpbnN0YW5jZW9mIERvbWludXMpIHtcbiAgICBlbGVtLmZvckVhY2goc2hvd1Rlc3QpO1xuICB9IGVsc2Uge1xuICAgIHNob3dUZXN0KGVsZW0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc2hvd1Rlc3QgKGN1cnJlbnQpIHtcbiAgICB2YXIgb2sgPSBzaG91bGQgPT09IHZvaWQgMCB8fCBzaG91bGQgPT09IHRydWUgfHwgdHlwZW9mIHNob3VsZCA9PT0gJ2Z1bmN0aW9uJyAmJiBzaG91bGQuY2FsbChjdXJyZW50KTtcbiAgICBkaXNwbGF5KGN1cnJlbnQsIGludmVydCA/ICFvayA6IG9rKTtcbiAgfVxufTtcblxuYXBpLmhpZGUgPSBmdW5jdGlvbiAoZWxlbSwgc2hvdWxkKSB7XG4gIGFwaS5zaG93KGVsZW0sIHNob3VsZCwgdHJ1ZSk7XG59O1xuXG5mdW5jdGlvbiBkaXNwbGF5IChlbGVtLCBzaG91bGQpIHtcbiAgaWYgKHNob3VsZCkge1xuICAgIGVsZW0uc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gIH0gZWxzZSB7XG4gICAgZWxlbS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9Eb21pbnVzLnByb3RvdHlwZScpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgYWRkRXZlbnQgPSBhZGRFdmVudEVhc3k7XG52YXIgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEVhc3k7XG52YXIgaGFyZENhY2hlID0gW107XG5cbmlmICghd2luZG93LmFkZEV2ZW50TGlzdGVuZXIpIHtcbiAgYWRkRXZlbnQgPSBhZGRFdmVudEhhcmQ7XG59XG5cbmlmICghd2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIpIHtcbiAgcmVtb3ZlRXZlbnQgPSByZW1vdmVFdmVudEhhcmQ7XG59XG5cbmZ1bmN0aW9uIGFkZEV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiBhZGRFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuYXR0YWNoRXZlbnQoJ29uJyArIGV2dCwgd3JhcChlbGVtZW50LCBldnQsIGZuKSk7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUV2ZW50RWFzeSAoZWxlbWVudCwgZXZ0LCBmbikge1xuICByZXR1cm4gZWxlbWVudC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dCwgZm4pO1xufVxuXG5mdW5jdGlvbiByZW1vdmVFdmVudEhhcmQgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGVsZW1lbnQuZGV0YWNoRXZlbnQoJ29uJyArIGV2dCwgdW53cmFwKGVsZW1lbnQsIGV2dCwgZm4pKTtcbn1cblxuZnVuY3Rpb24gd3JhcHBlckZhY3RvcnkgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIHdyYXBwZXIgKG9yaWdpbmFsRXZlbnQpIHtcbiAgICB2YXIgZSA9IG9yaWdpbmFsRXZlbnQgfHwgd2luZG93LmV2ZW50O1xuICAgIGUudGFyZ2V0ID0gZS50YXJnZXQgfHwgZS5zcmNFbGVtZW50O1xuICAgIGUucHJldmVudERlZmF1bHQgID0gZS5wcmV2ZW50RGVmYXVsdCAgfHwgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKCkgeyBlLnJldHVyblZhbHVlID0gZmFsc2U7IH07XG4gICAgZS5zdG9wUHJvcGFnYXRpb24gPSBlLnN0b3BQcm9wYWdhdGlvbiB8fCBmdW5jdGlvbiBzdG9wUHJvcGFnYXRpb24gKCkgeyBlLmNhbmNlbEJ1YmJsZSA9IHRydWU7IH07XG4gICAgZm4uY2FsbChlbGVtZW50LCBlKTtcbiAgfTtcbn1cblxuZnVuY3Rpb24gd3JhcCAoZWxlbWVudCwgZXZ0LCBmbikge1xuICB2YXIgd3JhcHBlciA9IHVud3JhcChlbGVtZW50LCBldnQsIGZuKSB8fCB3cmFwcGVyRmFjdG9yeShlbGVtZW50LCBldnQsIGZuKTtcbiAgaGFyZENhY2hlLnB1c2goe1xuICAgIHdyYXBwZXI6IHdyYXBwZXIsXG4gICAgZWxlbWVudDogZWxlbWVudCxcbiAgICBldnQ6IGV2dCxcbiAgICBmbjogZm5cbiAgfSk7XG4gIHJldHVybiB3cmFwcGVyO1xufVxuXG5mdW5jdGlvbiB1bndyYXAgKGVsZW1lbnQsIGV2dCwgZm4pIHtcbiAgdmFyIGkgPSBmaW5kKGVsZW1lbnQsIGV2dCwgZm4pO1xuICBpZiAoaSkge1xuICAgIHZhciB3cmFwcGVyID0gaGFyZENhY2hlW2ldLndyYXBwZXI7XG4gICAgaGFyZENhY2hlLnNwbGljZShpLCAxKTsgLy8gZnJlZSB1cCBhIHRhZCBvZiBtZW1vcnlcbiAgICByZXR1cm4gd3JhcHBlcjtcbiAgfVxufVxuXG5mdW5jdGlvbiBmaW5kIChlbGVtZW50LCBldnQsIGZuKSB7XG4gIHZhciBpLCBpdGVtO1xuICBmb3IgKGkgPSAwOyBpIDwgaGFyZENhY2hlLmxlbmd0aDsgaSsrKSB7XG4gICAgaXRlbSA9IGhhcmRDYWNoZVtpXTtcbiAgICBpZiAoaXRlbS5lbGVtZW50ID09PSBlbGVtZW50ICYmIGl0ZW0uZXZ0ID09PSBldnQgJiYgaXRlbS5mbiA9PT0gZm4pIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRFdmVudCxcbiAgcmVtb3ZlOiByZW1vdmVFdmVudFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGRvbSA9IHJlcXVpcmUoJy4vZG9tJyk7XG52YXIgY29yZSA9IHJlcXVpcmUoJy4vY29yZScpO1xudmFyIERvbWludXMgPSByZXF1aXJlKCcuL0RvbWludXMuY3RvcicpO1xudmFyIHRhZyA9IC9eXFxzKjwoW2Etel0rKD86LVthLXpdKyk/KVxccypcXC8/PlxccyokL2k7XG5cbmZ1bmN0aW9uIGFwaSAoc2VsZWN0b3IsIGNvbnRleHQpIHtcbiAgdmFyIG5vdFRleHQgPSB0eXBlb2Ygc2VsZWN0b3IgIT09ICdzdHJpbmcnO1xuICBpZiAobm90VGV4dCAmJiBhcmd1bWVudHMubGVuZ3RoIDwgMikge1xuICAgIHJldHVybiBjb3JlLmNhc3Qoc2VsZWN0b3IpO1xuICB9XG4gIGlmIChub3RUZXh0KSB7XG4gICAgcmV0dXJuIG5ldyBEb21pbnVzKCk7XG4gIH1cbiAgdmFyIG1hdGNoZXMgPSBzZWxlY3Rvci5tYXRjaCh0YWcpO1xuICBpZiAobWF0Y2hlcykge1xuICAgIHJldHVybiBkb20ubWFrZShtYXRjaGVzWzFdKTtcbiAgfVxuICByZXR1cm4gYXBpLmZpbmQoc2VsZWN0b3IsIGNvbnRleHQpO1xufVxuXG5hcGkuZmluZCA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzYShjb250ZXh0LCBzZWxlY3Rvcik7XG59O1xuXG5hcGkuZmluZE9uZSA9IGZ1bmN0aW9uIChzZWxlY3RvciwgY29udGV4dCkge1xuICByZXR1cm4gZG9tLnFzKGNvbnRleHQsIHNlbGVjdG9yKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gYXBpO1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbm9kZU9iamVjdHMgPSB0eXBlb2YgTm9kZSA9PT0gJ29iamVjdCc7XG52YXIgZWxlbWVudE9iamVjdHMgPSB0eXBlb2YgSFRNTEVsZW1lbnQgPT09ICdvYmplY3QnO1xuXG5mdW5jdGlvbiBpc05vZGUgKG8pIHtcbiAgcmV0dXJuIG5vZGVPYmplY3RzID8gbyBpbnN0YW5jZW9mIE5vZGUgOiBpc05vZGVPYmplY3Qobyk7XG59XG5cbmZ1bmN0aW9uIGlzTm9kZU9iamVjdCAobykge1xuICByZXR1cm4gbyAmJlxuICAgIHR5cGVvZiBvID09PSAnb2JqZWN0JyAmJlxuICAgIHR5cGVvZiBvLm5vZGVOYW1lID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBvLm5vZGVUeXBlID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50IChvKSB7XG4gIHJldHVybiBlbGVtZW50T2JqZWN0cyA/IG8gaW5zdGFuY2VvZiBIVE1MRWxlbWVudCA6IGlzRWxlbWVudE9iamVjdChvKTtcbn1cblxuZnVuY3Rpb24gaXNFbGVtZW50T2JqZWN0IChvKSB7XG4gIHJldHVybiBvICYmXG4gICAgdHlwZW9mIG8gPT09ICdvYmplY3QnICYmXG4gICAgdHlwZW9mIG8ubm9kZU5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgby5ub2RlVHlwZSA9PT0gMTtcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoYSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGEpID09PSAnW29iamVjdCBBcnJheV0nO1xufVxuXG5mdW5jdGlvbiBpc0NoZWNrYWJsZSAoZWxlbSkge1xuICByZXR1cm4gJ2NoZWNrZWQnIGluIGVsZW0gJiYgZWxlbS50eXBlID09PSAncmFkaW8nIHx8IGVsZW0udHlwZSA9PT0gJ2NoZWNrYm94Jztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGlzTm9kZTogaXNOb2RlLFxuICBpc0VsZW1lbnQ6IGlzRWxlbWVudCxcbiAgaXNBcnJheTogaXNBcnJheSxcbiAgaXNDaGVja2FibGU6IGlzQ2hlY2thYmxlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBoeXBoZW5Ub0NhbWVsIChoeXBoZW5zKSB7XG4gIHZhciBwYXJ0ID0gLy0oW2Etel0pL2c7XG4gIHJldHVybiBoeXBoZW5zLnJlcGxhY2UocGFydCwgZnVuY3Rpb24gKGcsIG0pIHtcbiAgICByZXR1cm4gbS50b1VwcGVyQ2FzZSgpO1xuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGh5cGhlblRvQ2FtZWw6IGh5cGhlblRvQ2FtZWxcbn07XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4hZnVuY3Rpb24oZSl7aWYoXCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHMpbW9kdWxlLmV4cG9ydHM9ZSgpO2Vsc2UgaWYoXCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kKWRlZmluZShlKTtlbHNle3ZhciBmO1widW5kZWZpbmVkXCIhPXR5cGVvZiB3aW5kb3c/Zj13aW5kb3c6XCJ1bmRlZmluZWRcIiE9dHlwZW9mIGdsb2JhbD9mPWdsb2JhbDpcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZiYmKGY9c2VsZiksZi5qYWRlPWUoKX19KGZ1bmN0aW9uKCl7dmFyIGRlZmluZSxtb2R1bGUsZXhwb3J0cztyZXR1cm4gKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkoezE6W2Z1bmN0aW9uKF9kZXJlcV8sbW9kdWxlLGV4cG9ydHMpe1xuJ3VzZSBzdHJpY3QnO1xyXG5cclxuLyoqXHJcbiAqIE1lcmdlIHR3byBhdHRyaWJ1dGUgb2JqZWN0cyBnaXZpbmcgcHJlY2VkZW5jZVxyXG4gKiB0byB2YWx1ZXMgaW4gb2JqZWN0IGBiYC4gQ2xhc3NlcyBhcmUgc3BlY2lhbC1jYXNlZFxyXG4gKiBhbGxvd2luZyBmb3IgYXJyYXlzIGFuZCBtZXJnaW5nL2pvaW5pbmcgYXBwcm9wcmlhdGVseVxyXG4gKiByZXN1bHRpbmcgaW4gYSBzdHJpbmcuXHJcbiAqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBhXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBiXHJcbiAqIEByZXR1cm4ge09iamVjdH0gYVxyXG4gKiBAYXBpIHByaXZhdGVcclxuICovXHJcblxyXG5leHBvcnRzLm1lcmdlID0gZnVuY3Rpb24gbWVyZ2UoYSwgYikge1xyXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XHJcbiAgICB2YXIgYXR0cnMgPSBhWzBdO1xyXG4gICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgIGF0dHJzID0gbWVyZ2UoYXR0cnMsIGFbaV0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGF0dHJzO1xyXG4gIH1cclxuICB2YXIgYWMgPSBhWydjbGFzcyddO1xyXG4gIHZhciBiYyA9IGJbJ2NsYXNzJ107XHJcblxyXG4gIGlmIChhYyB8fCBiYykge1xyXG4gICAgYWMgPSBhYyB8fCBbXTtcclxuICAgIGJjID0gYmMgfHwgW107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYWMpKSBhYyA9IFthY107XHJcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkoYmMpKSBiYyA9IFtiY107XHJcbiAgICBhWydjbGFzcyddID0gYWMuY29uY2F0KGJjKS5maWx0ZXIobnVsbHMpO1xyXG4gIH1cclxuXHJcbiAgZm9yICh2YXIga2V5IGluIGIpIHtcclxuICAgIGlmIChrZXkgIT0gJ2NsYXNzJykge1xyXG4gICAgICBhW2tleV0gPSBiW2tleV07XHJcbiAgICB9XHJcbiAgfVxyXG5cclxuICByZXR1cm4gYTtcclxufTtcclxuXHJcbi8qKlxyXG4gKiBGaWx0ZXIgbnVsbCBgdmFsYHMuXHJcbiAqXHJcbiAqIEBwYXJhbSB7Kn0gdmFsXHJcbiAqIEByZXR1cm4ge0Jvb2xlYW59XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmZ1bmN0aW9uIG51bGxzKHZhbCkge1xyXG4gIHJldHVybiB2YWwgIT0gbnVsbCAmJiB2YWwgIT09ICcnO1xyXG59XHJcblxyXG4vKipcclxuICogam9pbiBhcnJheSBhcyBjbGFzc2VzLlxyXG4gKlxyXG4gKiBAcGFyYW0geyp9IHZhbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmpvaW5DbGFzc2VzID0gam9pbkNsYXNzZXM7XHJcbmZ1bmN0aW9uIGpvaW5DbGFzc2VzKHZhbCkge1xyXG4gIHJldHVybiBBcnJheS5pc0FycmF5KHZhbCkgPyB2YWwubWFwKGpvaW5DbGFzc2VzKS5maWx0ZXIobnVsbHMpLmpvaW4oJyAnKSA6IHZhbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gY2xhc3Nlcy5cclxuICpcclxuICogQHBhcmFtIHtBcnJheX0gY2xhc3Nlc1xyXG4gKiBAcGFyYW0ge0FycmF5LjxCb29sZWFuPn0gZXNjYXBlZFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqL1xyXG5leHBvcnRzLmNscyA9IGZ1bmN0aW9uIGNscyhjbGFzc2VzLCBlc2NhcGVkKSB7XHJcbiAgdmFyIGJ1ZiA9IFtdO1xyXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgY2xhc3Nlcy5sZW5ndGg7IGkrKykge1xyXG4gICAgaWYgKGVzY2FwZWQgJiYgZXNjYXBlZFtpXSkge1xyXG4gICAgICBidWYucHVzaChleHBvcnRzLmVzY2FwZShqb2luQ2xhc3NlcyhbY2xhc3Nlc1tpXV0pKSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICBidWYucHVzaChqb2luQ2xhc3NlcyhjbGFzc2VzW2ldKSk7XHJcbiAgICB9XHJcbiAgfVxyXG4gIHZhciB0ZXh0ID0gam9pbkNsYXNzZXMoYnVmKTtcclxuICBpZiAodGV4dC5sZW5ndGgpIHtcclxuICAgIHJldHVybiAnIGNsYXNzPVwiJyArIHRleHQgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyc7XHJcbiAgfVxyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlbmRlciB0aGUgZ2l2ZW4gYXR0cmlidXRlLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30ga2V5XHJcbiAqIEBwYXJhbSB7U3RyaW5nfSB2YWxcclxuICogQHBhcmFtIHtCb29sZWFufSBlc2NhcGVkXHJcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gdGVyc2VcclxuICogQHJldHVybiB7U3RyaW5nfVxyXG4gKi9cclxuZXhwb3J0cy5hdHRyID0gZnVuY3Rpb24gYXR0cihrZXksIHZhbCwgZXNjYXBlZCwgdGVyc2UpIHtcclxuICBpZiAoJ2Jvb2xlYW4nID09IHR5cGVvZiB2YWwgfHwgbnVsbCA9PSB2YWwpIHtcclxuICAgIGlmICh2YWwpIHtcclxuICAgICAgcmV0dXJuICcgJyArICh0ZXJzZSA/IGtleSA6IGtleSArICc9XCInICsga2V5ICsgJ1wiJyk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICByZXR1cm4gJyc7XHJcbiAgICB9XHJcbiAgfSBlbHNlIGlmICgwID09IGtleS5pbmRleE9mKCdkYXRhJykgJiYgJ3N0cmluZycgIT0gdHlwZW9mIHZhbCkge1xyXG4gICAgcmV0dXJuICcgJyArIGtleSArIFwiPSdcIiArIEpTT04uc3RyaW5naWZ5KHZhbCkucmVwbGFjZSgvJy9nLCAnJmFwb3M7JykgKyBcIidcIjtcclxuICB9IGVsc2UgaWYgKGVzY2FwZWQpIHtcclxuICAgIHJldHVybiAnICcgKyBrZXkgKyAnPVwiJyArIGV4cG9ydHMuZXNjYXBlKHZhbCkgKyAnXCInO1xyXG4gIH0gZWxzZSB7XHJcbiAgICByZXR1cm4gJyAnICsga2V5ICsgJz1cIicgKyB2YWwgKyAnXCInO1xyXG4gIH1cclxufTtcclxuXHJcbi8qKlxyXG4gKiBSZW5kZXIgdGhlIGdpdmVuIGF0dHJpYnV0ZXMgb2JqZWN0LlxyXG4gKlxyXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqXHJcbiAqIEBwYXJhbSB7T2JqZWN0fSBlc2NhcGVkXHJcbiAqIEByZXR1cm4ge1N0cmluZ31cclxuICovXHJcbmV4cG9ydHMuYXR0cnMgPSBmdW5jdGlvbiBhdHRycyhvYmosIHRlcnNlKXtcclxuICB2YXIgYnVmID0gW107XHJcblxyXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcclxuXHJcbiAgaWYgKGtleXMubGVuZ3RoKSB7XHJcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGtleXMubGVuZ3RoOyArK2kpIHtcclxuICAgICAgdmFyIGtleSA9IGtleXNbaV1cclxuICAgICAgICAsIHZhbCA9IG9ialtrZXldO1xyXG5cclxuICAgICAgaWYgKCdjbGFzcycgPT0ga2V5KSB7XHJcbiAgICAgICAgaWYgKHZhbCA9IGpvaW5DbGFzc2VzKHZhbCkpIHtcclxuICAgICAgICAgIGJ1Zi5wdXNoKCcgJyArIGtleSArICc9XCInICsgdmFsICsgJ1wiJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9IGVsc2Uge1xyXG4gICAgICAgIGJ1Zi5wdXNoKGV4cG9ydHMuYXR0cihrZXksIHZhbCwgZmFsc2UsIHRlcnNlKSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9XHJcblxyXG4gIHJldHVybiBidWYuam9pbignJyk7XHJcbn07XHJcblxyXG4vKipcclxuICogRXNjYXBlIHRoZSBnaXZlbiBzdHJpbmcgb2YgYGh0bWxgLlxyXG4gKlxyXG4gKiBAcGFyYW0ge1N0cmluZ30gaHRtbFxyXG4gKiBAcmV0dXJuIHtTdHJpbmd9XHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMuZXNjYXBlID0gZnVuY3Rpb24gZXNjYXBlKGh0bWwpe1xyXG4gIHZhciByZXN1bHQgPSBTdHJpbmcoaHRtbClcclxuICAgIC5yZXBsYWNlKC8mL2csICcmYW1wOycpXHJcbiAgICAucmVwbGFjZSgvPC9nLCAnJmx0OycpXHJcbiAgICAucmVwbGFjZSgvPi9nLCAnJmd0OycpXHJcbiAgICAucmVwbGFjZSgvXCIvZywgJyZxdW90OycpO1xyXG4gIGlmIChyZXN1bHQgPT09ICcnICsgaHRtbCkgcmV0dXJuIGh0bWw7XHJcbiAgZWxzZSByZXR1cm4gcmVzdWx0O1xyXG59O1xyXG5cclxuLyoqXHJcbiAqIFJlLXRocm93IHRoZSBnaXZlbiBgZXJyYCBpbiBjb250ZXh0IHRvIHRoZVxyXG4gKiB0aGUgamFkZSBpbiBgZmlsZW5hbWVgIGF0IHRoZSBnaXZlbiBgbGluZW5vYC5cclxuICpcclxuICogQHBhcmFtIHtFcnJvcn0gZXJyXHJcbiAqIEBwYXJhbSB7U3RyaW5nfSBmaWxlbmFtZVxyXG4gKiBAcGFyYW0ge1N0cmluZ30gbGluZW5vXHJcbiAqIEBhcGkgcHJpdmF0ZVxyXG4gKi9cclxuXHJcbmV4cG9ydHMucmV0aHJvdyA9IGZ1bmN0aW9uIHJldGhyb3coZXJyLCBmaWxlbmFtZSwgbGluZW5vLCBzdHIpe1xyXG4gIGlmICghKGVyciBpbnN0YW5jZW9mIEVycm9yKSkgdGhyb3cgZXJyO1xyXG4gIGlmICgodHlwZW9mIHdpbmRvdyAhPSAndW5kZWZpbmVkJyB8fCAhZmlsZW5hbWUpICYmICFzdHIpIHtcclxuICAgIGVyci5tZXNzYWdlICs9ICcgb24gbGluZSAnICsgbGluZW5vO1xyXG4gICAgdGhyb3cgZXJyO1xyXG4gIH1cclxuICB0cnkge1xyXG4gICAgc3RyID0gc3RyIHx8IF9kZXJlcV8oJ2ZzJykucmVhZEZpbGVTeW5jKGZpbGVuYW1lLCAndXRmOCcpXHJcbiAgfSBjYXRjaCAoZXgpIHtcclxuICAgIHJldGhyb3coZXJyLCBudWxsLCBsaW5lbm8pXHJcbiAgfVxyXG4gIHZhciBjb250ZXh0ID0gM1xyXG4gICAgLCBsaW5lcyA9IHN0ci5zcGxpdCgnXFxuJylcclxuICAgICwgc3RhcnQgPSBNYXRoLm1heChsaW5lbm8gLSBjb250ZXh0LCAwKVxyXG4gICAgLCBlbmQgPSBNYXRoLm1pbihsaW5lcy5sZW5ndGgsIGxpbmVubyArIGNvbnRleHQpO1xyXG5cclxuICAvLyBFcnJvciBjb250ZXh0XHJcbiAgdmFyIGNvbnRleHQgPSBsaW5lcy5zbGljZShzdGFydCwgZW5kKS5tYXAoZnVuY3Rpb24obGluZSwgaSl7XHJcbiAgICB2YXIgY3VyciA9IGkgKyBzdGFydCArIDE7XHJcbiAgICByZXR1cm4gKGN1cnIgPT0gbGluZW5vID8gJyAgPiAnIDogJyAgICAnKVxyXG4gICAgICArIGN1cnJcclxuICAgICAgKyAnfCAnXHJcbiAgICAgICsgbGluZTtcclxuICB9KS5qb2luKCdcXG4nKTtcclxuXHJcbiAgLy8gQWx0ZXIgZXhjZXB0aW9uIG1lc3NhZ2VcclxuICBlcnIucGF0aCA9IGZpbGVuYW1lO1xyXG4gIGVyci5tZXNzYWdlID0gKGZpbGVuYW1lIHx8ICdKYWRlJykgKyAnOicgKyBsaW5lbm9cclxuICAgICsgJ1xcbicgKyBjb250ZXh0ICsgJ1xcblxcbicgKyBlcnIubWVzc2FnZTtcclxuICB0aHJvdyBlcnI7XHJcbn07XHJcblxufSx7XCJmc1wiOjJ9XSwyOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxufSx7fV19LHt9LFsxXSlcbigxKVxufSk7XG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnamFkZS9ydW50aW1lJyk7XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuICAsIGlzTmF0aXZlID0gdHJ1ZVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICBpc05hdGl2ZSA9IGZhbHNlXG5cbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIGlmKCFpc05hdGl2ZSkge1xuICAgIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxuICB9XG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZ1bmN0aW9uKCkge1xuICAgIHRyeXtcbiAgICAgIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICB9XG4gIH0pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIEdlbmVyYXRlZCBieSBDb2ZmZWVTY3JpcHQgMS42LjNcbihmdW5jdGlvbigpIHtcbiAgdmFyIGdldE5hbm9TZWNvbmRzLCBocnRpbWUsIGxvYWRUaW1lO1xuXG4gIGlmICgodHlwZW9mIHBlcmZvcm1hbmNlICE9PSBcInVuZGVmaW5lZFwiICYmIHBlcmZvcm1hbmNlICE9PSBudWxsKSAmJiBwZXJmb3JtYW5jZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHBlcmZvcm1hbmNlLm5vdygpO1xuICAgIH07XG4gIH0gZWxzZSBpZiAoKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MgIT09IG51bGwpICYmIHByb2Nlc3MuaHJ0aW1lKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAoZ2V0TmFub1NlY29uZHMoKSAtIGxvYWRUaW1lKSAvIDFlNjtcbiAgICB9O1xuICAgIGhydGltZSA9IHByb2Nlc3MuaHJ0aW1lO1xuICAgIGdldE5hbm9TZWNvbmRzID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaHI7XG4gICAgICBociA9IGhydGltZSgpO1xuICAgICAgcmV0dXJuIGhyWzBdICogMWU5ICsgaHJbMV07XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IGdldE5hbm9TZWNvbmRzKCk7XG4gIH0gZWxzZSBpZiAoRGF0ZS5ub3cpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIERhdGUubm93KCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gRGF0ZS5ub3coKTtcbiAgfSBlbHNlIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9XG5cbn0pLmNhbGwodGhpcyk7XG5cbi8qXG4vL0Agc291cmNlTWFwcGluZ1VSTD1wZXJmb3JtYW5jZS1ub3cubWFwXG4qL1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIi9Vc2Vycy9uaWNvLy5udm0vdjAuMTAuMjYvbGliL25vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIikpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBwYXJ0aWFsID0gcmVxdWlyZSgnLi9wYXJ0aWFsJyk7XG52YXIgcm91dGVyID0gcmVxdWlyZSgnLi9yb3V0ZXInKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciBpc05hdGl2ZSA9IHJlcXVpcmUoJy4vaXNOYXRpdmUnKTtcbnZhciBtb2Rlcm4gPSAnaGlzdG9yeScgaW4gd2luZG93ICYmICdwdXNoU3RhdGUnIGluIGhpc3Rvcnk7XG5cbi8vIEdvb2dsZSBDaHJvbWUgMzggb24gaU9TIG1ha2VzIHdlaXJkIGNoYW5nZXMgdG8gaGlzdG9yeS5yZXBsYWNlU3RhdGUsIGJyZWFraW5nIGl0XG52YXIgbmF0aXZlUmVwbGFjZSA9IG1vZGVybiAmJiBpc05hdGl2ZSh3aW5kb3cuaGlzdG9yeS5yZXBsYWNlU3RhdGUpO1xuXG5mdW5jdGlvbiBnbyAodXJsLCBvKSB7XG4gIHZhciBvcHRpb25zID0gbyB8fCB7fTtcbiAgdmFyIGNvbnRleHQgPSBvcHRpb25zLmNvbnRleHQgfHwgbnVsbDtcblxuICBpZiAoIW1vZGVybikge1xuICAgIGxvY2F0aW9uLmhyZWYgPSB1cmw7IHJldHVybjtcbiAgfVxuXG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgbG9jYXRpb24uaHJlZiA9IHVybDsgcmV0dXJuO1xuICB9XG5cbiAgZmV0Y2hlci5hYm9ydFBlbmRpbmcoKTtcbiAgZmV0Y2hlcihyb3V0ZSwgeyBlbGVtZW50OiBjb250ZXh0LCBzb3VyY2U6ICdpbnRlbnQnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBtb2RlbCkge1xuICAgIGlmIChlcnIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdwdXNoU3RhdGUnKTtcbiAgICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzdGFydCAobW9kZWwpIHtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBlbWl0dGVyLmVtaXQoJ3N0YXJ0Jywgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gIHBhcnRpYWwoc3RhdGUuY29udGFpbmVyLCBudWxsLCBtb2RlbCwgcm91dGUsIHsgcmVuZGVyOiBmYWxzZSB9KTtcbiAgd2luZG93Lm9ucG9wc3RhdGUgPSBiYWNrO1xufVxuXG5mdW5jdGlvbiBiYWNrIChlKSB7XG4gIHZhciBlbXB0eSA9ICEoZSAmJiBlLnN0YXRlICYmIGUuc3RhdGUubW9kZWwpO1xuICBpZiAoZW1wdHkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdmFyIG1vZGVsID0gZS5zdGF0ZS5tb2RlbDtcbiAgdmFyIHJvdXRlID0gcmVwbGFjZVdpdGgobW9kZWwpO1xuICBwYXJ0aWFsKHN0YXRlLmNvbnRhaW5lciwgbnVsbCwgbW9kZWwsIHJvdXRlKTtcbn1cblxuZnVuY3Rpb24gcmVwbGFjZVdpdGggKG1vZGVsKSB7XG4gIHZhciB1cmwgPSBsb2NhdGlvbi5wYXRobmFtZTtcbiAgdmFyIHF1ZXJ5ID0gb3JFbXB0eShsb2NhdGlvbi5zZWFyY2gpICsgb3JFbXB0eShsb2NhdGlvbi5oYXNoKTtcbiAgdmFyIHJvdXRlID0gcm91dGVyKHVybCArIHF1ZXJ5KTtcbiAgbmF2aWdhdGlvbihyb3V0ZSwgbW9kZWwsICdyZXBsYWNlU3RhdGUnKTtcbiAgcmV0dXJuIHJvdXRlO1xufVxuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG5hdmlnYXRpb24gKHJvdXRlLCBtb2RlbCwgZGlyZWN0aW9uKSB7XG4gIHN0YXRlLm1vZGVsID0gbW9kZWw7XG4gIGlmIChtb2RlbC50aXRsZSkge1xuICAgIGRvY3VtZW50LnRpdGxlID0gbW9kZWwudGl0bGU7XG4gIH1cbiAgaWYgKG1vZGVybiAmJiBkaXJlY3Rpb24gIT09ICdyZXBsYWNlU3RhdGUnIHx8IG5hdGl2ZVJlcGxhY2UpIHtcbiAgICBoaXN0b3J5W2RpcmVjdGlvbl0oeyBtb2RlbDogbW9kZWwgfSwgbW9kZWwudGl0bGUsIHJvdXRlLnVybCk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHN0YXJ0OiBzdGFydCxcbiAgZ286IGdvXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJhdyA9IHJlcXVpcmUoJy4vc3RvcmVzL3JhdycpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0b3JlcyA9IFtyYXcsIGlkYl07XG5cbmZ1bmN0aW9uIGNsb25lICh2YWx1ZSkge1xuICByZXR1cm4gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh2YWx1ZSkpO1xufVxuXG5mdW5jdGlvbiBnZXQgKHVybCwgZG9uZSkge1xuICB2YXIgaSA9IDA7XG5cbiAgZnVuY3Rpb24gbmV4dCAoKSB7XG4gICAgdmFyIGdvdE9uY2UgPSBvbmNlKGdvdCk7XG4gICAgdmFyIHN0b3JlID0gc3RvcmVzW2krK107XG4gICAgaWYgKHN0b3JlKSB7XG4gICAgICBzdG9yZS5nZXQodXJsLCBnb3RPbmNlKTtcbiAgICAgIHNldFRpbWVvdXQoZ290T25jZSwgc3RvcmUgPT09IGlkYiA/IDEwMCA6IDUwKTsgLy8gYXQgd29yc3QsIHNwZW5kIDE1MG1zIG9uIGNhY2hpbmcgbGF5ZXJzXG4gICAgfSBlbHNlIHtcbiAgICAgIGRvbmUodHJ1ZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ290IChlcnIsIGl0ZW0pIHtcbiAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfSBlbHNlIGlmIChpdGVtICYmIHR5cGVvZiBpdGVtLmV4cGlyZXMgPT09ICdudW1iZXInICYmIERhdGUubm93KCkgPCBpdGVtLmV4cGlyZXMpIHtcbiAgICAgICAgZG9uZShmYWxzZSwgY2xvbmUoaXRlbS5kYXRhKSk7IC8vIGFsd2F5cyByZXR1cm4gYSB1bmlxdWUgY29weVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmV4dCgpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIG5leHQoKTtcbn1cblxuZnVuY3Rpb24gc2V0ICh1cmwsIGRhdGEsIGR1cmF0aW9uKSB7XG4gIGlmIChkdXJhdGlvbiA8IDEpIHsgLy8gc2FuaXR5XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBjbG9uZWQgPSBjbG9uZShkYXRhKTsgLy8gZnJlZXplIGEgY29weSBmb3Igb3VyIHJlY29yZHNcbiAgc3RvcmVzLmZvckVhY2goc3RvcmUpO1xuICBmdW5jdGlvbiBzdG9yZSAocykge1xuICAgIHMuc2V0KHVybCwge1xuICAgICAgZGF0YTogY2xvbmVkLFxuICAgICAgZXhwaXJlczogRGF0ZS5ub3coKSArIGR1cmF0aW9uXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGdldDogZ2V0LFxuICBzZXQ6IHNldFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGNhY2hlID0gcmVxdWlyZSgnLi9jYWNoZScpO1xudmFyIGlkYiA9IHJlcXVpcmUoJy4vc3RvcmVzL2lkYicpO1xudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBkZWZhdWx0cyA9IDE1O1xudmFyIGJhc2VsaW5lO1xuXG5mdW5jdGlvbiBlICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkdXJhdGlvbiwgcm91dGUpIHtcbiAgYmFzZWxpbmUgPSBwYXJzZUR1cmF0aW9uKGR1cmF0aW9uKTtcbiAgaWYgKGJhc2VsaW5lIDwgMSkge1xuICAgIHN0YXRlLmNhY2hlID0gZmFsc2U7XG4gICAgcmV0dXJuO1xuICB9XG4gIGludGVyY2VwdG9yLmFkZChpbnRlcmNlcHQpO1xuICBlbWl0dGVyLm9uKCdmZXRjaC5kb25lJywgcGVyc2lzdCk7XG4gIHN0YXRlLmNhY2hlID0gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW50ZXJjZXB0IChlKSB7XG4gIGNhY2hlLmdldChlLnVybCwgcmVzdWx0KTtcblxuICBmdW5jdGlvbiByZXN1bHQgKGVyciwgZGF0YSkge1xuICAgIGlmICghZXJyICYmIGRhdGEpIHtcbiAgICAgIGUucHJldmVudERlZmF1bHQoZGF0YSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnNlRHVyYXRpb24gKHZhbHVlKSB7XG4gIGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBiYXNlbGluZSB8fCBkZWZhdWx0cztcbiAgfVxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICByZXR1cm4gMDtcbn1cblxuZnVuY3Rpb24gcGVyc2lzdCAocm91dGUsIGNvbnRleHQsIGRhdGEpIHtcbiAgaWYgKCFzdGF0ZS5jYWNoZSkge1xuICAgIHJldHVybjtcbiAgfVxuICBpZiAocm91dGUuY2FjaGUgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHZhciBkID0gYmFzZWxpbmU7XG4gIGlmICh0eXBlb2Ygcm91dGUuY2FjaGUgPT09ICdudW1iZXInKSB7XG4gICAgZCA9IHJvdXRlLmNhY2hlO1xuICB9XG4gIHZhciBrZXkgPSByb3V0ZS5wYXJ0cy5wYXRobmFtZSArIGUocm91dGUucGFydHMucXVlcnkpO1xuICBjYWNoZS5zZXQoa2V5LCBkYXRhLCBwYXJzZUR1cmF0aW9uKGQpICogMTAwMCk7XG59XG5cbmZ1bmN0aW9uIHJlYWR5IChmbikge1xuICBpZiAoc3RhdGUuY2FjaGUpIHtcbiAgICBpZGIudGVzdGVkKGZuKTsgLy8gd2FpdCBvbiBpZGIgY29tcGF0aWJpbGl0eSB0ZXN0c1xuICB9IGVsc2Uge1xuICAgIGZuKCk7IC8vIGNhY2hpbmcgaXMgYSBuby1vcFxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBzZXR1cDogc2V0dXAsXG4gIHBlcnNpc3Q6IHBlcnNpc3QsXG4gIHJlYWR5OiByZWFkeVxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCdjb250cmEuZW1pdHRlcicpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVtaXR0ZXIoe30sIHsgdGhyb3dzOiBmYWxzZSB9KTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gYWRkIChlbGVtZW50LCB0eXBlLCBmbikge1xuICBpZiAoZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKSB7XG4gICAgZWxlbWVudC5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGZuKTtcbiAgfSBlbHNlIGlmIChlbGVtZW50LmF0dGFjaEV2ZW50KSB7XG4gICAgZWxlbWVudC5hdHRhY2hFdmVudCgnb24nICsgdHlwZSwgd3JhcHBlckZhY3RvcnkoZWxlbWVudCwgZm4pKTtcbiAgfSBlbHNlIHtcbiAgICBlbGVtZW50WydvbicgKyB0eXBlXSA9IGZuO1xuICB9XG59XG5cbmZ1bmN0aW9uIHdyYXBwZXJGYWN0b3J5IChlbGVtZW50LCBmbikge1xuICByZXR1cm4gZnVuY3Rpb24gd3JhcHBlciAob3JpZ2luYWxFdmVudCkge1xuICAgIHZhciBlID0gb3JpZ2luYWxFdmVudCB8fCB3aW5kb3cuZXZlbnQ7XG4gICAgZS50YXJnZXQgPSBlLnRhcmdldCB8fCBlLnNyY0VsZW1lbnQ7XG4gICAgZS5wcmV2ZW50RGVmYXVsdCAgPSBlLnByZXZlbnREZWZhdWx0ICB8fCBmdW5jdGlvbiBwcmV2ZW50RGVmYXVsdCAoKSB7IGUucmV0dXJuVmFsdWUgPSBmYWxzZTsgfTtcbiAgICBlLnN0b3BQcm9wYWdhdGlvbiA9IGUuc3RvcFByb3BhZ2F0aW9uIHx8IGZ1bmN0aW9uIHN0b3BQcm9wYWdhdGlvbiAoKSB7IGUuY2FuY2VsQnViYmxlID0gdHJ1ZTsgfTtcbiAgICBmbi5jYWxsKGVsZW1lbnQsIGUpO1xuICB9O1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWRkOiBhZGRcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB4aHIgPSByZXF1aXJlKCcuL3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBpbnRlcmNlcHRvciA9IHJlcXVpcmUoJy4vaW50ZXJjZXB0b3InKTtcbnZhciBsYXN0WGhyID0ge307XG5cbmZ1bmN0aW9uIGUgKHZhbHVlKSB7XG4gIHJldHVybiB2YWx1ZSB8fCAnJztcbn1cblxuZnVuY3Rpb24ganNvbmlmeSAocm91dGUpIHtcbiAgdmFyIHBhcnRzID0gcm91dGUucGFydHM7XG4gIHZhciBxcyA9IGUocGFydHMuc2VhcmNoKTtcbiAgdmFyIHAgPSBxcyA/ICcmJyA6ICc/JztcbiAgcmV0dXJuIHBhcnRzLnBhdGhuYW1lICsgcXMgKyBwICsgJ2pzb24nO1xufVxuXG5mdW5jdGlvbiBhYm9ydCAoc291cmNlKSB7XG4gIGlmIChsYXN0WGhyW3NvdXJjZV0pIHtcbiAgICBsYXN0WGhyW3NvdXJjZV0uYWJvcnQoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhYm9ydFBlbmRpbmcgKCkge1xuICBPYmplY3Qua2V5cyhsYXN0WGhyKS5mb3JFYWNoKGFib3J0KTtcbiAgbGFzdFhociA9IHt9O1xufVxuXG5mdW5jdGlvbiBmZXRjaGVyIChyb3V0ZSwgY29udGV4dCwgZG9uZSkge1xuICB2YXIgdXJsID0gcm91dGUudXJsO1xuICBpZiAobGFzdFhocltjb250ZXh0LnNvdXJjZV0pIHtcbiAgICBsYXN0WGhyW2NvbnRleHQuc291cmNlXS5hYm9ydCgpO1xuICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0gbnVsbDtcbiAgfVxuICBpbnRlcmNlcHRvci5leGVjdXRlKHJvdXRlLCBhZnRlckludGVyY2VwdG9ycyk7XG5cbiAgZnVuY3Rpb24gYWZ0ZXJJbnRlcmNlcHRvcnMgKGVyciwgcmVzdWx0KSB7XG4gICAgaWYgKCFlcnIgJiYgcmVzdWx0LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgIGRvbmUobnVsbCwgcmVzdWx0Lm1vZGVsKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5zdGFydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIGxhc3RYaHJbY29udGV4dC5zb3VyY2VdID0geGhyKGpzb25pZnkocm91dGUpLCBub3RpZnkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG5vdGlmeSAoZXJyLCBkYXRhKSB7XG4gICAgaWYgKGVycikge1xuICAgICAgaWYgKGVyci5tZXNzYWdlID09PSAnYWJvcnRlZCcpIHtcbiAgICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5hYm9ydCcsIHJvdXRlLCBjb250ZXh0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnZmV0Y2guZXJyb3InLCByb3V0ZSwgY29udGV4dCwgZXJyKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZW1pdHRlci5lbWl0KCdmZXRjaC5kb25lJywgcm91dGUsIGNvbnRleHQsIGRhdGEpO1xuICAgIH1cbiAgICBkb25lKGVyciwgZGF0YSk7XG4gIH1cbn1cblxuZmV0Y2hlci5hYm9ydFBlbmRpbmcgPSBhYm9ydFBlbmRpbmc7XG5cbm1vZHVsZS5leHBvcnRzID0gZmV0Y2hlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcbnZhciBsaW5rcyA9IHJlcXVpcmUoJy4vbGlua3MnKTtcblxuZnVuY3Rpb24gYXR0YWNoICgpIHtcbiAgZW1pdHRlci5vbignc3RhcnQnLCBsaW5rcyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBhdHRhY2g6IGF0dGFjaFxufTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHN0YXRlID0gcmVxdWlyZSgnLi9zdGF0ZScpO1xudmFyIGludGVyY2VwdG9yID0gcmVxdWlyZSgnLi9pbnRlcmNlcHRvcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xudmFyIGhvb2tzID0gcmVxdWlyZSgnLi9ob29rcycpO1xudmFyIHBhcnRpYWwgPSByZXF1aXJlKCcuL3BhcnRpYWwnKTtcbnZhciBtb3VudCA9IHJlcXVpcmUoJy4vbW91bnQnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xuXG5ob29rcy5hdHRhY2goKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1vdW50OiBtb3VudCxcbiAgcGFydGlhbDogcGFydGlhbC5zdGFuZGFsb25lLFxuICBvbjogZW1pdHRlci5vbi5iaW5kKGVtaXR0ZXIpLFxuICBvbmNlOiBlbWl0dGVyLm9uY2UuYmluZChlbWl0dGVyKSxcbiAgb2ZmOiBlbWl0dGVyLm9mZi5iaW5kKGVtaXR0ZXIpLFxuICBpbnRlcmNlcHQ6IGludGVyY2VwdG9yLmFkZCxcbiAgbmF2aWdhdGU6IGFjdGl2YXRvci5nbyxcbiAgc3RhdGU6IHN0YXRlLFxuICByb3V0ZTogcm91dGVyXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJ2NvbnRyYS5lbWl0dGVyJyk7XG52YXIgb25jZSA9IHJlcXVpcmUoJy4vb25jZScpO1xudmFyIHJvdXRlciA9IHJlcXVpcmUoJy4vcm91dGVyJyk7XG52YXIgaW50ZXJjZXB0b3JzID0gZW1pdHRlcih7IGNvdW50OiAwIH0sIHsgYXN5bmM6IHRydWUgfSk7XG5cbmZ1bmN0aW9uIGdldEludGVyY2VwdG9yRXZlbnQgKHJvdXRlKSB7XG4gIHZhciBlID0ge1xuICAgIHVybDogcm91dGUudXJsLFxuICAgIHJvdXRlOiByb3V0ZSxcbiAgICBwYXJ0czogcm91dGUucGFydHMsXG4gICAgbW9kZWw6IG51bGwsXG4gICAgY2FuUHJldmVudERlZmF1bHQ6IHRydWUsXG4gICAgZGVmYXVsdFByZXZlbnRlZDogZmFsc2UsXG4gICAgcHJldmVudERlZmF1bHQ6IG9uY2UocHJldmVudERlZmF1bHQpXG4gIH07XG5cbiAgZnVuY3Rpb24gcHJldmVudERlZmF1bHQgKG1vZGVsKSB7XG4gICAgaWYgKCFlLmNhblByZXZlbnREZWZhdWx0KSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGUuY2FuUHJldmVudERlZmF1bHQgPSBmYWxzZTtcbiAgICBlLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuICAgIGUubW9kZWwgPSBtb2RlbDtcbiAgfVxuXG4gIHJldHVybiBlO1xufVxuXG5mdW5jdGlvbiBhZGQgKGFjdGlvbiwgZm4pIHtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDEpIHtcbiAgICBmbiA9IGFjdGlvbjtcbiAgICBhY3Rpb24gPSAnKic7XG4gIH1cbiAgaW50ZXJjZXB0b3JzLmNvdW50Kys7XG4gIGludGVyY2VwdG9ycy5vbihhY3Rpb24sIGZuKTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZVN5bmMgKHJvdXRlKSB7XG4gIHZhciBlID0gZ2V0SW50ZXJjZXB0b3JFdmVudChyb3V0ZSk7XG5cbiAgaW50ZXJjZXB0b3JzLmVtaXQoJyonLCBlKTtcbiAgaW50ZXJjZXB0b3JzLmVtaXQocm91dGUuYWN0aW9uLCBlKTtcblxuICByZXR1cm4gZTtcbn1cblxuZnVuY3Rpb24gZXhlY3V0ZSAocm91dGUsIGRvbmUpIHtcbiAgdmFyIGUgPSBnZXRJbnRlcmNlcHRvckV2ZW50KHJvdXRlKTtcbiAgaWYgKGludGVyY2VwdG9ycy5jb3VudCA9PT0gMCkgeyAvLyBmYWlsIGZhc3RcbiAgICBlbmQoKTsgcmV0dXJuO1xuICB9XG4gIHZhciBmbiA9IG9uY2UoZW5kKTtcbiAgdmFyIHByZXZlbnREZWZhdWx0QmFzZSA9IGUucHJldmVudERlZmF1bHQ7XG5cbiAgZS5wcmV2ZW50RGVmYXVsdCA9IG9uY2UocHJldmVudERlZmF1bHRFbmRzKTtcblxuICBpbnRlcmNlcHRvcnMuZW1pdCgnKicsIGUpO1xuICBpbnRlcmNlcHRvcnMuZW1pdChyb3V0ZS5hY3Rpb24sIGUpO1xuXG4gIHNldFRpbWVvdXQoZm4sIDIwMCk7IC8vIGF0IHdvcnN0LCBzcGVuZCAyMDBtcyB3YWl0aW5nIG9uIGludGVyY2VwdG9yc1xuXG4gIGZ1bmN0aW9uIHByZXZlbnREZWZhdWx0RW5kcyAoKSB7XG4gICAgcHJldmVudERlZmF1bHRCYXNlLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gICAgZm4oKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVuZCAoKSB7XG4gICAgZS5jYW5QcmV2ZW50RGVmYXVsdCA9IGZhbHNlO1xuICAgIGRvbmUobnVsbCwgZSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGFkZDogYWRkLFxuICBleGVjdXRlOiBleGVjdXRlXG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vLyBzb3VyY2U6IGh0dHBzOi8vZ2lzdC5naXRodWIuY29tL2pkYWx0b24vNWUzNGQ4OTAxMDVhY2E0NDM5OWZcbi8vIHRoYW5rcyBAamRhbHRvbiFcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZzsgLy8gdXNlZCB0byByZXNvbHZlIHRoZSBpbnRlcm5hbCBgW1tDbGFzc11dYCBvZiB2YWx1ZXNcbnZhciBmblRvU3RyaW5nID0gRnVuY3Rpb24ucHJvdG90eXBlLnRvU3RyaW5nOyAvLyB1c2VkIHRvIHJlc29sdmUgdGhlIGRlY29tcGlsZWQgc291cmNlIG9mIGZ1bmN0aW9uc1xudmFyIGhvc3QgPSAvXlxcW29iamVjdCAuKz9Db25zdHJ1Y3RvclxcXSQvOyAvLyB1c2VkIHRvIGRldGVjdCBob3N0IGNvbnN0cnVjdG9ycyAoU2FmYXJpID4gNDsgcmVhbGx5IHR5cGVkIGFycmF5IHNwZWNpZmljKVxuXG4vLyBFc2NhcGUgYW55IHNwZWNpYWwgcmVnZXhwIGNoYXJhY3RlcnMuXG52YXIgc3BlY2lhbHMgPSAvWy4qKz9eJHt9KCl8W1xcXVxcL1xcXFxdL2c7XG5cbi8vIFJlcGxhY2UgbWVudGlvbnMgb2YgYHRvU3RyaW5nYCB3aXRoIGAuKj9gIHRvIGtlZXAgdGhlIHRlbXBsYXRlIGdlbmVyaWMuXG4vLyBSZXBsYWNlIHRoaW5nIGxpa2UgYGZvciAuLi5gIHRvIHN1cHBvcnQgZW52aXJvbm1lbnRzLCBsaWtlIFJoaW5vLCB3aGljaCBhZGQgZXh0cmFcbi8vIGluZm8gc3VjaCBhcyBtZXRob2QgYXJpdHkuXG52YXIgZXh0cmFzID0gL3RvU3RyaW5nfChmdW5jdGlvbikuKj8oPz1cXFxcXFwoKXwgZm9yIC4rPyg/PVxcXFxcXF0pL2c7XG5cbi8vIENvbXBpbGUgYSByZWdleHAgdXNpbmcgYSBjb21tb24gbmF0aXZlIG1ldGhvZCBhcyBhIHRlbXBsYXRlLlxuLy8gV2UgY2hvc2UgYE9iamVjdCN0b1N0cmluZ2AgYmVjYXVzZSB0aGVyZSdzIGEgZ29vZCBjaGFuY2UgaXQgaXMgbm90IGJlaW5nIG11Y2tlZCB3aXRoLlxudmFyIGZuU3RyaW5nID0gU3RyaW5nKHRvU3RyaW5nKS5yZXBsYWNlKHNwZWNpYWxzLCAnXFxcXCQmJykucmVwbGFjZShleHRyYXMsICckMS4qPycpO1xudmFyIHJlTmF0aXZlID0gbmV3IFJlZ0V4cCgnXicgKyBmblN0cmluZyArICckJyk7XG5cbmZ1bmN0aW9uIGlzTmF0aXZlICh2YWx1ZSkge1xuICB2YXIgdHlwZSA9IHR5cGVvZiB2YWx1ZTtcbiAgaWYgKHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICAvLyBVc2UgYEZ1bmN0aW9uI3RvU3RyaW5nYCB0byBieXBhc3MgdGhlIHZhbHVlJ3Mgb3duIGB0b1N0cmluZ2AgbWV0aG9kXG4gICAgLy8gYW5kIGF2b2lkIGJlaW5nIGZha2VkIG91dC5cbiAgICByZXR1cm4gcmVOYXRpdmUudGVzdChmblRvU3RyaW5nLmNhbGwodmFsdWUpKTtcbiAgfVxuXG4gIC8vIEZhbGxiYWNrIHRvIGEgaG9zdCBvYmplY3QgY2hlY2sgYmVjYXVzZSBzb21lIGVudmlyb25tZW50cyB3aWxsIHJlcHJlc2VudFxuICAvLyB0aGluZ3MgbGlrZSB0eXBlZCBhcnJheXMgYXMgRE9NIG1ldGhvZHMgd2hpY2ggbWF5IG5vdCBjb25mb3JtIHRvIHRoZVxuICAvLyBub3JtYWwgbmF0aXZlIHBhdHRlcm4uXG4gIHJldHVybiAodmFsdWUgJiYgdHlwZSA9PT0gJ29iamVjdCcgJiYgaG9zdC50ZXN0KHRvU3RyaW5nLmNhbGwodmFsdWUpKSkgfHwgZmFsc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gaXNOYXRpdmU7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGV2ZW50cyA9IHJlcXVpcmUoJy4vZXZlbnRzJyk7XG52YXIgZmV0Y2hlciA9IHJlcXVpcmUoJy4vZmV0Y2hlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgb3JpZ2luID0gZG9jdW1lbnQubG9jYXRpb24ub3JpZ2luO1xudmFyIGxlZnRDbGljayA9IDE7XG52YXIgcHJlZmV0Y2hpbmcgPSBbXTtcbnZhciBjbGlja3NPbkhvbGQgPSBbXTtcblxuZnVuY3Rpb24gbGlua3MgKCkge1xuICBpZiAoc3RhdGUucHJlZmV0Y2ggJiYgc3RhdGUuY2FjaGUpIHsgLy8gcHJlZmV0Y2ggd2l0aG91dCBjYWNoZSBtYWtlcyBubyBzZW5zZVxuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ21vdXNlb3ZlcicsIG1heWJlUHJlZmV0Y2gpO1xuICAgIGV2ZW50cy5hZGQoZG9jdW1lbnQuYm9keSwgJ3RvdWNoc3RhcnQnLCBtYXliZVByZWZldGNoKTtcbiAgfVxuICBldmVudHMuYWRkKGRvY3VtZW50LmJvZHksICdjbGljaycsIG1heWJlUmVyb3V0ZSk7XG59XG5cbmZ1bmN0aW9uIHNvIChhbmNob3IpIHtcbiAgcmV0dXJuIGFuY2hvci5vcmlnaW4gPT09IG9yaWdpbjtcbn1cblxuZnVuY3Rpb24gbGVmdENsaWNrT25BbmNob3IgKGUsIGFuY2hvcikge1xuICByZXR1cm4gYW5jaG9yLnBhdGhuYW1lICYmIGUud2hpY2ggPT09IGxlZnRDbGljayAmJiAhZS5tZXRhS2V5ICYmICFlLmN0cmxLZXk7XG59XG5cbmZ1bmN0aW9uIHRhcmdldE9yQW5jaG9yIChlKSB7XG4gIHZhciBhbmNob3IgPSBlLnRhcmdldDtcbiAgd2hpbGUgKGFuY2hvcikge1xuICAgIGlmIChhbmNob3IudGFnTmFtZSA9PT0gJ0EnKSB7XG4gICAgICByZXR1cm4gYW5jaG9yO1xuICAgIH1cbiAgICBhbmNob3IgPSBhbmNob3IucGFyZW50RWxlbWVudDtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVJlcm91dGUgKGUpIHtcbiAgdmFyIGFuY2hvciA9IHRhcmdldE9yQW5jaG9yKGUpO1xuICBpZiAoYW5jaG9yICYmIHNvKGFuY2hvcikgJiYgbGVmdENsaWNrT25BbmNob3IoZSwgYW5jaG9yKSkge1xuICAgIHJlcm91dGUoZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtYXliZVByZWZldGNoIChlKSB7XG4gIHZhciBhbmNob3IgPSB0YXJnZXRPckFuY2hvcihlKTtcbiAgaWYgKGFuY2hvciAmJiBzbyhhbmNob3IpKSB7XG4gICAgcHJlZmV0Y2goZSwgYW5jaG9yKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBzY3JvbGxJbnRvIChpZCkge1xuICB2YXIgZWxlbSA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKGlkKTtcbiAgaWYgKGVsZW0gJiYgZWxlbS5zY3JvbGxJbnRvVmlldykge1xuICAgIGVsZW0uc2Nyb2xsSW50b1ZpZXcoKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBub29wICgpIHt9XG5cbmZ1bmN0aW9uIGdldFJvdXRlIChhbmNob3IsIGZhaWwpIHtcbiAgdmFyIHVybCA9IGFuY2hvci5wYXRobmFtZSArIGFuY2hvci5zZWFyY2ggKyBhbmNob3IuaGFzaDtcbiAgaWYgKHVybCA9PT0gbG9jYXRpb24ucGF0aG5hbWUgKyBsb2NhdGlvbi5zZWFyY2ggKyBhbmNob3IuaGFzaCkge1xuICAgIChmYWlsIHx8IG5vb3ApKCk7XG4gICAgcmV0dXJuOyAvLyBhbmNob3IgaGFzaC1uYXZpZ2F0aW9uIG9uIHNhbWUgcGFnZSBpZ25vcmVzIHJvdXRlclxuICB9XG4gIHZhciByb3V0ZSA9IHJvdXRlcih1cmwpO1xuICBpZiAoIXJvdXRlIHx8IHJvdXRlLmlnbm9yZSkge1xuICAgIHJldHVybjtcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHJlcm91dGUgKGUsIGFuY2hvcikge1xuICB2YXIgcm91dGUgPSBnZXRSb3V0ZShhbmNob3IsIGZhaWwpO1xuICBpZiAoIXJvdXRlKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJldmVudCgpO1xuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgY2xpY2tzT25Ib2xkLnB1c2goYW5jaG9yKTtcbiAgICByZXR1cm47XG4gIH1cblxuICBhY3RpdmF0b3IuZ28ocm91dGUudXJsLCB7IGNvbnRleHQ6IGFuY2hvciB9KTtcblxuICBmdW5jdGlvbiBmYWlsICgpIHtcbiAgICBpZiAoYW5jaG9yLmhhc2ggPT09IGxvY2F0aW9uLmhhc2gpIHtcbiAgICAgIHNjcm9sbEludG8oYW5jaG9yLmhhc2guc3Vic3RyKDEpKTtcbiAgICAgIHByZXZlbnQoKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwcmV2ZW50ICgpIHsgZS5wcmV2ZW50RGVmYXVsdCgpOyB9XG59XG5cbmZ1bmN0aW9uIHByZWZldGNoIChlLCBhbmNob3IpIHtcbiAgdmFyIHJvdXRlID0gZ2V0Um91dGUoYW5jaG9yKTtcbiAgaWYgKCFyb3V0ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChwcmVmZXRjaGluZy5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgcHJlZmV0Y2hpbmcucHVzaChhbmNob3IpO1xuICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGFuY2hvciwgc291cmNlOiAncHJlZmV0Y2gnIH0sIHJlc29sdmVkKTtcblxuICBmdW5jdGlvbiByZXNvbHZlZCAoZXJyLCBkYXRhKSB7XG4gICAgcHJlZmV0Y2hpbmcuc3BsaWNlKHByZWZldGNoaW5nLmluZGV4T2YoYW5jaG9yKSwgMSk7XG4gICAgaWYgKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvcikgIT09IC0xKSB7XG4gICAgICBjbGlja3NPbkhvbGQuc3BsaWNlKGNsaWNrc09uSG9sZC5pbmRleE9mKGFuY2hvciksIDEpO1xuICAgICAgYWN0aXZhdG9yLmdvKHJvdXRlLnVybCwgeyBjb250ZXh0OiBhbmNob3IgfSk7XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gbGlua3M7XG4iLCIoZnVuY3Rpb24gKGdsb2JhbCl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciB1bmVzY2FwZSA9IHJlcXVpcmUoJy4vdW5lc2NhcGUnKTtcbnZhciBzdGF0ZSA9IHJlcXVpcmUoJy4vc3RhdGUnKTtcbnZhciByb3V0ZXIgPSByZXF1aXJlKCcuL3JvdXRlcicpO1xudmFyIGFjdGl2YXRvciA9IHJlcXVpcmUoJy4vYWN0aXZhdG9yJyk7XG52YXIgY2FjaGluZyA9IHJlcXVpcmUoJy4vY2FjaGluZycpO1xudmFyIGZldGNoZXIgPSByZXF1aXJlKCcuL2ZldGNoZXInKTtcbnZhciBnID0gZ2xvYmFsO1xudmFyIG1vdW50ZWQ7XG52YXIgYm9vdGVkO1xuXG5mdW5jdGlvbiBvckVtcHR5ICh2YWx1ZSkge1xuICByZXR1cm4gdmFsdWUgfHwgJyc7XG59XG5cbmZ1bmN0aW9uIG1vdW50IChjb250YWluZXIsIHdpcmluZywgb3B0aW9ucykge1xuICB2YXIgbyA9IG9wdGlvbnMgfHwge307XG4gIGlmIChtb3VudGVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdUYXVudXMgYWxyZWFkeSBtb3VudGVkIScpO1xuICB9XG4gIGlmICghY29udGFpbmVyIHx8ICFjb250YWluZXIudGFnTmFtZSkgeyAvLyBuYcOvdmUgaXMgZW5vdWdoXG4gICAgdGhyb3cgbmV3IEVycm9yKCdZb3UgbXVzdCBkZWZpbmUgYW4gYXBwbGljYXRpb24gcm9vdCBjb250YWluZXIhJyk7XG4gIH1cblxuICBtb3VudGVkID0gdHJ1ZTtcblxuICBzdGF0ZS5jb250YWluZXIgPSBjb250YWluZXI7XG4gIHN0YXRlLmNvbnRyb2xsZXJzID0gd2lyaW5nLmNvbnRyb2xsZXJzO1xuICBzdGF0ZS50ZW1wbGF0ZXMgPSB3aXJpbmcudGVtcGxhdGVzO1xuICBzdGF0ZS5yb3V0ZXMgPSB3aXJpbmcucm91dGVzO1xuICBzdGF0ZS5wcmVmZXRjaCA9ICEhby5wcmVmZXRjaDtcblxuICByb3V0ZXIuc2V0dXAod2lyaW5nLnJvdXRlcyk7XG5cbiAgdmFyIHVybCA9IGxvY2F0aW9uLnBhdGhuYW1lO1xuICB2YXIgcXVlcnkgPSBvckVtcHR5KGxvY2F0aW9uLnNlYXJjaCkgKyBvckVtcHR5KGxvY2F0aW9uLmhhc2gpO1xuICB2YXIgcm91dGUgPSByb3V0ZXIodXJsICsgcXVlcnkpO1xuXG4gIGNhY2hpbmcuc2V0dXAoby5jYWNoZSwgcm91dGUpO1xuICBjYWNoaW5nLnJlYWR5KGtpY2tzdGFydCk7XG5cbiAgZnVuY3Rpb24ga2lja3N0YXJ0ICgpIHtcbiAgICBpZiAoIW8uYm9vdHN0cmFwKSB7IG8uYm9vdHN0cmFwID0gJ2F1dG8nOyB9XG4gICAgaWYgKG8uYm9vdHN0cmFwID09PSAnYXV0bycpIHtcbiAgICAgIGF1dG9ib290KCk7XG4gICAgfSBlbHNlIGlmIChvLmJvb3RzdHJhcCA9PT0gJ2lubGluZScpIHtcbiAgICAgIGlubGluZWJvb3QoKTtcbiAgICB9IGVsc2UgaWYgKG8uYm9vdHN0cmFwID09PSAnbWFudWFsJykge1xuICAgICAgbWFudWFsYm9vdCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3Ioby5ib290c3RyYXAgKyAnIGlzIG5vdCBhIHZhbGlkIGJvb3RzdHJhcCBtb2RlIScpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGF1dG9ib290ICgpIHtcbiAgICBmZXRjaGVyKHJvdXRlLCB7IGVsZW1lbnQ6IGNvbnRhaW5lciwgc291cmNlOiAnYm9vdCcgfSwgZmV0Y2hlZCk7XG4gIH1cblxuICBmdW5jdGlvbiBmZXRjaGVkIChlcnIsIGRhdGEpIHtcbiAgICBpZiAoZXJyKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZldGNoaW5nIEpTT04gZGF0YSBtb2RlbCBmb3IgZmlyc3QgdmlldyBmYWlsZWQuJyk7XG4gICAgfVxuICAgIGJvb3QoZGF0YSk7XG4gIH1cblxuICBmdW5jdGlvbiBpbmxpbmVib290ICgpIHtcbiAgICB2YXIgaWQgPSBjb250YWluZXIuZ2V0QXR0cmlidXRlKCdkYXRhLXRhdW51cycpO1xuICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChpZCk7XG4gICAgdmFyIG1vZGVsID0gSlNPTi5wYXJzZSh1bmVzY2FwZShzY3JpcHQuaW5uZXJUZXh0IHx8IHNjcmlwdC50ZXh0Q29udGVudCkpO1xuICAgIGJvb3QobW9kZWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gbWFudWFsYm9vdCAoKSB7XG4gICAgaWYgKHR5cGVvZiBnLnRhdW51c1JlYWR5ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBnLnRhdW51c1JlYWR5ID0gYm9vdDsgLy8gbm90IHlldCBhbiBvYmplY3Q/IHR1cm4gaXQgaW50byB0aGUgYm9vdCBtZXRob2RcbiAgICB9IGVsc2UgaWYgKGcudGF1bnVzUmVhZHkgJiYgdHlwZW9mIGcudGF1bnVzUmVhZHkgPT09ICdvYmplY3QnKSB7XG4gICAgICBib290KGcudGF1bnVzUmVhZHkpOyAvLyBhbHJlYWR5IGFuIG9iamVjdD8gYm9vdCB3aXRoIHRoYXQgYXMgdGhlIG1vZGVsXG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignRGlkIHlvdSBmb3JnZXQgdG8gYWRkIHRoZSB0YXVudXNSZWFkeSBnbG9iYWw/Jyk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYm9vdCAobW9kZWwpIHtcbiAgICBpZiAoYm9vdGVkKSB7IC8vIHNhbml0eVxuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIW1vZGVsIHx8IHR5cGVvZiBtb2RlbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVGF1bnVzIG1vZGVsIG11c3QgYmUgYW4gb2JqZWN0IScpO1xuICAgIH1cbiAgICBib290ZWQgPSB0cnVlO1xuICAgIGNhY2hpbmcucGVyc2lzdChyb3V0ZSwgc3RhdGUuY29udGFpbmVyLCBtb2RlbCk7XG4gICAgYWN0aXZhdG9yLnN0YXJ0KG1vZGVsKTtcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IG1vdW50O1xuXG59KS5jYWxsKHRoaXMsdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHVzZWQ7XG4gIHJldHVybiBmdW5jdGlvbiBvbmNlICgpIHtcbiAgICBpZiAodXNlZCkgeyByZXR1cm47IH0gdXNlZCA9IHRydWU7XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmFmID0gcmVxdWlyZSgncmFmJyk7XG52YXIgc3RhdGUgPSByZXF1aXJlKCcuL3N0YXRlJyk7XG52YXIgZW1pdHRlciA9IHJlcXVpcmUoJy4vZW1pdHRlcicpO1xuXG5mdW5jdGlvbiBwb3NpdGlvbmluZyAoKSB7XG4gIHZhciB0YXJnZXQ7XG4gIHZhciBoYXNoID0gbG9jYXRpb24uaGFzaDtcbiAgaWYgKGhhc2gpIHtcbiAgICB0YXJnZXQgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChoYXNoLnNsaWNlKDEpKTtcbiAgfVxuICBpZiAoIXRhcmdldCkge1xuICAgIHRhcmdldCA9IGRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcbiAgfVxuICByYWYoZm9jdXNpbik7XG4gIGZ1bmN0aW9uIGZvY3VzaW4gKCkge1xuICAgIHRhcmdldC5zY3JvbGxJbnRvVmlldygpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHBhcnRpYWwgKGNvbnRhaW5lciwgZW5mb3JjZWRBY3Rpb24sIG1vZGVsLCByb3V0ZSwgb3B0aW9ucykge1xuICB2YXIgYWN0aW9uID0gZW5mb3JjZWRBY3Rpb24gfHwgbW9kZWwgJiYgbW9kZWwuYWN0aW9uIHx8IHJvdXRlICYmIHJvdXRlLmFjdGlvbjtcbiAgdmFyIGNvbnRyb2xsZXIgPSBzdGF0ZS5jb250cm9sbGVyc1thY3Rpb25dO1xuICB2YXIgaW50ZXJuYWxzID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKGludGVybmFscy5yZW5kZXIgIT09IGZhbHNlKSB7XG4gICAgY29udGFpbmVyLmlubmVySFRNTCA9IHJlbmRlcihhY3Rpb24sIG1vZGVsKTtcbiAgICBpZiAoaW50ZXJuYWxzLnJvdXRlZCAhPT0gZmFsc2UpIHtcbiAgICAgIHBvc2l0aW9uaW5nKCk7XG4gICAgfVxuICB9XG4gIGVtaXR0ZXIuZW1pdCgncmVuZGVyJywgY29udGFpbmVyLCBtb2RlbCk7XG4gIGlmIChjb250cm9sbGVyKSB7XG4gICAgY29udHJvbGxlcihtb2RlbCwgY29udGFpbmVyLCByb3V0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyIChhY3Rpb24sIG1vZGVsKSB7XG4gIHZhciB0ZW1wbGF0ZSA9IHN0YXRlLnRlbXBsYXRlc1thY3Rpb25dO1xuICB0cnkge1xuICAgIHJldHVybiB0ZW1wbGF0ZShtb2RlbCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0Vycm9yIHJlbmRlcmluZyBcIicgKyBhY3Rpb24gKyAnXCIgdGVtcGxhdGVcXG4nICsgZS5zdGFjayk7XG4gIH1cbn1cblxuZnVuY3Rpb24gc3RhbmRhbG9uZSAoY29udGFpbmVyLCBhY3Rpb24sIG1vZGVsLCByb3V0ZSkge1xuICByZXR1cm4gcGFydGlhbChjb250YWluZXIsIGFjdGlvbiwgbW9kZWwsIHJvdXRlLCB7IHJvdXRlZDogZmFsc2UgfSk7XG59XG5cbnBhcnRpYWwuc3RhbmRhbG9uZSA9IHN0YW5kYWxvbmU7XG5cbm1vZHVsZS5leHBvcnRzID0gcGFydGlhbDtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHVybCA9IHJlcXVpcmUoJ2Zhc3QtdXJsLXBhcnNlcicpO1xudmFyIHJvdXRlcyA9IHJlcXVpcmUoJ3JvdXRlcycpO1xudmFyIG1hdGNoZXIgPSByb3V0ZXMoKTtcblxuZnVuY3Rpb24gcm91dGVyIChyYXcpIHtcbiAgdmFyIHBhcnRzID0gdXJsLnBhcnNlKHJhdyk7XG4gIHZhciByZXN1bHQgPSBtYXRjaGVyLm1hdGNoKHBhcnRzLnBhdGhuYW1lKTtcbiAgdmFyIHJvdXRlID0gcmVzdWx0ID8gcmVzdWx0LmZuKHJlc3VsdCkgOiBudWxsO1xuICBpZiAocm91dGUpIHtcbiAgICByb3V0ZS51cmwgPSByYXc7XG4gICAgcm91dGUucGFydHMgPSBwYXJ0cztcbiAgfVxuICByZXR1cm4gcm91dGU7XG59XG5cbmZ1bmN0aW9uIHNldHVwIChkZWZpbml0aW9ucykge1xuICBPYmplY3Qua2V5cyhkZWZpbml0aW9ucykuZm9yRWFjaChkZWZpbmUuYmluZChudWxsLCBkZWZpbml0aW9ucykpO1xufVxuXG5mdW5jdGlvbiBkZWZpbmUgKGRlZmluaXRpb25zLCBrZXkpIHtcbiAgbWF0Y2hlci5hZGRSb3V0ZShrZXksIGZ1bmN0aW9uIGRlZmluaXRpb24gKG1hdGNoKSB7XG4gICAgdmFyIHBhcmFtcyA9IG1hdGNoLnBhcmFtcztcbiAgICBwYXJhbXMuYXJncyA9IG1hdGNoLnNwbGF0cztcbiAgICByZXR1cm4ge1xuICAgICAgcm91dGU6IGtleSxcbiAgICAgIHBhcmFtczogcGFyYW1zLFxuICAgICAgYWN0aW9uOiBkZWZpbml0aW9uc1trZXldLmFjdGlvbiB8fCBudWxsLFxuICAgICAgaWdub3JlOiBkZWZpbml0aW9uc1trZXldLmlnbm9yZSxcbiAgICAgIGNhY2hlOiBkZWZpbml0aW9uc1trZXldLmNhY2hlXG4gICAgfTtcbiAgfSk7XG59XG5cbnJvdXRlci5zZXR1cCA9IHNldHVwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJvdXRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGNvbnRhaW5lcjogbnVsbFxufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIGFwaSA9IHt9O1xudmFyIGcgPSBnbG9iYWw7XG52YXIgaWRiID0gZy5pbmRleGVkREIgfHwgZy5tb3pJbmRleGVkREIgfHwgZy53ZWJraXRJbmRleGVkREIgfHwgZy5tc0luZGV4ZWREQjtcbnZhciBzdXBwb3J0cztcbnZhciBkYjtcbnZhciBkYk5hbWUgPSAndGF1bnVzLWNhY2hlJztcbnZhciBzdG9yZSA9ICd2aWV3LW1vZGVscyc7XG52YXIga2V5UGF0aCA9ICd1cmwnO1xudmFyIHNldFF1ZXVlID0gW107XG52YXIgdGVzdGVkUXVldWUgPSBbXTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiB0ZXN0ICgpIHtcbiAgdmFyIGtleSA9ICdpbmRleGVkLWRiLWZlYXR1cmUtZGV0ZWN0aW9uJztcbiAgdmFyIHJlcTtcbiAgdmFyIGRiO1xuXG4gIGlmICghKGlkYiAmJiAnZGVsZXRlRGF0YWJhc2UnIGluIGlkYikpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTsgcmV0dXJuO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KS5vbnN1Y2Nlc3MgPSB0cmFuc2FjdGlvbmFsVGVzdDtcbiAgfSBjYXRjaCAoZSkge1xuICAgIHN1cHBvcnQoZmFsc2UpO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJhbnNhY3Rpb25hbFRlc3QgKCkge1xuICAgIHJlcSA9IGlkYi5vcGVuKGtleSwgMSk7XG4gICAgcmVxLm9udXBncmFkZW5lZWRlZCA9IHVwZ25lZWRlZDtcbiAgICByZXEub25lcnJvciA9IGVycm9yO1xuICAgIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gICAgZnVuY3Rpb24gdXBnbmVlZGVkICgpIHtcbiAgICAgIHJlcS5yZXN1bHQuY3JlYXRlT2JqZWN0U3RvcmUoJ3N0b3JlJyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgICBkYiA9IHJlcS5yZXN1bHQ7XG4gICAgICB0cnkge1xuICAgICAgICBkYi50cmFuc2FjdGlvbignc3RvcmUnLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoJ3N0b3JlJykuYWRkKG5ldyBCbG9iKCksICdrZXknKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgc3VwcG9ydChmYWxzZSk7XG4gICAgICB9IGZpbmFsbHkge1xuICAgICAgICBkYi5jbG9zZSgpO1xuICAgICAgICBpZGIuZGVsZXRlRGF0YWJhc2Uoa2V5KTtcbiAgICAgICAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkge1xuICAgICAgICAgIG9wZW4oKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICAgIHN1cHBvcnQoZmFsc2UpO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBvcGVuICgpIHtcbiAgdmFyIHJlcSA9IGlkYi5vcGVuKGRiTmFtZSwgMSk7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG4gIHJlcS5vbnVwZ3JhZGVuZWVkZWQgPSB1cGduZWVkZWQ7XG4gIHJlcS5vbnN1Y2Nlc3MgPSBzdWNjZXNzO1xuXG4gIGZ1bmN0aW9uIHVwZ25lZWRlZCAoKSB7XG4gICAgcmVxLnJlc3VsdC5jcmVhdGVPYmplY3RTdG9yZShzdG9yZSwgeyBrZXlQYXRoOiBrZXlQYXRoIH0pO1xuICB9XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgZGIgPSByZXEucmVzdWx0O1xuICAgIGFwaS5uYW1lID0gJ0luZGV4ZWREQic7XG4gICAgYXBpLmdldCA9IGdldDtcbiAgICBhcGkuc2V0ID0gc2V0O1xuICAgIGRyYWluU2V0KCk7XG4gICAgc3VwcG9ydCh0cnVlKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVycm9yICgpIHtcbiAgICBzdXBwb3J0KGZhbHNlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBmYWxsYmFjayAoKSB7XG4gIGFwaS5uYW1lID0gJ0luZGV4ZWREQi1mYWxsYmFja1N0b3JlJztcbiAgYXBpLmdldCA9IHVuZGVmaW5lZEdldDtcbiAgYXBpLnNldCA9IGVucXVldWVTZXQ7XG59XG5cbmZ1bmN0aW9uIHVuZGVmaW5lZEdldCAoa2V5LCBkb25lKSB7XG4gIGRvbmUobnVsbCwgbnVsbCk7XG59XG5cbmZ1bmN0aW9uIGVucXVldWVTZXQgKGtleSwgIHZhbHVlLCBkb25lKSB7XG4gIGlmIChzZXRRdWV1ZS5sZW5ndGggPiAyKSB7IC8vIGxldCdzIG5vdCB3YXN0ZSBhbnkgbW9yZSBtZW1vcnlcbiAgICByZXR1cm47XG4gIH1cbiAgaWYgKHN1cHBvcnRzICE9PSBmYWxzZSkgeyAvLyBsZXQncyBhc3N1bWUgdGhlIGNhcGFiaWxpdHkgaXMgdmFsaWRhdGVkIHNvb25cbiAgICBzZXRRdWV1ZS5wdXNoKHsga2V5OiBrZXksIHZhbHVlOiB2YWx1ZSwgZG9uZTogZG9uZSB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblNldCAoKSB7XG4gIHdoaWxlIChzZXRRdWV1ZS5sZW5ndGgpIHtcbiAgICB2YXIgaXRlbSA9IHNldFF1ZXVlLnNoaWZ0KCk7XG4gICAgc2V0KGl0ZW0ua2V5LCBpdGVtLnZhbHVlLCBpdGVtLmRvbmUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHF1ZXJ5IChvcCwgdmFsdWUsIGRvbmUpIHtcbiAgdmFyIHJlcSA9IGRiLnRyYW5zYWN0aW9uKHN0b3JlLCAncmVhZHdyaXRlJykub2JqZWN0U3RvcmUoc3RvcmUpW29wXSh2YWx1ZSk7XG5cbiAgcmVxLm9uc3VjY2VzcyA9IHN1Y2Nlc3M7XG4gIHJlcS5vbmVycm9yID0gZXJyb3I7XG5cbiAgZnVuY3Rpb24gc3VjY2VzcyAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobnVsbCwgcmVxLnJlc3VsdCk7XG4gIH1cblxuICBmdW5jdGlvbiBlcnJvciAoKSB7XG4gICAgKGRvbmUgfHwgbm9vcCkobmV3IEVycm9yKCdUYXVudXMgY2FjaGUgcXVlcnkgZmFpbGVkIGF0IEluZGV4ZWREQiEnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0IChrZXksIGRvbmUpIHtcbiAgcXVlcnkoJ2dldCcsIGtleSwgZG9uZSk7XG59XG5cbmZ1bmN0aW9uIHNldCAoa2V5LCB2YWx1ZSwgZG9uZSkge1xuICB2YWx1ZVtrZXlQYXRoXSA9IGtleTtcbiAgcXVlcnkoJ2FkZCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byBpbnNlcnRcbiAgcXVlcnkoJ3B1dCcsIHZhbHVlLCBkb25lKTsgLy8gYXR0ZW1wdCB0byB1cGRhdGVcbn1cblxuZnVuY3Rpb24gZHJhaW5UZXN0ZWQgKCkge1xuICB3aGlsZSAodGVzdGVkUXVldWUubGVuZ3RoKSB7XG4gICAgdGVzdGVkUXVldWUuc2hpZnQoKSgpO1xuICB9XG59XG5cbmZ1bmN0aW9uIHRlc3RlZCAoZm4pIHtcbiAgaWYgKHN1cHBvcnRzICE9PSB2b2lkIDApIHtcbiAgICBmbigpO1xuICB9IGVsc2Uge1xuICAgIHRlc3RlZFF1ZXVlLnB1c2goZm4pO1xuICB9XG59XG5cbmZ1bmN0aW9uIHN1cHBvcnQgKHZhbHVlKSB7XG4gIGlmIChzdXBwb3J0cyAhPT0gdm9pZCAwKSB7XG4gICAgcmV0dXJuOyAvLyBzYW5pdHlcbiAgfVxuICBzdXBwb3J0cyA9IHZhbHVlO1xuICBkcmFpblRlc3RlZCgpO1xufVxuXG5mdW5jdGlvbiBmYWlsZWQgKCkge1xuICBzdXBwb3J0KGZhbHNlKTtcbn1cblxuZmFsbGJhY2soKTtcbnRlc3QoKTtcbnNldFRpbWVvdXQoZmFpbGVkLCA2MDApOyAvLyB0aGUgdGVzdCBjYW4gdGFrZSBzb21ld2hlcmUgbmVhciAzMDBtcyB0byBjb21wbGV0ZVxuXG5tb2R1bGUuZXhwb3J0cyA9IGFwaTtcblxuYXBpLnRlc3RlZCA9IHRlc3RlZDtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciByYXcgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCAoKSB7fVxuXG5mdW5jdGlvbiBnZXQgKGtleSwgZG9uZSkge1xuICBkb25lKG51bGwsIHJhd1trZXldKTtcbn1cblxuZnVuY3Rpb24gc2V0IChrZXksIHZhbHVlLCBkb25lKSB7XG4gIHJhd1trZXldID0gdmFsdWU7XG4gIChkb25lIHx8IG5vb3ApKG51bGwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgbmFtZTogJ21lbW9yeVN0b3JlJyxcbiAgZ2V0OiBnZXQsXG4gIHNldDogc2V0XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVFc2NhcGVkSHRtbCA9IC8mKD86YW1wfGx0fGd0fHF1b3R8IzM5fCM5Nik7L2c7XG52YXIgaHRtbFVuZXNjYXBlcyA9IHtcbiAgJyZhbXA7JzogJyYnLFxuICAnJmx0Oyc6ICc8JyxcbiAgJyZndDsnOiAnPicsXG4gICcmcXVvdDsnOiAnXCInLFxuICAnJiMzOTsnOiAnXFwnJyxcbiAgJyYjOTY7JzogJ2AnXG59O1xuXG5mdW5jdGlvbiB1bmVzY2FwZUh0bWxDaGFyIChjKSB7XG4gIHJldHVybiBodG1sVW5lc2NhcGVzW2NdO1xufVxuXG5mdW5jdGlvbiB1bmVzY2FwZSAoaW5wdXQpIHtcbiAgdmFyIGRhdGEgPSBpbnB1dCA9PSBudWxsID8gJycgOiBTdHJpbmcoaW5wdXQpO1xuICBpZiAoZGF0YSAmJiAocmVFc2NhcGVkSHRtbC5sYXN0SW5kZXggPSAwLCByZUVzY2FwZWRIdG1sLnRlc3QoZGF0YSkpKSB7XG4gICAgcmV0dXJuIGRhdGEucmVwbGFjZShyZUVzY2FwZWRIdG1sLCB1bmVzY2FwZUh0bWxDaGFyKTtcbiAgfVxuICByZXR1cm4gZGF0YTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB1bmVzY2FwZTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHhociA9IHJlcXVpcmUoJ3hocicpO1xudmFyIGVtaXR0ZXIgPSByZXF1aXJlKCcuL2VtaXR0ZXInKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAodXJsLCBkb25lKSB7XG4gIHZhciBvcHRpb25zID0ge1xuICAgIHVybDogdXJsLFxuICAgIGpzb246IHRydWUsXG4gICAgaGVhZGVyczogeyBBY2NlcHQ6ICdhcHBsaWNhdGlvbi9qc29uJyB9XG4gIH07XG4gIHZhciByZXEgPSB4aHIob3B0aW9ucywgaGFuZGxlKTtcblxuICByZXR1cm4gcmVxO1xuXG4gIGZ1bmN0aW9uIGhhbmRsZSAoZXJyLCByZXMsIGJvZHkpIHtcbiAgICBpZiAoZXJyICYmICFyZXEuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpIHtcbiAgICAgIGRvbmUobmV3IEVycm9yKCdhYm9ydGVkJykpO1xuICAgIH0gZWxzZSB7XG4gICAgICBkb25lKGVyciwgYm9keSk7XG4gICAgfVxuICB9XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL3NyYy9jb250cmEuZW1pdHRlci5qcycpO1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbihmdW5jdGlvbiAocm9vdCwgdW5kZWZpbmVkKSB7XG4gICd1c2Ugc3RyaWN0JztcblxuICB2YXIgdW5kZWYgPSAnJyArIHVuZGVmaW5lZDtcbiAgZnVuY3Rpb24gYXRvYSAoYSwgbikgeyByZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYSwgbik7IH1cbiAgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBhcmdzLCBjdHgpIHsgaWYgKCFmbikgeyByZXR1cm47IH0gdGljayhmdW5jdGlvbiBydW4gKCkgeyBmbi5hcHBseShjdHggfHwgbnVsbCwgYXJncyB8fCBbXSk7IH0pOyB9XG5cbiAgLy8gY3Jvc3MtcGxhdGZvcm0gdGlja2VyXG4gIHZhciBzaSA9IHR5cGVvZiBzZXRJbW1lZGlhdGUgPT09ICdmdW5jdGlvbicsIHRpY2s7XG4gIGlmIChzaSkge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0SW1tZWRpYXRlKGZuKTsgfTtcbiAgfSBlbHNlIGlmICh0eXBlb2YgcHJvY2VzcyAhPT0gdW5kZWYgJiYgcHJvY2Vzcy5uZXh0VGljaykge1xuICAgIHRpY2sgPSBwcm9jZXNzLm5leHRUaWNrO1xuICB9IGVsc2Uge1xuICAgIHRpY2sgPSBmdW5jdGlvbiAoZm4pIHsgc2V0VGltZW91dChmbiwgMCk7IH07XG4gIH1cblxuICBmdW5jdGlvbiBfZW1pdHRlciAodGhpbmcsIG9wdGlvbnMpIHtcbiAgICB2YXIgb3B0cyA9IG9wdGlvbnMgfHwge307XG4gICAgdmFyIGV2dCA9IHt9O1xuICAgIGlmICh0aGluZyA9PT0gdW5kZWZpbmVkKSB7IHRoaW5nID0ge307IH1cbiAgICB0aGluZy5vbiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgaWYgKCFldnRbdHlwZV0pIHtcbiAgICAgICAgZXZ0W3R5cGVdID0gW2ZuXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV2dFt0eXBlXS5wdXNoKGZuKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9uY2UgPSBmdW5jdGlvbiAodHlwZSwgZm4pIHtcbiAgICAgIGZuLl9vbmNlID0gdHJ1ZTsgLy8gdGhpbmcub2ZmKGZuKSBzdGlsbCB3b3JrcyFcbiAgICAgIHRoaW5nLm9uKHR5cGUsIGZuKTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLm9mZiA9IGZ1bmN0aW9uICh0eXBlLCBmbikge1xuICAgICAgdmFyIGMgPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGMgPT09IDEpIHtcbiAgICAgICAgZGVsZXRlIGV2dFt0eXBlXTtcbiAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMCkge1xuICAgICAgICBldnQgPSB7fTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBldCA9IGV2dFt0eXBlXTtcbiAgICAgICAgaWYgKCFldCkgeyByZXR1cm4gdGhpbmc7IH1cbiAgICAgICAgZXQuc3BsaWNlKGV0LmluZGV4T2YoZm4pLCAxKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHRoaW5nLmVtaXQgPSBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgY3R4ID0gdGhpcztcbiAgICAgIHZhciBhcmdzID0gYXRvYShhcmd1bWVudHMpO1xuICAgICAgdmFyIHR5cGUgPSBhcmdzLnNoaWZ0KCk7XG4gICAgICB2YXIgZXQgPSBldnRbdHlwZV07XG4gICAgICBpZiAodHlwZSA9PT0gJ2Vycm9yJyAmJiBvcHRzLnRocm93cyAhPT0gZmFsc2UgJiYgIWV0KSB7IHRocm93IGFyZ3MubGVuZ3RoID09PSAxID8gYXJnc1swXSA6IGFyZ3M7IH1cbiAgICAgIGlmICghZXQpIHsgcmV0dXJuIHRoaW5nOyB9XG4gICAgICBldnRbdHlwZV0gPSBldC5maWx0ZXIoZnVuY3Rpb24gZW1pdHRlciAobGlzdGVuKSB7XG4gICAgICAgIGlmIChvcHRzLmFzeW5jKSB7IGRlYm91bmNlKGxpc3RlbiwgYXJncywgY3R4KTsgfSBlbHNlIHsgbGlzdGVuLmFwcGx5KGN0eCwgYXJncyk7IH1cbiAgICAgICAgcmV0dXJuICFsaXN0ZW4uX29uY2U7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0aGluZztcbiAgICB9O1xuICAgIHJldHVybiB0aGluZztcbiAgfVxuXG4gIC8vIGNyb3NzLXBsYXRmb3JtIGV4cG9ydFxuICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gdW5kZWYgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IF9lbWl0dGVyO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuY29udHJhID0gcm9vdC5jb250cmEgfHwge307XG4gICAgcm9vdC5jb250cmEuZW1pdHRlciA9IF9lbWl0dGVyO1xuICB9XG59KSh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvbmljby8ubnZtL3YwLjEwLjI2L2xpYi9ub2RlX21vZHVsZXMvd2F0Y2hpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luc2VydC1tb2R1bGUtZ2xvYmFscy9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzXCIpKSIsIlwidXNlIHN0cmljdFwiO1xuLypcbkNvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92XG5cblBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbm9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlIFwiU29mdHdhcmVcIiksIHRvIGRlYWxcbmluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHNcbnRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGxcbmNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcblxuVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbmFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuXG5USEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG5JTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbkZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuICBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbkFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVJcbkxJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sXG5PVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOXG5USEUgU09GVFdBUkUuXG4qL1xuZnVuY3Rpb24gVXJsKCkge1xuICAgIC8vRm9yIG1vcmUgZWZmaWNpZW50IGludGVybmFsIHJlcHJlc2VudGF0aW9uIGFuZCBsYXppbmVzcy5cbiAgICAvL1RoZSBub24tdW5kZXJzY29yZSB2ZXJzaW9ucyBvZiB0aGVzZSBwcm9wZXJ0aWVzIGFyZSBhY2Nlc3NvciBmdW5jdGlvbnNcbiAgICAvL2RlZmluZWQgb24gdGhlIHByb3RvdHlwZS5cbiAgICB0aGlzLl9wcm90b2NvbCA9IG51bGw7XG4gICAgdGhpcy5faHJlZiA9IFwiXCI7XG4gICAgdGhpcy5fcG9ydCA9IC0xO1xuICAgIHRoaXMuX3F1ZXJ5ID0gbnVsbDtcblxuICAgIHRoaXMuYXV0aCA9IG51bGw7XG4gICAgdGhpcy5zbGFzaGVzID0gbnVsbDtcbiAgICB0aGlzLmhvc3QgPSBudWxsO1xuICAgIHRoaXMuaG9zdG5hbWUgPSBudWxsO1xuICAgIHRoaXMuaGFzaCA9IG51bGw7XG4gICAgdGhpcy5zZWFyY2ggPSBudWxsO1xuICAgIHRoaXMucGF0aG5hbWUgPSBudWxsO1xuXG4gICAgdGhpcy5fcHJlcGVuZFNsYXNoID0gZmFsc2U7XG59XG5cbnZhciBxdWVyeXN0cmluZyA9IHJlcXVpcmUoXCJxdWVyeXN0cmluZ1wiKTtcblVybC5wcm90b3R5cGUucGFyc2UgPVxuZnVuY3Rpb24gVXJsJHBhcnNlKHN0ciwgcGFyc2VRdWVyeVN0cmluZywgaG9zdERlbm90ZXNTbGFzaCkge1xuICAgIGlmICh0eXBlb2Ygc3RyICE9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJQYXJhbWV0ZXIgJ3VybCcgbXVzdCBiZSBhIHN0cmluZywgbm90IFwiICtcbiAgICAgICAgICAgIHR5cGVvZiBzdHIpO1xuICAgIH1cbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIHZhciBlbmQgPSBzdHIubGVuZ3RoIC0gMTtcblxuICAgIC8vVHJpbSBsZWFkaW5nIGFuZCB0cmFpbGluZyB3c1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChzdGFydCkgPD0gMHgyMCAvKicgJyovKSBzdGFydCsrO1xuICAgIHdoaWxlIChzdHIuY2hhckNvZGVBdChlbmQpIDw9IDB4MjAgLyonICcqLykgZW5kLS07XG5cbiAgICBzdGFydCA9IHRoaXMuX3BhcnNlUHJvdG9jb2woc3RyLCBzdGFydCwgZW5kKTtcblxuICAgIC8vSmF2YXNjcmlwdCBkb2Vzbid0IGhhdmUgaG9zdFxuICAgIGlmICh0aGlzLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgc3RhcnQgPSB0aGlzLl9wYXJzZUhvc3Qoc3RyLCBzdGFydCwgZW5kLCBob3N0RGVub3Rlc1NsYXNoKTtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIGlmICghdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICAgICAgKHRoaXMuc2xhc2hlcyB8fCAocHJvdG8gJiYgIXNsYXNoUHJvdG9jb2xzW3Byb3RvXSkpKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFydCA8PSBlbmQpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoc3RhcnQpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgyRiAvKicvJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChjaCA9PT0gMHgzRiAvKic/JyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5fcHJvdG9jb2wgIT09IFwiamF2YXNjcmlwdFwiKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZVBhdGgoc3RyLCBzdGFydCwgZW5kKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHsgLy9Gb3IgamF2YXNjcmlwdCB0aGUgcGF0aG5hbWUgaXMganVzdCB0aGUgcmVzdCBvZiBpdFxuICAgICAgICAgICAgdGhpcy5wYXRobmFtZSA9IHN0ci5zbGljZShzdGFydCwgZW5kICsgMSApO1xuICAgICAgICB9XG5cbiAgICB9XG5cbiAgICBpZiAoIXRoaXMucGF0aG5hbWUgJiYgdGhpcy5ob3N0bmFtZSAmJlxuICAgICAgICB0aGlzLl9zbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF0pIHtcbiAgICAgICAgdGhpcy5wYXRobmFtZSA9IFwiL1wiO1xuICAgIH1cblxuICAgIGlmIChwYXJzZVF1ZXJ5U3RyaW5nKSB7XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcbiAgICAgICAgaWYgKHNlYXJjaCA9PSBudWxsKSB7XG4gICAgICAgICAgICBzZWFyY2ggPSB0aGlzLnNlYXJjaCA9IFwiXCI7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHNlYXJjaC5jaGFyQ29kZUF0KDApID09PSAweDNGIC8qJz8nKi8pIHtcbiAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgfVxuICAgICAgICAvL1RoaXMgY2FsbHMgYSBzZXR0ZXIgZnVuY3Rpb24sIHRoZXJlIGlzIG5vIC5xdWVyeSBkYXRhIHByb3BlcnR5XG4gICAgICAgIHRoaXMucXVlcnkgPSBxdWVyeXN0cmluZy5wYXJzZShzZWFyY2gpO1xuICAgIH1cbn07XG5cblVybC5wcm90b3R5cGUucmVzb2x2ZSA9IGZ1bmN0aW9uIFVybCRyZXNvbHZlKHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZU9iamVjdChVcmwucGFyc2UocmVsYXRpdmUsIGZhbHNlLCB0cnVlKSkuZm9ybWF0KCk7XG59O1xuXG5VcmwucHJvdG90eXBlLmZvcm1hdCA9IGZ1bmN0aW9uIFVybCRmb3JtYXQoKSB7XG4gICAgdmFyIGF1dGggPSB0aGlzLmF1dGggfHwgXCJcIjtcblxuICAgIGlmIChhdXRoKSB7XG4gICAgICAgIGF1dGggPSBlbmNvZGVVUklDb21wb25lbnQoYXV0aCk7XG4gICAgICAgIGF1dGggPSBhdXRoLnJlcGxhY2UoLyUzQS9pLCBcIjpcIik7XG4gICAgICAgIGF1dGggKz0gXCJAXCI7XG4gICAgfVxuXG4gICAgdmFyIHByb3RvY29sID0gdGhpcy5wcm90b2NvbCB8fCBcIlwiO1xuICAgIHZhciBwYXRobmFtZSA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICB2YXIgaGFzaCA9IHRoaXMuaGFzaCB8fCBcIlwiO1xuICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgIHZhciBxdWVyeSA9IFwiXCI7XG4gICAgdmFyIGhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZSB8fCBcIlwiO1xuICAgIHZhciBwb3J0ID0gdGhpcy5wb3J0IHx8IFwiXCI7XG4gICAgdmFyIGhvc3QgPSBmYWxzZTtcbiAgICB2YXIgc2NoZW1lID0gXCJcIjtcblxuICAgIC8vQ2FjaGUgdGhlIHJlc3VsdCBvZiB0aGUgZ2V0dGVyIGZ1bmN0aW9uXG4gICAgdmFyIHEgPSB0aGlzLnF1ZXJ5O1xuICAgIGlmIChxICYmIHR5cGVvZiBxID09PSBcIm9iamVjdFwiKSB7XG4gICAgICAgIHF1ZXJ5ID0gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHEpO1xuICAgIH1cblxuICAgIGlmICghc2VhcmNoKSB7XG4gICAgICAgIHNlYXJjaCA9IHF1ZXJ5ID8gXCI/XCIgKyBxdWVyeSA6IFwiXCI7XG4gICAgfVxuXG4gICAgaWYgKHByb3RvY29sICYmIHByb3RvY29sLmNoYXJDb2RlQXQocHJvdG9jb2wubGVuZ3RoIC0gMSkgIT09IDB4M0EgLyonOicqLylcbiAgICAgICAgcHJvdG9jb2wgKz0gXCI6XCI7XG5cbiAgICBpZiAodGhpcy5ob3N0KSB7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgdGhpcy5ob3N0O1xuICAgIH1cbiAgICBlbHNlIGlmIChob3N0bmFtZSkge1xuICAgICAgICB2YXIgaXA2ID0gaG9zdG5hbWUuaW5kZXhPZihcIjpcIikgPiAtMTtcbiAgICAgICAgaWYgKGlwNikgaG9zdG5hbWUgPSBcIltcIiArIGhvc3RuYW1lICsgXCJdXCI7XG4gICAgICAgIGhvc3QgPSBhdXRoICsgaG9zdG5hbWUgKyAocG9ydCA/IFwiOlwiICsgcG9ydCA6IFwiXCIpO1xuICAgIH1cblxuICAgIHZhciBzbGFzaGVzID0gdGhpcy5zbGFzaGVzIHx8XG4gICAgICAgICgoIXByb3RvY29sIHx8XG4gICAgICAgIHNsYXNoUHJvdG9jb2xzW3Byb3RvY29sXSkgJiYgaG9zdCAhPT0gZmFsc2UpO1xuXG5cbiAgICBpZiAocHJvdG9jb2wpIHNjaGVtZSA9IHByb3RvY29sICsgKHNsYXNoZXMgPyBcIi8vXCIgOiBcIlwiKTtcbiAgICBlbHNlIGlmIChzbGFzaGVzKSBzY2hlbWUgPSBcIi8vXCI7XG5cbiAgICBpZiAoc2xhc2hlcyAmJiBwYXRobmFtZSAmJiBwYXRobmFtZS5jaGFyQ29kZUF0KDApICE9PSAweDJGIC8qJy8nKi8pIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIi9cIiArIHBhdGhuYW1lO1xuICAgIH1cbiAgICBlbHNlIGlmICghc2xhc2hlcyAmJiBwYXRobmFtZSA9PT0gXCIvXCIpIHtcbiAgICAgICAgcGF0aG5hbWUgPSBcIlwiO1xuICAgIH1cbiAgICBpZiAoc2VhcmNoICYmIHNlYXJjaC5jaGFyQ29kZUF0KDApICE9PSAweDNGIC8qJz8nKi8pXG4gICAgICAgIHNlYXJjaCA9IFwiP1wiICsgc2VhcmNoO1xuICAgIGlmIChoYXNoICYmIGhhc2guY2hhckNvZGVBdCgwKSAhPT0gMHgyMyAvKicjJyovKVxuICAgICAgICBoYXNoID0gXCIjXCIgKyBoYXNoO1xuXG4gICAgcGF0aG5hbWUgPSBlc2NhcGVQYXRoTmFtZShwYXRobmFtZSk7XG4gICAgc2VhcmNoID0gZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG5cbiAgICByZXR1cm4gc2NoZW1lICsgKGhvc3QgPT09IGZhbHNlID8gXCJcIiA6IGhvc3QpICsgcGF0aG5hbWUgKyBzZWFyY2ggKyBoYXNoO1xufTtcblxuVXJsLnByb3RvdHlwZS5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJHJlc29sdmVPYmplY3QocmVsYXRpdmUpIHtcbiAgICBpZiAodHlwZW9mIHJlbGF0aXZlID09PSBcInN0cmluZ1wiKVxuICAgICAgICByZWxhdGl2ZSA9IFVybC5wYXJzZShyZWxhdGl2ZSwgZmFsc2UsIHRydWUpO1xuXG4gICAgdmFyIHJlc3VsdCA9IHRoaXMuX2Nsb25lKCk7XG5cbiAgICAvLyBoYXNoIGlzIGFsd2F5cyBvdmVycmlkZGVuLCBubyBtYXR0ZXIgd2hhdC5cbiAgICAvLyBldmVuIGhyZWY9XCJcIiB3aWxsIHJlbW92ZSBpdC5cbiAgICByZXN1bHQuaGFzaCA9IHJlbGF0aXZlLmhhc2g7XG5cbiAgICAvLyBpZiB0aGUgcmVsYXRpdmUgdXJsIGlzIGVtcHR5LCB0aGVuIHRoZXJlXCJzIG5vdGhpbmcgbGVmdCB0byBkbyBoZXJlLlxuICAgIGlmICghcmVsYXRpdmUuaHJlZikge1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8vIGhyZWZzIGxpa2UgLy9mb28vYmFyIGFsd2F5cyBjdXQgdG8gdGhlIHByb3RvY29sLlxuICAgIGlmIChyZWxhdGl2ZS5zbGFzaGVzICYmICFyZWxhdGl2ZS5fcHJvdG9jb2wpIHtcbiAgICAgICAgcmVsYXRpdmUuX2NvcHlQcm9wc1RvKHJlc3VsdCwgdHJ1ZSk7XG5cbiAgICAgICAgaWYgKHNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdICYmXG4gICAgICAgICAgICByZXN1bHQuaG9zdG5hbWUgJiYgIXJlc3VsdC5wYXRobmFtZSkge1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gcmVzdWx0Ll9wcm90b2NvbCkge1xuICAgICAgICAvLyBpZiBpdFwicyBhIGtub3duIHVybCBwcm90b2NvbCwgdGhlbiBjaGFuZ2luZ1xuICAgICAgICAvLyB0aGUgcHJvdG9jb2wgZG9lcyB3ZWlyZCB0aGluZ3NcbiAgICAgICAgLy8gZmlyc3QsIGlmIGl0XCJzIG5vdCBmaWxlOiwgdGhlbiB3ZSBNVVNUIGhhdmUgYSBob3N0LFxuICAgICAgICAvLyBhbmQgaWYgdGhlcmUgd2FzIGEgcGF0aFxuICAgICAgICAvLyB0byBiZWdpbiB3aXRoLCB0aGVuIHdlIE1VU1QgaGF2ZSBhIHBhdGguXG4gICAgICAgIC8vIGlmIGl0IGlzIGZpbGU6LCB0aGVuIHRoZSBob3N0IGlzIGRyb3BwZWQsXG4gICAgICAgIC8vIGJlY2F1c2UgdGhhdFwicyBrbm93biB0byBiZSBob3N0bGVzcy5cbiAgICAgICAgLy8gYW55dGhpbmcgZWxzZSBpcyBhc3N1bWVkIHRvIGJlIGFic29sdXRlLlxuICAgICAgICBpZiAoIXNsYXNoUHJvdG9jb2xzW3JlbGF0aXZlLl9wcm90b2NvbF0pIHtcbiAgICAgICAgICAgIHJlbGF0aXZlLl9jb3B5UHJvcHNUbyhyZXN1bHQsIGZhbHNlKTtcbiAgICAgICAgICAgIHJlc3VsdC5faHJlZiA9IFwiXCI7XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0Ll9wcm90b2NvbCA9IHJlbGF0aXZlLl9wcm90b2NvbDtcbiAgICAgICAgaWYgKCFyZWxhdGl2ZS5ob3N0ICYmIHJlbGF0aXZlLl9wcm90b2NvbCAhPT0gXCJqYXZhc2NyaXB0XCIpIHtcbiAgICAgICAgICAgIHZhciByZWxQYXRoID0gKHJlbGF0aXZlLnBhdGhuYW1lIHx8IFwiXCIpLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIHdoaWxlIChyZWxQYXRoLmxlbmd0aCAmJiAhKHJlbGF0aXZlLmhvc3QgPSByZWxQYXRoLnNoaWZ0KCkpKTtcbiAgICAgICAgICAgIGlmICghcmVsYXRpdmUuaG9zdCkgcmVsYXRpdmUuaG9zdCA9IFwiXCI7XG4gICAgICAgICAgICBpZiAoIXJlbGF0aXZlLmhvc3RuYW1lKSByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICBpZiAocmVsUGF0aFswXSAhPT0gXCJcIikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgaWYgKHJlbFBhdGgubGVuZ3RoIDwgMikgcmVsUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgICAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gcmVsUGF0aC5qb2luKFwiL1wiKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc3VsdC5wYXRobmFtZSA9IHJlbGF0aXZlLnBhdGhuYW1lO1xuICAgICAgICB9XG5cbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICAgICAgcmVzdWx0Lmhvc3QgPSByZWxhdGl2ZS5ob3N0IHx8IFwiXCI7XG4gICAgICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aDtcbiAgICAgICAgcmVzdWx0Lmhvc3RuYW1lID0gcmVsYXRpdmUuaG9zdG5hbWUgfHwgcmVsYXRpdmUuaG9zdDtcbiAgICAgICAgcmVzdWx0Ll9wb3J0ID0gcmVsYXRpdmUuX3BvcnQ7XG4gICAgICAgIHJlc3VsdC5zbGFzaGVzID0gcmVzdWx0LnNsYXNoZXMgfHwgcmVsYXRpdmUuc2xhc2hlcztcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICB2YXIgaXNTb3VyY2VBYnMgPVxuICAgICAgICAocmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5jaGFyQ29kZUF0KDApID09PSAweDJGIC8qJy8nKi8pO1xuICAgIHZhciBpc1JlbEFicyA9IChcbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3QgfHxcbiAgICAgICAgICAgIChyZWxhdGl2ZS5wYXRobmFtZSAmJlxuICAgICAgICAgICAgcmVsYXRpdmUucGF0aG5hbWUuY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKVxuICAgICAgICApO1xuICAgIHZhciBtdXN0RW5kQWJzID0gKGlzUmVsQWJzIHx8IGlzU291cmNlQWJzIHx8XG4gICAgICAgICAgICAgICAgICAgICAgICAocmVzdWx0Lmhvc3QgJiYgcmVsYXRpdmUucGF0aG5hbWUpKTtcblxuICAgIHZhciByZW1vdmVBbGxEb3RzID0gbXVzdEVuZEFicztcblxuICAgIHZhciBzcmNQYXRoID0gcmVzdWx0LnBhdGhuYW1lICYmIHJlc3VsdC5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHJlbFBhdGggPSByZWxhdGl2ZS5wYXRobmFtZSAmJiByZWxhdGl2ZS5wYXRobmFtZS5zcGxpdChcIi9cIikgfHwgW107XG4gICAgdmFyIHBzeWNob3RpYyA9IHJlc3VsdC5fcHJvdG9jb2wgJiYgIXNsYXNoUHJvdG9jb2xzW3Jlc3VsdC5fcHJvdG9jb2xdO1xuXG4gICAgLy8gaWYgdGhlIHVybCBpcyBhIG5vbi1zbGFzaGVkIHVybCwgdGhlbiByZWxhdGl2ZVxuICAgIC8vIGxpbmtzIGxpa2UgLi4vLi4gc2hvdWxkIGJlIGFibGVcbiAgICAvLyB0byBjcmF3bCB1cCB0byB0aGUgaG9zdG5hbWUsIGFzIHdlbGwuICBUaGlzIGlzIHN0cmFuZ2UuXG4gICAgLy8gcmVzdWx0LnByb3RvY29sIGhhcyBhbHJlYWR5IGJlZW4gc2V0IGJ5IG5vdy5cbiAgICAvLyBMYXRlciBvbiwgcHV0IHRoZSBmaXJzdCBwYXRoIHBhcnQgaW50byB0aGUgaG9zdCBmaWVsZC5cbiAgICBpZiAocHN5Y2hvdGljKSB7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgIHJlc3VsdC5fcG9ydCA9IC0xO1xuICAgICAgICBpZiAocmVzdWx0Lmhvc3QpIHtcbiAgICAgICAgICAgIGlmIChzcmNQYXRoWzBdID09PSBcIlwiKSBzcmNQYXRoWzBdID0gcmVzdWx0Lmhvc3Q7XG4gICAgICAgICAgICBlbHNlIHNyY1BhdGgudW5zaGlmdChyZXN1bHQuaG9zdCk7XG4gICAgICAgIH1cbiAgICAgICAgcmVzdWx0Lmhvc3QgPSBcIlwiO1xuICAgICAgICBpZiAocmVsYXRpdmUuX3Byb3RvY29sKSB7XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0bmFtZSA9IFwiXCI7XG4gICAgICAgICAgICByZWxhdGl2ZS5fcG9ydCA9IC0xO1xuICAgICAgICAgICAgaWYgKHJlbGF0aXZlLmhvc3QpIHtcbiAgICAgICAgICAgICAgICBpZiAocmVsUGF0aFswXSA9PT0gXCJcIikgcmVsUGF0aFswXSA9IHJlbGF0aXZlLmhvc3Q7XG4gICAgICAgICAgICAgICAgZWxzZSByZWxQYXRoLnVuc2hpZnQocmVsYXRpdmUuaG9zdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0ID0gXCJcIjtcbiAgICAgICAgfVxuICAgICAgICBtdXN0RW5kQWJzID0gbXVzdEVuZEFicyAmJiAocmVsUGF0aFswXSA9PT0gXCJcIiB8fCBzcmNQYXRoWzBdID09PSBcIlwiKTtcbiAgICB9XG5cbiAgICBpZiAoaXNSZWxBYnMpIHtcbiAgICAgICAgLy8gaXRcInMgYWJzb2x1dGUuXG4gICAgICAgIHJlc3VsdC5ob3N0ID0gcmVsYXRpdmUuaG9zdCA/XG4gICAgICAgICAgICByZWxhdGl2ZS5ob3N0IDogcmVzdWx0Lmhvc3Q7XG4gICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlbGF0aXZlLmhvc3RuYW1lID9cbiAgICAgICAgICAgIHJlbGF0aXZlLmhvc3RuYW1lIDogcmVzdWx0Lmhvc3RuYW1lO1xuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICBzcmNQYXRoID0gcmVsUGF0aDtcbiAgICAgICAgLy8gZmFsbCB0aHJvdWdoIHRvIHRoZSBkb3QtaGFuZGxpbmcgYmVsb3cuXG4gICAgfSBlbHNlIGlmIChyZWxQYXRoLmxlbmd0aCkge1xuICAgICAgICAvLyBpdFwicyByZWxhdGl2ZVxuICAgICAgICAvLyB0aHJvdyBhd2F5IHRoZSBleGlzdGluZyBmaWxlLCBhbmQgdGFrZSB0aGUgbmV3IHBhdGggaW5zdGVhZC5cbiAgICAgICAgaWYgKCFzcmNQYXRoKSBzcmNQYXRoID0gW107XG4gICAgICAgIHNyY1BhdGgucG9wKCk7XG4gICAgICAgIHNyY1BhdGggPSBzcmNQYXRoLmNvbmNhdChyZWxQYXRoKTtcbiAgICAgICAgcmVzdWx0LnNlYXJjaCA9IHJlbGF0aXZlLnNlYXJjaDtcbiAgICB9IGVsc2UgaWYgKHJlbGF0aXZlLnNlYXJjaCkge1xuICAgICAgICAvLyBqdXN0IHB1bGwgb3V0IHRoZSBzZWFyY2guXG4gICAgICAgIC8vIGxpa2UgaHJlZj1cIj9mb29cIi5cbiAgICAgICAgLy8gUHV0IHRoaXMgYWZ0ZXIgdGhlIG90aGVyIHR3byBjYXNlcyBiZWNhdXNlIGl0IHNpbXBsaWZpZXMgdGhlIGJvb2xlYW5zXG4gICAgICAgIGlmIChwc3ljaG90aWMpIHtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0bmFtZSA9IHJlc3VsdC5ob3N0ID0gc3JjUGF0aC5zaGlmdCgpO1xuICAgICAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAgICAgLy90aGlzIGVzcGVjaWFseSBoYXBwZW5zIGluIGNhc2VzIGxpa2VcbiAgICAgICAgICAgIC8vdXJsLnJlc29sdmVPYmplY3QoXCJtYWlsdG86bG9jYWwxQGRvbWFpbjFcIiwgXCJsb2NhbDJAZG9tYWluMlwiKVxuICAgICAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgICAgIHJlc3VsdC5ob3N0LnNwbGl0KFwiQFwiKSA6IGZhbHNlO1xuICAgICAgICAgICAgaWYgKGF1dGhJbkhvc3QpIHtcbiAgICAgICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgICAgICByZXN1bHQuaG9zdCA9IHJlc3VsdC5ob3N0bmFtZSA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXN1bHQuc2VhcmNoID0gcmVsYXRpdmUuc2VhcmNoO1xuICAgICAgICByZXN1bHQuX2hyZWYgPSBcIlwiO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGlmICghc3JjUGF0aC5sZW5ndGgpIHtcbiAgICAgICAgLy8gbm8gcGF0aCBhdCBhbGwuICBlYXN5LlxuICAgICAgICAvLyB3ZVwidmUgYWxyZWFkeSBoYW5kbGVkIHRoZSBvdGhlciBzdHVmZiBhYm92ZS5cbiAgICAgICAgcmVzdWx0LnBhdGhuYW1lID0gbnVsbDtcbiAgICAgICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBpZiBhIHVybCBFTkRzIGluIC4gb3IgLi4sIHRoZW4gaXQgbXVzdCBnZXQgYSB0cmFpbGluZyBzbGFzaC5cbiAgICAvLyBob3dldmVyLCBpZiBpdCBlbmRzIGluIGFueXRoaW5nIGVsc2Ugbm9uLXNsYXNoeSxcbiAgICAvLyB0aGVuIGl0IG11c3QgTk9UIGdldCBhIHRyYWlsaW5nIHNsYXNoLlxuICAgIHZhciBsYXN0ID0gc3JjUGF0aC5zbGljZSgtMSlbMF07XG4gICAgdmFyIGhhc1RyYWlsaW5nU2xhc2ggPSAoXG4gICAgICAgIChyZXN1bHQuaG9zdCB8fCByZWxhdGl2ZS5ob3N0KSAmJiAobGFzdCA9PT0gXCIuXCIgfHwgbGFzdCA9PT0gXCIuLlwiKSB8fFxuICAgICAgICBsYXN0ID09PSBcIlwiKTtcblxuICAgIC8vIHN0cmlwIHNpbmdsZSBkb3RzLCByZXNvbHZlIGRvdWJsZSBkb3RzIHRvIHBhcmVudCBkaXJcbiAgICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICAgIHZhciB1cCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHNyY1BhdGgubGVuZ3RoOyBpID49IDA7IGktLSkge1xuICAgICAgICBsYXN0ID0gc3JjUGF0aFtpXTtcbiAgICAgICAgaWYgKGxhc3QgPT0gXCIuXCIpIHtcbiAgICAgICAgICAgIHNyY1BhdGguc3BsaWNlKGksIDEpO1xuICAgICAgICB9IGVsc2UgaWYgKGxhc3QgPT09IFwiLi5cIikge1xuICAgICAgICAgICAgc3JjUGF0aC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICB1cCsrO1xuICAgICAgICB9IGVsc2UgaWYgKHVwKSB7XG4gICAgICAgICAgICBzcmNQYXRoLnNwbGljZShpLCAxKTtcbiAgICAgICAgICAgIHVwLS07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gICAgaWYgKCFtdXN0RW5kQWJzICYmICFyZW1vdmVBbGxEb3RzKSB7XG4gICAgICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiLi5cIik7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobXVzdEVuZEFicyAmJiBzcmNQYXRoWzBdICE9PSBcIlwiICYmXG4gICAgICAgICghc3JjUGF0aFswXSB8fCBzcmNQYXRoWzBdLmNoYXJDb2RlQXQoMCkgIT09IDB4MkYgLyonLycqLykpIHtcbiAgICAgICAgc3JjUGF0aC51bnNoaWZ0KFwiXCIpO1xuICAgIH1cblxuICAgIGlmIChoYXNUcmFpbGluZ1NsYXNoICYmIChzcmNQYXRoLmpvaW4oXCIvXCIpLnN1YnN0cigtMSkgIT09IFwiL1wiKSkge1xuICAgICAgICBzcmNQYXRoLnB1c2goXCJcIik7XG4gICAgfVxuXG4gICAgdmFyIGlzQWJzb2x1dGUgPSBzcmNQYXRoWzBdID09PSBcIlwiIHx8XG4gICAgICAgIChzcmNQYXRoWzBdICYmIHNyY1BhdGhbMF0uY2hhckNvZGVBdCgwKSA9PT0gMHgyRiAvKicvJyovKTtcblxuICAgIC8vIHB1dCB0aGUgaG9zdCBiYWNrXG4gICAgaWYgKHBzeWNob3RpYykge1xuICAgICAgICByZXN1bHQuaG9zdG5hbWUgPSByZXN1bHQuaG9zdCA9IGlzQWJzb2x1dGUgPyBcIlwiIDpcbiAgICAgICAgICAgIHNyY1BhdGgubGVuZ3RoID8gc3JjUGF0aC5zaGlmdCgpIDogXCJcIjtcbiAgICAgICAgLy9vY2NhdGlvbmFseSB0aGUgYXV0aCBjYW4gZ2V0IHN0dWNrIG9ubHkgaW4gaG9zdFxuICAgICAgICAvL3RoaXMgZXNwZWNpYWx5IGhhcHBlbnMgaW4gY2FzZXMgbGlrZVxuICAgICAgICAvL3VybC5yZXNvbHZlT2JqZWN0KFwibWFpbHRvOmxvY2FsMUBkb21haW4xXCIsIFwibG9jYWwyQGRvbWFpbjJcIilcbiAgICAgICAgdmFyIGF1dGhJbkhvc3QgPSByZXN1bHQuaG9zdCAmJiByZXN1bHQuaG9zdC5pbmRleE9mKFwiQFwiKSA+IDAgP1xuICAgICAgICAgICAgcmVzdWx0Lmhvc3Quc3BsaXQoXCJAXCIpIDogZmFsc2U7XG4gICAgICAgIGlmIChhdXRoSW5Ib3N0KSB7XG4gICAgICAgICAgICByZXN1bHQuYXV0aCA9IGF1dGhJbkhvc3Quc2hpZnQoKTtcbiAgICAgICAgICAgIHJlc3VsdC5ob3N0ID0gcmVzdWx0Lmhvc3RuYW1lID0gYXV0aEluSG9zdC5zaGlmdCgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgbXVzdEVuZEFicyA9IG11c3RFbmRBYnMgfHwgKHJlc3VsdC5ob3N0ICYmIHNyY1BhdGgubGVuZ3RoKTtcblxuICAgIGlmIChtdXN0RW5kQWJzICYmICFpc0Fic29sdXRlKSB7XG4gICAgICAgIHNyY1BhdGgudW5zaGlmdChcIlwiKTtcbiAgICB9XG5cbiAgICByZXN1bHQucGF0aG5hbWUgPSBzcmNQYXRoLmxlbmd0aCA9PT0gMCA/IG51bGwgOiBzcmNQYXRoLmpvaW4oXCIvXCIpO1xuICAgIHJlc3VsdC5hdXRoID0gcmVsYXRpdmUuYXV0aCB8fCByZXN1bHQuYXV0aDtcbiAgICByZXN1bHQuc2xhc2hlcyA9IHJlc3VsdC5zbGFzaGVzIHx8IHJlbGF0aXZlLnNsYXNoZXM7XG4gICAgcmVzdWx0Ll9ocmVmID0gXCJcIjtcbiAgICByZXR1cm4gcmVzdWx0O1xufTtcblxudmFyIHB1bnljb2RlID0gcmVxdWlyZShcInB1bnljb2RlXCIpO1xuVXJsLnByb3RvdHlwZS5faG9zdElkbmEgPSBmdW5jdGlvbiBVcmwkX2hvc3RJZG5hKGhvc3RuYW1lKSB7XG4gICAgLy8gSUROQSBTdXBwb3J0OiBSZXR1cm5zIGEgcHVueSBjb2RlZCByZXByZXNlbnRhdGlvbiBvZiBcImRvbWFpblwiLlxuICAgIC8vIEl0IG9ubHkgY29udmVydHMgdGhlIHBhcnQgb2YgdGhlIGRvbWFpbiBuYW1lIHRoYXRcbiAgICAvLyBoYXMgbm9uIEFTQ0lJIGNoYXJhY3RlcnMuIEkuZS4gaXQgZG9zZW50IG1hdHRlciBpZlxuICAgIC8vIHlvdSBjYWxsIGl0IHdpdGggYSBkb21haW4gdGhhdCBhbHJlYWR5IGlzIGluIEFTQ0lJLlxuICAgIHZhciBkb21haW5BcnJheSA9IGhvc3RuYW1lLnNwbGl0KFwiLlwiKTtcbiAgICB2YXIgbmV3T3V0ID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBkb21haW5BcnJheS5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgcyA9IGRvbWFpbkFycmF5W2ldO1xuICAgICAgICBuZXdPdXQucHVzaChzLm1hdGNoKC9bXkEtWmEtejAtOV8tXS8pID9cbiAgICAgICAgICAgIFwieG4tLVwiICsgcHVueWNvZGUuZW5jb2RlKHMpIDogcyk7XG4gICAgfVxuICAgIHJldHVybiBuZXdPdXQuam9pbihcIi5cIik7XG59O1xuXG52YXIgZXNjYXBlUGF0aE5hbWUgPSBVcmwucHJvdG90eXBlLl9lc2NhcGVQYXRoTmFtZSA9XG5mdW5jdGlvbiBVcmwkX2VzY2FwZVBhdGhOYW1lKHBhdGhuYW1lKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIocGF0aG5hbWUsIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovKSkge1xuICAgICAgICByZXR1cm4gcGF0aG5hbWU7XG4gICAgfVxuICAgIC8vQXZvaWQgY2xvc3VyZSBjcmVhdGlvbiB0byBrZWVwIHRoaXMgaW5saW5hYmxlXG4gICAgcmV0dXJuIF9lc2NhcGVQYXRoKHBhdGhuYW1lKTtcbn07XG5cbnZhciBlc2NhcGVTZWFyY2ggPSBVcmwucHJvdG90eXBlLl9lc2NhcGVTZWFyY2ggPVxuZnVuY3Rpb24gVXJsJF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgaWYgKCFjb250YWluc0NoYXJhY3RlcjIoc2VhcmNoLCAweDIzIC8qJyMnKi8sIC0xKSkgcmV0dXJuIHNlYXJjaDtcbiAgICAvL0F2b2lkIGNsb3N1cmUgY3JlYXRpb24gdG8ga2VlcCB0aGlzIGlubGluYWJsZVxuICAgIHJldHVybiBfZXNjYXBlU2VhcmNoKHNlYXJjaCk7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVByb3RvY29sID0gZnVuY3Rpb24gVXJsJF9wYXJzZVByb3RvY29sKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBwcm90b2NvbENoYXJhY3RlcnMgPSB0aGlzLl9wcm90b2NvbENoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKGNoID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgIHZhciBwcm90b2NvbCA9IHN0ci5zbGljZShzdGFydCwgaSk7XG4gICAgICAgICAgICBpZiAoZG9Mb3dlckNhc2UpIHByb3RvY29sID0gcHJvdG9jb2wudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gcHJvdG9jb2w7XG4gICAgICAgICAgICByZXR1cm4gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAocHJvdG9jb2xDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgaWYgKGNoIDwgMHg2MSAvKidhJyovKVxuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgfVxuXG4gICAgfVxuICAgIHJldHVybiBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlQXV0aCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VBdXRoKHN0ciwgc3RhcnQsIGVuZCwgZGVjb2RlKSB7XG4gICAgdmFyIGF1dGggPSBzdHIuc2xpY2Uoc3RhcnQsIGVuZCArIDEpO1xuICAgIGlmIChkZWNvZGUpIHtcbiAgICAgICAgYXV0aCA9IGRlY29kZVVSSUNvbXBvbmVudChhdXRoKTtcbiAgICB9XG4gICAgdGhpcy5hdXRoID0gYXV0aDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlUG9ydCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VQb3J0KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIC8vSW50ZXJuYWwgZm9ybWF0IGlzIGludGVnZXIgZm9yIG1vcmUgZWZmaWNpZW50IHBhcnNpbmdcbiAgICAvL2FuZCBmb3IgZWZmaWNpZW50IHRyaW1taW5nIG9mIGxlYWRpbmcgemVyb3NcbiAgICB2YXIgcG9ydCA9IDA7XG4gICAgLy9EaXN0aW5ndWlzaCBiZXR3ZWVuIDowIGFuZCA6IChubyBwb3J0IG51bWJlciBhdCBhbGwpXG4gICAgdmFyIGhhZENoYXJzID0gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgaWYgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pIHtcbiAgICAgICAgICAgIHBvcnQgPSAoMTAgKiBwb3J0KSArIChjaCAtIDB4MzAgLyonMCcqLyk7XG4gICAgICAgICAgICBoYWRDaGFycyA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBicmVhaztcblxuICAgIH1cbiAgICBpZiAocG9ydCA9PT0gMCAmJiAhaGFkQ2hhcnMpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgdGhpcy5fcG9ydCA9IHBvcnQ7XG4gICAgcmV0dXJuIGkgLSBzdGFydDtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSG9zdCA9XG5mdW5jdGlvbiBVcmwkX3BhcnNlSG9zdChzdHIsIHN0YXJ0LCBlbmQsIHNsYXNoZXNEZW5vdGVIb3N0KSB7XG4gICAgdmFyIGhvc3RFbmRpbmdDaGFyYWN0ZXJzID0gdGhpcy5faG9zdEVuZGluZ0NoYXJhY3RlcnM7XG4gICAgaWYgKHN0ci5jaGFyQ29kZUF0KHN0YXJ0KSA9PT0gMHgyRiAvKicvJyovICYmXG4gICAgICAgIHN0ci5jaGFyQ29kZUF0KHN0YXJ0ICsgMSkgPT09IDB4MkYgLyonLycqLykge1xuICAgICAgICB0aGlzLnNsYXNoZXMgPSB0cnVlO1xuXG4gICAgICAgIC8vVGhlIHN0cmluZyBzdGFydHMgd2l0aCAvL1xuICAgICAgICBpZiAoc3RhcnQgPT09IDApIHtcbiAgICAgICAgICAgIC8vVGhlIHN0cmluZyBpcyBqdXN0IFwiLy9cIlxuICAgICAgICAgICAgaWYgKGVuZCA8IDIpIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIC8vSWYgc2xhc2hlcyBkbyBub3QgZGVub3RlIGhvc3QgYW5kIHRoZXJlIGlzIG5vIGF1dGgsXG4gICAgICAgICAgICAvL3RoZXJlIGlzIG5vIGhvc3Qgd2hlbiB0aGUgc3RyaW5nIHN0YXJ0cyB3aXRoIC8vXG4gICAgICAgICAgICB2YXIgaGFzQXV0aCA9XG4gICAgICAgICAgICAgICAgY29udGFpbnNDaGFyYWN0ZXIoc3RyLCAweDQwIC8qJ0AnKi8sIDIsIGhvc3RFbmRpbmdDaGFyYWN0ZXJzKTtcbiAgICAgICAgICAgIGlmICghaGFzQXV0aCAmJiAhc2xhc2hlc0Rlbm90ZUhvc3QpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnNsYXNoZXMgPSBudWxsO1xuICAgICAgICAgICAgICAgIHJldHVybiBzdGFydDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL1RoZXJlIGlzIGEgaG9zdCB0aGF0IHN0YXJ0cyBhZnRlciB0aGUgLy9cbiAgICAgICAgc3RhcnQgKz0gMjtcbiAgICB9XG4gICAgLy9JZiB0aGVyZSBpcyBubyBzbGFzaGVzLCB0aGVyZSBpcyBubyBob3N0bmFtZSBpZlxuICAgIC8vMS4gdGhlcmUgd2FzIG5vIHByb3RvY29sIGF0IGFsbFxuICAgIGVsc2UgaWYgKCF0aGlzLl9wcm90b2NvbCB8fFxuICAgICAgICAvLzIuIHRoZXJlIHdhcyBhIHByb3RvY29sIHRoYXQgcmVxdWlyZXMgc2xhc2hlc1xuICAgICAgICAvL2UuZy4gaW4gJ2h0dHA6YXNkJyAnYXNkJyBpcyBub3QgYSBob3N0bmFtZVxuICAgICAgICBzbGFzaFByb3RvY29sc1t0aGlzLl9wcm90b2NvbF1cbiAgICApIHtcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIHZhciBkb0xvd2VyQ2FzZSA9IGZhbHNlO1xuICAgIHZhciBpZG5hID0gZmFsc2U7XG4gICAgdmFyIGhvc3ROYW1lU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgaG9zdE5hbWVFbmQgPSBlbmQ7XG4gICAgdmFyIGxhc3RDaCA9IC0xO1xuICAgIHZhciBwb3J0TGVuZ3RoID0gMDtcbiAgICB2YXIgY2hhcnNBZnRlckRvdCA9IDA7XG4gICAgdmFyIGF1dGhOZWVkc0RlY29kaW5nID0gZmFsc2U7XG5cbiAgICB2YXIgaiA9IC0xO1xuXG4gICAgLy9GaW5kIHRoZSBsYXN0IG9jY3VycmVuY2Ugb2YgYW4gQC1zaWduIHVudGlsIGhvc3RlbmRpbmcgY2hhcmFjdGVyIGlzIG1ldFxuICAgIC8vYWxzbyBtYXJrIGlmIGRlY29kaW5nIGlzIG5lZWRlZCBmb3IgdGhlIGF1dGggcG9ydGlvblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4NDAgLyonQCcqLykge1xuICAgICAgICAgICAgaiA9IGk7XG4gICAgICAgIH1cbiAgICAgICAgLy9UaGlzIGNoZWNrIGlzIHZlcnksIHZlcnkgY2hlYXAuIFVubmVlZGVkIGRlY29kZVVSSUNvbXBvbmVudCBpcyB2ZXJ5XG4gICAgICAgIC8vdmVyeSBleHBlbnNpdmVcbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4MjUgLyonJScqLykge1xuICAgICAgICAgICAgYXV0aE5lZWRzRGVjb2RpbmcgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGhvc3RFbmRpbmdDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvL0Atc2lnbiB3YXMgZm91bmQgYXQgaW5kZXggaiwgZXZlcnl0aGluZyB0byB0aGUgbGVmdCBmcm9tIGl0XG4gICAgLy9pcyBhdXRoIHBhcnRcbiAgICBpZiAoaiA+IC0xKSB7XG4gICAgICAgIHRoaXMuX3BhcnNlQXV0aChzdHIsIHN0YXJ0LCBqIC0gMSwgYXV0aE5lZWRzRGVjb2RpbmcpO1xuICAgICAgICAvL2hvc3RuYW1lIHN0YXJ0cyBhZnRlciB0aGUgbGFzdCBALXNpZ25cbiAgICAgICAgc3RhcnQgPSBob3N0TmFtZVN0YXJ0ID0gaiArIDE7XG4gICAgfVxuXG4gICAgLy9Ib3N0IG5hbWUgaXMgc3RhcnRpbmcgd2l0aCBhIFtcbiAgICBpZiAoc3RyLmNoYXJDb2RlQXQoc3RhcnQpID09PSAweDVCIC8qJ1snKi8pIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IHN0YXJ0ICsgMTsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG5cbiAgICAgICAgICAgIC8vQXNzdW1lIHZhbGlkIElQNiBpcyBiZXR3ZWVuIHRoZSBicmFja2V0c1xuICAgICAgICAgICAgaWYgKGNoID09PSAweDVEIC8qJ10nKi8pIHtcbiAgICAgICAgICAgICAgICBpZiAoc3RyLmNoYXJDb2RlQXQoaSArIDEpID09PSAweDNBIC8qJzonKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgcG9ydExlbmd0aCA9IHRoaXMuX3BhcnNlUG9ydChzdHIsIGkgKyAyLCBlbmQpICsgMTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGhvc3RuYW1lID0gc3RyLnNsaWNlKHN0YXJ0ICsgMSwgaSkudG9Mb3dlckNhc2UoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gaG9zdG5hbWU7XG4gICAgICAgICAgICAgICAgdGhpcy5ob3N0ID0gdGhpcy5fcG9ydCA+IDBcbiAgICAgICAgICAgICAgICAgICAgPyBcIltcIiArIGhvc3RuYW1lICsgXCJdOlwiICsgdGhpcy5fcG9ydFxuICAgICAgICAgICAgICAgICAgICA6IFwiW1wiICsgaG9zdG5hbWUgKyBcIl1cIjtcbiAgICAgICAgICAgICAgICB0aGlzLnBhdGhuYW1lID0gXCIvXCI7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGkgKyBwb3J0TGVuZ3RoICsgMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvL0VtcHR5IGhvc3RuYW1lLCBbIHN0YXJ0cyBhIHBhdGhcbiAgICAgICAgcmV0dXJuIHN0YXJ0O1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICBpZiAoY2hhcnNBZnRlckRvdCA+IDYyKSB7XG4gICAgICAgICAgICB0aGlzLmhvc3RuYW1lID0gdGhpcy5ob3N0ID0gc3RyLnNsaWNlKHN0YXJ0LCBpKTtcbiAgICAgICAgICAgIHJldHVybiBpO1xuICAgICAgICB9XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gMHgzQSAvKic6JyovKSB7XG4gICAgICAgICAgICBwb3J0TGVuZ3RoID0gdGhpcy5fcGFyc2VQb3J0KHN0ciwgaSArIDEsIGVuZCkgKyAxO1xuICAgICAgICAgICAgaG9zdE5hbWVFbmQgPSBpIC0gMTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoIDwgMHg2MSAvKidhJyovKSB7XG4gICAgICAgICAgICBpZiAoY2ggPT09IDB4MkUgLyonLicqLykge1xuICAgICAgICAgICAgICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAgICAgICAgICAgICAvKlxuICAgICAgICAgICAgICAgIGlmIChsYXN0Q2ggPT09IERPVCB8fCBsYXN0Q2ggPT09IC0xKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuaG9zdG5hbWUgPSB0aGlzLmhvc3QgPSBcIlwiO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICovXG4gICAgICAgICAgICAgICAgY2hhcnNBZnRlckRvdCA9IC0xO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSBpZiAoMHg0MSAvKidBJyovIDw9IGNoICYmIGNoIDw9IDB4NUEgLyonWicqLykge1xuICAgICAgICAgICAgICAgIGRvTG93ZXJDYXNlID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2UgaWYgKCEoY2ggPT09IDB4MkQgLyonLScqLyB8fCBjaCA9PT0gMHg1RiAvKidfJyovIHx8XG4gICAgICAgICAgICAgICAgKDB4MzAgLyonMCcqLyA8PSBjaCAmJiBjaCA8PSAweDM5IC8qJzknKi8pKSkge1xuICAgICAgICAgICAgICAgIGlmIChob3N0RW5kaW5nQ2hhcmFjdGVyc1tjaF0gPT09IDAgJiZcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzW2NoXSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9wcmVwZW5kU2xhc2ggPSB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBob3N0TmFtZUVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKGNoID49IDB4N0IgLyoneycqLykge1xuICAgICAgICAgICAgaWYgKGNoIDw9IDB4N0UgLyonficqLykge1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9ub1ByZXBlbmRTbGFzaEhvc3RFbmRlcnNbY2hdID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX3ByZXBlbmRTbGFzaCA9IHRydWU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGhvc3ROYW1lRW5kID0gaSAtIDE7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZG5hID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBsYXN0Q2ggPSBjaDtcbiAgICAgICAgY2hhcnNBZnRlckRvdCsrO1xuICAgIH1cblxuICAgIC8vTm9kZS5qcyBpZ25vcmVzIHRoaXMgZXJyb3JcbiAgICAvKlxuICAgIGlmIChsYXN0Q2ggPT09IERPVCkge1xuICAgICAgICBob3N0TmFtZUVuZC0tO1xuICAgIH1cbiAgICAqL1xuXG4gICAgaWYgKGhvc3ROYW1lRW5kICsgMSAhPT0gc3RhcnQgJiZcbiAgICAgICAgaG9zdE5hbWVFbmQgLSBob3N0TmFtZVN0YXJ0IDw9IDI1Nikge1xuICAgICAgICB2YXIgaG9zdG5hbWUgPSBzdHIuc2xpY2UoaG9zdE5hbWVTdGFydCwgaG9zdE5hbWVFbmQgKyAxKTtcbiAgICAgICAgaWYgKGRvTG93ZXJDYXNlKSBob3N0bmFtZSA9IGhvc3RuYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIGlmIChpZG5hKSBob3N0bmFtZSA9IHRoaXMuX2hvc3RJZG5hKGhvc3RuYW1lKTtcbiAgICAgICAgdGhpcy5ob3N0bmFtZSA9IGhvc3RuYW1lO1xuICAgICAgICB0aGlzLmhvc3QgPSB0aGlzLl9wb3J0ID4gMCA/IGhvc3RuYW1lICsgXCI6XCIgKyB0aGlzLl9wb3J0IDogaG9zdG5hbWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGhvc3ROYW1lRW5kICsgMSArIHBvcnRMZW5ndGg7XG5cbn07XG5cblVybC5wcm90b3R5cGUuX2NvcHlQcm9wc1RvID0gZnVuY3Rpb24gVXJsJF9jb3B5UHJvcHNUbyhpbnB1dCwgbm9Qcm90b2NvbCkge1xuICAgIGlmICghbm9Qcm90b2NvbCkge1xuICAgICAgICBpbnB1dC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICB9XG4gICAgaW5wdXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIGlucHV0Ll9wb3J0ID0gdGhpcy5fcG9ydDtcbiAgICBpbnB1dC5fcHJlcGVuZFNsYXNoID0gdGhpcy5fcHJlcGVuZFNsYXNoO1xuICAgIGlucHV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgaW5wdXQuc2xhc2hlcyA9IHRoaXMuc2xhc2hlcztcbiAgICBpbnB1dC5ob3N0ID0gdGhpcy5ob3N0O1xuICAgIGlucHV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICBpbnB1dC5oYXNoID0gdGhpcy5oYXNoO1xuICAgIGlucHV0LnNlYXJjaCA9IHRoaXMuc2VhcmNoO1xuICAgIGlucHV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbn07XG5cblVybC5wcm90b3R5cGUuX2Nsb25lID0gZnVuY3Rpb24gVXJsJF9jbG9uZSgpIHtcbiAgICB2YXIgcmV0ID0gbmV3IFVybCgpO1xuICAgIHJldC5fcHJvdG9jb2wgPSB0aGlzLl9wcm90b2NvbDtcbiAgICByZXQuX2hyZWYgPSB0aGlzLl9ocmVmO1xuICAgIHJldC5fcG9ydCA9IHRoaXMuX3BvcnQ7XG4gICAgcmV0Ll9wcmVwZW5kU2xhc2ggPSB0aGlzLl9wcmVwZW5kU2xhc2g7XG4gICAgcmV0LmF1dGggPSB0aGlzLmF1dGg7XG4gICAgcmV0LnNsYXNoZXMgPSB0aGlzLnNsYXNoZXM7XG4gICAgcmV0Lmhvc3QgPSB0aGlzLmhvc3Q7XG4gICAgcmV0Lmhvc3RuYW1lID0gdGhpcy5ob3N0bmFtZTtcbiAgICByZXQuaGFzaCA9IHRoaXMuaGFzaDtcbiAgICByZXQuc2VhcmNoID0gdGhpcy5zZWFyY2g7XG4gICAgcmV0LnBhdGhuYW1lID0gdGhpcy5wYXRobmFtZTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fZ2V0Q29tcG9uZW50RXNjYXBlZCA9XG5mdW5jdGlvbiBVcmwkX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKSB7XG4gICAgdmFyIGN1ciA9IHN0YXJ0O1xuICAgIHZhciBpID0gc3RhcnQ7XG4gICAgdmFyIHJldCA9IFwiXCI7XG4gICAgdmFyIGF1dG9Fc2NhcGVNYXAgPSB0aGlzLl9hdXRvRXNjYXBlTWFwO1xuICAgIGZvciAoOyBpIDw9IGVuZDsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0ci5jaGFyQ29kZUF0KGkpO1xuICAgICAgICB2YXIgZXNjYXBlZCA9IGF1dG9Fc2NhcGVNYXBbY2hdO1xuXG4gICAgICAgIGlmIChlc2NhcGVkICE9PSBcIlwiKSB7XG4gICAgICAgICAgICBpZiAoY3VyIDwgaSkgcmV0ICs9IHN0ci5zbGljZShjdXIsIGkpO1xuICAgICAgICAgICAgcmV0ICs9IGVzY2FwZWQ7XG4gICAgICAgICAgICBjdXIgPSBpICsgMTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoY3VyIDwgaSArIDEpIHJldCArPSBzdHIuc2xpY2UoY3VyLCBpKTtcbiAgICByZXR1cm4gcmV0O1xufTtcblxuVXJsLnByb3RvdHlwZS5fcGFyc2VQYXRoID1cbmZ1bmN0aW9uIFVybCRfcGFyc2VQYXRoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBwYXRoU3RhcnQgPSBzdGFydDtcbiAgICB2YXIgcGF0aEVuZCA9IGVuZDtcbiAgICB2YXIgZXNjYXBlID0gZmFsc2U7XG4gICAgdmFyIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzID0gdGhpcy5fYXV0b0VzY2FwZUNoYXJhY3RlcnM7XG5cbiAgICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPD0gZW5kOyArK2kpIHtcbiAgICAgICAgdmFyIGNoID0gc3RyLmNoYXJDb2RlQXQoaSk7XG4gICAgICAgIGlmIChjaCA9PT0gMHgyMyAvKicjJyovKSB7XG4gICAgICAgICAgICB0aGlzLl9wYXJzZUhhc2goc3RyLCBpLCBlbmQpO1xuICAgICAgICAgICAgcGF0aEVuZCA9IGkgLSAxO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoY2ggPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VRdWVyeShzdHIsIGksIGVuZCk7XG4gICAgICAgICAgICBwYXRoRW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwYXRoU3RhcnQgPiBwYXRoRW5kKSB7XG4gICAgICAgIHRoaXMucGF0aG5hbWUgPSBcIi9cIjtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHZhciBwYXRoO1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcGF0aCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBwYXRoU3RhcnQsIHBhdGhFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcGF0aCA9IHN0ci5zbGljZShwYXRoU3RhcnQsIHBhdGhFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5wYXRobmFtZSA9IHRoaXMuX3ByZXBlbmRTbGFzaCA/IFwiL1wiICsgcGF0aCA6IHBhdGg7XG59O1xuXG5VcmwucHJvdG90eXBlLl9wYXJzZVF1ZXJ5ID0gZnVuY3Rpb24gVXJsJF9wYXJzZVF1ZXJ5KHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIHZhciBxdWVyeVN0YXJ0ID0gc3RhcnQ7XG4gICAgdmFyIHF1ZXJ5RW5kID0gZW5kO1xuICAgIHZhciBlc2NhcGUgPSBmYWxzZTtcbiAgICB2YXIgYXV0b0VzY2FwZUNoYXJhY3RlcnMgPSB0aGlzLl9hdXRvRXNjYXBlQ2hhcmFjdGVycztcblxuICAgIGZvciAodmFyIGkgPSBzdGFydDsgaSA8PSBlbmQ7ICsraSkge1xuICAgICAgICB2YXIgY2ggPSBzdHIuY2hhckNvZGVBdChpKTtcblxuICAgICAgICBpZiAoY2ggPT09IDB4MjMgLyonIycqLykge1xuICAgICAgICAgICAgdGhpcy5fcGFyc2VIYXNoKHN0ciwgaSwgZW5kKTtcbiAgICAgICAgICAgIHF1ZXJ5RW5kID0gaSAtIDE7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICghZXNjYXBlICYmIGF1dG9Fc2NhcGVDaGFyYWN0ZXJzW2NoXSA9PT0gMSkge1xuICAgICAgICAgICAgZXNjYXBlID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWVyeVN0YXJ0ID4gcXVlcnlFbmQpIHtcbiAgICAgICAgdGhpcy5zZWFyY2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHF1ZXJ5O1xuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgcXVlcnkgPSB0aGlzLl9nZXRDb21wb25lbnRFc2NhcGVkKHN0ciwgcXVlcnlTdGFydCwgcXVlcnlFbmQpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgcXVlcnkgPSBzdHIuc2xpY2UocXVlcnlTdGFydCwgcXVlcnlFbmQgKyAxKTtcbiAgICB9XG4gICAgdGhpcy5zZWFyY2ggPSBxdWVyeTtcbn07XG5cblVybC5wcm90b3R5cGUuX3BhcnNlSGFzaCA9IGZ1bmN0aW9uIFVybCRfcGFyc2VIYXNoKHN0ciwgc3RhcnQsIGVuZCkge1xuICAgIGlmIChzdGFydCA+IGVuZCkge1xuICAgICAgICB0aGlzLmhhc2ggPSBcIlwiO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuaGFzaCA9IHRoaXMuX2dldENvbXBvbmVudEVzY2FwZWQoc3RyLCBzdGFydCwgZW5kKTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcInBvcnRcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl9wb3J0ID49IDApIHtcbiAgICAgICAgICAgIHJldHVybiAoXCJcIiArIHRoaXMuX3BvcnQpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2KSB7XG4gICAgICAgIGlmICh2ID09IG51bGwpIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSAtMTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3BvcnQgPSBwYXJzZUludCh2LCAxMCk7XG4gICAgICAgIH1cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFVybC5wcm90b3R5cGUsIFwicXVlcnlcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBxdWVyeSA9IHRoaXMuX3F1ZXJ5O1xuICAgICAgICBpZiAocXVlcnkgIT0gbnVsbCkge1xuICAgICAgICAgICAgcmV0dXJuIHF1ZXJ5O1xuICAgICAgICB9XG4gICAgICAgIHZhciBzZWFyY2ggPSB0aGlzLnNlYXJjaDtcblxuICAgICAgICBpZiAoc2VhcmNoKSB7XG4gICAgICAgICAgICBpZiAoc2VhcmNoLmNoYXJDb2RlQXQoMCkgPT09IDB4M0YgLyonPycqLykge1xuICAgICAgICAgICAgICAgIHNlYXJjaCA9IHNlYXJjaC5zbGljZSgxKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzZWFyY2ggIT09IFwiXCIpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9xdWVyeSA9IHNlYXJjaDtcbiAgICAgICAgICAgICAgICByZXR1cm4gc2VhcmNoO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZWFyY2g7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5fcXVlcnkgPSB2O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwYXRoXCIsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgcCA9IHRoaXMucGF0aG5hbWUgfHwgXCJcIjtcbiAgICAgICAgdmFyIHMgPSB0aGlzLnNlYXJjaCB8fCBcIlwiO1xuICAgICAgICBpZiAocCB8fCBzKSB7XG4gICAgICAgICAgICByZXR1cm4gcCArIHM7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIChwID09IG51bGwgJiYgcykgPyAoXCIvXCIgKyBzKSA6IG51bGw7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKCkge31cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXJsLnByb3RvdHlwZSwgXCJwcm90b2NvbFwiLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHByb3RvID0gdGhpcy5fcHJvdG9jb2w7XG4gICAgICAgIHJldHVybiBwcm90byA/IHByb3RvICsgXCI6XCIgOiBwcm90bztcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odikge1xuICAgICAgICBpZiAodHlwZW9mIHYgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgIHZhciBlbmQgPSB2Lmxlbmd0aCAtIDE7XG4gICAgICAgICAgICBpZiAodi5jaGFyQ29kZUF0KGVuZCkgPT09IDB4M0EgLyonOicqLykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3Byb3RvY29sID0gdi5zbGljZSgwLCBlbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSB2O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHYgPT0gbnVsbCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvdG9jb2wgPSBudWxsO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShVcmwucHJvdG90eXBlLCBcImhyZWZcIiwge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBocmVmID0gdGhpcy5faHJlZjtcbiAgICAgICAgaWYgKCFocmVmKSB7XG4gICAgICAgICAgICBocmVmID0gdGhpcy5faHJlZiA9IHRoaXMuZm9ybWF0KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGhyZWY7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgdGhpcy5faHJlZiA9IHY7XG4gICAgfVxufSk7XG5cblVybC5wYXJzZSA9IGZ1bmN0aW9uIFVybCRQYXJzZShzdHIsIHBhcnNlUXVlcnlTdHJpbmcsIGhvc3REZW5vdGVzU2xhc2gpIHtcbiAgICBpZiAoc3RyIGluc3RhbmNlb2YgVXJsKSByZXR1cm4gc3RyO1xuICAgIHZhciByZXQgPSBuZXcgVXJsKCk7XG4gICAgcmV0LnBhcnNlKHN0ciwgISFwYXJzZVF1ZXJ5U3RyaW5nLCAhIWhvc3REZW5vdGVzU2xhc2gpO1xuICAgIHJldHVybiByZXQ7XG59O1xuXG5VcmwuZm9ybWF0ID0gZnVuY3Rpb24gVXJsJEZvcm1hdChvYmopIHtcbiAgICBpZiAodHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikge1xuICAgICAgICBvYmogPSBVcmwucGFyc2Uob2JqKTtcbiAgICB9XG4gICAgaWYgKCEob2JqIGluc3RhbmNlb2YgVXJsKSkge1xuICAgICAgICByZXR1cm4gVXJsLnByb3RvdHlwZS5mb3JtYXQuY2FsbChvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqLmZvcm1hdCgpO1xufTtcblxuVXJsLnJlc29sdmUgPSBmdW5jdGlvbiBVcmwkUmVzb2x2ZShzb3VyY2UsIHJlbGF0aXZlKSB7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlKHJlbGF0aXZlKTtcbn07XG5cblVybC5yZXNvbHZlT2JqZWN0ID0gZnVuY3Rpb24gVXJsJFJlc29sdmVPYmplY3Qoc291cmNlLCByZWxhdGl2ZSkge1xuICAgIGlmICghc291cmNlKSByZXR1cm4gcmVsYXRpdmU7XG4gICAgcmV0dXJuIFVybC5wYXJzZShzb3VyY2UsIGZhbHNlLCB0cnVlKS5yZXNvbHZlT2JqZWN0KHJlbGF0aXZlKTtcbn07XG5cbmZ1bmN0aW9uIF9lc2NhcGVQYXRoKHBhdGhuYW1lKSB7XG4gICAgcmV0dXJuIHBhdGhuYW1lLnJlcGxhY2UoL1s/I10vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVuY29kZVVSSUNvbXBvbmVudChtYXRjaCk7XG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIF9lc2NhcGVTZWFyY2goc2VhcmNoKSB7XG4gICAgcmV0dXJuIHNlYXJjaC5yZXBsYWNlKC8jL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICAgIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQobWF0Y2gpO1xuICAgIH0pO1xufVxuXG4vL1NlYXJjaCBgY2hhcjFgIChpbnRlZ2VyIGNvZGUgZm9yIGEgY2hhcmFjdGVyKSBpbiBgc3RyaW5nYFxuLy9zdGFydGluZyBmcm9tIGBmcm9tSW5kZXhgIGFuZCBlbmRpbmcgYXQgYHN0cmluZy5sZW5ndGggLSAxYFxuLy9vciB3aGVuIGEgc3RvcCBjaGFyYWN0ZXIgaXMgZm91bmRcbmZ1bmN0aW9uIGNvbnRhaW5zQ2hhcmFjdGVyKHN0cmluZywgY2hhcjEsIGZyb21JbmRleCwgc3RvcENoYXJhY3RlclRhYmxlKSB7XG4gICAgdmFyIGxlbiA9IHN0cmluZy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IGZyb21JbmRleDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuXG4gICAgICAgIGlmIChjaCA9PT0gY2hhcjEpIHtcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKHN0b3BDaGFyYWN0ZXJUYWJsZVtjaF0gPT09IDEpIHtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vU2VlIGlmIGBjaGFyMWAgb3IgYGNoYXIyYCAoaW50ZWdlciBjb2RlcyBmb3IgY2hhcmFjdGVycylcbi8vaXMgY29udGFpbmVkIGluIGBzdHJpbmdgXG5mdW5jdGlvbiBjb250YWluc0NoYXJhY3RlcjIoc3RyaW5nLCBjaGFyMSwgY2hhcjIpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gc3RyaW5nLmxlbmd0aDsgaSA8IGxlbjsgKytpKSB7XG4gICAgICAgIHZhciBjaCA9IHN0cmluZy5jaGFyQ29kZUF0KGkpO1xuICAgICAgICBpZiAoY2ggPT09IGNoYXIxIHx8IGNoID09PSBjaGFyMikgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxuLy9NYWtlcyBhbiBhcnJheSBvZiAxMjggdWludDgncyB3aGljaCByZXByZXNlbnQgYm9vbGVhbiB2YWx1ZXMuXG4vL1NwZWMgaXMgYW4gYXJyYXkgb2YgYXNjaWkgY29kZSBwb2ludHMgb3IgYXNjaWkgY29kZSBwb2ludCByYW5nZXNcbi8vcmFuZ2VzIGFyZSBleHByZXNzZWQgYXMgW3N0YXJ0LCBlbmRdXG5cbi8vQ3JlYXRlIGEgdGFibGUgd2l0aCB0aGUgY2hhcmFjdGVycyAweDMwLTB4MzkgKGRlY2ltYWxzICcwJyAtICc5JykgYW5kXG4vLzB4N0EgKGxvd2VyY2FzZWxldHRlciAneicpIGFzIGB0cnVlYDpcbi8vXG4vL3ZhciBhID0gbWFrZUFzY2lpVGFibGUoW1sweDMwLCAweDM5XSwgMHg3QV0pO1xuLy9hWzB4MzBdOyAvLzFcbi8vYVsweDE1XTsgLy8wXG4vL2FbMHgzNV07IC8vMVxuZnVuY3Rpb24gbWFrZUFzY2lpVGFibGUoc3BlYykge1xuICAgIHZhciByZXQgPSBuZXcgVWludDhBcnJheSgxMjgpO1xuICAgIHNwZWMuZm9yRWFjaChmdW5jdGlvbihpdGVtKXtcbiAgICAgICAgaWYgKHR5cGVvZiBpdGVtID09PSBcIm51bWJlclwiKSB7XG4gICAgICAgICAgICByZXRbaXRlbV0gPSAxO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgdmFyIHN0YXJ0ID0gaXRlbVswXTtcbiAgICAgICAgICAgIHZhciBlbmQgPSBpdGVtWzFdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IHN0YXJ0OyBqIDw9IGVuZDsgKytqKSB7XG4gICAgICAgICAgICAgICAgcmV0W2pdID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJldDtcbn1cblxuXG52YXIgYXV0b0VzY2FwZSA9IFtcIjxcIiwgXCI+XCIsIFwiXFxcIlwiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsIFwiXFxuXCIsXG4gICAgXCJcXHRcIiwgXCJ7XCIsIFwifVwiLCBcInxcIiwgXCJcXFxcXCIsIFwiXlwiLCBcImBcIiwgXCInXCJdO1xuXG52YXIgYXV0b0VzY2FwZU1hcCA9IG5ldyBBcnJheSgxMjgpO1xuXG5cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGVNYXAubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhdXRvRXNjYXBlTWFwW2ldID0gXCJcIjtcbn1cblxuZm9yICh2YXIgaSA9IDAsIGxlbiA9IGF1dG9Fc2NhcGUubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgYyA9IGF1dG9Fc2NhcGVbaV07XG4gICAgdmFyIGVzYyA9IGVuY29kZVVSSUNvbXBvbmVudChjKTtcbiAgICBpZiAoZXNjID09PSBjKSB7XG4gICAgICAgIGVzYyA9IGVzY2FwZShjKTtcbiAgICB9XG4gICAgYXV0b0VzY2FwZU1hcFtjLmNoYXJDb2RlQXQoMCldID0gZXNjO1xufVxuXG5cbnZhciBzbGFzaFByb3RvY29scyA9IFVybC5wcm90b3R5cGUuX3NsYXNoUHJvdG9jb2xzID0ge1xuICAgIGh0dHA6IHRydWUsXG4gICAgaHR0cHM6IHRydWUsXG4gICAgZ29waGVyOiB0cnVlLFxuICAgIGZpbGU6IHRydWUsXG4gICAgZnRwOiB0cnVlLFxuXG4gICAgXCJodHRwOlwiOiB0cnVlLFxuICAgIFwiaHR0cHM6XCI6IHRydWUsXG4gICAgXCJnb3BoZXI6XCI6IHRydWUsXG4gICAgXCJmaWxlOlwiOiB0cnVlLFxuICAgIFwiZnRwOlwiOiB0cnVlXG59O1xuXG4vL09wdGltaXplIGJhY2sgZnJvbSBub3JtYWxpemVkIG9iamVjdCBjYXVzZWQgYnkgbm9uLWlkZW50aWZpZXIga2V5c1xuZnVuY3Rpb24gZigpe31cbmYucHJvdG90eXBlID0gc2xhc2hQcm90b2NvbHM7XG5cblVybC5wcm90b3R5cGUuX3Byb3RvY29sQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFtcbiAgICBbMHg2MSAvKidhJyovLCAweDdBIC8qJ3onKi9dLFxuICAgIFsweDQxIC8qJ0EnKi8sIDB4NUEgLyonWicqL10sXG4gICAgMHgyRSAvKicuJyovLCAweDJCIC8qJysnKi8sIDB4MkQgLyonLScqL1xuXSk7XG5cblVybC5wcm90b3R5cGUuX2hvc3RFbmRpbmdDaGFyYWN0ZXJzID0gbWFrZUFzY2lpVGFibGUoW1xuICAgIDB4MjMgLyonIycqLywgMHgzRiAvKic/JyovLCAweDJGIC8qJy8nKi9cbl0pO1xuXG5VcmwucHJvdG90eXBlLl9hdXRvRXNjYXBlQ2hhcmFjdGVycyA9IG1ha2VBc2NpaVRhYmxlKFxuICAgIGF1dG9Fc2NhcGUubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgcmV0dXJuIHYuY2hhckNvZGVBdCgwKTtcbiAgICB9KVxuKTtcblxuLy9JZiB0aGVzZSBjaGFyYWN0ZXJzIGVuZCBhIGhvc3QgbmFtZSwgdGhlIHBhdGggd2lsbCBub3QgYmUgcHJlcGVuZGVkIGEgL1xuVXJsLnByb3RvdHlwZS5fbm9QcmVwZW5kU2xhc2hIb3N0RW5kZXJzID0gbWFrZUFzY2lpVGFibGUoXG4gICAgW1xuICAgICAgICBcIjxcIiwgXCI+XCIsIFwiJ1wiLCBcImBcIiwgXCIgXCIsIFwiXFxyXCIsXG4gICAgICAgIFwiXFxuXCIsIFwiXFx0XCIsIFwie1wiLCBcIn1cIiwgXCJ8XCIsIFwiXFxcXFwiLFxuICAgICAgICBcIl5cIiwgXCJgXCIsIFwiXFxcIlwiLCBcIiVcIiwgXCI7XCJcbiAgICBdLm1hcChmdW5jdGlvbih2KSB7XG4gICAgICAgIHJldHVybiB2LmNoYXJDb2RlQXQoMCk7XG4gICAgfSlcbik7XG5cblVybC5wcm90b3R5cGUuX2F1dG9Fc2NhcGVNYXAgPSBhdXRvRXNjYXBlTWFwO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFVybDtcblxuVXJsLnJlcGxhY2UgPSBmdW5jdGlvbiBVcmwkUmVwbGFjZSgpIHtcbiAgICByZXF1aXJlLmNhY2hlW1widXJsXCJdID0ge1xuICAgICAgICBleHBvcnRzOiBVcmxcbiAgICB9O1xufTtcbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbiFmdW5jdGlvbihlKXtpZihcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyltb2R1bGUuZXhwb3J0cz1lKCk7ZWxzZSBpZihcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQpZGVmaW5lKGUpO2Vsc2V7dmFyIGY7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIHdpbmRvdz9mPXdpbmRvdzpcInVuZGVmaW5lZFwiIT10eXBlb2YgZ2xvYmFsP2Y9Z2xvYmFsOlwidW5kZWZpbmVkXCIhPXR5cGVvZiBzZWxmJiYoZj1zZWxmKSxmLnJvdXRlcz1lKCl9fShmdW5jdGlvbigpe3ZhciBkZWZpbmUsbW9kdWxlLGV4cG9ydHM7cmV0dXJuIChmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pKHsxOltmdW5jdGlvbihfZGVyZXFfLG1vZHVsZSxleHBvcnRzKXtcblxudmFyIGxvY2FsUm91dGVzID0gW107XG5cblxuLyoqXG4gKiBDb252ZXJ0IHBhdGggdG8gcm91dGUgb2JqZWN0XG4gKlxuICogQSBzdHJpbmcgb3IgUmVnRXhwIHNob3VsZCBiZSBwYXNzZWQsXG4gKiB3aWxsIHJldHVybiB7IHJlLCBzcmMsIGtleXN9IG9ialxuICpcbiAqIEBwYXJhbSAge1N0cmluZyAvIFJlZ0V4cH0gcGF0aFxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG5cbnZhciBSb3V0ZSA9IGZ1bmN0aW9uKHBhdGgpe1xuICAvL3VzaW5nICduZXcnIGlzIG9wdGlvbmFsXG5cbiAgdmFyIHNyYywgcmUsIGtleXMgPSBbXTtcblxuICBpZihwYXRoIGluc3RhbmNlb2YgUmVnRXhwKXtcbiAgICByZSA9IHBhdGg7XG4gICAgc3JjID0gcGF0aC50b1N0cmluZygpO1xuICB9ZWxzZXtcbiAgICByZSA9IHBhdGhUb1JlZ0V4cChwYXRoLCBrZXlzKTtcbiAgICBzcmMgPSBwYXRoO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgXHQgcmU6IHJlLFxuICBcdCBzcmM6IHBhdGgudG9TdHJpbmcoKSxcbiAgXHQga2V5czoga2V5c1xuICB9XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSB0aGUgZ2l2ZW4gcGF0aCBzdHJpbmcsXG4gKiByZXR1cm5pbmcgYSByZWd1bGFyIGV4cHJlc3Npb24uXG4gKlxuICogQW4gZW1wdHkgYXJyYXkgc2hvdWxkIGJlIHBhc3NlZCxcbiAqIHdoaWNoIHdpbGwgY29udGFpbiB0aGUgcGxhY2Vob2xkZXJcbiAqIGtleSBuYW1lcy4gRm9yIGV4YW1wbGUgXCIvdXNlci86aWRcIiB3aWxsXG4gKiB0aGVuIGNvbnRhaW4gW1wiaWRcIl0uXG4gKlxuICogQHBhcmFtICB7U3RyaW5nfSBwYXRoXG4gKiBAcGFyYW0gIHtBcnJheX0ga2V5c1xuICogQHJldHVybiB7UmVnRXhwfVxuICovXG52YXIgcGF0aFRvUmVnRXhwID0gZnVuY3Rpb24gKHBhdGgsIGtleXMpIHtcblx0cGF0aCA9IHBhdGhcblx0XHQuY29uY2F0KCcvPycpXG5cdFx0LnJlcGxhY2UoL1xcL1xcKC9nLCAnKD86LycpXG5cdFx0LnJlcGxhY2UoLyhcXC8pPyhcXC4pPzooXFx3KykoPzooXFwoLio/XFwpKSk/KFxcPyk/fFxcKi9nLCBmdW5jdGlvbihfLCBzbGFzaCwgZm9ybWF0LCBrZXksIGNhcHR1cmUsIG9wdGlvbmFsKXtcblx0XHRcdGlmIChfID09PSBcIipcIil7XG5cdFx0XHRcdGtleXMucHVzaCh1bmRlZmluZWQpO1xuXHRcdFx0XHRyZXR1cm4gXztcblx0XHRcdH1cblxuXHRcdFx0a2V5cy5wdXNoKGtleSk7XG5cdFx0XHRzbGFzaCA9IHNsYXNoIHx8ICcnO1xuXHRcdFx0cmV0dXJuICcnXG5cdFx0XHRcdCsgKG9wdGlvbmFsID8gJycgOiBzbGFzaClcblx0XHRcdFx0KyAnKD86J1xuXHRcdFx0XHQrIChvcHRpb25hbCA/IHNsYXNoIDogJycpXG5cdFx0XHRcdCsgKGZvcm1hdCB8fCAnJykgKyAoY2FwdHVyZSB8fCAnKFteL10rPyknKSArICcpJ1xuXHRcdFx0XHQrIChvcHRpb25hbCB8fCAnJyk7XG5cdFx0fSlcblx0XHQucmVwbGFjZSgvKFtcXC8uXSkvZywgJ1xcXFwkMScpXG5cdFx0LnJlcGxhY2UoL1xcKi9nLCAnKC4qKScpO1xuXHRyZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyBwYXRoICsgJyQnLCAnaScpO1xufTtcblxuLyoqXG4gKiBBdHRlbXB0IHRvIG1hdGNoIHRoZSBnaXZlbiByZXF1ZXN0IHRvXG4gKiBvbmUgb2YgdGhlIHJvdXRlcy4gV2hlbiBzdWNjZXNzZnVsXG4gKiBhICB7Zm4sIHBhcmFtcywgc3BsYXRzfSBvYmogaXMgcmV0dXJuZWRcbiAqXG4gKiBAcGFyYW0gIHtBcnJheX0gcm91dGVzXG4gKiBAcGFyYW0gIHtTdHJpbmd9IHVyaVxuICogQHJldHVybiB7T2JqZWN0fVxuICovXG52YXIgbWF0Y2ggPSBmdW5jdGlvbiAocm91dGVzLCB1cmksIHN0YXJ0QXQpIHtcblx0dmFyIGNhcHR1cmVzLCBpID0gc3RhcnRBdCB8fCAwO1xuXG5cdGZvciAodmFyIGxlbiA9IHJvdXRlcy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuXHRcdHZhciByb3V0ZSA9IHJvdXRlc1tpXSxcblx0XHQgICAgcmUgPSByb3V0ZS5yZSxcblx0XHQgICAga2V5cyA9IHJvdXRlLmtleXMsXG5cdFx0ICAgIHNwbGF0cyA9IFtdLFxuXHRcdCAgICBwYXJhbXMgPSB7fTtcblxuXHRcdGlmIChjYXB0dXJlcyA9IHVyaS5tYXRjaChyZSkpIHtcblx0XHRcdGZvciAodmFyIGogPSAxLCBsZW4gPSBjYXB0dXJlcy5sZW5ndGg7IGogPCBsZW47ICsraikge1xuXHRcdFx0XHR2YXIga2V5ID0ga2V5c1tqLTFdLFxuXHRcdFx0XHRcdHZhbCA9IHR5cGVvZiBjYXB0dXJlc1tqXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHRcdD8gdW5lc2NhcGUoY2FwdHVyZXNbal0pXG5cdFx0XHRcdFx0XHQ6IGNhcHR1cmVzW2pdO1xuXHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0cGFyYW1zW2tleV0gPSB2YWw7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3BsYXRzLnB1c2godmFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGFyYW1zOiBwYXJhbXMsXG5cdFx0XHRcdHNwbGF0czogc3BsYXRzLFxuXHRcdFx0XHRyb3V0ZTogcm91dGUuc3JjLFxuXHRcdFx0XHRuZXh0OiBpICsgMVxuXHRcdFx0fTtcblx0XHR9XG5cdH1cbn07XG5cbi8qKlxuICogRGVmYXVsdCBcIm5vcm1hbFwiIHJvdXRlciBjb25zdHJ1Y3Rvci5cbiAqIGFjY2VwdHMgcGF0aCwgZm4gdHVwbGVzIHZpYSBhZGRSb3V0ZVxuICogcmV0dXJucyB7Zm4sIHBhcmFtcywgc3BsYXRzLCByb3V0ZX1cbiAqICB2aWEgbWF0Y2hcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKi9cblxudmFyIFJvdXRlciA9IGZ1bmN0aW9uKCl7XG4gIC8vdXNpbmcgJ25ldycgaXMgb3B0aW9uYWxcbiAgcmV0dXJuIHtcbiAgICByb3V0ZXM6IFtdLFxuICAgIHJvdXRlTWFwIDoge30sXG4gICAgYWRkUm91dGU6IGZ1bmN0aW9uKHBhdGgsIGZuKXtcbiAgICAgIGlmICghcGF0aCkgdGhyb3cgbmV3IEVycm9yKCcgcm91dGUgcmVxdWlyZXMgYSBwYXRoJyk7XG4gICAgICBpZiAoIWZuKSB0aHJvdyBuZXcgRXJyb3IoJyByb3V0ZSAnICsgcGF0aC50b1N0cmluZygpICsgJyByZXF1aXJlcyBhIGNhbGxiYWNrJyk7XG5cbiAgICAgIHZhciByb3V0ZSA9IFJvdXRlKHBhdGgpO1xuICAgICAgcm91dGUuZm4gPSBmbjtcblxuICAgICAgdGhpcy5yb3V0ZXMucHVzaChyb3V0ZSk7XG4gICAgICB0aGlzLnJvdXRlTWFwW3BhdGhdID0gZm47XG4gICAgfSxcblxuICAgIG1hdGNoOiBmdW5jdGlvbihwYXRobmFtZSwgc3RhcnRBdCl7XG4gICAgICB2YXIgcm91dGUgPSBtYXRjaCh0aGlzLnJvdXRlcywgcGF0aG5hbWUsIHN0YXJ0QXQpO1xuICAgICAgaWYocm91dGUpe1xuICAgICAgICByb3V0ZS5mbiA9IHRoaXMucm91dGVNYXBbcm91dGUucm91dGVdO1xuICAgICAgICByb3V0ZS5uZXh0ID0gdGhpcy5tYXRjaC5iaW5kKHRoaXMsIHBhdGhuYW1lLCByb3V0ZS5uZXh0KVxuICAgICAgfVxuICAgICAgcmV0dXJuIHJvdXRlO1xuICAgIH1cbiAgfVxufTtcblxuUm91dGVyLlJvdXRlID0gUm91dGVcblJvdXRlci5wYXRoVG9SZWdFeHAgPSBwYXRoVG9SZWdFeHBcblJvdXRlci5tYXRjaCA9IG1hdGNoXG4vLyBiYWNrIGNvbXBhdFxuUm91dGVyLlJvdXRlciA9IFJvdXRlclxuXG5tb2R1bGUuZXhwb3J0cyA9IFJvdXRlclxuXG59LHt9XX0se30sWzFdKVxuKDEpXG59KTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIHdpbmRvdyA9IHJlcXVpcmUoXCJnbG9iYWwvd2luZG93XCIpXG52YXIgb25jZSA9IHJlcXVpcmUoXCJvbmNlXCIpXG52YXIgcGFyc2VIZWFkZXJzID0gcmVxdWlyZSgncGFyc2UtaGVhZGVycycpXG5cbnZhciBtZXNzYWdlcyA9IHtcbiAgICBcIjBcIjogXCJJbnRlcm5hbCBYTUxIdHRwUmVxdWVzdCBFcnJvclwiLFxuICAgIFwiNFwiOiBcIjR4eCBDbGllbnQgRXJyb3JcIixcbiAgICBcIjVcIjogXCI1eHggU2VydmVyIEVycm9yXCJcbn1cblxudmFyIFhIUiA9IHdpbmRvdy5YTUxIdHRwUmVxdWVzdCB8fCBub29wXG52YXIgWERSID0gXCJ3aXRoQ3JlZGVudGlhbHNcIiBpbiAobmV3IFhIUigpKSA/IFhIUiA6IHdpbmRvdy5YRG9tYWluUmVxdWVzdFxuXG5tb2R1bGUuZXhwb3J0cyA9IGNyZWF0ZVhIUlxuXG5mdW5jdGlvbiBjcmVhdGVYSFIob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgb3B0aW9ucyA9IHsgdXJpOiBvcHRpb25zIH1cbiAgICB9XG5cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIGNhbGxiYWNrID0gb25jZShjYWxsYmFjaylcblxuICAgIHZhciB4aHIgPSBvcHRpb25zLnhociB8fCBudWxsXG5cbiAgICBpZiAoIXhocikge1xuICAgICAgICBpZiAob3B0aW9ucy5jb3JzIHx8IG9wdGlvbnMudXNlWERSKSB7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWERSKClcbiAgICAgICAgfWVsc2V7XG4gICAgICAgICAgICB4aHIgPSBuZXcgWEhSKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHZhciB1cmkgPSB4aHIudXJsID0gb3B0aW9ucy51cmkgfHwgb3B0aW9ucy51cmxcbiAgICB2YXIgbWV0aG9kID0geGhyLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kIHx8IFwiR0VUXCJcbiAgICB2YXIgYm9keSA9IG9wdGlvbnMuYm9keSB8fCBvcHRpb25zLmRhdGFcbiAgICB2YXIgaGVhZGVycyA9IHhoci5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9XG4gICAgdmFyIHN5bmMgPSAhIW9wdGlvbnMuc3luY1xuICAgIHZhciBpc0pzb24gPSBmYWxzZVxuICAgIHZhciBrZXlcbiAgICB2YXIgbG9hZCA9IG9wdGlvbnMucmVzcG9uc2UgPyBsb2FkUmVzcG9uc2UgOiBsb2FkWGhyXG5cbiAgICBpZiAoXCJqc29uXCIgaW4gb3B0aW9ucykge1xuICAgICAgICBpc0pzb24gPSB0cnVlXG4gICAgICAgIGhlYWRlcnNbXCJBY2NlcHRcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICBpZiAobWV0aG9kICE9PSBcIkdFVFwiICYmIG1ldGhvZCAhPT0gXCJIRUFEXCIpIHtcbiAgICAgICAgICAgIGhlYWRlcnNbXCJDb250ZW50LVR5cGVcIl0gPSBcImFwcGxpY2F0aW9uL2pzb25cIlxuICAgICAgICAgICAgYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHhoci5vbnJlYWR5c3RhdGVjaGFuZ2UgPSByZWFkeXN0YXRlY2hhbmdlXG4gICAgeGhyLm9ubG9hZCA9IGxvYWRcbiAgICB4aHIub25lcnJvciA9IGVycm9yXG4gICAgLy8gSUU5IG11c3QgaGF2ZSBvbnByb2dyZXNzIGJlIHNldCB0byBhIHVuaXF1ZSBmdW5jdGlvbi5cbiAgICB4aHIub25wcm9ncmVzcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gSUUgbXVzdCBkaWVcbiAgICB9XG4gICAgLy8gaGF0ZSBJRVxuICAgIHhoci5vbnRpbWVvdXQgPSBub29wXG4gICAgeGhyLm9wZW4obWV0aG9kLCB1cmksICFzeW5jKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9iYWNrd2FyZCBjb21wYXRpYmlsaXR5XG4gICAgaWYgKG9wdGlvbnMud2l0aENyZWRlbnRpYWxzIHx8IChvcHRpb25zLmNvcnMgJiYgb3B0aW9ucy53aXRoQ3JlZGVudGlhbHMgIT09IGZhbHNlKSkge1xuICAgICAgICB4aHIud2l0aENyZWRlbnRpYWxzID0gdHJ1ZVxuICAgIH1cblxuICAgIC8vIENhbm5vdCBzZXQgdGltZW91dCB3aXRoIHN5bmMgcmVxdWVzdFxuICAgIGlmICghc3luYykge1xuICAgICAgICB4aHIudGltZW91dCA9IFwidGltZW91dFwiIGluIG9wdGlvbnMgPyBvcHRpb25zLnRpbWVvdXQgOiA1MDAwXG4gICAgfVxuXG4gICAgaWYgKHhoci5zZXRSZXF1ZXN0SGVhZGVyKSB7XG4gICAgICAgIGZvcihrZXkgaW4gaGVhZGVycyl7XG4gICAgICAgICAgICBpZihoZWFkZXJzLmhhc093blByb3BlcnR5KGtleSkpe1xuICAgICAgICAgICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgaGVhZGVyc1trZXldKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSBlbHNlIGlmIChvcHRpb25zLmhlYWRlcnMpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSGVhZGVycyBjYW5ub3QgYmUgc2V0IG9uIGFuIFhEb21haW5SZXF1ZXN0IG9iamVjdFwiKVxuICAgIH1cblxuICAgIGlmIChcInJlc3BvbnNlVHlwZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlXG4gICAgfVxuICAgIFxuICAgIGlmIChcImJlZm9yZVNlbmRcIiBpbiBvcHRpb25zICYmIFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5iZWZvcmVTZW5kID09PSBcImZ1bmN0aW9uXCJcbiAgICApIHtcbiAgICAgICAgb3B0aW9ucy5iZWZvcmVTZW5kKHhocilcbiAgICB9XG5cbiAgICB4aHIuc2VuZChib2R5KVxuXG4gICAgcmV0dXJuIHhoclxuXG4gICAgZnVuY3Rpb24gcmVhZHlzdGF0ZWNoYW5nZSgpIHtcbiAgICAgICAgaWYgKHhoci5yZWFkeVN0YXRlID09PSA0KSB7XG4gICAgICAgICAgICBsb2FkKClcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEJvZHkoKSB7XG4gICAgICAgIC8vIENocm9tZSB3aXRoIHJlcXVlc3RUeXBlPWJsb2IgdGhyb3dzIGVycm9ycyBhcnJvdW5kIHdoZW4gZXZlbiB0ZXN0aW5nIGFjY2VzcyB0byByZXNwb25zZVRleHRcbiAgICAgICAgdmFyIGJvZHkgPSBudWxsXG5cbiAgICAgICAgaWYgKHhoci5yZXNwb25zZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVxuICAgICAgICB9IGVsc2UgaWYgKHhoci5yZXNwb25zZVR5cGUgPT09ICd0ZXh0JyB8fCAheGhyLnJlc3BvbnNlVHlwZSkge1xuICAgICAgICAgICAgYm9keSA9IHhoci5yZXNwb25zZVRleHQgfHwgeGhyLnJlc3BvbnNlWE1MXG4gICAgICAgIH1cblxuICAgICAgICBpZiAoaXNKc29uKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHkgPSBKU09OLnBhcnNlKGJvZHkpXG4gICAgICAgICAgICB9IGNhdGNoIChlKSB7fVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJvZHlcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBnZXRTdGF0dXNDb2RlKCkge1xuICAgICAgICByZXR1cm4geGhyLnN0YXR1cyA9PT0gMTIyMyA/IDIwNCA6IHhoci5zdGF0dXNcbiAgICB9XG5cbiAgICAvLyBpZiB3ZSdyZSBnZXR0aW5nIGEgbm9uZS1vayBzdGF0dXNDb2RlLCBidWlsZCAmIHJldHVybiBhbiBlcnJvclxuICAgIGZ1bmN0aW9uIGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKSB7XG4gICAgICAgIHZhciBlcnJvciA9IG51bGxcbiAgICAgICAgaWYgKHN0YXR1cyA9PT0gMCB8fCAoc3RhdHVzID49IDQwMCAmJiBzdGF0dXMgPCA2MDApKSB7XG4gICAgICAgICAgICB2YXIgbWVzc2FnZSA9ICh0eXBlb2YgYm9keSA9PT0gXCJzdHJpbmdcIiA/IGJvZHkgOiBmYWxzZSkgfHxcbiAgICAgICAgICAgICAgICBtZXNzYWdlc1tTdHJpbmcoc3RhdHVzKS5jaGFyQXQoMCldXG4gICAgICAgICAgICBlcnJvciA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICAgICAgICAgICAgZXJyb3Iuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGVycm9yXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhICYgcHJvY2VzcyB0aGUgcmVzcG9uc2UgaW4gYSBzcGVjaWFsIHJlc3BvbnNlIG9iamVjdFxuICAgIGZ1bmN0aW9uIGxvYWRSZXNwb25zZSgpIHtcbiAgICAgICAgdmFyIHN0YXR1cyA9IGdldFN0YXR1c0NvZGUoKVxuICAgICAgICB2YXIgZXJyb3IgPSBlcnJvckZyb21TdGF0dXNDb2RlKHN0YXR1cylcbiAgICAgICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICAgICAgYm9keTogZ2V0Qm9keSgpLFxuICAgICAgICAgICAgc3RhdHVzQ29kZTogc3RhdHVzLFxuICAgICAgICAgICAgc3RhdHVzVGV4dDogeGhyLnN0YXR1c1RleHQsXG4gICAgICAgICAgICByYXc6IHhoclxuICAgICAgICB9XG4gICAgICAgIGlmKHhoci5nZXRBbGxSZXNwb25zZUhlYWRlcnMpeyAvL3JlbWVtYmVyIHhociBjYW4gaW4gZmFjdCBiZSBYRFIgZm9yIENPUlMgaW4gSUVcbiAgICAgICAgICAgIHJlc3BvbnNlLmhlYWRlcnMgPSBwYXJzZUhlYWRlcnMoeGhyLmdldEFsbFJlc3BvbnNlSGVhZGVycygpKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzcG9uc2UuaGVhZGVycyA9IHt9XG4gICAgICAgIH1cblxuICAgICAgICBjYWxsYmFjayhlcnJvciwgcmVzcG9uc2UsIHJlc3BvbnNlLmJvZHkpXG4gICAgfVxuXG4gICAgLy8gd2lsbCBsb2FkIHRoZSBkYXRhIGFuZCBhZGQgc29tZSByZXNwb25zZSBwcm9wZXJ0aWVzIHRvIHRoZSBzb3VyY2UgeGhyXG4gICAgLy8gYW5kIHRoZW4gcmVzcG9uZCB3aXRoIHRoYXRcbiAgICBmdW5jdGlvbiBsb2FkWGhyKCkge1xuICAgICAgICB2YXIgc3RhdHVzID0gZ2V0U3RhdHVzQ29kZSgpXG4gICAgICAgIHZhciBlcnJvciA9IGVycm9yRnJvbVN0YXR1c0NvZGUoc3RhdHVzKVxuXG4gICAgICAgIHhoci5zdGF0dXMgPSB4aHIuc3RhdHVzQ29kZSA9IHN0YXR1c1xuICAgICAgICB4aHIuYm9keSA9IGdldEJvZHkoKVxuICAgICAgICB4aHIuaGVhZGVycyA9IHBhcnNlSGVhZGVycyh4aHIuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCkpXG5cbiAgICAgICAgY2FsbGJhY2soZXJyb3IsIHhociwgeGhyLmJvZHkpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IoZXZ0KSB7XG4gICAgICAgIGNhbGxiYWNrKGV2dCwgeGhyKVxuICAgIH1cbn1cblxuXG5mdW5jdGlvbiBub29wKCkge31cbiIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbmlmICh0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB3aW5kb3c7XG59IGVsc2UgaWYgKHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbDtcbn0gZWxzZSBpZiAodHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIpe1xuICAgIG1vZHVsZS5leHBvcnRzID0gc2VsZjtcbn0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSB7fTtcbn1cblxufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cyA9IG9uY2Vcblxub25jZS5wcm90byA9IG9uY2UoZnVuY3Rpb24gKCkge1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoRnVuY3Rpb24ucHJvdG90eXBlLCAnb25jZScsIHtcbiAgICB2YWx1ZTogZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIG9uY2UodGhpcylcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICB9KVxufSlcblxuZnVuY3Rpb24gb25jZSAoZm4pIHtcbiAgdmFyIGNhbGxlZCA9IGZhbHNlXG4gIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKGNhbGxlZCkgcmV0dXJuXG4gICAgY2FsbGVkID0gdHJ1ZVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpXG4gIH1cbn1cbiIsInZhciBpc0Z1bmN0aW9uID0gcmVxdWlyZSgnaXMtZnVuY3Rpb24nKVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZvckVhY2hcblxudmFyIHRvU3RyaW5nID0gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZ1xudmFyIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eVxuXG5mdW5jdGlvbiBmb3JFYWNoKGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpc0Z1bmN0aW9uKGl0ZXJhdG9yKSkge1xuICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdpdGVyYXRvciBtdXN0IGJlIGEgZnVuY3Rpb24nKVxuICAgIH1cblxuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBjb250ZXh0ID0gdGhpc1xuICAgIH1cbiAgICBcbiAgICBpZiAodG9TdHJpbmcuY2FsbChsaXN0KSA9PT0gJ1tvYmplY3QgQXJyYXldJylcbiAgICAgICAgZm9yRWFjaEFycmF5KGxpc3QsIGl0ZXJhdG9yLCBjb250ZXh0KVxuICAgIGVsc2UgaWYgKHR5cGVvZiBsaXN0ID09PSAnc3RyaW5nJylcbiAgICAgICAgZm9yRWFjaFN0cmluZyhsaXN0LCBpdGVyYXRvciwgY29udGV4dClcbiAgICBlbHNlXG4gICAgICAgIGZvckVhY2hPYmplY3QobGlzdCwgaXRlcmF0b3IsIGNvbnRleHQpXG59XG5cbmZ1bmN0aW9uIGZvckVhY2hBcnJheShhcnJheSwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJyYXkubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgaWYgKGhhc093blByb3BlcnR5LmNhbGwoYXJyYXksIGkpKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIGFycmF5W2ldLCBpLCBhcnJheSlcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZm9yRWFjaFN0cmluZyhzdHJpbmcsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbiA9IHN0cmluZy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAvLyBubyBzdWNoIHRoaW5nIGFzIGEgc3BhcnNlIHN0cmluZy5cbiAgICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBzdHJpbmcuY2hhckF0KGkpLCBpLCBzdHJpbmcpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBmb3JFYWNoT2JqZWN0KG9iamVjdCwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBmb3IgKHZhciBrIGluIG9iamVjdCkge1xuICAgICAgICBpZiAoaGFzT3duUHJvcGVydHkuY2FsbChvYmplY3QsIGspKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9iamVjdFtrXSwgaywgb2JqZWN0KVxuICAgICAgICB9XG4gICAgfVxufVxuIiwibW9kdWxlLmV4cG9ydHMgPSBpc0Z1bmN0aW9uXG5cbnZhciB0b1N0cmluZyA9IE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmdcblxuZnVuY3Rpb24gaXNGdW5jdGlvbiAoZm4pIHtcbiAgdmFyIHN0cmluZyA9IHRvU3RyaW5nLmNhbGwoZm4pXG4gIHJldHVybiBzdHJpbmcgPT09ICdbb2JqZWN0IEZ1bmN0aW9uXScgfHxcbiAgICAodHlwZW9mIGZuID09PSAnZnVuY3Rpb24nICYmIHN0cmluZyAhPT0gJ1tvYmplY3QgUmVnRXhwXScpIHx8XG4gICAgKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnICYmXG4gICAgIC8vIElFOCBhbmQgYmVsb3dcbiAgICAgKGZuID09PSB3aW5kb3cuc2V0VGltZW91dCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5hbGVydCB8fFxuICAgICAgZm4gPT09IHdpbmRvdy5jb25maXJtIHx8XG4gICAgICBmbiA9PT0gd2luZG93LnByb21wdCkpXG59O1xuIiwiXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSB0cmltO1xuXG5mdW5jdGlvbiB0cmltKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyp8XFxzKiQvZywgJycpO1xufVxuXG5leHBvcnRzLmxlZnQgPSBmdW5jdGlvbihzdHIpe1xuICByZXR1cm4gc3RyLnJlcGxhY2UoL15cXHMqLywgJycpO1xufTtcblxuZXhwb3J0cy5yaWdodCA9IGZ1bmN0aW9uKHN0cil7XG4gIHJldHVybiBzdHIucmVwbGFjZSgvXFxzKiQvLCAnJyk7XG59O1xuIiwidmFyIHRyaW0gPSByZXF1aXJlKCd0cmltJylcbiAgLCBmb3JFYWNoID0gcmVxdWlyZSgnZm9yLWVhY2gnKVxuICAsIGlzQXJyYXkgPSBmdW5jdGlvbihhcmcpIHtcbiAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYXJnKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICB9XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGhlYWRlcnMpIHtcbiAgaWYgKCFoZWFkZXJzKVxuICAgIHJldHVybiB7fVxuXG4gIHZhciByZXN1bHQgPSB7fVxuXG4gIGZvckVhY2goXG4gICAgICB0cmltKGhlYWRlcnMpLnNwbGl0KCdcXG4nKVxuICAgICwgZnVuY3Rpb24gKHJvdykge1xuICAgICAgICB2YXIgaW5kZXggPSByb3cuaW5kZXhPZignOicpXG4gICAgICAgICAgLCBrZXkgPSB0cmltKHJvdy5zbGljZSgwLCBpbmRleCkpLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAsIHZhbHVlID0gdHJpbShyb3cuc2xpY2UoaW5kZXggKyAxKSlcblxuICAgICAgICBpZiAodHlwZW9mKHJlc3VsdFtrZXldKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICByZXN1bHRba2V5XSA9IHZhbHVlXG4gICAgICAgIH0gZWxzZSBpZiAoaXNBcnJheShyZXN1bHRba2V5XSkpIHtcbiAgICAgICAgICByZXN1bHRba2V5XS5wdXNoKHZhbHVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJlc3VsdFtrZXldID0gWyByZXN1bHRba2V5XSwgdmFsdWUgXVxuICAgICAgICB9XG4gICAgICB9XG4gIClcblxuICByZXR1cm4gcmVzdWx0XG59Il19
