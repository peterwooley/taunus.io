var jade = require("jadum/runtime");
module.exports = function performance(locals) {
var jade_debug = [ new jade.DebugItem( 1, "views/documentation/performance.jade" ) ];
try {
var buf = [];
var jade_mixins = {};
var jade_interp;

jade_debug.unshift(new jade.DebugItem( 0, "views/documentation/performance.jade" ));
jade_debug.unshift(new jade.DebugItem( 1, "views/documentation/performance.jade" ));
buf.push("<section class=\"ly-section md-markdown\">");
jade_debug.unshift(new jade.DebugItem( undefined, jade_debug[0].filename ));
jade_debug.unshift(new jade.DebugItem( 120, "views/documentation/performance.jade" ));
buf.push("<h1 id=\"performance-optimization\">Performance Optimization</h1>\n<p>Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on this site as well.</p>\n<p>There&#39;s a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.</p>\n<h1 id=\"performance-checklist\">Performance Checklist</h1>\n<p>If you haven&#39;t, you should read <a href=\"http://ponyfoo.com/articles/critical-path-performance-optimization\">&quot;Critical Path Performance Optimization&quot;</a> as a small guide of performance optimizations you should already be doing. The list below contains some of what&#39;s discussed in that article.</p>\n<ul>\n<li>Move away from dedicated client-side rendering</li>\n<li>Use <a href=\"http://nginx.org/\"><code>nginx</code></a> as a reverse proxy for your front-end servers</li>\n<li>Resize and optimize images</li>\n<li>Defer non-critical static asset loading</li>\n<li>Inline critical CSS and JavaScript</li>\n<li>Cache responses aggressively</li>\n<li>Ditch large libraries and frameworks</li>\n</ul>\n<h1 id=\"boosting-performance-with-taunus\">Boosting Performance with Taunus</h1>\n<p>When it comes to Taunus, there&#39;s a few more performance tweaks you should consider implementing.</p>\n<ul>\n<li>Choose <a href=\"#choose-the-right-boot-strategy\">the right boot strategy</a></li>\n<li>Turn on client-side <a href=\"#turn-on-client-side-caching\">caching</a></li>\n<li><a href=\"#use-versioning-to-ensure-cache-validity\">Use versioning</a> to ensure cache validity</li>\n<li>Enable prefetching for <a href=\"#enable-prefetching-for-predictive-cache-loading\">predictive cache loading</a></li>\n<li><a href=\"#send-views-and-controllers-to-the-client-selectively\">Send views and controllers to the client selectively</a></li>\n</ul>\n<p>Given that this site is about Taunus, we&#39;ll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.</p>\n<h1 id=\"choose-the-right-boot-strategy\">Choose the right boot strategy</h1>\n<p>Taunus needs to conjure up a view model so that you have access to its properties in the client-side view controller. To that end, Taunus offers three different boot strategies because there isn&#39;t a one-size-fits-all answer to the question <em>&quot;which boot strategy is the best one for me?&quot;</em>.</p>\n<p>When you want a relaxed approach to using Taunus, you should go for the <a href=\"/api#using-the-auto-strategy\"><code>auto</code></a> strategy. Maybe you&#39;re just getting started or you&#39;re not as concerned about performance just yet. Here Taunus will wait on you to call <a href=\"/api#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a>, and then make an AJAX request to get the model for that view on your behalf. <em>This is the strategy that Taunus uses by default.</em></p>\n<p>If your models are consistently small because you have little dynamic content, or if you want to <em>execute the client-side controller as quickly as possible</em>, then the <a href=\"/api#using-the-inline-strategy\"><code>inline</code></a> strategy might be the best for you. Here you&#39;re expected to place the model in a <code>&lt;script&gt;</code> tag inside the view layout, and Taunus takes care of the rest.</p>\n<p>The third strategy is <a href=\"/api#using-the-manual-strategy\"><code>manual</code></a>, where you are supposed to somehow get a model, presumably using AJAX or script loading, and then letting Taunus know that you&#39;re done. This might be faster than the <a href=\"/api#using-the-auto-strategy\"><code>auto</code></a> approach, because you could write an inline script to fetch the model as Taunus is being downloaded. It also might be slower than <code>auto</code> in those cases where <code>auto</code> would&#39;ve used a cached copy of the model instead of making a request, so <em>your mileage may vary</em>.</p>\n<p>For more complex use cases, you may want to consider mixing different boot strategies, choosing the one that makes the most sense in each case. In these cases, you need to pay attention to having an agreement between what&#39;s being done in the view layout <em>(script inlining, AJAX call, or doing nothing)</em> and the <a href=\"/api#-taunus-mount-container-wiring-options-\"><code>taunus.mount</code></a> call <em>(picking a boot strategy that matches what&#39;s being done on the layout)</em>.</p>\n<p><sub><a href=\"#boosting-performance-with-taunus\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"turn-on-client-side-caching\">Turn on client-side caching</h1>\n<p>A caching engine is built into Taunus, and it&#39;s very easy to set up, you just have to ask for it by passing <a href=\"/api#caching\"><code>cache: true</code></a> to the client-side mountpoint. The cache can be used as a means to avoid making expensive AJAX calls for well-defined periods of time. You can determine how long an item will be cached for on a global level, as well as on a route-by-route basis.</p>\n<p>Taunus implements a two-tiered cache in which items are persisted both in-memory and in an IndexedDB database. This provides faster access to the cache while ensuring that data persists across browser reloads. In browsers that don&#39;t support IndexedDB, only the in-memory cache will be used.</p>\n<blockquote>\n<p>You can also use a <a href=\"/api#-taunus-intercept-action-fn-\">custom request interceptor</a> to listen for requests before they become AJAX calls and prevent that from happenning. The caching layer is in fact built as a request interceptor. You may want to use other mechanisms for preventing AJAX requests from being made, such as inferring a model from the models that were fetched so far for other views, or maybe simply preventing the request for views that don&#39;t need a model from the server at all.</p>\n</blockquote>\n<p>The <strong>cache can significantly improve your application&#39;s perceived responsiveness</strong>, but it could also do damage if your application is updated too frequently but you cache responses for long periods of time. It can also prove problematic if the models are highly volatile, as a cached response might be used for a view that expects some value to change every time. While caching isn&#39;t the solution to the latter, the former can be addressed using <a href=\"#use-versioning-to-ensure-cache-validity\">versioning</a>.</p>\n<p><sub><a href=\"#boosting-performance-with-taunus\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"use-versioning-to-ensure-cache-validity\">Use versioning to ensure cache validity</h1>\n<p>Versioning is a tough problem that single-page application frameworks don&#39;t address. If your framework of choice renders your application as a SPA, how exactly will it behave when you push updates to the server, <a href=\"http://bevacqua.io/bf\">many times a day</a>? Is it well defined? Will views received before the deployment be updated to the latest version? Will models cached in the old version of the application be invalidated? Will new views and client-side controllers make it to the user?</p>\n<p>Taunus handles all of these scenarios for you. Every response from the server contains the current version string for your app. If a response updates the version number stored in the client, cached views, controllers, and models, will become invalidated.</p>\n<p>If at any point Taunus is relying solely on the cache to render a view, then yes, the user will see the same view with the same model and the same controller that he saw a few seconds ago. But whenever a request hits the server and gets back to the client with an updated version number, Taunus will know to redirect the user <em>(or re-fetch each view)</em> so that the user gets the upgraded experience.</p>\n<blockquote>\n<p>Most importantly, versioning means that responses from the server will never break communication with clients that were connected before a deployment introduced an update, changing the models that the server returns, while the client expected models using a different structure.</p>\n</blockquote>\n<p>To <a href=\"/api#versioning\">enable versioning</a> you just have to choose a version number on both the server and the client mountpoints. This number should be updated with discretion, as frequent changes to the version number may defeat the performance improvements of client-side rendering.</p>\n<p><sub><a href=\"#boosting-performance-with-taunus\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"enable-prefetching-for-predictive-cache-loading\">Enable prefetching for predictive cache loading</h1>\n<blockquote>\n<p>Prefetching can yield huge performance boosts by simply issuing requests as soon as the human hints at his interest to load a view.</p>\n</blockquote>\n<p>By default Taunus ships with an <em>&quot;on-hover/on-touch-start&quot;</em> prefetcher that you can enable just by <a href=\"/api#prefetching\">setting the <code>prefetch: true</code> option</a> on the client-side mountpoint. It works by starting to fetch the model for a view as soon as humans hover over an anchor link, or put their finger on it on mobile devices. When the human does decide to click on the link, the prefetcher may be done, meaning that they&#39;ll be instantly redirected. If the prefetcher is still working, you&#39;d still be making a shortcut, as the user will be redirected as soon as the prefetcher finishes, giving you a head start and representing a perceived performance boost.</p>\n<p>You can also create your own prefetching rules. Maybe you&#39;d like to start prefetching a view as soon as humans start moving the mouse cursor towards a link. When you consider that a user shows intent to navigate to an action, you can call <a href=\"/api#using-taunus-prefetch-url-element-\"><code>taunus.prefetch</code></a> and start loading everything necessary for the view to be immediately loaded.</p>\n<p>Note that <strong>the prefetcher can only load <em>one route</em> at a time</strong>. This is by design, as prefetching lots of links would interfere with the human&#39;s connectivity, doing more harm than good. If the prefetcher is already loading a route when another attempt to prefetch is registered, the old request will be aborted to make room for the new one.</p>\n<p><sub><a href=\"#boosting-performance-with-taunus\"><em>(back to table of contents)</em></a></sub></p>\n<h1 id=\"send-views-and-controllers-to-the-client-selectively\">Send views and controllers to the client selectively</h1>\n<p>The most ambitious performance optimization that can be done with Taunus is deferring client-side views and controllers. The default behavior is to compile every view and controller, alongside routes and Taunus itself, and send everything in a single bundle to the client. As your application grows, it might no longer be practical to send everything together in a huge bundle, as performance would suffer.</p>\n<p>Taunus offers a mechanism through which you can defer specific actions, or parts of the application. When one of those parts of the application needs to be loaded, even when using <a href=\"/api#-taunus-partial-container-action-model-\"><code>taunus.partial</code></a>, the server-side will bundle the view template module and the client-side controller module and send that to the client. The client then runs <code>eval</code> on the bundle and proceeds to store it in its cache, using the same caching mechanism that&#39;s used for models <em>(except that views and controllers only go stale due to version changes, and never because of durations)</em>.</p>\n<p>To make use of the deferral mechanism you have to take a few things into consideration. First off, you&#39;ll have to use the <a href=\"/api#-defer-actions-\"><code>--defer</code></a> flag in the CLI to select the actions you want to defer. For instance, doing <code>taunus --defer admin</code> will defer all actions for the <code>admin</code> controller.</p>\n<p>Deferred modules are bundled with Browserify and get <strong>source maps by default</strong>, so debugging them during development is as easy as debugging non-deferred controllers or view template functions. You can change this behavior by <a href=\"/api#-options-deferminified-\">setting <code>deferMinified: true</code> at the server-side mountpoint</a>, which will minify the bundle and also remove the sourcemap. These bundles are generated the first time that they get requested, and subsequent requests for the same bundle will receive a copy that gets cached in memory.</p>\n<p>You have to be careful when deferring views and controllers, as the bundle for every component will be compiled independently. Here&#39;s a few considerations to take in mind.</p>\n<ul>\n<li>Take into account that each module you reference globally is a module that&#39;s not compiled on every component that <code>require</code>s it. This translates into leaner responses when clients need to fetch a template and a client-side controller</li>\n<li>Avoid maintaining global state across view controllers using modules. If you need to do so, consider using events instead. Deferred modules are self-contained, meaning that even if two separate controllers require a given <code>./state</code> module, each controller will get its own idependent instance of the <code>./state</code> module, and nothing will be shared.</li>\n</ul>\n<p>In the future, transports other than CommonJS may be available for defining controllers and view templates that can be deferred, but for now that&#39;s the only viable transport when it comes to deferred execution in Taunus.</p>\n<p><sub><a href=\"#boosting-performance-with-taunus\"><em>(back to table of contents)</em></a></sub></p>\n");
jade_debug.shift();
jade_debug.shift();
buf.push("</section>");
jade_debug.shift();
jade_debug.shift();;return buf.join("");
} catch (err) {
  jade.rethrow(err, jade_debug[0].filename, jade_debug[0].lineno, "section.ly-section.md-markdown\n  :ultramarked\n    # Performance Optimization\n\n    Given that performance is one of the core values in both Taunus and User Experience, it deserved a first-class article on this site as well.\n\n    There's a few things to take into account when developing an application if we want to strive for performance, and this article aims to be a collection of web performance best practices along with tips on how to improve performance especifically for applications built on top of Taunus.\n\n    # Performance Checklist\n\n    If you haven't, you should read [\"Critical Path Performance Optimization\"][1] as a small guide of performance optimizations you should already be doing. The list below contains some of what's discussed in that article.\n\n    - Move away from dedicated client-side rendering\n    - Use [`nginx`][2] as a reverse proxy for your front-end servers\n    - Resize and optimize images\n    - Defer non-critical static asset loading\n    - Inline critical CSS and JavaScript\n    - Cache responses aggressively\n    - Ditch large libraries and frameworks\n\n    # Boosting Performance with Taunus\n\n    When it comes to Taunus, there's a few more performance tweaks you should consider implementing.\n\n    - Choose [the right boot strategy](#choose-the-right-boot-strategy)\n    - Turn on client-side [caching](#turn-on-client-side-caching)\n    - [Use versioning](#use-versioning-to-ensure-cache-validity) to ensure cache validity\n    - Enable prefetching for [predictive cache loading](#enable-prefetching-for-predictive-cache-loading)\n    - [Send views and controllers to the client selectively](#send-views-and-controllers-to-the-client-selectively)\n\n    Given that this site is about Taunus, we'll focus on the Taunus tweaks, as you can readily scour the web for general web performance advice.\n\n    # Choose the right boot strategy\n\n    Taunus needs to conjure up a view model so that you have access to its properties in the client-side view controller. To that end, Taunus offers three different boot strategies because there isn't a one-size-fits-all answer to the question _\"which boot strategy is the best one for me?\"_.\n\n    When you want a relaxed approach to using Taunus, you should go for the [`auto`][3] strategy. Maybe you're just getting started or you're not as concerned about performance just yet. Here Taunus will wait on you to call [`taunus.mount`][5], and then make an AJAX request to get the model for that view on your behalf. _This is the strategy that Taunus uses by default._\n\n    If your models are consistently small because you have little dynamic content, or if you want to _execute the client-side controller as quickly as possible_, then the [`inline`][4] strategy might be the best for you. Here you're expected to place the model in a `<script>` tag inside the view layout, and Taunus takes care of the rest.\n\n    The third strategy is [`manual`][6], where you are supposed to somehow get a model, presumably using AJAX or script loading, and then letting Taunus know that you're done. This might be faster than the [`auto`][3] approach, because you could write an inline script to fetch the model as Taunus is being downloaded. It also might be slower than `auto` in those cases where `auto` would've used a cached copy of the model instead of making a request, so _your mileage may vary_.\n\n    For more complex use cases, you may want to consider mixing different boot strategies, choosing the one that makes the most sense in each case. In these cases, you need to pay attention to having an agreement between what's being done in the view layout _(script inlining, AJAX call, or doing nothing)_ and the [`taunus.mount`][5] call _(picking a boot strategy that matches what's being done on the layout)_.\n\n    <sub>[_(back to table of contents)_](#boosting-performance-with-taunus)</sub>\n\n    # Turn on client-side caching\n\n    A caching engine is built into Taunus, and it's very easy to set up, you just have to ask for it by passing [`cache: true`][7] to the client-side mountpoint. The cache can be used as a means to avoid making expensive AJAX calls for well-defined periods of time. You can determine how long an item will be cached for on a global level, as well as on a route-by-route basis.\n\n    Taunus implements a two-tiered cache in which items are persisted both in-memory and in an IndexedDB database. This provides faster access to the cache while ensuring that data persists across browser reloads. In browsers that don't support IndexedDB, only the in-memory cache will be used.\n\n    > You can also use a [custom request interceptor][8] to listen for requests before they become AJAX calls and prevent that from happenning. The caching layer is in fact built as a request interceptor. You may want to use other mechanisms for preventing AJAX requests from being made, such as inferring a model from the models that were fetched so far for other views, or maybe simply preventing the request for views that don't need a model from the server at all.\n\n    The **cache can significantly improve your application's perceived responsiveness**, but it could also do damage if your application is updated too frequently but you cache responses for long periods of time. It can also prove problematic if the models are highly volatile, as a cached response might be used for a view that expects some value to change every time. While caching isn't the solution to the latter, the former can be addressed using [versioning](#use-versioning-to-ensure-cache-validity).\n\n    <sub>[_(back to table of contents)_](#boosting-performance-with-taunus)</sub>\n\n    # Use versioning to ensure cache validity\n\n    Versioning is a tough problem that single-page application frameworks don't address. If your framework of choice renders your application as a SPA, how exactly will it behave when you push updates to the server, [many times a day][10]? Is it well defined? Will views received before the deployment be updated to the latest version? Will models cached in the old version of the application be invalidated? Will new views and client-side controllers make it to the user?\n\n    Taunus handles all of these scenarios for you. Every response from the server contains the current version string for your app. If a response updates the version number stored in the client, cached views, controllers, and models, will become invalidated.\n\n    If at any point Taunus is relying solely on the cache to render a view, then yes, the user will see the same view with the same model and the same controller that he saw a few seconds ago. But whenever a request hits the server and gets back to the client with an updated version number, Taunus will know to redirect the user _(or re-fetch each view)_ so that the user gets the upgraded experience.\n\n    > Most importantly, versioning means that responses from the server will never break communication with clients that were connected before a deployment introduced an update, changing the models that the server returns, while the client expected models using a different structure.\n\n    To [enable versioning][11] you just have to choose a version number on both the server and the client mountpoints. This number should be updated with discretion, as frequent changes to the version number may defeat the performance improvements of client-side rendering.\n\n    <sub>[_(back to table of contents)_](#boosting-performance-with-taunus)</sub>\n\n    # Enable prefetching for predictive cache loading\n\n    > Prefetching can yield huge performance boosts by simply issuing requests as soon as the human hints at his interest to load a view.\n\n    By default Taunus ships with an _\"on-hover/on-touch-start\"_ prefetcher that you can enable just by [setting the `prefetch: true` option][12] on the client-side mountpoint. It works by starting to fetch the model for a view as soon as humans hover over an anchor link, or put their finger on it on mobile devices. When the human does decide to click on the link, the prefetcher may be done, meaning that they'll be instantly redirected. If the prefetcher is still working, you'd still be making a shortcut, as the user will be redirected as soon as the prefetcher finishes, giving you a head start and representing a perceived performance boost.\n\n    You can also create your own prefetching rules. Maybe you'd like to start prefetching a view as soon as humans start moving the mouse cursor towards a link. When you consider that a user shows intent to navigate to an action, you can call [`taunus.prefetch`][13] and start loading everything necessary for the view to be immediately loaded.\n\n    Note that **the prefetcher can only load _one route_ at a time**. This is by design, as prefetching lots of links would interfere with the human's connectivity, doing more harm than good. If the prefetcher is already loading a route when another attempt to prefetch is registered, the old request will be aborted to make room for the new one.\n\n    <sub>[_(back to table of contents)_](#boosting-performance-with-taunus)</sub>\n\n    # Send views and controllers to the client selectively\n\n    The most ambitious performance optimization that can be done with Taunus is deferring client-side views and controllers. The default behavior is to compile every view and controller, alongside routes and Taunus itself, and send everything in a single bundle to the client. As your application grows, it might no longer be practical to send everything together in a huge bundle, as performance would suffer.\n\n    Taunus offers a mechanism through which you can defer specific actions, or parts of the application. When one of those parts of the application needs to be loaded, even when using [`taunus.partial`][14], the server-side will bundle the view template module and the client-side controller module and send that to the client. The client then runs `eval` on the bundle and proceeds to store it in its cache, using the same caching mechanism that's used for models _(except that views and controllers only go stale due to version changes, and never because of durations)_.\n\n    To make use of the deferral mechanism you have to take a few things into consideration. First off, you'll have to use the [`--defer`][15] flag in the CLI to select the actions you want to defer. For instance, doing `taunus --defer admin` will defer all actions for the `admin` controller.\n\n    Deferred modules are bundled with Browserify and get **source maps by default**, so debugging them during development is as easy as debugging non-deferred controllers or view template functions. You can change this behavior by [setting `deferMinified: true` at the server-side mountpoint][16], which will minify the bundle and also remove the sourcemap. These bundles are generated the first time that they get requested, and subsequent requests for the same bundle will receive a copy that gets cached in memory.\n\n    You have to be careful when deferring views and controllers, as the bundle for every component will be compiled independently. Here's a few considerations to take in mind.\n\n    - Take into account that each module you reference globally is a module that's not compiled on every component that `require`s it. This translates into leaner responses when clients need to fetch a template and a client-side controller\n    - Avoid maintaining global state across view controllers using modules. If you need to do so, consider using events instead. Deferred modules are self-contained, meaning that even if two separate controllers require a given `./state` module, each controller will get its own idependent instance of the `./state` module, and nothing will be shared.\n\n    In the future, transports other than CommonJS may be available for defining controllers and view templates that can be deferred, but for now that's the only viable transport when it comes to deferred execution in Taunus.\n\n    <sub>[_(back to table of contents)_](#boosting-performance-with-taunus)</sub>\n\n    [1]: http://ponyfoo.com/articles/critical-path-performance-optimization\n    [2]: http://nginx.org/\n    [3]: /api#using-the-auto-strategy\n    [4]: /api#using-the-inline-strategy\n    [5]: /api#-taunus-mount-container-wiring-options-\n    [6]: /api#using-the-manual-strategy\n    [7]: /api#caching\n    [8]: /api#-taunus-intercept-action-fn-\n    [9]: http://rauchg.com/2014/7-principles-of-rich-web-applications/\n    [10]: http://bevacqua.io/bf\n    [11]: /api#versioning\n    [12]: /api#prefetching\n    [13]: /api#using-taunus-prefetch-url-element-\n    [14]: /api#-taunus-partial-container-action-model-\n    [15]: /api#-defer-actions-\n    [16]: /api#-options-deferminified-\n");
}
}