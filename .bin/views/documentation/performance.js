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
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.</p>\n<p>There&#39;s a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.</p>\n<h1 id=\"performance-checklist\">Performance Checklist</h1>\n<p>If you haven&#39;t, you should read <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">&quot;Critical Path Performance Optimization&quot;</a> as a small guide of performance optimizations you should already be doing. The list below contains some of what&#39;s discussed in that article.</p>\n<ul>\n<li>Move away from dedicated client-side rendering</li>\n<li>Use <a href=\"http://nginx.org/\"><code>nginx</code></a> as a reverse proxy for your front-end servers</li>\n<li>Resize and optimize images</li>\n<li>Defer non-critical static asset loading</li>\n<li>Inline critical CSS and JavaScript</li>\n<li>Cache responses aggressively</li>\n<li>Ditch large libraries and frameworks</li>\n</ul>\n<h1 id=\"boosting-performance-with-taunus\">Boosting Performance with Taunus</h1>\n<p>When it comes to Taunus, there&#39;s a few more performance tweaks you should consider implementing.</p>\n<ul>\n<li>Choose the right boot strategy</li>\n<li>Turn on client-side caching</li>\n<li>Enable prefetching for predictive cache loading</li>\n<li>Use versioning to ensure cache relevance</li>\n<li>Send views and controllers to the client selectively</li>\n</ul>\n<p>Given that this site is about Taunus, we&#39;ll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.</p>\n<h1 id=\"choose-the-right-boot-strategy\">Choose the right boot strategy</h1>\n<h1 id=\"turn-on-client-side-caching\">Turn on client-side caching</h1>\n<h1 id=\"enable-prefetching-for-predictive-cache-loading\">Enable prefetching for predictive cache loading</h1>\n<h1 id=\"use-versioning-to-ensure-cache-relevance\">Use versioning to ensure cache relevance</h1>\n<h1 id=\"send-views-and-controllers-to-the-client-selectively\">Send views and controllers to the client selectively</h1>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();}.call(this,"undefined" in locals_for_with?locals_for_with.undefined:typeof undefined!=="undefined"?undefined:undefined));;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :markdown\n    # Performance Optimization\n\n    Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on the site as well.\n\n    There's a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.\n\n    # Performance Checklist\n\n    If you haven't, you should read [\"Critical Path Performance Optimization\"][1] as a small guide of performance optimizations you should already be doing. The list below contains some of what's discussed in that article.\n\n    - Move away from dedicated client-side rendering\n    - Use [`nginx`][2] as a reverse proxy for your front-end servers\n    - Resize and optimize images\n    - Defer non-critical static asset loading\n    - Inline critical CSS and JavaScript\n    - Cache responses aggressively\n    - Ditch large libraries and frameworks\n\n    # Boosting Performance with Taunus\n\n    When it comes to Taunus, there's a few more performance tweaks you should consider implementing.\n\n    - Choose the right boot strategy\n    - Turn on client-side caching\n    - Enable prefetching for predictive cache loading\n    - Use versioning to ensure cache relevance\n    - Send views and controllers to the client selectively\n\n    Given that this site is about Taunus, we'll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.\n\n    # Choose the right boot strategy\n    # Turn on client-side caching\n    # Enable prefetching for predictive cache loading\n    # Use versioning to ensure cache relevance\n    # Send views and controllers to the client selectively\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://nginx.org/\n");
}
}