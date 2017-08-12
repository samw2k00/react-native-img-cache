var __assign = (this && this.__assign) || Object.assign || function (t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s)
            if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
    }
    return t;
};
import React, { Component } from "react";
import { Image, Platform } from "react-native";
import RNFetchBlob from "react-native-fetch-blob";
const SHA1 = require("crypto-js/sha1");
const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
const BASE_DIR = RNFetchBlob.fs.dirs.CacheDir + "/react-native-img-cache";
const FILE_PREFIX = Platform.OS === "ios" ? "" : "file://";
export class ImageCache {
    constructor() {
        this.cache = {};
    }
    getPath(uri, immutable) {
        let path = uri.substring(uri.lastIndexOf("/"));
        path = path.indexOf("?") === -1 ? path : path.substring(path.lastIndexOf("."), path.indexOf("?"));
        const ext = path.indexOf(".") === -1 ? ".jpg" : path.substring(path.indexOf("."));
        if (immutable === true) {
            return BASE_DIR + "/" + SHA1(uri) + ext;
        }
        else {
            return BASE_DIR + "/" + s4() + s4() + "-" + s4() + "-" + s4() + "-" + s4() + "-" + s4() + s4() + s4() + ext;
        }
    }
    static get() {
        if (!ImageCache.instance) {
            ImageCache.instance = new ImageCache();
        }
        return ImageCache.instance;
    }
    clear() {
        this.cache = {};
        return RNFetchBlob.fs.unlink(BASE_DIR);
    }
    on(source, handler, immutable) {
        const { uri } = source;
        if (!this.cache[uri]) {
            this.cache[uri] = {
                source,
                downloading: false,
                handlers: [handler],
                immutable: immutable === true,
                path: immutable === true ? this.getPath(uri, immutable) : undefined,
                attemptCount: 0
            };
        }
        else {
            this.cache[uri].handlers.push(handler);
        }
        this.get(uri);
    }
    dispose(uri, handler) {
        const cache = this.cache[uri];
        if (cache) {
            cache.handlers.forEach((h, index) => {
                if (h === handler) {
                    cache.handlers.splice(index, 1);
                }
            });
        }
    }
    bust(uri, headers, suppessError) {
        const cache = this.cache[uri];
        if (cache !== undefined && !cache.immutable) {
            let path = this.getPath(uri, false);
            cache.path = undefined;
            if (suppessError) {
                cache.suppessError = suppessError;
            }
            if (headers) {
                cache.source.headers = headers;
            }
            this.get(uri);
        }
    }
    cancel(uri) {
        const cache = this.cache[uri];
        if (cache && cache.downloading) {
            cache.task.cancel();
        }
    }
    download(cache) {
        const { source } = cache;
        const { uri } = source;
        cache.attemptCount += 1;
        if (!cache.downloading) {
            const path = this.getPath(uri, cache.immutable);
            cache.downloading = true;
            this.notify(uri);
            // console.log("GET here download 1", uri)
            const method = source.method ? source.method : "GET";
            let undoAttemptAndRetryAgainLater = () => {
                // console.log("GET here download 7", uri)
                // internet was not available
                cache.attemptCount = 0;
                cache.downloading = false;
                // Parts of the image may have been downloaded already, (see https://github.com/wkh237/react-native-fetch-blob/issues/331)
                RNFetchBlob.fs.unlink(path);
                setTimeout(() => this.notify(uri, { message: "Unable to download image for technical reason", status: "INTERNET_DOWN_OR_SERVER_UNAVAILABLE" }), 5000); // delay this for 5 secs
            };
            cache.task = RNFetchBlob.config({ path }).fetch(method, uri, source.headers);
            cache.task.then((res) => {
                // console.log("GET here download 2", uri)
                cache.downloading = false;
                if (res.respInfo.status === 200) {
                    // console.log("GET here download 3", uri)
                    cache.path = path;
                    cache.error = null
                    this.notify(uri);
                }
                else {
                    // console.log("GET here download 4", uri)
                    if (res.respInfo.status === 202 || res.respInfo.status === 429) {
                        // cater for SNOW 202 and 429 when it reach max capacity
                        // https://community.servicenow.com/community/service-automation-platform/blog/2016/12/21/http-202-from-a-web-service-call
                        // console.log("GET here download 5", uri)
                        return undoAttemptAndRetryAgainLater();
                    }
                    // console.log("GET here download 6", uri, res.respInfo.status)
                    // this is mean its not a 200 response from server, do not link the file to the cache
                    // console.info("Downloading :" + uri + " with status: " + res.respInfo.status)
                    RNFetchBlob.fs.unlink(path);
                    // only suppress error if not 401 (i.e. let a handler try to re-auth)...
                    cache.suppessError = res.respInfo.status !== 401;
                    cache.errorCode = res.respInfo.status;
                    cache.lastUpdatedTime = Date.now()
                    // notify the listener that there is an errorMessage
                    this.notify(uri, res);
                }
            }).catch(undoAttemptAndRetryAgainLater);
        }
    }
    get(uri) {
        const cache = this.cache[uri];
        // console.log("come here - GET 1", uri, cache)
        if (cache.path) {
            // console.log("come here - GET 2", uri)
            // We check here if IOS didn't delete the cache content
            RNFetchBlob.fs.exists(cache.path).then((exists) => {
                if (exists) {
                    // console.log("come here - GET 3", uri)
                    this.notify(uri);
                }
                else {
                    // console.log("come here - GET 4", uri)
                    // console.log("come into cache and not found in cache so need to redownload", cache.source.headers)
                    this.download(cache);
                }
            });
        }
        else {
            // console.log("come here - GET 5", uri)
            if (!cache.downloading) {
                // file path doesn't exist in cache yet...
                if (cache.attemptCount === 0) {
                    // console.log("come here - GET 6", uri)
                    // if first attempt, always download...
                    this.download(cache);
                }
                else if (cache.errorCode === 401 ) {
                    // console.log("come here - GET 7", uri)
                    // allow retry for 401 with no limit
                    this.download(cache);
                }
                else {
                    // console.log("come here - GET 9", uri)
                    // don't download, display default...
                    this.notify(uri, cache.error);
                }
            }else {
                // console.log("come here - GET 10 -- still downloading", uri)
            }
        }
    }
    notify(uri, errorResponse) {
        let cache = this.cache[uri];
        if (cache) {
            cache.error = errorResponse;
            const handlers = cache.handlers;
            handlers.forEach(handler => {
                handler(cache);
            });
        }
    }
}
export class BaseCachedImage extends Component {
    constructor() {
        super();
        this.handler = (cache) => {
            // console.log("come here - Handle 1", cache)
            if (cache.error) {
                // console.log("come here - Handle 2", cache)
                if (cache.suppessError !== true) {
                    // console.log("come here - Handle 3", cache)
                    this.bubbleEvent('onError', { error: cache.error });
                }
                // console.log("come here - Handle 4", cache)
                this.setState({ error: cache.error, isLoading: cache.downloading });
            }
            else {
                // console.log("come here - Handle 5", cache)
                this.setState({ path: cache.path, error: undefined, isLoading: cache.downloading });
            }
        };
        this.state = { path: undefined, error: undefined, isLoading: false };
    }
    bubbleEvent(propertyName, event) {
        if (typeof this.props[propertyName] === 'function') {
            this.props[propertyName](event);
        }
    }
    dispose() {
        if (this.uri) {
            ImageCache.get().dispose(this.uri, this.handler);
        }
    }
    observe(source, mutable) {
        if (source.uri !== this.uri) {
            this.dispose();
            this.uri = source.uri;
            ImageCache.get().on(source, this.handler, !mutable);
        }
    }
    getProps() {
        const props = {};
        Object.keys(this.props).forEach(prop => {
            if (prop === "source" && this.props.source.uri) {
                props["source"] = this.state.path ? { uri: FILE_PREFIX + this.state.path } : {};
            }
            else if (["mutable", "component"].indexOf(prop) === -1) {
                props[prop] = this.props[prop];
            }
        });
        if (this.props.source.uri) {
            props["cacheError"] = this.state.error ? this.state.error : null;
            props["cacheLoading"] = this.state.isLoading;
        }
        return props;
    }
    checkSource(source) {
        if (Array.isArray(source)) {
            throw new Error(`Giving multiple URIs to CachedImage is not yet supported.
            If you want to see this feature supported, please file and issue at
             https://github.com/wcandillon/react-native-img-cache`);
        }
        return source;
    }
    componentWillMount() {
        const { mutable } = this.props;
        const source = this.checkSource(this.props.source);
        if (source.uri) {
            this.observe(source, mutable === true);
        }
    }
    componentWillReceiveProps(nextProps) {
        const { mutable } = nextProps;
        const source = this.checkSource(nextProps.source);
        if (source.uri) {
            this.observe(source, mutable === true);
        }
    }
    componentWillUnmount() {
        this.dispose();
    }
}
export class CachedImage extends BaseCachedImage {
    constructor() {
        super();
    }
    render() {
        const props = this.getProps();
        return React.createElement(Image, __assign({}, props), this.props.children);
    }
}
export class CustomCachedImage extends BaseCachedImage {
    constructor() {
        super();
    }
    render() {
        const { component } = this.props;
        const props = this.getProps();
        const Component = component;
        return React.createElement(Component, __assign({}, props), this.props.children);
    }
}
