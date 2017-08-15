/// <reference types="react" />
import React, { Component } from "react";
export declare class ImageCache {
    constructor();
    getPath(uri: any, immutable: any): string;
    static get(): any;
    clear(): any;
    on(source: any, handler: any, immutable: any): void;
    dispose(uri: any, handler: any): void;
    clearStat(uri: any): void;
    bust(uri: any, headers: any, suppessError: any): void;
    cancel(uri: any): void;
    download(cache: any): void;
    get(uri: any): void;
    notify(uri: any, errorResponse: any): void;
}
export declare class BaseCachedImage extends Component {
    constructor();
    bubbleEvent(propertyName: any, event: any): void;
    dispose(): void;
    observe(source: any, mutable: any): void;
    getProps(): {};
    checkSource(source: any): any;
    componentWillMount(): void;
    componentWillReceiveProps(nextProps: any): void;
    componentWillUnmount(): void;
}
export declare class CachedImage extends BaseCachedImage {
    constructor();
    render(): React.ReactElement<any>;
}
export declare class CustomCachedImage extends BaseCachedImage {
    constructor();
    render(): React.ComponentElement<any, Component<any, React.ComponentState>>;
}
