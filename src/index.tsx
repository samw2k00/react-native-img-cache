var __assign = (this && this.__assign) || Object.assign || function (t) {
    for (var s, i = 1, n = arguments.length; i < n; i++) {
        s = arguments[i];
        for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
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
                path: immutable === true ? this.getPath(uri, immutable) : undefined
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
            let path = this.getPath(uri, false)
            cache.path = undefined;
            if( suppessError) {
                cache.suppessError = suppessError
            }
            if(headers){
                cache.source.headers = headers
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
        if (!cache.downloading) {
            const path = this.getPath(uri, cache.immutable);
            cache.downloading = true;
            const method = source.method ? source.method : "GET";
            cache.task = RNFetchBlob.config({ path }).fetch(method, uri, source.headers);
            cache.task.then((res) => {
                cache.downloading = false;
                if (res.respInfo.status === 200) {
                    cache.path = path;
                    this.notify(uri);
                } else {
                    // this is mean its not a 200 response from server, do not link the file to the cache
                    RNFetchBlob.fs.unlink(path);
                    // notify the listener that there is an errorMessage
                    this.notify(uri, res)
                }

            }).catch(() => {
                cache.downloading = false;
                // Parts of the image may have been downloaded already, (see https://github.com/wkh237/react-native-fetch-blob/issues/331)
                RNFetchBlob.fs.unlink(path);
            });
        }
    }
    get(uri) {
        const cache = this.cache[uri];
        if (cache.path) {
            // We check here if IOS didn't delete the cache content
            RNFetchBlob.fs.exists(cache.path).then((exists) => {
                if (exists) {
                    this.notify(uri);
                }
                else {
                    this.download(cache);
                }
            });
        }
        else {
            this.download(cache);
        }
    }
    notify(uri, errorResponse) {
        const handlers = this.cache[uri].handlers;
        handlers.forEach(handler => {
            if (errorResponse) {
                handler(null, errorResponse, this.cache[uri].suppessError);
            } else {
                handler(this.cache[uri].path);
            }
        });
    }
}
export class BaseCachedImage extends Component {
    constructor() {
        super();
        this.handler = (path, error, suppessError) => {
            if (error) {
                console.log("Failed to load image with suppessError", suppessError)
                if(suppessError !== true){
                    this.bubbleEvent('onError', {error});
                }
                this.setState({ error })
                
            } else {
                this.setState({ path, error: undefined });
            }

        };
        this.state = { path: undefined, error: undefined };
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
            props["cacheError"] = this.state.error ? this.state.error : null
        });
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
//# sourceMappingURL=index.js.map